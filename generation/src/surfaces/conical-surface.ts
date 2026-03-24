import { Point3D, point3d, Vector3D, vec3d, Axis, isZero, cross, normalize } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A conical surface.
 *
 * Parametrization: S(θ, v) = axis.origin + v * cos(semiAngle) * axis.direction
 *                          + (radius + v * sin(semiAngle)) * (
 *                              cos(θ) * refDirection
 *                            + sin(θ) * cross(axis.direction, refDirection)
 *                          )
 *
 * - θ: angular parameter [0, 2π)
 * - v: distance along the generatrix from the reference circle
 * - radius: radius of the reference circle at v=0
 * - semiAngle: half-angle of the cone (0 < semiAngle < π/2)
 *
 * OCCT reference: Geom_ConicalSurface
 */
export interface ConicalSurface {
  readonly type: 'cone';

  /** Axis of the cone */
  readonly axis: Axis;

  /** Radius at the reference plane (v=0), can be 0 for apex at origin */
  readonly radius: number;

  /** Half-angle in radians (0 < semiAngle < π/2) */
  readonly semiAngle: number;

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
 * Create a conical surface.
 *
 * @param coneAxis - Axis of the cone
 * @param radius - Radius at reference plane (must be non-negative)
 * @param semiAngle - Half-angle in radians (must be in (0, π/2))
 * @returns ConicalSurface or failure
 */
export function makeConicalSurface(
  coneAxis: Axis,
  radius: number,
  semiAngle: number,
): OperationResult<ConicalSurface> {
  if (radius < 0) {
    return failure('Radius must be non-negative');
  }

  if (semiAngle <= 0 || isZero(semiAngle) || semiAngle >= Math.PI / 2) {
    return failure('Cone semi-angle must be in (0, π/2)');
  }

  const dirLen = Math.sqrt(
    coneAxis.direction.x ** 2 +
    coneAxis.direction.y ** 2 +
    coneAxis.direction.z ** 2,
  );
  if (isZero(dirLen)) {
    return failure('Axis direction must be non-zero');
  }

  const normalizedAxis: Axis = {
    origin: coneAxis.origin,
    direction: normalize(coneAxis.direction),
  };

  const refDirection = perpendicularTo(normalizedAxis.direction);

  return success({
    type: 'cone',
    axis: normalizedAxis,
    radius,
    semiAngle,
    refDirection,
  });
}

/**
 * Evaluate the surface at parameters (θ, v).
 *
 * @param surface - The conical surface
 * @param theta - Angular parameter (radians)
 * @param v - Parameter along generatrix
 * @returns Point on the surface
 */
export function evaluateConicalSurface(
  surface: ConicalSurface,
  theta: number,
  v: number,
): Point3D {
  const { axis, radius, semiAngle, refDirection } = surface;
  const perpDirection = cross(axis.direction, refDirection);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const r = radius + v * Math.sin(semiAngle);
  const h = v * Math.cos(semiAngle);

  return point3d(
    axis.origin.x + h * axis.direction.x + r * (cosT * refDirection.x + sinT * perpDirection.x),
    axis.origin.y + h * axis.direction.y + r * (cosT * refDirection.y + sinT * perpDirection.y),
    axis.origin.z + h * axis.direction.z + r * (cosT * refDirection.z + sinT * perpDirection.z),
  );
}

/**
 * Get the surface normal at parameters (θ, v).
 *
 * The normal points outward from the cone surface (away from the axis,
 * with a component opposing the axis direction due to the cone angle).
 *
 * @param surface - The conical surface
 * @param theta - Angular parameter (radians)
 * @param v - Parameter along generatrix (unused — normal is constant along v for a given θ)
 * @returns Unit normal vector
 */
export function normalConicalSurface(
  surface: ConicalSurface,
  theta: number,
  _v: number,
): Vector3D {
  const { axis, semiAngle, refDirection } = surface;
  const perpDirection = cross(axis.direction, refDirection);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // The outward normal of a cone:
  // N = sin(semiAngle) * (- axis.direction) + cos(semiAngle) * radialDir
  // where radialDir = cos(θ) * refDirection + sin(θ) * perpDirection
  //
  // This points outward from the cone surface, perpendicular to the generatrix.
  const cosA = Math.cos(semiAngle);
  const sinA = Math.sin(semiAngle);

  return vec3d(
    -sinA * axis.direction.x + cosA * (cosT * refDirection.x + sinT * perpDirection.x),
    -sinA * axis.direction.y + cosA * (cosT * refDirection.y + sinT * perpDirection.y),
    -sinA * axis.direction.z + cosA * (cosT * refDirection.z + sinT * perpDirection.z),
  );
}
