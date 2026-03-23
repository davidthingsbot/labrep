import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, XY_PLANE, XZ_PLANE, YZ_PLANE, TOLERANCE } from '../../src/core';

import {
  makeCircle3D,
  evaluateCircle3D,
  tangentCircle3D,
  lengthCircle3D,
} from '../../src/geometry/circle3d';

describe('Circle3D', () => {
  describe('makeCircle3D', () => {
    it('creates a circle on XY plane', () => {
      const result = makeCircle3D(XY_PLANE, 1.5);

      expect(result.success).toBe(true);
      const circle = result.result!;
      expect(circle.type).toBe('circle3d');
      expect(circle.plane).toEqual(XY_PLANE);
      expect(circle.radius).toBe(1.5);
    });

    it('creates a circle on XZ plane', () => {
      const result = makeCircle3D(XZ_PLANE, 2);

      expect(result.success).toBe(true);
      expect(result.result!.plane).toEqual(XZ_PLANE);
    });

    it('creates a circle on tilted plane', () => {
      const tiltedPlane = plane(point3d(1, 2, 3), vec3d(1, 1, 1), vec3d(1, -1, 0));
      const result = makeCircle3D(tiltedPlane, 1);

      expect(result.success).toBe(true);
      expect(result.result!.plane).toEqual(tiltedPlane);
    });

    it('fails for zero radius', () => {
      const result = makeCircle3D(XY_PLANE, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative radius', () => {
      const result = makeCircle3D(XY_PLANE, -1);

      expect(result.success).toBe(false);
    });

    it('sets isClosed to true', () => {
      const result = makeCircle3D(XY_PLANE, 1);
      expect(result.result!.isClosed).toBe(true);
    });

    it('sets parameter range from 0 to 2π', () => {
      const result = makeCircle3D(XY_PLANE, 1);
      expect(result.result!.startParam).toBe(0);
      expect(result.result!.endParam).toBeCloseTo(2 * Math.PI, 10);
    });

    it('startPoint equals endPoint (closed)', () => {
      const result = makeCircle3D(XY_PLANE, 1);
      const circle = result.result!;
      expect(circle.startPoint).toEqual(circle.endPoint);
    });
  });

  describe('evaluateCircle3D', () => {
    it('returns point along xAxis at θ=0', () => {
      const circle = makeCircle3D(XY_PLANE, 2).result!;
      const pt = evaluateCircle3D(circle, 0);

      // XY_PLANE has origin (0,0,0), xAxis (1,0,0)
      // At θ=0: center + radius * xAxis = (2, 0, 0)
      expect(pt.x).toBeCloseTo(2, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns point along yAxis at θ=π/2', () => {
      const circle = makeCircle3D(XY_PLANE, 2).result!;
      const pt = evaluateCircle3D(circle, Math.PI / 2);

      // yAxis = cross(normal, xAxis) = cross((0,0,1), (1,0,0)) = (0,1,0)
      // At θ=π/2: center + radius * yAxis = (0, 2, 0)
      expect(pt.x).toBeCloseTo(0, 10);
      expect(pt.y).toBeCloseTo(2, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns point along -xAxis at θ=π', () => {
      const circle = makeCircle3D(XY_PLANE, 2).result!;
      const pt = evaluateCircle3D(circle, Math.PI);

      expect(pt.x).toBeCloseTo(-2, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns starting point at θ=2π', () => {
      const circle = makeCircle3D(XY_PLANE, 2).result!;
      const pt0 = evaluateCircle3D(circle, 0);
      const pt2pi = evaluateCircle3D(circle, 2 * Math.PI);

      expect(pt2pi.x).toBeCloseTo(pt0.x, 10);
      expect(pt2pi.y).toBeCloseTo(pt0.y, 10);
      expect(pt2pi.z).toBeCloseTo(pt0.z, 10);
    });

    it('works on XZ plane', () => {
      // XZ_PLANE: origin (0,0,0), normal (0,1,0), xAxis (1,0,0)
      // yAxis = cross(normal, xAxis) = cross((0,1,0), (1,0,0)) = (0,0,-1)
      const circle = makeCircle3D(XZ_PLANE, 1).result!;

      const pt0 = evaluateCircle3D(circle, 0);
      expect(pt0.x).toBeCloseTo(1, 10);
      expect(pt0.y).toBeCloseTo(0, 10);
      expect(pt0.z).toBeCloseTo(0, 10);

      const pt90 = evaluateCircle3D(circle, Math.PI / 2);
      expect(pt90.x).toBeCloseTo(0, 10);
      expect(pt90.y).toBeCloseTo(0, 10);
      expect(pt90.z).toBeCloseTo(-1, 10);
    });

    it('works on offset plane', () => {
      const offsetPlane = plane(point3d(5, 5, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
      const circle = makeCircle3D(offsetPlane, 1).result!;

      const pt = evaluateCircle3D(circle, 0);
      expect(pt.x).toBeCloseTo(6, 10); // 5 + 1
      expect(pt.y).toBeCloseTo(5, 10);
      expect(pt.z).toBeCloseTo(5, 10);
    });
  });

  describe('tangentCircle3D', () => {
    it('returns perpendicular vector at θ=0', () => {
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      const tangent = tangentCircle3D(circle, 0);

      // At θ=0, position is along +X, tangent should be along +Y (CCW)
      expect(tangent.x).toBeCloseTo(0, 10);
      expect(tangent.y).toBeCloseTo(1, 10);
      expect(tangent.z).toBeCloseTo(0, 10);
    });

    it('returns perpendicular vector at θ=π/2', () => {
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      const tangent = tangentCircle3D(circle, Math.PI / 2);

      // At θ=π/2, position is along +Y, tangent should be along -X (CCW)
      expect(tangent.x).toBeCloseTo(-1, 10);
      expect(tangent.y).toBeCloseTo(0, 10);
      expect(tangent.z).toBeCloseTo(0, 10);
    });

    it('is unit length', () => {
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      const tangent = tangentCircle3D(circle, 0.7);

      const len = Math.sqrt(tangent.x ** 2 + tangent.y ** 2 + tangent.z ** 2);
      expect(len).toBeCloseTo(1, 10);
    });

    it('is perpendicular to radius', () => {
      const circle = makeCircle3D(XY_PLANE, 2).result!;
      const theta = 1.2;

      const pt = evaluateCircle3D(circle, theta);
      const tangent = tangentCircle3D(circle, theta);

      // Radius vector from center to point
      const radius = {
        x: pt.x - circle.plane.origin.x,
        y: pt.y - circle.plane.origin.y,
        z: pt.z - circle.plane.origin.z,
      };

      // Dot product should be zero
      const dot = radius.x * tangent.x + radius.y * tangent.y + radius.z * tangent.z;
      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('lengthCircle3D', () => {
    it('returns 2πr for radius 1', () => {
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      expect(lengthCircle3D(circle)).toBeCloseTo(2 * Math.PI, 10);
    });

    it('returns 2πr for radius 2.5', () => {
      const circle = makeCircle3D(XY_PLANE, 2.5).result!;
      expect(lengthCircle3D(circle)).toBeCloseTo(2 * Math.PI * 2.5, 10);
    });
  });

  describe('edge cases', () => {
    // TODO: Add validation for degenerate plane (zero normal)
    it.skip('fails for degenerate plane (zero normal)', () => {
      const badPlane = plane(point3d(0, 0, 0), vec3d(0, 0, 0), vec3d(1, 0, 0));
      const result = makeCircle3D(badPlane, 1);
      expect(result.success).toBe(false);
    });

    // TODO: Add validation for very small radius
    it.skip('fails for very small radius near tolerance', () => {
      const result = makeCircle3D(XY_PLANE, 1e-10);
      expect(result.success).toBe(false);
    });

    it('handles very large radius', () => {
      const result = makeCircle3D(XY_PLANE, 1e6);
      expect(result.success).toBe(true);
      expect(result.result!.radius).toBe(1e6);
    });
  });
});
