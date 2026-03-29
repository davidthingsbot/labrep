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

export function tangentAngle(he: HalfEdge, atStart: boolean, surface: Surface, adapter: SurfaceAdapter, vertices2D?: Pt2[]): number {
  // OCCT reference: BOPAlgo_WireSplitter_1.cxx Angle2D()
  // Uses the edge's PCurve (2D curve on face) for tangent direction.
  // This is critical for seam edges on periodic surfaces: the PCurve gives
  // the correct UV (u=0 for forward seam, u=2π for reverse seam), while
  // surface projection always returns u=0 for both.

  // Try PCurve-based computation first (matches OCCT's Angle2D)
  const pc = findPCurve(he.edge, surface, he.pcurveOccurrence);
  if (pc) {
    const c = pc.curve2d;
    const tRange = c.endParam - c.startParam;
    const dt = Math.min(Math.abs(tRange) * 0.01, 0.01);

    let t0: number, t1: number;
    if (he.forward) {
      t0 = atStart ? c.startParam : c.endParam;
      t1 = atStart ? c.startParam + dt : c.endParam - dt;
    } else {
      t0 = atStart ? c.endParam : c.startParam;
      t1 = atStart ? c.endParam - dt : c.startParam + dt;
    }

    const uv0 = evaluateCurve2D(c, t0);
    const uv1 = evaluateCurve2D(c, t1);
    // OCCT ref: Angle2D uses bIsIN to control direction.
    // atStart=true (outgoing): vector from vertex into edge = (uv1 - uv0)
    // atStart=false (incoming): vector from interior to vertex = (uv0 - uv1)
    // This gives the direction of travel at the vertex in both cases.
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
        // For seam edges (2 PCurves at u=0 and u=2π), create both PCurves.
        // OCCT ref: split sub-edges of a seam inherit both PCurves.
        const subPC = makeLine2D({ x: sUV.x, y: sUV.y }, { x: eUV.x, y: eUV.y });
        if (subPC.result) addPCurveToEdge(subEdge, makePCurve(subPC.result, surface));

        // Check if parent edge has a second PCurve (seam edge).
        // For the first seam traversal (occurrence=0), the secondary is occurrence=1.
        // For the second seam traversal (occurrence=1), the secondary is occurrence=0.
        const secondaryOccurrence = occurrence === 0 ? 1 : 0;
        const parentPC2 = findPCurve(oe.edge, surface, secondaryOccurrence);
        if (parentPC2) {
          // Compute second PCurve UV range for this sub-segment
          const pc2uv = getEdgeUV(oe.edge, surface, oe.forward, secondaryOccurrence);
          if (pc2uv) {
            const sUV2: Pt2 = {
              x: pc2uv.start.x + segTs[i] * (pc2uv.end.x - pc2uv.start.x),
              y: pc2uv.start.y + segTs[i] * (pc2uv.end.y - pc2uv.start.y),
            };
            const eUV2: Pt2 = {
              x: pc2uv.start.x + segTs[i + 1] * (pc2uv.end.x - pc2uv.start.x),
              y: pc2uv.start.y + segTs[i + 1] * (pc2uv.end.y - pc2uv.start.y),
            };
            const subPC2 = makeLine2D({ x: sUV2.x, y: sUV2.y }, { x: eUV2.x, y: eUV2.y });
            if (subPC2.result) addPCurveToEdge(subEdge, makePCurve(subPC2.result, surface));
          }
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
  // OCCT ref: BOPAlgo_PaveFiller handles edge-on-face detection so that FFI
  // result edges that coincide with face boundary edges are not duplicated.
  // Skip if vertex pair AND curve type match. Different geometry connecting
  // OCCT ref: BOPAlgo_WireSplitter fills the SmartMap with both FORWARD and
  // REVERSED orientations of each edge. On faces with poles (degenerate edges),
  // split boundary sub-edges may need to be traversed in either direction.
  // Add reverse half-edges for ALL boundary sub-edges (not original edges).
  if (degeneratePts.length > 0) {
    const boundaryReverse: HalfEdge[] = [];
    for (const bhe of boundaryHalfEdges) {
      if (bhe.startVtx === bhe.endVtx) continue;
      // Only sub-edges (not original boundary)
      const isOriginal = faceOuterWire(face).edges.some(oe => oe.edge === bhe.edge);
      if (isOriginal) continue;
      boundaryReverse.push({
        edge: bhe.edge, forward: !bhe.forward,
        startVtx: bhe.endVtx, endVtx: bhe.startVtx,
        angleAtStart: 0, angleAtEnd: 0,
        used: false, isBoundary: true, pcurveOccurrence: bhe.pcurveOccurrence,
      });
    }
    boundaryHalfEdges.push(...boundaryReverse);
  }

  // the same vertices (e.g., line chord vs boundary arc) must be kept.
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
      const idx = findOrAddVertex(vertices, vertices2D, startPt, startUV, seamSplit, adapter.uPeriod);
      intHalfEdges.push({ edge: e, forward: true, startVtx: idx, endVtx: idx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false, pcurveOccurrence: 0 });
      intHalfEdges.push({ edge: e, forward: false, startVtx: idx, endVtx: idx, angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false, pcurveOccurrence: 0 });
    } else {
      const startIdx = findOrAddVertex(vertices, vertices2D, startPt, startUV, seamSplit, adapter.uPeriod);
      const endIdx = findOrAddVertex(vertices, vertices2D, endPt, endUV, seamSplit, adapter.uPeriod);

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

  // ── Compute tangent angles and start UVs ──
  // OCCT ref: Angle2D computes the angle. Coord2dVf provides the UV at the
  // start vertex for seam disambiguation. We store startUV from the vertex
  // pool, which encodes the correct seam side (u≈0 vs u≈2π).
  for (const he of allHalfEdges) {
    he.angleAtStart = tangentAngle(he, true, surface, adapter, vertices2D);
    he.angleAtEnd = tangentAngle(he, false, surface, adapter, vertices2D);
    he.startUV = vertices2D[he.startVtx];
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
    // OCCT ref: BOPAlgo_WireSplitter_1.cxx lines 438-446 — skip degenerate
    // edges as starting points for wire tracing. They participate as
    // intermediate edges when encountered during traversal, but never
    // initiate a new path (they'd create standalone degenerate "wires").
    if (he.edge.degenerate) continue;
    let current = he;

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
        if (periodic && endUVForClosure) {
          const uvAtK = pathUVs[k];
          if (uvAtK) {
            let du = Math.abs(uvAtK.x - endUVForClosure.x);
            if (adapter.isUPeriodic) du = du % adapter.uPeriod;
            if (du > adapter.uPeriod / 2) du = adapter.uPeriod - du;
            const dv = Math.abs(uvAtK.y - endUVForClosure.y);
            if (du > adapter.uPeriod / 4 || dv > 0.5) continue;
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
        continue;
      }

      // Find next half-edge
      const lastEdge = pathEdges[pathEdges.length - 1];
      const candidates = outgoing.get(vtx);
      if (!candidates) break;

      // OCCT ref: Path() line 418 — aPb = Coord2d(aVb, aEOuta, myFace)
      // Use the stored UV at the current path position for seam disambiguation.
      const currentUV: Pt2 | null = pathUVs[pathUVs.length - 1];

      const viable: HalfEdge[] = [];
      for (const cand of candidates) {
        if (cand.used) continue;
        // Prevent immediate U-turn on same edge
        if (cand.edge === lastEdge.edge && cand.forward !== lastEdge.forward) continue;

        // OCCT: Path() lines 572-583 — Coord2dVf(aE, myFace) gives the UV at
        // the candidate edge's forward vertex. Compare with aPb by 2D distance.
        // Use stored startUV (from vertex pool, which encodes seam side) instead
        // of recomputing from PCurve (which can give the wrong seam side for
        // reverse boundary half-edges).
        // OCCT: Path() lines 572-583 — seam disambiguation.
        // Use startUV WITHOUT modulo for reverse boundary half-edges on
        // pole-bearing faces (these can be on the wrong seam side and the
        // modulo would hide the difference). For all other edges, use the
        // standard modulo-based comparison.
        if (periodic && currentUV && cand.startVtx !== cand.endVtx) {
          let du: number, dv: number;
          // Reverse boundary half-edges are the ones we added for pole-bearing faces.
          // They have isBoundary=true and their edge is NOT in the original face wire.
          const isReverseBoundary = cand.isBoundary && degeneratePts.length > 0 &&
            !faceOuterWire(face).edges.some(oe => oe.edge === cand.edge);
          if (isReverseBoundary && cand.startUV) {
            du = Math.abs(cand.startUV.x - currentUV.x);
            dv = Math.abs(cand.startUV.y - currentUV.y);
          } else {
            const candUV = getEdgeUV(cand.edge, surface, cand.forward, cand.pcurveOccurrence);
            if (!candUV) { viable.push(cand); continue; }
            du = Math.abs(candUV.start.x - currentUV.x);
            if (adapter.isUPeriodic) du = du % adapter.uPeriod;
            if (du > adapter.uPeriod / 2) du = adapter.uPeriod - du;
            dv = Math.abs(candUV.start.y - currentUV.y);
          }
          if (du > adapter.uPeriod / 4 || dv > 0.5) continue;
        }

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
      // OCCT: store UV at the new vertex from the edge's PCurve end
      const newUV = getEdgeUV(bestHE.edge, surface, bestHE.forward, bestHE.pcurveOccurrence);
      pathUVs.push(newUV ? newUV.end : null);
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
