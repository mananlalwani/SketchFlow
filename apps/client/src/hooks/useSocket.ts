import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';
import { clientEnv } from '@/config/env';
import type {
  CollaborationCommit,
  CollaborationCommitResult,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@/types/socket';

type SocketInstance = Socket<ServerToClientEvents, ClientToServerEvents>;
type ServerListenerArgs = {
  [Event in keyof ServerToClientEvents]: [event: Event, callback: ServerToClientEvents[Event]];
}[keyof ServerToClientEvents];
type OptionalServerListenerArgs = {
  [Event in keyof ServerToClientEvents]: [event: Event, callback?: ServerToClientEvents[Event]];
}[keyof ServerToClientEvents];

const resolveSocketBaseUrl = () => {
  // Prefer VITE_WS_URL, then VITE_API_URL, then VITE_SOCKET_BASE_URL, then fallback

  const wsUrl = clientEnv.WS_URL;
  if (wsUrl) {
    // const msg = '[Socket] Using VITE_WS_URL: ' + wsUrl.replace(/\/$/, '');
    // alert(msg);
    // console.log(msg);
    return wsUrl.replace(/\/$/, '');
  }

  const apiUrl = clientEnv.API_URL;
  if (apiUrl) {
    // const msg = '[Socket] Using VITE_API_URL: ' + apiUrl.replace(/\/$/, '');
    // alert(msg);
    // console.log(msg);
    return apiUrl.replace(/\/$/, '');
  }

  const override = clientEnv.SOCKET_URL;
  if (override) {
    // console.log('[Socket] Using VITE_SOCKET_BASE_URL:', override.replace(/\/$/, ''));
    return override.replace(/\/$/, '');
  }

  const fallbackPort = clientEnv.SERVER_PORT;

  if (globalThis.window === undefined) {
    // console.log('[Socket] Using SSR fallback URL:', `http://localhost:${fallbackPort}`);
    return `http://localhost:${fallbackPort}`;
  }

  const currentOrigin = window.location.origin.replace(/\/$/, '');
  const desiredPort = clientEnv.SERVER_PORT;

  if (desiredPort && desiredPort !== window.location.port) {
    const url = `${window.location.protocol}//${window.location.hostname}:${desiredPort}`;
    // console.log('[Socket] Using desired port URL:', url);
    return url;
  }

  // console.log('[Socket] Using current origin for socket:', currentOrigin);
  return currentOrigin;
};

export class SocketManager {
  private socket: SocketInstance | null = null;
  private credential: string | null = null;
  private connectionListeners = new Set<(connected: boolean) => void>();
  private errorListeners = new Set<(error: Error) => void>();
  private isConnected = false;

  connect(token: string) {
    if (this.socket?.connected && this.credential === token) return this.socket;

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.credential = null;
      this.isConnected = false;
    }

    const url = resolveSocketBaseUrl();

    this.socket = io(url, {
      auth: { token },
      // Prefer WebSocket for low-latency collaboration, but retain Socket.IO
      // polling as a safe fallback when a proxy, browser extension, or network
      // path interrupts the WebSocket handshake.
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 15000,
      reconnectionAttempts: 8,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      autoConnect: true,
    });
    this.credential = token;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.notifyConnectionListeners(true);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.notifyConnectionListeners(false);
      // Log disconnect for debugging, but don't spam console
      if (reason !== 'io client disconnect') {
        console.debug('Disconnected:', reason);
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.notifyErrorListeners(error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.credential = null;
      this.isConnected = false;
    }
  }

  emit<T extends keyof ClientToServerEvents>(
    event: T,
    ...args: Parameters<ClientToServerEvents[T]>
  ) {
    if (this.socket?.connected) {
      this.socket.emit(event, ...args);
    }
  }

  on(...args: ServerListenerArgs) {
    if (!this.socket) return;
    switch (args[0]) {
      case 'connection:count':
        this.socket.on(args[0], args[1]);
        break;
      case 'cursor:move':
        this.socket.on(args[0], args[1]);
        break;
      case 'cursor:join':
        this.socket.on(args[0], args[1]);
        break;
      case 'cursor:leave':
        this.socket.on(args[0], args[1]);
        break;
      case 'cursors:all':
        this.socket.on(args[0], args[1]);
        break;
      case 'selection:change':
        this.socket.on(args[0], args[1]);
        break;
      case 'selection:leave':
        this.socket.on(args[0], args[1]);
        break;
      case 'selections:all':
        this.socket.on(args[0], args[1]);
        break;
      case 'collaboration:hydrated':
        this.socket.on(args[0], args[1]);
        break;
      case 'collaboration:applied':
        this.socket.on(args[0], args[1]);
        break;
      case 'error':
        this.socket.on(args[0], args[1]);
        break;
    }
  }

  off(...args: OptionalServerListenerArgs) {
    if (!this.socket) return;
    switch (args[0]) {
      case 'connection:count':
        this.socket.off(args[0], args[1]);
        break;
      case 'cursor:move':
        this.socket.off(args[0], args[1]);
        break;
      case 'cursor:join':
        this.socket.off(args[0], args[1]);
        break;
      case 'cursor:leave':
        this.socket.off(args[0], args[1]);
        break;
      case 'cursors:all':
        this.socket.off(args[0], args[1]);
        break;
      case 'selection:change':
        this.socket.off(args[0], args[1]);
        break;
      case 'selection:leave':
        this.socket.off(args[0], args[1]);
        break;
      case 'selections:all':
        this.socket.off(args[0], args[1]);
        break;
      case 'collaboration:hydrated':
        this.socket.off(args[0], args[1]);
        break;
      case 'collaboration:applied':
        this.socket.off(args[0], args[1]);
        break;
      case 'error':
        this.socket.off(args[0], args[1]);
        break;
    }
  }

  subscribeConnection(callback: (connected: boolean) => void) {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  subscribeError(callback: (error: Error) => void) {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  private notifyConnectionListeners(connected: boolean) {
    this.connectionListeners.forEach((callback) => callback(connected));
  }

  private notifyErrorListeners(error: Error) {
    this.errorListeners.forEach((callback) => callback(error));
  }

  getConnectionStatus() {
    return this.isConnected;
  }

  reconnect(token: string) {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.credential = null;
      this.isConnected = false;
    }
    return this.connect(token);
  }
}

const socketManager = new SocketManager();

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const [connectionCount, setConnectionCount] = useState(1);
  const wasConnectedRef = React.useRef(false);
  const { user, isGuest, isAuthenticated, getToken } = useAuthStore();

  useEffect(() => {
    let disposed = false;
    if (isGuest || !isAuthenticated) {
      socketManager.disconnect();
      setIsConnected(false);
      return;
    }

    let socket: SocketInstance | null = null;

    const unsubscribeConnect = socketManager.subscribeConnection((connected) => {
      const wasConnected = wasConnectedRef.current;
      setIsConnected(connected);
      wasConnectedRef.current = connected;
      if (connected && !wasConnected) {
        setConnectionError(null);
      }
    });

    const unsubscribeError = socketManager.subscribeError((error) => {
      setConnectionError(error);
    });

    void getToken().then((token) => {
      if (disposed || !token) return;
      socket = socketManager.connect(token);
      socket.on('connection:count', (count: number) => setConnectionCount(count));
      setIsConnected(socketManager.getConnectionStatus());
    });

    return () => {
      unsubscribeConnect();
      unsubscribeError();
      disposed = true;
      if (socket) {
        socket.off('connection:count');
      }
    };
  }, [user?.id, isGuest, isAuthenticated, getToken]);

  const emit = useCallback(
    <T extends keyof ClientToServerEvents>(
      event: T,
      ...args: Parameters<ClientToServerEvents[T]>
    ) => {
      socketManager.emit(event, ...args);
    },
    [],
  );

  const on = useCallback((...args: ServerListenerArgs) => {
    socketManager.on(...args);
    return () => socketManager.off(...args);
  }, []);

  const reconnect = useCallback(() => {
    void getToken().then((token) => {
      if (token) socketManager.reconnect(token);
    });
  }, [getToken]);

  return {
    isConnected,
    connectionError,
    connectionCount,
    emit,
    on,
    reconnect,
    socket: socketManager,
  };
};

// Specific hooks for drawing operations
export const useDrawingSocket = () => {
  const { emit, on, isConnected } = useSocket();

  const requestCanonicalHydration = useCallback(
    (projectId: string) => {
      emit('room:join', projectId);
    },
    [emit],
  );

  const commitCollaboration = useCallback(
    (commit: CollaborationCommit, acknowledge: (result: CollaborationCommitResult) => void) => {
      emit('collaboration:commit', commit, acknowledge);
    },
    [emit],
  );

  return {
    requestCanonicalHydration,
    commitCollaboration,
    isConnected,
    on,
  };
};
