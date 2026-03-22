import { Point3D, ORIGIN, point3d } from './point3d';
import { Vector3D, X_AXIS, Y_AXIS, Z_AXIS, normalize, dot, scale } from './vector3d';
import { isZero } from './tolerance';

/**
 * An infinite plane in 3D space defined by an origin point, a unit normal
 * vector, and a unit x-axis vector that establishes an in-plane coordinate frame.
 */
export interface Plane {
  readonly origin: Point3D;
  readonly normal: Vector3D;
  readonly xAxis: Vector3D;
}

/**
 * Creates a plane from an origin, normal, and x-axis direction.
 * The normal and xAxis are normalized automatically.
 *
 * @param origin - A point on the plane
 * @param normal - The surface normal direction (will be normalized)
 * @param xAxis - The in-plane x-axis direction (will be normalized)
 * @returns A new Plane with unit normal and xAxis
 */
export function plane(origin: Point3D, normal: Vector3D, xAxis: Vector3D): Plane {
  return { origin, normal: normalize(normal), xAxis: normalize(xAxis) };
}

/** The XY plane through the origin (normal along +Z). */
export const XY_PLANE: Plane = plane(ORIGIN, Z_AXIS, X_AXIS);
/** The XZ plane through the origin (normal along +Y). */
export const XZ_PLANE: Plane = plane(ORIGIN, Y_AXIS, X_AXIS);
/** The YZ plane through the origin (normal along +X). */
export const YZ_PLANE: Plane = plane(ORIGIN, X_AXIS, Y_AXIS);

/**
 * Returns the signed distance from the plane to the point.
 * Positive means the point is on the side the normal points to.
 *
 * @param pl - The reference plane
 * @param pt - The point to measure
 * @returns Signed distance (positive on the normal side, negative on the opposite side)
 */
export function distanceToPoint(pl: Plane, pt: Point3D): number {
  const dx = pt.x - pl.origin.x;
  const dy = pt.y - pl.origin.y;
  const dz = pt.z - pl.origin.z;
  return dot(pl.normal, { x: dx, y: dy, z: dz });
}

/**
 * Projects a point onto the plane along the plane normal.
 *
 * @param pl - The plane to project onto
 * @param pt - The point to project
 * @returns The closest point on the plane
 */
export function projectPoint(pl: Plane, pt: Point3D): Point3D {
  const dist = distanceToPoint(pl, pt);
  const offset = scale(pl.normal, dist);
  return point3d(pt.x - offset.x, pt.y - offset.y, pt.z - offset.z);
}

/**
 * Returns true if the point lies on the plane (within tolerance).
 * Uses the global zero-tolerance from {@link isZero}.
 *
 * @param pl - The plane to test against
 * @param pt - The point to test
 * @returns True if the point-to-plane distance is within tolerance
 */
export function containsPoint(pl: Plane, pt: Point3D): boolean {
  return isZero(distanceToPoint(pl, pt));
}
