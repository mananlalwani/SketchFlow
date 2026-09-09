import { useEffect, useRef } from 'react';
import type { DrawingObject } from '@/store/drawingStore';
import type { CollaborationAppliedEvent, CollaborationHydration, JsonValue } from '@/types/socket';
import { drawingObjectSchema } from '@/lib/drawingObjectSchema';
import { z } from 'zod';
import { deserializeProjectDocument, isProjectDocumentWithMetadata } from '@/lib/projectDocument';
import type { ProjectBookmark } from '@/lib/projectDocument';

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
  hasPendingLocalOperations?: () => boolean;
  applyAuthoritativeProject: (input: {
    objects: DrawingObject[];
    title: string;
    revision: number;
    bookmarks?: ProjectBookmark[];
  }) => boolean;
  replaceHistory: (objects: DrawingObject[]) => void;
  requestFullRedraw: () => void;
}

interface CanonicalProjectInput {
  objects: DrawingObject[];
  title: string;
  revision: number;
  bookmarks?: ProjectBookmark[];
}

const authoritativeProjectSchema = z
  .object({ objects: z.array(drawingObjectSchema) })
  .passthrough();
const noPendingLocalOperations = () => false;

export function getAuthoritativeObjects(data: JsonValue | string): DrawingObject[] | null {
  const serialized = z.string().safeParse(data);
  if (serialized.success) {
    try {
      const candidate = JSON.parse(serialized.data);
      if (Array.isArray(candidate)) {
        const legacy = z.array(drawingObjectSchema).safeParse(candidate);
        return legacy.success ? legacy.data : null;
      }
      const project = authoritativeProjectSchema.safeParse(candidate);
      return project.success ? project.data.objects : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(data)) {
    const legacy = z.array(drawingObjectSchema).safeParse(data);
    return legacy.success ? legacy.data : null;
  }
  const project = authoritativeProjectSchema.safeParse(data);
  return project.success ? project.data.objects : null;
}

export function getAuthoritativeBookmarks(data: JsonValue | string): ProjectBookmark[] | undefined {
  if (!isProjectDocumentWithMetadata(data)) return undefined;
  return deserializeProjectDocument(data).metadata.bookmarks;
}

/** Applies revisioned canonical project state received over the collaboration socket. */
export function useCanvasCollaborationAdapter({
  on,
  isConnected,
  currentProjectId,
  projectRevision,
  requestCanonicalHydration,
  hasPendingLocalOperations = noPendingLocalOperations,
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
      if (hasPendingLocalOperations()) return;
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

      const bookmarks = getAuthoritativeBookmarks(state.data);

      const canonicalProject: CanonicalProjectInput = {
        objects,
        title: state.title,
        revision: state.revision,
      };
      if (bookmarks !== undefined) canonicalProject.bookmarks = bookmarks;
      const applied = applyAuthoritativeProject(canonicalProject);
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
    hasPendingLocalOperations,
    requestFullRedraw,
  ]);
}
