import { useEffect, useRef, useCallback } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuth } from '@clerk/clerk-react';
import { useAuthStore } from '@/store/authStore';
import { updateProject } from '@/lib/api';
import { serializeProject } from '@/lib/utils';
import { generateThumbnail } from '@/lib/thumbnailGenerator';

const EMERGENCY_BACKUP_KEY = 'emergency-backup';
const AUTOSAVE_DEBOUNCE_MS = 2000;
const MAX_RETRY_ATTEMPTS = 3;

export function AutoSaveHandler() {
  const { 
    unsavedChanges, 
    currentProjectId, 
    objects, 
    projectTitle, 
    markSaved,
    setSaveStatus 
  } = useDrawingStore();
  const { getToken, userId } = useAuth();
  const { isGuest } = useAuthStore();
  const saveTimeoutRef = useRef<number>();
  const retryCountRef = useRef(0);

  // Immediate emergency backup to localStorage (protects against browser crash)
  useEffect(() => {
    if (!currentProjectId || !unsavedChanges) return;

    try {
      const backup = {
        projectId: currentProjectId,
        title: projectTitle,
        data: serializeProject(objects, 4096, 4096),
        timestamp: Date.now(),
      };
      localStorage.setItem(EMERGENCY_BACKUP_KEY, JSON.stringify(backup));
    } catch (e) {
      // Silently fail if localStorage is full or unavailable
      console.warn('Emergency backup failed:', e);
    }
  }, [objects, projectTitle, currentProjectId, unsavedChanges]);

  // Function to perform save with retry logic
  const performSave = useCallback(async (attemptNumber = 0): Promise<boolean> => {
    if (!currentProjectId) return false;

    // Set syncing or retrying status
    setSaveStatus(attemptNumber === 0 ? 'syncing' : 'retrying');

    try {
      const payload = serializeProject(objects, 4096, 4096);
      
      // Generate thumbnail (async, don't block save if it fails)
      let thumbnail: string | null = null;
      try {
        thumbnail = await generateThumbnail(objects, 4096, 4096);
      } catch (e) {
        console.warn('Failed to generate thumbnail, continuing save without it:', e);
      }

      // For guests with a current project ID (local project)
      if (isGuest) {
        await updateProject(currentProjectId, projectTitle, payload, null, thumbnail);
      } else if (userId) {
        // For authenticated users
        const token = await getToken();
        await updateProject(currentProjectId, projectTitle, payload, token, thumbnail);
      } else {
        // No user context yet
        return false;
      }

      // Success - clear emergency backup and mark saved
      localStorage.removeItem(EMERGENCY_BACKUP_KEY);
      markSaved();
      retryCountRef.current = 0;
      console.debug('Auto-saved project:', currentProjectId);
      return true;

    } catch (e) {
      console.error(`Auto-save failed (attempt ${attemptNumber + 1}/${MAX_RETRY_ATTEMPTS}):`, e);

      // Retry with exponential backoff
      if (attemptNumber < MAX_RETRY_ATTEMPTS - 1) {
        const delay = Math.pow(2, attemptNumber) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        return performSave(attemptNumber + 1);
      } else {
        // All retries exhausted
        setSaveStatus('failed');
        retryCountRef.current = MAX_RETRY_ATTEMPTS;
        return false;
      }
    }
  }, [currentProjectId, userId, isGuest, objects, projectTitle, getToken, markSaved, setSaveStatus]);

  // Debounced auto-save trigger
  useEffect(() => {
    if (!unsavedChanges) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout (2 seconds debounce)
    saveTimeoutRef.current = window.setTimeout(() => {
      performSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [unsavedChanges, performSave]);

  // Try to recover from emergency backup on mount
  useEffect(() => {
    const tryRecoverBackup = () => {
      try {
        const backupStr = localStorage.getItem(EMERGENCY_BACKUP_KEY);
        if (!backupStr) return;

        const backup = JSON.parse(backupStr);
        const age = Date.now() - backup.timestamp;

        // Only recover backups less than 1 hour old
        if (age < 60 * 60 * 1000) {
          console.info('Emergency backup found, attempting recovery...');
          // The backup exists but we don't force-load it here
          // User can manually recover if needed, or it will be cleared on next successful save
        } else {
          // Old backup, clear it
          localStorage.removeItem(EMERGENCY_BACKUP_KEY);
        }
      } catch (e) {
        console.warn('Failed to check emergency backup:', e);
      }
    };

    tryRecoverBackup();
  }, []);

  return null; // Headless component
}


