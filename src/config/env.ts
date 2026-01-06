/**
 * Client-side environment configuration
 * Validates Vite's import.meta.env variables at runtime
 */

interface ClientEnv {
  CLERK_PUBLISHABLE_KEY: string;
  API_URL: string;
  WS_URL: string;
  IS_PRODUCTION: boolean;
}

function getClientEnv(): ClientEnv {
  // In Vite, environment variables are exposed via import.meta.env
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  
  if (!clerkKey) {
    console.error('❌ VITE_CLERK_PUBLISHABLE_KEY is required');
    // Don't crash in browser - show error in console
  }

  // API URL defaults to current origin (for same-origin deployment)
  const apiUrl = import.meta.env.VITE_API_URL || '';
  
  // WebSocket URL defaults to API URL (or empty for same origin)
  const wsUrl = import.meta.env.VITE_WS_URL || apiUrl;

  return {
    CLERK_PUBLISHABLE_KEY: clerkKey || '',
    API_URL: apiUrl,
    WS_URL: wsUrl,
    IS_PRODUCTION: import.meta.env.PROD,
  };
}

export const clientEnv = getClientEnv();
