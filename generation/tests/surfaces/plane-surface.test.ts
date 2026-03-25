import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, XY_PLANE, XZ_PLANE, YZ_PLANE } from '../../src/core';

import {
  makePlaneSurface,
  evaluatePlaneSurface,
  normalPlaneSurface,
  projectToPlaneSurface,
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

  describe('projectToPlaneSurface', () => {
    it('projects origin to (0, 0) on XY_PLANE', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const uv = projectToPlaneSurface(surface, point3d(0, 0, 0));
      expect(uv.u).toBeCloseTo(0, 10);
      expect(uv.v).toBeCloseTo(0, 10);
    });

    it('projects (3, 5, 0) to (3, 5) on XY_PLANE', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const uv = projectToPlaneSurface(surface, point3d(3, 5, 0));
      expect(uv.u).toBeCloseTo(3, 10);
      expect(uv.v).toBeCloseTo(5, 10);
    });

    it('projects negative coordinates correctly', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const uv = projectToPlaneSurface(surface, point3d(-2, -7, 0));
      expect(uv.u).toBeCloseTo(-2, 10);
      expect(uv.v).toBeCloseTo(-7, 10);
    });

    it('projects onto offset plane', () => {
      const offsetPlane = plane(point3d(5, 5, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
      const surface = makePlaneSurface(offsetPlane);
      const uv = projectToPlaneSurface(surface, point3d(8, 9, 5));
      expect(uv.u).toBeCloseTo(3, 10);  // 8 - 5
      expect(uv.v).toBeCloseTo(4, 10);  // 9 - 5
    });

    it('projects onto XZ_PLANE', () => {
      const surface = makePlaneSurface(XZ_PLANE);
      // XZ_PLANE: normal (0,1,0), xAxis (1,0,0), yAxis = cross((0,1,0),(1,0,0)) = (0,0,-1)
      const uv = projectToPlaneSurface(surface, point3d(3, 0, -2));
      expect(uv.u).toBeCloseTo(3, 10);
      expect(uv.v).toBeCloseTo(2, 10);  // z=-2 along yAxis=(0,0,-1) → v=2
    });

    it('projects onto YZ_PLANE', () => {
      const surface = makePlaneSurface(YZ_PLANE);
      // YZ_PLANE: normal (1,0,0), xAxis (0,1,0), yAxis = cross((1,0,0),(0,1,0)) = (0,0,1)
      const uv = projectToPlaneSurface(surface, point3d(0, 4, -6));
      expect(uv.u).toBeCloseTo(4, 10);
      expect(uv.v).toBeCloseTo(-6, 10);  // z=-6 along yAxis=(0,0,1) → v=-6
    });

    it('round-trips with evaluatePlaneSurface for 10 points', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const testPoints = [
        [0, 0], [1, 0], [0, 1], [3, 5], [-2, -7],
        [100, 200], [-50, 30], [0.001, 0.002], [1e6, -1e6], [Math.PI, Math.E],
      ];
      for (const [u, v] of testPoints) {
        const pt = evaluatePlaneSurface(surface, u, v);
        const uv = projectToPlaneSurface(surface, pt);
        expect(uv.u).toBeCloseTo(u, 7);
        expect(uv.v).toBeCloseTo(v, 7);
      }
    });

    it('round-trips on tilted plane', () => {
      // Plane at 45 degrees
      const tiltedPlane = plane(
        point3d(1, 2, 3),
        vec3d(0, 0, 1),   // normal pointing up in Z
        vec3d(1, 0, 0),   // xAxis along X
      );
      const surface = makePlaneSurface(tiltedPlane);
      const testUV = [[0, 0], [5, -3], [-10, 7], [0.5, 0.5]];
      for (const [u, v] of testUV) {
        const pt = evaluatePlaneSurface(surface, u, v);
        const uv = projectToPlaneSurface(surface, pt);
        expect(uv.u).toBeCloseTo(u, 7);
        expect(uv.v).toBeCloseTo(v, 7);
      }
    });
  });
});
