import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateProject: vi.fn(),
  enqueueProjectWrite: vi.fn(),
  resumeProjectWrites: vi.fn(),
  getOfflineSaveQueue: vi.fn(),
  removeOfflineSave: vi.fn(),
  markOfflineSaveAttempt: vi.fn(),
  removeEmergencyBackup: vi.fn(),
  saveEmergencyBackup: vi.fn(),
  setProjectRevision: vi.fn(),
  markSaved: vi.fn(),
  setSaveStatus: vi.fn(),
  drawingState: {
    unsavedChanges: false,
    currentProjectId: 'project-1',
    projectRevision: 2,
    projectRole: 'owner' as const,
    documentVersion: 1,
    objects: [] as unknown[],
    projectTitle: 'Board',
  },
}));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ userId: 'user-1', getToken: vi.fn(async () => 'token') }),
}));
vi.mock('@/store/authStore', () => ({ useAuthStore: () => ({ isGuest: false }) }));
vi.mock('@/store/drawingStore', () => {
  const useDrawingStore = () => ({
    ...mocks.drawingState,
    markSaved: mocks.markSaved,
    setProjectRevision: mocks.setProjectRevision,
    setSaveStatus: mocks.setSaveStatus,
  });
  useDrawingStore.getState = () => ({
    ...mocks.drawingState,
    markSaved: mocks.markSaved,
    setProjectRevision: mocks.setProjectRevision,
    setSaveStatus: mocks.setSaveStatus,
  });
  return { useDrawingStore };
});
vi.mock('@/lib/api', () => ({ updateProject: mocks.enqueueProjectWrite }));
vi.mock('@/lib/projectWriteCoordinator', () => ({
  activeProjectWriteCoordinator: {
    enqueue: mocks.enqueueProjectWrite,
    resume: mocks.resumeProjectWrites,
  },
  ProjectWriteResetError: class ProjectWriteResetError extends Error {},
}));
vi.mock('@/lib/offlineQueue', () => ({
  enqueueOfflineSave: vi.fn(),
  getOfflineSaveQueue: mocks.getOfflineSaveQueue,
  removeOfflineSave: mocks.removeOfflineSave,
  markOfflineSaveAttempt: mocks.markOfflineSaveAttempt,
}));
vi.mock('@/lib/emergencyBackup', () => ({
  getEmergencyBackup: vi.fn(),
  removeEmergencyBackup: mocks.removeEmergencyBackup,
  saveEmergencyBackup: mocks.saveEmergencyBackup,
}));
vi.mock('@/lib/thumbnailGenerator', () => ({ generateThumbnail: vi.fn() }));
vi.mock('@/lib/utils', () => ({
  serializeProject: vi.fn(() => ({ objects: [] })),
  deserializeProject: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AutoSaveHandler } from '@/components/AutoSaveHandler';

describe('AutoSaveHandler offline replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.drawingState, {
      unsavedChanges: false,
      currentProjectId: 'project-1',
      projectRevision: 2,
      projectRole: 'owner',
      documentVersion: 1,
      objects: [] as unknown[],
      projectTitle: 'Board',
    });
    mocks.getOfflineSaveQueue.mockResolvedValue([
      {
        id: 7,
        projectId: 'project-1',
        title: 'Board',
        data: { objects: [] },
        revision: 2,
        createdAt: 1,
        attempts: 0,
      },
    ]);
    mocks.enqueueProjectWrite.mockResolvedValue({ revision: 3 });
    mocks.enqueueProjectWrite.mockResolvedValue({ id: 'project-1', revision: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays queued saves in revision order when the browser reconnects', async () => {
    render(<AutoSaveHandler />);
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() =>
      expect(mocks.enqueueProjectWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          title: 'Board',
          data: { objects: [] },
          expectedRevision: 2,
          cloud: true,
          tokenProvider: expect.any(Function),
        }),
      ),
    );
    expect(mocks.removeOfflineSave).toHaveBeenCalledWith(7);
    expect(mocks.markOfflineSaveAttempt).not.toHaveBeenCalled();
  });

  it('does not schedule a save for a viewer project', async () => {
    vi.useFakeTimers();
    Object.assign(mocks.drawingState, {
      unsavedChanges: true,
      projectRole: 'viewer',
      documentVersion: 4,
    });

    render(<AutoSaveHandler />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mocks.enqueueProjectWrite).not.toHaveBeenCalled();
    expect(mocks.saveEmergencyBackup).not.toHaveBeenCalled();
  });

  it('marks the saved version and deletes only its matching backup', async () => {
    vi.useFakeTimers();
    Object.assign(mocks.drawingState, { unsavedChanges: true, documentVersion: 4 });

    render(<AutoSaveHandler />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mocks.setProjectRevision).toHaveBeenCalledWith(3);
    expect(mocks.markSaved).toHaveBeenCalledWith(4);
    expect(mocks.removeEmergencyBackup).toHaveBeenCalledWith('project-1', {
      title: 'Board',
      data: { objects: [] },
    });
  });

  it('preserves newer local work when an older save succeeds', async () => {
    vi.useFakeTimers();
    Object.assign(mocks.drawingState, {
      unsavedChanges: true,
      documentVersion: 4,
      objects: [{ id: 'saved-object' }],
    });
    let resolveSave: (value: { revision: number }) => void;
    mocks.enqueueProjectWrite.mockImplementation(
      () =>
        new Promise<{ revision: number }>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(<AutoSaveHandler />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mocks.enqueueProjectWrite).toHaveBeenCalledOnce();

    mocks.drawingState.documentVersion = 5;
    await act(async () => {
      resolveSave!({ revision: 3 });
    });

    expect(mocks.setProjectRevision).not.toHaveBeenCalled();
    expect(mocks.markSaved).not.toHaveBeenCalled();
    expect(mocks.removeEmergencyBackup).not.toHaveBeenCalled();
  });

  it('does not apply an old project revision after switching projects', async () => {
    vi.useFakeTimers();
    Object.assign(mocks.drawingState, { unsavedChanges: true, documentVersion: 4 });
    let resolveSave: (value: { revision: number }) => void;
    mocks.enqueueProjectWrite.mockImplementation(
      () =>
        new Promise<{ revision: number }>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(<AutoSaveHandler />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    Object.assign(mocks.drawingState, {
      currentProjectId: 'project-2',
      projectRevision: 8,
      documentVersion: 5,
    });
    await act(async () => {
      resolveSave!({ revision: 3 });
    });

    expect(mocks.setProjectRevision).not.toHaveBeenCalled();
    expect(mocks.markSaved).not.toHaveBeenCalled();
  });
});
