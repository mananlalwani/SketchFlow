import { useCallback, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import type { DrawingObject } from '@/store/drawingStore';
import { useDrawingStore } from '@/store/drawingStore';
import type { CollaborationCommit, CollaborationCommitResult } from '@/types/socket';
import {
  enqueueCollaborationOperation,
  getCollaborationOperations,
  markCollaborationOperationAttempt,
  removeCollaborationOperation,
} from '@/lib/offlineQueue';
import { CollaborationPersistence } from '@/lib/collaborationPersistence';
import {
  getAuthoritativeBookmarks,
  getAuthoritativeObjects,
} from '@/hooks/useCanvasCollaborationAdapter';
import { captureOperationalSignal } from '@/lib/sentry';

interface UseCanvasCollaborationSyncOptions {
  canDraw: boolean;
  isConnected: boolean;
  currentProjectId?: string;
  projectRevision?: number;
  projectTitle: string;
  documentVersion: number;
  unsavedChanges: boolean;
  objects: DrawingObject[];
  gestureBusy: boolean;
  commitCollaboration: (
    commit: CollaborationCommit,
    acknowledge: (result: CollaborationCommitResult) => void,
  ) => void;
  requestCanonicalHydration: (projectId: string) => void;
}

export function useCanvasCollaborationSync({
  canDraw,
  isConnected,
  currentProjectId,
  projectRevision,
  projectTitle,
  documentVersion,
  unsavedChanges,
  objects,
  gestureBusy,
  commitCollaboration,
  requestCanonicalHydration,
}: UseCanvasCollaborationSyncOptions) {
  const collaborationCommitInFlightRef = useRef(false);
  const collaborationReplayInFlightRef = useRef(false);
  const collaborationPendingRef = useRef(false);
  const collaborationObjectsRef = useRef<DrawingObject[]>([]);
  const collaborationProjectRef = useRef<string | undefined>(undefined);

  const collaborationPersistence = useMemo(
    () =>
      new CollaborationPersistence({
        queue: {
          enqueueCollaborationOperation,
          getCollaborationOperations,
          removeCollaborationOperation,
          markCollaborationOperationAttempt,
        },
        send: (commit) =>
          new Promise((resolve) => {
            commitCollaboration(commit, resolve);
          }),
        onStatus: (status) => useDrawingStore.getState().setSaveStatus(status),
      }),
    [commitCollaboration],
  );

  useEffect(() => {
    collaborationPersistence.setConnected(isConnected);
  }, [collaborationPersistence, isConnected]);

  useEffect(() => {
    if (
      collaborationProjectRef.current !== currentProjectId ||
      !unsavedChanges ||
      !currentProjectId
    ) {
      collaborationProjectRef.current = currentProjectId;
      collaborationObjectsRef.current = objects;
      return;
    }
    if (
      !canDraw ||
      !unsavedChanges ||
      projectRevision === undefined ||
      collaborationCommitInFlightRef.current ||
      gestureBusy
    ) {
      return;
    }

    const projectId = currentProjectId;
    const previous = collaborationObjectsRef.current;
    const previousById = new Map(previous.map((object) => [object.id, object]));
    const currentById = new Map(objects.map((object) => [object.id, object]));
    const changed = objects.filter(
      (object) => JSON.stringify(previousById.get(object.id)) !== JSON.stringify(object),
    );
    const removed = previous.filter((object) => !currentById.has(object.id));
    const changes = [
      ...changed.map((object) => ({ kind: 'upsert-object' as const, data: { object } })),
      ...removed.map((object) => ({ kind: 'delete-object' as const, data: { id: object.id } })),
    ];
    if (changes.length === 0) {
      collaborationObjectsRef.current = objects;
      return;
    }
    const operation =
      changes.length === 1 ? changes[0] : { kind: 'batch' as const, data: { operations: changes } };
    const committedDocumentVersion = documentVersion;
    collaborationCommitInFlightRef.current = true;
    collaborationObjectsRef.current = objects;
    useDrawingStore.getState().setSaveStatus('syncing');
    const operationId = crypto.randomUUID();

    const commit = {
      protocolVersion: 1 as const,
      projectId,
      operationId,
      expectedRevision: projectRevision,
      kind: operation.kind,
      data: z.json().parse(operation.data),
      title: projectTitle,
    };
    collaborationPendingRef.current = true;
    void collaborationPersistence
      .persist({ ...commit, createdAt: Date.now() })
      .then((result) => {
        collaborationCommitInFlightRef.current = false;
        if (!result) {
          collaborationPendingRef.current = true;
          return;
        }
        const state = useDrawingStore.getState();
        if (state.currentProjectId !== projectId) return;

        if (result.status === 'applied' || result.status === 'duplicate') {
          void collaborationPersistence
            .getPendingOperationCount(projectId)
            .then((count) => (collaborationPendingRef.current = count > 0));
          const canonicalObjects = result.data ? getAuthoritativeObjects(result.data) : null;
          if (canonicalObjects && state.documentVersion === committedDocumentVersion) {
            state.setObjects(canonicalObjects);
            const canonicalBookmarks = getAuthoritativeBookmarks(result.data!);
            if (canonicalBookmarks) state.setBookmarks(canonicalBookmarks);
            if (result.title !== undefined) state.setProjectTitle(result.title);
            state.setProjectRevision(result.revision);
            state.markSaved();
            state.setSaveStatus('synced');
            return;
          }
          state.setProjectRevision(result.revision);
          if (result.status === 'applied' || result.data) {
            state.markSaved(committedDocumentVersion);
          } else {
            requestCanonicalHydration(projectId);
          }
          state.setSaveStatus('synced');
          return;
        }

        collaborationPendingRef.current = true;
        if (result.status === 'conflict') {
          captureOperationalSignal('collaboration_replay_conflict', { replay: false });
          state.setSaveStatus('conflict');
          requestCanonicalHydration(projectId);
          return;
        }

        captureOperationalSignal('collaboration_queue_failed', {
          unavailable: result.status === 'unavailable',
        });
      })
      .catch(() => {
        collaborationCommitInFlightRef.current = false;
        void collaborationPersistence
          .getPendingOperationCount(projectId)
          .then((count) => (collaborationPendingRef.current = count > 0));
        captureOperationalSignal('collaboration_queue_failed', { durableWrite: true });
      });
  }, [
    canDraw,
    collaborationPersistence,
    currentProjectId,
    documentVersion,
    gestureBusy,
    objects,
    projectRevision,
    projectTitle,
    requestCanonicalHydration,
    unsavedChanges,
  ]);

  useEffect(() => {
    if (!currentProjectId || !isConnected || !canDraw || collaborationReplayInFlightRef.current)
      return;
    let cancelled = false;
    collaborationReplayInFlightRef.current = true;
    void (async () => {
      const queued = await getCollaborationOperations(currentProjectId);
      collaborationPendingRef.current = queued.length > 0;
      const replayDocumentVersion = useDrawingStore.getState().documentVersion;
      const results = await collaborationPersistence.replay(currentProjectId);
      const latest = results.at(-1);
      if (latest && (latest.status === 'applied' || latest.status === 'duplicate')) {
        const state = useDrawingStore.getState();
        const replayData = 'data' in latest ? latest.data : undefined;
        const canonicalObjects = replayData ? getAuthoritativeObjects(replayData) : null;
        const canonicalBookmarks = replayData ? getAuthoritativeBookmarks(replayData) : undefined;
        if (
          canonicalObjects &&
          state.currentProjectId === currentProjectId &&
          state.documentVersion === replayDocumentVersion
        ) {
          state.setObjects(canonicalObjects);
          if (canonicalBookmarks) state.setBookmarks(canonicalBookmarks);
          state.setProjectRevision(latest.revision);
          state.markSaved(useDrawingStore.getState().documentVersion);
          state.setSaveStatus('synced');
        } else {
          state.setProjectRevision(latest.revision);
        }
      }
    })()
      .catch(() => {
        if (!cancelled) useDrawingStore.getState().setSaveStatus('retrying');
      })
      .finally(() => {
        void getCollaborationOperations(currentProjectId).then((remaining) => {
          if (!cancelled) {
            collaborationPendingRef.current = remaining.length > 0;
            if (remaining.length === 0) requestCanonicalHydration(currentProjectId);
          }
        });
        collaborationReplayInFlightRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [canDraw, collaborationPersistence, currentProjectId, isConnected, requestCanonicalHydration]);

  return {
    hasPendingLocalOperations: useCallback(() => collaborationPendingRef.current, []),
  };
}
