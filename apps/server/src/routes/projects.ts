import { randomUUID } from 'crypto';
import { z } from 'zod';
import type express from 'express';
import { clerkClient } from '@clerk/express';
import type { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env.js';
import { httpStatusForCollaboration } from '../lib/collaborationHttp.js';
import { logger } from '../utils/logger.js';
import { requireAuthenticatedUser } from '../middleware/auth.js';
import type { FolderService } from '../services/FolderService.js';
import type { ProjectCollaboratorService } from '../services/ProjectCollaboratorService.js';
import type { ProjectShareService } from '../services/ProjectShareService.js';
import type { ProjectService } from '../services/ProjectService.js';
import type { AuthenticatedRequest } from '../types/http.js';
import {
  collaboratorInputSchema,
  collaboratorUserIdSchema,
  moveProjectSchema,
  projectInputSchema,
  resourceIdSchema,
  shareTokenSchema,
} from '../validation/project.js';
import type { JsonValue } from '@sketchflow/shared';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/socket.js';

const projectConflictSchema = z.object({ currentRevision: z.number().optional() });

type ProjectIo = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface ProjectRouteDeps {
  projects: ProjectService;
  folders: FolderService;
  shares: ProjectShareService;
  collaborators: ProjectCollaboratorService;
  io: ProjectIo;
  evictProjectUser: (projectId: string, userId: string) => Promise<void>;
}

function emitApplied(
  io: ProjectIo,
  projectId: string,
  payload: {
    operationId: string;
    revision: number;
    kind: 'replace-project';
    data: JsonValue;
    title: string;
  },
): void {
  io.to(projectId).emit('collaboration:applied', { projectId, ...payload });
}

/** Owns project/share/collaborator HTTP and maps collaboration results to status codes. */
export function registerProjectRoutes(app: express.Express, deps: ProjectRouteDeps): void {
  const { projects, folders, shares, collaborators: collabs, io, evictProjectUser } = deps;

  app.param('id', (_req, res, next, id) => {
    if (!resourceIdSchema.safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid resource id' });
    }
    return next();
  });
  app.param('token', (_req, res, next, token) => {
    if (!shareTokenSchema.safeParse(token).success) {
      return res.status(400).json({ error: 'Invalid share token' });
    }
    return next();
  });
  app.param('collaboratorUserId', (_req, res, next, collaboratorUserId) => {
    if (!collaboratorUserIdSchema.safeParse(collaboratorUserId).success) {
      return res.status(400).json({ error: 'Invalid collaborator user id' });
    }
    return next();
  });

  app.get('/api/projects', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      res.json(await projects.list(req.auth!.userId!));
    } catch {
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  app.get('/api/projects/shared/:token', async (req, res) => {
    const record = await shares.getByShareToken(req.params.token);
    if (!record) return res.status(404).json({ error: 'Shared project not found' });
    res.json(record);
  });

  app.get('/api/projects/:id', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    const record = await projects.get(req.params.id, req.auth!.userId!);
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  });

  app.post('/api/projects', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = projectInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid project payload' });
      const { title, data } = parsed.data;
      res.json(await projects.create(req.auth!.userId!, title || 'Untitled', data ?? {}));
    } catch {
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  app.put('/api/projects/:id', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.auth!.userId!;
      const parsed = projectInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid project payload' });
      const { title, data, expectedRevision } = parsed.data;
      if (expectedRevision === undefined) {
        return res
          .status(400)
          .json({ error: 'expectedRevision is required when updating a project' });
      }
      const result = await projects.commitCollaborationOperation({
        projectId: req.params.id,
        userId,
        operationId: randomUUID(),
        expectedRevision,
        kind: 'replace-project',
        data: data ?? {},
        title: title || 'Untitled',
      });

      const failure = httpStatusForCollaboration(result.status);
      if (failure === 409 && result.status === 'conflict') {
        return res.status(409).json({
          error: 'Project was updated by another editor',
          currentRevision: result.currentRevision,
        });
      }
      if (failure === 403) return res.status(403).json({ error: 'Access denied' });
      if (failure === 404) return res.status(404).json({ error: 'Project not found' });
      if (failure) return res.status(400).json({ error: 'Invalid project update' });

      const saved = await projects.get(req.params.id, userId);
      if (!saved) return res.status(404).json({ error: 'Project not found' });

      if (result.status === 'applied') {
        emitApplied(io, req.params.id, {
          operationId: result.operationId,
          revision: result.revision,
          kind: 'replace-project',
          data: result.data,
          title: result.title,
        });
      }
      res.json(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save project';
      const status =
        error instanceof Error && error.name === 'ProjectConflictError'
          ? 409
          : error instanceof Error && error.name === 'ProjectAccessError'
            ? 403
            : error instanceof Error && error.name === 'ProjectNotFoundError'
              ? 404
              : 500;
      const conflict = projectConflictSchema.safeParse(error);
      res.status(status).json({
        error: message,
        currentRevision: conflict.success ? conflict.data.currentRevision : undefined,
      });
    }
  });

  app.get(
    '/api/projects/:id/history',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const history = await projects.listHistory(req.params.id, req.auth!.userId!);
        if (!history) return res.status(404).json({ error: 'Project not found' });
        res.json(history);
      } catch {
        res.status(500).json({ error: 'Failed to list project history' });
      }
    },
  );

  app.post(
    '/api/projects/:id/history/:snapshotId/restore',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = z
          .object({ expectedRevision: z.number().int().positive() })
          .safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'expectedRevision is required' });
        const result = await projects.restoreHistory(
          req.params.id,
          req.auth!.userId!,
          req.params.snapshotId,
          parsed.data.expectedRevision,
        );
        const failure = httpStatusForCollaboration(result.status);
        if (failure === 409 && result.status === 'conflict') {
          return res.status(409).json({
            error: 'Project was updated by another editor',
            currentRevision: result.currentRevision,
          });
        }
        if (failure === 403) return res.status(403).json({ error: 'Access denied' });
        if (failure === 404)
          return res.status(404).json({ error: 'Project or snapshot not found' });
        if (failure || result.status !== 'applied')
          return res.status(400).json({ error: 'Invalid history restore' });
        emitApplied(io, req.params.id, {
          operationId: result.operationId,
          revision: result.revision,
          kind: 'replace-project',
          data: result.data,
          title: result.title,
        });
        res.json({ revision: result.revision, data: result.data, title: result.title });
      } catch {
        res.status(500).json({ error: 'Failed to restore project history' });
      }
    },
  );

  app.delete(
    '/api/projects/:id',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const deleted = await projects.delete(req.params.id, req.auth!.userId!);
        if (deleted) res.json({ success: true });
        else res.status(404).json({ error: 'Project not found' });
      } catch {
        res.status(500).json({ error: 'Failed to delete project' });
      }
    },
  );

  app.post(
    '/api/projects/:id/share',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const shared = await shares.shareProject(req.params.id, req.auth!.userId!);
        if (!shared) return res.status(404).json({ error: 'Project not found' });
        res.json({
          shareToken: shared.shareToken,
          expiresAt: shared.shareExpiresAt,
          shareUrl: `${env.CLIENT_URL || env.CORS_ORIGINS[0] || req.protocol + '://' + req.get('host')}/draw?share=${shared.shareToken}`,
        });
      } catch {
        res.status(500).json({ error: 'Failed to share project' });
      }
    },
  );

  app.post(
    '/api/projects/:id/unshare',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const unshared = await shares.unshareProject(req.params.id, req.auth!.userId!);
        if (!unshared) return res.status(404).json({ error: 'Project not found' });
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to unshare project' });
      }
    },
  );

  app.get(
    '/api/projects/:id/collaborators',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const collaborators = await collabs.getCollaborators(req.params.id, req.auth!.userId!);
        const enrichedCollaborators = await Promise.all(
          collaborators.map(async (c) => {
            try {
              const user = await clerkClient.users.getUser(c.userId);
              return { ...c, email: user.emailAddresses[0]?.emailAddress || undefined };
            } catch {
              return { ...c, email: undefined };
            }
          }),
        );
        res.json(enrichedCollaborators);
      } catch {
        res.status(500).json({ error: 'Failed to get collaborators' });
      }
    },
  );

  app.post(
    '/api/projects/:id/collaborators',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const parsed = collaboratorInputSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid collaborator payload' });
        const { email, role } = parsed.data;

        let collaboratorUserId: string | null = null;
        try {
          const users = await clerkClient.users.getUserList({ emailAddress: [email.trim()] });
          if (users.data.length > 0) collaboratorUserId = users.data[0].id;
        } catch (e) {
          logger.error('Failed to look up user by email', e);
        }

        if (!collaboratorUserId) {
          return res.status(404).json({ error: 'User not found with that email' });
        }
        if (collaboratorUserId === userId) {
          return res.status(400).json({ error: 'Cannot add yourself as a collaborator' });
        }

        logger.info(
          `Adding collaborator ${collaboratorUserId} to project ${req.params.id} by owner ${userId}`,
        );

        const added = await collabs.addCollaborator(
          req.params.id,
          userId,
          collaboratorUserId,
          role || 'editor',
        );
        if (!added) return res.status(404).json({ error: 'Project not found or unauthorized' });
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to add collaborator' });
      }
    },
  );

  app.delete(
    '/api/projects/:id/collaborators/:collaboratorUserId',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const removed = await collabs.removeCollaborator(
          req.params.id,
          req.auth!.userId!,
          req.params.collaboratorUserId,
        );
        if (!removed) return res.status(404).json({ error: 'Project not found or unauthorized' });
        try {
          await evictProjectUser(req.params.id, req.params.collaboratorUserId);
        } catch (error) {
          logger.error('Failed to evict revoked collaborator from project room', error);
        }
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to remove collaborator' });
      }
    },
  );

  app.post(
    '/api/projects/:id/move',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const parsed = moveProjectSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid move payload' });
        const moved = await folders.moveToFolder(
          req.params.id,
          req.auth!.userId!,
          parsed.data.folderId,
        );
        if (!moved) return res.status(404).json({ error: 'Project not found' });
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to move project' });
      }
    },
  );
}
