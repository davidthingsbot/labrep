/**
 * Phase 13 exit-criteria tests: curved boolean operations.
 * These verify exact volumes, shell closure, face types, and tessellation.
 */
import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  Z_AXIS_3D,
} from '../../src/core';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { intersectPlaneCylinder } from '../../src/geometry/intersections3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { booleanSubtract, booleanUnion } from '../../src/operations/boolean';
import { solidToMesh } from '../../src/mesh/tessellation';
import { meshTriangleCount } from '../../src/mesh/mesh';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function makeBox(cx: number, cy: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, z), point3d(cx + hw, cy - hh, z),
    point3d(cx + hw, cy + hh, z), point3d(cx - hw, cy + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

/** 2-face sphere (legacy: 2 arcs → 2 hemisphere faces) */
function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!, makeEdgeFromCurve(arc2).result!, makeEdgeFromCurve(line).result!,
  ]).result!, Z_AXIS_3D, 2 * Math.PI).result!;
}

/** 1-face sphere (OCCT-style: single semicircle arc → 1 face) */
function makeSphere1Face(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc = makeArc3D(arcPlane, r, -Math.PI / 2, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc).result!, makeEdgeFromCurve(line).result!,
  ]).result!, Z_AXIS_3D, 2 * Math.PI).result!;
}

// ═══════════════════════════════════════════════════════
// F1: BOX − SPHERE
// ═══════════════════════════════════════════════════════

describe('F1: box − sphere', () => {
  const box = makeBox(0, 0, -2, 4, 4, 4);
  const sphere = makeSphere(1);
  const result = booleanSubtract(box.solid, sphere.solid);

  it('succeeds', () => {
    expect(result.success).toBe(true);
  });

  it('shell is closed', () => {
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('volume = box_vol − sphere_vol (within 1%)', () => {
    const vol = solidVolume(result.result!.solid);
    const expected = 64 - (4 / 3) * Math.PI; // ≈ 59.811
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.01);
  });

  it('has planar + spherical faces', () => {
    const faces = shellFaces(result.result!.solid.outerShell);
    const planeCount = faces.filter(f => f.surface.type === 'plane').length;
    const sphereCount = faces.filter(f => f.surface.type === 'sphere').length;
    expect(planeCount).toBeGreaterThanOrEqual(6);
    expect(sphereCount).toBeGreaterThan(0);
  });

  it('tessellates successfully', () => {
    const mesh = solidToMesh(result.result!.solid);
    expect(mesh.success).toBe(true);
    expect(meshTriangleCount(mesh.result!)).toBeGreaterThan(100);
  });
});

// ═══════════════════════════════════════════════════════
// F4: L-BRACKET − SPHERE (exit criterion)
// ═══════════════════════════════════════════════════════

describe('F4: L-bracket − sphere', () => {
  // L-bracket: base centered around origin, sphere at origin fits inside
  // Base: 4×4×1.2 from z=-0.6 to z=0.6 (centered at z=0)
  // Upright: 1×4×3.2 from z=0.2 to z=3.4 (overlaps base by 0.4)
  const boxA = makeBox(0, 0, -0.6, 4, 4, 1.2);
  const boxB = makeBox(-1.5, 0, 0.2, 1, 4, 3.2);
  const lResult = booleanUnion(boxA.solid, boxB.solid);

  it('L-bracket union succeeds', () => {
    expect(lResult.success).toBe(true);
    expect(lResult.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('L-bracket − small sphere (fully inside base) succeeds with closed shell', () => {
    if (!lResult.success) return;
    // Sphere r=0.3 at origin: extends z=-0.3..0.3, fully inside base z=-0.6..0.6
    const sphere = makeSphere(0.3);
    const result = booleanSubtract(lResult.result!.solid, sphere.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('L-bracket − small sphere has correct volume', () => {
    if (!lResult.success) return;
    const sphere = makeSphere(0.3);
    const lVol = solidVolume(lResult.result!.solid);
    const sVol = solidVolume(sphere.solid);
    const result = booleanSubtract(lResult.result!.solid, sphere.solid);
    if (!result.success) return;

    const vol = solidVolume(result.result!.solid);
    const expected = lVol - sVol;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('L-bracket − small sphere tessellates', () => {
    if (!lResult.success) return;
    const sphere = makeSphere(0.3);
    const result = booleanSubtract(lResult.result!.solid, sphere.solid);
    if (!result.success) return;
    const mesh = solidToMesh(result.result!.solid);
    expect(mesh.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// F2: SPHERE PARTIALLY OUTSIDE BOX
// ═══════════════════════════════════════════════════════

describe('F2: sphere partially outside box (1-face sphere)', () => {
  it('sphere sticking out bottom of box → closed shell', () => {
    // Box z=-0.5..3.5, sphere r=1 at origin: bottom of sphere below z=-0.5
    const box = makeBox(0, 0, -0.5, 4, 4, 4);
    const sphere = makeSphere1Face(1);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.error ?? 'success').toBe('success');
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('sphere sticking out bottom → correct volume (box minus spherical cap)', () => {
    const box = makeBox(0, 0, -0.5, 4, 4, 4);
    const sphere = makeSphere1Face(1);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    // Box vol = 64. Spherical cap inside box: from z=-0.5 to z=1, height h=1.5
    // Cap volume = π*h²*(3r-h)/3 = π*2.25*1.5/3 = π*1.125 ≈ 3.534
    const capVol = Math.PI * 1.5 * 1.5 * (3 * 1 - 1.5) / 3;
    const expected = 64 - capVol;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.07);
  });

  it('sphere sticking out bottom → has planar faces with hole + trimmed sphere face', () => {
    const box = makeBox(0, 0, -0.5, 4, 4, 4);
    const sphere = makeSphere1Face(1);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const planeCount = faces.filter(f => f.surface.type === 'plane').length;
    const sphereCount = faces.filter(f => f.surface.type === 'sphere').length;
    expect(planeCount).toBeGreaterThanOrEqual(6);
    expect(sphereCount).toBeGreaterThan(0);
  });

  it('sphere sticking out bottom → tessellates', () => {
    const box = makeBox(0, 0, -0.5, 4, 4, 4);
    const sphere = makeSphere1Face(1);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const mesh = solidToMesh(result.result!.solid);
    expect(mesh.success).toBe(true);
    expect(meshTriangleCount(mesh.result!)).toBeGreaterThan(50);
  });

  it('sphere sticking out one side → closed shell', () => {
    // Box x=-0.5..3.5, sphere r=1 at origin: left side sticks out
    const box = makeBox(1.5, 0, -2, 4, 4, 4);
    const sphere = makeSphere1Face(1);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.error ?? 'success').toBe('success');
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// F6: EDGE CASES
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// F3: BOX − CYLINDER (THROUGH-HOLE)
// ═══════════════════════════════════════════════════════

/** Create a cylinder along Z axis at origin: extrude a circle from z=-height/2 */
function makeCylinder(r: number, height: number) {
  const circlePlane = plane(point3d(0, 0, -height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

describe('F3: box − cylinder (through-hole)', () => {
  it('cylinder creation: 3 faces, correct volume', () => {
    const cyl = makeCylinder(0.5, 6);
    const faces = shellFaces(cyl.solid.outerShell);
    expect(faces.length).toBe(3); // 2 caps + 1 side
    expect(cyl.solid.outerShell.isClosed).toBe(true);
    const vol = solidVolume(cyl.solid);
    expect(Math.abs(vol - Math.PI * 0.25 * 6) / (Math.PI * 0.25 * 6)).toBeLessThan(0.01);
  });

  it('cylinder has cylindrical surface face', () => {
    const cyl = makeCylinder(0.5, 6);
    const faces = shellFaces(cyl.solid.outerShell);
    const cylFaces = faces.filter(f => f.surface.type === 'cylinder');
    expect(cylFaces.length).toBe(1);
  });

  it('box − cylinder succeeds with closed shell', () => {
    // 4×4×4 box centered at origin, cylinder r=0.5 along Z extending beyond box
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6); // z from -3 to 3, extends beyond box
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.error ?? 'success').toBe('success');
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('box − cylinder has correct volume', () => {
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    // Box vol = 64. Cylinder through-hole: π×0.5²×4 = π
    const expected = 64 - Math.PI * 0.25 * 4;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('box − cylinder has planar faces with holes + cylindrical face', () => {
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const planeCount = faces.filter(f => f.surface.type === 'plane').length;
    const cylCount = faces.filter(f => f.surface.type === 'cylinder').length;
    expect(planeCount).toBeGreaterThanOrEqual(6); // 6 box faces (2 with holes)
    expect(cylCount).toBeGreaterThan(0); // cylindrical through-hole surface
  });

  it('box − cylinder tessellates', () => {
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const mesh = solidToMesh(result.result!.solid);
    expect(mesh.success).toBe(true);
    expect(meshTriangleCount(mesh.result!)).toBeGreaterThan(50);
  });

  it('through-hole: result currently has 8 planar faces, 2 with holes (debug)', () => {
    // This test documents current behavior to track progress
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const types: Record<string, number> = {};
    for (const f of faces) types[f.surface.type] = (types[f.surface.type] || 0) + 1;
    const holedCount = faces.filter(f => f.innerWires.length > 0).length;

    // Current: 8 plane, 0 cylinder, 2 holed — cylinder face missing
    // Target: 6+ plane, 1+ cylinder, 2 holed
    expect(types['plane']).toBeGreaterThanOrEqual(6);
    // This assertion documents the bug — it should be > 0 when fixed:
    expect(types['cylinder'] ?? 0).toBeGreaterThan(0);
  });

  it('through-hole: 4-edge wire (2 circles + 2 seams) is valid', () => {
    // Simulate what buildTrimmedCurvedFace does with 2 circle edges
    const e0 = makeEdgeFromCurve(makeCircle3D(plane(point3d(0, 0, 2), vec3d(0, 0, 1), vec3d(1, 0, 0)), 0.5).result!).result!;
    const e1 = makeEdgeFromCurve(makeCircle3D(plane(point3d(0, 0, -2), vec3d(0, 0, 1), vec3d(1, 0, 0)), 0.5).result!).result!;

    const p0 = point3d(e0.startVertex.point.x, e0.startVertex.point.y, e0.startVertex.point.z);
    const p1 = point3d(e1.startVertex.point.x, e1.startVertex.point.y, e1.startVertex.point.z);

    const seamDown = makeEdgeFromCurve(makeLine3D(p0, p1).result!).result!;
    const seamUp = makeEdgeFromCurve(makeLine3D(p1, p0).result!).result!;

    // e0(false): circle at z=2, reversed — starts at (0.5,0,2) ends at (0.5,0,2)
    // seamDown: (0.5,0,2) → (0.5,0,-2)
    // e1(true): circle at z=-2 — starts at (0.5,0,-2) ends at (0.5,0,-2)
    // seamUp: (0.5,0,-2) → (0.5,0,2)
    const w = makeWire([
      orientEdge(e0, false),
      orientEdge(seamDown, true),
      orientEdge(e1, true),
      orientEdge(seamUp, true),
    ]);
    expect(w.success).toBe(true);
    expect(w.result!.isClosed).toBe(true);
    expect(w.result!.edges).toHaveLength(4);
  });

  it('through-hole: shared edges are created for both top and bottom', () => {
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6);
    const boxFaces = shellFaces(box.solid.outerShell);
    const cylFaces = shellFaces(cyl.solid.outerShell);

    // Cylinder has 3 faces: 2 planar caps + 1 cylindrical side
    const cylSide = cylFaces.find(f => f.surface.type === 'cylinder');
    expect(cylSide).toBeDefined();

    // Box top and bottom faces should intersect the cylinder
    let intersectionCount = 0;
    for (const bf of boxFaces) {
      if (bf.surface.type !== 'plane') continue;
      const int = intersectPlaneCylinder(bf.surface.plane, cylSide!.surface);
      if (int.success && int.result && int.result.type === 'circle') {
        intersectionCount++;
      }
    }
    // Top face at z=2 and bottom face at z=-2 both intersect
    expect(intersectionCount).toBeGreaterThanOrEqual(2);
  });

  it('cylinder fully inside box (no through-hole) → correct result', () => {
    // Short cylinder fully inside box
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 2); // z from -1 to 1, inside box
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 64 - Math.PI * 0.25 * 2;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

// ═══════════════════════════════════════════════════════
// F6: EDGE CASES
// ═══════════════════════════════════════════════════════

describe('F6: edge cases', () => {
  it('sphere entirely outside box → subtract returns original box', () => {
    const box = makeBox(10, 10, 10, 2, 2, 2);
    const sphere = makeSphere(0.5); // at origin, far from box
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(8, 0); // 2×2×2 = 8
  });

  it('sphere fully inside box → volume = box − sphere', () => {
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const sphere = makeSphere(0.5);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 64 - (4 / 3) * Math.PI * 0.125;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});
