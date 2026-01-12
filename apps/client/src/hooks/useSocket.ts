import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';
import type { ServerToClientEvents, ClientToServerEvents, StrokeData, ShapeData, CanvasSnapshot } from '@/types/socket';

type SocketInstance = Socket<ServerToClientEvents, ClientToServerEvents>;

type ListenerCallback = (data: unknown) => void;

type Env = {
  env?: {
    DEV?: boolean;
    VITE_SOCKET_BASE_URL?: string;
    VITE_SERVER_PORT?: string;
    VITE_WS_URL?: string;
    VITE_API_URL?: string;
  };
};

const socketEnv = import.meta as unknown as Env;

const resolveSocketBaseUrl = () => {
  // Prefer VITE_WS_URL, then VITE_API_URL, then VITE_SOCKET_BASE_URL, then fallback
  const wsUrl = (import.meta.env && import.meta.env.VITE_WS_URL) || socketEnv.env?.VITE_WS_URL;
  if (wsUrl) {
    console.log('[Socket] Using VITE_WS_URL:', wsUrl.replace(/\/$/, ''));
    return wsUrl.replace(/\/$/, '');
  }

  const apiUrl = (import.meta.env && import.meta.env.VITE_API_URL) || socketEnv.env?.VITE_API_URL;
  if (apiUrl) {
    console.log('[Socket] Using VITE_API_URL:', apiUrl.replace(/\/$/, ''));
    return apiUrl.replace(/\/$/, '');
  }

  const override = socketEnv.env?.VITE_SOCKET_BASE_URL;
  if (override) {
    console.log('[Socket] Using VITE_SOCKET_BASE_URL:', override.replace(/\/$/, ''));
    return override.replace(/\/$/, '');
  }

  const fallbackPort = socketEnv.env?.VITE_SERVER_PORT || '3000';

  if (typeof window === 'undefined') {
    console.log('[Socket] Using SSR fallback URL:', `http://localhost:${fallbackPort}`);
    return `http://localhost:${fallbackPort}`;
  }

  const currentOrigin = window.location.origin.replace(/\/$/, '');
  const desiredPort = socketEnv.env?.VITE_SERVER_PORT;

  if (desiredPort && desiredPort !== window.location.port) {
    const url = `${window.location.protocol}//${window.location.hostname}:${desiredPort}`;
    console.log('[Socket] Using desired port URL:', url);
    return url;
  }

  console.log('[Socket] Using current origin for socket:', currentOrigin);
  return currentOrigin;
};

class SocketManager {
  private socket: SocketInstance | null = null;
  private listeners: Map<string, Set<ListenerCallback>> = new Map();
  private isConnected = false;

  connect() {
    if (this.socket?.connected) return this.socket;

    const url = resolveSocketBaseUrl();

    this.socket = io(url, {
      transports: ['websocket'],
      upgrade: false,
      rememberUpgrade: true,
      timeout: 15000,
      reconnectionAttempts: 8,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      autoConnect: true
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.notifyListeners('connect', true);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.notifyListeners('connect', false);
      // Log disconnect for debugging, but don't spam console
      if (reason !== 'io client disconnect') {
        console.debug('Disconnected:', reason);
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.notifyListeners('error', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  emit<T extends keyof ClientToServerEvents>(
    event: T,
    ...args: Parameters<ClientToServerEvents[T]>
  ) {
    if (this.socket?.connected) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.socket as any).emit(event, ...args);
    }
  }

  on<T extends keyof ServerToClientEvents>(
    event: T,
    callback: ServerToClientEvents[T]
  ) {
    if (this.socket) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.socket as any).on(event, callback as any);
    }
  }

  off<T extends keyof ServerToClientEvents>(
    event: T,
    callback?: ServerToClientEvents[T]
  ) {
    if (this.socket) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.socket as any).off(event, callback as any);
    }
  }

  subscribe(event: string, callback: ListenerCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
        if (eventListeners.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  private notifyListeners(event: string, data: unknown) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data));
    }
  }

  getConnectionStatus() {
    return this.isConnected;
  }

  reconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
    return this.connect();
  }
}

const socketManager = new SocketManager();

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const [connectionCount, setConnectionCount] = useState(1);
  const wasConnectedRef = React.useRef(false);
  const { isGuest } = useAuthStore();

  useEffect(() => {
    // Don't connect socket for guests
    if (isGuest) {
      setIsConnected(false);
      return;
    }

    const socket = socketManager.connect();
    
    const unsubscribeConnect = socketManager.subscribe('connect', (data: unknown) => {
      const connected = data as boolean;
      const wasConnected = wasConnectedRef.current;
      setIsConnected(connected);
      wasConnectedRef.current = connected;
      if (connected && !wasConnected) {
        setConnectionError(null);
      }
    });
    
    const unsubscribeError = socketManager.subscribe('error', (data: unknown) => {
      const error = data as Error;
      setConnectionError(error);
    });

    // Listen for connection count updates
    if (socket) {
      socket.on('connection:count', (count: number) => {
        setConnectionCount(count);
      });
    }

    setIsConnected(socketManager.getConnectionStatus());

    return () => {
      unsubscribeConnect();
      unsubscribeError();
      if (socket) {
        socket.off('connection:count');
      }
    };
  }, [isGuest]);

  const emit = useCallback(<T extends keyof ClientToServerEvents>(
    event: T,
    ...args: Parameters<ClientToServerEvents[T]>
  ) => {
    // Don't emit for guests
    if (isGuest) return;
    socketManager.emit(event, ...args);
  }, [isGuest]);

  const on = useCallback(<T extends keyof ServerToClientEvents>(
    event: T,
    callback: ServerToClientEvents[T]
  ) => {
    // Mock listener for guests - never calls callback
    if (isGuest) {
      return () => {}; // Return no-op cleanup
    }
    socketManager.on(event, callback);
    return () => socketManager.off(event, callback);
  }, [isGuest]);

  const reconnect = useCallback(() => {
    // Don't reconnect for guests
    if (isGuest) return;
    socketManager.reconnect();
  }, [isGuest]);

  return {
    isConnected,
    connectionError,
    connectionCount,
    emit,
    on,
    reconnect,
    socket: socketManager
  };
};

// Specific hooks for drawing operations
export const useDrawingSocket = () => {
  const { emit, on } = useSocket();

  const emitStroke = useCallback((stroke: StrokeData) => {
    emit('draw:stroke', stroke);
  }, [emit]);

  const emitStrokes = useCallback((strokes: StrokeData[]) => {
    emit('draw:strokes', strokes);
  }, [emit]);

  const emitShape = useCallback((shape: ShapeData) => {
    emit('draw:shape', shape);
  }, [emit]);

  const emitSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    emit('canvas:snapshot', snapshot);
  }, [emit]);

  const emitClear = useCallback(() => {
    emit('canvas:clear');
  }, [emit]);

  return {
    emitStroke,
    emitStrokes,
    emitShape,
    emitSnapshot,
    emitClear,
    on
  };
};
