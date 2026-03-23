import { Point2D } from '../core/point2d';
import { Wire2D } from '../geometry/wire2d';
import { Line2D, evaluateLine2D } from '../geometry/line2d';
import { Arc2D, evaluateArc2D } from '../geometry/arc2d';
import { Circle2D, evaluateCircle2D } from '../geometry/circle2d';
import { Curve2D } from '../geometry/wire2d';

/**
 * A closed 2D profile suitable for extrusion or revolution.
 * The outer boundary winds counter-clockwise (positive area).
 * Holes wind clockwise (negative area).
 */
export interface Profile2D {
  /** Outer boundary (counter-clockwise). */
  readonly outer: Wire2D;
  /** Inner boundaries / holes (clockwise). */
  readonly holes: readonly Wire2D[];
}

/**
 * Sample points along a curve for area/containment calculations.
 */
function sampleCurvePoints(curve: Curve2D, segments: number = 32): Point2D[] {
  const pts: Point2D[] = [];
  switch (curve.type) {
    case 'line': {
      for (let i = 0; i <= segments; i++) {
        const t = curve.startParam + (i / segments) * (curve.endParam - curve.startParam);
        pts.push(evaluateLine2D(curve, t));
      }
      break;
    }
    case 'arc': {
      for (let i = 0; i <= segments; i++) {
        const t = curve.startAngle + (i / segments) * (curve.endAngle - curve.startAngle);
        pts.push(evaluateArc2D(curve, t));
      }
      break;
    }
    case 'circle': {
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * 2 * Math.PI;
        pts.push(evaluateCircle2D(curve, t));
      }
      break;
    }
  }
  return pts;
}

/**
 * Sample all points along a wire.
 */
function sampleWirePoints(wire: Wire2D, segmentsPerCurve: number = 32): Point2D[] {
  const pts: Point2D[] = [];
  for (const curve of wire.curves) {
    const curvePts = sampleCurvePoints(curve, segmentsPerCurve);
    // Skip first point of subsequent curves to avoid duplication at joints
    if (pts.length > 0) {
      pts.push(...curvePts.slice(1));
    } else {
      pts.push(...curvePts);
    }
  }
  return pts;
}

/**
 * Compute the signed area of a closed polygon using the shoelace formula.
 * Positive = counter-clockwise, negative = clockwise.
 */
function shoelaceArea(points: Point2D[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

/**
 * Compute the signed area of a profile's outer boundary.
 * Positive = counter-clockwise (valid outer boundary).
 * Negative = clockwise (hole or inverted).
 *
 * @param profile - The profile to measure
 * @returns Signed area (positive for CCW outer boundary)
 */
export function profileArea(profile: Profile2D): number {
  const points = sampleWirePoints(profile.outer);
  return shoelaceArea(points);
}

/**
 * Compute the signed area of a wire.
 * Positive = counter-clockwise, negative = clockwise.
 *
 * @param wire - A closed wire
 * @returns Signed area
 */
export function wireSignedArea(wire: Wire2D): number {
  const points = sampleWirePoints(wire);
  return shoelaceArea(points);
}

/**
 * Check if a point is inside a closed polygon using ray casting.
 */
function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygon[i].y;
    const yj = polygon[j].y;
    const xi = polygon[i].x;
    const xj = polygon[j].x;
    if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if a point is inside a profile (considering holes).
 * A point inside the outer boundary but inside a hole returns false.
 *
 * @param profile - The profile to test against
 * @param point - The point to test
 * @returns True if the point is inside the profile (not in a hole)
 */
export function profileContainsPoint(profile: Profile2D, point: Point2D): boolean {
  const outerPts = sampleWirePoints(profile.outer);
  if (!pointInPolygon(point, outerPts)) return false;
  for (const hole of profile.holes) {
    const holePts = sampleWirePoints(hole);
    if (pointInPolygon(point, holePts)) return false;
  }
  return true;
}
