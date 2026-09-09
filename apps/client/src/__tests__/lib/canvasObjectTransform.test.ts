import { describe, expect, it } from 'vitest';

import {
  duplicateDrawingObject,
  duplicateObjectCollection,
  expandObjectIdsWithGroups,
  canTransformObjects,
  getObjectDragOffset,
  recolorObjects,
  translateDrawingObject,
  translateObjectInCollection,
  translateObjectsBy,
} from '@/lib/canvasObjectTransform';

describe('canvas object transforms', () => {
  it('expands selected group members before a multi-object transform', () => {
    const objects = [
      { id: 'first', type: 'rectangle' as const, color: '#000', size: 1, groupId: 'group-a' },
      { id: 'second', type: 'ellipse' as const, color: '#000', size: 1, groupId: 'group-a' },
      { id: 'third', type: 'rectangle' as const, color: '#000', size: 1 },
    ];

    expect(expandObjectIdsWithGroups(objects, ['first', 'third'])).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('moves a shape while retaining its pointer offset', () => {
    const rectangle = {
      id: 'rectangle',
      type: 'rectangle' as const,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      color: '#000',
      size: 2,
    };
    const offset = getObjectDragOffset(rectangle, { x: 15, y: 28 });

    expect(translateDrawingObject(rectangle, { x: 50, y: 60 }, offset)).toMatchObject({
      x: 45,
      y: 52,
    });
  });

  it('translates every stroke point by the same delta', () => {
    const stroke = {
      id: 'stroke',
      type: 'stroke' as const,
      points: [
        { x: 10, y: 20 },
        { x: 15, y: 25 },
      ],
      color: '#000',
      size: 2,
    };

    expect(translateDrawingObject(stroke, { x: 40, y: 50 }, { x: 2, y: 3 }).points).toEqual([
      { x: 38, y: 47 },
      { x: 43, y: 52 },
    ]);
  });

  it('preserves pressure and width while moving one stroke', () => {
    const stroke = {
      id: 'pressure-stroke',
      type: 'stroke' as const,
      points: [
        { x: 10, y: 20, pressure: 0.25, width: 2 },
        { x: 15, y: 25, pressure: 0.8, width: 6 },
      ],
      color: '#000',
      size: 4,
    };

    expect(translateDrawingObject(stroke, { x: 40, y: 50 }, { x: 2, y: 3 }).points).toEqual([
      { x: 38, y: 47, pressure: 0.25, width: 2 },
      { x: 43, y: 52, pressure: 0.8, width: 6 },
    ]);
  });

  it('rejects a transform when a selected group member is locked', () => {
    const objects = [
      {
        id: 'open',
        type: 'rectangle' as const,
        groupId: 'g',
        locked: false,
        color: '#000',
        size: 1,
      },
      {
        id: 'locked',
        type: 'ellipse' as const,
        groupId: 'g',
        locked: true,
        color: '#000',
        size: 1,
      },
    ];

    expect(canTransformObjects(objects, ['open', 'locked'])).toBe(false);
    expect(canTransformObjects(objects, ['open'])).toBe(true);
  });

  it('moves custom triangle vertices and leaves other objects unchanged', () => {
    const triangle = {
      id: 'triangle',
      type: 'triangle' as const,
      x: 10,
      y: 20,
      width: 10,
      height: 10,
      points: [
        { x: 10, y: 20 },
        { x: 20, y: 20 },
        { x: 15, y: 30 },
      ],
      color: '#000',
      size: 2,
    };
    const untouched = {
      id: 'other',
      type: 'rectangle' as const,
      x: 0,
      y: 0,
      color: '#000',
      size: 1,
    };
    const transformed = translateObjectInCollection(
      [triangle, untouched],
      'triangle',
      { x: 30, y: 40 },
      { x: 5, y: 5 },
    );

    expect(transformed[0]).toMatchObject({ x: 25, y: 35 });
    expect(transformed[0].points).toEqual([
      { x: 25, y: 35 },
      { x: 35, y: 35 },
      { x: 30, y: 45 },
    ]);
    expect(transformed[1]).toBe(untouched);
  });

  it('moves a selected group while leaving an unrelated object untouched', () => {
    const selectedStroke = {
      id: 'selected-stroke',
      type: 'stroke' as const,
      points: [
        { x: 10, y: 20, pressure: 0.3, width: 3 },
        { x: 20, y: 30, pressure: 0.9, width: 8 },
      ],
      color: '#000',
      size: 4,
    };
    const selectedShape = {
      id: 'selected-shape',
      type: 'rectangle' as const,
      x: 30,
      y: 40,
      width: 10,
      height: 12,
      color: '#000',
      size: 2,
    };
    const unrelated = {
      id: 'remote-object',
      type: 'ellipse' as const,
      x: 100,
      y: 100,
      width: 20,
      height: 20,
      color: '#f00',
      size: 2,
    };

    const moved = translateObjectsBy(
      [selectedStroke, selectedShape, unrelated],
      ['selected-stroke', 'selected-shape'],
      12,
      -7,
    );

    expect(moved[0].points).toEqual([
      { x: 22, y: 13, pressure: 0.3, width: 3 },
      { x: 32, y: 23, pressure: 0.9, width: 8 },
    ]);
    expect(moved[1]).toMatchObject({ x: 42, y: 33 });
    expect(moved[2]).toBe(unrelated);
  });

  it('duplicates a pressure-aware stroke without changing its widths', () => {
    const stroke = {
      id: 'stroke',
      type: 'stroke' as const,
      points: [
        { x: 10, y: 20, pressure: 0.2, width: 3 },
        { x: 15, y: 25, pressure: 0.8, width: 7 },
      ],
      color: '#000',
      size: 4,
    };

    expect(duplicateDrawingObject(stroke, 'copy')).toEqual({
      ...stroke,
      id: 'copy',
      points: [
        { x: 34, y: 44, pressure: 0.2, width: 3 },
        { x: 39, y: 49, pressure: 0.8, width: 7 },
      ],
    });
  });

  it('duplicates a selected group as a separate group and recolors only selected objects', () => {
    const objects = [
      {
        id: 'first',
        type: 'stroke' as const,
        points: [{ x: 0, y: 0 }],
        color: '#000',
        size: 2,
        groupId: 'original-group',
      },
      {
        id: 'second',
        type: 'rectangle' as const,
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        color: '#000',
        size: 2,
        groupId: 'original-group',
      },
      {
        id: 'other',
        type: 'ellipse' as const,
        x: 50,
        y: 50,
        width: 20,
        height: 20,
        color: '#000',
        size: 2,
      },
    ];
    let nextId = 0;
    const copies = duplicateObjectCollection(objects, ['first', 'second'], () => `id-${nextId++}`);

    expect(copies).toHaveLength(2);
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe('original-group');
    expect(recolorObjects([...objects, ...copies], ['first', copies[1].id], '#2563eb')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first', color: '#2563eb' }),
        expect.objectContaining({ id: copies[1].id, color: '#2563eb' }),
        expect.objectContaining({ id: 'other', color: '#000' }),
      ]),
    );
  });
});
