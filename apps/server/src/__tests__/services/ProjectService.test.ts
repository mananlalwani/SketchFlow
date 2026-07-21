import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from '../../services/ProjectService.js';

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    projectCollaborator: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    collaborationSnapshot: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    folder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

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

  describe('collaboration snapshots', () => {
    it('persists and reloads a snapshot across service instances', async () => {
      const snapshot = { dataUrl: 'data:image/png;base64,recovery', timestamp: 1 };
      vi.mocked(prisma.collaborationSnapshot.upsert).mockResolvedValue({} as never);
      vi.mocked(prisma.collaborationSnapshot.findUnique).mockResolvedValue({
        projectId: 'proj-1',
        data: snapshot,
        updatedAt: new Date(),
      } as never);

      await expect(service.saveCollaborationSnapshot('proj-1', snapshot)).resolves.toBeUndefined();
      await expect(new ProjectService().getCollaborationSnapshot('proj-1')).resolves.toEqual(
        snapshot,
      );
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
  });
});
