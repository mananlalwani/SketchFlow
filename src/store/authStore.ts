// Clerk-based auth store - wraps Clerk hooks for easier use
import { useUser, useAuth } from '@clerk/clerk-react';

export function useAuthStore() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isSignedIn } = useAuth();

  return {
    user: user ? {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress || '',
      username: user.username || user.firstName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'User'
    } : null,
    isAuthenticated: isSignedIn ?? false,
    isLoading: !userLoaded,
    getToken: async () => {
      if (isSignedIn) {
        return await getToken();
      }
      return null;
    }
  };
}







