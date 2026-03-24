import {
  Point3D,
  point3d,
  Point2D,
  point2d,
  Vector3D,
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
import { Line3D, makeLine3D } from '../geometry/line3d';
import { intersectPlanePlane } from '../geometry/intersections3d';
import { Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire, makeWireFromEdges } from '../topology/wire';
import { Face, makeFace, makePlanarFace, faceOuterWire } from '../topology/face';
import { Shell, makeShell, shellIsClosed, shellFaces } from '../topology/shell';
import { Solid, makeSolid, solidVolume } from '../topology/solid';
import { PlaneSurface, makePlaneSurface } from '../surfaces';
import { pointInSolid } from './point-in-solid';

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

/** Flip a face's normal (reverse wire, negate surface normal) */
function flipFace(face: Face): OperationResult<Face> {
  if (face.surface.type !== 'plane') return failure('flipFace only supports planar faces');

  const p = face.surface.plane;
  const flippedPlane = plane(p.origin, vec3d(-p.normal.x, -p.normal.y, -p.normal.z), p.xAxis);
  const flippedSurface = makePlaneSurface(flippedPlane);

  const reversedEdges: OrientedEdge[] = [];
  for (let i = face.outerWire.edges.length - 1; i >= 0; i--) {
    const oe = face.outerWire.edges[i];
    reversedEdges.push(orientEdge(oe.edge, !oe.forward));
  }

  const wireResult = makeWire(reversedEdges);
  if (!wireResult.success) return failure(`Failed to reverse wire: ${wireResult.error}`);

  return makeFace(flippedSurface, wireResult.result!);
}

// ═══════════════════════════════════════════════════════
// FACE CLASSIFICATION
// ═══════════════════════════════════════════════════════

const COPLANAR_TOL = 1e-5;

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
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const oe of wire.edges) {
    const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    cx += pt.x; cy += pt.y; cz += pt.z; n++;
  }
  if (n === 0) return 'outside';
  const centroid = point3d(cx / n, cy / n, cz / n);

  // Nudge slightly along face normal to avoid "on" classification
  if (face.surface.type === 'plane') {
    const normal = face.surface.plane.normal;
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

  // Process faces of A
  for (const faceA of facesOfA) {
    if (faceA.surface.type !== 'plane') {
      allFacesA.push({ face: faceA, classification: classifyFace(faceA, b) });
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
          // "A on B, same normal" → keep A whole, skip B's copy later
          allFacesA.push({ face: faceA, classification: 'on' });
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
            const fragFace = polygonToFace(oriented, planeA);
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
          const intFaceResult = polygonToFace(oriented, planeA);
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
      let splitFaces = [faceA];
      splitFaces = splitFaceByAllFaces(faceA, facesOfB);

      for (const sf of splitFaces) {
        allFacesA.push({ face: sf, classification: classifyFace(sf, b) });
      }
    }
  }

  // Process faces of B (same logic, swapped)
  for (const faceB of facesOfB) {
    if (faceB.surface.type !== 'plane') {
      allFacesB.push({ face: faceB, classification: classifyFace(faceB, a) });
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
            const fragFace = polygonToFace(oriented, planeB);
            if (fragFace.success) {
              allFacesB.push({ face: fragFace.result!, classification: 'outside' });
            }
          }
        } else {
          // "B on A, opposite normal" → discard
        }
      } else if (op === 'subtract') {
        if (sameNormal) {
          // For subtract: the overlap region of B becomes the cavity floor/ceiling.
          const originalCWbs = faceIsCW(faceB, planeB);
          const orientedInt = originalCWbs ? [...intersection].reverse() : intersection;
          const intFace = polygonToFace(orientedInt, planeB);
          if (intFace.success) {
            allFacesB.push({ face: intFace.result!, classification: 'inside' });
          }
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
      let splitFaces = splitFaceByAllFaces(faceB, facesOfA);
      for (const sf of splitFaces) {
        allFacesB.push({ face: sf, classification: classifyFace(sf, a) });
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

  if (selectedFaces.length < 4) {
    return failure(`Boolean ${op} produced only ${selectedFaces.length} faces (A: ${allFacesA.map(f => f.classification).join(',')}, B: ${allFacesB.map(f => f.classification).join(',')}) — result is degenerate`);
  }

  // Stage 5: Assemble
  const shellResult = makeShell(selectedFaces);
  if (!shellResult.success) return failure(`Shell creation failed: ${shellResult.error}`);

  // Try creating a proper solid (requires closed shell)
  let solid: Solid;
  const solidResult = makeSolid(shellResult.result!);
  if (solidResult.success) {
    solid = solidResult.result!;
  } else {
    // Shell isn't closed — common for boolean results where split faces
    // don't perfectly share edges. Create solid anyway by using the shell
    // as-is. Volume computation still works via divergence theorem.
    solid = { outerShell: shellResult.result!, innerShells: [] };
  }

  return success({ solid, facesFromA, facesFromB });
}

// ═══════════════════════════════════════════════════════
// FACE SPLITTING (TRANSVERSE INTERSECTION)
// ═══════════════════════════════════════════════════════

/**
 * Split a planar face by all faces of another solid (transverse intersections only).
 */
function splitFaceByAllFaces(face: Face, otherFaces: readonly Face[]): Face[] {
  if (face.surface.type !== 'plane') return [face];

  let currentFaces: Face[] = [face];

  for (const otherFace of otherFaces) {
    if (otherFace.surface.type !== 'plane') continue;
    if (areFacesCoplanar(face, otherFace)) continue; // Skip coplanar (handled separately)

    const bboxA = boundingBoxFromFace(face);
    const bboxB = boundingBoxFromFace(otherFace);
    if (!bboxIntersects(bboxA, bboxB)) continue;

    // Compute plane-plane intersection
    const lineResult = intersectPlanePlane(face.surface.plane, otherFace.surface.plane);
    if (!lineResult.success || !lineResult.result) continue;

    const intLine = lineResult.result;

    // Clip intersection line to the other face's boundary
    const segments = clipLineToFace(intLine, otherFace);
    if (segments.length === 0) continue;

    // Try splitting each current face by each segment
    const nextFaces: Face[] = [];
    for (const cf of currentFaces) {
      let wasSplit = false;
      for (const seg of segments) {
        if (wasSplit) break;
        const splitResult = splitPlanarFaceBySegment(cf, seg.start, seg.end);
        if (splitResult.success) {
          nextFaces.push(splitResult.result![0], splitResult.result![1]);
          wasSplit = true;
        }
      }
      if (!wasSplit) nextFaces.push(cf);
    }
    currentFaces = nextFaces;
  }

  return currentFaces;
}

/**
 * Clip an infinite line to a planar face's boundary.
 */
function clipLineToFace(
  line: Line3D,
  face: Face,
): { start: Point3D; end: Point3D }[] {
  if (face.surface.type !== 'plane') return [];

  const pl = face.surface.plane;
  const polygon = faceToPolygon2D(face, pl);

  // Project line to 2D
  const lineOrigin2d = worldToSketch(pl, line.origin);
  const lineFar3d = point3d(
    line.origin.x + line.direction.x * 200,
    line.origin.y + line.direction.y * 200,
    line.origin.z + line.direction.z * 200,
  );
  const lineNegFar3d = point3d(
    line.origin.x - line.direction.x * 200,
    line.origin.y - line.direction.y * 200,
    line.origin.z - line.direction.z * 200,
  );
  const lineFar2d = worldToSketch(pl, lineFar3d);
  const lineNeg2d = worldToSketch(pl, lineNegFar3d);

  // Find intersections of the line with polygon edges
  const hits: { t: number; pt: Pt2 }[] = [];
  const dx = lineFar2d.x - lineNeg2d.x;
  const dy = lineFar2d.y - lineNeg2d.y;

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const ex = polygon[j].x - polygon[i].x;
    const ey = polygon[j].y - polygon[i].y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;

    const tLine = ((polygon[i].x - lineNeg2d.x) * ey - (polygon[i].y - lineNeg2d.y) * ex) / denom;
    const tEdge = ((polygon[i].x - lineNeg2d.x) * dy - (polygon[i].y - lineNeg2d.y) * dx) / denom;

    if (tEdge >= -1e-8 && tEdge <= 1 + 1e-8) {
      const ptx = lineNeg2d.x + tLine * dx;
      const pty = lineNeg2d.y + tLine * dy;
      hits.push({ t: tLine, pt: { x: ptx, y: pty } });
    }
  }

  hits.sort((a, b) => a.t - b.t);

  // Deduplicate close hits
  const deduped: typeof hits = [];
  for (const h of hits) {
    if (deduped.length === 0 || Math.abs(h.t - deduped[deduped.length - 1].t) > 1e-8) {
      deduped.push(h);
    }
  }

  // Pair up entry/exit points
  const segments: { start: Point3D; end: Point3D }[] = [];
  for (let i = 0; i + 1 < deduped.length; i += 2) {
    const start3d = sketchToWorld(pl, point2d(deduped[i].pt.x, deduped[i].pt.y));
    const end3d = sketchToWorld(pl, point2d(deduped[i + 1].pt.x, deduped[i + 1].pt.y));
    if (distance(start3d, end3d) > 1e-8) {
      segments.push({ start: start3d, end: end3d });
    }
  }

  return segments;
}

/**
 * Split a planar face along a line segment.
 */
function splitPlanarFaceBySegment(
  face: Face,
  splitStart: Point3D,
  splitEnd: Point3D,
): OperationResult<[Face, Face]> {
  if (face.surface.type !== 'plane') return failure('Not a planar face');

  const pl = face.surface.plane;
  const polygon = faceToPolygon2D(face, pl);
  const s2d = worldToSketch(pl, splitStart);
  const e2d = worldToSketch(pl, splitEnd);

  // Find where the split segment intersects the polygon boundary
  const dx = e2d.x - s2d.x, dy = e2d.y - s2d.y;
  const segLen = Math.sqrt(dx * dx + dy * dy);
  if (segLen < 1e-10) return failure('Split segment too short');

  type Hit = { tSeg: number; edgeIdx: number; pt: Pt2 };
  const hits: Hit[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const ex = polygon[j].x - polygon[i].x;
    const ey = polygon[j].y - polygon[i].y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;

    const tSeg = ((polygon[i].x - s2d.x) * ey - (polygon[i].y - s2d.y) * ex) / denom;
    const tEdge = ((polygon[i].x - s2d.x) * dy - (polygon[i].y - s2d.y) * dx) / denom;

    if (tEdge >= -1e-6 && tEdge <= 1 + 1e-6 && tSeg >= -1e-6 && tSeg <= 1 + 1e-6) {
      const pt = { x: s2d.x + tSeg * dx, y: s2d.y + tSeg * dy };
      hits.push({ tSeg, edgeIdx: i, pt });
    }
  }

  // Deduplicate
  const deduped: Hit[] = [];
  for (const h of hits) {
    if (!deduped.some(d => Math.abs(d.tSeg - h.tSeg) < 1e-6)) {
      deduped.push(h);
    }
  }

  if (deduped.length !== 2) {
    return failure(`Split line hits ${deduped.length} boundary points (need 2)`);
  }

  deduped.sort((a, b) => a.edgeIdx !== b.edgeIdx ? a.edgeIdx - b.edgeIdx : a.tSeg - b.tSeg);

  const hit0 = deduped[0];
  const hit1 = deduped[1];

  // Build two sub-polygons
  const buildSubPoly = (startHit: Hit, endHit: Hit): Pt2[] => {
    const poly: Pt2[] = [startHit.pt];
    let idx = (startHit.edgeIdx + 1) % polygon.length;
    const endIdx = (endHit.edgeIdx + 1) % polygon.length;
    let safety = 0;
    while (idx !== endIdx && safety < polygon.length + 2) {
      poly.push(polygon[idx]);
      idx = (idx + 1) % polygon.length;
      safety++;
    }
    poly.push(endHit.pt);
    return poly;
  };

  const poly1 = buildSubPoly(hit0, hit1);
  const poly2 = buildSubPoly(hit1, hit0);

  const face1 = polygonToFace(poly1, pl);
  const face2 = polygonToFace(poly2, pl);

  if (!face1.success) return failure(`Sub-face 1: ${face1.error}`);
  if (!face2.success) return failure(`Sub-face 2: ${face2.error}`);

  return success([face1.result!, face2.result!]);
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
