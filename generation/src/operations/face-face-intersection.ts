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
import { Point3D, point3d, distance } from '../core';
import { Face, Surface } from '../topology/face';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, Curve3D } from '../topology/edge';
import { makeLine3D, evaluateLine3D } from '../geometry/line3d';
import { makeCircle3D, evaluateCircle3D } from '../geometry/circle3d';
import { makeArc3D, evaluateArc3D } from '../geometry/arc3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';
import { intersectSurfaces, SSICurve, SSIPoint } from '../geometry/surface-intersection';
import { evaluatePlaneSurface, projectToPlaneSurface } from '../surfaces/plane-surface';
import { projectToSphericalSurface } from '../surfaces/spherical-surface';
import { projectToCylindricalSurface } from '../surfaces/cylindrical-surface';
import { projectToConicalSurface } from '../surfaces/conical-surface';
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
