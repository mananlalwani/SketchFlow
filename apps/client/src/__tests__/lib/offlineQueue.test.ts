import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => new Map<number, Record<string, unknown>>());
let nextId = 1;

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    add: async (_store: string, value: Record<string, unknown>) => {
      const id = nextId++;
      stores.set(id, { ...value, id });
      return id;
    },
    get: async (_store: string, id: number) => stores.get(id),
    put: async (_store: string, value: Record<string, unknown>) =>
      stores.set(value.id as number, value),
    delete: async (_store: string, id: number) => stores.delete(id),
    getAllFromIndex: async () =>
      [...stores.values()].sort((a, b) => (a.createdAt as number) - (b.createdAt as number)),
  })),
}));

import {
  enqueueOfflineSave,
  getOfflineSaveQueue,
  markOfflineSaveAttempt,
  removeOfflineSave,
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
});
