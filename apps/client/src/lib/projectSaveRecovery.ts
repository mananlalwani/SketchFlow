import type { DrawingObject } from '@/store/drawingStore';
import { NetworkError } from './errorHandling';
import type { ProjectWriteCoordinator, ProjectWriteResetError } from './projectWriteCoordinator';
import type { EmergencyBackup, EmergencyBackupSnapshot } from './emergencyBackup';
import type { OfflineSaveOperation } from './offlineQueue';
import { deserializeProjectDocument, type ProjectBookmark } from './projectDocument';

export interface ProjectSaveSnapshot {
  projectId?: string;
  title: string;
  data: string;
  documentVersion: number;
  expectedRevision?: number;
}

export interface SaveCompletionState {
  currentProjectId?: string;
  documentVersion: number;
}

export interface SaveCompletionActions {
  setCurrentProject?(id: string): void;
  setProjectRevision(revision: number | undefined): void;
  markSaved(documentVersion: number): void;
}

export type ProjectSaveResult = 'saved' | 'stale' | 'read-only';

export interface SaveProjectOptions {
  snapshot: ProjectSaveSnapshot;
  cloud: boolean;
  tokenProvider?: () => Promise<string | null>;
  coordinator: Pick<ProjectWriteCoordinator, 'enqueue' | 'resume'>;
  getCurrentState: () => SaveCompletionState;
  actions: SaveCompletionActions;
  removeBackup: (projectId: string, expected?: EmergencyBackupSnapshot) => Promise<void>;
  onCleanupFailure?: (error: Error) => void;
}

/**
 * Writes an immutable snapshot and applies its acknowledgement only to the
 * session that created it. Backup cleanup is best effort after acknowledgement.
 */
export async function saveProjectSnapshot(options: SaveProjectOptions): Promise<ProjectSaveResult> {
  const { snapshot, coordinator } = options;
  const projectKey = snapshot.projectId ?? 'active-draft';
  coordinator.resume(projectKey);
  const result = await coordinator.enqueue({
    projectKey,
    projectId: snapshot.projectId,
    title: snapshot.title,
    data: snapshot.data,
    documentVersion: snapshot.documentVersion,
    expectedRevision: snapshot.expectedRevision,
    cloud: options.cloud,
    tokenProvider: options.tokenProvider,
  });

  const current = options.getCurrentState();
  const sameSession =
    current.documentVersion === snapshot.documentVersion &&
    (snapshot.projectId
      ? current.currentProjectId === snapshot.projectId
      : !current.currentProjectId);
  if (!sameSession) return 'stale';

  if (!snapshot.projectId && result.id) options.actions.setCurrentProject?.(result.id);
  options.actions.setProjectRevision(result.revision);
  options.actions.markSaved(snapshot.documentVersion);

  try {
    await options.removeBackup(result.id, { title: snapshot.title, data: snapshot.data });
  } catch (error) {
    // Acknowledged remote writes remain successful when local recovery storage
    // is unavailable. The matching backup is safe to remove on a later load.
    options.onCleanupFailure?.(error instanceof Error ? error : new Error(String(error)));
  }
  return 'saved';
}

export interface OfflineReplayOptions {
  operations: OfflineSaveOperation[];
  coordinator: Pick<ProjectWriteCoordinator, 'enqueue'>;
  getToken: () => Promise<string | null>;
  markAttempt: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  onConflict: () => void;
}

/** Replays only the newest queued snapshot for each project. */
export async function replayOfflineSaves(options: OfflineReplayOptions): Promise<void> {
  const latestByProject = new Map<string, OfflineSaveOperation>();
  for (const operation of options.operations) {
    const latest = latestByProject.get(operation.projectId);
    if (!latest || operation.createdAt >= latest.createdAt)
      latestByProject.set(operation.projectId, operation);
  }

  for (const operation of latestByProject.values()) {
    if (operation.id === undefined || operation.revision === undefined) {
      if (operation.id !== undefined) await options.markAttempt(operation.id);
      options.onConflict();
      return;
    }
    try {
      await options.coordinator.enqueue({
        projectKey: operation.projectId,
        projectId: operation.projectId,
        title: operation.title,
        data: operation.data,
        documentVersion: operation.createdAt,
        expectedRevision: operation.revision,
        cloud: true,
        tokenProvider: options.getToken,
      });
      for (const stale of options.operations) {
        if (stale.projectId === operation.projectId && stale.id !== undefined)
          await options.remove(stale.id);
      }
    } catch (error) {
      await options.markAttempt(operation.id);
      const failure = error instanceof Error ? error : new Error(String(error));
      if (isSaveConflict(failure)) options.onConflict();
      return;
    }
  }
}

export interface BackupRecoveryOptions {
  projectId: string;
  projectRole?: 'owner' | 'editor' | 'viewer' | null;
  currentTitle: string;
  currentData: string;
  getBackup: (projectId: string) => Promise<EmergencyBackup | undefined>;
  removeBackup: (projectId: string, expected?: EmergencyBackupSnapshot) => Promise<void>;
  deserialize: (data: string) => DrawingObject[];
  deserializeDocument?: (data: string) => ReturnType<typeof deserializeProjectDocument>;
  getCurrentState: () => {
    currentProjectId?: string;
    projectRole?: 'owner' | 'editor' | 'viewer' | null;
  };
  restore: (objects: DrawingObject[], bookmarks?: ProjectBookmark[]) => void;
  onRecovered: () => void;
  now?: () => number;
}

/** Loads a recent backup and checks the session again before restoring it. */
export async function recoverProjectBackup(options: BackupRecoveryOptions): Promise<boolean> {
  if (options.projectRole === 'viewer') return false;
  const backup = await options.getBackup(options.projectId);
  if (!backup) return false;
  const now = options.now ?? Date.now;
  if (now() - backup.timestamp >= 60 * 60 * 1000) {
    await options.removeBackup(options.projectId, { title: backup.title, data: backup.data });
    return false;
  }
  if (backup.title === options.currentTitle && backup.data === options.currentData) {
    await options.removeBackup(options.projectId, { title: backup.title, data: backup.data });
    return false;
  }
  const isCurrentEditableSession = () => {
    const current = options.getCurrentState();
    return current.currentProjectId === options.projectId && current.projectRole !== 'viewer';
  };
  if (!isCurrentEditableSession()) return false;
  const document = options.deserializeDocument?.(backup.data);
  const objects = document?.objects ?? options.deserialize(backup.data);
  if (!isCurrentEditableSession()) return false;
  options.restore(objects, document?.metadata.bookmarks);
  options.onRecovered();
  return true;
}

export function isSaveConflict(error: Error): boolean {
  return error instanceof NetworkError && error.statusCode === 409;
}

export function isProjectWriteReset(
  error: Error,
  resetError: typeof ProjectWriteResetError,
): boolean {
  return error instanceof resetError;
}
