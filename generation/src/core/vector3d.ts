import { isZero } from './tolerance';

export interface Vector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function vec3d(x: number, y: number, z: number): Vector3D {
  return { x, y, z };
}

export const X_AXIS: Vector3D = vec3d(1, 0, 0);
export const Y_AXIS: Vector3D = vec3d(0, 1, 0);
export const Z_AXIS: Vector3D = vec3d(0, 0, 1);

export function length(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalize(v: Vector3D): Vector3D {
  const len = length(v);
  if (isZero(len)) return vec3d(0, 0, 0);
  return vec3d(v.x / len, v.y / len, v.z / len);
}

export function add(a: Vector3D, b: Vector3D): Vector3D {
  return vec3d(a.x + b.x, a.y + b.y, a.z + b.z);
}

export function subtract(a: Vector3D, b: Vector3D): Vector3D {
  return vec3d(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function scale(v: Vector3D, s: number): Vector3D {
  return vec3d(v.x * s, v.y * s, v.z * s);
}

export function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vector3D, b: Vector3D): Vector3D {
  return vec3d(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

export function negate(v: Vector3D): Vector3D {
  return vec3d(-v.x, -v.y, -v.z);
}
