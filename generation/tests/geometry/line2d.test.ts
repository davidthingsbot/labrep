import { describe, it, expect } from 'vitest';
import { point2d, vec2d, distance2d } from '../../src/core';
import { 
  makeLine2D, 
  makeLine2DFromPointDir,
  evaluateLine2D,
  tangentLine2D,
  lengthLine2D,
  reverseLine2D,
} from '../../src/geometry/line2d';
import { TOLERANCE } from '../../src/core/tolerance';

describe('Line2D', () => {
  describe('construction', () => {
    it('creates line from two points', () => {
      const start = point2d(0, 0);
      const end = point2d(3, 4);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.type).toBe('line');
        expect(result.result.origin.x).toBeCloseTo(0);
        expect(result.result.origin.y).toBeCloseTo(0);
      }
    });

    it('creates line from point and direction', () => {
      const origin = point2d(1, 2);
      const direction = vec2d(1, 0);
      const result = makeLine2DFromPointDir(origin, direction);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.origin.x).toBeCloseTo(1);
        expect(result.result.origin.y).toBeCloseTo(2);
        expect(result.result.direction.x).toBeCloseTo(1);
        expect(result.result.direction.y).toBeCloseTo(0);
      }
    });

    it('normalizes direction vector', () => {
      const origin = point2d(0, 0);
      const direction = vec2d(3, 4); // length 5, should normalize to (0.6, 0.8)
      const result = makeLine2DFromPointDir(origin, direction);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.direction.x).toBeCloseTo(0.6);
        expect(result.result.direction.y).toBeCloseTo(0.8);
      }
    });

    it('fails for coincident points', () => {
      const p = point2d(1, 1);
      const result = makeLine2D(p, p);

      expect(result.success).toBe(false);
      expect(result.error).toContain('coincident');
    });

    it('fails for zero direction vector', () => {
      const origin = point2d(0, 0);
      const direction = vec2d(0, 0);
      const result = makeLine2DFromPointDir(origin, direction);

      expect(result.success).toBe(false);
      expect(result.error).toContain('zero');
    });
  });

  describe('evaluation', () => {
    it('evaluate at start returns start point', () => {
      const start = point2d(1, 2);
      const end = point2d(4, 6);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        const p = evaluateLine2D(line, 0);
        expect(p.x).toBeCloseTo(start.x);
        expect(p.y).toBeCloseTo(start.y);
      }
    });

    it('evaluate at end returns end point', () => {
      const start = point2d(1, 2);
      const end = point2d(4, 6);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        const len = lengthLine2D(line);
        const p = evaluateLine2D(line, len);
        expect(p.x).toBeCloseTo(end.x);
        expect(p.y).toBeCloseTo(end.y);
      }
    });

    it('evaluate at midpoint returns midpoint', () => {
      const start = point2d(0, 0);
      const end = point2d(4, 0);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        const len = lengthLine2D(line);
        const p = evaluateLine2D(line, len / 2);
        expect(p.x).toBeCloseTo(2);
        expect(p.y).toBeCloseTo(0);
      }
    });

    it('evaluate beyond parameter range extrapolates', () => {
      const start = point2d(0, 0);
      const end = point2d(2, 0);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        const p = evaluateLine2D(line, 4); // beyond end
        expect(p.x).toBeCloseTo(4);
        expect(p.y).toBeCloseTo(0);
      }
    });
  });

  describe('tangent', () => {
    it('tangent is constant and equals direction', () => {
      const start = point2d(0, 0);
      const end = point2d(3, 4);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        const t1 = tangentLine2D(line, 0);
        const t2 = tangentLine2D(line, 2.5);
        const t3 = tangentLine2D(line, 5);

        // All tangents should equal direction
        expect(t1.x).toBeCloseTo(line.direction.x);
        expect(t1.y).toBeCloseTo(line.direction.y);
        expect(t2.x).toBeCloseTo(line.direction.x);
        expect(t2.y).toBeCloseTo(line.direction.y);
        expect(t3.x).toBeCloseTo(line.direction.x);
        expect(t3.y).toBeCloseTo(line.direction.y);
      }
    });
  });

  describe('length', () => {
    it('length is distance between start and end', () => {
      const start = point2d(0, 0);
      const end = point2d(3, 4);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const len = lengthLine2D(result.result);
        expect(len).toBeCloseTo(5); // 3-4-5 triangle
      }
    });

    it('length of unit line is 1', () => {
      const start = point2d(0, 0);
      const end = point2d(1, 0);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const len = lengthLine2D(result.result);
        expect(len).toBeCloseTo(1);
      }
    });
  });

  describe('reverse', () => {
    it('reversed line has opposite direction', () => {
      const start = point2d(0, 0);
      const end = point2d(3, 4);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        const reversed = reverseLine2D(line);

        expect(reversed.direction.x).toBeCloseTo(-line.direction.x);
        expect(reversed.direction.y).toBeCloseTo(-line.direction.y);
      }
    });

    it('reversed line has swapped start/end', () => {
      const start = point2d(0, 0);
      const end = point2d(3, 4);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        const reversed = reverseLine2D(line);

        // Start point of reversed should be end point of original
        const reversedStart = evaluateLine2D(reversed, 0);
        expect(reversedStart.x).toBeCloseTo(end.x);
        expect(reversedStart.y).toBeCloseTo(end.y);
      }
    });
  });

  describe('properties', () => {
    it('startPoint returns evaluate(0)', () => {
      const start = point2d(1, 2);
      const end = point2d(4, 6);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        expect(line.startPoint.x).toBeCloseTo(start.x);
        expect(line.startPoint.y).toBeCloseTo(start.y);
      }
    });

    it('endPoint returns evaluate(length)', () => {
      const start = point2d(1, 2);
      const end = point2d(4, 6);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        const line = result.result;
        expect(line.endPoint.x).toBeCloseTo(end.x);
        expect(line.endPoint.y).toBeCloseTo(end.y);
      }
    });

    it('isClosed is false', () => {
      const start = point2d(0, 0);
      const end = point2d(1, 1);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.isClosed).toBe(false);
      }
    });

    it('startParam is 0', () => {
      const start = point2d(0, 0);
      const end = point2d(1, 1);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.startParam).toBe(0);
      }
    });

    it('endParam equals length', () => {
      const start = point2d(0, 0);
      const end = point2d(3, 4);
      const result = makeLine2D(start, end);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.endParam).toBeCloseTo(5);
      }
    });
  });
});
