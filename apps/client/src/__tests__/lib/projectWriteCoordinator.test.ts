import { describe, expect, it, vi } from 'vitest';
import { ProjectWriteCoordinator, type ProjectWriteTransport } from '@/lib/projectWriteCoordinator';
import { NetworkError } from '@/lib/errorHandling';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('ProjectWriteCoordinator', () => {
  it('serializes one project and coalesces pending snapshots to the newest version', async () => {
    const first = deferred<{ id: string; revision: number }>();
    const transport: ProjectWriteTransport = {
      create: vi.fn(() => first.promise),
      update: vi.fn(async () => ({ id: 'project-1', revision: 2 })),
    };
    const coordinator = new ProjectWriteCoordinator(transport);

    const initial = coordinator.enqueue({
      projectKey: 'draft',
      title: 'One',
      data: 1,
      documentVersion: 1,
    });
    const second = coordinator.enqueue({
      projectKey: 'draft',
      title: 'Two',
      data: 2,
      documentVersion: 2,
    });
    const third = coordinator.enqueue({
      projectKey: 'draft',
      title: 'Three',
      data: 3,
      documentVersion: 3,
    });

    expect(transport.create).toHaveBeenCalledOnce();
    first.resolve({ id: 'project-1', revision: 1 });
    await initial;
    await Promise.all([second, third]);

    expect(transport.update).toHaveBeenCalledOnce();
    expect(transport.update).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ documentVersion: 3, data: 3 }),
      1,
    );
  });

  it('allows unrelated project lanes to progress independently', async () => {
    const transport: ProjectWriteTransport = {
      create: vi.fn(async (snapshot) => ({ id: snapshot.projectKey, revision: 1 })),
      update: vi.fn(),
    };
    const coordinator = new ProjectWriteCoordinator(transport);

    await Promise.all([
      coordinator.enqueue({ projectKey: 'one', title: 'One', data: {}, documentVersion: 1 }),
      coordinator.enqueue({ projectKey: 'two', title: 'Two', data: {}, documentVersion: 1 }),
    ]);

    expect(transport.create).toHaveBeenCalledTimes(2);
  });

  it('retries a transient revision-checked update with a bounded backoff', async () => {
    const sleep = vi.fn(async () => {});
    const transport: ProjectWriteTransport = {
      create: vi.fn(),
      update: vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Temporary server failure', 503))
        .mockResolvedValueOnce({ id: 'project-1', revision: 2 }),
    };
    const coordinator = new ProjectWriteCoordinator(transport, {
      retryDelaysMs: [25],
      sleep,
    });

    await expect(
      coordinator.enqueue({
        projectKey: 'project-1',
        projectId: 'project-1',
        title: 'Retry safely',
        data: {},
        documentVersion: 1,
        expectedRevision: 1,
      }),
    ).resolves.toMatchObject({ revision: 2 });

    expect(sleep).toHaveBeenCalledWith(25);
    expect(transport.update).toHaveBeenCalledTimes(2);
    expect(transport.update).toHaveBeenLastCalledWith(
      'project-1',
      expect.objectContaining({ documentVersion: 1 }),
      1,
    );
  });

  it('keeps a conflict-paused lane blocked until a manual retry resumes it', async () => {
    const transport: ProjectWriteTransport = {
      create: vi.fn(),
      update: vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Revision conflict', 409))
        .mockResolvedValueOnce({ id: 'project-1', revision: 3 }),
    };
    const coordinator = new ProjectWriteCoordinator(transport);

    await expect(
      coordinator.enqueue({
        projectKey: 'project-1',
        projectId: 'project-1',
        title: 'Conflicting edit',
        data: { version: 1 },
        documentVersion: 1,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const queued = coordinator.enqueue({
      projectKey: 'project-1',
      projectId: 'project-1',
      title: 'Do not retry automatically',
      data: { version: 2 },
      documentVersion: 2,
      expectedRevision: 1,
    });
    await Promise.resolve();
    expect(transport.update).toHaveBeenCalledOnce();

    coordinator.resume('project-1');
    await expect(queued).resolves.toMatchObject({ revision: 3 });
    expect(transport.update).toHaveBeenCalledTimes(2);
  });

  it('drops stale queued writes and preserves the loaded revision after a session reset', async () => {
    const first = deferred<{ id: string; revision: number }>();
    const transport: ProjectWriteTransport = {
      create: vi.fn(() => first.promise),
      update: vi.fn(async () => ({ id: 'project-1', revision: 8 })),
    };
    const coordinator = new ProjectWriteCoordinator(transport);

    const inFlight = coordinator.enqueue({
      projectKey: 'draft',
      title: 'Before load',
      data: { version: 1 },
      documentVersion: 1,
    });
    const staleQueued = coordinator.enqueue({
      projectKey: 'draft',
      title: 'Stale queued save',
      data: { version: 2 },
      documentVersion: 2,
    });

    const staleQueuedRejected = expect(staleQueued).rejects.toMatchObject({
      name: 'ProjectWriteResetError',
    });
    coordinator.reset('draft', { projectId: 'project-1', revision: 7 });
    await staleQueuedRejected;

    const fresh = coordinator.enqueue({
      projectKey: 'draft',
      projectId: 'project-1',
      title: 'Loaded session edit',
      data: { version: 10 },
      documentVersion: 10,
      expectedRevision: 7,
    });
    first.resolve({ id: 'project-1', revision: 1 });

    await inFlight;
    await fresh;

    expect(transport.update).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ data: { version: 10 }, documentVersion: 10 }),
      7,
    );
  });
});
