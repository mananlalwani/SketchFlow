import { useClerk, useUser } from '@clerk/clerk-react';
import { AuthTrigger } from '@/components/auth/AuthTrigger';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { User } from 'lucide-react';

export function FloatingAuthButton() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();

  if (isLoading) return null;

  return (
    <div className="pointer-events-auto">
      {isAuthenticated && user ? (
        <button
          type="button"
          onClick={() => clerk.signOut({ redirectUrl: '/draw' })}
          className="rounded-lg outline-none ring-amber-400 focus-visible:ring-2 focus-visible:ring-offset-2"
          title="Sign out"
          aria-label="Sign out"
        >
          {clerkUser ? (
            <img
              src={clerkUser.imageUrl}
              alt=""
              className="h-8 w-8 rounded-lg border border-stone-200 object-cover dark:border-white/[0.1]"
            />
          ) : (
            <User className="h-5 w-5" />
          )}
        </button>
      ) : clerk.loaded ? (
        <div className="flex items-center gap-2">
          <AuthTrigger mode="sign-in">
            <Button
              variant="ghost"
              size="sm"
              className="font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              Sign In
            </Button>
          </AuthTrigger>
          <AuthTrigger mode="sign-up">
            <Button
              variant="default"
              size="sm"
              className="font-medium bg-blue-600 hover:bg-blue-700"
            >
              Sign Up
            </Button>
          </AuthTrigger>
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
