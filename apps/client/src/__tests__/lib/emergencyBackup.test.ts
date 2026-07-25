import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const backups = new Map<string, unknown>();
  const transaction = () => ({
    store: {
      get: vi.fn(async (projectId: string) => backups.get(projectId)),
      put: vi.fn(async (backup: { projectId: string }) => backups.set(backup.projectId, backup)),
      delete: vi.fn(async (projectId: string) => backups.delete(projectId)),
    },
    done: Promise.resolve(),
  });

  return {
    backups,
    openDB: vi.fn(async () => ({
      transaction,
      get: vi.fn(async (_store: string, projectId: string) => backups.get(projectId)),
    })),
  };
});

vi.mock('idb', () => ({ openDB: mocks.openDB }));

import {
  getEmergencyBackup,
  removeEmergencyBackup,
  saveEmergencyBackup,
} from '@/lib/emergencyBackup';

describe('emergencyBackup', () => {
  beforeEach(() => {
    mocks.backups.clear();
    mocks.openDB.mockClear();
  });

  it('does not let a delayed older backup overwrite a newer snapshot', async () => {
    await saveEmergencyBackup({
      projectId: 'project-1',
      title: 'Newer',
      data: 'newer-data',
      timestamp: 2,
    });
    await saveEmergencyBackup({
      projectId: 'project-1',
      title: 'Older',
      data: 'older-data',
      timestamp: 1,
    });

    await expect(getEmergencyBackup('project-1')).resolves.toMatchObject({
      title: 'Newer',
      data: 'newer-data',
      timestamp: 2,
    });
  });

  it('deletes only the backup matching a completed save snapshot', async () => {
    await saveEmergencyBackup({
      projectId: 'project-1',
      title: 'Newer',
      data: 'newer-data',
      timestamp: 2,
    });

    await removeEmergencyBackup('project-1', { title: 'Older', data: 'older-data' });
    await expect(getEmergencyBackup('project-1')).resolves.toMatchObject({
      title: 'Newer',
      data: 'newer-data',
    });

    await removeEmergencyBackup('project-1', { title: 'Newer', data: 'newer-data' });
    await expect(getEmergencyBackup('project-1')).resolves.toBeUndefined();
  });
});
