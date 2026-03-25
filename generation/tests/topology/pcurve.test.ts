import { describe, it, expect } from 'vitest';
import { point3d, vec3d, XY_PLANE, distance } from '../../src/core';
import {
  makePlaneSurface,
  evaluatePlaneSurface,
  makeSphericalSurface,
  evaluateSphericalSurface,
  makeCylindricalSurface,
  evaluateCylindricalSurface,
} from '../../src/surfaces';
import { makeLine2D, makeArc2D, evaluateLine2D, evaluateArc2D } from '../../src/geometry';
import type { Curve2D } from '../../src/geometry';
import { makePCurve, evaluatePCurve3D, computeIntersectionPCurves } from '../../src/topology/pcurve';
import type { Surface } from '../../src/topology/face';
import { Z_AXIS_3D } from '../../src/core';

describe('PCurve', () => {
  describe('makePCurve', () => {
    it('creates a PCurve from Line2D + PlaneSurface', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const line = makeLine2D({ x: 0, y: 0 }, { x: 1, y: 0 }).result!;
      const pcurve = makePCurve(line, surface);

      expect(pcurve.curve2d).toBe(line);
      expect(pcurve.surface).toBe(surface);
    });

    it('creates a PCurve from Arc2D + SphericalSurface', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      // Arc in (θ, φ) parameter space: along equator from θ=0 to θ=π/2
      const arc = makeArc2D({ x: 0, y: 0 }, 1, 0, Math.PI / 2).result!;
      const pcurve = makePCurve(arc, surface);

      expect(pcurve.curve2d).toBe(arc);
      expect(pcurve.surface).toBe(surface);
    });
  });

  describe('evaluatePCurve3D', () => {
    it('Line2D on PlaneSurface: PCurve(t) matches surface.evaluate(curve2d(t))', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const line = makeLine2D({ x: 0, y: 0 }, { x: 3, y: 4 }).result!;
      const pcurve = makePCurve(line, surface);

      // Sample 10 points along the parameter range
      for (let i = 0; i <= 10; i++) {
        const t = line.startParam + (i / 10) * (line.endParam - line.startParam);
        const pt3d = evaluatePCurve3D(pcurve, t);
        const uv = evaluateLine2D(line, t);
        const expected = evaluatePlaneSurface(surface, uv.x, uv.y);
        expect(distance(pt3d, expected)).toBeLessThan(1e-10);
      }
    });

    it('Line2D on CylindricalSurface: PCurve(t) matches evaluate(curve2d(t))', () => {
      const Z_AXIS = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
      const surface = makeCylindricalSurface(Z_AXIS, 2).result!;
      // Line in (θ, v) space: θ goes from 0 to π, v stays at 5
      const line = makeLine2D({ x: 0, y: 5 }, { x: Math.PI, y: 5 }).result!;
      const pcurve = makePCurve(line, surface);

      for (let i = 0; i <= 8; i++) {
        const t = line.startParam + (i / 8) * (line.endParam - line.startParam);
        const pt3d = evaluatePCurve3D(pcurve, t);
        const uv = evaluateLine2D(line, t);
        const expected = evaluateCylindricalSurface(surface, uv.x, uv.y);
        expect(distance(pt3d, expected)).toBeLessThan(1e-10);
      }
    });

    it('Line2D on SphericalSurface at equator: PCurve(t) matches evaluate(curve2d(t))', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 3).result!;
      // Line in (θ, φ) space: θ goes from -1 to 1, φ stays at 0 (equator)
      const line = makeLine2D({ x: -1, y: 0 }, { x: 1, y: 0 }).result!;
      const pcurve = makePCurve(line, surface);

      for (let i = 0; i <= 8; i++) {
        const t = line.startParam + (i / 8) * (line.endParam - line.startParam);
        const pt3d = evaluatePCurve3D(pcurve, t);
        const uv = evaluateLine2D(line, t);
        const expected = evaluateSphericalSurface(surface, uv.x, uv.y);
        expect(distance(pt3d, expected)).toBeLessThan(1e-10);
      }
    });

    it('Line2D on SphericalSurface at latitude π/4', () => {
      const surface = makeSphericalSurface(point3d(0, 0, 0), 2).result!;
      // Line in (θ, φ) space: θ goes from 0 to π, φ stays at π/4
      const line = makeLine2D({ x: 0, y: Math.PI / 4 }, { x: Math.PI, y: Math.PI / 4 }).result!;
      const pcurve = makePCurve(line, surface);

      for (let i = 0; i <= 8; i++) {
        const t = line.startParam + (i / 8) * (line.endParam - line.startParam);
        const pt3d = evaluatePCurve3D(pcurve, t);
        const uv = evaluateLine2D(line, t);
        const expected = evaluateSphericalSurface(surface, uv.x, uv.y);
        expect(distance(pt3d, expected)).toBeLessThan(1e-10);
      }
    });
  });

  describe('computeIntersectionPCurves', () => {
    it('plane z=0 intersects unit sphere → both PCurves produce same 3D points', () => {
      const sphereSurface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      const planeSurface = makePlaneSurface(XY_PLANE);
      const circle = { type: 'circle' as const, center: point3d(0, 0, 0), radius: 1, normal: vec3d(0, 0, 1) };

      const result = computeIntersectionPCurves(circle, planeSurface, sphereSurface);
      expect(result).not.toBeNull();

      // Both PCurves must produce points on the unit circle at z=0
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * 2 * Math.PI;

        const ptFromPlane = evaluatePCurve3D(result!.pcurveA, t);
        // Point should be on the equator (z=0, distance from origin = 1)
        expect(ptFromPlane.z).toBeCloseTo(0, 7);
        expect(Math.sqrt(ptFromPlane.x ** 2 + ptFromPlane.y ** 2)).toBeCloseTo(1, 7);

        const ptFromSphere = evaluatePCurve3D(result!.pcurveB, t);
        expect(ptFromSphere.z).toBeCloseTo(0, 7);
        expect(Math.sqrt(ptFromSphere.x ** 2 + ptFromSphere.y ** 2)).toBeCloseTo(1, 7);
      }
    });

    it('plane z=0.5 intersects unit sphere → both PCurves produce same 3D points at z=0.5', () => {
      const sphereSurface = makeSphericalSurface(point3d(0, 0, 0), 1).result!;
      const planeSurface = makePlaneSurface({
        origin: point3d(0, 0, 0.5),
        normal: vec3d(0, 0, 1),
        xAxis: vec3d(1, 0, 0),
      });
      const r = Math.sqrt(0.75);
      const circle = { type: 'circle' as const, center: point3d(0, 0, 0.5), radius: r, normal: vec3d(0, 0, 1) };

      const result = computeIntersectionPCurves(circle, planeSurface, sphereSurface);
      expect(result).not.toBeNull();

      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * 2 * Math.PI;

        const ptFromPlane = evaluatePCurve3D(result!.pcurveA, t);
        expect(ptFromPlane.z).toBeCloseTo(0.5, 7);
        expect(Math.sqrt(ptFromPlane.x ** 2 + ptFromPlane.y ** 2)).toBeCloseTo(r, 5);

        const ptFromSphere = evaluatePCurve3D(result!.pcurveB, t);
        expect(ptFromSphere.z).toBeCloseTo(0.5, 7);
        expect(Math.sqrt(ptFromSphere.x ** 2 + ptFromSphere.y ** 2)).toBeCloseTo(r, 5);
      }
    });

    it('plane z=h intersects cylinder r=R along Z → both PCurves produce points at z=h, radius=R', () => {
      const cylSurface = makeCylindricalSurface(Z_AXIS_3D, 2).result!;
      const h = 3;
      const planeSurface = makePlaneSurface({
        origin: point3d(0, 0, h),
        normal: vec3d(0, 0, 1),
        xAxis: vec3d(1, 0, 0),
      });
      const circle = { type: 'circle' as const, center: point3d(0, 0, h), radius: 2, normal: vec3d(0, 0, 1) };

      const result = computeIntersectionPCurves(circle, planeSurface, cylSurface);
      expect(result).not.toBeNull();

      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * 2 * Math.PI;

        const ptFromPlane = evaluatePCurve3D(result!.pcurveA, t);
        expect(ptFromPlane.z).toBeCloseTo(h, 7);
        expect(Math.sqrt(ptFromPlane.x ** 2 + ptFromPlane.y ** 2)).toBeCloseTo(2, 5);

        const ptFromCyl = evaluatePCurve3D(result!.pcurveB, t);
        expect(ptFromCyl.z).toBeCloseTo(h, 7);
        expect(Math.sqrt(ptFromCyl.x ** 2 + ptFromCyl.y ** 2)).toBeCloseTo(2, 5);
      }
    });
  });
});
