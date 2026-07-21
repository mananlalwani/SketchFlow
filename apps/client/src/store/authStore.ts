// Clerk-based auth store - wraps Clerk hooks for easier use
import { useUser, useAuth } from '@clerk/clerk-react';
import { useMemo, useEffect } from 'react';

// Generate or retrieve guest ID
function getGuestId(): string {
  const GUEST_ID_KEY = 'guest-session-id';
  let guestId = localStorage.getItem(GUEST_ID_KEY);

  if (!guestId) {
    guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }

  return guestId;
}

export function useAuthStore() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isSignedIn } = useAuth();

  // Only consider user as guest if Clerk has loaded and they're not signed in
  const isAuthenticated = isSignedIn ?? false;
  const isGuest = userLoaded && !isAuthenticated;
  const guestId = useMemo(() => (isGuest ? getGuestId() : null), [isGuest]);

  // Clean up guest ID when user signs in
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem('guest-session-id');
    }
  }, [isAuthenticated]);

  return {
    user: user
      ? {
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress || '',
          username:
            user.username ||
            user.firstName ||
            user.primaryEmailAddress?.emailAddress?.split('@')[0] ||
            'User',
        }
      : null,
    isAuthenticated,
    isGuest,
    guestId,
    isLoading: !userLoaded,
    getToken: async () => {
      if (isSignedIn) {
        return await getToken();
      }
      return null;
    },
  };
}
