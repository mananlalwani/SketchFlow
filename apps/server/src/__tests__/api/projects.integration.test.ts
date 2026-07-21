import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  projectService: {
    list: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    getByShareToken: vi.fn(),
    shareProject: vi.fn(),
    unshareProject: vi.fn(),
    getCollaborators: vi.fn(),
    addCollaborator: vi.fn(),
    removeCollaborator: vi.fn(),
    moveToFolder: vi.fn(),
    listFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    checkPermission: vi.fn(),
    cleanupCorruptCollaborators: vi.fn(),
    saveCollaborationSnapshot: vi.fn(),
    getCollaborationSnapshot: vi.fn(),
  },
}));

vi.mock('../../otel.js', () => ({}));
vi.mock('../../config/env.js', () => ({
  env: { CLERK_SECRET_KEY: 'test', CORS_ORIGINS: [], PORT: 0, HOST: '127.0.0.1' },
  isProd: false,
  clerkPublishableKey: 'pk_test',
}));
vi.mock('../../lib/prisma.js', () => ({
  disconnectPrisma: vi.fn(),
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../utils/logger.js', () => ({
  Logger: { setRequestId: vi.fn() },
  getTraceContext: vi.fn(() => ({})),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn() },
}));
vi.mock('../../services/DrawingService.js', () => ({
  DrawingService: class {
    getConnectionCount() {
      return 0;
    }
    getMaxConnections() {
      return 50;
    }
  },
}));
vi.mock('../../services/ProjectService.js', () => ({
  ProjectService: class {
    constructor() {
      return mocks.projectService;
    }
  },
}));
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string | undefined> }) => ({
    userId: req.headers['x-test-user'] ?? null,
  }),
  clerkClient: { users: { getUser: vi.fn(), getUserList: vi.fn() } },
}));

import { SketchFlowServer } from '../../index.js';

describe('project REST boundary', () => {
  const app = new SketchFlowServer().getApp();

  beforeEach(() => vi.clearAllMocks());

  it('rejects an unauthenticated project list before calling the service', async () => {
    const response = await request(app).get('/api/projects');
    expect(response.status).toBe(401);
    expect(mocks.projectService.list).not.toHaveBeenCalled();
  });

  it('rejects malformed project payloads at the HTTP boundary', async () => {
    const response = await request(app)
      .post('/api/projects')
      .set('x-test-user', 'user-1')
      .send({ title: '', data: {}, injected: true });

    expect(response.status).toBe(400);
    expect(mocks.projectService.create).not.toHaveBeenCalled();
  });

  it('passes a validated save through with its authenticated owner and revision', async () => {
    mocks.projectService.save.mockResolvedValue({ id: 'project-1', revision: 3 });

    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'owner-1')
      .send({ title: 'Board', data: { objects: [] }, expectedRevision: 2 });

    expect(response.status).toBe(200);
    expect(mocks.projectService.save).toHaveBeenCalledWith(
      'ckz1h2abc0000qwerty123456',
      'owner-1',
      'Board',
      { objects: [] },
      2,
    );
  });

  it('exposes stale writes as a conflict instead of a server error', async () => {
    mocks.projectService.save.mockRejectedValue(
      Object.assign(new Error('Project has changed'), {
        name: 'ProjectConflictError',
      }),
    );

    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'owner-1')
      .send({ title: 'Board', data: {}, expectedRevision: 1 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Project has changed');
  });

  it('exposes denied edits as forbidden instead of a server error', async () => {
    mocks.projectService.save.mockRejectedValue(
      Object.assign(new Error('No permission to edit this project'), {
        name: 'ProjectAccessError',
      }),
    );
    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'viewer-1')
      .send({ title: 'Board', data: {}, expectedRevision: 1 });
    expect(response.status).toBe(403);
  });
});
