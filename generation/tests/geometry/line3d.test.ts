import { describe, it, expect } from 'vitest';
import { point3d, distance, TOLERANCE } from '../../src/core';

// These will be implemented
import {
  makeLine3D,
  makeLine3DFromPointDir,
  evaluateLine3D,
  tangentLine3D,
  lengthLine3D,
  reverseLine3D,
} from '../../src/geometry/line3d';

describe('Line3D', () => {
  describe('makeLine3D', () => {
    it('creates a line from two points', () => {
      const start = point3d(0, 0, 0);
      const end = point3d(3, 4, 0);
      const result = makeLine3D(start, end);

      expect(result.success).toBe(true);
      const line = result.result!;
      expect(line.type).toBe('line3d');
      expect(line.origin).toEqual(start);
      expect(line.startPoint).toEqual(start);
      expect(line.endPoint).toEqual(end);
    });

    it('computes correct segment length', () => {
      const start = point3d(0, 0, 0);
      const end = point3d(3, 4, 0);
      const result = makeLine3D(start, end);

      expect(result.success).toBe(true);
      expect(result.result!.segmentLength).toBeCloseTo(5, 10);
    });

    it('computes unit direction', () => {
      const start = point3d(0, 0, 0);
      const end = point3d(3, 4, 0);
      const result = makeLine3D(start, end);

      expect(result.success).toBe(true);
      const dir = result.result!.direction;
      expect(dir.x).toBeCloseTo(0.6, 10);
      expect(dir.y).toBeCloseTo(0.8, 10);
      expect(dir.z).toBeCloseTo(0, 10);
    });

    it('fails for coincident points', () => {
      const p = point3d(1, 2, 3);
      const result = makeLine3D(p, p);

      expect(result.success).toBe(false);
      expect(result.error).toContain('coincident');
    });

    it('fails for nearly coincident points', () => {
      const p1 = point3d(1, 2, 3);
      const p2 = point3d(1 + TOLERANCE * 0.1, 2, 3);
      const result = makeLine3D(p1, p2);

      expect(result.success).toBe(false);
    });

    it('sets isClosed to false', () => {
      const result = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0));
      expect(result.result!.isClosed).toBe(false);
    });

    it('sets parameter range from 0 to length', () => {
      const result = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0));
      expect(result.result!.startParam).toBe(0);
      expect(result.result!.endParam).toBeCloseTo(5, 10);
    });
  });

  describe('makeLine3DFromPointDir', () => {
    it('creates a line from origin, direction, and length', () => {
      const origin = point3d(1, 2, 3);
      const direction = { x: 1, y: 0, z: 0 };
      const result = makeLine3DFromPointDir(origin, direction, 5);

      expect(result.success).toBe(true);
      const line = result.result!;
      expect(line.origin).toEqual(origin);
      expect(line.segmentLength).toBeCloseTo(5, 10);
      expect(line.endPoint.x).toBeCloseTo(6, 10);
      expect(line.endPoint.y).toBeCloseTo(2, 10);
      expect(line.endPoint.z).toBeCloseTo(3, 10);
    });

    it('normalizes the direction vector', () => {
      const origin = point3d(0, 0, 0);
      const direction = { x: 3, y: 4, z: 0 }; // not unit
      const result = makeLine3DFromPointDir(origin, direction, 10);

      expect(result.success).toBe(true);
      const dir = result.result!.direction;
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      expect(len).toBeCloseTo(1, 10);
    });

    it('fails for zero direction vector', () => {
      const result = makeLine3DFromPointDir(point3d(0, 0, 0), { x: 0, y: 0, z: 0 }, 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('zero');
    });

    it('fails for non-positive length', () => {
      const result = makeLine3DFromPointDir(point3d(0, 0, 0), { x: 1, y: 0, z: 0 }, 0);
      expect(result.success).toBe(false);

      const result2 = makeLine3DFromPointDir(point3d(0, 0, 0), { x: 1, y: 0, z: 0 }, -5);
      expect(result2.success).toBe(false);
    });
  });

  describe('evaluateLine3D', () => {
    it('returns start point at t=0', () => {
      const start = point3d(1, 2, 3);
      const end = point3d(4, 6, 3);
      const line = makeLine3D(start, end).result!;

      const pt = evaluateLine3D(line, 0);
      expect(pt.x).toBeCloseTo(1, 10);
      expect(pt.y).toBeCloseTo(2, 10);
      expect(pt.z).toBeCloseTo(3, 10);
    });

    it('returns end point at t=length', () => {
      const start = point3d(1, 2, 3);
      const end = point3d(4, 6, 3);
      const line = makeLine3D(start, end).result!;

      const pt = evaluateLine3D(line, line.segmentLength);
      expect(pt.x).toBeCloseTo(4, 10);
      expect(pt.y).toBeCloseTo(6, 10);
      expect(pt.z).toBeCloseTo(3, 10);
    });

    it('returns midpoint at t=length/2', () => {
      const start = point3d(0, 0, 0);
      const end = point3d(10, 0, 0);
      const line = makeLine3D(start, end).result!;

      const pt = evaluateLine3D(line, line.segmentLength / 2);
      expect(pt.x).toBeCloseTo(5, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('extrapolates beyond segment bounds', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;

      const pt = evaluateLine3D(line, 2);
      expect(pt.x).toBeCloseTo(2, 10);
    });
  });

  describe('tangentLine3D', () => {
    it('returns direction vector at any parameter', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0)).result!;

      const t0 = tangentLine3D(line, 0);
      const tMid = tangentLine3D(line, 2.5);
      const tEnd = tangentLine3D(line, 5);

      // All should be the same (constant tangent)
      expect(t0.x).toBeCloseTo(0.6, 10);
      expect(t0.y).toBeCloseTo(0.8, 10);
      expect(t0.z).toBeCloseTo(0, 10);

      expect(tMid).toEqual(t0);
      expect(tEnd).toEqual(t0);
    });
  });

  describe('lengthLine3D', () => {
    it('returns segment length', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0)).result!;
      expect(lengthLine3D(line)).toBeCloseTo(5, 10);
    });

    it('handles 3D diagonal', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 1, 1)).result!;
      expect(lengthLine3D(line)).toBeCloseTo(Math.sqrt(3), 10);
    });
  });

  describe('reverseLine3D', () => {
    it('swaps start and end points', () => {
      const start = point3d(0, 0, 0);
      const end = point3d(3, 4, 0);
      const line = makeLine3D(start, end).result!;
      const reversed = reverseLine3D(line);

      expect(reversed.startPoint).toEqual(end);
      expect(reversed.endPoint).toEqual(start);
    });

    it('negates direction', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0)).result!;
      const reversed = reverseLine3D(line);

      expect(reversed.direction.x).toBeCloseTo(-0.6, 10);
      expect(reversed.direction.y).toBeCloseTo(-0.8, 10);
      expect(reversed.direction.z).toBeCloseTo(0, 10);
    });

    it('preserves length', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0)).result!;
      const reversed = reverseLine3D(line);

      expect(lengthLine3D(reversed)).toBeCloseTo(lengthLine3D(line), 10);
    });
  });
});
