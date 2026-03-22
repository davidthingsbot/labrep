import { isEqual } from './tolerance';

/**
 * An immutable point in 2D Cartesian space.
 */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Create a 2D point from coordinates.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns A new Point2D
 */
export function point2d(x: number, y: number): Point2D {
  return { x, y };
}

/**
 * The 2D origin point (0, 0).
 */
export const ORIGIN_2D: Point2D = point2d(0, 0);

/**
 * Compute the Euclidean distance between two 2D points.
 *
 * @param a - First point
 * @param b - Second point
 * @returns The straight-line distance between a and b
 */
export function distance2d(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the midpoint between two 2D points.
 *
 * @param a - First point
 * @param b - Second point
 * @returns The point equidistant from a and b
 */
export function midpoint2d(a: Point2D, b: Point2D): Point2D {
  return point2d((a.x + b.x) / 2, (a.y + b.y) / 2);
}

/**
 * Translate a 2D point by a vector.
 *
 * @param p - The point to translate
 * @param v - The displacement vector
 * @returns A new point offset from p by v
 */
export function addVector2d(p: Point2D, v: { x: number; y: number }): Point2D {
  return point2d(p.x + v.x, p.y + v.y);
}

/**
 * Compute the displacement vector from point b to point a (a - b).
 *
 * @param a - The target point
 * @param b - The origin point
 * @returns The vector from b to a
 */
export function subtractPoints2d(a: Point2D, b: Point2D): { x: number; y: number } {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Test whether two 2D points are equal within the default tolerance.
 *
 * @param a - First point
 * @param b - Second point
 * @returns True if both coordinates are equal within TOLERANCE
 */
export function points2dEqual(a: Point2D, b: Point2D): boolean {
  return isEqual(a.x, b.x) && isEqual(a.y, b.y);
}
