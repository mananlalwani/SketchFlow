import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from '../../services/ProjectService.js';

// Mock prisma
vi.mock('../../lib/prisma.js', () => {
  const project = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };
  const collaborationOperation = {
    findUnique: vi.fn(),
    create: vi.fn(),
  };

  return {
    prisma: {
      project,
      projectCollaborator: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      collaborationSnapshot: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
      },
      collaborationOperation,
      folder: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback({ project, collaborationOperation })),
    },
  };
});

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
import { prisma } from '../../lib/prisma.js';

describe('ProjectService', () => {
  let service: ProjectService;

  beforeEach(() => {
    service = new ProjectService();
    vi.clearAllMocks();
  });

  describe('permission matrix', () => {
    const project = {
      id: 'proj-1',
      userId: 'owner',
      title: 'Board',
      data: {},
      updatedAt: new Date(),
      createdAt: new Date(),
      shared: true,
      shareToken: 'token',
      collaborators: [
        { userId: 'editor', role: 'editor' },
        { userId: 'viewer', role: 'viewer' },
      ],
    };

    it.each([
      ['owner', 'view', true],
      ['owner', 'edit', true],
      ['owner', 'share', true],
      ['editor', 'view', true],
      ['editor', 'edit', true],
      ['editor', 'share', false],
      ['viewer', 'view', true],
      ['viewer', 'edit', false],
      ['viewer', 'delete', false],
      ['anonymous', 'view', false],
      ['anonymous', 'edit', false],
    ] as const)('%s %s permission is %s', async (userId, action, expected) => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
      await expect(service.checkPermission('proj-1', userId, action)).resolves.toBe(expected);
    });
  });

  describe('public share links', () => {
    const sharedProject = {
      id: 'proj-1',
      userId: 'owner',
      title: 'Shared board',
      data: {},
      updatedAt: new Date(),
      createdAt: new Date(),
      shared: true,
      shareToken: 'a'.repeat(43),
      shareExpiresAt: new Date(Date.now() + 60_000),
      shareRevokedAt: null,
      collaborators: [],
    };

    it('only resolves active, non-revoked share tokens', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(sharedProject as never);
      await expect(service.getByShareToken('a'.repeat(43))).resolves.toMatchObject({
        id: 'proj-1',
        role: 'viewer',
      });

      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        ...sharedProject,
        shareExpiresAt: new Date(Date.now() - 1),
      } as never);
      await expect(service.getByShareToken('a'.repeat(43))).resolves.toBeNull();

      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        ...sharedProject,
        shareRevokedAt: new Date(),
      } as never);
      await expect(service.getByShareToken('a'.repeat(43))).resolves.toBeNull();
    });
  });

  describe('canonical collaboration commits', () => {
    const project = {
      id: 'proj-1',
      userId: 'owner',
      title: 'Board',
      data: { objects: [] },
      revision: 3,
      updatedAt: new Date(),
      createdAt: new Date(),
      shared: false,
      shareToken: null,
      collaborators: [{ userId: 'editor', role: 'editor' }],
    };
    const operation = {
      projectId: 'proj-1',
      userId: 'editor',
      operationId: 'operation_1234567',
      expectedRevision: 3,
      kind: 'replace-project' as const,
      data: { objects: [{ id: 'shape-1', type: 'rectangle' }] },
    };

    it('persists one accepted canonical revision and its idempotency receipt', async () => {
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.collaborationOperation.create).mockResolvedValue({} as never);

      await expect(service.commitCollaborationOperation(operation)).resolves.toMatchObject({
        status: 'applied',
        revision: 4,
        data: operation.data,
      });
      expect(prisma.project.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'proj-1', revision: 3 } }),
      );
      expect(prisma.collaborationOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operationId: operation.operationId,
            actorUserId: 'editor',
            revision: 4,
            kind: 'replace-project',
            receiptHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
    });

    it('applies an object batch atomically without replacing unrelated objects', async () => {
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        ...project,
        data: { objects: [{ id: 'existing', type: 'rectangle' }] },
      } as never);
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.collaborationOperation.create).mockResolvedValue({} as never);

      await expect(
        service.commitCollaborationOperation({
          ...operation,
          operationId: 'operation_batch_1',
          kind: 'batch',
          data: {
            operations: [
              { kind: 'upsert-object', data: { object: { id: 'new', type: 'ellipse' } } },
              { kind: 'delete-object', data: { id: 'existing' } },
            ],
          },
        }),
      ).resolves.toMatchObject({
        status: 'applied',
        data: { objects: [{ id: 'new', type: 'ellipse' }] },
      });
    });

    it('persists lock and group metadata from an atomic client selection action', async () => {
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        ...project,
        data: {
          objects: [
            { id: 'first', type: 'rectangle', color: '#000000', size: 2 },
            { id: 'second', type: 'stroke', color: '#000000', size: 2 },
          ],
        },
      } as never);
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.collaborationOperation.create).mockResolvedValue({} as never);

      await expect(
        service.commitCollaborationOperation({
          ...operation,
          operationId: 'operation_selection_1',
          kind: 'batch',
          data: {
            operations: [
              {
                kind: 'upsert-object',
                data: {
                  object: {
                    id: 'first',
                    type: 'rectangle',
                    color: '#000000',
                    size: 2,
                    groupId: 'group-1',
                    locked: true,
                  },
                },
              },
              {
                kind: 'upsert-object',
                data: {
                  object: {
                    id: 'second',
                    type: 'stroke',
                    color: '#000000',
                    size: 2,
                    groupId: 'group-1',
                    locked: true,
                  },
                },
              },
            ],
          },
        }),
      ).resolves.toMatchObject({
        status: 'applied',
        data: {
          objects: [
            expect.objectContaining({ id: 'first', groupId: 'group-1', locked: true }),
            expect.objectContaining({ id: 'second', groupId: 'group-1', locked: true }),
          ],
        },
      });
    });

    it('returns an existing matching operation as a duplicate without writing again', async () => {
      const receiptHash = 'a'.repeat(64);
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue({
        receiptHash,
        revision: 4,
      } as never);

      // Use the hash captured from a first local application so this test remains
      // independent of serialization implementation details.
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.collaborationOperation.create).mockImplementation(async (args) => {
        vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue({
          receiptHash: args.data.receiptHash,
          revision: 4,
        } as never);
        return {} as never;
      });
      await service.commitCollaborationOperation(operation);

      await expect(service.commitCollaborationOperation(operation)).resolves.toEqual({
        status: 'duplicate',
        operationId: operation.operationId,
        revision: 4,
      });
      expect(prisma.project.updateMany).toHaveBeenCalledTimes(1);
    });

    it('rejects altered payload reuse of an operation ID', async () => {
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue({
        receiptHash: 'different-receipt',
        revision: 4,
      } as never);

      await expect(service.commitCollaborationOperation(operation)).resolves.toEqual({
        status: 'invalid',
        operationId: operation.operationId,
      });
      expect(prisma.project.updateMany).not.toHaveBeenCalled();
    });

    it('returns the latest revision when a concurrent commit wins the CAS', async () => {
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.project.findUnique)
        .mockResolvedValueOnce(project as never)
        .mockResolvedValueOnce({ ...project, revision: 4 } as never);
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(service.commitCollaborationOperation(operation)).resolves.toEqual({
        status: 'conflict',
        operationId: operation.operationId,
        currentRevision: 4,
      });
      expect(prisma.collaborationOperation.create).not.toHaveBeenCalled();
    });

    it('recognizes an identical operation that commits while its CAS is pending', async () => {
      let receiptHash = '';
      vi.mocked(prisma.collaborationOperation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.collaborationOperation.create).mockImplementation(async (args) => {
        receiptHash = args.data.receiptHash;
        return {} as never;
      });
      await service.commitCollaborationOperation(operation);

      vi.mocked(prisma.collaborationOperation.findUnique).mockReset();
      vi.mocked(prisma.collaborationOperation.findUnique)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ receiptHash, revision: 4 } as never);
      vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
      vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(service.commitCollaborationOperation(operation)).resolves.toEqual({
        status: 'duplicate',
        operationId: operation.operationId,
        revision: 4,
      });
    });
  });

  describe('list', () => {
    it('should return empty array when no projects', async () => {
      vi.mocked(prisma.project.findMany).mockResolvedValue([]);

      const result = await service.list('user-123');

      expect(result).toEqual([]);
      expect(prisma.project.findMany).toHaveBeenCalled();
    });

    it('should return projects with role info', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          userId: 'user-123',
          title: 'Test Project',
          updatedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-01'),
          shared: false,
          shareToken: null,
          folderId: null,
          collaborators: [],
        },
      ];

      vi.mocked(prisma.project.findMany)
        .mockResolvedValueOnce(mockProjects as never)
        .mockResolvedValueOnce([] as never);

      const result = await service.list('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('proj-1');
      expect(result[0].role).toBe('owner');
    });
  });

  describe('get', () => {
    it('should return null for non-existent project', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

      const result = await service.get('nonexistent', 'user-123');

      expect(result).toBeNull();
    });

    it('should return project for owner', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'user-123',
        title: 'Test',
        data: { objects: [] },
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: false,
        shareToken: null,
        collaborators: [],
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as never);

      const result = await service.get('proj-1', 'user-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('proj-1');
      expect(result?.role).toBe('owner');
    });

    it('should deny access to non-owner without collaboration', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'other-user',
        title: 'Test',
        data: {},
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: false,
        shareToken: null,
        collaborators: [],
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as never);

      const result = await service.get('proj-1', 'user-123');

      expect(result).toBeNull();
    });

    it('should deny ID-only access to a shared project', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'other-user',
        title: 'Test',
        data: {},
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: true,
        shareToken: 'abc123',
        collaborators: [],
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as never);

      const result = await service.get('proj-1', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new project', async () => {
      const mockCreated = {
        id: 'new-proj',
        userId: 'user-123',
        title: 'New Project',
        data: { objects: [] },
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: false,
        shareToken: null,
        collaborators: [],
      };

      vi.mocked(prisma.project.create).mockResolvedValue(mockCreated as never);

      const result = await service.create('user-123', 'New Project', { objects: [] });

      expect(result.id).toBe('new-proj');
      expect(result.title).toBe('New Project');
      expect(result.role).toBe('owner');
    });
  });

  describe('delete', () => {
    it('should delete project for owner', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'user-123',
        title: 'Test',
        data: {},
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: false,
        shareToken: null,
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.project.delete).mockResolvedValue(mockProject as never);

      const result = await service.delete('proj-1', 'user-123');

      expect(result).toBe(true);
      expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'proj-1' } });
    });

    it('should not delete project for non-owner', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'other-user',
        title: 'Test',
        data: {},
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: false,
        shareToken: null,
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as never);

      const result = await service.delete('proj-1', 'user-123');

      expect(result).toBe(false);
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });
  });

  describe('shareProject', () => {
    it('should generate share token for owner', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'user-123',
        title: 'Test',
        data: {},
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: false,
        shareToken: null,
      };

      const updatedProject = {
        ...mockProject,
        shared: true,
        shareToken: 'generated-token',
        collaborators: [],
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.project.update).mockResolvedValue(updatedProject as never);

      const result = await service.shareProject('proj-1', 'user-123');

      expect(result).not.toBeNull();
      expect(result?.shared).toBe(true);
      expect(result?.shareToken).toBeTruthy();
    });

    it('should not share project for non-owner', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'other-user',
        title: 'Test',
        data: {},
        updatedAt: new Date(),
        createdAt: new Date(),
        shared: false,
        shareToken: null,
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as never);

      const result = await service.shareProject('proj-1', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('folders', () => {
    it('should list folders for user', async () => {
      const mockFolders = [
        {
          id: 'folder-1',
          userId: 'user-123',
          name: 'Designs',
          color: '#3b82f6',
          parentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { projects: 5 },
        },
      ];

      vi.mocked(prisma.folder.findMany).mockResolvedValue(mockFolders as never);

      const result = await service.listFolders('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Designs');
      expect(result[0].projectCount).toBe(5);
    });

    it('should create a folder', async () => {
      const mockFolder = {
        id: 'new-folder',
        userId: 'user-123',
        name: 'New Folder',
        color: '#ff0000',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { projects: 0 },
      };

      vi.mocked(prisma.folder.create).mockResolvedValue(mockFolder as never);

      const result = await service.createFolder('user-123', 'New Folder', '#ff0000');

      expect(result.id).toBe('new-folder');
      expect(result.name).toBe('New Folder');
      expect(result.color).toBe('#ff0000');
    });

    it.each(['editor', 'viewer'])(
      'does not let a %s update or delete an owner folder',
      async (userId) => {
        vi.mocked(prisma.folder.findUnique).mockResolvedValue({
          id: 'folder-1',
          userId: 'owner',
        } as never);

        await expect(service.updateFolder('folder-1', userId, 'Renamed')).resolves.toBeNull();
        await expect(service.deleteFolder('folder-1', userId)).resolves.toBe(false);
        expect(prisma.folder.update).not.toHaveBeenCalled();
        expect(prisma.folder.delete).not.toHaveBeenCalled();
      },
    );
  });

  describe('collaborator management', () => {
    it.each(['editor', 'viewer'])('does not let a %s manage collaborators', async (userId) => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-1',
        userId: 'owner',
      } as never);

      await expect(service.addCollaborator('proj-1', userId, 'new-user')).resolves.toBe(false);
      await expect(service.removeCollaborator('proj-1', userId, 'editor')).resolves.toBe(false);
      await expect(service.getCollaborators('proj-1', userId)).resolves.toEqual([]);
      expect(prisma.projectCollaborator.upsert).not.toHaveBeenCalled();
      expect(prisma.projectCollaborator.deleteMany).not.toHaveBeenCalled();
    });
  });
});
