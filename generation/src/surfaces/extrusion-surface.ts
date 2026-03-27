import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  normalize,
  cross,
  isZero,
  length,
  Axis,
  axis,
  Plane,
  plane,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Curve3D } from '../topology/edge';
import { Line3D, evaluateLine3D, tangentLine3D } from '../geometry/line3d';
import { Circle3D, evaluateCircle3D, tangentCircle3D } from '../geometry/circle3d';
import { Arc3D, evaluateArc3D, tangentArc3D } from '../geometry/arc3d';
import { PlaneSurface, makePlaneSurface } from './plane-surface';
import { CylindricalSurface, makeCylindricalSurface } from './cylindrical-surface';

/**
 * A surface created by translating a curve along a direction.
 *
 * Parametrization: S(u, v) = curve(u) + v × direction
 *
 * - u: parameter along basis curve [curve.startParam, curve.endParam]
 * - v: parameter along extrusion direction (unbounded, but typically [0, distance])
 *
 * OCCT reference: Geom_SurfaceOfLinearExtrusion
 *
 * @example
 * // Extrude a line → plane
 * const line = makeLine3D(origin, point3d(10, 0, 0));
 * const surface = makeExtrusionSurface(line.result, vector3d(0, 0, 1));
 * // surface.evaluate(5, 3) = point at u=5 along line, v=3 up
 *
 * @example
 * // Extrude a circle → cylinder
 * const circle = makeCircle3D(XY_PLANE, 5);
 * const surface = makeExtrusionSurface(circle.result, vector3d(0, 0, 1));
 * // Equivalent to CylindricalSurface with radius 5
 */
export interface ExtrusionSurface {
  readonly type: 'extrusion';
  readonly basisCurve: Curve3D;
  readonly direction: Vector3D; // Unit vector
}

/**
 * Create an extrusion surface from a 3D curve and direction.
 *
 * The surface is defined by: S(u, v) = curve(u) + v × direction
 *
 * @param curve - The basis curve to extrude
 * @param direction - Extrusion direction (will be normalized)
 * @returns ExtrusionSurface or error if direction is zero
 */
export function makeExtrusionSurface(
  curve: Curve3D,
  direction: Vector3D,
): OperationResult<ExtrusionSurface> {
  const dirLen = length(direction);

  if (isZero(dirLen)) {
    return failure('Extrusion direction must be non-zero');
  }

  const normalizedDir = normalize(direction);

  return success({
    type: 'extrusion',
    basisCurve: curve,
    direction: normalizedDir,
  });
}

/**
 * Evaluate a curve at a given parameter.
 */
function evaluateCurve(curve: Curve3D, u: number): Point3D {
  switch (curve.type) {
    case 'line3d':
      return evaluateLine3D(curve, u);
    case 'circle3d':
      return evaluateCircle3D(curve, u);
    case 'arc3d':
      return evaluateArc3D(curve, u);
  }
}

/**
 * Get the tangent of a curve at a given parameter.
 */
function curveTangent(curve: Curve3D, u: number): Vector3D {
  switch (curve.type) {
    case 'line3d':
      return tangentLine3D(curve, u);
    case 'circle3d':
      return tangentCircle3D(curve, u);
    case 'arc3d':
      return tangentArc3D(curve, u);
  }
}

/**
 * Evaluate an extrusion surface at parameters (u, v).
 *
 * S(u, v) = basisCurve(u) + v × direction
 *
 * @param surface - The extrusion surface
 * @param u - Parameter along the basis curve
 * @param v - Parameter along extrusion direction (distance)
 * @returns Point on the surface
 */
export function evaluateExtrusionSurface(
  surface: ExtrusionSurface,
  u: number,
  v: number,
): Point3D {
  const curvePoint = evaluateCurve(surface.basisCurve, u);

  return point3d(
    curvePoint.x + v * surface.direction.x,
    curvePoint.y + v * surface.direction.y,
    curvePoint.z + v * surface.direction.z,
  );
}

/**
 * Compute the normal of an extrusion surface at (u, v).
 *
 * Normal = normalize(tangent(u) × direction)
 * where tangent(u) is the curve tangent at parameter u.
 *
 * Note: The normal is independent of v since the surface
 * translates uniformly along the direction.
 *
 * @param surface - The extrusion surface
 * @param u - Parameter along the basis curve
 * @param v - Parameter along extrusion direction (unused)
 * @returns Unit normal vector
 */
export function normalExtrusionSurface(
  surface: ExtrusionSurface,
  u: number,
  _v: number,
): Vector3D {
  const tangent = curveTangent(surface.basisCurve, u);

  // Normal = tangent × direction (or direction × tangent, depending on orientation)
  // We use tangent × direction for consistent outward normals
  const normal = cross(tangent, surface.direction);

  // Handle degenerate case where tangent is parallel to direction
  const normalLen = length(normal);
  if (isZero(normalLen)) {
    // Return an arbitrary perpendicular vector
    // This shouldn't happen for valid extrusion surfaces
    return vec3d(0, 0, 1);
  }

  return normalize(normal);
}

/**
 * Compute partial derivatives of an extrusion surface.
 *
 * ∂S/∂u = curve'(u) (curve tangent)
 * ∂S/∂v = direction
 *
 * @param surface - The extrusion surface
 * @param u - Parameter along the basis curve
 * @param v - Parameter along extrusion direction
 * @returns Object with dU and dV partial derivative vectors
 */
export function derivativesExtrusionSurface(
  surface: ExtrusionSurface,
  u: number,
  _v: number,
): { dU: Vector3D; dV: Vector3D } {
  const tangent = curveTangent(surface.basisCurve, u);

  return {
    dU: tangent,
    dV: surface.direction,
  };
}

/**
 * Check if a curve extruded along a direction produces a known surface type.
 *
 * @param curve - The basis curve
 * @param direction - Extrusion direction
 * @returns 'plane' if line, 'cylinder' if circle/arc, 'extrusion' otherwise
 */
export function getCanonicalSurfaceType(
  curve: Curve3D,
  direction: Vector3D,
): 'plane' | 'cylinder' | 'extrusion' {
  if (curve.type === 'line3d') {
    return 'plane';
  }

  if (curve.type === 'circle3d' || curve.type === 'arc3d') {
    // Check if direction is parallel to the circle/arc plane normal
    // If so, we get a cylinder
    const normal = curve.plane.normal;
    const dirNorm = normalize(direction);

    // dot product close to ±1 means parallel
    const dotProduct = Math.abs(
      dirNorm.x * normal.x + dirNorm.y * normal.y + dirNorm.z * normal.z,
    );

    if (Math.abs(dotProduct - 1) < 1e-10) {
      return 'cylinder';
    }
  }

  return 'extrusion';
}

/**
 * Attempt to simplify an extrusion surface to a canonical form.
 *
 * - Line → PlaneSurface
 * - Circle → CylindricalSurface (when direction is parallel to circle normal)
 * - Arc → CylindricalSurface (partial, when direction is parallel to arc normal)
 *
 * Returns the original surface if no simplification applies.
 *
 * @param surface - The extrusion surface to canonicalize
 * @returns Simplified surface or original if no simplification possible
 */
export function canonicalizeExtrusionSurface(
  surface: ExtrusionSurface,
): PlaneSurface | CylindricalSurface | ExtrusionSurface {
  const curve = surface.basisCurve;
  const direction = surface.direction;

  // Line → Plane
  if (curve.type === 'line3d') {
    // Plane normal = line direction × extrusion direction
    const lineDir = curve.direction;
    const normal = cross(lineDir, direction);
    const normalLen = length(normal);

    if (isZero(normalLen)) {
      // Line is parallel to direction - degenerate case
      // Return original surface
      return surface;
    }

    const unitNormal = normalize(normal);

    // Plane origin is the line origin
    // xAxis is the line direction
    const planeData = plane(curve.origin, unitNormal, lineDir);

    return makePlaneSurface(planeData);
  }

  // Circle/Arc → Cylinder (when direction is parallel to plane normal)
  if (curve.type === 'circle3d' || curve.type === 'arc3d') {
    const curveNormal = curve.plane.normal;
    const dirNorm = normalize(direction);

    // Check if direction is parallel to curve plane normal
    const dotProduct =
      dirNorm.x * curveNormal.x +
      dirNorm.y * curveNormal.y +
      dirNorm.z * curveNormal.z;

    if (Math.abs(Math.abs(dotProduct) - 1) < 1e-10) {
      // Direction is parallel to normal - create cylinder
      // The cylinder axis is at the circle center, along the extrusion direction
      const center = curve.plane.origin;

      // If dotProduct is negative, direction is opposite to normal
      // We keep the direction as given
      const cylinderAxis = axis(center, direction);

      // OCCT ref: When creating a cylinder from extruding a circle, the
      // cylinder's refDirection (θ=0) must match the circle's xAxis so that
      // the PCurve parameterization (U=0 at xAxis) aligns with projectPoint.
      const result = makeCylindricalSurface(cylinderAxis, curve.radius, curve.plane.xAxis);
      if (result.success) {
        return result.result!;
      }
    }
  }

  // No simplification possible
  return surface;
}
