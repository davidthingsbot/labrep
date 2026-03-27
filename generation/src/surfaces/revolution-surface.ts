import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  Axis,
  axis,
  Plane,
  plane,
  isZero,
  cross,
  normalize,
  length,
  dot,
  rotationAxis,
  transformPoint,
  transformVector,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Curve3D } from '../topology/edge';
import { Line3D, evaluateLine3D, tangentLine3D } from '../geometry/line3d';
import { Circle3D, evaluateCircle3D, tangentCircle3D } from '../geometry/circle3d';
import { Arc3D, evaluateArc3D, tangentArc3D } from '../geometry/arc3d';
import { PlaneSurface, makePlaneSurface } from './plane-surface';
import { CylindricalSurface, makeCylindricalSurface } from './cylindrical-surface';
import { ConicalSurface, makeConicalSurface } from './conical-surface';
import { SphericalSurface, makeSphericalSurface } from './spherical-surface';
import { ToroidalSurface, makeToroidalSurface } from './toroidal-surface';

/**
 * A surface created by revolving a curve around an axis.
 *
 * Parametrization: S(θ, v) = rotate(basisCurve(v), axis, θ)
 *
 * - θ: rotation angle [0, 2π)
 * - v: parameter along basis curve [curve.startParam, curve.endParam]
 *
 * OCCT reference: Geom_SurfaceOfRevolution
 */
export interface RevolutionSurface {
  readonly type: 'revolution';
  readonly basisCurve: Curve3D;
  readonly axis: Axis;
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
 * Evaluate a curve at a given parameter.
 */
function evaluateCurve(curve: Curve3D, v: number): Point3D {
  switch (curve.type) {
    case 'line3d':
      return evaluateLine3D(curve, v);
    case 'circle3d':
      return evaluateCircle3D(curve, v);
    case 'arc3d':
      return evaluateArc3D(curve, v);
  }
}

/**
 * Get the tangent of a curve at a given parameter.
 */
function curveTangent(curve: Curve3D, v: number): Vector3D {
  switch (curve.type) {
    case 'line3d':
      return tangentLine3D(curve, v);
    case 'circle3d':
      return tangentCircle3D(curve, v);
    case 'arc3d':
      return tangentArc3D(curve, v);
  }
}

/**
 * Create a revolution surface from a curve and axis.
 *
 * @param curve - The basis curve (generatrix) to revolve
 * @param revolveAxis - The axis of revolution
 * @returns RevolutionSurface or failure
 */
export function makeRevolutionSurface(
  curve: Curve3D,
  revolveAxis: Axis,
): OperationResult<RevolutionSurface> {
  const dirLen = length(revolveAxis.direction);
  if (isZero(dirLen)) {
    return failure('Axis direction must be non-zero');
  }

  const normalizedAxis: Axis = {
    origin: revolveAxis.origin,
    direction: normalize(revolveAxis.direction),
  };

  const refDirection = perpendicularTo(normalizedAxis.direction);

  return success({
    type: 'revolution',
    basisCurve: curve,
    axis: normalizedAxis,
    refDirection,
  });
}

/**
 * Evaluate the revolution surface at parameters (θ, v).
 *
 * Rotates the point basisCurve(v) around the axis by angle θ.
 *
 * @param surface - The revolution surface
 * @param theta - Rotation angle (radians)
 * @param v - Parameter along basis curve
 * @returns Point on the surface
 */
export function evaluateRevolutionSurface(
  surface: RevolutionSurface,
  theta: number,
  v: number,
): Point3D {
  const curvePoint = evaluateCurve(surface.basisCurve, v);
  const transform = rotationAxis(surface.axis.origin, surface.axis.direction, theta);
  return transformPoint(transform, curvePoint);
}

/**
 * Compute the surface normal at (θ, v).
 *
 * Normal = normalize(dS/dθ × dS/dv)
 *
 * @param surface - The revolution surface
 * @param theta - Rotation angle (radians)
 * @param v - Parameter along basis curve
 * @returns Unit normal vector
 */
export function normalRevolutionSurface(
  surface: RevolutionSurface,
  theta: number,
  v: number,
): Vector3D {
  const { axis: revAxis } = surface;
  const transform = rotationAxis(revAxis.origin, revAxis.direction, theta);

  // dS/dv: the rotated curve tangent
  const tangent = curveTangent(surface.basisCurve, v);
  const rotatedTangent = transformVector(transform, tangent);

  // dS/dθ: cross product of axis direction with (P - axisPoint projected)
  // For rotation, dS/dθ = axisDir × (P - O_proj) where O_proj is the projection onto axis
  const curvePoint = evaluateCurve(surface.basisCurve, v);
  const rotatedPoint = transformPoint(transform, curvePoint);
  const d = vec3d(
    rotatedPoint.x - revAxis.origin.x,
    rotatedPoint.y - revAxis.origin.y,
    rotatedPoint.z - revAxis.origin.z,
  );
  const axialComponent =
    d.x * revAxis.direction.x +
    d.y * revAxis.direction.y +
    d.z * revAxis.direction.z;
  const radialVec = vec3d(
    d.x - axialComponent * revAxis.direction.x,
    d.y - axialComponent * revAxis.direction.y,
    d.z - axialComponent * revAxis.direction.z,
  );
  // dS/dθ = axisDir × radialVec * |radialVec| ... actually it's simply:
  // dS/dθ = axis.direction × (P - axis.origin - (projection along axis))
  // = axis.direction × radialVec
  // But the magnitude matters — it should be |radialVec| in the tangential direction
  const dTheta = cross(revAxis.direction, radialVec);

  // Normal = dTheta × dV (order gives outward normal for standard orientation)
  const normal = cross(dTheta, rotatedTangent);
  const normalLen = length(normal);

  if (isZero(normalLen)) {
    // Degenerate point (e.g., on axis)
    return revAxis.direction;
  }

  return normalize(normal);
}

/**
 * Compute the distance from a point to an axis (line).
 */
function distanceToAxis(point: Point3D, ax: Axis): number {
  const d = vec3d(
    point.x - ax.origin.x,
    point.y - ax.origin.y,
    point.z - ax.origin.z,
  );
  const dot =
    d.x * ax.direction.x +
    d.y * ax.direction.y +
    d.z * ax.direction.z;
  const projX = d.x - dot * ax.direction.x;
  const projY = d.y - dot * ax.direction.y;
  const projZ = d.z - dot * ax.direction.z;
  return Math.sqrt(projX * projX + projY * projY + projZ * projZ);
}

/**
 * Project a point onto an axis, returning the axial coordinate.
 */
function projectOntoAxis(point: Point3D, ax: Axis): number {
  return (
    (point.x - ax.origin.x) * ax.direction.x +
    (point.y - ax.origin.y) * ax.direction.y +
    (point.z - ax.origin.z) * ax.direction.z
  );
}

/**
 * Compute the reference direction (θ=0) from a single 3D point's radial
 * direction relative to an axis.
 *
 * OCCT ref: GeomAdaptor_SurfaceOfRevolution::Load — for lines, Ox is the
 * direction from axis to the line origin, projected perpendicular to the axis.
 */
function computeRefDirectionFromPoint(pt: Point3D, ax: Axis): Vector3D {
  const axDir = ax.direction;
  const rel = vec3d(pt.x - ax.origin.x, pt.y - ax.origin.y, pt.z - ax.origin.z);
  const d = dot(rel, axDir);
  const perp = vec3d(rel.x - d * axDir.x, rel.y - d * axDir.y, rel.z - d * axDir.z);
  const perpLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y + perp.z * perp.z);
  if (perpLen > 1e-10) return normalize(perp);
  return perpendicularTo(axDir);
}

/**
 * Compute the reference direction (θ=0) for a sphere/torus created from revolving
 * a circular curve around an axis.
 *
 * OCCT ref: GeomAdaptor_SurfaceOfRevolution::Load lines 153-172.
 * When the curve center is on the axis, samples the curve to find a point that
 * is NOT on the axis, then computes Ox = (Oz × (PP - O)) × Oz, which gives the
 * radial direction from the axis to that point, projected perpendicular to the axis.
 */
function computeRefDirectionFromCurve(
  curve: Circle3D | Arc3D,
  ax: Axis,
): Vector3D {
  const axDir = ax.direction;
  const O = ax.origin;

  // Try start point, midpoint, and other samples to find a non-axis point
  const tStart = curve.startParam;
  const tEnd = curve.endParam;
  const tRange = tEnd - tStart;

  // OCCT samples at: Last, then (First + range/2), (First + range/3), etc.
  const samples = [tStart, tEnd, tStart + tRange / 2, tStart + tRange / 4, tStart + tRange * 3 / 4];
  for (const t of samples) {
    const pp = curve.type === 'arc3d' ? evaluateArc3D(curve, t) : evaluateCircle3D(curve, t);
    // Compute vector from axis origin to point
    const rel = vec3d(pp.x - O.x, pp.y - O.y, pp.z - O.z);
    // Project out axial component: perpComponent = rel - dot(rel, axDir) * axDir
    const d = dot(rel, axDir);
    const perp = vec3d(rel.x - d * axDir.x, rel.y - d * axDir.y, rel.z - d * axDir.z);
    const perpLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y + perp.z * perp.z);
    if (perpLen > 1e-7) {
      return normalize(perp);
    }
  }

  // Fallback: all points on axis (shouldn't happen for valid sphere/torus)
  return perpendicularTo(axDir);
}

/**
 * Attempt to simplify a revolution surface to a canonical form.
 *
 * - Line parallel to axis → CylindricalSurface
 * - Line through axis at angle → ConicalSurface
 * - Line perpendicular to axis through axis → PlaneSurface
 * - Semicircle/arc centered on axis → SphericalSurface
 * - Circle/arc in meridional plane → ToroidalSurface
 *
 * Returns the original surface if no simplification applies.
 */
export function canonicalizeRevolutionSurface(
  surface: RevolutionSurface,
): PlaneSurface | CylindricalSurface | ConicalSurface | SphericalSurface | ToroidalSurface | RevolutionSurface {
  const curve = surface.basisCurve;
  const ax = surface.axis;
  const ANGLE_TOL = 1e-8;
  const DIST_TOL = 1e-7;

  if (curve.type === 'line3d') {
    return canonicalizeLine(curve, ax, ANGLE_TOL, DIST_TOL, surface);
  }

  if (curve.type === 'circle3d' || curve.type === 'arc3d') {
    return canonicalizeCircularCurve(curve, ax, DIST_TOL, surface);
  }

  return surface;
}

function canonicalizeLine(
  line: Line3D,
  ax: Axis,
  angleTol: number,
  distTol: number,
  surface: RevolutionSurface,
): PlaneSurface | CylindricalSurface | ConicalSurface | RevolutionSurface {
  const lineDir = normalize(line.direction);
  const axDir = ax.direction;

  // Dot product of line direction with axis direction
  const absDot = Math.abs(
    lineDir.x * axDir.x + lineDir.y * axDir.y + lineDir.z * axDir.z,
  );

  // Check if line is parallel to axis
  if (Math.abs(absDot - 1) < angleTol) {
    // Line parallel to axis → Cylinder
    const radius = distanceToAxis(line.origin, ax);
    if (radius < distTol) {
      // Line is on the axis — degenerate, return as-is
      return surface;
    }
    // OCCT ref: refDirection = radial direction from axis to the line origin
    const refDir = computeRefDirectionFromPoint(line.origin, ax);
    const cylResult = makeCylindricalSurface(ax, radius, refDir);
    if (cylResult.success) {
      return cylResult.result!;
    }
    return surface;
  }

  // Check if line is perpendicular to axis
  if (absDot < angleTol) {
    // Line perpendicular to axis — check if it intersects the axis
    const startDist = distanceToAxis(line.startPoint, ax);
    const endDist = distanceToAxis(line.endPoint, ax);

    // If one end is on the axis, it's a radial line → Plane (annular disk)
    if (startDist < distTol || endDist < distTol) {
      const h = projectOntoAxis(line.origin, ax);
      const planeOrigin = point3d(
        ax.origin.x + h * axDir.x,
        ax.origin.y + h * axDir.y,
        ax.origin.z + h * axDir.z,
      );
      const p = plane(planeOrigin, axDir, normalize(lineDir));
      return makePlaneSurface(p);
    }
    return surface;
  }

  // Line at angle — check if it intersects the axis (→ Cone)
  // A line intersects the axis if one endpoint is on the axis
  const startDist = distanceToAxis(line.startPoint, ax);
  const endDist = distanceToAxis(line.endPoint, ax);

  if (startDist < distTol || endDist < distTol) {
    // Line passes through axis at one end → Cone
    // The cone semi-angle is the angle between the axis and the generatrix line.
    // absDot = |cos(angle between line and axis)|
    // So semi-angle = acos(absDot)
    const coneSemiAngle = Math.acos(Math.min(1, absDot));

    if (coneSemiAngle > angleTol && coneSemiAngle < Math.PI / 2 - angleTol) {
      // The apex is the point on the axis
      const apexPoint = startDist < distTol ? line.startPoint : line.endPoint;
      const apexH = projectOntoAxis(apexPoint, ax);
      const apex = point3d(
        ax.origin.x + apexH * axDir.x,
        ax.origin.y + apexH * axDir.y,
        ax.origin.z + apexH * axDir.z,
      );
      const coneAxis: Axis = { origin: apex, direction: axDir };
      // OCCT ref: refDirection = radial direction from axis to the non-apex endpoint
      const nonApexPt = startDist < distTol ? line.endPoint : line.startPoint;
      const refDir = computeRefDirectionFromPoint(nonApexPt, ax);
      const coneResult = makeConicalSurface(coneAxis, 0, coneSemiAngle, refDir);
      if (coneResult.success) {
        return coneResult.result!;
      }
    }
    return surface;
  }

  // Line at angle, not through axis — hyperboloid or general revolution
  return surface;
}

function canonicalizeCircularCurve(
  curve: Circle3D | Arc3D,
  ax: Axis,
  distTol: number,
  surface: RevolutionSurface,
): SphericalSurface | ToroidalSurface | RevolutionSurface {
  // Check if the curve plane contains the axis (meridional plane)
  // The curve plane normal should be perpendicular to the axis direction
  const planeNormal = curve.plane.normal;
  const axDir = ax.direction;

  const normalDotAxis = Math.abs(
    planeNormal.x * axDir.x +
    planeNormal.y * axDir.y +
    planeNormal.z * axDir.z,
  );

  // If the plane normal is perpendicular to axis, the plane contains the axis
  if (normalDotAxis > distTol) {
    return surface; // Not a meridional plane
  }

  // Curve is in a meridional plane — check if center is on the axis
  const centerDist = distanceToAxis(curve.plane.origin, ax);

  if (centerDist < distTol) {
    // Center is on axis → sphere.
    // OCCT ref: GeomAdaptor_SurfaceOfRevolution::Load lines 153-172.
    // When the circle/arc center is on the axis, find a non-degenerate point
    // on the curve and compute refDirection = radial direction from axis to
    // that point. This ensures θ=0 aligns with the revolve's starting angle.
    const refDir = computeRefDirectionFromCurve(curve, ax);

    if (curve.type === 'arc3d') {
      const sphereResult = makeSphericalSurface(curve.plane.origin, curve.radius, undefined, refDir);
      if (sphereResult.success) {
        return sphereResult.result!;
      }
    }
    if (curve.type === 'circle3d') {
      const sphereResult = makeSphericalSurface(curve.plane.origin, curve.radius, undefined, refDir);
      if (sphereResult.success) {
        return sphereResult.result!;
      }
    }
    return surface;
  }

  // Center is off axis → Torus
  // majorRadius = distance from center to axis
  // minorRadius = curve radius
  const torusResult = makeToroidalSurface(ax, centerDist, curve.radius);
  if (torusResult.success) {
    return torusResult.result!;
  }

  return surface;
}
