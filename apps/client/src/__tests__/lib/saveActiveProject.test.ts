import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveActiveProject } from '@/lib/saveActiveProject';
import { activeProjectWriteCoordinator } from '@/lib/projectWriteCoordinator';
import { useDrawingStore } from '@/store/drawingStore';

describe('saveActiveProject', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDrawingStore.setState({
      currentProjectId: 'project-1',
      projectTitle: 'Board',
      projectRevision: 3,
      projectRole: 'editor',
      objects: [],
      unsavedChanges: true,
      documentVersion: 7,
    });
  });

  it('commits a saved revision to the same editor session', async () => {
    vi.spyOn(activeProjectWriteCoordinator, 'resume').mockImplementation(() => undefined);
    const enqueue = vi.spyOn(activeProjectWriteCoordinator, 'enqueue').mockResolvedValue({
      id: 'project-1',
      data: {},
      revision: 4,
    });

    await expect(saveActiveProject({ cloud: true })).resolves.toBe('saved');
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        expectedRevision: 3,
        documentVersion: 7,
        cloud: true,
      }),
    );
    expect(useDrawingStore.getState()).toMatchObject({
      projectRevision: 4,
      unsavedChanges: false,
    });
  });

  it('does not apply a completed save after the user switches projects', async () => {
    let finishSave!: (value: { id: string; data: Record<string, never>; revision: number }) => void;
    vi.spyOn(activeProjectWriteCoordinator, 'resume').mockImplementation(() => undefined);
    vi.spyOn(activeProjectWriteCoordinator, 'enqueue').mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );

    const saving = saveActiveProject({ cloud: true });
    useDrawingStore.setState({ currentProjectId: 'project-2' });
    finishSave({
      id: 'project-1',
      data: {},
      revision: 4,
    });

    await expect(saving).resolves.toBe('stale');
    expect(useDrawingStore.getState().currentProjectId).toBe('project-2');
    expect(useDrawingStore.getState().projectRevision).toBe(3);
  });

  it('refuses to save a viewer session', async () => {
    useDrawingStore.setState({ projectRole: 'viewer' });
    const enqueue = vi.spyOn(activeProjectWriteCoordinator, 'enqueue');

    await expect(saveActiveProject({ cloud: true })).resolves.toBe('read-only');
    expect(enqueue).not.toHaveBeenCalled();
  });
});
