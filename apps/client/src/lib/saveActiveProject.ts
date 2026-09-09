import { activeProjectWriteCoordinator } from './projectWriteCoordinator';
import { serializeProject } from './utils';
import { useDrawingStore } from '@/store/drawingStore';
import { removeEmergencyBackup } from './emergencyBackup';
import { saveProjectSnapshot } from './projectSaveRecovery';

export interface SaveActiveProjectOptions {
  cloud: boolean;
  tokenProvider?: () => Promise<string | null>;
}

export type SaveActiveProjectResult = 'saved' | 'stale' | 'read-only';

/** Saves one immutable editor snapshot and only commits the result to that same session. */
export async function saveActiveProject({
  cloud,
  tokenProvider,
}: SaveActiveProjectOptions): Promise<SaveActiveProjectResult> {
  const snapshot = useDrawingStore.getState();
  if (snapshot.projectRole === 'viewer') return 'read-only';

  const projectId = snapshot.currentProjectId;
  const documentVersion = snapshot.documentVersion;
  const payload = serializeProject(snapshot.objects, 4096, 4096, {
    bookmarks: snapshot.bookmarks,
  });
  return saveProjectSnapshot({
    snapshot: {
      projectId,
      title: snapshot.projectTitle || 'Untitled',
      data: payload,
      documentVersion,
      expectedRevision: snapshot.projectRevision,
    },
    cloud,
    tokenProvider,
    coordinator: activeProjectWriteCoordinator,
    getCurrentState: () => {
      const current = useDrawingStore.getState();
      return {
        currentProjectId: current.currentProjectId,
        documentVersion: current.documentVersion,
      };
    },
    actions: {
      setCurrentProject: (id) => useDrawingStore.getState().setCurrentProject(id),
      setProjectRevision: (revision) => useDrawingStore.getState().setProjectRevision(revision),
      markSaved: (version) => useDrawingStore.getState().markSaved(version),
    },
    removeBackup: removeEmergencyBackup,
    onCleanupFailure: (error) =>
      console.warn('Could not clear emergency backup after save:', error),
  });
}
