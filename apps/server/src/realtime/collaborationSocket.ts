import { z } from 'zod';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { clerkClient } from '@clerk/express';
import type { ConnectionRegistry } from '../services/ConnectionRegistry.js';
import type { ProjectService } from '../services/ProjectService.js';
import { logger } from '../utils/logger.js';
import { resourceIdSchema } from '../validation/project.js';
import type {
  ClientToServerEvents,
  CollaborationCommit,
  CollaborationCommitResult,
  CursorData,
  SelectionPresence,
  ServerToClientEvents,
  SocketData,
} from '../types/socket.js';

const socketCredentialSchema = z.string().trim().min(1);
const sessionClaimsSchema = z.object({ exp: z.number().optional() }).nullable();
const cursorSchema = z.object({
  clientId: z.string().optional(),
  userId: z.string(),
  username: z.string(),
  x: z.number(),
  y: z.number(),
  color: z.string(),
  timestamp: z.number().optional(),
});
const selectionSchema = z.object({
  clientId: z.string().optional(),
  userId: z.string(),
  username: z.string(),
  objectIds: z.array(z.string().min(1).max(200)).max(100),
  color: z.string(),
  timestamp: z.number().optional(),
});

export interface PresenceSocketData extends SocketData {
  cursor?: CursorData;
  selection?: SelectionPresence;
}

type CollaborationIo = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  PresenceSocketData
>;

type CollaborationSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  PresenceSocketData
>;

function userColor(userId: string): string {
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export interface CollaborationSocketDeps {
  io: CollaborationIo;
  projects: ProjectService;
  connectionRegistry: ConnectionRegistry;
  roomEvictionHandlers: Map<string, () => void>;
}

/** Socket auth, room join/leave, presence, and canonical collaboration commits. */
export function registerCollaborationSockets(deps: CollaborationSocketDeps): void {
  const { io, projects, connectionRegistry, roomEvictionHandlers } = deps;

  io.use(async (socket, next) => {
    if (connectionRegistry.count() >= connectionRegistry.max()) {
      return next(new Error('Server connection limit reached'));
    }
    const token = socket.handshake.auth.token;
    const credential = socketCredentialSchema.safeParse(token);
    if (!credential.success) {
      return next(new Error('Authentication required'));
    }

    try {
      const request = new Request('http://localhost/socket.io', {
        headers: { Authorization: `Bearer ${credential.data}` },
      });
      const auth = (await clerkClient.authenticateRequest(request)).toAuth();
      if (!auth?.userId) return next(new Error('Invalid authentication token'));
      socket.data.userId = auth.userId;
      const claims = sessionClaimsSchema.safeParse(auth.sessionClaims);
      if (claims.success && claims.data?.exp !== undefined) {
        socket.data.sessionExpiresAt = claims.data.exp * 1000;
      }
      next();
    } catch (error) {
      logger.warn('Socket authentication failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket: CollaborationSocket) => {
    const clientId = socket.id;
    let currentRoom: string | null = null;
    let roomGeneration = 0;
    const currentUserId = socket.data.userId ?? null;
    roomEvictionHandlers.set(clientId, () => {
      roomGeneration++;
      if (!currentRoom) return;
      socket.leave(currentRoom);
      delete socket.data.cursor;
      io.to(currentRoom).emit('cursor:leave', clientId);
      delete socket.data.selection;
      io.to(currentRoom).emit('selection:leave', clientId);
      currentRoom = null;
    });
    const sessionExpiryTimer = socket.data.sessionExpiresAt
      ? setTimeout(
          () => socket.disconnect(true),
          Math.max(0, socket.data.sessionExpiresAt - Date.now()),
        )
      : null;
    let operationWindowStartedAt = Date.now();
    let operationCount = 0;
    let cursorWindowStartedAt = Date.now();
    let cursorCount = 0;

    socket.use(([eventName], next) => {
      const now = Date.now();
      if (eventName === 'cursor:move') {
        if (now - cursorWindowStartedAt >= 1000) {
          cursorWindowStartedAt = now;
          cursorCount = 0;
        }
        if (++cursorCount > 60) {
          socket.emit('error', { status: 429, error: 'Cursor rate limit exceeded' });
          return next(new Error('Cursor rate limit exceeded'));
        }
        return next();
      }

      if (now - operationWindowStartedAt >= 60_000) {
        operationWindowStartedAt = now;
        operationCount = 0;
      }
      if (++operationCount > 600) {
        socket.emit('error', { status: 429, error: 'Socket operation rate limit exceeded' });
        return next(new Error('Socket operation rate limit exceeded'));
      }
      next();
    });

    logger.info(`Client connected: ${clientId}`);
    connectionRegistry.add(clientId);
    io.emit('connection:count', connectionRegistry.count());

    const getEditableRoom = async (): Promise<string | null> => {
      const room = currentRoom;
      const generation = roomGeneration;
      if (!room || !currentUserId) return null;
      const canEdit = await projects.checkPermission(room, currentUserId, 'edit');
      if (
        !canEdit ||
        currentRoom !== room ||
        roomGeneration !== generation ||
        !socket.rooms.has(room)
      ) {
        return null;
      }
      return room;
    };

    socket.on(
      'collaboration:commit',
      async (
        commit: CollaborationCommit,
        acknowledge: (result: CollaborationCommitResult) => void,
      ) => {
        if (!commit || commit.protocolVersion !== 1) return;
        const callback = z.function().safeParse(acknowledge);
        const reply = (result: CollaborationCommitResult) => {
          if (callback.success) acknowledge(result);
        };
        try {
          const room = await getEditableRoom();
          if (!room || room !== commit.projectId || !currentUserId) {
            reply({ status: 'forbidden', operationId: commit.operationId });
            return;
          }
          const result = await projects.commitCollaborationOperation({
            projectId: room,
            userId: currentUserId,
            operationId: commit.operationId,
            expectedRevision: commit.expectedRevision,
            kind: commit.kind,
            data: commit.data,
            title: commit.title,
          });
          if (result.status === 'applied') {
            socket.to(room).emit('collaboration:applied', {
              projectId: room,
              operationId: result.operationId,
              revision: result.revision,
              kind: commit.kind,
              data: result.data,
              title: result.title,
            });
          }
          reply(result);
        } catch (error) {
          logger.error(`Canonical collaboration commit failed for ${clientId}`, error);
          reply({ status: 'unavailable', operationId: commit.operationId });
        }
      },
    );

    socket.on('room:join', async (projectId: string) => {
      const joinGeneration = ++roomGeneration;
      if (!resourceIdSchema.safeParse(projectId).success) {
        logger.warn(`Unauthorized room join by ${currentUserId ?? clientId} for ${projectId}`);
        return;
      }
      try {
        const canView = currentUserId
          ? await projects.checkPermission(projectId, currentUserId, 'view')
          : false;
        if (!canView || joinGeneration !== roomGeneration) {
          logger.warn(`Unauthorized room join by ${currentUserId ?? clientId} for ${projectId}`);
          return;
        }
        let canonicalProject = currentUserId ? await projects.get(projectId, currentUserId) : null;
        if (!canonicalProject || joinGeneration !== roomGeneration) return;

        if (currentRoom) {
          socket.leave(currentRoom);
          delete socket.data.cursor;
          io.to(currentRoom).emit('cursor:leave', clientId);
          delete socket.data.selection;
          io.to(currentRoom).emit('selection:leave', clientId);
        }

        currentRoom = projectId;
        await socket.join(projectId);
        if (joinGeneration !== roomGeneration || !socket.connected) return;
        canonicalProject = currentUserId ? await projects.get(projectId, currentUserId) : null;
        if (joinGeneration !== roomGeneration || !socket.connected) return;
        if (!canonicalProject) {
          roomEvictionHandlers.get(clientId)?.();
          return;
        }

        socket.emit('collaboration:hydrated', {
          projectId,
          revision: canonicalProject.revision ?? 1,
          data: canonicalProject.data,
          title: canonicalProject.title,
        });
        logger.debug(`Client ${clientId} joined room ${projectId}`);

        const peers = await io.in(projectId).fetchSockets();
        if (joinGeneration !== roomGeneration || !socket.connected) return;
        socket.emit(
          'cursors:all',
          peers.flatMap((peer) => (peer.data.cursor ? [peer.data.cursor] : [])),
        );
        socket.emit(
          'selections:all',
          peers.flatMap((peer) => (peer.data.selection ? [peer.data.selection] : [])),
        );
        logger.info(`Client ${clientId} joined room: ${projectId}`);
      } catch (error) {
        logger.error(`Room join failed for ${clientId}`, error);
        if (joinGeneration === roomGeneration) roomEvictionHandlers.get(clientId)?.();
      }
    });

    socket.on('room:leave', () => {
      roomGeneration++;
      if (currentRoom && currentUserId) {
        socket.leave(currentRoom);
        delete socket.data.cursor;
        io.to(currentRoom).emit('cursor:leave', clientId);
        delete socket.data.selection;
        io.to(currentRoom).emit('selection:leave', clientId);
        currentRoom = null;
      }
    });

    socket.on('cursor:move', (cursor: CursorData) => {
      if (!currentRoom) return;
      const parsedCursor = cursorSchema.safeParse(cursor);
      if (!parsedCursor.success) return;
      cursor = parsedCursor.data;
      if (!currentUserId || cursor.userId !== currentUserId) return;
      if (!cursor.color) cursor.color = userColor(cursor.userId);
      const normalizedCursor: CursorData = { ...cursor, clientId };
      socket.data.cursor = { ...normalizedCursor, timestamp: Date.now() };
      socket.to(currentRoom).emit('cursor:move', normalizedCursor);
    });

    socket.on('selection:change', (selection: SelectionPresence) => {
      if (!currentRoom || !currentUserId || !selection || selection.userId !== currentUserId) return;
      const parsedSelection = selectionSchema.safeParse(selection);
      if (!parsedSelection.success) return;
      selection = parsedSelection.data;
      if (selection.objectIds.length === 0) {
        delete socket.data.selection;
        socket.to(currentRoom).emit('selection:leave', clientId);
        return;
      }
      const normalizedSelection: SelectionPresence = {
        clientId,
        userId: currentUserId,
        username: selection.username.slice(0, 100),
        objectIds: [...new Set(selection.objectIds)],
        color: userColor(currentUserId),
        timestamp: Date.now(),
      };
      socket.data.selection = normalizedSelection;
      socket.to(currentRoom).emit('selection:change', normalizedSelection);
    });

    socket.on('disconnect', (reason) => {
      roomGeneration++;
      roomEvictionHandlers.delete(clientId);
      if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
      connectionRegistry.remove(clientId);
      if (currentRoom && currentUserId) {
        delete socket.data.cursor;
        io.to(currentRoom).emit('cursor:leave', clientId);
        delete socket.data.selection;
        io.to(currentRoom).emit('selection:leave', clientId);
      }
      io.emit('connection:count', connectionRegistry.count());
      logger.info(`Client disconnected: ${clientId}, reason: ${reason}`);
    });

    socket.on('error', (error) => {
      logger.error(`Socket error from ${clientId}:`, error);
    });
  });
}

export async function evictProjectUser(
  io: CollaborationIo,
  roomEvictionHandlers: Map<string, () => void>,
  projectId: string,
  userId: string,
): Promise<void> {
  const sockets = await io.in(projectId).fetchSockets();
  await Promise.all(
    sockets
      .filter((socket) => socket.data.userId === userId)
      .map((socket) => {
        const localCleanup = roomEvictionHandlers.get(socket.id);
        if (localCleanup) localCleanup();
        else socket.disconnect(true);
        return Promise.resolve();
      }),
  );
}
