import { beforeEach, describe, expect, it } from 'vitest';
import {
  createOfflineQueue,
  type OfflineCollaborationOperation,
  type OfflineQueueStorage,
  type OfflineSaveOperation,
} from '@/lib/offlineQueue';

function createMemoryStorage(): OfflineQueueStorage {
  const saves = new Map<number, OfflineSaveOperation>();
  const collaborationOperations = new Map<string, OfflineCollaborationOperation>();
  let nextId = 1;

  return {
    addSave: async (operation) => {
      const id = nextId++;
      saves.set(id, { ...operation, id });
      return id;
    },
    getSave: async (id) => saves.get(id),
    getSaves: async () => [...saves.values()].sort((a, b) => a.createdAt - b.createdAt),
    putSave: async (operation) => {
      if (operation.id === undefined) throw new Error('Save operation requires an id');
      saves.set(operation.id, operation);
    },
    removeSave: async (id) => {
      saves.delete(id);
    },
    getCollaborationOperations: async (projectId) =>
      [...collaborationOperations.values()]
        .filter((operation) => projectId === undefined || operation.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt),
    putCollaborationOperation: async (operation) => {
      collaborationOperations.set(operation.operationId, operation);
    },
    removeCollaborationOperation: async (operationId) => {
      collaborationOperations.delete(operationId);
    },
  };
}

describe('offline save queue', () => {
  let queue: ReturnType<typeof createOfflineQueue>;
  let storage: OfflineQueueStorage;

  beforeEach(() => {
    storage = createMemoryStorage();
    queue = createOfflineQueue(async () => storage);
  });

  it('replays saves in creation order and tracks retry attempts', async () => {
    await queue.enqueueOfflineSave({
      projectId: 'one',
      title: 'One',
      data: {},
      createdAt: 1,
      revision: 1,
    });
    const second = await queue.enqueueOfflineSave({
      projectId: 'two',
      title: 'Two',
      data: {},
      createdAt: 2,
      revision: 2,
    });

    expect((await queue.getOfflineSaveQueue()).map((item) => item.projectId)).toEqual([
      'one',
      'two',
    ]);
    await queue.markOfflineSaveAttempt(second);
    expect((await queue.getOfflineSaveQueue())[1].attempts).toBe(1);
    await queue.removeOfflineSave(second);
    expect((await queue.getOfflineSaveQueue()).map((item) => item.projectId)).toEqual(['one']);
  });

  it('keeps queue storage bounded', async () => {
    for (let index = 0; index < 51; index++) {
      await queue.enqueueOfflineSave({
        projectId: String(index),
        title: 'Board',
        data: {},
        createdAt: index,
        revision: 1,
      });
    }
    const operations = await queue.getOfflineSaveQueue();
    expect(operations).toHaveLength(50);
    expect(operations[0].projectId).toBe('1');
  });

  it('rejects an operation larger than the durable queue limit', async () => {
    await expect(
      queue.enqueueOfflineSave({
        projectId: 'large',
        title: 'Large board',
        data: 'x'.repeat(10 * 1024 * 1024 + 1),
        createdAt: 1,
        revision: 1,
      }),
    ).rejects.toThrow('10 MB');
  });

  it('persists idempotent collaboration operations separately from snapshots', async () => {
    await queue.enqueueCollaborationOperation({
      operationId: 'operation_1234567',
      projectId: 'project-1',
      expectedRevision: 3,
      kind: 'upsert-object',
      data: { object: { id: 'shape-1' } },
      createdAt: 1,
    });
    expect(await queue.getCollaborationOperations('project-1')).toHaveLength(1);
    await queue.markCollaborationOperationAttempt('operation_1234567');
    expect((await queue.getCollaborationOperations())[0].attempts).toBe(1);
    await queue.removeCollaborationOperation('operation_1234567');
    expect(await queue.getCollaborationOperations()).toEqual([]);
  });
});
