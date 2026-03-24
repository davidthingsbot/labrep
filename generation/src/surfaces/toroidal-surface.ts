import { Point3D, point3d, Vector3D, vec3d, Axis, isZero, cross, normalize } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A toroidal surface.
 *
 * Parametrization: S(θ, φ) = axis.origin
 *   + (majorRadius + minorRadius * cos(φ)) * (cos(θ) * refDirection + sin(θ) * perpDirection)
 *   + minorRadius * sin(φ) * axis.direction
 *
 * - θ: angle around the torus axis (major circle) [0, 2π)
 * - φ: angle around the tube cross-section (minor circle) [0, 2π)
 *
 * OCCT reference: Geom_ToroidalSurface
 */
export interface ToroidalSurface {
  readonly type: 'torus';

  /** Central axis of the torus */
  readonly axis: Axis;

  /** Distance from axis to tube center (always positive) */
  readonly majorRadius: number;

  /** Tube radius (always positive) */
  readonly minorRadius: number;

  /** Reference direction (perpendicular to axis, defines θ=0) */
  readonly refDirection: Vector3D;
}

/**
 * Compute a perpendicular vector to the given direction.
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
 * Create a toroidal surface.
 *
 * @param torusAxis - Central axis of the torus
 * @param majorRadius - Distance from axis to tube center (must be positive)
 * @param minorRadius - Tube radius (must be positive)
 * @returns ToroidalSurface or failure
 */
export function makeToroidalSurface(
  torusAxis: Axis,
  majorRadius: number,
  minorRadius: number,
): OperationResult<ToroidalSurface> {
  if (majorRadius <= 0 || isZero(majorRadius)) {
    return failure('Major radius must be positive');
  }

  if (minorRadius <= 0 || isZero(minorRadius)) {
    return failure('Minor radius must be positive');
  }

  const dirLen = Math.sqrt(
    torusAxis.direction.x ** 2 +
    torusAxis.direction.y ** 2 +
    torusAxis.direction.z ** 2,
  );
  if (isZero(dirLen)) {
    return failure('Axis direction must be non-zero');
  }

  const normalizedAxis: Axis = {
    origin: torusAxis.origin,
    direction: normalize(torusAxis.direction),
  };

  const refDirection = perpendicularTo(normalizedAxis.direction);

  return success({
    type: 'torus',
    axis: normalizedAxis,
    majorRadius,
    minorRadius,
    refDirection,
  });
}

/**
 * Evaluate the surface at parameters (θ, φ).
 *
 * @param surface - The toroidal surface
 * @param theta - Angle around torus axis (radians)
 * @param phi - Angle around tube cross-section (radians)
 * @returns Point on the surface
 */
export function evaluateToroidalSurface(
  surface: ToroidalSurface,
  theta: number,
  phi: number,
): Point3D {
  const { axis, majorRadius, minorRadius, refDirection } = surface;
  const perpDirection = cross(axis.direction, refDirection);

  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const r = majorRadius + minorRadius * cosPhi;

  return point3d(
    axis.origin.x +
      r * (cosTheta * refDirection.x + sinTheta * perpDirection.x) +
      minorRadius * sinPhi * axis.direction.x,
    axis.origin.y +
      r * (cosTheta * refDirection.y + sinTheta * perpDirection.y) +
      minorRadius * sinPhi * axis.direction.y,
    axis.origin.z +
      r * (cosTheta * refDirection.z + sinTheta * perpDirection.z) +
      minorRadius * sinPhi * axis.direction.z,
  );
}

/**
 * Get the surface normal at parameters (θ, φ).
 *
 * The normal points outward from the tube center.
 *
 * @param surface - The toroidal surface
 * @param theta - Angle around torus axis (radians)
 * @param phi - Angle around tube cross-section (radians)
 * @returns Unit normal vector
 */
export function normalToroidalSurface(
  surface: ToroidalSurface,
  theta: number,
  phi: number,
): Vector3D {
  const { axis, refDirection } = surface;
  const perpDirection = cross(axis.direction, refDirection);

  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // The normal at (θ, φ) is the direction from the tube center to the surface point.
  // Tube center at angle θ is at: origin + majorRadius * (cosθ * ref + sinθ * perp)
  // The direction from tube center to surface point is:
  //   cosPhi * (cosθ * ref + sinθ * perp) + sinPhi * axis.direction
  // This is already unit length since ref, perp, axis.direction are orthonormal.
  return vec3d(
    cosPhi * (cosTheta * refDirection.x + sinTheta * perpDirection.x) +
      sinPhi * axis.direction.x,
    cosPhi * (cosTheta * refDirection.y + sinTheta * perpDirection.y) +
      sinPhi * axis.direction.y,
    cosPhi * (cosTheta * refDirection.z + sinTheta * perpDirection.z) +
      sinPhi * axis.direction.z,
  );
}
