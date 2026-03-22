import { isZero } from './tolerance';

/**
 * An immutable vector in 2D Cartesian space.
 */
export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Create a 2D vector from components.
 *
 * @param x - X component
 * @param y - Y component
 * @returns A new Vector2D
 */
export function vec2d(x: number, y: number): Vector2D {
  return { x, y };
}

/** Unit vector along the positive X axis in 2D. */
export const X_AXIS_2D: Vector2D = vec2d(1, 0);

/** Unit vector along the positive Y axis in 2D. */
export const Y_AXIS_2D: Vector2D = vec2d(0, 1);

/**
 * Compute the Euclidean length (magnitude) of a 2D vector.
 *
 * @param v - The vector
 * @returns The length of v
 */
export function length2d(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Return a unit vector in the same direction as v.
 * Throws if v is effectively zero-length.
 *
 * @param v - The vector to normalize
 * @returns A unit vector parallel to v
 * @throws Error if the vector length is near zero
 */
export function normalize2d(v: Vector2D): Vector2D {
  const len = length2d(v);
  if (isZero(len)) throw new Error('Cannot normalize zero vector');
  return vec2d(v.x / len, v.y / len);
}

/**
 * Add two 2D vectors component-wise.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The sum a + b
 */
export function add2d(a: Vector2D, b: Vector2D): Vector2D {
  return vec2d(a.x + b.x, a.y + b.y);
}

/**
 * Subtract vector b from vector a component-wise.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The difference a - b
 */
export function subtract2d(a: Vector2D, b: Vector2D): Vector2D {
  return vec2d(a.x - b.x, a.y - b.y);
}

/**
 * Scale a 2D vector by a scalar factor.
 *
 * @param v - The vector to scale
 * @param s - The scalar multiplier
 * @returns A new vector with each component multiplied by s
 */
export function scale2d(v: Vector2D, s: number): Vector2D {
  return vec2d(v.x * s, v.y * s);
}

/**
 * Compute the dot product of two 2D vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The scalar dot product a . b
 */
export function dot2d(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Rotate a vector 90 degrees counter-clockwise: (x, y) -> (-y, x).
 *
 * @param v - The vector to rotate
 * @returns A new vector perpendicular to v (CCW rotation)
 */
export function perpendicular(v: Vector2D): Vector2D {
  return vec2d(-v.y, v.x);
}
