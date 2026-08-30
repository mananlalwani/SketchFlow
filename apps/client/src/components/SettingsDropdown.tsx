import { useClerk, useUser } from '@clerk/clerk-react';
import { AuthTrigger } from '@/components/auth/AuthTrigger';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Settings,
  Sun,
  Moon,
  User,
  LogIn,
  UserPlus,
  LogOut,
  Info,
  PenTool,
  Copy,
  Download,
  RotateCcw,
  Trash2,
} from 'lucide-react';
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
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useMobile } from '@/hooks/useMobile';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDrawingStore } from '@/store/drawingStore';
import { clientEnv } from '@/config/env';
import { downloadFile } from '@/lib/export';
import { serializeProject } from '@/lib/utils';
import { getOfflineSaveQueue } from '@/lib/offlineQueue';
import { getEmergencyBackup } from '@/lib/emergencyBackup';
import { useSocket } from '@/hooks/useSocket';

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
        ? `${Math.round((performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024)} MB heap`
        : 'unavailable',
    socketConnected,
    socketConnectionCount: connectionCount,
    socketError: connectionError?.message || null,
    offlineSaves: devStorageInfo.offlineSaves,
    recoveryBackup: devStorageInfo.backup,
    apiLatency: devStorageInfo.apiLatency,
    caches: devStorageInfo.caches,
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
    const data = serializeProject(drawingState.objects, 4096, 4096);
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
    <div className="divide-y divide-stone-200 dark:divide-white/[0.08]">
      <section className="py-5">
        <div className="flex items-center gap-3">
          <img
            src={user.imageUrl}
            alt=""
            className="h-11 w-11 rounded-xl border border-stone-200 object-cover dark:border-white/[0.1]"
          />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-[-0.02em] text-stone-950 dark:text-stone-50">
              {user.fullName || user.username || 'SketchFlow user'}
            </p>
            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
              {user.primaryEmailAddress?.emailAddress}
            </p>
          </div>
        </div>
      </section>

      <section className="py-5">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
              Profile
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-stone-900 dark:text-stone-100">
              How collaborators see you
            </h3>
          </div>
          <p className="hidden text-right text-xs text-stone-500 dark:text-stone-400 sm:block">
            Changes save to your account.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">
            First name
            <Input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="h-10 border-stone-300 bg-white dark:border-white/[0.1] dark:bg-stone-950/30"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">
            Last name
            <Input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="h-10 border-stone-300 bg-white dark:border-white/[0.1] dark:bg-stone-950/30"
            />
          </label>
        </div>
        <Button
          className="mt-5 bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
          onClick={() => void saveProfile()}
          disabled={isSavingProfile}
        >
          {isSavingProfile ? 'Saving…' : 'Save profile'}
        </Button>
      </section>

      <section className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
            Security
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-stone-900 dark:text-stone-100">
            Sign-in & protection
          </h3>
          <p className="mt-2 max-w-md text-xs leading-5 text-stone-500 dark:text-stone-400">
            Passwords, sign-in methods, and multi-factor authentication are handled securely by
            Clerk.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-stone-300 dark:border-white/[0.1]"
          onClick={() => clerk.openUserProfile()}
        >
          Security settings
        </Button>
      </section>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={showMobileSettings} onOpenChange={setShowMobileSettings}>
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-stone-50"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="border-stone-200 bg-stone-50 dark:border-white/[0.09] dark:bg-[#211e1b]">
            <DrawerHeader className="border-b border-stone-200 px-5 pb-3 pt-4 text-left dark:border-white/[0.08]">
              <DrawerTitle className="text-lg font-semibold tracking-[-0.03em] text-stone-950 dark:text-stone-50">
                Workspace settings
              </DrawerTitle>
            </DrawerHeader>
            <div className="space-y-4 px-5 py-4">
              <section>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
                  Appearance
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1.5 dark:bg-white/[0.035]">
                  <Button
                    variant="ghost"
                    className={`h-11 justify-center gap-2 ${
                      theme === 'light'
                        ? 'bg-white text-stone-950 shadow-sm hover:bg-white dark:bg-white/10 dark:text-stone-50 dark:hover:bg-white/10'
                        : 'text-stone-500 hover:bg-transparent dark:text-stone-400 dark:hover:bg-transparent'
                    }`}
                    onClick={() => setTheme('light')}
                  >
                    <Sun className="h-4 w-4" />
                    Light
                  </Button>
                  <Button
                    variant="ghost"
                    className={`h-11 justify-center gap-2 ${
                      theme === 'dark'
                        ? 'bg-stone-900 text-amber-200 shadow-sm hover:bg-stone-900 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-300'
                        : 'text-stone-500 hover:bg-transparent dark:text-stone-400 dark:hover:bg-transparent'
                    }`}
                    onClick={() => setTheme('dark')}
                  >
                    <Moon className="h-4 w-4" />
                    Dark
                  </Button>
                </div>
              </section>

              <section>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
                  Account
                </p>
                {isLoading ? (
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-stone-400">
                    Loading account…
                  </div>
                ) : isAuthenticated && user ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
                      <img
                        src={user.imageUrl}
                        alt=""
                        className="h-9 w-9 rounded-xl border border-stone-200 object-cover dark:border-white/[0.1]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                          {user.firstName || user.username || 'User'}
                        </p>
                        <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                          {user.primaryEmailAddress?.emailAddress}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-start gap-2 border-stone-300 dark:border-white/[0.1]"
                      onClick={() => {
                        setShowMobileSettings(false);
                        setShowMobileProfile(true);
                      }}
                    >
                      <User className="h-4 w-4" />
                      Manage account
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11 w-full justify-start gap-2 text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:text-red-300"
                      onClick={() => clerk.signOut()}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </div>
                ) : clerk.loaded ? (
                  <div className="space-y-2">
                    <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                      Sign in to keep projects synced and invite collaborators.
                    </p>
                    <AuthTrigger mode="sign-in">
                      <Button className="h-11 w-full justify-start gap-2 bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200">
                        <LogIn className="h-4 w-4" />
                        Sign in
                      </Button>
                    </AuthTrigger>
                    <AuthTrigger mode="sign-up">
                      <Button
                        variant="outline"
                        className="h-11 w-full justify-start gap-2 border-stone-300 dark:border-white/[0.1]"
                      >
                        <UserPlus className="h-4 w-4" />
                        Create account
                      </Button>
                    </AuthTrigger>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="h-11 w-full justify-start gap-2 border-stone-300 dark:border-white/[0.1]"
                    onClick={() =>
                      alert(
                        'Clerk is not configured. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file',
                      )
                    }
                  >
                    <User className="h-4 w-4" />
                    Log in
                  </Button>
                )}
              </section>

              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  className="h-11 w-full justify-start gap-2 border-t border-stone-200 px-0 text-stone-500 hover:bg-transparent hover:text-stone-900 dark:border-white/[0.08] dark:text-stone-400 dark:hover:bg-transparent dark:hover:text-stone-100"
                  onClick={() => setShowAbout(true)}
                >
                  <Info className="h-4 w-4" />
                  <span className="flex-1 text-left">About SketchFlow</span>
                  <span className="text-[10px] font-medium text-stone-400 dark:text-stone-500">
                    v1.0
                  </span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-stone-50"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 overflow-hidden rounded-xl border-stone-200 bg-stone-50 p-1.5 shadow-xl shadow-stone-950/10 dark:border-white/[0.09] dark:bg-[#211e1b] dark:shadow-black/30"
          >
            <div className="rounded-lg bg-stone-100/90 p-1 dark:bg-white/[0.035]">
              <DropdownMenuLabel className="px-2.5 pb-1.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
                Appearance
              </DropdownMenuLabel>
              <div className="grid grid-cols-2 gap-1">
                <DropdownMenuItem
                  onSelect={() => setTheme('light')}
                  className={`justify-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium ${
                    theme === 'light'
                      ? 'bg-white text-stone-950 shadow-sm dark:bg-white/10 dark:text-stone-50'
                      : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setTheme('dark')}
                  className={`justify-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium ${
                    theme === 'dark'
                      ? 'bg-stone-900 text-amber-200 shadow-sm dark:bg-amber-300 dark:text-stone-950'
                      : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </DropdownMenuItem>
              </div>
            </div>

            <DropdownMenuSeparator className="my-1.5 bg-stone-200 dark:bg-white/[0.08]" />

            <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
              Account
            </DropdownMenuLabel>

            {isLoading ? (
              <DropdownMenuItem disabled className="px-2.5 py-2 text-stone-500 dark:text-stone-400">
                <span className="text-sm">Loading account…</span>
              </DropdownMenuItem>
            ) : isAuthenticated && user ? (
              <>
                <div className="mx-1 mb-1 flex items-center gap-3 rounded-lg bg-white px-2.5 py-2.5 dark:bg-white/[0.035]">
                  <img
                    src={user.imageUrl}
                    alt=""
                    className="h-8 w-8 rounded-lg border border-stone-200 object-cover dark:border-white/[0.1]"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                      {user.firstName || user.username || 'User'}
                    </span>
                    <span className="truncate text-xs text-stone-500 dark:text-stone-400">
                      {user.primaryEmailAddress?.emailAddress}
                    </span>
                  </div>
                </div>
                <DropdownMenuItem
                  onSelect={() => setShowDesktopProfile(true)}
                  className="gap-2 rounded-lg px-2.5 py-2 text-stone-700 dark:text-stone-200"
                >
                  <User className="w-4 h-4" />
                  <span>Manage Account</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => clerk.signOut()}
                  className="gap-2 rounded-lg px-2.5 py-2 text-red-700 focus:text-red-700 dark:text-red-300 dark:focus:text-red-300"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </>
            ) : clerk.loaded ? (
              <>
                <p className="px-2.5 pb-2 pt-0.5 text-xs leading-5 text-stone-500 dark:text-stone-400">
                  Sign in to keep projects synced and invite collaborators.
                </p>
                <AuthTrigger mode="sign-in">
                  <DropdownMenuItem
                    className="gap-2 rounded-lg bg-stone-900 px-2.5 py-2 text-amber-100 focus:bg-stone-800 focus:text-amber-100 dark:bg-amber-300 dark:text-stone-950 dark:focus:bg-amber-200 dark:focus:text-stone-950"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </DropdownMenuItem>
                </AuthTrigger>
                <AuthTrigger mode="sign-up">
                  <DropdownMenuItem
                    className="mt-1 gap-2 rounded-lg px-2.5 py-2 text-stone-700 dark:text-stone-200"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Sign Up</span>
                  </DropdownMenuItem>
                </AuthTrigger>
              </>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  alert(
                    'Clerk is not configured. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file',
                  );
                }}
                className="gap-2 rounded-lg px-2.5 py-2 text-stone-700 dark:text-stone-200"
              >
                <User className="w-4 h-4" />
                <span>Login</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator className="my-1.5 bg-stone-200 dark:bg-white/[0.08]" />

            <DropdownMenuItem
              onSelect={() => setShowAbout(true)}
              className="gap-2 rounded-lg px-2.5 py-2 text-stone-500 dark:text-stone-400"
            >
              <Info className="w-4 h-4" />
              <span className="flex-1">About SketchFlow</span>
              <span className="text-[10px] font-medium text-stone-400 dark:text-stone-500">
                v1.0
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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

      {/* About Dialog */}
      <Dialog open={showAbout} onOpenChange={setShowAbout}>
        <DialogContent className="gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 sm:max-w-md dark:border-white/[0.09] dark:bg-[#211e1b]">
          <DialogHeader className="border-b border-stone-200 bg-stone-100/80 px-6 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-amber-200 shadow-sm shadow-stone-950/15 dark:bg-amber-300 dark:text-stone-950">
                <PenTool className="h-5 w-5" strokeWidth={2.35} />
              </span>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50">
                  SketchFlow
                </DialogTitle>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-600 dark:text-stone-400">
                  Canvas
                </p>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="space-y-5 px-6 py-5">
              <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
                A shared canvas for rough ideas, diagrams, notes, and the conversations around them.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {['Draw together', 'Keep it moving', 'Pick up anywhere'].map((feature) => (
                  <div
                    key={feature}
                    className="rounded-lg border border-stone-200 bg-white px-2 py-2.5 text-center text-[11px] font-medium leading-4 text-stone-700 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-stone-300"
                  >
                    {feature}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-stone-200 pt-4 text-xs dark:border-white/[0.08]">
                <span onPointerDown={handleAboutTap}>Version 1.0.0</span>
                <span className="text-stone-600 dark:text-stone-400">
                  © {new Date().getFullYear()} Manan Lalwani
                </span>
              </div>
            </div>
          </DialogDescription>
        </DialogContent>
      </Dialog>

      <Dialog open={showDevTools} onOpenChange={setShowDevTools}>
        <DialogContent className="gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 sm:max-w-lg dark:border-white/[0.09] dark:bg-[#211e1b]">
          <DialogHeader className="border-b border-stone-200 bg-stone-100/80 px-6 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
            <DialogTitle className="text-xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50">
              Developer tools
            </DialogTitle>
            <DialogDescription className="mt-1 text-stone-500 dark:text-stone-400">
              Runtime diagnostics for local development and support.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 px-6 py-5 text-sm">
            {[
              ['Mode', clientEnv.IS_PRODUCTION ? 'production' : 'development'],
              ['Release', clientEnv.RELEASE_ID],
              ['API origin', clientEnv.API_URL || 'same origin'],
              ['Online', navigator.onLine ? 'yes' : 'no'],
              ['Project', drawingState.currentProjectId || 'unsaved draft'],
              ['Objects', String(drawingState.objects.length)],
              ['History', `${drawingState.historyIndex + 1} / ${drawingState.history.length}`],
              ['Save status', drawingState.saveStatus],
              ['Route', window.location.pathname],
              [
                'Viewport',
                `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
              ],
              ['Touch input', 'ontouchstart' in window ? 'yes' : 'no'],
              ['Socket', socketConnected ? `connected (${connectionCount})` : 'disconnected'],
              ['Socket error', connectionError?.message || 'none'],
              ['Offline queue', devStorageInfo.offlineSaves],
              ['Recovery backup', devStorageInfo.backup],
              ['API latency', devStorageInfo.apiLatency],
              ['App caches', devStorageInfo.caches],
              [
                'Memory',
                'memory' in performance
                  ? `${Math.round((performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024)} MB heap`
                  : 'unavailable',
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.035]"
              >
                <span className="text-stone-500 dark:text-stone-400">{label}</span>
                <span className="max-w-[18rem] truncate font-mono text-xs text-stone-800 dark:text-stone-200">
                  {value}
                </span>
              </div>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-stone-200 pt-4 dark:border-white/[0.08]">
              <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()}>
                <Copy className="mr-2 h-4 w-4" /> Copy diagnostics
              </Button>
              <Button variant="outline" size="sm" onClick={exportCurrentDocument}>
                <Download className="mr-2 h-4 w-4" /> Export document
              </Button>
              <Button variant="outline" size="sm" onClick={resetRecoveryNotice}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset recovery notice
              </Button>
              <Button variant="outline" size="sm" onClick={resetIntro}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset intro/tutorial
              </Button>
              <Button variant="outline" size="sm" onClick={() => void clearCaches()}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear app caches
              </Button>
            </div>
            {devActionMessage && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{devActionMessage}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
