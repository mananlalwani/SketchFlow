import { describe, expect, it } from 'vitest';
import type { DrawingObject } from '@/store/drawingStore';
import {
  isLiveInkTool,
  planDraggedFigureCommit,
  planDrawToolPointerDown,
  previewForFigureDrag,
  shouldPlaceInkTap,
} from '@/lib/canvasDrawGesture';

const box = (id: string, extra: Partial<DrawingObject> = {}): DrawingObject => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  color: '#111',
  size: 1,
  ...extra,
});

const style = { color: '#abc', size: 3, alpha: 0.8 };

describe('planDrawToolPointerDown', () => {
  it('erases an unlocked object and ignores locked ones', () => {
    expect(
      planDrawToolPointerDown({
        currentTool: 'eraser',
        eraserMode: 'object',
        triangleMode: 'right',
        triangleVertices: [],
        objects: [box('a')],
        world: { x: 5, y: 5 },
      }),
    ).toMatchObject({ kind: 'object-erase', removed: { id: 'a' }, remaining: [] });

    expect(
      planDrawToolPointerDown({
        currentTool: 'eraser',
        eraserMode: 'object',
        triangleMode: 'right',
        triangleVertices: [],
        objects: [box('a', { locked: true })],
        world: { x: 5, y: 5 },
      }),
    ).toEqual({ kind: 'none' });
  });

  it('starts ink, shapes, and text from the matching tools', () => {
    const base = {
      eraserMode: 'partial',
      triangleMode: 'right',
      triangleVertices: [],
      objects: [],
      world: { x: 1, y: 2 },
    };
    expect(planDrawToolPointerDown({ ...base, currentTool: 'pen' })).toEqual({ kind: 'start-ink' });
    expect(planDrawToolPointerDown({ ...base, currentTool: 'rectangle' })).toEqual({
      kind: 'start-shape',
    });
    expect(planDrawToolPointerDown({ ...base, currentTool: 'text' })).toEqual({ kind: 'open-text' });
  });

  it('places custom triangle vertices until the third click commits', () => {
    const base = {
      currentTool: 'triangle' as const,
      eraserMode: 'partial',
      triangleMode: 'custom',
      objects: [],
    };
    expect(
      planDrawToolPointerDown({
        ...base,
        triangleVertices: [],
        world: { x: 1, y: 1 },
      }),
    ).toEqual({ kind: 'place-triangle-vertex', vertices: [{ x: 1, y: 1 }] });
    expect(
      planDrawToolPointerDown({
        ...base,
        triangleVertices: [
          { x: 1, y: 1 },
          { x: 4, y: 1 },
        ],
        world: { x: 4, y: 4 },
      }),
    ).toEqual({
      kind: 'commit-triangle',
      vertices: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 4 },
      ],
    });
  });
});

describe('shape preview and commit', () => {
  it('squares a constrained rectangle preview', () => {
    expect(
      previewForFigureDrag({
        currentTool: 'rectangle',
        triangleMode: 'right',
        start: { x: 10, y: 10 },
        end: { x: 40, y: 20 },
        constrained: true,
        style,
      }),
    ).toMatchObject({ type: 'rectangle', startX: 10, startY: 10, endX: 20, endY: 20 });
  });

  it('does not constrain a dragged right triangle', () => {
    expect(
      previewForFigureDrag({
        currentTool: 'triangle',
        triangleMode: 'right',
        start: { x: 0, y: 0 },
        end: { x: 30, y: 10 },
        constrained: true,
        style,
      }),
    ).toMatchObject({ type: 'triangle', endX: 30, endY: 10 });
  });

  it('refuses a custom-triangle drag commit and builds a rectangle', () => {
    expect(
      planDraggedFigureCommit({
        currentTool: 'triangle',
        triangleMode: 'custom',
        start: { x: 0, y: 0 },
        preview: { endX: 10, endY: 10 },
        style,
        filled: false,
        generateId: () => 't',
        starPoints: 5,
      }),
    ).toBeNull();
    expect(
      planDraggedFigureCommit({
        currentTool: 'rectangle',
        triangleMode: 'right',
        start: { x: 10, y: 20 },
        preview: { endX: 4, endY: 8 },
        style,
        filled: true,
        generateId: () => 'r',
        starPoints: 5,
      }),
    ).toMatchObject({ id: 'r', type: 'rectangle', width: 6, height: 12, filled: true });
  });
});

describe('ink helpers', () => {
  it('treats partial eraser as live ink and object eraser as not', () => {
    expect(isLiveInkTool('eraser', 'partial')).toBe(true);
    expect(isLiveInkTool('eraser', 'object')).toBe(false);
  });

  it('places a tap only for unmoved pen or highlighter', () => {
    expect(shouldPlaceInkTap({ currentTool: 'pen', canDraw: true, pointerMoved: false })).toBe(true);
    expect(shouldPlaceInkTap({ currentTool: 'pen', canDraw: true, pointerMoved: true })).toBe(false);
    expect(shouldPlaceInkTap({ currentTool: 'select', canDraw: true, pointerMoved: false })).toBe(
      false,
    );
  });
});
