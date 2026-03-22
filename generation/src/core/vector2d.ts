import { isZero } from './tolerance';

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export function vec2d(x: number, y: number): Vector2D {
  return { x, y };
}

export const X_AXIS_2D: Vector2D = vec2d(1, 0);
export const Y_AXIS_2D: Vector2D = vec2d(0, 1);

export function length2d(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function normalize2d(v: Vector2D): Vector2D {
  const len = length2d(v);
  if (isZero(len)) throw new Error('Cannot normalize zero vector');
  return vec2d(v.x / len, v.y / len);
}

export function add2d(a: Vector2D, b: Vector2D): Vector2D {
  return vec2d(a.x + b.x, a.y + b.y);
}

export function subtract2d(a: Vector2D, b: Vector2D): Vector2D {
  return vec2d(a.x - b.x, a.y - b.y);
}

export function scale2d(v: Vector2D, s: number): Vector2D {
  return vec2d(v.x * s, v.y * s);
}

export function dot2d(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y;
}

/** Rotate 90 degrees counter-clockwise: (x, y) -> (-y, x) */
export function perpendicular(v: Vector2D): Vector2D {
  return vec2d(-v.y, v.x);
}
