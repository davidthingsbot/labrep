import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  Plane,
  plane,
  distance,
  isZero,
  length,
  normalize,
  cross,
  scale,
  add,
  addVector,
  dot,
  subtractPoints,
  negate,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Curve3D, Edge, makeEdge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { makeVertex, Vertex } from '../topology/vertex';
import {
  Wire,
  OrientedEdge,
  orientEdge,
  makeWire,
  wireStartPoint,
  wireEndPoint,
  orientedEdgeStartPoint,
  orientedEdgeEndPoint,
  reverseOrientedEdge,
} from '../topology/wire';
import { Face, Surface, makeFace, makePlanarFace } from '../topology/face';
import { Shell, makeShell, shellIsClosed } from '../topology/shell';
import { Solid, makeSolid, solidVolume } from '../topology/solid';
import {
  PlaneSurface,
  CylindricalSurface,
  ExtrusionSurface,
  makePlaneSurface,
  makeExtrusionSurface,
  canonicalizeExtrusionSurface,
} from '../surfaces';
import { Line3D, makeLine3D, makeLine3DFromPointDir } from '../geometry/line3d';
import { Circle3D, makeCircle3D } from '../geometry/circle3d';
import { Arc3D, makeArc3D } from '../geometry/arc3d';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/**
 * Valid inputs for extrusion.
 */
export type ExtrudeInput = Wire;

/**
 * A 3D profile with optional holes, on a plane.
 * Used as input for extrusion when holes are needed.
 */
export interface Profile3D {
  readonly plane: Plane;
  readonly outerWire: Wire;
  readonly innerWires: readonly Wire[];
}

/**
 * Result of an extrusion operation.
 */
export interface ExtrudeResult {
  /** The resulting solid */
  solid: Solid;

  /** The bottom cap face (original profile location) */
  bottomFace: Face;

  /** The top cap face (translated profile) */
  topFace: Face;

  /** Side faces, one per profile edge. Order matches profile wire edges. */
  sideFaces: Face[];

  /** Map from profile edge index to its generated side face */
  edgeToFaceIndex: Map<number, number>;
}

// ═══════════════════════════════════════════════════════
// PROFILE VALIDATION
// ═══════════════════════════════════════════════════════

/**
 * Extract plane from a wire by analyzing its edges.
 * All edges must lie on the same plane.
 */
function extractPlaneFromWire(wire: Wire): OperationResult<Plane> {
  // For circles and arcs, use the plane from the curve directly
  for (const oe of wire.edges) {
    const curve = oe.edge.curve;
    if (curve.type === 'circle3d' || curve.type === 'arc3d') {
      // Use the plane from the circle/arc
      return success(curve.plane);
    }
  }

  // For line-based wires, get at least 3 non-collinear points
  const points: Point3D[] = [];

  for (const oe of wire.edges) {
    const startPt = edgeStartPoint(oe.edge);
    const endPt = edgeEndPoint(oe.edge);

    // Add points that are distinct from existing ones
    for (const pt of [startPt, endPt]) {
      let isDifferent = true;
      for (const existing of points) {
        if (distance(pt, existing) < 1e-6) {
          isDifferent = false;
          break;
        }
      }
      if (isDifferent) {
        points.push(pt);
      }
      if (points.length >= 3) break;
    }
    if (points.length >= 3) break;
  }

  if (points.length < 3) {
    return failure('Cannot extract plane: need at least 3 distinct points');
  }

  // Compute plane from 3 points
  const p1 = points[0];
  const p2 = points[1];
  const p3 = points[2];

  const v1 = vec3d(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
  const v2 = vec3d(p3.x - p1.x, p3.y - p1.y, p3.z - p1.z);

  const normal = cross(v1, v2);
  const normalLen = length(normal);

  if (isZero(normalLen)) {
    return failure('Cannot extract plane: points are collinear');
  }

  const unitNormal = normalize(normal);
  const xAxis = normalize(v1);

  return success(plane(p1, unitNormal, xAxis));
}

/**
 * Check if a point lies on a plane (within tolerance).
 */
function pointOnPlane(pt: Point3D, p: Plane): boolean {
  const v = vec3d(pt.x - p.origin.x, pt.y - p.origin.y, pt.z - p.origin.z);
  const dist = Math.abs(dot(v, p.normal));
  return dist < 1e-6;
}

/**
 * Check if all edges of a wire lie on a plane.
 */
function wireIsOnPlane(wire: Wire, p: Plane): boolean {
  for (const oe of wire.edges) {
    if (!pointOnPlane(edgeStartPoint(oe.edge), p)) return false;
    if (!pointOnPlane(edgeEndPoint(oe.edge), p)) return false;

    // For arcs/circles, also check the curve center
    const curve = oe.edge.curve;
    if (curve.type === 'circle3d' || curve.type === 'arc3d') {
      if (!pointOnPlane(curve.plane.origin, p)) return false;
    }
  }
  return true;
}

/**
 * Validate that a wire is suitable for extrusion.
 */
export function validateExtrudeProfile(wire: Wire): OperationResult<{
  plane: Plane;
  outerWire: Wire;
  innerWires: Wire[];
}> {
  // Check wire is closed
  if (!wire.isClosed) {
    return failure('Profile wire must be closed');
  }

  // Extract plane
  const planeResult = extractPlaneFromWire(wire);
  if (!planeResult.success) {
    return failure(`Profile must be planar: ${planeResult.error}`);
  }

  // Verify all edges lie on the plane
  if (!wireIsOnPlane(wire, planeResult.result!)) {
    return failure('Profile must be planar: edges do not all lie on the same plane');
  }

  return success({
    plane: planeResult.result!,
    outerWire: wire,
    innerWires: [],
  });
}

/**
 * Validate a profile with holes for extrusion.
 */
export function validateExtrudeProfileWithHoles(
  outerWire: Wire,
  innerWires: Wire[],
): OperationResult<{
  plane: Plane;
  outerWire: Wire;
  innerWires: Wire[];
}> {
  // Check outer wire is closed
  if (!outerWire.isClosed) {
    return failure('Outer profile wire must be closed');
  }

  // Extract plane from outer wire
  const planeResult = extractPlaneFromWire(outerWire);
  if (!planeResult.success) {
    return failure(`Profile must be planar: ${planeResult.error}`);
  }
  const p = planeResult.result!;

  // Verify outer wire is on plane
  if (!wireIsOnPlane(outerWire, p)) {
    return failure('Outer profile must be planar');
  }

  // Verify all inner wires
  for (let i = 0; i < innerWires.length; i++) {
    const inner = innerWires[i];
    if (!inner.isClosed) {
      return failure(`Inner wire ${i} must be closed`);
    }
    if (!wireIsOnPlane(inner, p)) {
      return failure(`Inner wire ${i} must lie on same plane as outer wire`);
    }
  }

  return success({
    plane: p,
    outerWire,
    innerWires,
  });
}

// ═══════════════════════════════════════════════════════
// CURVE/EDGE TRANSLATION
// ═══════════════════════════════════════════════════════

/**
 * Translate a point by a vector.
 */
function translatePoint(pt: Point3D, offset: Vector3D): Point3D {
  return point3d(pt.x + offset.x, pt.y + offset.y, pt.z + offset.z);
}

/**
 * Translate a plane by a vector.
 */
function translatePlane(p: Plane, offset: Vector3D): Plane {
  return plane(translatePoint(p.origin, offset), p.normal, p.xAxis);
}

/**
 * Translate a curve by a vector.
 */
function translateCurve(curve: Curve3D, offset: Vector3D): OperationResult<Curve3D> {
  switch (curve.type) {
    case 'line3d': {
      const newStart = translatePoint(curve.startPoint, offset);
      const newEnd = translatePoint(curve.endPoint, offset);
      return makeLine3D(newStart, newEnd);
    }
    case 'circle3d': {
      const newPlane = translatePlane(curve.plane, offset);
      return makeCircle3D(newPlane, curve.radius);
    }
    case 'arc3d': {
      const newPlane = translatePlane(curve.plane, offset);
      return makeArc3D(newPlane, curve.radius, curve.startAngle, curve.endAngle);
    }
  }
}

/**
 * Translate an edge by a vector.
 */
function translateEdge(edge: Edge, offset: Vector3D): OperationResult<Edge> {
  const curveResult = translateCurve(edge.curve, offset);
  if (!curveResult.success) {
    return failure(`Failed to translate edge: ${curveResult.error}`);
  }

  return makeEdgeFromCurve(curveResult.result!);
}

/**
 * Translate a wire by a vector.
 */
function translateWire(wire: Wire, offset: Vector3D): OperationResult<Wire> {
  const translatedEdges: OrientedEdge[] = [];

  for (const oe of wire.edges) {
    const edgeResult = translateEdge(oe.edge, offset);
    if (!edgeResult.success) {
      return failure(`Failed to translate wire: ${edgeResult.error}`);
    }
    translatedEdges.push(orientEdge(edgeResult.result!, oe.forward));
  }

  return makeWire(translatedEdges);
}

/**
 * Reverse a wire (change direction of traversal).
 */
function reverseWire(wire: Wire): OperationResult<Wire> {
  // Reverse the order and flip each edge's orientation
  const reversedEdges: OrientedEdge[] = [];
  for (let i = wire.edges.length - 1; i >= 0; i--) {
    reversedEdges.push(reverseOrientedEdge(wire.edges[i]));
  }
  return makeWire(reversedEdges);
}

// ═══════════════════════════════════════════════════════
// SIDE FACE GENERATION
// ═══════════════════════════════════════════════════════

/**
 * Create a vertical line edge connecting two points.
 */
function makeVerticalEdge(start: Point3D, end: Point3D): OperationResult<Edge> {
  const lineResult = makeLine3D(start, end);
  if (!lineResult.success) {
    return failure(`Failed to create vertical edge: ${lineResult.error}`);
  }
  return makeEdgeFromCurve(lineResult.result!);
}

/**
 * Generate a side face from a profile edge.
 *
 * For an open profile edge, the side face is a quadrilateral:
 * - Bottom edge: the original edge
 * - Top edge: the edge translated by direction × distance
 * - Left edge: vertical line from edge start to translated start
 * - Right edge: vertical line from edge end to translated end
 *
 * For a closed curve (circle), the side face has only 2 edges:
 * - Bottom edge: the closed curve (forward)
 * - Top edge: the translated closed curve (reversed)
 */
export function generateSideFace(
  edge: Edge,
  direction: Vector3D,
  dist: number,
  canonicalize: boolean = true,
): OperationResult<Face> {
  const offset = scale(direction, dist);
  const curve = edge.curve;

  // Translate the edge to get the top edge
  const topEdgeResult = translateEdge(edge, offset);
  if (!topEdgeResult.success) {
    return failure(`Failed to create top edge: ${topEdgeResult.error}`);
  }
  const topEdge = topEdgeResult.result!;

  // Create surface for the side face
  let surface: Surface;

  // Create an extrusion surface from the bottom curve
  const extSurfResult = makeExtrusionSurface(curve, direction);
  if (!extSurfResult.success) {
    return failure(`Failed to create extrusion surface: ${extSurfResult.error}`);
  }

  if (canonicalize) {
    surface = canonicalizeExtrusionSurface(extSurfResult.result!);
  } else {
    surface = extSurfResult.result!;
  }

  // Handle closed curves (circles) differently
  // For closed curves, we need a seam edge that acts as both "left" and "right"
  if (curve.isClosed) {
    const bottomStart = edgeStartPoint(edge);
    const topStart = edgeStartPoint(topEdge);

    // Create a single seam edge connecting bottom to top
    const seamEdgeResult = makeVerticalEdge(bottomStart, topStart);
    if (!seamEdgeResult.success) {
      return failure(`Failed to create seam edge: ${seamEdgeResult.error}`);
    }
    const seamEdge = seamEdgeResult.result!;

    // The wire goes: bottom circle → seam up → top circle (reversed) → seam down
    // But we use the SAME seam edge twice with different orientations
    const wireEdges: OrientedEdge[] = [
      orientEdge(edge, true),        // bottom circle: forward
      orientEdge(seamEdge, true),    // seam: up
      orientEdge(topEdge, false),    // top circle: reversed
      orientEdge(seamEdge, false),   // seam: down (back to start)
    ];

    const wireResult = makeWire(wireEdges);
    if (!wireResult.success) {
      return failure(`Failed to create side face wire: ${wireResult.error}`);
    }

    return makeFace(surface, wireResult.result!);
  }

  // For open curves, create quadrilateral with vertical edges
  const bottomStart = edgeStartPoint(edge);
  const bottomEnd = edgeEndPoint(edge);
  const topStart = edgeStartPoint(topEdge);
  const topEnd = edgeEndPoint(topEdge);

  // Create vertical edges
  const leftEdgeResult = makeVerticalEdge(bottomStart, topStart);
  const rightEdgeResult = makeVerticalEdge(bottomEnd, topEnd);

  if (!leftEdgeResult.success || !rightEdgeResult.success) {
    return failure('Failed to create vertical edges');
  }

  const leftEdge = leftEdgeResult.result!;
  const rightEdge = rightEdgeResult.result!;

  // Build the wire: bottom → right → top(reversed) → left(reversed)
  // This gives CCW orientation when viewed from outside
  const wireEdges: OrientedEdge[] = [
    orientEdge(edge, true),            // bottom: forward
    orientEdge(rightEdge, true),       // right: forward (bottom→top)
    orientEdge(topEdge, false),        // top: reversed
    orientEdge(leftEdge, false),       // left: reversed (top→bottom)
  ];

  const wireResult = makeWire(wireEdges);
  if (!wireResult.success) {
    return failure(`Failed to create side face wire: ${wireResult.error}`);
  }

  return makeFace(surface, wireResult.result!);
}

/**
 * Generate all side faces for a wire.
 */
function generateSideFaces(
  wire: Wire,
  direction: Vector3D,
  dist: number,
  canonicalize: boolean,
): OperationResult<Face[]> {
  const sideFaces: Face[] = [];

  for (const oe of wire.edges) {
    // Use the underlying edge (we handle orientation when creating wires)
    const faceResult = generateSideFace(oe.edge, direction, dist, canonicalize);
    if (!faceResult.success) {
      return failure(`Failed to generate side face: ${faceResult.error}`);
    }
    sideFaces.push(faceResult.result!);
  }

  return success(sideFaces);
}

// ═══════════════════════════════════════════════════════
// CAP FACE GENERATION
// ═══════════════════════════════════════════════════════

/**
 * Generate bottom and top cap faces.
 */
export function generateCapFaces(
  outerWire: Wire,
  innerWires: Wire[],
  p: Plane,
  direction: Vector3D,
  dist: number,
): OperationResult<{ bottomFace: Face; topFace: Face }> {
  const offset = scale(direction, dist);

  // Bottom cap: original profile location
  // The bottom face's outer wire should be CW when viewed from outside (below the solid)
  // This is the opposite of the profile wire direction.
  // The side faces use the profile edges going forward, so bottom cap needs edges reversed.
  const bottomSurface = makePlaneSurface(p);

  // Reverse the outer wire for bottom face
  const reversedOuterResult = reverseWire(outerWire);
  if (!reversedOuterResult.success) {
    return failure(`Failed to reverse outer wire: ${reversedOuterResult.error}`);
  }

  // Reverse inner wires for bottom face
  const reversedInners: Wire[] = [];
  for (const inner of innerWires) {
    const reversedResult = reverseWire(inner);
    if (!reversedResult.success) {
      return failure(`Failed to reverse inner wire: ${reversedResult.error}`);
    }
    reversedInners.push(reversedResult.result!);
  }

  const bottomFaceResult = makeFace(bottomSurface, reversedOuterResult.result!, reversedInners);
  if (!bottomFaceResult.success) {
    return failure(`Failed to create bottom cap: ${bottomFaceResult.error}`);
  }

  // Top cap: translated profile
  // The top face's outer wire should match the translated profile direction (CCW from above)
  const topPlane = translatePlane(p, offset);
  const topSurface = makePlaneSurface(topPlane);

  const topWireResult = translateWire(outerWire, offset);
  if (!topWireResult.success) {
    return failure(`Failed to translate top wire: ${topWireResult.error}`);
  }

  const topInnerWires: Wire[] = [];
  for (const inner of innerWires) {
    const translatedResult = translateWire(inner, offset);
    if (!translatedResult.success) {
      return failure(`Failed to translate inner wire: ${translatedResult.error}`);
    }
    topInnerWires.push(translatedResult.result!);
  }

  const topFaceResult = makeFace(topSurface, topWireResult.result!, topInnerWires);
  if (!topFaceResult.success) {
    return failure(`Failed to create top cap: ${topFaceResult.error}`);
  }

  return success({
    bottomFace: bottomFaceResult.result!,
    topFace: topFaceResult.result!,
  });
}

// ═══════════════════════════════════════════════════════
// MAIN EXTRUDE FUNCTION
// ═══════════════════════════════════════════════════════

/**
 * Extrude a closed wire to create a solid.
 *
 * @param profile - Closed wire to extrude
 * @param direction - Extrusion direction (will be normalized)
 * @param dist - Extrusion distance (must be > 0)
 * @returns Solid and metadata, or error if profile is invalid
 */
export function extrude(
  profile: Wire,
  direction: Vector3D,
  dist: number,
): OperationResult<ExtrudeResult> {
  // Validate distance
  if (dist <= 0 || isZero(dist)) {
    return failure('Distance must be positive');
  }

  // Validate direction
  const dirLen = length(direction);
  if (isZero(dirLen)) {
    return failure('Direction must be non-zero');
  }
  const normalizedDir = normalize(direction);

  // Validate profile
  const validationResult = validateExtrudeProfile(profile);
  if (!validationResult.success) {
    return failure(validationResult.error!);
  }

  const { plane: profilePlane, outerWire, innerWires } = validationResult.result!;

  // Generate side faces for outer wire
  const outerSideResult = generateSideFaces(outerWire, normalizedDir, dist, true);
  if (!outerSideResult.success) {
    return failure(`Failed to generate outer side faces: ${outerSideResult.error}`);
  }
  const sideFaces = outerSideResult.result!;

  // Generate side faces for inner wires (holes)
  for (const innerWire of innerWires) {
    const innerSideResult = generateSideFaces(innerWire, normalizedDir, dist, true);
    if (!innerSideResult.success) {
      return failure(`Failed to generate inner side faces: ${innerSideResult.error}`);
    }
    sideFaces.push(...innerSideResult.result!);
  }

  // Generate cap faces
  const capsResult = generateCapFaces(outerWire, innerWires, profilePlane, normalizedDir, dist);
  if (!capsResult.success) {
    return failure(capsResult.error!);
  }
  const { bottomFace, topFace } = capsResult.result!;

  // Assemble shell
  const allFaces = [bottomFace, topFace, ...sideFaces];
  const shellResult = makeShell(allFaces);
  if (!shellResult.success) {
    return failure(`Failed to create shell: ${shellResult.error}`);
  }

  // Check if shell is closed
  if (!shellIsClosed(shellResult.result!)) {
    return failure('Extruded shell is not watertight — topology error');
  }

  // Create solid
  const solidResult = makeSolid(shellResult.result!);
  if (!solidResult.success) {
    return failure(`Failed to create solid: ${solidResult.error}`);
  }

  // Build edge-to-face index map
  const edgeToFaceIndex = new Map<number, number>();
  for (let i = 0; i < outerWire.edges.length; i++) {
    edgeToFaceIndex.set(i, i);
  }

  return success({
    solid: solidResult.result!,
    bottomFace,
    topFace,
    sideFaces,
    edgeToFaceIndex,
  });
}

/**
 * Extrude a closed wire with holes to create a solid.
 */
export function extrudeWithHoles(
  outerWire: Wire,
  innerWires: Wire[],
  direction: Vector3D,
  dist: number,
): OperationResult<ExtrudeResult> {
  // Validate distance
  if (dist <= 0 || isZero(dist)) {
    return failure('Distance must be positive');
  }

  // Validate direction
  const dirLen = length(direction);
  if (isZero(dirLen)) {
    return failure('Direction must be non-zero');
  }
  const normalizedDir = normalize(direction);

  // Validate profile
  const validationResult = validateExtrudeProfileWithHoles(outerWire, innerWires);
  if (!validationResult.success) {
    return failure(validationResult.error!);
  }

  const { plane: profilePlane } = validationResult.result!;

  // Generate side faces for outer wire
  const outerSideResult = generateSideFaces(outerWire, normalizedDir, dist, true);
  if (!outerSideResult.success) {
    return failure(`Failed to generate outer side faces: ${outerSideResult.error}`);
  }
  const sideFaces = outerSideResult.result!;

  // Generate side faces for inner wires (holes)
  for (const innerWire of innerWires) {
    const innerSideResult = generateSideFaces(innerWire, normalizedDir, dist, true);
    if (!innerSideResult.success) {
      return failure(`Failed to generate inner side faces: ${innerSideResult.error}`);
    }
    sideFaces.push(...innerSideResult.result!);
  }

  // Generate cap faces
  const capsResult = generateCapFaces(outerWire, innerWires, profilePlane, normalizedDir, dist);
  if (!capsResult.success) {
    return failure(capsResult.error!);
  }
  const { bottomFace, topFace } = capsResult.result!;

  // Assemble shell
  const allFaces = [bottomFace, topFace, ...sideFaces];
  const shellResult = makeShell(allFaces);
  if (!shellResult.success) {
    return failure(`Failed to create shell: ${shellResult.error}`);
  }

  // Check if shell is closed
  if (!shellIsClosed(shellResult.result!)) {
    return failure('Extruded shell is not watertight — topology error');
  }

  // Create solid
  const solidResult = makeSolid(shellResult.result!);
  if (!solidResult.success) {
    return failure(`Failed to create solid: ${solidResult.error}`);
  }

  // Build edge-to-face index map
  const edgeToFaceIndex = new Map<number, number>();
  let faceIndex = 0;
  for (let i = 0; i < outerWire.edges.length; i++) {
    edgeToFaceIndex.set(i, faceIndex++);
  }

  return success({
    solid: solidResult.result!,
    bottomFace,
    topFace,
    sideFaces,
    edgeToFaceIndex,
  });
}

/**
 * Extrude symmetrically in both directions.
 *
 * Creates a solid centered on the profile plane, extending
 * distance/2 in each direction along the extrusion vector.
 *
 * @param profile - Closed wire to extrude
 * @param direction - Extrusion direction (will be normalized)
 * @param totalDistance - Total extrusion distance (distance/2 each way)
 * @returns Solid centered on profile plane
 */
export function extrudeSymmetric(
  profile: Wire,
  direction: Vector3D,
  totalDistance: number,
): OperationResult<ExtrudeResult> {
  // Validate total distance
  if (totalDistance <= 0 || isZero(totalDistance)) {
    return failure('Total distance must be positive');
  }

  // Validate direction
  const dirLen = length(direction);
  if (isZero(dirLen)) {
    return failure('Direction must be non-zero');
  }
  const normalizedDir = normalize(direction);

  // Translate profile backward by half distance
  const halfOffset = scale(normalizedDir, -totalDistance / 2);
  const translatedWireResult = translateWire(profile, halfOffset);
  if (!translatedWireResult.success) {
    return failure(`Failed to translate profile: ${translatedWireResult.error}`);
  }

  // Extrude the full distance
  return extrude(translatedWireResult.result!, direction, totalDistance);
}

/**
 * Extrude symmetrically with holes.
 */
export function extrudeSymmetricWithHoles(
  outerWire: Wire,
  innerWires: Wire[],
  direction: Vector3D,
  totalDistance: number,
): OperationResult<ExtrudeResult> {
  // Validate total distance
  if (totalDistance <= 0 || isZero(totalDistance)) {
    return failure('Total distance must be positive');
  }

  // Validate direction
  const dirLen = length(direction);
  if (isZero(dirLen)) {
    return failure('Direction must be non-zero');
  }
  const normalizedDir = normalize(direction);

  // Translate all wires backward by half distance
  const halfOffset = scale(normalizedDir, -totalDistance / 2);

  const translatedOuterResult = translateWire(outerWire, halfOffset);
  if (!translatedOuterResult.success) {
    return failure(`Failed to translate outer wire: ${translatedOuterResult.error}`);
  }

  const translatedInners: Wire[] = [];
  for (const inner of innerWires) {
    const result = translateWire(inner, halfOffset);
    if (!result.success) {
      return failure(`Failed to translate inner wire: ${result.error}`);
    }
    translatedInners.push(result.result!);
  }

  // Extrude the full distance
  return extrudeWithHoles(translatedOuterResult.result!, translatedInners, direction, totalDistance);
}
