import { describe, it, expect } from 'vitest';
import {
  identity,
  translation,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  compose,
  inverse,
  transformPoint,
  transformVector,
} from '../../src/core/transform3d';
import { point3d } from '../../src/core/point3d';
import { vec3d } from '../../src/core/vector3d';

describe('Transform3D', () => {
  it('identity transform does not change a point', () => {
    const p = point3d(1, 2, 3);
    const result = transformPoint(identity(), p);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(2, 10);
    expect(result.z).toBeCloseTo(3, 10);
  });

  it('translation moves a point by (dx, dy, dz)', () => {
    const p = point3d(1, 2, 3);
    const t = translation(10, 20, 30);
    const result = transformPoint(t, p);
    expect(result.x).toBeCloseTo(11, 10);
    expect(result.y).toBeCloseTo(22, 10);
    expect(result.z).toBeCloseTo(33, 10);
  });

  it('rotation around Z by 90 degrees maps (1,0,0) to (0,1,0)', () => {
    const p = point3d(1, 0, 0);
    const result = transformPoint(rotationZ(Math.PI / 2), p);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
    expect(result.z).toBeCloseTo(0, 10);
  });

  it('rotation around X by 90 degrees maps (0,1,0) to (0,0,1)', () => {
    const p = point3d(0, 1, 0);
    const result = transformPoint(rotationX(Math.PI / 2), p);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.z).toBeCloseTo(1, 10);
  });

  it('rotation around Y by 90 degrees maps (0,0,1) to (1,0,0)', () => {
    const p = point3d(0, 0, 1);
    const result = transformPoint(rotationY(Math.PI / 2), p);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.z).toBeCloseTo(0, 10);
  });

  it('scaling scales a point coordinates', () => {
    const p = point3d(1, 2, 3);
    const result = transformPoint(scaling(2, 3, 4), p);
    expect(result.x).toBeCloseTo(2, 10);
    expect(result.y).toBeCloseTo(6, 10);
    expect(result.z).toBeCloseTo(12, 10);
  });

  it('compose two translations equals sum of translations', () => {
    const t1 = translation(1, 2, 3);
    const t2 = translation(10, 20, 30);
    const combined = compose(t1, t2);
    const p = point3d(0, 0, 0);
    const result = transformPoint(combined, p);
    expect(result.x).toBeCloseTo(11, 10);
    expect(result.y).toBeCloseTo(22, 10);
    expect(result.z).toBeCloseTo(33, 10);
  });

  it('compose rotation then translation', () => {
    // First rotate Z 90, then translate by (5,0,0)
    // Point (1,0,0) -> rotate -> (0,1,0) -> translate -> (5,1,0)
    const rot = rotationZ(Math.PI / 2);
    const trans = translation(5, 0, 0);
    const combined = compose(trans, rot); // trans applied after rot
    const result = transformPoint(combined, point3d(1, 0, 0));
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(1, 10);
    expect(result.z).toBeCloseTo(0, 10);
  });

  it('inverse of translation is negative translation', () => {
    const t = translation(1, 2, 3);
    const inv = inverse(t);
    const result = transformPoint(inv, point3d(0, 0, 0));
    expect(result.x).toBeCloseTo(-1, 10);
    expect(result.y).toBeCloseTo(-2, 10);
    expect(result.z).toBeCloseTo(-3, 10);
  });

  it('inverse of identity is identity', () => {
    const inv = inverse(identity());
    const p = point3d(5, 7, -3);
    const result = transformPoint(inv, p);
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(7, 10);
    expect(result.z).toBeCloseTo(-3, 10);
  });

  it('transform * inverse = identity (on a point)', () => {
    const t = compose(translation(1, 2, 3), rotationZ(Math.PI / 4));
    const inv = inverse(t);
    const combined = compose(inv, t);
    const p = point3d(7, -3, 11);
    const result = transformPoint(combined, p);
    expect(result.x).toBeCloseTo(7, 8);
    expect(result.y).toBeCloseTo(-3, 8);
    expect(result.z).toBeCloseTo(11, 8);
  });

  it('transformVector ignores translation', () => {
    const t = translation(100, 200, 300);
    const v = vec3d(1, 0, 0);
    const result = transformVector(t, v);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.z).toBeCloseTo(0, 10);
  });

  it('transformPoint includes translation', () => {
    const t = translation(100, 200, 300);
    const p = point3d(1, 0, 0);
    const result = transformPoint(t, p);
    expect(result.x).toBeCloseTo(101, 10);
    expect(result.y).toBeCloseTo(200, 10);
    expect(result.z).toBeCloseTo(300, 10);
  });

  // Edge cases
  it('identity transform leaves point unchanged', () => {
    const p = point3d(1, 2, 3);
    const result = transformPoint(identity(), p);
    expect(result).toEqual(p);
  });

  it('rotation by 0 is identity', () => {
    const t = rotationZ(0);
    const p = point3d(1, 2, 3);
    const result = transformPoint(t, p);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(2, 10);
    expect(result.z).toBeCloseTo(3, 10);
  });

  it('rotation by 2π is identity', () => {
    const t = rotationZ(2 * Math.PI);
    const p = point3d(1, 2, 3);
    const result = transformPoint(t, p);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(2, 10);
    expect(result.z).toBeCloseTo(3, 10);
  });

  it('scale by 1 is identity', () => {
    const t = scaling(1, 1, 1);
    const p = point3d(5, 6, 7);
    const result = transformPoint(t, p);
    expect(result).toEqual(p);
  });

  it('scale by 0 collapses to origin', () => {
    const t = scaling(0, 0, 0);
    const p = point3d(5, 6, 7);
    const result = transformPoint(t, p);
    expect(result).toEqual(point3d(0, 0, 0));
  });

  it('compose with identity returns original', () => {
    const t = translation(1, 2, 3);
    const composed = compose(t, identity());
    const p = point3d(0, 0, 0);
    expect(transformPoint(composed, p)).toEqual(transformPoint(t, p));
  });

  it('negative scale mirrors', () => {
    const t = scaling(-1, 1, 1);
    const p = point3d(5, 6, 7);
    const result = transformPoint(t, p);
    expect(result.x).toBeCloseTo(-5, 10);
    expect(result.y).toBeCloseTo(6, 10);
  });
});
