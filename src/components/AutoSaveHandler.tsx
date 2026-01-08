import { useEffect, useRef, useCallback } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuth } from '@clerk/clerk-react';
import { useAuthStore } from '@/store/authStore';
import { updateProject } from '@/lib/api'; // Use barrel export if possible or direct path
import { serializeProject } from '@/lib/utils';

export function AutoSaveHandler() {
  const { unsavedChanges, currentProjectId, objects, projectTitle, markSaved } = useDrawingStore();
  const { getToken, userId } = useAuth();
  const { isGuest } = useAuthStore();
  const saveTimeoutRef = useRef<number>();

  // Function to perform save
  const performSave = useCallback(async () => {
    // For guests with a current project ID (local project), save to IndexedDB via API layer
    if (isGuest && currentProjectId) {
      try {
        const payload = serializeProject(objects, 4096, 4096);
        await updateProject(currentProjectId, projectTitle, payload, null); // API will route to local storage
        markSaved();
        console.debug('Auto-saved local project:', currentProjectId);
      } catch (e) {
        console.error('Local auto-save failed:', e);
      }
      return;
    }
    
    // For authenticated users
    if (!currentProjectId || !userId) {
      return;
    }
    
    try {
      const token = await getToken();
      const payload = serializeProject(objects, 4096, 4096);
      await updateProject(currentProjectId, projectTitle, payload, token);
      markSaved();
      console.debug('Auto-saved project:', currentProjectId);
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }, [currentProjectId, userId, isGuest, objects, projectTitle, getToken, markSaved]);

  // Debounced auto-save trigger
  useEffect(() => {
    if (!unsavedChanges) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout (e.g., 2 seconds debounce)
    saveTimeoutRef.current = window.setTimeout(() => {
      performSave();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [unsavedChanges, performSave]);

  return null; // Headless component
}


