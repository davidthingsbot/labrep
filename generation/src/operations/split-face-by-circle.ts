import { Point3D, point3d, vec3d, Plane, plane, normalize, cross, worldToSketch, sketchToWorld, dot, distance } from '../core';
import { makeCircle3D } from '../geometry';
import { evaluateCircle3D } from '../geometry/circle3d';
import { makeArc3D, evaluateArc3D } from '../geometry/arc3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';
import { makeLine3D, evaluateLine3D } from '../geometry/line3d';
import type { PlaneCircleIntersection } from '../geometry/intersections3d';
import type { Curve3D } from '../topology/edge';
import { Face, Surface, makeFace } from '../topology/face';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { Wire, OrientedEdge, makeWire, makeWireFromEdges, orientEdge, reverseOrientedEdge, orientedEdgeStartPoint } from '../topology/wire';
import { PlaneSurface } from '../surfaces/plane-surface';

/**
 * Result of splitting a planar face by a circle intersection.
 */
export interface SplitFaceByCircleResult {
  /** The original face with a circular hole cut out */
  readonly outside: Face;
  /** A new circular disk face filling the hole */
  readonly inside: Face;
  /** The shared circle edge (used in both outside's inner wire and inside's outer wire) */
  readonly circleEdge: Edge;
}

/**
 * Split a planar face by a circle lying in the same plane.
 *
 * When the circle is fully inside the face, produces:
 * - `outside`: the original face with a circular hole (inner wire)
 * - `inside`: a new face covering the circular disk
 *
 * Returns null when:
 * - The circle is entirely outside the face
 * - The face is entirely inside the circle
 * - The circle partially crosses the face boundary (handled by C2)
 *
 * Based on OCCT BOPAlgo_BuilderFace face splitting approach, simplified
 * for the full-circle-inside-face case.
 *
 * @param face - A planar face to split
 * @param circle - A circle intersection lying in the face's plane
 * @returns Split result or null if no split is possible
 */
export function splitPlanarFaceByCircle(
  face: Face,
  circle: PlaneCircleIntersection,
): SplitFaceByCircleResult | null {
  if (face.surface.type !== 'plane') {
    return null;
  }

  const pl = face.surface.plane;

  // Check: is the circle fully inside the face?
  if (!isCircleFullyInsideFace(circle, face, pl)) {
    // Try partial circle splitting — the circle crosses face boundary edges
    return splitPlanarFaceByPartialCircle(face, circle, pl);
  }

  // Build the circle's plane for makeCircle3D
  // The circle lies in the face's plane, at the circle's center
  const circlePlane = plane(circle.center, circle.normal, pl.xAxis);

  // Create the 3D circle edge
  const circle3d = makeCircle3D(circlePlane, circle.radius);
  if (!circle3d.result) return null;

  const circleEdge = makeEdgeFromCurve(circle3d.result);
  if (!circleEdge.result) return null;

  // Build the circle wire (single closed edge)
  const circleWire = makeWire([orientEdge(circleEdge.result, true)]);
  if (!circleWire.result) return null;

  // The hole wire needs reversed orientation (CW when viewed from outside)
  const holeWire = makeWire([orientEdge(circleEdge.result, false)]);
  if (!holeWire.result) return null;

  // Outside face: original outer wire + circular hole as inner wire
  const outsideFace = makeFace(face.surface, face.outerWire, [...face.innerWires, holeWire.result]);
  if (!outsideFace.result) return null;

  // Inside face: circular disk (same surface, circle as outer wire)
  const insideFace = makeFace(face.surface, circleWire.result, []);
  if (!insideFace.result) return null;

  return {
    outside: outsideFace.result,
    inside: insideFace.result,
    circleEdge: circleEdge.result,
  };
}

/**
 * Check whether a circle is fully inside a planar face boundary.
 *
 * Tests 8 evenly-spaced points on the circle against the face's 2D polygon boundary.
 * If ALL points are inside, the circle is considered fully inside.
 * Also checks that the circle center is inside the face.
 */
function isCircleFullyInsideFace(
  circle: PlaneCircleIntersection,
  face: Face,
  facePlane: Plane,
): boolean {
  // Get the face boundary as 2D polygon
  const polygon = faceToPolygon2D(face, facePlane);
  if (polygon.length < 3) return false;

  // Check center
  const center2d = worldToSketch(facePlane, circle.center);
  if (!pointInPolygon(center2d, polygon)) return false;

  // Check 8 points on the circle
  const yAxis = normalize(cross(facePlane.normal, facePlane.xAxis));
  for (let i = 0; i < 8; i++) {
    const theta = (i / 8) * 2 * Math.PI;
    const pt3d = point3d(
      circle.center.x + circle.radius * (Math.cos(theta) * facePlane.xAxis.x + Math.sin(theta) * yAxis.x),
      circle.center.y + circle.radius * (Math.cos(theta) * facePlane.xAxis.y + Math.sin(theta) * yAxis.y),
      circle.center.z + circle.radius * (Math.cos(theta) * facePlane.xAxis.z + Math.sin(theta) * yAxis.z),
    );
    const pt2d = worldToSketch(facePlane, pt3d);
    if (!pointInPolygon(pt2d, polygon)) return false;
  }

  return true;
}

/** Evaluate a 3D curve at parameter t. */
function evaluateCurveAtLocal(curve: Curve3D, t: number): Point3D | null {
  switch (curve.type) {
    case 'line3d': return evaluateLine3D(curve, t);
    case 'circle3d': return evaluateCircle3D(curve, t);
    case 'arc3d': return evaluateArc3D(curve, t);
    case 'ellipse3d': return evaluateEllipse3D(curve, t);
  }
}

/**
 * Extract the face boundary as a 2D polygon in the face plane's parameter space.
 * For curved edges (circles, arcs), samples multiple points to capture the shape.
 */
function faceToPolygon2D(face: Face, facePlane: Plane): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';

    if (isCurved) {
      const nSamples = curve.isClosed ? 32 : 16;
      for (let i = 0; i < nSamples; i++) {
        const t = oe.forward
          ? curve.startParam + (i / nSamples) * (curve.endParam - curve.startParam)
          : curve.endParam - (i / nSamples) * (curve.endParam - curve.startParam);
        const pt3d = evaluateCurveAtLocal(curve, t);
        if (pt3d) pts.push(worldToSketch(facePlane, pt3d));
      }
    } else {
      const pt3d = orientedEdgeStartPoint(oe);
      pts.push(worldToSketch(facePlane, pt3d));
    }
  }
  return pts;
}

/**
 * 2D point-in-polygon test using ray casting.
 */
function pointInPolygon(pt: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].y, yj = polygon[j].y;
    if ((yi > pt.y) !== (yj > pt.y)) {
      const xIntersect = polygon[j].x + ((polygon[i].x - polygon[j].x) * (pt.y - yj)) / (yi - yj);
      if (pt.x < xIntersect) {
        inside = !inside;
      }
    }
  }
  return inside;
}

// ═══════════════════════════════════════════════
// PARTIAL CIRCLE SPLITTING (Phase 13 C2)
// ═══════════════════════════════════════════════

type Pt2 = { x: number; y: number };

/**
 * Find the angle on a circle (in the face plane's coordinate system) for a 2D point.
 */
function angleOnCircle2D(pt: Pt2, center: Pt2): number {
  return Math.atan2(pt.y - center.y, pt.x - center.x);
}

/**
 * Normalize an angle to [0, 2π).
 */
function normalizeAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r < 0) r += 2 * Math.PI;
  return r;
}

/**
 * Find intersections between a line segment and a circle in 2D.
 * Returns intersection points with their angle on the circle and parameter on the segment.
 */
function segmentCircleIntersections(
  segStart: Pt2, segEnd: Pt2,
  center: Pt2, radius: number,
): { pt: Pt2; angle: number; t: number }[] {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const fx = segStart.x - center.x;
  const fy = segStart.y - center.y;

  const a = dx * dx + dy * dy;
  if (a < 1e-14) return []; // Degenerate segment

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;

  if (disc < -1e-10) return [];

  const results: { pt: Pt2; angle: number; t: number }[] = [];
  const sqrtDisc = Math.sqrt(Math.max(0, disc));

  for (const sign of [-1, 1]) {
    const t = (-b + sign * sqrtDisc) / (2 * a);
    if (t < -1e-8 || t > 1 + 1e-8) continue;
    const tClamped = Math.max(0, Math.min(1, t));
    const px = segStart.x + tClamped * dx;
    const py = segStart.y + tClamped * dy;
    const angle = normalizeAngle(angleOnCircle2D({ x: px, y: py }, center));
    results.push({ pt: { x: px, y: py }, angle, t: tClamped });
  }

  // Deduplicate tangent intersections
  if (results.length === 2 && Math.abs(results[0].t - results[1].t) < 1e-8) {
    return [results[0]];
  }

  return results;
}

/**
 * Split a planar face by a circle that partially crosses the face boundary.
 *
 * Algorithm:
 * 1. Find all circle-edge intersections in 2D
 * 2. Sort by angle on circle
 * 3. Determine which arc segments are inside the face
 * 4. Build "outside" face: original boundary with arc notches
 * 5. Build "inside" face: region bounded by arcs + boundary segments
 *
 * Based on OCCT BOPAlgo_BuilderFace approach for partial intersection curves.
 */
function splitPlanarFaceByPartialCircle(
  face: Face,
  circle: PlaneCircleIntersection,
  facePlane: Plane,
): SplitFaceByCircleResult | null {
  const center2d = worldToSketch(facePlane, circle.center);
  const r = circle.radius;

  // Step 1: Get face boundary as ordered 2D vertices with edge references
  const boundaryPts: Pt2[] = [];
  const outerEdges = face.outerWire.edges;
  for (const oe of outerEdges) {
    const pt3d = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    boundaryPts.push(worldToSketch(facePlane, pt3d));
  }

  if (boundaryPts.length < 3) return null;

  // Step 2: Find all circle-boundary intersections
  interface HitInfo {
    pt2d: Pt2;
    angle: number;     // angle on circle [0, 2π)
    edgeIdx: number;    // which boundary edge
    t: number;          // parameter on that edge [0,1]
  }
  const hits: HitInfo[] = [];

  for (let i = 0; i < boundaryPts.length; i++) {
    const segStart = boundaryPts[i];
    const segEnd = boundaryPts[(i + 1) % boundaryPts.length];
    const ints = segmentCircleIntersections(segStart, segEnd, center2d, r);
    for (const int of ints) {
      // Skip intersections at segment endpoints to avoid duplicates
      if (int.t < 1e-6 || int.t > 1 - 1e-6) continue;
      hits.push({ pt2d: int.pt, angle: int.angle, edgeIdx: i, t: int.t });
    }
  }

  // Need at least 2 intersection points to form an arc inside the face
  if (hits.length < 2) return null;

  // Sort by angle on circle
  hits.sort((a, b) => a.angle - b.angle);

  // Step 3: Determine which arc segments are inside the face
  // Between consecutive hits, the arc midpoint is either inside or outside.
  // The "inside" arcs are used for splitting.
  interface ArcSegment {
    startHit: HitInfo;
    endHit: HitInfo;
    startAngle: number;
    endAngle: number;
    inside: boolean;
  }

  const arcs: ArcSegment[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h1 = hits[i];
    const h2 = hits[(i + 1) % hits.length];
    const a1 = h1.angle;
    const a2 = h2.angle;
    // Arc goes CCW from h1 to h2
    const midAngle = a1 < a2
      ? (a1 + a2) / 2
      : normalizeAngle((a1 + a2 + 2 * Math.PI) / 2);
    const midPt: Pt2 = {
      x: center2d.x + r * Math.cos(midAngle),
      y: center2d.y + r * Math.sin(midAngle),
    };
    const inside = pointInPolygon(midPt, boundaryPts);
    arcs.push({ startHit: h1, endHit: h2, startAngle: a1, endAngle: a2, inside });
  }

  const insideArcs = arcs.filter(a => a.inside);
  if (insideArcs.length === 0) return null;

  // Step 4: Build the circle plane for creating 3D arcs
  // The circle plane's xAxis determines angle=0. We need our 2D angles to
  // match the 3D arc parametrization. The face plane's xAxis and yAxis define
  // the 2D coordinate system, so angles in 2D map directly to the circle plane.
  const circlePlane = plane(circle.center, circle.normal, facePlane.xAxis);

  // Step 5: Build the "outside" face wire
  // Walk the boundary. When we reach a hit point where an inside-arc starts,
  // skip to the end of that arc (insert the OUTSIDE arc instead — which goes
  // the other way around the circle). The outside face boundary replaces
  // each inside-arc's boundary segment with the reverse arc.
  //
  // For simplicity, use the inside arc directly: the outside face gets a notch.
  // Build outside wire: boundary edges split at hit points, with arcs inserted.

  // For the first inside arc, build the outside face:
  // Walk boundary from arc.endHit → around boundary → arc.startHit, then arc (reversed)
  if (insideArcs.length !== 1) {
    // Multiple inside arcs — complex case, skip for now
    return null;
  }

  const arc = insideArcs[0];
  const arcStartAngle = arc.startAngle;
  const arcEndAngle = arc.endAngle;

  // Create the 3D arc edge for the inside arc (CCW from startAngle to endAngle)
  const arcResult = makeArc3D(circlePlane, r, arcStartAngle, arcEndAngle);
  if (!arcResult.success || !arcResult.result) return null;
  const arcEdge = makeEdgeFromCurve(arcResult.result);
  if (!arcEdge.success || !arcEdge.result) return null;

  // Build outside wire: walk boundary from arc.endHit around to arc.startHit,
  // then close with the arc (reversed — from start to end going CW = outside).
  const outsideEdges: Edge[] = [];
  const insideEdges: Edge[] = [];

  // Split boundary edges at hit points and collect segments
  const startEdgeIdx = arc.startHit.edgeIdx;
  const endEdgeIdx = arc.endHit.edgeIdx;
  const startPt3d = sketchToWorld(facePlane, arc.startHit.pt2d);
  const endPt3d = sketchToWorld(facePlane, arc.endHit.pt2d);
  const nEdges = boundaryPts.length;

  // Outside wire: from endHit → around boundary → startHit → arc(reversed)
  {
    // First partial edge: from endHit to end of its edge
    const endEdgeEnd = boundaryPts[(endEdgeIdx + 1) % nEdges];
    const endEdgeEnd3d = sketchToWorld(facePlane, endEdgeEnd);
    if (distance(endPt3d, endEdgeEnd3d) > 1e-8) {
      const lineRes = makeLine3D(endPt3d, endEdgeEnd3d);
      if (lineRes.success) {
        const e = makeEdgeFromCurve(lineRes.result!);
        if (e.success) outsideEdges.push(e.result!);
      }
    }

    // Full boundary edges between endEdgeIdx+1 and startEdgeIdx
    let idx = (endEdgeIdx + 1) % nEdges;
    while (idx !== startEdgeIdx) {
      const from = boundaryPts[idx];
      const to = boundaryPts[(idx + 1) % nEdges];
      const from3d = sketchToWorld(facePlane, from);
      const to3d = sketchToWorld(facePlane, to);
      if (distance(from3d, to3d) > 1e-8) {
        const lineRes = makeLine3D(from3d, to3d);
        if (lineRes.success) {
          const e = makeEdgeFromCurve(lineRes.result!);
          if (e.success) outsideEdges.push(e.result!);
        }
      }
      idx = (idx + 1) % nEdges;
    }

    // Last partial edge: from start of startEdge to startHit
    const startEdgeStart = boundaryPts[startEdgeIdx];
    const startEdgeStart3d = sketchToWorld(facePlane, startEdgeStart);
    if (distance(startEdgeStart3d, startPt3d) > 1e-8) {
      const lineRes = makeLine3D(startEdgeStart3d, startPt3d);
      if (lineRes.success) {
        const e = makeEdgeFromCurve(lineRes.result!);
        if (e.success) outsideEdges.push(e.result!);
      }
    }

    // Close with arc (reversed: from startHit to endHit going CW = outside the circle)
    outsideEdges.push(arcEdge.result!); // Will be oriented reversed in the wire
  }

  // Inside wire: from startHit → boundary edges → endHit → arc(forward)
  {
    // First partial edge: from startHit to end of its edge
    const startEdgeEnd = boundaryPts[(startEdgeIdx + 1) % nEdges];
    const startEdgeEnd3d = sketchToWorld(facePlane, startEdgeEnd);
    if (distance(startPt3d, startEdgeEnd3d) > 1e-8) {
      const lineRes = makeLine3D(startPt3d, startEdgeEnd3d);
      if (lineRes.success) {
        const e = makeEdgeFromCurve(lineRes.result!);
        if (e.success) insideEdges.push(e.result!);
      }
    }

    // Full boundary edges between startEdgeIdx+1 and endEdgeIdx
    let idx = (startEdgeIdx + 1) % nEdges;
    while (idx !== endEdgeIdx) {
      const from = boundaryPts[idx];
      const to = boundaryPts[(idx + 1) % nEdges];
      const from3d = sketchToWorld(facePlane, from);
      const to3d = sketchToWorld(facePlane, to);
      if (distance(from3d, to3d) > 1e-8) {
        const lineRes = makeLine3D(from3d, to3d);
        if (lineRes.success) {
          const e = makeEdgeFromCurve(lineRes.result!);
          if (e.success) insideEdges.push(e.result!);
        }
      }
      idx = (idx + 1) % nEdges;
    }

    // Last partial edge: from start of endEdge to endHit
    const endEdgeStart = boundaryPts[endEdgeIdx];
    const endEdgeStart3d = sketchToWorld(facePlane, endEdgeStart);
    if (distance(endEdgeStart3d, endPt3d) > 1e-8) {
      const lineRes = makeLine3D(endEdgeStart3d, endPt3d);
      if (lineRes.success) {
        const e = makeEdgeFromCurve(lineRes.result!);
        if (e.success) insideEdges.push(e.result!);
      }
    }

    // Close with arc (forward: from endHit to startHit = reversed arc)
    insideEdges.push(arcEdge.result!); // Will be oriented reversed in the wire
  }

  // Build outside face
  if (outsideEdges.length < 2) return null;
  // Outside wire: edges go around boundary then arc reversed (CW around circle)
  const outsideOEs: OrientedEdge[] = outsideEdges.map((e, i) =>
    i < outsideEdges.length - 1
      ? orientEdge(e, true)
      : orientEdge(e, false)  // Arc is reversed for outside face
  );
  const outsideWire = makeWire(outsideOEs);
  if (!outsideWire.success) {
    // Try with makeWireFromEdges as fallback
    const outsideWire2 = makeWireFromEdges(outsideEdges);
    if (!outsideWire2.success) return null;
    const outsideFace = makeFace(face.surface, outsideWire2.result!, [...face.innerWires]);
    if (!outsideFace.success) return null;

    // Build inside face
    if (insideEdges.length < 2) return null;
    const insideWire = makeWireFromEdges(insideEdges);
    if (!insideWire.success) return null;
    const insideFace = makeFace(face.surface, insideWire.result!, []);
    if (!insideFace.success) return null;

    return { outside: outsideFace.result!, inside: insideFace.result!, circleEdge: arcEdge.result! };
  }

  const outsideFace = makeFace(face.surface, outsideWire.result!, [...face.innerWires]);
  if (!outsideFace.success) return null;

  // Build inside face
  if (insideEdges.length < 2) return null;
  const insideOEs: OrientedEdge[] = insideEdges.map((e, i) =>
    i < insideEdges.length - 1
      ? orientEdge(e, true)
      : orientEdge(e, false)  // Arc is reversed for inside face too (closes the loop)
  );
  const insideWire = makeWire(insideOEs);
  if (!insideWire.success) {
    const insideWire2 = makeWireFromEdges(insideEdges);
    if (!insideWire2.success) return null;
    const insideFace = makeFace(face.surface, insideWire2.result!, []);
    if (!insideFace.success) return null;
    return { outside: outsideFace.result!, inside: insideFace.result!, circleEdge: arcEdge.result! };
  }

  const insideFace = makeFace(face.surface, insideWire.result!, []);
  if (!insideFace.success) return null;

  return { outside: outsideFace.result!, inside: insideFace.result!, circleEdge: arcEdge.result! };
}
