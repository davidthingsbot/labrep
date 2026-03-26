/**
 * General face splitting by intersection edges (BuilderFace).
 *
 * Given a face and a set of intersection edges lying on its surface,
 * produces sub-faces by decomposing the face boundary + intersection
 * edges into closed wire loops.
 *
 * Algorithm (based on OCCT BOPAlgo_BuilderFace + BOPAlgo_WireSplitter):
 * 1. Collect all edges: face boundary edges + intersection edges
 * 2. Split boundary edges at intersection endpoints (insert vertices)
 * 3. Build vertex→edge connectivity map in 2D (UV parameter space)
 * 4. At each vertex, compute 2D tangent angles for all connected edges
 * 5. Trace wire loops by following smallest-clockwise-angle at each vertex
 * 6. Classify loops: positive signed area = outer boundary, negative = hole
 * 7. Assign holes to their containing outer boundary
 * 8. Create sub-faces from outer boundaries + holes
 *
 * OCCT reference: BOPAlgo_BuilderFace, BOPAlgo_WireSplitter
 * See: library/opencascade/src/ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_BuilderFace.cxx
 * See: library/opencascade/src/ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_WireSplitter_1.cxx
 */
import {
  Point3D, point3d, vec3d, Plane, distance,
  worldToSketch, sketchToWorld, cross, normalize,
} from '../core';
import { makeLine3D } from '../geometry/line3d';
import { makeArc3D } from '../geometry/arc3d';
import { makeCircle3D } from '../geometry/circle3d';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire, makeWireFromEdges } from '../topology/wire';
import { Face, Surface, makeFace, makePlanarFace, faceOuterWire, faceInnerWires } from '../topology/face';
import type { Curve3D } from '../topology/edge';
import { evaluateCircle3D } from '../geometry/circle3d';
import { evaluateArc3D } from '../geometry/arc3d';
import { evaluateLine3D } from '../geometry/line3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';
import { projectToSphericalSurface } from '../surfaces/spherical-surface';
import { projectToCylindricalSurface } from '../surfaces/cylindrical-surface';
import { projectToConicalSurface } from '../surfaces/conical-surface';

const TOL = 1e-6;

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

type Pt2 = { x: number; y: number };

/** A directed half-edge in the 2D decomposition graph. */
interface HalfEdge {
  /** The 3D edge this half-edge comes from */
  edge: Edge;
  /** True if traversed in the edge's forward direction */
  forward: boolean;
  /** Start vertex index */
  startVtx: number;
  /** End vertex index */
  endVtx: number;
  /** 2D tangent angle at the start vertex (outgoing direction) */
  angleAtStart: number;
  /** 2D tangent angle at the end vertex (incoming direction, + π) */
  angleAtEnd: number;
  /** Has this half-edge been used in a loop? */
  used: boolean;
  /** True if this is a face boundary edge, false if intersection edge.
   *  OCCT ref: BOPAlgo_WireSplitter_1.cxx IsInside() flag */
  isBoundary: boolean;
}

// ═══════════════════════════════════════════════
// CURVE EVALUATION
// ═══════════════════════════════════════════════

function evaluateCurve(curve: Curve3D, t: number): Point3D {
  switch (curve.type) {
    case 'line3d': return evaluateLine3D(curve, t);
    case 'circle3d': return evaluateCircle3D(curve, t);
    case 'arc3d': return evaluateArc3D(curve, t);
    case 'ellipse3d': return evaluateEllipse3D(curve, t);
  }
}

// ═══════════════════════════════════════════════
// UV PROJECTION
// ═══════════════════════════════════════════════

/**
 * Project a 3D point to 2D in the face's parameter space.
 * For planar faces, uses worldToSketch. For curved faces, dispatches to
 * the appropriate surface projection (OCCT ProjLib_*).
 *
 * Returns Pt2 where x = u (angular for curved surfaces) and y = v.
 */
function projectToUV(surface: Surface, pt: Point3D): Pt2 {
  switch (surface.type) {
    case 'plane':
      return worldToSketch(surface.plane, pt);
    case 'sphere': {
      const { u, v } = projectToSphericalSurface(surface, pt);
      return { x: u, y: v };
    }
    case 'cylinder': {
      const { u, v } = projectToCylindricalSurface(surface, pt);
      return { x: u, y: v };
    }
    case 'cone': {
      const { u, v } = projectToConicalSurface(surface, pt);
      return { x: u, y: v };
    }
    default:
      // Fallback for unsupported surfaces (torus, revolution, extrusion)
      return worldToSketch(
        { origin: point3d(0, 0, 0), normal: vec3d(0, 0, 1), xAxis: vec3d(1, 0, 0) },
        pt,
      );
  }
}

/** Does this surface have a periodic angular U parameter (θ ∈ (-π, π])? */
function isAngularSurface(surface: Surface): boolean {
  return surface.type === 'sphere' || surface.type === 'cylinder' || surface.type === 'cone';
}

/**
 * Unwrap angular U coordinates for continuity across the ±π seam.
 *
 * On angular surfaces (sphere, cylinder, cone), the U parameter is θ from
 * atan2, giving values in (-π, π]. When consecutive UV points cross the seam
 * (e.g., +3.1 → -3.1), the polygon appears to span the full angular range.
 * This function shifts points by ±2π to maintain continuity.
 *
 * OCCT ref: ShapeAnalysis_WireOrder, BOPTools_AlgoTools2D::AdjustPCurveOnSurf
 */
function unwrapAngularCoords(pts: Pt2[]): Pt2[] {
  if (pts.length <= 1) return pts;
  const result: Pt2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let u = pts[i].x;
    const prevU = result[i - 1].x;
    // If jump > π, shift by 2π
    while (u - prevU > Math.PI) u -= 2 * Math.PI;
    while (prevU - u > Math.PI) u += 2 * Math.PI;
    result.push({ x: u, y: pts[i].y });
  }
  return result;
}

// ═══════════════════════════════════════════════
// VERTEX MERGING
// ═══════════════════════════════════════════════

/**
 * Find or create a vertex index for a 3D point.
 * Points within tolerance are merged to the same vertex.
 */
function findOrAddVertex(
  vertices: Point3D[],
  vertices2D: Pt2[],
  pt3d: Point3D,
  pt2d: Pt2,
): number {
  for (let i = 0; i < vertices.length; i++) {
    if (distance(vertices[i], pt3d) < TOL) return i;
  }
  vertices.push(pt3d);
  vertices2D.push(pt2d);
  return vertices.length - 1;
}

// ═══════════════════════════════════════════════
// EDGE SPLITTING AT INTERSECTION POINTS
// ═══════════════════════════════════════════════

/**
 * Split an edge at a set of internal points.
 * Returns the sub-edges in order from start to end.
 */
function splitEdgeAtPoints(
  edge: Edge,
  points: { pt3d: Point3D; t: number }[],
): Edge[] {
  if (points.length === 0) return [edge];

  // Sort by parameter
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const result: Edge[] = [];
  let current3d = edgeStartPoint(edge);

  for (const pt of sorted) {
    if (distance(current3d, pt.pt3d) > TOL) {
      const lineRes = makeLine3D(current3d, pt.pt3d);
      if (lineRes.success) {
        const edgeRes = makeEdgeFromCurve(lineRes.result!);
        if (edgeRes.success) result.push(edgeRes.result!);
      }
    }
    current3d = pt.pt3d;
  }

  // Last segment
  const endPt = edgeEndPoint(edge);
  if (distance(current3d, endPt) > TOL) {
    const lineRes = makeLine3D(current3d, endPt);
    if (lineRes.success) {
      const edgeRes = makeEdgeFromCurve(lineRes.result!);
      if (edgeRes.success) result.push(edgeRes.result!);
    }
  }

  return result.length > 0 ? result : [edge];
}

// ═══════════════════════════════════════════════
// EDGE CROSSING DETECTION
// ═══════════════════════════════════════════════

/**
 * Split intersection edges at their mutual crossing points.
 *
 * Based on OCCT BOPAlgo_PaveFiller: before face splitting, all pairwise
 * edge-edge intersections are computed and edges split at crossing points.
 * This ensures the edge graph has proper vertices at every crossing.
 */
function splitEdgesAtCrossings(edges: Edge[], surface: Surface): Edge[] {
  if (edges.length < 2) return edges;

  // For each edge, collect split points from crossings with other edges
  const splitPoints: Map<number, { pt3d: Point3D; t: number }[]> = new Map();
  for (let i = 0; i < edges.length; i++) {
    splitPoints.set(i, []);
  }

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      // Find crossing points between edges i and j
      const crossings = findEdgeCrossings(edges[i], edges[j], surface);
      for (const cross of crossings) {
        splitPoints.get(i)!.push({ pt3d: cross.pt3d, t: cross.t1 });
        splitPoints.get(j)!.push({ pt3d: cross.pt3d, t: cross.t2 });
      }
    }
  }

  // Split each edge at its crossing points
  const result: Edge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const pts = splitPoints.get(i)!;
    if (pts.length === 0) {
      result.push(edges[i]);
    } else {
      result.push(...splitEdgeAtPoints(edges[i], pts));
    }
  }

  return result;
}

/**
 * Find crossing points between two edges in UV parameter space.
 * Returns crossing points with parameters on both edges.
 */
function findEdgeCrossings(
  e1: Edge,
  e2: Edge,
  surface: Surface,
): { pt3d: Point3D; t1: number; t2: number }[] {
  // For line-line crossings: compute 2D line-line intersection
  if (e1.curve.type === 'line3d' && e2.curve.type === 'line3d') {
    const s1 = edgeStartPoint(e1), e1End = edgeEndPoint(e1);
    const s2 = edgeStartPoint(e2), e2End = edgeEndPoint(e2);

    // Solve parametric intersection in 3D
    // Line 1: P1 = s1 + t1 * (e1End - s1)
    // Line 2: P2 = s2 + t2 * (e2End - s2)
    const d1x = e1End.x - s1.x, d1y = e1End.y - s1.y, d1z = e1End.z - s1.z;
    const d2x = e2End.x - s2.x, d2y = e2End.y - s2.y, d2z = e2End.z - s2.z;
    const dx = s2.x - s1.x, dy = s2.y - s1.y, dz = s2.z - s1.z;

    // Use 2D projection for the solve (since edges are on the same face)
    const uv_s1 = projectToUV(surface, s1);
    const uv_e1 = projectToUV(surface, e1End);
    const uv_s2 = projectToUV(surface, s2);
    const uv_e2 = projectToUV(surface, e2End);

    const d1u = uv_e1.x - uv_s1.x, d1v = uv_e1.y - uv_s1.y;
    const d2u = uv_e2.x - uv_s2.x, d2v = uv_e2.y - uv_s2.y;
    const du = uv_s2.x - uv_s1.x, dv = uv_s2.y - uv_s1.y;

    const denom = d1u * d2v - d1v * d2u;
    if (Math.abs(denom) < 1e-12) return []; // Parallel

    const t1 = (du * d2v - dv * d2u) / denom;
    const t2 = (du * d1v - dv * d1u) / denom;

    if (t1 < TOL || t1 > 1 - TOL || t2 < TOL || t2 > 1 - TOL) return [];

    const pt3d = point3d(
      s1.x + t1 * d1x,
      s1.y + t1 * d1y,
      s1.z + t1 * d1z,
    );

    return [{ pt3d, t1, t2 }];
  }

  // TODO: handle line-arc, arc-arc crossings when needed
  return [];
}

// ═══════════════════════════════════════════════
// 2D TANGENT ANGLE COMPUTATION
// ═══════════════════════════════════════════════

/**
 * Compute the 2D tangent angle of an edge at a vertex.
 *
 * Based on OCCT BOPAlgo_WireSplitter_1.cxx Angle2D():
 * Sample a small distance along the edge from the vertex, compute the
 * 2D direction vector, return its angle in [0, 2π).
 *
 * @param outgoing - If true, compute angle leaving the vertex. If false, arriving.
 */
function tangentAngle2D(
  edge: Edge,
  forward: boolean,
  atStart: boolean,
  surface: Surface,
): number {
  const curve = edge.curve;
  const tRange = curve.endParam - curve.startParam;
  const dt = Math.min(tRange * 0.01, 0.01);

  let t0: number, t1: number;
  if (forward) {
    if (atStart) {
      // Outgoing from start in forward direction
      t0 = curve.startParam;
      t1 = curve.startParam + dt;
    } else {
      // Arriving at end in forward direction
      t0 = curve.endParam;
      t1 = curve.endParam - dt;
    }
  } else {
    if (atStart) {
      // Outgoing from end in reversed direction
      t0 = curve.endParam;
      t1 = curve.endParam - dt;
    } else {
      // Arriving at start in reversed direction
      t0 = curve.startParam;
      t1 = curve.startParam + dt;
    }
  }

  const p0 = evaluateCurve(curve, t0);
  const p1 = evaluateCurve(curve, t1);
  const uv0 = projectToUV(surface, p0);
  const uv1 = projectToUV(surface, p1);

  const dx = uv1.x - uv0.x;
  const dy = uv1.y - uv0.y;

  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += 2 * Math.PI;
  return angle;
}

// ═══════════════════════════════════════════════
// CLOCKWISE ANGLE COMPUTATION
// ═══════════════════════════════════════════════

/**
 * Compute the clockwise angle from an incoming direction to an outgoing direction.
 *
 * Based on OCCT BOPAlgo_WireSplitter_1.cxx ClockWiseAngle():
 * Measures "how far right" to turn, from 0 (straight ahead) to 2π (full circle).
 * The smallest positive angle gives the "most-right turn".
 */
function clockwiseAngle(incomingAngle: number, outgoingAngle: number): number {
  // Incoming direction reversed (we're looking backward along incoming edge)
  const reverseIn = (incomingAngle + Math.PI) % (2 * Math.PI);
  let dAngle = reverseIn - outgoingAngle;
  if (dAngle < 0) dAngle += 2 * Math.PI;
  if (dAngle < 1e-10) dAngle = 2 * Math.PI; // Same direction = full turn
  return dAngle;
}

// ═══════════════════════════════════════════════
// MAIN ALGORITHM
// ═══════════════════════════════════════════════

/**
 * Split a face by intersection edges.
 *
 * Implements the OCCT BOPAlgo_BuilderFace algorithm:
 * 1. Build a 2D edge graph from face boundary + intersection edges
 * 2. Trace closed wire loops by following smallest clockwise angle
 * 3. Classify loops as outer boundaries or holes
 * 4. Assemble faces
 *
 * @param face - The face to split
 * @param edges - Intersection edges lying on this face's surface
 * @returns Array of sub-faces (1 or more)
 */
export function builderFace(face: Face, edges: Edge[]): Face[] {
  if (edges.length === 0) return [face];

  const surface = face.surface;

  // ── Step 0: Pre-process intersection edges ──
  // Split intersection edges at their mutual crossing points.
  // Based on OCCT BOPAlgo_PaveFiller pairwise edge intersection.
  const splitEdges = splitEdgesAtCrossings(edges, surface);

  // ── Step 1: Collect all vertices and project to 2D ──

  const vertices: Point3D[] = [];
  const vertices2D: Pt2[] = [];

  // ── Step 2: Build half-edges from face boundary ──

  // Collect all intersection edge endpoints for boundary splitting
  const intEndpoints: Point3D[] = [];
  for (const e of splitEdges) {
    intEndpoints.push(edgeStartPoint(e));
    intEndpoints.push(edgeEndPoint(e));
  }

  const boundaryHalfEdges: HalfEdge[] = [];
  const outerWire = faceOuterWire(face);

  for (const oe of outerWire.edges) {
    const eStart = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const eEnd = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);

    // Find intersection endpoints that lie on this boundary edge
    const hitsOnEdge: { pt3d: Point3D; t: number }[] = [];
    if (oe.edge.curve.type === 'line3d') {
      const dx = eEnd.x - eStart.x, dy = eEnd.y - eStart.y, dz = eEnd.z - eStart.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq > TOL * TOL) {
        for (const pt of intEndpoints) {
          // Project pt onto edge line
          const vx = pt.x - eStart.x, vy = pt.y - eStart.y, vz = pt.z - eStart.z;
          const t = (vx * dx + vy * dy + vz * dz) / lenSq;
          if (t < TOL || t > 1 - TOL) continue; // At endpoints, skip
          // Check perpendicular distance
          const px = eStart.x + t * dx - pt.x;
          const py = eStart.y + t * dy - pt.y;
          const pz = eStart.z + t * dz - pt.z;
          if (Math.sqrt(px * px + py * py + pz * pz) > TOL) continue;
          hitsOnEdge.push({
            pt3d: pt,
            t: oe.forward ? t : 1 - t, // Parameter on the EDGE (not oriented edge)
          });
        }
      }
    }

    if (hitsOnEdge.length === 0) {
      // No splits — add edge in wire direction only.
      // Reverse direction is only needed for boundary sub-edges that were
      // split at intersection points (handled in the else branch below).
      const startPt = eStart;
      const endPt = eEnd;
      const startUV = projectToUV(surface, startPt);
      const endUV = projectToUV(surface, endPt);
      const startIdx = findOrAddVertex(vertices, vertices2D, startPt, startUV);
      const endIdx = findOrAddVertex(vertices, vertices2D, endPt, endUV);

      boundaryHalfEdges.push({
        edge: oe.edge,
        forward: oe.forward,
        startVtx: startIdx,
        endVtx: endIdx,
        angleAtStart: 0,
        angleAtEnd: 0,
        used: false,
        isBoundary: true,
      });
    } else {
      // Sort hits by parameter and split edge into sub-segments.
      hitsOnEdge.sort((a, b) => a.t - b.t);

      // Build sub-edges. Following OCCT BOPAlgo_Builder_2.cxx BuildSplitFaces:
      // split sub-edges that contain an intersection-edge interior vertex get
      // both forward and reverse half-edges. Others get only forward.
      const pts3d = [eStart, ...hitsOnEdge.map(h => h.pt3d), eEnd];
      for (let i = 0; i < pts3d.length - 1; i++) {
        if (distance(pts3d[i], pts3d[i + 1]) < TOL) continue;
        const lineRes = makeLine3D(pts3d[i], pts3d[i + 1]);
        if (!lineRes.success) continue;
        const edgeRes = makeEdgeFromCurve(lineRes.result!);
        if (!edgeRes.success) continue;

        const startUV = projectToUV(surface, pts3d[i]);
        const endUV = projectToUV(surface, pts3d[i + 1]);
        const startIdx = findOrAddVertex(vertices, vertices2D, pts3d[i], startUV);
        const endIdx = findOrAddVertex(vertices, vertices2D, pts3d[i + 1], endUV);

        boundaryHalfEdges.push({
          edge: edgeRes.result!, forward: true, startVtx: startIdx, endVtx: endIdx,
          angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: true,
        });
      }
    }
  }

  // ── Step 3: Add intersection edges as half-edges ──

  const intHalfEdges: HalfEdge[] = [];
  for (const e of splitEdges) {
    const startPt = edgeStartPoint(e);
    const endPt = edgeEndPoint(e);
    const startUV = projectToUV(surface, startPt);
    const endUV = projectToUV(surface, endPt);
    const startIdx = findOrAddVertex(vertices, vertices2D, startPt, startUV);
    const endIdx = findOrAddVertex(vertices, vertices2D, endPt, endUV);

    if (e.curve.isClosed) {
      // Closed curve (full circle) — handle as hole-maker
      // Add both forward and reverse half-edges with same start/end vertex
      intHalfEdges.push({
        edge: e, forward: true, startVtx: startIdx, endVtx: startIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false,
      });
      intHalfEdges.push({
        edge: e, forward: false, startVtx: startIdx, endVtx: startIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false,
      });
    } else {
      // Open curve — add both forward and reverse half-edges
      intHalfEdges.push({
        edge: e, forward: true, startVtx: startIdx, endVtx: endIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false,
      });
      intHalfEdges.push({
        edge: e, forward: false, startVtx: endIdx, endVtx: startIdx,
        angleAtStart: 0, angleAtEnd: 0, used: false, isBoundary: false,
      });
    }
  }

  // All half-edges
  const allHalfEdges = [...boundaryHalfEdges, ...intHalfEdges];

  // ── Step 4: Compute tangent angles ──

  for (const he of allHalfEdges) {
    he.angleAtStart = tangentAngle2D(he.edge, he.forward, true, surface);
    he.angleAtEnd = tangentAngle2D(he.edge, he.forward, false, surface);
  }

  // ── Step 5: Build vertex → outgoing half-edge map ──

  const outgoing: Map<number, HalfEdge[]> = new Map();
  for (const he of allHalfEdges) {
    const list = outgoing.get(he.startVtx) || [];
    list.push(he);
    outgoing.set(he.startVtx, list);
  }

  // ── Step 6: Trace wire loops ──

  const loops: HalfEdge[][] = [];

  for (const he of allHalfEdges) {
    if (he.used) continue;

    // Start a new loop from this half-edge
    const loop: HalfEdge[] = [];
    let current = he;

    // Special case: closed curve (full circle) — forms a single-edge loop
    if (current.startVtx === current.endVtx) {
      current.used = true;
      loop.push(current);
      loops.push(loop);
      continue;
    }

    // Based on OCCT BOPAlgo_WireSplitter_1.cxx Path():
    // Trace a path, extracting sub-loops when revisiting vertices.
    const pathEdges: HalfEdge[] = [];
    const pathVertices: number[] = [he.startVtx];

    current.used = true;
    pathEdges.push(current);
    pathVertices.push(current.endVtx);

    for (let safety = 0; safety < 10000; safety++) {
      const vtx = pathVertices[pathVertices.length - 1];

      // Check if we've revisited a vertex in the current path
      let loopStartIdx = -1;
      for (let k = 0; k < pathVertices.length - 1; k++) {
        if (pathVertices[k] === vtx) {
          loopStartIdx = k;
          break;
        }
      }

      if (loopStartIdx >= 0) {
        // Extract sub-loop: edges from loopStartIdx onward
        const subLoop = pathEdges.splice(loopStartIdx);
        pathVertices.splice(loopStartIdx + 1);
        if (subLoop.length >= 1) {
          loops.push(subLoop);
        }
        if (pathEdges.length === 0) break;
        // Don't find next edge — check for more sub-loops at this vertex
        continue;
      }

      // Find the next half-edge: smallest clockwise angle
      const lastEdge = pathEdges[pathEdges.length - 1];
      const candidates = outgoing.get(vtx);
      if (!candidates) break;

      const incomingAngle = lastEdge.angleAtEnd;
      let bestAngle = Infinity;
      let bestHE: HalfEdge | null = null;

      for (const cand of candidates) {
        if (cand.used) continue;
        if (cand.edge === lastEdge.edge && cand.forward !== lastEdge.forward) continue;

        const cwAngle = clockwiseAngle(incomingAngle, cand.angleAtStart);
        if (cwAngle < bestAngle) {
          bestAngle = cwAngle;
          bestHE = cand;
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

  // No loops found — return original face


  if (loops.length === 0) return [face];

  // ── Step 7: Build wires from loops and classify ──

  interface LoopInfo {
    wire: Wire;
    area: number; // Signed area in UV space
    outerEdges: OrientedEdge[]; // For face construction
  }

  const loopInfos: LoopInfo[] = [];

  for (const loop of loops) {
    const orientedEdges: OrientedEdge[] = loop.map(he => orientEdge(he.edge, he.forward));
    const wireResult = makeWire(orientedEdges);
    if (!wireResult.success) continue;
    if (!wireResult.result!.isClosed) continue;

    // Compute signed area in 2D for classification.
    // For closed curves (single-edge loops), sample the curve to get a polygon.
    const pts2D: Pt2[] = [];
    if (loop.length === 1 && loop[0].edge.curve.isClosed) {
      const he = loop[0];
      const nSamples = 64;
      for (let i = 0; i < nSamples; i++) {
        const t = he.forward
          ? he.edge.curve.startParam + (i / nSamples) * (he.edge.curve.endParam - he.edge.curve.startParam)
          : he.edge.curve.endParam - (i / nSamples) * (he.edge.curve.endParam - he.edge.curve.startParam);
        const pt3d = evaluateCurve(he.edge.curve, t);
        pts2D.push(projectToUV(surface, pt3d));
      }
    } else {
      for (const he of loop) {
        // Sample curved edges for better area approximation
        const curve = he.edge.curve;
        if (curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d') {
          const n = 16;
          for (let i = 0; i < n; i++) {
            const t = he.forward
              ? curve.startParam + (i / n) * (curve.endParam - curve.startParam)
              : curve.endParam - (i / n) * (curve.endParam - curve.startParam);
            pts2D.push(projectToUV(surface, evaluateCurve(curve, t)));
          }
        } else {
          pts2D.push(vertices2D[he.startVtx]);
        }
      }
    }
    // Unwrap angular coords for surfaces with periodic U parameter (θ ∈ (-π,π])
    const areaPts = isAngularSurface(surface) ? unwrapAngularCoords(pts2D) : pts2D;
    let area = 0;
    for (let i = 0; i < areaPts.length; i++) {
      const j = (i + 1) % areaPts.length;
      area += areaPts[i].x * areaPts[j].y - areaPts[j].x * areaPts[i].y;
    }
    area /= 2;

    loopInfos.push({ wire: wireResult.result!, area, outerEdges: orientedEdges });
  }

  if (loopInfos.length === 0) return [face];

  // ── Step 8: Classify loops as outer boundaries or holes ──
  // Positive signed area = CCW = outer boundary
  // Negative signed area = CW = hole

  const outers: LoopInfo[] = [];
  const holes: LoopInfo[] = [];

  for (const li of loopInfos) {
    if (li.area > 0) {
      outers.push(li);
    } else {
      holes.push(li);
    }
  }

  // If no outer boundaries found, something went wrong
  if (outers.length === 0) return [face];

  // ── Step 9: Assign holes to their containing outer boundary ──
  // Use point-in-polygon test: hole's first vertex inside which outer?

  const faceResults: Face[] = [];

  for (const outer of outers) {
    const myHoles: Wire[] = [];

    // For each hole, check if its first vertex is inside this outer boundary
    for (const hole of holes) {
      let holePt = vertices2D[loops[loopInfos.indexOf(hole)][0].startVtx];
      let outerPts = loops[loopInfos.indexOf(outer)].map(he => vertices2D[he.startVtx]);
      // Unwrap angular coords for seam handling
      if (isAngularSurface(surface)) {
        outerPts = unwrapAngularCoords(outerPts);
        // Adjust hole point to be in the same angular range as the outer polygon
        if (outerPts.length > 0) {
          let u = holePt.x;
          const refU = outerPts[0].x;
          while (u - refU > Math.PI) u -= 2 * Math.PI;
          while (refU - u > Math.PI) u += 2 * Math.PI;
          holePt = { x: u, y: holePt.y };
        }
      }
      if (pointInPolygon2D(holePt, outerPts)) {
        myHoles.push(hole.wire);
      }
    }

    const faceResult = makeFace(surface, outer.wire, myHoles);
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
