import { describe, it, expect } from 'vitest';
import { point3d, vec3d, axis, Z_AXIS_3D } from '../../src/core';

import {
  makeConicalSurface,
  evaluateConicalSurface,
  normalConicalSurface,
} from '../../src/surfaces/conical-surface';

describe('ConicalSurface', () => {
  describe('makeConicalSurface', () => {
    it('creates a cone along Z axis', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, Math.PI / 6);

      expect(result.success).toBe(true);
      const surface = result.result!;
      expect(surface.type).toBe('cone');
      expect(surface.radius).toBe(1);
      expect(surface.semiAngle).toBeCloseTo(Math.PI / 6, 10);
    });

    it('creates a cone with zero base radius (apex at origin)', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 0, Math.PI / 4);

      expect(result.success).toBe(true);
      expect(result.result!.radius).toBe(0);
    });

    it('fails for negative radius', () => {
      const result = makeConicalSurface(Z_AXIS_3D, -1, Math.PI / 4);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-negative');
    });

    it('fails for zero semi-angle', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('semi-angle');
    });

    it('fails for semi-angle >= π/2', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, Math.PI / 2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('semi-angle');
    });

    it('fails for negative semi-angle', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, -0.1);

      expect(result.success).toBe(false);
    });

    it('has a refDirection perpendicular to axis', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, Math.PI / 6);
      const surface = result.result!;

      const dot =
        surface.refDirection.x * surface.axis.direction.x +
        surface.refDirection.y * surface.axis.direction.y +
        surface.refDirection.z * surface.axis.direction.z;

      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('evaluateConicalSurface', () => {
    it('returns point on base circle at v=0, θ=0', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 2, Math.PI / 4);
      const surface = result.result!;
      const pt = evaluateConicalSurface(surface, 0, 0);

      // At v=0: should be at origin + radius * refDirection
      expect(pt.x).toBeCloseTo(2 * surface.refDirection.x, 10);
      expect(pt.y).toBeCloseTo(2 * surface.refDirection.y, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('radius increases with positive v', () => {
      const semiAngle = Math.PI / 4; // 45 degrees
      const result = makeConicalSurface(Z_AXIS_3D, 1, semiAngle);
      const surface = result.result!;

      const pt = evaluateConicalSurface(surface, 0, 2);
      // At v=2: radius = 1 + 2*sin(π/4) = 1 + √2
      // z = 2*cos(π/4) = √2
      const expectedRadius = 1 + 2 * Math.sin(semiAngle);
      const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);

      expect(radialDist).toBeCloseTo(expectedRadius, 10);
      expect(pt.z).toBeCloseTo(2 * Math.cos(semiAngle), 10);
    });

    it('reaches apex at negative v for zero-origin-radius cone', () => {
      const semiAngle = Math.PI / 6; // 30 degrees
      const result = makeConicalSurface(Z_AXIS_3D, 0, semiAngle);
      const surface = result.result!;

      // When radius=0, apex is at v=0
      const pt = evaluateConicalSurface(surface, 0, 0);
      expect(pt.x).toBeCloseTo(0, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('all points at same v are at same distance from axis', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, Math.PI / 6);
      const surface = result.result!;

      const v = 3;
      const expectedRadius = 1 + v * Math.sin(Math.PI / 6);

      for (let i = 0; i < 8; i++) {
        const theta = (i / 8) * 2 * Math.PI;
        const pt = evaluateConicalSurface(surface, theta, v);

        const radialDist = Math.sqrt(pt.x ** 2 + pt.y ** 2);
        expect(radialDist).toBeCloseTo(expectedRadius, 10);
      }
    });

    it('wraps around at θ=2π', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, Math.PI / 6);
      const surface = result.result!;

      const pt0 = evaluateConicalSurface(surface, 0, 1);
      const pt2pi = evaluateConicalSurface(surface, 2 * Math.PI, 1);

      expect(pt2pi.x).toBeCloseTo(pt0.x, 10);
      expect(pt2pi.y).toBeCloseTo(pt0.y, 10);
      expect(pt2pi.z).toBeCloseTo(pt0.z, 10);
    });

    it('works with offset axis', () => {
      const offsetAxis = axis(point3d(5, 5, 0), vec3d(0, 0, 1));
      const result = makeConicalSurface(offsetAxis, 1, Math.PI / 4);
      const surface = result.result!;

      const pt = evaluateConicalSurface(surface, 0, 0);
      const distFromAxis = Math.sqrt((pt.x - 5) ** 2 + (pt.y - 5) ** 2);
      expect(distFromAxis).toBeCloseTo(1, 10);
    });
  });

  describe('normalConicalSurface', () => {
    it('is unit length', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, Math.PI / 6);
      const surface = result.result!;

      const normal = normalConicalSurface(surface, 1.3, 2);
      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);

      expect(len).toBeCloseTo(1, 10);
    });

    it('is perpendicular to the surface', () => {
      // The normal should be perpendicular to both dS/dθ and dS/dv
      const semiAngle = Math.PI / 6;
      const result = makeConicalSurface(Z_AXIS_3D, 1, semiAngle);
      const surface = result.result!;

      const theta = 0.7;
      const v = 2;
      const normal = normalConicalSurface(surface, theta, v);

      // dS/dv direction: cos(α)*axisDir + sin(α)*(cosθ*ref + sinθ*perp)
      // Normal should be perpendicular to this generatrix direction
      const cosA = Math.cos(semiAngle);
      const sinA = Math.sin(semiAngle);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const ref = surface.refDirection;
      const axDir = surface.axis.direction;
      const perp = {
        x: axDir.y * ref.z - axDir.z * ref.y,
        y: axDir.z * ref.x - axDir.x * ref.z,
        z: axDir.x * ref.y - axDir.y * ref.x,
      };

      const genX = cosA * axDir.x + sinA * (cosT * ref.x + sinT * perp.x);
      const genY = cosA * axDir.y + sinA * (cosT * ref.y + sinT * perp.y);
      const genZ = cosA * axDir.z + sinA * (cosT * ref.z + sinT * perp.z);

      const dot = normal.x * genX + normal.y * genY + normal.z * genZ;
      expect(dot).toBeCloseTo(0, 10);
    });

    it('has an outward component in the radial direction', () => {
      const result = makeConicalSurface(Z_AXIS_3D, 1, Math.PI / 6);
      const surface = result.result!;

      const normal = normalConicalSurface(surface, 0, 1);
      const pt = evaluateConicalSurface(surface, 0, 1);

      // Radial direction from axis to point
      const radialX = pt.x;
      const radialY = pt.y;
      const radialLen = Math.sqrt(radialX ** 2 + radialY ** 2);

      // Dot with radial should be positive (outward)
      const radialDot = (normal.x * radialX + normal.y * radialY) / radialLen;
      expect(radialDot).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('fails for degenerate axis (zero direction)', () => {
      const badAxis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 0) };
      const result = makeConicalSurface(badAxis, 1, Math.PI / 4);
      expect(result.success).toBe(false);
    });

    it('normalizes non-unit axis direction', () => {
      const nonUnitAxis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 5) };
      const result = makeConicalSurface(nonUnitAxis, 1, Math.PI / 4);
      expect(result.success).toBe(true);
      const dir = result.result!.axis.direction;
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      expect(len).toBeCloseTo(1, 10);
    });
  });
});
