import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import { SocketManager } from '@/hooks/useSocket';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

describe('SocketManager credentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses only a connection authenticated with the same credential', () => {
    const first = {
      connected: true,
      on: vi.fn(),
      disconnect: vi.fn(),
    };
    const second = {
      connected: true,
      on: vi.fn(),
      disconnect: vi.fn(),
    };
    // SAFETY: SocketManager exercises only this narrow Socket.IO surface during connection setup.
    vi.mocked(io)
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const manager = new SocketManager();

    expect(manager.connect('token-a')).toBe(first);
    expect(manager.connect('token-a')).toBe(first);
    expect(io).toHaveBeenCalledOnce();

    expect(manager.connect('token-b')).toBe(second);
    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(io).toHaveBeenCalledTimes(2);
  });

  it('disconnects and clears the active credential', () => {
    const socket = {
      connected: true,
      on: vi.fn(),
      disconnect: vi.fn(),
    };
    // SAFETY: SocketManager exercises only this narrow Socket.IO surface during connection setup.
    vi.mocked(io).mockReturnValue(socket as never);
    const manager = new SocketManager();

    manager.connect('token-a');
    manager.disconnect();
    manager.connect('token-a');

    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(io).toHaveBeenCalledTimes(2);
  });
});
