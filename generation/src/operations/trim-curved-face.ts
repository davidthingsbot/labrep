import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  Plane,
  plane,
  dot,
  cross,
  normalize,
  length,
  distance,
  subtractPoints,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Face, makeFace, Surface } from '../topology/face';
import { makeEdgeFromCurve } from '../topology/edge';
import { makeWireFromEdges } from '../topology/wire';
import { shellFaces } from '../topology/shell';
import { Solid } from '../topology/solid';
import { makeArc3D, Arc3D } from '../geometry/arc3d';
import { makeCircle3D } from '../geometry/circle3d';
import {
  intersectPlaneSphere,
  intersectPlaneCylinder,
  intersectPlaneCone,
  PlaneCircleIntersection,
} from '../geometry/intersections3d';
import { clipCircleByHalfSpaces, clipCircleByHalfSpacesMulti, ClipCircle } from '../geometry/clip-curve';
import { SphericalSurface } from '../surfaces/spherical-surface';
import { CylindricalSurface } from '../surfaces/cylindrical-surface';
import { ConicalSurface } from '../surfaces/conical-surface';
import { pointInSolid } from './point-in-solid';

const STITCH_TOL = 1e-4;

/**
 * Approximate the center of a solid by averaging all face vertex positions.
 * Used to determine which side of a plane the solid interior is on.
 */
function computeSolidCenter(solid: Solid): Point3D {
  const faces = shellFaces(solid.outerShell);
  let sx = 0, sy = 0, sz = 0, count = 0;
  for (const f of faces) {
    for (const oe of f.outerWire.edges) {
      const p = oe.forward ? oe.edge.startVertex.point : oe.edge.endVertex.point;
      sx += p.x; sy += p.y; sz += p.z; count++;
    }
  }
  return count > 0 ? point3d(sx / count, sy / count, sz / count) : point3d(0, 0, 0);
}

/**
 * Compute a perpendicular direction to a given normal, preferring alignment
 * with the global X axis when possible.
 */
function perpendicularTo(n: Vector3D): Vector3D {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  let ref: Vector3D;
  if (ax <= ay && ax <= az) ref = vec3d(1, 0, 0);
  else if (ay <= az) ref = vec3d(0, 1, 0);
  else ref = vec3d(0, 0, 1);
  return normalize(cross(n, ref));
}

/**
 * Intersect a plane with a curved surface, returning circle information
 * if the intersection is a circle (the common case for boolean operations).
 */
function intersectPlaneWithSurface(
  pl: Plane,
  surface: Surface,
): PlaneCircleIntersection | null {
  if (surface.type === 'sphere') {
    const result = intersectPlaneSphere(pl, surface);
    if (!result.success || !result.result) return null;
    return result.result;
  }

  if (surface.type === 'cylinder') {
    const result = intersectPlaneCylinder(pl, surface);
    if (!result.success || !result.result) return null;
    // Only handle circle case for now (perpendicular cut)
    if (result.result.type === 'circle') return result.result;
    // Ellipse and line cases need different handling — skip for now
    return null;
  }

  if (surface.type === 'cone') {
    const result = intersectPlaneCone(pl, surface);
    if (!result.success || !result.result) return null;
    if (result.result.type === 'circle') return result.result;
    return null;
  }

  return null;
}

interface ArcWithCircle {
  /** The plane defining the intersection circle (origin=center, normal=circleNormal, xAxis defines θ=0) */
  circlePlane: Plane;
  /** Circle radius */
  radius: number;
  /** Start angle of surviving arc */
  startAngle: number;
  /** End angle of surviving arc */
  endAngle: number;
  /** 3D start point */
  startPt: Point3D;
  /** 3D end point */
  endPt: Point3D;
  /** Which face of the other solid produced this intersection */
  faceIndex: number;
}

/**
 * Evaluate a point on a circle given its plane, radius, and angle.
 */
function evalCircle(pl: Plane, radius: number, angle: number): Point3D {
  const yAxis = normalize(cross(pl.normal, pl.xAxis));
  const c = Math.cos(angle), s = Math.sin(angle);
  return point3d(
    pl.origin.x + radius * (c * pl.xAxis.x + s * yAxis.x),
    pl.origin.y + radius * (c * pl.xAxis.y + s * yAxis.y),
    pl.origin.z + radius * (c * pl.xAxis.z + s * yAxis.z),
  );
}

/**
 * Trim a curved face by the planar faces of another solid.
 *
 * Computes plane-surface intersection circles, clips each by the other
 * solid's half-spaces, assembles the surviving arcs into a closed trim
 * wire, and creates a new Face with the original surface and the trim wire.
 *
 * @param curvedFace - The face to trim (must have a curved surface)
 * @param otherSolid - The solid whose planar faces define the trim boundary
 * @returns Trimmed face, or null if the face is entirely outside
 */
export function trimCurvedFaceByPlanes(
  curvedFace: Face,
  otherSolid: Solid,
): OperationResult<Face | null> {
  const surface = curvedFace.surface;
  const otherFaces = shellFaces(otherSolid.outerShell);
  const planarFaces = otherFaces.filter(f => f.surface.type === 'plane');

  if (planarFaces.length === 0) {
    // No planar faces to trim against — classify whole face
    return success(null);
  }

  // Step 1: Compute all plane-surface intersections
  const circles: { intersection: PlaneCircleIntersection; facePlane: Plane; faceIndex: number }[] = [];

  for (let i = 0; i < planarFaces.length; i++) {
    const pf = planarFaces[i];
    if (pf.surface.type !== 'plane') continue;
    const facePlane = pf.surface.plane;

    const intersection = intersectPlaneWithSurface(facePlane, surface);
    if (!intersection) continue;

    circles.push({ intersection, facePlane, faceIndex: i });
  }

  if (circles.length === 0) {
    // No intersections — face is entirely inside or outside.
    // Use centroid classification to determine.
    return success(null); // Caller should use classifyFace
  }

  // Step 2: For each intersection circle, clip by all OTHER planes
  const arcs: ArcWithCircle[] = [];

  for (let ci = 0; ci < circles.length; ci++) {
    const { intersection, facePlane } = circles[ci];

    // Build the ClipCircle
    const circleXAxis = perpendicularTo(intersection.normal);
    const circleYAxis = normalize(cross(intersection.normal, circleXAxis));
    const circlePlane = plane(intersection.center, intersection.normal, circleXAxis);

    const clipCircle: ClipCircle = {
      center: intersection.center,
      radius: intersection.radius,
      normal: intersection.normal,
      xAxis: circleXAxis,
      yAxis: circleYAxis,
    };

    // Collect all OTHER planes as half-space constraints, oriented so that
    // the solid interior is on the NEGATIVE side (dot(P-origin, normal) < 0).
    //
    // Face normals may point outward OR inward depending on the extrude convention.
    // To determine the correct orientation, test which side of each plane the
    // solid's center point (approx: centroid of all face vertices) is on.
    // If the center is on the positive side, flip the plane normal.
    const solidCenter = computeSolidCenter(otherSolid);
    const otherPlanes: Plane[] = [];
    for (let pi = 0; pi < planarFaces.length; pi++) {
      if (pi === circles[ci].faceIndex) continue;
      const pf = planarFaces[pi];
      if (pf.surface.type !== 'plane') continue;
      const pl = pf.surface.plane;
      const rel = subtractPoints(solidCenter, pl.origin);
      const side = dot(rel, pl.normal);
      if (side > 0) {
        // Solid center is on positive side — flip so interior is on negative side
        otherPlanes.push(plane(pl.origin, vec3d(-pl.normal.x, -pl.normal.y, -pl.normal.z), pl.xAxis));
      } else {
        otherPlanes.push(pl);
      }
    }

    // Use multi-interval clipper to handle cases where multiple disjoint arcs survive
    const arcIntervals = clipCircleByHalfSpacesMulti(clipCircle, otherPlanes);
    if (arcIntervals.length === 0) continue; // Fully clipped

    for (const arcInterval of arcIntervals) {
      // Check that the arc midpoint is inside the other solid.
      // Nudge slightly inward from the intersecting plane to avoid boundary classification issues.
      const rawSpan = arcInterval.endAngle - arcInterval.startAngle;
      const span = rawSpan < 0 ? rawSpan + 2 * Math.PI : rawSpan;
      const midAngle = arcInterval.startAngle + span / 2;
      const midPtOnCircle = evalCircle(circlePlane, intersection.radius, midAngle);

      // Nudge inward: move the midpoint slightly toward the solid center
      const nudgeDist = 1e-3;
      const toCenter = subtractPoints(solidCenter, midPtOnCircle);
      const toCenterLen = length(toCenter);
      const midPt = toCenterLen > 1e-10
        ? point3d(
            midPtOnCircle.x + nudgeDist * toCenter.x / toCenterLen,
            midPtOnCircle.y + nudgeDist * toCenter.y / toCenterLen,
            midPtOnCircle.z + nudgeDist * toCenter.z / toCenterLen,
          )
        : midPtOnCircle;

      const midClass = pointInSolid(midPt, otherSolid);
      if (midClass === 'outside') continue; // Arc is on wrong side

      const startPt = evalCircle(circlePlane, intersection.radius, arcInterval.startAngle);
      const endPt = evalCircle(circlePlane, intersection.radius, arcInterval.endAngle);

      arcs.push({
        circlePlane,
        radius: intersection.radius,
        startAngle: arcInterval.startAngle,
        endAngle: arcInterval.endAngle,
        startPt,
        endPt,
        faceIndex: circles[ci].faceIndex,
      });
    }
  }

  if (arcs.length === 0) {
    // No arcs survived clipping. The face is entirely inside or outside.
    return success(null);
  }

  // Step 3: Build the trim wire from surviving arcs.
  // Special case: a single arc that spans a full circle → use Circle3D edge.
  // Otherwise, order arcs into a closed chain.

  const edges = [];

  if (arcs.length === 1) {
    const arc = arcs[0];
    // Check if it's a full circle (endAngle - startAngle ≈ 2π)
    const rawSpan = arc.endAngle - arc.startAngle;
    const isFullCircle = Math.abs(rawSpan - 2 * Math.PI) < 0.01 ||
                          Math.abs(rawSpan + 2 * Math.PI) < 0.01 ||
                          (distance(arc.startPt, arc.endPt) < STITCH_TOL && rawSpan > Math.PI);
    if (isFullCircle) {
      // Full circle — create a Circle3D edge
      const circleResult = makeCircle3D(arc.circlePlane, arc.radius);
      if (!circleResult.success) return failure(`Failed to create trim circle: ${circleResult.error}`);
      const edgeResult = makeEdgeFromCurve(circleResult.result!);
      if (!edgeResult.success) return failure(`Failed to create trim edge: ${edgeResult.error}`);
      edges.push(edgeResult.result!);
    } else {
      // Single arc — not a closed boundary. Let caller classify.
      return success(null);
    }
  } else {
    // Multiple arcs — order into a closed chain
    const ordered = orderArcsIntoChain(arcs);
    if (!ordered) {
      return failure('Failed to order trim arcs into a closed chain');
    }

    for (const arc of ordered) {
      const arcResult = makeArc3D(arc.circlePlane, arc.radius, arc.startAngle, arc.endAngle);
      if (!arcResult.success) {
        return failure(`Failed to create trim arc: ${arcResult.error}`);
      }
      const edgeResult = makeEdgeFromCurve(arcResult.result!);
      if (!edgeResult.success) {
        return failure(`Failed to create trim edge: ${edgeResult.error}`);
      }
      edges.push(edgeResult.result!);
    }
  }

  const wireResult = makeWireFromEdges(edges);
  if (!wireResult.success) {
    return failure(`Failed to create trim wire: ${wireResult.error}`);
  }

  // Step 4: Create the trimmed face
  return makeFace(surface, wireResult.result!);
}

/**
 * Order a set of arcs into a closed chain by matching endpoints.
 * Each arc's endPt should match the next arc's startPt within tolerance.
 */
function orderArcsIntoChain(arcs: ArcWithCircle[]): ArcWithCircle[] | null {
  if (arcs.length === 0) return null;

  const used = new Set<number>();
  const chain: ArcWithCircle[] = [arcs[0]];
  used.add(0);

  for (let iter = 0; iter < arcs.length - 1; iter++) {
    const lastEnd = chain[chain.length - 1].endPt;
    let found = false;

    for (let j = 0; j < arcs.length; j++) {
      if (used.has(j)) continue;
      if (distance(lastEnd, arcs[j].startPt) < STITCH_TOL) {
        chain.push(arcs[j]);
        used.add(j);
        found = true;
        break;
      }
    }

    if (!found) return null; // Can't close the chain
  }

  // Verify closure: last arc's endPt matches first arc's startPt
  if (distance(chain[chain.length - 1].endPt, chain[0].startPt) > STITCH_TOL) {
    return null; // Not closed
  }

  return chain;
}
