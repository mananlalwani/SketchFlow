import { useEffect, useRef, useCallback } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuth } from '@clerk/clerk-react';
import { updateProject } from '@/lib/api'; // Use barrel export if possible or direct path
import { serializeProject } from '@/lib/utils';

export function AutoSaveHandler() {
  const { unsavedChanges, currentProjectId, objects, projectTitle, markSaved, lastSavedAt } = useDrawingStore();
  const { getToken, userId } = useAuth();
  const saveTimeoutRef = useRef<number>();

  // Function to perform save
  const performSave = useCallback(async () => {
    if (!currentProjectId || !userId) {
        // If local/guest, maybe save to localStorage?
        if (!currentProjectId && objects.length > 0) {
             const payload = serializeProject(objects, 4096, 4096);
             localStorage.setItem('local_work', JSON.stringify({
                 title: projectTitle,
                 data: payload,
                 updatedAt: Date.now()
             }));
        }
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
  }, [currentProjectId, userId, objects, projectTitle, getToken, markSaved]);

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


