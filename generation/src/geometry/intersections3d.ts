import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  Plane,
  plane,
  Axis,
  normalize,
  cross,
  dot,
  length,
  isZero,
  subtractPoints,
} from '../core';
import { Line3D, makeLine3D, makeLine3DFromPointDir } from './line3d';
import { OperationResult, success, failure } from '../mesh/mesh';
import { SphericalSurface } from '../surfaces/spherical-surface';
import { CylindricalSurface } from '../surfaces/cylindrical-surface';
import { ConicalSurface } from '../surfaces/conical-surface';

// ═══════════════════════════════════════════════════════
// RESULT TYPES FOR SURFACE INTERSECTIONS
// ═══════════════════════════════════════════════════════

/** Result of a plane-surface intersection: a circle lying in the cutting plane. */
export interface PlaneCircleIntersection {
  readonly type: 'circle';
  readonly center: Point3D;
  readonly radius: number;
  /** Normal of the circle plane (same as the cutting plane normal) */
  readonly normal: Vector3D;
}

/** Result of a plane-cylinder intersection: an ellipse in the cutting plane. */
export interface PlaneEllipseIntersection {
  readonly type: 'ellipse';
  readonly center: Point3D;
  readonly majorRadius: number;
  readonly minorRadius: number;
  /** Direction of the major axis */
  readonly majorAxis: Vector3D;
  /** Direction of the minor axis */
  readonly minorAxis: Vector3D;
  readonly normal: Vector3D;
}

/** Result of a plane-cylinder intersection: one or two lines. */
export interface PlaneLinesIntersection {
  readonly type: 'lines';
  readonly lines: { origin: Point3D; direction: Vector3D }[];
}

export type PlaneSphereResult = PlaneCircleIntersection | null;
export type PlaneCylinderResult = PlaneCircleIntersection | PlaneEllipseIntersection | PlaneLinesIntersection | null;
export type PlaneConeResult = PlaneCircleIntersection | PlaneEllipseIntersection | PlaneLinesIntersection | null;

/**
 * Compute the intersection of two planes.
 *
 * Two non-parallel planes intersect along a line.
 * Parallel or coincident planes return null.
 *
 * @param pl1 - First plane
 * @param pl2 - Second plane
 * @returns Line3D along the intersection, or null if planes are parallel/coincident
 */
export function intersectPlanePlane(
  pl1: Plane,
  pl2: Plane,
): OperationResult<Line3D | null> {
  // Direction of intersection line = cross product of normals
  const dir = cross(pl1.normal, pl2.normal);
  const dirLen = length(dir);

  // Parallel or coincident planes
  if (isZero(dirLen)) {
    return success(null);
  }

  const direction = normalize(dir);

  // Find a point on the intersection line.
  // Solve the system:
  //   dot(pt - pl1.origin, pl1.normal) = 0
  //   dot(pt - pl2.origin, pl2.normal) = 0
  //
  // We find the point closest to the origin on the intersection line.
  // Using the formula: pt = (d1 * n2 - d2 * n1) × dir / |dir|²
  // where d1 = dot(pl1.origin, pl1.normal), d2 = dot(pl2.origin, pl2.normal)
  const d1 = dot(pl1.normal, pl1.origin as unknown as Vector3D);
  const d2 = dot(pl2.normal, pl2.origin as unknown as Vector3D);

  const n1 = pl1.normal;
  const n2 = pl2.normal;
  const dirLenSq = dirLen * dirLen;

  // pt = (d1 * (n2 × dir) + d2 * (dir × n1)) / |dir|²
  const n2xDir = cross(n2, dir);
  const dirxN1 = cross(dir, n1);

  const origin = point3d(
    (d1 * n2xDir.x + d2 * dirxN1.x) / dirLenSq,
    (d1 * n2xDir.y + d2 * dirxN1.y) / dirLenSq,
    (d1 * n2xDir.z + d2 * dirxN1.z) / dirLenSq,
  );

  const lineResult = makeLine3DFromPointDir(origin, direction, 1);
  if (!lineResult.success) {
    return failure(`Failed to create intersection line: ${lineResult.error}`);
  }

  return success(lineResult.result!);
}

// ═══════════════════════════════════════════════════════
// PLANE-SPHERE INTERSECTION
// ═══════════════════════════════════════════════════════

const TANGENT_TOL = 1e-6;

/**
 * Compute the intersection of a plane and a sphere.
 *
 * A plane intersects a sphere in a circle (transverse), a point (tangent),
 * or not at all. Tangent cases are treated as empty (degenerate circle).
 *
 * Based on OCCT IntAna_QuadQuadGeo (lines 965-1004).
 *
 * @param pl - The cutting plane
 * @param sphere - The spherical surface
 * @returns Circle intersection result, or null if no intersection / tangent
 */
export function intersectPlaneSphere(
  pl: Plane,
  sphere: SphericalSurface,
): OperationResult<PlaneSphereResult> {
  // Signed distance from sphere center to plane
  const rel = subtractPoints(sphere.center, pl.origin);
  const dist = dot(rel, pl.normal);

  // Check if plane intersects sphere
  if (Math.abs(dist) >= sphere.radius - TANGENT_TOL) {
    return success(null); // Miss or tangent
  }

  // Circle center: project sphere center onto plane
  const center = point3d(
    sphere.center.x - dist * pl.normal.x,
    sphere.center.y - dist * pl.normal.y,
    sphere.center.z - dist * pl.normal.z,
  );

  // Circle radius: Pythagorean theorem
  const radius = Math.sqrt(sphere.radius * sphere.radius - dist * dist);

  return success({
    type: 'circle',
    center,
    radius,
    normal: pl.normal,
  });
}

// ═══════════════════════════════════════════════════════
// PLANE-CYLINDER INTERSECTION
// ═══════════════════════════════════════════════════════

/**
 * Compute the intersection of a plane and a cylinder.
 *
 * Three cases based on the angle between plane normal and cylinder axis:
 * - Perpendicular (normal ∥ axis): circle
 * - Parallel (normal ⊥ axis): 0, 1, or 2 lines
 * - Oblique: ellipse
 *
 * Based on OCCT IntAna_QuadQuadGeo (lines 541-707).
 *
 * @param pl - The cutting plane
 * @param cyl - The cylindrical surface
 * @returns Intersection result (circle, ellipse, lines, or null)
 */
export function intersectPlaneCylinder(
  pl: Plane,
  cyl: CylindricalSurface,
): OperationResult<PlaneCylinderResult> {
  const axDir = cyl.axis.direction;
  const r = cyl.radius;

  // Angle between plane normal and cylinder axis
  const cosAngle = Math.abs(dot(pl.normal, axDir));
  const sinAngle = length(cross(pl.normal, axDir));

  // Case 1: Plane perpendicular to axis (normal parallel to axis)
  if (cosAngle > 1 - TANGENT_TOL) {
    // Intersection is a circle of radius r, centered where axis hits plane
    const rel = subtractPoints(cyl.axis.origin, pl.origin);
    const t = dot(rel, pl.normal) / dot(axDir, pl.normal);
    const center = point3d(
      cyl.axis.origin.x - t * axDir.x,
      cyl.axis.origin.y - t * axDir.y,
      cyl.axis.origin.z - t * axDir.z,
    );
    // Wait, we need to find where the axis intersects the plane.
    // t such that (axisOrigin + t * axDir - planeOrigin) . planeNormal = 0
    // dot(axisOrigin - planeOrigin, normal) + t * dot(axDir, normal) = 0
    const denom = dot(axDir, pl.normal);
    if (Math.abs(denom) < 1e-12) return success(null);
    const tAxis = -dot(subtractPoints(cyl.axis.origin, pl.origin), pl.normal) / denom;
    const circleCenter = point3d(
      cyl.axis.origin.x + tAxis * axDir.x,
      cyl.axis.origin.y + tAxis * axDir.y,
      cyl.axis.origin.z + tAxis * axDir.z,
    );

    return success({
      type: 'circle',
      center: circleCenter,
      radius: r,
      normal: pl.normal,
    });
  }

  // Case 2: Plane parallel to axis (normal perpendicular to axis → cosAngle ≈ 0)
  if (cosAngle < TANGENT_TOL) {
    // Distance from cylinder axis to plane
    const relOrigin = subtractPoints(cyl.axis.origin, pl.origin);
    // Project axis origin onto plane normal direction (ignoring axis component)
    const dist = dot(relOrigin, pl.normal);

    if (Math.abs(dist) > r + TANGENT_TOL) {
      return success(null); // Miss
    }

    if (Math.abs(dist) > r - TANGENT_TOL) {
      // Tangent: single line on the cylinder at the closest point
      const tangentPt = point3d(
        cyl.axis.origin.x - dist * pl.normal.x,
        cyl.axis.origin.y - dist * pl.normal.y,
        cyl.axis.origin.z - dist * pl.normal.z,
      );
      return success({
        type: 'lines',
        lines: [{ origin: tangentPt, direction: axDir }],
      });
    }

    // Two parallel lines
    // Direction along which the lines are offset from the axis projection
    const perp = normalize(cross(axDir, pl.normal)); // perpendicular to both
    const h = Math.sqrt(r * r - dist * dist);

    // Project axis origin onto the plane
    const axisOnPlane = point3d(
      cyl.axis.origin.x - dist * pl.normal.x,
      cyl.axis.origin.y - dist * pl.normal.y,
      cyl.axis.origin.z - dist * pl.normal.z,
    );

    return success({
      type: 'lines',
      lines: [
        { origin: point3d(axisOnPlane.x + h * perp.x, axisOnPlane.y + h * perp.y, axisOnPlane.z + h * perp.z), direction: axDir },
        { origin: point3d(axisOnPlane.x - h * perp.x, axisOnPlane.y - h * perp.y, axisOnPlane.z - h * perp.z), direction: axDir },
      ],
    });
  }

  // Case 3: Oblique intersection → ellipse
  // Find where axis intersects the plane
  const denom = dot(axDir, pl.normal);
  if (Math.abs(denom) < 1e-12) return success(null);
  const tAxis = -dot(subtractPoints(cyl.axis.origin, pl.origin), pl.normal) / denom;
  const ellipseCenter = point3d(
    cyl.axis.origin.x + tAxis * axDir.x,
    cyl.axis.origin.y + tAxis * axDir.y,
    cyl.axis.origin.z + tAxis * axDir.z,
  );

  // Minor radius = r (in the direction perpendicular to both normal and axis)
  // Major radius = r / cos(angle between axis and plane normal projected...)
  // Actually: the ellipse has minor axis = r (perpendicular to axis, in the plane),
  // and major axis = r / |cos(angle)| (along the axis projection in the plane)
  const majorRadius = r / cosAngle;
  const minorRadius = r;

  // Major axis direction: projection of cylinder axis onto the cutting plane
  const axisInPlane = vec3d(
    axDir.x - dot(axDir, pl.normal) * pl.normal.x,
    axDir.y - dot(axDir, pl.normal) * pl.normal.y,
    axDir.z - dot(axDir, pl.normal) * pl.normal.z,
  );
  const majorAxis = normalize(axisInPlane);
  const minorAxis = normalize(cross(pl.normal, majorAxis));

  return success({
    type: 'ellipse',
    center: ellipseCenter,
    majorRadius,
    minorRadius,
    majorAxis,
    minorAxis,
    normal: pl.normal,
  });
}

// ═══════════════════════════════════════════════════════
// PLANE-CONE INTERSECTION
// ═══════════════════════════════════════════════════════

/**
 * Compute the intersection of a plane and a cone.
 *
 * Produces circle, ellipse, lines, or empty depending on the relative
 * orientation. Parabola and hyperbola cases return null (not yet needed
 * for boolean operations with typical configurations).
 *
 * Based on OCCT IntAna_QuadQuadGeo (lines 737-938).
 *
 * @param pl - The cutting plane
 * @param cone - The conical surface
 * @returns Intersection result or null
 */
export function intersectPlaneCone(
  pl: Plane,
  cone: ConicalSurface,
): OperationResult<PlaneConeResult> {
  const axDir = cone.axis.direction;
  const alpha = cone.semiAngle;
  const cosAlpha = Math.cos(alpha);
  const sinAlpha = Math.sin(alpha);

  // Angle between plane normal and cone axis
  const cosTheta = Math.abs(dot(pl.normal, axDir));
  const sinTheta = length(cross(pl.normal, axDir));

  // Apex position: the apex is at v = -radius / sin(semiAngle) along the axis from the reference circle
  // Actually for our ConicalSurface: at v=0, radius = cone.radius. Apex is where effective radius = 0:
  // cone.radius + v * sin(semiAngle) = 0 → v = -cone.radius / sin(semiAngle)
  // Apex 3D position: axis.origin + v*cos(semiAngle) * axis.direction
  const vApex = -cone.radius / sinAlpha;
  const apex = point3d(
    cone.axis.origin.x + vApex * cosAlpha * axDir.x,
    cone.axis.origin.y + vApex * cosAlpha * axDir.y,
    cone.axis.origin.z + vApex * cosAlpha * axDir.z,
  );

  // Distance from apex to plane
  const apexDist = dot(subtractPoints(apex, pl.origin), pl.normal);

  // Case 1: Plane perpendicular to axis → circle
  if (cosTheta > 1 - TANGENT_TOL) {
    if (Math.abs(apexDist) < TANGENT_TOL) {
      // Plane through apex, perpendicular to axis → just the apex point
      return success(null);
    }

    // Find where axis hits the plane
    const denom = dot(axDir, pl.normal);
    if (Math.abs(denom) < 1e-12) return success(null);
    const tAxis = -dot(subtractPoints(cone.axis.origin, pl.origin), pl.normal) / denom;
    const circleCenter = point3d(
      cone.axis.origin.x + tAxis * axDir.x,
      cone.axis.origin.y + tAxis * axDir.y,
      cone.axis.origin.z + tAxis * axDir.z,
    );

    // Radius at this height: effective_radius = cone.radius + v * sin(alpha)
    // where v is the distance along generatrix: tAxis_along_axis / cos(alpha) → but tAxis is along axis
    // Actually the distance along axis from reference = tAxis, and v = tAxis / cos(alpha)
    // effective_radius = cone.radius + (tAxis / cos(alpha)) * sin(alpha) = cone.radius + tAxis * tan(alpha)
    const circleRadius = cone.radius + tAxis * Math.tan(alpha);
    if (circleRadius < TANGENT_TOL) return success(null);

    return success({
      type: 'circle',
      center: circleCenter,
      radius: circleRadius,
      normal: pl.normal,
    });
  }

  // Case 2: Plane contains the apex → lines through apex
  if (Math.abs(apexDist) < TANGENT_TOL) {
    // The intersection depends on the angle between the plane and the cone
    // costa = cos(theta + alpha) determines if the plane cuts the cone
    const costa = cosTheta * cosAlpha - sinTheta * sinAlpha;

    if (Math.abs(costa) < TANGENT_TOL) {
      // Plane parallel to generatrix through apex → single line
      const lineDir = normalize(cross(pl.normal, cross(axDir, pl.normal)));
      return success({
        type: 'lines',
        lines: [{ origin: apex, direction: lineDir }],
      });
    }

    if (cosTheta < sinAlpha - TANGENT_TOL) {
      // Plane angle within cone opening → two lines through apex
      // Compute the two generatrix directions in the cutting plane
      const planeAxisProj = vec3d(
        axDir.x - dot(axDir, pl.normal) * pl.normal.x,
        axDir.y - dot(axDir, pl.normal) * pl.normal.y,
        axDir.z - dot(axDir, pl.normal) * pl.normal.z,
      );
      const projLen = length(planeAxisProj);
      if (projLen < 1e-10) return success(null);
      const projDir = normalize(planeAxisProj);
      const perpInPlane = normalize(cross(pl.normal, projDir));

      // The two lines make angle alpha with the axis projection
      // In the cutting plane, the generatrix directions are rotated ±beta from projDir
      // where beta = asin(sin(alpha) / sin(theta))... this gets complex
      // For now, return null for this edge case (two lines through apex)
      // TODO: implement when needed for boolean operations
      return success(null);
    }

    // Plane angle outside cone opening → just the apex point
    return success(null);
  }

  // Case 3: General oblique intersection (apex not on plane)
  // This produces an ellipse when cosTheta > sinAlpha, or parabola/hyperbola otherwise.

  if (cosTheta > sinAlpha + TANGENT_TOL) {
    // Ellipse case
    // Find where axis hits the plane
    const denom = dot(axDir, pl.normal);
    if (Math.abs(denom) < 1e-12) return success(null);
    const tAxis = -dot(subtractPoints(cone.axis.origin, pl.origin), pl.normal) / denom;

    // Center of ellipse: projection of axis-plane intersection
    const ellipseCenter = point3d(
      cone.axis.origin.x + tAxis * axDir.x,
      cone.axis.origin.y + tAxis * axDir.y,
      cone.axis.origin.z + tAxis * axDir.z,
    );

    // Cone radius at the axis-plane intersection height
    const rAtIntersection = cone.radius + tAxis * Math.tan(alpha);
    if (rAtIntersection < TANGENT_TOL) return success(null);

    // Ellipse semi-axes
    const majorRadius = rAtIntersection / cosTheta;
    const minorRadius = rAtIntersection;

    const axisInPlane = vec3d(
      axDir.x - denom * pl.normal.x,
      axDir.y - denom * pl.normal.y,
      axDir.z - denom * pl.normal.z,
    );
    const majorAxis = normalize(axisInPlane);
    const minorAxis = normalize(cross(pl.normal, majorAxis));

    return success({
      type: 'ellipse',
      center: ellipseCenter,
      majorRadius,
      minorRadius,
      majorAxis,
      minorAxis,
      normal: pl.normal,
    });
  }

  // Parabola/hyperbola cases — not needed for typical boolean operations
  return success(null);
}
