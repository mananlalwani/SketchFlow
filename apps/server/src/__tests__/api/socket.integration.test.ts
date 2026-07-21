import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  getCollaborationSnapshot: vi.fn(),
}));

vi.mock('../../otel.js', () => ({}));
vi.mock('../../config/env.js', () => ({
  env: { CLERK_SECRET_KEY: 'test', CORS_ORIGINS: [], PORT: 0, HOST: '127.0.0.1' },
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
    cleanupCorruptCollaborators = vi.fn();
    saveCollaborationSnapshot = vi.fn();
    getCollaborationSnapshot = mocks.getCollaborationSnapshot;
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
          : { userId: null },
    })),
    users: { getUser: vi.fn(), getUserList: vi.fn() },
  },
}));

import { SketchFlowServer } from '../../index.js';

describe('Socket.IO boundary', () => {
  const sketchServer = new SketchFlowServer();
  const httpServer = sketchServer.getHttpServer();
  let url = '';
  const clients: Socket[] = [];

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server did not bind a TCP port');
    url = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => {
    clients.forEach((client) => client.disconnect());
    await sketchServer.stop();
  });

  function connect(token?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const client = io(url, { transports: ['websocket'], auth: token ? { token } : {} });
      clients.push(client);
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
    });
  }

  it('rejects a missing authentication token during the handshake', async () => {
    await expect(connect()).rejects.toThrow('Authentication required');
  });

  it('only joins a room after the server verifies view permission', async () => {
    mocks.checkPermission.mockResolvedValue(true);
    const client = await connect('valid-token');

    client.emit('room:join', 'project-1');
    await vi.waitFor(() =>
      expect(mocks.checkPermission).toHaveBeenCalledWith('project-1', 'user-1', 'view'),
    );
    await vi.waitFor(() => {
      const socket = sketchServer.getSocketServer().sockets.sockets.get(client.id);
      expect(socket?.rooms.has('project-1')).toBe(true);
    });
  });

  it('does not join a room when view permission is denied', async () => {
    mocks.checkPermission.mockResolvedValue(false);
    const client = await connect('valid-token');

    client.emit('room:join', 'private-project');
    await vi.waitFor(() =>
      expect(mocks.checkPermission).toHaveBeenCalledWith('private-project', 'user-1', 'view'),
    );
    const socket = sketchServer.getSocketServer().sockets.sockets.get(client.id);
    expect(socket?.rooms.has('private-project')).toBe(false);
  });

  it('restores a persisted snapshot after reconnecting', async () => {
    mocks.checkPermission.mockResolvedValue(true);
    mocks.getCollaborationSnapshot.mockResolvedValue({
      dataUrl: 'data:image/png;base64,recovered',
    });
    const first = await connect('valid-token');
    first.emit('room:join', 'recovery-room');
    await vi.waitFor(() =>
      expect(mocks.getCollaborationSnapshot).toHaveBeenCalledWith('recovery-room'),
    );
    first.disconnect();

    const second = await connect('valid-token');
    const snapshot = new Promise<{ dataUrl: string }>((resolve) =>
      second.once('canvas:snapshot', resolve),
    );
    second.emit('room:join', 'recovery-room');
    await expect(snapshot).resolves.toEqual({ dataUrl: 'data:image/png;base64,recovered' });
  });
});
