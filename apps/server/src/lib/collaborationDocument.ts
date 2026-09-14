import { z } from 'zod';
import type { JsonObject, JsonValue } from '@sketchflow/shared';

export type CollaborationCommitKind =
  | 'replace-project'
  | 'upsert-object'
  | 'delete-object'
  | 'batch';

export type CanonicalDocument = JsonObject & { objects: JsonObject[] };

const jsonObjectSchema = z.record(z.string(), z.json());
const canonicalDocumentSchema = z.object({ objects: z.array(jsonObjectSchema) }).catchall(z.json());
const upsertObjectPayloadSchema = z.object({
  object: z.object({ id: z.string().min(1).max(200) }).catchall(z.json()),
});
const deleteObjectPayloadSchema = z.object({ id: z.string().min(1).max(200) });
const batchPayloadSchema = z.object({
  operations: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('upsert-object'), data: upsertObjectPayloadSchema }),
        z.object({ kind: z.literal('delete-object'), data: deleteObjectPayloadSchema }),
      ]),
    )
    .min(1)
    .max(100),
});

export function asCanonicalDocument(data: JsonValue): CanonicalDocument | null {
  let candidate = data;
  const serialized = z.string().safeParse(candidate);
  if (serialized.success) {
    try {
      candidate = JSON.parse(serialized.data);
    } catch {
      return null;
    }
  }
  if (Array.isArray(candidate)) {
    const objects = z.array(jsonObjectSchema).safeParse(candidate);
    return objects.success ? { objects: objects.data } : null;
  }
  const document = canonicalDocumentSchema.safeParse(candidate);
  return document.success ? document.data : null;
}

export function normalizeProjectData(data: JsonValue): JsonValue {
  const document = asCanonicalDocument(data);
  return document ?? data;
}

export function applyObjectOperation(
  currentData: JsonValue,
  kind: Exclude<CollaborationCommitKind, 'replace-project' | 'batch'>,
  payload: JsonValue,
): CanonicalDocument | null {
  const document = asCanonicalDocument(currentData);
  if (!document) return null;

  if (kind === 'upsert-object') {
    const input = upsertObjectPayloadSchema.safeParse(payload);
    if (!input.success) return null;
    const nextObject = input.data.object;
    const id = nextObject.id;
    const index = document.objects.findIndex((entry) => entry.id === id);
    const objects = [...document.objects];
    if (index === -1) objects.push(nextObject);
    else objects[index] = nextObject;
    return { ...document, objects };
  }

  const input = deleteObjectPayloadSchema.safeParse(payload);
  if (!input.success) return null;
  return { ...document, objects: document.objects.filter((entry) => entry.id !== input.data.id) };
}

/** Applies a group atomically so undo/redo never falls back to a board snapshot. */
export function applyBatchOperation(
  currentData: JsonValue,
  payload: JsonValue,
): CanonicalDocument | null {
  const batch = batchPayloadSchema.safeParse(payload);
  if (!batch.success) return null;

  let data: CanonicalDocument | null = asCanonicalDocument(currentData);
  for (const operation of batch.data.operations) {
    data = applyObjectOperation(data, operation.kind, operation.data);
    if (!data) return null;
  }
  return data;
}

export function applyCollaborationToDocument(
  currentData: JsonValue,
  kind: CollaborationCommitKind,
  payload: JsonValue,
): JsonValue | null {
  if (kind === 'replace-project') return normalizeProjectData(payload);
  if (kind === 'batch') return applyBatchOperation(currentData, payload);
  return applyObjectOperation(currentData, kind, payload);
}
