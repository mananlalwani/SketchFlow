import { randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import type { CanvasSnapshot } from '../types/socket.js';

export interface ProjectRecord {
  id: string;
  userId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  data: unknown;
  revision?: number;
  shared?: boolean;
  shareToken?: string;
  shareExpiresAt?: number;
  folderId?: string | null;
  role?: 'owner' | 'editor' | 'viewer';
  collaborators?: { userId: string; role: string }[];
}

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

export class ProjectService {
  public async saveCollaborationSnapshot(
    projectId: string,
    snapshot: CanvasSnapshot,
  ): Promise<void> {
    await prisma.collaborationSnapshot.upsert({
      where: { projectId },
      create: { projectId, data: snapshot as object },
      update: { data: snapshot as object },
    });
  }

  public async getCollaborationSnapshot(projectId: string): Promise<CanvasSnapshot | null> {
    const snapshot = await prisma.collaborationSnapshot.findUnique({ where: { projectId } });
    return snapshot ? (snapshot.data as unknown as CanvasSnapshot) : null;
  }
  // Permission checking helper
  public async checkPermission(
    projectId: string,
    userId: string,
    action: 'view' | 'edit' | 'delete' | 'share' | 'manage',
  ): Promise<boolean> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      if (!project) return false;

      const isOwner = project.userId === userId;
      const collaborator = project.collaborators.find((c) => c.userId === userId);
      // const role = isOwner ? 'owner' : (collaborator?.role || null);

      switch (action) {
        case 'view':
          return isOwner || !!collaborator;

        case 'edit':
          return isOwner || collaborator?.role === 'editor';

        case 'delete':
        case 'share':
        case 'manage':
          return isOwner;

        default:
          return false;
      }
    } catch (e) {
      logger.error('Permission check failed', e);
      return false;
    }
  }

  public async list(userId: string): Promise<Omit<ProjectRecord, 'data'>[]> {
    try {
      // Define the type for project results
      type ProjectWithCollaborators = {
        id: string;
        userId: string;
        title: string;
        updatedAt: Date;
        createdAt: Date;
        shared: boolean;
        shareToken: string | null;
        folderId: string | null;
        collaborators: { userId: string; role: string }[];
      };

      // Try with collaborators first
      let ownedProjects: ProjectWithCollaborators[] = [];
      let collaboratedProjects: ProjectWithCollaborators[] = [];

      try {
        // Get projects owned by user
        ownedProjects = await prisma.project.findMany({
          where: { userId },
          select: {
            id: true,
            userId: true,
            title: true,
            updatedAt: true,
            createdAt: true,
            shared: true,
            shareToken: true,
            folderId: true,
            collaborators: {
              select: { userId: true, role: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
        });

        // Get projects where user is a collaborator
        collaboratedProjects = await prisma.project.findMany({
          where: {
            collaborators: {
              some: { userId },
            },
          },
          select: {
            id: true,
            userId: true,
            title: true,
            updatedAt: true,
            createdAt: true,
            shared: true,
            shareToken: true,
            folderId: true,
            collaborators: {
              select: { userId: true, role: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
        });
      } catch (e: unknown) {
        // Collaborators table might not exist yet - fallback to simple query
        logger.warn('Collaborators query failed, falling back to simple query', {
          error: e instanceof Error ? e.message : String(e),
        });
        const projects = await prisma.project.findMany({
          where: { userId },
          select: {
            id: true,
            userId: true,
            title: true,
            updatedAt: true,
            createdAt: true,
            shared: true,
            shareToken: true,
          },
          orderBy: { updatedAt: 'desc' },
        });

        return projects.map((p) => ({
          id: p.id,
          userId: p.userId,
          title: p.title,
          updatedAt: p.updatedAt.getTime(),
          createdAt: p.createdAt.getTime(),
          shared: p.shared,
          shareToken: p.shareToken ?? undefined,
          role: 'owner' as const,
          collaborators: [],
        }));
      }

      // Combine and dedupe (in case user is both owner and collaborator somehow)
      const allProjects = [...ownedProjects, ...collaboratedProjects];
      const seen = new Set<string>();
      const deduped = allProjects.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      return deduped
        .map((p) => {
          const isOwner = p.userId === userId;
          const collab = p.collaborators.find(
            (c: { userId: string; role: string }) => c.userId === userId,
          );
          const role: 'owner' | 'editor' | 'viewer' = isOwner
            ? 'owner'
            : (collab?.role as 'editor' | 'viewer') || 'viewer';

          // Debug log if there's a mismatch
          if (isOwner && collab) {
            logger.warn(
              `User ${userId} is both owner and collaborator of project ${p.id}. This shouldn't happen!`,
              {
                projectId: p.id,
                projectUserId: p.userId,
                collaboratorRole: collab.role,
              },
            );
          }

          return {
            id: p.id,
            userId: p.userId,
            title: p.title,
            updatedAt: p.updatedAt.getTime(),
            createdAt: p.createdAt.getTime(),
            shared: p.shared,
            shareToken: p.shareToken ?? undefined,
            folderId: p.folderId ?? null,
            role,
            collaborators: p.collaborators,
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      logger.error('Failed to list projects', e);
      return [];
    }
  }

  public async get(id: string, userId?: string): Promise<ProjectRecord | null> {
    try {
      let project;
      let collaborators: { userId: string; role: string }[] = [];

      try {
        project = await prisma.project.findUnique({
          where: { id },
          include: {
            collaborators: {
              select: { userId: true, role: true },
            },
          },
        });
        collaborators = project?.collaborators || [];
      } catch {
        // Fallback if collaborators table doesn't exist
        project = await prisma.project.findUnique({
          where: { id },
        });
      }

      if (!project) return null;

      // Public projects are accessed exclusively through getByShareToken.
      const isOwner = project.userId === userId;
      const collaborator = collaborators.find((c) => c.userId === userId);
      const hasAccess = isOwner || collaborator;

      if (userId && !hasAccess) {
        return null;
      }

      const role = isOwner ? 'owner' : (collaborator?.role as 'editor' | 'viewer') || 'viewer';

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        role,
        collaborators,
      };
    } catch (e) {
      logger.error('Failed to get project', e);
      return null;
    }
  }

  public async getByShareToken(shareToken: string): Promise<ProjectRecord | null> {
    try {
      const project = await prisma.project.findUnique({
        where: { shareToken },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      if (
        !project ||
        !project.shared ||
        project.shareRevokedAt ||
        (project.shareExpiresAt && project.shareExpiresAt <= new Date())
      )
        return null;

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        shareExpiresAt: project.shareExpiresAt?.getTime(),
        role: 'viewer',
        collaborators: project.collaborators,
      };
    } catch (e) {
      logger.error('Failed to get project by share token', e);
      return null;
    }
  }

  public async save(
    id: string,
    userId: string,
    title: string,
    data: unknown,
    expectedRevision?: number,
  ): Promise<ProjectRecord> {
    try {
      let existing;

      try {
        existing = await prisma.project.findUnique({
          where: { id },
        });
      } catch {
        // Fallback if collaborators table doesn't exist
        existing = await prisma.project.findUnique({
          where: { id },
        });
      }

      // Check if user can edit using permission helper
      if (existing) {
        const canEdit = await this.checkPermission(id, userId, 'edit');
        if (!canEdit) {
          const forbidden = new Error('No permission to edit this project');
          forbidden.name = 'ProjectAccessError';
          throw forbidden;
        }
        if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
          const conflict = new Error('Project revision conflict');
          conflict.name = 'ProjectConflictError';
          throw conflict;
        }
      }

      let project;
      let resultCollaborators: { userId: string; role: string }[] = [];

      try {
        if (existing && expectedRevision !== undefined) {
          const updated = await prisma.project.updateMany({
            where: { id, userId, revision: expectedRevision },
            data: {
              title,
              data: data as object,
              revision: { increment: 1 },
              updatedAt: new Date(),
            },
          });
          if (updated.count !== 1) {
            const conflict = new Error('Project revision conflict');
            conflict.name = 'ProjectConflictError';
            throw conflict;
          }
          project = await prisma.project.findUnique({
            where: { id },
            include: { collaborators: { select: { userId: true, role: true } } },
          });
          if (!project) throw new Error('Project disappeared during save');
        } else {
          project = await prisma.project.upsert({
            where: { id },
            create: {
              id,
              userId,
              title,
              data: data as object,
              shared: false,
            },
            update: {
              title,
              data: data as object,
              revision: { increment: 1 },
              updatedAt: new Date(),
            },
            include: {
              collaborators: {
                select: { userId: true, role: true },
              },
            },
          });
        }
        resultCollaborators = project.collaborators || [];
      } catch {
        // Fallback if collaborators table doesn't exist
        project = await prisma.project.upsert({
          where: { id },
          create: {
            id,
            userId,
            title,
            data: data as object,
            shared: false,
          },
          update: {
            title,
            data: data as object,
            updatedAt: new Date(),
          },
        });
      }

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        revision: project.revision,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        collaborators: resultCollaborators,
      };
    } catch (e) {
      logger.error('Failed to save project', e);
      throw e;
    }
  }

  public async shareProject(id: string, userId: string): Promise<ProjectRecord | null> {
    try {
      const existing = await prisma.project.findUnique({
        where: { id },
      });

      if (!existing || existing.userId !== userId) {
        return null;
      }

      const shareToken = randomBytes(32).toString('base64url');
      const shareExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const project = await prisma.project.update({
        where: { id },
        data: {
          shared: true,
          shareToken,
          shareExpiresAt,
          shareRevokedAt: null,
        },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        shareExpiresAt: project.shareExpiresAt?.getTime(),
        collaborators: project.collaborators,
      };
    } catch (e) {
      logger.error('Failed to share project', e);
      return null;
    }
  }

  public async unshareProject(id: string, userId: string): Promise<ProjectRecord | null> {
    try {
      const existing = await prisma.project.findUnique({
        where: { id },
      });

      if (!existing || existing.userId !== userId) {
        return null;
      }

      const project = await prisma.project.update({
        where: { id },
        data: {
          shared: false,
          shareToken: null,
          shareRevokedAt: new Date(),
        },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        shareExpiresAt: project.shareExpiresAt?.getTime(),
        collaborators: project.collaborators,
      };
    } catch (e) {
      logger.error('Failed to unshare project', e);
      return null;
    }
  }

  public async addCollaborator(
    projectId: string,
    ownerUserId: string,
    collaboratorUserId: string,
    role: 'editor' | 'viewer' = 'editor',
  ): Promise<boolean> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== ownerUserId) {
        logger.warn(`Failed to add collaborator: project not found or not owner`, {
          projectId,
          ownerUserId,
          projectUserId: project?.userId,
        });
        return false;
      }

      // Can't add owner as collaborator
      if (collaboratorUserId === ownerUserId) {
        logger.warn(`Attempted to add owner as collaborator`, {
          projectId,
          userId: ownerUserId,
        });
        return false;
      }

      // Extra safety: Check if collaborator is somehow the project owner
      if (collaboratorUserId === project.userId) {
        logger.warn(`Collaborator userId matches project owner`, {
          projectId,
          collaboratorUserId,
          projectUserId: project.userId,
        });
        return false;
      }

      await prisma.projectCollaborator.upsert({
        where: {
          projectId_userId: {
            projectId,
            userId: collaboratorUserId,
          },
        },
        create: {
          projectId,
          userId: collaboratorUserId,
          role,
        },
        update: {
          role,
        },
      });

      logger.info(
        `Added collaborator ${collaboratorUserId} with role ${role} to project ${projectId}`,
      );

      return true;
    } catch (e) {
      logger.error('Failed to add collaborator', e);
      return false;
    }
  }

  /**
   * Clean up any corrupt data where owners are listed as collaborators
   */
  public async cleanupCorruptCollaborators(): Promise<void> {
    try {
      const projects = await prisma.project.findMany({
        include: {
          collaborators: true,
        },
      });

      for (const project of projects) {
        const ownerAsCollaborator = project.collaborators.find((c) => c.userId === project.userId);
        if (ownerAsCollaborator) {
          logger.warn(`Found owner as collaborator in project ${project.id}, cleaning up...`);
          await prisma.projectCollaborator.delete({
            where: {
              id: ownerAsCollaborator.id,
            },
          });
        }
      }
    } catch (e) {
      logger.error('Failed to cleanup corrupt collaborators', e);
    }
  }

  public async removeCollaborator(
    projectId: string,
    ownerUserId: string,
    collaboratorUserId: string,
  ): Promise<boolean> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== ownerUserId) {
        return false;
      }

      await prisma.projectCollaborator.deleteMany({
        where: {
          projectId,
          userId: collaboratorUserId,
        },
      });

      return true;
    } catch (e) {
      logger.error('Failed to remove collaborator', e);
      return false;
    }
  }

  public async getCollaborators(
    projectId: string,
    userId: string,
  ): Promise<{ userId: string; role: string }[]> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { collaborators: true },
      });

      if (!project) return [];

      // Only owner can view full collaborator list
      if (project.userId !== userId) {
        return [];
      }

      return project.collaborators.map((c) => ({ userId: c.userId, role: c.role }));
    } catch (e) {
      logger.error('Failed to get collaborators', e);
      return [];
    }
  }

  public async create(userId: string, title: string, data: unknown): Promise<ProjectRecord> {
    try {
      const project = await prisma.project.create({
        data: {
          userId,
          title: title || 'Untitled',
          data: data as object,
          shared: false,
        },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        role: 'owner',
        collaborators: project.collaborators,
      };
    } catch (e) {
      logger.error('Failed to create project', e);
      throw e;
    }
  }

  public async delete(id: string, userId: string): Promise<boolean> {
    try {
      const existing = await prisma.project.findUnique({
        where: { id },
      });

      if (!existing) return false;

      // Only owner can delete
      if (existing.userId !== userId) {
        return false;
      }

      await prisma.project.delete({
        where: { id },
      });

      return true;
    } catch (e) {
      logger.error('Failed to delete project', e);
      return false;
    }
  }

  // Folder methods
  public async listFolders(userId: string): Promise<FolderRecord[]> {
    try {
      const folders = await prisma.folder.findMany({
        where: { userId },
        include: {
          _count: {
            select: { projects: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      return folders.map((f) => ({
        id: f.id,
        userId: f.userId,
        name: f.name,
        color: f.color || '#3b82f6',
        parentId: f.parentId,
        createdAt: f.createdAt.getTime(),
        updatedAt: f.updatedAt.getTime(),
        projectCount: f._count.projects,
      }));
    } catch (e) {
      logger.error('Failed to list folders', e);
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
        const parent = await prisma.folder.findFirst({ where: { id: parentId, userId } });
        if (!parent) throw new Error('Parent folder not found');
      }
      const folder = await prisma.folder.create({
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
    } catch (e) {
      logger.error('Failed to create folder', e);
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
      const existing = await prisma.folder.findUnique({
        where: { id },
      });

      if (!existing || existing.userId !== userId) {
        return null;
      }

      if (parentId) {
        if (parentId === id) return null;
        const parent = await prisma.folder.findFirst({ where: { id: parentId, userId } });
        if (!parent) return null;
      }

      const folder = await prisma.folder.update({
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
    } catch (e) {
      logger.error('Failed to update folder', e);
      return null;
    }
  }

  public async deleteFolder(id: string, userId: string): Promise<boolean> {
    try {
      const existing = await prisma.folder.findUnique({
        where: { id },
      });

      if (!existing || existing.userId !== userId) {
        return false;
      }

      // Delete folder (projects will have folderId set to null due to onDelete: SetNull)
      await prisma.folder.delete({
        where: { id },
      });

      return true;
    } catch (e) {
      logger.error('Failed to delete folder', e);
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
        const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
        if (!folder) return false;
      }
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== userId) {
        return false;
      }

      // Verify folder exists and belongs to user (if not null)
      if (folderId) {
        const folder = await prisma.folder.findUnique({
          where: { id: folderId },
        });
        if (!folder || folder.userId !== userId) {
          return false;
        }
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { folderId },
      });

      return true;
    } catch (e) {
      logger.error('Failed to move project to folder', e);
      return false;
    }
  }
}
