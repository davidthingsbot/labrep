/**
 * Tests targeting the specific pipeline internals that are under active development:
 *
 * 1. BuilderFace behavior when full circles split periodic surfaces
 *    (cylinder side faces, sphere hemispheres)
 * 2. Face classification (classifySubFace) for curved faces where the
 *    binormal nudge direction matters
 *
 * These tests describe CORRECT geometry. They exercise the exact code paths
 * that have been in a revert loop — self-loop circles on periodic surfaces
 * and both-direction binormal classification.
 *
 * When these pass, we know the pipeline is correct. Old tests that disagree
 * with these should be updated.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, distance } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, addPCurveToEdge } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { Face, makeFace } from '../../src/topology/face';
import { shellFaces } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { booleanSubtract, booleanUnion, booleanIntersect } from '../../src/operations/boolean';
import { builderFace } from '../../src/operations/builder-face';
import { buildPCurveForEdgeOnSurface, evaluateCurve2D } from '../../src/topology/pcurve';
import { toAdapter } from '../../src/surfaces/surface-adapter';
import { solidToMesh } from '../../src/mesh/tessellation';

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
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d).result!;
}

function makeCylinder(r: number, height: number, cx = 0, cy = 0, cz = 0) {
  const circlePlane = plane(point3d(cx, cy, cz - height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const axis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!, makeEdgeFromCurve(arc2).result!, makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI).result!;
}

// ═══════════════════════════════════════════════════════
// GROUP A: BuilderFace — full circles on cylindrical surfaces
//
// When a plane intersects a cylinder, it produces a full circle.
// On the cylinder's periodic UV domain, this circle's start and end
// are the same 3D point (the seam). BuilderFace must handle this
// so the circle becomes part of the tube boundary wire, NOT a
// standalone self-loop face.
// ═══════════════════════════════════════════════════════

describe('BuilderFace: full circle on cylinder surface', () => {
  // Create a cylinder side face and split it with a circle
  function getCylinderSideFace(): Face {
    const cyl = makeCylinder(2, 10); // r=2, h=10, z from -5 to 5
    const faces = shellFaces(cyl.solid.outerShell);
    // The side face is the cylindrical one (not the planar caps)
    return faces.find(f => f.surface.type === 'cylinder')!;
  }

  it('splitting cylinder side with one circle produces 2 faces (not 3)', () => {
    // A circle at z=0 should split the cylinder side into top and bottom halves.
    // Each half should have: circle + seam_up + cap_circle + seam_down
    // NOT: standalone circle face + seam-only face + seam-only face
    const sideFace = getCylinderSideFace();
    expect(sideFace).toBeDefined();

    // Create a circle at z=0 on this cylinder (r=2, centered at origin)
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, 2).result!;
    const edge = makeEdgeFromCurve(circle).result!;

    // Add PCurve on the cylinder surface
    const pc = buildPCurveForEdgeOnSurface(edge, sideFace.surface, true);
    if (pc) addPCurveToEdge(edge, pc);

    const result = builderFace(sideFace, [edge]);
    // Should be exactly 2 faces: top half and bottom half of the cylinder
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
      // Each face should have more than just 1 edge (not a standalone circle)
      // and more than just 2 edges (not just seam lines)
      expect(f.outerWire.edges.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('splitting cylinder side with two circles produces 3 faces', () => {
    const sideFace = getCylinderSideFace();
    expect(sideFace).toBeDefined();

    // Two circles at z=-2 and z=2
    const edges = [-2, 2].map(z => {
      const cp = plane(point3d(0, 0, z), vec3d(0, 0, 1), vec3d(1, 0, 0));
      const circle = makeCircle3D(cp, 2).result!;
      const e = makeEdgeFromCurve(circle).result!;
      const pc = buildPCurveForEdgeOnSurface(e, sideFace.surface, true);
      if (pc) addPCurveToEdge(e, pc);
      return e;
    });

    const result = builderFace(sideFace, edges);
    // Should be 3 faces: bottom (z=-5..-2), middle (z=-2..2), top (z=2..5)
    expect(result.length).toBe(3);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════
// GROUP B: BuilderFace — full circles on spherical surfaces
//
// Same issue as cylinder but on a sphere. The intersection
// of a plane with a sphere produces a circle that, on the
// sphere's periodic UV domain, has start=end at the seam.
// ═══════════════════════════════════════════════════════

describe('BuilderFace: full circle on sphere surface', () => {
  function getTopHemisphere(): Face {
    const sphere = makeSphere(3);
    const faces = shellFaces(sphere.solid.outerShell);
    return faces.filter(f => f.surface.type === 'sphere').find(f => {
      return f.outerWire.edges.some(oe => {
        if (oe.edge.degenerate) return false;
        const s = edgeStartPoint(oe.edge);
        const e = edgeEndPoint(oe.edge);
        return s.z > 0.1 || e.z > 0.1;
      });
    })!;
  }

  it('circle at z=1.5 splits top hemisphere into 2 faces', () => {
    const hemi = getTopHemisphere();
    expect(hemi).toBeDefined();

    // Circle at z=1.5: intersection of plane z=1.5 with sphere r=3
    // Circle radius = sqrt(9 - 2.25) = sqrt(6.75) ≈ 2.598
    const circleR = Math.sqrt(9 - 2.25);
    const cp = plane(point3d(0, 0, 1.5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(cp, circleR).result!;
    const edge = makeEdgeFromCurve(circle).result!;

    const pc = buildPCurveForEdgeOnSurface(edge, hemi.surface, true);
    if (pc) addPCurveToEdge(edge, pc);

    const result = builderFace(hemi, [edge]);
    // Should produce 2 faces: spherical cap above z=1.5 and zone below
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════
// GROUP C: Boolean classification — cylinder tube faces
//
// When a cylinder passes through a box, the boolean must:
// 1. Correctly classify the cylinder's TUBE face as "inside" the box
// 2. Include the tube face in the result (it's the bore wall)
// 3. Produce a closed shell with the tube connected to the box holes
//
// The old classification incorrectly marked tube faces as "outside"
// because the binormal nudge at a seam edge pointed wrong.
// ═══════════════════════════════════════════════════════

describe('Classification: cylinder tube included in subtract result', () => {
  it('box minus centered cylinder includes cylindrical bore face', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const cyl = makeCylinder(1, 8); // extends beyond box
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFaces = faces.filter(f => f.surface.type === 'cylinder');
    // Must have at least one cylindrical face (the bore wall)
    expect(cylFaces.length).toBeGreaterThan(0);
    // The cylindrical face should be reversed (cavity wall points inward)
    expect(cylFaces.some(f => f.forward === false)).toBe(true);
  });

  it('box minus off-center cylinder includes cylindrical bore face', () => {
    const box = makeBox(0, 0, -3, 8, 8, 6);
    const cyl = makeCylinder(1, 8, 2, 2, 0); // off-center
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFaces = faces.filter(f => f.surface.type === 'cylinder');
    expect(cylFaces.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// GROUP D: Boolean classification — sphere cavity faces
//
// When a sphere is fully inside a box, ALL sphere faces
// should be classified as "inside" and included reversed.
// This tests the UV interior point fallback classification.
// ═══════════════════════════════════════════════════════

describe('Classification: sphere cavity faces included', () => {
  it('box minus contained sphere has reversed sphere faces', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const sphereFaces = faces.filter(f => f.surface.type === 'sphere');
    // Both hemisphere cavity faces should be present
    expect(sphereFaces.length).toBe(2);
    // All should be reversed (cavity)
    expect(sphereFaces.every(f => f.forward === false)).toBe(true);
  });

  it('sphere cavity volume is correct', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000 - (4 / 3) * Math.PI * 8;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

// ═══════════════════════════════════════════════════════
// GROUP E: Full pipeline — through-hole topology
//
// The through-hole is THE test for the pave-block issue.
// A correct through-hole result has:
// - 6 planar faces (2 with circular holes)
// - 1+ cylindrical face (the bore wall)
// - All circle edges shared between planar holes and bore
// - Closed shell
// ═══════════════════════════════════════════════════════

describe('Through-hole topology', () => {
  it('small box + thin cylinder: closed shell with bore', () => {
    const box = makeBox(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const planeWithHoles = faces.filter(
      f => f.surface.type === 'plane' && f.innerWires.length > 0,
    );
    // Top and bottom faces should each have a circular hole
    expect(planeWithHoles.length).toBe(2);
  });

  it('large box + large cylinder: volume and shell', () => {
    const box = makeBox(0, 0, -10, 20, 20, 20);
    const cyl = makeCylinder(3, 24);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    const vol = solidVolume(result.result!.solid);
    const expected = 8000 - Math.PI * 9 * 20;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('through-hole at different Z position', () => {
    // Box from z=5 to z=15. Cylinder centered at z=10.
    const box = makeBox(0, 0, 5, 6, 6, 10);
    const cyl = makeCylinder(1, 14, 0, 0, 10); // z=3..17
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    const vol = solidVolume(result.result!.solid);
    const expected = 360 - Math.PI * 1 * 10;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

// ═══════════════════════════════════════════════════════
// GROUP F: Edge sharing — circle edges match between faces
//
// For a closed shell, every edge must appear exactly twice
// (once forward, once reversed). The circle edges at the
// top/bottom of a through-hole must be shared between the
// planar face (hole boundary) and the cylindrical face
// (tube boundary).
// ═══════════════════════════════════════════════════════

describe('Edge sharing: circles shared between faces', () => {
  it('through-hole circle edges appear in both planar and cylindrical faces', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const cyl = makeCylinder(1, 8);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);

    // Collect all circle edges from all faces (outer + inner wires)
    const circleEdges: { face: Face; edge: any; forward: boolean }[] = [];
    for (const f of faces) {
      for (const oe of f.outerWire.edges) {
        if (oe.edge.curve.type === 'circle3d' || oe.edge.curve.type === 'arc3d') {
          circleEdges.push({ face: f, edge: oe.edge, forward: oe.forward });
        }
      }
      for (const iw of f.innerWires) {
        for (const oe of iw.edges) {
          if (oe.edge.curve.type === 'circle3d' || oe.edge.curve.type === 'arc3d') {
            circleEdges.push({ face: f, edge: oe.edge, forward: oe.forward });
          }
        }
      }
    }

    // There should be circle/arc edges on both planar and cylindrical faces
    const onPlane = circleEdges.filter(e => e.face.surface.type === 'plane');
    const onCyl = circleEdges.filter(e => e.face.surface.type === 'cylinder');
    expect(onPlane.length).toBeGreaterThan(0);
    expect(onCyl.length).toBeGreaterThan(0);
  });
});
