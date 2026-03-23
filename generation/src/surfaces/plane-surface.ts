import { Point3D, point3d, Vector3D, Plane, cross, normalize } from '../core';

/**
 * An infinite planar surface.
 *
 * Parametrization: P(u, v) = origin + u * xAxis + v * yAxis
 * where yAxis = normalize(cross(normal, xAxis))
 *
 * OCCT reference: Geom_Plane
 */
export interface PlaneSurface {
  readonly type: 'plane';

  /** The underlying plane (defines origin, normal, and xAxis) */
  readonly plane: Plane;
}

/**
 * Compute the Y-axis of a plane.
 */
function planeYAxis(p: Plane): Vector3D {
  const crossed = cross(p.normal, p.xAxis);
  return normalize(crossed);
}

/**
 * Create a planar surface from a plane.
 *
 * @param plane - The defining plane
 * @returns PlaneSurface
 */
export function makePlaneSurface(plane: Plane): PlaneSurface {
  return {
    type: 'plane',
    plane,
  };
}

/**
 * Evaluate the surface at parameters (u, v).
 *
 * P(u, v) = origin + u * xAxis + v * yAxis
 *
 * @param surface - The plane surface
 * @param u - Parameter along xAxis
 * @param v - Parameter along yAxis
 * @returns Point on the surface
 */
export function evaluatePlaneSurface(surface: PlaneSurface, u: number, v: number): Point3D {
  const { plane } = surface;
  const yAxis = planeYAxis(plane);

  return point3d(
    plane.origin.x + u * plane.xAxis.x + v * yAxis.x,
    plane.origin.y + u * plane.xAxis.y + v * yAxis.y,
    plane.origin.z + u * plane.xAxis.z + v * yAxis.z,
  );
}

/**
 * Get the surface normal at parameters (u, v).
 *
 * For a plane, the normal is constant everywhere.
 *
 * @param surface - The plane surface
 * @param u - Parameter (unused)
 * @param v - Parameter (unused)
 * @returns Unit normal vector
 */
export function normalPlaneSurface(surface: PlaneSurface, u: number, v: number): Vector3D {
  return surface.plane.normal;
}
