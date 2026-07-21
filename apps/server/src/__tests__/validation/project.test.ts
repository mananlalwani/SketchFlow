import { describe, expect, it } from 'vitest';
import {
  collaboratorInputSchema,
  collaboratorUserIdSchema,
  folderInputSchema,
  moveProjectSchema,
  projectInputSchema,
  resourceIdSchema,
  shareTokenSchema,
} from '../../validation/project.js';

describe('project request validation', () => {
  it('accepts a bounded project save with a positive expected revision', () => {
    expect(
      projectInputSchema.safeParse({
        title: '  Architecture  ',
        data: { objects: [] },
        expectedRevision: 2,
      }).data,
    ).toEqual({ title: 'Architecture', data: { objects: [] }, expectedRevision: 2 });
  });

  it.each([
    { title: '', data: {} },
    { title: 'x'.repeat(201), data: {} },
    { title: 'Valid', data: {}, expectedRevision: 0 },
    { title: 'Valid', data: {}, unexpected: true },
  ])('rejects malformed project payloads', (payload) => {
    expect(projectInputSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects project boards with more than 10,000 objects', () => {
    expect(
      projectInputSchema.safeParse({
        title: 'Large board',
        data: { objects: Array.from({ length: 10_001 }, () => ({})) },
      }).success,
    ).toBe(false);
  });

  it('rejects deeply nested, oversized text, and oversized image payloads', () => {
    const nested: { value?: unknown } = {};
    let cursor = nested;
    for (let depth = 0; depth < 21; depth++) cursor = cursor.value = {} as { value?: unknown };
    expect(projectInputSchema.safeParse({ title: 'Deep', data: nested }).success).toBe(false);
    expect(
      projectInputSchema.safeParse({ title: 'Text', data: { text: 'x'.repeat(100_001) } }).success,
    ).toBe(false);
    expect(
      projectInputSchema.safeParse({
        title: 'Image',
        data: { imageData: 'x'.repeat(7 * 1024 * 1024 + 1) },
      }).success,
    ).toBe(false);
  });

  it('normalizes a collaborator role and rejects unknown roles', () => {
    expect(collaboratorInputSchema.parse({ email: ' person@example.com ' })).toEqual({
      email: 'person@example.com',
      role: 'editor',
    });
    expect(
      collaboratorInputSchema.safeParse({ email: 'person@example.com', role: 'owner' }).success,
    ).toBe(false);
  });

  it('only accepts safe folder and move payloads', () => {
    expect(folderInputSchema.safeParse({ name: 'Ideas', color: '#12abEF' }).success).toBe(true);
    expect(folderInputSchema.safeParse({ name: 'Ideas', color: 'red' }).success).toBe(false);
    expect(moveProjectSchema.safeParse({ folderId: null }).success).toBe(true);
    expect(moveProjectSchema.safeParse({ folderId: 'not-a-cuid' }).success).toBe(false);
  });

  it('validates resource identifiers and opaque share tokens', () => {
    expect(resourceIdSchema.safeParse('ckz1h2abc0000qwerty123456').success).toBe(true);
    expect(resourceIdSchema.safeParse('../project').success).toBe(false);
    expect(shareTokenSchema.safeParse('a'.repeat(43)).success).toBe(true);
    expect(shareTokenSchema.safeParse('short-token').success).toBe(false);
    expect(collaboratorUserIdSchema.safeParse('user_2abcDEF').success).toBe(true);
    expect(collaboratorUserIdSchema.safeParse('../user').success).toBe(false);
  });
});
