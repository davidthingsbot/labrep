import { describe, it, expect } from 'vitest';
import {
  point2d,
  distance2d,
  midpoint2d,
  addVector2d,
  subtractPoints2d,
  points2dEqual,
  ORIGIN_2D,
} from '../../src/core/point2d';

describe('Point2D', () => {
  it('creates a point with x, y', () => {
    const p = point2d(3, 4);
    expect(p.x).toBe(3);
    expect(p.y).toBe(4);
  });

  it('computes distance between two points', () => {
    const a = point2d(0, 0);
    const b = point2d(3, 4);
    expect(distance2d(a, b)).toBeCloseTo(5, 10);
  });

  it('distance between coincident points is 0', () => {
    const p = point2d(7, -2);
    expect(distance2d(p, p)).toBeCloseTo(0, 10);
  });

  it('computes midpoint', () => {
    const a = point2d(0, 0);
    const b = point2d(4, 6);
    const m = midpoint2d(a, b);
    expect(m.x).toBeCloseTo(2, 10);
    expect(m.y).toBeCloseTo(3, 10);
  });

  it('adds a vector to a point', () => {
    const p = point2d(1, 2);
    const v = { x: 10, y: 20 };
    const result = addVector2d(p, v);
    expect(result.x).toBeCloseTo(11, 10);
    expect(result.y).toBeCloseTo(22, 10);
  });

  it('subtracts two points to get a vector', () => {
    const a = point2d(5, 7);
    const b = point2d(1, 2);
    const v = subtractPoints2d(a, b);
    expect(v.x).toBeCloseTo(4, 10);
    expect(v.y).toBeCloseTo(5, 10);
  });

  it('points2dEqual returns true within tolerance', () => {
    const a = point2d(1, 2);
    const b = point2d(1 + 1e-8, 2 - 1e-8);
    expect(points2dEqual(a, b)).toBe(true);
  });

  it('points2dEqual returns false outside tolerance', () => {
    const a = point2d(1, 2);
    const b = point2d(1.001, 2);
    expect(points2dEqual(a, b)).toBe(false);
  });

  it('ORIGIN_2D constant is (0,0)', () => {
    expect(ORIGIN_2D.x).toBe(0);
    expect(ORIGIN_2D.y).toBe(0);
  });
});
