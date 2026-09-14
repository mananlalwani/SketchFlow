import { describe, expect, it } from 'vitest';
import { selectionOverlayModel } from '@/lib/canvasSelectionOverlay';
import type { DrawingObject } from '@/store/drawingStore';

const box = (id: string, x: number): DrawingObject => ({
  id,
  type: 'rectangle',
  x,
  y: 0,
  width: 10,
  height: 10,
  color: '#000',
  size: 1,
});

describe('selectionOverlayModel', () => {
  it('unions drag previews for a multi-selection', () => {
    const a = box('a', 0);
    const b = box('b', 20);
    const overlay = selectionOverlayModel({
      selectedObject: a,
      selectedObjects: [a, b],
      selectedObjectIds: ['a', 'b'],
      dragPreviewObject: { ...a, x: 5 },
      dragPreviewObjects: [
        { ...a, x: 5 },
        { ...b, x: 25 },
      ],
      projectRole: 'editor',
    });
    expect(overlay.multiSelectionBounds).toEqual({ x: 5, y: 0, width: 30, height: 10 });
    expect(overlay.selectedBounds).toEqual({ x: 5, y: 0, width: 10, height: 10 });
    expect(overlay.canDirectTransform).toBe(false);
  });
});
