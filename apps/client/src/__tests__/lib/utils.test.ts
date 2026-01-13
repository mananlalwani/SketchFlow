import { describe, it, expect } from 'vitest';
import {
  cn,
  generateId,
} from '@/lib/utils';

describe('utils', () => {
  describe('cn (classnames)', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      const show = true;
      const hide = false;
      expect(cn('base', hide && 'hidden', show && 'visible')).toBe('base visible');
    });

    it('should merge tailwind classes correctly', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });
  });

  describe('generateId', () => {
    it('should generate unique ids', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should return a string', () => {
      expect(typeof generateId()).toBe('string');
    });

    it('should generate non-empty ids', () => {
      expect(generateId().length).toBeGreaterThan(0);
    });
  });

  // Note: throttle, debounce, clamp, distance, hexToRgb, rgbToHex tests
  // were removed because these functions are not exported from utils.ts
});
