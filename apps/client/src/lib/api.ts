import { localProjectsService } from './localProjects';
import { NetworkError, parseHttpError } from './errorHandling';

export interface ProjectListItem {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  shared?: boolean;
  shareToken?: string;
  folderId?: string | null;
  role?: 'owner' | 'editor' | 'viewer';
  collaborators?: { userId: string; role: string }[];
  thumbnail?: string; // base64 JPEG data URL
}

export interface ProjectRecord<T = unknown> extends ProjectListItem {
  data: T;
}

export interface FolderRecord {
  id: string;
  userId: string;
  name: string;
  color: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  projectCount?: number;
}

type Env = { env?: { DEV?: boolean; VITE_API_BASE_URL?: string; VITE_SERVER_PORT?: string } };
const apiEnv = import.meta as unknown as Env;

const resolveApiBase = () => {
  const override = apiEnv.env?.VITE_API_BASE_URL;
  if (override) return override.replace(/\/$/, '');

  const fallbackPort = apiEnv.env?.VITE_SERVER_PORT || '3000';

  if (typeof window === 'undefined') {
    return `http://localhost:${fallbackPort}`;
  }

  const currentOrigin = window.location.origin.replace(/\/$/, '');
  const desiredPort = apiEnv.env?.VITE_SERVER_PORT;

  if (desiredPort && desiredPort !== window.location.port) {
    return `${window.location.protocol}//${window.location.hostname}:${desiredPort}`;
  }

  return currentOrigin;
};

const API_BASE = resolveApiBase();

async function getAuthHeadersWithToken(token: string | null): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function http<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  try {
    const headers = await getAuthHeadersWithToken(token || null);
    const res = await fetch(API_BASE + path, {
      headers: { ...headers, ...init?.headers },
      credentials: 'include',
      ...init,
    });
    
    if (!res.ok) {
      throw await parseHttpError(res);
    }
    
    return res.json() as Promise<T>;
  } catch (error) {
    // Re-throw NetworkError as-is
    if (error instanceof NetworkError) {
      throw error;
    }
    
    // Convert other errors to NetworkError
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new NetworkError('Network request failed. Check your internet connection.');
    }
    
    throw error;
  }
}

async function httpWithRetry<T>(path: string, init: RequestInit | undefined, token?: string | null, attempts = 3): Promise<T> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await http<T>(path, init, token);
    } catch (e) {
      lastError = e;
      // Exponential backoff: 200ms, 500ms
      const delay = i === 0 ? 200 : 500;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

// Helper to get token from Clerk context
export async function getClerkToken(): Promise<string | null> {
  // This will be called from components with Clerk context
  // Components should use useAuth().getToken() directly
  return null;
}

export async function listProjects(token?: string | null): Promise<ProjectListItem[]> {
  // If no token provided, assume guest mode (use local storage)
  if (!token) {
    return localProjectsService.list();
  }
  return httpWithRetry<ProjectListItem[]>('/api/projects', undefined, token);
}

export async function getProject<T = unknown>(id: string, token?: string | null): Promise<ProjectRecord<T>> {
  if (!token) {
    const project = await localProjectsService.get(id);
    if (!project) throw new Error('Project not found');
    return project as ProjectRecord<T>;
  }
  return httpWithRetry<ProjectRecord<T>>(`/api/projects/${id}`, undefined, token);
}

export async function createProject<T = unknown>(
  title: string, 
  data: T, 
  token?: string | null,
  thumbnail?: string | null
): Promise<ProjectRecord<T>> {
  if (!token) {
    return localProjectsService.create(title, data) as Promise<ProjectRecord<T>>;
  }
  return httpWithRetry<ProjectRecord<T>>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ title, data, thumbnail })
  }, token);
}

export async function updateProject<T = unknown>(
  id: string, 
  title: string, 
  data: T, 
  token?: string | null,
  thumbnail?: string | null
): Promise<ProjectRecord<T>> {
  if (!token) {
    return localProjectsService.save(id, title, data) as Promise<ProjectRecord<T>>;
  }
  return httpWithRetry<ProjectRecord<T>>(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title, data, thumbnail })
  }, token);
}

export async function deleteProject(id: string, token?: string | null): Promise<void> {
  if (!token) {
    await localProjectsService.delete(id);
    return;
  }
  return httpWithRetry<void>(`/api/projects/${id}`, {
    method: 'DELETE'
  }, token);
}

export async function shareProject(id: string, token?: string | null): Promise<{ shareToken: string; shareUrl: string }> {
  if (!token) {
    throw new Error('Sharing is not available in guest mode. Please sign in to share projects.');
  }
  return httpWithRetry<{ shareToken: string; shareUrl: string }>(`/api/projects/${id}/share`, {
    method: 'POST'
  }, token);
}

export async function unshareProject(id: string, token?: string | null): Promise<void> {
  if (!token) {
    throw new Error('Sharing is not available in guest mode. Please sign in to share projects.');
  }
  return httpWithRetry<void>(`/api/projects/${id}/unshare`, {
    method: 'POST'
  }, token);
}

export async function getSharedProject<T = unknown>(shareToken: string): Promise<ProjectRecord<T>> {
  // This endpoint doesn't require authentication
  const res = await fetch(API_BASE + `/api/projects/shared/${shareToken}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ProjectRecord<T>>;
}

export interface CollaboratorRecord {
  userId: string;
  email?: string;
  role: string;
  addedAt: number;
}

export async function getCollaborators(projectId: string, token?: string | null): Promise<CollaboratorRecord[]> {
  if (!token) {
    throw new Error('Collaboration is not available in guest mode. Please sign in to collaborate.');
  }
  return httpWithRetry<CollaboratorRecord[]>(`/api/projects/${projectId}/collaborators`, undefined, token);
}

export async function addCollaboratorByEmail(projectId: string, email: string, role: 'editor' | 'viewer' = 'editor', token?: string | null): Promise<void> {
  if (!token) {
    throw new Error('Collaboration is not available in guest mode. Please sign in to collaborate.');
  }
  return httpWithRetry<void>(`/api/projects/${projectId}/collaborators`, {
    method: 'POST',
    body: JSON.stringify({ email, role })
  }, token);
}

export async function removeCollaborator(projectId: string, collaboratorUserId: string, token?: string | null): Promise<void> {
  if (!token) {
    throw new Error('Collaboration is not available in guest mode. Please sign in to collaborate.');
  }
  return httpWithRetry<void>(`/api/projects/${projectId}/collaborators/${collaboratorUserId}`, {
    method: 'DELETE'
  }, token);
}

// Folder APIs
export async function listFolders(token?: string | null): Promise<FolderRecord[]> {
  if (!token) {
    // Guests don't have folders
    return [];
  }
  return httpWithRetry<FolderRecord[]>('/api/folders', undefined, token);
}

export async function createFolder(name: string, color?: string, parentId?: string | null, token?: string | null): Promise<FolderRecord> {
  if (!token) {
    throw new Error('Folders are not available in guest mode. Please sign in to organize projects.');
  }
  return httpWithRetry<FolderRecord>('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name, color, parentId })
  }, token);
}

export async function updateFolder(id: string, name: string, color?: string, parentId?: string | null, token?: string | null): Promise<FolderRecord> {
  if (!token) {
    throw new Error('Folders are not available in guest mode. Please sign in to organize projects.');
  }
  return httpWithRetry<FolderRecord>(`/api/folders/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, color, parentId })
  }, token);
}

export async function deleteFolder(id: string, token?: string | null): Promise<void> {
  if (!token) {
    throw new Error('Folders are not available in guest mode. Please sign in to organize projects.');
  }
  return httpWithRetry<void>(`/api/folders/${id}`, {
    method: 'DELETE'
  }, token);
}

export async function moveProjectToFolder(projectId: string, folderId: string | null, token?: string | null): Promise<void> {
  if (!token) {
    throw new Error('Folders are not available in guest mode. Please sign in to organize projects.');
  }
  return httpWithRetry<void>(`/api/projects/${projectId}/move`, {
    method: 'POST',
    body: JSON.stringify({ folderId })
  }, token);
}