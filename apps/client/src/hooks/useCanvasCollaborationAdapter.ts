import { useEffect, useRef } from 'react';
import type { DrawingObject } from '@/store/drawingStore';
import type { CollaborationAppliedEvent, CollaborationHydration, JsonValue } from '@/types/socket';
import { drawingObjectSchema } from '@/lib/drawingObjectSchema';
import { z } from 'zod';

export interface CollaborationSocket {
  on(
    event: 'collaboration:hydrated',
    listener: (state: CollaborationHydration) => void,
  ): () => void;
  on(
    event: 'collaboration:applied',
    listener: (event: CollaborationAppliedEvent) => void,
  ): () => void;
}

interface CanvasCollaborationAdapterOptions {
  on: CollaborationSocket['on'];
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

const authoritativeProjectSchema = z
  .object({ objects: z.array(drawingObjectSchema) })
  .passthrough();

export function getAuthoritativeObjects(data: JsonValue | string): DrawingObject[] | null {
  const serialized = z.string().safeParse(data);
  if (serialized.success) {
    try {
      const project = authoritativeProjectSchema.safeParse(JSON.parse(serialized.data));
      return project.success ? project.data.objects : null;
    } catch {
      return null;
    }
  }
  const project = authoritativeProjectSchema.safeParse(data);
  return project.success ? project.data.objects : null;
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
  const projectRevisionRef = useRef(projectRevision);
  projectRevisionRef.current = projectRevision;

  useEffect(() => {
    if (!isConnected) return;

    const applyCanonicalProject = (
      state: CollaborationHydration | CollaborationAppliedEvent,
      allowEqualRevision: boolean,
    ) => {
      if (currentProjectId && state.projectId !== currentProjectId) return;
      const currentRevision = projectRevisionRef.current;
      if (currentRevision !== undefined) {
        if (
          allowEqualRevision ? state.revision < currentRevision : state.revision <= currentRevision
        ) {
          return;
        }

        // Applied events must be contiguous. A gap means this socket missed an
        // accepted commit, so obtain a fresh canonical snapshot instead of
        // applying an unverified future state over local state.
        if (!allowEqualRevision && state.revision !== currentRevision + 1) {
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

    // Subscribe before joining: a fast local server can hydrate immediately.
    // Viewing is collaborative too, so this deliberately does not depend on
    // edit permission.
    if (currentProjectId) requestCanonicalHydration(currentProjectId);

    return () => {
      unsubscribeHydrated();
      unsubscribeApplied();
    };
  }, [
    applyAuthoritativeProject,
    currentProjectId,
    isConnected,
    on,
    replaceHistory,
    requestCanonicalHydration,
    requestFullRedraw,
  ]);
}
