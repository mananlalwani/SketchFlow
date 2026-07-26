import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/store/authStore';
import type { SelectionPresence } from '@/types/socket';

import { useSocket } from './useSocket';

/** Shares selection intent without persisting it as a document mutation. */
export function useLiveSelections(projectId: string | null, selectedObjectIds: readonly string[]) {
  const [selections, setSelections] = useState<Map<string, SelectionPresence>>(new Map());
  const { emit, on, isConnected } = useSocket();
  const { user, isAuthenticated, isGuest, guestId } = useAuthStore();
  const previousIdsRef = useRef('');
  const allowGuestSocket =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('share');
  const canUseRealtime = isAuthenticated || (isGuest && allowGuestSocket);
  const userId = isAuthenticated ? user?.id : guestId;
  const selectionKey = [...selectedObjectIds].sort().join(',');

  useEffect(() => {
    previousIdsRef.current = '';
  }, [projectId]);

  useEffect(() => {
    if (!canUseRealtime) return;
    const onChange = (selection: SelectionPresence) => {
      setSelections((current) =>
        new Map(current).set(selection.clientId ?? selection.userId, selection),
      );
    };
    const onLeave = (clientId: string) => {
      setSelections((current) => {
        const next = new Map(current);
        next.delete(clientId);
        return next;
      });
    };
    const onAll = (all: SelectionPresence[]) => {
      setSelections(
        new Map(all.map((selection) => [selection.clientId ?? selection.userId, selection])),
      );
    };
    const unsubscribeChange = on('selection:change', onChange);
    const unsubscribeLeave = on('selection:leave', onLeave);
    const unsubscribeAll = on('selections:all', onAll);
    return () => {
      unsubscribeChange();
      unsubscribeLeave();
      unsubscribeAll();
    };
  }, [canUseRealtime, on]);

  const emitSelection = useCallback(() => {
    if (!canUseRealtime || !isConnected || !projectId || !userId) return;
    if (previousIdsRef.current === selectionKey) return;
    previousIdsRef.current = selectionKey;
    emit('selection:change', {
      userId,
      username: user?.username || 'Guest',
      objectIds: [...selectedObjectIds],
      color: '',
      timestamp: Date.now(),
    });
  }, [
    canUseRealtime,
    emit,
    isConnected,
    projectId,
    selectedObjectIds,
    selectionKey,
    user?.username,
    userId,
  ]);

  useEffect(() => {
    emitSelection();
  }, [emitSelection]);

  useEffect(() => {
    if (isConnected) return;
    setSelections(new Map());
    previousIdsRef.current = '';
  }, [isConnected]);

  return { remoteSelections: Array.from(selections.values()) };
}
