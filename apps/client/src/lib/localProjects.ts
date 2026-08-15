import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { z } from 'zod';
import type { JsonValue } from '@sketchflow/shared';

const localProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  data: z.json(),
  createdAt: z.number(),
  updatedAt: z.number(),
  thumbnail: z.string().optional(),
});

type LocalProject = Omit<z.infer<typeof localProjectSchema>, 'data'> & { data: JsonValue };

export interface ProjectRecord {
  id: string;
  userId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  data: JsonValue;
  shared?: boolean;
  shareToken?: string;
  folderId?: string | null;
  role?: 'owner' | 'editor' | 'viewer';
  collaborators?: { userId: string; role: string }[];
  thumbnail?: string;
}

interface LocalProjectsDB extends DBSchema {
  projects: {
    key: string;
    value: LocalProject;
    indexes: { updatedAt: number };
  };
}

const DB_NAME = 'SketchFlowLocalProjects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

class LocalProjectsService {
  private db: IDBPDatabase<LocalProjectsDB> | null = null;
  private dbPromise: Promise<IDBPDatabase<LocalProjectsDB>> | null = null;

  private async initDB(): Promise<IDBPDatabase<LocalProjectsDB>> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = openDB<LocalProjectsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      },
    });

    this.db = await this.dbPromise;
    return this.db;
  }

  async list(): Promise<Omit<ProjectRecord, 'data'>[]> {
    try {
      const db = await this.initDB();
      const projects = await db.getAllFromIndex(STORE_NAME, 'updatedAt');

      return projects
        .map((p) => ({
          id: p.id,
          userId: 'guest',
          title: p.title,
          updatedAt: p.updatedAt,
          createdAt: p.createdAt,
          shared: false,
          role: 'owner' as const,
          thumbnail: p.thumbnail,
        }))
        .sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Failed to list local projects from IndexedDB:', error);
      try {
        return this.listFromLocalStorage();
      } catch (fallbackError) {
        console.error('Failed to list from localStorage fallback:', fallbackError);
        // Return empty array if both fail - this is fine for new guests
        return [];
      }
    }
  }

  async get(id: string): Promise<ProjectRecord | null> {
    try {
      const db = await this.initDB();
      const project = await db.get(STORE_NAME, id);

      if (!project) return null;

      return {
        id: project.id,
        userId: 'guest',
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        shared: false,
        role: 'owner',
        thumbnail: project.thumbnail,
      };
    } catch (error) {
      console.error('Failed to get local project:', error);
      return this.getFromLocalStorage(id);
    }
  }

  async save(
    id: string,
    title: string,
    data: JsonValue,
    thumbnail?: string,
  ): Promise<ProjectRecord> {
    try {
      const db = await this.initDB();
      const existing = await db.get(STORE_NAME, id);

      const project = {
        id,
        title,
        data,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        thumbnail: thumbnail || existing?.thumbnail,
      };

      await db.put(STORE_NAME, project);

      return {
        id: project.id,
        userId: 'guest',
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        shared: false,
        role: 'owner',
        thumbnail: project.thumbnail,
      };
    } catch (error) {
      console.error('Failed to save local project:', error);
      return this.saveToLocalStorage(id, title, data, thumbnail);
    }
  }

  async create(title: string, data: JsonValue): Promise<ProjectRecord> {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    return this.save(id, title, data);
  }

  async delete(id: string): Promise<boolean> {
    try {
      const db = await this.initDB();
      await db.delete(STORE_NAME, id);
      return true;
    } catch (error) {
      console.error('Failed to delete local project:', error);
      return this.deleteFromLocalStorage(id);
    }
  }

  // LocalStorage fallback methods
  private getLocalStorageKey(id: string): string {
    return `local-project-${id}`;
  }

  private listFromLocalStorage(): Omit<ProjectRecord, 'data'>[] {
    const projects: Omit<ProjectRecord, 'data'>[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('local-project-')) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const project = localProjectSchema.parse(JSON.parse(data));
            projects.push({
              id: project.id,
              userId: 'guest',
              title: project.title,
              updatedAt: project.updatedAt,
              createdAt: project.createdAt,
              shared: false,
              role: 'owner',
              thumbnail: project.thumbnail,
            });
          }
        } catch (e) {
          console.error('Failed to parse local project:', e);
        }
      }
    }

    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private getFromLocalStorage(id: string): ProjectRecord | null {
    try {
      const data = localStorage.getItem(this.getLocalStorageKey(id));
      if (!data) return null;

      const project = localProjectSchema.parse(JSON.parse(data));
      return {
        id: project.id,
        userId: 'guest',
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        shared: false,
        role: 'owner',
        thumbnail: project.thumbnail,
      };
    } catch (e) {
      console.error('Failed to get project from localStorage:', e);
      return null;
    }
  }

  private saveToLocalStorage(
    id: string,
    title: string,
    data: JsonValue,
    thumbnail?: string,
  ): ProjectRecord {
    const existing = this.getFromLocalStorage(id);

    const project = {
      id,
      title,
      data,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      thumbnail: thumbnail || existing?.thumbnail,
    };

    localStorage.setItem(this.getLocalStorageKey(id), JSON.stringify(project));

    return {
      id: project.id,
      userId: 'guest',
      title: project.title,
      data: project.data,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
      shared: false,
      role: 'owner',
      thumbnail: project.thumbnail,
    };
  }

  private deleteFromLocalStorage(id: string): boolean {
    try {
      localStorage.removeItem(this.getLocalStorageKey(id));
      return true;
    } catch (e) {
      console.error('Failed to delete from localStorage:', e);
      return false;
    }
  }

  // Export project to .draw file
  exportProject(project: ProjectRecord): void {
    const exportData = {
      version: '1.0.0' as const,
      meta: {
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      data: project.data,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.draw`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import project from .draw file
  async importProject(file: File): Promise<ProjectRecord> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const content = z.string().parse(e.target?.result);
          const imported = z
            .object({ meta: z.object({ title: z.string().optional() }).optional(), data: z.json() })
            .parse(JSON.parse(content));

          const title = imported.meta?.title || file.name.replace('.draw', '');
          const data = imported.data;

          const project = await this.create(title, data);
          resolve(project);
        } catch {
          reject(new Error('Failed to parse .draw file'));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // Get all local projects for migration when user signs up
  async getAllForMigration(): Promise<ProjectRecord[]> {
    try {
      const db = await this.initDB();
      const projects = await db.getAll(STORE_NAME);

      return projects.map((p) => ({
        id: p.id,
        userId: 'guest',
        title: p.title,
        data: p.data,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        shared: false,
        role: 'owner' as const,
        thumbnail: p.thumbnail,
      }));
    } catch (error) {
      console.error('Failed to get all projects for migration:', error);

      // Fallback to localStorage
      const projects: ProjectRecord[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('local-project-')) {
          const project = this.getFromLocalStorage(key.replace('local-project-', ''));
          if (project) projects.push(project);
        }
      }
      return projects;
    }
  }

  // Clear all local projects (after migration)
  async clearAll(): Promise<void> {
    try {
      const db = await this.initDB();
      await db.clear(STORE_NAME);

      // Also clear localStorage
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('local-project-')) {
          keys.push(key);
        }
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.error('Failed to clear local projects:', error);
    }
  }
}

export const localProjectsService = new LocalProjectsService();
