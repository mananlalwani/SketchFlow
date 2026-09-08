import { describe, expect, it, vi } from 'vitest';
import { NetworkError } from '@/lib/errorHandling';
import {
  recoverProjectBackup,
  replayOfflineSaves,
  saveProjectSnapshot,
} from '@/lib/projectSaveRecovery';

describe('project save and recovery policy', () => {
  it('keeps an acknowledged save successful when backup cleanup fails', async () => {
    const actions = { setProjectRevision: vi.fn(), markSaved: vi.fn() };
    const cleanupFailure = new Error('IndexedDB unavailable');
    const result = await saveProjectSnapshot({
      snapshot: { projectId: 'p1', title: 'Board', data: '{}', documentVersion: 4 },
      cloud: true,
      coordinator: {
        resume: vi.fn(),
        enqueue: vi.fn().mockResolvedValue({ id: 'p1', revision: 8 }),
      },
      getCurrentState: () => ({ currentProjectId: 'p1', documentVersion: 4 }),
      actions,
      removeBackup: vi.fn().mockRejectedValue(cleanupFailure),
    });

    expect(result).toBe('saved');
    expect(actions.markSaved).toHaveBeenCalledWith(4);
  });

  it('does not commit an acknowledgement after reloading the same project', async () => {
    const actions = { setProjectRevision: vi.fn(), markSaved: vi.fn() };
    let current = { currentProjectId: 'p1', documentVersion: 4 };
    const result = await saveProjectSnapshot({
      snapshot: { projectId: 'p1', title: 'Board', data: '{}', documentVersion: 4 },
      cloud: true,
      coordinator: {
        resume: vi.fn(),
        enqueue: vi.fn().mockImplementation(async () => {
          current = { currentProjectId: 'p1', documentVersion: 5 };
          return { id: 'p1', revision: 8 };
        }),
      },
      getCurrentState: () => current,
      actions,
      removeBackup: vi.fn(),
    });

    expect(result).toBe('stale');
    expect(actions.markSaved).not.toHaveBeenCalled();
  });

  it('replays only the newest queued snapshot per project and removes its stale entries', async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: 'p1', revision: 4 });
    const remove = vi.fn();
    const operations = [
      {
        id: 1,
        projectId: 'p1',
        title: 'Board',
        data: '{}',
        revision: 2,
        createdAt: 1,
        attempts: 0,
      },
      {
        id: 2,
        projectId: 'p1',
        title: 'Board',
        data: '{"new":true}',
        revision: 3,
        createdAt: 2,
        attempts: 0,
      },
    ];
    await replayOfflineSaves({
      operations,
      coordinator: { enqueue },
      getToken: vi.fn().mockResolvedValue('token'),
      markAttempt: vi.fn(),
      remove,
      onConflict: vi.fn(),
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ data: '{"new":true}', expectedRevision: 3 }),
    );
    expect(remove).toHaveBeenCalledWith(1);
    expect(remove).toHaveBeenCalledWith(2);
  });

  it('keeps conflicts visible during replay', async () => {
    const onConflict = vi.fn();
    const markAttempt = vi.fn();
    await replayOfflineSaves({
      operations: [
        {
          id: 3,
          projectId: 'p1',
          title: 'Board',
          data: '{}',
          revision: 2,
          createdAt: 1,
          attempts: 0,
        },
      ],
      coordinator: { enqueue: vi.fn().mockRejectedValue(new NetworkError('stale', 409)) },
      getToken: vi.fn(),
      markAttempt,
      remove: vi.fn(),
      onConflict,
    });
    expect(markAttempt).toHaveBeenCalledWith(3);
    expect(onConflict).toHaveBeenCalledOnce();
  });

  it('checks the active project before restoring a backup', async () => {
    const restore = vi.fn();
    await expect(
      recoverProjectBackup({
        projectId: 'p1',
        currentTitle: 'Board',
        currentData: '{}',
        getBackup: vi
          .fn()
          .mockResolvedValue({ projectId: 'p1', title: 'Board', data: '{"x":1}', timestamp: 100 }),
        removeBackup: vi.fn(),
        deserialize: vi.fn().mockReturnValue([]),
        getCurrentState: () => ({ currentProjectId: 'p2' }),
        restore,
        onRecovered: vi.fn(),
        now: () => 101,
      }),
    ).resolves.toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });

  it('does not restore a recovery backup into a viewer session', async () => {
    const getBackup = vi.fn().mockResolvedValue({
      projectId: 'p1',
      title: 'Board',
      data: '{"x":1}',
      timestamp: 100,
    });
    const restore = vi.fn();
    await expect(
      recoverProjectBackup({
        projectId: 'p1',
        projectRole: 'viewer',
        currentTitle: 'Board',
        currentData: '{}',
        getBackup,
        removeBackup: vi.fn(),
        deserialize: vi.fn(),
        getCurrentState: () => ({ currentProjectId: 'p1' }),
        restore,
        onRecovered: vi.fn(),
        now: () => 101,
      }),
    ).resolves.toBe(false);
    expect(getBackup).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });

  it('does not restore when the same project is reloaded while deserializing', async () => {
    let currentProjectId = 'p1';
    const restore = vi.fn();
    await expect(
      recoverProjectBackup({
        projectId: 'p1',
        currentTitle: 'Board',
        currentData: '{}',
        getBackup: vi.fn().mockResolvedValue({
          projectId: 'p1',
          title: 'Board',
          data: '{"x":1}',
          timestamp: 100,
        }),
        removeBackup: vi.fn(),
        deserialize: vi.fn().mockImplementation(() => {
          currentProjectId = 'p1-reloaded';
          return [];
        }),
        getCurrentState: () => ({ currentProjectId }),
        restore,
        onRecovered: vi.fn(),
        now: () => 101,
      }),
    ).resolves.toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });

  it('does not restore when an editor becomes a viewer during backup lookup', async () => {
    let projectRole: 'editor' | 'viewer' = 'editor';
    let resolveBackup!: (backup: {
      projectId: string;
      title: string;
      data: string;
      timestamp: number;
    }) => void;
    const lookup = new Promise<{
      projectId: string;
      title: string;
      data: string;
      timestamp: number;
    }>((resolve) => {
      resolveBackup = resolve;
    });
    const restore = vi.fn();
    const recovery = recoverProjectBackup({
      projectId: 'p1',
      projectRole,
      currentTitle: 'Board',
      currentData: '{}',
      getBackup: vi.fn().mockReturnValue(lookup),
      removeBackup: vi.fn(),
      deserialize: vi.fn().mockReturnValue([]),
      getCurrentState: () => ({ currentProjectId: 'p1', projectRole }),
      restore,
      onRecovered: vi.fn(),
      now: () => 101,
    });
    projectRole = 'viewer';
    resolveBackup({ projectId: 'p1', title: 'Board', data: '{"x":1}', timestamp: 100 });

    await expect(recovery).resolves.toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });
});
