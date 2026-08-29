import { activeProjectWriteCoordinator } from './projectWriteCoordinator';
import { serializeProject } from './utils';
import { useDrawingStore } from '@/store/drawingStore';

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
  activeProjectWriteCoordinator.resume(projectKey);

  const saved = await activeProjectWriteCoordinator.enqueue({
    projectKey,
    projectId,
    title: snapshot.projectTitle || 'Untitled',
    data: serializeProject(snapshot.objects, 4096, 4096),
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
  return 'saved';
}
