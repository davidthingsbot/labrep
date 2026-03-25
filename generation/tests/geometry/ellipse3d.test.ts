import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, dot, cross, normalize, distance } from '../../src/core';
import { makeEllipse3D, evaluateEllipse3D, tangentEllipse3D, lengthEllipse3D } from '../../src/geometry/ellipse3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, edgeLength } from '../../src/topology/edge';

describe('Ellipse3D', () => {
  const xyPlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));

  describe('construction', () => {
    it('creates an ellipse with a=3, b=2', () => {
      const result = makeEllipse3D(xyPlane, 3, 2);
      expect(result.success).toBe(true);
      expect(result.result!.type).toBe('ellipse3d');
      expect(result.result!.majorRadius).toBe(3);
      expect(result.result!.minorRadius).toBe(2);
      expect(result.result!.isClosed).toBe(true);
      expect(result.result!.startParam).toBe(0);
      expect(result.result!.endParam).toBeCloseTo(2 * Math.PI);
    });

    it('fails with a=0 (degenerate)', () => {
      const result = makeEllipse3D(xyPlane, 0, 2);
      expect(result.success).toBe(false);
    });

    it('fails with b=0 (degenerate)', () => {
      const result = makeEllipse3D(xyPlane, 3, 0);
      expect(result.success).toBe(false);
    });

    it('fails with negative radii', () => {
      expect(makeEllipse3D(xyPlane, -1, 2).success).toBe(false);
      expect(makeEllipse3D(xyPlane, 3, -1).success).toBe(false);
    });

    it('a=b creates circle-equivalent', () => {
      const ellipse = makeEllipse3D(xyPlane, 5, 5).result!;
      // Evaluate at several points and verify against circle formula
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * 2 * Math.PI;
        const p = evaluateEllipse3D(ellipse, t);
        const d = Math.sqrt(p.x * p.x + p.y * p.y);
        expect(d).toBeCloseTo(5, 10);
      }
    });

    it('startPoint = endPoint (closed)', () => {
      const e = makeEllipse3D(xyPlane, 3, 2).result!;
      expect(distance(e.startPoint, e.endPoint)).toBeLessThan(1e-10);
    });
  });

  describe('evaluation', () => {
    const ellipse = makeEllipse3D(xyPlane, 3, 2).result!;

    it('t=0 → center + a*majorAxis', () => {
      const p = evaluateEllipse3D(ellipse, 0);
      expect(p.x).toBeCloseTo(3, 10);
      expect(p.y).toBeCloseTo(0, 10);
      expect(p.z).toBeCloseTo(0, 10);
    });

    it('t=π/2 → center + b*minorAxis', () => {
      const p = evaluateEllipse3D(ellipse, Math.PI / 2);
      expect(p.x).toBeCloseTo(0, 10);
      expect(p.y).toBeCloseTo(2, 10);
      expect(p.z).toBeCloseTo(0, 10);
    });

    it('t=π → center − a*majorAxis', () => {
      const p = evaluateEllipse3D(ellipse, Math.PI);
      expect(p.x).toBeCloseTo(-3, 10);
      expect(p.y).toBeCloseTo(0, 10);
      expect(p.z).toBeCloseTo(0, 10);
    });

    it('t=3π/2 → center − b*minorAxis', () => {
      const p = evaluateEllipse3D(ellipse, 3 * Math.PI / 2);
      expect(p.x).toBeCloseTo(0, 10);
      expect(p.y).toBeCloseTo(-2, 10);
      expect(p.z).toBeCloseTo(0, 10);
    });

    it('all 16 sample points lie in the ellipse plane', () => {
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * 2 * Math.PI;
        const p = evaluateEllipse3D(ellipse, t);
        // Point relative to plane origin, dot with normal should be 0
        const rel = vec3d(p.x - xyPlane.origin.x, p.y - xyPlane.origin.y, p.z - xyPlane.origin.z);
        expect(dot(rel, xyPlane.normal)).toBeCloseTo(0, 10);
      }
    });

    it('all 16 sample points satisfy x²/a² + y²/b² = 1', () => {
      const a = 3, b = 2;
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * 2 * Math.PI;
        const p = evaluateEllipse3D(ellipse, t);
        const lx = p.x - xyPlane.origin.x;
        const ly = p.y - xyPlane.origin.y;
        expect((lx * lx) / (a * a) + (ly * ly) / (b * b)).toBeCloseTo(1, 10);
      }
    });

    it('offset center ellipse evaluates correctly', () => {
      const offsetPlane = plane(point3d(5, 3, 1), vec3d(0, 0, 1), vec3d(1, 0, 0));
      const e = makeEllipse3D(offsetPlane, 4, 2).result!;
      const p = evaluateEllipse3D(e, 0);
      expect(p.x).toBeCloseTo(9, 10); // 5 + 4
      expect(p.y).toBeCloseTo(3, 10);
      expect(p.z).toBeCloseTo(1, 10);
    });
  });

  describe('tangent', () => {
    const ellipse = makeEllipse3D(xyPlane, 3, 2).result!;

    it('tangent at t=0 points in +y direction with magnitude b', () => {
      const t = tangentEllipse3D(ellipse, 0);
      // d/dt(a*cos(t), b*sin(t)) = (-a*sin(t), b*cos(t)) → at t=0: (0, b, 0)
      expect(t.x).toBeCloseTo(0, 10);
      expect(t.y).toBeCloseTo(2, 10); // b
      expect(t.z).toBeCloseTo(0, 10);
    });

    it('tangent at t=π/2 points in -x direction with magnitude a', () => {
      const t = tangentEllipse3D(ellipse, Math.PI / 2);
      // at t=π/2: (-a*sin(π/2), b*cos(π/2)) = (-a, 0, 0)
      expect(t.x).toBeCloseTo(-3, 10); // -a
      expect(t.y).toBeCloseTo(0, 10);
      expect(t.z).toBeCloseTo(0, 10);
    });

    it('tangent magnitude varies: |tangent(0)| = b, |tangent(π/2)| = a', () => {
      const t0 = tangentEllipse3D(ellipse, 0);
      const tHalf = tangentEllipse3D(ellipse, Math.PI / 2);
      expect(Math.sqrt(t0.x ** 2 + t0.y ** 2 + t0.z ** 2)).toBeCloseTo(2, 10);
      expect(Math.sqrt(tHalf.x ** 2 + tHalf.y ** 2 + tHalf.z ** 2)).toBeCloseTo(3, 10);
    });
  });

  describe('length', () => {
    it('a=b=r → length = 2πr (circle)', () => {
      const e = makeEllipse3D(xyPlane, 5, 5).result!;
      expect(lengthEllipse3D(e)).toBeCloseTo(2 * Math.PI * 5, 3);
    });

    it('a=3, b=2 → length ≈ Ramanujan approximation', () => {
      const e = makeEllipse3D(xyPlane, 3, 2).result!;
      const a = 3, b = 2;
      const ramanujan = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      expect(lengthEllipse3D(e)).toBeCloseTo(ramanujan, 1);
    });
  });

  describe('non-axis-aligned', () => {
    it('ellipse in tilted plane evaluates correctly', () => {
      // Plane tilted 45° around X axis
      const n = normalize(vec3d(0, 1, 1));
      const xAxis = vec3d(1, 0, 0);
      const tiltedPlane = plane(point3d(0, 0, 0), n, xAxis);
      const e = makeEllipse3D(tiltedPlane, 4, 2).result!;

      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * 2 * Math.PI;
        const p = evaluateEllipse3D(e, t);
        // All points lie in the tilted plane
        const rel = vec3d(p.x, p.y, p.z);
        expect(dot(rel, n)).toBeCloseTo(0, 8);
      }
    });

    it('tilted ellipse satisfies ellipse equation in local coords', () => {
      const n = normalize(vec3d(0, 1, 1));
      const xAxis = vec3d(1, 0, 0);
      const tiltedPlane = plane(point3d(0, 0, 0), n, xAxis);
      const a = 4, b = 2;
      const e = makeEllipse3D(tiltedPlane, a, b).result!;
      const yAxis = normalize(cross(n, xAxis));

      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * 2 * Math.PI;
        const p = evaluateEllipse3D(e, t);
        // Project to local coords
        const lx = dot(vec3d(p.x, p.y, p.z), xAxis);
        const ly = dot(vec3d(p.x, p.y, p.z), yAxis);
        expect((lx * lx) / (a * a) + (ly * ly) / (b * b)).toBeCloseTo(1, 8);
      }
    });
  });

  describe('edge integration', () => {
    it('makeEdgeFromCurve(ellipse) succeeds', () => {
      const e = makeEllipse3D(xyPlane, 3, 2).result!;
      const edge = makeEdgeFromCurve(e);
      expect(edge.success).toBe(true);
    });

    it('edge startPoint = endPoint (closed)', () => {
      const e = makeEllipse3D(xyPlane, 3, 2).result!;
      const edge = makeEdgeFromCurve(e).result!;
      expect(distance(edgeStartPoint(edge), edgeEndPoint(edge))).toBeLessThan(1e-10);
    });

    it('edge length matches ellipse length', () => {
      const e = makeEllipse3D(xyPlane, 3, 2).result!;
      const edge = makeEdgeFromCurve(e).result!;
      expect(edgeLength(edge)).toBeCloseTo(lengthEllipse3D(e), 1);
    });
  });
});
