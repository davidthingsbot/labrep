import { Point3D, point3d, Vector3D, vec3d, Plane, isZero, cross, normalize } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A full circle in 3D space.
 *
 * The circle lies in the given plane, centered at plane.origin.
 * Parametrization: P(θ) = center + r*cos(θ)*xAxis + r*sin(θ)*yAxis
 * where yAxis = normalize(cross(normal, xAxis))
 * θ ranges from 0 to 2π.
 *
 * OCCT reference: Geom_Circle
 */
export interface Circle3D {
  readonly type: 'circle3d';

  /** The plane containing the circle (center = plane.origin) */
  readonly plane: Plane;

  /** Radius (always positive) */
  readonly radius: number;

  /** Start of parameter range (0) */
  readonly startParam: number;

  /** End of parameter range (2π) */
  readonly endParam: number;

  /** Always true for circles */
  readonly isClosed: boolean;

  /** Point at parameter 0 */
  readonly startPoint: Point3D;

  /** Point at parameter 2π (same as startPoint) */
  readonly endPoint: Point3D;
}

/**
 * Compute the Y-axis of a plane (perpendicular to both normal and xAxis).
 * This is used for the circle parametrization.
 */
function planeYAxis(p: Plane): Vector3D {
  // yAxis = normalize(cross(normal, xAxis))
  const crossed = cross(p.normal, p.xAxis);
  return normalize(crossed);
}

/**
 * Create a circle in 3D space on a given plane.
 *
 * @param plane - The plane containing the circle (center = plane.origin)
 * @param radius - Radius (must be positive)
 * @returns Circle3D or failure if radius is not positive
 */
export function makeCircle3D(plane: Plane, radius: number): OperationResult<Circle3D> {
  if (radius <= 0 || isZero(radius)) {
    return failure('Radius must be positive');
  }

  // Validate plane has non-zero normal
  const normalLen = Math.sqrt(
    plane.normal.x * plane.normal.x +
    plane.normal.y * plane.normal.y +
    plane.normal.z * plane.normal.z
  );
  if (isZero(normalLen)) {
    return failure('Plane normal must be non-zero');
  }

  // Start point is at θ=0: center + radius * xAxis
  const startPoint = point3d(
    plane.origin.x + radius * plane.xAxis.x,
    plane.origin.y + radius * plane.xAxis.y,
    plane.origin.z + radius * plane.xAxis.z,
  );

  return success({
    type: 'circle3d',
    plane,
    radius,
    startParam: 0,
    endParam: 2 * Math.PI,
    isClosed: true,
    startPoint,
    endPoint: startPoint, // Same as startPoint for closed curve
  });
}

/**
 * Evaluate the circle at parameter θ.
 *
 * P(θ) = center + radius * (cos(θ) * xAxis + sin(θ) * yAxis)
 *
 * @param circle - The circle to evaluate
 * @param theta - Parameter value in radians
 * @returns Point on the circle at parameter θ
 */
export function evaluateCircle3D(circle: Circle3D, theta: number): Point3D {
  const { plane, radius } = circle;
  const yAxis = planeYAxis(plane);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  return point3d(
    plane.origin.x + radius * (cosT * plane.xAxis.x + sinT * yAxis.x),
    plane.origin.y + radius * (cosT * plane.xAxis.y + sinT * yAxis.y),
    plane.origin.z + radius * (cosT * plane.xAxis.z + sinT * yAxis.z),
  );
}

/**
 * Get the unit tangent vector at parameter θ.
 *
 * The tangent points in the direction of increasing parameter (CCW when
 * viewed from the direction of the plane's normal).
 *
 * d/dθ(cos(θ)*xAxis + sin(θ)*yAxis) = -sin(θ)*xAxis + cos(θ)*yAxis
 *
 * @param circle - The circle
 * @param theta - Parameter value in radians
 * @returns Unit tangent vector
 */
export function tangentCircle3D(circle: Circle3D, theta: number): Vector3D {
  const { plane } = circle;
  const yAxis = planeYAxis(plane);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Derivative: -sin(θ)*xAxis + cos(θ)*yAxis (already unit length)
  return vec3d(
    -sinT * plane.xAxis.x + cosT * yAxis.x,
    -sinT * plane.xAxis.y + cosT * yAxis.y,
    -sinT * plane.xAxis.z + cosT * yAxis.z,
  );
}

/**
 * Get the circumference of the circle.
 *
 * @param circle - The circle
 * @returns Circumference (2πr)
 */
export function lengthCircle3D(circle: Circle3D): number {
  return 2 * Math.PI * circle.radius;
}
