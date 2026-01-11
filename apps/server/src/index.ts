// Load environment variables first
import 'dotenv/config';
// OpenTelemetry must be initialized before other app imports for auto-instrumentation
import './otel.js';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
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
  ClientToServerEvents, 
  ServerToClientEvents 
} from './types/socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AuthenticatedRequest extends express.Request {
  auth?: {
    userId: string | null;
    sessionId: string | null;
  };
}

class LiveDrawServer {
  private app = express();
  private server = createServer(this.app);
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  private drawingService = new DrawingService();
  private projectService = new ProjectService();
  private isShuttingDown = false;

  constructor() {
    // Configure CORS origins
    const corsOrigins = isProd && env.CORS_ORIGINS.length > 0 
      ? env.CORS_ORIGINS 
      : '*';

    this.io = new SocketIOServer(this.server, {
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
  }

  private setupMiddleware(): void {
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

    // Clerk middleware
    this.app.use(clerkMiddleware({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: clerkPublishableKey,
    }));

    // Static files - serve the built client
    const staticPath = path.join(__dirname, '../../client/dist');
    this.app.use(express.static(staticPath, {
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
    this.app.use(express.json({ limit: '50mb' }));
  }

  private setupRoutes(): void {
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
        const { title, data } = req.body || {};
        const created = await this.projectService.create(userId, title || 'Untitled', data ?? {});
        res.json(created);
      } catch {
        res.status(500).json({ error: 'Failed to create project' });
      }
    });

    this.app.put('/api/projects/:id', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const { title, data } = req.body || {};
        const saved = await this.projectService.save(req.params.id, userId, title || 'Untitled', data ?? {});
        res.json(saved);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save project';
        res.status(500).json({ error: message });
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
          shareUrl: `${req.protocol}://${req.get('host')}/view?share=${shared.shareToken}`
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
        const { email, role } = req.body || {};
        
        if (!email) {
          return res.status(400).json({ error: 'Email is required' });
        }
        
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
        const { folderId } = req.body || {};
        const moved = await this.projectService.moveToFolder(req.params.id, userId, folderId ?? null);
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
        const { name, color, parentId } = req.body || {};
        const folder = await this.projectService.createFolder(userId, name || 'New Folder', color, parentId);
        res.json(folder);
      } catch {
        res.status(500).json({ error: 'Failed to create folder' });
      }
    });

    this.app.put('/api/folders/:id', requireAuth(), requireAuthMiddleware(), async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.auth!.userId!;
        const { name, color, parentId } = req.body || {};
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
      const indexPath = path.join(__dirname, '../../dist/index.html');
      res.sendFile(indexPath);
    });
  }

  private setupSocketHandlers(): void {
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
      let currentUserId: string | null = null;
      
      logger.info(`Client connected: ${clientId}`);
      
      this.drawingService.addConnection(clientId);
      
      // Broadcast updated connection count to all clients
      this.io.emit('connection:count', this.drawingService.getConnectionCount());

      // Send current canvas state to new client
      const currentSnapshot = this.drawingService.getCurrentSnapshot();
      if (currentSnapshot) {
        socket.emit('canvas:snapshot', currentSnapshot);
      }

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
        if (currentRoom && currentUserId) {
          const canEdit = await canUserEdit();
          if (!canEdit) {
            logger.warn(`User ${currentUserId} attempted to draw without permission in ${currentRoom}`);
            return;
          }
        }

        try {
          this.drawingService.addStroke(stroke);
          // Only broadcast to other clients in the same room/project
          socket.to(currentRoom).emit('draw:stroke', stroke);
        } catch (error) {
          logger.error(`Error processing stroke from ${clientId}:`, error);
        }
      });

      // Handle batch strokes
      socket.on('draw:strokes', async (strokes: StrokeData[]) => {
        if (!Array.isArray(strokes) || strokes.length === 0) return;
        
        // Check edit permission
        if (currentRoom && currentUserId) {
          const canEdit = await canUserEdit();
          if (!canEdit) {
            logger.warn(`User ${currentUserId} attempted to draw without permission in ${currentRoom}`);
            return;
          }
        }
        
        const validStrokes = strokes
          .slice(0, 100) // Limit batch size
          .filter(s => this.isValidStroke(s));
        
        if (validStrokes.length === 0) return;

        try {
          this.drawingService.addStrokes(validStrokes);
          // Only broadcast to other clients in the same room/project
          socket.to(currentRoom).emit('draw:strokes', validStrokes);
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
        if (currentRoom && currentUserId) {
          const canEdit = await canUserEdit();
          if (!canEdit) {
            logger.warn(`User ${currentUserId} attempted to draw without permission in ${currentRoom}`);
            return;
          }
        }

        try {
          this.drawingService.addShape(shape);
          // Only broadcast to other clients in the same room/project
          socket.to(currentRoom).emit('draw:shape', shape);
        } catch (error) {
          logger.error(`Error processing shape from ${clientId}:`, error);
        }
      });

      // Handle canvas snapshots
      socket.on('canvas:snapshot', (snapshot: CanvasSnapshot) => {
        if (!this.isValidSnapshot(snapshot)) {
          logger.warn(`Invalid snapshot from ${clientId}`);
          return;
        }

        try {
          this.drawingService.updateSnapshot(snapshot);
          // Throttled broadcast to prevent spam - only to room
          this.drawingService.broadcastSnapshotThrottled(() => {
            socket.to(currentRoom).emit('canvas:snapshot', snapshot);
          });
        } catch (error) {
          logger.error(`Error processing snapshot from ${clientId}:`, error);
        }
      });

      // Handle clear canvas
      socket.on('canvas:clear', async () => {
        // Check edit permission
        if (currentRoom && currentUserId) {
          const canEdit = await canUserEdit();
          if (!canEdit) {
            logger.warn(`User ${currentUserId} attempted to clear canvas without permission in ${currentRoom}`);
            return;
          }
        }
        
        try {
          this.drawingService.clearCanvas();
          // Only broadcast to clients in the same room/project
          socket.to(currentRoom).emit('canvas:clear');
          logger.info(`Canvas cleared by ${clientId} in room ${currentRoom}`);
        } catch (error) {
          logger.error(`Error clearing canvas from ${clientId}:`, error);
        }
      });

      // Handle room join
      socket.on('room:join', (projectId: string) => {
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
      socket.on('cursor:move', (cursor) => {
        if (!currentRoom) return;
        
        // Validate cursor data
        if (!cursor || typeof cursor.userId !== 'string' || 
            typeof cursor.x !== 'number' || typeof cursor.y !== 'number') {
          return;
        }
        
        // Store current user ID
        if (!currentUserId) {
          currentUserId = cursor.userId;
        }
        
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
      typeof stroke.x0 === 'number' &&
      typeof stroke.y0 === 'number' &&
      typeof stroke.x1 === 'number' &&
      typeof stroke.y1 === 'number' &&
      typeof stroke.color === 'string' &&
      typeof stroke.size === 'number' &&
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
      snapshot.dataUrl.length < 50 * 1024 * 1024 // 50MB limit
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
        
        logger.info('Live Draw Server Started', {
          port: env.PORT,
          host: env.HOST,
          environment: env.NODE_ENV,
          maxConnections: this.drawingService.getMaxConnections(),
        });
        
        logger.info(`Server running on:`);
        logger.info(`   - http://localhost:${env.PORT}`);
        ips.forEach(ip => logger.info(`   - http://${ip}:${env.PORT}`));
        
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
    
    logger.info('Graceful shutdown complete');
  }
}

// Start server
const server = new LiveDrawServer();

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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  handleShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  // Don't exit on unhandled rejection, just log it
});

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
