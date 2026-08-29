import { activeProjectWriteCoordinator } from './projectWriteCoordinator';
import { serializeProject } from './utils';
import { useDrawingStore } from '@/store/drawingStore';
import { removeEmergencyBackup } from './emergencyBackup';

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
  const projectKey = projectId ?? 'active-draft';
  const documentVersion = snapshot.documentVersion;
  const payload = serializeProject(snapshot.objects, 4096, 4096);
  activeProjectWriteCoordinator.resume(projectKey);

  const saved = await activeProjectWriteCoordinator.enqueue({
    projectKey,
    projectId,
    title: snapshot.projectTitle || 'Untitled',
    data: payload,
    documentVersion,
    expectedRevision: snapshot.projectRevision,
    cloud,
    tokenProvider,
  });

  const current = useDrawingStore.getState();
  const isSameSession =
    current.documentVersion === documentVersion &&
    (projectId ? current.currentProjectId === projectId : !current.currentProjectId);
  if (!isSameSession) return 'stale';

  if (!projectId) current.setCurrentProject(saved.id);
  current.setProjectRevision(saved.revision);
  current.markSaved(documentVersion);
  try {
    await removeEmergencyBackup(projectId ?? saved.id, {
      title: snapshot.projectTitle || 'Untitled',
      data: payload,
    });
  } catch (error) {
    // A browser storage failure must not turn an acknowledged cloud save into
    // a false failure. The backup will be compared and cleaned up next load.
    console.warn('Could not clear emergency backup after save:', error);
  }
  return 'saved';
}
