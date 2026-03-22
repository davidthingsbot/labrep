import { isEqual } from './tolerance';

/**
 * An immutable point in 3D Cartesian space.
 */
export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Create a 3D point from coordinates.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns A new Point3D
 */
export function point3d(x: number, y: number, z: number): Point3D {
  return { x, y, z };
}

/**
 * The origin point (0, 0, 0).
 */
export const ORIGIN: Point3D = point3d(0, 0, 0);

/**
 * Compute the Euclidean distance between two 3D points.
 *
 * @param a - First point
 * @param b - Second point
 * @returns The straight-line distance between a and b
 */
export function distance(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compute the midpoint between two 3D points.
 *
 * @param a - First point
 * @param b - Second point
 * @returns The point equidistant from a and b
 */
export function midpoint(a: Point3D, b: Point3D): Point3D {
  return point3d(
    (a.x + b.x) / 2,
    (a.y + b.y) / 2,
    (a.z + b.z) / 2,
  );
}

/**
 * Translate a point by a vector.
 *
 * @param p - The point to translate
 * @param v - The displacement vector
 * @returns A new point offset from p by v
 */
export function addVector(
  p: Point3D,
  v: { readonly x: number; readonly y: number; readonly z: number },
): Point3D {
  return point3d(p.x + v.x, p.y + v.y, p.z + v.z);
}

/**
 * Compute the displacement vector from point b to point a (a - b).
 *
 * @param a - The target point
 * @param b - The origin point
 * @returns The vector from b to a
 */
export function subtractPoints(
  a: Point3D,
  b: Point3D,
): { x: number; y: number; z: number } {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Test whether two 3D points are equal within the default tolerance.
 *
 * @param a - First point
 * @param b - Second point
 * @returns True if all coordinates are equal within TOLERANCE
 */
export function pointsEqual(a: Point3D, b: Point3D): boolean {
  return isEqual(a.x, b.x) && isEqual(a.y, b.y) && isEqual(a.z, b.z);
}
