/* eslint-disable react-refresh/only-export-components -- Vite aliases this module only for Playwright. */
import type { ReactNode } from 'react';

const isAuthenticatedForE2E = () =>
  globalThis.window !== undefined && window.localStorage.getItem('e2e-authenticated') === 'true';

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
          imageUrl: '',
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
    setActive: async () => undefined,
  };
}

const unsupportedAuthFlow = async () => {
  throw new Error('Interactive Clerk flows are disabled in the E2E adapter.');
};

export function useSignIn() {
  return {
    isLoaded: true,
    signIn: {
      create: unsupportedAuthFlow,
      attemptFirstFactor: unsupportedAuthFlow,
      attemptSecondFactor: unsupportedAuthFlow,
      resetPassword: unsupportedAuthFlow,
      authenticateWithRedirect: unsupportedAuthFlow,
    },
  };
}

export function useSignUp() {
  return {
    isLoaded: true,
    signUp: {
      create: unsupportedAuthFlow,
      prepareEmailAddressVerification: unsupportedAuthFlow,
      attemptEmailAddressVerification: unsupportedAuthFlow,
      authenticateWithRedirect: unsupportedAuthFlow,
    },
  };
}

export function AuthenticateWithRedirectCallback() {
  return null;
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
