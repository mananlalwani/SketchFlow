import { useEffect } from 'react';
import { useDrawingSocket } from '@/hooks/useSocket';
import type { DrawingObject } from '@/store/drawingStore';
import type { CollaborationAppliedEvent, CollaborationHydration } from '@/types/socket';

type SocketOn = ReturnType<typeof useDrawingSocket>['on'];

interface CanvasCollaborationAdapterOptions {
  on: SocketOn;
  isConnected: boolean;
  currentProjectId?: string;
  projectRevision?: number;
  requestCanonicalHydration: (projectId: string) => void;
  applyAuthoritativeProject: (input: {
    objects: DrawingObject[];
    title: string;
    revision: number;
  }) => boolean;
  replaceHistory: (objects: DrawingObject[]) => void;
  requestFullRedraw: () => void;
}

function isDrawingObject(value: unknown): value is DrawingObject {
  if (!value || typeof value !== 'object') return false;

  const object = value as Record<string, unknown>;
  return (
    typeof object.id === 'string' &&
    typeof object.type === 'string' &&
    typeof object.color === 'string' &&
    typeof object.size === 'number'
  );
}

export function getAuthoritativeObjects(data: unknown): DrawingObject[] | null {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;

  const objects = (data as { objects?: unknown }).objects;
  if (!Array.isArray(objects) || !objects.every(isDrawingObject)) return null;

  return objects;
}

/** Applies revisioned canonical project state received over the collaboration socket. */
export function useCanvasCollaborationAdapter({
  on,
  isConnected,
  currentProjectId,
  projectRevision,
  requestCanonicalHydration,
  applyAuthoritativeProject,
  replaceHistory,
  requestFullRedraw,
}: CanvasCollaborationAdapterOptions) {
  // Viewing is collaborative too. Join and hydrate whenever a project socket
  // becomes available, including after reconnects; this must not depend on
  // edit permission because viewers need the same live applied events.
  useEffect(() => {
    if (!isConnected || !currentProjectId) return;
    requestCanonicalHydration(currentProjectId);
  }, [currentProjectId, isConnected, requestCanonicalHydration]);

  useEffect(() => {
    if (!isConnected) return;

    const applyCanonicalProject = (
      state: CollaborationHydration | CollaborationAppliedEvent,
      allowEqualRevision: boolean,
    ) => {
      if (currentProjectId && state.projectId !== currentProjectId) return;
      if (projectRevision !== undefined) {
        if (
          allowEqualRevision ? state.revision < projectRevision : state.revision <= projectRevision
        ) {
          return;
        }

        // Applied events must be contiguous. A gap means this socket missed an
        // accepted commit, so obtain a fresh canonical snapshot instead of
        // applying an unverified future state over local state.
        if (!allowEqualRevision && state.revision !== projectRevision + 1) {
          if (currentProjectId) requestCanonicalHydration(currentProjectId);
          return;
        }
      }

      const objects = getAuthoritativeObjects(state.data);
      if (!objects) return;

      const applied = applyAuthoritativeProject({
        objects,
        title: state.title,
        revision: state.revision,
      });
      if (!applied) return;

      replaceHistory(objects);
      requestFullRedraw();
    };

    const unsubscribeHydrated = on('collaboration:hydrated', (state: CollaborationHydration) => {
      applyCanonicalProject(state, true);
    });
    const unsubscribeApplied = on('collaboration:applied', (event: CollaborationAppliedEvent) => {
      applyCanonicalProject(event, false);
    });

    return () => {
      unsubscribeHydrated();
      unsubscribeApplied();
    };
  }, [
    applyAuthoritativeProject,
    currentProjectId,
    isConnected,
    on,
    projectRevision,
    replaceHistory,
    requestCanonicalHydration,
    requestFullRedraw,
  ]);
}
