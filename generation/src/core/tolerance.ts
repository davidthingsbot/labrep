// Tolerance utilities for floating-point comparisons

export const TOLERANCE = 1e-7;

export function isZero(value: number, tol: number = TOLERANCE): boolean {
  return Math.abs(value) <= tol;
}

export function isEqual(a: number, b: number, tol: number = TOLERANCE): boolean {
  return isZero(a - b, tol);
}
