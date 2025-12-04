import 'dotenv/config';
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
  private port = parseInt(process.env.PORT || '3000');
  private host = process.env.HOST || '0.0.0.0';

  constructor() {
    this.io = new SocketIOServer(this.server, {
      cors: { 
        origin: process.env.NODE_ENV === 'production' ? false : '*',
        credentials: true 
      },
      maxHttpBufferSize: 10 * 1024 * 1024, // Reduced to 10MB for better performance
      pingTimeout: 20000,
      pingInterval: 10000,
      transports: ['websocket']
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });

    // Cookie parser
    this.app.use(cookieParser());

    // Clerk middleware - must be before other routes
    // Clerk needs both publishable key and secret key
    this.app.use(clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY
    }));

    // Static files - serve the built client
    const staticPath = process.env.NODE_ENV === 'production' 
      ? path.join(__dirname, '../../dist') 
      : path.join(__dirname, '../../dist');
    
    this.app.use(express.static(staticPath));
    this.app.use(express.json({ limit: '50mb' }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        connections: this.drawingService.getConnectionCount()
      });
    });

    // Auth API - get current user (protected)
    this.app.get('/api/auth/me', async (req: AuthenticatedRequest, res) => {
      const { userId } = getAuth(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // Return user ID - Clerk handles the rest
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

    // Serve React app for all routes
    this.app.get('*', (req, res) => {
      const indexPath = process.env.NODE_ENV === 'production'
        ? path.join(__dirname, '../../dist/index.html')
        : path.join(__dirname, '../../dist/index.html');
      res.sendFile(indexPath);
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      logger.info(`Client connected: ${clientId}`);
      
      this.drawingService.addConnection(clientId);

      // Send current canvas state to new client
      const currentSnapshot = this.drawingService.getCurrentSnapshot();
      if (currentSnapshot) {
        socket.emit('canvas:snapshot', currentSnapshot);
      }

      // Handle drawing strokes
      socket.on('draw:stroke', (stroke: StrokeData) => {
        if (!this.isValidStroke(stroke)) {
          logger.warn(`Invalid stroke from ${clientId}:`, stroke);
          return;
        }

        try {
          this.drawingService.addStroke(stroke);
          socket.broadcast.emit('draw:stroke', stroke);
        } catch (error) {
          logger.error(`Error processing stroke from ${clientId}:`, error);
        }
      });

      // Handle batch strokes
      socket.on('draw:strokes', (strokes: StrokeData[]) => {
        if (!Array.isArray(strokes) || strokes.length === 0) return;
        
        const validStrokes = strokes
          .slice(0, 100) // Limit batch size
          .filter(s => this.isValidStroke(s));
        
        if (validStrokes.length === 0) return;

        try {
          this.drawingService.addStrokes(validStrokes);
          socket.broadcast.emit('draw:strokes', validStrokes);
        } catch (error) {
          logger.error(`Error processing strokes batch from ${clientId}:`, error);
        }
      });

      // Handle shapes
      socket.on('draw:shape', (shape: ShapeData) => {
        if (!this.isValidShape(shape)) {
          logger.warn(`Invalid shape from ${clientId}:`, shape);
          return;
        }

        try {
          this.drawingService.addShape(shape);
          socket.broadcast.emit('draw:shape', shape);
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
          // Throttled broadcast to prevent spam
          this.drawingService.broadcastSnapshotThrottled(() => {
            socket.broadcast.emit('canvas:snapshot', snapshot);
          });
        } catch (error) {
          logger.error(`Error processing snapshot from ${clientId}:`, error);
        }
      });

      // Handle clear canvas
      socket.on('canvas:clear', () => {
        try {
          this.drawingService.clearCanvas();
          this.io.emit('canvas:clear');
          logger.info(`Canvas cleared by ${clientId}`);
        } catch (error) {
          logger.error(`Error clearing canvas from ${clientId}:`, error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.drawingService.removeConnection(clientId);
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
      this.server.listen(this.port, this.host, async () => {
        const ips = await this.getLocalIPs();
        
        logger.info('🎨 Live Draw Server Started');
        logger.info(`📍 Server running on:`);
        logger.info(`   - http://localhost:${this.port}`);
        ips.forEach(ip => logger.info(`   - http://${ip}:${this.port}`));
        logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`📊 Max connections: ${this.drawingService.getMaxConnections()}`);
        
        resolve();
      });
    });
  }

  public stop(): void {
    this.server.close();
    logger.info('Server stopped');
  }
}

// Start server
const server = new LiveDrawServer();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  server.stop();
  process.exit(0);
});

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
