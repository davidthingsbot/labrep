import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, XY_PLANE, XZ_PLANE, YZ_PLANE } from '../../src/core';

import {
  makePlaneSurface,
  evaluatePlaneSurface,
  normalPlaneSurface,
} from '../../src/surfaces/plane-surface';

describe('PlaneSurface', () => {
  describe('makePlaneSurface', () => {
    it('creates a plane surface from XY_PLANE', () => {
      const surface = makePlaneSurface(XY_PLANE);

      expect(surface.type).toBe('plane');
      expect(surface.plane).toEqual(XY_PLANE);
    });

    it('creates a plane surface from XZ_PLANE', () => {
      const surface = makePlaneSurface(XZ_PLANE);

      expect(surface.type).toBe('plane');
      expect(surface.plane).toEqual(XZ_PLANE);
    });

    it('creates a plane surface from custom plane', () => {
      const customPlane = plane(point3d(1, 2, 3), vec3d(1, 1, 1), vec3d(1, -1, 0));
      const surface = makePlaneSurface(customPlane);

      expect(surface.plane).toEqual(customPlane);
    });
  });

  describe('evaluatePlaneSurface', () => {
    it('returns origin at (0, 0)', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const pt = evaluatePlaneSurface(surface, 0, 0);

      expect(pt.x).toBeCloseTo(0, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns point along xAxis at (1, 0)', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const pt = evaluatePlaneSurface(surface, 1, 0);

      // XY_PLANE xAxis is (1, 0, 0)
      expect(pt.x).toBeCloseTo(1, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns point along yAxis at (0, 1)', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const pt = evaluatePlaneSurface(surface, 0, 1);

      // XY_PLANE yAxis = cross(normal, xAxis) = cross((0,0,1), (1,0,0)) = (0,1,0)
      expect(pt.x).toBeCloseTo(0, 10);
      expect(pt.y).toBeCloseTo(1, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns correct point at (2, 3)', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const pt = evaluatePlaneSurface(surface, 2, 3);

      expect(pt.x).toBeCloseTo(2, 10);
      expect(pt.y).toBeCloseTo(3, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('works with offset plane', () => {
      const offsetPlane = plane(point3d(5, 5, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
      const surface = makePlaneSurface(offsetPlane);
      const pt = evaluatePlaneSurface(surface, 1, 2);

      expect(pt.x).toBeCloseTo(6, 10);  // 5 + 1
      expect(pt.y).toBeCloseTo(7, 10);  // 5 + 2
      expect(pt.z).toBeCloseTo(5, 10);  // stays at z=5
    });

    it('works with XZ_PLANE', () => {
      const surface = makePlaneSurface(XZ_PLANE);
      const pt = evaluatePlaneSurface(surface, 1, 1);

      // XZ_PLANE: origin (0,0,0), normal (0,1,0), xAxis (1,0,0)
      // yAxis = cross((0,1,0), (1,0,0)) = (0,0,-1)
      expect(pt.x).toBeCloseTo(1, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(-1, 10);
    });

    it('handles negative parameters', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const pt = evaluatePlaneSurface(surface, -2, -3);

      expect(pt.x).toBeCloseTo(-2, 10);
      expect(pt.y).toBeCloseTo(-3, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });
  });

  describe('normalPlaneSurface', () => {
    it('returns plane normal at any point', () => {
      const surface = makePlaneSurface(XY_PLANE);

      const n1 = normalPlaneSurface(surface, 0, 0);
      const n2 = normalPlaneSurface(surface, 5, 10);
      const n3 = normalPlaneSurface(surface, -3, 7);

      // All should equal plane.normal
      expect(n1).toEqual(XY_PLANE.normal);
      expect(n2).toEqual(XY_PLANE.normal);
      expect(n3).toEqual(XY_PLANE.normal);
    });

    it('returns correct normal for tilted plane', () => {
      const tiltedPlane = plane(point3d(0, 0, 0), vec3d(0, 1, 0), vec3d(1, 0, 0));
      const surface = makePlaneSurface(tiltedPlane);
      const normal = normalPlaneSurface(surface, 0, 0);

      expect(normal.x).toBeCloseTo(0, 10);
      expect(normal.y).toBeCloseTo(1, 10);
      expect(normal.z).toBeCloseTo(0, 10);
    });

    it('is unit length', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const normal = normalPlaneSurface(surface, 2, 3);

      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
      expect(len).toBeCloseTo(1, 10);
    });
  });
});
