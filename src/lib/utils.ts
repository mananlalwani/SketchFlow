import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua: string = navigator.userAgent || '';
  const platform: string = (navigator as unknown as { platform?: string }).platform ?? '';
  const maxTouchPoints: number = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = platform === 'MacIntel' && maxTouchPoints > 1;
  return isIOSDevice || isIPadOS;
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  return (...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func(...args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Project serialization utilities
import type { ProjectFile, ProjectObject } from '@/types/socket';
import type { DrawingObject } from '@/store/drawingStore';

export function serializeProject(objects: DrawingObject[], worldW: number, worldH: number): ProjectFile {
  const projObjects: ProjectObject[] = objects.reduce<ProjectObject[]>((acc, o) => {
    if (o.type === 'stroke') {
      acc.push({
        id: o.id,
        type: 'stroke',
        points: o.points || [],
        color: o.color,
        size: o.size,
        alpha: o.alpha
      });
    } else if (o.type === 'line' || o.type === 'rectangle' || o.type === 'ellipse' || o.type === 'parabola' || o.type === 'triangle') {
      if (typeof o.x === 'number' && typeof o.y === 'number' && typeof o.width === 'number' && typeof o.height === 'number') {
        acc.push({
          id: o.id,
          type: o.type,
          x: o.x, y: o.y, width: o.width, height: o.height,
          color: o.color, size: o.size, alpha: o.alpha,
          filled: (o as { filled?: boolean }).filled,
          orientation: (o as { orientation?: 'up' | 'down' | 'left' | 'right' }).orientation
        });
      }
    } else if (o.type === 'text') {
      if (typeof o.x === 'number' && typeof o.y === 'number' && o.text) {
        acc.push({
          id: o.id,
          type: 'text',
          x: o.x, y: o.y, 
          width: o.width || 0, 
          height: o.height || 0,
          color: o.color, size: o.size, alpha: o.alpha,
          text: o.text,
          fontSize: o.fontSize || 24
        });
      }
    }
    return acc;
  }, []);

  return {
    version: '1.0.0',
    meta: { createdAt: Date.now(), updatedAt: Date.now() },
    world: { width: worldW, height: worldH, background: '#0f172a' },
    objects: projObjects
  };
}

export function deserializeProject(file: ProjectFile | { objects?: unknown[] } | null | undefined): DrawingObject[] {
  // Handle null/undefined
  if (!file) return [];
  
  // Handle legacy format without version (e.g., { objects: [] })
  if (!('version' in file) || !file.version) {
    // Try to extract objects from legacy format
    if ('objects' in file && Array.isArray(file.objects)) {
      return file.objects.map((o: unknown) => {
        const obj = o as Record<string, unknown>;
        if (obj.type === 'stroke') {
          return {
            id: obj.id as string,
            type: 'stroke' as const,
            points: obj.points as { x: number; y: number }[],
            color: obj.color as string,
            size: obj.size as number,
            alpha: obj.alpha as number
          };
        }
        if (obj.type === 'text') {
          return {
            id: obj.id as string,
            type: 'text' as const,
            x: obj.x as number,
            y: obj.y as number,
            width: obj.width as number,
            height: obj.height as number,
            color: obj.color as string,
            size: obj.size as number,
            alpha: obj.alpha as number,
            text: obj.text as string || '',
            fontSize: obj.fontSize as number || 24
          };
        }
        return {
          id: obj.id as string,
          type: obj.type as DrawingObject['type'],
          x: obj.x as number,
          y: obj.y as number,
          width: obj.width as number,
          height: obj.height as number,
          color: obj.color as string,
          size: obj.size as number,
          alpha: obj.alpha as number,
          filled: obj.filled as boolean | undefined,
          orientation: obj.orientation as 'up' | 'down' | 'left' | 'right' | undefined
        } as DrawingObject;
      });
    }
    // Empty project
    return [];
  }
  
  // Standard versioned format
  if (file.version !== '1.0.0') {
    console.warn('Unknown project version:', file.version, 'attempting to load anyway');
  }
  
  return (file as ProjectFile).objects.map((o) => {
    if (o.type === 'stroke') {
      return {
        id: o.id,
        type: 'stroke' as const,
        points: o.points,
        color: o.color,
        size: o.size,
        alpha: o.alpha
      };
    }
    if (o.type === 'text') {
      const textObj = o as { text?: string; fontSize?: number };
      return {
        id: o.id,
        type: 'text' as const,
        x: o.x, y: o.y, width: o.width, height: o.height,
        color: o.color, size: o.size, alpha: o.alpha,
        text: textObj.text || '',
        fontSize: textObj.fontSize || 24
      };
    }
    return {
      id: o.id,
      type: o.type,
      x: o.x, y: o.y, width: o.width, height: o.height,
      color: o.color, size: o.size, alpha: o.alpha,
      // Preserve filled when present in older files it will be undefined
      filled: (o as unknown as { filled?: boolean }).filled,
      orientation: (o as unknown as { orientation?: 'up' | 'down' | 'left' | 'right' }).orientation
    } as unknown as DrawingObject;
  });
}

// Offline encrypted cache (IndexedDB + WebCrypto AES-GCM)
export async function saveEncryptedOffline(keyId: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data);
  const enc = new TextEncoder().encode(text);
  // Derive a device-scoped key using SubtleCrypto with a static, non-exportable key material in local storage
  const baseKeyRaw = await ensureBaseKeyMaterial();
  const baseKey = await crypto.subtle.importKey('raw', baseKeyRaw as ArrayBuffer, 'PBKDF2', false, ['deriveKey']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, aesKey, enc.buffer as ArrayBuffer);
  const payload = { salt: bufToB64(salt), iv: bufToB64(iv), cipher: bufToB64(new Uint8Array(cipher)) };
  await idbSet(keyId, payload);
}

export async function loadEncryptedOffline<T = unknown>(keyId: string): Promise<T | null> {
  const payload = await idbGet<{ salt: string; iv: string; cipher: string }>(keyId);
  if (!payload) return null;
  const baseKeyRaw = await ensureBaseKeyMaterial();
  const baseKey = await crypto.subtle.importKey('raw', baseKeyRaw as ArrayBuffer, 'PBKDF2', false, ['deriveKey']);
  const salt = b64ToBuf(payload.salt);
  const iv = b64ToBuf(payload.iv);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const cipher = b64ToBuf(payload.cipher);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, aesKey, cipher.buffer as ArrayBuffer);
  const json = new TextDecoder().decode(plain);
  return JSON.parse(json) as T;
}

async function ensureBaseKeyMaterial(): Promise<ArrayBuffer> {
  const existing = localStorage.getItem('enc_km');
  if (existing) return b64ToBuf(existing).buffer as ArrayBuffer;
  const km = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem('enc_km', bufToB64(km));
  return km.buffer as ArrayBuffer;
}

function bufToB64(buf: Uint8Array): string {
  let binary = '';
  const bytes = buf;
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('offline-cache', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbKeys(): Promise<IDBValidKey[]> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const keys: IDBValidKey[] = [];
    const hasGetAllKeys: boolean = typeof (store as unknown as { getAllKeys?: unknown }).getAllKeys === 'function';
    if (hasGetAllKeys) {
      const req = (store as unknown as { getAllKeys: () => IDBRequest<IDBValidKey[]> }).getAllKeys();
      req.onsuccess = () => resolve(req.result as IDBValidKey[]);
      req.onerror = () => reject(req.error);
    } else {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (cursor) {
          keys.push(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve(keys);
        }
      };
      req.onerror = () => reject(req.error);
    }
  });
}

export interface OfflineProjectListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export async function listOfflineProjects(): Promise<OfflineProjectListItem[]> {
  const keys = await idbKeys();
  const projKeys = keys.filter((k) => typeof k === 'string' && (k as string).startsWith('project:')) as string[];
  const results: OfflineProjectListItem[] = [];
  for (const k of projKeys) {
    const rec = await idbGet<{ id?: string; title?: string; createdAt?: number; updatedAt?: number }>(k);
    if (rec && typeof rec.id === 'string') {
      results.push({ id: rec.id, title: rec.title || 'Offline Project', createdAt: rec.createdAt || Date.now(), updatedAt: rec.updatedAt || Date.now() });
    }
  }
  // Sort by updated desc
  results.sort((a, b) => b.updatedAt - a.updatedAt);
  return results;
}
