import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/lib/api';
import { localProjectsService } from '@/lib/localProjects';
import { ProjectMigrationService } from '@/services/ProjectMigrationService';

vi.mock('@/lib/api', () => ({ createProject: vi.fn() }));
vi.mock('@/lib/localProjects', () => ({
  localProjectsService: {
    getAllForMigration: vi.fn(),
    delete: vi.fn(),
    clearAll: vi.fn(),
  },
}));

const localProject = (id: string, title: string) => ({
  id,
  userId: 'guest',
  title,
  data: { objects: [] },
  createdAt: 1,
  updatedAt: 1,
  role: 'owner' as const,
});

describe('ProjectMigrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localProjectsService.delete).mockResolvedValue(true);
    vi.mocked(localProjectsService.clearAll).mockResolvedValue(undefined);
  });

  it('removes each migrated source so partial retries cannot duplicate successes', async () => {
    vi.mocked(localProjectsService.getAllForMigration).mockResolvedValue([
      localProject('local-1', 'First'),
      localProject('local-2', 'Second'),
    ]);
    vi.mocked(createProject)
      .mockResolvedValueOnce({ ...localProject('cloud-1', 'First'), revision: 1 })
      .mockRejectedValueOnce(new Error('offline'));

    const result = await new ProjectMigrationService().migrateProjects('token');

    expect(result).toMatchObject({ success: false, migratedCount: 1, failedCount: 1 });
    expect(localProjectsService.delete).toHaveBeenCalledTimes(1);
    expect(localProjectsService.delete).toHaveBeenCalledWith('local-1');
    expect(localProjectsService.clearAll).not.toHaveBeenCalled();
  });

  it('clears residual storage and records completion after every project migrates', async () => {
    vi.mocked(localProjectsService.getAllForMigration).mockResolvedValue([
      localProject('local-1', 'First'),
    ]);
    vi.mocked(createProject).mockResolvedValue({
      ...localProject('cloud-1', 'First'),
      revision: 1,
    });
    vi.mocked(localStorage.getItem).mockImplementation((key) =>
      key === 'last-guest-id' ? 'guest-1' : null,
    );

    const result = await new ProjectMigrationService().migrateProjects('token');

    expect(result).toMatchObject({ success: true, migratedCount: 1, failedCount: 0 });
    expect(localProjectsService.clearAll).toHaveBeenCalledOnce();
    expect(localStorage.setItem).toHaveBeenCalledWith('project-migration-status', 'guest-1');
  });
});
