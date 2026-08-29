import { clientEnv } from '@/config/env';

interface PublicRuntimeConfig {
  clerkPublishableKey?: string;
}

/** Resolves public browser configuration from the build or the deployed API. */
export async function loadClerkPublishableKey(): Promise<string> {
  if (clientEnv.CLERK_PUBLISHABLE_KEY) return clientEnv.CLERK_PUBLISHABLE_KEY;

  const response = await fetch(`${clientEnv.API_URL}/api/config`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Could not load authentication configuration.');

  const config: PublicRuntimeConfig = await response.json();
  if (!config.clerkPublishableKey) {
    throw new Error('Authentication is not configured for this deployment.');
  }
  return config.clerkPublishableKey;
}
