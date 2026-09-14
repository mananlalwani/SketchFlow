import { randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import { collaborationCommitSchema } from '../validation/project.js';
import type { JsonValue } from '@sketchflow/shared';
import {
  CollaborationOperationKind as PrismaCollaborationOperationKind,
  Prisma,
} from '@prisma/client';

import {
  applyCollaborationToDocument,
} from '../lib/collaborationDocument.js';
import { accessAllows, membershipRole } from '../lib/projectAccess.js';
import {
  collaborationReceiptHash,
  PROJECT_HISTORY_RETENTION,
  projectContentHash,
  recordHistorySnapshot,
} from '../lib/projectHistory.js';

export { PROJECT_HISTORY_RETENTION } from '../lib/projectHistory.js';
export type {
  CollaborationCommitInput,
  CollaborationCommitKind,
  CollaborationCommitResult,
  ProjectHistorySnapshotRecord,
  ProjectRestoreResult,
  ProjectRecord,
  PublicProjectRecord,
} from './projectServiceTypes.js';
import type {
  CollaborationCommitInput,
  CollaborationCommitKind,
  CollaborationCommitResult,
  ProjectHistorySnapshotRecord,
  ProjectRestoreResult,
  ProjectRecord,
} from './projectServiceTypes.js';

const prismaCollaborationOperationKind = {
  'replace-project': PrismaCollaborationOperationKind.replaceProject,
  'upsert-object': PrismaCollaborationOperationKind.upsertObject,
  'delete-object': PrismaCollaborationOperationKind.deleteObject,
  batch: PrismaCollaborationOperationKind.batch,
} as const satisfies Record<CollaborationCommitKind, PrismaCollaborationOperationKind>;

const MAX_OBJECT_REBASE_ATTEMPTS = 3;

export class ProjectService {
  public constructor(
    private readonly database: typeof prisma = prisma,
    private readonly log: Pick<typeof logger, 'debug' | 'info' | 'warn' | 'error'> = logger,
  ) {}

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
      this.database.$transaction(async (tx) => {
        const existingOperation = await tx.collaborationOperation.findUnique({
          where: {
            projectId_operationId: {
              projectId: input.projectId,
              operationId: input.operationId,
            },
          },
        });
        if (existingOperation) {
          if (existingOperation.receiptHash !== receiptHash) {
            return { status: 'invalid' as const, operationId: input.operationId };
          }
          const canonical = await tx.project.findUnique({
            where: { id: input.projectId },
            select: { data: true, title: true },
          });
          return {
            status: 'duplicate' as const,
            operationId: input.operationId,
            revision: existingOperation.revision,
            data: canonical?.data,
            title: canonical?.title,
          };
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

        const data = applyCollaborationToDocument(project.data, input.kind, input.data);
        if (!data) return { status: 'invalid' as const, operationId: input.operationId };

        // Object operations mutate only their object payload. Carrying a stale
        // client title through these operations would revert a concurrent title
        // edit that was already accepted at a later revision.
        const title =
          input.kind === 'replace-project' ? (input.title?.trim() ?? project.title) : project.title;
        const updated = await tx.project.updateMany({
          where: { id: input.projectId, revision: project.revision },
          data: {
            title,
            // SAFETY: `data` is produced by the canonical Zod JSON-object schemas above.
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
            if (concurrentOperation.receiptHash !== receiptHash) {
              return { status: 'invalid' as const, operationId: input.operationId };
            }
            const canonical = await tx.project.findUnique({
              where: { id: input.projectId },
              select: { data: true, title: true },
            });
            return {
              status: 'duplicate' as const,
              operationId: input.operationId,
              revision: concurrentOperation.revision,
              data: canonical?.data,
              title: canonical?.title,
            };
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
            kind: prismaCollaborationOperationKind[input.kind],
            receiptHash,
          },
        });
        await recordHistorySnapshot(tx, input.projectId, revision, title, data);

        return {
          status: 'applied' as const,
          operationId: input.operationId,
          revision,
          data,
          title,
        };
      });

    try {
      let lastResult: CollaborationCommitResult | undefined;
      for (let attempt = 0; attempt < MAX_OBJECT_REBASE_ATTEMPTS; attempt += 1) {
        const result = await commit();
        lastResult = result;
        if (result.status !== 'conflict' || input.kind === 'replace-project') return result;
      }
      return lastResult!;
    } catch (error) {
      // A concurrent identical operation can race its first receipt lookup. The
      // unique receipt index makes the winner durable; resolve the loser as a
      // duplicate only when its complete canonical payload matches.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingOperation = await this.database.collaborationOperation.findUnique({
          where: {
            projectId_operationId: {
              projectId: input.projectId,
              operationId: input.operationId,
            },
          },
        });
        if (existingOperation) {
          if (existingOperation.receiptHash !== receiptHash) {
            return { status: 'invalid', operationId: input.operationId };
          }
          const canonical = await this.database.project.findUnique({
            where: { id: input.projectId },
            select: { data: true, title: true },
          });
          return {
            status: 'duplicate',
            operationId: input.operationId,
            revision: existingOperation.revision,
            data: canonical?.data,
            title: canonical?.title,
          };
        }
      }
      this.log.error('Failed to commit canonical collaboration operation', error);
      throw error;
    }
  }

  public async listHistory(
    projectId: string,
    userId: string,
  ): Promise<ProjectHistorySnapshotRecord[] | null> {
    try {
      const allowed = await this.checkPermission(projectId, userId, 'view');
      if (!allowed) return null;
      const snapshots = await this.database.projectHistorySnapshot.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: PROJECT_HISTORY_RETENTION,
      });
      return snapshots.map((snapshot) => ({
        id: snapshot.id,
        revision: snapshot.revision,
        title: snapshot.title,
        contentHash: snapshot.contentHash,
        createdAt: snapshot.createdAt.getTime(),
      }));
    } catch (error) {
      this.log.error('Failed to list project history', error);
      throw error;
    }
  }

  public async restoreHistory(
    projectId: string,
    userId: string,
    snapshotId: string,
    expectedRevision: number,
  ): Promise<ProjectRestoreResult> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return { status: 'invalid' };
    }
    return this.database.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: { collaborators: { select: { userId: true, role: true } } },
      });
      if (!project) return { status: 'not_found' as const };
      const collaborator = project.collaborators.find((entry) => entry.userId === userId);
      if (project.userId !== userId && collaborator?.role !== 'editor') {
        return { status: 'forbidden' as const };
      }
      if (project.revision !== expectedRevision) {
        return { status: 'conflict' as const, currentRevision: project.revision };
      }
      const snapshot = await tx.projectHistorySnapshot.findFirst({
        where: { id: snapshotId, projectId },
      });
      if (!snapshot) return { status: 'not_found' as const };

      await recordHistorySnapshot(tx, projectId, project.revision, project.title, project.data);
      const updated = await tx.project.updateMany({
        where: { id: projectId, revision: expectedRevision },
        data: {
          title: snapshot.title,
          // SAFETY: History snapshots come from the JSON value stored for this project.
          data: snapshot.data as object,
          revision: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const current = await tx.project.findUnique({ where: { id: projectId } });
        return current
          ? { status: 'conflict' as const, currentRevision: current.revision }
          : { status: 'not_found' as const };
      }
      const revision = expectedRevision + 1;
      const operationId = `history_restore_${randomBytes(16).toString('hex')}`;
      await tx.collaborationOperation.create({
        data: {
          projectId,
          operationId,
          actorUserId: userId,
          revision,
          kind: PrismaCollaborationOperationKind.replaceProject,
          receiptHash: projectContentHash(snapshot.title, snapshot.data),
        },
      });
      await recordHistorySnapshot(tx, projectId, revision, snapshot.title, snapshot.data);
      return {
        status: 'applied' as const,
        operationId,
        revision,
        data: snapshot.data,
        title: snapshot.title,
      };
    });
  }

  // Permission checking helper
  public async checkPermission(
    projectId: string,
    userId: string,
    action: 'view' | 'edit' | 'delete' | 'share' | 'manage',
  ): Promise<boolean> {
    try {
      const project = await this.database.project.findUnique({
        where: { id: projectId },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      if (!project) return false;

      const collaborator = project.collaborators.find((c) => c.userId === userId);
      return accessAllows(action, {
        isOwner: project.userId === userId,
        collaboratorRole: collaborator?.role,
      });
    } catch (e) {
      this.log.error('Permission check failed', e);
      throw e;
    }
  }

  public async list(userId: string): Promise<Omit<ProjectRecord, 'data'>[]> {
    try {
      const projectSelect = {
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
      } as const;

      const ownedProjects = await this.database.project.findMany({
        where: { userId },
        select: projectSelect,
        orderBy: { updatedAt: 'desc' },
      });

      const collaboratedProjects = await this.database.project.findMany({
        where: {
          collaborators: {
            some: { userId },
          },
        },
        select: projectSelect,
        orderBy: { updatedAt: 'desc' },
      });

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
          const role = membershipRole(p.userId, userId, collab?.role);

          // Debug log if there's a mismatch
          if (isOwner && collab) {
            this.log.warn(
              `User ${userId} is both owner and collaborator of project ${p.id}. This shouldn't happen!`,
              {
                projectId: p.id,
                projectUserId: p.userId,
                collaboratorRole: collab.role,
              },
            );
          }

          const record: Omit<ProjectRecord, 'data'> = {
            id: p.id,
            userId: p.userId,
            title: p.title,
            updatedAt: p.updatedAt.getTime(),
            createdAt: p.createdAt.getTime(),
            shared: p.shared,
            folderId: p.folderId ?? null,
            role,
            collaborators: p.collaborators,
          };
          if (isOwner && p.shareToken) record.shareToken = p.shareToken;
          return record;
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      this.log.error('Failed to list projects', e);
      return [];
    }
  }

  public async get(id: string, userId: string): Promise<ProjectRecord | null> {
    try {
      const project = await this.database.project.findUnique({
        where: { id },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      if (!project) return null;

      const collaborators = project.collaborators;
      const isOwner = project.userId === userId;
      const collaborator = collaborators.find((c) => c.userId === userId);
      if (!accessAllows('view', { isOwner, collaboratorRole: collaborator?.role })) {
        return null;
      }

      const role = membershipRole(project.userId, userId, collaborator?.role);

      const record: ProjectRecord = {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        revision: project.revision,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        role,
        collaborators,
      };
      if (isOwner && project.shareToken) record.shareToken = project.shareToken;
      return record;
    } catch (e) {
      this.log.error('Failed to get project', e);
      return null;
    }
  }

  public async create(userId: string, title: string, data: JsonValue): Promise<ProjectRecord> {
    try {
      const project = await this.database.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            userId,
            title: title || 'Untitled',
            // SAFETY: Callers supply the shared recursive JSON wire contract.
            data: data as object,
            shared: false,
          },
          include: {
            collaborators: {
              select: { userId: true, role: true },
            },
          },
        });
        await recordHistorySnapshot(tx, created.id, created.revision, created.title, created.data);
        return created;
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
      this.log.error('Failed to create project', e);
      throw e;
    }
  }

  public async delete(id: string, userId: string): Promise<boolean> {
    try {
      const existing = await this.database.project.findUnique({
        where: { id },
      });

      if (!existing) return false;

      // Only owner can delete
      if (existing.userId !== userId) {
        return false;
      }

      await this.database.project.delete({
        where: { id },
      });

      return true;
    } catch (e) {
      this.log.error('Failed to delete project', e);
      return false;
    }
  }

}
