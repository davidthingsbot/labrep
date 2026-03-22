import { describe, it, expect } from 'vitest';
import { axis, X_AXIS_3D, Y_AXIS_3D, Z_AXIS_3D } from '../../src/core/axis';
import { point3d, ORIGIN } from '../../src/core/point3d';
import { vec3d, length } from '../../src/core/vector3d';

describe('Axis', () => {
  it('creates an axis with origin and direction', () => {
    const a = axis(point3d(1, 2, 3), vec3d(1, 0, 0));
    expect(a.origin.x).toBe(1);
    expect(a.origin.y).toBe(2);
    expect(a.origin.z).toBe(3);
    expect(a.direction.x).toBeCloseTo(1);
    expect(a.direction.y).toBeCloseTo(0);
    expect(a.direction.z).toBeCloseTo(0);
  });

  it('direction is normalized on creation', () => {
    const a = axis(ORIGIN, vec3d(3, 4, 0));
    const len = length(a.direction);
    expect(len).toBeCloseTo(1);
    expect(a.direction.x).toBeCloseTo(3 / 5);
    expect(a.direction.y).toBeCloseTo(4 / 5);
    expect(a.direction.z).toBeCloseTo(0);
  });

  it('X_AXIS_3D is predefined', () => {
    expect(X_AXIS_3D.origin).toEqual(ORIGIN);
    expect(X_AXIS_3D.direction.x).toBeCloseTo(1);
    expect(X_AXIS_3D.direction.y).toBeCloseTo(0);
    expect(X_AXIS_3D.direction.z).toBeCloseTo(0);
  });

  it('Y_AXIS_3D is predefined', () => {
    expect(Y_AXIS_3D.origin).toEqual(ORIGIN);
    expect(Y_AXIS_3D.direction.x).toBeCloseTo(0);
    expect(Y_AXIS_3D.direction.y).toBeCloseTo(1);
    expect(Y_AXIS_3D.direction.z).toBeCloseTo(0);
  });

  it('Z_AXIS_3D is predefined', () => {
    expect(Z_AXIS_3D.origin).toEqual(ORIGIN);
    expect(Z_AXIS_3D.direction.x).toBeCloseTo(0);
    expect(Z_AXIS_3D.direction.y).toBeCloseTo(0);
    expect(Z_AXIS_3D.direction.z).toBeCloseTo(1);
  });
});
