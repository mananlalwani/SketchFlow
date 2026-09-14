import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

export interface FolderRecord {
  id: string;
  userId: string;
  name: string;
  color: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  projectCount?: number;
}

function toFolderRecord(folder: {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { projects: number };
}): FolderRecord {
  return {
    id: folder.id,
    userId: folder.userId,
    name: folder.name,
    color: folder.color || '#3b82f6',
    parentId: folder.parentId,
    createdAt: folder.createdAt.getTime(),
    updatedAt: folder.updatedAt.getTime(),
    projectCount: folder._count.projects,
  };
}

export class FolderService {
  public constructor(
    private readonly database: typeof prisma = prisma,
    private readonly log: Pick<typeof logger, 'debug' | 'info' | 'warn' | 'error'> = logger,
  ) {}

  public async listFolders(userId: string): Promise<FolderRecord[]> {
    try {
      const folders = await this.database.folder.findMany({
        where: { userId },
        include: {
          _count: {
            select: { projects: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      return folders.map(toFolderRecord);
    } catch (e) {
      this.log.error('Failed to list folders', e);
      return [];
    }
  }

  public async createFolder(
    userId: string,
    name: string,
    color?: string,
    parentId?: string | null,
  ): Promise<FolderRecord> {
    try {
      if (parentId) {
        const parent = await this.database.folder.findFirst({ where: { id: parentId, userId } });
        if (!parent) throw new Error('Parent folder not found');
      }
      const folder = await this.database.folder.create({
        data: {
          userId,
          name,
          color: color || '#3b82f6',
          parentId: parentId || null,
        },
        include: {
          _count: {
            select: { projects: true },
          },
        },
      });

      return toFolderRecord(folder);
    } catch (e) {
      this.log.error('Failed to create folder', e);
      throw e;
    }
  }

  public async updateFolder(
    id: string,
    userId: string,
    name?: string,
    color?: string,
    parentId?: string | null,
  ): Promise<FolderRecord | null> {
    try {
      const folder = await this.database.$transaction(
        async (tx) => {
          const existing = await tx.folder.findUnique({ where: { id } });
          if (!existing || existing.userId !== userId) return null;

          if (parentId) {
            const visited = new Set<string>();
            let ancestorId: string | null = parentId;
            while (ancestorId) {
              if (ancestorId === id || visited.has(ancestorId)) return null;
              visited.add(ancestorId);
              const ancestor: { userId: string; parentId: string | null } | null =
                await tx.folder.findUnique({
                  where: { id: ancestorId },
                  select: { userId: true, parentId: true },
                });
              if (!ancestor || ancestor.userId !== userId) return null;
              ancestorId = ancestor.parentId;
            }
          }

          return tx.folder.update({
            where: { id },
            data: {
              ...(name !== undefined && { name }),
              ...(color !== undefined && { color }),
              ...(parentId !== undefined && { parentId }),
            },
            include: {
              _count: {
                select: { projects: true },
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (!folder) return null;

      return toFolderRecord(folder);
    } catch (e) {
      this.log.error('Failed to update folder', e);
      return null;
    }
  }

  public async deleteFolder(id: string, userId: string): Promise<boolean> {
    try {
      const existing = await this.database.folder.findUnique({
        where: { id },
      });

      if (!existing || existing.userId !== userId) {
        return false;
      }

      await this.database.folder.delete({
        where: { id },
      });

      return true;
    } catch (e) {
      this.log.error('Failed to delete folder', e);
      return false;
    }
  }

  public async moveToFolder(
    projectId: string,
    userId: string,
    folderId: string | null,
  ): Promise<boolean> {
    try {
      if (folderId) {
        const folder = await this.database.folder.findFirst({ where: { id: folderId, userId } });
        if (!folder) return false;
      }
      const project = await this.database.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== userId) {
        return false;
      }

      await this.database.project.update({
        where: { id: projectId },
        data: { folderId },
      });

      return true;
    } catch (e) {
      this.log.error('Failed to move project to folder', e);
      return false;
    }
  }
}
