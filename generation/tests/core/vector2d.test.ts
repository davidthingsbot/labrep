import { describe, it, expect } from 'vitest';
import {
  vec2d,
  length2d,
  normalize2d,
  add2d,
  subtract2d,
  scale2d,
  dot2d,
  perpendicular,
  X_AXIS_2D,
  Y_AXIS_2D,
} from '../../src/core/vector2d';

describe('Vector2D', () => {
  it('creates a vector with x, y', () => {
    const v = vec2d(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it('computes length', () => {
    expect(length2d(vec2d(3, 4))).toBeCloseTo(5, 10);
    expect(length2d(vec2d(0, 0))).toBeCloseTo(0, 10);
  });

  it('normalizes a vector', () => {
    const n = normalize2d(vec2d(3, 4));
    expect(n.x).toBeCloseTo(0.6, 10);
    expect(n.y).toBeCloseTo(0.8, 10);
    expect(length2d(n)).toBeCloseTo(1, 10);
  });

  it('adds two vectors', () => {
    const result = add2d(vec2d(1, 2), vec2d(3, 4));
    expect(result.x).toBeCloseTo(4, 10);
    expect(result.y).toBeCloseTo(6, 10);
  });

  it('subtracts two vectors', () => {
    const result = subtract2d(vec2d(5, 7), vec2d(1, 2));
    expect(result.x).toBeCloseTo(4, 10);
    expect(result.y).toBeCloseTo(5, 10);
  });

  it('scales a vector', () => {
    const result = scale2d(vec2d(2, 3), 4);
    expect(result.x).toBeCloseTo(8, 10);
    expect(result.y).toBeCloseTo(12, 10);
  });

  it('computes dot product', () => {
    expect(dot2d(vec2d(1, 0), vec2d(0, 1))).toBeCloseTo(0, 10);
    expect(dot2d(vec2d(2, 3), vec2d(4, 5))).toBeCloseTo(23, 10);
  });

  it('computes perpendicular (90 degrees CCW)', () => {
    const p = perpendicular(vec2d(1, 0));
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(1, 10);

    const p2 = perpendicular(vec2d(0, 1));
    expect(p2.x).toBeCloseTo(-1, 10);
    expect(p2.y).toBeCloseTo(0, 10);
  });

  it('X_AXIS_2D constant is (1,0)', () => {
    expect(X_AXIS_2D.x).toBe(1);
    expect(X_AXIS_2D.y).toBe(0);
  });

  it('Y_AXIS_2D constant is (0,1)', () => {
    expect(Y_AXIS_2D.x).toBe(0);
    expect(Y_AXIS_2D.y).toBe(1);
  });
});
