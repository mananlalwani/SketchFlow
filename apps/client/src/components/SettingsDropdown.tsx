import { SignInButton, SignUpButton, UserButton, useClerk, useUser } from '@clerk/clerk-react';
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
import { Settings, Sun, Moon, User, LogIn, UserPlus, LogOut, Info } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function SettingsDropdown() {
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { user } = useUser();
  const clerk = useClerk();
  const [showAbout, setShowAbout] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Theme Section */}
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4" />
            <span>Light</span>
          </div>
          {theme === 'light' && (
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4" />
            <span>Dark</span>
          </div>
          {theme === 'dark' && (
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Account Section */}
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <DropdownMenuItem disabled>
            <span className="text-sm text-slate-500">Loading...</span>
          </DropdownMenuItem>
        ) : isAuthenticated && user ? (
          <>
            <div className="px-2 py-2 flex items-center gap-3">
              <UserButton 
                afterSignOutUrl="/draw"
                appearance={{
                  elements: {
                    avatarBox: "w-8 h-8"
                  }
                }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {user.firstName || user.username || 'User'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user.primaryEmailAddress?.emailAddress}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => clerk.openUserProfile()}
              className="flex items-center gap-2"
            >
              <User className="w-4 h-4" />
              <span>Manage Account</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => clerk.signOut()}
              className="flex items-center gap-2 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </>
        ) : clerk.loaded ? (
          <>
            <SignInButton mode="modal">
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onSelect={(e) => e.preventDefault()}
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </DropdownMenuItem>
            </SignInButton>
            <SignUpButton mode="modal">
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onSelect={(e) => e.preventDefault()}
              >
                <UserPlus className="w-4 h-4" />
                <span>Sign Up</span>
              </DropdownMenuItem>
            </SignUpButton>
          </>
        ) : (
          <DropdownMenuItem
            onClick={() => {
              alert('Clerk is not configured. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file');
            }}
            className="flex items-center gap-2"
          >
            <User className="w-4 h-4" />
            <span>Login</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* About Section */}
        <DropdownMenuItem
          onClick={() => setShowAbout(true)}
          className="flex items-center gap-2"
        >
          <Info className="w-4 h-4" />
          <span>About</span>
        </DropdownMenuItem>
      </DropdownMenuContent>

      {/* About Dialog */}
      <Dialog open={showAbout} onOpenChange={setShowAbout}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              DrawApp
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  A collaborative drawing application for creating and sharing sketches in real-time.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Version</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">1.0.0</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                    © {new Date().getFullYear()} Manan Lalwani. All rights reserved.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
