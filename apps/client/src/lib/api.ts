import { localProjectsService } from './localProjects';
import { NetworkError, ValidationError, parseHttpError } from './errorHandling';
import { clientEnv } from '@/config/env';
import type { JsonValue } from '@sketchflow/shared';
import { z } from 'zod';

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
  revision?: number;
}

export interface ProjectRecord<T extends JsonValue = JsonValue> extends ProjectListItem {
  data: T;
}

export interface PublicProjectRecord<T extends JsonValue = JsonValue> {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  data: T;
  revision: number;
  shared: true;
  shareExpiresAt?: number;
  role: 'viewer';
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

const projectListItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  shared: z.boolean().optional(),
  shareToken: z.string().optional(),
  folderId: z.string().nullable().optional(),
  role: z.enum(['owner', 'editor', 'viewer']).optional(),
  collaborators: z.array(z.object({ userId: z.string(), role: z.string() })).optional(),
  thumbnail: z.string().optional(),
  revision: z.number().optional(),
});

const projectRecordSchema = projectListItemSchema.extend({ data: z.json() });
const publicProjectRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  data: z.json(),
  revision: z.number(),
  shared: z.literal(true),
  shareExpiresAt: z.number().optional(),
  role: z.literal('viewer'),
});
const folderRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  color: z.string(),
  parentId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  projectCount: z.number().optional(),
});
const collaboratorRecordSchema = z.object({
  userId: z.string(),
  email: z.string().optional(),
  role: z.string(),
  addedAt: z.number(),
});
const shareResultSchema = z.object({ shareToken: z.string(), shareUrl: z.string() });
const emptyResponseSchema = z.unknown().transform(() => undefined);
const drawApiCounterSchema = z.object({ clicks: z.number().int().nonnegative() });

const resolveApiBase = () => {
  const envApiUrl = clientEnv.API_URL;
  if (envApiUrl) return envApiUrl.replace(/\/$/, '');

  if (globalThis.window === undefined) {
    return `http://localhost:${clientEnv.SERVER_PORT}`;
  }

  const currentOrigin = window.location.origin.replace(/\/$/, '');
  const desiredPort = clientEnv.SERVER_PORT;

  if (desiredPort && desiredPort !== window.location.port) {
    return `${window.location.protocol}//${window.location.hostname}:${desiredPort}`;
  }

  return currentOrigin;
};

const API_BASE = resolveApiBase();
const REQUEST_TIMEOUT_MS = 15_000;

export function getDrawApiCounter(): Promise<{ clicks: number }> {
  return http('/api/drawapi/counter', drawApiCounterSchema);
}

export function incrementDrawApiCounter(): Promise<{ clicks: number }> {
  return http('/api/drawapi/counter', drawApiCounterSchema, { method: 'POST' });
}

async function getAuthHeadersWithToken(token: string | null): Promise<HeadersInit> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function http<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
  try {
    const headers = await getAuthHeadersWithToken(token || null);
    const res = await fetch(API_BASE + path, {
      ...init,
      headers: { ...headers, ...init?.headers },
      credentials: 'include',
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw await parseHttpError(res);
    }

    return schema.parse(await res.json());
  } catch (error) {
    // Re-throw NetworkError as-is
    if (error instanceof NetworkError) {
      throw error;
    }

    // Convert other errors to NetworkError
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new NetworkError('Network request failed. Check your internet connection.');
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError('Network request timed out. Please try again.');
    }

    throw error;
  }
}

async function httpWithRetry<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit | undefined,
  token?: string | null,
  attempts = 3,
): Promise<T> {
  let lastError = new Error('Request failed');
  for (let i = 0; i < attempts; i++) {
    try {
      return await http(path, schema, init, token);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // Client errors (including validation and revision conflicts) are deterministic.
      // Retrying them only delays conflict recovery and can repeat a stale write.
      if (
        e instanceof z.ZodError ||
        (e instanceof NetworkError && e.statusCode !== undefined && e.statusCode < 500)
      ) {
        break;
      }
      if (i < attempts - 1) {
        // Exponential backoff between attempts: 200ms, then 500ms.
        const delay = i === 0 ? 200 : 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function listProjects(token?: string | null): Promise<ProjectListItem[]> {
  // If no token provided, assume guest mode (use local storage)
  if (!token) {
    return localProjectsService.list();
  }
  return httpWithRetry('/api/projects', z.array(projectListItemSchema), undefined, token);
}

export async function getProject(id: string, token?: string | null): Promise<ProjectRecord> {
  if (!token) {
    const project = await localProjectsService.get(id);
    if (!project) throw new Error('Project not found');
    return project;
  }
  return httpWithRetry(`/api/projects/${id}`, projectRecordSchema, undefined, token);
}

export async function createProjectOnce(
  title: string,
  data: JsonValue,
  token?: string | null,
): Promise<ProjectRecord> {
  if (!token) {
    return localProjectsService.create(title, data);
  }
  return http(
    '/api/projects',
    projectRecordSchema,
    {
      method: 'POST',
      body: JSON.stringify({ title, data }),
    },
    token,
  );
}

export async function createProject(
  title: string,
  data: JsonValue,
  token?: string | null,
  _thumbnail?: string | null,
  _expectedRevision?: number,
): Promise<ProjectRecord> {
  void _thumbnail;
  void _expectedRevision;
  if (!token) {
    return localProjectsService.create(title, data);
  }
  // Creating a project is not idempotent. Retrying after an ambiguous network
  // failure can create duplicate projects on the server.
  return http(
    '/api/projects',
    projectRecordSchema,
    {
      method: 'POST',
      body: JSON.stringify({ title, data }),
    },
    token,
  );
}

export async function updateProjectOnce(
  id: string,
  title: string,
  data: JsonValue,
  token?: string | null,
  expectedRevision?: number,
): Promise<ProjectRecord> {
  if (!token) {
    return localProjectsService.save(id, title, data);
  }
  if (expectedRevision === undefined) {
    throw new ValidationError(
      'A project revision is required to save cloud work. Reload the project and try again.',
    );
  }
  return http(
    `/api/projects/${id}`,
    projectRecordSchema,
    {
      method: 'PUT',
      body: JSON.stringify({ title, data, expectedRevision }),
    },
    token,
  );
}

export async function updateProject(
  id: string,
  title: string,
  data: JsonValue,
  token?: string | null,
  _thumbnail?: string | null,
  expectedRevision?: number,
): Promise<ProjectRecord> {
  if (!token) {
    return localProjectsService.save(id, title, data);
  }
  if (expectedRevision === undefined) {
    throw new ValidationError(
      'A project revision is required to save cloud work. Reload the project and try again.',
    );
  }
  return httpWithRetry(
    `/api/projects/${id}`,
    projectRecordSchema,
    {
      method: 'PUT',
      body: JSON.stringify({ title, data, expectedRevision }),
    },
    token,
  );
}

export async function deleteProject(id: string, token?: string | null): Promise<void> {
  if (!token) {
    await localProjectsService.delete(id);
    return;
  }
  return httpWithRetry(
    `/api/projects/${id}`,
    emptyResponseSchema,
    {
      method: 'DELETE',
    },
    token,
  );
}

export async function shareProject(
  id: string,
  token?: string | null,
): Promise<{ shareToken: string; shareUrl: string }> {
  if (!token) {
    throw new Error('Sharing is not available in guest mode. Please sign in to share projects.');
  }
  // Sharing rotates the public credential, so an ambiguous retry could revoke
  // the first URL before the caller ever receives it.
  return http(
    `/api/projects/${id}/share`,
    shareResultSchema,
    {
      method: 'POST',
    },
    token,
  );
}

export async function unshareProject(id: string, token?: string | null): Promise<void> {
  if (!token) {
    throw new Error('Sharing is not available in guest mode. Please sign in to share projects.');
  }
  return httpWithRetry(
    `/api/projects/${id}/unshare`,
    emptyResponseSchema,
    {
      method: 'POST',
    },
    token,
  );
}

export async function getSharedProject(shareToken: string): Promise<PublicProjectRecord> {
  return httpWithRetry(
    `/api/projects/shared/${encodeURIComponent(shareToken)}`,
    publicProjectRecordSchema,
    undefined,
  );
}

export interface CollaboratorRecord {
  userId: string;
  email?: string;
  role: string;
  addedAt: number;
}

export async function getCollaborators(
  projectId: string,
  token?: string | null,
): Promise<CollaboratorRecord[]> {
  if (!token) {
    throw new Error('Collaboration is not available in guest mode. Please sign in to collaborate.');
  }
  return httpWithRetry(
    `/api/projects/${projectId}/collaborators`,
    z.array(collaboratorRecordSchema),
    undefined,
    token,
  );
}

export async function addCollaboratorByEmail(
  projectId: string,
  email: string,
  role: 'editor' | 'viewer' = 'editor',
  token?: string | null,
): Promise<void> {
  if (!token) {
    throw new Error('Collaboration is not available in guest mode. Please sign in to collaborate.');
  }
  return httpWithRetry(
    `/api/projects/${projectId}/collaborators`,
    emptyResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    },
    token,
  );
}

export async function removeCollaborator(
  projectId: string,
  collaboratorUserId: string,
  token?: string | null,
): Promise<void> {
  if (!token) {
    throw new Error('Collaboration is not available in guest mode. Please sign in to collaborate.');
  }
  return httpWithRetry(
    `/api/projects/${projectId}/collaborators/${collaboratorUserId}`,
    emptyResponseSchema,
    {
      method: 'DELETE',
    },
    token,
  );
}

// Folder APIs
export async function listFolders(token?: string | null): Promise<FolderRecord[]> {
  if (!token) {
    // Guests don't have folders
    return [];
  }
  return httpWithRetry('/api/folders', z.array(folderRecordSchema), undefined, token);
}

export async function createFolder(
  name: string,
  color?: string,
  parentId?: string | null,
  token?: string | null,
): Promise<FolderRecord> {
  if (!token) {
    throw new Error(
      'Folders are not available in guest mode. Please sign in to organize projects.',
    );
  }
  // Folder creation is non-idempotent and must be retried only by the user.
  return http(
    '/api/folders',
    folderRecordSchema,
    {
      method: 'POST',
      body: JSON.stringify({ name, color, parentId }),
    },
    token,
  );
}

export async function updateFolder(
  id: string,
  name: string,
  color?: string,
  parentId?: string | null,
  token?: string | null,
): Promise<FolderRecord> {
  if (!token) {
    throw new Error(
      'Folders are not available in guest mode. Please sign in to organize projects.',
    );
  }
  return httpWithRetry(
    `/api/folders/${id}`,
    folderRecordSchema,
    {
      method: 'PUT',
      body: JSON.stringify({ name, color, parentId }),
    },
    token,
  );
}

export async function deleteFolder(id: string, token?: string | null): Promise<void> {
  if (!token) {
    throw new Error(
      'Folders are not available in guest mode. Please sign in to organize projects.',
    );
  }
  return httpWithRetry(
    `/api/folders/${id}`,
    emptyResponseSchema,
    {
      method: 'DELETE',
    },
    token,
  );
}

export async function moveProjectToFolder(
  projectId: string,
  folderId: string | null,
  token?: string | null,
): Promise<void> {
  if (!token) {
    throw new Error(
      'Folders are not available in guest mode. Please sign in to organize projects.',
    );
  }
  return httpWithRetry(
    `/api/projects/${projectId}/move`,
    emptyResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify({ folderId }),
    },
    token,
  );
}
