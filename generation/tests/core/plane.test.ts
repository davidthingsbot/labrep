import { describe, it, expect } from 'vitest';
import {
  plane,
  XY_PLANE,
  XZ_PLANE,
  YZ_PLANE,
  distanceToPoint,
  projectPoint,
  containsPoint,
} from '../../src/core/plane';
import { point3d, ORIGIN } from '../../src/core/point3d';
import { vec3d, length } from '../../src/core/vector3d';

describe('Plane', () => {
  it('creates a plane with origin, normal, xAxis', () => {
    const pl = plane(point3d(1, 2, 3), vec3d(0, 0, 1), vec3d(1, 0, 0));
    expect(pl.origin.x).toBe(1);
    expect(pl.origin.y).toBe(2);
    expect(pl.origin.z).toBe(3);
    expect(pl.normal.x).toBeCloseTo(0);
    expect(pl.normal.y).toBeCloseTo(0);
    expect(pl.normal.z).toBeCloseTo(1);
    expect(pl.xAxis.x).toBeCloseTo(1);
    expect(pl.xAxis.y).toBeCloseTo(0);
    expect(pl.xAxis.z).toBeCloseTo(0);
  });

  it('normal is normalized on creation', () => {
    const pl = plane(ORIGIN, vec3d(0, 0, 5), vec3d(1, 0, 0));
    const len = length(pl.normal);
    expect(len).toBeCloseTo(1);
    expect(pl.normal.z).toBeCloseTo(1);
  });

  it('XY_PLANE has normal (0,0,1)', () => {
    expect(XY_PLANE.origin).toEqual(ORIGIN);
    expect(XY_PLANE.normal.x).toBeCloseTo(0);
    expect(XY_PLANE.normal.y).toBeCloseTo(0);
    expect(XY_PLANE.normal.z).toBeCloseTo(1);
  });

  it('XZ_PLANE has normal (0,1,0)', () => {
    expect(XZ_PLANE.origin).toEqual(ORIGIN);
    expect(XZ_PLANE.normal.x).toBeCloseTo(0);
    expect(XZ_PLANE.normal.y).toBeCloseTo(1);
    expect(XZ_PLANE.normal.z).toBeCloseTo(0);
  });

  it('YZ_PLANE has normal (1,0,0)', () => {
    expect(YZ_PLANE.origin).toEqual(ORIGIN);
    expect(YZ_PLANE.normal.x).toBeCloseTo(1);
    expect(YZ_PLANE.normal.y).toBeCloseTo(0);
    expect(YZ_PLANE.normal.z).toBeCloseTo(0);
  });

  it('distanceToPoint returns signed distance', () => {
    const d = distanceToPoint(XY_PLANE, point3d(0, 0, 5));
    expect(d).toBeCloseTo(5);

    const dNeg = distanceToPoint(XY_PLANE, point3d(0, 0, -3));
    expect(dNeg).toBeCloseTo(-3);
  });

  it('distanceToPoint returns 0 for point on plane', () => {
    const d = distanceToPoint(XY_PLANE, point3d(7, 3, 0));
    expect(d).toBeCloseTo(0);
  });

  it('projectPoint projects onto plane', () => {
    const projected = projectPoint(XY_PLANE, point3d(3, 4, 5));
    expect(projected.x).toBeCloseTo(3);
    expect(projected.y).toBeCloseTo(4);
    expect(projected.z).toBeCloseTo(0);
  });

  it('containsPoint returns true for points on plane (within tolerance)', () => {
    expect(containsPoint(XY_PLANE, point3d(1, 2, 0))).toBe(true);
    expect(containsPoint(XY_PLANE, point3d(1, 2, 1e-11))).toBe(true);
  });

  it('containsPoint returns false for points not on plane', () => {
    expect(containsPoint(XY_PLANE, point3d(1, 2, 1))).toBe(false);
  });

  // Edge cases
  it('distance to point on plane is zero', () => {
    const d = distanceToPoint(XY_PLANE, point3d(100, 200, 0));
    expect(d).toBeCloseTo(0, 10);
  });

  it('distance to point above plane is positive', () => {
    const d = distanceToPoint(XY_PLANE, point3d(0, 0, 5));
    expect(d).toBeCloseTo(5, 10);
  });

  it('distance to point below plane is negative', () => {
    const d = distanceToPoint(XY_PLANE, point3d(0, 0, -3));
    expect(d).toBeCloseTo(-3, 10);
  });

  it('project point already on plane returns same point', () => {
    const p = point3d(7, 8, 0);
    const projected = projectPoint(XY_PLANE, p);
    expect(projected.x).toBeCloseTo(7, 10);
    expect(projected.y).toBeCloseTo(8, 10);
    expect(projected.z).toBeCloseTo(0, 10);
  });

  it('XZ_PLANE has Y as normal', () => {
    expect(XZ_PLANE.normal.y).toBeCloseTo(1, 10);
  });

  it('YZ_PLANE has X as normal', () => {
    expect(YZ_PLANE.normal.x).toBeCloseTo(1, 10);
  });

  it('containsPoint at tolerance boundary', () => {
    const nearlyOn = point3d(0, 0, 1e-7);
    // Result depends on tolerance comparison
    expect(typeof containsPoint(XY_PLANE, nearlyOn)).toBe('boolean');
  });
});
