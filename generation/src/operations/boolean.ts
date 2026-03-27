import {
  Point3D,
  point3d,
  vec3d,
  Plane,
  plane,
  dot,
  cross,
  normalize,
  length,
  isZero,
  distance,
  worldToSketch,
  BoundingBox3D,
  emptyBoundingBox,
  addPoint,
  intersects as bboxIntersects,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { makeLine3D, evaluateLine3D } from '../geometry/line3d';
import { evaluateCircle3D } from '../geometry/circle3d';
import { evaluateArc3D } from '../geometry/arc3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';
import type { Curve3D } from '../topology/edge';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire } from '../topology/wire';
import { Face, Surface, makeFace } from '../topology/face';
import { Shell, makeShell, shellFaces } from '../topology/shell';
import { Solid, makeSolid, solidVolume } from '../topology/solid';
import { PlaneSurface, makePlaneSurface } from '../surfaces';
import { toAdapter } from '../surfaces/surface-adapter';
import { pointInSolid } from './point-in-solid';
import { intersectFaceFace } from './face-face-intersection';
import { builderFace } from './builder-face';
import { evaluateCurve2D } from '../topology/pcurve';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type BooleanOp = 'union' | 'subtract' | 'intersect';

export interface BooleanResult {
  solid: Solid;
  facesFromA: Face[];
  facesFromB: Face[];
}

// ═══════════════════════════════════════════════════════
// BOUNDING BOX HELPERS
// ═══════════════════════════════════════════════════════

function boundingBoxFromFace(face: Face): BoundingBox3D {
  let box = emptyBoundingBox();
  for (const oe of face.outerWire.edges) {
    box = addPoint(box, edgeStartPoint(oe.edge));
    box = addPoint(box, edgeEndPoint(oe.edge));
    // Sample curved edges to capture full extent (circle start==end gives 1 point)
    const curve = oe.edge.curve;
    if (curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d') {
      const n = curve.isClosed ? 16 : 8;
      for (let i = 1; i < n; i++) {
        const t = curve.startParam + (i / n) * (curve.endParam - curve.startParam);
        const pt = evaluateCurveAt(curve, t);
        if (pt) box = addPoint(box, pt);
      }
    }
  }
  return box;
}

function boundingBoxFromSolid(solid: Solid): BoundingBox3D {
  let box = emptyBoundingBox();
  for (const face of shellFaces(solid.outerShell)) {
    const faceBox = boundingBoxFromFace(face);
    box = addPoint(box, faceBox.min);
    box = addPoint(box, faceBox.max);
  }
  return box;
}

// ═══════════════════════════════════════════════════════
// 2D POLYGON UTILITIES (for coplanar face handling)
// ═══════════════════════════════════════════════════════

type Pt2 = { x: number; y: number };

/** Sutherland-Hodgman polygon clipping. */
function clipPolygon(subject: Pt2[], clip: Pt2[]): Pt2[] {
  if (subject.length === 0 || clip.length === 0) return [];

  let output = [...subject];

  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const input = output;
    output = [];
    const edgeStart = clip[i];
    const edgeEnd = clip[(i + 1) % clip.length];

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];

      const currInside = isInsideEdge(current, edgeStart, edgeEnd);
      const prevInside = isInsideEdge(previous, edgeStart, edgeEnd);

      if (currInside) {
        if (!prevInside) {
          const inter = lineIntersect2D(previous, current, edgeStart, edgeEnd);
          if (inter) output.push(inter);
        }
        output.push(current);
      } else if (prevInside) {
        const inter = lineIntersect2D(previous, current, edgeStart, edgeEnd);
        if (inter) output.push(inter);
      }
    }
  }

  return output;
}

function isInsideEdge(pt: Pt2, edgeStart: Pt2, edgeEnd: Pt2): boolean {
  return (edgeEnd.x - edgeStart.x) * (pt.y - edgeStart.y) -
         (edgeEnd.y - edgeStart.y) * (pt.x - edgeStart.x) >= -1e-10;
}

function lineIntersect2D(a1: Pt2, a2: Pt2, b1: Pt2, b2: Pt2): Pt2 | null {
  const dax = a2.x - a1.x, day = a2.y - a1.y;
  const dbx = b2.x - b1.x, dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-15) return null;

  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

function polygonArea2D(poly: Pt2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return area / 2;
}

function pointInPolygon2DSimple(pt: Pt2, poly: Pt2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) &&
        pt.x < poly[j].x + (poly[i].x - poly[j].x) * (pt.y - poly[j].y) / (poly[i].y - poly[j].y)) {
      inside = !inside;
    }
  }
  return inside;
}

// ═══════════════════════════════════════════════════════
// COPLANAR BOUNDARY INTERSECTION
// ═══════════════════════════════════════════════════════


/**
 * Classify a sub-face from a coplanar face split by BuilderFace.
 * Sub-faces in the overlap region get operation-specific classification;
 * non-overlap sub-faces use standard pointInSolid classification.
 *
 * OCCT reference: BOPAlgo_Builder::FillSameDomainFaces
 */
function classifyCoplanarSubFace(
  subFace: Face,
  otherCoplanarFace: Face,
  otherSolid: Solid,
  pl: Plane,
  op: BooleanOp,
  isSideA: boolean,
  intEdges: Edge[],
): 'inside' | 'outside' | 'on' {
  const otherPoly = faceToPolygon2D(otherCoplanarFace, pl);

  // A sub-face is in the overlap region if ALL its edge midpoints are inside
  // (or on the boundary of) the other face's polygon. Edge midpoints from
  // intersection edges lie exactly on the boundary, so we expand the polygon
  // slightly to include boundary points.
  let cx2 = 0, cy2 = 0;
  for (const p of otherPoly) { cx2 += p.x; cy2 += p.y; }
  cx2 /= otherPoly.length; cy2 /= otherPoly.length;
  const expandedPoly = otherPoly.map(p => ({
    x: p.x + (p.x - cx2) * 0.001,
    y: p.y + (p.y - cy2) * 0.001,
  }));

  let allInside = true;
  let anyChecked = false;
  for (const oe of subFace.outerWire.edges) {
    const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    const mid = worldToSketch(pl, point3d((s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2));
    anyChecked = true;
    if (!pointInPolygon2DSimple(mid, expandedPoly)) {
      allInside = false;
      break;
    }
  }
  if (!anyChecked) return classifySubFace(subFace, otherSolid, intEdges);

  if (allInside) {
    // Sub-face is fully in the overlap region
    if (isSideA) {
      if (op === 'union') return 'on';         // kept from A, discarded from B
      if (op === 'subtract') return 'inside';   // NOT kept from A
      return 'inside';                           // intersect: kept from A
    }
    return 'on'; // B-side overlap: not kept (A's copy handles it)
  }

  // Not in overlap: standard classification
  return classifySubFace(subFace, otherSolid, intEdges);
}

// ═══════════════════════════════════════════════════════
// FACE UTILITIES
// ═══════════════════════════════════════════════════════

/**
 * Check if an intersection edge lies on a face's boundary (within tolerance).
 * Edges on the boundary are redundant for BuilderFace — the face boundary
 * already provides that constraint. Adding them causes duplicate loops.
 */
/**
 * Check if an intersection edge lies on a face's boundary.
 * Returns the matching boundary Edge if found (for edge sharing), or null.
 * OCCT ref: In OCCT, FFI clips to UV domain; boundary-coincident curves
 * produce zero-length segments and are discarded. We check post-FFI.
 */
function findMatchingBoundaryEdge(edge: Edge, face: Face): Edge | null {
  const eStart = edgeStartPoint(edge);
  const eEnd = edgeEndPoint(edge);
  // For closed curves (circles), start==end so their average is the start point,
  // which often lies on a seam edge. Use the actual curve midpoint instead.
  let eMid: Point3D;
  if (edge.curve.isClosed) {
    const midT = (edge.curve.startParam + edge.curve.endParam) / 2;
    eMid = evaluateCurveAt(edge.curve, midT) || eStart;
  } else {
    eMid = point3d((eStart.x + eEnd.x) / 2, (eStart.y + eEnd.y) / 2, (eStart.z + eEnd.z) / 2);
  }
  const tol = 1e-5;

  for (const oe of face.outerWire.edges) {
    // Skip degenerate boundary edges (zero 3D length at poles)
    if (oe.edge.degenerate) continue;

    const bCurve = oe.edge.curve;

    // Check curved boundary edges (circles, arcs)
    // OCCT approach: IntTools_FaceFace clips to UV domain; intersection curves
    // exactly on the boundary get clipped to zero length and are discarded.
    // We replicate this by checking if the intersection edge's midpoint lies
    // on a boundary circle/arc.
    if ((bCurve.type === 'circle3d' || bCurve.type === 'arc3d') && 'plane' in bCurve) {
      const bArc = bCurve as any;
      const bPlane = bArc.plane;
      const bRadius = bArc.radius;
      // Check if eMid lies on this circle/arc
      const rel = vec3d(
        eMid.x - bPlane.origin.x,
        eMid.y - bPlane.origin.y,
        eMid.z - bPlane.origin.z,
      );
      const nComp = dot(rel, bPlane.normal);
      if (Math.abs(nComp) > tol) continue;
      const inPlane = vec3d(rel.x - nComp * bPlane.normal.x,
                            rel.y - nComp * bPlane.normal.y,
                            rel.z - nComp * bPlane.normal.z);
      const r = length(inPlane);
      if (Math.abs(r - bRadius) < tol) {
        // Full boundary circle: only match if FFI edge is also a full circle.
        // Partial arcs on a boundary circle should just be skipped (not shared),
        // because using the full circle as a replacement would be geometrically wrong.
        if (bCurve.isClosed) {
          if (edge.curve.isClosed) return oe.edge;  // Full circle → share
          // Partial arc on a boundary circle → signal "on boundary" but don't share.
          // Return a sentinel: the boundary edge, but caller must check edge.curve.isClosed
          // to decide sharing vs skip-only.
          return oe.edge;
        }
        // For arcs, check angle range
        const yDir = cross(bPlane.normal, bPlane.xAxis);
        const yLen = length(yDir);
        if (yLen < 1e-10) continue;
        const xComp = dot(inPlane, bPlane.xAxis);
        const yComp = (inPlane.x * yDir.x + inPlane.y * yDir.y + inPlane.z * yDir.z) / yLen;
        const angle = Math.atan2(yComp, xComp);
        if (angle >= bCurve.startParam - tol && angle <= bCurve.endParam + tol) return oe.edge;
      }
      continue;
    }

    // Line boundary edges
    const bStart = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const bEnd = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    const dx = bEnd.x - bStart.x, dy = bEnd.y - bStart.y, dz = bEnd.z - bStart.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq < tol * tol) continue;

    // Check if edge midpoint lies on this boundary edge
    const vx = eMid.x - bStart.x, vy = eMid.y - bStart.y, vz = eMid.z - bStart.z;
    const t = (vx * dx + vy * dy + vz * dz) / lenSq;
    if (t < -tol || t > 1 + tol) continue;

    const px = bStart.x + t * dx - eMid.x;
    const py = bStart.y + t * dy - eMid.y;
    const pz = bStart.z + t * dz - eMid.z;
    if (Math.sqrt(px * px + py * py + pz * pz) < tol) return oe.edge;
  }
  return null;
}

function evaluateCurveAt(curve: Curve3D, t: number): Point3D | null {
  switch (curve.type) {
    case 'line3d': return evaluateLine3D(curve, t);
    case 'circle3d': return evaluateCircle3D(curve, t);
    case 'arc3d': return evaluateArc3D(curve, t);
    case 'ellipse3d': return evaluateEllipse3D(curve, t);
  }
}

function faceToPolygon2DRaw(face: Face, pl: Plane): Pt2[] {
  const verts: Pt2[] = [];
  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';

    if (isCurved) {
      const nSamples = curve.isClosed ? 32 : 16;
      for (let i = 0; i < nSamples; i++) {
        const t = oe.forward
          ? curve.startParam + (i / nSamples) * (curve.endParam - curve.startParam)
          : curve.endParam - (i / nSamples) * (curve.endParam - curve.startParam);
        const pt3d = evaluateCurveAt(curve, t);
        if (pt3d) verts.push(worldToSketch(pl, pt3d));
      }
    } else {
      const pt3d = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      verts.push(worldToSketch(pl, pt3d));
    }
  }
  return verts;
}

function faceToPolygon2D(face: Face, pl: Plane): Pt2[] {
  const verts = faceToPolygon2DRaw(face, pl);
  if (polygonArea2D(verts) < 0) {
    verts.reverse();
  }
  return verts;
}


/**
 * Flip a face's normal by reversing the wire winding.
 */
function flipFace(face: Face): OperationResult<Face> {
  // Reverse outer wire
  const reversedEdges: OrientedEdge[] = [];
  for (let i = face.outerWire.edges.length - 1; i >= 0; i--) {
    const oe = face.outerWire.edges[i];
    reversedEdges.push(orientEdge(oe.edge, !oe.forward));
  }
  const wireResult = makeWire(reversedEdges);
  if (!wireResult.success) return failure(`Failed to reverse wire: ${wireResult.error}`);

  // Reverse inner wires (holes) — OCCT preserves holes when flipping faces
  const flippedInnerWires: Wire[] = [];
  for (const iw of face.innerWires) {
    const revInner: OrientedEdge[] = [];
    for (let i = iw.edges.length - 1; i >= 0; i--) {
      const oe = iw.edges[i];
      revInner.push(orientEdge(oe.edge, !oe.forward));
    }
    const iwResult = makeWire(revInner);
    if (iwResult.success) flippedInnerWires.push(iwResult.result!);
  }

  if (face.surface.type === 'plane') {
    const p = face.surface.plane;
    const flippedPlane = plane(p.origin, vec3d(-p.normal.x, -p.normal.y, -p.normal.z), p.xAxis);
    const flippedSurface = makePlaneSurface(flippedPlane);
    return makeFace(flippedSurface, wireResult.result!, flippedInnerWires);
  }

  return makeFace(face.surface, wireResult.result!, flippedInnerWires, !face.forward);
}

// ═══════════════════════════════════════════════════════
// FACE CLASSIFICATION
// ═══════════════════════════════════════════════════════

const COPLANAR_TOL = 1e-5;
const NUDGE_EPS = 1e-4;

function areFacesCoplanar(faceA: Face, faceB: Face): boolean {
  if (faceA.surface.type !== 'plane' || faceB.surface.type !== 'plane') return false;

  const nA = faceA.surface.plane.normal;
  const nB = faceB.surface.plane.normal;

  const dotN = dot(nA, nB);
  if (Math.abs(Math.abs(dotN) - 1) > COPLANAR_TOL) return false;

  const ptA = edgeStartPoint(faceA.outerWire.edges[0].edge);
  const dist = dot(
    vec3d(ptA.x - faceB.surface.plane.origin.x,
          ptA.y - faceB.surface.plane.origin.y,
          ptA.z - faceB.surface.plane.origin.z),
    nB,
  );
  return Math.abs(dist) < COPLANAR_TOL;
}

/**
 * Check if two coplanar faces have the same outward normal.
 * Combines wire winding (polygon area sign) with face.forward flag
 * to determine the actual outward normal direction.
 */
function coplanarSameNormal(faceA: Face, faceB: Face): boolean {
  if (faceA.surface.type !== 'plane' || faceB.surface.type !== 'plane') return false;
  const pl = faceA.surface.plane;
  const areaA = polygonArea2D(faceToPolygon2DRaw(faceA, pl));
  const areaB = polygonArea2D(faceToPolygon2DRaw(faceB, pl));
  // Effective outward direction: area sign * forward flag
  const effectiveA = (areaA > 0) === faceA.forward;
  const effectiveB = (areaB > 0) === faceB.forward;
  return effectiveA === effectiveB;
}

/** Evaluate a surface at (u,v). */
function evalSurfaceLocal(s: Surface, u: number, v: number): Point3D | null {
  return toAdapter(s).evaluate(u, v);
}

/** Project a 3D point to surface UV. */
function projectToSurfaceLocal(s: Surface, pt: Point3D): { u: number; v: number } | null {
  return toAdapter(s).projectPoint(pt);
}

/**
 * Classify a sub-face produced by BuilderFace using OCCT-style
 * intersection-edge-based determination.
 *
 * Based on OCCT BOPTools_AlgoTools::IsInternalFace:
 * 1. Find an intersection edge in the sub-face's boundary
 * 2. At the edge midpoint, compute the binormal (perpendicular to edge,
 *    pointing into the sub-face, in the face plane)
 * 3. Nudge the midpoint along the binormal
 * 4. Classify the nudged point with pointInSolid
 *
 * This is robust for non-convex sub-faces (L-shapes) where the vertex
 * centroid may be misleading.
 */
function classifySubFace(
  face: Face,
  otherSolid: Solid,
  intersectionEdges: Edge[],
): 'inside' | 'outside' | 'on' {
  // Phase 1: Try intersection-edge-based classification
  // Find an intersection edge in this sub-face's boundary
  for (const oe of face.outerWire.edges) {
    // Check if this edge lies on an intersection edge. BuilderFace may have
    // split the intersection edge, so we check if the edge MIDPOINT lies on
    // any intersection edge (not just endpoint matching).
    const eStart = edgeStartPoint(oe.edge);
    const eEnd = edgeEndPoint(oe.edge);
    const eMid = point3d((eStart.x + eEnd.x) / 2, (eStart.y + eEnd.y) / 2, (eStart.z + eEnd.z) / 2);
    const isIntEdge = intersectionEdges.some(ie => {
      // Direct edge identity check (BuilderFace may reuse the same Edge object)
      if (oe.edge === ie) return true;

      const iStart = edgeStartPoint(ie);
      const iEnd = edgeEndPoint(ie);
      const dx = iEnd.x - iStart.x, dy = iEnd.y - iStart.y, dz = iEnd.z - iStart.z;
      const lenSq = dx * dx + dy * dy + dz * dz;

      if (lenSq < 1e-12) {
        // Closed intersection edge (circle): check if sub-face edge midpoint
        // lies on the circle by sampling. Check proximity to several points.
        if (ie.curve.type === 'circle3d' || ie.curve.type === 'arc3d') {
          const nSamples = 16;
          for (let si = 0; si < nSamples; si++) {
            const t = ie.curve.startParam + (si / nSamples) * (ie.curve.endParam - ie.curve.startParam);
            const pt = evaluateCurveAt(ie.curve, t);
            if (pt && distance(eMid, pt) < STITCH_TOL * 10) return true;
          }
        }
        return false;
      }

      // For arc/circle intersection edges: check if eMid lies on the arc
      // (distance from center ≈ radius, in the arc plane, within angle range).
      if ((ie.curve.type === 'arc3d' || ie.curve.type === 'circle3d') && 'plane' in ie.curve) {
        const arcCurve = ie.curve as any;
        const center = arcCurve.plane.origin;
        const normal = arcCurve.plane.normal;
        const radius = arcCurve.radius;
        const rel = vec3d(eMid.x - center.x, eMid.y - center.y, eMid.z - center.z);
        const normalComp = Math.abs(rel.x * normal.x + rel.y * normal.y + rel.z * normal.z);
        if (normalComp > STITCH_TOL * 100) return false;
        const dist = Math.sqrt(rel.x * rel.x + rel.y * rel.y + rel.z * rel.z);
        return Math.abs(dist - radius) < STITCH_TOL * 100;
      }

      // Open intersection edge (line): check if eMid lies on segment iStart→iEnd
      const vx = eMid.x - iStart.x, vy = eMid.y - iStart.y, vz = eMid.z - iStart.z;
      const t = (vx * dx + vy * dy + vz * dz) / lenSq;
      if (t < -0.01 || t > 1.01) return false;
      const px = iStart.x + t * dx - eMid.x;
      const py = iStart.y + t * dy - eMid.y;
      const pz = iStart.z + t * dz - eMid.z;
      return Math.sqrt(px * px + py * py + pz * pz) < STITCH_TOL * 10;
    });
    if (!isIntEdge) continue;

    // Found an intersection edge in this sub-face.
    // Compute midpoint and binormal (OCCT GetFaceDir).
    // For curved/closed edges, use curve evaluation at mid-parameter.
    const curve = oe.edge.curve;
    const midParam = (curve.startParam + curve.endParam) / 2;
    const mid = evaluateCurveAt(curve, midParam) || eMid;

    // Edge direction in wire traversal order.
    // For curved edges, compute tangent from nearby curve samples.
    let edgeDir: { x: number; y: number; z: number };
    if (curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d') {
      const dt = (curve.endParam - curve.startParam) * 0.01;
      const pBefore = evaluateCurveAt(curve, midParam - dt);
      const pAfter = evaluateCurveAt(curve, midParam + dt);
      if (pBefore && pAfter) {
        const dir = vec3d(pAfter.x - pBefore.x, pAfter.y - pBefore.y, pAfter.z - pBefore.z);
        edgeDir = oe.forward ? dir : vec3d(-dir.x, -dir.y, -dir.z);
      } else {
        edgeDir = vec3d(0, 0, 0);
      }
    } else {
      const wStart = oe.forward ? eStart : eEnd;
      const wEnd = oe.forward ? eEnd : eStart;
      edgeDir = vec3d(wEnd.x - wStart.x, wEnd.y - wStart.y, wEnd.z - wStart.z);
    }

    // Face normal via SurfaceAdapter — works for any surface type
    const adapter = toAdapter(face.surface);
    const uv = adapter.projectPoint(mid);
    const faceNormal = adapter.normal(uv.u, uv.v);

    // Binormal = face_normal × edge_direction → perpendicular to edge, in face plane
    // This points to one side of the edge (into the sub-face or away from it).
    const fn = vec3d(faceNormal.x, faceNormal.y, faceNormal.z);
    const binormal = cross(fn, edgeDir);
    const binLen = length(binormal);
    if (binLen < 1e-10) continue;

    // Nudge along binormal
    const nudge = 1e-4;
    const testPt1 = point3d(
      mid.x + (binormal.x / binLen) * nudge,
      mid.y + (binormal.y / binLen) * nudge,
      mid.z + (binormal.z / binLen) * nudge,
    );

    // Check if testPt1 is inside the sub-face polygon (for planar faces)
    let useTestPt1 = true;
    if (face.surface.type === 'plane') {
      const poly = faceToPolygon2DRaw(face, face.surface.plane);
      const pt2d = worldToSketch(face.surface.plane, testPt1);
      useTestPt1 = pointInPolygon2DSimple(pt2d, poly);
    }

    const testPt = useTestPt1 ? testPt1 : point3d(
      mid.x - (binormal.x / binLen) * nudge,
      mid.y - (binormal.y / binLen) * nudge,
      mid.z - (binormal.z / binLen) * nudge,
    );

    const result = pointInSolid(testPt, otherSolid);
    if (result !== 'on') return result;
  }

  // Phase 1.5: For non-planar faces, compute an interior point via UV sampling.
  // OCCT ref: BOPTools_AlgoTools::ComputeState → PointInFace uses a hatcher
  // to find a 2D interior point, then evaluates the surface there.
  // We approximate: sample the face boundary in UV, compute the UV centroid,
  // evaluate the surface at that centroid, and classify the 3D point.
  if (face.surface.type !== 'plane') {
    const adapter = toAdapter(face.surface);
    const uvSamples: { u: number; v: number }[] = [];
    for (const oe of face.outerWire.edges) {
      if (oe.edge.degenerate) continue;
      const curve = oe.edge.curve;
      const nSamp = (curve.type === 'line3d') ? 2 : 8;
      for (let si = 0; si < nSamp; si++) {
        const frac = si / nSamp;
        const tStart = oe.forward ? curve.startParam : curve.endParam;
        const tEnd = oe.forward ? curve.endParam : curve.startParam;
        const t = tStart + frac * (tEnd - tStart);
        const pt = evaluateCurveAt(curve, t);
        if (pt) {
          // Prefer PCurve UV (correct seam side) over projection
          const pc = oe.edge.pcurves.find(p => p.surface === face.surface);
          if (pc) {
            const c2 = pc.curve2d;
            const t2d = oe.forward
              ? c2.startParam + frac * (c2.endParam - c2.startParam)
              : c2.endParam - frac * (c2.endParam - c2.startParam);
            const uv2d = evaluateCurve2D(c2, t2d);
            if (uv2d) { uvSamples.push({ u: uv2d.x, v: uv2d.y }); continue; }
          }
          const uv = adapter.projectPoint(pt);
          uvSamples.push(uv);
        }
      }
    }
    if (uvSamples.length >= 3) {
      let uSum = 0, vSum = 0;
      for (const uv of uvSamples) { uSum += uv.u; vSum += uv.v; }
      const uCentroid = uSum / uvSamples.length;
      const vCentroid = vSum / uvSamples.length;
      const interiorPt3D = adapter.evaluate(uCentroid, vCentroid);
      const result = pointInSolid(interiorPt3D, otherSolid);
      if (result !== 'on') return result;
    }
  }

  // Phase 2: OCCT ComputeState fallback (line 662-673):
  // Find an edge NOT adjacent to intersection edges and use its midpoint.
  // The key insight: edges far from the intersection boundary give the
  // most representative classification of the sub-face's region.
  //
  // Collect intersection edge endpoints for proximity check.
  const intEndpoints: Point3D[] = [];
  for (const ie of intersectionEdges) {
    intEndpoints.push(edgeStartPoint(ie));
    intEndpoints.push(edgeEndPoint(ie));
  }

  // Score edges by distance from intersection endpoints.
  // Use the edge whose midpoint is farthest from any intersection endpoint.
  let bestDist = -1;
  let bestMid: Point3D | null = null;
  for (const oe of face.outerWire.edges) {
    const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    const mid = point3d((s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2);

    let minDist = Infinity;
    for (const ip of intEndpoints) {
      const d = distance(mid, ip);
      if (d < minDist) minDist = d;
    }

    if (minDist > bestDist) {
      bestDist = minDist;
      bestMid = mid;
    }
  }

  if (bestMid) {
    const result = pointInSolid(bestMid, otherSolid);
    if (result !== 'on') return result;
  }

  // Phase 3: Last resort — standard classifyFace
  return classifyFace(face, otherSolid);
}

function classifyFace(face: Face, otherSolid: Solid): 'inside' | 'outside' | 'on' {
  const wire = face.outerWire;

  // Compute a representative interior point for classification.
  let centroid: Point3D;
  if (face.surface.type !== 'plane' && wire.edges.length > 0 && wire.edges[0].edge.curve.isClosed) {
    // Curved face with circle boundary: sample a point on the face interior.
    if (wire.edges.length === 1) {
      const circleEdge = wire.edges[0].edge;
      if (circleEdge.curve.type === 'circle3d') {
        const circlePlane = (circleEdge.curve as any).plane;
        const circleCenter = circlePlane.origin as Point3D;
        let surfCenter: Point3D | null = null;
        if (face.surface.type === 'sphere') surfCenter = (face.surface as any).center;
        else if (face.surface.type === 'cylinder') surfCenter = (face.surface as any).axis.origin;
        if (surfCenter) {
          const dx = surfCenter.x - circleCenter.x;
          const dy = surfCenter.y - circleCenter.y;
          const dz = surfCenter.z - circleCenter.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > 1e-10) {
            centroid = point3d(circleCenter.x + 0.1 * dx / d, circleCenter.y + 0.1 * dy / d, circleCenter.z + 0.1 * dz / d);
          } else {
            const cn = circlePlane.normal;
            centroid = point3d(circleCenter.x + cn.x * 0.1, circleCenter.y + cn.y * 0.1, circleCenter.z + cn.z * 0.1);
          }
        } else {
          centroid = edgeStartPoint(circleEdge);
        }
      } else {
        centroid = edgeStartPoint(wire.edges[0].edge);
      }
    } else {
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const oe of wire.edges) {
        const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
        cx += start.x; cy += start.y; cz += start.z; n++;
        if (!oe.edge.curve.isClosed) {
          const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
          cx += end.x; cy += end.y; cz += end.z; n++;
        }
      }
      centroid = n > 0 ? point3d(cx / n, cy / n, cz / n) : edgeStartPoint(wire.edges[0].edge);
    }
  } else if (face.innerWires.length > 0 && wire.edges.length > 0) {
    const oe = wire.edges[0];
    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    centroid = point3d((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  } else if (wire.edges.length === 1 && wire.edges[0].edge.curve.isClosed &&
             wire.edges[0].edge.curve.type === 'circle3d') {
    const circlePlane = (wire.edges[0].edge.curve as any).plane;
    centroid = circlePlane.origin as Point3D;
  } else if (face.surface.type !== 'plane') {
    // Curved face: project bbox center onto surface for a representative point
    const bboxFace = boundingBoxFromFace(face);
    const bboxCenter = point3d(
      (bboxFace.min.x + bboxFace.max.x) / 2,
      (bboxFace.min.y + bboxFace.max.y) / 2,
      (bboxFace.min.z + bboxFace.max.z) / 2,
    );
    const proj = projectToSurfaceLocal(face.surface, bboxCenter);
    if (proj) {
      centroid = evalSurfaceLocal(face.surface, proj.u, proj.v) || bboxCenter;
    } else {
      centroid = bboxCenter;
    }
  } else {
    // Following OCCT BOPTools_AlgoTools3D::PointInFace:
    // For planar faces, find a point guaranteed to be in the face interior
    // by taking an edge midpoint and offsetting inward along the in-plane
    // perpendicular. This is robust for non-convex (L-shaped etc.) sub-faces
    // where the vertex centroid may be misleading.
    const pl = face.surface.plane;
    const faceNormal = pl.normal;

    // Try each edge's midpoint offset inward; use the first one that's
    // inside the face polygon (via 2D point-in-polygon test).
    const poly2d = faceToPolygon2DRaw(face, pl);
    let found = false;

    for (const oe of wire.edges) {
      const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
      const mid = point3d((s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2);

      // Compute inward perpendicular: edge direction × face normal → inward direction
      const edgeDir = vec3d(e.x - s.x, e.y - s.y, e.z - s.z);
      const inward = cross(faceNormal, edgeDir);
      const inLen = length(inward);
      if (inLen < 1e-10) continue;

      // Nudge inward by a small amount
      const nudge = 1e-4;
      const candidate = point3d(
        mid.x + (inward.x / inLen) * nudge,
        mid.y + (inward.y / inLen) * nudge,
        mid.z + (inward.z / inLen) * nudge,
      );

      // Check if candidate is inside the face polygon
      const cand2d = worldToSketch(pl, candidate);
      if (pointInPolygon2DSimple(cand2d, poly2d)) {
        centroid = candidate;
        found = true;
        break;
      }

      // Try opposite direction
      const candidate2 = point3d(
        mid.x - (inward.x / inLen) * nudge,
        mid.y - (inward.y / inLen) * nudge,
        mid.z - (inward.z / inLen) * nudge,
      );
      const cand2d2 = worldToSketch(pl, candidate2);
      if (pointInPolygon2DSimple(cand2d2, poly2d)) {
        centroid = candidate2;
        found = true;
        break;
      }
    }

    if (!found) {
      // Fallback: vertex centroid
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const oe of wire.edges) {
        const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
        cx += pt.x; cy += pt.y; cz += pt.z; n++;
      }
      if (n === 0) return 'outside';
      centroid = point3d(cx / n, cy / n, cz / n);
    }
  }

  // Nudge slightly along face normal to avoid "on" classification
  const classifyAdapter = toAdapter(face.surface);
  const classifyUV = classifyAdapter.projectPoint(centroid);
  const normal = classifyAdapter.normal(classifyUV.u, classifyUV.v);

  const nudged = point3d(
    centroid.x + normal.x * 1e-6,
    centroid.y + normal.y * 1e-6,
    centroid.z + normal.z * 1e-6,
  );
  const result = pointInSolid(nudged, otherSolid);
  if (result !== 'on') return result;

  return pointInSolid(centroid, otherSolid);
}


/**
 * Add an edge to a list if no geometrically equivalent edge already exists.
 * OCCT deduplicates via BOPDS_DS PaveBlock identity; we check by endpoint proximity.
 */
function addEdgeIfNotDuplicate(list: Edge[], edge: Edge): void {
  if (list.includes(edge)) return; // Same object → skip
  const s = edgeStartPoint(edge);
  const e = edgeEndPoint(edge);
  const TOL = 1e-5;
  for (const existing of list) {
    const es = edgeStartPoint(existing);
    const ee = edgeEndPoint(existing);
    // Same geometry: both endpoints match (in either order for open curves)
    if (distance(s, es) < TOL && distance(e, ee) < TOL) return;
    if (!edge.curve.isClosed && distance(s, ee) < TOL && distance(e, es) < TOL) return;
    // For closed curves: same center + radius + plane check
    if (edge.curve.isClosed && existing.curve.isClosed) {
      if (edge.curve.type === 'circle3d' && existing.curve.type === 'circle3d' && 'plane' in edge.curve && 'plane' in existing.curve) {
        const c1 = edge.curve as any, c2 = existing.curve as any;
        if (Math.abs(c1.radius - c2.radius) < TOL && distance(c1.plane.origin, c2.plane.origin) < TOL) return;
      }
    }
  }
  list.push(edge);
}

// ═══════════════════════════════════════════════════════
// CORE BOOLEAN PIPELINE (FFI + BuilderFace)
// ═══════════════════════════════════════════════════════

/**
 * Perform a boolean operation on two solids.
 *
 * Pipeline (following OCCT BOPAlgo_PaveFiller + BOPAlgo_Builder):
 * 1. AABB overlap check
 * 2. Compute intersection edges for all non-coplanar face pairs (FFI)
 * 3. Split faces by intersection edges (BuilderFace) or polygon clipping (coplanar)
 * 4. Classify sub-face fragments (pointInSolid)
 * 5. Select faces per operation rules
 * 6. Stitch edges and assemble result solid
 */
export function booleanOperation(
  a: Solid,
  b: Solid,
  op: BooleanOp,
): OperationResult<BooleanResult> {
  // Stage 1: AABB overlap check
  const bboxA = boundingBoxFromSolid(a);
  const bboxB = boundingBoxFromSolid(b);

  if (!bboxIntersects(bboxA, bboxB)) {
    if (op === 'intersect') return failure('Solids do not overlap — intersection is empty');
    if (op === 'union') return failure('Solids do not overlap — disjoint union not supported');
    return success({ solid: a, facesFromA: [...shellFaces(a.outerShell)], facesFromB: [] });
  }

  const facesOfA = shellFaces(a.outerShell);
  const facesOfB = shellFaces(b.outerShell);

  // ── Stage 2: FFI + coplanar boundary intersection ──
  const edgesOnA: Map<Face, Edge[]> = new Map();
  const edgesOnB: Map<Face, Edge[]> = new Map();
  // Track coplanar pairs: face → { partner, sameNormal }
  const coplanarA: Map<Face, { partner: Face; sameNormal: boolean }> = new Map();
  const coplanarB: Map<Face, { partner: Face; sameNormal: boolean }> = new Map();

  // Following OCCT BOPAlgo_PaveFiller: first detect coplanar (tangent) pairs,
  // then compute FFI for all non-coplanar pairs. Coplanar faces receive their
  // splitting edges from non-coplanar FFI (e.g., A's side wall intersects B's
  // coplanar top face), NOT from separate boundary clipping.
  for (const faceA of facesOfA) {
    for (const faceB of facesOfB) {
      if (areFacesCoplanar(faceA, faceB)) {
        const sameN = coplanarSameNormal(faceA, faceB);
        if (sameN) {
          // Same-normal coplanar: check if faces actually overlap (2D area test).
          // Non-overlapping pairs (e.g., stacked box side walls) are skipped.
          const pl = (faceA.surface as PlaneSurface).plane;
          const polyA = faceToPolygon2D(faceA, pl);
          const polyB = faceToPolygon2D(faceB, pl);
          const overlapArea = Math.abs(polygonArea2D(clipPolygon(polyA, polyB)));
          if (overlapArea > 1e-8) {
            if (!coplanarA.has(faceA)) coplanarA.set(faceA, { partner: faceB, sameNormal: true });
            if (!coplanarB.has(faceB)) coplanarB.set(faceB, { partner: faceA, sameNormal: true });
          }
        } else {
          // Opposite-normal coplanar: always register (for special handling)
          if (!coplanarA.has(faceA)) coplanarA.set(faceA, { partner: faceB, sameNormal: false });
          if (!coplanarB.has(faceB)) coplanarB.set(faceB, { partner: faceA, sameNormal: false });
        }
        continue; // Coplanar surfaces don't intersect — skip FFI for this pair
      }

      // AABB pre-filter: skip face pairs whose bboxes don't overlap
      const bboxFA = boundingBoxFromFace(faceA);
      const bboxFB = boundingBoxFromFace(faceB);
      if (!bboxIntersects(bboxFA, bboxFB)) continue;

      // FFI: compute intersection edges
      const ffiResult = intersectFaceFace(faceA, faceB);
      if (!ffiResult || ffiResult.edges.length === 0) continue;

      // OCCT approach: FFI edges are added to ALL faces (including coplanar ones).
      // Coplanar faces get their splitting edges from non-coplanar FFI — e.g.,
      // B's side wall crossing A's top face produces a section edge on A's top.
      for (const ffiEdge of ffiResult.edges) {
        const e = ffiEdge.edge;
        // OCCT ref: BOPAlgo_PaveFiller stores section edges in BOPDS_DS,
        // and both faces reference the SAME edge. When an FFI edge coincides
        // with a curved boundary edge (circle/arc), we share the boundary
        // edge object and copy PCurves. For line edges, coordinate-based
        // stitching already handles matching, so just skip as before.
        const matchA = findMatchingBoundaryEdge(e, faceA);
        const matchB = findMatchingBoundaryEdge(e, faceB);

        // Edge sharing logic (OCCT: shared topology via BOPDS_DS):
        // - Full circle FFI edge matching full circle boundary → SHARE boundary edge
        // - Partial arc on a circle boundary → SKIP for that face (arc is on boundary)
        // - Line on line boundary → SKIP (stitching handles matching)
        const isCurvedA = matchA && (matchA.curve.type === 'circle3d' || matchA.curve.type === 'arc3d');
        const isCurvedB = matchB && (matchB.curve.type === 'circle3d' || matchB.curve.type === 'arc3d');
        // Can share = both FFI edge and boundary are full closed circles
        const canShareA = isCurvedA && e.curve.isClosed && matchA!.curve.isClosed;
        const canShareB = isCurvedB && e.curve.isClosed && matchB!.curve.isClosed;

        if (!matchA) {
          let edgeToUse = e;
          if (canShareB) {
            // Use B's boundary circle for sharing. Copy PCurves from FFI edge.
            edgeToUse = matchB!;
            for (const pc of e.pcurves) {
              if (!edgeToUse.pcurves.some(p => p.surface === pc.surface)) {
                edgeToUse.pcurves.push(pc);
              }
            }
          }
          if (!edgesOnA.has(faceA)) edgesOnA.set(faceA, []);
          addEdgeIfNotDuplicate(edgesOnA.get(faceA)!, edgeToUse);
        }
        if (!matchB) {
          let edgeToUse = e;
          if (canShareA) {
            // Use A's boundary circle for sharing. Copy PCurves from FFI edge.
            edgeToUse = matchA!;
            for (const pc of e.pcurves) {
              if (!edgeToUse.pcurves.some(p => p.surface === pc.surface)) {
                edgeToUse.pcurves.push(pc);
              }
            }
          }
          if (!edgesOnB.has(faceB)) edgesOnB.set(faceB, []);
          addEdgeIfNotDuplicate(edgesOnB.get(faceB)!, edgeToUse);
        }
      }
    }
  }

  // ── Stage 3: Split faces and classify ──
  const allFacesA: { face: Face; classification: 'inside' | 'outside' | 'on' }[] = [];
  const allFacesB: { face: Face; classification: 'inside' | 'outside' | 'on' }[] = [];

  // Process faces of A
  for (const faceA of facesOfA) {
    const cpInfo = coplanarA.get(faceA);
    if (cpInfo && !cpInfo.sameNormal) {
      // Opposite-normal coplanar: special handling (no volume overlap)
      handleOppositeNormalCoplanar(faceA, cpInfo.partner, op, a, b, allFacesA, true);
      continue;
    }

    const intEdges = edgesOnA.get(faceA);
    if (intEdges && intEdges.length > 0) {
      const subFaces = builderFace(faceA, intEdges);
      for (const sf of subFaces) {
        const cls = cpInfo
          ? classifyCoplanarSubFace(sf, cpInfo.partner, b, (faceA.surface as PlaneSurface).plane, op, true, intEdges)
          : classifySubFace(sf, b, intEdges);
        allFacesA.push({ face: sf, classification: cls });
      }
    } else if (cpInfo && cpInfo.sameNormal) {
      // Full overlap (no splitting edges): entire face is the overlap region
      const cls = op === 'union' ? 'on' as const : 'inside' as const;
      allFacesA.push({ face: faceA, classification: cls });
    } else {
      allFacesA.push({ face: faceA, classification: classifyFace(faceA, b) });
    }
  }
  // Process faces of B
  for (const faceB of facesOfB) {
    const cpInfo = coplanarB.get(faceB);
    if (cpInfo && !cpInfo.sameNormal) {
      handleOppositeNormalCoplanar(faceB, cpInfo.partner, op, a, b, allFacesB, false);
      continue;
    }

    const intEdges = edgesOnB.get(faceB);
    if (intEdges && intEdges.length > 0) {
      const subFaces = builderFace(faceB, intEdges);
      for (const sf of subFaces) {
        const cls = cpInfo
          ? classifyCoplanarSubFace(sf, cpInfo.partner, a, (faceB.surface as PlaneSurface).plane, op, false, intEdges)
          : classifySubFace(sf, a, intEdges);
        allFacesB.push({ face: sf, classification: cls });
      }
    } else if (cpInfo && cpInfo.sameNormal) {
      // Full overlap: B-side → 'on' (A's copy handles it)
      allFacesB.push({ face: faceB, classification: 'on' });
    } else {
      allFacesB.push({ face: faceB, classification: classifyFace(faceB, a) });
    }
  }

  // ── Stage 4: Select faces per operation rules ──

  const selectedFaces: Face[] = [];
  const facesFromA: Face[] = [];
  const facesFromB: Face[] = [];

  for (const { face, classification } of allFacesA) {
    let keep = false;
    if (op === 'union' && (classification === 'outside' || classification === 'on')) keep = true;
    if (op === 'subtract' && (classification === 'outside' || classification === 'on')) keep = true;
    if (op === 'intersect' && classification === 'inside') keep = true;

    if (keep) {
      selectedFaces.push(face);
      facesFromA.push(face);
    }
  }

  for (const { face, classification } of allFacesB) {
    let keep = false;
    if (op === 'union' && classification === 'outside') keep = true;
    if (op === 'subtract' && classification === 'inside') keep = true;
    if (op === 'intersect' && classification === 'inside') keep = true;

    if (keep) {
      if (op === 'subtract') {
        const flipped = flipFace(face);
        if (flipped.success) {
          selectedFaces.push(flipped.result!);
          facesFromB.push(flipped.result!);
        }
      } else {
        selectedFaces.push(face);
        facesFromB.push(face);
      }
    }
  }

  console.log(`[DBG] ${op}: selA=${facesFromA.length} selB=${facesFromB.length} clsA=[${allFacesA.map(f=>f.classification)}] clsB=[${allFacesB.map(f=>f.classification)}]`);
  if (selectedFaces.length < 2) {
    return failure(`Boolean ${op} produced only ${selectedFaces.length} faces (A:${allFacesA.length} [${allFacesA.map(f=>f.classification)}], B:${allFacesB.length} [${allFacesB.map(f=>f.classification)}]) — result is degenerate`);
  }

  // ── Stage 5: Orient faces, stitch edges, and assemble ──

  // Following OCCT BOPTools_AlgoTools::OrientFacesOnShell + ShapeFix_Shell::GetShells:
  // Ensure all faces have consistent edge winding. Faces from different source solids
  // may have inconsistent orientations at shared intersection edges.
  const oriented = orientFacesOnShell(selectedFaces);
  const stitched = stitchEdges(oriented);

  const shellResult = makeShell(stitched);
  if (!shellResult.success) return failure(`Shell creation failed: ${shellResult.error}`);

  const solidResult = makeSolid(shellResult.result!);
  if (!solidResult.success) {
    // Diagnose boundary edges
    const TOL7 = 1e-7;
    const rr = (n: number) => Math.round(n / TOL7) * TOL7;
    const eu = new Map<string, string[]>();
    for (const f of stitched) {
      for (const oe of f.outerWire.edges) {
        if (oe.edge.degenerate) continue;
        const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
        const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
        const k1 = `${rr(s.x)},${rr(s.y)},${rr(s.z)}`;
        const k2 = `${rr(e.x)},${rr(e.y)},${rr(e.z)}`;
        const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        const dir = oe.edge.curve.isClosed ? `${k1}|${oe.forward?'F':'R'}` : `${k1}->${k2}`;
        if (!eu.has(key)) eu.set(key, []);
        eu.get(key)!.push(dir);
      }
    }
    const bad: string[] = [];
    for (const [key, dirs] of eu) {
      if (dirs.length !== 2 || dirs[0] === dirs[1])
        bad.push(`${key} x${dirs.length} ${dirs.join(' / ')}`);
    }
    // Quick edge diagnostic
    const T = 1e-7;
    const R = (n: number) => Math.round(n / T) * T;
    const em = new Map<string, string[]>();
    for (const f of stitched) {
      for (const oe of f.outerWire.edges) {
        if (oe.edge.degenerate) continue;
        const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
        const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
        const k1 = `${R(s.x)},${R(s.y)},${R(s.z)}`;
        const k2 = `${R(e.x)},${R(e.y)},${R(e.z)}`;
        const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        const dir = `${k1}->${k2}`;
        if (!em.has(key)) em.set(key, []);
        em.get(key)!.push(dir);
      }
      for (const iw of f.innerWires) {
        for (const oe of iw.edges) {
          if (oe.edge.degenerate) continue;
          const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
          const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
          const k1 = `${R(s.x)},${R(s.y)},${R(s.z)}`;
          const k2 = `${R(e.x)},${R(e.y)},${R(e.z)}`;
          const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
          const dir = `${k1}->${k2}`;
          if (!em.has(key)) em.set(key, []);
          em.get(key)!.push(dir);
        }
      }
    }
    for (const [key, dirs] of em) {
      if (dirs.length !== 2 || dirs[0] === dirs[1])
        console.log(`[BAD] ${key} x${dirs.length} [${dirs.join(' | ')}]`);
    }
    console.log(`[STITCH] iw=${stitched.map(f=>f.innerWires.length)}`);
    return failure(`Solid creation failed (shell not closed): ${solidResult.error}`);
  }

  return success({
    solid: solidResult.result!,
    facesFromA,
    facesFromB,
  });
}

// ═══════════════════════════════════════════════════════
// OPPOSITE-NORMAL COPLANAR HANDLING
// ═══════════════════════════════════════════════════════

/**
 * Handle opposite-normal coplanar faces. These share a surface plane but
 * point in opposite directions — the face pair is internal (for union)
 * or irrelevant (for subtract, since there's no volume overlap).
 */
function handleOppositeNormalCoplanar(
  face: Face,
  partner: Face,
  op: BooleanOp,
  solidA: Solid,
  solidB: Solid,
  allFaces: { face: Face; classification: 'inside' | 'outside' | 'on' }[],
  isSideA: boolean,
): void {
  const pl = (face.surface as PlaneSurface).plane;
  const polyFace = faceToPolygon2D(face, pl);
  const polyPartner = faceToPolygon2D(partner, pl);
  const intersection = clipPolygon(polyFace, polyPartner);
  const intersectionArea = Math.abs(polygonArea2D(intersection));

  if (intersectionArea < 1e-8) {
    // No overlap — classify normally
    const otherSolid = isSideA ? solidB : solidA;
    allFaces.push({ face, classification: classifyFace(face, otherSolid) });
    return;
  }

  if (op === 'union') {
    // Internal face → discard
  } else if (op === 'subtract') {
    if (isSideA) {
      allFaces.push({ face, classification: 'outside' });
    }
    // B-side opposite-normal → discard
  } else { // intersect
    // Opposite normals with overlap but no volume → discard
  }
}

// ═══════════════════════════════════════════════════════
// EDGE STITCHING
// ═══════════════════════════════════════════════════════

const STITCH_TOL = 1e-6;

/**
 * Pre-split a face's boundary edges at a set of global vertices.
 *
 * Following OCCT BOPAlgo_PaveFiller::MakeSplitEdges: boundary edges are split
 * in a shared vertex pool BEFORE face reconstruction. Adjacent faces of the
 * same solid automatically share the same split edges because they use the
 * same canonical vertex objects from the pool.
 *
 * This replaces the old post-hoc "stitcher" approach.
 */
function preSplitFaceAtVertices(face: Face, vertices: Point3D[]): Face {
  if (vertices.length === 0) return face;

  const splitOEs: OrientedEdge[] = [];
  let anySplit = false;

  for (const oe of face.outerWire.edges) {
    // Skip degenerate edges — they can't be split
    if (oe.edge.degenerate) {
      splitOEs.push(oe);
      continue;
    }
    // Only split line edges at vertices
    if (oe.edge.curve.type !== 'line3d') {
      splitOEs.push(oe);
      continue;
    }

    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq < STITCH_TOL * STITCH_TOL) {
      splitOEs.push(oe);
      continue;
    }

    // Find vertices that lie strictly between start and end on this edge
    const intermediates: { t: number; pt: Point3D }[] = [];
    for (const v of vertices) {
      if (distance(v, start) < STITCH_TOL || distance(v, end) < STITCH_TOL) continue;

      const vx = v.x - start.x, vy = v.y - start.y, vz = v.z - start.z;
      const t = (vx * dx + vy * dy + vz * dz) / lenSq;
      if (t < STITCH_TOL || t > 1 - STITCH_TOL) continue;

      const px = start.x + t * dx - v.x;
      const py = start.y + t * dy - v.y;
      const pz = start.z + t * dz - v.z;
      if (Math.sqrt(px * px + py * py + pz * pz) > STITCH_TOL) continue;

      intermediates.push({ t, pt: v });
    }

    if (intermediates.length === 0) {
      // Snap endpoints to canonical vertices (OCCT BRepBuilderAPI_Sewing).
      // Different faces may create edges for the same geometric line via
      // different FFI computations, producing tiny coordinate differences.
      const snapStart = snapToCanonical(start, vertices);
      const snapEnd = snapToCanonical(end, vertices);
      if (snapStart !== start || snapEnd !== end) {
        const lr = makeLine3D(snapStart, snapEnd);
        if (lr.success) {
          const er = makeEdgeFromCurve(lr.result!);
          if (er.success) {
            splitOEs.push(orientEdge(er.result!, true));
            anySplit = true;
            continue;
          }
        }
      }
      splitOEs.push(oe);
      continue;
    }

    anySplit = true;
    intermediates.sort((a, b) => a.t - b.t);

    // Create sub-edges using canonical vertex coordinates
    let current = snapToCanonical(start, vertices);
    for (const inter of intermediates) {
      const lineRes = makeLine3D(current, inter.pt);
      if (lineRes.success) {
        const edgeRes = makeEdgeFromCurve(lineRes.result!);
        if (edgeRes.success) splitOEs.push(orientEdge(edgeRes.result!, true));
      }
      current = inter.pt;
    }
    const lineRes = makeLine3D(current, snapToCanonical(end, vertices));
    if (lineRes.success) {
      const edgeRes = makeEdgeFromCurve(lineRes.result!);
      if (edgeRes.success) splitOEs.push(orientEdge(edgeRes.result!, true));
    }
  }

  if (!anySplit) return face;

  const wireRes = makeWire(splitOEs);
  if (!wireRes.success) return face;

  const faceRes = makeFace(face.surface, wireRes.result!, [...face.innerWires], face.forward);
  return faceRes.success ? faceRes.result! : face;
}

/**
 * Minimal edge stitching pass. After OCCT-style pre-splitting, most edges
 * already match. This handles any remaining cases (e.g., coplanar handler
 * output faces whose edges need to match adjacent split faces).
 */
function stitchEdges(faces: Face[]): Face[] {
  // Collect canonical vertex pool from all faces
  const allVerts: Point3D[] = [];
  for (const face of faces) {
    for (const oe of face.outerWire.edges) {
      pushUnique(allVerts, edgeStartPoint(oe.edge));
      pushUnique(allVerts, edgeEndPoint(oe.edge));
    }
    for (const iw of face.innerWires) {
      for (const oe of iw.edges) {
        pushUnique(allVerts, edgeStartPoint(oe.edge));
        pushUnique(allVerts, edgeEndPoint(oe.edge));
      }
    }
  }

  // Re-use the pre-split logic: collect all vertices from all selected faces,
  // then split any remaining unsplit edges at those vertices.
  const result: Face[] = [];
  for (const face of faces) {
    const rebuilt = preSplitFaceAtVertices(face, allVerts);
    result.push(rebuilt);
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// SHELL ORIENTATION (OCCT OrientFacesOnShell)
// ═══════════════════════════════════════════════════════

/**
 * Orient faces so shared edges are traversed in opposite directions.
 *
 * Following OCCT BOPTools_AlgoTools::OrientFacesOnShell (line 353-480)
 * and ShapeFix_Shell::GetShells (line 301-610):
 *
 * For each edge shared by 2 faces, if the edge has the SAME orientation
 * in both faces (both forward or both reversed), one face is flipped.
 * This greedy algorithm processes faces one at a time, flipping each
 * to maintain consistent edge winding with already-processed neighbors.
 */
/**
 * Orient faces so shared edges are traversed in opposite directions.
 *
 * Following OCCT BOPTools_AlgoTools::OrientFacesOnShell (line 353-480)
 * and ShapeFix_Shell::GetShells (line 301-610):
 *
 * BFS from face 0: for each unprocessed neighbor, check if the shared
 * edge has the same directed key in both faces. If so, flip the neighbor.
 */
function orientFacesOnShell(faces: Face[]): Face[] {
  if (faces.length <= 1) return faces;

  const TOL7 = 1e-7;
  const round = (n: number) => Math.round(n / TOL7) * TOL7;

  // Helper: compute edge keys for a face (outer + inner wires)
  // For closed circles, use geometry-based keys (center+radius+normal) to match
  // different edge objects at the same geometric location.
  function edgeKey(oe: { edge: Edge; forward: boolean }): { key: string; directed: string } | null {
    if (oe.edge.degenerate) return null;
    const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    const k1 = `${round(s.x)},${round(s.y)},${round(s.z)}`;
    const k2 = `${round(e.x)},${round(e.y)},${round(e.z)}`;

    const curve = oe.edge.curve;
    if (curve.isClosed && (curve.type === 'circle3d' || curve.type === 'arc3d') && 'plane' in curve) {
      const c = curve as any;
      const ctr = c.plane.origin;
      const n = c.plane.normal;
      const geoKey = `C:${round(ctr.x)},${round(ctr.y)},${round(ctr.z)}|r=${round(c.radius)}|n=${round(n.x)},${round(n.y)},${round(n.z)}`;
      return { key: geoKey, directed: `${geoKey}|${oe.forward ? 'F' : 'R'}` };
    }
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    const directed = curve.isClosed ? `${k1}|${oe.forward ? 'F' : 'R'}` : `${k1}->${k2}`;
    return { key, directed };
  }

  function faceEdgeKeys(face: Face): { key: string; directed: string }[] {
    const result: { key: string; directed: string }[] = [];
    for (const oe of face.outerWire.edges) {
      const ek = edgeKey(oe);
      if (ek) result.push(ek);
    }
    for (const iw of face.innerWires) {
      for (const oe of iw.edges) {
        const ek = edgeKey(oe);
        if (ek) result.push(ek);
      }
    }
    return result;
  }

  // Build initial undirected edge → face index map
  const edgeToFaces = new Map<string, number[]>();
  for (let fi = 0; fi < faces.length; fi++) {
    for (const { key } of faceEdgeKeys(faces[fi])) {
      if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
      const list = edgeToFaces.get(key)!;
      if (!list.includes(fi)) list.push(fi);
    }
  }

  const result = [...faces];
  const processed = new Set<number>();
  const queue: number[] = [0];
  processed.add(0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKeys = faceEdgeKeys(result[current]);

    for (const { key, directed } of currentKeys) {
      const neighbors = edgeToFaces.get(key);
      if (!neighbors) continue;

      for (const ni of neighbors) {
        if (ni === current || processed.has(ni)) continue;

        // Find the directed key for this edge in the neighbor face
        const neighborKeys = faceEdgeKeys(result[ni]);
        const neighborEdge = neighborKeys.find(nk => nk.key === key);
        if (!neighborEdge) continue;

        // If same directed key → same winding → flip neighbor
        if (directed === neighborEdge.directed) {
          const flippedFace = flipFace(result[ni]);
          if (flippedFace.success) {
            result[ni] = flippedFace.result!;
          }
        }

        processed.add(ni);
        queue.push(ni);
      }
    }
  }

  return result;
}

/** Snap a point to the nearest canonical vertex within tolerance. */
function snapToCanonical(pt: Point3D, canonicalVerts: Point3D[]): Point3D {
  for (const v of canonicalVerts) {
    if (distance(pt, v) < STITCH_TOL) return v;
  }
  return pt;
}

function pushUnique(arr: Point3D[], pt: Point3D): void {
  for (const existing of arr) {
    if (distance(existing, pt) < STITCH_TOL) return;
  }
  arr.push(pt);
}

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

export function booleanUnion(a: Solid, b: Solid): OperationResult<BooleanResult> {
  return booleanOperation(a, b, 'union');
}

export function booleanSubtract(a: Solid, b: Solid): OperationResult<BooleanResult> {
  return booleanOperation(a, b, 'subtract');
}

export function booleanIntersect(a: Solid, b: Solid): OperationResult<BooleanResult> {
  return booleanOperation(a, b, 'intersect');
}
