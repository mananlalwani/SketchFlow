import { describe, expect, it } from 'vitest';
import { accessAllows, membershipRole } from '../../lib/projectAccess.js';

describe('accessAllows', () => {
  it.each([
    ['owner', 'view', true],
    ['owner', 'edit', true],
    ['owner', 'share', true],
    ['editor', 'view', true],
    ['editor', 'edit', true],
    ['editor', 'share', false],
    ['viewer', 'view', true],
    ['viewer', 'edit', false],
    ['viewer', 'delete', false],
    ['anonymous', 'view', false],
    ['anonymous', 'edit', false],
  ] as const)('%s %s is %s', (actor, action, expected) => {
    expect(
      accessAllows(action, {
        isOwner: actor === 'owner',
        collaboratorRole: actor === 'editor' || actor === 'viewer' ? actor : null,
      }),
    ).toBe(expected);
  });
});

describe('membershipRole', () => {
  it('prefers owner over a collaborator row', () => {
    expect(membershipRole('owner', 'owner', 'editor')).toBe('owner');
  });

  it('maps collaborator roles', () => {
    expect(membershipRole('owner', 'editor', 'editor')).toBe('editor');
    expect(membershipRole('owner', 'viewer', 'viewer')).toBe('viewer');
  });
});
