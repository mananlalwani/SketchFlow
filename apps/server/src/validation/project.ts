import { z } from 'zod';

const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const MAX_OBJECTS = 10_000;
const MAX_DEPTH = 20;
const MAX_TEXT_CHARS = 100_000;
const MAX_IMAGE_DATA_CHARS = 7 * 1024 * 1024;
const jsonValueSchema = z.json();
const projectObjectsSchema = z
  .object({ objects: z.array(z.unknown()).max(MAX_OBJECTS).optional() })
  .loose();

function hasSafeDepthAndFields(value: z.output<typeof jsonValueSchema>, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (!(value instanceof Object)) return true;
  if (Array.isArray(value)) return value.every((item) => hasSafeDepthAndFields(item, depth + 1));
  for (const [key, child] of Object.entries(value)) {
    const childText = z.string().safeParse(child);
    if (key === 'text' && childText.success && childText.data.length > MAX_TEXT_CHARS) return false;
    if (key === 'imageData' && childText.success && childText.data.length > MAX_IMAGE_DATA_CHARS) {
      return false;
    }
    if (!hasSafeDepthAndFields(child, depth + 1)) return false;
  }
  return true;
}

export function isBoundedProjectData(value: z.input<typeof jsonValueSchema>): boolean {
  try {
    const encoded = JSON.stringify(value);
    if (!encoded || Buffer.byteLength(encoded, 'utf8') > MAX_PROJECT_BYTES) return false;
    const projectObjects = projectObjectsSchema.safeParse(value);
    if (
      !projectObjects.success &&
      projectObjects.error.issues.some((issue) => issue.path[0] === 'objects')
    ) {
      return false;
    }
    const jsonValue = jsonValueSchema.safeParse(value);
    return jsonValue.success && hasSafeDepthAndFields(jsonValue.data);
  } catch {
    return false;
  }
}

export const projectInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    data: jsonValueSchema.refine(isBoundedProjectData, 'Project data exceeds safety limits'),
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
    kind: z.enum(['replace-project', 'upsert-object', 'delete-object', 'batch']),
    data: jsonValueSchema.refine(isBoundedProjectData, 'Project data exceeds safety limits'),
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
