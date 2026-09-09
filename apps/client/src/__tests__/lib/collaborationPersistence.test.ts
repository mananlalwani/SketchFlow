import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '@sketchflow/shared';
import type { CollaborationCommit, CollaborationCommitResult } from '@/types/socket';
import { CollaborationPersistence, canApplyCanonicalProject } from '@/lib/collaborationPersistence';
import {
  createOfflineQueue,
  type OfflineCollaborationOperation,
  type OfflineQueueStorage,
} from '@/lib/offlineQueue';

function createSharedStorage(): OfflineQueueStorage {
  const operations = new Map<string, OfflineCollaborationOperation>();
  return {
    addSave: vi.fn(),
    getSave: vi.fn(),
    getSaves: vi.fn().mockResolvedValue([]),
    putSave: vi.fn(),
    removeSave: vi.fn(),
    getCollaborationOperations: async (projectId) =>
      [...operations.values()]
        .filter((operation) => projectId === undefined || operation.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt),
    putCollaborationOperation: async (operation) => {
      operations.set(operation.operationId, operation);
    },
    removeCollaborationOperation: async (operationId) => {
      operations.delete(operationId);
    },
  };
}

type CanonicalObject = { id: string; type: 'stroke'; points: { x: number; y: number }[] };

class FakeCanonicalServer {
  public revision = 0;
  public objects: CanonicalObject[] = [];
  public readonly operationIds = new Set<string>();
  public readonly commits: CollaborationCommit[] = [];
  public readonly listeners = new Set<(objects: CanonicalObject[], revision: number) => void>();

  public commit = async (operation: CollaborationCommit): Promise<CollaborationCommitResult> => {
    this.commits.push(operation);
    if (this.operationIds.has(operation.operationId)) {
      return {
        status: 'duplicate',
        operationId: operation.operationId,
        revision: this.revision,
        data: JSON.stringify({ objects: this.objects }) as JsonValue,
        title: 'Offline board',
      };
    }

    this.operationIds.add(operation.operationId);
    const data = operation.data as { object?: CanonicalObject };
    if (operation.kind === 'upsert-object' && data.object) {
      this.objects = [
        ...this.objects.filter((object) => object.id !== data.object?.id),
        data.object,
      ];
    }
    this.revision += 1;
    for (const listener of this.listeners) listener(this.objects, this.revision);
    return {
      status: 'applied',
      operationId: operation.operationId,
      revision: this.revision,
      data: JSON.stringify({ objects: this.objects }) as JsonValue,
      title: 'Offline board',
    };
  };
}

function operation(operationId: string, id: string, createdAt: number) {
  return {
    operationId,
    projectId: 'project-1',
    expectedRevision: 0,
    kind: 'upsert-object' as const,
    data: {
      object: { id, type: 'stroke' as const, points: [{ x: createdAt, y: createdAt }] },
    },
    title: 'Offline board',
    createdAt,
  };
}

describe('collaboration persistence integration', () => {
  it('does not emit until the durable queue write has completed', async () => {
    let releaseEnqueue!: () => void;
    const enqueueFinished = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    const enqueue = vi.fn(async () => enqueueFinished);
    const send = vi.fn().mockResolvedValue({
      status: 'applied',
      operationId: 'durable-first',
      revision: 1,
      data: '{}',
      title: 'Board',
    } satisfies CollaborationCommitResult);
    const persistence = new CollaborationPersistence({
      queue: {
        enqueueCollaborationOperation: enqueue,
        getCollaborationOperations: vi.fn().mockResolvedValue([]),
        removeCollaborationOperation: vi.fn().mockResolvedValue(undefined),
        markCollaborationOperationAttempt: vi.fn().mockResolvedValue(undefined),
      },
      send,
    });
    persistence.setConnected(true);

    const pending = persistence.persist(operation('durable-first', 'stroke', 1));
    await Promise.resolve();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();

    releaseEnqueue();
    await pending;
    expect(send).toHaveBeenCalledOnce();
  });

  it('keeps the newest local draft across an offline browser restart and replays idempotently', async () => {
    const storage = createSharedStorage();
    const firstQueue = createOfflineQueue(async () => storage);
    const server = new FakeCanonicalServer();
    const clientAStatuses: string[] = [];
    const clientB = { objects: [...server.objects], revision: 0 };
    server.listeners.add((objects, revision) => {
      clientB.objects = [...objects];
      clientB.revision = revision;
    });

    const clientA = new CollaborationPersistence({
      queue: firstQueue,
      send: server.commit,
      onStatus: (status) => clientAStatuses.push(status),
    });
    clientA.setConnected(true);

    const onlineEdit = operation('online-1', 'online-stroke', 1);
    const localObjects = [onlineEdit.data.object];
    await clientA.persist(onlineEdit);
    expect(server.revision).toBe(1);
    expect(await firstQueue.getCollaborationOperations('project-1')).toEqual([]);

    clientA.setConnected(false);
    const offlineEdit = operation('offline-1', 'offline-stroke', 2);
    localObjects.push(offlineEdit.data.object);
    await clientA.persist(offlineEdit);
    const newestEdit = operation('offline-2', 'newest-stroke', 3);
    localObjects.push(newestEdit.data.object);
    await clientA.persist(newestEdit);

    expect(clientAStatuses).toContain('saved-locally');
    expect(await firstQueue.getCollaborationOperations('project-1')).toHaveLength(2);

    // A new browser context gets its visible draft from the local recovery
    // snapshot while the same durable queue remains available for replay.
    const recoveredObjects = [...localObjects];
    const restartedQueue = createOfflineQueue(async () => storage);
    expect(recoveredObjects.map((object) => object.id)).toEqual([
      'online-stroke',
      'offline-stroke',
      'newest-stroke',
    ]);
    expect(await restartedQueue.getCollaborationOperations('project-1')).toHaveLength(2);

    const clientAAfterRestart = new CollaborationPersistence({
      queue: restartedQueue,
      send: server.commit,
    });
    clientAAfterRestart.setConnected(true);
    await clientAAfterRestart.replay('project-1');

    expect(server.revision).toBe(3);
    expect(clientB.objects.map((object) => object.id)).toEqual([
      'online-stroke',
      'offline-stroke',
      'newest-stroke',
    ]);
    expect(await restartedQueue.getCollaborationOperations('project-1')).toEqual([]);

    // A crash after the server accepted an operation can leave its queue row
    // behind. A repeated operation receives a duplicate acknowledgement and
    // is removed without changing canonical state.
    const duplicateStorage = createSharedStorage();
    const duplicateQueue = createOfflineQueue(async () => duplicateStorage);
    const originalRemove = duplicateStorage.removeCollaborationOperation;
    let removeCalls = 0;
    duplicateStorage.removeCollaborationOperation = async (operationId) => {
      removeCalls += 1;
      if (removeCalls === 1) throw new Error('browser closed after acknowledgement');
      await originalRemove(operationId);
    };
    const duplicateClient = new CollaborationPersistence({
      queue: duplicateQueue,
      send: server.commit,
    });
    duplicateClient.setConnected(true);
    const duplicateOperation = operation('offline-2', 'newest-stroke', 3);
    await expect(duplicateClient.persist(duplicateOperation)).rejects.toThrow('browser closed');
    const replayResults = await duplicateClient.replay('project-1');
    expect(server.revision).toBe(3);
    expect(replayResults[0]).toMatchObject({
      status: 'duplicate',
      data: JSON.stringify({ objects: server.objects }),
      title: 'Offline board',
    });
    expect(await duplicateQueue.getCollaborationOperations('project-1')).toEqual([]);
  });

  it('does not allow canonical hydration to replace unsaved or queued local work', () => {
    expect(canApplyCanonicalProject({ hasUnsavedChanges: true, pendingOperationCount: 0 })).toBe(
      false,
    );
    expect(canApplyCanonicalProject({ hasUnsavedChanges: false, pendingOperationCount: 1 })).toBe(
      false,
    );
    expect(canApplyCanonicalProject({ hasUnsavedChanges: false, pendingOperationCount: 0 })).toBe(
      true,
    );
  });
});
