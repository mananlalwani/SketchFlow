import { describe, expect, it } from 'vitest';
import {
  calculateTriangleVertices,
  clampZoom,
  constrainView,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  panViewportBy,
  zoomViewportAtPoint,
} from '@/lib/canvasViewport';

describe('canvas viewport helpers', () => {
  it('keeps zoom within the supported interaction range', () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(10)).toBe(5);
  });

  it('keeps a viewport within the world bounds', () => {
    expect(constrainView(-20, 999999, 1, 100, 100)).toEqual({ x: 0, y: WORLD_HEIGHT - 100 });
    expect(constrainView(999999, 999999, 1, 100, 100)).toEqual({
      x: WORLD_WIDTH - 100,
      y: WORLD_HEIGHT - 100,
    });
  });

  it('keeps the focal world coordinate stable while zooming', () => {
    const result = zoomViewportAtPoint({
      zoom: 1,
      viewX: 100,
      viewY: 200,
      nextZoom: 2,
      focalX: 300,
      focalY: 150,
      canvasWidth: 1000,
      canvasHeight: 600,
    });

    expect(result).toEqual({ zoom: 2, x: 250, y: 275 });
    expect(result.x + 300 / result.zoom).toBe(400);
    expect(result.y + 150 / result.zoom).toBe(350);
  });

  it('constrains focal zoom at the world edge', () => {
    expect(
      zoomViewportAtPoint({
        zoom: 1,
        viewX: 0,
        viewY: 0,
        nextZoom: 0.01,
        focalX: 0,
        focalY: 0,
        canvasWidth: 1000,
        canvasHeight: 600,
      }),
    ).toEqual({ zoom: 0.1, x: 0, y: 0 });
  });

  it('converts screen-space pan deltas and constrains the resulting view', () => {
    expect(
      panViewportBy({
        zoom: 2,
        viewX: 100,
        viewY: 200,
        deltaX: 40,
        deltaY: -20,
        canvasWidth: 1000,
        canvasHeight: 600,
      }),
    ).toEqual({ x: 120, y: 190 });
    expect(
      panViewportBy({
        zoom: 1,
        viewX: 0,
        viewY: 0,
        deltaX: -20,
        deltaY: -20,
        canvasWidth: 1000,
        canvasHeight: 600,
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('creates constrained triangle vertices deterministically', () => {
    expect(calculateTriangleVertices(0, 0, 30, 10, '45-45-90')).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ]);
    expect(calculateTriangleVertices(0, 0, 30, 10, 'right')).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 0, y: 10 },
    ]);
  });
});
