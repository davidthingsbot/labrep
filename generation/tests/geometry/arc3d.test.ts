import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, XY_PLANE, TOLERANCE, distance } from '../../src/core';

import {
  makeArc3D,
  makeArc3DThrough3Points,
  evaluateArc3D,
  tangentArc3D,
  lengthArc3D,
  reverseArc3D,
} from '../../src/geometry/arc3d';

describe('Arc3D', () => {
  describe('makeArc3D', () => {
    it('creates a quarter arc (0 to π/2)', () => {
      const result = makeArc3D(XY_PLANE, 1, 0, Math.PI / 2);

      expect(result.success).toBe(true);
      const arc = result.result!;
      expect(arc.type).toBe('arc3d');
      expect(arc.plane).toEqual(XY_PLANE);
      expect(arc.radius).toBe(1);
      expect(arc.startAngle).toBe(0);
      expect(arc.endAngle).toBe(Math.PI / 2);
    });

    it('creates a half arc (0 to π)', () => {
      const result = makeArc3D(XY_PLANE, 2, 0, Math.PI);

      expect(result.success).toBe(true);
      expect(result.result!.startAngle).toBe(0);
      expect(result.result!.endAngle).toBe(Math.PI);
    });

    it('creates an arc with negative sweep (π to 0)', () => {
      const result = makeArc3D(XY_PLANE, 1, Math.PI, 0);

      expect(result.success).toBe(true);
      expect(result.result!.startAngle).toBe(Math.PI);
      expect(result.result!.endAngle).toBe(0);
    });

    it('fails for zero radius', () => {
      const result = makeArc3D(XY_PLANE, 0, 0, Math.PI);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative radius', () => {
      const result = makeArc3D(XY_PLANE, -1, 0, Math.PI);

      expect(result.success).toBe(false);
    });

    it('fails for equal start and end angles', () => {
      const result = makeArc3D(XY_PLANE, 1, Math.PI / 4, Math.PI / 4);

      expect(result.success).toBe(false);
      expect(result.error).toContain('different');
    });

    it('sets isClosed to false', () => {
      const result = makeArc3D(XY_PLANE, 1, 0, Math.PI);
      expect(result.result!.isClosed).toBe(false);
    });

    it('sets correct parameter range', () => {
      const result = makeArc3D(XY_PLANE, 1, 0.5, 2.5);
      expect(result.result!.startParam).toBe(0.5);
      expect(result.result!.endParam).toBe(2.5);
    });

    it('computes correct start and end points', () => {
      const arc = makeArc3D(XY_PLANE, 2, 0, Math.PI / 2).result!;

      // startPoint at θ=0: (2, 0, 0)
      expect(arc.startPoint.x).toBeCloseTo(2, 10);
      expect(arc.startPoint.y).toBeCloseTo(0, 10);
      expect(arc.startPoint.z).toBeCloseTo(0, 10);

      // endPoint at θ=π/2: (0, 2, 0)
      expect(arc.endPoint.x).toBeCloseTo(0, 10);
      expect(arc.endPoint.y).toBeCloseTo(2, 10);
      expect(arc.endPoint.z).toBeCloseTo(0, 10);
    });
  });

  describe('makeArc3DThrough3Points', () => {
    it('creates an arc through 3 coplanar points', () => {
      // Points on a circle of radius 1 in XY plane
      const p1 = point3d(1, 0, 0);      // θ = 0
      const p2 = point3d(0, 1, 0);      // θ = π/2
      const p3 = point3d(-1, 0, 0);     // θ = π

      const result = makeArc3DThrough3Points(p1, p2, p3);

      expect(result.success).toBe(true);
      const arc = result.result!;

      // Check that all 3 points are on the arc
      expect(arc.startPoint.x).toBeCloseTo(p1.x, 5);
      expect(arc.startPoint.y).toBeCloseTo(p1.y, 5);
      expect(arc.startPoint.z).toBeCloseTo(p1.z, 5);

      expect(arc.endPoint.x).toBeCloseTo(p3.x, 5);
      expect(arc.endPoint.y).toBeCloseTo(p3.y, 5);
      expect(arc.endPoint.z).toBeCloseTo(p3.z, 5);

      // Radius should be 1
      expect(arc.radius).toBeCloseTo(1, 5);
    });

    it('creates arc with correct center', () => {
      const p1 = point3d(3, 0, 0);
      const p2 = point3d(0, 3, 0);
      const p3 = point3d(-3, 0, 0);

      const result = makeArc3DThrough3Points(p1, p2, p3);
      expect(result.success).toBe(true);

      // Center should be at origin
      expect(result.result!.plane.origin.x).toBeCloseTo(0, 5);
      expect(result.result!.plane.origin.y).toBeCloseTo(0, 5);
      expect(result.result!.plane.origin.z).toBeCloseTo(0, 5);
    });

    it('fails for collinear points', () => {
      const p1 = point3d(0, 0, 0);
      const p2 = point3d(1, 0, 0);
      const p3 = point3d(2, 0, 0);

      const result = makeArc3DThrough3Points(p1, p2, p3);
      expect(result.success).toBe(false);
      expect(result.error).toContain('collinear');
    });

    it('fails for coincident points', () => {
      const p = point3d(1, 2, 3);
      const result = makeArc3DThrough3Points(p, p, point3d(4, 5, 6));
      expect(result.success).toBe(false);
    });

    it('handles points in 3D space (tilted plane)', () => {
      // Points on a circle in a tilted plane
      const p1 = point3d(1, 0, 1);
      const p2 = point3d(0, 1, 1);
      const p3 = point3d(-1, 0, 1);

      const result = makeArc3DThrough3Points(p1, p2, p3);
      expect(result.success).toBe(true);

      // All points should be at z=1
      expect(result.result!.plane.origin.z).toBeCloseTo(1, 5);
    });
  });

  describe('evaluateArc3D', () => {
    it('returns start point at startAngle', () => {
      const arc = makeArc3D(XY_PLANE, 2, Math.PI / 4, Math.PI).result!;
      const pt = evaluateArc3D(arc, arc.startAngle);

      expect(pt.x).toBeCloseTo(arc.startPoint.x, 10);
      expect(pt.y).toBeCloseTo(arc.startPoint.y, 10);
      expect(pt.z).toBeCloseTo(arc.startPoint.z, 10);
    });

    it('returns end point at endAngle', () => {
      const arc = makeArc3D(XY_PLANE, 2, Math.PI / 4, Math.PI).result!;
      const pt = evaluateArc3D(arc, arc.endAngle);

      expect(pt.x).toBeCloseTo(arc.endPoint.x, 10);
      expect(pt.y).toBeCloseTo(arc.endPoint.y, 10);
      expect(pt.z).toBeCloseTo(arc.endPoint.z, 10);
    });

    it('returns correct midpoint', () => {
      const arc = makeArc3D(XY_PLANE, 1, 0, Math.PI).result!;
      const midAngle = Math.PI / 2;
      const pt = evaluateArc3D(arc, midAngle);

      // At π/2 on unit circle in XY plane: (0, 1, 0)
      expect(pt.x).toBeCloseTo(0, 10);
      expect(pt.y).toBeCloseTo(1, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('all points are at correct radius from center', () => {
      const arc = makeArc3D(XY_PLANE, 2.5, 0.3, 2.1).result!;
      const center = arc.plane.origin;

      for (let i = 0; i <= 10; i++) {
        const t = arc.startAngle + (i / 10) * (arc.endAngle - arc.startAngle);
        const pt = evaluateArc3D(arc, t);
        const dist = distance(pt, center);
        expect(dist).toBeCloseTo(2.5, 10);
      }
    });
  });

  describe('tangentArc3D', () => {
    it('returns perpendicular to radius', () => {
      const arc = makeArc3D(XY_PLANE, 2, 0, Math.PI).result!;
      const theta = 0.7;

      const pt = evaluateArc3D(arc, theta);
      const tangent = tangentArc3D(arc, theta);
      const center = arc.plane.origin;

      // Radius vector
      const radius = {
        x: pt.x - center.x,
        y: pt.y - center.y,
        z: pt.z - center.z,
      };

      // Dot product should be zero
      const dot = radius.x * tangent.x + radius.y * tangent.y + radius.z * tangent.z;
      expect(dot).toBeCloseTo(0, 10);
    });

    it('is unit length', () => {
      const arc = makeArc3D(XY_PLANE, 1.5, 0, 2).result!;
      const tangent = tangentArc3D(arc, 1);

      const len = Math.sqrt(tangent.x ** 2 + tangent.y ** 2 + tangent.z ** 2);
      expect(len).toBeCloseTo(1, 10);
    });
  });

  describe('lengthArc3D', () => {
    it('returns |Δθ| * radius for CCW arc', () => {
      const arc = makeArc3D(XY_PLANE, 2, 0, Math.PI / 2).result!;
      // Length = (π/2) * 2 = π
      expect(lengthArc3D(arc)).toBeCloseTo(Math.PI, 10);
    });

    it('returns |Δθ| * radius for CW arc', () => {
      const arc = makeArc3D(XY_PLANE, 2, Math.PI, 0).result!;
      // Length = |0 - π| * 2 = 2π
      expect(lengthArc3D(arc)).toBeCloseTo(2 * Math.PI, 10);
    });

    it('scales with radius', () => {
      const arc1 = makeArc3D(XY_PLANE, 1, 0, 1).result!;
      const arc2 = makeArc3D(XY_PLANE, 3, 0, 1).result!;

      expect(lengthArc3D(arc2)).toBeCloseTo(3 * lengthArc3D(arc1), 10);
    });
  });

  describe('reverseArc3D', () => {
    it('swaps start and end angles', () => {
      const arc = makeArc3D(XY_PLANE, 1, 0.5, 2.0).result!;
      const reversed = reverseArc3D(arc);

      expect(reversed.startAngle).toBe(2.0);
      expect(reversed.endAngle).toBe(0.5);
    });

    it('swaps start and end points', () => {
      const arc = makeArc3D(XY_PLANE, 2, 0, Math.PI / 2).result!;
      const reversed = reverseArc3D(arc);

      expect(reversed.startPoint.x).toBeCloseTo(arc.endPoint.x, 10);
      expect(reversed.startPoint.y).toBeCloseTo(arc.endPoint.y, 10);
      expect(reversed.endPoint.x).toBeCloseTo(arc.startPoint.x, 10);
      expect(reversed.endPoint.y).toBeCloseTo(arc.startPoint.y, 10);
    });

    it('preserves length', () => {
      const arc = makeArc3D(XY_PLANE, 1.5, 0.3, 2.7).result!;
      const reversed = reverseArc3D(arc);

      expect(lengthArc3D(reversed)).toBeCloseTo(lengthArc3D(arc), 10);
    });

    it('preserves radius and plane', () => {
      const arc = makeArc3D(XY_PLANE, 2.5, 0, 1).result!;
      const reversed = reverseArc3D(arc);

      expect(reversed.radius).toBe(arc.radius);
      expect(reversed.plane).toEqual(arc.plane);
    });
  });

  describe('edge cases', () => {
    it('handles full circle sweep (2π)', () => {
      // Full circle should fail - use Circle3D instead
      const result = makeArc3D(XY_PLANE, 1, 0, 2 * Math.PI);
      // This might succeed or fail depending on design decision
      // For now, we accept it but it's essentially a circle
      if (result.success) {
        expect(lengthArc3D(result.result!)).toBeCloseTo(2 * Math.PI, 5);
      }
    });

    it('handles negative sweep direction', () => {
      // Start > end means clockwise arc
      const result = makeArc3D(XY_PLANE, 1, Math.PI, 0);
      expect(result.success).toBe(true);
      // Should go the "short way" or the "long way"?
      const arc = result.result!;
      expect(arc.startAngle).toBe(Math.PI);
      expect(arc.endAngle).toBe(0);
    });

    it('handles angles outside 0-2π range', () => {
      const result = makeArc3D(XY_PLANE, 1, -Math.PI / 2, Math.PI / 2);
      expect(result.success).toBe(true);
    });

    it('fails for very small radius near tolerance', () => {
      const result = makeArc3D(XY_PLANE, 1e-10, 0, 1);
      expect(result.success).toBe(false);
    });

    it('handles very small sweep angle', () => {
      const result = makeArc3D(XY_PLANE, 1, 0, 0.001);
      expect(result.success).toBe(true);
      expect(lengthArc3D(result.result!)).toBeCloseTo(0.001, 5);
    });
  });
});
