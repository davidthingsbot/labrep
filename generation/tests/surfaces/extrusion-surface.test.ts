import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  XY_PLANE,
  distance,
  length,
  cross,
  normalize,
} from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import {
  makeExtrusionSurface,
  evaluateExtrusionSurface,
  normalExtrusionSurface,
  derivativesExtrusionSurface,
  getCanonicalSurfaceType,
  canonicalizeExtrusionSurface,
} from '../../src/surfaces/extrusion-surface';

describe('ExtrusionSurface', () => {
  describe('makeExtrusionSurface', () => {
    it('creates extrusion surface from line and direction', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      expect(lineResult.success).toBe(true);

      const result = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      expect(result.success).toBe(true);
      expect(result.result!.type).toBe('extrusion');
      expect(result.result!.basisCurve).toBe(lineResult.result!);
    });

    it('normalizes the direction vector', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const result = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 5));

      expect(result.success).toBe(true);
      const dir = result.result!.direction;
      const len = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
      expect(len).toBeCloseTo(1, 10);
    });

    it('fails for zero direction', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const result = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 0));

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-zero');
    });

    it('creates extrusion surface from circle', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      expect(circleResult.success).toBe(true);

      const result = makeExtrusionSurface(circleResult.result!, vec3d(0, 0, 1));
      expect(result.success).toBe(true);
      expect(result.result!.basisCurve.type).toBe('circle3d');
    });

    it('creates extrusion surface from arc', () => {
      const arcResult = makeArc3D(XY_PLANE, 5, 0, Math.PI / 2);
      expect(arcResult.success).toBe(true);

      const result = makeExtrusionSurface(arcResult.result!, vec3d(0, 0, 1));
      expect(result.success).toBe(true);
      expect(result.result!.basisCurve.type).toBe('arc3d');
    });
  });

  describe('evaluateExtrusionSurface', () => {
    it('returns curve point at v=0', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      // At u=5 (middle of line), v=0
      const pt = evaluateExtrusionSurface(surface, 5, 0);
      expect(pt.x).toBeCloseTo(5, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(0, 10);
    });

    it('translates along direction with v', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      // At u=5, v=7
      const pt = evaluateExtrusionSurface(surface, 5, 7);
      expect(pt.x).toBeCloseTo(5, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(7, 10);
    });

    it('evaluates correctly at various points', () => {
      const lineResult = makeLine3D(point3d(1, 2, 3), point3d(11, 2, 3));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 1, 0));
      const surface = surfResult.result!;

      // Origin of line is (1,2,3), direction is (1,0,0)
      // At u=0 (start of line): (1,2,3)
      const pt0 = evaluateExtrusionSurface(surface, 0, 0);
      expect(pt0.x).toBeCloseTo(1, 10);
      expect(pt0.y).toBeCloseTo(2, 10);
      expect(pt0.z).toBeCloseTo(3, 10);

      // At u=10 (end of line): (11,2,3)
      const pt1 = evaluateExtrusionSurface(surface, 10, 0);
      expect(pt1.x).toBeCloseTo(11, 10);
      expect(pt1.y).toBeCloseTo(2, 10);
      expect(pt1.z).toBeCloseTo(3, 10);

      // At u=5, v=4: (6, 2+4, 3) = (6, 6, 3)
      const pt2 = evaluateExtrusionSurface(surface, 5, 4);
      expect(pt2.x).toBeCloseTo(6, 10);
      expect(pt2.y).toBeCloseTo(6, 10);
      expect(pt2.z).toBeCloseTo(3, 10);
    });

    it('handles negative v values', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const pt = evaluateExtrusionSurface(surface, 5, -3);
      expect(pt.x).toBeCloseTo(5, 10);
      expect(pt.y).toBeCloseTo(0, 10);
      expect(pt.z).toBeCloseTo(-3, 10);
    });

    it('evaluates circle extrusion correctly', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      const surfResult = makeExtrusionSurface(circleResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      // At theta=0, v=0: (5, 0, 0)
      const pt0 = evaluateExtrusionSurface(surface, 0, 0);
      expect(pt0.x).toBeCloseTo(5, 10);
      expect(pt0.y).toBeCloseTo(0, 10);
      expect(pt0.z).toBeCloseTo(0, 10);

      // At theta=0, v=10: (5, 0, 10)
      const pt1 = evaluateExtrusionSurface(surface, 0, 10);
      expect(pt1.x).toBeCloseTo(5, 10);
      expect(pt1.y).toBeCloseTo(0, 10);
      expect(pt1.z).toBeCloseTo(10, 10);

      // At theta=PI/2, v=5: (0, 5, 5)
      const pt2 = evaluateExtrusionSurface(surface, Math.PI / 2, 5);
      expect(pt2.x).toBeCloseTo(0, 10);
      expect(pt2.y).toBeCloseTo(5, 10);
      expect(pt2.z).toBeCloseTo(5, 10);
    });
  });

  describe('normalExtrusionSurface', () => {
    it('returns unit normal', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const normal = normalExtrusionSurface(surface, 5, 3);
      const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
      expect(len).toBeCloseTo(1, 10);
    });

    it('computes correct normal for line extruded along Z', () => {
      // Line along X, extruded along Z → normal should be ±Y
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const normal = normalExtrusionSurface(surface, 5, 0);
      // tangent is (1,0,0), direction is (0,0,1)
      // normal = tangent × direction = (1,0,0) × (0,0,1) = (0,-1,0)
      expect(normal.x).toBeCloseTo(0, 10);
      expect(Math.abs(normal.y)).toBeCloseTo(1, 10);
      expect(normal.z).toBeCloseTo(0, 10);
    });

    it('normal is constant along v for same u', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const n1 = normalExtrusionSurface(surface, 5, 0);
      const n2 = normalExtrusionSurface(surface, 5, 10);
      const n3 = normalExtrusionSurface(surface, 5, -5);

      expect(n1.x).toBeCloseTo(n2.x, 10);
      expect(n1.y).toBeCloseTo(n2.y, 10);
      expect(n1.z).toBeCloseTo(n2.z, 10);

      expect(n1.x).toBeCloseTo(n3.x, 10);
      expect(n1.y).toBeCloseTo(n3.y, 10);
      expect(n1.z).toBeCloseTo(n3.z, 10);
    });

    it('normal varies with u for circle extrusion', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      const surfResult = makeExtrusionSurface(circleResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const n0 = normalExtrusionSurface(surface, 0, 0);
      const n90 = normalExtrusionSurface(surface, Math.PI / 2, 0);

      // Normals should be different (perpendicular for 90° apart)
      const dot = n0.x * n90.x + n0.y * n90.y + n0.z * n90.z;
      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('derivativesExtrusionSurface', () => {
    it('returns tangent for dU', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const derivs = derivativesExtrusionSurface(surface, 5, 3);

      // Line tangent is (1, 0, 0)
      expect(derivs.dU.x).toBeCloseTo(1, 10);
      expect(derivs.dU.y).toBeCloseTo(0, 10);
      expect(derivs.dU.z).toBeCloseTo(0, 10);
    });

    it('returns direction for dV', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const derivs = derivativesExtrusionSurface(surface, 5, 3);

      // Direction is (0, 0, 1)
      expect(derivs.dV.x).toBeCloseTo(0, 10);
      expect(derivs.dV.y).toBeCloseTo(0, 10);
      expect(derivs.dV.z).toBeCloseTo(1, 10);
    });

    it('dU varies for circle curve', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      const surfResult = makeExtrusionSurface(circleResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const d0 = derivativesExtrusionSurface(surface, 0, 0);
      const d90 = derivativesExtrusionSurface(surface, Math.PI / 2, 0);

      // dU should be different at different angles
      const dot = d0.dU.x * d90.dU.x + d0.dU.y * d90.dU.y + d0.dU.z * d90.dU.z;
      expect(dot).toBeCloseTo(0, 10);
    });
  });

  describe('getCanonicalSurfaceType', () => {
    it('returns plane for line', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const result = getCanonicalSurfaceType(lineResult.result!, vec3d(0, 0, 1));
      expect(result).toBe('plane');
    });

    it('returns cylinder for circle with parallel direction', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      // Direction parallel to circle normal (which is Z)
      const result = getCanonicalSurfaceType(circleResult.result!, vec3d(0, 0, 1));
      expect(result).toBe('cylinder');
    });

    it('returns cylinder for circle with anti-parallel direction', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      // Direction anti-parallel to circle normal
      const result = getCanonicalSurfaceType(circleResult.result!, vec3d(0, 0, -1));
      expect(result).toBe('cylinder');
    });

    it('returns extrusion for circle with non-parallel direction', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      // Direction not parallel to circle normal
      const result = getCanonicalSurfaceType(circleResult.result!, vec3d(1, 0, 1));
      expect(result).toBe('extrusion');
    });

    it('returns cylinder for arc with parallel direction', () => {
      const arcResult = makeArc3D(XY_PLANE, 5, 0, Math.PI / 2);
      const result = getCanonicalSurfaceType(arcResult.result!, vec3d(0, 0, 1));
      expect(result).toBe('cylinder');
    });
  });

  describe('canonicalizeExtrusionSurface', () => {
    it('converts line extrusion to plane surface', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const canonical = canonicalizeExtrusionSurface(surface);
      expect(canonical.type).toBe('plane');
    });

    it('converts circle extrusion to cylindrical surface', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      const surfResult = makeExtrusionSurface(circleResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const canonical = canonicalizeExtrusionSurface(surface);
      expect(canonical.type).toBe('cylinder');

      if (canonical.type === 'cylinder') {
        expect(canonical.radius).toBe(5);
      }
    });

    it('converts arc extrusion to cylindrical surface', () => {
      const arcResult = makeArc3D(XY_PLANE, 7, 0, Math.PI);
      const surfResult = makeExtrusionSurface(arcResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const canonical = canonicalizeExtrusionSurface(surface);
      expect(canonical.type).toBe('cylinder');

      if (canonical.type === 'cylinder') {
        expect(canonical.radius).toBe(7);
      }
    });

    it('keeps non-parallel circle extrusion as extrusion', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      const surfResult = makeExtrusionSurface(circleResult.result!, vec3d(1, 0, 1));
      const surface = surfResult.result!;

      const canonical = canonicalizeExtrusionSurface(surface);
      expect(canonical.type).toBe('extrusion');
    });

    it('plane has correct normal for X-line extruded along Z', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const canonical = canonicalizeExtrusionSurface(surface);
      expect(canonical.type).toBe('plane');

      if (canonical.type === 'plane') {
        // Line along X, extruded along Z → normal is ±Y
        const normal = canonical.plane.normal;
        expect(normal.x).toBeCloseTo(0, 10);
        expect(Math.abs(normal.y)).toBeCloseTo(1, 10);
        expect(normal.z).toBeCloseTo(0, 10);
      }
    });

    it('cylinder has correct axis for circle extruded along Z', () => {
      const circleResult = makeCircle3D(XY_PLANE, 5);
      const surfResult = makeExtrusionSurface(circleResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const canonical = canonicalizeExtrusionSurface(surface);
      expect(canonical.type).toBe('cylinder');

      if (canonical.type === 'cylinder') {
        // Axis should be at origin, along Z
        expect(canonical.axis.origin.x).toBeCloseTo(0, 10);
        expect(canonical.axis.origin.y).toBeCloseTo(0, 10);
        expect(canonical.axis.origin.z).toBeCloseTo(0, 10);
        expect(canonical.axis.direction.z).toBeCloseTo(1, 10);
      }
    });
  });

  describe('edge cases', () => {
    it('rejects very small direction vector near tolerance', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      // 1e-8 is below tolerance, should fail
      const result = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1e-8));

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-zero');
    });

    it('handles small but valid direction vector', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      // 1e-4 should be above tolerance
      const result = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1e-4));

      expect(result.success).toBe(true);
      const dir = result.result!.direction;
      const len = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
      expect(len).toBeCloseTo(1, 5);
    });

    it('handles large v values', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const pt = evaluateExtrusionSurface(surface, 5, 1e6);
      expect(pt.z).toBeCloseTo(1e6, 5);
    });

    it('handles offset line', () => {
      const lineResult = makeLine3D(point3d(100, 200, 300), point3d(110, 200, 300));
      const surfResult = makeExtrusionSurface(lineResult.result!, vec3d(0, 0, 1));
      const surface = surfResult.result!;

      const pt = evaluateExtrusionSurface(surface, 5, 10);
      expect(pt.x).toBeCloseTo(105, 10);
      expect(pt.y).toBeCloseTo(200, 10);
      expect(pt.z).toBeCloseTo(310, 10);
    });

    it('handles diagonal direction', () => {
      const lineResult = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
      const surfResult = makeExtrusionSurface(
        lineResult.result!,
        vec3d(1, 1, 1),
      );
      const surface = surfResult.result!;

      // Direction should be normalized
      const dir = surface.direction;
      const expectedComponent = 1 / Math.sqrt(3);
      expect(dir.x).toBeCloseTo(expectedComponent, 10);
      expect(dir.y).toBeCloseTo(expectedComponent, 10);
      expect(dir.z).toBeCloseTo(expectedComponent, 10);

      const pt = evaluateExtrusionSurface(surface, 5, Math.sqrt(3));
      expect(pt.x).toBeCloseTo(6, 10);
      expect(pt.y).toBeCloseTo(1, 10);
      expect(pt.z).toBeCloseTo(1, 10);
    });
  });
});
