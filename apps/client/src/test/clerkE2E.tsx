/* eslint-disable react-refresh/only-export-components -- Vite aliases this module only for Playwright. */
import type { ReactNode } from 'react';

const isAuthenticatedForE2E = () =>
  typeof window !== 'undefined' && window.localStorage.getItem('e2e-authenticated') === 'true';

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  const isSignedIn = isAuthenticatedForE2E();
  return {
    userId: isSignedIn ? 'e2e-user' : null,
    isLoaded: true,
    isSignedIn,
    getToken: async () => (isSignedIn ? 'e2e-token' : null),
  };
}

export function useUser() {
  const isSignedIn = isAuthenticatedForE2E();
  return {
    user: isSignedIn
      ? {
          id: 'e2e-user',
          username: 'E2E User',
          firstName: 'E2E',
          primaryEmailAddress: { emailAddress: 'e2e@example.test' },
        }
      : null,
    isLoaded: true,
  };
}

export function useClerk() {
  return {
    signOut: async () => undefined,
    openSignIn: () => undefined,
    openSignUp: () => undefined,
  };
}

export function SignInButton({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignUpButton({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function UserButton() {
  return null;
}
