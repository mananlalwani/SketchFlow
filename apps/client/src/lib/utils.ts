import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export function isIOS() {
  return typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}

export function serializeProject(objects: unknown[], width: number, height: number) {
  return JSON.stringify({
    version: 1,
    objects,
    width,
    height,
    timestamp: Date.now()
  });
}

export function deserializeProject(data: string | unknown) {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return Array.isArray(parsed) ? parsed : (parsed?.objects || []);
  } catch (e) {
    console.warn('Failed to deserialize project:', e);
    return [];
  }
}
export async function saveEncryptedOffline(key: string, data: any) {
  localStorage.setItem(key, JSON.stringify(data));
}

export async function loadEncryptedOffline<T>(key: string): Promise<T | null> {
  const item = localStorage.getItem(key);
  if (!item) return null;
  try {
    return JSON.parse(item) as T;
  } catch {
    return null;
  }
}

export async function listOfflineProjects() {
  const projects: any[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('project:')) {
      const item = localStorage.getItem(key);
      if (item) {
        try {
          projects.push(JSON.parse(item));
        } catch {
          // Ignore invalid JSON
        }
      }
    }
  }
  return projects;
}
