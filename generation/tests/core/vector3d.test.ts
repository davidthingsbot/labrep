import { describe, it, expect } from 'vitest';
import {
  vec3d,
  length,
  normalize,
  add,
  subtract,
  scale,
  dot,
  cross,
  negate,
  angle,
  isParallel,
  isNormal,
  X_AXIS,
  Y_AXIS,
  Z_AXIS,
} from '../../src/core/vector3d';

describe('Vector3D', () => {
  it('creates a vector with x, y, z', () => {
    const v = vec3d(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it('computes length (magnitude)', () => {
    const v = vec3d(2, 3, 6);
    expect(length(v)).toBeCloseTo(7, 10);
  });

  it('length of (1,0,0) is 1', () => {
    expect(length(vec3d(1, 0, 0))).toBeCloseTo(1, 10);
  });

  it('length of (3,4,0) is 5', () => {
    expect(length(vec3d(3, 4, 0))).toBeCloseTo(5, 10);
  });

  it('normalizes a vector', () => {
    const v = normalize(vec3d(0, 0, 5));
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(1, 10);
    expect(length(v)).toBeCloseTo(1, 10);
  });

  it('normalize of zero vector returns zero vector', () => {
    const v = normalize(vec3d(0, 0, 0));
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('adds two vectors', () => {
    const a = vec3d(1, 2, 3);
    const b = vec3d(4, 5, 6);
    const result = add(a, b);
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(7, 10);
    expect(result.z).toBeCloseTo(9, 10);
  });

  it('subtracts two vectors', () => {
    const a = vec3d(5, 7, 9);
    const b = vec3d(1, 2, 3);
    const result = subtract(a, b);
    expect(result.x).toBeCloseTo(4, 10);
    expect(result.y).toBeCloseTo(5, 10);
    expect(result.z).toBeCloseTo(6, 10);
  });

  it('scales a vector', () => {
    const v = vec3d(1, 2, 3);
    const result = scale(v, 3);
    expect(result.x).toBeCloseTo(3, 10);
    expect(result.y).toBeCloseTo(6, 10);
    expect(result.z).toBeCloseTo(9, 10);
  });

  it('computes dot product', () => {
    const a = vec3d(1, 2, 3);
    const b = vec3d(4, 5, 6);
    expect(dot(a, b)).toBeCloseTo(32, 10);
  });

  it('dot product of orthogonal vectors is 0', () => {
    expect(dot(X_AXIS, Y_AXIS)).toBeCloseTo(0, 10);
    expect(dot(Y_AXIS, Z_AXIS)).toBeCloseTo(0, 10);
    expect(dot(X_AXIS, Z_AXIS)).toBeCloseTo(0, 10);
  });

  it('computes cross product', () => {
    const a = vec3d(1, 0, 0);
    const b = vec3d(0, 1, 0);
    const result = cross(a, b);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.z).toBeCloseTo(1, 10);
  });

  it('cross product of X and Y is Z', () => {
    const result = cross(X_AXIS, Y_AXIS);
    expect(result.x).toBeCloseTo(Z_AXIS.x, 10);
    expect(result.y).toBeCloseTo(Z_AXIS.y, 10);
    expect(result.z).toBeCloseTo(Z_AXIS.z, 10);
  });

  it('cross product of parallel vectors is zero vector', () => {
    const a = vec3d(2, 0, 0);
    const b = vec3d(5, 0, 0);
    const result = cross(a, b);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.z).toBeCloseTo(0, 10);
  });

  it('negates a vector', () => {
    const v = vec3d(1, -2, 3);
    const result = negate(v);
    expect(result.x).toBeCloseTo(-1, 10);
    expect(result.y).toBeCloseTo(2, 10);
    expect(result.z).toBeCloseTo(-3, 10);
  });

  it('X_AXIS, Y_AXIS, Z_AXIS constants', () => {
    expect(X_AXIS).toEqual({ x: 1, y: 0, z: 0 });
    expect(Y_AXIS).toEqual({ x: 0, y: 1, z: 0 });
    expect(Z_AXIS).toEqual({ x: 0, y: 0, z: 1 });
  });

  // Edge cases
  it('handles very large vectors', () => {
    const v = vec3d(1e10, 1e10, 1e10);
    expect(length(v)).toBeCloseTo(Math.sqrt(3) * 1e10, 0);
  });

  it('handles very small vectors', () => {
    const v = vec3d(1e-10, 1e-10, 1e-10);
    expect(length(v)).toBeCloseTo(Math.sqrt(3) * 1e-10, 20);
  });

  it('dot product of perpendicular vectors is zero', () => {
    expect(dot(X_AXIS, Y_AXIS)).toBe(0);
    expect(dot(Y_AXIS, Z_AXIS)).toBe(0);
    expect(dot(Z_AXIS, X_AXIS)).toBe(0);
  });

  it('cross product produces perpendicular vector', () => {
    const a = vec3d(1, 2, 3);
    const b = vec3d(4, 5, 6);
    const c = cross(a, b);
    expect(dot(a, c)).toBeCloseTo(0, 10);
    expect(dot(b, c)).toBeCloseTo(0, 10);
  });

  it('normalize handles near-zero length gracefully', () => {
    const tiny = vec3d(1e-15, 0, 0);
    const n = normalize(tiny);
    // Should not produce NaN or Infinity
    expect(Number.isFinite(n.x)).toBe(true);
  });

  it('scale by zero produces zero vector', () => {
    const v = vec3d(1, 2, 3);
    const result = scale(v, 0);
    expect(result).toEqual(vec3d(0, 0, 0));
  });

  it('scale by negative inverts direction', () => {
    const v = vec3d(1, 2, 3);
    const result = scale(v, -1);
    expect(result).toEqual(vec3d(-1, -2, -3));
  });

  describe('angle', () => {
    it('returns 0 for parallel vectors (same direction)', () => {
      const a = angle(vec3d(1, 0, 0), vec3d(2, 0, 0));
      expect(a).toBeCloseTo(0, 10);
    });

    it('returns π for opposite vectors', () => {
      const a = angle(vec3d(1, 0, 0), vec3d(-1, 0, 0));
      expect(a).toBeCloseTo(Math.PI, 10);
    });

    it('returns π/2 for perpendicular vectors', () => {
      const a = angle(X_AXIS, Y_AXIS);
      expect(a).toBeCloseTo(Math.PI / 2, 10);
    });

    it('works for non-unit vectors', () => {
      const a = angle(vec3d(3, 0, 0), vec3d(0, 5, 0));
      expect(a).toBeCloseTo(Math.PI / 2, 10);
    });

    it('works for diagonal vectors', () => {
      // 45 degree angle
      const a = angle(vec3d(1, 0, 0), vec3d(1, 1, 0));
      expect(a).toBeCloseTo(Math.PI / 4, 10);
    });

    it('returns 0 for zero vectors', () => {
      // Edge case: zero vector should return 0 or be handled gracefully
      const a = angle(vec3d(0, 0, 0), vec3d(1, 0, 0));
      expect(Number.isFinite(a)).toBe(true);
    });
  });

  describe('isParallel', () => {
    it('returns true for same direction', () => {
      expect(isParallel(vec3d(1, 0, 0), vec3d(2, 0, 0))).toBe(true);
    });

    it('returns true for opposite direction', () => {
      expect(isParallel(vec3d(1, 0, 0), vec3d(-3, 0, 0))).toBe(true);
    });

    it('returns false for perpendicular vectors', () => {
      expect(isParallel(X_AXIS, Y_AXIS)).toBe(false);
    });

    it('returns false for arbitrary non-parallel vectors', () => {
      expect(isParallel(vec3d(1, 0, 0), vec3d(1, 1, 0))).toBe(false);
    });

    it('handles nearly parallel vectors with tolerance', () => {
      const v1 = vec3d(1, 0, 0);
      const v2 = vec3d(1, 1e-9, 0);
      expect(isParallel(v1, v2, 1e-6)).toBe(true);
    });

    it('returns true for zero vector (degenerate)', () => {
      // Zero vector is parallel to everything (no direction)
      expect(isParallel(vec3d(0, 0, 0), vec3d(1, 0, 0))).toBe(true);
    });
  });

  describe('isNormal', () => {
    it('returns true for perpendicular vectors', () => {
      expect(isNormal(X_AXIS, Y_AXIS)).toBe(true);
      expect(isNormal(Y_AXIS, Z_AXIS)).toBe(true);
      expect(isNormal(Z_AXIS, X_AXIS)).toBe(true);
    });

    it('returns false for parallel vectors', () => {
      expect(isNormal(vec3d(1, 0, 0), vec3d(2, 0, 0))).toBe(false);
    });

    it('returns false for arbitrary non-perpendicular vectors', () => {
      expect(isNormal(vec3d(1, 0, 0), vec3d(1, 1, 0))).toBe(false);
    });

    it('handles nearly perpendicular vectors with tolerance', () => {
      const v1 = vec3d(1, 0, 0);
      const v2 = vec3d(1e-9, 1, 0);
      expect(isNormal(v1, v2, 1e-6)).toBe(true);
    });

    it('handles zero vector', () => {
      // Zero vector has zero dot product with everything
      expect(isNormal(vec3d(0, 0, 0), vec3d(1, 0, 0))).toBe(true);
    });
  });
});
