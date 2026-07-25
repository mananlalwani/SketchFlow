import { z } from 'zod';

const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const MAX_OBJECTS = 10_000;
const MAX_DEPTH = 20;
const MAX_TEXT_CHARS = 100_000;
const MAX_IMAGE_DATA_CHARS = 7 * 1024 * 1024;

function hasSafeDepthAndFields(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (typeof value !== 'object' || value === null) return true;
  if (Array.isArray(value)) return value.every((item) => hasSafeDepthAndFields(item, depth + 1));
  for (const [key, child] of Object.entries(value)) {
    if (key === 'text' && typeof child === 'string' && child.length > MAX_TEXT_CHARS) return false;
    if (key === 'imageData' && typeof child === 'string' && child.length > MAX_IMAGE_DATA_CHARS)
      return false;
    if (!hasSafeDepthAndFields(child, depth + 1)) return false;
  }
  return true;
}

export function isBoundedProjectData(value: unknown): boolean {
  try {
    const encoded = JSON.stringify(value);
    if (!encoded || Buffer.byteLength(encoded, 'utf8') > MAX_PROJECT_BYTES) return false;
    if (typeof value === 'object' && value !== null && 'objects' in value) {
      const objects = (value as { objects?: unknown }).objects;
      if (Array.isArray(objects) && objects.length > MAX_OBJECTS) return false;
    }
    return hasSafeDepthAndFields(value);
  } catch {
    return false;
  }
}

export const projectInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    data: z.unknown().refine(isBoundedProjectData, 'Project data exceeds safety limits'),
    expectedRevision: z.number().int().positive().optional(),
  })
  .strict();

/** Wire contract shared by realtime collaboration commit handlers. */
export const collaborationCommitSchema = z
  .object({
    operationId: z
      .string()
      .trim()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    expectedRevision: z.number().int().positive(),
    kind: z.enum(['replace-project', 'upsert-object', 'delete-object']),
    data: z.unknown().refine(isBoundedProjectData, 'Project data exceeds safety limits'),
  })
  .strict();

export const folderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    parentId: z.string().cuid().nullable().optional(),
  })
  .strict();

export const collaboratorInputSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(['editor', 'viewer']).default('editor'),
  })
  .strict();

export const moveProjectSchema = z
  .object({
    folderId: z.string().cuid().nullable(),
  })
  .strict();

export const resourceIdSchema = z.string().cuid();
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
export const collaboratorUserIdSchema = z
  .string()
  .regex(/^user_[A-Za-z0-9]+$/)
  .max(128);
