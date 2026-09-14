import fs from 'fs';

if (process.env.NODE_ENV !== 'production') {
  const dotenvPath = process.cwd() + '/node_modules/dotenv';
  if (fs.existsSync(dotenvPath)) {
    try {
      await import('dotenv/config');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('dotenv not loaded (continuing without .env):', String(e));
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('dotenv package not found in node_modules — skipping loading .env');
  }
}

import { initSentry } from './sentry.js';
initSentry();

import './otel.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import cookieParser from 'cookie-parser';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { ConnectionRegistry } from './services/ConnectionRegistry.js';
import { FolderService } from './services/FolderService.js';
import { ProjectCollaboratorService } from './services/ProjectCollaboratorService.js';
import { ProjectShareService } from './services/ProjectShareService.js';
import { ProjectService } from './services/ProjectService.js';
import { logger } from './utils/logger.js';
import { env, isProd, clerkPublishableKey } from './config/env.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';
import { registerFolderRoutes } from './routes/folders.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerProjectRoutes } from './routes/projects.js';
import { renderDrawApiPage, renderDrawApiScript } from './routes/drawApi.js';
import type { AuthenticatedRequest } from './types/http.js';
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
  securityHeadersMiddleware,
  rateLimitMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
} from './middleware/index.js';
import type { ClientToServerEvents, ServerToClientEvents } from './types/socket.js';
import {
  evictProjectUser as disconnectProjectUserSockets,
  registerCollaborationSockets,
  type PresenceSocketData,
} from './realtime/collaborationSocket.js';

export class SketchFlowServer {
  private readonly roomEvictionHandlers = new Map<string, () => void>();
  private app = express();
  private server = createServer(this.app);
  private io: SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    PresenceSocketData
  >;
  private connectionRegistry = new ConnectionRegistry(200);
  private projectService = new ProjectService();
  private folderService = new FolderService();
  private shareService = new ProjectShareService();
  private collaboratorService = new ProjectCollaboratorService();
  private isShuttingDown = false;
  private redisPublisher: { quit: () => Promise<string> } | null = null;
  private redisSubscriber: { quit: () => Promise<string> } | null = null;
  private redisSetup: Promise<void> = Promise.resolve();
  private shutdownPromise: Promise<void> | null = null;

  constructor() {
    // Configure CORS origins for Socket.IO
    // Production requires configured origins. Local development uses an explicit
    // Vite allow-list instead of reflecting arbitrary credentialed origins.
    const corsOrigins =
      env.CORS_ORIGINS.length > 0
        ? env.CORS_ORIGINS
        : ['http://localhost:5173', 'http://127.0.0.1:5173'];

    this.io = new SocketIOServer<
      ClientToServerEvents,
      ServerToClientEvents,
      Record<string, never>,
      PresenceSocketData
    >(this.server, {
      cors: {
        origin: corsOrigins,
        credentials: true,
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
    this.redisSetup = this.setupRedisAdapter();
  }

  private async setupRedisAdapter(): Promise<void> {
    if (!env.REDIS_URL) {
      logger.info('Redis adapter disabled; Socket.IO is limited to one server instance');
      return;
    }

    const publisher = createClient({ url: env.REDIS_URL });
    const subscriber = publisher.duplicate();
    publisher.on('error', (error) => logger.error('Redis publisher error', error));
    subscriber.on('error', (error) => logger.error('Redis subscriber error', error));

    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
      this.io.adapter(createAdapter(publisher, subscriber));
      this.redisPublisher = publisher;
      this.redisSubscriber = subscriber;
      logger.info('Socket.IO Redis adapter connected');
    } catch (error) {
      await Promise.allSettled([publisher.disconnect(), subscriber.disconnect()]);
      if (env.SOCKET_INSTANCE_COUNT > 1) {
        throw new Error('Redis is required for multi-instance Socket.IO deployments', {
          cause: error,
        });
      }
      logger.error(
        'Socket.IO Redis adapter unavailable; continuing in explicit single-instance mode',
        error,
      );
    }
  }

  private setupMiddleware(): void {
    // CORS middleware (must be before all routes/static)
    // In development, allow all origins with credentials (reflective origin)
    const corsOrigins =
      isProd && env.CORS_ORIGINS && env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true;

    this.app.use(
      cors({
        origin: corsOrigins,
        credentials: true,
      }),
    );
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
      namespace: 'auth',
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30, // 30 requests per minute
    });

    // Apply rate limiting to auth-heavy endpoints
    this.app.use('/api/auth', authRateLimiter);
    this.app.use('/api/projects/:id/collaborators', authRateLimiter);

    this.app.use(
      '/api',
      rateLimitMiddleware({ namespace: 'api', windowMs: 60 * 1000, maxRequests: 120 }),
    );

    // Authentication applies to API routes. Keeping liveness probes and static
    // assets outside Clerk makes container health checks independent of Clerk.
    const clerk = clerkMiddleware({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: clerkPublishableKey,
    });
    this.app.use((req, res, next) => {
      if (!req.path.startsWith('/api/')) return next();
      if (
        req.path === '/api/health' ||
        req.path === '/api/healthz' ||
        req.path === '/api/readyz' ||
        req.path.startsWith('/api/projects/shared/')
      )
        return next();
      return clerk(req, res, next);
    });

    // Keep the hidden DrawAPI page on the server; the normal app is served below.
    this.app.get('/', (req, res, next) => {
      if (req.hostname !== 'drawapi.mananlalwani.com') return next();
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
      );
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.type('html').send(renderDrawApiPage());
    });

    this.app.get('/drawapi.js', (req, res, next) => {
      if (req.hostname !== 'drawapi.mananlalwani.com') return next();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.type('js').send(renderDrawApiScript());
    });

    // Body parsing with limits
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes(): void {
    registerHealthRoutes(this.app, {
      connectionCount: () => this.connectionRegistry.count(),
      isShuttingDown: () => this.isShuttingDown,
    });

    this.app.get('/api/config', (_req, res) => {
      res.json({ clerkPublishableKey });
    });

    this.app.get('/api/drawapi/counter', async (_req, res) => {
      try {
        const counter = await prisma.drawApiCounter.upsert({
          where: { id: 'global' },
          create: { id: 'global' },
          update: {},
        });
        res.json({ clicks: counter.clicks });
      } catch {
        res.status(500).json({ error: 'Could not load the collective click count' });
      }
    });

    this.app.post('/api/drawapi/counter', async (_req, res) => {
      try {
        const counter = await prisma.drawApiCounter.upsert({
          where: { id: 'global' },
          create: { id: 'global', clicks: 1 },
          update: { clicks: { increment: 1 } },
        });
        res.json({ clicks: counter.clicks });
      } catch {
        res.status(500).json({ error: 'Could not record the collective click' });
      }
    });

    this.app.get('/api/auth/me', async (req: AuthenticatedRequest, res) => {
      const { userId } = getAuth(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.json({ userId });
    });

    registerProjectRoutes(this.app, {
      projects: this.projectService,
      folders: this.folderService,
      shares: this.shareService,
      collaborators: this.collaboratorService,
      io: this.io,
      evictProjectUser: (projectId, userId) => this.evictProjectUser(projectId, userId),
    });
    registerFolderRoutes(this.app, this.folderService);
    this.app.use('/api', notFoundMiddleware);
    this.app.use(errorHandlerMiddleware);
  }

  private setupSocketHandlers(): void {
    registerCollaborationSockets({
      io: this.io,
      projects: this.projectService,
      connectionRegistry: this.connectionRegistry,
      roomEvictionHandlers: this.roomEvictionHandlers,
    });
  }

  private async evictProjectUser(projectId: string, userId: string): Promise<void> {
    await disconnectProjectUserSockets(this.io, this.roomEvictionHandlers, projectId, userId);
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

  /** Wait until optional infrastructure is configured before accepting test traffic. */
  public async waitForInfrastructure(): Promise<void> {
    await this.redisSetup;
  }

  public async start(): Promise<void> {
    // Do not accept traffic from a scaled deployment until the Redis adapter is
    // connected. Falling back would silently split collaboration rooms.
    await this.waitForInfrastructure();
    return new Promise((resolve) => {
      this.server.listen(env.PORT, env.HOST, async () => {
        const ips = await this.getLocalIPs();

        logger.info('SketchFlow Server Started', {
          port: env.PORT,
          host: env.HOST,
          environment: env.NODE_ENV,
          maxConnections: this.connectionRegistry.max(),
        });

        logger.info(`Server running on:`);
        logger.info(`   - http://localhost:${env.PORT}`);
        ips.forEach((ip) => logger.info(`   - http://${ip}:${env.PORT}`));

        // Log configured CORS origins for verification in production
        try {
          const corsInfo =
            Array.isArray(env.CORS_ORIGINS) && env.CORS_ORIGINS.length > 0
              ? env.CORS_ORIGINS
              : process.env.CORS_ORIGINS
                ? process.env.CORS_ORIGINS.split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : ['*'];
          logger.info('Configured CORS origins', { corsOrigins: corsInfo });
        } catch (e) {
          logger.warn('Failed to parse CORS_ORIGINS for logging', { error: String(e) });
        }

        // Clean up any corrupt collaborator data on startup
        logger.info('Running collaborator data cleanup...');
        await this.collaboratorService.cleanupCorruptCollaborators();

        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.stopOnce();
    return this.shutdownPromise;
  }

  private async stopOnce(): Promise<void> {
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
