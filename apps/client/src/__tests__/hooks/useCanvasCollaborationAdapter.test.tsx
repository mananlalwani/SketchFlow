import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthoritativeObjects,
  useCanvasCollaborationAdapter,
} from '@/hooks/useCanvasCollaborationAdapter';
import type { DrawingObject } from '@/store/drawingStore';

type Listener = (payload: never) => void;

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
  const listeners = new Map<string, Listener>();
  const applyAuthoritativeProject = vi.fn();
  const requestCanonicalHydration = vi.fn();
  const replaceHistory = vi.fn();
  const requestFullRedraw = vi.fn();
  const on = vi.fn((event: string, listener: Listener) => {
    listeners.set(event, listener);
    return () => listeners.delete(event);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    applyAuthoritativeProject.mockReturnValue(true);
    listeners.clear();
  });

  function renderAdapter(projectRevision?: number) {
    return renderHook(() =>
      useCanvasCollaborationAdapter({
        on: on as never,
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

  it('hydrates canonical state without using a dirty local update', () => {
    renderAdapter();

    listeners.get('collaboration:hydrated')?.({
      projectId: 'project-1',
      revision: 3,
      title: 'Remote board',
      data: { objects: [remoteObject] },
    } as never);

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

    listeners.get('collaboration:applied')?.({
      projectId: 'project-1',
      operationId: 'operation-1234567893',
      revision: 6,
      kind: 'replace-project',
      title: 'Remote board',
      data: { objects: [remoteObject] },
    } as never);

    expect(applyAuthoritativeProject).toHaveBeenCalledOnce();
    expect(replaceHistory).not.toHaveBeenCalled();
    expect(requestFullRedraw).not.toHaveBeenCalled();
  });

  it('ignores duplicate and older remote revisions', () => {
    renderAdapter(5);
    const applied = listeners.get('collaboration:applied');

    applied?.({
      projectId: 'project-1',
      operationId: 'operation-1234567890',
      revision: 5,
      kind: 'replace-project',
      title: 'Duplicate',
      data: { objects: [remoteObject] },
    } as never);
    applied?.({
      projectId: 'project-1',
      operationId: 'operation-1234567891',
      revision: 4,
      kind: 'replace-project',
      title: 'Stale',
      data: { objects: [remoteObject] },
    } as never);

    expect(applyAuthoritativeProject).not.toHaveBeenCalled();
  });

  it('resynchronizes rather than applying a future revision with a gap', () => {
    renderAdapter(5);

    listeners.get('collaboration:applied')?.({
      projectId: 'project-1',
      operationId: 'operation-1234567892',
      revision: 7,
      kind: 'replace-project',
      title: 'Future state',
      data: { objects: [remoteObject] },
    } as never);

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
