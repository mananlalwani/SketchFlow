import { useEffect, useRef, useCallback } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuth } from '@clerk/clerk-react';
import { useAuthStore } from '@/store/authStore';
import { updateProject } from '@/lib/api';
import { deserializeProject, serializeProject } from '@/lib/utils';
import {
  getEmergencyBackup,
  removeEmergencyBackup,
  saveEmergencyBackup,
} from '@/lib/emergencyBackup';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { NetworkError } from '@/lib/errorHandling';
import { useToast } from '@/hooks/use-toast';

const AUTOSAVE_DEBOUNCE_MS = 2000;
const MAX_RETRY_ATTEMPTS = 3;

export function AutoSaveHandler() {
  const {
    unsavedChanges,
    currentProjectId,
    projectRevision,
    objects,
    projectTitle,
    markSaved,
    setSaveStatus,
  } = useDrawingStore();
  const { getToken, userId } = useAuth();
  const { isGuest } = useAuthStore();
  const saveTimeoutRef = useRef<number>();
  const retryCountRef = useRef(0);
  const recoveredProjectRef = useRef<string>();
  const { toast } = useToast();

  useEffect(() => {
    if (!currentProjectId || !unsavedChanges) return;

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
  }, [objects, projectTitle, currentProjectId, unsavedChanges]);

  const performSave = useCallback(
    async (attemptNumber = 0): Promise<boolean> => {
      if (!currentProjectId) return false;

      setSaveStatus(attemptNumber === 0 ? 'syncing' : 'retrying');

      try {
        const payload = serializeProject(objects, 4096, 4096);

        let thumbnail: string | null = null;
        try {
          thumbnail = await generateThumbnail(objects, 4096, 4096);
        } catch (e) {
          console.warn('Failed to generate thumbnail, continuing save without it:', e);
        }

        let saved;
        if (isGuest) {
          saved = await updateProject(currentProjectId, projectTitle, payload, null, thumbnail);
        } else if (userId) {
          const token = await getToken();
          saved = await updateProject(
            currentProjectId,
            projectTitle,
            payload,
            token,
            thumbnail,
            projectRevision,
          );
        } else {
          return false;
        }

        await removeEmergencyBackup(currentProjectId);
        useDrawingStore.getState().setProjectRevision(saved.revision);
        markSaved();
        retryCountRef.current = 0;
        console.debug('Auto-saved project:', currentProjectId);
        return true;
      } catch (e) {
        if (e instanceof NetworkError && e.statusCode === 409) {
          setSaveStatus('conflict');
          // Keep the emergency backup intact so the local version remains recoverable.
          console.warn('Auto-save conflict: the project changed on another client.');
          return false;
        }
        console.error(`Auto-save failed (attempt ${attemptNumber + 1}/${MAX_RETRY_ATTEMPTS}):`, e);

        if (attemptNumber < MAX_RETRY_ATTEMPTS - 1) {
          const delay = Math.pow(2, attemptNumber) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return performSave(attemptNumber + 1);
        } else {
          setSaveStatus('failed');
          retryCountRef.current = MAX_RETRY_ATTEMPTS;
          return false;
        }
      }
    },
    [
      currentProjectId,
      userId,
      isGuest,
      objects,
      projectTitle,
      projectRevision,
      getToken,
      markSaved,
      setSaveStatus,
    ],
  );

  useEffect(() => {
    if (!unsavedChanges) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      performSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [unsavedChanges, performSave]);

  // The IndexedDB backup is a durable local queue for an unsaved snapshot.
  // Retry it when the browser regains connectivity; a 409 remains visible as a
  // conflict instead of overwriting newer remote data.
  useEffect(() => {
    const retryWhenOnline = () => {
      if (useDrawingStore.getState().unsavedChanges) {
        void performSave();
      }
    };

    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, [performSave]);

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
