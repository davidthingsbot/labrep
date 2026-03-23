import { describe, it, expect } from 'vitest';
import { point3d, vec3d, axis, X_AXIS_3D, Y_AXIS_3D, Z_AXIS_3D, distance } from '../../src/core';

import {
  makeCylindricalSurface,
  evaluateCylindricalSurface,
  normalCylindricalSurface,
} from '../../src/surfaces/cylindrical-surface';

describe('CylindricalSurface', () => {
  describe('makeCylindricalSurface', () => {
    it('creates a cylinder along Z axis', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);

      expect(result.success).toBe(true);
      const surface = result.result!;
      expect(surface.type).toBe('cylinder');
      expect(surface.axis).toEqual(Z_AXIS_3D);
      expect(surface.radius).toBe(1);
    });

    it('creates a cylinder along Y axis', () => {
      const result = makeCylindricalSurface(Y_AXIS_3D, 2.5);

      expect(result.success).toBe(true);
      expect(result.result!.axis).toEqual(Y_AXIS_3D);
      expect(result.result!.radius).toBe(2.5);
    });

    it('creates a cylinder with offset axis', () => {
      const offsetAxis = axis(point3d(5, 5, 0), vec3d(0, 0, 1));
      const result = makeCylindricalSurface(offsetAxis, 1);

      expect(result.success).toBe(true);
      expect(result.result!.axis).toEqual(offsetAxis);
    });

    it('fails for zero radius', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative radius', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, -1);

      expect(result.success).toBe(false);
    });

    it('has a refDirection perpendicular to axis', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;

      // refDirection should be perpendicular to axis.direction
      const dot =
        surface.refDirection.x * surface.axis.direction.x +
        surface.refDirection.y * surface.axis.direction.y +
        surface.refDirection.z * surface.axis.direction.z;

      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('evaluateCylindricalSurface', () => {
    it('returns point at θ=0, v=0 along refDirection from axis origin', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 2);
      const surface = result.result!;
      const pt = evaluateCylindricalSurface(surface, 0, 0);

      // At θ=0: origin + radius * refDirection
      expect(pt.x).toBeCloseTo(surface.axis.origin.x + 2 * surface.refDirection.x, 10);
      expect(pt.y).toBeCloseTo(surface.axis.origin.y + 2 * surface.refDirection.y, 10);
      expect(pt.z).toBeCloseTo(surface.axis.origin.z, 10);
    });

    it('returns point offset along axis at v=5', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;
      const pt = evaluateCylindricalSurface(surface, 0, 5);

      // v=5 means 5 units along axis direction
      expect(pt.z).toBeCloseTo(5, 10);
    });

    it('returns point at θ=π/2 perpendicular to refDirection', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;

      const pt0 = evaluateCylindricalSurface(surface, 0, 0);
      const pt90 = evaluateCylindricalSurface(surface, Math.PI / 2, 0);

      // pt0 and pt90 should be perpendicular when viewed from axis
      // Both should be at radius distance from axis
      const dist0 = Math.sqrt(pt0.x ** 2 + pt0.y ** 2);
      const dist90 = Math.sqrt(pt90.x ** 2 + pt90.y ** 2);

      expect(dist0).toBeCloseTo(1, 10);
      expect(dist90).toBeCloseTo(1, 10);

      // Angle between them (in XY plane) should be 90°
      const dot = pt0.x * pt90.x + pt0.y * pt90.y;
      expect(dot).toBeCloseTo(0, 10);
    });

    it('all points are at correct radius from axis', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 2.5);
      const surface = result.result!;

      for (let i = 0; i < 8; i++) {
        const theta = (i / 8) * 2 * Math.PI;
        for (let v = -5; v <= 5; v += 2) {
          const pt = evaluateCylindricalSurface(surface, theta, v);

          // Distance from axis (in XY plane for Z-axis cylinder)
          const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
          expect(radialDist).toBeCloseTo(2.5, 10);
        }
      }
    });

    it('wraps around at θ=2π', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;

      const pt0 = evaluateCylindricalSurface(surface, 0, 0);
      const pt2pi = evaluateCylindricalSurface(surface, 2 * Math.PI, 0);

      expect(pt2pi.x).toBeCloseTo(pt0.x, 10);
      expect(pt2pi.y).toBeCloseTo(pt0.y, 10);
      expect(pt2pi.z).toBeCloseTo(pt0.z, 10);
    });

    it('works with offset axis', () => {
      const offsetAxis = axis(point3d(10, 10, 0), vec3d(0, 0, 1));
      const result = makeCylindricalSurface(offsetAxis, 1);
      const surface = result.result!;

      const pt = evaluateCylindricalSurface(surface, 0, 0);

      // Should be radius away from (10, 10, 0)
      const distFromAxis = Math.sqrt((pt.x - 10) ** 2 + (pt.y - 10) ** 2);
      expect(distFromAxis).toBeCloseTo(1, 10);
    });
  });

  describe('normalCylindricalSurface', () => {
    it('points radially outward', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;

      const pt = evaluateCylindricalSurface(surface, 0, 0);
      const normal = normalCylindricalSurface(surface, 0, 0);

      // Normal should point from axis toward pt (radially outward)
      // For Z-axis cylinder at θ=0, v=0: normal should be along refDirection
      expect(normal.x).toBeCloseTo(surface.refDirection.x, 10);
      expect(normal.y).toBeCloseTo(surface.refDirection.y, 10);
      expect(normal.z).toBeCloseTo(0, 10);
    });

    it('is unit length', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 2);
      const surface = result.result!;

      const normal = normalCylindricalSurface(surface, 1.3, 5);
      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);

      expect(len).toBeCloseTo(1, 10);
    });

    it('is perpendicular to axis direction', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;

      const normal = normalCylindricalSurface(surface, 0.7, 3);
      const axisDir = surface.axis.direction;

      const dot = normal.x * axisDir.x + normal.y * axisDir.y + normal.z * axisDir.z;
      expect(dot).toBeCloseTo(0, 10);
    });

    it('is constant along v (same θ)', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;

      const n1 = normalCylindricalSurface(surface, 0.5, 0);
      const n2 = normalCylindricalSurface(surface, 0.5, 10);
      const n3 = normalCylindricalSurface(surface, 0.5, -5);

      expect(n1).toEqual(n2);
      expect(n2).toEqual(n3);
    });

    it('rotates with θ', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1);
      const surface = result.result!;

      const n0 = normalCylindricalSurface(surface, 0, 0);
      const n90 = normalCylindricalSurface(surface, Math.PI / 2, 0);

      // Normals should be perpendicular (90° apart)
      const dot = n0.x * n90.x + n0.y * n90.y + n0.z * n90.z;
      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('edge cases', () => {
    it('fails for zero radius', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 0);
      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative radius', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, -1);
      expect(result.success).toBe(false);
    });

    it('fails for degenerate axis (zero direction)', () => {
      const badAxis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 0) };
      const result = makeCylindricalSurface(badAxis, 1);
      expect(result.success).toBe(false);
    });

    it('fails for very small radius near tolerance', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1e-10);
      expect(result.success).toBe(false);
    });

    it('handles very large radius', () => {
      const result = makeCylindricalSurface(Z_AXIS_3D, 1e6);
      expect(result.success).toBe(true);
    });

    it('normalizes non-unit axis direction', () => {
      const nonUnitAxis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 5) };
      const result = makeCylindricalSurface(nonUnitAxis, 1);
      expect(result.success).toBe(true);
      const dir = result.result!.axis.direction;
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      expect(len).toBeCloseTo(1, 10);
    });
  });
});
