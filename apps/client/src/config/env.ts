/**
 * Client-side environment configuration
 * Validates Vite's import.meta.env variables at runtime
 */

interface ClientEnv {
  CLERK_PUBLISHABLE_KEY: string;
  API_URL: string;
  WS_URL: string;
  IS_PRODUCTION: boolean;
  RELEASE_ID: string;
  SENTRY_DSN: string;
  SENTRY_ENVIRONMENT: string;
  SERVER_PORT: string;
  SOCKET_URL: string;
}

function getClientEnv(): ClientEnv {
  // In Vite, environment variables are exposed via import.meta.env
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  // API URL defaults to current origin (for same-origin deployment)
  const apiUrl = import.meta.env.VITE_API_URL || '';

  // WebSocket URL defaults to API URL (or empty for same origin)
  const wsUrl = import.meta.env.VITE_WS_URL || apiUrl;

  return {
    CLERK_PUBLISHABLE_KEY: clerkKey || '',
    API_URL: apiUrl,
    WS_URL: wsUrl,
    IS_PRODUCTION: import.meta.env.PROD,
    RELEASE_ID: import.meta.env.VITE_RELEASE_ID || import.meta.env.MODE || 'development',
    SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN || '',
    SENTRY_ENVIRONMENT:
      import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development',
    SERVER_PORT: import.meta.env.VITE_SERVER_PORT || '3000',
    SOCKET_URL: import.meta.env.VITE_SOCKET_BASE_URL || '',
  };
}

export const clientEnv = getClientEnv();
