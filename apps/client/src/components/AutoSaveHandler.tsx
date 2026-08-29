import { useEffect, useRef, useCallback } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuth } from '@clerk/clerk-react';
import { useAuthStore } from '@/store/authStore';
import {
  activeProjectWriteCoordinator,
  ProjectWriteResetError,
} from '@/lib/projectWriteCoordinator';
import { deserializeProject, serializeProject } from '@/lib/utils';
import {
  getEmergencyBackup,
  removeEmergencyBackup,
  saveEmergencyBackup,
} from '@/lib/emergencyBackup';
import { NetworkError } from '@/lib/errorHandling';
import { useToast } from '@/hooks/use-toast';
import {
  enqueueOfflineSave,
  getOfflineSaveQueue,
  markOfflineSaveAttempt,
  removeOfflineSave,
} from '@/lib/offlineQueue';
import type { DrawingObject, DrawingState } from '@/store/drawingStore';
import type { JsonValue } from '@sketchflow/shared';

const AUTOSAVE_DEBOUNCE_MS = 2000;

type SaveStatus = DrawingState['saveStatus'];

interface AutoSaveDrawingState {
  unsavedChanges: boolean;
  currentProjectId?: string;
  projectRevision?: number;
  projectRole?: 'owner' | 'editor' | 'viewer' | null;
  documentVersion: number;
  objects: DrawingObject[];
  projectTitle: string;
  markSaved(documentVersion: number): void;
  requestFullRedraw(): void;
  setObjects(objects: DrawingObject[]): void;
  setProjectRevision(revision: number | undefined): void;
  setSaveStatus(status: SaveStatus): void;
}

interface AutoSaveDrawingStore {
  (): AutoSaveDrawingState;
  getState(): AutoSaveDrawingState;
}

export interface AutoSaveRuntime {
  useDrawingStore: AutoSaveDrawingStore;
  useAuth(): Pick<ReturnType<typeof useAuth>, 'getToken' | 'userId'>;
  useAuthStore(): { isGuest: boolean };
  writeCoordinator: Pick<typeof activeProjectWriteCoordinator, 'enqueue' | 'resume'>;
  ProjectWriteResetError: typeof ProjectWriteResetError;
  serializeProject(objects: DrawingObject[], width: number, height: number): string;
  deserializeProject(data: JsonValue | string): DrawingObject[];
  getEmergencyBackup: typeof getEmergencyBackup;
  removeEmergencyBackup: typeof removeEmergencyBackup;
  saveEmergencyBackup: typeof saveEmergencyBackup;
  enqueueOfflineSave: typeof enqueueOfflineSave;
  getOfflineSaveQueue: typeof getOfflineSaveQueue;
  markOfflineSaveAttempt: typeof markOfflineSaveAttempt;
  removeOfflineSave: typeof removeOfflineSave;
  useToast(): Pick<ReturnType<typeof useToast>, 'toast'>;
}

const defaultRuntime: AutoSaveRuntime = {
  useDrawingStore,
  useAuth,
  useAuthStore,
  writeCoordinator: activeProjectWriteCoordinator,
  ProjectWriteResetError,
  serializeProject,
  deserializeProject,
  getEmergencyBackup,
  removeEmergencyBackup,
  saveEmergencyBackup,
  enqueueOfflineSave,
  getOfflineSaveQueue,
  markOfflineSaveAttempt,
  removeOfflineSave,
  useToast,
};

export function AutoSaveHandler({ runtime = defaultRuntime }: { runtime?: AutoSaveRuntime }) {
  const {
    useDrawingStore,
    useAuth,
    useAuthStore,
    writeCoordinator,
    ProjectWriteResetError,
    serializeProject,
    deserializeProject,
    getEmergencyBackup,
    removeEmergencyBackup,
    saveEmergencyBackup,
    enqueueOfflineSave,
    getOfflineSaveQueue,
    markOfflineSaveAttempt,
    removeOfflineSave,
    useToast,
  } = runtime;
  const {
    unsavedChanges,
    currentProjectId,
    projectRevision,
    projectRole,
    documentVersion,
    objects,
    projectTitle,
    setSaveStatus,
  } = useDrawingStore();
  const { getToken, userId } = useAuth();
  const { isGuest } = useAuthStore();
  const saveTimeoutRef = useRef<number | undefined>(undefined);
  const recoveredProjectRef = useRef<string | undefined>(undefined);
  const skipRecoveredBackupRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!currentProjectId || !unsavedChanges || projectRole === 'viewer') return;
    if (skipRecoveredBackupRef.current) {
      skipRecoveredBackupRef.current = false;
      return;
    }

    void (async () => {
      try {
        const backup = {
          projectId: currentProjectId,
          title: projectTitle,
          data: serializeProject(objects, 4096, 4096),
          timestamp: Date.now(),
        };
        await saveEmergencyBackup(backup);
      } catch (e) {
        console.warn('Emergency backup failed:', e);
      }
    })();
  }, [
    objects,
    projectTitle,
    currentProjectId,
    projectRole,
    saveEmergencyBackup,
    serializeProject,
    unsavedChanges,
  ]);

  const performSave = useCallback(async (): Promise<boolean> => {
    if (!currentProjectId || projectRole === 'viewer') return false;
    const savedProjectId = currentProjectId;
    const savedDocumentVersion = documentVersion;
    const savedTitle = projectTitle;
    const payload = serializeProject(objects, 4096, 4096);
    const revision = projectRevision;
    if (!isGuest && (!userId || revision === undefined)) {
      setSaveStatus('failed');
      return false;
    }

    setSaveStatus('syncing');
    try {
      const saved = await writeCoordinator.enqueue({
        projectKey: savedProjectId,
        projectId: savedProjectId,
        title: savedTitle,
        data: payload,
        documentVersion: savedDocumentVersion,
        expectedRevision: revision,
        cloud: !isGuest,
        tokenProvider: isGuest ? undefined : getToken,
      });
      const currentState = useDrawingStore.getState();
      const isCurrentSnapshot =
        currentState.currentProjectId === savedProjectId &&
        currentState.documentVersion === savedDocumentVersion;
      if (isCurrentSnapshot) {
        currentState.setProjectRevision(saved.revision);
        await removeEmergencyBackup(savedProjectId, { title: savedTitle, data: payload });
        currentState.markSaved(savedDocumentVersion);
      }
      return true;
    } catch (e) {
      if (e instanceof ProjectWriteResetError) return false;
      if (e instanceof NetworkError && e.statusCode === 409) {
        setSaveStatus('conflict');
        return false;
      }
      setSaveStatus('failed');
      if (!isGuest && userId && revision !== undefined) {
        await enqueueOfflineSave({
          projectId: savedProjectId,
          title: savedTitle,
          data: payload,
          revision,
          createdAt: Date.now(),
        });
      }
      return false;
    }
  }, [
    currentProjectId,
    projectRole,
    userId,
    isGuest,
    objects,
    projectTitle,
    projectRevision,
    documentVersion,
    getToken,
    ProjectWriteResetError,
    enqueueOfflineSave,
    removeEmergencyBackup,
    setSaveStatus,
    serializeProject,
    useDrawingStore,
    writeCoordinator,
  ]);

  useEffect(() => {
    if (!unsavedChanges || projectRole === 'viewer') return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      performSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [unsavedChanges, projectRole, performSave]);

  // The IndexedDB backup is a durable local queue for an unsaved snapshot.
  // Retry it when the browser regains connectivity; a 409 remains visible as a
  // conflict instead of overwriting newer remote data.
  useEffect(() => {
    const replayQueue = async () => {
      if (isGuest || !userId) return;
      if (!(await getToken())) return;
      const operations = await getOfflineSaveQueue();
      const latestByProject = new Map<string, (typeof operations)[number]>();
      for (const operation of operations) {
        const latest = latestByProject.get(operation.projectId);
        if (!latest || operation.createdAt >= latest.createdAt) {
          latestByProject.set(operation.projectId, operation);
        }
      }

      for (const operation of latestByProject.values()) {
        if (operation.id === undefined || operation.revision === undefined) {
          if (operation.id !== undefined) await markOfflineSaveAttempt(operation.id);
          setSaveStatus('conflict');
          return;
        }
        try {
          await writeCoordinator.enqueue({
            projectKey: operation.projectId,
            projectId: operation.projectId,
            title: operation.title,
            data: operation.data,
            documentVersion: operation.createdAt,
            expectedRevision: operation.revision,
            cloud: true,
            tokenProvider: getToken,
          });
          for (const stale of operations.filter((item) => item.projectId === operation.projectId)) {
            if (stale.id !== undefined) await removeOfflineSave(stale.id);
          }
        } catch (error) {
          await markOfflineSaveAttempt(operation.id);
          if (error instanceof NetworkError && error.statusCode === 409) setSaveStatus('conflict');
          return;
        }
      }
    };
    const retryWhenOnline = () => {
      // Only transiently failed lanes may resume on reconnect. A conflict or
      // permission failure requires an explicit manual save after the user has
      // reconciled the project.
      writeCoordinator.resume(undefined, { transientOnly: true });
      void replayQueue();
    };

    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, [
    getToken,
    getOfflineSaveQueue,
    isGuest,
    markOfflineSaveAttempt,
    performSave,
    removeOfflineSave,
    setSaveStatus,
    userId,
    writeCoordinator,
  ]);

  useEffect(() => {
    const tryRecoverBackup = async () => {
      if (!currentProjectId || recoveredProjectRef.current === currentProjectId) return;
      try {
        const backup = await getEmergencyBackup(currentProjectId);
        if (!backup) return;
        if (Date.now() - backup.timestamp < 60 * 60 * 1000) {
          skipRecoveredBackupRef.current = true;
          useDrawingStore.getState().setObjects(deserializeProject(backup.data));
          useDrawingStore.getState().requestFullRedraw();
          recoveredProjectRef.current = currentProjectId;
          const noticeKey = `sketchflow-recovery-notice:${currentProjectId}`;
          let noticeShown = false;
          try {
            noticeShown = window.localStorage.getItem(noticeKey) === String(backup.timestamp);
            if (!noticeShown) window.localStorage.setItem(noticeKey, String(backup.timestamp));
          } catch {
            // Recovery must still work when browser storage is unavailable.
          }
          if (!noticeShown) {
            toast({
              title: 'Recovered unsaved changes',
              description: 'A recent local backup was restored. Review it and save when ready.',
            });
          }
          console.info('Recovered unsaved local changes from IndexedDB backup.');
        } else {
          await removeEmergencyBackup(currentProjectId);
        }
      } catch (e) {
        console.warn('Failed to check emergency backup:', e);
      }
    };

    void tryRecoverBackup();
  }, [
    currentProjectId,
    deserializeProject,
    getEmergencyBackup,
    removeEmergencyBackup,
    toast,
    useDrawingStore,
  ]);

  return null;
}
