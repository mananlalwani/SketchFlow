import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectService, PROJECT_HISTORY_RETENTION } from '../../services/ProjectService.js';

vi.mock('../../lib/prisma.js', () => {
  const project = { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() };
  const collaborationOperation = { findUnique: vi.fn(), create: vi.fn() };
  const projectHistorySnapshot = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  };
  const transaction = { project, collaborationOperation, projectHistorySnapshot };
  return {
    prisma: {
      project,
      collaborationOperation,
      projectHistorySnapshot,
      $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

import { prisma } from '../../lib/prisma.js';

const project = {
  id: 'project-1',
  userId: 'owner',
  title: 'Board',
  data: { objects: [{ id: 'current' }] },
  revision: 4,
  updatedAt: new Date(),
  createdAt: new Date(),
  shared: false,
  collaborators: [{ userId: 'editor', role: 'editor' }],
};

describe('project history', () => {
  const service = new ProjectService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.projectHistorySnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.projectHistorySnapshot.findMany).mockResolvedValue([]);
    vi.mocked(prisma.projectHistorySnapshot.create).mockResolvedValue({} as never);
    vi.mocked(prisma.projectHistorySnapshot.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.collaborationOperation.create).mockResolvedValue({} as never);
  });

  it('creates the initial history snapshot in the project transaction', async () => {
    const created = {
      ...project,
      id: 'new-project',
      revision: 1,
      title: 'New board',
      updatedAt: new Date(),
      createdAt: new Date(),
      shared: false,
      shareToken: null,
      collaborators: [],
    };
    vi.mocked(prisma.project.create).mockResolvedValue(created as never);

    await expect(service.create('owner', 'New board', created.data)).resolves.toMatchObject({
      id: 'new-project',
      revision: 1,
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.projectHistorySnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'new-project',
          revision: 1,
          title: 'New board',
        }),
      }),
    );
  });

  it('deduplicates accepted commits and bounds retained history', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.projectHistorySnapshot.findMany).mockResolvedValue(
      Array.from({ length: PROJECT_HISTORY_RETENTION }, (_, index) => ({
        id: `snapshot-${index}`,
        revision: index + 1,
        title: 'Board',
        contentHash: `hash-${index}`,
        createdAt: new Date(),
        data: {},
      })) as never,
    );

    await service.commitCollaborationOperation({
      projectId: project.id,
      userId: 'owner',
      operationId: 'operation-history-1',
      expectedRevision: project.revision,
      kind: 'replace-project',
      data: { objects: [{ id: 'next' }] },
    });

    expect(prisma.projectHistorySnapshot.create).toHaveBeenCalledTimes(1);
    expect(prisma.projectHistorySnapshot.deleteMany).toHaveBeenCalledWith({
      where: { projectId: project.id, id: { notIn: expect.any(Array) } },
    });

    vi.mocked(prisma.projectHistorySnapshot.findFirst).mockResolvedValue({ id: 'same' } as never);
    await service.commitCollaborationOperation({
      projectId: project.id,
      userId: 'owner',
      operationId: 'operation-history-2',
      expectedRevision: project.revision,
      kind: 'replace-project',
      data: { objects: [{ id: 'next' }] },
    });
    expect(prisma.projectHistorySnapshot.create).toHaveBeenCalledTimes(1);
  });

  it('preserves current content before an intentional restore and creates a new revision', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never);
    const oldSnapshot = {
      id: 'old',
      projectId: project.id,
      revision: 2,
      title: 'Older board',
      data: { objects: [{ id: 'old' }] },
      contentHash: 'old-hash',
      createdAt: new Date(),
    };
    vi.mocked(prisma.projectHistorySnapshot.findFirst).mockImplementation(async (args) => {
      const where = args.where as { id?: string; contentHash?: string };
      return where.id === oldSnapshot.id || where.contentHash === oldSnapshot.contentHash
        ? oldSnapshot
        : null;
    });

    const result = await service.restoreHistory(project.id, 'editor', 'old', project.revision);

    expect(result).toMatchObject({ status: 'applied', revision: 5, title: 'Older board' });
    expect(prisma.projectHistorySnapshot.create).toHaveBeenCalledTimes(2);
    expect(prisma.projectHistorySnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revision: 4, title: 'Board' }) }),
    );
    expect(prisma.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: project.id, revision: 4 } }),
    );
  });

  it('rejects a stale restore without changing the project', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);

    await expect(service.restoreHistory(project.id, 'owner', 'old', 3)).resolves.toEqual({
      status: 'conflict',
      currentRevision: 4,
    });
    expect(prisma.projectHistorySnapshot.findFirst).not.toHaveBeenCalled();
    expect(prisma.project.updateMany).not.toHaveBeenCalled();
  });
});
