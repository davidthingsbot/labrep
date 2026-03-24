import { describe, it, expect } from 'vitest';
import { point3d, vec3d, axis, Z_AXIS_3D } from '../../src/core';

import {
  makeToroidalSurface,
  evaluateToroidalSurface,
  normalToroidalSurface,
} from '../../src/surfaces/toroidal-surface';

describe('ToroidalSurface', () => {
  describe('makeToroidalSurface', () => {
    it('creates a torus along Z axis', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);

      expect(result.success).toBe(true);
      const surface = result.result!;
      expect(surface.type).toBe('torus');
      expect(surface.majorRadius).toBe(5);
      expect(surface.minorRadius).toBe(1);
    });

    it('fails for zero major radius', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 0, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative major radius', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, -1, 1);

      expect(result.success).toBe(false);
    });

    it('fails for zero minor radius', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative minor radius', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, -1);

      expect(result.success).toBe(false);
    });

    it('has a refDirection perpendicular to axis', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      const dot =
        surface.refDirection.x * surface.axis.direction.x +
        surface.refDirection.y * surface.axis.direction.y +
        surface.refDirection.z * surface.axis.direction.z;

      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('evaluateToroidalSurface', () => {
    it('returns outermost point at θ=0, φ=0', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;
      const pt = evaluateToroidalSurface(surface, 0, 0);

      // At θ=0, φ=0: point should be at (majorRadius + minorRadius) * refDirection
      const expectedDist = 5 + 1;
      const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);

      expect(radialDist).toBeCloseTo(expectedDist, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns innermost point at θ=0, φ=π', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;
      const pt = evaluateToroidalSurface(surface, 0, Math.PI);

      // At φ=π: point should be at (majorRadius - minorRadius) * refDirection
      const expectedDist = 5 - 1;
      const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);

      expect(radialDist).toBeCloseTo(expectedDist, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('returns top of tube at θ=0, φ=π/2', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;
      const pt = evaluateToroidalSurface(surface, 0, Math.PI / 2);

      // At φ=π/2: z = minorRadius, radial = majorRadius
      const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);

      expect(radialDist).toBeCloseTo(5, 10);
      expect(pt.z).toBeCloseTo(1, 10);
    });

    it('traces a circle in XY plane at φ=0 (varying θ)', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      for (let i = 0; i < 8; i++) {
        const theta = (i / 8) * 2 * Math.PI;
        const pt = evaluateToroidalSurface(surface, theta, 0);

        const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
        expect(radialDist).toBeCloseTo(6, 10); // majorRadius + minorRadius
        expect(pt.z).toBeCloseTo(0, 10);
      }
    });

    it('traces a tube cross-section at fixed θ (varying φ)', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 2);
      const surface = result.result!;

      // At θ=0, the tube center is at (5, 0, 0) in refDirection
      // All points should be at distance minorRadius from tube center
      const ref = surface.refDirection;
      const tubeCenterX = 5 * ref.x;
      const tubeCenterY = 5 * ref.y;
      const tubeCenterZ = 0;

      for (let i = 0; i < 8; i++) {
        const phi = (i / 8) * 2 * Math.PI;
        const pt = evaluateToroidalSurface(surface, 0, phi);

        const dist = Math.sqrt(
          (pt.x - tubeCenterX) ** 2 +
          (pt.y - tubeCenterY) ** 2 +
          (pt.z - tubeCenterZ) ** 2,
        );
        expect(dist).toBeCloseTo(2, 10);
      }
    });

    it('wraps around at θ=2π', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      const pt0 = evaluateToroidalSurface(surface, 0, 0.5);
      const pt2pi = evaluateToroidalSurface(surface, 2 * Math.PI, 0.5);

      expect(pt2pi.x).toBeCloseTo(pt0.x, 10);
      expect(pt2pi.y).toBeCloseTo(pt0.y, 10);
      expect(pt2pi.z).toBeCloseTo(pt0.z, 10);
    });

    it('wraps around at φ=2π', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      const pt0 = evaluateToroidalSurface(surface, 0.5, 0);
      const pt2pi = evaluateToroidalSurface(surface, 0.5, 2 * Math.PI);

      expect(pt2pi.x).toBeCloseTo(pt0.x, 10);
      expect(pt2pi.y).toBeCloseTo(pt0.y, 10);
      expect(pt2pi.z).toBeCloseTo(pt0.z, 10);
    });

    it('works with offset axis', () => {
      const offsetAxis = axis(point3d(10, 10, 0), vec3d(0, 0, 1));
      const result = makeToroidalSurface(offsetAxis, 5, 1);
      const surface = result.result!;

      const pt = evaluateToroidalSurface(surface, 0, 0);
      const distFromAxis = Math.sqrt((pt.x - 10) ** 2 + (pt.y - 10) ** 2);
      expect(distFromAxis).toBeCloseTo(6, 10);
    });
  });

  describe('normalToroidalSurface', () => {
    it('is unit length', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      const normal = normalToroidalSurface(surface, 1.3, 0.7);
      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);

      expect(len).toBeCloseTo(1, 10);
    });

    it('points radially outward from tube center at φ=0', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      const normal = normalToroidalSurface(surface, 0, 0);

      // At θ=0, φ=0: normal should point in refDirection (away from torus center)
      expect(normal.x).toBeCloseTo(surface.refDirection.x, 10);
      expect(normal.y).toBeCloseTo(surface.refDirection.y, 10);
      expect(normal.z).toBeCloseTo(0, 10);
    });

    it('points radially inward from tube center at φ=π', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      const normal = normalToroidalSurface(surface, 0, Math.PI);

      // At φ=π: normal should point in -refDirection (toward torus center)
      expect(normal.x).toBeCloseTo(-surface.refDirection.x, 10);
      expect(normal.y).toBeCloseTo(-surface.refDirection.y, 10);
      expect(normal.z).toBeCloseTo(0, 10);
    });

    it('points upward at φ=π/2', () => {
      const result = makeToroidalSurface(Z_AXIS_3D, 5, 1);
      const surface = result.result!;

      const normal = normalToroidalSurface(surface, 0, Math.PI / 2);

      // At φ=π/2: normal should point along axis direction (upward)
      expect(normal.x).toBeCloseTo(0, 10);
      expect(normal.y).toBeCloseTo(0, 10);
      expect(normal.z).toBeCloseTo(1, 10);
    });
  });

  describe('edge cases', () => {
    it('fails for degenerate axis', () => {
      const badAxis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 0) };
      const result = makeToroidalSurface(badAxis, 5, 1);
      expect(result.success).toBe(false);
    });

    it('normalizes non-unit axis direction', () => {
      const nonUnitAxis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 5) };
      const result = makeToroidalSurface(nonUnitAxis, 5, 1);
      expect(result.success).toBe(true);
      const dir = result.result!.axis.direction;
      const len = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
      expect(len).toBeCloseTo(1, 10);
    });
  });
});
