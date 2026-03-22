// Tolerance utilities for floating-point comparisons

/**
 * Default absolute tolerance for floating-point comparisons (1e-7).
 */
export const TOLERANCE = 1e-7;

/**
 * Check whether a value is effectively zero within a tolerance.
 *
 * @param value - The value to test
 * @param tol - Absolute tolerance threshold (defaults to TOLERANCE)
 * @returns True if |value| <= tol
 */
export function isZero(value: number, tol: number = TOLERANCE): boolean {
  return Math.abs(value) <= tol;
}

/**
 * Check whether two numbers are equal within a tolerance.
 *
 * @param a - First value
 * @param b - Second value
 * @param tol - Absolute tolerance threshold (defaults to TOLERANCE)
 * @returns True if |a - b| <= tol
 */
export function isEqual(a: number, b: number, tol: number = TOLERANCE): boolean {
  return isZero(a - b, tol);
}
