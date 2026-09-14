import { createHash } from 'crypto';
import { z } from 'zod';
import type { JsonValue } from '@sketchflow/shared';

export const PROJECT_HISTORY_RETENTION = 20;

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonObjectSchema = z.record(z.string(), z.json());

export function stableSerialize(value: JsonValue): string {
  const primitive = jsonPrimitiveSchema.safeParse(value);
  if (primitive.success) return JSON.stringify(primitive.data);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  const record = jsonObjectSchema.parse(value);
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key] ?? null)}`)
    .join(',')}}`;
}

export function collaborationReceiptHash(input: {
  projectId: string;
  userId: string;
  operationId: string;
  expectedRevision: number;
  data: JsonValue;
  kind: string;
  title?: string | null;
}): string {
  return createHash('sha256')
    .update(
      stableSerialize({
        projectId: input.projectId,
        userId: input.userId,
        operationId: input.operationId,
        expectedRevision: input.expectedRevision,
        data: input.data,
        kind: input.kind,
        title: input.title ?? null,
      }),
    )
    .digest('hex');
}

export function projectContentHash(title: string, data: JsonValue): string {
  return createHash('sha256').update(stableSerialize({ title, data })).digest('hex');
}

type HistorySnapshotRecord = {
  id: string;
  revision: number;
  title: string;
  contentHash: string;
  createdAt: Date;
  data: JsonValue;
};

export type HistorySnapshotStore = {
  create: (args: {
    data: { projectId: string; revision: number; title: string; data: object; contentHash: string };
  }) => Promise<HistorySnapshotRecord>;
  findFirst: (args: {
    where: { projectId: string; contentHash: string };
  }) => Promise<HistorySnapshotRecord | null>;
  findMany: (args: {
    where: { projectId: string };
    orderBy: { createdAt: 'desc' };
    take?: number;
  }) => Promise<HistorySnapshotRecord[]>;
  deleteMany: (args: {
    where: { projectId: string; id: { notIn: string[] } };
  }) => Promise<{ count: number }>;
};

export type TransactionWithHistory = { projectHistorySnapshot?: HistorySnapshotStore };

export async function recordHistorySnapshot(
  tx: TransactionWithHistory,
  projectId: string,
  revision: number,
  title: string,
  data: JsonValue,
) {
  const snapshots = tx.projectHistorySnapshot;
  if (!snapshots) return;
  const contentHash = projectContentHash(title, data);
  const existing = await snapshots.findFirst({ where: { projectId, contentHash } });
  if (!existing) {
    await snapshots.create({
      // SAFETY: Prisma Json fields accept object; `data` is already the project's JsonValue snapshot.
      data: { projectId, revision, title, data: data as object, contentHash },
    });
  }
  const retained = await snapshots.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: PROJECT_HISTORY_RETENTION,
  });
  if (retained.length >= PROJECT_HISTORY_RETENTION) {
    await snapshots.deleteMany({
      where: { projectId, id: { notIn: retained.map((snapshot) => snapshot.id) } },
    });
  }
}
