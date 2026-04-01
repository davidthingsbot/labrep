/**
 * General face splitting by intersection edges (BuilderFace).
 *
 * Pure 2D algorithm. UV coordinates come from edge PCurves where available,
 * with SurfaceAdapter.projectPoint fallback. No surface-type branching.
 *
 * OCCT reference: BOPAlgo_BuilderFace, BOPAlgo_WireSplitter
 */
import {
  Point3D, point3d, vec3d, distance, cross, normalize,
} from '../core';
import { makeLine3D } from '../geometry/line3d';
import { makeArc3D } from '../geometry/arc3d';
import { makeLine2D } from '../geometry/line2d';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, addPCurveToEdge } from '../topology/edge';
import type { Curve3D } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire } from '../topology/wire';
import { Face, Surface, makeFace, faceOuterWire } from '../topology/face';
import { PCurve, makePCurve, evaluateCurve2D, buildPCurveForEdgeOnSurface } from '../topology/pcurve';
import { toAdapter, type SurfaceAdapter } from '../surfaces/surface-adapter';
import { evaluateLine3D } from '../geometry/line3d';
import { evaluateCircle3D } from '../geometry/circle3d';
import { evaluateArc3D } from '../geometry/arc3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';

const TOL = 1e-6;
type Pt2 = { x: number; y: number };

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

function normalizePeriodicPolygon(polygon: Pt2[], period: number): Pt2[] {
  if (polygon.length === 0) return polygon;
  const gapEnd = periodicGapShift(polygon.map((pt) => pt.x), period);
  return polygon.map((pt) => {
    let u = pt.x - gapEnd;
    if (u < 0) u += period;
    return { x: u, y: pt.y };
  });
}

function polygonSignedArea(polygon: Pt2[], periodic: boolean, uPeriod: number): number {
  const areaPoly = periodic && uPeriod > 0
    ? normalizePeriodicPolygon(polygon, uPeriod)
    : polygon;
  let area = 0;
  for (let i = 0; i < areaPoly.length; i++) {
    const j = (i + 1) % areaPoly.length;
    area += areaPoly[i].x * areaPoly[j].y - areaPoly[j].x * areaPoly[i].y;
  }
  return area / 2;
}

function polygonSignedAreaRaw(polygon: Pt2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

function polygonPerimeter(polygon: Pt2[], periodic: boolean, uPeriod: number): number {
  const perimeterPoly = periodic && uPeriod > 0
    ? normalizePeriodicPolygon(polygon, uPeriod)
    : polygon;
  let perimeter = 0;
  for (let i = 0; i < perimeterPoly.length; i++) {
    const j = (i + 1) % perimeterPoly.length;
    const dx = perimeterPoly[j].x - perimeterPoly[i].x;
    const dy = perimeterPoly[j].y - perimeterPoly[i].y;
    perimeter += Math.hypot(dx, dy);
  }
  return perimeter;
}

function polygonPerimeterRaw(polygon: Pt2[]): number {
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    perimeter += Math.hypot(dx, dy);
  }
  return perimeter;
}

function uvDistanceOnFace(a: Pt2, b: Pt2, adapter: SurfaceAdapter): { du: number; dv: number } {
  let du = Math.abs(a.x - b.x);
  if (adapter.isUPeriodic) {
    du = du % adapter.uPeriod;
    if (du > adapter.uPeriod / 2) du = adapter.uPeriod - du;
  }
  return {
    du,
    dv: Math.abs(a.y - b.y),
  };
}

function uvDistanceRaw(a: Pt2, b: Pt2): { du: number; dv: number } {
  return {
    du: Math.abs(a.x - b.x),
    dv: Math.abs(a.y - b.y),
  };
}

function surfaceResolutionAt(
  adapter: SurfaceAdapter,
  uv: Pt2,
  axis: 'u' | 'v',
  tol3d: number,
): number {
  const bounds = adapter.uvBounds();
  const baseStep = axis === 'u'
    ? (adapter.isUPeriodic ? adapter.uPeriod * 1e-5 : Math.max(1e-5, (bounds.uMax - bounds.uMin) * 1e-6))
    : (adapter.isVPeriodic ? adapter.vPeriod * 1e-5 : Math.max(1e-5, (bounds.vMax - bounds.vMin) * 1e-6));
  let step = baseStep;
  if (!Number.isFinite(step) || step <= 0) {
    step = 1e-5;
  }

  const evalOffset = (delta: number): Point3D => (
    axis === 'u'
      ? adapter.evaluate(uv.x + delta, uv.y)
      : adapter.evaluate(uv.x, uv.y + delta)
  );

  const center = adapter.evaluate(uv.x, uv.y);
  const plus = evalOffset(step);
  let speed = distance(center, plus) / step;

  if (!Number.isFinite(speed) || speed < 1e-12) {
    const minus = evalOffset(-step);
    speed = distance(plus, minus) / (2 * step);
  }

  if (!Number.isFinite(speed) || speed < 1e-12) {
    return tol3d;
  }

  return Math.max(tol3d / speed, tol3d);
}

function uTolerance2D(adapter: SurfaceAdapter, uv: Pt2, tol3d: number): number {
  return surfaceResolutionAt(adapter, uv, 'u', tol3d);
}

function vTolerance2D(adapter: SurfaceAdapter, uv: Pt2, tol3d: number): number {
  return surfaceResolutionAt(adapter, uv, 'v', tol3d);
}

function tolerance2D(adapter: SurfaceAdapter, uv: Pt2, tol3d: number): number {
  return Math.max(uTolerance2D(adapter, uv, tol3d), vTolerance2D(adapter, uv, tol3d), tol3d);
}

export interface HalfEdge {
  edge: Edge;
  forward: boolean;
  startVtx: number;
  endVtx: number;
  angleAtStart: number;
  angleAtEnd: number;
  used: boolean;
  isBoundary: boolean;
  pcurveOccurrence: number;  // Which PCurve to use (0=first, 1=second for seam edges)
  startUV?: Pt2;  // UV at start vertex (OCCT Coord2dVf equivalent for seam filter)
}

interface VertexEdgeInfo {
  he: HalfEdge;
  isIn: boolean;
  isInside: boolean;
  angle: number;
}

interface BuilderFaceTraceDebug {
  loops: HalfEdge[][];
  vertices2D: Pt2[];
  splitEdges: Edge[];
}

function roundCoord(value: number): number {
  return Math.round(value / 1e-7) * 1e-7;
}

function canonicalSourceEdgeKey(edge: Edge): string {
  const source = edge.sourceEdge ?? edge;
  const start = edgeStartPoint(source);
  const end = edgeEndPoint(source);
  const a = `${roundCoord(start.x)},${roundCoord(start.y)},${roundCoord(start.z)}`;
  const b = `${roundCoord(end.x)},${roundCoord(end.y)},${roundCoord(end.z)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ═══════════════════════════════════════════════
// UV ACCESS
// ═══════════════════════════════════════════════

/** Find PCurve for an edge on a surface. occurrence selects among multiple (seam). */
function findPCurve(edge: Edge, surface: Surface, occurrence: number = 0): PCurve | null {
  let count = 0;
  for (const pc of edge.pcurves) {
    if (pc.surface === surface) {
      if (count === occurrence) return pc;
      count++;
    }
  }
  return null;
}

function countPCurves(edge: Edge, surface: Surface): number {
  let count = 0;
  for (const pc of edge.pcurves) {
    if (pc.surface === surface) count++;
  }
  return count;
}

function resolvePCurveOccurrenceForUse(
  edge: Edge,
  surface: Surface,
  forward: boolean,
  occurrence: number = 0,
): number {
  const count = countPCurves(edge, surface);
  if (count <= 1 || forward) return occurrence;
  // OCCT ref: BRep_Tool::CurveOnSurface picks the alternate pcurve for
  // reversed uses of closed-on-face edges.
  return (occurrence + 1) % count;
}

function findPCurveForUse(
  edge: Edge,
  surface: Surface,
  forward: boolean,
  occurrence: number = 0,
): PCurve | null {
  return findPCurve(edge, surface, resolvePCurveOccurrenceForUse(edge, surface, forward, occurrence));
}

/** Get UV start/end from PCurve, respecting wire direction. */
function getEdgeUV(edge: Edge, surface: Surface, forward: boolean, occurrence: number = 0): { start: Pt2; end: Pt2 } | null {
  const pc = findPCurveForUse(edge, surface, forward, occurrence);
  if (!pc) return null;
  const c = pc.curve2d;
  const s = evaluateCurve2D(c, c.startParam);
  const e = evaluateCurve2D(c, c.endParam);
  return forward ? { start: s, end: e } : { start: e, end: s };
}

function getForwardVertexUV(edge: Edge, surface: Surface, forward: boolean, occurrence: number = 0): Pt2 | null {
  const uv = getEdgeUV(edge, surface, forward, occurrence);
  return uv ? uv.start : null;
}

function isClosedOnFace(edge: Edge, surface: Surface): boolean {
  if (edge.degenerate) return true;
  let count = 0;
  for (const pc of edge.pcurves) {
    if (pc.surface === surface) count++;
    if (count > 1) return true;
  }
  return false;
}

/** Project 3D point to UV via adapter. */
function projectToUV(adapter: SurfaceAdapter, pt: Point3D): Pt2 {
  const { u, v } = adapter.projectPoint(pt);
  return { x: u, y: v };
}

/** Get UV for a boundary edge: PCurve if available, else project endpoints. */
function getBoundaryEdgeUV(
  edge: Edge, surface: Surface, adapter: SurfaceAdapter,
  forward: boolean, occurrence: number,
  eStart: Point3D, eEnd: Point3D,
): { start: Pt2; end: Pt2 } {
  const uv = getEdgeUV(edge, surface, forward, occurrence);
  if (uv) return uv;
  return { start: projectToUV(adapter, eStart), end: projectToUV(adapter, eEnd) };
}

// ═══════════════════════════════════════════════
// TANGENT ANGLES
// ═══════════════════════════════════════════════

function evalCurve(curve: Curve3D, t: number): Point3D {
  switch (curve.type) {
    case 'line3d': return evaluateLine3D(curve, t);
    case 'circle3d': return evaluateCircle3D(curve, t);
    case 'arc3d': return evaluateArc3D(curve, t);
    case 'ellipse3d': return evaluateEllipse3D(curve, t);
  }
}

export function tangentAngle(he: HalfEdge, atStart: boolean, surface: Surface, adapter: SurfaceAdapter, vertices2D?: Pt2[]): number {
  // OCCT reference: BOPAlgo_WireSplitter_1.cxx Angle2D()
  // Uses the edge's PCurve (2D curve on face) for tangent direction.
  // This is critical for seam edges on periodic surfaces: the PCurve gives
  // the correct UV (u=0 for forward seam, u=2π for reverse seam), while
  // surface projection always returns u=0 for both.

  // Try PCurve-based computation first (matches OCCT's Angle2D)
  const pc = findPCurveForUse(he.edge, surface, he.forward, he.pcurveOccurrence);
  if (pc) {
    const c = pc.curve2d;
    const aFirst = c.startParam;
    const aLast = c.endParam;
    const range = aLast - aFirst;
    if (Math.abs(range) <= 1e-12) {
      return 0;
    }

    // OCCT ref: BOPAlgo_WireSplitter_1.cxx Angle2D().
    // Sample from the vertex parameter toward the nearer interior side of the
    // PCurve domain, then use bIsIN to orient the tangent at the vertex.
    const aTV = he.forward
      ? (atStart ? aFirst : aLast)
      : (atStart ? aLast : aFirst);
    let dt = 0.05 * Math.abs(range);
    if (dt < 5e-5) {
      dt = Math.min(5e-5, Math.abs(range) / 2);
    }
    const aTV1 = Math.abs(aTV - aFirst) < Math.abs(aTV - aLast) ? aTV + dt : aTV - dt;

    const uv0 = evaluateCurve2D(c, aTV);
    const uv1 = evaluateCurve2D(c, aTV1);
    const dx = atStart ? (uv1.x - uv0.x) : (uv0.x - uv1.x);
    const dy = atStart ? (uv1.y - uv0.y) : (uv0.y - uv1.y);
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += 2 * Math.PI;
    return angle;
  }

  // Fallback: project 3D curve samples to UV (for edges without PCurves).
  // OCCT ref: Angle2D() computes degenerate edge tangents from their pcurve
  // direction. Without a pcurve, use the half-edge's vertex UV coordinates
  // to determine the tangent direction along the degenerate edge.
  if (he.edge.degenerate) {
    // Degenerate edges at poles have constant V, varying U. The tangent is along U.
    const startUV = vertices2D?.[he.startVtx];
    const endUV = vertices2D?.[he.endVtx];
    if (startUV && endUV) {
      const du = endUV.x - startUV.x;
      const dv = endUV.y - startUV.y;
      if (Math.abs(du) > 1e-10 || Math.abs(dv) > 1e-10) {
        let angle = Math.atan2(dv, du);
        if (angle < 0) angle += 2 * Math.PI;
        return angle;
      }
    }
    return 0;
  }

  const curve = he.edge.curve;
  const tRange = curve.endParam - curve.startParam;
  const dt3d = Math.min(tRange * 0.01, 0.01);
  let t0: number, t1: number;
  if (he.forward) {
    t0 = atStart ? curve.startParam : curve.endParam;
    t1 = atStart ? curve.startParam + dt3d : curve.endParam - dt3d;
  } else {
    t0 = atStart ? curve.endParam : curve.startParam;
    t1 = atStart ? curve.endParam - dt3d : curve.startParam + dt3d;
  }
  const uv0 = projectToUV(adapter, evalCurve(curve, t0));
  let uv1 = projectToUV(adapter, evalCurve(curve, t1));
  if (adapter.isUPeriodic) {
    const half = adapter.uPeriod / 2;
    while (uv1.x - uv0.x > half) uv1 = { x: uv1.x - adapter.uPeriod, y: uv1.y };
    while (uv0.x - uv1.x > half) uv1 = { x: uv1.x + adapter.uPeriod, y: uv1.y };
  }
  const fdx = atStart ? (uv1.x - uv0.x) : (uv0.x - uv1.x);
  const fdy = atStart ? (uv1.y - uv0.y) : (uv0.y - uv1.y);
  let angle = Math.atan2(fdy, fdx);
  if (angle < 0) angle += 2 * Math.PI;
  return angle;
}

// ═══════════════════════════════════════════════
// VERTEX MERGING
// ═══════════════════════════════════════════════

/**
 * Find or create a vertex index.
 * OCCT ref: mySmartMap uses TopoDS_Vertex identity (IsSame) — same 3D vertex
 * = same map entry, regardless of UV position. Seam vertices at the same 3D
 * point share a single vertex index; UV disambiguation happens during
 * traversal via PCurve evaluation (Coord2d), not in the vertex pool.
 */
function findOrAddVertex(
  vertices: Point3D[], vertices2D: Pt2[],
  pt3d: Point3D, pt2d: Pt2,
  seamSplit: boolean,
  uPeriod: number = 0,
): number {
  // OCCT ref: On periodic surfaces, vertices at U≈0 and U≈2π are kept SEPARATE
  // (same 3D but different seam side). This converts self-loop circles into proper
  // v_left→v_right edges that connect to split seam edges.
  // seamSplit should be true for surfaces where the seam creates distinct UV regions
  // (cylinders, cones) but false where it doesn't matter (spheres with pole degeneracies).
  for (let i = 0; i < vertices.length; i++) {
    if (distance(vertices[i], pt3d) < TOL) {
      if (seamSplit && uPeriod > 0) {
        const uA = vertices2D[i].x, uB = pt2d.x;
        const seamThreshold = uPeriod * 0.05;
        const nearLeftA = uA < seamThreshold;
        const nearRightA = uA > uPeriod - seamThreshold;
        const nearLeftB = uB < seamThreshold;
        const nearRightB = uB > uPeriod - seamThreshold;
        if ((nearLeftA && nearRightB) || (nearRightA && nearLeftB)) {
          continue; // Opposite seam sides → keep separate
        }
      }
      return i;
    }
  }
  vertices.push(pt3d);
  vertices2D.push(pt2d);
  return vertices.length - 1;
}

/**
 * Get the UV of a 3D point from the intersection edge's PCurve on the surface.
 * OCCT ref: FillPaves uses 2D curve intersection to find split parameters.
 * The intersection edge's PCurve gives the authoritative UV at the endpoint.
 */
function getIntEndpointUV(
  pt: Point3D, intEdges: Edge[], surface: Surface, adapter: SurfaceAdapter,
): Pt2 | null {
  for (const ie of intEdges) {
    const s = edgeStartPoint(ie), e = edgeEndPoint(ie);
    const pcs = ie.pcurves.filter(p => p.surface === surface);
    if (pcs.length !== 1) continue;
    const c2 = pcs[0].curve2d;
    if (distance(pt, s) < TOL) {
      const uv = evaluateCurve2D(c2, c2.startParam);
      if (uv) {
        let u = uv.x;
        if (adapter.isUPeriodic && u < 0) u += adapter.uPeriod;
        return { x: u, y: uv.y };
      }
    }
    if (distance(pt, e) < TOL) {
      const uv = evaluateCurve2D(c2, c2.endParam);
      if (uv) {
        let u = uv.x;
        if (adapter.isUPeriodic && u < 0) u += adapter.uPeriod;
        return { x: u, y: uv.y };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// EDGE SPLITTING AT CROSSINGS
// ═══════════════════════════════════════════════

function splitEdgesAtCrossings(edges: Edge[], _surface: Surface, _adapter: SurfaceAdapter): Edge[] {
  if (edges.length < 2) return edges;
  const splitPoints: Map<number, { pt3d: Point3D; t: number }[]> = new Map();
  for (let i = 0; i < edges.length; i++) splitPoints.set(i, []);
  const paveTol = 2 * TOL;
  const canonicalPointKey = (pt: Point3D) =>
    `${Math.round(pt.x / 1e-7) * 1e-7},${Math.round(pt.y / 1e-7) * 1e-7},${Math.round(pt.z / 1e-7) * 1e-7}`;
  const canonicalEdgeKey = (edge: Edge) => {
    const start = canonicalPointKey(edgeStartPoint(edge));
    const end = canonicalPointKey(edgeEndPoint(edge));
    return start < end ? `${start}|${end}` : `${end}|${start}`;
  };

  function dot3(a: Point3D, b: Point3D): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function sub3(a: Point3D, b: Point3D): Point3D {
    return point3d(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function scale3(a: Point3D, s: number): Point3D {
    return point3d(a.x * s, a.y * s, a.z * s);
  }

  function add3(a: Point3D, b: Point3D): Point3D {
    return point3d(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  function segmentIntersection3D(
    s1: Point3D,
    e1: Point3D,
    s2: Point3D,
    e2: Point3D,
  ): { pt: Point3D; t1: number; t2: number } | null {
    const u = sub3(e1, s1);
    const v = sub3(e2, s2);
    const w0 = sub3(s1, s2);
    const a = dot3(u, u);
    const b = dot3(u, v);
    const c = dot3(v, v);
    const d = dot3(u, w0);
    const e = dot3(v, w0);
    const denom = a * c - b * b;
    if (Math.abs(denom) < 1e-12) {
      return null;
    }

    const t1 = (b * e - c * d) / denom;
    const t2 = (a * e - b * d) / denom;
    if (t1 <= TOL || t1 >= 1 - TOL || t2 <= TOL || t2 >= 1 - TOL) {
      return null;
    }

    const p1 = add3(s1, scale3(u, t1));
    const p2 = add3(s2, scale3(v, t2));
    if (distance(p1, p2) > TOL) {
      return null;
    }

    return {
      pt: point3d(
        (p1.x + p2.x) / 2,
        (p1.y + p2.y) / 2,
        (p1.z + p2.z) / 2,
      ),
      t1,
      t2,
    };
  }

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].curve.type !== 'line3d' || edges[j].curve.type !== 'line3d') continue;
      const s1 = edgeStartPoint(edges[i]), e1 = edgeEndPoint(edges[i]);
      const s2 = edgeStartPoint(edges[j]), e2 = edgeEndPoint(edges[j]);
      const hit = segmentIntersection3D(s1, e1, s2, e2);
      if (!hit) continue;
      splitPoints.get(i)!.push({ pt3d: hit.pt, t: hit.t1 });
      splitPoints.get(j)!.push({ pt3d: hit.pt, t: hit.t2 });
    }
  }

  const result: Edge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const pts = splitPoints.get(i)!;
    if (pts.length === 0) { result.push(edges[i]); continue; }
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    const merged: { pt3d: Point3D; t: number }[] = [];
    for (const pt of sorted) {
      const prev = merged[merged.length - 1];
      if (prev && (Math.abs(prev.t - pt.t) < paveTol || distance(prev.pt3d, pt.pt3d) < paveTol)) {
        prev.pt3d = point3d(
          (prev.pt3d.x + pt.pt3d.x) / 2,
          (prev.pt3d.y + pt.pt3d.y) / 2,
          (prev.pt3d.z + pt.pt3d.z) / 2,
        );
        prev.t = (prev.t + pt.t) / 2;
        continue;
      }
      merged.push({ pt3d: pt.pt3d, t: pt.t });
    }
    let cur = edgeStartPoint(edges[i]);
    let curT = 0;
    for (const pt of merged) {
      if (distance(cur, pt.pt3d) > TOL) {
        const lr = makeLine3D(cur, pt.pt3d);
        if (lr.success) {
          const er = makeEdgeFromCurve(lr.result!);
          if (er.success) {
            const child = { ...er.result!, sourceEdge: edges[i].sourceEdge ?? edges[i] };
            for (const parentPCurve of edges[i].pcurves) {
              const c2 = parentPCurve.curve2d;
              const startParam = c2.startParam + (c2.endParam - c2.startParam) * curT;
              const endParam = c2.startParam + (c2.endParam - c2.startParam) * pt.t;
              const startUV = evaluateCurve2D(c2, startParam);
              const endUV = evaluateCurve2D(c2, endParam);
              const subPCurve = makeLine2D(
                { x: startUV.x, y: startUV.y },
                { x: endUV.x, y: endUV.y },
              );
              if (subPCurve.result) {
                addPCurveToEdge(child, makePCurve(subPCurve.result, parentPCurve.surface));
              }
            }
            result.push(child);
          }
        }
      }
      curT = pt.t;
      cur = pt.pt3d;
    }
    const end = edgeEndPoint(edges[i]);
    if (distance(cur, end) > TOL) {
      const lr = makeLine3D(cur, end);
      if (lr.success) {
        const er = makeEdgeFromCurve(lr.result!);
        if (er.success) {
          const child = { ...er.result!, sourceEdge: edges[i].sourceEdge ?? edges[i] };
          for (const parentPCurve of edges[i].pcurves) {
            const c2 = parentPCurve.curve2d;
            const startParam = c2.startParam + (c2.endParam - c2.startParam) * curT;
            const endParam = c2.endParam;
            const startUV = evaluateCurve2D(c2, startParam);
            const endUV = evaluateCurve2D(c2, endParam);
            const subPCurve = makeLine2D(
              { x: startUV.x, y: startUV.y },
              { x: endUV.x, y: endUV.y },
            );
            if (subPCurve.result) {
              addPCurveToEdge(child, makePCurve(subPCurve.result, parentPCurve.surface));
            }
          }
          result.push(child);
        }
      }
    }
  }
  const deduped = new Map<string, Edge>();
  for (const edge of result) {
    const key = canonicalEdgeKey(edge);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, edge);
      continue;
    }

    for (const pc of edge.pcurves) {
      const hasSameSurface = existing.pcurves.some((existingPC) => existingPC.surface === pc.surface);
      if (!hasSameSurface) {
        addPCurveToEdge(existing, pc);
      }
    }
  }

  const canonicalChildren: Edge[] = [];
  const nearDuplicateTolerance = 4 * paveTol;
  for (const edge of deduped.values()) {
    const sourceA = edge.sourceEdge ?? edge;
    const edgeStart = edgeStartPoint(edge);
    const edgeEnd = edgeEndPoint(edge);
    const existing = canonicalChildren.find((candidate) => {
      const sourceB = candidate.sourceEdge ?? candidate;
      if (sourceA !== sourceB) return false;
      if (candidate.curve.type !== edge.curve.type) return false;
      if (candidate.curve.type !== 'line3d') return false;
      const candidateStart = edgeStartPoint(candidate);
      const candidateEnd = edgeEndPoint(candidate);
      const aligned = distance(edgeStart, candidateStart) + distance(edgeEnd, candidateEnd);
      const reversed = distance(edgeStart, candidateEnd) + distance(edgeEnd, candidateStart);
      return Math.min(aligned, reversed) < nearDuplicateTolerance;
    });
    if (!existing) {
      canonicalChildren.push(edge);
      continue;
    }

    for (const pc of edge.pcurves) {
      const hasSameSurface = existing.pcurves.some((existingPC) => existingPC.surface === pc.surface);
      if (!hasSameSurface) {
        addPCurveToEdge(existing, pc);
      }
    }
  }

  return canonicalChildren;
}

interface EdgeEndpointUse {
  edge: Edge;
  atStart: boolean;
}

function filterShapesToAvoid(edges: Edge[]): Edge[] {
  let active = [...edges];
  let changed = true;

  while (changed) {
    changed = false;
    const vertexUses: EdgeEndpointUse[][] = [];

    function findOrAddEndpoint(pt: Point3D): number {
      for (let i = 0; i < vertexUses.length; i++) {
        const sampleUse = vertexUses[i][0];
        const samplePoint = sampleUse.atStart ? edgeStartPoint(sampleUse.edge) : edgeEndPoint(sampleUse.edge);
        if (distance(samplePoint, pt) < TOL) return i;
      }
      vertexUses.push([]);
      return vertexUses.length - 1;
    }

    for (const edge of active) {
      const startIdx = findOrAddEndpoint(edgeStartPoint(edge));
      vertexUses[startIdx].push({ edge, atStart: true });
      const endIdx = findOrAddEndpoint(edgeEndPoint(edge));
      vertexUses[endIdx].push({ edge, atStart: false });
    }

    const avoid = new Set<Edge>();
    for (const uses of vertexUses) {
      if (uses.length === 1) {
        const only = uses[0];
        if (!only.edge.degenerate) avoid.add(only.edge);
        continue;
      }
      if (uses.length === 2 && uses[0].edge === uses[1].edge) {
        const edge = uses[0].edge;
        if (distance(edgeStartPoint(edge), edgeEndPoint(edge)) >= TOL) {
          avoid.add(edge);
        }
      }
    }

    if (avoid.size > 0) {
      active = active.filter((edge) => !avoid.has(edge));
      changed = true;
    }
  }

  return active;
}

// ═══════════════════════════════════════════════
// CLOCKWISE ANGLE
// ═══════════════════════════════════════════════

function clockwiseAngle(incoming: number, outgoing: number): number {
  const rev = (incoming + Math.PI) % (2 * Math.PI);
  let d = rev - outgoing;
  if (d < 0) d += 2 * Math.PI;
  if (d < 1e-10) d = 2 * Math.PI;
  return d;
}

function wrapAngle(angle: number): number {
  let wrapped = angle % (2 * Math.PI);
  if (wrapped < 0) wrapped += 2 * Math.PI;
  return wrapped;
}

function refineAngleAtVertexBySampling(
  he: HalfEdge,
  vertex: number,
  surface: Surface,
  vertices2D: Pt2[],
  incomingBoundaryAngle: number,
  outgoingBoundaryAngle: number,
  boundarySpan: number,
): number | null {
  const pc = findPCurveForUse(he.edge, surface, he.forward, he.pcurveOccurrence);
  if (!pc) return null;

  const c = pc.curve2d;
  const aTV = he.forward ? c.startParam : c.endParam;
  const aTOp = he.forward ? c.endParam : c.startParam;
  const range = aTOp - aTV;
  if (Math.abs(range) < 1e-12) return null;
  const origin = evaluateCurve2D(c, aTV);

  const maxDT = 0.3 * Math.abs(range);
  const sampleCount = c.type === 'line' ? 8 : 128;
  const params: number[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const frac = i / sampleCount;
    params.push(aTV + range * frac);
  }

  const rayAngles = [outgoingBoundaryAngle, incomingBoundaryAngle + Math.PI];
  const normalizedRayAngles = rayAngles.map((angle) => wrapAngle(angle));

  function refineFromRay(rayAngle: number): number | null {
    const dir = { x: Math.cos(rayAngle), y: Math.sin(rayAngle) };
    let bestCurveParam: number | null = null;
    let bestRayParam = -Infinity;

    for (let i = 0; i < params.length - 1; i++) {
      const t0 = params[i];
      const t1 = params[i + 1];
      const p0 = evaluateCurve2D(c, t0);
      const p1 = evaluateCurve2D(c, t1);
      const seg = { x: p1.x - p0.x, y: p1.y - p0.y };
      const det = dir.x * (-seg.y) - dir.y * (-seg.x);
      if (Math.abs(det) < 1e-12) continue;

      const rhs = { x: p0.x - origin.x, y: p0.y - origin.y };
      const rayParam = (rhs.x * (-seg.y) - rhs.y * (-seg.x)) / det;
      const segParam = (dir.x * rhs.y - dir.y * rhs.x) / det;
      if (rayParam <= 1e-12 || segParam < -1e-9 || segParam > 1 + 1e-9) continue;

      const curveParam = t0 + (t1 - t0) * Math.min(Math.max(segParam, 0), 1);
      if (Math.abs(curveParam - aTV) >= maxDT) continue;
      if (rayParam > bestRayParam) {
        bestRayParam = rayParam;
        bestCurveParam = curveParam;
      }
    }

    if (bestCurveParam === null) return null;

    const refinedParam = bestCurveParam + 0.01 * (aTOp - bestCurveParam);
    const uv = evaluateCurve2D(c, refinedParam);
    const dx = uv.x - origin.x;
    const dy = uv.y - origin.y;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return null;

    const angle = wrapAngle(Math.atan2(dy, dx));
    return clockwiseAngle(incomingBoundaryAngle, angle) < boundarySpan ? angle : null;
  }

  for (const rayAngle of normalizedRayAngles) {
    const refined = refineFromRay(rayAngle);
    if (refined !== null) return refined;
  }

  for (const frac of [0.01, 0.02, 0.05, 0.1, 0.2, 0.4]) {
    const uv = evaluateCurve2D(c, aTV + range * frac);
    const dx = uv.x - origin.x;
    const dy = uv.y - origin.y;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) continue;

    const angle = wrapAngle(Math.atan2(dy, dx));
    if (clockwiseAngle(incomingBoundaryAngle, angle) < boundarySpan) {
      return angle;
    }
  }

  return null;
}

function refineHalfEdgeAngles(halfEdges: HalfEdge[], surface: Surface, vertices2D: Pt2[]): void {
  type Incidence = {
    he: HalfEdge;
    isIn: boolean;
    isInside: boolean;
    angle: number;
  };

  const incidencesByVertex = new Map<number, Incidence[]>();
  for (const he of halfEdges) {
    const startList = incidencesByVertex.get(he.startVtx) || [];
    startList.push({ he, isIn: false, isInside: !he.isBoundary, angle: he.angleAtStart });
    incidencesByVertex.set(he.startVtx, startList);

    const endList = incidencesByVertex.get(he.endVtx) || [];
    endList.push({ he, isIn: true, isInside: !he.isBoundary, angle: he.angleAtEnd });
    incidencesByVertex.set(he.endVtx, endList);
  }

  for (const [vertex, incidences] of incidencesByVertex) {
    const boundary = incidences.filter((inc) => !inc.isInside);
    if (boundary.length !== 2) continue;

    const outgoingBoundary = boundary.find((inc) => !inc.isIn);
    const incomingBoundary = boundary.find((inc) => inc.isIn);
    if (!outgoingBoundary || !incomingBoundary) continue;

    const outgoingInside = incidences.filter((inc) => inc.isInside && !inc.isIn);
    if (outgoingInside.length === 0) continue;

    const boundarySpan = clockwiseAngle(incomingBoundary.angle, outgoingBoundary.angle);
    for (const inside of outgoingInside) {
      const delta = clockwiseAngle(incomingBoundary.angle, inside.angle);
      if (delta < boundarySpan) continue;

      let refined = refineAngleAtVertexBySampling(
        inside.he,
        vertex,
        surface,
        vertices2D,
        incomingBoundary.angle,
        outgoingBoundary.angle,
        boundarySpan,
      );
      if (refined === null && outgoingInside.length === 2) {
        refined = inside.angle <= outgoingBoundary.angle
          ? wrapAngle(outgoingBoundary.angle + 1e-9)
          : wrapAngle(incomingBoundary.angle - 1e-9);
      }
      if (refined === null) continue;

      for (const peer of incidences) {
        if (peer.he.edge !== inside.he.edge) continue;
        if (peer.isIn) {
          peer.he.angleAtEnd = wrapAngle(refined + Math.PI);
        } else {
          peer.he.angleAtStart = refined;
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════
// MAIN ALGORITHM
// ═══════════════════════════════════════════════

function traceBuilderFace(face: Face, edges: Edge[]): BuilderFaceTraceDebug | null {
  if (edges.length === 0) return { loops: [], vertices2D: [], splitEdges: [] };

  const surface = face.surface;
  const adapter = toAdapter(surface);
  const periodic = adapter.isUPeriodic;

  // Step 0: split intersection edges at mutual crossings
  const splitEdges = splitEdgesAtCrossings(edges, surface, adapter);

  const vertices: Point3D[] = [];
  const vertices2D: Pt2[] = [];

  // Seam splitting: on periodic surfaces, the seam at U=0/2π creates distinct UV regions.
  // Vertices at opposite seam sides must be kept separate for proper wire tracing.
  // OCCT ref: BRep_Tool::IsClosed(aE, myFace) returns true when a boundary edge has
  // 2 PCurves on the same face (seam edge). Detect this from the wire rather than
  // hardcoding surface types — works for cylinders, cones, spheres, and any periodic
  // surface whose boundary wire includes a seam edge.
  let seamSplit = false;
  if (periodic) {
    const wire = faceOuterWire(face);
    for (const oe of wire.edges) {
      let pcCount = 0;
      for (const pc of oe.edge.pcurves) {
        if (pc.surface === surface) pcCount++;
      }
      if (pcCount >= 2) { seamSplit = true; break; }
    }
  }

  // Collect intersection endpoints for boundary splitting
  const intEndpoints: Point3D[] = [];
  for (const e of splitEdges) {
    intEndpoints.push(edgeStartPoint(e));
    intEndpoints.push(edgeEndPoint(e));
  }

  // Collect degenerate edge positions (poles) for poleSplit vertex handling
  const degeneratePts: Point3D[] = [];
  for (const oe of faceOuterWire(face).edges) {
    if (oe.edge.degenerate) {
      degeneratePts.push(oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge));
    }
  }

  // ── Boundary half-edges ──
  const boundaryHalfEdges: HalfEdge[] = [];
  const outerWire = faceOuterWire(face);
  const edgeSeen = new Map<Edge, number>();
  let prevEndUV: Pt2 | null = null; // Track previous edge's UV end for continuity

  for (const oe of outerWire.edges) {
    const eStart = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const eEnd = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);

    const occurrence = edgeSeen.get(oe.edge) || 0;
    edgeSeen.set(oe.edge, occurrence + 1);

    let { start: edgeStartUV, end: edgeEndUV } = getBoundaryEdgeUV(
      oe.edge, surface, adapter, oe.forward, occurrence, eStart, eEnd,
    );

    // OCCT ref: UV coordinates come from PCurves (Coord2d), which naturally
    // encode the correct seam side. No UV continuity shifting needed —
    // vertex identity is based on 3D position, not UV.

    // Degenerate edges (pole connectors): intersection endpoints at the pole
    // must split the degenerate edge in UV space (OCCT FillPaves, PaveFiller_8.cxx:222-329).
    // The degenerate edge spans a U range at constant V (the pole latitude).
    // An intersection edge ending at the pole creates a split at its U value.
    if (oe.edge.degenerate) {
      // Find intersection endpoints at the same 3D position as this degenerate edge
      const degPt = eStart; // all points on degenerate edge are the same 3D point
      const hitsOnDeg: { pt3d: Point3D; uParam: number }[] = [];
      for (let iep = 0; iep < intEndpoints.length; iep++) {
        const pt = intEndpoints[iep];
        if (distance(pt, degPt) < TOL) {
          // At a pole, projectPoint returns ambiguous U (the pole is a UV singularity).
          // OCCT ref: FillPaves (PaveFiller_8.cxx) uses the edge's PCurve to determine
          // the correct U at the pole. Find the intersection edge that has this endpoint
          // and extract U from its PCurve on this surface.
          let u: number | null = null;
          const edgeIdx = Math.floor(iep / 2); // intEndpoints has pairs (start, end)
          const isStart = iep % 2 === 0;
          if (edgeIdx < splitEdges.length) {
            const ie = splitEdges[edgeIdx];
            const pcsOnSurf = ie.pcurves.filter(p => p.surface === surface);
            if (pcsOnSurf.length === 1) {
              const pc = pcsOnSurf[0];
              const t = isStart ? pc.curve2d.startParam : pc.curve2d.endParam;
              const uv2d = evaluateCurve2D(pc.curve2d, t);
              if (uv2d) u = uv2d.x;
            }
          }
          // Fallback: sample the intersection edge slightly away from the pole
          // to get a non-degenerate UV (avoids atan2(0,0) at the pole).
          if (u === null) {
            const ie = splitEdges[edgeIdx];
            if (ie) {
              const eps = 0.02;
              const t = isStart
                ? ie.curve.startParam + eps * (ie.curve.endParam - ie.curve.startParam)
                : ie.curve.endParam - eps * (ie.curve.endParam - ie.curve.startParam);
              const nearby = evalCurve(ie.curve, t);
              if (nearby) {
                const uv = adapter.projectPoint(nearby);
                u = uv.u;
              }
            }
          }
          if (u === null) {
            const uv = adapter.projectPoint(pt);
            u = uv.u;
          }
          if (adapter.isUPeriodic && u < 0) u += adapter.uPeriod;
          hitsOnDeg.push({ pt3d: pt, uParam: u });
        }
      }

      if (hitsOnDeg.length === 0) {
        // No intersection at this pole — add as single half-edge
        const startIdx = findOrAddVertex(vertices, vertices2D, eStart, edgeStartUV, seamSplit, adapter.uPeriod);
        const endIdx = findOrAddVertex(vertices, vertices2D, eEnd, edgeEndUV, seamSplit, adapter.uPeriod);
        boundaryHalfEdges.push({
          edge: oe.edge, forward: oe.forward,
          startVtx: startIdx, endVtx: endIdx,
          angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true, pcurveOccurrence: occurrence,
        });
      } else {
        // Split the degenerate edge at intersection U values.
        // Sort hits by U parameter between edgeStartUV.x and edgeEndUV.x.
        const uStart = edgeStartUV.x;
        const uEnd = edgeEndUV.x;
        const vConst = edgeStartUV.y; // constant V for degenerate edge

        // Normalize hit U values to be between uStart and uEnd
        const sortedUs: number[] = [];
        for (const h of hitsOnDeg) {
          let u = h.uParam;
          if (periodic) {
            while (u < Math.min(uStart, uEnd) - 0.01) u += adapter.uPeriod;
            while (u > Math.max(uStart, uEnd) + 0.01) u -= adapter.uPeriod;
          }
          // Skip if at start/end
          const tNorm = (u - uStart) / (uEnd - uStart);
          if (tNorm > TOL && tNorm < 1 - TOL) sortedUs.push(u);
        }
        sortedUs.sort((a, b) => a - b);

        // Create sub-edges for each segment
        let currentU = uStart;
        let currentPt = eStart;
        let currentUV: Pt2 = edgeStartUV;
        const allPoints = [...sortedUs, uEnd];
        for (const nextU of allPoints) {
          const nextUV: Pt2 = { x: nextU, y: vConst };
          const nextPt = degPt; // all degenerate points are the same 3D point
          const sIdx = findOrAddVertex(vertices, vertices2D, currentPt, currentUV, seamSplit, adapter.uPeriod);
          const eIdx = findOrAddVertex(vertices, vertices2D, nextPt, nextUV, seamSplit, adapter.uPeriod);
          boundaryHalfEdges.push({
            edge: oe.edge, forward: oe.forward,
            startVtx: sIdx, endVtx: eIdx,
            angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true, pcurveOccurrence: occurrence,
          });
          currentU = nextU;
          currentUV = nextUV;
          currentPt = nextPt;
        }
      }
      continue;
    }

    // Find intersection endpoints on this boundary edge
    const hitsOnEdge: { pt3d: Point3D; t: number }[] = [];
    const curve = oe.edge.curve;

    if (curve.type === 'line3d') {
      const dx = eEnd.x - eStart.x, dy = eEnd.y - eStart.y, dz = eEnd.z - eStart.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq > TOL * TOL) {
        for (const pt of intEndpoints) {
          const vx = pt.x - eStart.x, vy = pt.y - eStart.y, vz = pt.z - eStart.z;
          const t = (vx * dx + vy * dy + vz * dz) / lenSq;
          if (t < TOL || t > 1 - TOL) continue;
          const px = eStart.x + t * dx - pt.x, py = eStart.y + t * dy - pt.y, pz = eStart.z + t * dz - pt.z;
          if (Math.sqrt(px * px + py * py + pz * pz) > TOL) continue;
          hitsOnEdge.push({ pt3d: pt, t });
        }
      }
    } else if ((curve.type === 'arc3d' || curve.type === 'circle3d') && 'plane' in curve) {
      const arcCurve = curve as any;
      const arcPlane = arcCurve.plane;
      const tRange = curve.endParam - curve.startParam;
      const yDir = normalize(cross(arcPlane.normal, arcPlane.xAxis));
      for (const pt of intEndpoints) {
        const rel = vec3d(pt.x - arcPlane.origin.x, pt.y - arcPlane.origin.y, pt.z - arcPlane.origin.z);
        const xComp = rel.x * arcPlane.xAxis.x + rel.y * arcPlane.xAxis.y + rel.z * arcPlane.xAxis.z;
        const yComp = rel.x * yDir.x + rel.y * yDir.y + rel.z * yDir.z;
        const nComp = rel.x * arcPlane.normal.x + rel.y * arcPlane.normal.y + rel.z * arcPlane.normal.z;
        if (Math.abs(nComp) > 0.05) continue;
        if (Math.abs(Math.sqrt(xComp * xComp + yComp * yComp) - arcCurve.radius) > 0.05) continue;
        let angle = Math.atan2(yComp, xComp);
        // OCCT ref: ElCLib::InPeriod — normalize atan2 [-π,π] to curve range [0,2π].
        while (angle < curve.startParam - 0.01) angle += 2 * Math.PI;
        while (angle > curve.endParam + 0.01) angle -= 2 * Math.PI;
        if (angle < curve.startParam - 0.01 || angle > curve.endParam + 0.01) continue;
        const wireT = oe.forward
          ? (angle - curve.startParam) / tRange
          : 1 - (angle - curve.startParam) / tRange;
        if (wireT < TOL || wireT > 1 - TOL) continue;
        hitsOnEdge.push({ pt3d: pt, t: wireT });
      }
    }

    if (hitsOnEdge.length === 0) {
      const startIdx = findOrAddVertex(vertices, vertices2D, eStart, edgeStartUV, seamSplit, adapter.uPeriod);
      const endIdx = findOrAddVertex(vertices, vertices2D, eEnd, edgeEndUV, seamSplit, adapter.uPeriod);
      boundaryHalfEdges.push({
        edge: oe.edge, forward: oe.forward,
        startVtx: startIdx, endVtx: endIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true, pcurveOccurrence: occurrence,
      });
    } else {
      hitsOnEdge.sort((a, b) => a.t - b.t);
      const segTs = [0, ...hitsOnEdge.map(h => h.t), 1];
      const pts3d = [eStart, ...hitsOnEdge.map(h => h.pt3d), eEnd];

      for (let i = 0; i < pts3d.length - 1; i++) {
        if (distance(pts3d[i], pts3d[i + 1]) < TOL) continue;

        let subEdge: Edge | null = null;
        if ((curve.type === 'arc3d' || curve.type === 'circle3d') && 'plane' in curve) {
          const tRange = curve.endParam - curve.startParam;
          const subT0 = oe.forward ? curve.startParam + segTs[i] * tRange : curve.endParam - segTs[i] * tRange;
          const subT1 = oe.forward ? curve.startParam + segTs[i + 1] * tRange : curve.endParam - segTs[i + 1] * tRange;
          const arcRes = makeArc3D((curve as any).plane, (curve as any).radius, Math.min(subT0, subT1), Math.max(subT0, subT1));
          if (arcRes.success && arcRes.result) {
            const er = makeEdgeFromCurve(arcRes.result);
          if (er.success) subEdge = { ...er.result!, sourceEdge: oe.edge.sourceEdge ?? oe.edge };
        }
      }
      if (!subEdge) {
        const lr = makeLine3D(pts3d[i], pts3d[i + 1]);
        if (!lr.success) continue;
        const er = makeEdgeFromCurve(lr.result!);
        if (!er.success) continue;
        subEdge = { ...er.result!, sourceEdge: oe.edge.sourceEdge ?? oe.edge };
      }

        // OCCT ref: FillPaves uses 2D curve intersection to determine split UVs.
        // Use the intersection edge's PCurve UV for hit points UNLESS the boundary
        // edge being split is a seam edge (which has correct constant-U interpolation).
        // Seam edges have constant U throughout their PCurve; overriding with the
        // intersection edge's UV (which may span the full U range) would break the
        // seam-side PCurve.
        const isSeamBoundary = Math.abs(edgeStartUV.x - edgeEndUV.x) < 0.01;
        let sUV: Pt2;
        if (!isSeamBoundary && i > 0 && i - 1 < hitsOnEdge.length) {
          const hitPt = hitsOnEdge[i - 1].pt3d;
          const hitUV = getIntEndpointUV(hitPt, splitEdges, surface, adapter);
          sUV = hitUV ?? {
            x: edgeStartUV.x + segTs[i] * (edgeEndUV.x - edgeStartUV.x),
            y: edgeStartUV.y + segTs[i] * (edgeEndUV.y - edgeStartUV.y),
          };
        } else {
          sUV = {
            x: edgeStartUV.x + segTs[i] * (edgeEndUV.x - edgeStartUV.x),
            y: edgeStartUV.y + segTs[i] * (edgeEndUV.y - edgeStartUV.y),
          };
        }
        let eUV: Pt2;
        if (!isSeamBoundary && i + 1 > 0 && i + 1 - 1 < hitsOnEdge.length) {
          const hitPt = hitsOnEdge[i + 1 - 1].pt3d;
          const hitUV = getIntEndpointUV(hitPt, splitEdges, surface, adapter);
          eUV = hitUV ?? {
            x: edgeStartUV.x + segTs[i + 1] * (edgeEndUV.x - edgeStartUV.x),
            y: edgeStartUV.y + segTs[i + 1] * (edgeEndUV.y - edgeStartUV.y),
          };
        } else {
          eUV = {
            x: edgeStartUV.x + segTs[i + 1] * (edgeEndUV.x - edgeStartUV.x),
            y: edgeStartUV.y + segTs[i + 1] * (edgeEndUV.y - edgeStartUV.y),
          };
        }

        // Attach PCurve(s) to sub-edge.
        // For closed-surface edges, preserve a stable occurrence order on the
        // split edge rather than "current traversal first". Later OCCT-style
        // consumers rely on PCurve1/PCurve2 being consistent.
        const occurrenceRanges = new Map<number, { start: Pt2; end: Pt2 }>();
        occurrenceRanges.set(occurrence, { start: sUV, end: eUV });

        const secondaryOccurrence = occurrence === 0 ? 1 : 0;
        const parentPC2 = findPCurve(oe.edge, surface, secondaryOccurrence);
        if (parentPC2) {
          const pc2uv = getEdgeUV(oe.edge, surface, oe.forward, secondaryOccurrence);
          if (pc2uv) {
            occurrenceRanges.set(secondaryOccurrence, {
              start: {
                x: pc2uv.start.x + segTs[i] * (pc2uv.end.x - pc2uv.start.x),
                y: pc2uv.start.y + segTs[i] * (pc2uv.end.y - pc2uv.start.y),
              },
              end: {
                x: pc2uv.start.x + segTs[i + 1] * (pc2uv.end.x - pc2uv.start.x),
                y: pc2uv.start.y + segTs[i + 1] * (pc2uv.end.y - pc2uv.start.y),
              },
            });
          }
        }

        for (const occurrenceIndex of Array.from(occurrenceRanges.keys()).sort((a, b) => a - b)) {
          const range = occurrenceRanges.get(occurrenceIndex)!;
          const subPC = makeLine2D(
            { x: range.start.x, y: range.start.y },
            { x: range.end.x, y: range.end.y },
          );
          if (subPC.result) addPCurveToEdge(subEdge, makePCurve(subPC.result, surface));
        }

        // Determine correct forward flag: sub-edges from makeArc3D always have
        // geometric direction from lower to higher angle. When the original wire
        // traversal was reversed, the sub-edge's geometric direction may be opposite
        // to the wire direction. Check by comparing the edge's start point to pts3d[i].
        const subFwd = distance(edgeStartPoint(subEdge), pts3d[i]) < TOL * 100;
        const startIdx = findOrAddVertex(vertices, vertices2D, pts3d[i], sUV, seamSplit, adapter.uPeriod);
        const endIdx = findOrAddVertex(vertices, vertices2D, pts3d[i + 1], eUV, seamSplit, adapter.uPeriod);

        // PCurves must be in edge geometric direction. If subFwd=false, the PCurves
        // we just attached go in wire direction — reverse them all.
        if (!subFwd && subEdge.pcurves.length > 0) {
          const reversedPCs: typeof subEdge.pcurves = [];
          for (const pc of subEdge.pcurves) {
            const c = pc.curve2d;
            const s = evaluateCurve2D(c, c.startParam);
            const e = evaluateCurve2D(c, c.endParam);
            const rev = makeLine2D({ x: e.x, y: e.y }, { x: s.x, y: s.y });
            if (rev.result) reversedPCs.push(makePCurve(rev.result, surface));
          }
          subEdge.pcurves.length = 0;
          for (const rpc of reversedPCs) addPCurveToEdge(subEdge, rpc);
        }

        boundaryHalfEdges.push({
          edge: subEdge, forward: subFwd, startVtx: startIdx, endVtx: endIdx,
          angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true, pcurveOccurrence: occurrence,
        });
      }
    }
  }

  // ── Inner wire boundary half-edges (existing holes) ──
  // OCCT ref: BOPAlgo_BuilderFace::PerformLoops processes ALL wire edges,
  // not just the outer wire. When a face with holes gets re-split by a
  // second boolean, the existing hole edges must be included.
  for (const iw of face.innerWires) {
    prevEndUV = null;
    for (const oe of iw.edges) {
      const eStart = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      const eEnd = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);

      if (oe.edge.degenerate) continue;

      const occurrence = edgeSeen.get(oe.edge) || 0;
      edgeSeen.set(oe.edge, occurrence + 1);

      let { start: edgeStartUV, end: edgeEndUV } = getBoundaryEdgeUV(
        oe.edge, surface, adapter, oe.forward, occurrence, eStart, eEnd,
      );

      if (periodic && prevEndUV) {
        const period = adapter.uPeriod;
        const du = edgeStartUV.x - prevEndUV.x;
        if (Math.abs(du) > period / 2) {
          const shift = du > 0 ? -period : period;
          edgeStartUV = { x: edgeStartUV.x + shift, y: edgeStartUV.y };
          edgeEndUV = { x: edgeEndUV.x + shift, y: edgeEndUV.y };
        }
      }
      prevEndUV = edgeEndUV;

      // Inner wire edges are not split by intersection endpoints — they're
      // existing topology. Just add as boundary half-edges.
      const startIdx = findOrAddVertex(vertices, vertices2D, eStart, edgeStartUV, seamSplit, adapter.uPeriod);
      const endIdx = findOrAddVertex(vertices, vertices2D, eEnd, edgeEndUV, seamSplit, adapter.uPeriod);
      boundaryHalfEdges.push({
        edge: oe.edge, forward: oe.forward,
        startVtx: startIdx, endVtx: endIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true, pcurveOccurrence: occurrence,
      });
    }
  }

  // ── Intersection half-edges ──
  // OCCT ref: BuilderFace/WireSplitter works on the full wire-edge-set, which
  // contains both boundary and section edges. Keep section edges separate here,
  // then combine them with boundary uses below.
  // FFI result edges that coincide with face boundary edges are not duplicated.
  const boundaryEdgePairs = new Map<string, string>(); // "v1-v2" → curve type
  for (const bhe of boundaryHalfEdges) {
    boundaryEdgePairs.set(`${bhe.startVtx}-${bhe.endVtx}`, bhe.edge.curve.type);
  }

  const intHalfEdges: HalfEdge[] = [];
  for (const e of splitEdges) {
    const startPt = edgeStartPoint(e);
    const endPt = edgeEndPoint(e);
    const uvFwd = getEdgeUV(e, surface, true);

    let startUV: Pt2, endUV: Pt2;
    let isSelfLoop = false;

    if (uvFwd) {
      startUV = uvFwd.start;
      endUV = uvFwd.end;
      // Closed curve with PCurve: distinct start/end UV (circle opened at seam)
      isSelfLoop = false;
    } else if (e.curve.isClosed) {
      // Closed curve without PCurve: self-loop (hole-maker on plane)
      const uv0 = projectToUV(adapter, startPt);
      startUV = uv0;
      endUV = uv0;
      isSelfLoop = true;
    } else {
      startUV = projectToUV(adapter, startPt);
      endUV = projectToUV(adapter, endPt);
    }

    // On periodic surfaces, normalize intersection edge UVs to [0, period)
    // so they merge correctly with boundary vertices.
    // OCCT ref: BOPAlgo_WireSplitter_1::Coord2d evaluates PCurves directly
    // and does NOT normalize — seam vertices at u≈0 vs u≈2π stay separate.
    // We only normalize when seamSplit is OFF. When seamSplit is ON, the
    // full-period span (0 → 2π) must be preserved so the circle connects
    // to separate seam-side vertices, splitting the face properly.
    if (!isSelfLoop && periodic && adapter.uPeriod > 0 && !seamSplit) {
      const period = adapter.uPeriod;
      while (startUV.x < 0) startUV = { x: startUV.x + period, y: startUV.y };
      while (startUV.x >= period) startUV = { x: startUV.x - period, y: startUV.y };
      while (endUV.x < 0) endUV = { x: endUV.x + period, y: endUV.y };
      while (endUV.x >= period) endUV = { x: endUV.x - period, y: endUV.y };
    }

    if (isSelfLoop) {
      const idx = findOrAddVertex(vertices, vertices2D, startPt, startUV, false, adapter.uPeriod);
      intHalfEdges.push({ edge: e, forward: true, startVtx: idx, endVtx: idx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false, pcurveOccurrence: 0 });
      intHalfEdges.push({ edge: e, forward: false, startVtx: idx, endVtx: idx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false, pcurveOccurrence: 0 });
    } else {
      const startIdx = findOrAddVertex(vertices, vertices2D, startPt, startUV, false, adapter.uPeriod);
      const endIdx = findOrAddVertex(vertices, vertices2D, endPt, endUV, false, adapter.uPeriod);

      // Skip if same vertex pair AND same curve type as a boundary edge
      const pFwd = `${startIdx}-${endIdx}`, pRev = `${endIdx}-${startIdx}`;
      const tFwd = boundaryEdgePairs.get(pFwd), tRev = boundaryEdgePairs.get(pRev);
      if ((tFwd && tFwd === e.curve.type) || (tRev && tRev === e.curve.type)) {
        continue;
      }

      intHalfEdges.push({ edge: e, forward: true, startVtx: startIdx, endVtx: endIdx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false, pcurveOccurrence: 0 });
      intHalfEdges.push({ edge: e, forward: false, startVtx: endIdx, endVtx: startIdx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false, pcurveOccurrence: 0 });
    }
  }

  const allHalfEdges = [...boundaryHalfEdges, ...intHalfEdges];
  const allWithReverse = [
    ...boundaryHalfEdges.flatMap((he) => [
      he,
      {
        edge: he.edge,
        forward: !he.forward,
        startVtx: he.endVtx,
        endVtx: he.startVtx,
        angleAtStart: 0,
        angleAtEnd: 0,
        used: false,
        isBoundary: true,
        pcurveOccurrence: he.pcurveOccurrence,
      } satisfies HalfEdge,
    ]),
    ...intHalfEdges,
  ];
  const closedVertices = new Set<number>();
  for (const he of allWithReverse) {
    if (!isClosedOnFace(he.edge, surface)) continue;
    closedVertices.add(he.startVtx);
    closedVertices.add(he.endVtx);
  }

  // ── Compute tangent angles and start UVs ──
  // OCCT ref: Angle2D computes the angle. Coord2dVf provides the UV at the
  // start vertex for seam disambiguation. We store startUV from the vertex
  // pool, which encodes the correct seam side (u≈0 vs u≈2π).
  for (const he of allWithReverse) {
    he.angleAtStart = tangentAngle(he, true, surface, adapter, vertices2D);
    he.angleAtEnd = tangentAngle(he, false, surface, adapter, vertices2D);
    he.startUV = vertices2D[he.startVtx];
  }
  // OCCT reference: BOPAlgo_WireSplitter_1.cxx RefineAngles().
  // On boundary vertices with two inside ways, move the inside edge angles
  // just within the boundary wedge so Path() chooses the intended section chain.
  refineHalfEdgeAngles(allWithReverse, surface, vertices2D);

  // ── Build OCCT-like SmartMap: vertex -> incident edge uses ──
  const smartMap = new Map<number, VertexEdgeInfo[]>();
  for (const he of allWithReverse) {
    const startList = smartMap.get(he.startVtx) || [];
    startList.push({ he, isIn: false, isInside: !he.isBoundary, angle: he.angleAtStart });
    smartMap.set(he.startVtx, startList);

    const endList = smartMap.get(he.endVtx) || [];
    endList.push({ he, isIn: true, isInside: !he.isBoundary, angle: he.angleAtEnd });
    smartMap.set(he.endVtx, endList);
  }

  // ── Trace wire loops ──
  // OCCT ref: BOPAlgo_WireSplitter_1.cxx iterates by vertex, then outgoing
  // edge-info order at that vertex, and starts Path() from each not-passed
  // outgoing edge in the split-edge graph.
  const loops: HalfEdge[][] = [];
  const startVertices = [...smartMap.keys()];
  for (const startVtx of startVertices) {
    const starts = smartMap.get(startVtx) || [];
    for (const startInfo of starts) {
      if (startInfo.isIn) continue;
      const he = startInfo.he;
      if (he.used) continue;
      // OCCT ref: BOPAlgo_WireSplitter_1.cxx lines 438-446 — skip degenerate
      // edges as starting points for wire tracing. They participate as
      // intermediate edges when encountered during traversal, but never
      // initiate a new path (they'd create standalone degenerate "wires").
      if (he.edge.degenerate) continue;
      let current = he;
      let currentInfo = startInfo;

      // Path tracing (OCCT BOPAlgo_WireSplitter_1.cxx Path())
      // OCCT stores UV at each path vertex (aCoordVa) from the edge's PCurve.
      // This is critical for seam disambiguation: the stored UV reflects which
      // seam side the path arrived from, enabling correct 2D distance checks.
      const pathEdges: HalfEdge[] = [];
      const pathVertices: number[] = [he.startVtx];
      const pathUVs: (Pt2 | null)[] = [];
      // UV at the start vertex (aCoordVa in OCCT: Coord2d of the FORWARD vertex)
      {
        const startUV = getEdgeUV(he.edge, surface, he.forward, he.pcurveOccurrence);
        pathUVs.push(startUV ? startUV.start : null);
      }
      current.used = true;
      pathEdges.push(current);
      pathVertices.push(current.endVtx);
      // UV at the end vertex
      {
        const endUV = getEdgeUV(current.edge, surface, current.forward, current.pcurveOccurrence);
        pathUVs.push(endUV ? endUV.end : null);
      }

      for (let safety = 0; safety < 10000; safety++) {
        const vtx = pathVertices[pathVertices.length - 1];

      // OCCT ref: BOPAlgo_WireSplitter_1.cxx Path() lines 426-524.
      // Scan BACKWARDS through path to find sub-loop. bHasEdge gates the
      // vertex-match check: degenerate-only tails are skipped entirely.
      let loopStartIdx = -1;
      // OCCT: aPb = Coord2d(aVb, aEOuta, myFace) — UV of current vertex on the
      // last edge's PCurve. Use stored pathUVs for the current position.
      const endUVForClosure: Pt2 | null = pathUVs[pathUVs.length - 1];
      const endTol2D = endUVForClosure ? 2 * tolerance2D(adapter, endUVForClosure, TOL) : 0;
      const endTolU = endUVForClosure ? 2 * uTolerance2D(adapter, endUVForClosure, TOL) : 0;
      const endTolV = endUVForClosure ? 2 * vTolerance2D(adapter, endUVForClosure, TOL) : 0;
      let bHasEdge = false;
      for (let k = pathVertices.length - 2; k >= 0; k--) {
        const edgeAtK = pathEdges[k];
        if (!bHasEdge) {
          bHasEdge = !edgeAtK.edge.degenerate;
          if (!bHasEdge) continue;
        }
        if (pathVertices[k] !== vtx) continue;
        // OCCT: aPaPrev = aCoordVa(i) — UV stored when vertex was first visited.
        // Compare with aPb (endUVForClosure) by 2D distance.
        if (closedVertices.has(vtx) && endUVForClosure) {
          const uvAtK = pathUVs[k];
          if (uvAtK) {
            const { du, dv } = uvDistanceRaw(uvAtK, endUVForClosure);
            if (du * du + dv * dv >= endTol2D * endTol2D) continue;
            if (du > endTolU || dv > endTolV) continue;
          }
        }
        loopStartIdx = k;
        break;
      }

      if (loopStartIdx >= 0) {
        const subLoop = pathEdges.splice(loopStartIdx);
        pathVertices.splice(loopStartIdx + 1);
        pathUVs.splice(loopStartIdx + 1);
        const isUturn = subLoop.length === 2 && subLoop[0].edge === subLoop[1].edge;
        if (subLoop.length >= 1 && !isUturn) {
          loops.push(subLoop);
        } else {
          for (const h of subLoop) h.used = false;
        }
        if (pathEdges.length === 0) break;
        // OCCT ref: BOPAlgo_WireSplitter_1.cxx lines 500-520.
        // After extracting a closed sub-loop, continue Path() from the last
        // remaining edge in the prefix, not from the just-removed current edge.
        const prefixLast = pathEdges[pathEdges.length - 1];
        const prefixVertex = pathVertices[pathVertices.length - 1];
        const prefixIncidences = smartMap.get(prefixVertex) || [];
        const prefixIncoming = prefixIncidences.find((info) =>
          info.isIn &&
          info.he.edge === prefixLast.edge &&
          info.he.forward === prefixLast.forward &&
          info.he.pcurveOccurrence === prefixLast.pcurveOccurrence &&
          info.he.startVtx === prefixLast.startVtx &&
          info.he.endVtx === prefixLast.endVtx);
        if (prefixIncoming) {
          currentInfo = prefixIncoming;
        }
        continue;
      }

      // Find next half-edge
      const lastEdge = pathEdges[pathEdges.length - 1];
      const incidences = smartMap.get(vtx);
      if (!incidences) break;

      // OCCT ref: Path() line 418 — aPb = Coord2d(aVb, aEOuta, myFace)
      // Use the stored UV at the current path position for seam disambiguation.
      const currentUV: Pt2 | null = pathUVs[pathUVs.length - 1];
      const currentTol2D = currentUV ? 2 * tolerance2D(adapter, currentUV, TOL) : 0;
      const currentTolU = currentUV ? 2 * uTolerance2D(adapter, currentUV, TOL) : 0;
      const currentTolV = currentUV ? 2 * vTolerance2D(adapter, currentUV, TOL) : 0;
      // OCCT ref: BOPAlgo_WireSplitter_1.cxx Path() calls AngleIn(aEOuta, aLEInfo)
      // at the current vertex. Read the incoming angle from the local
      // edge-info list instead of trusting the cached edge-end angle, so
      // duplicate uses on periodic/closed faces follow the same per-vertex
      // incidence semantics as OCCT.
      const incomingIncidence = incidences.find((info) =>
        info.isIn &&
        info.he.edge === lastEdge.edge &&
        info.he.forward === lastEdge.forward &&
        info.he.pcurveOccurrence === lastEdge.pcurveOccurrence &&
        info.he.startVtx === lastEdge.startVtx &&
        info.he.endVtx === lastEdge.endVtx);
      const incomingAngle = incomingIncidence ? incomingIncidence.angle : lastEdge.angleAtEnd;

      let wayCount = 0;
      for (const candInfo of incidences) {
        if (candInfo.isIn || candInfo.he.used) continue;
        wayCount++;
      }
      if (wayCount === 0) break;

      let bestInfo: VertexEdgeInfo | null = null;
      let bestAngle = Infinity;
      let insideCount = 0;
      let onlyInside: VertexEdgeInfo | null = null;

      for (const candInfo of incidences) {
        if (candInfo.isIn || candInfo.he.used) continue;
        const cand = candInfo.he;

        if (wayCount === 1) {
          bestInfo = candInfo;
          break;
        }

        // OCCT: Path() lines 572-583 — Coord2dVf(aE, myFace) gives the UV at
        // the candidate edge's forward vertex. Compare with aPb by 2D distance.
        // Use PCurve UV when available (standard modulo wrapping for periodic
        // surfaces). Fall back to vertex pool startUV without modulo for edges
        // lacking PCurves (e.g. pole sub-edges where modulo hides seam side).
        if (closedVertices.has(vtx) && currentUV && cand.startVtx !== cand.endVtx) {
          let du: number, dv: number;
          const candForwardUV = getForwardVertexUV(cand.edge, surface, cand.forward, cand.pcurveOccurrence);
          if (candForwardUV) {
            ({ du, dv } = uvDistanceRaw(candForwardUV, currentUV));
          } else if (cand.startUV) {
            ({ du, dv } = uvDistanceRaw(cand.startUV, currentUV));
          } else {
            const cw = cand.edge === lastEdge.edge
              ? 2 * Math.PI
              : clockwiseAngle(incomingAngle, candInfo.angle);
            if (candInfo.isInside) {
              insideCount++;
              onlyInside = candInfo;
            }
            if (cw < bestAngle) {
              bestAngle = cw;
              bestInfo = candInfo;
            }
            continue;
          }
          if (du * du + dv * dv >= currentTol2D * currentTol2D) continue;
          if (du > currentTolU || dv > currentTolV) continue;
        }

        if (!currentInfo.isInside && candInfo.isInside) {
          insideCount++;
          onlyInside = candInfo;
        }

        const cw = cand.edge === lastEdge.edge
          ? 2 * Math.PI
          : clockwiseAngle(incomingAngle, candInfo.angle);
        if (cw < bestAngle) {
          bestAngle = cw;
          bestInfo = candInfo;
        }
      }

      if (!currentInfo.isInside && insideCount === 1 && onlyInside) {
        bestInfo = onlyInside;
      }

      const bestHE = bestInfo?.he ?? null;
      if (!bestHE || !bestInfo) break;
      bestHE.used = true;
      currentInfo = bestInfo;
      pathEdges.push(bestHE);
      pathVertices.push(bestHE.endVtx);
      // OCCT: store UV at the new vertex from the edge's PCurve end
      const newUV = getEdgeUV(bestHE.edge, surface, bestHE.forward, bestHE.pcurveOccurrence);
      pathUVs.push(newUV ? newUV.end : null);
    }

      if (pathEdges.length >= 1) {
        loops.push(pathEdges);
      }
    }
  }

  if (loops.length === 0) return { loops: [], vertices2D, splitEdges };

  return { loops, vertices2D, splitEdges };
}

export function debugBuilderFaceLoops(face: Face, edges: Edge[]): HalfEdge[][] {
  const traced = traceBuilderFace(face, edges);
  return traced ? traced.loops : [];
}

export function debugTraceBuilderFace(face: Face, edges: Edge[]): BuilderFaceTraceDebug | null {
  return traceBuilderFace(face, edges);
}

export function debugGetEdgeUseUV(
  edge: Edge,
  surface: Surface,
  forward: boolean,
  occurrence: number = 0,
): { start: Pt2; end: Pt2 } | null {
  return getEdgeUV(edge, surface, forward, occurrence);
}

export interface BuilderFaceLoopDebugInfo {
  wireEdgeCount: number;
  usesOriginalBoundary: boolean;
  splitEdgeCount: number;
  signedArea: number;
  areaAbs: number;
  sourceEdgeKeys: string[];
}

export interface BuilderFaceResultDebugInfo {
  outerWireEdgeCount: number;
  innerWireEdgeCounts: number[];
}

export interface BuilderFaceAreaDebug {
  loops: BuilderFaceLoopDebugInfo[];
  outers: BuilderFaceLoopDebugInfo[];
  candidateHoles: BuilderFaceLoopDebugInfo[];
  finalFaces: BuilderFaceResultDebugInfo[];
}

interface TemporaryWireAnalysis {
  polygon: Pt2[];
  signedArea: number;
  perimeter: number;
  expectedThickness: number;
  maxDeflectionU: number;
  maxDeflectionV: number;
  isHole: boolean;
  badWire: boolean;
}

function pointLineDeviation2D(a: Pt2, b: Pt2, p: Pt2): { du: number; dv: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-16) {
    return {
      du: Math.abs(p.x - a.x),
      dv: Math.abs(p.y - a.y),
    };
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const proj = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };
  return {
    du: Math.abs(proj.x - p.x),
    dv: Math.abs(proj.y - p.y),
  };
}

function sampleTemporaryWirePolygon(
  wire: Wire,
  surface: Surface,
  adapter: SurfaceAdapter,
): { polygon: Pt2[]; maxDeflectionU: number; maxDeflectionV: number } {
  const pts: Pt2[] = [];
  let maxDeflectionU = 0;
  let maxDeflectionV = 0;
  let firstEdge = true;

  function appendPoint(pt: Pt2): void {
    let adjusted = { ...pt };
    if (adapter.isUPeriodic && pts.length > 0) {
      const prev = pts[pts.length - 1];
      const period = adapter.uPeriod;
      let best = adjusted.x;
      let bestDist = Math.abs(adjusted.x - prev.x);
      for (const candidate of [adjusted.x - period, adjusted.x + period]) {
        const dist = Math.abs(candidate - prev.x);
        if (dist < bestDist) {
          best = candidate;
          bestDist = dist;
        }
      }
      adjusted = { x: best, y: adjusted.y };
    }
    pts.push(adjusted);
  }

  for (const oe of wire.edges) {
    const pc = findPCurveForUse(oe.edge, surface, oe.forward, 0);
    if (pc) {
      const c = pc.curve2d;
      const isCurved = c.type === 'circle' || c.type === 'arc' || c.type === 'ellipse';
      const n = isCurved ? 33 : 3;
      const startIndex = firstEdge ? 0 : 1;
      for (let i = startIndex; i < n; i++) {
        const frac = i / (n - 1);
        const t = oe.forward
          ? c.startParam + frac * (c.endParam - c.startParam)
          : c.endParam - frac * (c.endParam - c.startParam);
        appendPoint(evaluateCurve2D(c, t));
      }
      if (pts.length >= 5) {
        const deviation = pointLineDeviation2D(pts[pts.length - 4], pts[pts.length - 1], pts[pts.length - 2]);
        maxDeflectionU = Math.max(maxDeflectionU, deviation.du);
        maxDeflectionV = Math.max(maxDeflectionV, deviation.dv);
      }
      firstEdge = false;
      continue;
    }

    const curve = oe.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
    if (isCurved) {
      const n = curve.isClosed ? 33 : 17;
      const startIndex = firstEdge ? 0 : 1;
      for (let i = startIndex; i < n; i++) {
        const frac = i / (n - 1);
        const t = oe.forward
          ? curve.startParam + frac * (curve.endParam - curve.startParam)
          : curve.endParam - frac * (curve.endParam - curve.startParam);
        const uv = adapter.projectPoint(evalCurve(curve, t));
        appendPoint({ x: uv.u, y: uv.v });
      }
      if (pts.length >= 5) {
        const deviation = pointLineDeviation2D(pts[pts.length - 4], pts[pts.length - 1], pts[pts.length - 2]);
        maxDeflectionU = Math.max(maxDeflectionU, deviation.du);
        maxDeflectionV = Math.max(maxDeflectionV, deviation.dv);
      }
      firstEdge = false;
      continue;
    }

    const p3 = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const uv = adapter.projectPoint(p3);
    appendPoint({ x: uv.u, y: uv.v });
    firstEdge = false;
  }

  return { polygon: pts, maxDeflectionU, maxDeflectionV };
}

function analyzeTemporaryWire(
  wire: Wire,
  surface: Surface,
  adapter: SurfaceAdapter,
  periodic: boolean,
): TemporaryWireAnalysis {
  const { polygon, maxDeflectionU, maxDeflectionV } = sampleTemporaryWirePolygon(wire, surface, adapter);
  const signedArea = polygon.length >= 3
    ? polygonSignedAreaRaw(polygon)
    : 0;
  const perimeter = polygon.length >= 2
    ? polygonPerimeterRaw(polygon)
    : 0;
  const expectedThickness = perimeter > 0
    ? Math.max((2 * Math.abs(signedArea)) / perimeter, 1e-7)
    : 0;

  const seenEdges = new Set<Edge>();
  let repeatedEdge = false;
  for (const oe of wire.edges) {
    if (seenEdges.has(oe.edge)) {
      repeatedEdge = true;
      break;
    }
    seenEdges.add(oe.edge);
  }

  // OCCT ref: IntTools_FClass2d::Init()
  // 1. classify from the sampled wire polygon (SeqPnt2d)
  // 2. reject bad wires with insufficient polygon support / near-zero area /
  //    excessive deflection for their area-perimeter thickness ratio
  const badWire =
    repeatedEdge
    || polygon.length <= 3
    || Math.abs(signedArea) < 1e-8
    || expectedThickness <= 1e-7
    || Math.max(maxDeflectionU, maxDeflectionV) > expectedThickness;

  return {
    polygon,
    signedArea,
    perimeter,
    expectedThickness,
    maxDeflectionU,
    maxDeflectionV,
    isHole: signedArea < 0,
    badWire,
  };
}

export function debugBuilderFaceAreas(face: Face, edges: Edge[]): BuilderFaceAreaDebug | null {
  if (edges.length === 0) return null;

  const surface = face.surface;
  const adapter = toAdapter(surface);
  const periodic = adapter.isUPeriodic;
  const traced = traceBuilderFace(face, edges);
  if (!traced) return null;
  const { loops, vertices2D, splitEdges } = traced;
  if (loops.length === 0) return {
    loops: [],
    outers: [],
    candidateHoles: [],
    finalFaces: [],
  };

  function sampleHalfEdgeUVs(he: HalfEdge): Pt2[] {
    const pc = findPCurveForUse(he.edge, surface, he.forward, he.pcurveOccurrence);
    if (pc) {
      const c = pc.curve2d;
      const n = (c.type === 'circle' || c.type === 'arc') ? 32 : 4;
      const pts: Pt2[] = [];
      for (let i = 0; i < n; i++) {
        const frac = i / n;
        const t = he.forward
          ? c.startParam + frac * (c.endParam - c.startParam)
          : c.endParam - frac * (c.endParam - c.startParam);
        pts.push(evaluateCurve2D(c, t));
      }
      return pts;
    }

    const curve = he.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
    if (isCurved) {
      const n = curve.isClosed ? 64 : 16;
      const pts: Pt2[] = [];
      for (let i = 0; i < n; i++) {
        const frac = i / n;
        const t = he.forward
          ? curve.startParam + frac * (curve.endParam - curve.startParam)
          : curve.endParam - frac * (curve.endParam - curve.startParam);
        const uv = adapter.projectPoint(evalCurve(curve, t));
        pts.push({ x: uv.u, y: uv.v });
      }
      return pts;
    }

    return [vertices2D[he.startVtx]];
  }

  function loopPolygonFromHalfEdges(loop: HalfEdge[]): Pt2[] {
    const pts: Pt2[] = [];
    for (const he of loop) {
      pts.push(...sampleHalfEdgeUVs(he));
    }
    return pts;
  }

  const originalOuterEdgeSet = new Set(face.outerWire.edges.map((oe) => oe.edge));
  const originalInnerEdgeSet = new Set(face.innerWires.flatMap((wire) => wire.edges.map((oe) => oe.edge)));
  const originalBoundarySourceSet = new Set([...originalOuterEdgeSet, ...originalInnerEdgeSet]);
  const splitEdgeSet = new Set(splitEdges);
  const infos: BuilderFaceLoopDebugInfo[] = [];
  const outers: BuilderFaceLoopDebugInfo[] = [];
  const candidateHoles: BuilderFaceLoopDebugInfo[] = [];
  const seenLoopKeys = new Set<string>();
  const round = (value: number) => Math.round(value / 1e-7) * 1e-7;
  const edgeKey = (edgeToKey: Edge) => {
    const start = edgeStartPoint(edgeToKey);
    const end = edgeEndPoint(edgeToKey);
    const s = `${round(start.x)},${round(start.y)},${round(start.z)}`;
    const e = `${round(end.x)},${round(end.y)},${round(end.z)}`;
    return s < e ? `${s}|${e}` : `${e}|${s}`;
  };

  for (const loop of loops) {
    const loopKey = canonicalizeLoopKey(loop);
    if (seenLoopKeys.has(loopKey)) continue;
    seenLoopKeys.add(loopKey);
    const wire = makeWireFromTracedLoop(loop);
    if (!wire || !wire.isClosed) continue;
    const usesOriginalBoundary = wire.edges.some((oe) =>
      originalBoundarySourceSet.has(oe.edge.sourceEdge ?? oe.edge));
    const splitEdgeCount = wire.edges.filter((oe) =>
      splitEdgeSet.has(oe.edge.sourceEdge ?? oe.edge)).length;
    const info: BuilderFaceLoopDebugInfo = {
      wireEdgeCount: wire.edges.length,
      usesOriginalBoundary,
      splitEdgeCount,
      signedArea: analyzeTemporaryWire(wire, surface, adapter, periodic).signedArea,
      areaAbs: Math.abs(analyzeTemporaryWire(wire, surface, adapter, periodic).signedArea),
      sourceEdgeKeys: wire.edges.map((oe) => edgeKey(oe.edge.sourceEdge ?? oe.edge)).sort(),
    };
    infos.push(info);
    if (!usesOriginalBoundary) {
      candidateHoles.push(info);
    }
  }

  const holeEdgeKeys = new Set<string>();
  for (const info of infos) {
    const isGrowthFromHoleEdges = info.sourceEdgeKeys.some((key) => holeEdgeKeys.has(key));
    const isGrowthFromOrientation = info.signedArea > 0;
    if (isGrowthFromHoleEdges || isGrowthFromOrientation) {
      outers.push(info);
    } else {
      candidateHoles.push(info);
      for (const key of info.sourceEdgeKeys) {
        holeEdgeKeys.add(key);
      }
    }
  }

  const finalFaces = builderFace(face, edges).map((candidate) => ({
    outerWireEdgeCount: candidate.outerWire.edges.length,
    innerWireEdgeCounts: candidate.innerWires.map((wire) => wire.edges.length),
  }));

  return { loops: infos, outers, candidateHoles, finalFaces };
}

function makeWireFromTracedLoop(loop: HalfEdge[]): Wire | null {
  const orientedEdges: OrientedEdge[] = loop.map((he) => orientEdge(he.edge, he.forward));
  const strict = makeWire(orientedEdges);
  if (strict.success && strict.result!.isClosed) {
    return strict.result!;
  }

  // OCCT reference: BRep_Builder::Add(wire, edge) preserves the traced
  // topological sequence without rechecking geometric endpoint coincidence.
  // BuilderFace/WireSplitter works from shared vertex identity on the path;
  // keep that topology when tiny SSI endpoint noise exceeds our global
  // geometric wire tolerance.
  for (let i = 0; i < loop.length; i++) {
    const next = (i + 1) % loop.length;
    if (loop[i].endVtx !== loop[next].startVtx) {
      return null;
    }
  }

  return {
    edges: orientedEdges,
    isClosed: loop.length > 0 && loop[0].startVtx === loop[loop.length - 1].endVtx,
  };
}

export function builderFace(face: Face, edges: Edge[]): Face[] {
  if (edges.length === 0) return [face];

  const surface = face.surface;
  const adapter = toAdapter(surface);
  const periodic = adapter.isUPeriodic;
  const traced = traceBuilderFace(face, edges);
  if (!traced) return [face];
  const { loops, vertices2D, splitEdges } = traced;
  if (loops.length === 0) return [face];

  // ── Build wires from loops and classify ──

  interface LoopInfo {
    wire: Wire;
    analysis: TemporaryWireAnalysis;
    loop: HalfEdge[];
  }

  function sampleHalfEdgeUVs(he: HalfEdge): Pt2[] {
    const pc = findPCurveForUse(he.edge, surface, he.forward, he.pcurveOccurrence);
    if (pc) {
      const c = pc.curve2d;
      const n = (c.type === 'circle' || c.type === 'arc') ? 32 : 4;
      const pts: Pt2[] = [];
      for (let i = 0; i < n; i++) {
        const frac = i / n;
        const t = he.forward
          ? c.startParam + frac * (c.endParam - c.startParam)
          : c.endParam - frac * (c.endParam - c.startParam);
        pts.push(evaluateCurve2D(c, t));
      }
      return pts;
    }

    const curve = he.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
    if (isCurved) {
      const n = curve.isClosed ? 64 : 16;
      const pts: Pt2[] = [];
      for (let i = 0; i < n; i++) {
        const frac = i / n;
        const t = he.forward
          ? curve.startParam + frac * (curve.endParam - curve.startParam)
          : curve.endParam - frac * (curve.endParam - curve.startParam);
        const uv = adapter.projectPoint(evalCurve(curve, t));
        pts.push({ x: uv.u, y: uv.v });
      }
      return pts;
    }

    return [vertices2D[he.startVtx]];
  }

  function loopPolygonFromHalfEdges(loop: HalfEdge[]): Pt2[] {
    const pts: Pt2[] = [];
    for (const he of loop) {
      pts.push(...sampleHalfEdgeUVs(he));
    }
    return pts;
  }

  const loopInfos: LoopInfo[] = [];
  const standaloneClosedLoopKeys = new Set<string>();
  const seenLoopKeys = new Set<string>();
  const originalOuterEdgeSet = new Set(face.outerWire.edges.map((oe) => oe.edge));
  const originalInnerEdgeSet = new Set(face.innerWires.flatMap((wire) => wire.edges.map((oe) => oe.edge)));
  const originalBoundarySourceSet = new Set([...originalOuterEdgeSet, ...originalInnerEdgeSet]);

  for (const loop of loops) {
    const loopKey = canonicalizeLoopKey(loop);
    if (seenLoopKeys.has(loopKey)) continue;
    seenLoopKeys.add(loopKey);

    const wire = makeWireFromTracedLoop(loop);
    if (!wire || !wire.isClosed) continue;

    if (wire.edges.length === 1) {
      const curve = wire.edges[0].edge.curve;
      if (curve.isClosed && curve.type === 'circle3d') {
        const key = [
          curve.type,
          curve.plane.origin.x.toFixed(6),
          curve.plane.origin.y.toFixed(6),
          curve.plane.origin.z.toFixed(6),
          curve.radius.toFixed(6),
        ].join(':');
        if (standaloneClosedLoopKeys.has(key)) continue;
        standaloneClosedLoopKeys.add(key);
      }
    }

    // Compute signed area in UV space.
    // OCCT ref: IntTools_FClass2d::Init() samples along the wire PCurves
    // (SeqPnt2d), then IntTools_FClass2d::Perform() recadres classification
    // points on periodic surfaces. Use the sampled wire polygon here, but
    // normalize periodic U before the sign check so the temporary-face
    // growth/hole surrogate follows the same periodic recadrage direction.
    const analysis = analyzeTemporaryWire(wire, surface, adapter, periodic);
    loopInfos.push({ wire, analysis, loop });
  }

  if (loopInfos.length === 0) return [face];

  function loopInfoPolygon(loopInfo: LoopInfo): Pt2[] {
    return loopPolygonFromHalfEdges(loopInfo.loop);
  }

  function loopClassificationPoint(loop: HalfEdge[]): Pt2 | null {
    for (const he of loop) {
      if (he.edge.degenerate) continue;
      const uv = getEdgeUV(he.edge, surface, he.forward, he.pcurveOccurrence);
      if (!uv) continue;
      return {
        x: (uv.start.x + uv.end.x) / 2,
        y: (uv.start.y + uv.end.y) / 2,
      };
    }
    return null;
  }

  function polygonSamplePoint(polygon: Pt2[], excludedPolygons: Pt2[] = []): Pt2 | null {
    if (polygon.length < 3) return null;
    let x = 0;
    let y = 0;
    for (const pt of polygon) {
      x += pt.x;
      y += pt.y;
    }
    const centroid = { x: x / polygon.length, y: y / polygon.length };
    const isUsable = (pt: Pt2) =>
      pointInPolygonUV(pt, polygon, periodic, adapter.uPeriod) &&
      !excludedPolygons.some((excluded) => excluded.length >= 3 && pointInPolygonUV(pt, excluded, periodic, adapter.uPeriod));
    if (isUsable(centroid)) return centroid;
    for (const boundaryPt of polygon) {
      const candidate = { x: (centroid.x + boundaryPt.x) / 2, y: (centroid.y + boundaryPt.y) / 2 };
      if (isUsable(candidate)) return candidate;
    }
    return null;
  }

  // ── Classify loops as outers or holes ──
  // Following OCCT BOPAlgo_WireSplitter: use geometric containment,
  // not area sign. A loop is a hole if it's contained inside another loop
  // (odd nesting depth). This correctly handles face splitting where both
  // sub-faces are outers with potentially different windings.

  // Step 1: Initial growth-vs-hole classification.
  // OCCT ref: BOPAlgo_BuilderFace::PerformAreas + IsGrowthWire().
  // Follow the OCCT structure here:
  // 1. loops reusing known hole edges are growths
  // 2. otherwise classify the temporary single-wire face from its own sampled
  //    wire orientation on the forward face (IntTools_FClass2d::IsHole()).
  const outers: LoopInfo[] = [];
  const candidateHoles: LoopInfo[] = [];
  const holeEdgeSet = new Set<Edge>();

  function isBadTemporaryLoop(loopInfo: LoopInfo): boolean {
    // OCCT ref: IntTools_FClass2d marks wires with near-zero signed area as
    // "BadWire" and does not treat their orientation as authoritative for
    // growth/hole classification.
    const seenEdges = new Set<Edge>();
    for (const oe of loopInfo.wire.edges) {
      if (seenEdges.has(oe.edge)) {
        return true;
      }
      seenEdges.add(oe.edge);
    }
    return loopInfo.analysis.badWire;
  }

  for (const li of loopInfos) {
    if (isBadTemporaryLoop(li)) {
      continue;
    }
    const isGrowthFromHoleEdges = li.wire.edges.some((oe) =>
      holeEdgeSet.has(oe.edge));
    const isGrowthFromOrientation = !li.analysis.isHole;
    if (isGrowthFromHoleEdges || isGrowthFromOrientation) {
      outers.push(li);
    } else {
      candidateHoles.push(li);
      for (const oe of li.wire.edges) {
        holeEdgeSet.add(oe.edge);
      }
    }
  }

  // Step 2: Keep candidate holes as holes.
  // OCCT ref: BOPAlgo_BuilderFace::PerformAreas does not promote hole faces
  // back into growth faces on bounded faces. Holes are only assigned to
  // containing growth faces later.
  const holes: LoopInfo[] = [];

  function wirePolygon(wire: Wire): Pt2[] {
    const pts: Pt2[] = [];
    for (const oe of wire.edges) {
      const pc = findPCurveForUse(oe.edge, surface, oe.forward, 0);
      if (pc) {
        const c = pc.curve2d;
        const n = (c.type === 'circle' || c.type === 'arc') ? 32 : 4;
        for (let i = 0; i < n; i++) {
          const frac = i / n;
          const t = oe.forward
            ? c.startParam + frac * (c.endParam - c.startParam)
            : c.endParam - frac * (c.endParam - c.startParam);
          pts.push(evaluateCurve2D(c, t));
        }
        continue;
      }

      const curve = oe.edge.curve;
      const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
      if (isCurved) {
        const n = curve.isClosed ? 32 : 16;
        for (let i = 0; i < n; i++) {
          const frac = i / n;
          const t = oe.forward
            ? curve.startParam + frac * (curve.endParam - curve.startParam)
            : curve.endParam - frac * (curve.endParam - curve.startParam);
          const uv = adapter.projectPoint(evalCurve(curve, t));
          pts.push({ x: uv.u, y: uv.v });
        }
        continue;
      }

      const p3 = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      const uv = adapter.projectPoint(p3);
      pts.push({ x: uv.u, y: uv.v });
    }
    return pts;
  }

  function reverseWire(wire: Wire): Wire {
    const reversed: OrientedEdge[] = [];
    for (let i = wire.edges.length - 1; i >= 0; i--) {
      reversed.push(orientEdge(wire.edges[i].edge, !wire.edges[i].forward));
    }
    const result = makeWire(reversed);
    return result.success ? result.result! : wire;
  }

  // The original-domain polygon filter is reliable on non-periodic faces.
  // On periodic faces, naive UV polygons can wrap across the seam, so a
  // centroid-in-polygon test can wrongly reject valid strip faces near U=0/2pi.
  const shouldFilterToOriginalDomain = !periodic;
  const origArea = analyzeTemporaryWire(face.outerWire, surface, adapter, periodic).signedArea;
  const originalOuterPolygon = shouldFilterToOriginalDomain ? wirePolygon(face.outerWire) : [];
  const originalHolePolygons = shouldFilterToOriginalDomain ? face.innerWires.map(wirePolygon) : [];
  holes.push(...candidateHoles);

  if (outers.length === 0) return [face];

  // ── Assign holes to the innermost containing outer boundary ──
  // OCCT ref: BOPAlgo_BuilderFace::PerformAreas builds a hole->face map and
  // keeps only the most-inner containing growth face for each hole.
  const assignedHoles = new Map<LoopInfo, LoopInfo[]>();

  function loopInsideOuter(loopInfo: LoopInfo, outerInfo: LoopInfo): boolean {
    const outerEdgeSet = new Set(outerInfo.wire.edges.map((oe) => oe.edge));
    const outerPoly = loopInfoPolygon(outerInfo);
    if (outerPoly.length < 3) {
      return false;
    }

    let anyChecked = false;
    for (const he of loopInfo.loop) {
      if (he.edge.degenerate) continue;
      if (outerEdgeSet.has(he.edge)) {
        continue;
      }

      const uv = getEdgeUV(he.edge, surface, he.forward, he.pcurveOccurrence);
      if (!uv) continue;
      anyChecked = true;
      const mid = {
        x: (uv.start.x + uv.end.x) / 2,
        y: (uv.start.y + uv.end.y) / 2,
      };
      if (pointInPolygonUV(mid, outerPoly, periodic, adapter.uPeriod)) {
        return true;
      }
    }

    const loopIdx = loopInfos.indexOf(loopInfo);
    const loopPoly = loopInfoPolygon(loopInfo);
    const loopPt = (loopClassificationPoint(loopInfo.loop) ?? polygonSamplePoint(loopPoly))
      ?? vertices2D[loopInfos[loopIdx].loop[0].startVtx];
    if (!anyChecked) {
      return pointInPolygonUV(loopPt, outerPoly, periodic, adapter.uPeriod);
    }
    return pointInPolygonUV(loopPt, outerPoly, periodic, adapter.uPeriod);
  }

  for (const hole of holes) {
    let chosenOuter: LoopInfo | null = null;
    for (const outer of outers) {
      if (hole === outer) continue;
      if (!loopInsideOuter(hole, outer)) continue;

      const holeIdx = loopInfos.indexOf(hole);
      const holePoly = loopInfoPolygon(hole);
      const holePt = (loopClassificationPoint(hole.loop) ?? polygonSamplePoint(holePoly))
        ?? vertices2D[loopInfos[holeIdx].loop[0].startVtx];
      if (shouldFilterToOriginalDomain && !pointInPolygonUV(holePt, originalOuterPolygon, periodic, adapter.uPeriod)) {
        continue;
      }
      if (shouldFilterToOriginalDomain && originalHolePolygons.some((polygon) => polygon.length >= 3 && pointInPolygonUV(holePt, polygon, periodic, adapter.uPeriod))) {
        continue;
      }
      const usesOnlyOriginalOuterBoundary = hole.wire.edges.every((oe) => originalOuterEdgeSet.has(oe.edge.sourceEdge ?? oe.edge));
      if (usesOnlyOriginalOuterBoundary) {
        continue;
      }

      if (!chosenOuter || loopInsideOuter(outer, chosenOuter)) {
        chosenOuter = outer;
      }
    }
    if (chosenOuter) {
      const list = assignedHoles.get(chosenOuter) ?? [];
      list.push(hole);
      assignedHoles.set(chosenOuter, list);
    }
  }

  // A contained split loop can be both:
  // 1. its own outer face (the inner disk), and
  // 2. a hole on the containing outer face (the annulus / clipped parent).
  // Keep this compatibility behavior only on planar faces; OCCT hole-face
  // assignment itself does not promote growths into holes on periodic faces.
  const allowDualRoleContainedLoop = surface.type === 'plane' && !periodic;

  // ── Build faces from growth outers and their assigned holes ──
  const faceResults: Face[] = [];
  const originalOuterArea = shouldFilterToOriginalDomain ? polygonSignedArea(originalOuterPolygon, periodic, adapter.uPeriod) : 0;

  for (const outer of outers) {
    let myHoles: Wire[] = (assignedHoles.get(outer) ?? []).map((hole) => hole.wire);

    if (allowDualRoleContainedLoop) {
      for (const containedOuter of outers) {
        if (containedOuter === outer) continue;
        if (!loopInsideOuter(containedOuter, outer)) {
          continue;
        }

        const usesOnlyOriginalOuterBoundary = containedOuter.wire.edges.every((oe) => originalOuterEdgeSet.has(oe.edge.sourceEdge ?? oe.edge));
        if (usesOnlyOriginalOuterBoundary) {
          continue;
        }
        if (!myHoles.includes(containedOuter.wire)) {
          myHoles.push(containedOuter.wire);
        }
      }
    }

    let wire = outer.wire;
    if (shouldFilterToOriginalDomain) {
      const candidateOuterArea = polygonSignedArea(wirePolygon(wire));
      if (Math.sign(candidateOuterArea) !== 0 && Math.sign(candidateOuterArea) !== Math.sign(originalOuterArea)) {
        wire = reverseWire(wire);
      }

      const correctedOuterArea = polygonSignedArea(wirePolygon(wire));
      myHoles = myHoles.map((holeWire) => {
        const holeArea = polygonSignedArea(wirePolygon(holeWire));
        if (Math.sign(holeArea) !== 0 && Math.sign(holeArea) === Math.sign(correctedOuterArea)) {
          return reverseWire(holeWire);
        }
        return holeWire;
      });
    } else if (surface.type === 'sphere') {
      // OCCT sphere splits rely on later face-orientation alignment rather than
      // forcing periodic UV loop signs to match the parent face here. Keeping
      // the traced loop orientation preserves the shared trim-circle uses needed
      // by shell assembly.
    } else {
      const candidateOuterArea = polygonSignedArea(wirePolygon(wire));
      if ((origArea > 0 && candidateOuterArea < 0) || (origArea < 0 && candidateOuterArea > 0)) {
        wire = reverseWire(wire);
      }
      myHoles = myHoles.map((holeWire) => {
        const holeArea = polygonSignedArea(wirePolygon(holeWire));
        const outerAreaNow = polygonSignedArea(wirePolygon(wire));
        if (Math.sign(holeArea) !== 0 && Math.sign(holeArea) === Math.sign(outerAreaNow)) {
          return reverseWire(holeWire);
        }
        return holeWire;
      });
    }

    const candidatePolygon = loopInfoPolygon(outer);
    const candidateHolePolygons = holes
      .filter((hole) => hole !== outer && myHoles.includes(hole.wire))
      .map(loopInfoPolygon);
    const samplePt = polygonSamplePoint(candidatePolygon, candidateHolePolygons);
    if (shouldFilterToOriginalDomain && samplePt) {
      if (!pointInPolygonUV(samplePt, originalOuterPolygon, periodic, adapter.uPeriod)) {
        continue;
      }
      if (originalHolePolygons.some((polygon) => polygon.length >= 3 && pointInPolygonUV(samplePt, polygon, periodic, adapter.uPeriod))) {
        continue;
      }
    }

    const faceResult = makeFace(surface, wire, myHoles);
    if (faceResult.success) {
      faceResults.push(faceResult.result!);
    }
  }

  if (faceResults.length === 0) {
    return [face];
  }

  if (periodic && faceResults.length > 1) {
    const filtered = faceResults.filter((candidate) => {
      const unchangedNoHole =
        candidate.innerWires.length === 0 &&
        candidate.outerWire.edges.length === face.outerWire.edges.length;
      return !unchangedNoHole;
    });
    if (filtered.length > 0) {
      return filtered;
    }
  }

  return faceResults;
}

// ═══════════════════════════════════════════════
// 2D POINT-IN-POLYGON
// ═══════════════════════════════════════════════

function pointInPolygon2D(pt: Pt2, polygon: Pt2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if ((polygon[i].y > pt.y) !== (polygon[j].y > pt.y) &&
        pt.x < polygon[j].x + (polygon[i].x - polygon[j].x) * (pt.y - polygon[j].y) / (polygon[i].y - polygon[j].y)) {
      inside = !inside;
    }
  }
  return inside;
}

function normalizePointToPolygonPeriod(pt: Pt2, polygon: Pt2[], period: number): { point: Pt2; polygon: Pt2[] } {
  const gapEnd = periodicGapShift(polygon.map((p) => p.x), period);
  const normalizedPolygon = polygon.map((p) => {
    let u = p.x - gapEnd;
    if (u < 0) u += period;
    return { x: u, y: p.y };
  });
  let u = pt.x - gapEnd;
  if (u < 0) u += period;
  return {
    point: { x: u, y: pt.y },
    polygon: normalizedPolygon,
  };
}

function pointInPolygonUV(pt: Pt2, polygon: Pt2[], periodic: boolean, uPeriod: number): boolean {
  if (!periodic || uPeriod <= 0 || polygon.length === 0) {
    return pointInPolygon2D(pt, polygon);
  }
  const normalized = normalizePointToPolygonPeriod(pt, polygon, uPeriod);
  return pointInPolygon2D(normalized.point, normalized.polygon);
}

function canonicalizeLoopKey(loop: HalfEdge[]): string {
  const items = loop.map((he) => {
    const a = edgeStartPoint(he.edge);
    const b = edgeEndPoint(he.edge);
    const pa = `${a.x.toFixed(6)},${a.y.toFixed(6)},${a.z.toFixed(6)}`;
    const pb = `${b.x.toFixed(6)},${b.y.toFixed(6)},${b.z.toFixed(6)}`;
    return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
  }).sort();
  return items.join('::');
}

function wireVertexPoints(wire: Wire): Point3D[] {
  return wire.edges.map((oe) => oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge));
}
