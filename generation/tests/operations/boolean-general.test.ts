/**
 * General curved boolean operations — tests that exercise the generalized
 * pipeline using FFI + split-face for arbitrary surface pairs.
 *
 * These tests will FAIL until Sub-Phase E replaces the special-case
 * boolean pipeline with the general FFI-based approach.
 *
 * Modeled on OCCT tests/boolean/bopcommon_simple/ZH6, ZI8, ZJ5, etc.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, Z_AXIS_3D } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import {
  booleanSubtract, booleanUnion, booleanIntersect,
} from '../../src/operations/boolean';
import { solidToMesh } from '../../src/mesh/tessellation';
import { meshTriangleCount } from '../../src/mesh/mesh';

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function makeBox(cx: number, cy: number, cz: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, cz), point3d(cx + hw, cy - hh, cz),
    point3d(cx + hw, cy + hh, cz), point3d(cx - hw, cy + hh, cz),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d).result!;
}

function makeSphere(r: number, cx = 0, cy = 0, cz = 0) {
  // Build sphere at origin, then note: our revolve always creates at origin
  // For offset spheres, we'd need transforms — for now, only origin-centered
  const arcPlane = plane(point3d(cx, cy, cz), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const axisEnd1 = point3d(cx, cy, cz + r);
  const axisEnd2 = point3d(cx, cy, cz - r);
  const line = makeLine3D(axisEnd1, axisEnd2).result!;
  const axis = { origin: point3d(cx, cy, cz), direction: vec3d(0, 0, 1) };
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!, makeEdgeFromCurve(arc2).result!, makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI).result!;
}

function makeCylinder(r: number, height: number, cx = 0, cy = 0, cz = 0) {
  const circlePlane = plane(point3d(cx, cy, cz - height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

/** Check the volume invariant V(A∪B) + V(A∩B) = V(A) + V(B). */
function checkVolumeInvariant(solidA: any, solidB: any, tolerance = 0.05) {
  const vA = solidVolume(solidA);
  const vB = solidVolume(solidB);
  const unionResult = booleanUnion(solidA, solidB);
  const interResult = booleanIntersect(solidA, solidB);
  if (!unionResult.success || !interResult.success) return false;
  const vU = solidVolume(unionResult.result!.solid);
  const vI = solidVolume(interResult.result!.solid);
  const lhs = vU + vI;
  const rhs = vA + vB;
  return Math.abs(lhs - rhs) / rhs < tolerance;
}

// ═══════════════════════════════════════════════
// SPHERE-SPHERE BOOLEANS
// ═══════════════════════════════════════════════

describe('General: Sphere-Sphere', () => {
  it('subtract overlapping spheres → closed shell', () => {
    const s1 = makeSphere(2);
    const s2 = makeSphere(1.5);
    // Both at origin but different radii → s2 is inside s1
    const result = booleanSubtract(s1.solid, s2.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    // Volume should be V(big) - V(small)
    const vol = solidVolume(result.result!.solid);
    const expected = (4 / 3) * Math.PI * (8 - 3.375); // r1³ - r2³
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.10);
  });

  it('subtract overlapping spheres → tessellates', () => {
    const s1 = makeSphere(2);
    const s2 = makeSphere(1.5);
    const result = booleanSubtract(s1.solid, s2.solid);
    if (!result.success) return;
    const mesh = solidToMesh(result.result!.solid);
    expect(mesh.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// BOX-SPHERE CONTAINMENT (sphere fully inside box)
// ═══════════════════════════════════════════════

describe('General: Box-Sphere containment', () => {
  it('box ∪ sphere (sphere fully inside) → just the box', () => {
    // Box from (-2,-2,-2) to (2,2,2), sphere at origin r=1 → fully contained.
    // Union of A containing B is just A.
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const sphere = makeSphere(1);
    const result = booleanUnion(box.solid, sphere.solid);
    expect(result.success).toBe(true);

    const mesh = solidToMesh(result.result!.solid);
    expect(mesh.success).toBe(true);
    expect(meshTriangleCount(mesh.result!)).toBe(12);
  });
});

// ═══════════════════════════════════════════════
// PARTIAL CIRCLE SPLITTING (Phase 13 C2)
// Sphere at box corner — intersection circles cross face edges
// ═══════════════════════════════════════════════

describe('General: Partial circle splitting', () => {
  it('box − sphere at corner: sphere straddles 3 faces', () => {
    // Box from (0,0,0) to (4,4,4). Sphere at origin, r=1.5.
    // Sphere protrudes from 3 faces (x=0, y=0, z=0).
    // Each intersection circle crosses 2 face edges → partial arcs.
    const box = makeBox(2, 2, 0, 4, 4, 4);
    const sphere = makeSphere(1.5);

    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    // Volume = box - sphere_octant = 64 - (4/3)π(1.5³)/8
    const sphereVol = (4 / 3) * Math.PI * Math.pow(1.5, 3);
    const expected = 64 - sphereVol / 8;
    const vol = solidVolume(result.result!.solid);
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.10);
  });

  it('box − sphere at edge: sphere straddles 1 face', () => {
    // Box from (-2,-2,0) to (2,2,4). Sphere at (0,0,0) r=1.
    // Only z=0 face intersects sphere. Circle r=1 at (0,0,0) is fully
    // inside the z=0 face (face extends ±2). Bottom hemisphere protrudes.
    // This is actually the "full circle inside face" case — should already work.
    const box = makeBox(0, 0, 0, 4, 4, 4);
    const sphere = makeSphere(1);

    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    // Volume = box - hemisphere = 64 - (2/3)π
    const expected = 64 - (2 / 3) * Math.PI;
    const vol = solidVolume(result.result!.solid);
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.05);
  });
});

// ═══════════════════════════════════════════════
// COMPLEX COMPOUND SOLIDS
// ═══════════════════════════════════════════════

describe('General: Complex compounds', () => {
  it('nested cylinders (bushing): outer − inner → tube', () => {
    const outer = makeCylinder(3, 6);
    const inner = makeCylinder(2, 6);
    const result = booleanSubtract(outer.solid, inner.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    // Volume = π(R² - r²)h = π(9-4)*6 = 30π
    const vol = solidVolume(result.result!.solid);
    const expected = Math.PI * 5 * 6;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.05);
  });

  it('box with multiple cylinder bores', () => {
    const box = makeBox(0, 0, -2, 10, 4, 4);
    const cyl1 = makeCylinder(0.5, 6, -3, 0, 0);
    const cyl2 = makeCylinder(0.5, 6, 3, 0, 0);

    const r1 = booleanSubtract(box.solid, cyl1.solid);
    expect(r1.success).toBe(true);
    const r2 = booleanSubtract(r1.result!.solid, cyl2.solid);
    expect(r2.success).toBe(true);
    expect(r2.result!.solid.outerShell.isClosed).toBe(true);

    // Volume = box - 2 cylinder bores
    const vol = solidVolume(r2.result!.solid);
    const expected = 10 * 4 * 4 - 2 * Math.PI * 0.25 * 4;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.05);
  });
});
