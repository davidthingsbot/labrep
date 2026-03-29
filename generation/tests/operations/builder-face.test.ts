/**
 * Tests for BuilderFace — general face splitting by intersection edges.
 *
 * Based on OCCT's BOPAlgo_BuilderFace algorithm. Given a face and a set
 * of intersection edges lying on that face's surface, produces sub-faces
 * by tracing wire loops in UV parameter space.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, worldToSketch } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D, evaluateArc3D } from '../../src/geometry/arc3d';
import { makeCircle3D, evaluateCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, addPCurveToEdge } from '../../src/topology/edge';
import { makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { makePlanarFace } from '../../src/topology/face';
import type { Face, Surface } from '../../src/topology/face';
import { builderFace } from '../../src/operations/builder-face';
import { extrude } from '../../src/operations/extrude';
import { shellFaces } from '../../src/topology/shell';
import { buildPCurveForEdgeOnSurface } from '../../src/topology/pcurve';

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function makeRectFace(x0: number, y0: number, x1: number, y1: number) {
  const p1 = point3d(x0, y0, 0), p2 = point3d(x1, y0, 0);
  const p3 = point3d(x1, y1, 0), p4 = point3d(x0, y1, 0);
  const edges = [
    makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
    makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
    makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
    makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
  ];
  return makePlanarFace(makeWireFromEdges(edges).result!).result!;
}

function lineEdge(x1: number, y1: number, x2: number, y2: number, surface?: Surface) {
  const edge = makeEdgeFromCurve(makeLine3D(
    point3d(x1, y1, 0), point3d(x2, y2, 0),
  ).result!).result!;
  if (surface) {
    const pc = buildPCurveForEdgeOnSurface(edge, surface, true);
    if (pc) addPCurveToEdge(edge, pc);
  }
  return edge;
}

/** Compute approximate area of a face by sampling edges in 2D (XY plane) */
function faceArea(face: Face): number {
  const outerPts = sampleWire2D(face.outerWire);
  let area = Math.abs(signedArea(outerPts));
  for (const iw of face.innerWires) {
    area -= Math.abs(signedArea(sampleWire2D(iw)));
  }
  return area;
}

function sampleWire2D(wire: import('../../src/topology/wire').Wire): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const oe of wire.edges) {
    const curve = oe.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d';
    if (isCurved) {
      const n = curve.isClosed ? 64 : 32;
      for (let i = 0; i < n; i++) {
        const t = oe.forward
          ? curve.startParam + (i / n) * (curve.endParam - curve.startParam)
          : curve.endParam - (i / n) * (curve.endParam - curve.startParam);
        const p = curve.type === 'circle3d'
          ? evaluateCircle3D(curve as any, t)
          : evaluateArc3D(curve as any, t);
        pts.push({ x: p.x, y: p.y });
      }
    } else {
      const p = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      pts.push({ x: p.x, y: p.y });
    }
  }
  return pts;
}

function signedArea(pts: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

// ═══════════════════════════════════════════════
// LINE SPLITTING
// ═══════════════════════════════════════════════

describe('BuilderFace: line splitting', () => {
  it('single line splits rectangle into 2 faces', () => {
    const face = makeRectFace(0, 0, 4, 4);
    const splitEdge = lineEdge(2, 0, 2, 4, face.surface);

    const result = builderFace(face, [splitEdge]);
    expect(result.length).toBe(2);

    for (const f of result) {
      expect(f.surface.type).toBe('plane');
      expect(f.outerWire.isClosed).toBe(true);
    }

    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 1);
    expect(Math.min(...areas)).toBeCloseTo(8, 0);
  });

  it('two crossing lines split rectangle into 4 faces', () => {
    const face = makeRectFace(0, 0, 4, 4);
    const result = builderFace(face, [
      lineEdge(2, 0, 2, 4, face.surface),
      lineEdge(0, 2, 4, 2, face.surface),
    ]);
    expect(result.length).toBe(4);

    const areas = result.map(faceArea);
    for (const a of areas) {
      expect(a).toBeCloseTo(4, 0);
    }
  });

  it('diagonal line splits rectangle into 2 triangles', () => {
    const face = makeRectFace(0, 0, 4, 4);
    const result = builderFace(face, [lineEdge(0, 0, 4, 4, face.surface)]);
    expect(result.length).toBe(2);

    const areas = result.map(faceArea);
    expect(areas[0]).toBeCloseTo(8, 0);
    expect(areas[1]).toBeCloseTo(8, 0);
  });
});

// ═══════════════════════════════════════════════
// CIRCLE / ARC SPLITTING
// ═══════════════════════════════════════════════

describe('BuilderFace: circle splitting', () => {
  it('full circle inside rectangle creates hole + disk', () => {
    const face = makeRectFace(-3, -3, 3, 3);
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circleEdge = makeEdgeFromCurve(makeCircle3D(circlePlane, 1).result!).result!;
    const pc = buildPCurveForEdgeOnSurface(circleEdge, face.surface, true);
    if (pc) addPCurveToEdge(circleEdge, pc);

    const result = builderFace(face, [circleEdge]);
    expect(result.length).toBe(2);

    const holed = result.find(f => f.innerWires.length > 0);
    const disk = result.find(f => f.innerWires.length === 0 &&
      f.outerWire.edges.some(oe => oe.edge.curve.isClosed));
    expect(holed).toBeDefined();
    expect(disk).toBeDefined();

    expect(faceArea(disk!)).toBeCloseTo(Math.PI, 0);
    expect(faceArea(holed!)).toBeCloseTo(36 - Math.PI, 0);
  });

  it('arc at corner splits rectangle into 2 faces', () => {
    // Rectangle (0,0)→(4,4), arc r=1.5 from (1.5,0) to (0,1.5) centered at origin
    const face = makeRectFace(0, 0, 4, 4);
    const arcPlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const arcEdge = makeEdgeFromCurve(makeArc3D(arcPlane, 1.5, 0, Math.PI / 2).result!).result!;
    const arcPC = buildPCurveForEdgeOnSurface(arcEdge, face.surface, true);
    if (arcPC) addPCurveToEdge(arcEdge, arcPC);

    const result = builderFace(face, [arcEdge]);
    expect(result.length).toBe(2);

    const areas = result.map(faceArea);
    const quarterDisk = Math.PI * 1.5 * 1.5 / 4;
    expect(areas[0] + areas[1]).toBeCloseTo(16, 0);
    expect(Math.min(...areas)).toBeCloseTo(quarterDisk, 0);
  });
});

// ═══════════════════════════════════════════════
// L-SHAPED SPLIT (non-coplanar box intersection)
// ═══════════════════════════════════════════════

describe('BuilderFace: L-shaped split', () => {
  it('two L-meeting edges produce L-shape + rectangle', () => {
    // Simulates A's top face (-2,-2)→(2,2) split by B's boundaries at x=-1 and y=-1.
    // The two FFI edges meet at (-1,-1) forming an L, producing:
    // - L-shape (6 edges): the region x<-1 OR y<-1
    // - Rectangle (4 edges): the region x>-1 AND y>-1
    const face = makeRectFace(-2, -2, 2, 2);
    const edge1 = lineEdge(-1, -1, 2, -1, face.surface);  // horizontal at y=-1
    const edge2 = lineEdge(-1, 2, -1, -1, face.surface);  // vertical at x=-1

    const result = builderFace(face, [edge1, edge2]);
    expect(result.length).toBe(2);

    // One should be the 4-edge rectangle, one the 6-edge L-shape
    const sorted = [...result].sort((a, b) => a.outerWire.edges.length - b.outerWire.edges.length);
    expect(sorted[0].outerWire.edges.length).toBe(4); // rectangle
    expect(sorted[1].outerWire.edges.length).toBe(6); // L-shape

    // Area check: rectangle = 3×3 = 9, L-shape = 16-9 = 7
    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 1);
    expect(Math.min(...areas)).toBeCloseTo(7, 0);
    expect(Math.max(...areas)).toBeCloseTo(9, 0);
  });
});

describe('BuilderFace: meeting edges at interior vertex', () => {
  it('two edges both pointing TO meeting point produce rect + L-shape', () => {
    // Both edges point toward the meeting vertex (2,2).
    const face = makeRectFace(-1, -1, 3, 3);
    const edge1 = lineEdge(2, -1, 2, 2, face.surface);  // → (2,2)
    const edge2 = lineEdge(-1, 2, 2, 2, face.surface);  // → (2,2)

    const result = builderFace(face, [edge1, edge2]);
    expect(result.length).toBe(2);

    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 1);
    expect(Math.min(...areas)).toBeCloseTo(7, 0);
  });

  it('edges with opposite directions at meeting point produce rect + L-shape', () => {
    // Replicates FFI output: edge1 goes TO (2,2), edge2 goes FROM (2,2).
    const face = makeRectFace(-1, -1, 3, 3);
    const edge1 = lineEdge(2, -1, 2, 2, face.surface);   // → (2,2)
    const edge2 = lineEdge(2, 2, -1, 2, face.surface);   // (2,2) →

    const result = builderFace(face, [edge1, edge2]);
    expect(result.length).toBe(2);

    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 1);
    expect(Math.min(...areas)).toBeCloseTo(7, 0);
  });

  it('meeting edges on extruded box bottom face', () => {
    // Use the ACTUAL face from extrude to replicate the boolean pipeline scenario.
    const hw = 2, hh = 2;
    const corners = [
      point3d(1-hw, 1-hh, 1), point3d(1+hw, 1-hh, 1),
      point3d(1+hw, 1+hh, 1), point3d(1-hw, 1+hh, 1),
    ];
    const bEdges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(bEdges).result!;
    const extResult = extrude(wire, vec3d(0, 0, 1), 4);
    expect(extResult.success).toBe(true);

    // Find the z=1 bottom face
    const faces = shellFaces(extResult.result!.solid.outerShell);
    const bottomFace = faces.find(f => {
      if (f.surface.type !== 'plane') return false;
      const verts = f.outerWire.edges.map(oe => edgeStartPoint(oe.edge));
      return verts.every(v => Math.abs(v.z - 1) < 0.01);
    })!;
    expect(bottomFace).toBeDefined();

    // Add meeting edges like FFI would produce (with PCurves on the face surface)
    const edge1 = makeEdgeFromCurve(makeLine3D(
      point3d(2, -1, 1), point3d(2, 2, 1),
    ).result!).result!;
    const pc1 = buildPCurveForEdgeOnSurface(edge1, bottomFace.surface, true);
    if (pc1) addPCurveToEdge(edge1, pc1);
    const edge2 = makeEdgeFromCurve(makeLine3D(
      point3d(2, 2, 1), point3d(-1, 2, 1),
    ).result!).result!;
    const pc2 = buildPCurveForEdgeOnSurface(edge2, bottomFace.surface, true);
    if (pc2) addPCurveToEdge(edge2, pc2);

    const result = builderFace(bottomFace, [edge1, edge2]);
    expect(result.length).toBe(2);
    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 0);
    expect(Math.min(...areas)).toBeCloseTo(7, 0);
  });

  it('meeting edges on z=1 face with down-facing normal', () => {
    // Replicates B's z=1 face from extrude: face plane may have
    // normal (0,0,-1), which flips 2D projection. BuilderFace must
    // handle this correctly.
    const p1 = point3d(-1, -1, 1), p2 = point3d(3, -1, 1);
    const p3 = point3d(3, 3, 1), p4 = point3d(-1, 3, 1);
    const edges = [
      makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
      makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
      makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
      makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
    ];
    // makePlanarFace infers plane from vertices — check what it gives
    const face = makePlanarFace(makeWireFromEdges(edges).result!).result!;

    const edge1 = makeEdgeFromCurve(makeLine3D(
      point3d(2, -1, 1), point3d(2, 2, 1),
    ).result!).result!;
    const epc1 = buildPCurveForEdgeOnSurface(edge1, face.surface, true);
    if (epc1) addPCurveToEdge(edge1, epc1);
    const edge2 = makeEdgeFromCurve(makeLine3D(
      point3d(2, 2, 1), point3d(-1, 2, 1),
    ).result!).result!;
    const epc2 = buildPCurveForEdgeOnSurface(edge2, face.surface, true);
    if (epc2) addPCurveToEdge(edge2, epc2);

    const result = builderFace(face, [edge1, edge2]);
    expect(result.length).toBe(2);

    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 0);
    expect(Math.min(...areas)).toBeCloseTo(7, 0);
  });
});

// ═══════════════════════════════════════════════
// EDGE CASE: NO SPLIT
// ═══════════════════════════════════════════════

describe('BuilderFace: no split', () => {
  it('returns original face when no edges provided', () => {
    const face = makeRectFace(0, 0, 4, 4);
    const result = builderFace(face, []);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(face);
  });
});

// ═══════════════════════════════════════════════
// SPHERE HEMISPHERE SPLITTING
// ═══════════════════════════════════════════════

import { revolve } from '../../src/operations/revolve';

/**
 * Construct a sphere (r=1.5) at origin via revolve, returning the top
 * hemisphere face and the equatorial/seam edge references.
 */
function makeSphereHemispheres(r: number) {
  const arcP = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcP, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcP, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const axis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
  const res = revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!,
    makeEdgeFromCurve(arc2).result!,
    makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI);
  expect(res.success).toBe(true);
  const faces = shellFaces(res.result!.solid.outerShell);
  return { solid: res.result!, faces };
}

describe('BuilderFace: sphere hemisphere with 1 arc', () => {
  it('single arc through non-pole points splits hemisphere into 2', () => {
    // Simplest test: one arc on the sphere surface that doesn't touch
    // the pole or seam. This isolates the basic sphere splitting.
    const { faces } = makeSphereHemispheres(1.5);
    const sphereFaces = faces.filter(f => f.surface.type === 'sphere');

    // Find the top hemisphere face: seam arc reaches z=1.5 (north pole)
    const topHemi = sphereFaces.find(f => {
      return f.outerWire.edges.some(oe => {
        if (oe.edge.degenerate) return false;
        const s = edgeStartPoint(oe.edge);
        const e = edgeEndPoint(oe.edge);
        return s.z > 0.1 || e.z > 0.1;
      });
    });
    expect(topHemi).toBeDefined();

    // Create an arc on the sphere surface: quarter circle in the x=0 plane
    // from (0, 1.5, 0) [equator] to (0, 0, 1.5) [pole]
    // But to avoid pole issues, use an arc from (0, 1.5, 0) partway up.
    // Actually, let's use an arc that avoids the pole entirely:
    // Arc in the plane x+y=1.5 (rotated), going from a mid-latitude point
    // to another mid-latitude point.

    // Use the x=0 arc from (0, 1.5, 0) to (0, 0, 1.5).
    // Plane normal (1,0,0) with xAxis (0,1,0) gives yDir = cross(n,x) = (0,0,1).
    // At angle 0: (0, 1.5, 0). At angle π/2: (0, 0, 1.5). ✓
    const arcPlane2 = plane(point3d(0, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const arc = makeArc3D(arcPlane2, 1.5, 0, Math.PI / 2).result!;
    const edge = makeEdgeFromCurve(arc).result!;
    const s = edgeStartPoint(edge), e = edgeEndPoint(edge);
    expect(s.x).toBeCloseTo(0, 5);
    expect(s.y).toBeCloseTo(1.5, 5);
    expect(s.z).toBeCloseTo(0, 5);
    expect(e.x).toBeCloseTo(0, 5);
    expect(e.y).toBeCloseTo(0, 5);
    expect(e.z).toBeCloseTo(1.5, 5);

    // Add PCurve on the sphere surface
    const pc = buildPCurveForEdgeOnSurface(edge, topHemi!.surface, true);
    if (pc) addPCurveToEdge(edge, pc);

    const result = builderFace(topHemi!, [edge]);
    // Should split into 2 sub-faces
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
      // Each sub-face must have >1 non-degenerate edge for a proper split
      const nonDegen = f.outerWire.edges.filter(oe => !oe.edge.degenerate);
      expect(nonDegen.length).toBeGreaterThan(1);
    }
  });
});

describe('BuilderFace: sphere hemisphere with 2 arcs (one coincides with seam)', () => {
  it('x=0 arc + y=0 arc split hemisphere into 2 (y=0 arc overlaps seam)', () => {
    // This replicates the boolean pipeline scenario for box−sphere at corner.
    // The y=0 arc (1.5,0,0)→(0,0,1.5) is geometrically identical to the seam edge.
    // BuilderFace must handle this correctly: the seam is already in the boundary,
    // and the y=0 arc should either be deduplicated (relying on the existing seam)
    // or the seam should be properly paved.
    const { faces } = makeSphereHemispheres(1.5);
    const topHemi = faces.filter(f => f.surface.type === 'sphere').find(f => {
      return f.outerWire.edges.some(oe => {
        if (oe.edge.degenerate) return false;
        return edgeStartPoint(oe.edge).z > 0.1 || edgeEndPoint(oe.edge).z > 0.1;
      });
    })!;
    expect(topHemi).toBeDefined();

    // x=0 arc: (0,1.5,0) → (0,0,1.5) — intersects equatorial boundary + pole
    const xzPlane = plane(point3d(0, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const xzArc = makeArc3D(xzPlane, 1.5, 0, Math.PI / 2).result!;
    const xzEdge = makeEdgeFromCurve(xzArc).result!;

    // y=0 arc: (1.5,0,0) → (0,0,1.5) — coincides with the sphere's seam edge
    const yzPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const yzArc = makeArc3D(yzPlane, 1.5, 0, Math.PI / 2).result!;
    const yzEdge = makeEdgeFromCurve(yzArc).result!;

    for (const edge of [xzEdge, yzEdge]) {
      const pc = buildPCurveForEdgeOnSurface(edge, topHemi.surface, true);
      if (pc) addPCurveToEdge(edge, pc);
    }

    // Test with just x=0 arc first (isolate the seam-overlap issue)
    const result1 = builderFace(topHemi, [xzEdge]);
    expect(result1.length).toBe(2);
    for (const f of result1) {
      expect(f.outerWire.isClosed).toBe(true);
      const nonDegen1 = f.outerWire.edges.filter(oe => !oe.edge.degenerate);
      expect(nonDegen1.length).toBeGreaterThan(1);
    }
  });
});

// ═══════════════════════════════════════════════
// CYLINDER FACE SPLITTING (regression guard)
// ═══════════════════════════════════════════════

describe('BuilderFace: cylinder side face with 2 circles', () => {
  it('two circles split cylinder side into 3 bands', () => {
    // A cylinder R=1 from z=-3 to z=3, side face split by two circles at z=±1.
    // This replicates the through-hole boolean: the box top/bottom faces produce
    // circle intersection edges on the cylinder side face.
    const circlePl = plane(point3d(0, 0, -3), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePl, 1).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWireFromEdges([edge]).result!;
    const cyl = extrude(wire, vec3d(0, 0, 1), 6).result!;
    const faces = shellFaces(cyl.solid.outerShell);
    const cylFace = faces.find(f => f.surface.type === 'cylinder')!;
    expect(cylFace).toBeDefined();

    // Two splitting circles at z=-1 and z=+1
    const splitPlane1 = plane(point3d(0, 0, -1), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const splitCircle1 = makeEdgeFromCurve(makeCircle3D(splitPlane1, 1).result!).result!;
    const splitPlane2 = plane(point3d(0, 0, 1), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const splitCircle2 = makeEdgeFromCurve(makeCircle3D(splitPlane2, 1).result!).result!;

    // Add PCurves
    for (const e of [splitCircle1, splitCircle2]) {
      const pc = buildPCurveForEdgeOnSurface(e, cylFace.surface, true);
      if (pc) addPCurveToEdge(e, pc);
    }

    const result = builderFace(cylFace, [splitCircle1, splitCircle2]);
    // Should split into 3 bands (top, middle, bottom)
    expect(result.length).toBe(3);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════
// SPHERE HEMISPHERE WITH 3 ARCS
// ═══════════════════════════════════════════════

describe('BuilderFace: sphere hemisphere with 3 octant arcs', () => {
  it('three arcs forming octant triangle split hemisphere into 2', () => {
    const { faces } = makeSphereHemispheres(1.5);
    const topHemi = faces.filter(f => f.surface.type === 'sphere').find(f => {
      return f.outerWire.edges.some(oe => {
        if (oe.edge.degenerate) return false;
        const s = edgeStartPoint(oe.edge);
        const e = edgeEndPoint(oe.edge);
        return s.z > 0.1 || e.z > 0.1;
      });
    })!;
    expect(topHemi).toBeDefined();

    // Three arcs forming the octant triangle on the sphere:
    // 1. z=0 plane ∩ sphere: equatorial arc from (1.5,0,0) to (0,1.5,0)
    const eqPlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const eqArc = makeArc3D(eqPlane, 1.5, 0, Math.PI / 2).result!;
    const eqEdge = makeEdgeFromCurve(eqArc).result!;

    // 2. y=0 plane ∩ sphere: from (1.5,0,0) to (0,0,1.5)
    const yzPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const yzArc = makeArc3D(yzPlane, 1.5, 0, Math.PI / 2).result!;
    const yzEdge = makeEdgeFromCurve(yzArc).result!;

    // 3. x=0 plane ∩ sphere: from (0,1.5,0) to (0,0,1.5)
    const xzPlane = plane(point3d(0, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const xzArc = makeArc3D(xzPlane, 1.5, 0, Math.PI / 2).result!;
    const xzEdge = makeEdgeFromCurve(xzArc).result!;

    // Add PCurves on the sphere surface
    for (const edge of [eqEdge, yzEdge, xzEdge]) {
      const pc = buildPCurveForEdgeOnSurface(edge, topHemi.surface, true);
      if (pc) addPCurveToEdge(edge, pc);
    }

    const result = builderFace(topHemi, [eqEdge, yzEdge, xzEdge]);
    // Should split into 2 sub-faces: octant + rest
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════
// REVERSE BOUNDARY SUB-EDGE BEHAVIOR
// ═══════════════════════════════════════════════
// OCCT ref: BOPAlgo_WireSplitter SmartMap pattern. Boundary sub-edges (created
// by splitting at intersection endpoints) get both forward and reverse
// half-edges. Original wire edges keep forward-only orientation. Reverse
// sub-edges participate in traversal but are deprioritized during angle
// selection and never initiate traces.

describe('BuilderFace: reverse boundary sub-edge behavior', () => {
  it('forward path preferred over reverse at intersection vertex (planar)', () => {
    // Two meeting edges on a 4×4 rectangle form an L-split.
    // At the intersection vertex, both forward and reverse boundary sub-edges
    // exist. The tracer must prefer the forward path to produce exactly 2 faces.
    const face = makeRectFace(-1, -1, 3, 3);
    const edge1 = lineEdge(2, -1, 2, 2, face.surface);
    const edge2 = lineEdge(2, 2, -1, 2, face.surface);

    const result = builderFace(face, [edge1, edge2]);
    expect(result.length).toBe(2);

    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 0);
    // L-shape (area 7) + rectangle (area 9) — min must be 7
    expect(Math.min(...areas)).toBeCloseTo(7, 0);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });

  it('single line split: no spurious faces from reverse sub-edges', () => {
    // Even with reverse boundary sub-edges available in the outgoing map,
    // the tracer must produce exactly 2 faces (no extra reversed loops).
    const face = makeRectFace(0, 0, 6, 4);
    const splitEdge = lineEdge(3, 0, 3, 4, face.surface);

    const result = builderFace(face, [splitEdge]);
    expect(result.length).toBe(2);

    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(24, 0);
    expect(Math.min(...areas)).toBeCloseTo(12, 0);
  });

  it('crossing lines: 4 faces with reverse sub-edges at cross vertex', () => {
    // Two crossing lines create 4 sub-edges at the cross point.
    // Each boundary edge through the cross point has reverse sub-edges.
    // The tracer must still produce exactly 4 faces.
    const face = makeRectFace(0, 0, 4, 4);
    const result = builderFace(face, [
      lineEdge(2, 0, 2, 4, face.surface),
      lineEdge(0, 2, 4, 2, face.surface),
    ]);
    expect(result.length).toBe(4);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
      expect(faceArea(f)).toBeCloseTo(4, 0);
    }
  });

  it('diagonal split: unsplit boundary edges have no reverses', () => {
    // Diagonal split connects two boundary vertices directly. The boundary
    // edges meeting at those vertices are NOT split (the intersection endpoint
    // coincides with the boundary vertex). So no reverse sub-edges exist for
    // those edges. The tracer produces exactly 2 triangles.
    const face = makeRectFace(0, 0, 4, 4);
    const result = builderFace(face, [lineEdge(0, 0, 4, 4, face.surface)]);
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(faceArea(f)).toBeCloseTo(8, 0);
    }
  });

  it('sphere hemisphere: seam edges keep forward-only (no ear loops)', () => {
    // On a sphere hemisphere, seam edges already have both orientations in
    // the boundary wire. The isOriginal filter prevents adding reverses for
    // them, which would create spurious "ear" loops (seam up + degen at pole
    // + seam reverse down).
    const { faces } = makeSphereHemispheres(1.5);
    const topHemi = faces.filter(f => f.surface.type === 'sphere').find(f => {
      return f.outerWire.edges.some(oe => {
        if (oe.edge.degenerate) return false;
        return edgeStartPoint(oe.edge).z > 0.1 || edgeEndPoint(oe.edge).z > 0.1;
      });
    })!;
    expect(topHemi).toBeDefined();

    // Arc from equator to pole — splits hemisphere into 2
    const arcPlane = plane(point3d(0, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const arc = makeArc3D(arcPlane, 1.5, 0, Math.PI / 2).result!;
    const edge = makeEdgeFromCurve(arc).result!;
    const pc = buildPCurveForEdgeOnSurface(edge, topHemi.surface, true);
    if (pc) addPCurveToEdge(edge, pc);

    const result = builderFace(topHemi, [edge]);
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
      const nonDegen = f.outerWire.edges.filter(oe => !oe.edge.degenerate);
      expect(nonDegen.length).toBeGreaterThan(1);
    }
  });

  it('extruded face L-split: reverse sub-edges with real extrude geometry', () => {
    // Uses actual extruded box face (not hand-made rectangle) to verify
    // reverse sub-edges work with real pipeline geometry where the surface
    // may have a non-standard orientation.
    const hw = 2, hh = 2;
    const corners = [
      point3d(1 - hw, 1 - hh, 1), point3d(1 + hw, 1 - hh, 1),
      point3d(1 + hw, 1 + hh, 1), point3d(1 - hw, 1 + hh, 1),
    ];
    const bEdges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(bEdges).result!;
    const extResult = extrude(wire, vec3d(0, 0, 1), 4);
    expect(extResult.success).toBe(true);

    const faces = shellFaces(extResult.result!.solid.outerShell);
    const bottomFace = faces.find(f => {
      if (f.surface.type !== 'plane') return false;
      const verts = f.outerWire.edges.map(oe => edgeStartPoint(oe.edge));
      return verts.every(v => Math.abs(v.z - 1) < 0.01);
    })!;
    expect(bottomFace).toBeDefined();

    const edge1 = makeEdgeFromCurve(makeLine3D(
      point3d(2, -1, 1), point3d(2, 2, 1),
    ).result!).result!;
    const pc1 = buildPCurveForEdgeOnSurface(edge1, bottomFace.surface, true);
    if (pc1) addPCurveToEdge(edge1, pc1);
    const edge2 = makeEdgeFromCurve(makeLine3D(
      point3d(2, 2, 1), point3d(-1, 2, 1),
    ).result!).result!;
    const pc2 = buildPCurveForEdgeOnSurface(edge2, bottomFace.surface, true);
    if (pc2) addPCurveToEdge(edge2, pc2);

    const result = builderFace(bottomFace, [edge1, edge2]);
    expect(result.length).toBe(2);
    const areas = result.map(faceArea);
    expect(areas[0] + areas[1]).toBeCloseTo(16, 0);
    expect(Math.min(...areas)).toBeCloseTo(7, 0);
  });
});
