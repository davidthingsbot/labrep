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
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../../src/topology/edge';
import { makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { makePlanarFace } from '../../src/topology/face';
import type { Face } from '../../src/topology/face';
import { builderFace } from '../../src/operations/builder-face';

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

function lineEdge(x1: number, y1: number, x2: number, y2: number) {
  return makeEdgeFromCurve(makeLine3D(
    point3d(x1, y1, 0), point3d(x2, y2, 0),
  ).result!).result!;
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
    const splitEdge = lineEdge(2, 0, 2, 4);

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
      lineEdge(2, 0, 2, 4),
      lineEdge(0, 2, 4, 2),
    ]);
    expect(result.length).toBe(4);

    const areas = result.map(faceArea);
    for (const a of areas) {
      expect(a).toBeCloseTo(4, 0);
    }
  });

  it('diagonal line splits rectangle into 2 triangles', () => {
    const face = makeRectFace(0, 0, 4, 4);
    const result = builderFace(face, [lineEdge(0, 0, 4, 4)]);
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
    const edge1 = lineEdge(-1, -1, 2, -1);  // horizontal at y=-1
    const edge2 = lineEdge(-1, 2, -1, -1);  // vertical at x=-1

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
