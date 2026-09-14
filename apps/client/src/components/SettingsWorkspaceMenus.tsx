import { InputSettingsSection } from '@/components/InputSettingsSection';
import { AuthTrigger } from '@/components/auth/AuthTrigger';
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
} from 'lucide-react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

export function SettingsWorkspaceMenus({
  isMobile,
  theme,
  setTheme,
  isLoading,
  isAuthenticated,
  user,
  clerkLoaded,
  openUserProfileUnavailable,
  signOut,
  onOpenAbout,
  onOpenMobileProfile,
  onOpenDesktopProfile,
  showMobileSettings,
  setShowMobileSettings,
}: {
  isMobile: boolean;
  theme: string;
  setTheme: (theme: 'light' | 'dark') => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  user:
    | {
        imageUrl: string;
        firstName: string | null;
        username: string | null;
        primaryEmailAddress?: { emailAddress: string } | null;
      }
    | null
    | undefined;
  clerkLoaded: boolean;
  openUserProfileUnavailable: () => void;
  signOut: () => void;
  onOpenAbout: () => void;
  onOpenMobileProfile: () => void;
  onOpenDesktopProfile: () => void;
  showMobileSettings: boolean;
  setShowMobileSettings: (open: boolean) => void;
}) {
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

              <InputSettingsSection mobile />

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
                        onOpenMobileProfile();
                      }}
                    >
                      <User className="h-4 w-4" />
                      Manage account
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11 w-full justify-start gap-2 text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:text-red-300"
                      onClick={signOut}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </div>
                ) : clerkLoaded ? (
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
                    onClick={openUserProfileUnavailable}
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
                  onClick={onOpenAbout}
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
            className="w-80 overflow-hidden rounded-xl border-stone-200 bg-stone-50 p-1.5 shadow-xl shadow-stone-950/10 dark:border-white/[0.09] dark:bg-[#211e1b] dark:shadow-black/30"
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

            <InputSettingsSection />

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
                  onSelect={onOpenDesktopProfile}
                  className="gap-2 rounded-lg px-2.5 py-2 text-stone-700 dark:text-stone-200"
                >
                  <User className="w-4 h-4" />
                  <span>Manage Account</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={signOut}
                  className="gap-2 rounded-lg px-2.5 py-2 text-red-700 focus:text-red-700 dark:text-red-300 dark:focus:text-red-300"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </>
            ) : clerkLoaded ? (
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
                onClick={openUserProfileUnavailable}
                className="gap-2 rounded-lg px-2.5 py-2 text-stone-700 dark:text-stone-200"
              >
                <User className="w-4 h-4" />
                <span>Login</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator className="my-1.5 bg-stone-200 dark:bg-white/[0.08]" />

            <DropdownMenuItem
              onSelect={onOpenAbout}
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
    </>
  );
}
