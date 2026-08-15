import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';
import { drawingObjectSchema, type DrawingObject } from './drawingObjectSchema';
import type { JsonValue } from '@sketchflow/shared';

type OfflineProjectRecord = {
  id: string;
  title: string;
  data: JsonValue;
  createdAt: number;
  updatedAt: number;
};

const projectObjectsSchema = z.union([
  z.array(drawingObjectSchema),
  z.object({ objects: z.array(drawingObjectSchema) }).passthrough(),
]);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export function isIOS() {
  return (
    globalThis.navigator !== undefined &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  );
}

export function serializeProject(objects: DrawingObject[], width: number, height: number) {
  return JSON.stringify({
    version: 1,
    objects,
    width,
    height,
    timestamp: Date.now(),
  });
}

export function deserializeProject(data: JsonValue | string): DrawingObject[] {
  try {
    const serialized = z.string().safeParse(data);
    const candidate = serialized.success ? JSON.parse(serialized.data) : data;
    const parsed = projectObjectsSchema.safeParse(candidate);
    if (!parsed.success) return [];
    return Array.isArray(parsed.data) ? parsed.data : parsed.data.objects;
  } catch (e) {
    console.warn('Failed to deserialize project:', e);
    return [];
  }
}
export async function saveEncryptedOffline(key: string, data: JsonValue | OfflineProjectRecord) {
  localStorage.setItem(key, JSON.stringify(data));
}

export async function loadEncryptedOffline<T>(
  key: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const item = localStorage.getItem(key);
  if (!item) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(item));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listOfflineProjects(): Promise<import('./api').ProjectListItem[]> {
  const projects: import('./api').ProjectListItem[] = [];
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
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('project:')) {
      const item = localStorage.getItem(key);
      if (item) {
        try {
          const parsed = projectListItemSchema.safeParse(JSON.parse(item));
          if (parsed.success) projects.push(parsed.data);
        } catch {
          // Ignore invalid JSON
        }
      }
    }
  }
  return projects;
}
