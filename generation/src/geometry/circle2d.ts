import { 
  Point2D, 
  point2d, 
  Vector2D,
  vec2d,
  isZero,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A full circle in 2D.
 * 
 * Parametrization: P(t) = center + radius * (cos(t), sin(t))
 * Parameter t ranges from 0 to 2π.
 * 
 * OCCT reference: Geom2d_Circle
 */
export interface Circle2D {
  readonly type: 'circle';
  
  /** Center point */
  readonly center: Point2D;
  
  /** Radius (always positive) */
  readonly radius: number;
  
  /** Start of parameter range (0) */
  readonly startParam: number;
  
  /** End of parameter range (2π) */
  readonly endParam: number;
  
  /** Always true for circles */
  readonly isClosed: boolean;
  
  /** Point at parameter 0 */
  readonly startPoint: Point2D;
  
  /** Point at parameter 2π (same as startPoint) */
  readonly endPoint: Point2D;
}

/**
 * Create a circle from center point and radius.
 * 
 * @param center - Center point of the circle
 * @param radius - Radius (must be positive)
 * @returns Circle2D or failure if radius is not positive
 */
export function makeCircle2D(center: Point2D, radius: number): OperationResult<Circle2D> {
  if (radius <= 0 || isZero(radius)) {
    return failure('Radius must be positive');
  }
  
  const startPoint = point2d(center.x + radius, center.y);
  
  return success({
    type: 'circle',
    center,
    radius,
    startParam: 0,
    endParam: 2 * Math.PI,
    isClosed: true,
    startPoint,
    endPoint: startPoint, // Same as startPoint for closed curve
  });
}

/**
 * Create a circle through three points.
 * 
 * The three points must not be collinear.
 * 
 * @param p1 - First point on the circle
 * @param p2 - Second point on the circle
 * @param p3 - Third point on the circle
 * @returns Circle2D or failure if points are collinear or coincident
 */
export function makeCircle2DThrough3Points(
  p1: Point2D, 
  p2: Point2D, 
  p3: Point2D
): OperationResult<Circle2D> {
  // Check for coincident points
  const d12 = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  const d23 = Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);
  const d31 = Math.sqrt((p1.x - p3.x) ** 2 + (p1.y - p3.y) ** 2);
  
  if (isZero(d12) || isZero(d23) || isZero(d31)) {
    return failure('Cannot create circle through coincident points');
  }
  
  // Use the circumcenter formula
  // The center is equidistant from all three points
  // Solve the system:
  //   (x - p1.x)² + (y - p1.y)² = (x - p2.x)² + (y - p2.y)²
  //   (x - p1.x)² + (y - p1.y)² = (x - p3.x)² + (y - p3.y)²
  
  // Expanding and simplifying gives two linear equations:
  // 2(p2.x - p1.x)x + 2(p2.y - p1.y)y = p2.x² - p1.x² + p2.y² - p1.y²
  // 2(p3.x - p1.x)x + 2(p3.y - p1.y)y = p3.x² - p1.x² + p3.y² - p1.y²
  
  const ax = 2 * (p2.x - p1.x);
  const ay = 2 * (p2.y - p1.y);
  const bx = 2 * (p3.x - p1.x);
  const by = 2 * (p3.y - p1.y);
  
  const c1 = p2.x * p2.x - p1.x * p1.x + p2.y * p2.y - p1.y * p1.y;
  const c2 = p3.x * p3.x - p1.x * p1.x + p3.y * p3.y - p1.y * p1.y;
  
  // Solve using Cramer's rule
  const det = ax * by - ay * bx;
  
  if (isZero(det)) {
    return failure('Cannot create circle through collinear points');
  }
  
  const cx = (c1 * by - c2 * ay) / det;
  const cy = (ax * c2 - bx * c1) / det;
  
  const center = point2d(cx, cy);
  const radius = Math.sqrt((p1.x - cx) ** 2 + (p1.y - cy) ** 2);
  
  return makeCircle2D(center, radius);
}

/**
 * Evaluate the circle at parameter t.
 * 
 * P(t) = center + radius * (cos(t), sin(t))
 * 
 * @param circle - The circle to evaluate
 * @param t - Parameter value in radians
 * @returns Point on the circle at parameter t
 */
export function evaluateCircle2D(circle: Circle2D, t: number): Point2D {
  return point2d(
    circle.center.x + circle.radius * Math.cos(t),
    circle.center.y + circle.radius * Math.sin(t)
  );
}

/**
 * Get the unit tangent vector at parameter t.
 * 
 * The tangent points in the direction of increasing parameter (counter-clockwise).
 * d/dt(cos(t), sin(t)) = (-sin(t), cos(t))
 * 
 * @param circle - The circle
 * @param t - Parameter value in radians
 * @returns Unit tangent vector
 */
export function tangentCircle2D(circle: Circle2D, t: number): Vector2D {
  // Derivative of (cos(t), sin(t)) is (-sin(t), cos(t))
  // This is already a unit vector
  return vec2d(-Math.sin(t), Math.cos(t));
}

/**
 * Get the circumference of the circle.
 * 
 * @param circle - The circle
 * @returns Circumference (2πr)
 */
export function lengthCircle2D(circle: Circle2D): number {
  return 2 * Math.PI * circle.radius;
}
