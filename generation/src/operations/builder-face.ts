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

interface HalfEdge {
  edge: Edge;
  forward: boolean;
  startVtx: number;
  endVtx: number;
  angleAtStart: number;
  angleAtEnd: number;
  used: boolean;
  isBoundary: boolean;
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

/** Get UV start/end from PCurve, respecting wire direction. */
function getEdgeUV(edge: Edge, surface: Surface, forward: boolean, occurrence: number = 0): { start: Pt2; end: Pt2 } | null {
  const pc = findPCurve(edge, surface, occurrence);
  if (!pc) return null;
  const c = pc.curve2d;
  const s = evaluateCurve2D(c, c.startParam);
  const e = evaluateCurve2D(c, c.endParam);
  return forward ? { start: s, end: e } : { start: e, end: s };
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

function tangentAngle(he: HalfEdge, atStart: boolean, surface: Surface, adapter: SurfaceAdapter): number {
  // OCCT reference: BOPAlgo_WireSplitter_1.cxx Angle2D()
  // Degenerate edges: compute direction from PCurve (3D curve has zero length).
  if (he.edge.degenerate) {
    const pc = findPCurve(he.edge, surface, 0);
    if (pc) {
      const c = pc.curve2d;
      const s = evaluateCurve2D(c, c.startParam);
      const e = evaluateCurve2D(c, c.endParam);
      const dx = he.forward ? e.x - s.x : s.x - e.x;
      const dy = he.forward ? e.y - s.y : s.y - e.y;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += 2 * Math.PI;
      return angle;
    }
  }

  // Project 3D curve samples to UV for tangent direction.
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
  let angle = Math.atan2(uv1.y - uv0.y, uv1.x - uv0.x);
  if (angle < 0) angle += 2 * Math.PI;
  return angle;
}

// ═══════════════════════════════════════════════
// VERTEX MERGING
// ═══════════════════════════════════════════════

/**
 * Find or create a vertex index.
 * Non-periodic surfaces: merge by 3D distance (same as OCCT for non-seam vertices).
 * Periodic surfaces: merge by UV distance (seam vertices at same 3D point
 * but different UV must stay distinct).
 */
function findOrAddVertex(
  vertices: Point3D[], vertices2D: Pt2[],
  pt3d: Point3D, pt2d: Pt2,
  useUV: boolean,
): number {
  if (useUV) {
    for (let i = 0; i < vertices2D.length; i++) {
      const dx = vertices2D[i].x - pt2d.x;
      const dy = vertices2D[i].y - pt2d.y;
      if (Math.sqrt(dx * dx + dy * dy) < TOL * 10) return i;
    }
  } else {
    for (let i = 0; i < vertices.length; i++) {
      if (distance(vertices[i], pt3d) < TOL) return i;
    }
  }
  vertices.push(pt3d);
  vertices2D.push(pt2d);
  return vertices.length - 1;
}

// ═══════════════════════════════════════════════
// EDGE SPLITTING AT CROSSINGS
// ═══════════════════════════════════════════════

function splitEdgesAtCrossings(edges: Edge[], adapter: SurfaceAdapter): Edge[] {
  if (edges.length < 2) return edges;
  const splitPoints: Map<number, { pt3d: Point3D; t: number }[]> = new Map();
  for (let i = 0; i < edges.length; i++) splitPoints.set(i, []);

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].curve.type !== 'line3d' || edges[j].curve.type !== 'line3d') continue;
      const s1 = edgeStartPoint(edges[i]), e1 = edgeEndPoint(edges[i]);
      const s2 = edgeStartPoint(edges[j]), e2 = edgeEndPoint(edges[j]);
      const uv_s1 = adapter.projectPoint(s1), uv_e1 = adapter.projectPoint(e1);
      const uv_s2 = adapter.projectPoint(s2), uv_e2 = adapter.projectPoint(e2);
      const d1u = uv_e1.u - uv_s1.u, d1v = uv_e1.v - uv_s1.v;
      const d2u = uv_e2.u - uv_s2.u, d2v = uv_e2.v - uv_s2.v;
      const du = uv_s2.u - uv_s1.u, dv = uv_s2.v - uv_s1.v;
      const denom = d1u * d2v - d1v * d2u;
      if (Math.abs(denom) < 1e-12) continue;
      const t1 = (du * d2v - dv * d2u) / denom;
      const t2 = (du * d1v - dv * d1u) / denom;
      if (t1 < TOL || t1 > 1 - TOL || t2 < TOL || t2 > 1 - TOL) continue;
      const d1x = e1.x - s1.x, d1y = e1.y - s1.y, d1z = e1.z - s1.z;
      const pt = point3d(s1.x + t1 * d1x, s1.y + t1 * d1y, s1.z + t1 * d1z);
      splitPoints.get(i)!.push({ pt3d: pt, t: t1 });
      splitPoints.get(j)!.push({ pt3d: pt, t: t2 });
    }
  }

  const result: Edge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const pts = splitPoints.get(i)!;
    if (pts.length === 0) { result.push(edges[i]); continue; }
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    let cur = edgeStartPoint(edges[i]);
    for (const pt of sorted) {
      if (distance(cur, pt.pt3d) > TOL) {
        const lr = makeLine3D(cur, pt.pt3d);
        if (lr.success) { const er = makeEdgeFromCurve(lr.result!); if (er.success) result.push(er.result!); }
      }
      cur = pt.pt3d;
    }
    const end = edgeEndPoint(edges[i]);
    if (distance(cur, end) > TOL) {
      const lr = makeLine3D(cur, end);
      if (lr.success) { const er = makeEdgeFromCurve(lr.result!); if (er.success) result.push(er.result!); }
    }
  }
  return result;
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

// ═══════════════════════════════════════════════
// MAIN ALGORITHM
// ═══════════════════════════════════════════════

export function builderFace(face: Face, edges: Edge[]): Face[] {
  if (edges.length === 0) return [face];

  const surface = face.surface;
  const adapter = toAdapter(surface);
  const periodic = adapter.isUPeriodic;

  // Step 0: split intersection edges at mutual crossings
  const splitEdges = splitEdgesAtCrossings(edges, adapter);

  const vertices: Point3D[] = [];
  const vertices2D: Pt2[] = [];

  // Collect intersection endpoints for boundary splitting
  const intEndpoints: Point3D[] = [];
  for (const e of splitEdges) {
    intEndpoints.push(edgeStartPoint(e));
    intEndpoints.push(edgeEndPoint(e));
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

    // On periodic surfaces, ensure UV continuity with the previous edge.
    // The seam creates a UV discontinuity: one edge ends at u≈2π, the next
    // starts at u≈0. Shift the current edge's UV to match the previous end.
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

    // Degenerate edges (pole connectors): no intersection endpoints can lie on them.
    // Just add as a boundary half-edge and continue.
    if (oe.edge.degenerate) {
      const startIdx = findOrAddVertex(vertices, vertices2D, eStart, edgeStartUV, periodic);
      const endIdx = findOrAddVertex(vertices, vertices2D, eEnd, edgeEndUV, periodic);
      boundaryHalfEdges.push({
        edge: oe.edge, forward: oe.forward,
        startVtx: startIdx, endVtx: endIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true,
      });
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
        const angle = Math.atan2(yComp, xComp);
        if (angle < curve.startParam - 0.01 || angle > curve.endParam + 0.01) continue;
        const wireT = oe.forward
          ? (angle - curve.startParam) / tRange
          : 1 - (angle - curve.startParam) / tRange;
        if (wireT < TOL || wireT > 1 - TOL) continue;
        hitsOnEdge.push({ pt3d: pt, t: wireT });
      }
    }

    if (hitsOnEdge.length === 0) {
      const startIdx = findOrAddVertex(vertices, vertices2D, eStart, edgeStartUV, periodic);
      const endIdx = findOrAddVertex(vertices, vertices2D, eEnd, edgeEndUV, periodic);
      boundaryHalfEdges.push({
        edge: oe.edge, forward: oe.forward,
        startVtx: startIdx, endVtx: endIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true,
      });
    } else {
      hitsOnEdge.sort((a, b) => a.t - b.t);
      const segTs = [0, ...hitsOnEdge.map(h => h.t), 1];
      const pts3d = [eStart, ...hitsOnEdge.map(h => h.pt3d), eEnd];

      for (let i = 0; i < pts3d.length - 1; i++) {
        if (distance(pts3d[i], pts3d[i + 1]) < TOL) continue;

        let subEdge: Edge | null = null;
        if (curve.type === 'arc3d' && 'plane' in curve) {
          const tRange = curve.endParam - curve.startParam;
          const subT0 = oe.forward ? curve.startParam + segTs[i] * tRange : curve.endParam - segTs[i] * tRange;
          const subT1 = oe.forward ? curve.startParam + segTs[i + 1] * tRange : curve.endParam - segTs[i + 1] * tRange;
          const arcRes = makeArc3D((curve as any).plane, (curve as any).radius, Math.min(subT0, subT1), Math.max(subT0, subT1));
          if (arcRes.success && arcRes.result) {
            const er = makeEdgeFromCurve(arcRes.result);
            if (er.success) subEdge = er.result!;
          }
        }
        if (!subEdge) {
          const lr = makeLine3D(pts3d[i], pts3d[i + 1]);
          if (!lr.success) continue;
          const er = makeEdgeFromCurve(lr.result!);
          if (!er.success) continue;
          subEdge = er.result!;
        }

        // Interpolate UV from boundary edge PCurve endpoints
        const sUV: Pt2 = {
          x: edgeStartUV.x + segTs[i] * (edgeEndUV.x - edgeStartUV.x),
          y: edgeStartUV.y + segTs[i] * (edgeEndUV.y - edgeStartUV.y),
        };
        const eUV: Pt2 = {
          x: edgeStartUV.x + segTs[i + 1] * (edgeEndUV.x - edgeStartUV.x),
          y: edgeStartUV.y + segTs[i + 1] * (edgeEndUV.y - edgeStartUV.y),
        };

        // Attach PCurve to sub-edge (mutates in place)
        const subPC = makeLine2D({ x: sUV.x, y: sUV.y }, { x: eUV.x, y: eUV.y });
        if (subPC.result) addPCurveToEdge(subEdge, makePCurve(subPC.result, surface));

        // Determine correct forward flag: sub-edges from makeArc3D always have
        // geometric direction from lower to higher angle. When the original wire
        // traversal was reversed, the sub-edge's geometric direction may be opposite
        // to the wire direction. Check by comparing the edge's start point to pts3d[i].
        const subFwd = distance(edgeStartPoint(subEdge), pts3d[i]) < TOL * 100;
        const startIdx = findOrAddVertex(vertices, vertices2D, pts3d[i], sUV, periodic);
        const endIdx = findOrAddVertex(vertices, vertices2D, pts3d[i + 1], eUV, periodic);

        // PCurve must be in edge geometric direction. If subFwd=false, the PCurve
        // we just attached goes in wire direction (sUV→eUV) but the edge goes
        // in the opposite geometric direction. Re-create the PCurve reversed.
        if (!subFwd && subEdge.pcurves.length > 0) {
          subEdge.pcurves.length = 0;
          const revPC = makeLine2D({ x: eUV.x, y: eUV.y }, { x: sUV.x, y: sUV.y });
          if (revPC.result) addPCurveToEdge(subEdge, makePCurve(revPC.result, surface));
        }

        boundaryHalfEdges.push({
          edge: subEdge, forward: subFwd, startVtx: startIdx, endVtx: endIdx,
          angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true,
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
      const startIdx = findOrAddVertex(vertices, vertices2D, eStart, edgeStartUV, periodic);
      const endIdx = findOrAddVertex(vertices, vertices2D, eEnd, edgeEndUV, periodic);
      boundaryHalfEdges.push({
        edge: oe.edge, forward: oe.forward,
        startVtx: startIdx, endVtx: endIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true,
      });
    }
  }

  // ── Intersection half-edges ──
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

    if (isSelfLoop) {
      const idx = findOrAddVertex(vertices, vertices2D, startPt, startUV, periodic);
      intHalfEdges.push({ edge: e, forward: true, startVtx: idx, endVtx: idx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false });
      intHalfEdges.push({ edge: e, forward: false, startVtx: idx, endVtx: idx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false });
    } else {
      const startIdx = findOrAddVertex(vertices, vertices2D, startPt, startUV, periodic);
      const endIdx = findOrAddVertex(vertices, vertices2D, endPt, endUV, periodic);
      intHalfEdges.push({ edge: e, forward: true, startVtx: startIdx, endVtx: endIdx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false });
      intHalfEdges.push({ edge: e, forward: false, startVtx: endIdx, endVtx: startIdx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false });
    }
  }

  const allHalfEdges = [...boundaryHalfEdges, ...intHalfEdges];

  // ── Compute tangent angles ──
  for (const he of allHalfEdges) {
    he.angleAtStart = tangentAngle(he, true, surface, adapter);
    he.angleAtEnd = tangentAngle(he, false, surface, adapter);
  }

  // ── Build vertex → outgoing map ──
  const outgoing: Map<number, HalfEdge[]> = new Map();
  for (const he of allHalfEdges) {
    const list = outgoing.get(he.startVtx) || [];
    list.push(he);
    outgoing.set(he.startVtx, list);
  }

  // ── Trace wire loops ──
  const loops: HalfEdge[][] = [];
  for (const he of allHalfEdges) {
    if (he.used) continue;
    let current = he;

    // Self-loop (closed curve, startVtx === endVtx)
    if (current.startVtx === current.endVtx) {
      current.used = true;
      loops.push([current]);
      continue;
    }

    // Path tracing (OCCT BOPAlgo_WireSplitter_1.cxx Path())
    const pathEdges: HalfEdge[] = [];
    const pathVertices: number[] = [he.startVtx];
    current.used = true;
    pathEdges.push(current);
    pathVertices.push(current.endVtx);

    for (let safety = 0; safety < 10000; safety++) {
      const vtx = pathVertices[pathVertices.length - 1];

      // Check for sub-loop (revisited vertex)
      let loopStartIdx = -1;
      for (let k = 0; k < pathVertices.length - 1; k++) {
        if (pathVertices[k] === vtx) { loopStartIdx = k; break; }
      }

      if (loopStartIdx >= 0) {
        const subLoop = pathEdges.splice(loopStartIdx);
        pathVertices.splice(loopStartIdx + 1);
        const isDegenerate = subLoop.length === 2 && subLoop[0].edge === subLoop[1].edge;
        if (subLoop.length >= 1 && !isDegenerate) {
          loops.push(subLoop);
        } else {
          for (const h of subLoop) h.used = false;
        }
        if (pathEdges.length === 0) break;
        continue;
      }

      // Find next half-edge
      const lastEdge = pathEdges[pathEdges.length - 1];
      const candidates = outgoing.get(vtx);
      if (!candidates) break;

      const viable: HalfEdge[] = [];
      for (const cand of candidates) {
        if (cand.used) continue;
        // Prevent immediate U-turn on same edge
        if (cand.edge === lastEdge.edge && cand.forward !== lastEdge.forward) continue;
        viable.push(cand);
      }

      let bestHE: HalfEdge | null = null;
      if (viable.length === 1) {
        bestHE = viable[0];
      } else if (viable.length > 1) {
        // OCCT priority: if incoming was boundary and exactly 1 interior edge, take it
        const interiorViable = viable.filter(h => !h.isBoundary);
        if (interiorViable.length === 1 && lastEdge.isBoundary) {
          bestHE = interiorViable[0];
        } else {
          let bestAngle = Infinity;
          for (const cand of viable) {
            const cw = clockwiseAngle(lastEdge.angleAtEnd, cand.angleAtStart);
            if (cw < bestAngle) { bestAngle = cw; bestHE = cand; }
          }
        }
      }

      if (!bestHE) break;
      bestHE.used = true;
      pathEdges.push(bestHE);
      pathVertices.push(bestHE.endVtx);
    }

    if (pathEdges.length >= 1) {
      loops.push(pathEdges);
    }
  }

  if (loops.length === 0) return [face];

  // ── Build wires from loops and classify ──

  interface LoopInfo {
    wire: Wire;
    area: number;
  }

  const loopInfos: LoopInfo[] = [];

  for (const loop of loops) {
    const orientedEdges: OrientedEdge[] = loop.map(he => orientEdge(he.edge, he.forward));
    const wireResult = makeWire(orientedEdges);
    if (!wireResult.success) continue;
    if (!wireResult.result!.isClosed) continue;

    // Compute signed area in UV space
    const pts2D: Pt2[] = [];
    for (const he of loop) {
      const pc = findPCurve(he.edge, surface, 0);
      if (pc) {
        const c = pc.curve2d;
        const n = (c.type === 'circle' || c.type === 'arc') ? 16 : 2;
        for (let i = 0; i < n; i++) {
          const frac = i / n;
          const t = he.forward
            ? c.startParam + frac * (c.endParam - c.startParam)
            : c.endParam - frac * (c.endParam - c.startParam);
          pts2D.push(evaluateCurve2D(c, t));
        }
      } else {
        // Fallback: sample 3D curve and project
        const curve = he.edge.curve;
        const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
        if (isCurved) {
          const n = curve.isClosed ? 64 : 16;
          for (let i = 0; i < n; i++) {
            const frac = i / n;
            const t = he.forward
              ? curve.startParam + frac * (curve.endParam - curve.startParam)
              : curve.endParam - frac * (curve.endParam - curve.startParam);
            const uv = adapter.projectPoint(evalCurve(curve, t));
            pts2D.push({ x: uv.u, y: uv.v });
          }
        } else {
          pts2D.push(vertices2D[he.startVtx]);
        }
      }
    }

    let area = 0;
    for (let i = 0; i < pts2D.length; i++) {
      const j = (i + 1) % pts2D.length;
      area += pts2D[i].x * pts2D[j].y - pts2D[j].x * pts2D[i].y;
    }
    area /= 2;

    loopInfos.push({ wire: wireResult.result!, area });
  }

  if (loopInfos.length === 0) return [face];

  // ── Classify loops as outers or holes ──
  // Following OCCT BOPAlgo_WireSplitter: use geometric containment,
  // not area sign. A loop is a hole if it's contained inside another loop
  // (odd nesting depth). This correctly handles face splitting where both
  // sub-faces are outers with potentially different windings.

  // Determine original face area sign for winding correction
  // Compute original face area in UV from boundary half-edges
  const origPts: Pt2[] = boundaryHalfEdges
    .filter(he => he.isBoundary)
    .map(he => vertices2D[he.startVtx]);
  let origArea = 0;
  for (let i = 0; i < origPts.length; i++) {
    const j = (i + 1) % origPts.length;
    origArea += origPts[i].x * origPts[j].y - origPts[j].x * origPts[i].y;
  }
  origArea /= 2;
  const outerIsPositive = origArea > 0;

  // Step 1: Initial classification by area sign (OCCT convention)
  const outers: LoopInfo[] = [];
  const candidateHoles: LoopInfo[] = [];

  for (const li of loopInfos) {
    const isOuter = outerIsPositive ? li.area > 0 : li.area < 0;
    if (isOuter) {
      outers.push(li);
    } else {
      candidateHoles.push(li);
    }
  }

  // Step 2: Reclassify "holes" that aren't geometrically contained in any outer.
  // OCCT ref: BOPAlgo_BuilderFace::PerformAreas uses IntTools_FClass2d.
  // For self-loop circles (1 vertex only), sample the curve to build a polygon.
  const holes: LoopInfo[] = [];

  function loopPolygon(loopIdx: number): Pt2[] {
    const loop = loops[loopIdx];
    if (loop.length === 1 && loop[0].startVtx === loop[0].endVtx) {
      // Self-loop: sample the curve in UV for proper containment test
      const he = loop[0];
      const pts: Pt2[] = [];
      const curve = he.edge.curve;
      const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
      if (isCurved) {
        const n = curve.isClosed ? 32 : 16;
        for (let i = 0; i < n; i++) {
          const frac = i / n;
          const t = he.forward
            ? curve.startParam + frac * (curve.endParam - curve.startParam)
            : curve.endParam - frac * (curve.endParam - curve.startParam);
          const uv = adapter.projectPoint(evalCurve(curve, t));
          pts.push({ x: uv.u, y: uv.v });
        }
      }
      return pts.length >= 3 ? pts : [vertices2D[loop[0].startVtx]];
    }
    return loop.map(he => vertices2D[he.startVtx]);
  }

  for (const ch of candidateHoles) {
    const chIdx = loopInfos.indexOf(ch);
    const chPoly = loopPolygon(chIdx);
    // Use a point from the candidate hole's polygon for containment check
    const chPt = chPoly.length >= 3
      ? chPoly[0]  // Use first sampled point for circle self-loops
      : vertices2D[loops[chIdx][0].startVtx];
    let isContained = false;
    for (const outer of outers) {
      const outerIdx = loopInfos.indexOf(outer);
      const outerPoly = loopPolygon(outerIdx);
      if (outerPoly.length >= 3 && pointInPolygon2D(chPt, outerPoly)) {
        isContained = true;
        break;
      }
    }
    if (isContained) {
      holes.push(ch);
    } else {
      outers.push(ch); // reclassify: split face, not hole
    }
  }

  if (outers.length === 0) return [face];

  // ── Assign holes to their containing outer boundary ──
  const faceResults: Face[] = [];

  for (const outer of outers) {
    const myHoles: Wire[] = [];

    for (const hole of holes) {
      const holeIdx = loopInfos.indexOf(hole);
      const holePoly = loopPolygon(holeIdx);
      const holePt = holePoly.length >= 3 ? holePoly[0] : vertices2D[loops[holeIdx][0].startVtx];
      const outerIdx = loopInfos.indexOf(outer);
      const outerPoly = loopPolygon(outerIdx);
      if (outerPoly.length >= 3 && pointInPolygon2D(holePt, outerPoly)) {
        myHoles.push(hole.wire);
      }
    }

    // Correct winding for outers whose area sign differs from original
    let wire = outer.wire;
    if ((outerIsPositive && outer.area < 0) || (!outerIsPositive && outer.area > 0)) {
      const reversed: OrientedEdge[] = [];
      for (let i = wire.edges.length - 1; i >= 0; i--) {
        reversed.push(orientEdge(wire.edges[i].edge, !wire.edges[i].forward));
      }
      const rw = makeWire(reversed);
      if (rw.success) wire = rw.result!;
    }

    const faceResult = makeFace(surface, wire, myHoles);
    if (faceResult.success) {
      faceResults.push(faceResult.result!);
    }
  }

  return faceResults.length > 0 ? faceResults : [face];
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
