/**
 * Generalized face splitting tests.
 *
 * Tests splitFaceByCurves which takes a face and intersection edges
 * (from FFI) and produces face fragments.
 *
 * OCCT reference: BOPAlgo_BuilderFace
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, distance, Z_AXIS_3D } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeEllipse3D } from '../../src/geometry/ellipse3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { makeFace, faceOuterWire, faceInnerWires } from '../../src/topology/face';
import { shellFaces } from '../../src/topology/shell';
import { makePlaneSurface } from '../../src/surfaces/plane-surface';
import { extrude } from '../../src/operations/extrude';
import { splitFaceByCurves } from '../../src/operations/split-face';
import type { SplitFaceResult } from '../../src/operations/split-face';

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

/** Make a planar face from corner points. */
function makePlanarFace(corners: { x: number; y: number; z: number }[]) {
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % corners.length]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  const pl = plane(corners[0], vec3d(0, 0, 1), vec3d(1, 0, 0));
  const surf = makePlaneSurface(pl);
  return makeFace(surf, wire).result!;
}

/** Build a box and return its faces. */
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

// ═══════════════════════════════════════════════
// CLOSED CURVE SPLITTING (hole + disk)
// ═══════════════════════════════════════════════

describe('splitFaceByCurves: closed curves', () => {
  it('planar face + full circle inside → 2 fragments (hole + disk)', () => {
    // 4×4 face at z=0
    const face = makePlanarFace([
      point3d(-2, -2, 0), point3d(2, -2, 0),
      point3d(2, 2, 0), point3d(-2, 2, 0),
    ]);

    // Circle R=1 at origin, fully inside
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, 1).result!;
    const circleEdge = makeEdgeFromCurve(circle).result!;

    const result = splitFaceByCurves(face, [circleEdge]);
    expect(result.fragments.length).toBe(2);
    expect(result.sharedEdges.length).toBe(1);
    expect(result.sharedEdges[0]).toBe(circleEdge);

    // One fragment should have an inner wire (the hole)
    const holed = result.fragments.find(f => faceInnerWires(f).length > 0);
    const disk = result.fragments.find(f => faceInnerWires(f).length === 0 && f !== holed);
    expect(holed).toBeDefined();
    expect(disk).toBeDefined();
  });

  it('planar face + full ellipse inside → 2 fragments', () => {
    const face = makePlanarFace([
      point3d(-4, -3, 0), point3d(4, -3, 0),
      point3d(4, 3, 0), point3d(-4, 3, 0),
    ]);

    const ellipsePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const ellipse = makeEllipse3D(ellipsePlane, 3, 2).result!;
    const ellipseEdge = makeEdgeFromCurve(ellipse).result!;

    const result = splitFaceByCurves(face, [ellipseEdge]);
    expect(result.fragments.length).toBe(2);
    expect(result.sharedEdges.length).toBe(1);
  });

  it('multiple closed curves → face with multiple holes + disks', () => {
    const face = makePlanarFace([
      point3d(-5, -3, 0), point3d(5, -3, 0),
      point3d(5, 3, 0), point3d(-5, 3, 0),
    ]);

    // Two small circles, well separated
    const c1Plane = plane(point3d(-2, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const c2Plane = plane(point3d(2, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const e1 = makeEdgeFromCurve(makeCircle3D(c1Plane, 0.8).result!).result!;
    const e2 = makeEdgeFromCurve(makeCircle3D(c2Plane, 0.8).result!).result!;

    const result = splitFaceByCurves(face, [e1, e2]);
    // Should produce: 1 face with 2 holes + 2 disk faces = 3 fragments
    expect(result.fragments.length).toBe(3);
    expect(result.sharedEdges.length).toBe(2);

    // The holed face should have 2 inner wires
    const holed = result.fragments.find(f => faceInnerWires(f).length > 0);
    expect(holed).toBeDefined();
    expect(faceInnerWires(holed!).length).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// EDGE SHARING
// ═══════════════════════════════════════════════

describe('splitFaceByCurves: edge sharing', () => {
  it('shared edge appears in both hole face and disk face', () => {
    const face = makePlanarFace([
      point3d(-2, -2, 0), point3d(2, -2, 0),
      point3d(2, 2, 0), point3d(-2, 2, 0),
    ]);

    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circleEdge = makeEdgeFromCurve(makeCircle3D(circlePlane, 1).result!).result!;

    const result = splitFaceByCurves(face, [circleEdge]);
    expect(result.sharedEdges[0]).toBe(circleEdge);

    // The shared edge should appear in both fragments' wires
    let inHole = false, inDisk = false;
    for (const frag of result.fragments) {
      for (const oe of frag.outerWire.edges) {
        if (oe.edge === circleEdge) inDisk = true;
      }
      for (const iw of faceInnerWires(frag)) {
        for (const oe of iw.edges) {
          if (oe.edge === circleEdge) inHole = true;
        }
      }
    }
    expect(inHole).toBe(true);
    expect(inDisk).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// NO-OP CASES
// ═══════════════════════════════════════════════

describe('splitFaceByCurves: no-op', () => {
  it('empty edge list → returns original face unchanged', () => {
    const face = makePlanarFace([
      point3d(-2, -2, 0), point3d(2, -2, 0),
      point3d(2, 2, 0), point3d(-2, 2, 0),
    ]);

    const result = splitFaceByCurves(face, []);
    expect(result.fragments.length).toBe(1);
    expect(result.fragments[0]).toBe(face);
    expect(result.sharedEdges.length).toBe(0);
  });
});
