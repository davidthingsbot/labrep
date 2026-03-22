import { 
  Point2D, 
  point2d, 
  Vector2D,
  vec2d,
  isZero,
  distance2d,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A circular arc in 2D.
 * 
 * Parametrization: P(t) = center + radius * (cos(t), sin(t))
 * Parameter t ranges from startAngle to endAngle.
 * 
 * OCCT reference: Geom2d_TrimmedCurve wrapping Geom2d_Circle
 */
export interface Arc2D {
  readonly type: 'arc';
  
  /** Center of the underlying circle */
  readonly center: Point2D;
  
  /** Radius (always positive) */
  readonly radius: number;
  
  /** Start angle in radians */
  readonly startAngle: number;
  
  /** End angle in radians */
  readonly endAngle: number;
  
  /** Start of parameter range (equals startAngle) */
  readonly startParam: number;
  
  /** End of parameter range (equals endAngle) */
  readonly endParam: number;
  
  /** Always false for arcs */
  readonly isClosed: boolean;
  
  /** Point at start angle */
  readonly startPoint: Point2D;
  
  /** Point at end angle */
  readonly endPoint: Point2D;
}

/**
 * Normalize an angle to [0, 2π).
 */
function normalizeAngle(angle: number): number {
  const twoPi = 2 * Math.PI;
  let result = angle % twoPi;
  if (result < 0) result += twoPi;
  return result;
}

/**
 * Create an arc from center, radius, and angles.
 * 
 * @param center - Center point of the underlying circle
 * @param radius - Radius (must be positive)
 * @param startAngle - Start angle in radians
 * @param endAngle - End angle in radians (must differ from startAngle)
 * @returns Arc2D or failure
 */
export function makeArc2D(
  center: Point2D, 
  radius: number, 
  startAngle: number, 
  endAngle: number
): OperationResult<Arc2D> {
  if (radius <= 0 || isZero(radius)) {
    return failure('Radius must be positive');
  }
  
  // Check if angles are effectively equal (modulo 2π)
  const sweep = endAngle - startAngle;
  const normalizedSweep = normalizeAngle(sweep);
  if (isZero(normalizedSweep) || isZero(Math.abs(normalizedSweep - 2 * Math.PI))) {
    return failure('Start and end angles must be different');
  }
  
  // Keep original angles to preserve sweep direction
  // Only normalize for display/comparison when needed
  const startPoint = point2d(
    center.x + radius * Math.cos(startAngle),
    center.y + radius * Math.sin(startAngle)
  );
  
  const endPoint = point2d(
    center.x + radius * Math.cos(endAngle),
    center.y + radius * Math.sin(endAngle)
  );
  
  return success({
    type: 'arc',
    center,
    radius,
    startAngle,
    endAngle,
    startParam: startAngle,
    endParam: endAngle,
    isClosed: false,
    startPoint,
    endPoint,
  });
}

/**
 * Create an arc through three points.
 * 
 * The arc starts at p1, passes through p2, and ends at p3.
 * 
 * @param p1 - Start point
 * @param p2 - Point on the arc (determines direction)
 * @param p3 - End point
 * @returns Arc2D or failure if points are collinear or coincident
 */
export function makeArc2DThrough3Points(
  p1: Point2D, 
  p2: Point2D, 
  p3: Point2D
): OperationResult<Arc2D> {
  // Check for coincident points
  const d12 = distance2d(p1, p2);
  const d23 = distance2d(p2, p3);
  const d31 = distance2d(p3, p1);
  
  if (isZero(d12) || isZero(d23) || isZero(d31)) {
    return failure('Cannot create arc through coincident points');
  }
  
  // Find circumcenter using the same method as Circle2D
  const ax = 2 * (p2.x - p1.x);
  const ay = 2 * (p2.y - p1.y);
  const bx = 2 * (p3.x - p1.x);
  const by = 2 * (p3.y - p1.y);
  
  const c1 = p2.x * p2.x - p1.x * p1.x + p2.y * p2.y - p1.y * p1.y;
  const c2 = p3.x * p3.x - p1.x * p1.x + p3.y * p3.y - p1.y * p1.y;
  
  const det = ax * by - ay * bx;
  
  if (isZero(det)) {
    return failure('Cannot create arc through collinear points');
  }
  
  const cx = (c1 * by - c2 * ay) / det;
  const cy = (ax * c2 - bx * c1) / det;
  
  const center = point2d(cx, cy);
  const radius = distance2d(center, p1);
  
  // Calculate angles for each point
  const angle1 = Math.atan2(p1.y - cy, p1.x - cx);
  const angle2 = Math.atan2(p2.y - cy, p2.x - cx);
  const angle3 = Math.atan2(p3.y - cy, p3.x - cx);
  
  // Determine the direction of the arc
  // The arc goes from p1 through p2 to p3
  // We need to figure out if we go CCW or CW
  
  // Normalize all angles to [0, 2π)
  const a1 = normalizeAngle(angle1);
  const a2 = normalizeAngle(angle2);
  const a3 = normalizeAngle(angle3);
  
  // Check if going CCW from a1 to a3 passes through a2
  // or if going CW from a1 to a3 passes through a2
  
  const ccwTo3 = normalizeAngle(a3 - a1);
  const ccwTo2 = normalizeAngle(a2 - a1);
  
  let startAngle: number;
  let endAngle: number;
  
  if (ccwTo2 < ccwTo3) {
    // a2 is between a1 and a3 going CCW
    startAngle = a1;
    endAngle = a3;
  } else {
    // a2 is between a1 and a3 going CW, so we go the long way CCW
    // Or equivalently, we swap direction
    startAngle = a1;
    // Go CW, which means endAngle < startAngle in terms of parameter
    // We represent this by having endAngle = a3 but the arc goes "backwards"
    // Actually, let's just set the angles such that the arc goes CW
    // by making endAngle = a3 - 2π (or adjusting)
    endAngle = a3 < a1 ? a3 : a3 - 2 * Math.PI;
  }
  
  // Recompute start/end points to ensure they match p1 and p3
  return success({
    type: 'arc',
    center,
    radius,
    startAngle,
    endAngle,
    startParam: startAngle,
    endParam: endAngle,
    isClosed: false,
    startPoint: p1,
    endPoint: p3,
  });
}

/**
 * Create an arc from start point, end point, and bulge factor.
 * 
 * Bulge = tan(θ/4) where θ is the included angle.
 * Positive bulge = counter-clockwise arc.
 * Negative bulge = clockwise arc.
 * 
 * @param start - Start point
 * @param end - End point
 * @param bulge - Bulge factor (tan of quarter included angle)
 * @returns Arc2D or failure
 */
export function makeArc2DFromBulge(
  start: Point2D, 
  end: Point2D, 
  bulge: number
): OperationResult<Arc2D> {
  if (isZero(bulge)) {
    return failure('Bulge cannot be zero (use Line2D for straight segments)');
  }
  
  const chordDist = distance2d(start, end);
  
  if (isZero(chordDist)) {
    return failure('Cannot create arc from coincident points');
  }
  
  // Bulge = tan(θ/4), so θ = 4 * atan(bulge)
  const theta = 4 * Math.atan(Math.abs(bulge));
  
  // Sagitta (height of arc from chord midpoint)
  const sagitta = Math.abs(bulge) * chordDist / 2;
  
  // Radius from geometry: R = (s² + (c/2)²) / (2s)
  // where s = sagitta, c = chord length
  // Or: R = c / (2 * sin(θ/2))
  const radius = chordDist / (2 * Math.sin(theta / 2));
  
  // Find chord midpoint
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  
  // Chord direction (normalized)
  const chordDirX = (end.x - start.x) / chordDist;
  const chordDirY = (end.y - start.y) / chordDist;
  
  // Perpendicular to chord (points toward arc center)
  // For positive bulge (CCW), center is to the left of chord
  // For negative bulge (CW), center is to the right of chord
  const perpX = -chordDirY;
  const perpY = chordDirX;
  
  // Distance from chord midpoint to center
  const midToCenter = radius - sagitta;
  
  // Center position
  // For positive bulge, we go in the positive perpendicular direction
  // For negative bulge, we go in the negative perpendicular direction
  const sign = bulge > 0 ? 1 : -1;
  const centerX = midX + sign * perpX * midToCenter;
  const centerY = midY + sign * perpY * midToCenter;
  
  const center = point2d(centerX, centerY);
  
  // Calculate angles
  let startAngle = Math.atan2(start.y - centerY, start.x - centerX);
  let endAngle = Math.atan2(end.y - centerY, end.x - centerX);
  
  // For positive bulge (CCW), ensure endAngle > startAngle (going CCW)
  // For negative bulge (CW), ensure endAngle < startAngle (going CW)
  if (bulge > 0) {
    // CCW: if endAngle <= startAngle, add 2π to endAngle
    if (endAngle <= startAngle) {
      endAngle += 2 * Math.PI;
    }
  } else {
    // CW: if endAngle >= startAngle, subtract 2π from endAngle
    if (endAngle >= startAngle) {
      endAngle -= 2 * Math.PI;
    }
  }
  
  return success({
    type: 'arc',
    center,
    radius,
    startAngle,
    endAngle,
    startParam: startAngle,
    endParam: endAngle,
    isClosed: false,
    startPoint: start,
    endPoint: end,
  });
}

/**
 * Evaluate the arc at parameter t.
 * 
 * P(t) = center + radius * (cos(t), sin(t))
 * 
 * @param arc - The arc to evaluate
 * @param t - Parameter value (angle in radians)
 * @returns Point on the arc at parameter t
 */
export function evaluateArc2D(arc: Arc2D, t: number): Point2D {
  return point2d(
    arc.center.x + arc.radius * Math.cos(t),
    arc.center.y + arc.radius * Math.sin(t)
  );
}

/**
 * Get the unit tangent vector at parameter t.
 * 
 * @param arc - The arc
 * @param t - Parameter value (angle in radians)
 * @returns Unit tangent vector
 */
export function tangentArc2D(arc: Arc2D, t: number): Vector2D {
  // Same as circle: derivative of (cos(t), sin(t)) is (-sin(t), cos(t))
  return vec2d(-Math.sin(t), Math.cos(t));
}

/**
 * Get the arc length.
 * 
 * @param arc - The arc
 * @returns Arc length (|endAngle - startAngle| * radius)
 */
export function lengthArc2D(arc: Arc2D): number {
  return Math.abs(arc.endAngle - arc.startAngle) * arc.radius;
}

/**
 * Create a reversed copy of the arc.
 * 
 * @param arc - The arc to reverse
 * @returns A new Arc2D with swapped start/end
 */
export function reverseArc2D(arc: Arc2D): Arc2D {
  return {
    type: 'arc',
    center: arc.center,
    radius: arc.radius,
    startAngle: arc.endAngle,
    endAngle: arc.startAngle,
    startParam: arc.endAngle,
    endParam: arc.startAngle,
    isClosed: false,
    startPoint: arc.endPoint,
    endPoint: arc.startPoint,
  };
}
