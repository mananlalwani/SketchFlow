import { beforeEach, describe, expect, it } from 'vitest';
import { createEmergencyBackupService, type EmergencyBackup } from '@/lib/emergencyBackup';

const backups = new Map<string, EmergencyBackup>();
const backupService = createEmergencyBackupService(async () => ({
  transaction: () => ({
    store: {
      get: async (projectId) => backups.get(projectId),
      put: async (backup) => void backups.set(backup.projectId, backup),
      delete: async (projectId) => void backups.delete(projectId),
    },
    done: Promise.resolve(),
  }),
  get: async (_storeName, projectId) => backups.get(projectId),
}));

describe('emergencyBackup', () => {
  beforeEach(() => {
    backups.clear();
  });

  it('does not let a delayed older backup overwrite a newer snapshot', async () => {
    await backupService.save({
      projectId: 'project-1',
      title: 'Newer',
      data: 'newer-data',
      timestamp: 2,
    });
    await backupService.save({
      projectId: 'project-1',
      title: 'Older',
      data: 'older-data',
      timestamp: 1,
    });

    await expect(backupService.get('project-1')).resolves.toMatchObject({
      title: 'Newer',
      data: 'newer-data',
      timestamp: 2,
    });
  });

  it('deletes only the backup matching a completed save snapshot', async () => {
    await backupService.save({
      projectId: 'project-1',
      title: 'Newer',
      data: 'newer-data',
      timestamp: 2,
    });

    await backupService.remove('project-1', { title: 'Older', data: 'older-data' });
    await expect(backupService.get('project-1')).resolves.toMatchObject({
      title: 'Newer',
      data: 'newer-data',
    });

    await backupService.remove('project-1', { title: 'Newer', data: 'newer-data' });
    await expect(backupService.get('project-1')).resolves.toBeUndefined();
  });
});
