import { isZero } from './tolerance';

/**
 * An immutable vector in 3D Cartesian space.
 */
export interface Vector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Create a 3D vector from components.
 *
 * @param x - X component
 * @param y - Y component
 * @param z - Z component
 * @returns A new Vector3D
 */
export function vec3d(x: number, y: number, z: number): Vector3D {
  return { x, y, z };
}

/** Unit vector along the positive X axis. */
export const X_AXIS: Vector3D = vec3d(1, 0, 0);

/** Unit vector along the positive Y axis. */
export const Y_AXIS: Vector3D = vec3d(0, 1, 0);

/** Unit vector along the positive Z axis. */
export const Z_AXIS: Vector3D = vec3d(0, 0, 1);

/**
 * Compute the Euclidean length (magnitude) of a vector.
 *
 * @param v - The vector
 * @returns The length of v
 */
export function length(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Return a unit vector in the same direction as v.
 * If v is effectively zero-length, returns the zero vector.
 *
 * @param v - The vector to normalize
 * @returns A unit vector parallel to v, or (0,0,0) if v is near-zero
 */
export function normalize(v: Vector3D): Vector3D {
  const len = length(v);
  if (isZero(len)) return vec3d(0, 0, 0);
  return vec3d(v.x / len, v.y / len, v.z / len);
}

/**
 * Add two vectors component-wise.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The sum a + b
 */
export function add(a: Vector3D, b: Vector3D): Vector3D {
  return vec3d(a.x + b.x, a.y + b.y, a.z + b.z);
}

/**
 * Subtract vector b from vector a component-wise.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The difference a - b
 */
export function subtract(a: Vector3D, b: Vector3D): Vector3D {
  return vec3d(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Scale a vector by a scalar factor.
 *
 * @param v - The vector to scale
 * @param s - The scalar multiplier
 * @returns A new vector with each component multiplied by s
 */
export function scale(v: Vector3D, s: number): Vector3D {
  return vec3d(v.x * s, v.y * s, v.z * s);
}

/**
 * Compute the dot product of two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The scalar dot product a . b
 */
export function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Compute the cross product of two vectors (right-hand rule).
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The vector a x b, perpendicular to both a and b
 */
export function cross(a: Vector3D, b: Vector3D): Vector3D {
  return vec3d(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

/**
 * Negate a vector, reversing its direction.
 *
 * @param v - The vector to negate
 * @returns A new vector pointing in the opposite direction
 */
export function negate(v: Vector3D): Vector3D {
  return vec3d(-v.x, -v.y, -v.z);
}

/**
 * Compute the angle between two vectors in radians.
 *
 * Uses the formula: angle = acos(a·b / (|a||b|))
 * Returns 0 for zero-length vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Angle in radians [0, π]
 */
export function angle(a: Vector3D, b: Vector3D): number {
  const lenA = length(a);
  const lenB = length(b);
  
  if (isZero(lenA) || isZero(lenB)) {
    return 0;
  }
  
  // Clamp to handle floating-point errors that might make |cosAngle| > 1
  const cosAngle = dot(a, b) / (lenA * lenB);
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
  
  return Math.acos(clampedCos);
}

/**
 * Check if two vectors are parallel (same or opposite direction).
 *
 * Vectors are parallel if their cross product is zero (within tolerance).
 * Zero vectors are considered parallel to all vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @param tolerance - Angular tolerance (default: system tolerance)
 * @returns True if vectors are parallel
 */
export function isParallel(a: Vector3D, b: Vector3D, tolerance: number = 1e-7): boolean {
  const lenA = length(a);
  const lenB = length(b);
  
  // Zero vectors are parallel to everything
  if (isZero(lenA) || isZero(lenB)) {
    return true;
  }
  
  // Cross product magnitude / (lenA * lenB) = sin(angle)
  // For parallel vectors, sin(angle) ≈ 0
  const c = cross(a, b);
  const crossMag = length(c);
  const sinAngle = crossMag / (lenA * lenB);
  
  return sinAngle <= tolerance;
}

/**
 * Check if two vectors are perpendicular (normal to each other).
 *
 * Vectors are perpendicular if their dot product is zero (within tolerance).
 * Zero vectors are considered perpendicular to all vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @param tolerance - Tolerance for dot product comparison (default: system tolerance)
 * @returns True if vectors are perpendicular
 */
export function isNormal(a: Vector3D, b: Vector3D, tolerance: number = 1e-7): boolean {
  const lenA = length(a);
  const lenB = length(b);
  
  // Zero vectors are perpendicular to everything (dot product is 0)
  if (isZero(lenA) || isZero(lenB)) {
    return true;
  }
  
  // Normalize the dot product for scale-independent comparison
  const d = dot(a, b);
  const cosAngle = Math.abs(d) / (lenA * lenB);
  
  return cosAngle <= tolerance;
}
