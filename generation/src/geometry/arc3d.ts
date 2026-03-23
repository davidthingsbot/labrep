import { Point3D, point3d, Vector3D, vec3d, Plane, plane, isZero, cross, normalize, distance, subtractPoints } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * A circular arc in 3D space.
 *
 * The arc lies in the given plane, centered at plane.origin.
 * Parametrization: P(θ) = center + r*cos(θ)*xAxis + r*sin(θ)*yAxis
 * where yAxis = normalize(cross(normal, xAxis))
 * θ ranges from startAngle to endAngle.
 *
 * OCCT reference: Geom_TrimmedCurve wrapping Geom_Circle
 */
export interface Arc3D {
  readonly type: 'arc3d';

  /** The plane containing the arc (center = plane.origin) */
  readonly plane: Plane;

  /** Radius (always positive) */
  readonly radius: number;

  /** Start angle in radians */
  readonly startAngle: number;

  /** End angle in radians */
  readonly endAngle: number;

  /** Start of parameter range (equals startAngle) */
  readonly startParam: number;

  /** End of parameter range (equals endAngle) */
  readonly endParam: number;

  /** Always false for arcs */
  readonly isClosed: boolean;

  /** Point at start angle */
  readonly startPoint: Point3D;

  /** Point at end angle */
  readonly endPoint: Point3D;
}

/**
 * Compute the Y-axis of a plane (perpendicular to both normal and xAxis).
 */
function planeYAxis(p: Plane): Vector3D {
  const crossed = cross(p.normal, p.xAxis);
  return normalize(crossed);
}

/**
 * Evaluate a point on a circle given plane, radius, and angle.
 */
function evaluateCirclePoint(p: Plane, radius: number, theta: number): Point3D {
  const yAxis = planeYAxis(p);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  return point3d(
    p.origin.x + radius * (cosT * p.xAxis.x + sinT * yAxis.x),
    p.origin.y + radius * (cosT * p.xAxis.y + sinT * yAxis.y),
    p.origin.z + radius * (cosT * p.xAxis.z + sinT * yAxis.z),
  );
}

/**
 * Create an arc in 3D space on a given plane.
 *
 * @param plane - The plane containing the arc (center = plane.origin)
 * @param radius - Radius (must be positive)
 * @param startAngle - Start angle in radians
 * @param endAngle - End angle in radians (must differ from startAngle)
 * @returns Arc3D or failure
 */
export function makeArc3D(
  arcPlane: Plane,
  radius: number,
  startAngle: number,
  endAngle: number,
): OperationResult<Arc3D> {
  if (radius <= 0 || isZero(radius)) {
    return failure('Radius must be positive');
  }

  // Check if angles are effectively equal
  const sweep = endAngle - startAngle;
  if (isZero(sweep)) {
    return failure('Start and end angles must be different');
  }

  const startPoint = evaluateCirclePoint(arcPlane, radius, startAngle);
  const endPoint = evaluateCirclePoint(arcPlane, radius, endAngle);

  return success({
    type: 'arc3d',
    plane: arcPlane,
    radius,
    startAngle,
    endAngle,
    startParam: startAngle,
    endParam: endAngle,
    isClosed: false,
    startPoint,
    endPoint,
  });
}

/**
 * Create an arc through three points in 3D space.
 *
 * The arc starts at p1, passes through p2, and ends at p3.
 * The three points must not be collinear.
 *
 * @param p1 - Start point
 * @param p2 - Point on the arc (determines direction)
 * @param p3 - End point
 * @returns Arc3D or failure if points are collinear or coincident
 */
export function makeArc3DThrough3Points(
  p1: Point3D,
  p2: Point3D,
  p3: Point3D,
): OperationResult<Arc3D> {
  // Check for coincident points
  const d12 = distance(p1, p2);
  const d23 = distance(p2, p3);
  const d31 = distance(p3, p1);

  if (isZero(d12) || isZero(d23) || isZero(d31)) {
    return failure('Cannot create arc through coincident points');
  }

  // Compute vectors from p1
  const v12 = subtractPoints(p2, p1);
  const v13 = subtractPoints(p3, p1);

  // Normal to the plane containing the three points
  const normal = cross(
    vec3d(v12.x, v12.y, v12.z),
    vec3d(v13.x, v13.y, v13.z),
  );
  const normalLen = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);

  if (isZero(normalLen)) {
    return failure('Cannot create arc through collinear points');
  }

  const unitNormal = normalize(normal);

  // Find circumcenter using the perpendicular bisector method in 3D
  // Project everything onto the plane for 2D circumcenter calculation

  // Create a local 2D coordinate system on the plane
  const xAxis = normalize(vec3d(v12.x, v12.y, v12.z));
  const yAxis = normalize(cross(unitNormal, xAxis));

  // Project points onto local 2D system (p1 is origin)
  const p1_2d = { x: 0, y: 0 };
  const p2_2d = {
    x: v12.x * xAxis.x + v12.y * xAxis.y + v12.z * xAxis.z,
    y: v12.x * yAxis.x + v12.y * yAxis.y + v12.z * yAxis.z,
  };
  const p3_2d = {
    x: v13.x * xAxis.x + v13.y * xAxis.y + v13.z * xAxis.z,
    y: v13.x * yAxis.x + v13.y * yAxis.y + v13.z * yAxis.z,
  };

  // 2D circumcenter calculation
  const ax = 2 * (p2_2d.x - p1_2d.x);
  const ay = 2 * (p2_2d.y - p1_2d.y);
  const bx = 2 * (p3_2d.x - p1_2d.x);
  const by = 2 * (p3_2d.y - p1_2d.y);

  const c1 = p2_2d.x ** 2 - p1_2d.x ** 2 + p2_2d.y ** 2 - p1_2d.y ** 2;
  const c2 = p3_2d.x ** 2 - p1_2d.x ** 2 + p3_2d.y ** 2 - p1_2d.y ** 2;

  const det = ax * by - ay * bx;

  if (isZero(det)) {
    return failure('Cannot create arc through collinear points');
  }

  const cx_2d = (c1 * by - c2 * ay) / det;
  const cy_2d = (ax * c2 - bx * c1) / det;

  // Convert center back to 3D
  const center = point3d(
    p1.x + cx_2d * xAxis.x + cy_2d * yAxis.x,
    p1.y + cx_2d * xAxis.y + cy_2d * yAxis.y,
    p1.z + cx_2d * xAxis.z + cy_2d * yAxis.z,
  );

  const radius = distance(center, p1);

  // Create plane with center as origin
  // xAxis points from center to p1
  const toP1 = subtractPoints(p1, center);
  const arcXAxis = normalize(vec3d(toP1.x, toP1.y, toP1.z));

  const arcPlane = plane(center, unitNormal, arcXAxis);

  // Calculate angles for p1, p2, p3 relative to the arc plane
  const arcYAxis = planeYAxis(arcPlane);

  function angleOf(pt: Point3D): number {
    const v = subtractPoints(pt, center);
    const x = v.x * arcXAxis.x + v.y * arcXAxis.y + v.z * arcXAxis.z;
    const y = v.x * arcYAxis.x + v.y * arcYAxis.y + v.z * arcYAxis.z;
    return Math.atan2(y, x);
  }

  const angle1 = angleOf(p1); // Should be 0 since xAxis points to p1
  const angle2 = angleOf(p2);
  let angle3 = angleOf(p3);

  // Determine arc direction: should pass through p2
  // angle1 should be ~0, check if we go CCW or CW to hit angle2 then angle3

  // Normalize angles to [0, 2π)
  const normalizeAngle = (a: number) => {
    let r = a % (2 * Math.PI);
    if (r < 0) r += 2 * Math.PI;
    return r;
  };

  const a1 = normalizeAngle(angle1);
  const a2 = normalizeAngle(angle2);
  const a3 = normalizeAngle(angle3);

  // Check if going CCW from a1 passes through a2 before a3
  const ccwTo2 = normalizeAngle(a2 - a1);
  const ccwTo3 = normalizeAngle(a3 - a1);

  let startAngle = a1;
  let endAngle: number;

  if (ccwTo2 < ccwTo3) {
    // CCW direction is correct
    endAngle = a1 + ccwTo3;
  } else {
    // Need to go CW (or the long way CCW)
    // Actually we need a3 but going CW means endAngle < startAngle
    endAngle = a1 - (2 * Math.PI - ccwTo3);
  }

  const startPoint = p1;
  const endPoint = p3;

  return success({
    type: 'arc3d',
    plane: arcPlane,
    radius,
    startAngle,
    endAngle,
    startParam: startAngle,
    endParam: endAngle,
    isClosed: false,
    startPoint,
    endPoint,
  });
}

/**
 * Evaluate the arc at parameter θ.
 *
 * P(θ) = center + radius * (cos(θ) * xAxis + sin(θ) * yAxis)
 *
 * @param arc - The arc to evaluate
 * @param theta - Parameter value (angle in radians)
 * @returns Point on the arc at parameter θ
 */
export function evaluateArc3D(arc: Arc3D, theta: number): Point3D {
  return evaluateCirclePoint(arc.plane, arc.radius, theta);
}

/**
 * Get the unit tangent vector at parameter θ.
 *
 * @param arc - The arc
 * @param theta - Parameter value (angle in radians)
 * @returns Unit tangent vector
 */
export function tangentArc3D(arc: Arc3D, theta: number): Vector3D {
  const { plane: p } = arc;
  const yAxis = planeYAxis(p);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Derivative: -sin(θ)*xAxis + cos(θ)*yAxis
  return vec3d(
    -sinT * p.xAxis.x + cosT * yAxis.x,
    -sinT * p.xAxis.y + cosT * yAxis.y,
    -sinT * p.xAxis.z + cosT * yAxis.z,
  );
}

/**
 * Get the arc length.
 *
 * @param arc - The arc
 * @returns Arc length (|endAngle - startAngle| * radius)
 */
export function lengthArc3D(arc: Arc3D): number {
  return Math.abs(arc.endAngle - arc.startAngle) * arc.radius;
}

/**
 * Create a reversed copy of the arc.
 *
 * @param arc - The arc to reverse
 * @returns A new Arc3D with swapped start/end
 */
export function reverseArc3D(arc: Arc3D): Arc3D {
  return {
    type: 'arc3d',
    plane: arc.plane,
    radius: arc.radius,
    startAngle: arc.endAngle,
    endAngle: arc.startAngle,
    startParam: arc.endAngle,
    endParam: arc.startAngle,
    isClosed: false,
    startPoint: arc.endPoint,
    endPoint: arc.startPoint,
  };
}
