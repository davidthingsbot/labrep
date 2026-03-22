import { isEqual } from './tolerance';

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export function point2d(x: number, y: number): Point2D {
  return { x, y };
}

export const ORIGIN_2D: Point2D = point2d(0, 0);

export function distance2d(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function midpoint2d(a: Point2D, b: Point2D): Point2D {
  return point2d((a.x + b.x) / 2, (a.y + b.y) / 2);
}

export function addVector2d(p: Point2D, v: { x: number; y: number }): Point2D {
  return point2d(p.x + v.x, p.y + v.y);
}

export function subtractPoints2d(a: Point2D, b: Point2D): { x: number; y: number } {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function points2dEqual(a: Point2D, b: Point2D): boolean {
  return isEqual(a.x, b.x) && isEqual(a.y, b.y);
}
