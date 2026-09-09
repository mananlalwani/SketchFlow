import { describe, expect, it } from 'vitest';

import { drawingObjectsToRendererScene } from '@/lib/canvasRendererObject';
import { drawRendererObject, type RendererDrawingContext } from '@/lib/canvasRendererCommands';
import { drawWorkerStrokePath } from '@/lib/canvasRendererWorkerAdapter';

describe('drawingObjectsToRendererScene', () => {
  it('keeps strokes and shapes in object order without losing shape fields', () => {
    const scene = drawingObjectsToRendererScene([
      {
        id: 'stroke-1',
        type: 'stroke',
        color: '#123456',
        size: 3,
        alpha: 0.5,
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, pressure: 0.2, width: 1 },
          { x: 5, y: 6 },
        ],
      },
      {
        id: 'triangle-1',
        type: 'triangle',
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        color: '#abcdef',
        size: 2,
        rotation: 45,
        points: [{ x: 10, y: 20 }],
        orientation: 'up',
      },
    ]);

    expect(scene.strokes).toHaveLength(0);
    expect(scene.drawings).toEqual([
      expect.objectContaining({
        id: 'stroke-1',
        type: 'stroke',
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4, pressure: 0.2, width: 1 },
          { x: 5, y: 6 },
        ],
      }),
      expect.objectContaining({
        id: 'triangle-1',
        points: [{ x: 10, y: 20 }],
        orientation: 'up',
        properties: { hidden: false, rotation: 45 },
      }),
    ]);
  });

  it('uses persistent z-indexes when collaboration preserves objects by ID', () => {
    const scene = drawingObjectsToRendererScene([
      {
        id: 'visually-top',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: '#111111',
        size: 1,
        zIndex: 10,
      },
      {
        id: 'visually-bottom',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: '#222222',
        size: 1,
        zIndex: 0,
      },
    ]);

    expect(scene.drawings.map((drawing) => drawing.id)).toEqual([
      'visually-bottom',
      'visually-top',
    ]);
  });

  it('keeps fitted triangle vertices so auto-detected triangles are not redrawn as presets', () => {
    const fittedVertices = [
      { x: 12, y: 8 },
      { x: 42, y: 18 },
      { x: 20, y: 48 },
    ];
    const scene = drawingObjectsToRendererScene([
      {
        id: 'detected-triangle',
        type: 'triangle',
        x: 12,
        y: 8,
        width: 30,
        height: 40,
        color: '#123456',
        size: 2,
        points: fittedVertices,
      },
    ]);

    expect(scene.drawings[0]?.points).toEqual(fittedVertices);
  });

  it('retains single-point strokes for dot rendering', () => {
    const scene = drawingObjectsToRendererScene([
      {
        id: 'dot',
        type: 'stroke',
        color: '#123456',
        size: 6,
        points: [{ x: 12, y: 18, width: 10 }],
      },
    ]);

    expect(scene.drawings).toHaveLength(1);
    expect(scene.drawings[0]).toEqual(
      expect.objectContaining({ type: 'stroke', points: [{ x: 12, y: 18, width: 10 }] }),
    );
  });

  it('draws retained strokes with each segment width and renders dots', () => {
    const lineWidths: number[] = [];
    const operations: string[] = [];
    const context = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => operations.push('begin'),
      moveTo: () => operations.push('move'),
      lineTo: () => operations.push('line'),
      closePath: () => undefined,
      stroke: () => operations.push('stroke'),
      fill: () => operations.push('fill'),
      fillRect: () => undefined,
      strokeRect: () => undefined,
      ellipse: () => undefined,
      arc: () => operations.push('arc'),
      translate: () => undefined,
      rotate: () => undefined,
      fillText: () => undefined,
      globalAlpha: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      lineWidth: 1,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
      font: '',
      textBaseline: 'top' as const,
    } as RendererDrawingContext;
    Object.defineProperty(context, 'lineWidth', {
      get: () => lineWidths[lineWidths.length - 1] ?? 1,
      set: (value: number) => lineWidths.push(value),
    });

    drawRendererObject(context, {
      type: 'stroke',
      color: '#123456',
      size: 4,
      points: [
        { x: 0, y: 0, width: 2 },
        { x: 10, y: 0, width: 6 },
        { x: 20, y: 0, width: 3 },
      ],
    });
    expect(lineWidths).toEqual([4, 6, 3]);
    expect(operations.filter((operation) => operation === 'stroke')).toHaveLength(2);

    drawRendererObject(context, {
      type: 'stroke',
      color: '#123456',
      size: 4,
      points: [{ x: 2, y: 3, width: 8 }],
    });
    expect(operations.slice(-2)).toEqual(['arc', 'fill']);

    drawWorkerStrokePath(context, {
      color: '#123456',
      size: 5,
      alpha: 0.8,
      points: [
        { x: 0, y: 0, width: 5 },
        { x: 10, y: 0, width: 9 },
        { x: 20, y: 0, width: 2 },
      ],
    });
    expect(lineWidths.slice(-3)).toEqual([5, 9, 2]);
  });
});
