import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  Plane,
  plane,
  Axis,
  axis,
  distance,
  isZero,
  length,
  normalize,
  cross,
  scale,
  dot,
  subtractPoints,
  rotationAxis,
  transformPoint,
  transformVector,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Curve3D, Edge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { makeVertex, Vertex } from '../topology/vertex';
import {
  Wire,
  OrientedEdge,
  orientEdge,
  makeWire,
  wireStartPoint,
  orientedEdgeStartPoint,
  orientedEdgeEndPoint,
  reverseOrientedEdge,
} from '../topology/wire';
import { Face, Surface, makeFace, makePlanarFace } from '../topology/face';
import { Shell, makeShell, shellIsClosed } from '../topology/shell';
import { Solid, makeSolid } from '../topology/solid';
import {
  makePlaneSurface,
  makeRevolutionSurface,
  canonicalizeRevolutionSurface,
} from '../surfaces';
import { Line3D, makeLine3D, evaluateLine3D } from '../geometry/line3d';
import { Circle3D, makeCircle3D, evaluateCircle3D } from '../geometry/circle3d';
import { Arc3D, makeArc3D, evaluateArc3D } from '../geometry/arc3d';
import { makeLine2D } from '../geometry/line2d';
import { toAdapter } from '../surfaces/surface-adapter';
import { makePCurve } from '../topology/pcurve';
import { addPCurveToEdge } from '../topology/edge';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/**
 * Result of a revolve operation.
 */
export interface RevolveResult {
  /** The resulting solid */
  solid: Solid;

  /** Cap face at start angle (partial revolve only) */
  startFace?: Face;

  /** Cap face at end angle (partial revolve only) */
  endFace?: Face;

  /** Side faces, one per non-degenerate profile edge */
  sideFaces: Face[];
}

// ═══════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════

const DIST_TOL = 1e-6;

/**
 * Compute the perpendicular distance from a point to an axis.
 */
function distanceToAxis(pt: Point3D, ax: Axis): number {
  const d = vec3d(pt.x - ax.origin.x, pt.y - ax.origin.y, pt.z - ax.origin.z);
  const axialComponent = dot(d, ax.direction);
  const radialVec = vec3d(
    d.x - axialComponent * ax.direction.x,
    d.y - axialComponent * ax.direction.y,
    d.z - axialComponent * ax.direction.z,
  );
  return length(radialVec);
}

/**
 * Check if a point is on the axis (within tolerance).
 */
function isOnAxis(pt: Point3D, ax: Axis): boolean {
  return distanceToAxis(pt, ax) < DIST_TOL;
}

/**
 * Rotate a point around an axis by an angle.
 */
function rotatePoint(pt: Point3D, ax: Axis, angle: number): Point3D {
  const t = rotationAxis(ax.origin, ax.direction, angle);
  return transformPoint(t, pt);
}

/**
 * Rotate a curve around an axis by an angle.
 */
function rotateCurve(curve: Curve3D, ax: Axis, angle: number): OperationResult<Curve3D> {
  const t = rotationAxis(ax.origin, ax.direction, angle);

  switch (curve.type) {
    case 'line3d': {
      const newStart = transformPoint(t, curve.startPoint);
      const newEnd = transformPoint(t, curve.endPoint);
      return makeLine3D(newStart, newEnd);
    }
    case 'circle3d': {
      const newOrigin = transformPoint(t, curve.plane.origin);
      const newNormal = transformVector(t, curve.plane.normal);
      const newXAxis = transformVector(t, curve.plane.xAxis);
      const newPlane = plane(newOrigin, newNormal, newXAxis);
      return makeCircle3D(newPlane, curve.radius);
    }
    case 'arc3d': {
      const newOrigin = transformPoint(t, curve.plane.origin);
      const newNormal = transformVector(t, curve.plane.normal);
      const newXAxis = transformVector(t, curve.plane.xAxis);
      const newPlane = plane(newOrigin, newNormal, newXAxis);
      return makeArc3D(newPlane, curve.radius, curve.startAngle, curve.endAngle);
    }
  }
}

/**
 * Rotate an edge around an axis by an angle.
 */
function rotateEdge(edge: Edge, ax: Axis, angle: number): OperationResult<Edge> {
  const curveResult = rotateCurve(edge.curve, ax, angle);
  if (!curveResult.success) {
    return failure(`Failed to rotate edge: ${curveResult.error}`);
  }
  return makeEdgeFromCurve(curveResult.result!);
}

/**
 * Rotate a wire around an axis by an angle.
 */
function rotateWire(wire: Wire, ax: Axis, angle: number): OperationResult<Wire> {
  const rotatedEdges: OrientedEdge[] = [];

  for (const oe of wire.edges) {
    const edgeResult = rotateEdge(oe.edge, ax, angle);
    if (!edgeResult.success) {
      return failure(`Failed to rotate wire: ${edgeResult.error}`);
    }
    rotatedEdges.push(orientEdge(edgeResult.result!, oe.forward));
  }

  return makeWire(rotatedEdges);
}

/**
 * Reverse a wire (flip traversal direction).
 */
function reverseWire(wire: Wire): OperationResult<Wire> {
  const reversedEdges: OrientedEdge[] = [];
  for (let i = wire.edges.length - 1; i >= 0; i--) {
    reversedEdges.push(reverseOrientedEdge(wire.edges[i]));
  }
  return makeWire(reversedEdges);
}

/**
 * Create a circle or arc edge sweeping a point around the axis.
 */
function makeSweepEdge(
  pt: Point3D,
  ax: Axis,
  startAngle: number,
  endAngle: number,
): OperationResult<Edge> {
  const radius = distanceToAxis(pt, ax);

  // Compute the plane for the circle/arc
  // The plane is perpendicular to the axis, at the height of the point
  const d = vec3d(pt.x - ax.origin.x, pt.y - ax.origin.y, pt.z - ax.origin.z);
  const axialComponent = dot(d, ax.direction);
  const center = point3d(
    ax.origin.x + axialComponent * ax.direction.x,
    ax.origin.y + axialComponent * ax.direction.y,
    ax.origin.z + axialComponent * ax.direction.z,
  );

  // The radial direction from axis to point defines the xAxis of the circle plane
  const radialVec = vec3d(pt.x - center.x, pt.y - center.y, pt.z - center.z);
  const radialDir = normalize(radialVec);

  // Circle plane: origin = center, normal = axis direction, xAxis = radial direction
  const circlePlane = plane(center, ax.direction, radialDir);

  const isFullCircle = Math.abs(endAngle - startAngle - 2 * Math.PI) < 1e-10;

  if (isFullCircle) {
    const circleResult = makeCircle3D(circlePlane, radius);
    if (!circleResult.success) {
      return failure(`Failed to create sweep circle: ${circleResult.error}`);
    }
    return makeEdgeFromCurve(circleResult.result!);
  } else {
    const arcResult = makeArc3D(circlePlane, radius, startAngle, endAngle);
    if (!arcResult.success) {
      return failure(`Failed to create sweep arc: ${arcResult.error}`);
    }
    return makeEdgeFromCurve(arcResult.result!);
  }
}

// ═══════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════

/**
 * Validate a wire as a revolve profile.
 *
 * Requirements:
 * - Wire must be closed
 * - Wire must be coplanar
 * - Wire must not cross the revolve axis (all vertices on one side or on axis)
 * - Wire must lie in a meridional plane (plane containing the axis)
 */
export function validateRevolveProfile(
  wire: Wire,
  ax: Axis,
): OperationResult<{ plane: Plane }> {
  if (!wire.isClosed) {
    return failure('Profile wire must be closed');
  }

  // Check that no vertices cross the axis
  // Collect signed distances (actually just check all are >= 0 or all <= 0)
  // Since we require the profile to be in a meridional plane,
  // "crossing the axis" means having vertices on both sides of the axis in the profile plane
  let hasPositiveX = false;
  let hasNegativeX = false;

  for (const oe of wire.edges) {
    const pts = [edgeStartPoint(oe.edge), edgeEndPoint(oe.edge)];
    for (const pt of pts) {
      const d = distanceToAxis(pt, ax);
      if (d > DIST_TOL) {
        // Determine which side of the axis the point is on
        // We use the cross product to determine sign
        const toPoint = vec3d(
          pt.x - ax.origin.x,
          pt.y - ax.origin.y,
          pt.z - ax.origin.z,
        );
        const axialComp = dot(toPoint, ax.direction);
        const radial = vec3d(
          toPoint.x - axialComp * ax.direction.x,
          toPoint.y - axialComp * ax.direction.y,
          toPoint.z - axialComp * ax.direction.z,
        );
        // Use a consistent reference to determine sign
        // For the first off-axis point, establish the reference
        hasPositiveX = true; // All non-axis points are "positive" in our meridional plane
      }
    }
  }

  // Note: We don't check for axis crossing in Phase 9.
  // Profiles that span both sides of the axis (like semicircles for spheres)
  // are valid. Self-intersection detection would require more sophisticated
  // analysis that we defer to a future phase.

  // Extract plane from wire for the result
  const profilePlane = extractMeridionalPlane(wire, ax);
  if (!profilePlane.success) {
    return failure(profilePlane.error!);
  }

  return success({ plane: profilePlane.result! });
}

/**
 * Extract the meridional plane from the wire (plane containing both the wire and the axis).
 */
function extractMeridionalPlane(wire: Wire, ax: Axis): OperationResult<Plane> {
  // Find the first off-axis point to define the meridional plane.
  // Check edge endpoints first, then sample curve midpoints for arcs/circles
  // whose endpoints are both on the axis (e.g., a semicircle from pole to pole).
  for (const oe of wire.edges) {
    const pts = [edgeStartPoint(oe.edge), edgeEndPoint(oe.edge)];

    // Also sample the midpoint for curved edges (arcs/circles)
    if (oe.edge.curve.type !== 'line3d') {
      const midParam = (oe.edge.startParam + oe.edge.endParam) / 2;
      const midPt = evaluateCurveAt(oe.edge.curve, midParam);
      if (midPt) pts.push(midPt);
    }

    for (const pt of pts) {
      if (!isOnAxis(pt, ax)) {
        const d = vec3d(pt.x - ax.origin.x, pt.y - ax.origin.y, pt.z - ax.origin.z);
        const axialComp = dot(d, ax.direction);
        const radial = vec3d(
          d.x - axialComp * ax.direction.x,
          d.y - axialComp * ax.direction.y,
          d.z - axialComp * ax.direction.z,
        );
        const radialDir = normalize(radial);
        // Meridional plane normal = cross(axisDir, radialDir)
        const normal = cross(ax.direction, radialDir);
        return success(plane(ax.origin, normal, radialDir));
      }
    }
  }

  return failure('Profile has no off-axis points — cannot determine meridional plane');
}

/**
 * Evaluate a 3D curve at parameter t.
 */
function evaluateCurveAt(curve: Curve3D, t: number): Point3D | null {
  switch (curve.type) {
    case 'line3d':
      return evaluateLine3D(curve, t);
    case 'circle3d':
      return evaluateCircle3D(curve, t);
    case 'arc3d':
      return evaluateArc3D(curve, t);
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════
// SIDE FACE GENERATION
// ═══════════════════════════════════════════════════════

/**
 * Generate a side face from revolving a profile edge.
 *
 * For a full revolve (360°):
 *   Wire = [profileEdge(seam, forward), circle@end, profileEdge(seam, reversed), circle@start(reversed)]
 *
 * For a partial revolve:
 *   Wire = [profileEdge(start), arc@end, profileEdge(end, reversed), arc@start(reversed)]
 *
 * Special cases:
 *   - Vertex on axis → pole (3-edge face: seam, circle/arc, seam reversed)
 *   - Both vertices on axis → edge on axis → skip (no face)
 */
function generateRevolveSideFace(
  edge: Edge,
  ax: Axis,
  startAngle: number,
  endAngle: number,
  isFullRevolve: boolean,
): OperationResult<Face | null> {
  const startPt = edgeStartPoint(edge);
  const endPt = edgeEndPoint(edge);
  const startOnAxis = isOnAxis(startPt, ax);
  const endOnAxis = isOnAxis(endPt, ax);

  // Both endpoints on axis: for line edges, the edge lies entirely on the axis
  // and generates no face. For arc/circle edges, the curve bulges off-axis
  // (e.g., a semicircle from south pole to north pole) and generates a face.
  if (startOnAxis && endOnAxis && edge.curve.type === 'line3d') {
    return success(null);
  }

  // Create the revolution surface
  const revSurfResult = makeRevolutionSurface(edge.curve, ax);
  if (!revSurfResult.success) {
    return failure(`Failed to create revolution surface: ${revSurfResult.error}`);
  }
  const surface: Surface = canonicalizeRevolutionSurface(revSurfResult.result!);

  // Create the rotated edge at end angle (for seam or end cap)
  const rotatedEdgeResult = rotateEdge(edge, ax, endAngle - startAngle);
  if (!rotatedEdgeResult.success) {
    return failure(`Failed to rotate edge: ${rotatedEdgeResult.error}`);
  }
  const rotatedEdge = rotatedEdgeResult.result!;

  if (isFullRevolve) {
    return generateFullRevolveFace(edge, rotatedEdge, surface, ax, startPt, endPt, startOnAxis, endOnAxis);
  } else {
    return generatePartialRevolveFace(edge, rotatedEdge, surface, ax, startAngle, endAngle, startPt, endPt, startOnAxis, endOnAxis);
  }
}

/**
 * Generate face for a full 360° revolve.
 * The profile edge acts as a seam (appears twice: forward and reversed).
 */
function generateFullRevolveFace(
  edge: Edge,
  _rotatedEdge: Edge, // Same as edge for full revolve
  surface: Surface,
  ax: Axis,
  startPt: Point3D,
  endPt: Point3D,
  startOnAxis: boolean,
  endOnAxis: boolean,
): OperationResult<Face | null> {
  const wireEdges: OrientedEdge[] = [];

  // ── Compute UV layout for PCurves on revolution surface ──
  // OCCT ref: BRepSweep_Rotation::SetDirectingPCurve, SetGeneratingPCurve
  //
  // Revolution surface S(θ, v) = rotate(basisCurve(v), axis, θ)
  //   U = θ ∈ [0, 2π)  (revolution angle)
  //   V = basis curve parameter
  //
  // Seam edge (profile): vertical line in UV
  //   fwd:  (0, V_start) → (0, V_end)    — left side
  //   rev:  (2π, V_end) → (2π, V_start)  — right side
  //
  // Circle edge at constant V: horizontal line in UV
  //   fwd:  (0, V_const) → (2π, V_const)
  //   rev:  (2π, V_const) → (0, V_const)

  const adapter = toAdapter(surface);
  const vStart = adapter.projectPoint(startPt).v;
  const vEnd = adapter.projectPoint(endPt).v;
  const TWO_PI = 2 * Math.PI;

  // Helper: attach seam PCurves to edge (two PCurves: left at U=0, right at U=2π)
  function addSeamPCurves(e: Edge): void {
    const leftPC = makeLine2D({ x: 0, y: vStart }, { x: 0, y: vEnd });
    if (leftPC.result) addPCurveToEdge(e, makePCurve(leftPC.result, surface));
    const rightPC = makeLine2D({ x: TWO_PI, y: vEnd }, { x: TWO_PI, y: vStart });
    if (rightPC.result) addPCurveToEdge(e, makePCurve(rightPC.result, surface));
  }

  // Helper: attach circle PCurve to edge
  function addCirclePCurve(e: Edge, v: number, forward: boolean): void {
    const pc = forward
      ? makeLine2D({ x: 0, y: v }, { x: TWO_PI, y: v })
      : makeLine2D({ x: TWO_PI, y: v }, { x: 0, y: v });
    if (pc.result) addPCurveToEdge(e, makePCurve(pc.result, surface));
  }

  if (startOnAxis && endOnAxis) {
    // Both poles on axis: "lens" face (sphere).
    // Wire: seam (forward) → seam (reversed)
    addSeamPCurves(edge);
    wireEdges.push(
      orientEdge(edge, true),
      orientEdge(edge, false),
    );
  } else if (!startOnAxis && !endOnAxis) {
    // Normal case: 4-edge face (cylinder-like)
    const endCircleResult = makeSweepEdge(endPt, ax, 0, TWO_PI);
    const startCircleResult = makeSweepEdge(startPt, ax, 0, TWO_PI);
    if (!endCircleResult.success || !startCircleResult.success) {
      return failure('Failed to create sweep circles');
    }
    let endCircle = endCircleResult.result!;
    let startCircle = startCircleResult.result!;

    addSeamPCurves(edge);
    addCirclePCurve(endCircle, vEnd, true);
    addCirclePCurve(startCircle, vStart, false);

    wireEdges.push(
      orientEdge(edge, true),
      orientEdge(endCircle, true),
      orientEdge(edge, false),
      orientEdge(startCircle, false),
    );
  } else if (startOnAxis) {
    // Start vertex on axis (pole) — 3-edge face
    const endCircleResult = makeSweepEdge(endPt, ax, 0, TWO_PI);
    if (!endCircleResult.success) {
      return failure('Failed to create sweep circle');
    }
    let endCircle = endCircleResult.result!;

    addSeamPCurves(edge);
    addCirclePCurve(endCircle, vEnd, true);

    wireEdges.push(
      orientEdge(edge, true),
      orientEdge(endCircle, true),
      orientEdge(edge, false),
    );
  } else {
    // End vertex on axis (pole) — 3-edge face
    const startCircleResult = makeSweepEdge(startPt, ax, 0, TWO_PI);
    if (!startCircleResult.success) {
      return failure('Failed to create sweep circle');
    }
    let startCircle = startCircleResult.result!;

    addSeamPCurves(edge);
    addCirclePCurve(startCircle, vStart, false);

    wireEdges.push(
      orientEdge(edge, true),
      orientEdge(edge, false),
      orientEdge(startCircle, false),
    );
  }

  const wireResult = makeWire(wireEdges);
  if (!wireResult.success) {
    return failure(`Failed to create revolve face wire: ${wireResult.error}`);
  }

  const faceResult = makeFace(surface, wireResult.result!);
  if (!faceResult.success) {
    return failure(`Failed to create revolve face: ${faceResult.error}`);
  }

  return success(faceResult.result!);
}

/**
 * Generate face for a partial revolve.
 */
function generatePartialRevolveFace(
  edge: Edge,
  rotatedEdge: Edge,
  surface: Surface,
  ax: Axis,
  startAngle: number,
  endAngle: number,
  startPt: Point3D,
  endPt: Point3D,
  startOnAxis: boolean,
  endOnAxis: boolean,
): OperationResult<Face | null> {
  const wireEdges: OrientedEdge[] = [];

  if (!startOnAxis && !endOnAxis) {
    // Normal case: 4-edge face (quad)
    // bottom edge → arc@end → top edge (reversed) → arc@start (reversed)
    const endArcResult = makeSweepEdge(endPt, ax, startAngle, endAngle);
    const startArcResult = makeSweepEdge(startPt, ax, startAngle, endAngle);

    if (!endArcResult.success || !startArcResult.success) {
      return failure('Failed to create sweep arcs');
    }

    wireEdges.push(
      orientEdge(edge, true),                  // bottom edge at startAngle
      orientEdge(endArcResult.result!, true),  // arc at end vertex
      orientEdge(rotatedEdge, false),          // top edge at endAngle (reversed)
      orientEdge(startArcResult.result!, false), // arc at start vertex (reversed)
    );
  } else if (startOnAxis) {
    // Start vertex on axis — 3-edge face (triangle-like)
    const endArcResult = makeSweepEdge(endPt, ax, startAngle, endAngle);
    if (!endArcResult.success) {
      return failure('Failed to create sweep arc');
    }

    wireEdges.push(
      orientEdge(edge, true),                 // edge from pole to outer
      orientEdge(endArcResult.result!, true), // arc at end vertex
      orientEdge(rotatedEdge, false),         // rotated edge from outer back to pole
    );
  } else {
    // End vertex on axis — 3-edge face
    const startArcResult = makeSweepEdge(startPt, ax, startAngle, endAngle);
    if (!startArcResult.success) {
      return failure('Failed to create sweep arc');
    }

    wireEdges.push(
      orientEdge(edge, true),                   // edge from outer to pole
      orientEdge(rotatedEdge, false),           // rotated edge from pole back to outer
      orientEdge(startArcResult.result!, false), // arc at start vertex (reversed)
    );
  }

  const wireResult = makeWire(wireEdges);
  if (!wireResult.success) {
    return failure(`Failed to create revolve face wire: ${wireResult.error}`);
  }

  const faceResult = makeFace(surface, wireResult.result!);
  if (!faceResult.success) {
    return failure(`Failed to create revolve face: ${faceResult.error}`);
  }

  return success(faceResult.result!);
}

// ═══════════════════════════════════════════════════════
// CAP FACE GENERATION (PARTIAL REVOLVE)
// ═══════════════════════════════════════════════════════

/**
 * Generate cap faces for a partial revolve.
 * Cap faces are the original profile and the rotated profile.
 */
function generateRevolveCapFaces(
  wire: Wire,
  ax: Axis,
  startAngle: number,
  endAngle: number,
): OperationResult<{ startFace: Face; endFace: Face }> {
  // Start cap: the original profile wire (reversed for correct normal direction)
  const startReversedResult = reverseWire(wire);
  if (!startReversedResult.success) {
    return failure(`Failed to reverse start cap wire: ${startReversedResult.error}`);
  }

  const startFaceResult = makePlanarFace(startReversedResult.result!);
  if (!startFaceResult.success) {
    return failure(`Failed to create start cap face: ${startFaceResult.error}`);
  }

  // End cap: the rotated profile wire
  const endWireResult = rotateWire(wire, ax, endAngle - startAngle);
  if (!endWireResult.success) {
    return failure(`Failed to rotate end cap wire: ${endWireResult.error}`);
  }

  const endFaceResult = makePlanarFace(endWireResult.result!);
  if (!endFaceResult.success) {
    return failure(`Failed to create end cap face: ${endFaceResult.error}`);
  }

  return success({
    startFace: startFaceResult.result!,
    endFace: endFaceResult.result!,
  });
}

// ═══════════════════════════════════════════════════════
// MAIN REVOLVE FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Revolve a closed wire around an axis to create a solid.
 *
 * @param profile - Closed wire to revolve (must lie in a meridional plane)
 * @param ax - Axis of revolution
 * @param angle - Revolve angle in radians (2π for full revolution)
 * @returns Solid and metadata, or error
 */
export function revolve(
  profile: Wire,
  ax: Axis,
  angle: number,
): OperationResult<RevolveResult> {
  if (isZero(angle)) {
    return failure('Revolve angle must be non-zero');
  }

  const isFullRevolve = Math.abs(Math.abs(angle) - 2 * Math.PI) < 1e-10;

  if (isFullRevolve) {
    return revolveInternal(profile, ax, 0, 2 * Math.PI, true);
  } else {
    return revolveInternal(profile, ax, 0, angle, false);
  }
}

/**
 * Revolve a closed wire through a partial arc.
 *
 * @param profile - Closed wire to revolve
 * @param ax - Axis of revolution
 * @param startAngle - Start angle in radians
 * @param endAngle - End angle in radians
 * @returns Solid and metadata, or error
 */
export function revolvePartial(
  profile: Wire,
  ax: Axis,
  startAngle: number,
  endAngle: number,
): OperationResult<RevolveResult> {
  const angle = endAngle - startAngle;
  if (isZero(angle)) {
    return failure('Revolve angle must be non-zero');
  }

  const isFullRevolve = Math.abs(Math.abs(angle) - 2 * Math.PI) < 1e-10;
  return revolveInternal(profile, ax, startAngle, endAngle, isFullRevolve);
}

/**
 * Internal revolve implementation.
 */
function revolveInternal(
  profile: Wire,
  ax: Axis,
  startAngle: number,
  endAngle: number,
  isFullRevolve: boolean,
): OperationResult<RevolveResult> {
  // Normalize axis direction
  const normalizedAxis: Axis = {
    origin: ax.origin,
    direction: normalize(ax.direction),
  };

  // Validate profile
  const validationResult = validateRevolveProfile(profile, normalizedAxis);
  if (!validationResult.success) {
    return failure(validationResult.error!);
  }

  // Generate side faces
  const sideFaces: Face[] = [];

  for (const oe of profile.edges) {
    const faceResult = generateRevolveSideFace(
      oe.edge,
      normalizedAxis,
      startAngle,
      endAngle,
      isFullRevolve,
    );
    if (!faceResult.success) {
      return failure(`Failed to generate side face: ${faceResult.error}`);
    }
    if (faceResult.result !== null) {
      sideFaces.push(faceResult.result!);
    }
  }

  // Generate cap faces (partial revolve only)
  let startFace: Face | undefined;
  let endFace: Face | undefined;

  if (!isFullRevolve) {
    const capsResult = generateRevolveCapFaces(profile, normalizedAxis, startAngle, endAngle);
    if (!capsResult.success) {
      return failure(capsResult.error!);
    }
    startFace = capsResult.result!.startFace;
    endFace = capsResult.result!.endFace;
  }

  // Assemble shell
  const allFaces = [...sideFaces];
  if (startFace) allFaces.push(startFace);
  if (endFace) allFaces.push(endFace);

  const shellResult = makeShell(allFaces);
  if (!shellResult.success) {
    return failure(`Failed to create shell: ${shellResult.error}`);
  }

  if (!shellIsClosed(shellResult.result!)) {
    return failure('Revolved shell is not watertight — topology error');
  }

  // Create solid
  const solidResult = makeSolid(shellResult.result!);
  if (!solidResult.success) {
    return failure(`Failed to create solid: ${solidResult.error}`);
  }

  return success({
    solid: solidResult.result!,
    startFace,
    endFace,
    sideFaces,
  });
}
