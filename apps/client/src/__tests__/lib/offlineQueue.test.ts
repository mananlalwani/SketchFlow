import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => new Map<string, Map<string | number, Record<string, unknown>>>());
let nextId = 1;

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    add: async (_store: string, value: Record<string, unknown>) => {
      const id = nextId++;
      const store = stores.get(_store) ?? new Map();
      store.set(id, { ...value, id });
      stores.set(_store, store);
      return id;
    },
    get: async (_store: string, id: string | number) => stores.get(_store)?.get(id),
    put: async (_store: string, value: Record<string, unknown>) => {
      const store = stores.get(_store) ?? new Map();
      store.set((value.id ?? value.operationId) as string | number, value);
      stores.set(_store, store);
    },
    delete: async (_store: string, id: string | number) => stores.get(_store)?.delete(id),
    getAllFromIndex: async (_store: string, index: string, key?: string) =>
      [...(stores.get(_store)?.values() ?? [])]
        .filter((value) => key === undefined || value[index] === key)
        .sort((a, b) => (a.createdAt as number) - (b.createdAt as number)),
  })),
}));

import {
  enqueueOfflineSave,
  getOfflineSaveQueue,
  markOfflineSaveAttempt,
  removeOfflineSave,
  enqueueCollaborationOperation,
  getCollaborationOperations,
  markCollaborationOperationAttempt,
  removeCollaborationOperation,
} from '@/lib/offlineQueue';

describe('offline save queue', () => {
  beforeEach(() => {
    stores.clear();
    nextId = 1;
  });

  it('replays saves in creation order and tracks retry attempts', async () => {
    await enqueueOfflineSave({
      projectId: 'one',
      title: 'One',
      data: {},
      createdAt: 1,
      revision: 1,
    });
    const second = await enqueueOfflineSave({
      projectId: 'two',
      title: 'Two',
      data: {},
      createdAt: 2,
      revision: 2,
    });

    expect((await getOfflineSaveQueue()).map((item) => item.projectId)).toEqual(['one', 'two']);
    await markOfflineSaveAttempt(Number(second));
    expect((await getOfflineSaveQueue())[1].attempts).toBe(1);
    await removeOfflineSave(Number(second));
    expect((await getOfflineSaveQueue()).map((item) => item.projectId)).toEqual(['one']);
  });

  it('keeps queue storage bounded', async () => {
    for (let index = 0; index < 51; index++) {
      await enqueueOfflineSave({
        projectId: String(index),
        title: 'Board',
        data: {},
        createdAt: index,
        revision: 1,
      });
    }
    const queue = await getOfflineSaveQueue();
    expect(queue).toHaveLength(50);
    expect(queue[0].projectId).toBe('1');
  });

  it('rejects an operation larger than the durable queue limit', async () => {
    await expect(
      enqueueOfflineSave({
        projectId: 'large',
        title: 'Large board',
        data: 'x'.repeat(10 * 1024 * 1024 + 1),
        createdAt: 1,
        revision: 1,
      }),
    ).rejects.toThrow('10 MB');
  });

  it('persists idempotent collaboration operations separately from snapshots', async () => {
    await enqueueCollaborationOperation({
      operationId: 'operation_1234567',
      projectId: 'project-1',
      expectedRevision: 3,
      kind: 'upsert-object',
      data: { object: { id: 'shape-1' } },
      createdAt: 1,
    });
    expect(await getCollaborationOperations('project-1')).toHaveLength(1);
    await markCollaborationOperationAttempt('operation_1234567');
    expect((await getCollaborationOperations())[0].attempts).toBe(1);
    await removeCollaborationOperation('operation_1234567');
    expect(await getCollaborationOperations()).toEqual([]);
  });
});
