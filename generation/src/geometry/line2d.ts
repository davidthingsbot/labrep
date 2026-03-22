import { 
  Point2D, 
  point2d, 
  distance2d, 
  addVector2d,
  Vector2D,
  vec2d,
  length2d,
  normalize2d,
  scale2d,
  isZero,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A 2D line segment defined by origin point and unit direction.
 * 
 * Parametrization: P(t) = origin + t * direction
 * For a segment from start to end, t ranges from 0 to length.
 * 
 * OCCT reference: Geom2d_Line
 */
export interface Line2D {
  readonly type: 'line';
  
  /** Origin point (start of segment) */
  readonly origin: Point2D;
  
  /** Unit direction vector */
  readonly direction: Vector2D;
  
  /** Length of the line segment */
  readonly segmentLength: number;
  
  /** Start of parameter range (always 0) */
  readonly startParam: number;
  
  /** End of parameter range (equals segmentLength) */
  readonly endParam: number;
  
  /** Always false for lines */
  readonly isClosed: boolean;
  
  /** Point at start of segment */
  readonly startPoint: Point2D;
  
  /** Point at end of segment */
  readonly endPoint: Point2D;
}

/**
 * Create a line segment from two points.
 * 
 * @param start - Start point of the segment
 * @param end - End point of the segment
 * @returns Line2D or failure if points are coincident
 */
export function makeLine2D(start: Point2D, end: Point2D): OperationResult<Line2D> {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  if (isZero(len)) {
    return failure('Cannot create line from coincident points');
  }
  
  const direction = vec2d(dx / len, dy / len);
  
  return success(createLine2D(start, direction, len, end));
}

/**
 * Create a line from a point and direction vector.
 * 
 * Creates a unit-length segment in the given direction.
 * 
 * @param origin - Origin point
 * @param direction - Direction vector (will be normalized)
 * @returns Line2D or failure if direction is zero vector
 */
export function makeLine2DFromPointDir(
  origin: Point2D, 
  direction: Vector2D
): OperationResult<Line2D> {
  const len = length2d(direction);
  
  if (isZero(len)) {
    return failure('Cannot create line from zero direction vector');
  }
  
  const normalizedDir = normalize2d(direction);
  const endPoint = point2d(origin.x + normalizedDir.x, origin.y + normalizedDir.y);
  
  return success(createLine2D(origin, normalizedDir, 1, endPoint));
}

/**
 * Internal constructor for Line2D.
 */
function createLine2D(
  origin: Point2D,
  direction: Vector2D,
  segmentLength: number,
  endPoint: Point2D
): Line2D {
  return {
    type: 'line',
    origin,
    direction,
    segmentLength,
    startParam: 0,
    endParam: segmentLength,
    isClosed: false,
    startPoint: origin,
    endPoint,
  };
}

/**
 * Evaluate the line at parameter t.
 * 
 * P(t) = origin + t * direction
 * 
 * @param line - The line to evaluate
 * @param t - Parameter value (0 = start, length = end)
 * @returns Point on the line at parameter t
 */
export function evaluateLine2D(line: Line2D, t: number): Point2D {
  return point2d(
    line.origin.x + t * line.direction.x,
    line.origin.y + t * line.direction.y
  );
}

/**
 * Get the tangent vector at parameter t.
 * 
 * For a line, the tangent is constant and equals the direction.
 * 
 * @param line - The line
 * @param t - Parameter value (unused for lines)
 * @returns Unit tangent vector (same as direction)
 */
export function tangentLine2D(line: Line2D, t: number): Vector2D {
  return line.direction;
}

/**
 * Get the length of the line segment.
 * 
 * @param line - The line
 * @returns Length of the segment
 */
export function lengthLine2D(line: Line2D): number {
  return line.segmentLength;
}

/**
 * Create a reversed copy of the line.
 * 
 * The reversed line has the same geometry but opposite direction,
 * with start and end points swapped.
 * 
 * @param line - The line to reverse
 * @returns A new Line2D with reversed direction
 */
export function reverseLine2D(line: Line2D): Line2D {
  const newDirection = vec2d(-line.direction.x, -line.direction.y);
  
  return {
    type: 'line',
    origin: line.endPoint,
    direction: newDirection,
    segmentLength: line.segmentLength,
    startParam: 0,
    endParam: line.segmentLength,
    isClosed: false,
    startPoint: line.endPoint,
    endPoint: line.startPoint,
  };
}
