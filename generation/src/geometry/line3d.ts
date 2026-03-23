import { Point3D, point3d, Vector3D, vec3d, isZero, distance } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A 3D line segment defined by origin point and unit direction.
 *
 * Parametrization: P(t) = origin + t * direction
 * For a segment from start to end, t ranges from 0 to segmentLength.
 *
 * OCCT reference: Geom_Line (bounded by parameter range)
 */
export interface Line3D {
  readonly type: 'line3d';

  /** Origin point (start of segment) */
  readonly origin: Point3D;

  /** Unit direction vector */
  readonly direction: Vector3D;

  /** Length of the line segment */
  readonly segmentLength: number;

  /** Start of parameter range (always 0) */
  readonly startParam: number;

  /** End of parameter range (equals segmentLength) */
  readonly endParam: number;

  /** Always false for lines */
  readonly isClosed: boolean;

  /** Point at start of segment */
  readonly startPoint: Point3D;

  /** Point at end of segment */
  readonly endPoint: Point3D;
}

/**
 * Create a line segment from two points.
 *
 * @param start - Start point of the segment
 * @param end - End point of the segment
 * @returns Line3D or failure if points are coincident
 */
export function makeLine3D(start: Point3D, end: Point3D): OperationResult<Line3D> {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (isZero(len)) {
    return failure('Cannot create line from coincident points');
  }

  const direction = vec3d(dx / len, dy / len, dz / len);

  return success(createLine3D(start, direction, len, end));
}

/**
 * Create a line from a point, direction vector, and length.
 *
 * @param origin - Origin point
 * @param direction - Direction vector (will be normalized)
 * @param length - Length of the segment (must be positive)
 * @returns Line3D or failure if direction is zero or length non-positive
 */
export function makeLine3DFromPointDir(
  origin: Point3D,
  direction: Vector3D,
  length: number,
): OperationResult<Line3D> {
  const dirLen = Math.sqrt(
    direction.x * direction.x + direction.y * direction.y + direction.z * direction.z,
  );

  if (isZero(dirLen)) {
    return failure('Cannot create line from zero direction vector');
  }

  if (length <= 0 || isZero(length)) {
    return failure('Length must be positive');
  }

  const normalizedDir = vec3d(direction.x / dirLen, direction.y / dirLen, direction.z / dirLen);

  const endPoint = point3d(
    origin.x + normalizedDir.x * length,
    origin.y + normalizedDir.y * length,
    origin.z + normalizedDir.z * length,
  );

  return success(createLine3D(origin, normalizedDir, length, endPoint));
}

/**
 * Internal constructor for Line3D.
 */
function createLine3D(
  origin: Point3D,
  direction: Vector3D,
  segmentLength: number,
  endPoint: Point3D,
): Line3D {
  return {
    type: 'line3d',
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
 * @param t - Parameter value (0 = start, segmentLength = end)
 * @returns Point on the line at parameter t
 */
export function evaluateLine3D(line: Line3D, t: number): Point3D {
  return point3d(
    line.origin.x + t * line.direction.x,
    line.origin.y + t * line.direction.y,
    line.origin.z + t * line.direction.z,
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
export function tangentLine3D(line: Line3D, t: number): Vector3D {
  return line.direction;
}

/**
 * Get the length of the line segment.
 *
 * @param line - The line
 * @returns Length of the segment
 */
export function lengthLine3D(line: Line3D): number {
  return line.segmentLength;
}

/**
 * Create a reversed copy of the line.
 *
 * The reversed line has the same geometry but opposite direction,
 * with start and end points swapped.
 *
 * @param line - The line to reverse
 * @returns A new Line3D with reversed direction
 */
export function reverseLine3D(line: Line3D): Line3D {
  const newDirection = vec3d(-line.direction.x, -line.direction.y, -line.direction.z);

  return {
    type: 'line3d',
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
