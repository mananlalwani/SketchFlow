import type { DrawingObject } from '@/store/drawingStore';

export const LARGE_BOARD_FIXTURE_VERSION = 1;
export const LARGE_BOARD_SIDE = 100;
export const LARGE_BOARD_OBJECT_COUNT = LARGE_BOARD_SIDE * LARGE_BOARD_SIDE;
export const LARGE_BOARD_SPACING = 320;

export function createLargeBoardObjects(): DrawingObject[] {
  return Array.from({ length: LARGE_BOARD_OBJECT_COUNT }, (_, index) => ({
    id: `benchmark-${index}`,
    type: 'rectangle' as const,
    x: (index % LARGE_BOARD_SIDE) * LARGE_BOARD_SPACING,
    y: Math.floor(index / LARGE_BOARD_SIDE) * LARGE_BOARD_SPACING,
    width: 120,
    height: 80,
    color: '#2563eb',
    size: 2,
    alpha: 1,
  }));
}

/** A stable, inexpensive drift detector for E2E artifacts and fixture tests. */
export const LARGE_BOARD_FIXTURE_CHECKSUM = 'rect-grid-v1-100x100-spacing-320';
