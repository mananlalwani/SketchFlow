import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FolderService } from '../../services/FolderService.js';

vi.mock('../../lib/prisma.js', () => {
  const project = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const folder = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    prisma: {
      project,
      folder,
      $transaction: vi.fn((callback) => callback({ folder })),
    },
  };
});

import { prisma } from '../../lib/prisma.js';

describe('FolderService', () => {
  let service: FolderService;

  beforeEach(() => {
    service = new FolderService();
    vi.clearAllMocks();
  });

  it('lists folders for a user', async () => {
    vi.mocked(prisma.folder.findMany).mockResolvedValue([
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
    ] as never);

    const result = await service.listFolders('user-123');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Designs');
    expect(result[0].projectCount).toBe(5);
  });

  it('creates a folder', async () => {
    vi.mocked(prisma.folder.create).mockResolvedValue({
      id: 'new-folder',
      userId: 'user-123',
      name: 'New Folder',
      color: '#ff0000',
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { projects: 0 },
    } as never);

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

  it('rejects moving a folder beneath one of its descendants', async () => {
    vi.mocked(prisma.folder.findUnique)
      .mockResolvedValueOnce({ id: 'parent', userId: 'user-123', parentId: null } as never)
      .mockResolvedValueOnce({ id: 'child', userId: 'user-123', parentId: 'parent' } as never);

    await expect(
      service.updateFolder('parent', 'user-123', undefined, undefined, 'child'),
    ).resolves.toBeNull();
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });
});
