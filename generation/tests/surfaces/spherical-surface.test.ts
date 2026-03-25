import { describe, it, expect } from 'vitest';
import { point3d, vec3d, axis, Z_AXIS_3D, Y_AXIS_3D } from '../../src/core';

import {
  makeSphericalSurface,
  evaluateSphericalSurface,
  normalSphericalSurface,
  projectToSphericalSurface,
} from '../../src/surfaces/spherical-surface';

describe('SphericalSurface', () => {
  describe('makeSphericalSurface', () => {
    it('creates a unit sphere at origin', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 1);

      expect(result.success).toBe(true);
      const surface = result.result!;
      expect(surface.type).toBe('sphere');
      expect(surface.center).toEqual(point3d(0, 0, 0));
      expect(surface.radius).toBe(1);
    });

    it('creates a sphere at offset center', () => {
      const result = makeSphericalSurface(point3d(5, 3, -2), 2.5);

      expect(result.success).toBe(true);
      expect(result.result!.center).toEqual(point3d(5, 3, -2));
      expect(result.result!.radius).toBe(2.5);
    });

    it('creates a sphere with custom axis', () => {
      const customAxis = axis(point3d(0, 0, 0), vec3d(0, 1, 0));
      const result = makeSphericalSurface(point3d(0, 0, 0), 1, customAxis);

      expect(result.success).toBe(true);
      // Axis direction should be along Y
      const dir = result.result!.axis.direction;
      expect(dir.y).toBeCloseTo(1, 10);
    });

    it('fails for zero radius', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative radius', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), -1);

      expect(result.success).toBe(false);
    });

    it('has a refDirection perpendicular to axis', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 1);
      const surface = result.result!;

      const dot =
        surface.refDirection.x * surface.axis.direction.x +
        surface.refDirection.y * surface.axis.direction.y +
        surface.refDirection.z * surface.axis.direction.z;

      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('evaluateSphericalSurface', () => {
    it('returns point on equator at θ=0, φ=0', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 2);
      const surface = result.result!;
      const pt = evaluateSphericalSurface(surface, 0, 0);

      // At equator (φ=0), θ=0: should be at center + radius * refDirection
      expect(pt.x).toBeCloseTo(2 * surface.refDirection.x, 10);
      expect(pt.y).toBeCloseTo(2 * surface.refDirection.y, 10);
      expect(pt.z).toBeCloseTo(2 * surface.refDirection.z, 10);
    });

    it('returns north pole at φ=π/2', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 3);
      const surface = result.result!;
      const pt = evaluateSphericalSurface(surface, 0, Math.PI / 2);

      // North pole: center + radius * axis.direction
      const dir = surface.axis.direction;
      expect(pt.x).toBeCloseTo(3 * dir.x, 10);
      expect(pt.y).toBeCloseTo(3 * dir.y, 10);
      expect(pt.z).toBeCloseTo(3 * dir.z, 10);
    });

    it('returns south pole at φ=-π/2', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 3);
      const surface = result.result!;
      const pt = evaluateSphericalSurface(surface, 0, -Math.PI / 2);

      // South pole: center - radius * axis.direction
      const dir = surface.axis.direction;
      expect(pt.x).toBeCloseTo(-3 * dir.x, 10);
      expect(pt.y).toBeCloseTo(-3 * dir.y, 10);
      expect(pt.z).toBeCloseTo(-3 * dir.z, 10);
    });

    it('all points are at correct distance from center', () => {
      const center = point3d(1, 2, 3);
      const result = makeSphericalSurface(center, 5);
      const surface = result.result!;

      for (let i = 0; i < 8; i++) {
        const theta = (i / 8) * 2 * Math.PI;
        for (let j = -4; j <= 4; j++) {
          const phi = (j / 4) * (Math.PI / 2);
          const pt = evaluateSphericalSurface(surface, theta, phi);

          const dist = Math.sqrt(
            (pt.x - center.x) ** 2 +
            (pt.y - center.y) ** 2 +
            (pt.z - center.z) ** 2,
          );
          expect(dist).toBeCloseTo(5, 10);
        }
      }
    });

    it('wraps around at θ=2π', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 1);
      const surface = result.result!;

      const pt0 = evaluateSphericalSurface(surface, 0, 0.3);
      const pt2pi = evaluateSphericalSurface(surface, 2 * Math.PI, 0.3);

      expect(pt2pi.x).toBeCloseTo(pt0.x, 10);
      expect(pt2pi.y).toBeCloseTo(pt0.y, 10);
      expect(pt2pi.z).toBeCloseTo(pt0.z, 10);
    });

    it('works with offset center', () => {
      const center = point3d(10, 10, 10);
      const result = makeSphericalSurface(center, 1);
      const surface = result.result!;

      const pt = evaluateSphericalSurface(surface, 0, 0);

      const dist = Math.sqrt(
        (pt.x - center.x) ** 2 +
        (pt.y - center.y) ** 2 +
        (pt.z - center.z) ** 2,
      );
      expect(dist).toBeCloseTo(1, 10);
    });
  });

  describe('normalSphericalSurface', () => {
    it('points radially outward from center', () => {
      const center = point3d(0, 0, 0);
      const result = makeSphericalSurface(center, 2);
      const surface = result.result!;

      const theta = 0.5;
      const phi = 0.3;
      const pt = evaluateSphericalSurface(surface, theta, phi);
      const normal = normalSphericalSurface(surface, theta, phi);

      // Normal should be parallel to (pt - center), normalized
      const radial = vec3d(pt.x - center.x, pt.y - center.y, pt.z - center.z);
      const radialLen = Math.sqrt(radial.x ** 2 + radial.y ** 2 + radial.z ** 2);

      expect(normal.x).toBeCloseTo(radial.x / radialLen, 10);
      expect(normal.y).toBeCloseTo(radial.y / radialLen, 10);
      expect(normal.z).toBeCloseTo(radial.z / radialLen, 10);
    });

    it('is unit length', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 3);
      const surface = result.result!;

      const normal = normalSphericalSurface(surface, 1.3, 0.5);
      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);

      expect(len).toBeCloseTo(1, 10);
    });

    it('points along +axis at north pole', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 1);
      const surface = result.result!;

      const normal = normalSphericalSurface(surface, 0, Math.PI / 2);
      const dir = surface.axis.direction;

      expect(normal.x).toBeCloseTo(dir.x, 10);
      expect(normal.y).toBeCloseTo(dir.y, 10);
      expect(normal.z).toBeCloseTo(dir.z, 10);
    });

    it('points along -axis at south pole', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 1);
      const surface = result.result!;

      const normal = normalSphericalSurface(surface, 0, -Math.PI / 2);
      const dir = surface.axis.direction;

      expect(normal.x).toBeCloseTo(-dir.x, 10);
      expect(normal.y).toBeCloseTo(-dir.y, 10);
      expect(normal.z).toBeCloseTo(-dir.z, 10);
    });
  });

  describe('edge cases', () => {
    it('fails for very small radius near tolerance', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 1e-10);
      expect(result.success).toBe(false);
    });

    it('handles very large radius', () => {
      const result = makeSphericalSurface(point3d(0, 0, 0), 1e6);
      expect(result.success).toBe(true);
    });
  });

  describe('projectToSphericalSurface', () => {
    it('round-trips equator at θ=0 (θ=0, φ=0)', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      const pt = evaluateSphericalSurface(surface, 0, 0);
      const uv = projectToSphericalSurface(surface, pt);
      expect(uv.u).toBeCloseTo(0, 7);
      expect(uv.v).toBeCloseTo(0, 7);
    });

    it('round-trips equator at θ=π/2', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      const pt = evaluateSphericalSurface(surface, Math.PI / 2, 0);
      const uv = projectToSphericalSurface(surface, pt);
      expect(uv.u).toBeCloseTo(Math.PI / 2, 7);
      expect(uv.v).toBeCloseTo(0, 7);
    });

    it('round-trips 45° latitude', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      const pt = evaluateSphericalSurface(surface, 0, Math.PI / 4);
      const uv = projectToSphericalSurface(surface, pt);
      expect(uv.u).toBeCloseTo(0, 7);
      expect(uv.v).toBeCloseTo(Math.PI / 4, 7);
    });

    it('round-trips north pole (φ=π/2)', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      const pt = evaluateSphericalSurface(surface, 0, Math.PI / 2);
      const uv = projectToSphericalSurface(surface, pt);
      // At pole, θ is degenerate — only φ matters
      expect(uv.v).toBeCloseTo(Math.PI / 2, 7);
    });

    it('round-trips south pole (φ=-π/2)', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      const pt = evaluateSphericalSurface(surface, 0, -Math.PI / 2);
      const uv = projectToSphericalSurface(surface, pt);
      expect(uv.v).toBeCloseTo(-Math.PI / 2, 7);
    });

    it('round-trips negative longitude θ=-π/3', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 2).result!;
      const pt = evaluateSphericalSurface(surface, -Math.PI / 3, 0.3);
      const uv = projectToSphericalSurface(surface, pt);
      expect(uv.u).toBeCloseTo(-Math.PI / 3, 7);
      expect(uv.v).toBeCloseTo(0.3, 7);
    });

    it('round-trips on offset sphere', () => {
      const surface = makeSphericalSurface(point3d(10, 20, 30), 5).result!;
      const testParams = [[0, 0], [1.0, 0.5], [Math.PI, -0.3], [-0.5, 1.2]];
      for (const [theta, phi] of testParams) {
        const pt = evaluateSphericalSurface(surface, theta, phi);
        const uv = projectToSphericalSurface(surface, pt);
        expect(uv.u).toBeCloseTo(theta, 6);
        expect(uv.v).toBeCloseTo(phi, 6);
      }
    });

    it('round-trips 15 points across the sphere', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 3).result!;
      const params: [number, number][] = [
        [0, 0], [Math.PI/4, 0], [Math.PI/2, 0], [Math.PI, 0], [-Math.PI/2, 0],
        [0, Math.PI/4], [0, -Math.PI/4], [0, Math.PI/3], [0, -Math.PI/3],
        [1.0, 0.5], [-1.0, -0.5], [2.5, 1.0], [-2.5, -1.0],
        [0.1, 1.5], [-0.1, -1.5],
      ];
      for (const [theta, phi] of params) {
        const pt = evaluateSphericalSurface(surface, theta, phi);
        const uv = projectToSphericalSurface(surface, pt);
        // At high latitudes (near poles), θ can be noisy — only check φ there
        if (Math.abs(phi) < 1.5) {
          expect(uv.u).toBeCloseTo(theta, 5);
        }
        expect(uv.v).toBeCloseTo(phi, 5);
      }
    });
  });
});
