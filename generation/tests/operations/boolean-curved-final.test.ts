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
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
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
