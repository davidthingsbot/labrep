import { Point3D, point3d, Vector3D, vec3d, Axis, axis, isZero, cross, normalize, dot } from '../core';
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
 * OCCT reference: Geom_SphericalSurface constructor takes gp_Ax3 which
 * specifies the axis (pole direction) and XDirection (θ=0 reference).
 * When created from a revolve, XDirection is set to the radial direction
 * at the revolve's starting angle (GeomAdaptor_SurfaceOfRevolution::Load).
 *
 * @param center - Center of the sphere
 * @param radius - Radius (must be positive)
 * @param sphereAxis - Optional axis defining orientation (defaults to Z-axis at center)
 * @param refDir - Optional reference direction for θ=0 (must be perpendicular to axis).
 *                 If omitted, computed from axis direction.
 * @returns SphericalSurface or failure
 */
export function makeSphericalSurface(
  center: Point3D,
  radius: number,
  sphereAxis?: Axis,
  refDir?: Vector3D,
): OperationResult<SphericalSurface> {
  if (radius <= 0 || isZero(radius)) {
    return failure('Radius must be positive');
  }

  const actualAxis = sphereAxis
    ? { origin: center, direction: normalize(sphereAxis.direction) }
    : axis(center, vec3d(0, 0, 1));

  let refDirection: Vector3D;
  if (refDir) {
    // Project out axial component and normalize (ensure perpendicularity)
    const axd = actualAxis.direction;
    const d = dot(refDir, axd);
    const proj = vec3d(refDir.x - d * axd.x, refDir.y - d * axd.y, refDir.z - d * axd.z);
    const len = Math.sqrt(proj.x * proj.x + proj.y * proj.y + proj.z * proj.z);
    refDirection = len > 1e-10 ? normalize(proj) : perpendicularTo(actualAxis.direction);
  } else {
    refDirection = perpendicularTo(actualAxis.direction);
  }

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

/**
 * Project a 3D point onto the sphere's parameter space (θ, φ).
 *
 * Inverse of evaluateSphericalSurface: given a point P, computes (θ, φ) such that
 * P ≈ evaluate(θ, φ). The point does not need to lie exactly on the surface.
 *
 * Based on OCCT ProjLib_Sphere:
 *   φ = asin(clamp(dot(rel, axis) / radius))
 *   θ = atan2(dot(equatorial, perpDir), dot(equatorial, refDir))
 *
 * At the poles (|φ| ≈ π/2), θ is degenerate (equatorial component vanishes).
 *
 * @param surface - The spherical surface
 * @param point - Point to project
 * @returns { u: θ (longitude, radians), v: φ (latitude, radians) }
 */
export function projectToSphericalSurface(
  surface: SphericalSurface,
  point: Point3D,
): { u: number; v: number } {
  const { center, radius, axis: ax, refDirection } = surface;
  const perpDir = cross(ax.direction, refDirection);
  const rel = vec3d(point.x - center.x, point.y - center.y, point.z - center.z);

  const sinPhi = dot(rel, ax.direction) / radius;
  const phi = Math.asin(Math.max(-1, Math.min(1, sinPhi)));

  // Remove the axial (polar) component to get the equatorial projection
  const inEquator = vec3d(
    rel.x - sinPhi * radius * ax.direction.x,
    rel.y - sinPhi * radius * ax.direction.y,
    rel.z - sinPhi * radius * ax.direction.z,
  );
  const theta = Math.atan2(dot(inEquator, perpDir), dot(inEquator, refDirection));

  return { u: theta, v: phi };
}
