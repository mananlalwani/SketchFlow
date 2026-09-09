import { z } from 'zod';
import type { JsonValue } from '@sketchflow/shared';
import { drawingObjectSchema, type DrawingObject } from './drawingObjectSchema';

/** A named view into the infinite canvas. Coordinates are world coordinates. */
export interface ProjectBookmark {
  id: string;
  name: string;
  x: number;
  y: number;
  zoom: number;
}

export interface ProjectMetadata {
  version: 1;
  bookmarks: ProjectBookmark[];
}

export interface ProjectDocument {
  version: number;
  objects: DrawingObject[];
  width: number;
  height: number;
  timestamp?: number;
  metadata: ProjectMetadata;
}

export interface ProjectDimensions {
  width: number;
  height: number;
}

export const DEFAULT_PROJECT_WIDTH = 4096;
export const DEFAULT_PROJECT_HEIGHT = 4096;

function positiveDimension(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Keeps persisted bounds large enough for objects that extend past the
 * legacy 4096px canvas. This matters for imported PDFs, whose pages are
 * stacked vertically before they are reopened or exported.
 */
export function getProjectDocumentDimensions(
  objects: readonly DrawingObject[],
  width = DEFAULT_PROJECT_WIDTH,
  height = DEFAULT_PROJECT_HEIGHT,
): ProjectDimensions {
  let maxX = positiveDimension(width, DEFAULT_PROJECT_WIDTH);
  let maxY = positiveDimension(height, DEFAULT_PROJECT_HEIGHT);

  for (const object of objects) {
    if (object.x !== undefined && object.width !== undefined) {
      maxX = Math.max(maxX, object.x + Math.max(0, object.width));
    }
    if (object.y !== undefined && object.height !== undefined) {
      maxY = Math.max(maxY, object.y + Math.max(0, object.height));
    }
    for (const point of object.points ?? []) {
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  return { width: Math.ceil(maxX), height: Math.ceil(maxY) };
}

const bookmarkSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(100),
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().min(0.1).max(5),
});

const metadataSchema = z
  .object({
    version: z.literal(1).optional(),
    bookmarks: z.array(bookmarkSchema).max(500).optional(),
  })
  .passthrough();

const documentSchema = z
  .object({
    version: z.number().int().optional(),
    objects: z.array(drawingObjectSchema),
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    timestamp: z.number().finite().optional(),
    metadata: metadataSchema.optional(),
    // Accept the short-lived root-level shape so early bookmark drafts remain
    // readable if one was saved before metadata was nested.
    bookmarks: z.array(bookmarkSchema).max(500).optional(),
  })
  .passthrough();

const defaultMetadata = (): ProjectMetadata => ({ version: 1, bookmarks: [] });

function parseCandidate(data: JsonValue | string): JsonValue | null {
  const serialized = z.string().safeParse(data);
  if (!serialized.success) return data;
  try {
    const parsed = z.json().safeParse(JSON.parse(serialized.data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Parses old array documents and current object documents into one typed shape. */
export function deserializeProjectDocument(data: JsonValue | string): ProjectDocument {
  const candidate = parseCandidate(data);
  if (Array.isArray(candidate)) {
    const objects = z.array(drawingObjectSchema).safeParse(candidate);
    return {
      version: 1,
      objects: objects.success ? objects.data : [],
      width: DEFAULT_PROJECT_WIDTH,
      height: DEFAULT_PROJECT_HEIGHT,
      metadata: defaultMetadata(),
    };
  }

  const parsed = documentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      version: 1,
      objects: [],
      width: DEFAULT_PROJECT_WIDTH,
      height: DEFAULT_PROJECT_HEIGHT,
      metadata: defaultMetadata(),
    };
  }

  const rootBookmarks = parsed.data.bookmarks;
  const nestedMetadata = parsed.data.metadata;
  const document: ProjectDocument = {
    version: parsed.data.version ?? 1,
    objects: parsed.data.objects,
    width: positiveDimension(parsed.data.width, DEFAULT_PROJECT_WIDTH),
    height: positiveDimension(parsed.data.height, DEFAULT_PROJECT_HEIGHT),
    metadata: {
      version: 1,
      bookmarks: nestedMetadata?.bookmarks ?? rootBookmarks ?? [],
    },
  };
  if (parsed.data.timestamp !== undefined) document.timestamp = parsed.data.timestamp;
  return document;
}

export function serializeProjectDocument(
  objects: DrawingObject[],
  width: number,
  height: number,
  metadata: Partial<ProjectMetadata> = {},
): string {
  const bookmarks = metadata.bookmarks ?? [];
  const dimensions = getProjectDocumentDimensions(objects, width, height);
  return JSON.stringify({
    version: 2,
    objects,
    width: dimensions.width,
    height: dimensions.height,
    timestamp: Date.now(),
    metadata: { version: 1, bookmarks },
  });
}

export function getProjectBookmarks(data: JsonValue | string): ProjectBookmark[] {
  return deserializeProjectDocument(data).metadata.bookmarks;
}

export function isProjectDocumentWithMetadata(data: JsonValue | string): boolean {
  const candidate = parseCandidate(data);
  const objectCandidate = z.record(z.string(), z.json()).safeParse(candidate);
  return objectCandidate.success && 'metadata' in objectCandidate.data;
}
