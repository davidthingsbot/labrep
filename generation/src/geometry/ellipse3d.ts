import { Point3D, point3d, Vector3D, vec3d, Plane, isZero, cross, normalize } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A full ellipse in 3D space.
 *
 * The ellipse lies in the given plane, centered at plane.origin.
 * Parametrization: P(t) = center + a*cos(t)*xAxis + b*sin(t)*yAxis
 * where yAxis = normalize(cross(normal, xAxis)), a = majorRadius, b = minorRadius.
 * t ranges from 0 to 2π.
 *
 * OCCT reference: Geom_Ellipse / ElCLib::EllipseValue
 */
export interface Ellipse3D {
  readonly type: 'ellipse3d';

  /** The plane containing the ellipse (center = plane.origin, major axis along xAxis) */
  readonly plane: Plane;

  /** Semi-major axis length (along plane.xAxis) */
  readonly majorRadius: number;

  /** Semi-minor axis length (along plane yAxis = cross(normal, xAxis)) */
  readonly minorRadius: number;

  /** Start of parameter range (0) */
  readonly startParam: number;

  /** End of parameter range (2π) */
  readonly endParam: number;

  /** Always true for full ellipses */
  readonly isClosed: boolean;

  /** Point at parameter 0 (center + majorRadius * xAxis) */
  readonly startPoint: Point3D;

  /** Point at parameter 2π (same as startPoint) */
  readonly endPoint: Point3D;
}

/**
 * Compute the Y-axis of a plane (perpendicular to both normal and xAxis).
 */
function planeYAxis(p: Plane): Vector3D {
  return normalize(cross(p.normal, p.xAxis));
}

/**
 * Create a full ellipse in 3D space on a given plane.
 *
 * The major axis is along plane.xAxis with length `majorRadius`.
 * The minor axis is along cross(normal, xAxis) with length `minorRadius`.
 *
 * @param plane - The plane containing the ellipse (center = plane.origin)
 * @param majorRadius - Semi-major axis length (must be positive)
 * @param minorRadius - Semi-minor axis length (must be positive)
 * @returns Ellipse3D or failure
 */
export function makeEllipse3D(
  plane: Plane,
  majorRadius: number,
  minorRadius: number,
): OperationResult<Ellipse3D> {
  if (majorRadius <= 0 || isZero(majorRadius)) {
    return failure('Major radius must be positive');
  }
  if (minorRadius <= 0 || isZero(minorRadius)) {
    return failure('Minor radius must be positive');
  }

  const normalLen = Math.sqrt(
    plane.normal.x ** 2 + plane.normal.y ** 2 + plane.normal.z ** 2,
  );
  if (isZero(normalLen)) {
    return failure('Plane normal must be non-zero');
  }

  const startPoint = point3d(
    plane.origin.x + majorRadius * plane.xAxis.x,
    plane.origin.y + majorRadius * plane.xAxis.y,
    plane.origin.z + majorRadius * plane.xAxis.z,
  );

  return success({
    type: 'ellipse3d',
    plane,
    majorRadius,
    minorRadius,
    startParam: 0,
    endParam: 2 * Math.PI,
    isClosed: true,
    startPoint,
    endPoint: startPoint,
  });
}

/**
 * Evaluate the ellipse at parameter t.
 *
 * P(t) = center + a*cos(t)*xAxis + b*sin(t)*yAxis
 *
 * @param ellipse - The ellipse to evaluate
 * @param t - Parameter value in radians
 * @returns Point on the ellipse
 */
export function evaluateEllipse3D(ellipse: Ellipse3D, t: number): Point3D {
  const { plane, majorRadius: a, minorRadius: b } = ellipse;
  const yAxis = planeYAxis(plane);
  const ct = Math.cos(t);
  const st = Math.sin(t);

  return point3d(
    plane.origin.x + a * ct * plane.xAxis.x + b * st * yAxis.x,
    plane.origin.y + a * ct * plane.xAxis.y + b * st * yAxis.y,
    plane.origin.z + a * ct * plane.xAxis.z + b * st * yAxis.z,
  );
}

/**
 * Get the tangent vector at parameter t (NOT unit-length).
 *
 * d/dt P(t) = -a*sin(t)*xAxis + b*cos(t)*yAxis
 *
 * The tangent magnitude varies: |T(0)| = b, |T(π/2)| = a.
 *
 * @param ellipse - The ellipse
 * @param t - Parameter value in radians
 * @returns Tangent vector (not normalized)
 */
export function tangentEllipse3D(ellipse: Ellipse3D, t: number): Vector3D {
  const { plane, majorRadius: a, minorRadius: b } = ellipse;
  const yAxis = planeYAxis(plane);
  const ct = Math.cos(t);
  const st = Math.sin(t);

  return vec3d(
    -a * st * plane.xAxis.x + b * ct * yAxis.x,
    -a * st * plane.xAxis.y + b * ct * yAxis.y,
    -a * st * plane.xAxis.z + b * ct * yAxis.z,
  );
}

/**
 * Approximate the circumference of an ellipse.
 *
 * Uses Ramanujan's second approximation:
 * C ≈ π(3(a+b) − √((3a+b)(a+3b)))
 *
 * Accurate to within 0.04% for all eccentricities.
 *
 * @param ellipse - The ellipse
 * @returns Approximate circumference
 */
export function lengthEllipse3D(ellipse: Ellipse3D): number {
  const { majorRadius: a, minorRadius: b } = ellipse;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}
