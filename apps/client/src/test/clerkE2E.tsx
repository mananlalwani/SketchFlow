/* eslint-disable react-refresh/only-export-components -- Vite aliases this module only for Playwright. */
import type { ReactNode } from 'react';

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return { userId: null, isLoaded: true, isSignedIn: false, getToken: async () => null };
}

export function useUser() {
  return { user: null, isLoaded: true };
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
