import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installProjectSession } from '@/lib/projectSession';
import { activeProjectWriteCoordinator } from '@/lib/projectWriteCoordinator';
import { useDrawingStore } from '@/store/drawingStore';

describe('installProjectSession', () => {
  beforeEach(() => {
    useDrawingStore.setState({
      currentProjectId: 'old-project',
      projectRevision: 2,
      projectRole: 'owner',
      projectTitle: 'Old project',
      objects: [],
      history: [[]],
      historyIndex: 0,
      unsavedChanges: true,
      documentVersion: 4,
    });
  });

  it('installs one clean editor session and resets its write lane', () => {
    const reset = vi.spyOn(activeProjectWriteCoordinator, 'reset');
    const object = {
      id: 'line-1',
      type: 'line' as const,
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      color: '#fff',
      size: 2,
    };

    installProjectSession(
      {
        id: 'loaded-project',
        title: 'Loaded project',
        data: { objects: [object] },
        revision: 8,
      },
      'editor',
    );

    expect(reset).toHaveBeenCalledWith('loaded-project', {
      projectId: 'loaded-project',
      revision: 8,
    });
    expect(useDrawingStore.getState()).toMatchObject({
      currentProjectId: 'loaded-project',
      projectTitle: 'Loaded project',
      projectRevision: 8,
      projectRole: 'editor',
      objects: [object],
      history: [[object]],
      unsavedChanges: false,
      documentVersion: 5,
    });
  });
});
