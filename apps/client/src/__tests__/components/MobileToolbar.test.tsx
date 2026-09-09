import { describe, expect, it } from 'vitest';
import { tabletFullToolIds } from '@/components/mobileToolbarTools';

describe('tablet toolbar tool access', () => {
  it('keeps every drawing tool reachable from the tablet overflow', () => {
    expect(tabletFullToolIds).toEqual([
      'hand',
      'select',
      'move',
      'pen',
      'highlighter',
      'eraser',
      'line',
      'rectangle',
      'ellipse',
      'triangle',
      'star',
      'text',
      'image',
    ]);
  });
});
