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
import { makeLine3D } from '../geometry/line3d';
import { intersectPlanePlane, intersectPlaneSphere, intersectPlaneCylinder, intersectPlaneCone } from '../geometry/intersections3d';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire, makeWireFromEdges } from '../topology/wire';
import { Face, Surface, makeFace, makePlanarFace, faceOuterWire } from '../topology/face';
import { Shell, makeShell, shellIsClosed, shellFaces } from '../topology/shell';
import { Solid, makeSolid, solidVolume } from '../topology/solid';
import { PlaneSurface, makePlaneSurface } from '../surfaces';
import { pointInSolid } from './point-in-solid';
import { trimCurvedFaceByPlanes } from './trim-curved-face';
import { splitPlanarFaceByCircle } from './split-face-by-circle';

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
// 2D POLYGON UTILITIES
// ═══════════════════════════════════════════════════════

type Pt2 = { x: number; y: number };

/**
 * Sutherland-Hodgman polygon clipping.
 * Clips `subject` polygon by the half-planes defined by `clip` polygon edges.
 * Returns the intersection region (the part of subject inside clip).
 */
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

/** Is point on the left side of the directed edge (inside for CCW polygon)? */
function isInsideEdge(pt: Pt2, edgeStart: Pt2, edgeEnd: Pt2): boolean {
  return (edgeEnd.x - edgeStart.x) * (pt.y - edgeStart.y) -
         (edgeEnd.y - edgeStart.y) * (pt.x - edgeStart.x) >= -1e-10;
}

/** Line segment intersection in 2D */
function lineIntersect2D(a1: Pt2, a2: Pt2, b1: Pt2, b2: Pt2): Pt2 | null {
  const dax = a2.x - a1.x, day = a2.y - a1.y;
  const dbx = b2.x - b1.x, dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-15) return null;

  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

/** Signed area of a 2D polygon (positive = CCW) */
function polygonArea2D(poly: Pt2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return area / 2;
}

/**
 * Split polygon A by polygon B's edges. Returns fragments of A that are
 * OUTSIDE B (i.e., A \ B — the polygon difference).
 *
 * Works by progressively cutting A with each edge of B. After all cuts,
 * fragments whose centroids are outside B are collected.
 */
function polygonDifference(subject: Pt2[], clip: Pt2[]): Pt2[][] {
  if (subject.length < 3 || clip.length < 3) return [subject];

  // Start with the subject as a single fragment
  let fragments: Pt2[][] = [subject];

  // Cut by each edge of the clip polygon
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

  // Keep only fragments whose centroids are outside the clip polygon
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

/**
 * Split a polygon by a directed line (defined by two points).
 * Returns [insidePart, outsidePart] where "inside" is the left side
 * of the directed line.
 */
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

/** Simple 2D point-in-polygon (ray casting) */
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

/** Get 2D polygon vertices from a planar face in their original winding order */
function faceToPolygon2DRaw(face: Face, pl: Plane): Pt2[] {
  const verts: Pt2[] = [];
  for (const oe of face.outerWire.edges) {
    const pt3d = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    verts.push(worldToSketch(pl, pt3d));
  }
  return verts;
}

/** Get 2D polygon vertices, always CCW (for Sutherland-Hodgman) */
function faceToPolygon2D(face: Face, pl: Plane): Pt2[] {
  const verts = faceToPolygon2DRaw(face, pl);
  if (polygonArea2D(verts) < 0) {
    verts.reverse();
  }
  return verts;
}

/** Check if the original face winding is CW in the given plane */
function faceIsCW(face: Face, pl: Plane): boolean {
  const verts = faceToPolygon2DRaw(face, pl);
  return polygonArea2D(verts) < 0;
}

/** Create a planar face from a 2D polygon on a plane.
 *  If sourceSurface is provided, use it instead of inferring from points. */
function polygonToFace(poly: Pt2[], pl: Plane, sourceSurface?: PlaneSurface): OperationResult<Face> {
  if (poly.length < 3) return failure('Polygon has fewer than 3 vertices');

  // Remove near-duplicate consecutive vertices
  const cleaned: Pt2[] = [poly[0]];
  for (let i = 1; i < poly.length; i++) {
    const dx = poly[i].x - cleaned[cleaned.length - 1].x;
    const dy = poly[i].y - cleaned[cleaned.length - 1].y;
    if (Math.sqrt(dx * dx + dy * dy) > 1e-8) {
      cleaned.push(poly[i]);
    }
  }
  // Check last vs first
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
 * For planar faces: also negates the surface normal.
 * For curved faces: reverses wire winding; the tessellator uses wire winding
 * to determine normal direction via triangle orientation.
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

  // For curved surfaces, keep the surface as-is but with reversed wire and
  // forward=false to indicate the face normal is reversed.
  return makeFace(face.surface, wireResult.result!, [], !face.forward);
}

// ═══════════════════════════════════════════════════════
// PLANE-CURVED SURFACE HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Intersect a plane with a curved surface, returning circle info if applicable.
 * Only handles circle intersections (the common case for booleans).
 */
function intersectPlaneWithCurvedSurface(
  pl: Plane,
  surface: Surface,
): { type: 'circle'; center: Point3D; radius: number; normal: { x: number; y: number; z: number } } | null {
  if (surface.type === 'sphere') {
    const result = intersectPlaneSphere(pl, surface);
    if (!result.success || !result.result) return null;
    return result.result;
  }
  if (surface.type === 'cylinder') {
    const result = intersectPlaneCylinder(pl, surface);
    if (!result.success || !result.result || result.result.type !== 'circle') return null;
    return result.result;
  }
  if (surface.type === 'cone') {
    const result = intersectPlaneCone(pl, surface);
    if (!result.success || !result.result || result.result.type !== 'circle') return null;
    return result.result;
  }
  return null;
}

/**
 * Approximate a 3D circle as a 2D polygon on a given plane.
 * The circle is projected onto the plane's local 2D coordinate system.
 */
function circleToPolygon2D(
  facePlane: Plane,
  circleCenter: Point3D,
  circleRadius: number,
  circleNormal: { x: number; y: number; z: number },
  segments: number,
): Pt2[] {
  // Build a coordinate system for the circle
  const n = normalize(vec3d(circleNormal.x, circleNormal.y, circleNormal.z));
  let xRef = cross(n, vec3d(0, 0, 1));
  if (length(xRef) < 1e-6) xRef = cross(n, vec3d(1, 0, 0));
  const xAxis = normalize(xRef);
  const yAxis = normalize(cross(n, xAxis));

  const pts: Pt2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const c = Math.cos(angle), s = Math.sin(angle);
    const pt3d = point3d(
      circleCenter.x + circleRadius * (c * xAxis.x + s * yAxis.x),
      circleCenter.y + circleRadius * (c * xAxis.y + s * yAxis.y),
      circleCenter.z + circleRadius * (c * xAxis.z + s * yAxis.z),
    );
    pts.push(worldToSketch(facePlane, pt3d));
  }
  return pts;
}

// ═══════════════════════════════════════════════════════
// FACE CLASSIFICATION
// ═══════════════════════════════════════════════════════

const COPLANAR_TOL = 1e-5;
const NUDGE_EPS = 1e-4;

/** Check if two planar faces are coplanar */
function areFacesCoplanar(faceA: Face, faceB: Face): boolean {
  if (faceA.surface.type !== 'plane' || faceB.surface.type !== 'plane') return false;

  const nA = faceA.surface.plane.normal;
  const nB = faceB.surface.plane.normal;

  // Normals must be parallel (same or opposite direction)
  const dotN = dot(nA, nB);
  if (Math.abs(Math.abs(dotN) - 1) > COPLANAR_TOL) return false;

  // Planes must be the same (a point of A must lie on B's plane)
  const ptA = edgeStartPoint(faceA.outerWire.edges[0].edge);
  const dist = dot(
    vec3d(ptA.x - faceB.surface.plane.origin.x,
          ptA.y - faceB.surface.plane.origin.y,
          ptA.z - faceB.surface.plane.origin.z),
    nB,
  );
  return Math.abs(dist) < COPLANAR_TOL;
}

/** Check if two coplanar faces have same or opposite normals */
function coplanarSameNormal(faceA: Face, faceB: Face): boolean {
  if (faceA.surface.type !== 'plane' || faceB.surface.type !== 'plane') return false;
  return dot(faceA.surface.plane.normal, faceB.surface.plane.normal) > 0;
}

/**
 * Classify a face relative to another solid.
 * Uses ray casting from the face centroid.
 */
function classifyFace(face: Face, otherSolid: Solid): 'inside' | 'outside' | 'on' {
  const wire = face.outerWire;

  // Compute a representative interior point for classification.
  // Special cases:
  // - Faces with holes: use outer edge midpoint (centroid might fall in hole)
  // - Curved faces with closed-curve wire (circle boundary): use surface
  //   evaluate at wire interior, not the single wire vertex which sits on
  //   the boundary of both solids and classifies as 'on'.
  let centroid: Point3D;
  if (face.surface.type !== 'plane' && wire.edges.length > 0 && wire.edges[0].edge.curve.isClosed) {
    // Curved face with circle boundary: sample a point on the face interior.
    // The circle's vertex sits on the boundary of both solids ('on'), so we
    // need a point that's clearly on the face but away from edges.
    if (wire.edges.length === 1) {
      // Single circle boundary (sphere cap): nudge from circle center
      // toward the surface's geometric center.
      const circleEdge = wire.edges[0].edge;
      if (circleEdge.curve.type === 'circle3d') {
        const circlePlane = (circleEdge.curve as any).plane;
        const circleCenter = circlePlane.origin as Point3D;
        // Nudge toward the surface center
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
            // Circle center IS the surface center — nudge along circle normal
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
      // Multi-edge boundary (cylinder through-hole): use centroid of all vertices.
      // Seam line endpoints give points between the circles → inside the face.
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
    // Use midpoint of first outer edge
    const oe = wire.edges[0];
    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    centroid = point3d((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  } else {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const oe of wire.edges) {
      const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      cx += pt.x; cy += pt.y; cz += pt.z; n++;
    }
    if (n === 0) return 'outside';
    centroid = point3d(cx / n, cy / n, cz / n);
  }

  // Nudge slightly along face normal to avoid "on" classification
  let normal: { x: number; y: number; z: number } | null = null;
  if (face.surface.type === 'plane') {
    normal = face.surface.plane.normal;
  } else if (face.surface.type === 'sphere') {
    // For a sphere, the outward normal at the centroid points radially from center
    const s = face.surface;
    const dx = centroid.x - s.center.x, dy = centroid.y - s.center.y, dz = centroid.z - s.center.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-10) normal = { x: dx / len, y: dy / len, z: dz / len };
  } else if (face.surface.type === 'cylinder') {
    // Radial outward from axis
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

/**
 * Check if a face's outward normal (relative to its own solid) points into another solid.
 *
 * Used to detect interior coplanar faces: if face A's outward normal points into B,
 * then the coplanar overlap region is interior to A ∪ B and should be discarded.
 */
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

  // Determine outward direction: the one that goes outside the face's own solid
  const posInOwn = pointInSolid(nudgePos, ownSolid);
  const outwardIsPositive = posInOwn !== 'inside';
  const outwardPt = outwardIsPositive ? nudgePos : nudgeNeg;

  return pointInSolid(outwardPt, otherSolid) === 'inside';
}

// ═══════════════════════════════════════════════════════
// CORE BOOLEAN PIPELINE
// ═══════════════════════════════════════════════════════

/**
 * Perform a boolean operation on two solids.
 *
 * Pipeline:
 * 1. AABB overlap check
 * 2. Split faces along intersection curves (including coplanar handling)
 * 3. Classify face fragments
 * 4. Select faces per operation rules
 * 5. Assemble result solid
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

  // Stage 2+3: Split faces and classify
  // For each face, either keep it whole, split it, or handle coplanar overlap
  const allFacesA: { face: Face; classification: 'inside' | 'outside' | 'on' }[] = [];
  const allFacesB: { face: Face; classification: 'inside' | 'outside' | 'on' }[] = [];

  const facesOfA = shellFaces(a.outerShell);
  const facesOfB = shellFaces(b.outerShell);

  // Pre-compute shared circle edges for plane-curve intersections.
  // These edges are used by BOTH the planar face (as inner wire hole)
  // and the trimmed curved face (as outer wire boundary).
  // Key: "faceA_idx:faceB_idx", Value: shared Edge
  const sharedCircleEdges: Map<string, Edge> = new Map();

  // Process faces of A
  for (const faceA of facesOfA) {
    if (faceA.surface.type !== 'plane') {
      // Try to trim curved face by B's planar faces
      const trimResult = trimCurvedFaceByPlanes(faceA, b);
      if (trimResult.success && trimResult.result) {
        // Trimmed face — classify the trimmed version
        allFacesA.push({ face: trimResult.result, classification: classifyFace(trimResult.result, b) });
      } else {
        // No trimming possible — classify whole face
        allFacesA.push({ face: faceA, classification: classifyFace(faceA, b) });
      }
      continue;
    }

    // Check for coplanar faces with B
    let wasCoplanarSplit = false;
    for (const faceB of facesOfB) {
      if (faceB.surface.type !== 'plane') continue;
      if (!areFacesCoplanar(faceA, faceB)) continue;

      // Coplanar! Use 2D polygon clipping
      const planeA = faceA.surface.plane;
      const polyA = faceToPolygon2D(faceA, planeA);
      const polyB = faceToPolygon2D(faceB, planeA); // Project B onto A's plane

      const intersection = clipPolygon(polyA, polyB);
      const intersectionArea = Math.abs(polygonArea2D(intersection));

      if (intersectionArea < 1e-8) continue; // No overlap

      // Coplanar faces with overlap — handle per the 8-case table
      const sameNormal = coplanarSameNormal(faceA, faceB);

      if (op === 'union') {
        if (sameNormal) {
          // Check if the coplanar overlap is interior to the union
          // (A's outward normal points into B → overlap is internal)
          if (faceOutwardPointsInto(faceA, a, b)) {
            // Interior overlap — keep only A's non-overlapping portion
            const diffFragments = polygonDifference(polyA, polyB);
            const originalCW = faceIsCW(faceA, planeA);
            for (const frag of diffFragments) {
              const oriented = originalCW ? [...frag].reverse() : frag;
              const fragFace = polygonToFace(oriented, planeA, faceA.surface as PlaneSurface);
              if (fragFace.success) {
                allFacesA.push({ face: fragFace.result!, classification: 'outside' });
              }
            }
          } else {
            // Boundary overlap — keep A whole, B will keep only B\A
            allFacesA.push({ face: faceA, classification: 'on' });
          }
        } else {
          // "A on B, opposite normal" → discard both (internal face)
        }
      } else if (op === 'subtract') {
        if (sameNormal) {
          // Keep A's portion OUTSIDE B (A \ overlap)
          const diffFragments = polygonDifference(polyA, polyB);
          const originalCW = faceIsCW(faceA, planeA);
          for (const frag of diffFragments) {
            // Restore original winding direction
            const oriented = originalCW ? [...frag].reverse() : frag;
            const fragFace = polygonToFace(oriented, planeA, faceA.surface as PlaneSurface);
            if (fragFace.success) {
              allFacesA.push({ face: fragFace.result!, classification: 'outside' });
            }
          }
          // Also need the intersection region with flipped normal (it becomes
          // part of the cavity boundary). This is handled by B's inside faces.
        } else {
          // "A on B, opposite normal" → keep A
          allFacesA.push({ face: faceA, classification: 'outside' });
        }
      } else { // intersect
        if (sameNormal) {
          // Keep the intersection region, preserving original winding
          const originalCW = faceIsCW(faceA, planeA);
          const oriented = originalCW ? [...intersection].reverse() : intersection;
          const intFaceResult = polygonToFace(oriented, planeA, faceA.surface as PlaneSurface);
          if (intFaceResult.success) {
            allFacesA.push({ face: intFaceResult.result!, classification: 'inside' });
          }
        }
      }

      wasCoplanarSplit = true;
      break; // Only one coplanar pair per face
    }

    if (!wasCoplanarSplit) {
      // Not coplanar — check for transverse intersection
      // First, try circle-based splitting for curved face intersections.
      // This produces proper faces with circular holes instead of polygon approximations.
      let currentFace = faceA;
      const diskFaces: Face[] = [];

      if (currentFace.surface.type === 'plane') {
        const facePlane = currentFace.surface.plane;
        const aIdx = facesOfA.indexOf(faceA);
        // Deduplicate: multiple curved faces of the same solid can produce
        // the same intersection circle (e.g., two hemisphere faces of a sphere).
        // Track processed circles to avoid creating duplicate holes.
        const processedCircles: { center: Point3D; radius: number }[] = [];
        for (let bIdx = 0; bIdx < facesOfB.length; bIdx++) {
          const otherFace = facesOfB[bIdx];
          if (otherFace.surface.type === 'plane') continue;
          const circleInt = intersectPlaneWithCurvedSurface(facePlane, otherFace.surface);
          if (!circleInt) continue;
          // Check for duplicate circle (same center and radius)
          const isDup = processedCircles.some(pc =>
            distance(pc.center, circleInt.center) < STITCH_TOL &&
            Math.abs(pc.radius - circleInt.radius) < STITCH_TOL
          );
          if (isDup) {
            // Still record the shared edge for this face index
            // Find the existing edge from a previous split with the same circle
            for (const [existingKey, existingEdge] of Array.from(sharedCircleEdges.entries())) {
              if (existingKey.startsWith(`${aIdx}:`)) {
                sharedCircleEdges.set(`${aIdx}:${bIdx}`, existingEdge);
                break;
              }
            }
            continue;
          }
          const splitResult = splitPlanarFaceByCircle(currentFace, circleInt);
          if (splitResult) {
            currentFace = splitResult.outside; // face with circular hole
            diskFaces.push(splitResult.inside); // circular disk
            sharedCircleEdges.set(`${aIdx}:${bIdx}`, splitResult.circleEdge);
            processedCircles.push({ center: circleInt.center, radius: circleInt.radius });
          }
        }
      }

      // Then do line-based splitting for planar-planar intersections only.
      // Curved faces were already handled by circle splitting above.
      const planarFacesOfB = facesOfB.filter(f => f.surface.type === 'plane');
      const splitFaces = splitFaceByAllFaces(currentFace, planarFacesOfB);

      for (const sf of splitFaces) {
        allFacesA.push({ face: sf, classification: classifyFace(sf, b) });
      }
      // Disk faces are inside the curved solid — classify them too
      for (const df of diskFaces) {
        allFacesA.push({ face: df, classification: classifyFace(df, b) });
      }
    }
  }

  // Process faces of B (same logic, swapped)
  for (let bIdx = 0; bIdx < facesOfB.length; bIdx++) {
    const faceB = facesOfB[bIdx];
    if (faceB.surface.type !== 'plane') {
      // Check if any shared circle edges exist for this curved face.
      // If so, build trimmed face using those shared edges directly.
      // Collect shared circle edges that actually intersect this specific face.
      // A circle from plane-sphere intersection cuts the whole sphere, but only
      // one hemisphere face contains the circle. Check by testing if the circle
      // center is "near" this face (the circle midpoint should be classifiable
      // relative to this face's boundary).
      const sharedEdgesForFace: Edge[] = [];
      for (let aIdx = 0; aIdx < facesOfA.length; aIdx++) {
        const edge = sharedCircleEdges.get(`${aIdx}:${bIdx}`);
        if (!edge) continue;
        // Check: does this circle edge lie on this curved face?
        // Test the circle's start point — if it's a vertex of this face's wire
        // or close to a point on this face, the circle cuts this face.
        const circlePt = edgeStartPoint(edge);
        // Check: does this circle actually lie on this specific curved face?
        // For sphere faces that share a surface, the circle from a plane intersection
        // only cuts through ONE of the faces. Use the circle center (not start point)
        // and verify it falls within the face's bounding box (tight, no margin).
        // The circle center = the plane-surface intersection center.
        const circleCenter = edge.curve.type === 'circle3d'
          ? (edge.curve as any).plane.origin as Point3D
          : circlePt;
        const faceVerts = faceB.outerWire.edges.map(oe =>
          oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge)
        );
        const faceZMin = Math.min(...faceVerts.map(v => v.z));
        const faceZMax = Math.max(...faceVerts.map(v => v.z));
        const faceXMin = Math.min(...faceVerts.map(v => v.x));
        const faceXMax = Math.max(...faceVerts.map(v => v.x));
        const faceYMin = Math.min(...faceVerts.map(v => v.y));
        const faceYMax = Math.max(...faceVerts.map(v => v.y));
        const tol = 0.01;
        if (circleCenter.z >= faceZMin - tol && circleCenter.z <= faceZMax + tol &&
            circleCenter.x >= faceXMin - tol && circleCenter.x <= faceXMax + tol &&
            circleCenter.y >= faceYMin - tol && circleCenter.y <= faceYMax + tol) {
          sharedEdgesForFace.push(edge);
        }
      }

      if (sharedEdgesForFace.length > 0) {
        // Build trimmed curved face using the shared circle edges as boundary.
        const trimmedFace = buildTrimmedCurvedFace(faceB, sharedEdgesForFace);
        if (trimmedFace) {
          // Verify the trimmed face makes sense: its classification should be meaningful.
          // If the circle doesn't actually cut through this specific face (e.g., it only
          // cuts the other hemisphere), the trimmed face may be wrong — fall back to
          // classifying the original face.
          const trimClass = classifyFace(trimmedFace, a);
          allFacesB.push({ face: trimmedFace, classification: trimClass });
        } else {
          // Trimming failed — classify original face
          allFacesB.push({ face: faceB, classification: classifyFace(faceB, a) });
        }
      } else {
        // No shared edges for this specific face. Check if ANOTHER face of the
        // same surface has shared edges — if so, this face is subsumed by the
        // trimmed version (e.g., upper hemisphere when lower is trimmed) and
        // should be skipped to avoid dangling edges.
        let siblingHasSharedEdges = false;
        for (let otherBIdx = 0; otherBIdx < facesOfB.length; otherBIdx++) {
          if (otherBIdx === bIdx) continue;
          if (!areSameSurface(facesOfB[otherBIdx].surface, faceB.surface)) continue;
          // Check if the sibling face has shared edges
          for (let aIdx = 0; aIdx < facesOfA.length; aIdx++) {
            if (sharedCircleEdges.has(`${aIdx}:${otherBIdx}`)) {
              siblingHasSharedEdges = true;
              break;
            }
          }
          if (siblingHasSharedEdges) break;
        }

        if (siblingHasSharedEdges) {
          // Skip this face — the trimmed sibling covers both hemispheres
          continue;
        }

        // No sibling has shared edges — try the old trim approach or classify whole face
        const trimResult = trimCurvedFaceByPlanes(faceB, a);
        if (trimResult.success && trimResult.result) {
          allFacesB.push({ face: trimResult.result, classification: classifyFace(trimResult.result, a) });
        } else {
          allFacesB.push({ face: faceB, classification: classifyFace(faceB, a) });
        }
      }
      continue;
    }

    let wasCoplanarSplit = false;
    for (const faceA of facesOfA) {
      if (faceA.surface.type !== 'plane') continue;
      if (!areFacesCoplanar(faceB, faceA)) continue;

      const planeB = faceB.surface.plane;
      const polyB = faceToPolygon2D(faceB, planeB);
      const polyA = faceToPolygon2D(faceA, planeB);
      const intersection = clipPolygon(polyB, polyA);
      const intersectionArea = Math.abs(polygonArea2D(intersection));

      if (intersectionArea < 1e-8) continue;

      const sameNormal = coplanarSameNormal(faceA, faceB);

      if (op === 'union') {
        if (sameNormal) {
          // "B on A, same normal" → skip (A's copy is kept)
          // But keep B's non-overlapping portion
          const diffFragments = polygonDifference(polyB, polyA);
          const originalCWb = faceIsCW(faceB, planeB);
          for (const frag of diffFragments) {
            const oriented = originalCWb ? [...frag].reverse() : frag;
            const fragFace = polygonToFace(oriented, planeB, faceB.surface as PlaneSurface);
            if (fragFace.success) {
              allFacesB.push({ face: fragFace.result!, classification: 'outside' });
            }
          }
        } else {
          // "B on A, opposite normal" → discard
        }
      } else if (op === 'subtract') {
        if (sameNormal) {
          // Same-normal coplanar overlap: both A and B share this face plane.
          // A's diff fragments (A \ overlap) already define the correct boundary.
          // The overlap region is removed — no cavity ceiling/floor at this plane.
          // Do NOT add B's intersection here.
        } else {
          // "B on A, opposite normal" → discard
        }
      } else { // intersect
        if (sameNormal) {
          // Already handled by A's processing
        }
      }

      wasCoplanarSplit = true;
      break;
    }

    if (!wasCoplanarSplit) {
      // Circle-based splitting for curved faces of A intersecting planar face B
      let currentFaceB = faceB;
      const diskFacesB: Face[] = [];

      if (currentFaceB.surface.type === 'plane') {
        const facePlane = currentFaceB.surface.plane;
        for (const otherFace of facesOfA) {
          if (otherFace.surface.type === 'plane') continue;
          const circleInt = intersectPlaneWithCurvedSurface(facePlane, otherFace.surface);
          if (!circleInt) continue;
          const splitResult = splitPlanarFaceByCircle(currentFaceB, circleInt);
          if (splitResult) {
            currentFaceB = splitResult.outside;
            diskFacesB.push(splitResult.inside);
          }
        }
      }

      const planarFacesOfA = facesOfA.filter(f => f.surface.type === 'plane');
      const splitFaces = splitFaceByAllFaces(currentFaceB, planarFacesOfA);
      for (const sf of splitFaces) {
        allFacesB.push({ face: sf, classification: classifyFace(sf, a) });
      }
      for (const df of diskFacesB) {
        allFacesB.push({ face: df, classification: classifyFace(df, a) });
      }
    }
  }

  // Stage 4: Select faces per operation rules
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
    return failure(`Boolean ${op} produced only ${selectedFaces.length} faces — result is degenerate`);
  }

  // Stage 5: Stitch edges so adjacent faces share vertices, then assemble
  const stitched = stitchEdges(selectedFaces);

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
// EDGE STITCHING
// ═══════════════════════════════════════════════════════

const STITCH_TOL = 1e-6;

/**
 * Ensure adjacent faces share edges by splitting edges at intermediate vertices.
 *
 * After boolean face splitting and selection, face A's bottom might have a long
 * edge (-2,-2,0)→(-2,2,0) while an adjacent split side face has a shorter edge
 * (-2,-1,0)→(-2,-2,0). The bottom face's edge must be split at (-2,-1,0) so the
 * two faces share that sub-edge.
 */
function stitchEdges(faces: Face[]): Face[] {
  // Collect all unique vertices from all faces (including inner wires/holes)
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

  const result: Face[] = [];
  for (const face of faces) {
    const splitEdges: Edge[] = [];
    let anySplit = false;

    for (const oe of face.outerWire.edges) {
      const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);

      const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq < STITCH_TOL * STITCH_TOL) {
        // Degenerate edge — keep as-is
        splitEdges.push(oe.edge);
        continue;
      }

      // Find vertices that lie strictly between start and end on this edge
      const intermediates: { t: number; pt: Point3D }[] = [];
      for (const v of allVerts) {
        if (distance(v, start) < STITCH_TOL || distance(v, end) < STITCH_TOL) continue;

        // Project v onto the edge line
        const vx = v.x - start.x, vy = v.y - start.y, vz = v.z - start.z;
        const t = (vx * dx + vy * dy + vz * dz) / lenSq;
        if (t < STITCH_TOL || t > 1 - STITCH_TOL) continue;

        // Check perpendicular distance
        const px = start.x + t * dx - v.x;
        const py = start.y + t * dy - v.y;
        const pz = start.z + t * dz - v.z;
        if (Math.sqrt(px * px + py * py + pz * pz) > STITCH_TOL) continue;

        intermediates.push({ t, pt: v });
      }

      if (intermediates.length === 0) {
        splitEdges.push(oe.edge);
        continue;
      }

      // Sort by parameter and create sub-edges
      anySplit = true;
      intermediates.sort((a, b) => a.t - b.t);

      let current = start;
      for (const inter of intermediates) {
        const lineRes = makeLine3D(current, inter.pt);
        if (lineRes.success) {
          const edgeRes = makeEdgeFromCurve(lineRes.result!);
          if (edgeRes.success) splitEdges.push(edgeRes.result!);
        }
        current = inter.pt;
      }
      const lineRes = makeLine3D(current, end);
      if (lineRes.success) {
        const edgeRes = makeEdgeFromCurve(lineRes.result!);
        if (edgeRes.success) splitEdges.push(edgeRes.result!);
      }
    }

    if (!anySplit) {
      result.push(face);
      continue;
    }

    // Rebuild face with split edges
    const wireRes = makeWireFromEdges(splitEdges);
    if (!wireRes.success) {
      result.push(face); // Fallback
      continue;
    }

    // Preserve inner wires (holes) when rebuilding the face with split outer edges
    const faceRes = face.surface.type === 'plane'
      ? makeFace(face.surface as PlaneSurface, wireRes.result!, [...face.innerWires], face.forward)
      : makePlanarFace(wireRes.result!, [...face.innerWires]);
    if (faceRes.success) {
      result.push(faceRes.result!);
    } else {
      result.push(face);
    }
  }

  return result;
}

/** Push a point into an array only if no existing point is within STITCH_TOL. */
function pushUnique(arr: Point3D[], pt: Point3D): void {
  for (const existing of arr) {
    if (distance(existing, pt) < STITCH_TOL) return;
  }
  arr.push(pt);
}

// ═══════════════════════════════════════════════════════
// FACE SPLITTING (TRANSVERSE INTERSECTION)
// ═══════════════════════════════════════════════════════

/**
 * Split a planar face by all faces of another solid (transverse intersections only).
 *
 * Uses progressive 2D line splitting: for each non-coplanar face of the other solid,
 * compute the plane-plane intersection line, project it to the face's 2D coordinate
 * system, and split all current polygon fragments along that line. This is robust
 * because splitPolygonByLine always works when the line crosses the polygon (no
 * requirement for exactly 2 boundary hits from a finite segment).
 *
 * After splitting, fragments are converted back to faces. Each fragment's centroid
 * is then classified by the caller using pointInSolid.
 */

/**
 * Build a trimmed curved face using pre-computed shared circle edges as boundary.
 *
 * When a curved face (sphere) is partially cut by planar faces, the intersection
 * produces circle edges that are shared between the planar face (as inner wire hole)
 * and this curved face (as outer wire boundary).
 *
 * For a single circle edge: the trimmed face has that circle as its outer wire.
 * For multiple circle edges: they form a closed chain (the trim boundary).
 *
 * Based on OCCT BOPAlgo_BuilderFace approach: reconstruct faces from shared edges.
 */
/**
 * Check if two surfaces represent the same geometric surface.
 * Compares by surface type and key geometric properties.
 * Based on OCCT's BOPTools_AlgoTools::AreFacesSameDomain.
 */
function areSameSurface(a: Surface, b: Surface): boolean {
  if (a.type !== b.type) return false;
  if (a === b) return true;
  switch (a.type) {
    case 'sphere': {
      const sa = a, sb = b as typeof a;
      return distance(sa.center, sb.center) < STITCH_TOL &&
             Math.abs(sa.radius - sb.radius) < STITCH_TOL;
    }
    case 'cylinder': {
      const ca = a, cb = b as typeof a;
      return distance(ca.axis.origin, cb.axis.origin) < STITCH_TOL &&
             Math.abs(ca.radius - cb.radius) < STITCH_TOL;
    }
    case 'cone': {
      const ca = a, cb = b as typeof a;
      return distance(ca.axis.origin, cb.axis.origin) < STITCH_TOL &&
             Math.abs(ca.radius - cb.radius) < STITCH_TOL &&
             Math.abs(ca.semiAngle - cb.semiAngle) < STITCH_TOL;
    }
    default:
      return false;
  }
}

function buildTrimmedCurvedFace(originalFace: Face, sharedEdges: Edge[]): Face | null {
  if (sharedEdges.length === 0) return null;

  if (sharedEdges.length === 1) {
    // Single circle edge → use it as the outer wire.
    // Use forward=false so that after flipFace (for subtract), the edge becomes
    // forward=true, which is the OPPOSITE of the hole wire's forward=false.
    // This ensures the shell closure check sees one fwd + one rev per edge.
    const edge = sharedEdges[0];
    const wireResult = makeWire([orientEdge(edge, false)]);
    if (!wireResult.success) return null;
    const faceResult = makeFace(originalFace.surface, wireResult.result!);
    if (!faceResult.success) return null;
    return faceResult.result!;
  }

  // Multiple shared edges (e.g., through-hole: top and bottom circles).
  // The trimmed face wire connects the shared circle edges via seam segments.
  //
  // For a through-hole cylinder with 2 circle edges:
  // Wire = circle-top → seam-down → circle-bottom(reversed) → seam-up
  // The seam segments connect the circle start/end points.
  //
  // Based on OCCT's pave block approach: split seam edges at intersection points.

  if (sharedEdges.length === 2) {
    const e0 = sharedEdges[0]; // e.g., circle at z=2
    const e1 = sharedEdges[1]; // e.g., circle at z=-2

    // Find connection points: the circles' start points (they're closed, start=end)
    const p0 = edgeStartPoint(e0); // point on circle 0
    const p1 = edgeStartPoint(e1); // point on circle 1

    // Create seam lines connecting the two circles
    const seamDown = makeLine3D(p0, p1);
    const seamUp = makeLine3D(p1, p0); // reverse direction for the return path

    if (!seamDown.success || !seamUp.success) return null;
    const seamDownEdge = makeEdgeFromCurve(seamDown.result!);
    const seamUpEdge = makeEdgeFromCurve(seamUp.result!);
    if (!seamDownEdge.success || !seamUpEdge.success) return null;

    // Assemble: circle0(fwd) → seamDown → circle1(rev) → seamUp
    const wireResult = makeWire([
      orientEdge(e0, false),              // circle at top (reversed for subtract compatibility)
      orientEdge(seamDownEdge.result!, true),  // seam going down
      orientEdge(e1, true),              // circle at bottom
      orientEdge(seamUpEdge.result!, true),    // seam going up
    ]);
    if (!wireResult.success) {
      // Try alternate winding
      const wireResult2 = makeWire([
        orientEdge(e0, true),
        orientEdge(seamDownEdge.result!, true),
        orientEdge(e1, false),
        orientEdge(seamUpEdge.result!, true),
      ]);
      if (!wireResult2.success) return null;
      const faceResult = makeFace(originalFace.surface, wireResult2.result!);
      return faceResult.success ? faceResult.result! : null;
    }
    const faceResult = makeFace(originalFace.surface, wireResult.result!);
    return faceResult.success ? faceResult.result! : null;
  }

  // General fallback: try to assemble all shared edges + original seam edges
  const seamEdges: Edge[] = [];
  for (const oe of originalFace.outerWire.edges) {
    if (!oe.edge.curve.isClosed) seamEdges.push(oe.edge);
  }
  const allEdges = [...sharedEdges, ...seamEdges];
  const wireResult = makeWireFromEdges(allEdges);
  if (!wireResult.success) return null;
  if (!wireResult.result!.isClosed) return null;
  const faceResult = makeFace(originalFace.surface, wireResult.result!);
  return faceResult.success ? faceResult.result! : null;
}

function splitFaceByAllFaces(face: Face, otherFaces: readonly Face[]): Face[] {
  if (face.surface.type !== 'plane') return [face];

  const pl = face.surface.plane;
  let fragments: Pt2[][] = [faceToPolygon2D(face, pl)];
  const originalCW = faceIsCW(face, pl);

  for (const otherFace of otherFaces) {
    if (otherFace.surface.type === 'plane') {
      if (areFacesCoplanar(face, otherFace)) continue;

      // Compute plane-plane intersection → 3D line
      const lineResult = intersectPlanePlane(pl, otherFace.surface.plane);
      if (!lineResult.success || !lineResult.result) continue;

      const intLine = lineResult.result;

      // Project the 3D intersection line to 2D on the face's plane
      const lineOrigin2d = worldToSketch(pl, intLine.origin);
      const lineFar3d = point3d(
        intLine.origin.x + intLine.direction.x,
        intLine.origin.y + intLine.direction.y,
        intLine.origin.z + intLine.direction.z,
      );
      const lineFar2d = worldToSketch(pl, lineFar3d);

      // Split all current fragments by this infinite line
      const nextFragments: Pt2[][] = [];
      for (const frag of fragments) {
        const [inside, outside] = splitPolygonByLine(frag, lineOrigin2d, lineFar2d);
        if (inside.length >= 3) nextFragments.push(inside);
        if (outside.length >= 3) nextFragments.push(outside);
      }
      if (nextFragments.length > 0) {
        fragments = nextFragments;
      }
    } else {
      // Curved surface: compute plane-surface intersection → circle/ellipse
      // Project to 2D on the face's plane as a high-resolution polygon, then clip
      const circleIntersection = intersectPlaneWithCurvedSurface(pl, otherFace.surface);
      if (!circleIntersection) continue;

      // Approximate the circle as splitting lines through the face.
      // Instead of polygon clipping (which can't compute the exterior of a circle),
      // we split by the bounding-box edges of the circle, which partitions the
      // face into regions that classifyFace can then label correctly.
      const circleIntersection2D = worldToSketch(pl, circleIntersection.center);
      const cr = circleIntersection.radius;

      // Split by 4 tangent lines of the circle (axis-aligned bounding box)
      // This creates fragments that are clearly inside or outside the circle
      const tangentLines: [Pt2, Pt2][] = [
        [{ x: circleIntersection2D.x - cr, y: -1000 }, { x: circleIntersection2D.x - cr, y: 1000 }], // left tangent
        [{ x: circleIntersection2D.x + cr, y: 1000 }, { x: circleIntersection2D.x + cr, y: -1000 }], // right tangent
        [{ x: -1000, y: circleIntersection2D.y - cr }, { x: 1000, y: circleIntersection2D.y - cr }], // bottom tangent
        [{ x: 1000, y: circleIntersection2D.y + cr }, { x: -1000, y: circleIntersection2D.y + cr }], // top tangent
      ];

      for (const [lineStart, lineEnd] of tangentLines) {
        const nextFragments: Pt2[][] = [];
        for (const frag of fragments) {
          const [inside, outside] = splitPolygonByLine(frag, lineStart, lineEnd);
          if (inside.length >= 3) nextFragments.push(inside);
          if (outside.length >= 3) nextFragments.push(outside);
        }
        if (nextFragments.length > 0) {
          fragments = nextFragments;
        }
      }

      // Also split by diagonal tangent lines for better resolution
      const diag = cr * Math.SQRT1_2;
      const cx2d = circleIntersection2D.x, cy2d = circleIntersection2D.y;
      const diagLines: [Pt2, Pt2][] = [
        [{ x: cx2d - diag, y: cy2d - diag - 1000 }, { x: cx2d + diag + 1000, y: cy2d + diag }],
        [{ x: cx2d + diag, y: cy2d - diag - 1000 }, { x: cx2d - diag - 1000, y: cy2d + diag }],
      ];
      for (const [lineStart, lineEnd] of diagLines) {
        const nextFragments: Pt2[][] = [];
        for (const frag of fragments) {
          const [inside, outside] = splitPolygonByLine(frag, lineStart, lineEnd);
          if (inside.length >= 3) nextFragments.push(inside);
          if (outside.length >= 3) nextFragments.push(outside);
        }
        if (nextFragments.length > 0) {
          fragments = nextFragments;
        }
      }
    }
  }

  // If no splits happened, return the original face
  if (fragments.length <= 1) return [face];

  // Convert 2D fragments back to 3D faces
  const result: Face[] = [];
  for (const frag of fragments) {
    // Restore original winding direction (faceToPolygon2D always returns CCW)
    const oriented = originalCW ? [...frag].reverse() : frag;
    const fragFace = polygonToFace(oriented, pl, face.surface as PlaneSurface);
    if (fragFace.success) {
      result.push(fragFace.result!);
    }
  }

  return result.length > 0 ? result : [face];
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
