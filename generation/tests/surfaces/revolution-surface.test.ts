import { describe, it, expect } from 'vitest';
import { point3d, vec3d, axis, plane, Z_AXIS_3D, distance } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeCircle3D } from '../../src/geometry/circle3d';

import {
  makeRevolutionSurface,
  evaluateRevolutionSurface,
  normalRevolutionSurface,
  canonicalizeRevolutionSurface,
} from '../../src/surfaces/revolution-surface';

describe('RevolutionSurface', () => {
  describe('makeRevolutionSurface', () => {
    it('creates a revolution surface from a line and Z axis', () => {
      const lineResult = makeLine3D(point3d(2, 0, 0), point3d(2, 0, 5));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);

      expect(result.success).toBe(true);
      const surface = result.result!;
      expect(surface.type).toBe('revolution');
    });

    it('has refDirection perpendicular to axis', () => {
      const lineResult = makeLine3D(point3d(2, 0, 0), point3d(2, 0, 5));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      const dot =
        surface.refDirection.x * surface.axis.direction.x +
        surface.refDirection.y * surface.axis.direction.y +
        surface.refDirection.z * surface.axis.direction.z;

      expect(dot).toBeCloseTo(0, 10);
    });

    it('fails with zero axis direction', () => {
      const lineResult = makeLine3D(point3d(2, 0, 0), point3d(2, 0, 5));
      const badAxis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 0) };
      const result = makeRevolutionSurface(lineResult.result!, badAxis);

      expect(result.success).toBe(false);
    });
  });

  describe('evaluateRevolutionSurface', () => {
    it('at θ=0 returns a point on the basis curve', () => {
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 5));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      // At θ=0, the point should be the original curve point (or close)
      // The refDirection defines θ=0; the curve at (3,0,z) should be in the refDirection
      const pt = evaluateRevolutionSurface(surface, 0, 0); // v=0 → start of curve

      // Should be at distance 3 from Z-axis
      const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
      expect(radialDist).toBeCloseTo(3, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('at θ=π/2 returns the 90-degree rotated point', () => {
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 5));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      const pt0 = evaluateRevolutionSurface(surface, 0, 0);
      const pt90 = evaluateRevolutionSurface(surface, Math.PI / 2, 0);

      // Both should be at same radius
      const r0 = Math.sqrt(pt0.x ** 2 + pt0.y ** 2);
      const r90 = Math.sqrt(pt90.x ** 2 + pt90.y ** 2);
      expect(r90).toBeCloseTo(r0, 10);

      // They should be perpendicular in XY plane
      const dot = pt0.x * pt90.x + pt0.y * pt90.y;
      expect(dot).toBeCloseTo(0, 10);

      // Same Z coordinate
      expect(pt90.z).toBeCloseTo(pt0.z, 10);
    });

    it('wraps around at θ=2π', () => {
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 5));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      const pt0 = evaluateRevolutionSurface(surface, 0, 2);
      const pt2pi = evaluateRevolutionSurface(surface, 2 * Math.PI, 2);

      expect(pt2pi.x).toBeCloseTo(pt0.x, 10);
      expect(pt2pi.y).toBeCloseTo(pt0.y, 10);
      expect(pt2pi.z).toBeCloseTo(pt0.z, 10);
    });

    it('all points at same v are at same distance from axis', () => {
      const lineResult = makeLine3D(point3d(4, 0, 1), point3d(4, 0, 6));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      // At v=0, all θ values should give points at distance 4 from Z-axis
      for (let i = 0; i < 8; i++) {
        const theta = (i / 8) * 2 * Math.PI;
        const pt = evaluateRevolutionSurface(surface, theta, 0);
        const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
        expect(radialDist).toBeCloseTo(4, 10);
      }
    });

    it('varies v along the basis curve', () => {
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 10));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      // v=5 (midpoint of line param range, which is [0, 10])
      const pt = evaluateRevolutionSurface(surface, 0, 5);
      expect(pt.z).toBeCloseTo(5, 10);
    });
  });

  describe('normalRevolutionSurface', () => {
    it('is unit length', () => {
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 5));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      const normal = normalRevolutionSurface(surface, 0.5, 2);
      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);

      expect(len).toBeCloseTo(1, 8);
    });

    it('points radially outward for a line parallel to axis', () => {
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 5));
      const result = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = result.result!;

      const normal = normalRevolutionSurface(surface, 0, 2);
      const pt = evaluateRevolutionSurface(surface, 0, 2);

      // Normal should be in the radial direction (no z component for cylinder)
      const radialDir = vec3d(pt.x, pt.y, 0);
      const radialLen = Math.sqrt(radialDir.x ** 2 + radialDir.y ** 2);

      const dot = (normal.x * radialDir.x + normal.y * radialDir.y) / radialLen;
      expect(dot).toBeGreaterThan(0.9); // Nearly parallel to radial
    });
  });

  describe('canonicalizeRevolutionSurface', () => {
    it('line parallel to axis → CylindricalSurface', () => {
      // Line at x=3, parallel to Z axis
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 5));
      const revResult = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = revResult.result!;

      const canonical = canonicalizeRevolutionSurface(surface);
      expect(canonical.type).toBe('cylinder');
      if (canonical.type === 'cylinder') {
        expect(canonical.radius).toBeCloseTo(3, 10);
      }
    });

    it('line through axis at angle → ConicalSurface', () => {
      // Line from origin (on axis) to (3, 0, 4) — goes through axis at start
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(3, 0, 4));
      const revResult = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = revResult.result!;

      const canonical = canonicalizeRevolutionSurface(surface);
      expect(canonical.type).toBe('cone');
      if (canonical.type === 'cone') {
        // Semi-angle = atan(3/4)
        expect(canonical.semiAngle).toBeCloseTo(Math.atan2(3, 4), 6);
      }
    });

    it('line perpendicular to axis through axis → PlaneSurface', () => {
      // Line in XZ plane, perpendicular to Z, starting from Z axis
      const lineResult = makeLine3D(point3d(0, 0, 5), point3d(3, 0, 5));
      const revResult = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = revResult.result!;

      const canonical = canonicalizeRevolutionSurface(surface);
      expect(canonical.type).toBe('plane');
    });

    it('semicircle centered on axis → SphericalSurface', () => {
      // Semicircle of radius 3 in XZ plane, centered at origin on Z axis
      // Arc from (3,0,0) to (-3,0,0) going through (0,0,3)
      const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
      const arcResult = makeArc3D(arcPlane, 3, 0, Math.PI);
      const revResult = makeRevolutionSurface(arcResult.result!, Z_AXIS_3D);
      const surface = revResult.result!;

      const canonical = canonicalizeRevolutionSurface(surface);
      expect(canonical.type).toBe('sphere');
      if (canonical.type === 'sphere') {
        expect(canonical.radius).toBeCloseTo(3, 6);
      }
    });

    it('circle in meridional plane offset from axis → ToroidalSurface', () => {
      // Circle of radius 1 in XZ plane, centered at (5, 0, 0)
      const circlePlane = plane(point3d(5, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
      const circleResult = makeCircle3D(circlePlane, 1);
      const revResult = makeRevolutionSurface(circleResult.result!, Z_AXIS_3D);
      const surface = revResult.result!;

      const canonical = canonicalizeRevolutionSurface(surface);
      expect(canonical.type).toBe('torus');
      if (canonical.type === 'torus') {
        expect(canonical.majorRadius).toBeCloseTo(5, 6);
        expect(canonical.minorRadius).toBeCloseTo(1, 6);
      }
    });

    it('general curve remains RevolutionSurface', () => {
      // An arc that doesn't fit any special case — not centered on axis, not in meridional plane
      // Actually, let's use a line that's skew (not parallel, not intersecting axis)
      const lineResult = makeLine3D(point3d(3, 0, 0), point3d(4, 0, 5));
      const revResult = makeRevolutionSurface(lineResult.result!, Z_AXIS_3D);
      const surface = revResult.result!;

      const canonical = canonicalizeRevolutionSurface(surface);
      // A line at an angle that doesn't pass through the axis produces a hyperboloid
      // which doesn't simplify to any of our analytic types
      expect(canonical.type).toBe('revolution');
    });
  });
});
