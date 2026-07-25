import { SignInButton, SignUpButton, UserButton, useClerk } from '@clerk/clerk-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';

export function FloatingAuthButton() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const clerk = useClerk();

  if (isLoading) return null;

  return (
    <div className="pointer-events-auto">
      {isAuthenticated && user ? (
        <UserButton afterSignOutUrl="/draw" />
      ) : clerk.loaded ? (
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <Button
              variant="ghost"
              size="sm"
              className="font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button
              variant="default"
              size="sm"
              className="font-medium bg-blue-600 hover:bg-blue-700"
            >
              Sign Up
            </Button>
          </SignUpButton>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="font-medium text-slate-600 dark:text-slate-300"
          onClick={() => {
            alert(
              'Clerk is not configured. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file',
            );
          }}
        >
          <User className="w-4 h-4 mr-1.5" />
          <span>Login</span>
        </Button>
      )}
    </div>
  );
}
