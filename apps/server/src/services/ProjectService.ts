import { createHash, randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import { collaborationCommitSchema } from '../validation/project.js';

export type CollaborationCommitKind = 'replace-project' | 'upsert-object' | 'delete-object' | 'batch';

export interface CollaborationCommitInput {
  projectId: string;
  userId: string;
  operationId: string;
  expectedRevision: number;
  data: unknown;
  title?: string;
  kind: CollaborationCommitKind;
}

export type CollaborationCommitResult =
  | {
      status: 'applied';
      operationId: string;
      revision: number;
      data: unknown;
      title: string;
    }
  | {
      status: 'duplicate';
      operationId: string;
      revision: number;
    }
  | {
      status: 'conflict';
      operationId: string;
      currentRevision: number;
    }
  | { status: 'forbidden' | 'not_found' | 'invalid'; operationId: string };

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

function collaborationReceiptHash(input: CollaborationCommitInput): string {
  return createHash('sha256')
    .update(
      stableSerialize({
        projectId: input.projectId,
        userId: input.userId,
        operationId: input.operationId,
        expectedRevision: input.expectedRevision,
        data: input.data,
        kind: input.kind,
        title: input.title ?? null,
      }),
    )
    .digest('hex');
}

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

type CanonicalDocument = Record<string, unknown> & { objects: Array<Record<string, unknown>> };

function asCanonicalDocument(data: unknown): CanonicalDocument | null {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const document = data as Record<string, unknown>;
  if (!Array.isArray(document.objects)) return null;
  if (!document.objects.every((item) => item && typeof item === 'object' && !Array.isArray(item)))
    return null;
  return { ...document, objects: document.objects as Array<Record<string, unknown>> };
}

function applyObjectOperation(
  currentData: unknown,
  kind: Exclude<CollaborationCommitKind, 'replace-project' | 'batch'>,
  payload: unknown,
): CanonicalDocument | null {
  const document = asCanonicalDocument(currentData);
  if (!document || !payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const input = payload as Record<string, unknown>;

  if (kind === 'upsert-object') {
    const object = input.object;
    if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
    const id = (object as { id?: unknown }).id;
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) return null;
    const nextObject = object as Record<string, unknown>;
    const index = document.objects.findIndex((entry) => entry.id === id);
    const objects = [...document.objects];
    if (index === -1) objects.push(nextObject);
    else objects[index] = nextObject;
    return { ...document, objects };
  }

  const id = input.id;
  if (typeof id !== 'string' || id.length === 0 || id.length > 200) return null;
  return { ...document, objects: document.objects.filter((entry) => entry.id !== id) };
}

/** Applies a group atomically so undo/redo never falls back to a board snapshot. */
function applyBatchOperation(currentData: unknown, payload: unknown): CanonicalDocument | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const operations = (payload as { operations?: unknown }).operations;
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 100) return null;

  let data: CanonicalDocument | null = asCanonicalDocument(currentData);
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return null;
    const { kind, data: operationData } = operation as { kind?: unknown; data?: unknown };
    if (kind !== 'upsert-object' && kind !== 'delete-object') return null;
    data = applyObjectOperation(data, kind, operationData);
    if (!data) return null;
  }
  return data;
}

export class ProjectService {
  /**
   * Atomically applies a complete canonical project document. Project.data and
   * Project.revision are the durable state authority; the operation table only
   * supplies ordered, idempotent receipts for realtime clients.
   */
  public async commitCollaborationOperation(
    input: CollaborationCommitInput,
  ): Promise<CollaborationCommitResult> {
    if (
      !collaborationCommitSchema.safeParse({
        operationId: input.operationId,
        expectedRevision: input.expectedRevision,
        kind: input.kind,
        data: input.data,
      }).success ||
      (input.title !== undefined &&
        (input.title.trim().length < 1 || input.title.trim().length > 200))
    ) {
      return { status: 'invalid', operationId: input.operationId };
    }

    const receiptHash = collaborationReceiptHash(input);

    const commit = async (): Promise<CollaborationCommitResult> =>
      prisma.$transaction(async (tx) => {
        const existingOperation = await tx.collaborationOperation.findUnique({
          where: {
            projectId_operationId: {
              projectId: input.projectId,
              operationId: input.operationId,
            },
          },
        });
        if (existingOperation) {
          return existingOperation.receiptHash === receiptHash
            ? {
                status: 'duplicate' as const,
                operationId: input.operationId,
                revision: existingOperation.revision,
              }
            : { status: 'invalid' as const, operationId: input.operationId };
        }

        const project = await tx.project.findUnique({
          where: { id: input.projectId },
          include: { collaborators: { select: { userId: true, role: true } } },
        });
        if (!project) return { status: 'not_found' as const, operationId: input.operationId };

        const collaborator = project.collaborators.find((entry) => entry.userId === input.userId);
        if (project.userId !== input.userId && collaborator?.role !== 'editor') {
          return { status: 'forbidden' as const, operationId: input.operationId };
        }
        // Whole-document replacement must still use a matching base revision.
        // Object operations are commutative for distinct IDs, so they rebase on
        // the current canonical document instead of rejecting a stale client.
        if (input.kind === 'replace-project' && project.revision !== input.expectedRevision) {
          return {
            status: 'conflict' as const,
            operationId: input.operationId,
            currentRevision: project.revision,
          };
        }

        const data =
          input.kind === 'replace-project'
            ? input.data
            : input.kind === 'batch'
              ? applyBatchOperation(project.data, input.data)
              : applyObjectOperation(project.data, input.kind, input.data);
        if (!data) return { status: 'invalid' as const, operationId: input.operationId };

        const title = input.title?.trim() ?? project.title;
        const updated = await tx.project.updateMany({
          where: { id: input.projectId, revision: project.revision },
          data: {
            title,
            data: data as object,
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          // A matching operation may have committed after our initial receipt
          // read. Check again before classifying the lost CAS as a conflict.
          const concurrentOperation = await tx.collaborationOperation.findUnique({
            where: {
              projectId_operationId: {
                projectId: input.projectId,
                operationId: input.operationId,
              },
            },
          });
          if (concurrentOperation) {
            return concurrentOperation.receiptHash === receiptHash
              ? {
                  status: 'duplicate' as const,
                  operationId: input.operationId,
                  revision: concurrentOperation.revision,
                }
              : { status: 'invalid' as const, operationId: input.operationId };
          }

          const current = await tx.project.findUnique({ where: { id: input.projectId } });
          return current
            ? {
                status: 'conflict' as const,
                operationId: input.operationId,
                currentRevision: current.revision,
              }
            : { status: 'not_found' as const, operationId: input.operationId };
        }

        const revision = project.revision + 1;
        await tx.collaborationOperation.create({
          data: {
            projectId: input.projectId,
            operationId: input.operationId,
            actorUserId: input.userId,
            revision,
            kind: input.kind,
            receiptHash,
          },
        });

        return {
          status: 'applied' as const,
          operationId: input.operationId,
          revision,
          data,
          title,
        };
      });

    try {
      return await commit();
    } catch (error) {
      // A concurrent identical operation can race its first receipt lookup. The
      // unique receipt index makes the winner durable; resolve the loser as a
      // duplicate only when its complete canonical payload matches.
      if (this.isUniqueConstraintError(error)) {
        const existingOperation = await prisma.collaborationOperation.findUnique({
          where: {
            projectId_operationId: {
              projectId: input.projectId,
              operationId: input.operationId,
            },
          },
        });
        if (existingOperation) {
          return existingOperation.receiptHash === receiptHash
            ? {
                status: 'duplicate',
                operationId: input.operationId,
                revision: existingOperation.revision,
              }
            : { status: 'invalid', operationId: input.operationId };
        }
      }
      logger.error('Failed to commit canonical collaboration operation', error);
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
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
        revision: project.revision,
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
        revision: project.revision,
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
