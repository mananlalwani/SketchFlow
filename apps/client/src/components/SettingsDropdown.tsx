import { InputSettingsSection } from '@/components/InputSettingsSection';
import { SettingsAboutDialog } from '@/components/SettingsAboutDialog';
import { SettingsDevToolsDialog } from '@/components/SettingsDevToolsDialog';
import { SettingsAccountPanel } from '@/components/SettingsAccountPanel';
import { SettingsWorkspaceMenus } from '@/components/SettingsWorkspaceMenus';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useMobile } from '@/hooks/useMobile';
import { useToast } from '@/hooks/use-toast';
import { useDrawingStore } from '@/store/drawingStore';
import { clientEnv } from '@/config/env';
import { downloadFile } from '@/lib/export';
import { serializeProject } from '@/lib/utils';
import { getOfflineSaveQueue } from '@/lib/offlineQueue';
import { getEmergencyBackup } from '@/lib/emergencyBackup';
import { useSocket } from '@/hooks/useSocket';

export { InputSettingsSection };

export function SettingsDropdown() {
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { user } = useUser();
  const clerk = useClerk();
  const { toast } = useToast();
  const isMobile = useMobile();
  const [showAbout, setShowAbout] = useState(false);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showMobileProfile, setShowMobileProfile] = useState(false);
  const [showDesktopProfile, setShowDesktopProfile] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const [devToolsUnlocked, setDevToolsUnlocked] = useState(() => {
    try {
      return window.localStorage.getItem('sketchflow-devtools-unlocked') === 'true';
    } catch {
      return false;
    }
  });
  const aboutTapRef = useRef({ count: 0, lastTap: 0 });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [devActionMessage, setDevActionMessage] = useState<string | null>(null);
  const [devStorageInfo, setDevStorageInfo] = useState({
    offlineSaves: 'checking…',
    backup: 'checking…',
    apiLatency: 'checking…',
    caches: 'checking…',
    quota: 'checking…',
  });
  const drawingState = useDrawingStore();
  const { isConnected: socketConnected, connectionError, connectionCount } = useSocket();

  useEffect(() => {
    if (!showDevTools) return;
    let cancelled = false;
    void (async () => {
      const started = performance.now();
      const [saves, backup, cacheKeys] = await Promise.all([
        getOfflineSaveQueue().catch(() => []),
        drawingState.currentProjectId
          ? getEmergencyBackup(drawingState.currentProjectId).catch(() => undefined)
          : Promise.resolve(undefined),
        'caches' in window ? caches.keys().catch(() => []) : Promise.resolve([]),
      ]);
      let quota = 'unavailable';
      try {
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          const format = (value?: number) =>
            value === undefined ? '?' : `${Math.round(value / 1024 / 1024)} MB`;
          quota = `${format(estimate.usage)} used / ${format(estimate.quota)} quota`;
        }
      } catch {
        // Storage estimates are optional browser capabilities.
      }
      let apiLatency = 'unavailable';
      try {
        const response = await fetch(`${clientEnv.API_URL || window.location.origin}/api/health`, {
          cache: 'no-store',
        });
        apiLatency = `${Math.round(performance.now() - started)} ms (${response.status})`;
      } catch {
        // Keep the unavailable marker when the API cannot be reached.
      }
      if (!cancelled) {
        setDevStorageInfo({
          offlineSaves: `${saves.length} queued`,
          backup: backup ? `${Math.round((Date.now() - backup.timestamp) / 1000)}s old` : 'none',
          apiLatency,
          caches: `${cacheKeys.length} cache(s)`,
          quota,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawingState.currentProjectId, showDevTools]);

  const handleAboutTap = () => {
    const now = Date.now();
    const taps = now - aboutTapRef.current.lastTap > 1200 ? 1 : aboutTapRef.current.count + 1;
    aboutTapRef.current = { count: taps, lastTap: now };
    if (taps >= 5) {
      aboutTapRef.current = { count: 0, lastTap: now };
      setDevToolsUnlocked(true);
      window.localStorage.setItem('sketchflow-devtools-unlocked', 'true');
      setShowDevTools(true);
    }
  };

  const diagnostics = () => ({
    mode: clientEnv.IS_PRODUCTION ? 'production' : 'development',
    release: clientEnv.RELEASE_ID,
    apiOrigin: clientEnv.API_URL || 'same origin',
    online: navigator.onLine,
    projectId: drawingState.currentProjectId || null,
    objectCount: drawingState.objects.length,
    history: `${drawingState.historyIndex + 1} / ${drawingState.history.length}`,
    saveStatus: drawingState.saveStatus,
    route: window.location.pathname,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    touch: 'ontouchstart' in window,
    memory:
      'memory' in performance
        ? // SAFETY: the feature check above guarantees the non-standard memory field exists.
          `${Math.round((performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024)} MB heap`
        : 'unavailable',
    socketConnected,
    socketConnectionCount: connectionCount,
    socketError: connectionError?.message || null,
    offlineSaves: devStorageInfo.offlineSaves,
    recoveryBackup: devStorageInfo.backup,
    apiLatency: devStorageInfo.apiLatency,
    caches: devStorageInfo.caches,
    storageQuota: devStorageInfo.quota,
    auth: isAuthenticated ? 'authenticated' : 'guest',
    userId: user?.id ? `…${user.id.slice(-6)}` : 'none',
    documentVersion: drawingState.documentVersion,
    projectRevision: drawingState.projectRevision ?? 'none',
    selectedObjects: drawingState.selectedObjectIds.length,
    tool: drawingState.currentTool,
    canvas: `${drawingState.zoom.toFixed(2)}x @ ${Math.round(drawingState.viewX)},${Math.round(drawingState.viewY)}`,
    visibility: document.visibilityState,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen.width}×${window.screen.height}`,
    network:
      'connection' in navigator
        ? (() => {
            // SAFETY: the feature check above guarantees the non-standard connection field exists.
            const connection = (
              navigator as Navigator & {
                connection?: {
                  effectiveType?: string;
                  rtt?: number;
                  downlink?: number;
                  saveData?: boolean;
                };
              }
            ).connection;
            return `${connection?.effectiveType || '?'} ${connection?.rtt ?? '?'}ms${connection?.saveData ? ' save-data' : ''}`;
          })()
        : 'unavailable',
    userAgent: navigator.userAgent,
  });

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics(), null, 2));
      setDevActionMessage('Diagnostics copied');
    } catch {
      setDevActionMessage('Clipboard unavailable');
    }
  };

  const exportCurrentDocument = () => {
    const data = serializeProject(drawingState.objects, 4096, 4096, {
      bookmarks: drawingState.bookmarks,
    });
    downloadFile(
      data,
      `${drawingState.projectTitle || 'sketchflow-draft'}.json`,
      'application/json',
    );
    setDevActionMessage('Document exported');
  };

  const resetRecoveryNotice = () => {
    if (drawingState.currentProjectId) {
      window.localStorage.removeItem(`sketchflow-recovery-notice:${drawingState.currentProjectId}`);
    }
    setDevActionMessage('Recovery notice reset');
  };

  const resetIntro = () => {
    window.localStorage.removeItem('sketchflow-tutorial-completed');
    window.localStorage.removeItem('sketchflow-has-drawn');
    setDevActionMessage('Intro/tutorial reset; reload to show it again');
  };

  const clearCaches = async () => {
    try {
      if ('caches' in window) {
        await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        await Promise.all(
          (await navigator.serviceWorker.getRegistrations()).map((registration) =>
            registration.unregister(),
          ),
        );
      }
      setDevActionMessage('Caches cleared; reload to re-register the app');
    } catch {
      setDevActionMessage('Could not clear caches');
    }
  };

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
  }, [user?.firstName, user?.lastName]);

  const saveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      toast({ title: 'Profile updated' });
    } catch {
      toast({ title: 'Could not update profile', variant: 'destructive' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const accountPanel = user && (
    <SettingsAccountPanel
      user={user}
      firstName={firstName}
      lastName={lastName}
      setFirstName={setFirstName}
      setLastName={setLastName}
      isSavingProfile={isSavingProfile}
      saveProfile={() => void saveProfile()}
      openSecurity={() => clerk.openUserProfile()}
    />
  );

  return (
    <>
      <SettingsWorkspaceMenus
        isMobile={isMobile}
        theme={theme}
        setTheme={setTheme}
        isLoading={isLoading}
        isAuthenticated={isAuthenticated}
        user={user}
        clerkLoaded={clerk.loaded}
        openUserProfileUnavailable={() =>
          alert(
            'Clerk is not configured. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file',
          )
        }
        signOut={() => clerk.signOut()}
        onOpenAbout={() => setShowAbout(true)}
        onOpenMobileProfile={() => {
          setShowMobileSettings(false);
          setShowMobileProfile(true);
        }}
        onOpenDesktopProfile={() => setShowDesktopProfile(true)}
        showMobileSettings={showMobileSettings}
        setShowMobileSettings={setShowMobileSettings}
      />
      {isAuthenticated && (
        <Drawer open={showMobileProfile} onOpenChange={setShowMobileProfile}>
          <DrawerContent className="h-[92dvh] border-stone-200 bg-stone-50 dark:border-white/[0.09] dark:bg-[#211e1b]">
            <DrawerHeader className="border-b border-stone-200 px-5 pb-3 pt-4 text-left dark:border-white/[0.08]">
              <DrawerTitle className="text-lg font-semibold tracking-[-0.03em] text-stone-950 dark:text-stone-50">
                Account
              </DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">{accountPanel}</div>
            <DrawerFooter className="border-t border-stone-200 px-5 py-4 dark:border-white/[0.08]">
              <DrawerClose asChild>
                <Button className="h-11 w-full bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200">
                  Done
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}

      {isAuthenticated && (
        <Dialog open={showDesktopProfile} onOpenChange={setShowDesktopProfile}>
          <DialogContent className="flex max-h-[84vh] max-w-2xl flex-col gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 dark:border-white/[0.09] dark:bg-[#211e1b]">
            <DialogHeader className="shrink-0 border-b border-stone-200 bg-stone-100/80 px-7 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
              <DialogTitle className="text-xl font-semibold tracking-[-0.035em] text-stone-950 dark:text-stone-50">
                Account
              </DialogTitle>
              <DialogDescription className="mt-1 text-stone-500 dark:text-stone-400">
                Profile, sign-in methods, and security.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{accountPanel}</div>
          </DialogContent>
        </Dialog>
      )}

      <SettingsAboutDialog
        open={showAbout}
        onOpenChange={setShowAbout}
        onVersionPointerDown={handleAboutTap}
        devToolsUnlocked={devToolsUnlocked}
        onOpenDevTools={() => setShowDevTools(true)}
      />
      <SettingsDevToolsDialog
        open={showDevTools}
        onOpenChange={setShowDevTools}
        drawingState={drawingState}
        socketConnected={socketConnected}
        connectionCount={connectionCount}
        connectionError={connectionError}
        devStorageInfo={devStorageInfo}
        isAuthenticated={isAuthenticated}
        userId={user?.id}
        copyDiagnostics={() => void copyDiagnostics()}
        exportCurrentDocument={exportCurrentDocument}
        resetRecoveryNotice={resetRecoveryNotice}
        resetIntro={resetIntro}
        clearCaches={() => void clearCaches()}
        devActionMessage={devActionMessage}
      />
    </>
  );
}
