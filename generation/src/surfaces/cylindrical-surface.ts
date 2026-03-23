import { Point3D, point3d, Vector3D, vec3d, Axis, isZero, cross, normalize } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * An infinite cylindrical surface.
 *
 * Parametrization: P(θ, v) = axis.origin + v * axis.direction
 *                          + radius * cos(θ) * refDirection
 *                          + radius * sin(θ) * cross(axis.direction, refDirection)
 *
 * where refDirection is perpendicular to axis.direction and defines θ=0.
 *
 * OCCT reference: Geom_CylindricalSurface
 */
export interface CylindricalSurface {
  readonly type: 'cylinder';

  /** The axis of the cylinder */
  readonly axis: Axis;

  /** Radius (always positive) */
  readonly radius: number;

  /** Reference direction (perpendicular to axis, defines θ=0) */
  readonly refDirection: Vector3D;
}

/**
 * Compute a perpendicular vector to the given direction.
 * Uses a stable algorithm that picks the smallest component.
 */
function perpendicularTo(dir: Vector3D): Vector3D {
  // Find the component with smallest absolute value and cross with that axis
  const absX = Math.abs(dir.x);
  const absY = Math.abs(dir.y);
  const absZ = Math.abs(dir.z);

  let other: Vector3D;
  if (absX <= absY && absX <= absZ) {
    other = vec3d(1, 0, 0);
  } else if (absY <= absZ) {
    other = vec3d(0, 1, 0);
  } else {
    other = vec3d(0, 0, 1);
  }

  const crossed = cross(dir, other);
  return normalize(crossed);
}

/**
 * Create a cylindrical surface from an axis and radius.
 *
 * @param axis - The axis of the cylinder
 * @param radius - Radius (must be positive)
 * @returns CylindricalSurface or failure if radius is not positive
 */
export function makeCylindricalSurface(
  axis: Axis,
  radius: number,
): OperationResult<CylindricalSurface> {
  if (radius <= 0 || isZero(radius)) {
    return failure('Radius must be positive');
  }

  // Validate axis has non-zero direction
  const dirLen = Math.sqrt(
    axis.direction.x * axis.direction.x +
    axis.direction.y * axis.direction.y +
    axis.direction.z * axis.direction.z
  );
  if (isZero(dirLen)) {
    return failure('Axis direction must be non-zero');
  }

  // Normalize the axis direction
  const normalizedAxis: Axis = {
    origin: axis.origin,
    direction: normalize(axis.direction),
  };

  // Compute a reference direction perpendicular to axis
  const refDirection = perpendicularTo(normalizedAxis.direction);

  return success({
    type: 'cylinder',
    axis: normalizedAxis,
    radius,
    refDirection,
  });
}

/**
 * Evaluate the surface at parameters (θ, v).
 *
 * P(θ, v) = axis.origin + v * axis.direction
 *         + radius * cos(θ) * refDirection
 *         + radius * sin(θ) * perpDirection
 *
 * where perpDirection = cross(axis.direction, refDirection)
 *
 * @param surface - The cylindrical surface
 * @param theta - Angular parameter (radians)
 * @param v - Parameter along axis
 * @returns Point on the surface
 */
export function evaluateCylindricalSurface(
  surface: CylindricalSurface,
  theta: number,
  v: number,
): Point3D {
  const { axis, radius, refDirection } = surface;

  // perpDirection = cross(axis.direction, refDirection)
  const perpDirection = cross(axis.direction, refDirection);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  return point3d(
    axis.origin.x +
      v * axis.direction.x +
      radius * cosT * refDirection.x +
      radius * sinT * perpDirection.x,
    axis.origin.y +
      v * axis.direction.y +
      radius * cosT * refDirection.y +
      radius * sinT * perpDirection.y,
    axis.origin.z +
      v * axis.direction.z +
      radius * cosT * refDirection.z +
      radius * sinT * perpDirection.z,
  );
}

/**
 * Get the surface normal at parameters (θ, v).
 *
 * The normal points radially outward from the axis.
 *
 * @param surface - The cylindrical surface
 * @param theta - Angular parameter (radians)
 * @param v - Parameter along axis (unused - normal is constant along v)
 * @returns Unit normal vector (radially outward)
 */
export function normalCylindricalSurface(
  surface: CylindricalSurface,
  theta: number,
  v: number,
): Vector3D {
  const { axis, refDirection } = surface;

  // perpDirection = cross(axis.direction, refDirection)
  const perpDirection = cross(axis.direction, refDirection);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Normal = cos(θ) * refDirection + sin(θ) * perpDirection
  // This is already unit length since refDirection and perpDirection are orthonormal
  return vec3d(
    cosT * refDirection.x + sinT * perpDirection.x,
    cosT * refDirection.y + sinT * perpDirection.y,
    cosT * refDirection.z + sinT * perpDirection.z,
  );
}
