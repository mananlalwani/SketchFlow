import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';
import { useAuthStore } from '@/store/authStore';
import type { CursorData } from '@/types/socket';

export function useLiveCursors(projectId: string | null) {
  const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());
  const { emit, on, isConnected } = useSocket();
  const { user, isAuthenticated } = useAuthStore();
  const lastEmitTime = useRef<number>(0);
  const THROTTLE_MS = 33; // ~30fps

  // Join room when project changes
  useEffect(() => {
    if (!isAuthenticated || !isConnected || !projectId) return;

    emit('room:join', projectId);

    return () => {
      emit('room:leave');
    };
  }, [projectId, isAuthenticated, isConnected, emit]);

  // Listen for cursor events
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribeMove = on('cursor:move', (cursor: CursorData) => {
      setCursors(prev => {
        const next = new Map(prev);
        next.set(cursor.userId, cursor);
        return next;
      });
    });

    const unsubscribeJoin = on('cursor:join', (cursor: CursorData) => {
      setCursors(prev => {
        const next = new Map(prev);
        next.set(cursor.userId, cursor);
        return next;
      });
    });

    const unsubscribeLeave = on('cursor:leave', (userId: string) => {
      setCursors(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    const unsubscribeAll = on('cursors:all', (allCursors: CursorData[]) => {
      setCursors(new Map(allCursors.map(c => [c.userId, c])));
    });

    return () => {
      unsubscribeMove();
      unsubscribeJoin();
      unsubscribeLeave();
      unsubscribeAll();
    };
  }, [on, isAuthenticated]);

  // Emit cursor position (throttled)
  const emitCursor = useCallback((x: number, y: number) => {
    if (!isAuthenticated || !isConnected || !user || !projectId) return;

    const now = Date.now();
    if (now - lastEmitTime.current < THROTTLE_MS) return;
    lastEmitTime.current = now;

    const cursorData: CursorData = {
      userId: user.id,
      username: user.username,
      x,
      y,
      color: '', // Server will assign
      timestamp: now
    };

    emit('cursor:move', cursorData);
  }, [isAuthenticated, isConnected, user, projectId, emit]);

  return {
    cursors: Array.from(cursors.values()).filter(c => c.userId !== user?.id), // Exclude own cursor
    emitCursor,
  };
}
