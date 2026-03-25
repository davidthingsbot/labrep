import { Point3D, point3d, vec3d, Plane, plane, normalize, cross, worldToSketch, dot } from '../core';
import { makeCircle3D } from '../geometry';
import type { PlaneCircleIntersection } from '../geometry/intersections3d';
import { Face, Surface, makeFace } from '../topology/face';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { Wire, makeWire, makeWireFromEdges, orientEdge, reverseOrientedEdge, orientedEdgeStartPoint } from '../topology/wire';
import { PlaneSurface } from '../surfaces/plane-surface';

/**
 * Result of splitting a planar face by a circle intersection.
 */
export interface SplitFaceByCircleResult {
  /** The original face with a circular hole cut out */
  readonly outside: Face;
  /** A new circular disk face filling the hole */
  readonly inside: Face;
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
    return null;
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

/**
 * Extract the face boundary as a 2D polygon in the face plane's parameter space.
 */
function faceToPolygon2D(face: Face, facePlane: Plane): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const oe of face.outerWire.edges) {
    const pt3d = orientedEdgeStartPoint(oe);
    pts.push(worldToSketch(facePlane, pt3d));
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
