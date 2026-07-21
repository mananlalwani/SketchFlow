// Load environment variables in development only (gracefully skip if dotenv missing in production image)
import fs from 'fs';

if (process.env.NODE_ENV !== 'production') {
  const dotenvPath = process.cwd() + '/node_modules/dotenv';
  if (fs.existsSync(dotenvPath)) {
    try {
      // Top-level await is supported on Node 20+ and TypeScript targeting ES2022+ compiles this correctly
      await import('dotenv/config');
    } catch (e) {
      // It's OK if dotenv fails to load — env vars should be provided by the runtime in production
      // eslint-disable-next-line no-console
      console.warn('dotenv not loaded (continuing without .env):', String(e));
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('dotenv package not found in node_modules — skipping loading .env');
  }
}

// OpenTelemetry must be initialized before other app imports for auto-instrumentation
import './otel.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { clerkMiddleware, getAuth, requireAuth, clerkClient } from '@clerk/express';
import { DrawingService } from './services/DrawingService.js';
import { ProjectService } from './services/ProjectService.js';
import { logger } from './utils/logger.js';
import { env, isProd, clerkPublishableKey } from './config/env.js';
import { disconnectPrisma, checkDatabaseHealth } from './lib/prisma.js';
import {
  collaboratorInputSchema,
  collaboratorUserIdSchema,
  folderInputSchema,
  moveProjectSchema,
  projectInputSchema,
  resourceIdSchema,
  shareTokenSchema,
} from './validation/project.js';
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
  securityHeadersMiddleware,
  rateLimitMiddleware,
  errorHandlerMiddleware,
} from './middleware/index.js';
import type {
  StrokeData,
  ShapeData,
  CanvasSnapshot,
  CursorData,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from './types/socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AuthenticatedRequest extends express.Request {
  auth?: {
    userId: string | null;
    sessionId: string | null;
  };
}

export class SketchFlowServer {
  private app = express();
  private server = createServer(this.app);
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  private drawingService = new DrawingService();
  private projectService = new ProjectService();
  private isShuttingDown = false;
  private clientDistPath = process.env.CLIENT_DIST_PATH || path.join(__dirname, '../../client/dist');
  private redisPublisher: { quit: () => Promise<unknown> } | null = null;
  private redisSubscriber: { quit: () => Promise<unknown> } | null = null;

  constructor() {

    // Configure CORS origins for Socket.IO
    // In development, allow all origins with credentials (reflective origin)
    const corsOrigins = isProd && env.CORS_ORIGINS && env.CORS_ORIGINS.length > 0
      ? env.CORS_ORIGINS
      : true;

    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(this.server, {
      cors: {
        origin: corsOrigins,
        credentials: true
      },
      maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for better performance
      pingTimeout: 20000,
      pingInterval: 10000,
      transports: ['websocket', 'polling'], // Support polling fallback for LB health checks
    });

    // Trust proxy when behind load balancer
    if (isProd) {
      this.app.set('trust proxy', 1);
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    setInterval(() => this.drawingService.cleanupInactiveCanvases(30 * 60 * 1000), 5 * 60 * 1000).unref();
    void this.setupRedisAdapter();
  }

  private async setupRedisAdapter(): Promise<void> {
    if (!env.REDIS_URL) {
      logger.info('Redis adapter disabled; Socket.IO is limited to one server instance');
      return;
    }

    const publisher = createClient({ url: env.REDIS_URL });
    const subscriber = publisher.duplicate();
    publisher.on('error', error => logger.error('Redis publisher error', error));
    subscriber.on('error', error => logger.error('Redis subscriber error', error));

    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
      this.io.adapter(createAdapter(publisher, subscriber));
      this.redisPublisher = publisher;
      this.redisSubscriber = subscriber;
      logger.info('Socket.IO Redis adapter connected');
    } catch (error) {
      logger.error('Socket.IO Redis adapter unavailable; continuing in single-instance mode', error);
      await Promise.allSettled([publisher.disconnect(), subscriber.disconnect()]);
    }
  }

  private setupMiddleware(): void {
    // CORS middleware (must be before all routes/static)
    // In development, allow all origins with credentials (reflective origin)
    const corsOrigins = isProd && env.CORS_ORIGINS && env.CORS_ORIGINS.length > 0
      ? env.CORS_ORIGINS
      : true;

    this.app.use(cors({
      origin: corsOrigins,
      credentials: true,
    }));
    // Request ID for correlation (must be first)
    this.app.use(requestIdMiddleware);

    // Security headers
    this.app.use(securityHeadersMiddleware);

    // Request logging
    this.app.use(requestLoggingMiddleware);

    // Cookie parser
    this.app.use(cookieParser());

    // Rate limiting for auth endpoints
    const authRateLimiter = rateLimitMiddleware({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30,     // 30 requests per minute
    });

    // Apply rate limiting to auth-heavy endpoints
    this.app.use('/api/auth', authRateLimiter);
    this.app.use('/api/projects/:id/collaborators', authRateLimiter);

    this.app.use('/api', rateLimitMiddleware({ windowMs: 60 * 1000, maxRequests: 120 }));

    // Authentication applies to API routes. Keeping liveness probes and static
    // assets outside Clerk makes container health checks independent of Clerk.
    const clerk = clerkMiddleware({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: clerkPublishableKey,
    });
    this.app.use((req, res, next) => {
      if (!req.path.startsWith('/api/')) return next();
      return clerk(req, res, next);
    });

    // Static files - serve the built client
    this.app.use(express.static(this.clientDistPath, {
      // Cache static assets aggressively in production
      maxAge: isProd ? '1y' : 0,
      etag: true,
      lastModified: true,
      // Don't cache HTML
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));

    // Body parsing with limits
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes(): void {
    this.app.param('id', (_req, res, next, id) => {
      if (!resourceIdSchema.safeParse(id).success) {
        return res.status(400).json({ error: 'Invalid resource id' });
      }
      return next();
    });
    this.app.param('token', (_req, res, next, token) => {
      if (!shareTokenSchema.safeParse(token).success) {
        return res.status(400).json({ error: 'Invalid share token' });
      }
      return next();
    });
    this.app.param('collaboratorUserId', (_req, res, next, collaboratorUserId) => {
      if (!collaboratorUserIdSchema.safeParse(collaboratorUserId).success) {
        return res.status(400).json({ error: 'Invalid collaborator user id' });
      }
      return next();
    });

    // Health check - basic liveness
    this.app.get('/api/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        connections: this.drawingService.getConnectionCount(),
      });
    });

    // Liveness probe (Kubernetes style) - is the process alive?
    this.app.get('/api/healthz', (_req, res) => {
      if (this.isShuttingDown) {
        res.status(503).json({ status: 'shutting_down' });
        return;
      }
      res.json({ status: 'ok' });
    });

    // Readiness probe - can we serve traffic?
    this.app.get('/api/readyz', async (_req, res) => {
      if (this.isShuttingDown) {
        res.status(503).json({ status: 'shutting_down' });
        return;
      }

      const dbHealthy = await checkDatabaseHealth();
      if (!dbHealthy) {
        res.status(503).json({ status: 'database_unhealthy' });
        return;
      }

      res.json({
        status: 'ok',
        database: 'connected',
        connections: this.drawingService.getConnectionCount(),
      });
    });

    // Auth API - get current user (protected)
    this.app.get('/api/auth/me', async (req: AuthenticatedRequest, res) => {
      const { userId } = getAuth(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.json({ userId });
    });

    // Helper middleware to require authentication and attach userId to request
    const requireAuthMiddleware = () => {
      return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
        const { userId } = getAuth(req);
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        req.auth = { userId, sessionId: null };
        next();
      };
    };

    // Project APIs (require authentication)
    this.app.get('/api/projects', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const list = await this.projectService.list(userId);
        res.json(list);
      } catch {
        res.status(500).json({ error: 'Failed to list projects' });
      }
    });

    // Public endpoint for shared projects (no auth required)
    this.app.get('/api/projects/shared/:token', async (req, res) => {
      const record = await this.projectService.getByShareToken(req.params.token);
      if (!record) return res.status(404).json({ error: 'Shared project not found' });
      res.json(record);
    });

    this.app.get('/api/projects/:id', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      const userId = req.auth!.userId!;
      const record = await this.projectService.get(req.params.id, userId);
      if (!record) return res.status(404).json({ error: 'Not found' });
      res.json(record);
    });

    this.app.post('/api/projects', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const parsed = projectInputSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid project payload' });
        const { title, data } = parsed.data;
        const created = await this.projectService.create(userId, title || 'Untitled', data ?? {});
        res.json(created);
      } catch {
        res.status(500).json({ error: 'Failed to create project' });
      }
    });

    this.app.put('/api/projects/:id', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const parsed = projectInputSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid project payload' });
        const { title, data, expectedRevision } = parsed.data;
        const saved = await this.projectService.save(req.params.id, userId, title || 'Untitled', data ?? {}, expectedRevision);
        res.json(saved);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save project';
        const status = error instanceof Error && error.name === 'ProjectConflictError'
          ? 409
          : error instanceof Error && error.name === 'ProjectAccessError'
            ? 403
            : 500;
        res.status(status).json({ error: message });
      }
    });

    this.app.delete('/api/projects/:id', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const deleted = await this.projectService.delete(req.params.id, userId);
        if (deleted) {
          res.json({ success: true });
        } else {
          res.status(404).json({ error: 'Project not found' });
        }
      } catch {
        res.status(500).json({ error: 'Failed to delete project' });
      }
    });

    // Share/unshare endpoints
    this.app.post('/api/projects/:id/share', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const shared = await this.projectService.shareProject(req.params.id, userId);
        if (!shared) {
          return res.status(404).json({ error: 'Project not found' });
        }
        res.json({
          shareToken: shared.shareToken,
          expiresAt: shared.shareExpiresAt,
          shareUrl: `${env.CLIENT_URL || (req.protocol + '://' + req.get('host'))}/draw?share=${shared.shareToken}`
        });
      } catch {
        res.status(500).json({ error: 'Failed to share project' });
      }
    });

    this.app.post('/api/projects/:id/unshare', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const unshared = await this.projectService.unshareProject(req.params.id, userId);
        if (!unshared) {
          return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to unshare project' });
      }
    });

    // Collaborator endpoints
    this.app.get('/api/projects/:id/collaborators', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const collaborators = await this.projectService.getCollaborators(req.params.id, userId);

        // Enrich with email addresses from Clerk
        const enrichedCollaborators = await Promise.all(
          collaborators.map(async (c) => {
            try {
              const user = await clerkClient.users.getUser(c.userId);
              return {
                ...c,
                email: user.emailAddresses[0]?.emailAddress || undefined
              };
            } catch {
              return { ...c, email: undefined };
            }
          })
        );

        res.json(enrichedCollaborators);
      } catch {
        res.status(500).json({ error: 'Failed to get collaborators' });
      }
    });

    this.app.post('/api/projects/:id/collaborators', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const parsed = collaboratorInputSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid collaborator payload' });
        const { email, role } = parsed.data;

        // Look up user by email using Clerk
        let collaboratorUserId: string | null = null;
        try {
          const users = await clerkClient.users.getUserList({
            emailAddress: [email.trim()]
          });
          if (users.data.length > 0) {
            collaboratorUserId = users.data[0].id;
          }
        } catch (e) {
          logger.error('Failed to look up user by email', e);
        }

        if (!collaboratorUserId) {
          return res.status(404).json({ error: 'User not found with that email' });
        }

        // Extra safety check: prevent adding yourself
        if (collaboratorUserId === userId) {
          return res.status(400).json({ error: 'Cannot add yourself as a collaborator' });
        }

        logger.info(`Adding collaborator ${collaboratorUserId} to project ${req.params.id} by owner ${userId}`);

        const added = await this.projectService.addCollaborator(req.params.id, userId, collaboratorUserId, role || 'editor');
        if (!added) {
          return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to add collaborator' });
      }
    });

    this.app.delete('/api/projects/:id/collaborators/:collaboratorUserId', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const removed = await this.projectService.removeCollaborator(req.params.id, userId, req.params.collaboratorUserId);
        if (!removed) {
          return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to remove collaborator' });
      }
    });

    // Move project to folder
    this.app.post('/api/projects/:id/move', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const parsed = moveProjectSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid move payload' });
        const moved = await this.projectService.moveToFolder(req.params.id, userId, parsed.data.folderId);
        if (!moved) {
          return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to move project' });
      }
    });

    // Folder APIs
    this.app.get('/api/folders', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const folders = await this.projectService.listFolders(userId);
        res.json(folders);
      } catch {
        res.status(500).json({ error: 'Failed to list folders' });
      }
    });

    this.app.post('/api/folders', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const parsed = folderInputSchema.safeParse(req.body);
        if (!parsed.success || !parsed.data.name) return res.status(400).json({ error: 'Invalid folder payload' });
        const { name, color, parentId } = parsed.data;
        const folder = await this.projectService.createFolder(userId, name || 'New Folder', color, parentId);
        res.json(folder);
      } catch {
        res.status(500).json({ error: 'Failed to create folder' });
      }
    });

    this.app.put('/api/folders/:id', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const parsed = folderInputSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid folder payload' });
        const { name, color, parentId } = parsed.data;
        const folder = await this.projectService.updateFolder(req.params.id, userId, name, color, parentId);
        if (!folder) {
          return res.status(404).json({ error: 'Folder not found' });
        }
        res.json(folder);
      } catch {
        res.status(500).json({ error: 'Failed to update folder' });
      }
    });

    this.app.delete('/api/folders/:id', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const deleted = await this.projectService.deleteFolder(req.params.id, userId);
        if (!deleted) {
          return res.status(404).json({ error: 'Folder not found' });
        }
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to delete folder' });
      }
    });

    // Error handler (must be last middleware)
    this.app.use(errorHandlerMiddleware);

    // Serve React app for all other routes (SPA fallback)
    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(this.clientDistPath, 'index.html'));
    });
  }

  private setupSocketHandlers(): void {
    this.io.use(async (socket, next) => {
      if (this.drawingService.getConnectionCount() >= this.drawingService.getMaxConnections()) {
        return next(new Error('Server connection limit reached'));
      }
      const token = socket.handshake.auth.token;
      if (typeof token !== 'string' || token.length === 0) return next(new Error('Authentication required'));

      try {
        const request = new Request('http://localhost/socket.io', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const auth = (await clerkClient.authenticateRequest(request)).toAuth();
        if (!auth?.userId) return next(new Error('Invalid authentication token'));
        socket.data.userId = auth.userId;
        const exp = (auth.sessionClaims as { exp?: number } | null)?.exp;
        if (typeof exp === 'number') socket.data.sessionExpiresAt = exp * 1000;
        next();
      } catch (error) {
        logger.warn('Socket authentication failed', { error: error instanceof Error ? error.message : String(error) });
        next(new Error('Invalid authentication token'));
      }
    });

    // Track active cursors per room
    const roomCursors = new Map<string, Map<string, { userId: string; username: string; x: number; y: number; color: string; timestamp: number }>>();

    // Generate color for user
    const getUserColor = (userId: string): string => {
      const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
      const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return colors[hash % colors.length];
    };

    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      let currentRoom: string | null = null;
      const currentUserId = socket.data.userId ?? null;
      const sessionExpiryTimer = socket.data.sessionExpiresAt
        ? setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.sessionExpiresAt - Date.now()))
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
          if (++cursorCount > 60) return next(new Error('Cursor rate limit exceeded'));
          return next();
        }

        if (now - operationWindowStartedAt >= 60_000) {
          operationWindowStartedAt = now;
          operationCount = 0;
        }
        if (++operationCount > 600) return next(new Error('Socket operation rate limit exceeded'));
        next();
      });

      logger.info(`Client connected: ${clientId}`);

      this.drawingService.addConnection(clientId);

      // Broadcast updated connection count to all clients
      this.io.emit('connection:count', this.drawingService.getConnectionCount());

      // Helper to check if user can edit in current room
      const canUserEdit = async (): Promise<boolean> => {
        if (!currentRoom || !currentUserId) return false;

        // Check permission
        const canEdit = await this.projectService.checkPermission(currentRoom, currentUserId, 'edit');
        return canEdit;
      };

      // Handle drawing strokes
      socket.on('draw:stroke', async (stroke: StrokeData) => {
        if (!this.isValidStroke(stroke)) {
          logger.warn(`Invalid stroke from ${clientId}:`, { stroke });
          return;
        }

        // Check if user has edit permission
        if (!currentRoom || !currentUserId || !await canUserEdit()) {
          logger.warn(`User ${currentUserId ?? clientId} attempted to draw without project edit permission`);
          return;
        }

        try {
          this.drawingService.addStroke(currentRoom, stroke);
          // Only broadcast to other clients in the same room/project
          if (currentRoom) {
            socket.to(currentRoom).emit('draw:stroke', stroke);
          }
        } catch (error) {
          logger.error(`Error processing stroke from ${clientId}:`, error);
        }
      });

      // Handle batch strokes
      socket.on('draw:strokes', async (strokes: StrokeData[]) => {
        if (!Array.isArray(strokes) || strokes.length === 0) return;

        // Check edit permission
        if (!currentRoom || !currentUserId || !await canUserEdit()) {
          logger.warn(`User ${currentUserId ?? clientId} attempted to draw without project edit permission`);
          return;
        }

        const validStrokes = strokes
          .slice(0, 100) // Limit batch size
          .filter(s => this.isValidStroke(s));

        if (validStrokes.length === 0) return;

        try {
          this.drawingService.addStrokes(currentRoom, validStrokes);
          // Only broadcast to other clients in the same room/project
          if (currentRoom) {
            socket.to(currentRoom).emit('draw:strokes', validStrokes);
          }
        } catch (error) {
          logger.error(`Error processing strokes batch from ${clientId}:`, error);
        }
      });

      // Handle shapes
      socket.on('draw:shape', async (shape: ShapeData) => {
        if (!this.isValidShape(shape)) {
          logger.warn(`Invalid shape from ${clientId}:`, { shape });
          return;
        }

        // Check edit permission
        if (!currentRoom || !currentUserId || !await canUserEdit()) {
          logger.warn(`User ${currentUserId ?? clientId} attempted to draw without project edit permission`);
          return;
        }

        try {
          this.drawingService.addShape(currentRoom, shape);
          // Only broadcast to other clients in the same room/project
          if (currentRoom) {
            socket.to(currentRoom).emit('draw:shape', shape);
          }
        } catch (error) {
          logger.error(`Error processing shape from ${clientId}:`, error);
        }
      });

      // Handle canvas snapshots
      socket.on('canvas:snapshot', async (snapshot: CanvasSnapshot) => {
        if (!currentRoom || !currentUserId) return;
        if (!await canUserEdit()) return;
        if (!this.isValidSnapshot(snapshot)) {
          logger.warn(`Invalid snapshot from ${clientId}`);
          return;
        }

        try {
          this.drawingService.updateSnapshot(currentRoom, snapshot);
          await this.projectService.saveCollaborationSnapshot(currentRoom, snapshot);
          // Throttled broadcast to prevent spam - only to room
          this.drawingService.broadcastSnapshotThrottled(currentRoom, () => {
            if (currentRoom) {
              socket.to(currentRoom).emit('canvas:snapshot', snapshot);
            }
          });
        } catch (error) {
          logger.error(`Error processing snapshot from ${clientId}:`, error);
        }
      });

      // Handle clear canvas
      socket.on('canvas:clear', async () => {
        // Check edit permission
        if (!currentRoom || !currentUserId || !await canUserEdit()) {
          logger.warn(`User ${currentUserId ?? clientId} attempted to clear without project edit permission`);
          return;
        }

        try {
          this.drawingService.clearCanvas(currentRoom);
          // Only broadcast to clients in the same room/project
          if (currentRoom) {
            socket.to(currentRoom).emit('canvas:clear');
          }
          logger.info(`Canvas cleared by ${clientId} in room ${currentRoom}`);
        } catch (error) {
          logger.error(`Error clearing canvas from ${clientId}:`, error);
        }
      });

      socket.on('project:state', async (data: { objects: unknown[]; timestamp: number }) => {
        if (!currentRoom || !currentUserId || !Array.isArray(data?.objects) || !await canUserEdit()) return;
        socket.to(currentRoom).emit('project:state', data);
      });

      // Handle room join
      socket.on('room:join', async (projectId: string) => {
        if (typeof projectId !== 'string' || !currentUserId || !await this.projectService.checkPermission(projectId, currentUserId, 'view')) {
          logger.warn(`Unauthorized room join by ${currentUserId ?? clientId} for ${projectId}`);
          return;
        }
        // Leave previous room if any
        if (currentRoom) {
          socket.leave(currentRoom);
          // Remove cursor from previous room
          if (currentUserId && roomCursors.has(currentRoom)) {
            roomCursors.get(currentRoom)?.delete(currentUserId);
            this.io.to(currentRoom).emit('cursor:leave', currentUserId);
          }
        }

        // Join new room
        currentRoom = projectId;
        socket.join(projectId);

        const currentSnapshot = this.drawingService.getCurrentSnapshot(projectId) ?? await this.projectService.getCollaborationSnapshot(projectId);
        if (currentSnapshot) socket.emit('canvas:snapshot', currentSnapshot);

        // Log room join for debugging
        logger.debug(`Client ${clientId} joined room ${projectId}`);

        // Initialize room cursor map if needed
        if (!roomCursors.has(projectId)) {
          roomCursors.set(projectId, new Map());
        }

        // Send all existing cursors in room to new joiner
        const cursorsInRoom = roomCursors.get(projectId);
        if (cursorsInRoom) {
          const allCursors = Array.from(cursorsInRoom.values());
          socket.emit('cursors:all', allCursors);
        }

        logger.info(`Client ${clientId} joined room: ${projectId}`);
      });

      // Handle room leave
      socket.on('room:leave', () => {
        if (currentRoom && currentUserId) {
          socket.leave(currentRoom);
          // Remove cursor
          if (roomCursors.has(currentRoom)) {
            roomCursors.get(currentRoom)?.delete(currentUserId);
            this.io.to(currentRoom).emit('cursor:leave', currentUserId);
          }
          currentRoom = null;
        }
      });

      // Handle cursor movement
      socket.on('cursor:move', (cursor: CursorData) => {
        if (!currentRoom) return;

        // Validate cursor data
        if (!cursor || typeof cursor.userId !== 'string' ||
          typeof cursor.x !== 'number' || typeof cursor.y !== 'number') {
          return;
        }

        // The client may choose a display name, but never its identity.
        if (!currentUserId || cursor.userId !== currentUserId) return;

        // Ensure color is set
        if (!cursor.color) {
          cursor.color = getUserColor(cursor.userId);
        }

        // Update cursor in room
        const roomCursorMap = roomCursors.get(currentRoom);
        if (roomCursorMap) {
          roomCursorMap.set(cursor.userId, {
            userId: cursor.userId,
            username: cursor.username,
            x: cursor.x,
            y: cursor.y,
            color: cursor.color,
            timestamp: Date.now()
          });
        }

        // Broadcast to others in room
        socket.to(currentRoom).emit('cursor:move', cursor);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
        this.drawingService.removeConnection(clientId);

        // Clean up cursor from current room
        if (currentRoom && currentUserId) {
          if (roomCursors.has(currentRoom)) {
            roomCursors.get(currentRoom)?.delete(currentUserId);
            this.io.to(currentRoom).emit('cursor:leave', currentUserId);
          }
        }

        // Broadcast updated connection count to all remaining clients
        this.io.emit('connection:count', this.drawingService.getConnectionCount());
        logger.info(`Client disconnected: ${clientId}, reason: ${reason}`);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket error from ${clientId}:`, error);
      });
    });
  }

  private isValidStroke(stroke: StrokeData): boolean {
    return (
      stroke &&
      typeof stroke === 'object' &&
      Number.isFinite(stroke.x0) &&
      Number.isFinite(stroke.y0) &&
      Number.isFinite(stroke.x1) &&
      Number.isFinite(stroke.y1) &&
      typeof stroke.color === 'string' &&
      Number.isFinite(stroke.size) &&
      stroke.size > 0 &&
      stroke.size <= 100 &&
      /^#[0-9A-Fa-f]{6}$/.test(stroke.color)
    );
  }

  private isValidShape(shape: ShapeData): boolean {
    return (
      shape &&
      typeof shape === 'object' &&
      typeof shape.id === 'string' &&
      ['line', 'rectangle', 'ellipse'].includes(shape.type) &&
      typeof shape.x === 'number' &&
      typeof shape.y === 'number' &&
      typeof shape.width === 'number' &&
      typeof shape.height === 'number' &&
      typeof shape.color === 'string' &&
      typeof shape.size === 'number' &&
      typeof shape.alpha === 'number' &&
      shape.size > 0 &&
      shape.size <= 100 &&
      shape.alpha >= 0 &&
      shape.alpha <= 1 &&
      /^#[0-9A-Fa-f]{6}$/.test(shape.color) &&
      // Allow negative width/height for lines (directional)
      (shape.type === 'line' || (shape.width >= 0 && shape.height >= 0))
    );
  }

  private isValidSnapshot(snapshot: CanvasSnapshot): boolean {
    return (
      snapshot &&
      typeof snapshot === 'object' &&
      typeof snapshot.dataUrl === 'string' &&
      snapshot.dataUrl.startsWith('data:image/') &&
      snapshot.dataUrl.length < 8 * 1024 * 1024
    );
  }

  private async getLocalIPs(): Promise<string[]> {
    const { networkInterfaces } = await import('os');
    const interfaces = networkInterfaces();
    const ips: string[] = [];

    for (const name of Object.keys(interfaces)) {
      const interface_ = interfaces[name];
      if (!interface_) continue;

      for (const net of interface_) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
    return ips;
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(env.PORT, env.HOST, async () => {
        const ips = await this.getLocalIPs();

        logger.info('SketchFlow Server Started', {
          port: env.PORT,
          host: env.HOST,
          environment: env.NODE_ENV,
          maxConnections: this.drawingService.getMaxConnections(),
        });

        logger.info(`Server running on:`);
        logger.info(`   - http://localhost:${env.PORT}`);
        ips.forEach(ip => logger.info(`   - http://${ip}:${env.PORT}`));

        // Log configured CORS origins for verification in production
        try {
          const corsInfo = Array.isArray(env.CORS_ORIGINS) && env.CORS_ORIGINS.length > 0
            ? env.CORS_ORIGINS
            : (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : ['*']);
          logger.info('Configured CORS origins', { corsOrigins: corsInfo });
        } catch (e) {
          logger.warn('Failed to parse CORS_ORIGINS for logging', { error: String(e) });
        }

        // Clean up any corrupt collaborator data on startup
        logger.info('Running collaborator data cleanup...');
        await this.projectService.cleanupCorruptCollaborators();

        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    // Close Socket.IO connections
    this.io.close(() => {
      logger.info('Socket.IO server closed');
    });

    // Close HTTP server (stop accepting new connections)
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    // Disconnect Prisma
    await disconnectPrisma();

    await Promise.allSettled([
      this.redisPublisher?.quit() ?? Promise.resolve(),
      this.redisSubscriber?.quit() ?? Promise.resolve(),
    ]);

    logger.info('Graceful shutdown complete');
  }

  /** Exposed for integration tests and container smoke checks. */
  public getApp(): express.Express {
    return this.app;
  }

  /** Exposed for Socket.IO integration tests. */
  public getHttpServer() {
    return this.server;
  }

  /** Exposed for Socket.IO integration tests. */
  public getSocketServer() {
    return this.io;
  }
}

if (process.env.NODE_ENV !== 'test') {
  const server = new SketchFlowServer();

  // Graceful shutdown handlers
  async function handleShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    void handleShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });

  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
