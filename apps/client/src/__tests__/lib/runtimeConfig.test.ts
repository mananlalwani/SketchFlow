import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  CLERK_PUBLISHABLE_KEY: '',
  API_URL: 'https://api.example.com',
}));

vi.mock('@/config/env', () => ({ clientEnv: config }));

import { loadClerkPublishableKey } from '@/lib/runtimeConfig';

describe('loadClerkPublishableKey', () => {
  beforeEach(() => {
    config.CLERK_PUBLISHABLE_KEY = '';
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses the build-time value without a network request', async () => {
    config.CLERK_PUBLISHABLE_KEY = 'pk_test_built';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(loadClerkPublishableKey()).resolves.toBe('pk_test_built');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('loads the public key from the deployed API when the image has no embedded key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ clerkPublishableKey: 'pk_live_runtime' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(loadClerkPublishableKey()).resolves.toBe('pk_live_runtime');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/api/config', {
      headers: { Accept: 'application/json' },
    });
  });

  it('fails closed when no public key is available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(loadClerkPublishableKey()).rejects.toThrow(
      'Authentication is not configured for this deployment.',
    );
  });
});
