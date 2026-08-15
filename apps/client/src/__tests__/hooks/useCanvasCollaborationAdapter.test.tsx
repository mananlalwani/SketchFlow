import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthoritativeObjects,
  useCanvasCollaborationAdapter,
  type CollaborationSocket,
} from '@/hooks/useCanvasCollaborationAdapter';
import type { CollaborationAppliedEvent, CollaborationHydration } from '@/types/socket';
import type { DrawingObject } from '@/store/drawingStore';

const remoteObject: DrawingObject = {
  id: 'remote-line',
  type: 'line',
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  color: '#fff',
  size: 2,
};

describe('useCanvasCollaborationAdapter', () => {
  let hydratedListener: ((state: CollaborationHydration) => void) | undefined;
  let appliedListener: ((event: CollaborationAppliedEvent) => void) | undefined;
  const applyAuthoritativeProject = vi.fn();
  const requestCanonicalHydration = vi.fn();
  const replaceHistory = vi.fn();
  const requestFullRedraw = vi.fn();
  const on = ((
    event: 'collaboration:hydrated' | 'collaboration:applied',
    listener:
      | ((state: CollaborationHydration) => void)
      | ((event: CollaborationAppliedEvent) => void),
  ) => {
    if (event === 'collaboration:hydrated') {
      // SAFETY: this event literal selects the hydrated overload, so its listener accepts hydration.
      hydratedListener = listener as (state: CollaborationHydration) => void;
      return () => {
        hydratedListener = undefined;
      };
    }
    // SAFETY: the only remaining event literal selects the applied-event overload.
    appliedListener = listener as (event: CollaborationAppliedEvent) => void;
    return () => {
      appliedListener = undefined;
    };
  }) satisfies CollaborationSocket['on'];

  beforeEach(() => {
    vi.clearAllMocks();
    applyAuthoritativeProject.mockReturnValue(true);
    hydratedListener = undefined;
    appliedListener = undefined;
  });

  function renderAdapter(projectRevision?: number) {
    return renderHook(() =>
      useCanvasCollaborationAdapter({
        on,
        isConnected: true,
        currentProjectId: 'project-1',
        projectRevision,
        requestCanonicalHydration,
        applyAuthoritativeProject,
        replaceHistory,
        requestFullRedraw,
      }),
    );
  }

  it('joins and hydrates a connected project even when the session is view-only', () => {
    renderAdapter();

    expect(requestCanonicalHydration).toHaveBeenCalledOnce();
    expect(requestCanonicalHydration).toHaveBeenCalledWith('project-1');
  });

  it('hydrates canonical state without using a dirty local update', () => {
    renderAdapter();

    hydratedListener?.({
      projectId: 'project-1',
      revision: 3,
      title: 'Remote board',
      data: { objects: [remoteObject] },
    });

    expect(applyAuthoritativeProject).toHaveBeenCalledWith({
      objects: [remoteObject],
      title: 'Remote board',
      revision: 3,
    });
    expect(replaceHistory).toHaveBeenCalledWith([remoteObject]);
    expect(requestFullRedraw).toHaveBeenCalledOnce();
  });

  it('preserves local history when the store rejects a dirty document overwrite', () => {
    applyAuthoritativeProject.mockReturnValue(false);
    renderAdapter(5);

    appliedListener?.({
      projectId: 'project-1',
      operationId: 'operation-1234567893',
      revision: 6,
      kind: 'replace-project',
      title: 'Remote board',
      data: { objects: [remoteObject] },
    });

    expect(applyAuthoritativeProject).toHaveBeenCalledOnce();
    expect(replaceHistory).not.toHaveBeenCalled();
    expect(requestFullRedraw).not.toHaveBeenCalled();
  });

  it('ignores duplicate and older remote revisions', () => {
    renderAdapter(5);
    const applied = appliedListener;

    applied?.({
      projectId: 'project-1',
      operationId: 'operation-1234567890',
      revision: 5,
      kind: 'replace-project',
      title: 'Duplicate',
      data: { objects: [remoteObject] },
    });
    applied?.({
      projectId: 'project-1',
      operationId: 'operation-1234567891',
      revision: 4,
      kind: 'replace-project',
      title: 'Stale',
      data: { objects: [remoteObject] },
    });

    expect(applyAuthoritativeProject).not.toHaveBeenCalled();
  });

  it('resynchronizes rather than applying a future revision with a gap', () => {
    renderAdapter(5);

    appliedListener?.({
      projectId: 'project-1',
      operationId: 'operation-1234567892',
      revision: 7,
      kind: 'replace-project',
      title: 'Future state',
      data: { objects: [remoteObject] },
    });

    expect(applyAuthoritativeProject).not.toHaveBeenCalled();
    expect(requestCanonicalHydration).toHaveBeenCalledWith('project-1');
  });

  it('rejects malformed canonical project data', () => {
    expect(getAuthoritativeObjects({ objects: [{ id: 'missing-fields' }] })).toBeNull();
    expect(getAuthoritativeObjects({ objects: [remoteObject] })).toEqual([remoteObject]);
  });

  it('accepts serialized REST fallback broadcasts', () => {
    expect(getAuthoritativeObjects(JSON.stringify({ objects: [remoteObject] }))).toEqual([
      remoteObject,
    ]);
  });
});
