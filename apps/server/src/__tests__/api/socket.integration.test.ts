import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  get: vi.fn(),
  commitCollaborationOperation: vi.fn(),
}));

vi.mock('../../otel.js', () => ({}));
vi.mock('../../config/env.js', () => ({
  env: {
    CLERK_SECRET_KEY: 'test',
    CORS_ORIGINS: [],
    PORT: 0,
    HOST: '127.0.0.1',
    REDIS_URL: process.env.REDIS_TEST_URL,
  },
  isProd: false,
  clerkPublishableKey: 'pk_test',
}));
vi.mock('../../lib/prisma.js', () => ({ disconnectPrisma: vi.fn(), checkDatabaseHealth: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  Logger: { setRequestId: vi.fn() },
  getTraceContext: vi.fn(() => ({})),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), request: vi.fn() },
}));
vi.mock('../../services/ProjectService.js', () => ({
  ProjectService: class {
    checkPermission = mocks.checkPermission;
    get = mocks.get;
    commitCollaborationOperation = mocks.commitCollaborationOperation;
    cleanupCorruptCollaborators = vi.fn();
  },
}));
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: {
    authenticateRequest: vi.fn(async (request: Request) => ({
      toAuth: () =>
        request.headers.get('Authorization') === 'Bearer valid-token'
          ? { userId: 'user-1', sessionClaims: {} }
          : request.headers.get('Authorization') === 'Bearer expired-token'
            ? { userId: 'user-1', sessionClaims: { exp: Math.floor(Date.now() / 1000) - 1 } }
            : { userId: null },
    })),
    users: { getUser: vi.fn(), getUserList: vi.fn() },
  },
}));

import { SketchFlowServer } from '../../index.js';

if (process.env.RUN_REAL_INFRASTRUCTURE === '1' && !process.env.REDIS_TEST_URL) {
  throw new Error('Real infrastructure Socket.IO tests require REDIS_TEST_URL.');
}

describe('Socket.IO boundary', () => {
  const sketchServer = new SketchFlowServer();
  const httpServer = sketchServer.getHttpServer();
  let url = '';
  const clients: Socket[] = [];

  beforeAll(async () => {
    await sketchServer.waitForInfrastructure();
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    url = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      id: 'ckz1h2abc0000qwerty123456',
      title: 'Board',
      data: { objects: [] },
      revision: 1,
    });
    mocks.commitCollaborationOperation.mockResolvedValue({
      status: 'applied',
      operationId: 'operation_1234567',
      revision: 2,
      title: 'Board',
      data: { objects: [] },
    });
  });

  afterAll(async () => {
    clients.forEach((client) => client.disconnect());
    await sketchServer.stop();
  });

  function connect(token?: string, endpoint = url): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const client = io(endpoint, {
        transports: ['websocket'],
        reconnection: false,
        auth: token ? { token } : {},
      });
      clients.push(client);
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
    });
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it('rejects a missing authentication token during the handshake', async () => {
    await expect(connect()).rejects.toThrow('Authentication required');
  });

  it('does not treat a public share token as a realtime credential', async () => {
    await expect(connect('a'.repeat(43))).rejects.toThrow('Invalid authentication token');
  });

  it('disconnects an expired session immediately after handshake', async () => {
    const client = await connect('expired-token');
    await vi.waitFor(() => expect(client.connected).toBe(false));
  });

  it('only joins a room after the server verifies view permission', async () => {
    mocks.checkPermission.mockResolvedValue(true);
    const client = await connect('valid-token');

    client.emit('room:join', 'ckz1h2abc0000qwerty123456');
    await vi.waitFor(() =>
      expect(mocks.checkPermission).toHaveBeenCalledWith(
        'ckz1h2abc0000qwerty123456',
        'user-1',
        'view',
      ),
    );
    await vi.waitFor(() => {
      const socket = sketchServer.getSocketServer().sockets.sockets.get(client.id);
      expect(socket?.rooms.has('ckz1h2abc0000qwerty123456')).toBe(true);
    });
  });

  it('acknowledges and broadcasts only a persisted canonical collaboration commit', async () => {
    const projectId = 'ckz1h2abc0099qwerty123456';
    mocks.checkPermission.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      id: projectId,
      title: 'Board',
      data: { objects: [] },
      revision: 3,
    });
    mocks.commitCollaborationOperation.mockResolvedValue({
      status: 'applied',
      operationId: 'operation_1234567',
      revision: 4,
      title: 'Board',
      data: { objects: [{ id: 'shape-1' }] },
    });
    const sender = await connect('valid-token');
    const peer = await connect('valid-token');
    sender.emit('room:join', projectId);
    peer.emit('room:join', projectId);
    await vi.waitFor(() => {
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(sender.id)?.rooms.has(projectId),
      ).toBe(true);
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(peer.id)?.rooms.has(projectId),
      ).toBe(true);
    });

    const peerEvent = new Promise<unknown>((resolve) =>
      peer.once('collaboration:applied', resolve),
    );
    const acknowledgement = await new Promise<unknown>((resolve) => {
      sender.emit(
        'collaboration:commit',
        {
          protocolVersion: 1,
          projectId,
          operationId: 'operation_1234567',
          expectedRevision: 3,
          kind: 'replace-project',
          data: { objects: [{ id: 'shape-1' }] },
        },
        resolve,
      );
    });

    expect(mocks.commitCollaborationOperation).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, userId: 'user-1', expectedRevision: 3 }),
    );
    expect(acknowledgement).toMatchObject({ status: 'applied', revision: 4 });
    await expect(peerEvent).resolves.toMatchObject({ projectId, revision: 4 });
  });

  it('does not join a room when view permission is denied', async () => {
    mocks.checkPermission.mockResolvedValue(false);
    const client = await connect('valid-token');

    client.emit('room:join', 'ckz1h2abc0001qwerty123456');
    await vi.waitFor(() =>
      expect(mocks.checkPermission).toHaveBeenCalledWith(
        'ckz1h2abc0001qwerty123456',
        'user-1',
        'view',
      ),
    );
    const socket = sketchServer.getSocketServer().sockets.sockets.get(client.id);
    expect(socket?.rooms.has('ckz1h2abc0001qwerty123456')).toBe(false);
  });

  it('keeps the latest requested room when joins resolve out of order', async () => {
    const firstProject = 'ckz1h2abc0010qwerty123456';
    const secondProject = 'ckz1h2abc0011qwerty123456';
    const firstView = deferred<boolean>();
    const secondView = deferred<boolean>();
    mocks.checkPermission.mockImplementation(
      (projectId: string, _userId: string, action: string) => {
        if (action !== 'view') return Promise.resolve(false);
        if (projectId === firstProject) return firstView.promise;
        if (projectId === secondProject) return secondView.promise;
        return Promise.resolve(false);
      },
    );
    const client = await connect('valid-token');

    client.emit('room:join', firstProject);
    client.emit('room:join', secondProject);
    await vi.waitFor(() => expect(mocks.checkPermission).toHaveBeenCalledTimes(2));

    secondView.resolve(true);
    await vi.waitFor(() => {
      const socket = sketchServer.getSocketServer().sockets.sockets.get(client.id);
      expect(socket?.rooms.has(secondProject)).toBe(true);
    });

    firstView.resolve(true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const socket = sketchServer.getSocketServer().sockets.sockets.get(client.id);
    expect(socket?.rooms.has(firstProject)).toBe(false);
    expect(socket?.rooms.has(secondProject)).toBe(true);
  });

  it('invalidates a pending room join when the client leaves', async () => {
    const projectId = 'ckz1h2abc0014qwerty123456';
    const viewPermission = deferred<boolean>();
    mocks.checkPermission.mockImplementation(
      (_projectId: string, _userId: string, action: string) =>
        action === 'view' ? viewPermission.promise : Promise.resolve(false),
    );
    const client = await connect('valid-token');

    client.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(mocks.checkPermission).toHaveBeenCalledWith(projectId, 'user-1', 'view'),
    );
    client.emit('room:leave');
    viewPermission.resolve(true);

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(
      sketchServer.getSocketServer().sockets.sockets.get(client.id)?.rooms.has(projectId),
    ).toBe(false);
  });

  it('does not commit an operation after the client leaves its editable room', async () => {
    const projectId = 'ckz1h2abc0012qwerty123456';
    mocks.checkPermission.mockResolvedValue(true);
    const client = await connect('valid-token');
    client.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(client.id)?.rooms.has(projectId),
      ).toBe(true),
    );
    client.emit('room:leave');

    const acknowledgement = await new Promise<unknown>((resolve) => {
      client.emit(
        'collaboration:commit',
        {
          protocolVersion: 1,
          projectId,
          operationId: 'operation_after_leave',
          expectedRevision: 1,
          kind: 'replace-project',
          data: { objects: [] },
        },
        resolve,
      );
    });

    expect(acknowledgement).toEqual({ status: 'forbidden', operationId: 'operation_after_leave' });
    expect(mocks.commitCollaborationOperation).not.toHaveBeenCalled();
  });

  it('returns the canonical authorization result for a viewer commit', async () => {
    const projectId = 'ckz1h2abc0003qwerty123456';
    mocks.checkPermission.mockResolvedValue(true);
    mocks.commitCollaborationOperation.mockResolvedValue({
      status: 'forbidden',
      operationId: 'viewer_operation_1',
    });
    const client = await connect('valid-token');
    client.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(client.id)?.rooms.has(projectId),
      ).toBe(true),
    );

    const acknowledgement = await new Promise<unknown>((resolve) => {
      client.emit(
        'collaboration:commit',
        {
          protocolVersion: 1,
          projectId,
          operationId: 'viewer_operation_1',
          expectedRevision: 1,
          kind: 'replace-project',
          data: { objects: [] },
        },
        resolve,
      );
    });

    expect(mocks.commitCollaborationOperation).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, userId: 'user-1' }),
    );
    expect(acknowledgement).toEqual({ status: 'forbidden', operationId: 'viewer_operation_1' });
  });

  it('commits an editor operation through the canonical persistence service', async () => {
    const projectId = 'ckz1h2abc0005qwerty123456';
    mocks.checkPermission.mockResolvedValue(true);
    const client = await connect('valid-token');
    client.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(client.id)?.rooms.has(projectId),
      ).toBe(true),
    );

    const acknowledgement = await new Promise<unknown>((resolve) => {
      client.emit(
        'collaboration:commit',
        {
          protocolVersion: 1,
          projectId,
          operationId: 'editor_operation_1',
          expectedRevision: 1,
          kind: 'replace-project',
          data: { objects: [{ id: 'shape-1' }] },
        },
        resolve,
      );
    });

    expect(mocks.commitCollaborationOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        userId: 'user-1',
        operationId: 'editor_operation_1',
        expectedRevision: 1,
      }),
    );
    expect(acknowledgement).toMatchObject({ status: 'applied', revision: 2 });
  });

  it('persists a canonical operation before acknowledging or broadcasting it', async () => {
    const pendingCommit = deferred<{
      status: 'applied';
      operationId: string;
      revision: number;
      title: string;
      data: { objects: [] };
    }>();
    mocks.checkPermission.mockResolvedValue(true);
    mocks.commitCollaborationOperation.mockReturnValue(pendingCommit.promise);
    const first = await connect('valid-token');
    const second = await connect('valid-token');
    const projectId = 'ckz1h2abc0017qwerty123456';
    first.emit('room:join', projectId);
    second.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(second.id)?.rooms.has(projectId),
      ).toBe(true),
    );

    let acknowledged = false;
    let broadcast = false;
    second.once('collaboration:applied', () => {
      broadcast = true;
    });
    first.emit(
      'collaboration:commit',
      {
        protocolVersion: 1,
        projectId,
        operationId: 'pending_operation_1',
        expectedRevision: 1,
        kind: 'replace-project',
        data: { objects: [] },
      },
      () => {
        acknowledged = true;
      },
    );
    await vi.waitFor(() => expect(mocks.commitCollaborationOperation).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(acknowledged).toBe(false);
    expect(broadcast).toBe(false);

    pendingCommit.resolve({
      status: 'applied',
      operationId: 'pending_operation_1',
      revision: 2,
      title: 'Board',
      data: { objects: [] },
    });
    await vi.waitFor(() => expect(acknowledged).toBe(true));
    await vi.waitFor(() => expect(broadcast).toBe(true));
  });

  it('broadcasts an accepted canonical operation with its assigned revision', async () => {
    mocks.checkPermission.mockResolvedValue(true);
    const first = await connect('valid-token');
    const second = await connect('valid-token');
    const projectId = 'ckz1h2abc0006qwerty123456';
    first.emit('room:join', projectId);
    second.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(second.id)?.rooms.has(projectId),
      ).toBe(true),
    );

    const received = new Promise<unknown>((resolve) =>
      second.once('collaboration:applied', resolve),
    );
    first.emit(
      'collaboration:commit',
      {
        protocolVersion: 1,
        projectId,
        operationId: 'broadcast_operation_1',
        expectedRevision: 1,
        kind: 'replace-project',
        data: { objects: [{ id: 'shape-1' }] },
      },
      () => {},
    );
    await expect(received).resolves.toMatchObject({
      projectId,
      operationId: 'operation_1234567',
      revision: 2,
      kind: 'replace-project',
    });
  });

  it('broadcasts per-device selection presence without persisting a project edit', async () => {
    mocks.checkPermission.mockResolvedValue(true);
    const first = await connect('valid-token');
    const second = await connect('valid-token');
    const projectId = 'ckz1h2abc0018qwerty123456';
    first.emit('room:join', projectId);
    second.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(second.id)?.rooms.has(projectId),
      ).toBe(true),
    );

    const received = new Promise<unknown>((resolve) => second.once('selection:change', resolve));
    first.emit('selection:change', {
      userId: 'user-1',
      username: 'Same account, second device',
      objectIds: ['shape-1', 'stroke-1'],
      color: '#000000',
    });
    await expect(received).resolves.toMatchObject({
      clientId: first.id,
      userId: 'user-1',
      objectIds: ['shape-1', 'stroke-1'],
    });
    expect(mocks.commitCollaborationOperation).not.toHaveBeenCalled();

    const left = new Promise<string>((resolve) => second.once('selection:leave', resolve));
    first.emit('selection:change', {
      userId: 'user-1',
      username: 'Same account, second device',
      objectIds: [],
      color: '#000000',
    });
    await expect(left).resolves.toBe(first.id);
  });

  it('broadcasts consecutive accepted operations in assigned revision order', async () => {
    mocks.checkPermission.mockResolvedValue(true);
    mocks.commitCollaborationOperation
      .mockResolvedValueOnce({
        status: 'applied',
        operationId: 'first_operation',
        revision: 2,
        title: 'Board',
        data: { objects: [{ id: 'first' }] },
      })
      .mockResolvedValueOnce({
        status: 'applied',
        operationId: 'second_operation',
        revision: 3,
        title: 'Board',
        data: { objects: [{ id: 'second' }] },
      });
    const first = await connect('valid-token');
    const second = await connect('valid-token');
    const projectId = 'ckz1h2abc0007qwerty123456';
    first.emit('room:join', projectId);
    second.emit('room:join', projectId);
    await vi.waitFor(() =>
      expect(
        sketchServer.getSocketServer().sockets.sockets.get(second.id)?.rooms.has(projectId),
      ).toBe(true),
    );

    const revisions: number[] = [];
    const complete = new Promise<void>((resolve) => {
      second.on('collaboration:applied', (event: { revision: number }) => {
        revisions.push(event.revision);
        if (revisions.length === 2) resolve();
      });
    });
    for (const [operationId, expectedRevision] of [
      ['first_operation', 1],
      ['second_operation', 2],
    ] as const) {
      first.emit(
        'collaboration:commit',
        {
          protocolVersion: 1,
          projectId,
          operationId,
          expectedRevision,
          kind: 'replace-project',
          data: { objects: [] },
        },
        () => {},
      );
    }
    await complete;
    expect(revisions).toEqual([2, 3]);
  });

  if (process.env.REDIS_TEST_URL) {
    it('delivers a room mutation across Redis-backed server instances', async () => {
      mocks.checkPermission.mockResolvedValue(true);
      const otherServer = new SketchFlowServer();
      const otherHttp = otherServer.getHttpServer();

      try {
        await otherServer.waitForInfrastructure();
        await new Promise<void>((resolve) => otherHttp.listen(0, '127.0.0.1', resolve));
        const address = otherHttp.address();
        if (!address || typeof address === 'string') throw new Error('Second server did not bind');
        const otherUrl = `http://127.0.0.1:${address.port}`;
        const first = await connect('valid-token');
        const second = await connect('valid-token', otherUrl);
        const projectId = 'ckz1h2abc0008qwerty123456';
        const joinRoom = (client: Socket) => {
          const hydrated = new Promise<unknown>((resolve) =>
            client.once('collaboration:hydrated', resolve),
          );
          client.emit('room:join', projectId);
          return hydrated;
        };
        await Promise.all([joinRoom(first), joinRoom(second)]);
        const received = new Promise<unknown>((resolve) =>
          second.once('collaboration:applied', resolve),
        );
        first.emit(
          'collaboration:commit',
          {
            protocolVersion: 1,
            projectId,
            operationId: 'redis_operation_1',
            expectedRevision: 1,
            kind: 'replace-project',
            data: { objects: [] },
          },
          () => {},
        );
        await expect(received).resolves.toMatchObject({ projectId, revision: 2 });
      } finally {
        await otherServer.stop();
      }
    });
  }

  it('returns an explicit 429 error when cursor events exceed the rate limit', async () => {
    mocks.checkPermission.mockResolvedValue(true);
    const client = await connect('valid-token');
    client.emit('room:join', 'ckz1h2abc0004qwerty123456');
    await vi.waitFor(() => expect(mocks.checkPermission).toHaveBeenCalled());

    const limited = new Promise<{ status: number; error: string }>((resolve) =>
      client.once('error', resolve),
    );
    for (let index = 0; index < 61; index++) {
      client.emit('cursor:move', {
        userId: 'user-1',
        username: 'User',
        x: index,
        y: 0,
        color: '#000000',
      });
    }
    await expect(limited).resolves.toEqual({ status: 429, error: 'Cursor rate limit exceeded' });
  });

  it('rejects a malformed room id before attempting a permission lookup', async () => {
    const client = await connect('valid-token');
    client.emit('room:join', 'not a valid project id');

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(mocks.checkPermission).not.toHaveBeenCalled();
    const socket = sketchServer.getSocketServer().sockets.sockets.get(client.id);
    expect(socket?.rooms.has('not a valid project id')).toBe(false);
  });

  it('hydrates a reconnecting client from the canonical project record', async () => {
    const projectId = 'ckz1h2abc0002qwerty123456';
    mocks.checkPermission.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      id: projectId,
      title: 'Recovered board',
      data: { objects: [{ id: 'recovered-shape' }] },
      revision: 7,
    });
    const first = await connect('valid-token');
    first.emit('room:join', projectId);
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledWith(projectId, 'user-1'));
    first.disconnect();

    const second = await connect('valid-token');
    const hydrated = new Promise<unknown>((resolve) =>
      second.once('collaboration:hydrated', resolve),
    );
    second.emit('room:join', projectId);
    await expect(hydrated).resolves.toEqual({
      projectId,
      revision: 7,
      title: 'Recovered board',
      data: { objects: [{ id: 'recovered-shape' }] },
    });
  });
});
