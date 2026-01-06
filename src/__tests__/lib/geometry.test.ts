import { describe, it, expect } from 'vitest';
import {
  distance,
  distanceSquared,
  midpoint,
  createVector,
  dotProduct,
  crossProduct,
  angleBetween,
  getBoundingBox,
  calculateTotalPathLength,
  isClosedPath,
  findCorners,
  smoothPath,
  distanceToLine,
  fitLine,
  type Point,
} from '@/lib/geometry';

describe('geometry', () => {
  describe('distance', () => {
    it('should calculate distance between points', () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
      expect(distance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });
  });

  describe('distanceSquared', () => {
    it('should calculate squared distance (faster for comparisons)', () => {
      expect(distanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    });
  });

  describe('midpoint', () => {
    it('should calculate midpoint between two points', () => {
      expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({ x: 5, y: 5 });
      expect(midpoint({ x: -5, y: -5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe('createVector', () => {
    it('should create vector from two points', () => {
      const v = createVector({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
      expect(v.magnitude).toBe(5);
    });

    it('should handle zero-length vector', () => {
      const v = createVector({ x: 5, y: 5 }, { x: 5, y: 5 });
      expect(v.magnitude).toBe(0);
    });
  });

  describe('dotProduct', () => {
    it('should calculate dot product', () => {
      const v1 = createVector({ x: 0, y: 0 }, { x: 1, y: 0 });
      const v2 = createVector({ x: 0, y: 0 }, { x: 0, y: 1 });
      expect(dotProduct(v1, v2)).toBe(0); // Perpendicular
    });
  });

  describe('crossProduct', () => {
    it('should calculate cross product (z-component)', () => {
      const v1 = createVector({ x: 0, y: 0 }, { x: 1, y: 0 });
      const v2 = createVector({ x: 0, y: 0 }, { x: 0, y: 1 });
      expect(crossProduct(v1, v2)).toBe(1); // Counter-clockwise
    });
  });

  describe('angleBetween', () => {
    it('should calculate angle between vectors', () => {
      const v1 = createVector({ x: 0, y: 0 }, { x: 1, y: 0 });
      const v2 = createVector({ x: 0, y: 0 }, { x: 0, y: 1 });
      expect(angleBetween(v1, v2)).toBeCloseTo(Math.PI / 2, 5);
    });

    it('should return 0 for parallel vectors', () => {
      const v1 = createVector({ x: 0, y: 0 }, { x: 1, y: 0 });
      const v2 = createVector({ x: 0, y: 0 }, { x: 2, y: 0 });
      expect(angleBetween(v1, v2)).toBeCloseTo(0, 5);
    });
  });

  describe('getBoundingBox', () => {
    it('should calculate bounding box of points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 10 },
      ];
      const bbox = getBoundingBox(points);
      
      expect(bbox.minX).toBe(0);
      expect(bbox.minY).toBe(0);
      expect(bbox.maxX).toBe(10);
      expect(bbox.maxY).toBe(10);
      expect(bbox.width).toBe(10);
      expect(bbox.height).toBe(10);
      expect(bbox.centerX).toBe(5);
      expect(bbox.centerY).toBe(5);
    });

    it('should handle empty points array', () => {
      const bbox = getBoundingBox([]);
      expect(bbox.width).toBe(0);
      expect(bbox.height).toBe(0);
    });
  });

  describe('calculateTotalPathLength', () => {
    it('should calculate total length of path', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 9 },
      ];
      // 5 (first segment) + 5 (second segment)
      expect(calculateTotalPathLength(points)).toBe(10);
    });

    it('should return 0 for single point', () => {
      expect(calculateTotalPathLength([{ x: 0, y: 0 }])).toBe(0);
    });
  });

  describe('isClosedPath', () => {
    it('should detect closed path', () => {
      const closed: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 0 },
      ];
      expect(isClosedPath(closed, 1)).toBe(true);
    });

    it('should detect open path', () => {
      const open: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ];
      expect(isClosedPath(open, 1)).toBe(false);
    });
  });

  describe('findCorners', () => {
    it('should find corners in a path with sharp angles', () => {
      // Sharp corner (90 degrees) - angle threshold should be higher to detect it
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ];
      // The function finds corners where the angle is LESS than threshold
      // A 90 degree turn means the angle between vectors is about π/2
      // So we need a threshold slightly above π/2 to detect it
      const corners = findCorners(points, Math.PI * 0.6);
      expect(corners).toHaveLength(1);
      expect(corners[0]).toEqual({ x: 10, y: 0 });
    });

    it('should not find corners in smooth curves', () => {
      // Smooth curve with no sharp corners
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 5, y: 1 },
        { x: 10, y: 3 },
        { x: 15, y: 6 },
      ];
      const corners = findCorners(points, Math.PI / 4); // 45 degree threshold
      expect(corners).toHaveLength(0);
    });
  });

  describe('smoothPath', () => {
    it('should smooth a path', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 5, y: 10 }, // Outlier
        { x: 10, y: 0 },
        { x: 15, y: 0 },
        { x: 20, y: 0 },
      ];
      const smoothed = smoothPath(points, 3);
      
      // The outlier should be smoothed
      expect(smoothed[1].y).toBeLessThan(10);
    });
  });

  describe('distanceToLine', () => {
    it('should calculate perpendicular distance to line segment', () => {
      const point = { x: 5, y: 5 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 10, y: 0 };
      
      expect(distanceToLine(point, lineStart, lineEnd)).toBe(5);
    });

    it('should handle points beyond line segment', () => {
      const point = { x: -5, y: 0 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 10, y: 0 };
      
      expect(distanceToLine(point, lineStart, lineEnd)).toBe(5);
    });
  });

  describe('fitLine', () => {
    it('should fit a line to points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ];
      const line = fitLine(points);
      
      expect(line).not.toBeNull();
      expect(line!.slope).toBeCloseTo(1, 5);
      expect(line!.intercept).toBeCloseTo(0, 5);
    });

    it('should return null for insufficient points', () => {
      expect(fitLine([{ x: 0, y: 0 }])).toBeNull();
    });
  });
});
