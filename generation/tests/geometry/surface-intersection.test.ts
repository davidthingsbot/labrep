/**
 * Surface-Surface Intersection (SSI) via marching algorithm.
 *
 * Tests the general predictor-corrector marching that traces intersection
 * curves numerically for ANY surface pair. This is the OCCT IntWalk_PWalking
 * equivalent — the mathematical core of Phase 13.
 *
 * Tests organized by surface pair, validating that every point on every
 * result curve lies on BOTH surfaces (the fundamental invariant).
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, distance, dot, cross, normalize } from '../../src/core';
import { makePlaneSurface, evaluatePlaneSurface } from '../../src/surfaces/plane-surface';
import { makeSphericalSurface, evaluateSphericalSurface } from '../../src/surfaces/spherical-surface';
import { makeCylindricalSurface, evaluateCylindricalSurface } from '../../src/surfaces/cylindrical-surface';
import { makeConicalSurface, evaluateConicalSurface } from '../../src/surfaces/conical-surface';
import { intersectSurfaces } from '../../src/geometry/surface-intersection';
import type { SSIResult } from '../../src/geometry/surface-intersection';

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

/** Verify every point on every curve lies on both surfaces within tolerance. */
function verifyPointsOnBothSurfaces(
  result: SSIResult,
  surfA: { evaluate: (u: number, v: number) => { x: number; y: number; z: number } },
  surfB: { evaluate: (u: number, v: number) => { x: number; y: number; z: number } },
  tol: number = 1e-4,
) {
  for (const curve of result.curves) {
    for (const pt of curve.points) {
      // Point must lie on surface A: evaluate A at (u1, v1) should match pt.point
      const pA = surfA.evaluate(pt.u1, pt.v1);
      const dA = Math.sqrt((pA.x - pt.point.x) ** 2 + (pA.y - pt.point.y) ** 2 + (pA.z - pt.point.z) ** 2);
      expect(dA).toBeLessThan(tol);

      // Point must lie on surface B: evaluate B at (u2, v2) should match pt.point
      const pB = surfB.evaluate(pt.u2, pt.v2);
      const dB = Math.sqrt((pB.x - pt.point.x) ** 2 + (pB.y - pt.point.y) ** 2 + (pB.z - pt.point.z) ** 2);
      expect(dB).toBeLessThan(tol);
    }
  }
}

/** Verify curve has adequate point density (no huge gaps). */
function verifyPointDensity(result: SSIResult, maxGap: number = 0.5) {
  for (const curve of result.curves) {
    for (let i = 1; i < curve.points.length; i++) {
      const p0 = curve.points[i - 1].point;
      const p1 = curve.points[i].point;
      const gap = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2 + (p1.z - p0.z) ** 2);
      expect(gap).toBeLessThan(maxGap);
    }
  }
}

/** Verify a closed curve's first and last points nearly coincide. */
function verifyClosure(result: SSIResult, tol: number = 1e-3) {
  for (const curve of result.curves) {
    if (curve.isClosed) {
      const first = curve.points[0].point;
      const last = curve.points[curve.points.length - 1].point;
      expect(distance(first, last)).toBeLessThan(tol);
    }
  }
}

// Surface evaluation wrappers for the invariant checker
type Evaluator = { evaluate: (u: number, v: number) => { x: number; y: number; z: number } };

function sphereEval(s: ReturnType<typeof makeSphericalSurface>['result']): Evaluator {
  return { evaluate: (u, v) => evaluateSphericalSurface(s!, u, v) };
}

function cylinderEval(s: ReturnType<typeof makeCylindricalSurface>['result']): Evaluator {
  return { evaluate: (u, v) => evaluateCylindricalSurface(s!, u, v) };
}

function planeEval(s: ReturnType<typeof makePlaneSurface>): Evaluator {
  return { evaluate: (u, v) => evaluatePlaneSurface(s, u, v) };
}

function coneEval(s: ReturnType<typeof makeConicalSurface>['result']): Evaluator {
  return { evaluate: (u, v) => evaluateConicalSurface(s!, u, v) };
}

// Helper to create surfaces without the OperationResult boilerplate
function sphere(center: Parameters<typeof makeSphericalSurface>[0], r: Parameters<typeof makeSphericalSurface>[1]) {
  return makeSphericalSurface(center, r).result!;
}
function cylinder(axis: Parameters<typeof makeCylindricalSurface>[0], r: Parameters<typeof makeCylindricalSurface>[1]) {
  return makeCylindricalSurface(axis, r).result!;
}
function cone(axis: Parameters<typeof makeConicalSurface>[0], r: Parameters<typeof makeConicalSurface>[1], a: Parameters<typeof makeConicalSurface>[2]) {
  return makeConicalSurface(axis, r, a).result!;
}

// ═══════════════════════════════════════════════
// PLANE-SPHERE (validate marching against known analytic results)
// ═══════════════════════════════════════════════

describe('SSI: Plane-Sphere', () => {
  it('plane through sphere center → circle', () => {
    const sph = sphere(point3d(0, 0, 0), 2);
    const pl = makePlaneSurface(plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)));

    const result = intersectSurfaces(sph, pl);
    expect(result.curves.length).toBe(1);
    expect(result.curves[0].isClosed).toBe(true);
    expect(result.curves[0].points.length).toBeGreaterThan(10);

    // All points should be at z=0 (on the plane) and distance 2 from origin (on the sphere)
    for (const pt of result.curves[0].points) {
      expect(Math.abs(pt.point.z)).toBeLessThan(1e-4);
      const r = Math.sqrt(pt.point.x ** 2 + pt.point.y ** 2);
      expect(r).toBeCloseTo(2, 2);
    }

    verifyPointsOnBothSurfaces(result, sphereEval(sph), planeEval(pl));
    verifyClosure(result);
  });

  it('plane tangent to sphere → empty or point', () => {
    const sph = sphere(point3d(0, 0, 0), 2);
    const pl = makePlaneSurface(plane(point3d(0, 0, 2), vec3d(0, 0, 1), vec3d(1, 0, 0)));

    const result = intersectSurfaces(sph, pl);
    // Tangent: no curve (or degenerate point)
    expect(result.curves.length).toBe(0);
  });

  it('plane misses sphere → empty', () => {
    const sph = sphere(point3d(0, 0, 0), 2);
    const pl = makePlaneSurface(plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0)));

    const result = intersectSurfaces(sph, pl);
    expect(result.curves.length).toBe(0);
  });

  it('offset plane → smaller circle', () => {
    const sph = sphere(point3d(0, 0, 0), 2);
    // Plane at z=1: circle radius = sqrt(4 - 1) = sqrt(3) ≈ 1.732
    const pl = makePlaneSurface(plane(point3d(0, 0, 1), vec3d(0, 0, 1), vec3d(1, 0, 0)));

    const result = intersectSurfaces(sph, pl);
    expect(result.curves.length).toBe(1);
    expect(result.curves[0].isClosed).toBe(true);

    for (const pt of result.curves[0].points) {
      expect(Math.abs(pt.point.z - 1)).toBeLessThan(1e-4);
      const r = Math.sqrt(pt.point.x ** 2 + pt.point.y ** 2);
      expect(r).toBeCloseTo(Math.sqrt(3), 1);
    }
  });
});

// ═══════════════════════════════════════════════
// PLANE-CYLINDER
// ═══════════════════════════════════════════════

describe('SSI: Plane-Cylinder', () => {
  it('plane perpendicular to cylinder axis → circle', () => {
    const cyl = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );
    const pl = makePlaneSurface(plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)));

    const result = intersectSurfaces(cyl, pl);
    expect(result.curves.length).toBe(1);
    expect(result.curves[0].isClosed).toBe(true);

    for (const pt of result.curves[0].points) {
      expect(Math.abs(pt.point.z)).toBeLessThan(1e-4);
      const r = Math.sqrt(pt.point.x ** 2 + pt.point.y ** 2);
      expect(r).toBeCloseTo(1, 2);
    }
  });
});

// ═══════════════════════════════════════════════
// SPHERE-SPHERE (the key curved-curved test)
// ═══════════════════════════════════════════════

describe('SSI: Sphere-Sphere', () => {
  it('overlapping spheres → one closed circle', () => {
    const s1 = sphere(point3d(0, 0, 0), 2);
    const s2 = sphere(point3d(2, 0, 0), 2);

    const result = intersectSurfaces(s1, s2);
    expect(result.curves.length).toBe(1);
    expect(result.curves[0].isClosed).toBe(true);
    expect(result.curves[0].points.length).toBeGreaterThan(10);

    // Analytically: circle at x=1 (midpoint), radius = sqrt(4-1) = sqrt(3)
    for (const pt of result.curves[0].points) {
      expect(pt.point.x).toBeCloseTo(1, 1);
      const r = Math.sqrt(pt.point.y ** 2 + pt.point.z ** 2);
      expect(r).toBeCloseTo(Math.sqrt(3), 1);
    }

    verifyPointsOnBothSurfaces(result, sphereEval(s1), sphereEval(s2));
    verifyClosure(result);
    verifyPointDensity(result);
  });

  it('disjoint spheres → empty', () => {
    const s1 = sphere(point3d(0, 0, 0), 1);
    const s2 = sphere(point3d(5, 0, 0), 1);

    const result = intersectSurfaces(s1, s2);
    expect(result.curves.length).toBe(0);
  });

  it('one inside other → empty', () => {
    const s1 = sphere(point3d(0, 0, 0), 5);
    const s2 = sphere(point3d(0, 0, 0), 1);

    const result = intersectSurfaces(s1, s2);
    expect(result.curves.length).toBe(0);
  });

  it('touching externally → empty (tangent, no curve)', () => {
    const s1 = sphere(point3d(0, 0, 0), 2);
    const s2 = sphere(point3d(4, 0, 0), 2);

    const result = intersectSurfaces(s1, s2);
    expect(result.curves.length).toBe(0);
  });

  it('non-axis-aligned centers → tilted circle', () => {
    // Centers along (1,1,0) direction
    const s1 = sphere(point3d(0, 0, 0), 3);
    const s2 = sphere(point3d(2, 2, 0), 3);

    const result = intersectSurfaces(s1, s2);
    expect(result.curves.length).toBe(1);
    expect(result.curves[0].isClosed).toBe(true);

    verifyPointsOnBothSurfaces(result, sphereEval(s1), sphereEval(s2));

    // Circle center should be at midpoint (1,1,0)
    let cx = 0, cy = 0, cz = 0;
    for (const pt of result.curves[0].points) {
      cx += pt.point.x; cy += pt.point.y; cz += pt.point.z;
    }
    const n = result.curves[0].points.length;
    expect(cx / n).toBeCloseTo(1, 0);
    expect(cy / n).toBeCloseTo(1, 0);
  });

  it('large/small radius ratio (10:1) → small circle', () => {
    const s1 = sphere(point3d(0, 0, 0), 10);
    const s2 = sphere(point3d(9.5, 0, 0), 1);

    const result = intersectSurfaces(s1, s2);
    expect(result.curves.length).toBe(1);
    verifyPointsOnBothSurfaces(result, sphereEval(s1), sphereEval(s2));
  });
});

// ═══════════════════════════════════════════════
// SPHERE-CYLINDER
// ═══════════════════════════════════════════════

describe('SSI: Sphere-Cylinder', () => {
  it('sphere centered on cylinder axis → 2 circles', () => {
    const sph = sphere(point3d(0, 0, 0), 2);
    const cyl = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );

    const result = intersectSurfaces(sph, cyl);
    // Sphere R=2, cylinder R=1 coaxial: intersect at z = ±sqrt(4-1) = ±sqrt(3)
    expect(result.curves.length).toBe(2);
    for (const curve of result.curves) {
      expect(curve.isClosed).toBe(true);
    }

    verifyPointsOnBothSurfaces(result, sphereEval(sph), cylinderEval(cyl));
    verifyClosure(result);
  });

  it('sphere off-axis, intersecting → closed curve (not a circle)', () => {
    const sph = sphere(point3d(0.5, 0, 0), 2);
    const cyl = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );

    const result = intersectSurfaces(sph, cyl);
    expect(result.curves.length).toBeGreaterThanOrEqual(1);
    verifyPointsOnBothSurfaces(result, sphereEval(sph), cylinderEval(cyl));
  });

  it('sphere far from cylinder → empty', () => {
    const sph = sphere(point3d(10, 0, 0), 1);
    const cyl = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );

    const result = intersectSurfaces(sph, cyl);
    expect(result.curves.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// CYLINDER-CYLINDER
// ═══════════════════════════════════════════════

describe('SSI: Cylinder-Cylinder', () => {
  it('parallel axes, overlapping → 2 lines', () => {
    const c1 = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      2,
    );
    const c2 = cylinder(
      { origin: point3d(1.5, 0, 0), direction: vec3d(0, 0, 1) },
      2,
    );

    const result = intersectSurfaces(c1, c2);
    expect(result.curves.length).toBe(2);
    // Lines should be parallel to Z axis
    for (const curve of result.curves) {
      expect(curve.isClosed).toBe(false);
      // All points should have same x,y (varying z only)
      const pts = curve.points;
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i].point.x).toBeCloseTo(pts[0].point.x, 1);
        expect(pts[i].point.y).toBeCloseTo(pts[0].point.y, 1);
      }
    }

    verifyPointsOnBothSurfaces(result, cylinderEval(c1), cylinderEval(c2));
  });

  it('perpendicular axes, equal radii → 2 closed curves', () => {
    const c1 = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );
    const c2 = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(1, 0, 0) },
      1,
    );

    const result = intersectSurfaces(c1, c2);
    expect(result.curves.length).toBe(2);
    for (const curve of result.curves) {
      expect(curve.isClosed).toBe(true);
    }

    verifyPointsOnBothSurfaces(result, cylinderEval(c1), cylinderEval(c2));
    verifyClosure(result);
  });

  it('parallel axes, separated → empty', () => {
    const c1 = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );
    const c2 = cylinder(
      { origin: point3d(5, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );

    const result = intersectSurfaces(c1, c2);
    expect(result.curves.length).toBe(0);
  });

  it('45° angle axes → closed curves', () => {
    const c1 = cylinder(
      { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) },
      1,
    );
    const c2 = cylinder(
      { origin: point3d(0, 0, 0), direction: normalize(vec3d(1, 0, 1)) },
      1,
    );

    const result = intersectSurfaces(c1, c2);
    expect(result.curves.length).toBeGreaterThanOrEqual(1);
    verifyPointsOnBothSurfaces(result, cylinderEval(c1), cylinderEval(c2));
  });
});

// ═══════════════════════════════════════════════
// COMMUTATIVITY
// ═══════════════════════════════════════════════

describe('SSI: Commutativity', () => {
  it('intersectSurfaces(A,B) and intersectSurfaces(B,A) produce same number of curves', () => {
    const s1 = sphere(point3d(0, 0, 0), 2);
    const s2 = sphere(point3d(2, 0, 0), 2);

    const r1 = intersectSurfaces(s1, s2);
    const r2 = intersectSurfaces(s2, s1);
    expect(r1.curves.length).toBe(r2.curves.length);
  });
});

// ═══════════════════════════════════════════════
// NUMERICAL ROBUSTNESS
// ═══════════════════════════════════════════════

describe('SSI: Numerical robustness', () => {
  it('nearly tangent spheres → clean result (no crash)', () => {
    const s1 = sphere(point3d(0, 0, 0), 2);
    // Barely touching: d = 3.99, r1 + r2 = 4.0
    const s2 = sphere(point3d(3.99, 0, 0), 2);

    const result = intersectSurfaces(s1, s2);
    // Should either find a tiny circle or return empty — not crash
    expect(result.curves.length).toBeLessThanOrEqual(1);
    if (result.curves.length === 1) {
      verifyPointsOnBothSurfaces(result, sphereEval(s1), sphereEval(s2), 1e-2);
    }
  });

  it('large geometry (R=100) → valid result', () => {
    const s1 = sphere(point3d(0, 0, 0), 100);
    const s2 = sphere(point3d(100, 0, 0), 100);

    const result = intersectSurfaces(s1, s2);
    expect(result.curves.length).toBe(1);
    verifyPointsOnBothSurfaces(result, sphereEval(s1), sphereEval(s2), 1e-1);
  });
});
