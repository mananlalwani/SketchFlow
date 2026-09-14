import { describe, expect, it } from 'vitest';
import type { DrawingObject } from '@/store/drawingStore';
import {
  applyObjectDrag,
  extendSelectionRect,
  marqueeSelectedIds,
  planSelectClick,
  planSelectPointerDown,
} from '@/lib/canvasSelectGesture';

const rect = (
  id: string,
  x: number,
  y: number,
  extra: Partial<DrawingObject> = {},
): DrawingObject => ({
  id,
  type: 'rectangle',
  x,
  y,
  width: 20,
  height: 20,
  color: '#111',
  size: 1,
  ...extra,
});

describe('planSelectPointerDown', () => {
  const objects = [rect('a', 0, 0), rect('b', 40, 0)];

  it('starts a drag on an unlocked hit and records the grab offset', () => {
    const plan = planSelectPointerDown({
      objects,
      world: { x: 5, y: 5 },
      shiftKey: false,
      selectedObjectIds: [],
    });
    expect(plan).toMatchObject({
      kind: 'hit',
      selectedIds: ['a'],
      haptic: true,
      drag: { id: 'a', ids: ['a'], offsetX: 5, offsetY: 5 },
    });
  });

  it('does not drag a locked object after selecting it', () => {
    const plan = planSelectPointerDown({
      objects: [rect('a', 0, 0, { locked: true })],
      world: { x: 5, y: 5 },
      shiftKey: false,
      selectedObjectIds: [],
    });
    expect(plan).toEqual({
      kind: 'hit',
      selectedIds: ['a'],
      drag: null,
      haptic: true,
    });
  });

  it('shift-clicks toggle membership without starting a drag', () => {
    expect(
      planSelectPointerDown({
        objects,
        world: { x: 45, y: 5 },
        shiftKey: true,
        selectedObjectIds: ['a'],
      }),
    ).toEqual({ kind: 'shift-select', selectedIds: ['a', 'b'] });
  });

  it('starts a marquee on empty space and clears the primary selection', () => {
    expect(
      planSelectPointerDown({
        objects,
        world: { x: 200, y: 200 },
        shiftKey: false,
        selectedObjectIds: ['a'],
      }),
    ).toEqual({
      kind: 'marquee',
      clearPrimarySelection: true,
      rect: { startX: 200, startY: 200, endX: 200, endY: 200 },
    });
  });
});

describe('planSelectClick', () => {
  const objects = [rect('a', 0, 0), rect('b', 40, 0, { groupId: 'g' }), rect('c', 80, 0, { groupId: 'g' })];

  it('clears selection on empty space unless shift is held', () => {
    expect(
      planSelectClick({
        objects,
        world: { x: 200, y: 200 },
        shiftKey: false,
        selectedObjectIds: ['a'],
      }),
    ).toEqual({ kind: 'clear' });
    expect(
      planSelectClick({
        objects,
        world: { x: 200, y: 200 },
        shiftKey: true,
        selectedObjectIds: ['a'],
      }),
    ).toEqual({ kind: 'noop' });
  });

  it('selects a whole group on a non-shift click', () => {
    expect(
      planSelectClick({
        objects,
        world: { x: 45, y: 5 },
        shiftKey: false,
        selectedObjectIds: [],
      }),
    ).toEqual({ kind: 'select', selectedIds: ['b', 'c'] });
  });
});

describe('object drag and marquee', () => {
  it('translates a single object by the grab offset', () => {
    const next = applyObjectDrag(
      [rect('a', 0, 0)],
      { id: 'a', ids: ['a'], offsetX: 5, offsetY: 5 },
      { x: 15, y: 25 },
    );
    expect(next?.[0]).toMatchObject({ id: 'a', x: 10, y: 20 });
  });

  it('translates a multi-object drag by the primary object delta', () => {
    const next = applyObjectDrag(
      [rect('a', 0, 0), rect('b', 40, 0)],
      { id: 'a', ids: ['a', 'b'], offsetX: 0, offsetY: 0 },
      { x: 10, y: 0 },
    );
    expect(next?.map((object) => ({ id: object.id, x: object.x }))).toEqual([
      { id: 'a', x: 10 },
      { id: 'b', x: 50 },
    ]);
  });

  it('extends a marquee and commits grouped hits', () => {
    const objects = [
      rect('a', 0, 0),
      rect('b', 40, 0, { groupId: 'g' }),
      rect('c', 200, 0, { groupId: 'g' }),
    ];
    const rectState = extendSelectionRect(
      { startX: 35, startY: -5, endX: 35, endY: -5 },
      { x: 65, y: 25 },
    );
    expect(marqueeSelectedIds(objects, rectState)).toEqual(['b', 'c']);
  });
});
