import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from './useSocket';
import { useAuthStore } from '@/store/authStore';
import type { CursorData } from '@/types/socket';

export function useLiveCursors(projectId: string | null) {
  const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());
  const { emit, on, isConnected } = useSocket();
  const { user, isAuthenticated, isGuest, guestId } = useAuthStore();
  const lastEmitTime = useRef<number>(0);
  const THROTTLE_MS = 33; // ~30fps
  const allowGuestSocket =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('share');
  const canUseRealtime = isAuthenticated || (isGuest && allowGuestSocket);
  const selfCursorId = isAuthenticated ? user?.id : guestId;
  const deviceCursorId = useMemo(() => {
    const key = 'sketchflow-cursor-device-id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem(key, next);
    return next;
  }, []);

  // Join room when project changes
  useEffect(() => {
    if (!canUseRealtime || !isConnected || !projectId) return;

    emit('room:join', projectId);

    return () => {
      emit('room:leave');
    };
  }, [projectId, canUseRealtime, isConnected, emit]);

  // Listen for cursor events
  useEffect(() => {
    if (!canUseRealtime) return;

    const unsubscribeMove = on('cursor:move', (cursor: CursorData) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(cursor.userId, cursor);
        return next;
      });
    });

    const unsubscribeJoin = on('cursor:join', (cursor: CursorData) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(cursor.userId, cursor);
        return next;
      });
    });

    const unsubscribeLeave = on('cursor:leave', (userId: string) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    const unsubscribeAll = on('cursors:all', (allCursors: CursorData[]) => {
      setCursors(new Map(allCursors.map((c) => [c.userId, c])));
    });

    return () => {
      unsubscribeMove();
      unsubscribeJoin();
      unsubscribeLeave();
      unsubscribeAll();
    };
  }, [on, canUseRealtime]);

  // Emit cursor position (throttled)
  const emitCursor = useCallback(
    (x: number, y: number) => {
      if (!canUseRealtime || !isConnected || !projectId) return;
      if (!selfCursorId) return;

      const now = Date.now();
      if (now - lastEmitTime.current < THROTTLE_MS) return;
      lastEmitTime.current = now;

      const cursorData: CursorData = {
        clientId: deviceCursorId,
        userId: selfCursorId,
        username: user?.username || 'Guest',
        x,
        y,
        color: '', // Server will assign
        timestamp: now,
      };

      emit('cursor:move', cursorData);
    },
    [canUseRealtime, isConnected, projectId, emit, selfCursorId, user?.username, deviceCursorId],
  );

  return {
    // The server never echoes a cursor to its originating socket. Keep other
    // sessions of the same account visible as separate devices.
    cursors: Array.from(cursors.values()),
    emitCursor,
  };
}
