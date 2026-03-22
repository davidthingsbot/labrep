import { describe, it, expect } from 'vitest';
import {
  boundingBox,
  emptyBoundingBox,
  addPoint,
  contains,
  center,
  size,
  intersects,
  isEmpty,
} from '../../src/core/bounding-box';
import { point3d } from '../../src/core/point3d';

describe('BoundingBox3D', () => {
  it('creates a bounding box from min and max points', () => {
    const bb = boundingBox(point3d(0, 0, 0), point3d(1, 1, 1));
    expect(bb.min.x).toBe(0);
    expect(bb.min.y).toBe(0);
    expect(bb.min.z).toBe(0);
    expect(bb.max.x).toBe(1);
    expect(bb.max.y).toBe(1);
    expect(bb.max.z).toBe(1);
  });

  it('creates empty bounding box', () => {
    const bb = emptyBoundingBox();
    expect(isEmpty(bb)).toBe(true);
  });

  it('addPoint expands the box to include the point', () => {
    const bb = boundingBox(point3d(0, 0, 0), point3d(1, 1, 1));
    const expanded = addPoint(bb, point3d(2, 3, 4));
    expect(expanded.max.x).toBe(2);
    expect(expanded.max.y).toBe(3);
    expect(expanded.max.z).toBe(4);
    expect(expanded.min.x).toBe(0);
  });

  it('building a box from multiple points gives correct min/max', () => {
    let bb = emptyBoundingBox();
    bb = addPoint(bb, point3d(3, 1, 4));
    bb = addPoint(bb, point3d(-1, 5, 2));
    bb = addPoint(bb, point3d(0, -2, 7));
    expect(bb.min.x).toBeCloseTo(-1);
    expect(bb.min.y).toBeCloseTo(-2);
    expect(bb.min.z).toBeCloseTo(2);
    expect(bb.max.x).toBeCloseTo(3);
    expect(bb.max.y).toBeCloseTo(5);
    expect(bb.max.z).toBeCloseTo(7);
  });

  it('contains returns true for point inside', () => {
    const bb = boundingBox(point3d(0, 0, 0), point3d(10, 10, 10));
    expect(contains(bb, point3d(5, 5, 5))).toBe(true);
  });

  it('contains returns false for point outside', () => {
    const bb = boundingBox(point3d(0, 0, 0), point3d(10, 10, 10));
    expect(contains(bb, point3d(11, 5, 5))).toBe(false);
    expect(contains(bb, point3d(5, -1, 5))).toBe(false);
  });

  it('center returns the midpoint of min and max', () => {
    const bb = boundingBox(point3d(0, 0, 0), point3d(10, 20, 30));
    const c = center(bb);
    expect(c.x).toBeCloseTo(5);
    expect(c.y).toBeCloseTo(10);
    expect(c.z).toBeCloseTo(15);
  });

  it('size returns dimensions (max - min)', () => {
    const bb = boundingBox(point3d(1, 2, 3), point3d(4, 6, 9));
    const s = size(bb);
    expect(s.x).toBeCloseTo(3);
    expect(s.y).toBeCloseTo(4);
    expect(s.z).toBeCloseTo(6);
  });

  it('intersects returns true for overlapping boxes', () => {
    const a = boundingBox(point3d(0, 0, 0), point3d(5, 5, 5));
    const b = boundingBox(point3d(3, 3, 3), point3d(8, 8, 8));
    expect(intersects(a, b)).toBe(true);
  });

  it('intersects returns false for non-overlapping boxes', () => {
    const a = boundingBox(point3d(0, 0, 0), point3d(1, 1, 1));
    const b = boundingBox(point3d(2, 2, 2), point3d(3, 3, 3));
    expect(intersects(a, b)).toBe(false);
  });

  it('isEmpty returns true for empty box', () => {
    expect(isEmpty(emptyBoundingBox())).toBe(true);
  });

  it('isEmpty returns false for non-empty box', () => {
    const bb = boundingBox(point3d(0, 0, 0), point3d(1, 1, 1));
    expect(isEmpty(bb)).toBe(false);
  });
});
