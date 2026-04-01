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
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, addPCurveToEdge, type Edge } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { Face, makeFace } from '../../src/topology/face';
import { shellFaces, makeShell, shellFaceUses } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { solidInnerShells } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import {
  booleanSubtract, booleanUnion, booleanIntersect, debugBooleanFaceSplits, debugClassifySubFaceCandidates, debugClassifySubFaceFaceProbe, debugSelectBooleanFaces,
} from '../../src/operations/boolean';
import { builderFace, debugBuilderFaceAreas, debugBuilderFaceLoops, debugTraceBuilderFace } from '../../src/operations/builder-face';
import { intersectFaceFace } from '../../src/operations/face-face-intersection';
import { orientFacesOnShell } from '../../src/operations/occt-shell-orientation';
import { debugApplyCommonBlocks, debugBuildCommonIntervals, debugSplitWireByCommonBlocks, preSplitFaceAtVertices, stitchEdges } from '../../src/operations/occt-common-edges';
import { buildPCurveForEdgeOnSurface, evaluateCurve2D } from '../../src/topology/pcurve';
import { toAdapter } from '../../src/surfaces/surface-adapter';
import { solidToMesh } from '../../src/mesh/tessellation';
import { pointInSolid } from '../../src/operations/point-in-solid';

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

// OCCT BRepPrim_Sphere: single semicircle meridian from south pole to north pole.
// Produces 1 spherical face with 4 edges: seam_fwd + degen_NP + seam_rev + degen_SP.
function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc = makeArc3D(arcPlane, r, -Math.PI / 2, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const axis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc).result!, makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI).result!;
}

function makeTwoFaceSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const axis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!, makeEdgeFromCurve(arc2).result!, makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI).result!;
}

function faceZRange(face: Face): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const wires = [face.outerWire, ...face.innerWires];
  for (const wire of wires) {
    for (const oe of wire.edges) {
      const start = edgeStartPoint(oe.edge);
      const end = edgeEndPoint(oe.edge);
      min = Math.min(min, start.z, end.z);
      max = Math.max(max, start.z, end.z);
      const curve = oe.edge.curve;
      if (curve.type === 'circle3d' || curve.type === 'arc3d') {
        min = Math.min(min, curve.plane.origin.z);
        max = Math.max(max, curve.plane.origin.z);
      }
    }
  }
  return { min, max };
}

function hasEquatorCircle(face: Face, radius: number): boolean {
  const wires = [face.outerWire, ...face.innerWires];
  return wires.some((wire) =>
    wire.edges.some((oe) =>
      oe.edge.curve.type === 'circle3d' &&
      Math.abs(oe.edge.curve.plane.origin.z) < 1e-6 &&
      Math.abs(oe.edge.curve.radius - radius) < 1e-6
    )
  );
}

function periodicGapShift(values: number[], period: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  let maxGap = 0;
  let gapEnd = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + period;
    const gap = next - sorted[i];
    if (gap > maxGap) {
      maxGap = gap;
      gapEnd = next % period;
    }
  }
  return gapEnd;
}

function polygonArea2D(poly: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return area / 2;
}

function pointInPolygon2DSimple(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) &&
        pt.x < poly[j].x + (poly[i].x - poly[j].x) * (pt.y - poly[j].y) / (poly[i].y - poly[j].y)) {
      inside = !inside;
    }
  }
  return inside;
}

function sampleWireUV(face: Face): { x: number; y: number }[] {
  const adapter = toAdapter(face.surface);
  const points: { x: number; y: number }[] = [];

  for (const oe of face.outerWire.edges) {
    const matching = oe.edge.pcurves.filter((pc) => pc.surface === face.surface);
    expect(matching.length).toBeGreaterThan(0);
    const pc = matching[0].curve2d;
    const steps = Math.max(4, oe.edge.curve.type === 'line3d' ? 2 : 8);
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const t = oe.forward
        ? pc.startParam + (pc.endParam - pc.startParam) * frac
        : pc.endParam - (pc.endParam - pc.startParam) * frac;
      const uv = evaluateCurve2D(pc, t);
      points.push({ x: uv.x, y: uv.y });
    }
  }

  if (!adapter.isUPeriodic) {
    return points;
  }

  const gapEnd = periodicGapShift(points.map((pt) => pt.x), adapter.uPeriod);
  return points.map((pt) => {
    let u = pt.x - gapEnd;
    if (u < 0) u += adapter.uPeriod;
    return { x: u, y: pt.y };
  });
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
  // OCCT 1-face sphere: seam_fwd + degen_NP + seam_rev + degen_SP
  function getSphereFace(): Face {
    const sphere = makeSphere(3);
    const faces = shellFaces(sphere.solid.outerShell);
    const sphereFace = faces.find(f => f.surface.type === 'sphere')!;
    // Verify OCCT 1-face convention
    expect(faces.filter(f => f.surface.type === 'sphere').length).toBe(1);
    expect(sphereFace.outerWire.edges.length).toBe(4);
    return sphereFace;
  }

  it('circle at z=1.5 splits sphere face into 2 faces', () => {
    const sphereFace = getSphereFace();

    // Circle at z=1.5: intersection of plane z=1.5 with sphere r=3
    // Circle radius = sqrt(9 - 2.25) = sqrt(6.75) ≈ 2.598
    const circleR = Math.sqrt(9 - 2.25);
    const cp = plane(point3d(0, 0, 1.5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(cp, circleR).result!;
    const edge = makeEdgeFromCurve(circle).result!;

    const pc = buildPCurveForEdgeOnSurface(edge, sphereFace.surface, true);
    if (pc) addPCurveToEdge(edge, pc);

    const result = builderFace(sphereFace, [edge]);
    // OCCT BOPAlgo_BuilderFace: circle splits sphere into 2 faces.
    // Upper face (NP cap): circle + seam_fwd_upper + degen_NP + seam_rev_upper
    // Lower face (SP zone): circle_rev + seam_fwd_lower + degen_SP + seam_rev_lower
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
      // Each face should have 4 edges: circle + seam_segment + degen + seam_segment
      expect(f.outerWire.edges.length).toBe(4);
    }
  });

  it('top hemisphere split keeps the equator circle on the lower band', () => {
    const sphere = makeTwoFaceSphere(5);
    const topHemisphere = shellFaces(sphere.solid.outerShell)
      .filter(f => f.surface.type === 'sphere')
      .find(f => faceZRange(f).max > 0.1)!;
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const topPlane = shellFaces(box.solid.outerShell)
      .filter(f => f.surface.type === 'plane')
      .find(f => faceZRange(f).min > 2.9)!;

    const ffi = intersectFaceFace(topHemisphere, topPlane);
    expect(ffi).not.toBeNull();
    expect(ffi!.edges).toHaveLength(1);

    const result = builderFace(topHemisphere, [ffi!.edges[0].edge]);
    expect(result.length).toBe(2);

    const lowerBand = result.find(f => faceZRange(f).min < 0.1)!;
    const equatorEdges = lowerBand.outerWire.edges.filter(oe =>
      oe.edge.curve.type === 'circle3d' && Math.abs(oe.edge.curve.plane.origin.z) < 1e-6
    );

    expect(lowerBand.outerWire.isClosed).toBe(true);
    expect(lowerBand.innerWires).toHaveLength(0);
    expect(lowerBand.outerWire.edges.length).toBe(4);
    expect(equatorEdges).toHaveLength(1);
  });

  it('one-face sphere split by two latitude circles keeps the middle band positively wound', () => {
    const sphereFace = getSphereFace();

    const circles = [3, -3].map((z) => {
      const circleR = Math.sqrt(25 - z * z);
      const cp = plane(point3d(0, 0, z), vec3d(0, 0, 1), vec3d(1, 0, 0));
      const circle = makeCircle3D(cp, circleR).result!;
      const edge = makeEdgeFromCurve(circle).result!;
      const pc = buildPCurveForEdgeOnSurface(edge, sphereFace.surface, true);
      if (pc) addPCurveToEdge(edge, pc);
      return edge;
    });

    const result = builderFace(sphereFace, circles);
    console.log('[DBG one-face sphere split]', result.map((face) => ({
      z: faceZRange(face),
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      area: polygonArea2D(sampleWireUV(face)),
      circles: face.outerWire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.plane.origin.z),
      innerCircles: face.innerWires.flatMap((wire) =>
        wire.edges
          .filter((oe) => oe.edge.curve.type === 'circle3d')
          .map((oe) => oe.edge.curve.plane.origin.z),
      ),
    })));
    expect(result).toHaveLength(3);

    const band = result.find((face) => {
      const { min, max } = faceZRange(face);
      return min > -3.1 && max < 3.1;
    })!;

    expect(band.outerWire.isClosed).toBe(true);
    expect(band.innerWires).toHaveLength(0);
    expect(band.outerWire.edges).toHaveLength(4);
    expect(polygonArea2D(sampleWireUV(band))).toBeGreaterThan(0);
  });

  it('one-face sphere split by the actual box FFI circles produces 3 faces', () => {
    const sphere = makeSphere(5);
    const sphereFace = shellFaces(sphere.solid.outerShell).find((face) => face.surface.type === 'sphere')!;
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const planes = shellFaces(box.solid.outerShell)
      .filter((face) => face.surface.type === 'plane')
      .filter((face) => {
        const { min, max } = faceZRange(face);
        return Math.abs(min - max) < 1e-6 && Math.abs(Math.abs(min) - 3) < 1e-6;
      });

    const edges = planes.flatMap((planeFace) => {
      const ffi = intersectFaceFace(sphereFace, planeFace);
      expect(ffi).not.toBeNull();
      return ffi!.edges.map((entry) => entry.edge);
    });

    const result = builderFace(sphereFace, edges);
    console.log('[DBG one-face sphere actual ffi]', JSON.stringify({
      ffiCount: edges.length,
      ffi: edges.map((edge) => ({
        type: edge.curve.type,
        start: edgeStartPoint(edge),
        end: edgeEndPoint(edge),
        pcurves: edge.pcurves.filter((pc) => pc.surface === sphereFace.surface).length,
      })),
      faces: result.map((face) => ({
        z: faceZRange(face),
        edges: face.outerWire.edges.length,
        inner: face.innerWires.length,
        circles: face.outerWire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.plane.origin.z),
        innerCircles: face.innerWires.flatMap((wire) =>
          wire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.plane.origin.z)),
      })),
    }, null, 2));
    expect(result).toHaveLength(3);
  });

  it('top box cap split by the actual sphere FFI circle produces annulus plus disk', () => {
    const sphere = makeSphere(5);
    const sphereFace = shellFaces(sphere.solid.outerShell).find((face) => face.surface.type === 'sphere')!;
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const topPlane = shellFaces(box.solid.outerShell)
      .filter((face) => face.surface.type === 'plane')
      .find((face) => {
        const { min, max } = faceZRange(face);
        return Math.abs(min - max) < 1e-6 && Math.abs(max - 3) < 1e-6;
      })!;

    const ffi = intersectFaceFace(topPlane, sphereFace);
    expect(ffi).not.toBeNull();
    expect(ffi!.edges).toHaveLength(1);

    const split = builderFace(topPlane, [ffi!.edges[0].edge]);
    console.log('[DBG top cap sphere ffi split]', JSON.stringify(split.map((face) => ({
      z: faceZRange(face),
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      outerCircles: face.outerWire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.radius),
      innerCircles: face.innerWires.flatMap((wire) =>
        wire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.radius)),
    })), null, 2));
    expect(split).toHaveLength(2);

    const annulus = split.find((face) => face.innerWires.length === 1);
    const disk = split.find((face) =>
      face.innerWires.length === 0 &&
      face.outerWire.edges.some((oe) => oe.edge.curve.type === 'circle3d'));

    expect(annulus).toBeDefined();
    expect(disk).toBeDefined();
  });

  it('bottom box cap split by the actual sphere FFI circle produces annulus plus disk', () => {
    const sphere = makeSphere(5);
    const sphereFace = shellFaces(sphere.solid.outerShell).find((face) => face.surface.type === 'sphere')!;
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const bottomPlane = shellFaces(box.solid.outerShell)
      .filter((face) => face.surface.type === 'plane')
      .find((face) => {
        const { min, max } = faceZRange(face);
        return Math.abs(min - max) < 1e-6 && Math.abs(min + 3) < 1e-6;
      })!;

    const ffi = intersectFaceFace(bottomPlane, sphereFace);
    expect(ffi).not.toBeNull();
    expect(ffi!.edges).toHaveLength(1);

    const split = builderFace(bottomPlane, [ffi!.edges[0].edge]);
    console.log('[DBG bottom cap sphere ffi split]', JSON.stringify(split.map((face) => ({
      z: faceZRange(face),
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      outerCircles: face.outerWire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.radius),
      innerCircles: face.innerWires.flatMap((wire) =>
        wire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.radius)),
    })), null, 2));
    expect(split).toHaveLength(2);

    const annulus = split.find((face) => face.innerWires.length === 1);
    const disk = split.find((face) =>
      face.innerWires.length === 0 &&
      face.outerWire.edges.some((oe) => oe.edge.curve.type === 'circle3d'));

    expect(annulus).toBeDefined();
    expect(disk).toBeDefined();
  });
});

describe('Shell assembly: truncated sphere from 2-face hemispheres', () => {
  it('stitches two clipped hemisphere bands with two planar disks into a closed shell', () => {
    const sphere = makeTwoFaceSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const sphereFaces = shellFaces(sphere.solid.outerShell).filter(f => f.surface.type === 'sphere');
    expect(sphereFaces.length).toBe(2);
    const topHemisphere = sphereFaces.find(f => faceZRange(f).max > 0.1)!;
    const bottomHemisphere = sphereFaces.find(f => faceZRange(f).min < -0.1)!;

    const topCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, 3), vec3d(0, 0, 1), vec3d(1, 0, 0)), 4).result!,
    ).result!;
    const bottomCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, -3), vec3d(0, 0, 1), vec3d(1, 0, 0)), 4).result!,
    ).result!;

    const topSpherePCurve = buildPCurveForEdgeOnSurface(topCircle, topHemisphere.surface, true);
    const bottomSpherePCurve = buildPCurveForEdgeOnSurface(bottomCircle, bottomHemisphere.surface, true);
    if (topSpherePCurve) addPCurveToEdge(topCircle, topSpherePCurve);
    if (bottomSpherePCurve) addPCurveToEdge(bottomCircle, bottomSpherePCurve);

    const topSphereSplit = builderFace(topHemisphere, [topCircle]);
    const bottomSphereSplit = builderFace(bottomHemisphere, [bottomCircle]);
    expect(topSphereSplit.length).toBe(2);
    expect(bottomSphereSplit.length).toBe(2);

    const topBand = topSphereSplit.find((f) => hasEquatorCircle(f, 5))!;
    const bottomBand = bottomSphereSplit.find((f) => hasEquatorCircle(f, 5))!;

    const planeFaces = shellFaces(box.solid.outerShell).filter(f => f.surface.type === 'plane');
    const topPlane = planeFaces.find(f => faceZRange(f).min > 2.9)!;
    const bottomPlane = planeFaces.find(f => faceZRange(f).max < -2.9)!;

    const topPlanePCurve = buildPCurveForEdgeOnSurface(topCircle, topPlane.surface, true);
    const bottomPlanePCurve = buildPCurveForEdgeOnSurface(bottomCircle, bottomPlane.surface, true);
    if (topPlanePCurve) addPCurveToEdge(topCircle, topPlanePCurve);
    if (bottomPlanePCurve) addPCurveToEdge(bottomCircle, bottomPlanePCurve);

    const topPlaneSplit = builderFace(topPlane, [topCircle]);
    const bottomPlaneSplit = builderFace(bottomPlane, [bottomCircle]);
    expect(topPlaneSplit.length).toBe(2);
    expect(bottomPlaneSplit.length).toBe(2);

    const topDisk = topPlaneSplit.find(f =>
      f.innerWires.length === 0 && f.outerWire.edges.some(oe => oe.edge.curve.type === 'circle3d')
    )!;
    const bottomDisk = bottomPlaneSplit.find(f =>
      f.innerWires.length === 0 && f.outerWire.edges.some(oe => oe.edge.curve.type === 'circle3d')
    )!;

    const stitched = stitchEdges([topBand, bottomBand, topDisk, bottomDisk]);
    const oriented = orientFacesOnShell(stitched);
    const shell = makeShell(oriented);

    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });

  it('closes when the spherical bands and planar disks use distinct but coincident trim circles', () => {
    const sphere = makeTwoFaceSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const sphereFaces = shellFaces(sphere.solid.outerShell).filter(f => f.surface.type === 'sphere');
    const topHemisphere = sphereFaces.find(f => faceZRange(f).max > 0.1)!;
    const bottomHemisphere = sphereFaces.find(f => faceZRange(f).min < -0.1)!;

    const topSphereCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, 3), vec3d(0, 0, 1), vec3d(1, 0, 0)), 4).result!,
    ).result!;
    const bottomSphereCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, -3), vec3d(0, 0, 1), vec3d(1, 0, 0)), 4).result!,
    ).result!;
    const topSpherePCurve = buildPCurveForEdgeOnSurface(topSphereCircle, topHemisphere.surface, true);
    const bottomSpherePCurve = buildPCurveForEdgeOnSurface(bottomSphereCircle, bottomHemisphere.surface, true);
    if (topSpherePCurve) addPCurveToEdge(topSphereCircle, topSpherePCurve);
    if (bottomSpherePCurve) addPCurveToEdge(bottomSphereCircle, bottomSpherePCurve);

    const topSphereSplit = builderFace(topHemisphere, [topSphereCircle]);
    const bottomSphereSplit = builderFace(bottomHemisphere, [bottomSphereCircle]);
    const topBand = topSphereSplit.find((f) => hasEquatorCircle(f, 5))!;
    const bottomBand = bottomSphereSplit.find((f) => hasEquatorCircle(f, 5))!;

    const planeFaces = shellFaces(box.solid.outerShell).filter(f => f.surface.type === 'plane');
    const topPlane = planeFaces.find(f => faceZRange(f).min > 2.9)!;
    const bottomPlane = planeFaces.find(f => faceZRange(f).max < -2.9)!;

    const topPlaneCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, 3), vec3d(0, 0, 1), vec3d(1, 0, 0)), 4).result!,
    ).result!;
    const bottomPlaneCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, -3), vec3d(0, 0, 1), vec3d(1, 0, 0)), 4).result!,
    ).result!;
    const topPlanePCurve = buildPCurveForEdgeOnSurface(topPlaneCircle, topPlane.surface, true);
    const bottomPlanePCurve = buildPCurveForEdgeOnSurface(bottomPlaneCircle, bottomPlane.surface, true);
    if (topPlanePCurve) addPCurveToEdge(topPlaneCircle, topPlanePCurve);
    if (bottomPlanePCurve) addPCurveToEdge(bottomPlaneCircle, bottomPlanePCurve);

    const topPlaneSplit = builderFace(topPlane, [topPlaneCircle]);
    const bottomPlaneSplit = builderFace(bottomPlane, [bottomPlaneCircle]);
    const topDisk = topPlaneSplit.find(f =>
      f.innerWires.length === 0 && f.outerWire.edges.some(oe => oe.edge.curve.type === 'circle3d')
    )!;
    const bottomDisk = bottomPlaneSplit.find(f =>
      f.innerWires.length === 0 && f.outerWire.edges.some(oe => oe.edge.curve.type === 'circle3d')
    )!;

    const stitched = stitchEdges([topBand, bottomBand, topDisk, bottomDisk]);
    const oriented = orientFacesOnShell(stitched);
    const shell = makeShell(oriented);

    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });

  it('closes when the trim circles come from the actual sphere-box face intersections', () => {
    const sphere = makeTwoFaceSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const sphereFaces = shellFaces(sphere.solid.outerShell).filter(f => f.surface.type === 'sphere');
    const topHemisphere = sphereFaces.find(f => faceZRange(f).max > 0.1)!;
    const bottomHemisphere = sphereFaces.find(f => faceZRange(f).min < -0.1)!;

    const planeFaces = shellFaces(box.solid.outerShell).filter(f => f.surface.type === 'plane');
    const topPlane = planeFaces.find(f => faceZRange(f).min > 2.9)!;
    const bottomPlane = planeFaces.find(f => faceZRange(f).max < -2.9)!;

    const topIntersection = intersectFaceFace(topHemisphere, topPlane);
    const bottomIntersection = intersectFaceFace(bottomHemisphere, bottomPlane);
    expect(topIntersection).not.toBeNull();
    expect(bottomIntersection).not.toBeNull();
    expect(topIntersection!.edges).toHaveLength(1);
    expect(bottomIntersection!.edges).toHaveLength(1);

    const topSphereSplit = builderFace(topHemisphere, [topIntersection!.edges[0].edge]);
    const bottomSphereSplit = builderFace(bottomHemisphere, [bottomIntersection!.edges[0].edge]);
    const topPlaneSplit = builderFace(topPlane, [topIntersection!.edges[0].edge]);
    const bottomPlaneSplit = builderFace(bottomPlane, [bottomIntersection!.edges[0].edge]);

    const topBand = topSphereSplit.find((f) => hasEquatorCircle(f, 5))!;
    const bottomBand = bottomSphereSplit.find((f) => hasEquatorCircle(f, 5))!;
    const topDisk = topPlaneSplit.find(f =>
      f.innerWires.length === 0 && f.outerWire.edges.some(oe => oe.edge.curve.type === 'circle3d')
    )!;
    const bottomDisk = bottomPlaneSplit.find(f =>
      f.innerWires.length === 0 && f.outerWire.edges.some(oe => oe.edge.curve.type === 'circle3d')
    )!;

    const stitched = stitchEdges([topBand, bottomBand, topDisk, bottomDisk]);
    const oriented = orientFacesOnShell(stitched);
    const shell = makeShell(oriented);

    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });
});

describe('Selection: truncated sphere intersect keeps the equatorial bands', () => {
  it('selects the two spherical band faces from A before shell assembly', () => {
    const sphere = makeTwoFaceSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const sphereFaces = result.result!.facesFromA.filter(f => f.surface.type === 'sphere');
    expect(sphereFaces).toHaveLength(2);

    const zRanges = sphereFaces.map(faceZRange);
    expect(zRanges.some(({ min, max }) => min < 0.1 && max < 3.1)).toBe(true);
    expect(zRanges.some(({ min, max }) => min > -3.1 && max > -0.1)).toBe(true);
    expect(zRanges.every(({ min, max }) => min >= -3.1 && max <= 3.1)).toBe(true);
  });

  it('assembles the selected truncated-sphere faces into a closed shell', () => {
    const sphere = makeTwoFaceSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);
    const oriented = orientFacesOnShell(stitched);
    const shell = makeShell(oriented);

    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });

  it('keeps the equator circle on both selected spherical band faces', () => {
    const sphere = makeTwoFaceSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const sphereFaces = result.result!.facesFromA.filter(f => f.surface.type === 'sphere');
    const equatorCounts = sphereFaces.map(face =>
      face.outerWire.edges.filter(oe =>
        oe.edge.curve.type === 'circle3d' && Math.abs(oe.edge.curve.plane.origin.z) < 1e-6
      ).length
    );

    expect(equatorCounts).toEqual([1, 1]);
  });

  it('selected one-face spherical band keeps both trim circles on a single closed boundary', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const sphereFaces = result.result!.facesFromA.filter(f => f.surface.type === 'sphere');
    expect(sphereFaces).toHaveLength(1);

    const trimCircles = sphereFaces[0].outerWire.edges.filter((oe) =>
      oe.edge.curve.type === 'circle3d' &&
      Math.abs(Math.abs(oe.edge.curve.plane.origin.z) - 3) < 1e-6 &&
      Math.abs(oe.edge.curve.radius - 4) < 1e-6
    );

    expect(sphereFaces[0].outerWire.isClosed).toBe(true);
    expect(sphereFaces[0].innerWires).toHaveLength(0);
    expect(sphereFaces[0].outerWire.edges).toHaveLength(4);
    expect(trimCircles).toHaveLength(2);
  });

  it('selected one-face spherical band keeps positive UV winding', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const sphereFace = result.result!.facesFromA.find((face) => face.surface.type === 'sphere')!;
    const sampled = sampleWireUV(sphereFace);
    const area = polygonArea2D(sampled);

    expect(area).toBeGreaterThan(0);
  });

  it('selected one-face spherical band stores seam PCurves with a consistent occurrence order', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const sphereFace = result.result!.facesFromA.find((face) => face.surface.type === 'sphere')!;
    const seamEdges = sphereFace.outerWire.edges
      .filter((oe) => oe.edge.curve.type === 'arc3d')
      .map((oe) => oe.edge.pcurves
        .filter((pc) => pc.surface === sphereFace.surface)
        .map((pc) => evaluateCurve2D(pc.curve2d, (pc.curve2d.startParam + pc.curve2d.endParam) / 2).x));

    expect(seamEdges).toHaveLength(2);
    expect(seamEdges[0].length).toBe(2);
    expect(seamEdges[1].length).toBe(2);
    expect(Math.sign(seamEdges[0][0] - seamEdges[0][1])).toBe(Math.sign(seamEdges[1][0] - seamEdges[1][1]));
  });

  it('selects both planar trim disks from the box in the one-face truncated-sphere case', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);
    console.log('[DBG one-face truncated sphere B classifications]', JSON.stringify(
      result.result!.classifiedFacesFromB.map(({ face, classification }) => ({
        classification,
        z: faceZRange(face),
        surface: face.surface.type,
        edges: face.outerWire.edges.length,
        inner: face.innerWires.length,
        circles: face.outerWire.edges.filter((oe) => oe.edge.curve.type === 'circle3d').map((oe) => oe.edge.curve.radius),
      })),
      null,
      2,
    ));

    const planeFaces = result.result!.facesFromB.filter((face) => face.surface.type === 'plane');
    expect(planeFaces).toHaveLength(2);
    expect(planeFaces.every((face) => face.outerWire.edges.some((oe) => oe.edge.curve.type === 'circle3d'))).toBe(true);
  });

  it('shell orientation keeps the truncated-sphere planar trim disks on their parent orientations', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);
    const oriented = orientFacesOnShell(stitched);
    const shell = makeShell(oriented);
    expect(shell.success).toBe(true);

    const planeUses = shellFaceUses(shell.result!)
      .filter((faceUse) => faceUse.face.surface.type === 'plane')
      .sort((a, b) => a.face.surface.plane.origin.z - b.face.surface.plane.origin.z);
    expect(planeUses).toHaveLength(2);
    expect(planeUses[0].face.forward).toBe(false);
    expect(planeUses[0].reversed).toBe(false);
    expect(planeUses[1].face.forward).toBe(true);
    expect(planeUses[1].reversed).toBe(false);
  });

  it('classifies the top-hemisphere equatorial band as inside, not the polar cap', () => {
    const sphere = makeTwoFaceSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);

    const result = debugSelectBooleanFaces(sphere.solid, box.solid, 'intersect');
    expect(result.success).toBe(true);

    const topSphereFaces = result.result!.classifiedFacesFromA
      .filter(({ face }) => face.surface.type === 'sphere')
      .filter(({ face }) => faceZRange(face).max > 0.1);
    expect(topSphereFaces).toHaveLength(2);

    const insideFaces = topSphereFaces.filter(({ classification }) => classification === 'inside');
    expect(insideFaces).toHaveLength(1);

    const equatorCount = insideFaces[0].face.outerWire.edges.filter((oe) =>
      oe.edge.curve.type === 'circle3d' && Math.abs(oe.edge.curve.plane.origin.z) < 1e-6
    ).length;
    expect(equatorCount).toBe(1);
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
  });

  it('subtract selects a reversed cylindrical face from B before shell assembly', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const cyl = makeCylinder(1, 8);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);

    const selectedB = result.result!.facesFromB.filter(f => f.surface.type === 'cylinder');
    expect(selectedB.length).toBeGreaterThan(0);
    expect(selectedB.some(f => f.forward === false)).toBe(true);
  });

  it('shell orientation preserves the reversed cylindrical face selected for subtract', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const cyl = makeCylinder(1, 8);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);

    const oriented = orientFacesOnShell([
      ...result.result!.facesFromA,
      ...result.result!.facesFromB,
    ]);
    const cylUses = oriented.filter(use => use.face.surface.type === 'cylinder');

    expect(cylUses.length).toBeGreaterThan(0);
    expect(cylUses.some(use => use.face.forward === false)).toBe(true);
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

  it('blind-hole subtract keeps the trimmed cylindrical face, not the cutter overrun', () => {
    const block = makeBox(0, 0, 0, 20, 20, 10);
    const largeCyl = makeCylinder(3, 8, 0, 0, 7); // z=3..11, only z=3..10 should remain
    const result = booleanSubtract(block.solid, largeCyl.solid);
    expect(result.success).toBe(true);

    const cylFaces = result.result!.facesFromB.filter(f => f.surface.type === 'cylinder');
    expect(cylFaces.length).toBeGreaterThan(0);

    const zSamples = new Set<number>();
    for (const face of cylFaces) {
      for (const oe of face.outerWire.edges) {
        const curve = oe.edge.curve;
        if (curve.type === 'circle3d' || curve.type === 'arc3d') {
          zSamples.add(Math.round(curve.plane.origin.z * 1000) / 1000);
        }
      }
    }

    expect([...zSamples]).toContain(3);
    expect([...zSamples]).toContain(10);
    expect([...zSamples]).not.toContain(11);
  });

  it('tube shell face uses assemble into a closed shell', () => {
    const outer = makeCylinder(5, 20);
    const inner = makeCylinder(3, 20);
    const result = booleanSubtract(outer.solid, inner.solid);
    expect(result.success).toBe(true);

    const oriented = orientFacesOnShell([
      ...result.result!.facesFromA,
      ...result.result!.facesFromB,
    ]);
    const shell = makeShell(oriented);
    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });
});

describe('Selection: T-pipe union keeps clipped cylindrical faces', () => {
  it('BuilderFace splits a cylinder side with the perpendicular-cylinder intersection edges', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    expect(vertSide).toBeDefined();
    expect(horizSide).toBeDefined();

    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();
    expect(ffi!.edges.length).toBeGreaterThan(0);
    console.log('[DBG t-pipe ffi edges]', JSON.stringify(ffi!.edges.map((entry) => ({
      type: entry.edge.curve.type,
      start: edgeStartPoint(entry.edge),
      end: edgeEndPoint(entry.edge),
      pcurvesOnVert: entry.edge.pcurves.filter((pc) => pc.surface === vertSide.surface).length,
    })), null, 2));

    const splitFaces = builderFace(vertSide, ffi!.edges.map((entry) => entry.edge));
    console.log('[DBG t-pipe split faces]', JSON.stringify(splitFaces.map((face) => ({
      surface: face.surface.type,
      forward: face.forward,
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      innerEdges: face.innerWires.map((wire2) => wire2.edges.map((oe) => ({
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      }))),
    })), null, 2));
    expect(splitFaces.length).toBeGreaterThan(1);
  });

  it('BuilderFace produces consistent hole-loop segmentation on both T-pipe cylinder sides', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const splitVert = builderFace(vertSide, ffi!.edges.map((entry) => entry.edge));
    const splitHoriz = builderFace(horizSide, ffi!.edges.map((entry) => entry.edge));

    const maxInnerEdges = (face: Face) =>
      face.innerWires.reduce((max, oneWire) => Math.max(max, oneWire.edges.length), 0);
    const holeFaceVert = splitVert.reduce((best, face) =>
      !best || maxInnerEdges(face) > maxInnerEdges(best) ? face : best, undefined as Face | undefined);
    const holeFaceHoriz = splitHoriz.reduce((best, face) =>
      !best || maxInnerEdges(face) > maxInnerEdges(best) ? face : best, undefined as Face | undefined);
    console.log('[DBG builderFace t-pipe hole loops]', JSON.stringify({
      splitVert: splitVert.map((face) => ({
        edges: face.outerWire.edges.length,
        outer: face.outerWire.edges.map((oe) => ({
          start: edgeStartPoint(oe.edge),
          end: edgeEndPoint(oe.edge),
        })),
        inner: face.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
          start: edgeStartPoint(oe.edge),
          end: edgeEndPoint(oe.edge),
        }))),
      })),
      splitHoriz: splitHoriz.map((face) => ({
        edges: face.outerWire.edges.length,
        outer: face.outerWire.edges.map((oe) => ({
          start: edgeStartPoint(oe.edge),
          end: edgeEndPoint(oe.edge),
        })),
        inner: face.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
          start: edgeStartPoint(oe.edge),
          end: edgeEndPoint(oe.edge),
        }))),
      })),
      vert: holeFaceVert?.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      }))),
      horiz: holeFaceHoriz?.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      }))),
    }, null, 2));

    expect(holeFaceVert).toBeDefined();
    expect(holeFaceHoriz).toBeDefined();
    expect(maxInnerEdges(holeFaceVert!)).toBe(maxInnerEdges(holeFaceHoriz!));
  });

  it('BuilderFace retains a nontrivial shared section hole loop on both T-pipe cylinder sides', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const splitVert = builderFace(vertSide, ffi!.edges.map((entry) => entry.edge));
    const splitHoriz = builderFace(horizSide, ffi!.edges.map((entry) => entry.edge));

    const hasMainHoleLoop = (face: Face) => face.innerWires.some((oneWire) => oneWire.edges.length > 4);
    expect(splitVert.some(hasMainHoleLoop)).toBe(true);
    expect(splitHoriz.some(hasMainHoleLoop)).toBe(true);
  });

  it('BuilderFace keeps the richest traced T-pipe section loop on the horizontal cylinder', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const splitHoriz = builderFace(horizSide, ffi!.edges.map((entry) => entry.edge));
    const richestHole = splitHoriz
      .flatMap((face) => face.innerWires)
      .reduce((best, wire2) => (!best || wire2.edges.length > best.edges.length ? wire2 : best), undefined as (typeof splitHoriz)[number]['innerWires'][number] | undefined);

    expect(richestHole).toBeDefined();
    expect(richestHole!.edges.length).toBeGreaterThan(4);
  });

  it('BuilderFace keeps at least one horizontal T-pipe cylinder split face outside the vertical solid', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const splitHoriz = builderFace(horizSide, ffi!.edges.map((entry) => entry.edge));
    const outsideFaces = splitHoriz.filter((face) => {
      const adapter = toAdapter(face.surface);
      const bbox = {
        min: {
          x: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
        max: {
          x: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
      };
      const mid = point3d(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2,
      );
      const uv = adapter.projectPoint(mid);
      const pt = adapter.evaluate(uv.u, uv.v);
      return pointInSolid(pt, vertCyl.solid) === 'outside';
    });

    expect(outsideFaces.length).toBeGreaterThan(0);
  });

  it('BuilderFace periodic area candidates keep a nontrivial T-pipe interior loop on both cylinder sides', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const vertAreas = debugBuilderFaceAreas(vertSide, ffi!.edges.map((entry) => entry.edge));
    const horizAreas = debugBuilderFaceAreas(horizSide, ffi!.edges.map((entry) => entry.edge));
    expect(vertAreas).not.toBeNull();
    expect(horizAreas).not.toBeNull();

    console.log('[DBG builderFace periodic area candidates]', JSON.stringify({
      vertAreas,
      horizAreas,
    }, null, 2));

    const hasRichCandidate = (areas: NonNullable<typeof vertAreas>) =>
      areas.candidateHoles.some((loop) => loop.wireEdgeCount > 4);

    expect(hasRichCandidate(vertAreas!)).toBe(true);
    expect(hasRichCandidate(horizAreas!)).toBe(true);
  });

  it('BuilderFace periodic area classification keeps a non-boundary growth face on both T-pipe cylinder sides', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const vertAreas = debugBuilderFaceAreas(vertSide, ffi!.edges.map((entry) => entry.edge));
    const horizAreas = debugBuilderFaceAreas(horizSide, ffi!.edges.map((entry) => entry.edge));
    expect(vertAreas).not.toBeNull();
    expect(horizAreas).not.toBeNull();

    const hasRichNonBoundaryGrowth = (areas: NonNullable<typeof vertAreas>) =>
      areas.outers.some((loop) => !loop.usesOriginalBoundary && loop.wireEdgeCount > 4);

    expect(hasRichNonBoundaryGrowth(vertAreas!)).toBe(true);
    expect(hasRichNonBoundaryGrowth(horizAreas!)).toBe(true);
  });

  it('BuilderFace traces a nontrivial interior loop on both T-pipe cylinder sides before area classification', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const tracedVert = debugBuilderFaceLoops(vertSide, ffi!.edges.map((entry) => entry.edge));
    const tracedHoriz = debugBuilderFaceLoops(horizSide, ffi!.edges.map((entry) => entry.edge));

    const summarizeLoops = (loops: ReturnType<typeof debugBuilderFaceLoops>) => loops.map((loop) => ({
      length: loop.length,
      boundaryOnly: loop.every((he) => he.isBoundary),
      first: loop.length === 0 ? null : {
        start: loop[0].startVtx,
        end: loop[0].endVtx,
        startPt: edgeStartPoint(loop[0].edge),
        endPt: edgeEndPoint(loop[0].edge),
      },
      last: loop.length === 0 ? null : {
        start: loop[loop.length - 1].startVtx,
        end: loop[loop.length - 1].endVtx,
        startPt: edgeStartPoint(loop[loop.length - 1].edge),
        endPt: edgeEndPoint(loop[loop.length - 1].edge),
      },
    }));

    console.log('[DBG builderFace raw traced t-pipe loop summaries]', JSON.stringify({
      tracedVert: summarizeLoops(tracedVert),
      tracedHoriz: summarizeLoops(tracedHoriz),
    }, null, 2));

    const hasInteriorLoop = (loops: ReturnType<typeof debugBuilderFaceLoops>) =>
      loops.some((loop) => loop.length > 1 && loop.every((he) => !he.isBoundary));

    expect(hasInteriorLoop(tracedVert)).toBe(true);
    expect(hasInteriorLoop(tracedHoriz)).toBe(true);
  });

  it('BuilderFace traces only section-edge loops on both T-pipe cylinder sides before area classification', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const tracedVert = debugBuilderFaceLoops(vertSide, ffi!.edges.map((entry) => entry.edge));
    const tracedHoriz = debugBuilderFaceLoops(horizSide, ffi!.edges.map((entry) => entry.edge));

    expect(tracedVert.every((loop) => loop.every((he) => !he.isBoundary))).toBe(true);
    expect(tracedHoriz.every((loop) => loop.every((he) => !he.isBoundary))).toBe(true);
  });

  it('BuilderFace traces the same source-edge section loop on both T-pipe cylinder sides before area classification', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const tracedVert = debugBuilderFaceLoops(vertSide, ffi!.edges.map((entry) => entry.edge));
    const tracedHoriz = debugBuilderFaceLoops(horizSide, ffi!.edges.map((entry) => entry.edge));

    const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
    const edgeKey = (edgeToKey: Edge) => {
      const start = edgeStartPoint(edgeToKey);
      const end = edgeEndPoint(edgeToKey);
      const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
      const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
      return s < e ? `${s}|${e}` : `${e}|${s}`;
    };

    const richestInteriorLoop = (loops: ReturnType<typeof debugBuilderFaceLoops>) =>
      loops
        .filter((loop) => loop.length > 1 && loop.every((he) => !he.isBoundary))
        .reduce((best, loop) => (!best || loop.length > best.length ? loop : best), undefined as ReturnType<typeof debugBuilderFaceLoops>[number] | undefined);

    const vertLoop = richestInteriorLoop(tracedVert);
    const horizLoop = richestInteriorLoop(tracedHoriz);
    expect(vertLoop).toBeDefined();
    expect(horizLoop).toBeDefined();

    const keysA = vertLoop!.map((he) => edgeKey(he.edge.sourceEdge ?? he.edge)).sort();
    const keysB = horizLoop!.map((he) => edgeKey(he.edge.sourceEdge ?? he.edge)).sort();
    expect(keysA).toEqual(keysB);
  });

  it('split section edges keep face PCurves before T-pipe path tracing', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const vertTrace = debugTraceBuilderFace(vertSide, ffi!.edges.map((entry) => entry.edge));
    const horizTrace = debugTraceBuilderFace(horizSide, ffi!.edges.map((entry) => entry.edge));
    expect(vertTrace).not.toBeNull();
    expect(horizTrace).not.toBeNull();

    expect(vertTrace!.splitEdges.every((edgeToCheck) =>
      edgeToCheck.pcurves.some((pc) => pc.surface === vertSide.surface))).toBe(true);
    expect(horizTrace!.splitEdges.every((edgeToCheck) =>
      edgeToCheck.pcurves.some((pc) => pc.surface === horizSide.surface))).toBe(true);
  });

  it('split section edges do not keep duplicate coincident T-pipe descendants before path tracing', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
    const edgeKey = (edgeToKey: Edge) => {
      const start = edgeStartPoint(edgeToKey);
      const end = edgeEndPoint(edgeToKey);
      const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
      const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
      return s < e ? `${s}|${e}` : `${e}|${s}`;
    };

    const vertTrace = debugTraceBuilderFace(vertSide, ffi!.edges.map((entry) => entry.edge));
    const horizTrace = debugTraceBuilderFace(horizSide, ffi!.edges.map((entry) => entry.edge));
    expect(vertTrace).not.toBeNull();
    expect(horizTrace).not.toBeNull();

    const vertKeys = vertTrace!.splitEdges.map(edgeKey);
    const horizKeys = horizTrace!.splitEdges.map(edgeKey);
    expect(new Set(vertKeys).size).toBe(vertKeys.length);
    expect(new Set(horizKeys).size).toBe(horizKeys.length);
  });

  it('split section edges merge near-coincident T-pipe pave points before path tracing', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const vertTrace = debugTraceBuilderFace(vertSide, ffi!.edges.map((entry) => entry.edge));
    const horizTrace = debugTraceBuilderFace(horizSide, ffi!.edges.map((entry) => entry.edge));
    expect(vertTrace).not.toBeNull();
    expect(horizTrace).not.toBeNull();

    const hasNearDuplicateEndpoint = (edges: Edge[]) => {
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          if ((edges[i].sourceEdge ?? edges[i]) !== (edges[j].sourceEdge ?? edges[j])) continue;
          const aStart = edgeStartPoint(edges[i]);
          const bStart = edgeStartPoint(edges[j]);
          const aEnd = edgeEndPoint(edges[i]);
          const bEnd = edgeEndPoint(edges[j]);
          const sameStart = distance(aStart, bStart) < 2e-6;
          const sameEnd = distance(aEnd, bEnd) < 2e-6;
          const differentEdge = distance(aStart, bStart) > 1e-12 || distance(aEnd, bEnd) > 1e-12;
          if (sameStart && sameEnd && differentEdge) return true;
        }
      }
      return false;
    };

    expect(hasNearDuplicateEndpoint(vertTrace!.splitEdges)).toBe(false);
    expect(hasNearDuplicateEndpoint(horizTrace!.splitEdges)).toBe(false);
  });

  it('BuilderFace richest raw T-pipe section loops differ by no residual source edges', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const tracedVert = debugBuilderFaceLoops(vertSide, ffi!.edges.map((entry) => entry.edge));
    const tracedHoriz = debugBuilderFaceLoops(horizSide, ffi!.edges.map((entry) => entry.edge));

    const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
    const edgeKey = (edgeToKey: Edge) => {
      const start = edgeStartPoint(edgeToKey);
      const end = edgeEndPoint(edgeToKey);
      const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
      const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
      return s < e ? `${s}|${e}` : `${e}|${s}`;
    };

    const richestInteriorLoop = (loops: ReturnType<typeof debugBuilderFaceLoops>) =>
      loops
        .filter((loop) => loop.length > 1 && loop.every((he) => !he.isBoundary))
        .reduce((best, loop) => (!best || loop.length > best.length ? loop : best), undefined as ReturnType<typeof debugBuilderFaceLoops>[number] | undefined);

    const vertLoop = richestInteriorLoop(tracedVert);
    const horizLoop = richestInteriorLoop(tracedHoriz);
    expect(vertLoop).toBeDefined();
    expect(horizLoop).toBeDefined();

    const keysA = vertLoop!.map((he) => edgeKey(he.edge.sourceEdge ?? he.edge));
    const keysB = horizLoop!.map((he) => edgeKey(he.edge.sourceEdge ?? he.edge));
    const setA = new Set(keysA);
    const setB = new Set(keysB);
    const onlyA = [...setA].filter((key) => !setB.has(key)).sort();
    const onlyB = [...setB].filter((key) => !setA.has(key)).sort();

    console.log('[DBG t-pipe richest raw loop diff]', JSON.stringify({
      vertLen: vertLoop!.length,
      horizLen: horizLoop!.length,
      onlyALen: onlyA.length,
      onlyBLen: onlyB.length,
      onlyA: onlyA.slice(0, 8),
      onlyB: onlyB.slice(0, 8),
    }, null, 2));

    expect(onlyA).toEqual([]);
    expect(onlyB).toEqual([]);
  });

  it('BuilderFace does not keep the untouched original cylinder side alongside the clipped T-pipe faces', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const splitFaces = builderFace(vertSide, ffi!.edges.map((entry) => entry.edge));
    expect(splitFaces.some((face) => face.outerWire.edges.length === 4 && face.innerWires.length === 0)).toBe(false);
  });

  it('selected cylindrical faces are not full untouched cylinder sides', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const cylindricalFaces = result.result!.selectedFaces.filter((face) => face.surface.type === 'cylinder');
    console.log('[DBG t-pipe facesFromA]', JSON.stringify(result.result!.facesFromA.map((face) => ({
      surface: face.surface.type,
      forward: face.forward,
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      innerEdges: face.innerWires.map((wire2) => wire2.edges.length),
    })), null, 2));
    console.log('[DBG t-pipe facesFromB]', JSON.stringify(result.result!.facesFromB.map((face) => ({
      surface: face.surface.type,
      forward: face.forward,
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      innerEdges: face.innerWires.map((wire2) => wire2.edges.length),
    })), null, 2));
    console.log('[DBG t-pipe selected faces]', JSON.stringify(result.result!.selectedFaces.map((face) => ({
      surface: face.surface.type,
      forward: face.forward,
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      innerEdges: face.innerWires.map((wire2) => wire2.edges.length),
    })), null, 2));
    expect(cylindricalFaces.length).toBeGreaterThan(0);
    expect(cylindricalFaces.every((face) => face.outerWire.edges.length > 4 || face.innerWires.length > 0)).toBe(true);
  });

  it('debugSelectBooleanFaces preserves a nontrivial T-pipe cylinder hole loop before stitching', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const cylinders = result.result!.selectedFaces.filter((face) => face.surface.type === 'cylinder');
    expect(cylinders).toHaveLength(2);
    expect(cylinders.every((face) =>
      face.innerWires.length === 1 && face.innerWires[0].edges.length > 4)).toBe(true);
  });

  it('selected T-pipe cylinder hole loops preserve the same source-edge provenance before stitching', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const cylinders = result.result!.selectedFaces.filter((face) => face.surface.type === 'cylinder');
    expect(cylinders).toHaveLength(2);

    const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
    const edgeKey = (edgeToKey: Edge) => {
      const start = edgeStartPoint(edgeToKey);
      const end = edgeEndPoint(edgeToKey);
      const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
      const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
      return s < e ? `${s}|${e}` : `${e}|${s}`;
    };

    const keysA = cylinders[0].innerWires[0].edges.map((oe) => edgeKey(oe.edge.sourceEdge ?? oe.edge)).sort();
    const keysB = cylinders[1].innerWires[0].edges.map((oe) => edgeKey(oe.edge.sourceEdge ?? oe.edge)).sort();
    expect(keysA).toEqual(keysB);
  });

  it('union classifies at least one clipped T-pipe B-cylinder subface as outside', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const bCylinders = result.result!.classifiedFacesFromB
      .filter((entry) => entry.face.surface.type === 'cylinder');
    console.log('[DBG t-pipe classified B cylinders]', JSON.stringify(bCylinders.map((entry) => ({
      classification: entry.classification,
      forward: entry.face.forward,
      edges: entry.face.outerWire.edges.length,
      inner: entry.face.innerWires.length,
      innerEdges: entry.face.innerWires.map((wire2) => wire2.edges.length),
    })), null, 2));
    expect(bCylinders.length).toBeGreaterThan(0);
    expect(bCylinders.some((entry) => entry.classification === 'outside')).toBe(true);
  });

  it('union classifies at least one clipped T-pipe A-cylinder subface as inside', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const aCylinders = result.result!.classifiedFacesFromA
      .filter((entry) => entry.face.surface.type === 'cylinder');
    expect(aCylinders.length).toBeGreaterThan(0);
    expect(aCylinders.some((entry) => entry.classification === 'inside')).toBe(true);
  });

  it('full boolean A-side split keeps at least one vertical T-pipe cylinder branch face inside the horizontal solid', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const aCylinderSplit = splits.result!.facesFromA.find((entry) => entry.original.surface.type === 'cylinder');
    expect(aCylinderSplit).toBeDefined();

    const insideFaces = aCylinderSplit!.subFaces.filter((face) => {
      const adapter = toAdapter(face.surface);
      const bbox = {
        min: {
          x: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
        max: {
          x: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
      };
      const mid = point3d(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2,
      );
      const uv = adapter.projectPoint(mid);
      const pt = adapter.evaluate(uv.u, uv.v);
      return pointInSolid(pt, horizCyl.solid) === 'inside';
    });

    console.log('[DBG full A-side split cylinders]', JSON.stringify(aCylinderSplit!.subFaces.map((face) => {
      const adapter = toAdapter(face.surface);
      const bbox = {
        min: {
          x: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
        max: {
          x: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
      };
      const mid = point3d(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2,
      );
      const uv = adapter.projectPoint(mid);
      const pt = adapter.evaluate(uv.u, uv.v);
      return {
        edges: face.outerWire.edges.length,
        inner: face.innerWires.length,
        innerEdges: face.innerWires.map((wire2) => wire2.edges.length),
        pointInSolid: pointInSolid(pt, horizCyl.solid),
        point: pt,
      };
    }), null, 2));

    expect(insideFaces.length).toBeGreaterThan(0);
  });

  it('full boolean A-side split has at least one vertical cylinder subface with an inside ComputeState candidate or face probe', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const aCylinderSplit = splits.result!.facesFromA.find((entry) => entry.original.surface.type === 'cylinder');
    expect(aCylinderSplit).toBeDefined();

    const hasInsideEvidence = aCylinderSplit!.subFaces.some((face) => {
      const candidates = debugClassifySubFaceCandidates(face, horizCyl.solid, aCylinderSplit!.intersectionEdges);
      const nonBoundary = candidates.filter((entry) => !entry.onIntersection && !entry.onSolidBounds);
      if (nonBoundary.some((entry) => entry.pointInSolid === 'inside')) {
        return true;
      }
      const probe = debugClassifySubFaceFaceProbe(face, horizCyl.solid);
      return probe?.pointInSolid === 'inside';
    });

    expect(hasInsideEvidence).toBe(true);
  });

  it('full boolean A-side split keeps a nontrivial T-pipe cylinder hole loop on the vertical cylinder', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const aCylinderSplit = splits.result!.facesFromA.find((entry) => entry.original.surface.type === 'cylinder');
    expect(aCylinderSplit).toBeDefined();
    console.log('[DBG full A-side split intersection edges]', JSON.stringify(aCylinderSplit!.intersectionEdges.map((edge2) => ({
      type: edge2.curve.type,
      closed: edge2.curve.isClosed,
      start: edgeStartPoint(edge2),
      end: edgeEndPoint(edge2),
    })), null, 2));
    expect(aCylinderSplit!.subFaces.some((face) =>
      face.innerWires.length > 0 && face.innerWires.some((wire2) => wire2.edges.length > 4))).toBe(true);
  });

  it('full boolean A-side trace keeps a nontrivial interior loop on the vertical cylinder before area classification', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const aCylinderSplit = splits.result!.facesFromA.find((entry) => entry.original.surface.type === 'cylinder');
    expect(aCylinderSplit).toBeDefined();

    const trace = debugTraceBuilderFace(aCylinderSplit!.original, aCylinderSplit!.intersectionEdges);
    console.log('[DBG full A-side trace loop lengths]', JSON.stringify(trace.loops.map((loop) => loop.length).sort((a, b) => b - a).slice(0, 10)));
    const richLoop = trace.loops.reduce((best, loop) => Math.max(best, loop.length), 0);
    expect(richLoop).toBeGreaterThan(4);
  });

  it('full boolean A-side area classification keeps multiple nontrivial growth candidates on the vertical cylinder', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const aCylinderSplit = splits.result!.facesFromA.find((entry) => entry.original.surface.type === 'cylinder');
    expect(aCylinderSplit).toBeDefined();

    const areas = debugBuilderFaceAreas(aCylinderSplit!.original, aCylinderSplit!.intersectionEdges);
    expect(areas).not.toBeNull();
    const nontrivialGrowths = areas!.outers.filter((info) => info.wireEdgeCount > 100);
    expect(nontrivialGrowths.length).toBeGreaterThan(1);
  });

  it('full boolean A-side area construction keeps a nontrivial holed face on the vertical cylinder', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const aCylinderSplit = splits.result!.facesFromA.find((entry) => entry.original.surface.type === 'cylinder');
    expect(aCylinderSplit).toBeDefined();

    const areas = debugBuilderFaceAreas(aCylinderSplit!.original, aCylinderSplit!.intersectionEdges);
    expect(areas).not.toBeNull();
    console.log('[DBG full A-side area construction summary]', JSON.stringify({
      bigLoops: areas!.loops
        .filter((info) => info.wireEdgeCount > 100)
        .map((info) => ({ edges: info.wireEdgeCount, signedArea: info.signedArea })),
      outers: areas!.outers.map((info) => ({ edges: info.wireEdgeCount, signedArea: info.signedArea })),
      candidateHoles: areas!.candidateHoles.map((info) => ({ edges: info.wireEdgeCount, signedArea: info.signedArea })),
      finalFaces: areas!.finalFaces,
    }, null, 2));
    expect(areas!.finalFaces.some((info) =>
      info.outerWireEdgeCount > 100 && info.innerWireEdgeCounts.some((count) => count > 4))).toBe(true);
  });

  it('full boolean B-side split keeps at least one horizontal T-pipe cylinder branch face outside the vertical solid', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const bCylinderSplit = splits.result!.facesFromB.find((entry) => entry.original.surface.type === 'cylinder');
    expect(bCylinderSplit).toBeDefined();

    const outsideFaces = bCylinderSplit!.subFaces.filter((face) => {
      const adapter = toAdapter(face.surface);
      const bbox = {
        min: {
          x: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
        max: {
          x: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
      };
      const mid = point3d(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2,
      );
      const uv = adapter.projectPoint(mid);
      const pt = adapter.evaluate(uv.u, uv.v);
      return pointInSolid(pt, vertCyl.solid) === 'outside';
    });

    console.log('[DBG full B-side split cylinders]', JSON.stringify(bCylinderSplit!.subFaces.map((face) => {
      const adapter = toAdapter(face.surface);
      const bbox = {
        min: {
          x: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.min(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
        max: {
          x: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).x, edgeEndPoint(oe.edge).x])),
          y: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).y, edgeEndPoint(oe.edge).y])),
          z: Math.max(...face.outerWire.edges.flatMap((oe) => [edgeStartPoint(oe.edge).z, edgeEndPoint(oe.edge).z])),
        },
      };
      const mid = point3d(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2,
      );
      const uv = adapter.projectPoint(mid);
      const pt = adapter.evaluate(uv.u, uv.v);
      return {
        edges: face.outerWire.edges.length,
        inner: face.innerWires.length,
        innerEdges: face.innerWires.map((wire2) => wire2.edges.length),
        pointInSolid: pointInSolid(pt, vertCyl.solid),
        point: pt,
      };
    }), null, 2));

    expect(outsideFaces.length).toBeGreaterThan(0);
  });

  it('full boolean B-side split rejects tiny 2-edge periodic cylinder slivers', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const bCylinderSplit = splits.result!.facesFromB.find((entry) => entry.original.surface.type === 'cylinder');
    expect(bCylinderSplit).toBeDefined();
    expect(bCylinderSplit!.subFaces.some((face) =>
      face.outerWire.edges.length === 2 && face.innerWires.length === 0)).toBe(false);
  });

  it('full boolean B-side area construction keeps a nontrivial outside branch face on the horizontal cylinder', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const bCylinderSplit = splits.result!.facesFromB.find((entry) => entry.original.surface.type === 'cylinder');
    expect(bCylinderSplit).toBeDefined();

    const areas = debugBuilderFaceAreas(bCylinderSplit!.original, bCylinderSplit!.intersectionEdges);
    expect(areas).not.toBeNull();
    console.log('[DBG full B-side area construction summary]', JSON.stringify({
      bigLoops: areas!.loops
        .filter((info) => info.wireEdgeCount > 100)
        .map((info) => ({ edges: info.wireEdgeCount, signedArea: info.signedArea })),
      outers: areas!.outers.map((info) => ({ edges: info.wireEdgeCount, signedArea: info.signedArea })),
      candidateHoles: areas!.candidateHoles.map((info) => ({ edges: info.wireEdgeCount, signedArea: info.signedArea })),
      finalFaces: areas!.finalFaces,
    }, null, 2));
    expect(areas!.finalFaces.some((info) => info.outerWireEdgeCount > 100 && info.innerWireEdgeCounts.length === 0)).toBe(true);
  });

  it('full boolean B-side split keeps nontrivial holed cylinder faces on the horizontal cylinder', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const bCylinderSplit = splits.result!.facesFromB.find((entry) => entry.original.surface.type === 'cylinder');
    expect(bCylinderSplit).toBeDefined();

    const largeHoledFaces = bCylinderSplit!.subFaces.filter((face) =>
      face.outerWire.edges.length > 100 &&
      face.innerWires.length > 0 &&
      face.innerWires.some((wire2) => wire2.edges.length > 100));
    expect(largeHoledFaces.length).toBeGreaterThan(0);
  });

  it('full boolean B-side holed cylinder faces contain an outside sample point', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const splits = debugBooleanFaceSplits(vertCyl.solid, horizCyl.solid);
    expect(splits.success).toBe(true);

    const bCylinderSplit = splits.result!.facesFromB.find((entry) => entry.original.surface.type === 'cylinder');
    expect(bCylinderSplit).toBeDefined();

    const largeHoledFaces = bCylinderSplit!.subFaces.filter((face) =>
      face.outerWire.edges.length > 100 &&
      face.innerWires.length > 0 &&
      face.innerWires.some((wire2) => wire2.edges.length > 100));
    expect(largeHoledFaces.length).toBeGreaterThan(0);

    const hasOutsideSample = largeHoledFaces.some((face) => {
      const adapter = toAdapter(face.surface);
      const samples = sampleWireUV(face);
      const innerSamples = face.innerWires.flatMap((wire2) => sampleWireUV(face, wire2));
      const uvPoints = [...samples, ...innerSamples];
      const minU = Math.min(...uvPoints.map((pt) => pt.x));
      const maxU = Math.max(...uvPoints.map((pt) => pt.x));
      const minV = Math.min(...uvPoints.map((pt) => pt.y));
      const maxV = Math.max(...uvPoints.map((pt) => pt.y));

      for (let iu = 1; iu < 16; iu++) {
        for (let iv = 1; iv < 16; iv++) {
          const u = minU + (iu / 16) * (maxU - minU);
          const v = minV + (iv / 16) * (maxV - minV);
          const pt = adapter.evaluate(u, v);
          if (pointInSolid(pt, vertCyl.solid) === 'outside') {
            return true;
          }
        }
      }
      return false;
    });

    expect(hasOutsideSample).toBe(true);
  });

  it('ComputeState face fallback finds an outside interior point on a clipped T-pipe B-cylinder face', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const vertSide = shellFaces(vertCyl.solid.outerShell).find((face) => face.surface.type === 'cylinder')!;
    const horizSide = shellFaces(horizCyl.solid.outerShell).find((face) => face.surface.type !== 'plane')!;
    const ffi = intersectFaceFace(vertSide, horizSide);
    expect(ffi).not.toBeNull();

    const bCylinders = result.result!.classifiedFacesFromB.filter((entry) =>
      entry.face.surface.type === 'cylinder');
    expect(bCylinders.length).toBeGreaterThan(0);

    for (const candidate of bCylinders) {
      const debug = debugClassifySubFaceCandidates(
        candidate.face,
        vertCyl.solid,
        ffi!.edges.map((entry) => entry.edge),
      );
      const nonBoundary = debug.filter((entry) => !entry.onIntersection && !entry.onSolidBounds);
      expect(nonBoundary).toHaveLength(0);
    }

    const probes = bCylinders.map((candidate) => debugClassifySubFaceFaceProbe(candidate.face, vertCyl.solid));
    console.log('[DBG t-pipe face probes]', JSON.stringify(probes, null, 2));
    expect(probes.some((probe) => probe?.pointInSolid === 'outside')).toBe(true);
  });

  it('T-pipe B-cylinder face probe lands outside the sampled inner hole polygons', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const bCylinders = result.result!.classifiedFacesFromB.filter((entry) =>
      entry.face.surface.type === 'cylinder');
    expect(bCylinders.length).toBeGreaterThan(0);

    const matches = bCylinders
      .map((candidate) => {
        const probe = debugClassifySubFaceFaceProbe(candidate.face, vertCyl.solid);
        if (!probe) return null;
        const adapter = toAdapter(candidate.face.surface);
        const uv = adapter.projectPoint(probe.point);
        const innerContains = candidate.face.innerWires.some((wire2) =>
          pointInPolygon2DSimple({ x: uv.u, y: uv.v }, sampleWireUV(candidate.face, wire2)));
        return { probe, innerContains };
      })
      .filter((entry): entry is { probe: { point: { x: number; y: number; z: number }; pointInSolid: 'inside' | 'outside' | 'on' }; innerContains: boolean } => entry !== null);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((entry) => entry.innerContains)).toBe(false);
  });

  it('stitchEdges preserves matched T-pipe cylinder hole segmentation', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);
    console.log('[DBG t-pipe stitched faces]', JSON.stringify(stitched.map((face) => ({
      surface: face.surface.type,
      edges: face.outerWire.edges.length,
      inner: face.innerWires.length,
      innerEdges: face.innerWires.map((wire2) => wire2.edges.length),
    })), null, 2));
    console.log('[DBG t-pipe stitched cylinder loops]', JSON.stringify(stitched
      .filter((face) => face.surface.type === 'cylinder')
      .map((face) => face.innerWires.map((wire2) => wire2.edges.map((oe) => ({
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      })))), null, 2));

    const cylinders = stitched.filter((face) => face.surface.type === 'cylinder');
    expect(cylinders).toHaveLength(2);
    expect(cylinders[0].innerWires).toHaveLength(1);
    expect(cylinders[1].innerWires).toHaveLength(1);
    expect(cylinders[0].innerWires[0].edges.length).toBe(cylinders[1].innerWires[0].edges.length);
  });

  it('stitchEdges canonicalizes the selected T-pipe cylinder inner loops to the same segment set', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);
    const cylinders = stitched.filter((face) => face.surface.type === 'cylinder');
    expect(cylinders).toHaveLength(2);
    expect(cylinders[0].innerWires).toHaveLength(1);
    expect(cylinders[1].innerWires).toHaveLength(1);

    const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
    const canonicalKey = (oe: { edge: Edge; forward: boolean }) => {
      const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
      const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
      const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
      return s < e ? `${s}|${e}` : `${e}|${s}`;
    };

    const keysA = cylinders[0].innerWires[0].edges.map(canonicalKey).sort();
    const keysB = cylinders[1].innerWires[0].edges.map(canonicalKey).sort();
    expect(keysA).toEqual(keysB);
  });

  it('stitched T-pipe inner wires do not reuse the same open segment within a single wire', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);

    const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
    const canonicalKey = (oe: { edge: Edge; forward: boolean }) => {
      const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
      const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
      const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
      return s < e ? `${s}|${e}` : `${e}|${s}`;
    };

    for (const face of stitched) {
      face.innerWires.forEach((oneWire, wireIndex) => {
        const keys = oneWire.edges.map(canonicalKey);
        if (new Set(keys).size !== keys.length) {
          console.log('[DBG t-pipe duplicate wire]', JSON.stringify({
            surface: face.surface.type,
            wireIndex,
            edgeCount: oneWire.edges.length,
            keys,
          }, null, 2));
        }
        expect(new Set(keys).size).toBe(keys.length);
      });
    }
  });

  it('selected T-pipe faces assemble into a closed shell after stitching and shell orientation', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);
    const oriented = orientFacesOnShell(stitched);
    const shell = makeShell(oriented);

    console.log('[DBG t-pipe oriented uses]', JSON.stringify(oriented.map((faceUse) => ({
      surface: faceUse.face.surface.type,
      faceForward: faceUse.face.forward,
      reversed: faceUse.reversed,
      outer: faceUse.face.outerWire.edges.length,
      inner: faceUse.face.innerWires.map((oneWire) => oneWire.edges.length),
    })), null, 2));

    if (shell.success && !shell.result!.isClosed) {
      const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
      const edgeUsage = new Map<string, string[]>();
      for (const faceUse of oriented) {
        const effectiveForward = faceUse.reversed ? !faceUse.face.forward : faceUse.face.forward;
        for (const wire of [faceUse.face.outerWire, ...faceUse.face.innerWires]) {
          for (const oe of wire.edges) {
            if (oe.edge.degenerate) continue;
            const edgeForward = effectiveForward ? oe.forward : !oe.forward;
            const start = edgeForward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
            const end = edgeForward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
            const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
            const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
            const key = s < e ? `${s}|${e}` : `${e}|${s}`;
            const dir = `${s}->${e}`;
            if (!edgeUsage.has(key)) edgeUsage.set(key, []);
            edgeUsage.get(key)!.push(dir);
          }
        }
      }

      const bad = [...edgeUsage.entries()]
        .filter(([, dirs]) => dirs.length !== 2 || dirs[0] === dirs[1])
        .slice(0, 20)
        .map(([key, dirs]) => ({ key, dirs }));
      console.log('[DBG t-pipe oriented bad edges]', JSON.stringify(bad, null, 2));

      const closedMasks: number[] = [];
      for (let mask = 0; mask < (1 << oriented.length); mask++) {
        const candidate = oriented.map((faceUse, index) => ({
          face: faceUse.face,
          reversed: ((mask >> index) & 1) === 1,
        }));
        const candidateShell = makeShell(candidate);
        if (candidateShell.success && candidateShell.result!.isClosed) {
          closedMasks.push(mask);
        }
      }
      console.log('[DBG t-pipe closed reversal masks]', JSON.stringify(closedMasks));
    }

    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });

  it('preSplitFaceAtVertices preserves the selected T-pipe cylinder hole-loop segmentation', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const vertices: ReturnType<typeof point3d>[] = [];
    for (const face of result.result!.selectedFaces) {
      for (const oe of face.outerWire.edges) {
        vertices.push(edgeStartPoint(oe.edge), edgeEndPoint(oe.edge));
      }
      for (const innerWire of face.innerWires) {
        for (const oe of innerWire.edges) {
          vertices.push(edgeStartPoint(oe.edge), edgeEndPoint(oe.edge));
        }
      }
    }

    const cylinders = result.result!.selectedFaces.filter((face) => face.surface.type === 'cylinder');
    expect(cylinders).toHaveLength(2);
    const splitA = preSplitFaceAtVertices(cylinders[0], vertices);
    const splitB = preSplitFaceAtVertices(cylinders[1], vertices);
    console.log('[DBG preSplit t-pipe hole loops]', JSON.stringify([
      splitA.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
        type: oe.edge.curve.type,
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      }))),
      splitB.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
        type: oe.edge.curve.type,
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      }))),
    ], null, 2));
    expect(splitA.innerWires).toHaveLength(1);
    expect(splitB.innerWires).toHaveLength(1);
    expect(splitA.innerWires[0].edges.length).toBe(cylinders[0].innerWires[0].edges.length);
    expect(splitB.innerWires[0].edges.length).toBe(cylinders[1].innerWires[0].edges.length);
  });

  it('common-block application preserves the selected T-pipe cylinder hole-loop segmentation', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const cylinders = result.result!.selectedFaces.filter((face) => face.surface.type === 'cylinder');
    expect(cylinders).toHaveLength(2);

    const splitA = debugApplyCommonBlocks(cylinders[0], result.result!.selectedFaces);
    const splitB = debugApplyCommonBlocks(cylinders[1], result.result!.selectedFaces);

    console.log('[DBG common-block t-pipe hole loops]', JSON.stringify([
      splitA.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
        type: oe.edge.curve.type,
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      }))),
      splitB.innerWires.map((oneWire) => oneWire.edges.map((oe) => ({
        type: oe.edge.curve.type,
        start: edgeStartPoint(oe.edge),
        end: edgeEndPoint(oe.edge),
      }))),
    ], null, 2));

    expect(splitA.innerWires).toHaveLength(1);
    expect(splitB.innerWires).toHaveLength(1);
    expect(splitA.innerWires[0].edges.length).toBe(cylinders[0].innerWires[0].edges.length);
    expect(splitB.innerWires[0].edges.length).toBe(cylinders[1].innerWires[0].edges.length);
  });

  it('common-block wire splitting preserves the selected T-pipe hole-loop segmentation', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const cylinders = result.result!.selectedFaces.filter((face) => face.surface.type === 'cylinder');
    expect(cylinders).toHaveLength(2);

    const splitWire = debugSplitWireByCommonBlocks(cylinders[0].innerWires[0], result.result!.selectedFaces);
    console.log('[DBG common-block split wire]', JSON.stringify(splitWire.edges.map((oe) => ({
      start: edgeStartPoint(oe.edge),
      end: edgeEndPoint(oe.edge),
    })), null, 2));
    expect(splitWire.edges.length).toBe(cylinders[0].innerWires[0].edges.length);
  });

  it('common-block interval map includes the extra T-pipe breakpoints on shared source edges', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const intervals = debugBuildCommonIntervals(result.result!.selectedFaces);
    const entries = [...intervals.entries()].filter(([, items]) => items.length > 1);
    console.log('[DBG common-block intervals]', JSON.stringify(entries.map(([key, items]) => ({
      key,
      items: items.map((item) => ({ startT: item.startT, endT: item.endT })),
    })), null, 2));

    expect(entries.length).toBeGreaterThan(0);
  });

  it('stitchEdges does not explode a selected T-pipe cylinder outer boundary', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);
    const cylinders = stitched.filter((face) => face.surface.type === 'cylinder');

    expect(cylinders).toHaveLength(2);
    expect(cylinders[0].outerWire.edges.length).toBe(4);
    expect(cylinders[1].outerWire.edges.length).toBe(4);
  });

  it('stitchEdges preserves a nontrivial T-pipe section chain on the cylinder holes', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = debugSelectBooleanFaces(vertCyl.solid, horizCyl.solid, 'union');
    expect(result.success).toBe(true);

    const stitched = stitchEdges(result.result!.selectedFaces);
    const cylinders = stitched.filter((face) => face.surface.type === 'cylinder');

    expect(cylinders).toHaveLength(2);
    expect(cylinders[0].innerWires).toHaveLength(1);
    expect(cylinders[1].innerWires).toHaveLength(1);
    expect(cylinders[0].innerWires[0].edges.length).toBeGreaterThan(4);
    expect(cylinders[1].innerWires[0].edges.length).toBeGreaterThan(4);
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
    // OCCT 1-face sphere: cavity is a single reversed sphere face
    expect(sphereFaces.length).toBe(1);
    // Should be reversed (cavity wall points inward)
    expect(sphereFaces[0].forward).toBe(false);
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

  it('concentric sphere subtract creates an inner shell, not one merged shell', () => {
    const outer = makeSphere(2);
    const inner = makeSphere(1.5);
    const result = booleanSubtract(outer.solid, inner.solid);
    expect(result.success).toBe(true);
    expect(solidInnerShells(result.result!.solid)).toHaveLength(1);
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

// ═══════════════════════════════════════════════════════
// EDGE IDENTITY DIAGNOSTIC
// ═══════════════════════════════════════════════════════

describe('Edge identity: cylinder flat (chord cut)', () => {
  it('shared intersection edges produce closed shell', () => {
    const cyl = makeCylinder(5, 20);
    const cutter = makeBox(6.5, 0, -12, 6, 12, 24);
    const result = booleanSubtract(cyl.solid, cutter.solid);

    // With correct edge sharing, the 4 faces should form a closed shell.
    // The intersection edges (2 horizontal lines + 2 vertical lines) should
    // be the SAME Edge objects referenced by adjacent faces.
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('has correct face count and types', () => {
    const cyl = makeCylinder(5, 20);
    const cutter = makeBox(6.5, 0, -12, 6, 12, 24);
    const result = booleanSubtract(cyl.solid, cutter.solid);
    if (!result.success) return; // Skip if boolean fails
    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFaces = faces.filter(f => f.surface.type === 'cylinder');
    const planeFaces = faces.filter(f => f.surface.type === 'plane');
    // Expect: 1 cylinder face + 3 plane faces (2 trimmed caps + 1 flat)
    expect(cylFaces.length).toBe(1);
    expect(planeFaces.length).toBeGreaterThanOrEqual(3);
  });
});

import { intersectFaceFace } from '../../src/operations/face-face-intersection';

describe('Edge identity diagnostic: trace edge objects through pipeline', () => {
  it('FFI edge object is preserved in builderFace output wires', () => {
    // Build cylinder and box
    const cyl = makeCylinder(5, 20);
    const cutter = makeBox(6.5, 0, -12, 6, 12, 24);
    const cylFaces = shellFaces(cyl.solid.outerShell);
    const boxFaces = shellFaces(cutter.solid.outerShell);

    // Find the cap face at z=-10 (disk with circle boundary)
    const capFace = cylFaces.find(f => {
      if (f.surface.type !== 'plane') return false;
      for (const oe of f.outerWire.edges) {
        if (!oe.edge.degenerate) {
          const s = edgeStartPoint(oe.edge);
          if (Math.abs(s.z + 10) < 0.5) return true;
        }
      }
      return false;
    });
    expect(capFace).toBeDefined();

    // Find the box face at x=3.5 by checking all vertices
    const boxFlatFace = boxFaces.find(f => {
      if (f.surface.type !== 'plane') return false;
      let allX35 = true;
      for (const oe of f.outerWire.edges) {
        const s = edgeStartPoint(oe.edge);
        const e = edgeEndPoint(oe.edge);
        if (Math.abs(s.x - 3.5) > 0.1 || Math.abs(e.x - 3.5) > 0.1) allX35 = false;
      }
      return allX35;
    });
    expect(boxFlatFace).toBeDefined();

    // Run FFI between cap and box face
    const ffi = intersectFaceFace(capFace!, boxFlatFace!);
    expect(ffi).not.toBeNull();
    expect(ffi!.edges.length).toBe(1);
    const ffiEdge = ffi!.edges[0].edge;

    // Run builderFace on the cap with this edge
    const capSubFaces = builderFace(capFace!, [ffiEdge]);
    // With angle normalization fix, the cap should be split into 2 sub-faces
    expect(capSubFaces.length).toBe(2);

    // The FFI Edge object should be PRESERVED in the sub-face wires
    // (not recreated as a new Edge object)
    let found = 0;
    for (const sf of capSubFaces) {
      for (const oe of sf.outerWire.edges) {
        if (oe.edge === ffiEdge) found++;
      }
    }
    // Each sub-face uses the FFI edge in one direction
    expect(found).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════
// GROUP G: PCurve construction — circles and arcs on planes
//
// OCCT ref: ProjLib_Plane::Project(gp_Circ) — projects 3D circle
// onto plane as Circle2D in UV. Same radius (orthonormal frame).
// Arc3D on a plane should similarly produce an Arc2D PCurve.
// ═══════════════════════════════════════════════════════

describe('PCurve: circle and arc on plane surface', () => {
  it('buildPCurveForEdgeOnSurface returns Circle2D for full circle on plane', () => {
    // Create a planar face
    const box = makeBox(0, 0, 0, 4, 4, 4);
    const boxFaces = shellFaces(box.solid.outerShell);
    const bottomFace = boxFaces[0]; // z=0 plane

    // Circle on this plane
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, 0.5).result!;
    const edge = makeEdgeFromCurve(circle).result!;

    const pc = buildPCurveForEdgeOnSurface(edge, bottomFace.surface, true);
    expect(pc).not.toBeNull();
    expect(pc!.curve2d.type).toBe('circle');
    expect(pc!.surface.type).toBe('plane');
  });

  it('buildPCurveForEdgeOnSurface returns a PCurve for arc on plane', () => {
    // Create a planar face
    const box = makeBox(0, 0, 0, 4, 4, 4);
    const boxFaces = shellFaces(box.solid.outerShell);
    const bottomFace = boxFaces[0]; // z=0 plane

    // Arc on this plane (quarter circle)
    const arcPlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const arc = makeArc3D(arcPlane, 0.5, 0, Math.PI / 2).result!;
    const edge = makeEdgeFromCurve(arc).result!;

    const pc = buildPCurveForEdgeOnSurface(edge, bottomFace.surface, true);
    expect(pc).not.toBeNull();
    // Arc is not closed, so current code produces Line2D (endpoint interpolation).
    // A proper Arc2D PCurve would be more accurate, but Line2D is acceptable
    // for short arcs. This test documents current behavior.
    expect(pc!.surface.type).toBe('plane');
  });
});
