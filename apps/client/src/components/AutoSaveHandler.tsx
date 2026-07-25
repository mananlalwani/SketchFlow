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

const AUTOSAVE_DEBOUNCE_MS = 2000;

export function AutoSaveHandler() {
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
  const saveTimeoutRef = useRef<number>();
  const recoveredProjectRef = useRef<string>();
  const { toast } = useToast();

  useEffect(() => {
    if (!currentProjectId || !unsavedChanges || projectRole === 'viewer') return;

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
  }, [objects, projectTitle, currentProjectId, projectRole, unsavedChanges]);

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
      const saved = await activeProjectWriteCoordinator.enqueue({
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
    setSaveStatus,
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
          await activeProjectWriteCoordinator.enqueue({
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
      activeProjectWriteCoordinator.resume(undefined, { transientOnly: true });
      void replayQueue();
    };

    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, [getToken, isGuest, performSave, setSaveStatus, userId]);

  useEffect(() => {
    const tryRecoverBackup = async () => {
      if (!currentProjectId || recoveredProjectRef.current === currentProjectId) return;
      try {
        const backup = await getEmergencyBackup(currentProjectId);
        if (!backup) return;
        if (Date.now() - backup.timestamp < 60 * 60 * 1000) {
          useDrawingStore.getState().setObjects(deserializeProject(backup.data));
          useDrawingStore.getState().requestFullRedraw();
          recoveredProjectRef.current = currentProjectId;
          toast({
            title: 'Recovered unsaved changes',
            description: 'A recent local backup was restored. Review it and save when ready.',
          });
          console.info('Recovered unsaved local changes from IndexedDB backup.');
        } else {
          await removeEmergencyBackup(currentProjectId);
        }
      } catch (e) {
        console.warn('Failed to check emergency backup:', e);
      }
    };

    void tryRecoverBackup();
  }, [currentProjectId, toast]);

  return null;
}
