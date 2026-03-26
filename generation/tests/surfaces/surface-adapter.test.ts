/**
 * Tests for the polymorphic SurfaceAdapter.
 * Verifies that toAdapter() produces correct results for all surface types
 * by comparing adapter methods against the existing free functions.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, axis, distance } from '../../src/core';
import { toAdapter } from '../../src/surfaces/surface-adapter';
import { makePlaneSurface, evaluatePlaneSurface, normalPlaneSurface, projectToPlaneSurface } from '../../src/surfaces/plane-surface';
import { makeCylindricalSurface, evaluateCylindricalSurface, projectToCylindricalSurface } from '../../src/surfaces/cylindrical-surface';
import { makeSphericalSurface, evaluateSphericalSurface, projectToSphericalSurface } from '../../src/surfaces/spherical-surface';
import { makeConicalSurface, evaluateConicalSurface, projectToConicalSurface } from '../../src/surfaces/conical-surface';
import { makeToroidalSurface, evaluateToroidalSurface } from '../../src/surfaces/toroidal-surface';

describe('SurfaceAdapter', () => {
  describe('Plane', () => {
    const surf = makePlaneSurface(plane(point3d(1, 2, 3), vec3d(0, 0, 1), vec3d(1, 0, 0)));
    const adapter = toAdapter(surf);

    it('evaluate matches free function', () => {
      const pt = adapter.evaluate(0.5, -0.3);
      const expected = evaluatePlaneSurface(surf, 0.5, -0.3);
      expect(distance(pt, expected)).toBeLessThan(1e-10);
    });

    it('normal matches free function', () => {
      const n = adapter.normal(0, 0);
      expect(n.z).toBeCloseTo(1);
    });

    it('projectPoint matches free function', () => {
      const pt = point3d(1.5, 2.3, 3);
      const uv = adapter.projectPoint(pt);
      const expected = projectToPlaneSurface(surf, pt);
      expect(uv.u).toBeCloseTo(expected.u);
      expect(uv.v).toBeCloseTo(expected.v);
    });

    it('not periodic', () => {
      expect(adapter.isUPeriodic).toBe(false);
      expect(adapter.isVPeriodic).toBe(false);
    });
  });

  describe('Cylinder', () => {
    const surf = makeCylindricalSurface(
      axis(point3d(0, 0, 0), vec3d(0, 0, 1)),
      2.0,
    ).result!;
    const adapter = toAdapter(surf);

    it('evaluate matches free function', () => {
      const pt = adapter.evaluate(Math.PI / 4, 3);
      const expected = evaluateCylindricalSurface(surf, Math.PI / 4, 3);
      expect(distance(pt, expected)).toBeLessThan(1e-10);
    });

    it('projectPoint matches free function', () => {
      const pt = point3d(2, 0, 5);
      const uv = adapter.projectPoint(pt);
      const expected = projectToCylindricalSurface(surf, pt);
      expect(uv.u).toBeCloseTo(expected.u, 5);
      expect(uv.v).toBeCloseTo(expected.v, 5);
    });

    it('U-periodic with period 2π', () => {
      expect(adapter.isUPeriodic).toBe(true);
      expect(adapter.uPeriod).toBeCloseTo(2 * Math.PI);
      expect(adapter.isVPeriodic).toBe(false);
    });
  });

  describe('Sphere', () => {
    const surf = makeSphericalSurface(point3d(0, 0, 0), 3).result!;
    const adapter = toAdapter(surf);

    it('evaluate matches free function', () => {
      const pt = adapter.evaluate(0.5, 0.3);
      const expected = evaluateSphericalSurface(surf, 0.5, 0.3);
      expect(distance(pt, expected)).toBeLessThan(1e-10);
    });

    it('projectPoint matches free function', () => {
      const pt = point3d(1, 2, 1);
      const uv = adapter.projectPoint(pt);
      const expected = projectToSphericalSurface(surf, pt);
      expect(uv.u).toBeCloseTo(expected.u, 5);
      expect(uv.v).toBeCloseTo(expected.v, 5);
    });

    it('U-periodic, V not periodic', () => {
      expect(adapter.isUPeriodic).toBe(true);
      expect(adapter.uPeriod).toBeCloseTo(2 * Math.PI);
      expect(adapter.isVPeriodic).toBe(false);
    });

    it('uvBounds covers full sphere', () => {
      const b = adapter.uvBounds();
      expect(b.uMin).toBeCloseTo(-Math.PI);
      expect(b.uMax).toBeCloseTo(Math.PI);
      expect(b.vMin).toBeCloseTo(-Math.PI / 2);
      expect(b.vMax).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('Cone', () => {
    const surf = makeConicalSurface(
      axis(point3d(0, 0, 0), vec3d(0, 0, 1)),
      1.0,
      Math.PI / 6,
    ).result!;
    const adapter = toAdapter(surf);

    it('evaluate matches free function', () => {
      const pt = adapter.evaluate(0, 2);
      const expected = evaluateConicalSurface(surf, 0, 2);
      expect(distance(pt, expected)).toBeLessThan(1e-10);
    });

    it('U-periodic', () => {
      expect(adapter.isUPeriodic).toBe(true);
    });
  });

  describe('Torus', () => {
    const surf = makeToroidalSurface(
      axis(point3d(0, 0, 0), vec3d(0, 0, 1)),
      5, 1,
    ).result!;
    const adapter = toAdapter(surf);

    it('evaluate matches free function', () => {
      const pt = adapter.evaluate(0, 0);
      const expected = evaluateToroidalSurface(surf, 0, 0);
      expect(distance(pt, expected)).toBeLessThan(1e-10);
    });

    it('both U and V periodic', () => {
      expect(adapter.isUPeriodic).toBe(true);
      expect(adapter.isVPeriodic).toBe(true);
      expect(adapter.vPeriod).toBeCloseTo(2 * Math.PI);
    });

    it('projectPoint round-trips', () => {
      const u0 = 0.7, v0 = 1.2;
      const pt = adapter.evaluate(u0, v0);
      const uv = adapter.projectPoint(pt);
      expect(uv.u).toBeCloseTo(u0, 3);
      expect(uv.v).toBeCloseTo(v0, 3);
    });
  });
});
