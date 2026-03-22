import { Point3D, ORIGIN, point3d } from './point3d';
import { Vector3D, X_AXIS, Y_AXIS, Z_AXIS, normalize, dot, scale } from './vector3d';
import { isZero } from './tolerance';

export interface Plane {
  readonly origin: Point3D;
  readonly normal: Vector3D;
  readonly xAxis: Vector3D;
}

export function plane(origin: Point3D, normal: Vector3D, xAxis: Vector3D): Plane {
  return { origin, normal: normalize(normal), xAxis: normalize(xAxis) };
}

export const XY_PLANE: Plane = plane(ORIGIN, Z_AXIS, X_AXIS);
export const XZ_PLANE: Plane = plane(ORIGIN, Y_AXIS, X_AXIS);
export const YZ_PLANE: Plane = plane(ORIGIN, X_AXIS, Y_AXIS);

/**
 * Returns the signed distance from the plane to the point.
 * Positive means the point is on the side the normal points to.
 */
export function distanceToPoint(pl: Plane, pt: Point3D): number {
  const dx = pt.x - pl.origin.x;
  const dy = pt.y - pl.origin.y;
  const dz = pt.z - pl.origin.z;
  return dot(pl.normal, { x: dx, y: dy, z: dz });
}

/**
 * Projects a point onto the plane along the plane normal.
 */
export function projectPoint(pl: Plane, pt: Point3D): Point3D {
  const dist = distanceToPoint(pl, pt);
  const offset = scale(pl.normal, dist);
  return point3d(pt.x - offset.x, pt.y - offset.y, pt.z - offset.z);
}

/**
 * Returns true if the point lies on the plane (within tolerance).
 */
export function containsPoint(pl: Plane, pt: Point3D): boolean {
  return isZero(distanceToPoint(pl, pt));
}
