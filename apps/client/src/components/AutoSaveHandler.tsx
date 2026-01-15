import { useEffect, useRef, useCallback } from "react";
import { useDrawingStore } from "@/store/drawingStore";
import { useAuth } from "@clerk/clerk-react";
import { useAuthStore } from "@/store/authStore";
import { updateProject } from "@/lib/api";
import { serializeProject } from "@/lib/utils";
import { generateThumbnail } from "@/lib/thumbnailGenerator";

const EMERGENCY_BACKUP_KEY = "emergency-backup";
const AUTOSAVE_DEBOUNCE_MS = 2000;
const MAX_RETRY_ATTEMPTS = 3;

export function AutoSaveHandler() {
  const {
    unsavedChanges,
    currentProjectId,
    objects,
    projectTitle,
    markSaved,
    setSaveStatus,
  } = useDrawingStore();
  const { getToken, userId } = useAuth();
  const { isGuest } = useAuthStore();
  const saveTimeoutRef = useRef<number>();
  const retryCountRef = useRef(0);

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
      console.warn("Emergency backup failed:", e);
    }
  }, [objects, projectTitle, currentProjectId, unsavedChanges]);

  const performSave = useCallback(
    async (attemptNumber = 0): Promise<boolean> => {
      if (!currentProjectId) return false;

      setSaveStatus(attemptNumber === 0 ? "syncing" : "retrying");

      try {
        const payload = serializeProject(objects, 4096, 4096);

        let thumbnail: string | null = null;
        try {
          thumbnail = await generateThumbnail(objects, 4096, 4096);
        } catch (e) {
          console.warn(
            "Failed to generate thumbnail, continuing save without it:",
            e
          );
        }

        if (isGuest) {
          await updateProject(
            currentProjectId,
            projectTitle,
            payload,
            null,
            thumbnail
          );
        } else if (userId) {
          const token = await getToken();
          await updateProject(
            currentProjectId,
            projectTitle,
            payload,
            token,
            thumbnail
          );
        } else {
          return false;
        }

        localStorage.removeItem(EMERGENCY_BACKUP_KEY);
        markSaved();
        retryCountRef.current = 0;
        console.debug("Auto-saved project:", currentProjectId);
        return true;
      } catch (e) {
        console.error(
          `Auto-save failed (attempt ${
            attemptNumber + 1
          }/${MAX_RETRY_ATTEMPTS}):`,
          e
        );

        if (attemptNumber < MAX_RETRY_ATTEMPTS - 1) {
          const delay = Math.pow(2, attemptNumber) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return performSave(attemptNumber + 1);
        } else {
          setSaveStatus("failed");
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
      getToken,
      markSaved,
      setSaveStatus,
    ]
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

  useEffect(() => {
    const tryRecoverBackup = () => {
      try {
        const backupStr = localStorage.getItem(EMERGENCY_BACKUP_KEY);
        if (!backupStr) return;

        const backup = JSON.parse(backupStr);
        const age = Date.now() - backup.timestamp;

        if (age < 60 * 60 * 1000) {
          console.info("Emergency backup found, attempting recovery...");
        } else {
          localStorage.removeItem(EMERGENCY_BACKUP_KEY);
        }
      } catch (e) {
        console.warn("Failed to check emergency backup:", e);
      }
    };

    tryRecoverBackup();
  }, []);

  return null;
}
