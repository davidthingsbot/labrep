/**
 * Face-Face Intersection (FFI).
 *
 * Computes intersection curves between two faces by:
 * 1. Calling intersectSurfaces (SSI marching) to get raw intersection polylines
 * 2. Deriving UV bounds for each face from its wire boundary
 * 3. Clipping SSI curves to both face boundaries in UV parameter space
 * 4. Building Edge objects from the surviving curve segments
 *
 * Each result edge has UV coordinates (PCurves) on both faces.
 *
 * OCCT reference: IntTools_FaceFace
 * See: library/opencascade/src/ModelingAlgorithms/TKBO/IntTools/IntTools_FaceFace.hxx
 */
import { Point3D, point3d, Vector3D, vec3d, Plane, plane, distance, dot, cross, normalize, length, worldToSketch } from '../core';
import { Face, Surface } from '../topology/face';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, Curve3D } from '../topology/edge';
import { makeLine3D, evaluateLine3D } from '../geometry/line3d';
import { makeCircle3D, evaluateCircle3D } from '../geometry/circle3d';
import { makeArc3D, evaluateArc3D } from '../geometry/arc3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';
import { intersectSurfaces, SSICurve, SSIPoint } from '../geometry/surface-intersection';
import {
  intersectPlanePlane, intersectPlaneSphere, intersectPlaneCylinder, intersectPlaneCone,
  PlaneCircleIntersection,
} from '../geometry/intersections3d';
import { evaluatePlaneSurface, projectToPlaneSurface } from '../surfaces/plane-surface';
import { projectToSphericalSurface } from '../surfaces/spherical-surface';
import { projectToCylindricalSurface } from '../surfaces/cylindrical-surface';
import { projectToConicalSurface } from '../surfaces/conical-surface';
import type { SphericalSurface } from '../surfaces/spherical-surface';
import type { CylindricalSurface } from '../surfaces/cylindrical-surface';
import type { ConicalSurface } from '../surfaces/conical-surface';
import type { PlaneSurface } from '../surfaces/plane-surface';
import type { Curve2D } from '../geometry/wire2d';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

/**
 * An edge produced by face-face intersection, with UV coordinates on both faces.
 */
export interface FFIEdge {
  /** The bounded 3D intersection edge */
  readonly edge: Edge;
  /** Index range in the original SSI polyline (for PCurve reconstruction) */
  readonly startIdx: number;
  readonly endIdx: number;
  /** The SSI curve this edge came from (for UV access) */
  readonly ssiCurve: SSICurve;
}

/**
 * Result of face-face intersection.
 */
export interface FFIResult {
  /** Intersection edges, each trimmed to both face boundaries */
  readonly edges: FFIEdge[];
}

// ═══════════════════════════════════════════════
// UV BOUNDARY COMPUTATION
// ═══════════════════════════════════════════════

/**
 * Check if a face has a natural restriction wire (same edge fwd+rev).
 * These faces cover the full surface — UV clipping is not meaningful.
 */
function isNaturalRestriction(face: Face): boolean {
  const edges = face.outerWire.edges;
  if (edges.length === 2) {
    return edges[0].edge === edges[1].edge && edges[0].forward !== edges[1].forward;
  }
  return false;
}

/** A 2D polygon in UV space representing a face's boundary. */
type UVPoly = { u: number; v: number }[];

function projectToSurface(surf: Surface, pt: Point3D): { u: number; v: number } | null {
  switch (surf.type) {
    case 'plane': return projectToPlaneSurface(surf, pt);
    case 'sphere': return projectToSphericalSurface(surf, pt);
    case 'cylinder': return projectToCylindricalSurface(surf, pt);
    case 'cone': return projectToConicalSurface(surf, pt);
    default: return null;
  }
}

/**
 * Compute the UV boundary polygon for a face by projecting wire vertices
 * onto the face's surface parameter space.
 *
 * For curved edges (circles, arcs), sample intermediate points to capture
 * the actual UV-space extent.
 */
function faceUVBoundary(face: Face): UVPoly {
  const uvPoly: UVPoly = [];
  const surf = face.surface;

  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;
    // Sample along the edge: more points for curved edges
    const n = (curve.type === 'line3d') ? 1 : 8;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const pt3d = oe.forward
        ? evaluate3DAt(curve, curve.startParam + t * (curve.endParam - curve.startParam))
        : evaluate3DAt(curve, curve.endParam - t * (curve.endParam - curve.startParam));
      if (!pt3d) continue;

      const uv = projectToSurface(surf, pt3d);
      if (uv) uvPoly.push(uv);
    }
  }

  return uvPoly;
}

/** Evaluate a curve at parameter t. */
function evaluate3DAt(curve: Curve3D, t: number): Point3D | null {
  switch (curve.type) {
    case 'line3d':
      return evaluateLine3D(curve, t);
    case 'circle3d':
      return evaluateCircle3D(curve, t);
    case 'arc3d':
      return evaluateArc3D(curve, t);
    case 'ellipse3d':
      return evaluateEllipse3D(curve, t);
  }
}

// ═══════════════════════════════════════════════
// POINT-IN-UV-POLYGON TEST
// ═══════════════════════════════════════════════

/** UV bounding box for a face. */
interface UVBox {
  uMin: number; uMax: number;
  vMin: number; vMax: number;
}

/**
 * Compute the UV bounding box for a curved face from its wire vertices.
 * More robust than UV polygon for curved surfaces with angular wrapping.
 */
function faceUVBox(face: Face): UVBox {
  const uvPoly = faceUVBoundary(face);
  if (uvPoly.length === 0) {
    // Fallback: use natural bounds
    return naturalUVBounds(face.surface);
  }

  let uMin = Infinity, uMax = -Infinity;
  let vMin = Infinity, vMax = -Infinity;
  for (const { u, v } of uvPoly) {
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }

  // Add margin for numerical safety
  const uMargin = (uMax - uMin) * 0.05 + 0.01;
  const vMargin = (vMax - vMin) * 0.05 + 0.01;
  return {
    uMin: uMin - uMargin, uMax: uMax + uMargin,
    vMin: vMin - vMargin, vMax: vMax + vMargin,
  };
}

/** Get natural UV bounds for a surface type. */
function naturalUVBounds(surf: Surface): UVBox {
  switch (surf.type) {
    case 'plane': return { uMin: -100, uMax: 100, vMin: -100, vMax: 100 };
    case 'sphere': return { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI / 2, vMax: Math.PI / 2 };
    case 'cylinder': case 'cone': return { uMin: -Math.PI, uMax: Math.PI, vMin: -20, vMax: 20 };
    default: return { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI };
  }
}

/**
 * Clip an SSI curve to a UV bounding box.
 * Returns index ranges where the SSI points are inside the box.
 */
function clipSSICurveToUVBox(
  curve: SSICurve,
  box: UVBox,
  useUV1: boolean,
): ClipSegment[] {
  const pts = curve.points;
  if (pts.length < 2) return [];

  const segments: ClipSegment[] = [];
  let inRegion = false;
  let segStart = 0;

  for (let i = 0; i < pts.length; i++) {
    const u = useUV1 ? pts[i].u1 : pts[i].u2;
    const v = useUV1 ? pts[i].v1 : pts[i].v2;
    const inside = u >= box.uMin && u <= box.uMax && v >= box.vMin && v <= box.vMax;

    if (inside && !inRegion) {
      segStart = i;
      inRegion = true;
    } else if (!inside && inRegion) {
      if (i - segStart >= 2) {
        segments.push({ startIdx: segStart, endIdx: i - 1 });
      }
      inRegion = false;
    }
  }

  if (inRegion && pts.length - segStart >= 2) {
    segments.push({ startIdx: segStart, endIdx: pts.length - 1 });
  }

  return segments;
}

/**
 * Ray-casting point-in-polygon test in UV space.
 * Returns true if the UV point is inside the polygon.
 */
function uvPointInPoly(u: number, v: number, poly: UVPoly): boolean {
  if (poly.length < 3) return true; // Degenerate — accept all
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ui = poly[i].u, vi = poly[i].v;
    const uj = poly[j].u, vj = poly[j].v;
    if ((vi > v) !== (vj > v)) {
      const uIntersect = uj + ((ui - uj) * (v - vj)) / (vi - vj);
      if (u < uIntersect) inside = !inside;
    }
  }
  return inside;
}

// ═══════════════════════════════════════════════
// SSI CURVE CLIPPING TO FACE BOUNDARIES
// ═══════════════════════════════════════════════

interface ClipSegment {
  startIdx: number;
  endIdx: number;
}

/**
 * Clip an SSI curve to a face boundary.
 *
 * Returns the index ranges of the SSI polyline that lie inside the face
 * in UV parameter space.
 *
 * @param curve - The SSI curve with UV coordinates
 * @param uvPoly - The face's UV boundary polygon
 * @param useUV1 - If true, use (u1, v1); if false, use (u2, v2)
 */
function clipSSICurveToFace(
  curve: SSICurve,
  uvPoly: UVPoly,
  useUV1: boolean,
): ClipSegment[] {
  const pts = curve.points;
  if (pts.length < 2) return [];

  const segments: ClipSegment[] = [];
  let inRegion = false;
  let segStart = 0;

  for (let i = 0; i < pts.length; i++) {
    const u = useUV1 ? pts[i].u1 : pts[i].u2;
    const v = useUV1 ? pts[i].v1 : pts[i].v2;
    const inside = uvPointInPoly(u, v, uvPoly);

    if (inside && !inRegion) {
      segStart = i;
      inRegion = true;
    } else if (!inside && inRegion) {
      if (i - segStart >= 2) {
        segments.push({ startIdx: segStart, endIdx: i - 1 });
      }
      inRegion = false;
    }
  }

  // Close any open segment
  if (inRegion && pts.length - segStart >= 2) {
    segments.push({ startIdx: segStart, endIdx: pts.length - 1 });
  }

  return segments;
}

/**
 * Intersect two sets of index-range segments.
 * Returns segments that appear in BOTH sets.
 */
function intersectSegments(segsA: ClipSegment[], segsB: ClipSegment[]): ClipSegment[] {
  const result: ClipSegment[] = [];
  for (const a of segsA) {
    for (const b of segsB) {
      const start = Math.max(a.startIdx, b.startIdx);
      const end = Math.min(a.endIdx, b.endIdx);
      if (end - start >= 1) {
        result.push({ startIdx: start, endIdx: end });
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════
// EDGE CONSTRUCTION FROM SSI POLYLINE SEGMENT
// ═══════════════════════════════════════════════

/**
 * Build an Edge from a segment of an SSI polyline.
 *
 * For short segments (< 5 points), creates a line edge.
 * For longer segments, creates a polyline approximated as a line from start to end.
 * (Future: fit arcs/circles for analytic representation.)
 */
function buildEdgeFromSSISegment(
  curve: SSICurve,
  startIdx: number,
  endIdx: number,
): Edge | null {
  const pts = curve.points;
  const startPt = pts[startIdx].point;
  const endPt = pts[endIdx].point;

  // Don't create zero-length edges
  if (distance(startPt, endPt) < 1e-6) return null;

  // Create a line edge between start and end points.
  // This is a simplification — the actual intersection curve may be curved.
  // For boolean operations, what matters is that the edge endpoints are correct
  // and the edge lies approximately on both surfaces.
  const lineResult = makeLine3D(startPt, endPt);
  if (!lineResult.success) return null;

  const edgeResult = makeEdgeFromCurve(lineResult.result!);
  if (!edgeResult.success) return null;

  return edgeResult.result!;
}

// ═══════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════

/**
 * Compute the intersection between two faces.
 *
 * Produces bounded edges with UV coordinates on both faces, suitable
 * for face splitting in boolean operations.
 *
 * @param faceA - First face
 * @param faceB - Second face
 * @returns Intersection edges, or null if no intersection
 */
export function intersectFaceFace(faceA: Face, faceB: Face): FFIResult | null {
  // Try analytic dispatch first for known surface pairs.
  // This produces exact Circle3D/Arc3D/Line3D edges instead of degenerate
  // polyline approximations from the SSI marcher.
  // Based on OCCT IntPatch_ALine / IntPatch_GLine for quadric surfaces.
  const analyticResult = tryAnalyticIntersection(faceA, faceB);
  if (analyticResult !== undefined) return analyticResult;

  // Fallback: SSI marching for arbitrary surface pairs
  // Step 1: Compute raw SSI curves between the underlying surfaces
  const ssiResult = intersectSurfaces(faceA.surface, faceB.surface);
  if (ssiResult.curves.length === 0) return null;

  // Step 2: Compute UV boundaries for both faces.
  // Natural restriction faces (full sphere from semicircle revolve) have degenerate
  // wires (seam only) — skip UV clipping for these, accept all points.
  const natRestA = isNaturalRestriction(faceA);
  const natRestB = isNaturalRestriction(faceB);
  const uvPolyA = natRestA ? [] : faceUVBoundary(faceA);
  const uvPolyB = natRestB ? [] : faceUVBoundary(faceB);

  // Step 3: For each SSI curve, clip to both face boundaries
  const edges: FFIEdge[] = [];

  for (const ssiCurve of ssiResult.curves) {
    const fullSeg = [{ startIdx: 0, endIdx: ssiCurve.points.length - 1 }];

    // Clip to face A's boundary
    const segsA = natRestA ? fullSeg
      : faceA.surface.type === 'plane' ? clipSSICurveToFace(ssiCurve, uvPolyA, true)
      : clipSSICurveToUVBox(ssiCurve, faceUVBox(faceA), true);

    // Clip to face B's boundary
    const segsB = natRestB ? fullSeg
      : faceB.surface.type === 'plane' ? clipSSICurveToFace(ssiCurve, uvPolyB, false)
      : clipSSICurveToUVBox(ssiCurve, faceUVBox(faceB), false);

    // Intersect: keep only portions inside BOTH faces
    const survivingSegs = intersectSegments(segsA, segsB);

    // Step 4: Build edges from surviving segments
    for (const seg of survivingSegs) {
      const edge = buildEdgeFromSSISegment(ssiCurve, seg.startIdx, seg.endIdx);
      if (edge) {
        edges.push({
          edge,
          startIdx: seg.startIdx,
          endIdx: seg.endIdx,
          ssiCurve,
        });
      }
    }
  }

  if (edges.length === 0) return null;
  return { edges };
}

// ═══════════════════════════════════════════════
// ANALYTIC INTERSECTION DISPATCH
// Based on OCCT IntPatch_ALine / IntPatch_GLine
// ═══════════════════════════════════════════════

type Pt2 = { x: number; y: number };

/**
 * Try analytic intersection for known surface pairs.
 * Returns FFIResult or null (intersection found or confirmed empty),
 * or undefined (surface pair not handled analytically — use SSI fallback).
 */
function tryAnalyticIntersection(faceA: Face, faceB: Face): FFIResult | null | undefined {
  const sA = faceA.surface;
  const sB = faceB.surface;

  // Plane-Plane → Line3D
  if (sA.type === 'plane' && sB.type === 'plane') {
    return analyticPlanePlane(faceA, faceB);
  }

  // Plane-Curved → Circle3D / Arc3D
  if (sA.type === 'plane' && sB.type !== 'plane') {
    return analyticPlaneCurved(faceA, faceB);
  }
  if (sB.type === 'plane' && sA.type !== 'plane') {
    // Swap so plane is always first
    const result = analyticPlaneCurved(faceB, faceA);
    // Edges are the same regardless of order
    return result;
  }

  // Other pairs: use SSI marcher
  return undefined;
}

// ═══════════════════════════════════════════════
// PLANE-PLANE ANALYTIC INTERSECTION
// ═══════════════════════════════════════════════

/**
 * Analytic plane-plane intersection. Returns a Line3D edge clipped to both face boundaries.
 */
function analyticPlanePlane(faceA: Face, faceB: Face): FFIResult | null {
  if (faceA.surface.type !== 'plane' || faceB.surface.type !== 'plane') return null;

  const plA = faceA.surface.plane;
  const plB = faceB.surface.plane;

  const lineResult = intersectPlanePlane(plA, plB);
  if (!lineResult.success || !lineResult.result) return null;

  const infLine = lineResult.result;
  // The line has origin and direction — it's infinite. Clip to both faces.
  const dir = infLine.direction;
  const origin = infLine.origin;

  // Clip the infinite line to face A's boundary (2D projection)
  const rangeA = clipInfiniteLineToFace(origin, dir, faceA);
  if (!rangeA) return null;

  // Clip the infinite line to face B's boundary
  const rangeB = clipInfiniteLineToFace(origin, dir, faceB);
  if (!rangeB) return null;

  // Intersect the two ranges
  const tMin = Math.max(rangeA.tMin, rangeB.tMin);
  const tMax = Math.min(rangeA.tMax, rangeB.tMax);

  if (tMax - tMin < 1e-8) return null; // No overlap

  const startPt = point3d(
    origin.x + tMin * dir.x, origin.y + tMin * dir.y, origin.z + tMin * dir.z,
  );
  const endPt = point3d(
    origin.x + tMax * dir.x, origin.y + tMax * dir.y, origin.z + tMax * dir.z,
  );

  const lineEdgeResult = makeLine3D(startPt, endPt);
  if (!lineEdgeResult.success) return null;
  const edgeResult = makeEdgeFromCurve(lineEdgeResult.result!);
  if (!edgeResult.success) return null;

  const dummySSI: SSICurve = { points: [], isClosed: false };
  return {
    edges: [{
      edge: edgeResult.result!,
      startIdx: 0,
      endIdx: 0,
      ssiCurve: dummySSI,
    }],
  };
}

/**
 * Clip an infinite line (origin + t*direction) to a planar face boundary.
 * Returns the parameter range [tMin, tMax] where the line is inside the face.
 */
function clipInfiniteLineToFace(
  origin: Point3D,
  dir: Vector3D,
  face: Face,
): { tMin: number; tMax: number } | null {
  if (face.surface.type !== 'plane') return null;
  const pl = face.surface.plane;

  // Project line and face boundary to face's 2D coordinate system
  const origin2d = worldToSketch(pl, origin);
  const farPt = point3d(origin.x + dir.x, origin.y + dir.y, origin.z + dir.z);
  const far2d = worldToSketch(pl, farPt);
  const dir2d = { x: far2d.x - origin2d.x, y: far2d.y - origin2d.y };

  // Get face boundary as 2D polygon
  const poly = faceBoundaryPolygon2D(face, pl);
  if (poly.length < 3) return null;

  // Find all intersections of the infinite 2D line with the polygon edges
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const t = lineSegmentIntersect2D(
      origin2d, dir2d, poly[i], poly[j],
    );
    if (t !== null) hits.push(t);
  }

  if (hits.length < 2) return null;

  hits.sort((a, b) => a - b);
  return { tMin: hits[0], tMax: hits[hits.length - 1] };
}

/**
 * Intersect an infinite 2D line (origin + t*dir) with a 2D line segment (a→b).
 * Returns t on the infinite line, or null if no intersection within the segment.
 */
function lineSegmentIntersect2D(
  origin: Pt2, dir: Pt2, a: Pt2, b: Pt2,
): number | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const denom = dir.x * dy - dir.y * dx;
  if (Math.abs(denom) < 1e-12) return null; // Parallel

  const t = ((a.x - origin.x) * dy - (a.y - origin.y) * dx) / denom;
  const s = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / denom;

  if (s < -1e-8 || s > 1 + 1e-8) return null; // Outside segment
  return t;
}

/**
 * Get face outer wire as a 2D polygon in the face plane's coordinate system.
 * Samples curved edges for proper representation.
 */
function faceBoundaryPolygon2D(face: Face, pl: Plane): Pt2[] {
  const pts: Pt2[] = [];
  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
    if (isCurved) {
      const n = curve.isClosed ? 32 : 16;
      for (let i = 0; i < n; i++) {
        const t = oe.forward
          ? curve.startParam + (i / n) * (curve.endParam - curve.startParam)
          : curve.endParam - (i / n) * (curve.endParam - curve.startParam);
        const pt3d = evaluate3DAt(curve, t);
        if (pt3d) pts.push(worldToSketch(pl, pt3d));
      }
    } else {
      const pt3d = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      pts.push(worldToSketch(pl, pt3d));
    }
  }
  return pts;
}

// ═══════════════════════════════════════════════
// PLANE-CURVED ANALYTIC INTERSECTION
// ═══════════════════════════════════════════════

/**
 * Analytic intersection of a planar face with a curved face.
 * Returns Circle3D (full circle inside both faces) or Arc3D (partial) edges.
 */
function analyticPlaneCurved(planeFace: Face, curvedFace: Face): FFIResult | null {
  if (planeFace.surface.type !== 'plane') return null;
  const pl = planeFace.surface.plane;
  const curvedSurf = curvedFace.surface;

  // Compute the analytic intersection circle
  let circleInfo: PlaneCircleIntersection | null = null;

  if (curvedSurf.type === 'sphere') {
    const res = intersectPlaneSphere(pl, curvedSurf);
    if (res.success && res.result) circleInfo = res.result;
  } else if (curvedSurf.type === 'cylinder') {
    const res = intersectPlaneCylinder(pl, curvedSurf);
    if (res.success && res.result && res.result.type === 'circle') circleInfo = res.result;
  } else if (curvedSurf.type === 'cone') {
    const res = intersectPlaneCone(pl, curvedSurf);
    if (res.success && res.result && res.result.type === 'circle') circleInfo = res.result;
  }

  if (!circleInfo) return null;


  // Build the 3D circle
  const circlePlane = plane(circleInfo.center, circleInfo.normal, pl.xAxis);
  const circle3dResult = makeCircle3D(circlePlane, circleInfo.radius);
  if (!circle3dResult.success || !circle3dResult.result) return null;

  // Check if the circle is inside the planar face boundary
  const polyA = faceBoundaryPolygon2D(planeFace, pl);
  const center2d = worldToSketch(pl, circleInfo.center);
  const isFullyInsidePlane = isCircleInsidePolygon(center2d, circleInfo.radius, pl, polyA);

  // Check if the circle is inside the curved face boundary.
  // The circle IS on the curved surface by construction (it's the analytic
  // intersection). We just need to check if it's within THIS face's portion
  // of the surface (e.g., which hemisphere of a sphere).
  // For natural restriction faces (full surface), it's always inside.
  // For multi-face surfaces, check if the circle center projects into the
  // face's UV boundary, or just accept it and let BuilderFace handle splitting.
  const natRest = isNaturalRestriction(curvedFace);
  const isFullyInsideCurved = natRest || isCircleCenterInsideCurvedFace(circleInfo, curvedFace);


  if (isFullyInsidePlane && isFullyInsideCurved) {
    // Full circle inside both faces → Circle3D edge
    const edgeResult = makeEdgeFromCurve(circle3dResult.result!);
    if (!edgeResult.success) return null;

    const dummySSI: SSICurve = { points: [], isClosed: true };
    return {
      edges: [{
        edge: edgeResult.result!,
        startIdx: 0,
        endIdx: 0,
        ssiCurve: dummySSI,
      }],
    };
  }

  // Partial circle: clip to face boundaries and create Arc3D edges
  const arcs = clipCircleToFaces(circleInfo, circlePlane, planeFace, curvedFace, pl);
  if (arcs.length === 0) return null;

  const ffiEdges: FFIEdge[] = [];
  const dummySSI: SSICurve = { points: [], isClosed: false };
  for (const arc of arcs) {
    ffiEdges.push({ edge: arc, startIdx: 0, endIdx: 0, ssiCurve: dummySSI });
  }
  return { edges: ffiEdges };
}

/**
 * Check if a circle is fully inside a 2D polygon.
 * Tests center + 16 evenly spaced boundary points.
 */
function isCircleInsidePolygon(
  center: Pt2,
  radius: number,
  facePlane: Plane,
  polygon: Pt2[],
): boolean {
  if (polygon.length < 3) return false;
  if (!pointInPoly2D(center, polygon)) return false;

  for (let i = 0; i < 16; i++) {
    const theta = (i / 16) * 2 * Math.PI;
    // Compute circle point in face plane's 2D coordinates
    const pt: Pt2 = {
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta),
    };
    if (!pointInPoly2D(pt, polygon)) return false;
  }
  return true;
}

/**
 * Check if a circle's center lies inside a curved face's boundary.
 * The circle is analytically on the surface — we just check if it's
 * within THIS face's portion (e.g., which hemisphere of a sphere).
 * Uses the face's sampled bounding box with generous tolerance.
 */
function isCircleCenterInsideCurvedFace(
  circle: PlaneCircleIntersection,
  face: Face,
): boolean {
  // Compute the curved face's 3D bounding box by sampling wire edges
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  let zMin = Infinity, zMax = -Infinity;

  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;
    const n = (curve.type === 'circle3d' || curve.type === 'arc3d') ? 16 : 2;
    for (let i = 0; i <= n; i++) {
      const t = curve.startParam + (i / n) * (curve.endParam - curve.startParam);
      const pt = evaluate3DAt(curve, t);
      if (!pt) continue;
      if (pt.x < xMin) xMin = pt.x; if (pt.x > xMax) xMax = pt.x;
      if (pt.y < yMin) yMin = pt.y; if (pt.y > yMax) yMax = pt.y;
      if (pt.z < zMin) zMin = pt.z; if (pt.z > zMax) zMax = pt.z;
    }
  }

  const tol = Math.max(circle.radius * 0.1, 0.01);
  const c = circle.center;
  return c.x >= xMin - tol && c.x <= xMax + tol &&
         c.y >= yMin - tol && c.y <= yMax + tol &&
         c.z >= zMin - tol && c.z <= zMax + tol;
}

/**
 * Clip a circle to both face boundaries, producing Arc3D edges for the portions
 * inside both faces.
 */
function clipCircleToFaces(
  circle: PlaneCircleIntersection,
  circlePlane: Plane,
  planeFace: Face,
  curvedFace: Face,
  facePl: Plane,
): Edge[] {
  // Get the planar face boundary as 2D polygon
  const poly = faceBoundaryPolygon2D(planeFace, facePl);
  if (poly.length < 3) return [];

  const center2d = worldToSketch(facePl, circle.center);
  const r = circle.radius;

  // Find all circle-polygon intersections
  const hits: { angle: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a = poly[i], b = poly[j];

    const dx = b.x - a.x, dy = b.y - a.y;
    const fx = a.x - center2d.x, fy = a.y - center2d.y;
    const qa = dx * dx + dy * dy;
    if (qa < 1e-14) continue;
    const qb = 2 * (fx * dx + fy * dy);
    const qc = fx * fx + fy * fy - r * r;
    const disc = qb * qb - 4 * qa * qc;
    if (disc < -1e-10) continue;

    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    for (const sign of [-1, 1]) {
      const t = (-qb + sign * sqrtDisc) / (2 * qa);
      if (t < 1e-6 || t > 1 - 1e-6) continue;
      const px = a.x + t * dx - center2d.x;
      const py = a.y + t * dy - center2d.y;
      let angle = Math.atan2(py, px);
      if (angle < 0) angle += 2 * Math.PI;
      hits.push({ angle });
    }
  }

  if (hits.length < 2) {
    // No partial clipping needed — circle might be fully inside or outside
    // Already handled by the full-circle check above
    return [];
  }

  // Sort by angle
  hits.sort((a, b) => a.angle - b.angle);

  // For each arc between consecutive hits, check if midpoint is inside the polygon
  const arcs: Edge[] = [];
  for (let i = 0; i < hits.length; i++) {
    const a1 = hits[i].angle;
    const a2 = hits[(i + 1) % hits.length].angle;
    const midAngle = a1 < a2
      ? (a1 + a2) / 2
      : ((a1 + a2 + 2 * Math.PI) / 2) % (2 * Math.PI);

    const midPt: Pt2 = {
      x: center2d.x + r * Math.cos(midAngle),
      y: center2d.y + r * Math.sin(midAngle),
    };

    if (!pointInPoly2D(midPt, poly)) continue;

    // This arc segment is inside the face — create an Arc3D edge
    const startAngle = a1;
    const endAngle = a1 < a2 ? a2 : a2 + 2 * Math.PI;

    const arcResult = makeArc3D(circlePlane, r, startAngle, endAngle);
    if (!arcResult.success || !arcResult.result) continue;
    const edgeResult = makeEdgeFromCurve(arcResult.result);
    if (!edgeResult.success) continue;
    arcs.push(edgeResult.result!);
  }

  return arcs;
}

/** 2D point-in-polygon (ray casting) */
function pointInPoly2D(pt: Pt2, poly: Pt2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) &&
        pt.x < poly[j].x + (poly[i].x - poly[j].x) * (pt.y - poly[j].y) / (poly[i].y - poly[j].y)) {
      inside = !inside;
    }
  }
  return inside;
}
