import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DrawingObject } from './drawingObjectSchema';
import type { JsonValue } from '@sketchflow/shared';
import {
  deserializeProjectDocument,
  serializeProjectDocument,
  type ProjectMetadata,
} from './projectDocument';

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

export function serializeProject(
  objects: DrawingObject[],
  width: number,
  height: number,
  metadata?: Partial<ProjectMetadata>,
) {
  return serializeProjectDocument(objects, width, height, metadata);
}

export function deserializeProject(data: JsonValue | string): DrawingObject[] {
  return deserializeProjectDocument(data).objects;
}
