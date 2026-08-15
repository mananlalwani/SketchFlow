import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request as ExpressRequest, Response } from 'express';
import request from 'supertest';

type TestAuthRequest = { headers: { 'x-test-user'?: string } };

const mocks = vi.hoisted(() => ({
  projectService: {
    list: vi.fn(),
    create: vi.fn(),
    commitCollaborationOperation: vi.fn(),
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
vi.mock('../../services/ProjectService.js', () => ({
  ProjectService: class {
    constructor() {
      return mocks.projectService;
    }
  },
}));
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: ExpressRequest, _res: Response, next: NextFunction) => next(),
  requireAuth: () => (_req: ExpressRequest, _res: Response, next: NextFunction) => next(),
  getAuth: (req: TestAuthRequest) => ({
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

  it('rejects project payloads with more than 10,000 objects', async () => {
    const response = await request(app)
      .post('/api/projects')
      .set('x-test-user', 'owner-1')
      .send({
        title: 'Oversized board',
        data: { objects: Array.from({ length: 10_001 }, () => ({})) },
      });

    expect(response.status).toBe(400);
    expect(mocks.projectService.create).not.toHaveBeenCalled();
  });

  it('returns 413 before parsing an oversized project request body', async () => {
    const response = await request(app)
      .post('/api/projects')
      .set('x-test-user', 'owner-1')
      .send({ title: 'Too large', data: 'x'.repeat(10 * 1024 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.error).toBeTruthy();
    expect(mocks.projectService.create).not.toHaveBeenCalled();
  });

  it('passes a validated REST save through the canonical commit service', async () => {
    mocks.projectService.commitCollaborationOperation.mockResolvedValue({
      status: 'applied',
      operationId: 'operation-1',
      revision: 3,
      title: 'Board',
      data: { objects: [] },
    });
    mocks.projectService.get.mockResolvedValue({ id: 'project-1', revision: 3 });

    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'owner-1')
      .send({ title: 'Board', data: { objects: [] }, expectedRevision: 2 });

    expect(response.status).toBe(200);
    expect(mocks.projectService.commitCollaborationOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'ckz1h2abc0000qwerty123456',
        userId: 'owner-1',
        title: 'Board',
        data: { objects: [] },
        expectedRevision: 2,
        kind: 'replace-project',
      }),
    );
  });

  it('requires a revision for every project update', async () => {
    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'owner-1')
      .send({ title: 'Board', data: {} });

    expect(response.status).toBe(400);
    expect(mocks.projectService.commitCollaborationOperation).not.toHaveBeenCalled();
  });

  it('exposes a valid but unknown project ID as not found', async () => {
    mocks.projectService.commitCollaborationOperation.mockResolvedValue({
      status: 'not_found',
      operationId: 'operation-1',
    });

    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'owner-1')
      .send({ title: 'Board', data: {}, expectedRevision: 1 });

    expect(response.status).toBe(404);
  });

  it('exposes stale writes as a conflict instead of a server error', async () => {
    mocks.projectService.commitCollaborationOperation.mockResolvedValue({
      status: 'conflict',
      operationId: 'operation-1',
      currentRevision: 4,
    });

    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'owner-1')
      .send({ title: 'Board', data: {}, expectedRevision: 1 });

    expect(response.status).toBe(409);
    expect(response.body.currentRevision).toBe(4);
  });

  it('exposes denied edits as forbidden instead of a server error', async () => {
    mocks.projectService.commitCollaborationOperation.mockResolvedValue({
      status: 'forbidden',
      operationId: 'operation-1',
    });
    const response = await request(app)
      .put('/api/projects/ckz1h2abc0000qwerty123456')
      .set('x-test-user', 'viewer-1')
      .send({ title: 'Board', data: {}, expectedRevision: 1 });
    expect(response.status).toBe(403);
  });

  it.each([
    ['get', '/api/folders'],
    ['post', '/api/folders'],
    ['post', '/api/projects/ckz1h2abc0000qwerty123456/share'],
    ['post', '/api/projects/ckz1h2abc0000qwerty123456/unshare'],
    ['get', '/api/projects/ckz1h2abc0000qwerty123456/collaborators'],
  ] as const)('rejects unauthenticated %s %s requests', async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
  });

  it('returns only an active public share record', async () => {
    mocks.projectService.getByShareToken.mockResolvedValueOnce({ id: 'shared-project' });
    const active = await request(app).get(`/api/projects/shared/${'a'.repeat(43)}`);
    expect(active.status).toBe(200);

    mocks.projectService.getByShareToken.mockResolvedValueOnce(null);
    const expiredOrRevoked = await request(app).get(`/api/projects/shared/${'b'.repeat(43)}`);
    expect(expiredOrRevoked.status).toBe(404);
  });

  it('rejects guessed or malformed project identifiers before service access', async () => {
    const response = await request(app)
      .get('/api/projects/not-a-project-id')
      .set('x-test-user', 'owner-1');
    expect(response.status).toBe(400);
    expect(mocks.projectService.get).not.toHaveBeenCalled();
  });

  it('passes authenticated owner actions to the server-side service with the authenticated id', async () => {
    mocks.projectService.listFolders.mockResolvedValue([]);
    mocks.projectService.shareProject.mockResolvedValue({
      shareToken: 'a'.repeat(43),
      shareExpiresAt: Date.now() + 60_000,
    });
    mocks.projectService.getCollaborators.mockResolvedValue([]);

    await expect(
      request(app).get('/api/folders').set('x-test-user', 'owner-1'),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      request(app)
        .post('/api/projects/ckz1h2abc0000qwerty123456/share')
        .set('x-test-user', 'owner-1'),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      request(app)
        .get('/api/projects/ckz1h2abc0000qwerty123456/collaborators')
        .set('x-test-user', 'owner-1'),
    ).resolves.toMatchObject({ status: 200 });

    expect(mocks.projectService.listFolders).toHaveBeenCalledWith('owner-1');
    expect(mocks.projectService.shareProject).toHaveBeenCalledWith(
      'ckz1h2abc0000qwerty123456',
      'owner-1',
    );
    expect(mocks.projectService.getCollaborators).toHaveBeenCalledWith(
      'ckz1h2abc0000qwerty123456',
      'owner-1',
    );
  });
});
