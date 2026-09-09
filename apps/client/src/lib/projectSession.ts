import type { ProjectRecord, PublicProjectRecord } from './api';
import { activeProjectWriteCoordinator } from './projectWriteCoordinator';
import { deserializeProjectDocument } from './projectDocument';
import { useDrawingStore } from '@/store/drawingStore';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

type LoadableProject = Pick<
  ProjectRecord | PublicProjectRecord,
  'id' | 'title' | 'data' | 'revision'
>;

/** Installs a persisted project as one clean, revision-aware editor session. */
export function installProjectSession(project: LoadableProject, role: ProjectRole): void {
  const document = deserializeProjectDocument(project.data);
  activeProjectWriteCoordinator.reset(project.id, {
    projectId: project.id,
    revision: project.revision,
  });
  useDrawingStore.getState().hydrateProject({
    id: project.id,
    objects: document.objects,
    bookmarks: document.metadata.bookmarks,
    title: project.title || 'Untitled',
    revision: project.revision,
    role,
  });
}
