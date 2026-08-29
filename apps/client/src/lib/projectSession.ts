import type { ProjectRecord, PublicProjectRecord } from './api';
import { activeProjectWriteCoordinator } from './projectWriteCoordinator';
import { deserializeProject } from './utils';
import { useDrawingStore } from '@/store/drawingStore';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

type LoadableProject = Pick<
  ProjectRecord | PublicProjectRecord,
  'id' | 'title' | 'data' | 'revision'
>;

/** Installs a persisted project as one clean, revision-aware editor session. */
export function installProjectSession(project: LoadableProject, role: ProjectRole): void {
  activeProjectWriteCoordinator.reset(project.id, {
    projectId: project.id,
    revision: project.revision,
  });
  useDrawingStore.getState().hydrateProject({
    id: project.id,
    objects: deserializeProject(project.data),
    title: project.title || 'Untitled',
    revision: project.revision,
    role,
  });
}
