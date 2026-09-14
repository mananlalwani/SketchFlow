import { describe, it, expect } from 'vitest';
import { generateId } from '@/lib/utils';

describe('generateId', () => {
  it('generates unique ids', () => {
    expect(generateId()).not.toBe(generateId());
  });

  it('generates a non-empty id', () => {
    expect(generateId().length).toBeGreaterThan(0);
  });
});
