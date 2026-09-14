import { describe, expect, it } from 'vitest';
import { isActivePublicShare } from '../../lib/projectShare.js';

describe('isActivePublicShare', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  it('accepts an unexpired, non-revoked share', () => {
    expect(
      isActivePublicShare(
        {
          shared: true,
          shareRevokedAt: null,
          shareExpiresAt: new Date('2026-09-15T12:00:00Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('rejects revoked, expired, or unshared projects', () => {
    expect(
      isActivePublicShare({ shared: false, shareRevokedAt: null, shareExpiresAt: null }, now),
    ).toBe(false);
    expect(
      isActivePublicShare(
        {
          shared: true,
          shareRevokedAt: now,
          shareExpiresAt: new Date('2026-09-15T12:00:00Z'),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isActivePublicShare(
        {
          shared: true,
          shareRevokedAt: null,
          shareExpiresAt: now,
        },
        now,
      ),
    ).toBe(false);
  });
});
