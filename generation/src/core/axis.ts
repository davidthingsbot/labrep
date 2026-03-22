import { Point3D, ORIGIN } from './point3d';
import { Vector3D, X_AXIS, Y_AXIS, Z_AXIS, normalize } from './vector3d';

/**
 * An infinite directed line in 3D space, defined by an origin point and a
 * unit direction vector.
 */
export interface Axis {
  readonly origin: Point3D;
  readonly direction: Vector3D;
}

/**
 * Creates an axis from an origin point and a direction vector.
 * The direction is normalized automatically.
 *
 * @param origin - A point on the axis
 * @param direction - The axis direction (will be normalized)
 * @returns A new Axis with a unit direction vector
 */
export function axis(origin: Point3D, direction: Vector3D): Axis {
  return { origin, direction: normalize(direction) };
}

/** The global X axis through the origin. */
export const X_AXIS_3D: Axis = axis(ORIGIN, X_AXIS);
/** The global Y axis through the origin. */
export const Y_AXIS_3D: Axis = axis(ORIGIN, Y_AXIS);
/** The global Z axis through the origin. */
export const Z_AXIS_3D: Axis = axis(ORIGIN, Z_AXIS);
