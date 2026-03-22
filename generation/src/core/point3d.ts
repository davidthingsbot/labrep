import { isEqual } from './tolerance';

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function point3d(x: number, y: number, z: number): Point3D {
  return { x, y, z };
}

export const ORIGIN: Point3D = point3d(0, 0, 0);

export function distance(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function midpoint(a: Point3D, b: Point3D): Point3D {
  return point3d(
    (a.x + b.x) / 2,
    (a.y + b.y) / 2,
    (a.z + b.z) / 2,
  );
}

export function addVector(
  p: Point3D,
  v: { readonly x: number; readonly y: number; readonly z: number },
): Point3D {
  return point3d(p.x + v.x, p.y + v.y, p.z + v.z);
}

export function subtractPoints(
  a: Point3D,
  b: Point3D,
): { x: number; y: number; z: number } {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function pointsEqual(a: Point3D, b: Point3D): boolean {
  return isEqual(a.x, b.x) && isEqual(a.y, b.y) && isEqual(a.z, b.z);
}
