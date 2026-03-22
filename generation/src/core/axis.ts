import { Point3D, ORIGIN } from './point3d';
import { Vector3D, X_AXIS, Y_AXIS, Z_AXIS, normalize } from './vector3d';

export interface Axis {
  readonly origin: Point3D;
  readonly direction: Vector3D;
}

export function axis(origin: Point3D, direction: Vector3D): Axis {
  return { origin, direction: normalize(direction) };
}

export const X_AXIS_3D: Axis = axis(ORIGIN, X_AXIS);
export const Y_AXIS_3D: Axis = axis(ORIGIN, Y_AXIS);
export const Z_AXIS_3D: Axis = axis(ORIGIN, Z_AXIS);
