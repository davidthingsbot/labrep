import { describe, it, expect } from 'vitest';
import {
  point3d,
  distance,
  midpoint,
  addVector,
  subtractPoints,
  pointsEqual,
  ORIGIN,
} from '../../src/core/point3d';

describe('Point3D', () => {
  it('creates a point with x, y, z', () => {
    const p = point3d(1, 2, 3);
    expect(p.x).toBe(1);
    expect(p.y).toBe(2);
    expect(p.z).toBe(3);
  });

  it('computes distance between two points', () => {
    const a = point3d(1, 0, 0);
    const b = point3d(4, 0, 0);
    expect(distance(a, b)).toBeCloseTo(3, 10);
  });

  it('distance from origin to (1,0,0) is 1', () => {
    expect(distance(ORIGIN, point3d(1, 0, 0))).toBeCloseTo(1, 10);
  });

  it('distance between coincident points is 0', () => {
    const p = point3d(5, 7, -3);
    expect(distance(p, p)).toBeCloseTo(0, 10);
  });

  it('computes midpoint correctly', () => {
    const a = point3d(0, 0, 0);
    const b = point3d(2, 4, 6);
    const m = midpoint(a, b);
    expect(m.x).toBeCloseTo(1, 10);
    expect(m.y).toBeCloseTo(2, 10);
    expect(m.z).toBeCloseTo(3, 10);
  });

  it('adds a vector to a point', () => {
    const p = point3d(1, 2, 3);
    const v = { x: 10, y: 20, z: 30 };
    const result = addVector(p, v);
    expect(result.x).toBeCloseTo(11, 10);
    expect(result.y).toBeCloseTo(22, 10);
    expect(result.z).toBeCloseTo(33, 10);
  });

  it('subtracts two points to get a vector', () => {
    const a = point3d(5, 7, 9);
    const b = point3d(1, 2, 3);
    const v = subtractPoints(a, b);
    expect(v.x).toBeCloseTo(4, 10);
    expect(v.y).toBeCloseTo(5, 10);
    expect(v.z).toBeCloseTo(6, 10);
  });

  it('pointsEqual returns true within tolerance', () => {
    const a = point3d(1, 2, 3);
    const b = point3d(1 + 1e-8, 2 - 1e-8, 3 + 1e-9);
    expect(pointsEqual(a, b)).toBe(true);
  });

  it('pointsEqual returns false outside tolerance', () => {
    const a = point3d(1, 2, 3);
    const b = point3d(1.001, 2, 3);
    expect(pointsEqual(a, b)).toBe(false);
  });

  it('ORIGIN constant is (0,0,0)', () => {
    expect(ORIGIN.x).toBe(0);
    expect(ORIGIN.y).toBe(0);
    expect(ORIGIN.z).toBe(0);
  });
});
