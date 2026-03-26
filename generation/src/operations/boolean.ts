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
  sketchToWorld,
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
import { Wire, OrientedEdge, orientEdge, makeWire, makeWireFromEdges } from '../topology/wire';
import { Face, Surface, makeFace, makePlanarFace } from '../topology/face';
import { Shell, makeShell, shellFaces } from '../topology/shell';
import { Solid, makeSolid, solidVolume } from '../topology/solid';
import { PlaneSurface, makePlaneSurface } from '../surfaces';
import { evaluateSphericalSurface, projectToSphericalSurface } from '../surfaces/spherical-surface';
import { evaluateCylindricalSurface, projectToCylindricalSurface } from '../surfaces/cylindrical-surface';
import { evaluateConicalSurface, projectToConicalSurface } from '../surfaces/conical-surface';
import { pointInSolid } from './point-in-solid';
import { intersectFaceFace } from './face-face-intersection';
import { builderFace } from './builder-face';

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

function polygonDifference(subject: Pt2[], clip: Pt2[]): Pt2[][] {
  if (subject.length < 3 || clip.length < 3) return [subject];

  let fragments: Pt2[][] = [subject];

  for (let i = 0; i < clip.length; i++) {
    const edgeStart = clip[i];
    const edgeEnd = clip[(i + 1) % clip.length];

    const nextFragments: Pt2[][] = [];
    for (const frag of fragments) {
      const [inside, outside] = splitPolygonByLine(frag, edgeStart, edgeEnd);
      if (inside.length >= 3) nextFragments.push(inside);
      if (outside.length >= 3) nextFragments.push(outside);
    }
    fragments = nextFragments;
  }

  const result: Pt2[][] = [];
  for (const frag of fragments) {
    const cx = frag.reduce((s, p) => s + p.x, 0) / frag.length;
    const cy = frag.reduce((s, p) => s + p.y, 0) / frag.length;
    if (!pointInPolygon2DSimple({ x: cx, y: cy }, clip)) {
      result.push(frag);
    }
  }

  return result;
}

function splitPolygonByLine(poly: Pt2[], lineStart: Pt2, lineEnd: Pt2): [Pt2[], Pt2[]] {
  const inside: Pt2[] = [];
  const outside: Pt2[] = [];

  for (let j = 0; j < poly.length; j++) {
    const current = poly[j];
    const previous = poly[(j + poly.length - 1) % poly.length];

    const currInside = isInsideEdge(current, lineStart, lineEnd);
    const prevInside = isInsideEdge(previous, lineStart, lineEnd);

    if (currInside) {
      if (!prevInside) {
        const inter = lineIntersect2D(previous, current, lineStart, lineEnd);
        if (inter) { inside.push(inter); outside.push(inter); }
      }
      inside.push(current);
    } else {
      if (prevInside) {
        const inter = lineIntersect2D(previous, current, lineStart, lineEnd);
        if (inter) { inside.push(inter); outside.push(inter); }
      }
      outside.push(current);
    }
  }

  return [inside, outside];
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
// FACE UTILITIES
// ═══════════════════════════════════════════════════════

/**
 * Check if an intersection edge lies on a face's boundary (within tolerance).
 * Edges on the boundary are redundant for BuilderFace — the face boundary
 * already provides that constraint. Adding them causes duplicate loops.
 */
function edgeLiesOnFaceBoundary(edge: Edge, face: Face): boolean {
  const eStart = edgeStartPoint(edge);
  const eEnd = edgeEndPoint(edge);
  const eMid = point3d((eStart.x + eEnd.x) / 2, (eStart.y + eEnd.y) / 2, (eStart.z + eEnd.z) / 2);
  const tol = 1e-5;

  for (const oe of face.outerWire.edges) {
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
    if (Math.sqrt(px * px + py * py + pz * pz) < tol) return true;
  }
  return false;
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

function faceIsCW(face: Face, pl: Plane): boolean {
  const verts = faceToPolygon2DRaw(face, pl);
  return polygonArea2D(verts) < 0;
}

function polygonToFace(poly: Pt2[], pl: Plane, sourceSurface?: PlaneSurface): OperationResult<Face> {
  if (poly.length < 3) return failure('Polygon has fewer than 3 vertices');

  const cleaned: Pt2[] = [poly[0]];
  for (let i = 1; i < poly.length; i++) {
    const dx = poly[i].x - cleaned[cleaned.length - 1].x;
    const dy = poly[i].y - cleaned[cleaned.length - 1].y;
    if (Math.sqrt(dx * dx + dy * dy) > 1e-8) {
      cleaned.push(poly[i]);
    }
  }
  if (cleaned.length >= 2) {
    const dx = cleaned[0].x - cleaned[cleaned.length - 1].x;
    const dy = cleaned[0].y - cleaned[cleaned.length - 1].y;
    if (Math.sqrt(dx * dx + dy * dy) < 1e-8) {
      cleaned.pop();
    }
  }

  if (cleaned.length < 3) return failure('Cleaned polygon has fewer than 3 vertices');

  const pts3d = cleaned.map(p => sketchToWorld(pl, p));
  const edges: Edge[] = [];
  for (let i = 0; i < pts3d.length; i++) {
    const next = (i + 1) % pts3d.length;
    const lineResult = makeLine3D(pts3d[i], pts3d[next]);
    if (!lineResult.success) continue;
    const edgeResult = makeEdgeFromCurve(lineResult.result!);
    if (!edgeResult.success) continue;
    edges.push(edgeResult.result!);
  }

  if (edges.length < 3) return failure('Failed to create enough edges for polygon face');

  const wireResult = makeWireFromEdges(edges);
  if (!wireResult.success) return failure(`Wire creation failed: ${wireResult.error}`);

  if (sourceSurface) {
    return makeFace(sourceSurface, wireResult.result!);
  }
  return makePlanarFace(wireResult.result!);
}

/**
 * Flip a face's normal by reversing the wire winding.
 */
function flipFace(face: Face): OperationResult<Face> {
  const reversedEdges: OrientedEdge[] = [];
  for (let i = face.outerWire.edges.length - 1; i >= 0; i--) {
    const oe = face.outerWire.edges[i];
    reversedEdges.push(orientEdge(oe.edge, !oe.forward));
  }

  const wireResult = makeWire(reversedEdges);
  if (!wireResult.success) return failure(`Failed to reverse wire: ${wireResult.error}`);

  if (face.surface.type === 'plane') {
    const p = face.surface.plane;
    const flippedPlane = plane(p.origin, vec3d(-p.normal.x, -p.normal.y, -p.normal.z), p.xAxis);
    const flippedSurface = makePlaneSurface(flippedPlane);
    return makeFace(flippedSurface, wireResult.result!);
  }

  return makeFace(face.surface, wireResult.result!, [], !face.forward);
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

function coplanarSameNormal(faceA: Face, faceB: Face): boolean {
  if (faceA.surface.type !== 'plane' || faceB.surface.type !== 'plane') return false;
  return dot(faceA.surface.plane.normal, faceB.surface.plane.normal) > 0;
}

/** Evaluate a surface at (u,v). */
function evalSurfaceLocal(s: Surface, u: number, v: number): Point3D | null {
  switch (s.type) {
    case 'sphere': return evaluateSphericalSurface(s, u, v);
    case 'cylinder': return evaluateCylindricalSurface(s, u, v);
    case 'cone': return evaluateConicalSurface(s, u, v);
    default: return null;
  }
}

/** Project a 3D point to surface UV. */
function projectToSurfaceLocal(s: Surface, pt: Point3D): { u: number; v: number } | null {
  switch (s.type) {
    case 'sphere': return projectToSphericalSurface(s, pt);
    case 'cylinder': return projectToCylindricalSurface(s, pt);
    case 'cone': return projectToConicalSurface(s, pt);
    default: return null;
  }
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
      const iStart = edgeStartPoint(ie);
      const iEnd = edgeEndPoint(ie);
      // Check if eMid lies on segment iStart→iEnd
      const dx = iEnd.x - iStart.x, dy = iEnd.y - iStart.y, dz = iEnd.z - iStart.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq < 1e-12) return false;
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
    const wStart = oe.forward ? eStart : eEnd;
    const wEnd = oe.forward ? eEnd : eStart;
    const mid = point3d((wStart.x + wEnd.x) / 2, (wStart.y + wEnd.y) / 2, (wStart.z + wEnd.z) / 2);

    // Edge direction in wire traversal order
    const edgeDir = vec3d(wEnd.x - wStart.x, wEnd.y - wStart.y, wEnd.z - wStart.z);

    // Face normal
    let faceNormal: { x: number; y: number; z: number } | null = null;
    if (face.surface.type === 'plane') {
      faceNormal = face.surface.plane.normal;
    } else if (face.surface.type === 'sphere') {
      const s = face.surface;
      const dx = mid.x - s.center.x, dy = mid.y - s.center.y, dz = mid.z - s.center.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 1e-10) faceNormal = { x: dx / len, y: dy / len, z: dz / len };
    } else if (face.surface.type === 'cylinder') {
      const s = face.surface;
      const rel = { x: mid.x - s.axis.origin.x, y: mid.y - s.axis.origin.y, z: mid.z - s.axis.origin.z };
      const axComp = rel.x * s.axis.direction.x + rel.y * s.axis.direction.y + rel.z * s.axis.direction.z;
      const radial = { x: rel.x - axComp * s.axis.direction.x, y: rel.y - axComp * s.axis.direction.y, z: rel.z - axComp * s.axis.direction.z };
      const rLen = Math.sqrt(radial.x ** 2 + radial.y ** 2 + radial.z ** 2);
      if (rLen > 1e-10) faceNormal = { x: radial.x / rLen, y: radial.y / rLen, z: radial.z / rLen };
    }
    if (!faceNormal) continue;

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

  // Phase 2: Fallback to standard classifyFace
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
  let normal: { x: number; y: number; z: number } | null = null;
  if (face.surface.type === 'plane') {
    normal = face.surface.plane.normal;
  } else if (face.surface.type === 'sphere') {
    const s = face.surface;
    const dx = centroid.x - s.center.x, dy = centroid.y - s.center.y, dz = centroid.z - s.center.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-10) normal = { x: dx / len, y: dy / len, z: dz / len };
  } else if (face.surface.type === 'cylinder') {
    const s = face.surface;
    const rel = { x: centroid.x - s.axis.origin.x, y: centroid.y - s.axis.origin.y, z: centroid.z - s.axis.origin.z };
    const axComp = rel.x * s.axis.direction.x + rel.y * s.axis.direction.y + rel.z * s.axis.direction.z;
    const radial = { x: rel.x - axComp * s.axis.direction.x, y: rel.y - axComp * s.axis.direction.y, z: rel.z - axComp * s.axis.direction.z };
    const rLen = Math.sqrt(radial.x ** 2 + radial.y ** 2 + radial.z ** 2);
    if (rLen > 1e-10) normal = { x: radial.x / rLen, y: radial.y / rLen, z: radial.z / rLen };
  }

  if (normal) {
    const nudged = point3d(
      centroid.x + normal.x * 1e-6,
      centroid.y + normal.y * 1e-6,
      centroid.z + normal.z * 1e-6,
    );
    const result = pointInSolid(nudged, otherSolid);
    if (result !== 'on') return result;
  }

  return pointInSolid(centroid, otherSolid);
}

function faceOutwardPointsInto(face: Face, ownSolid: Solid, otherSolid: Solid): boolean {
  if (face.surface.type !== 'plane') return false;

  const wire = face.outerWire;
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const oe of wire.edges) {
    const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    cx += pt.x; cy += pt.y; cz += pt.z; n++;
  }
  if (n === 0) return false;

  const normal = face.surface.plane.normal;
  const nudgePos = point3d(
    cx / n + normal.x * NUDGE_EPS,
    cy / n + normal.y * NUDGE_EPS,
    cz / n + normal.z * NUDGE_EPS,
  );
  const nudgeNeg = point3d(
    cx / n - normal.x * NUDGE_EPS,
    cy / n - normal.y * NUDGE_EPS,
    cz / n - normal.z * NUDGE_EPS,
  );

  const posInOwn = pointInSolid(nudgePos, ownSolid);
  const outwardIsPositive = posInOwn !== 'inside';
  const outwardPt = outwardIsPositive ? nudgePos : nudgeNeg;

  return pointInSolid(outwardPt, otherSolid) === 'inside';
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

  // ── Stage 2: FFI for all non-coplanar face pairs ──
  // Collect intersection edges for each face.
  const edgesOnA: Map<Face, Edge[]> = new Map();
  const edgesOnB: Map<Face, Edge[]> = new Map();
  const coplanarA: Map<Face, Face> = new Map(); // A face → first coplanar B face
  const coplanarB: Map<Face, Face> = new Map();

  for (const faceA of facesOfA) {
    for (const faceB of facesOfB) {
      if (areFacesCoplanar(faceA, faceB)) {
        if (!coplanarA.has(faceA)) coplanarA.set(faceA, faceB);
        if (!coplanarB.has(faceB)) coplanarB.set(faceB, faceA);
        continue;
      }

      // AABB pre-filter: skip face pairs whose bboxes don't overlap
      const bboxFA = boundingBoxFromFace(faceA);
      const bboxFB = boundingBoxFromFace(faceB);
      if (!bboxIntersects(bboxFA, bboxFB)) continue;

      // FFI: compute intersection edges
      const ffiResult = intersectFaceFace(faceA, faceB);
      if (!ffiResult || ffiResult.edges.length === 0) continue;

      // Following OCCT BOPAlgo_PaveFiller: intersection edges are added to
      // each face's FaceInfo. But coplanar faces are handled separately by
      // the coplanar path — only add edges to the non-coplanar face.
      const aIsCoplanar = coplanarA.has(faceA);
      const bIsCoplanar = coplanarB.has(faceB);

      if (aIsCoplanar && bIsCoplanar) continue;

      for (const ffiEdge of ffiResult.edges) {
        const e = ffiEdge.edge;
        if (!aIsCoplanar) {
          // Skip edges that lie on faceA's boundary (redundant for coplanar-adjacent pairs)
          if (!bIsCoplanar || !edgeLiesOnFaceBoundary(e, faceA)) {
            if (!edgesOnA.has(faceA)) edgesOnA.set(faceA, []);
            edgesOnA.get(faceA)!.push(e);
          }
        }
        if (!bIsCoplanar) {
          if (!aIsCoplanar || !edgeLiesOnFaceBoundary(e, faceB)) {
            if (!edgesOnB.has(faceB)) edgesOnB.set(faceB, []);
            edgesOnB.get(faceB)!.push(e);
          }
        }
      }
    }
  }

  // ── Stage 3: Split faces and classify ──

  const allFacesA: { face: Face; classification: 'inside' | 'outside' | 'on' }[] = [];
  const allFacesB: { face: Face; classification: 'inside' | 'outside' | 'on' }[] = [];

  // Process faces of A
  for (const faceA of facesOfA) {
    if (coplanarA.has(faceA)) {
      handleCoplanarFace(faceA, coplanarA.get(faceA)!, op, a, b, allFacesA);
      continue;
    }

    const intEdges = edgesOnA.get(faceA);
    if (intEdges && intEdges.length > 0) {
      const subFaces = builderFace(faceA, intEdges);
      for (const sf of subFaces) {
        allFacesA.push({ face: sf, classification: classifySubFace(sf, b, intEdges) });
      }
    } else {
      allFacesA.push({ face: faceA, classification: classifyFace(faceA, b) });
    }
  }

  // Process faces of B
  for (const faceB of facesOfB) {
    if (coplanarB.has(faceB)) {
      handleCoplanarFaceSideB(faceB, coplanarB.get(faceB)!, op, a, b, allFacesB);
      continue;
    }

    const intEdges = edgesOnB.get(faceB);
    if (intEdges && intEdges.length > 0) {
      const subFaces = builderFace(faceB, intEdges);
      for (const sf of subFaces) {
        allFacesB.push({ face: sf, classification: classifySubFace(sf, a, intEdges) });
      }
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

  if (selectedFaces.length < 2) {
    return failure(`Boolean ${op} produced only ${selectedFaces.length} faces (A:${allFacesA.length} [${allFacesA.map(f=>f.classification)}], B:${allFacesB.length} [${allFacesB.map(f=>f.classification)}]) — result is degenerate`);
  }

  // ── Stage 5: Stitch edges and assemble ──

  const stitched = stitchEdges(selectedFaces);

  // DEBUG: dump edge analysis before shell creation
  if (typeof process !== 'undefined' && process.env.BOOLEAN_DEBUG) {
    const round = (n: number) => Math.round(n / TOLERANCE) * TOLERANCE;
    const edgeUsage = new Map<string, string[]>();
    for (const face of stitched) {
      for (const oe of face.outerWire.edges) {
        const s = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
        const e = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
        const k1 = `${round(s.x)},${round(s.y)},${round(s.z)}`;
        const k2 = `${round(e.x)},${round(e.y)},${round(e.z)}`;
        const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        const dir = oe.edge.curve.isClosed ? `${k1}|${oe.forward?'F':'R'}` : `${k1}->${k2}`;
        if (!edgeUsage.has(key)) edgeUsage.set(key, []);
        edgeUsage.get(key)!.push(dir);
      }
    }
    let issues = 0;
    for (const [key, dirs] of edgeUsage) {
      if (dirs.length !== 2 || dirs[0] === dirs[1]) {
        console.log(`  EDGE_ISSUE: ${key} (${dirs.length}): ${dirs.join(' | ')}`);
        issues++;
      }
    }
    console.log(`  [debug] ${stitched.length} faces, ${edgeUsage.size} unique edges, ${issues} issues`);
    // Check inner wires
    let innerCount = 0;
    for (const f of stitched) innerCount += f.innerWires.length;
    console.log(`  [debug] inner wires: ${innerCount}`);
  }

  const shellResult = makeShell(stitched);
  if (!shellResult.success) return failure(`Shell creation failed: ${shellResult.error}`);

  const solidResult = makeSolid(shellResult.result!);
  if (!solidResult.success) {
    return failure(`Solid creation failed (shell not closed): ${solidResult.error}`);
  }

  return success({
    solid: solidResult.result!,
    facesFromA,
    facesFromB,
  });
}

// ═══════════════════════════════════════════════════════
// COPLANAR FACE HANDLING (2D polygon clipping)
// ═══════════════════════════════════════════════════════

/**
 * Handle a coplanar face from side A.
 * Uses 2D polygon clipping (Sutherland-Hodgman) — separate from the
 * FFI+BuilderFace path per OCCT's approach.
 */
function handleCoplanarFace(
  faceA: Face,
  faceB: Face,
  op: BooleanOp,
  solidA: Solid,
  solidB: Solid,
  allFaces: { face: Face; classification: 'inside' | 'outside' | 'on' }[],
): void {
  const planeA = (faceA.surface as PlaneSurface).plane;
  const polyA = faceToPolygon2D(faceA, planeA);
  const polyB = faceToPolygon2D(faceB, planeA);

  const intersection = clipPolygon(polyA, polyB);
  const intersectionArea = Math.abs(polygonArea2D(intersection));

  if (intersectionArea < 1e-8) {
    // No overlap — treat as non-coplanar
    allFaces.push({ face: faceA, classification: classifyFace(faceA, solidB) });
    return;
  }

  const sameNormal = coplanarSameNormal(faceA, faceB);

  if (op === 'union') {
    if (sameNormal) {
      if (faceOutwardPointsInto(faceA, solidA, solidB)) {
        const diffFragments = polygonDifference(polyA, polyB);
        const originalCW = faceIsCW(faceA, planeA);
        for (const frag of diffFragments) {
          const oriented = originalCW ? [...frag].reverse() : frag;
          const fragFace = polygonToFace(oriented, planeA, faceA.surface as PlaneSurface);
          if (fragFace.success) {
            allFaces.push({ face: fragFace.result!, classification: 'outside' });
          }
        }
      } else {
        allFaces.push({ face: faceA, classification: 'on' });
      }
    }
    // Opposite normal → discard (internal face)
  } else if (op === 'subtract') {
    if (sameNormal) {
      const diffFragments = polygonDifference(polyA, polyB);
      const originalCW = faceIsCW(faceA, planeA);
      for (const frag of diffFragments) {
        const oriented = originalCW ? [...frag].reverse() : frag;
        const fragFace = polygonToFace(oriented, planeA, faceA.surface as PlaneSurface);
        if (fragFace.success) {
          allFaces.push({ face: fragFace.result!, classification: 'outside' });
        }
      }
    } else {
      allFaces.push({ face: faceA, classification: 'outside' });
    }
  } else { // intersect
    if (sameNormal) {
      const originalCW = faceIsCW(faceA, planeA);
      const oriented = originalCW ? [...intersection].reverse() : intersection;
      const intFaceResult = polygonToFace(oriented, planeA, faceA.surface as PlaneSurface);
      if (intFaceResult.success) {
        allFaces.push({ face: intFaceResult.result!, classification: 'inside' });
      }
    }
  }
}

/**
 * Handle a coplanar face from side B.
 */
function handleCoplanarFaceSideB(
  faceB: Face,
  faceA: Face,
  op: BooleanOp,
  solidA: Solid,
  solidB: Solid,
  allFaces: { face: Face; classification: 'inside' | 'outside' | 'on' }[],
): void {
  const planeB = (faceB.surface as PlaneSurface).plane;
  const polyB = faceToPolygon2D(faceB, planeB);
  const polyA = faceToPolygon2D(faceA, planeB);
  const intersection = clipPolygon(polyB, polyA);
  const intersectionArea = Math.abs(polygonArea2D(intersection));

  if (intersectionArea < 1e-8) {
    allFaces.push({ face: faceB, classification: classifyFace(faceB, solidA) });
    return;
  }

  const sameNormal = coplanarSameNormal(faceA, faceB);

  if (op === 'union') {
    if (sameNormal) {
      const diffFragments = polygonDifference(polyB, polyA);
      const originalCWb = faceIsCW(faceB, planeB);
      for (const frag of diffFragments) {
        const oriented = originalCWb ? [...frag].reverse() : frag;
        const fragFace = polygonToFace(oriented, planeB, faceB.surface as PlaneSurface);
        if (fragFace.success) {
          allFaces.push({ face: fragFace.result!, classification: 'outside' });
        }
      }
    }
    // Opposite normal → discard
  } else if (op === 'subtract') {
    if (sameNormal) {
      // Same-normal coplanar: overlap removed by A's processing, nothing to add from B
    }
    // Opposite normal → discard
  } else { // intersect
    // Already handled by A's processing
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
      splitOEs.push(oe);
      continue;
    }

    anySplit = true;
    intermediates.sort((a, b) => a.t - b.t);

    // Create sub-edges using canonical vertex coordinates
    let current = start;
    for (const inter of intermediates) {
      const lineRes = makeLine3D(current, inter.pt);
      if (lineRes.success) {
        const edgeRes = makeEdgeFromCurve(lineRes.result!);
        if (edgeRes.success) splitOEs.push(orientEdge(edgeRes.result!, true));
      }
      current = inter.pt;
    }
    const lineRes = makeLine3D(current, end);
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
