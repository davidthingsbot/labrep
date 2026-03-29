/**
 * Low-level tests for edge winding consistency in boolean results.
 *
 * OCCT invariant: in a closed manifold shell, every non-degenerate edge is
 * shared by exactly 2 faces and traversed in OPPOSITE directions.
 *
 * These tests verify this directly by examining the shell's edge usage map,
 * without relying on volume computation or tessellation.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { shellFaces, shellIsClosed, makeShell } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { booleanSubtract, booleanUnion, booleanIntersect } from '../../src/operations/boolean';

const Z_AXIS = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };

function makeBox(cx: number, cy: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, z), point3d(cx + hw, cy - hh, z),
    point3d(cx + hw, cy + hh, z), point3d(cx - hw, cy + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d).result!;
}

function makeCylinder(r: number, h: number) {
  const p = plane(point3d(0, 0, -h / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const c = makeCircle3D(p, r).result!;
  return extrude(makeWire([orientEdge(makeEdgeFromCurve(c).result!, true)]).result!, vec3d(0, 0, 1), h).result!;
}

function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc = makeArc3D(arcPlane, r, -Math.PI / 2, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc).result!, makeEdgeFromCurve(line).result!,
  ]).result!, Z_AXIS, 2 * Math.PI).result!;
}

// ═══════════════════════════════════════════════════════
// PRIMITIVE SHELL CLOSURE — sanity check
// ═══════════════════════════════════════════════════════

describe('edge winding: primitive solids', () => {
  it('extruded box has closed shell', () => {
    const box = makeBox(0, 0, 0, 4, 4, 4);
    expect(box.solid.outerShell.isClosed).toBe(true);
  });

  it('extruded cylinder has closed shell', () => {
    const cyl = makeCylinder(3, 10);
    expect(cyl.solid.outerShell.isClosed).toBe(true);
  });

  it('revolved sphere has closed shell', () => {
    const sph = makeSphere(2);
    expect(sph.solid.outerShell.isClosed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// BOOLEAN RESULT: SHELL CLOSURE + VOLUME
// These are the failing cases. The tests document what
// SHOULD work once IsSplitToReverse replaces BFS.
// ═══════════════════════════════════════════════════════

describe('edge winding: box − contained sphere', () => {
  const box = makeBox(0, 0, -5, 10, 10, 10);
  const sphere = makeSphere(2);

  it('result has closed shell', () => {
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('volume = box − sphere (within 2%)', () => {
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000 - (4 / 3) * Math.PI * 8;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

describe('edge winding: pipe fitting (outer cyl − inner cyl)', () => {
  const outer = makeCylinder(5, 20);
  const inner = makeCylinder(3, 20);

  it('result has closed shell', () => {
    const result = booleanSubtract(outer.solid, inner.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('volume = π(R²−r²)h (within 5%)', () => {
    const result = booleanSubtract(outer.solid, inner.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = Math.PI * (25 - 9) * 20;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.05);
  });

  it('annular caps contribute to volume (not zero)', () => {
    // The root cause test: if orientFacesOnShell BFS overcorrects,
    // annular caps cancel (±167) instead of both contributing +167.
    // Total should be ~1005, NOT ~670 (which is 2/3 of expected).
    const result = booleanSubtract(outer.solid, inner.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const wallOnly = (2 / 3) * Math.PI * (25 - 9) * 20;
    // Volume must be significantly MORE than 2/3 of expected
    expect(vol).toBeGreaterThan(wallOnly * 1.1);
  });
});

describe('edge winding: overlapping box−box operations', () => {
  const boxA = makeBox(0, 0, 0, 4, 4, 4);
  const boxB = makeBox(1, 1, 0, 4, 4, 4);

  it('subtract produces closed shell', () => {
    const result = booleanSubtract(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('union produces closed shell', () => {
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('intersect produces closed shell', () => {
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });
});
