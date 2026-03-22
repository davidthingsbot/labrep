import { Point2D, point2d, isZero, TOLERANCE } from '../core';
import { Line2D } from './line2d';
import { Circle2D } from './circle2d';

/**
 * Result of a curve-curve intersection.
 */
export interface Intersection2D {
  /** The intersection point */
  point: Point2D;
  /** Parameter value on the first curve */
  paramOnCurve1: number;
  /** Parameter value on the second curve */
  paramOnCurve2: number;
}

/**
 * Find intersections between two lines (treated as infinite).
 * 
 * Lines are treated as infinite for intersection calculation.
 * The returned parameters may be outside [0, length] for the segments.
 * 
 * @param line1 - First line
 * @param line2 - Second line
 * @returns Array of intersections (0 or 1 for non-coincident lines)
 */
export function intersectLine2DLine2D(line1: Line2D, line2: Line2D): Intersection2D[] {
  // Line 1: P = O1 + t * D1
  // Line 2: P = O2 + s * D2
  // Solve: O1 + t * D1 = O2 + s * D2
  
  const o1 = line1.origin;
  const d1 = line1.direction;
  const o2 = line2.origin;
  const d2 = line2.direction;
  
  // Cross product of directions (2D: d1.x * d2.y - d1.y * d2.x)
  const cross = d1.x * d2.y - d1.y * d2.x;
  
  if (isZero(cross)) {
    // Lines are parallel or coincident
    // Check if they're coincident by seeing if o2 is on line1
    const toO2x = o2.x - o1.x;
    const toO2y = o2.y - o1.y;
    const crossToO2 = d1.x * toO2y - d1.y * toO2x;
    
    if (isZero(crossToO2)) {
      // Coincident lines - infinite intersections, return empty
      return [];
    }
    
    // Parallel, non-coincident - no intersection
    return [];
  }
  
  // Solve for t: t = ((o2 - o1) × d2) / (d1 × d2)
  const dx = o2.x - o1.x;
  const dy = o2.y - o1.y;
  
  const t = (dx * d2.y - dy * d2.x) / cross;
  const s = (dx * d1.y - dy * d1.x) / cross;
  
  const point = point2d(
    o1.x + t * d1.x,
    o1.y + t * d1.y
  );
  
  return [{
    point,
    paramOnCurve1: t,
    paramOnCurve2: s,
  }];
}

/**
 * Find intersections between a line and a circle.
 * 
 * @param line - The line (treated as infinite)
 * @param circle - The circle
 * @returns Array of intersections (0, 1, or 2)
 */
export function intersectLine2DCircle2D(line: Line2D, circle: Circle2D): Intersection2D[] {
  // Parametric line: P = O + t * D
  // Circle: |P - C|² = r²
  // Substitute: |O + t*D - C|² = r²
  // Let V = O - C
  // |V + t*D|² = r²
  // (V + t*D)·(V + t*D) = r²
  // V·V + 2t(V·D) + t²(D·D) = r²
  // Since D is unit: D·D = 1
  // t² + 2t(V·D) + (V·V - r²) = 0
  
  const vx = line.origin.x - circle.center.x;
  const vy = line.origin.y - circle.center.y;
  
  const dx = line.direction.x;
  const dy = line.direction.y;
  
  // Coefficients of quadratic: at² + bt + c = 0
  // a = 1 (D·D = 1)
  const b = 2 * (vx * dx + vy * dy);
  const c = vx * vx + vy * vy - circle.radius * circle.radius;
  
  const discriminant = b * b - 4 * c;
  
  if (discriminant < -TOLERANCE) {
    // No intersection
    return [];
  }
  
  const results: Intersection2D[] = [];
  
  if (Math.abs(discriminant) <= TOLERANCE) {
    // Tangent - one intersection
    const t = -b / 2;
    const point = point2d(
      line.origin.x + t * dx,
      line.origin.y + t * dy
    );
    
    // Parameter on circle is angle
    const angleOnCircle = Math.atan2(
      point.y - circle.center.y,
      point.x - circle.center.x
    );
    
    results.push({
      point,
      paramOnCurve1: t,
      paramOnCurve2: normalizeAngle(angleOnCircle),
    });
  } else {
    // Two intersections
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / 2;
    const t2 = (-b + sqrtDisc) / 2;
    
    for (const t of [t1, t2]) {
      const point = point2d(
        line.origin.x + t * dx,
        line.origin.y + t * dy
      );
      
      const angleOnCircle = Math.atan2(
        point.y - circle.center.y,
        point.x - circle.center.x
      );
      
      results.push({
        point,
        paramOnCurve1: t,
        paramOnCurve2: normalizeAngle(angleOnCircle),
      });
    }
  }
  
  return results;
}

/**
 * Find intersections between two circles.
 * 
 * @param circle1 - First circle
 * @param circle2 - Second circle
 * @returns Array of intersections (0, 1, or 2)
 */
export function intersectCircle2DCircle2D(circle1: Circle2D, circle2: Circle2D): Intersection2D[] {
  const c1 = circle1.center;
  const c2 = circle2.center;
  const r1 = circle1.radius;
  const r2 = circle2.radius;
  
  // Distance between centers
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  
  // Check for concentric circles
  if (isZero(d)) {
    // Concentric - no intersection (or infinite if same radius)
    return [];
  }
  
  // Check if circles are too far apart
  if (d > r1 + r2 + TOLERANCE) {
    return [];
  }
  
  // Check if one circle is inside the other (no intersection)
  if (d < Math.abs(r1 - r2) - TOLERANCE) {
    return [];
  }
  
  // From the geometry:
  // a = (d² + r1² - r2²) / (2d) = distance from c1 to the chord
  const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  
  // h = height from the line between centers to intersection points
  const h2 = r1 * r1 - a * a;
  
  // Handle tangent case
  if (h2 < -TOLERANCE) {
    return [];
  }
  
  const h = Math.sqrt(Math.max(0, h2));
  
  // Point P on the line between centers at distance a from c1
  const px = c1.x + a * dx / d;
  const py = c1.y + a * dy / d;
  
  // Unit perpendicular to the line between centers
  const perpX = -dy / d;
  const perpY = dx / d;
  
  const results: Intersection2D[] = [];
  
  if (h < TOLERANCE) {
    // Tangent - one intersection
    const point = point2d(px, py);
    
    results.push({
      point,
      paramOnCurve1: normalizeAngle(Math.atan2(point.y - c1.y, point.x - c1.x)),
      paramOnCurve2: normalizeAngle(Math.atan2(point.y - c2.y, point.x - c2.x)),
    });
  } else {
    // Two intersections
    const point1 = point2d(px + h * perpX, py + h * perpY);
    const point2 = point2d(px - h * perpX, py - h * perpY);
    
    for (const point of [point1, point2]) {
      results.push({
        point,
        paramOnCurve1: normalizeAngle(Math.atan2(point.y - c1.y, point.x - c1.x)),
        paramOnCurve2: normalizeAngle(Math.atan2(point.y - c2.y, point.x - c2.x)),
      });
    }
  }
  
  return results;
}

/**
 * Normalize angle to [0, 2π).
 */
function normalizeAngle(angle: number): number {
  const twoPi = 2 * Math.PI;
  let result = angle % twoPi;
  if (result < 0) result += twoPi;
  return result;
}
