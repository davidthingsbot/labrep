import { Point3D, point3d, Vector3D, vec3d, Axis, axis, isZero, cross, normalize } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A spherical surface.
 *
 * Parametrization: S(θ, φ) = center + radius * (
 *   cos(φ) * cos(θ) * refDirection
 * + cos(φ) * sin(θ) * cross(axis.direction, refDirection)
 * + sin(φ) * axis.direction
 * )
 *
 * - θ: longitude [0, 2π)
 * - φ: latitude [-π/2, π/2] (0 = equator, π/2 = north pole)
 *
 * OCCT reference: Geom_SphericalSurface
 */
export interface SphericalSurface {
  readonly type: 'sphere';

  /** Center of the sphere */
  readonly center: Point3D;

  /** Radius (always positive) */
  readonly radius: number;

  /** Axis defining the poles (direction = north pole) */
  readonly axis: Axis;

  /** Reference direction (perpendicular to axis, defines θ=0) */
  readonly refDirection: Vector3D;
}

/**
 * Compute a perpendicular vector to the given direction.
 * Uses a stable algorithm that picks the smallest component.
 */
function perpendicularTo(dir: Vector3D): Vector3D {
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
 * Create a spherical surface.
 *
 * @param center - Center of the sphere
 * @param radius - Radius (must be positive)
 * @param sphereAxis - Optional axis defining orientation (defaults to Z-axis at center)
 * @returns SphericalSurface or failure
 */
export function makeSphericalSurface(
  center: Point3D,
  radius: number,
  sphereAxis?: Axis,
): OperationResult<SphericalSurface> {
  if (radius <= 0 || isZero(radius)) {
    return failure('Radius must be positive');
  }

  const actualAxis = sphereAxis
    ? { origin: center, direction: normalize(sphereAxis.direction) }
    : axis(center, vec3d(0, 0, 1));

  const refDirection = perpendicularTo(actualAxis.direction);

  return success({
    type: 'sphere',
    center,
    radius,
    axis: actualAxis,
    refDirection,
  });
}

/**
 * Evaluate the surface at parameters (θ, φ).
 *
 * S(θ, φ) = center + radius * (
 *   cos(φ) * cos(θ) * refDirection
 * + cos(φ) * sin(θ) * perpDirection
 * + sin(φ) * axis.direction
 * )
 *
 * @param surface - The spherical surface
 * @param theta - Longitude (radians)
 * @param phi - Latitude (radians, 0 = equator)
 * @returns Point on the surface
 */
export function evaluateSphericalSurface(
  surface: SphericalSurface,
  theta: number,
  phi: number,
): Point3D {
  const { center, radius, axis, refDirection } = surface;
  const perpDirection = cross(axis.direction, refDirection);

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  return point3d(
    center.x +
      radius * (cosPhi * cosTheta * refDirection.x +
                cosPhi * sinTheta * perpDirection.x +
                sinPhi * axis.direction.x),
    center.y +
      radius * (cosPhi * cosTheta * refDirection.y +
                cosPhi * sinTheta * perpDirection.y +
                sinPhi * axis.direction.y),
    center.z +
      radius * (cosPhi * cosTheta * refDirection.z +
                cosPhi * sinTheta * perpDirection.z +
                sinPhi * axis.direction.z),
  );
}

/**
 * Get the surface normal at parameters (θ, φ).
 *
 * The normal points radially outward from the center.
 *
 * @param surface - The spherical surface
 * @param theta - Longitude (radians)
 * @param phi - Latitude (radians)
 * @returns Unit normal vector (radially outward)
 */
export function normalSphericalSurface(
  surface: SphericalSurface,
  theta: number,
  phi: number,
): Vector3D {
  const { axis, refDirection } = surface;
  const perpDirection = cross(axis.direction, refDirection);

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  // Normal = same as the position vector from center, normalized
  // Since refDirection, perpDirection, axis.direction are orthonormal,
  // this is already unit length
  return vec3d(
    cosPhi * cosTheta * refDirection.x +
      cosPhi * sinTheta * perpDirection.x +
      sinPhi * axis.direction.x,
    cosPhi * cosTheta * refDirection.y +
      cosPhi * sinTheta * perpDirection.y +
      sinPhi * axis.direction.y,
    cosPhi * cosTheta * refDirection.z +
      cosPhi * sinTheta * perpDirection.z +
      sinPhi * axis.direction.z,
  );
}
