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
import { Curve3D, Edge, makeEdge, makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, addPCurveToEdge } from '../topology/edge';
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
import { makeLine2D } from '../geometry/line2d';
import { toAdapter } from '../surfaces/surface-adapter';
import { makePCurve, buildPCurveForEdgeOnSurface } from '../topology/pcurve';

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
  let topEdge = topEdgeResult.result!;

  // Create surface for the side face
  let surface: Surface;
  const extSurfResult = makeExtrusionSurface(curve, direction);
  if (!extSurfResult.success) {
    return failure(`Failed to create extrusion surface: ${extSurfResult.error}`);
  }
  surface = canonicalize
    ? canonicalizeExtrusionSurface(extSurfResult.result!)
    : extSurfResult.result!;

  // ── Compute UV layout for PCurves ──
  // OCCT ref: BRepSweep_Translation::SetDirectingPCurve, SetGeneratingPCurve
  //
  // For a cylinder (extruded circle):
  //   U = θ (angle), V = height along axis
  //   Bottom circle: horizontal line at V=0 from U=0 to U=2π
  //   Top circle: horizontal line at V=dist from U=2π to U=0 (reversed)
  //   Seam fwd (right side): vertical line at U=2π from V=0 to V=dist
  //   Seam rev (left side): vertical line at U=0 from V=dist to V=0
  //
  // For a plane side face (extruded line):
  //   U = parameter along profile curve, V = height along axis
  //   Bottom: U=u_start..u_end at V=0
  //   Top (reversed): U=u_end..u_start at V=dist
  //   Right vertical: U=u_end, V=0..dist
  //   Left vertical (reversed): U=u_start, V=dist..0

  const adapter = toAdapter(surface);

  // Project bottom edge endpoints to UV
  const botStartUV = adapter.projectPoint(edgeStartPoint(edge));
  const botEndUV = adapter.projectPoint(edgeEndPoint(edge));

  if (curve.isClosed) {
    // ── Closed curve (circle → cylinder side face) ──
    const bottomStart = edgeStartPoint(edge);
    const topStart = edgeStartPoint(topEdge);

    const seamEdgeResult = makeVerticalEdge(bottomStart, topStart);
    if (!seamEdgeResult.success) {
      return failure(`Failed to create seam edge: ${seamEdgeResult.error}`);
    }
    let seamEdge = seamEdgeResult.result!;

    // PCurves for the 4 edges on the cylinder surface:
    const v0 = botStartUV.v;               // bottom V
    const v1 = v0 + dist;                  // top V
    const uPeriod = adapter.isUPeriodic ? adapter.uPeriod : 2 * Math.PI;

    // Bottom circle (fwd): horizontal line at V=v0, U goes 0..2π
    const botPC = buildPCurveForEdgeOnSurface(edge, surface, true, 0);
    if (botPC) addPCurveToEdge(edge, botPC);

    // Seam edge gets TWO PCurves (right side at U=2π, left side at U=0)
    // OCCT ref: BRep_Builder::UpdateEdge(E, C1, C2, S, tol) for seam edges
    // Right side (fwd traversal: bottom→top): U=uPeriod, V goes v0..v1
    const seamFwdPC = makeLine2D({ x: uPeriod, y: v0 }, { x: uPeriod, y: v1 });
    if (seamFwdPC.result) addPCurveToEdge(seamEdge, makePCurve(seamFwdPC.result, surface));
    // Left side (rev traversal: top→bottom): U=0, V goes v1..v0
    const seamRevPC = makeLine2D({ x: 0, y: v1 }, { x: 0, y: v0 });
    if (seamRevPC.result) addPCurveToEdge(seamEdge, makePCurve(seamRevPC.result, surface));

    // Top circle (rev): horizontal line at V=v1, U goes 2π..0
    const topPC = buildPCurveForEdgeOnSurface(topEdge, surface, false, 0);
    if (topPC) addPCurveToEdge(topEdge, topPC);

    const wireEdges: OrientedEdge[] = [
      orientEdge(edge, true),
      orientEdge(seamEdge, true),
      orientEdge(topEdge, false),
      orientEdge(seamEdge, false),
    ];

    const wireResult = makeWire(wireEdges);
    if (!wireResult.success) {
      return failure(`Failed to create side face wire: ${wireResult.error}`);
    }

    return makeFace(surface, wireResult.result!);
  }

  // ── Open curve (line/arc → quad side face) ──
  const bottomStart = edgeStartPoint(edge);
  const bottomEnd = edgeEndPoint(edge);
  const topStart = edgeStartPoint(topEdge);
  const topEnd = edgeEndPoint(topEdge);

  const leftEdgeResult = makeVerticalEdge(bottomStart, topStart);
  const rightEdgeResult = makeVerticalEdge(bottomEnd, topEnd);
  if (!leftEdgeResult.success || !rightEdgeResult.success) {
    return failure('Failed to create vertical edges');
  }
  let leftEdge = leftEdgeResult.result!;
  let rightEdge = rightEdgeResult.result!;

  // UV coordinates for the quad corners
  let u0 = botStartUV.u, u1 = botEndUV.u;
  const v0 = botStartUV.v, v1 = v0 + dist;

  // Unwrap U for periodic surfaces
  if (adapter.isUPeriodic) {
    while (u1 - u0 > Math.PI) u1 -= adapter.uPeriod;
    while (u0 - u1 > Math.PI) u1 += adapter.uPeriod;
  }

  // Bottom edge (fwd): U=u0..u1 at V=v0
  const botPC = makeLine2D({ x: u0, y: v0 }, { x: u1, y: v0 });
  if (botPC.result) addPCurveToEdge(edge, makePCurve(botPC.result, surface));

  // Right vertical (fwd): U=u1, V=v0..v1
  const rightPC = makeLine2D({ x: u1, y: v0 }, { x: u1, y: v1 });
  if (rightPC.result) addPCurveToEdge(rightEdge, makePCurve(rightPC.result, surface));

  // Top edge (rev in wire): U=u1..u0 at V=v1
  const topPC = makeLine2D({ x: u1, y: v1 }, { x: u0, y: v1 });
  if (topPC.result) addPCurveToEdge(topEdge, makePCurve(topPC.result, surface));

  // Left vertical (rev in wire): U=u0, V=v1..v0
  const leftPC = makeLine2D({ x: u0, y: v1 }, { x: u0, y: v0 });
  if (leftPC.result) addPCurveToEdge(leftEdge, makePCurve(leftPC.result, surface));

  const wireEdges: OrientedEdge[] = [
    orientEdge(edge, true),
    orientEdge(rightEdge, true),
    orientEdge(topEdge, false),
    orientEdge(leftEdge, false),
  ];

  const wireResult = makeWire(wireEdges);
  if (!wireResult.success) {
    return failure(`Failed to create side face wire: ${wireResult.error}`);
  }

  return makeFace(surface, wireResult.result!);
}

/**
 * Generate a side face for an edge, respecting the wire's edge orientation.
 * This is important for matching edges with cap faces, especially for holes.
 * 
 * @param edge The edge to extrude
 * @param forward The orientation of this edge in its wire (true = forward, false = reversed)
 * @param direction Extrusion direction
 * @param dist Extrusion distance
 * @param canonicalize Whether to simplify surface types
 */
function generateSideFaceOriented(
  edge: Edge,
  forward: boolean,
  direction: Vector3D,
  dist: number,
  canonicalize: boolean = true,
  sharedTopEdge?: Edge,
): OperationResult<Face> {
  const offset = scale(direction, dist);
  const curve = edge.curve;

  let topEdge: Edge;
  if (sharedTopEdge) {
    topEdge = sharedTopEdge;
  } else {
    const topEdgeResult = translateEdge(edge, offset);
    if (!topEdgeResult.success) {
      return failure(`Failed to create top edge: ${topEdgeResult.error}`);
    }
    topEdge = topEdgeResult.result!;
  }

  let surface: Surface;
  const extSurfResult = makeExtrusionSurface(curve, direction);
  if (!extSurfResult.success) {
    return failure(`Failed to create extrusion surface: ${extSurfResult.error}`);
  }
  surface = canonicalize
    ? canonicalizeExtrusionSurface(extSurfResult.result!)
    : extSurfResult.result!;

  // ── Compute UV layout and PCurves ──
  // OCCT ref: BRepSweep_Translation::SetDirectingPCurve, SetGeneratingPCurve
  const adapter = toAdapter(surface);
  const botStartUV = adapter.projectPoint(edgeStartPoint(edge));

  if (curve.isClosed) {
    const bottomStart = forward ? edgeStartPoint(edge) : edgeEndPoint(edge);
    const topStart = forward ? edgeStartPoint(topEdge) : edgeEndPoint(topEdge);

    const seamEdgeResult = makeVerticalEdge(bottomStart, topStart);
    if (!seamEdgeResult.success) {
      return failure(`Failed to create seam edge: ${seamEdgeResult.error}`);
    }
    let seamEdge = seamEdgeResult.result!;

    // PCurves on cylinder surface
    const v0 = botStartUV.v;
    const v1 = v0 + dist;
    const uPeriod = adapter.isUPeriodic ? adapter.uPeriod : 2 * Math.PI;

    // Bottom circle PCurve
    const botPC = buildPCurveForEdgeOnSurface(edge, surface, forward, 0);
    if (botPC) addPCurveToEdge(edge, botPC);

    // Seam: two PCurves (occurrence 0 at U=uPeriod, occurrence 1 at U=0)
    // Both PCurves go in edge geometric direction (V=v0→v1), per convention.
    // Wire traversal direction is handled by getEdgeUV's forward flag.
    const seamPC0 = makeLine2D({ x: uPeriod, y: v0 }, { x: uPeriod, y: v1 });
    if (seamPC0.result) addPCurveToEdge(seamEdge, makePCurve(seamPC0.result, surface));
    const seamPC1 = makeLine2D({ x: 0, y: v0 }, { x: 0, y: v1 });
    if (seamPC1.result) addPCurveToEdge(seamEdge, makePCurve(seamPC1.result, surface));

    // Top circle PCurve
    const topPC = buildPCurveForEdgeOnSurface(topEdge, surface, !forward, 0);
    if (topPC) addPCurveToEdge(topEdge, topPC);

    const wireEdges: OrientedEdge[] = [
      orientEdge(edge, forward),
      orientEdge(seamEdge, true),
      orientEdge(topEdge, !forward),
      orientEdge(seamEdge, false),
    ];

    const wireResult = makeWire(wireEdges);
    if (!wireResult.success) {
      return failure(`Failed to create side face wire: ${wireResult.error}`);
    }

    return makeFace(surface, wireResult.result!);
  }

  // ── Open curve (quad side face) ──
  const bottomStart = forward ? edgeStartPoint(edge) : edgeEndPoint(edge);
  const bottomEnd = forward ? edgeEndPoint(edge) : edgeStartPoint(edge);
  const topStart = forward ? edgeStartPoint(topEdge) : edgeEndPoint(topEdge);
  const topEnd = forward ? edgeEndPoint(topEdge) : edgeStartPoint(topEdge);

  const leftEdgeResult = makeVerticalEdge(bottomStart, topStart);
  const rightEdgeResult = makeVerticalEdge(bottomEnd, topEnd);
  if (!leftEdgeResult.success || !rightEdgeResult.success) {
    return failure('Failed to create vertical edges');
  }
  let leftEdge = leftEdgeResult.result!;
  let rightEdge = rightEdgeResult.result!;

  // UV coordinates
  let u0 = adapter.projectPoint(bottomStart).u;
  let u1 = adapter.projectPoint(bottomEnd).u;
  const v0 = botStartUV.v, v1 = v0 + dist;
  if (adapter.isUPeriodic) {
    while (u1 - u0 > Math.PI) u1 -= adapter.uPeriod;
    while (u0 - u1 > Math.PI) u1 += adapter.uPeriod;
  }

  // Bottom edge PCurve
  const botPC = makeLine2D({ x: u0, y: v0 }, { x: u1, y: v0 });
  if (botPC.result) addPCurveToEdge(edge, makePCurve(botPC.result, surface));

  // Right vertical PCurve
  const rightPC = makeLine2D({ x: u1, y: v0 }, { x: u1, y: v1 });
  if (rightPC.result) addPCurveToEdge(rightEdge, makePCurve(rightPC.result, surface));

  // Top edge PCurve (reversed in wire)
  const topPC = makeLine2D({ x: u1, y: v1 }, { x: u0, y: v1 });
  if (topPC.result) addPCurveToEdge(topEdge, makePCurve(topPC.result, surface));

  // Left vertical PCurve (reversed in wire)
  const leftPC = makeLine2D({ x: u0, y: v1 }, { x: u0, y: v0 });
  if (leftPC.result) addPCurveToEdge(leftEdge, makePCurve(leftPC.result, surface));

  const wireEdges: OrientedEdge[] = [
    orientEdge(edge, forward),
    orientEdge(rightEdge, true),
    orientEdge(topEdge, !forward),
    orientEdge(leftEdge, false),
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
/**
 * OCCT ref: BRepSweep_Translation — edges are created per generating vertex
 * and shared between adjacent faces. We pre-create translated top edges so
 * side faces and the top cap share the same Edge objects.
 */
function generateSideFaces(
  wire: Wire,
  direction: Vector3D,
  dist: number,
  canonicalize: boolean,
): OperationResult<{ faces: Face[]; topEdgeMap: Map<Edge, Edge> }> {
  const sideFaces: Face[] = [];
  const topEdgeMap = new Map<Edge, Edge>();

  // Pre-create shared translated top edges per original edge
  const offset = scale(direction, dist);
  for (const oe of wire.edges) {
    if (!topEdgeMap.has(oe.edge)) {
      const topResult = translateEdge(oe.edge, offset);
      if (!topResult.success) return failure(`Failed to translate edge: ${topResult.error}`);
      topEdgeMap.set(oe.edge, topResult.result!);
    }
  }

  for (const oe of wire.edges) {
    const sharedTopEdge = topEdgeMap.get(oe.edge)!;
    const faceResult = generateSideFaceOriented(oe.edge, oe.forward, direction, dist, canonicalize, sharedTopEdge);
    if (!faceResult.success) {
      return failure(`Failed to generate side face: ${faceResult.error}`);
    }
    sideFaces.push(faceResult.result!);
  }

  return success({ faces: sideFaces, topEdgeMap });
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
  topEdgeMap?: Map<Edge, Edge>,
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

  // Attach PCurves to bottom cap edges (mutates in place — shared with side faces)
  for (const oe of reversedOuterResult.result!.edges) {
    const pc = buildPCurveForEdgeOnSurface(oe.edge, bottomSurface, oe.forward);
    if (pc) addPCurveToEdge(oe.edge, pc);
  }
  for (const inner of reversedInners) {
    for (const oe of inner.edges) {
      const pc = buildPCurveForEdgeOnSurface(oe.edge, bottomSurface, oe.forward);
      if (pc) addPCurveToEdge(oe.edge, pc);
    }
  }

  const bottomFaceResult = makeFace(bottomSurface, reversedOuterResult.result!, reversedInners);
  if (!bottomFaceResult.success) {
    return failure(`Failed to create bottom cap: ${bottomFaceResult.error}`);
  }

  // Top cap: use shared top edges from side faces (OCCT edge sharing)
  const topPlane = translatePlane(p, offset);
  const topSurface = makePlaneSurface(topPlane);

  // Build top wire from shared edges if available, else translate
  let topWireResult: OperationResult<Wire>;
  if (topEdgeMap && topEdgeMap.size > 0) {
    const topOEs: OrientedEdge[] = [];
    for (const oe of outerWire.edges) {
      const sharedTop = topEdgeMap.get(oe.edge);
      if (sharedTop) {
        topOEs.push(orientEdge(sharedTop, oe.forward));
      } else {
        // Fallback: translate
        const tr = translateEdge(oe.edge, offset);
        if (tr.success) topOEs.push(orientEdge(tr.result!, oe.forward));
      }
    }
    topWireResult = makeWire(topOEs);
  } else {
    topWireResult = translateWire(outerWire, offset);
  }
  if (!topWireResult.success) {
    return failure(`Failed to create top wire: ${topWireResult.error}`);
  }

  const topInnerWires: Wire[] = [];
  for (const inner of innerWires) {
    // Inner wires: use shared top edges if available
    let innerTopWireResult: OperationResult<Wire>;
    if (topEdgeMap && topEdgeMap.size > 0) {
      const innerTopOEs: OrientedEdge[] = [];
      for (const oe of inner.edges) {
        const sharedTop = topEdgeMap.get(oe.edge);
        if (sharedTop) {
          innerTopOEs.push(orientEdge(sharedTop, oe.forward));
        } else {
          const tr = translateEdge(oe.edge, offset);
          if (tr.success) innerTopOEs.push(orientEdge(tr.result!, oe.forward));
        }
      }
      innerTopWireResult = makeWire(innerTopOEs);
    } else {
      innerTopWireResult = translateWire(inner, offset);
    }
    if (!innerTopWireResult.success) {
      return failure(`Failed to create inner top wire: ${innerTopWireResult.error}`);
    }
    topInnerWires.push(innerTopWireResult.result!);
  }

  // Attach PCurves to top cap edges
  for (const oe of topWireResult.result!.edges) {
    const pc = buildPCurveForEdgeOnSurface(oe.edge, topSurface, oe.forward);
    if (pc) addPCurveToEdge(oe.edge, pc);
  }
  for (const inner of topInnerWires) {
    for (const oe of inner.edges) {
      const pc = buildPCurveForEdgeOnSurface(oe.edge, topSurface, oe.forward);
      if (pc) addPCurveToEdge(oe.edge, pc);
    }
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
  const sideFaces = outerSideResult.result!.faces;
  const allTopEdgeMaps = new Map<Edge, Edge>(outerSideResult.result!.topEdgeMap);

  // Generate side faces for inner wires (holes)
  for (const innerWire of innerWires) {
    const innerSideResult = generateSideFaces(innerWire, normalizedDir, dist, true);
    if (!innerSideResult.success) {
      return failure(`Failed to generate inner side faces: ${innerSideResult.error}`);
    }
    sideFaces.push(...innerSideResult.result!.faces);
    for (const [k, v] of innerSideResult.result!.topEdgeMap) allTopEdgeMaps.set(k, v);
  }

  // Generate cap faces using shared top edges (OCCT edge sharing)
  const capsResult = generateCapFaces(outerWire, innerWires, profilePlane, normalizedDir, dist, allTopEdgeMaps);
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
  const sideFaces = outerSideResult.result!.faces;
  const allTopEdgeMaps = new Map<Edge, Edge>(outerSideResult.result!.topEdgeMap);

  // Generate side faces for inner wires (holes)
  for (const innerWire of innerWires) {
    const innerSideResult = generateSideFaces(innerWire, normalizedDir, dist, true);
    if (!innerSideResult.success) {
      return failure(`Failed to generate inner side faces: ${innerSideResult.error}`);
    }
    sideFaces.push(...innerSideResult.result!.faces);
    for (const [k, v] of innerSideResult.result!.topEdgeMap) allTopEdgeMaps.set(k, v);
  }

  // Generate cap faces using shared top edges (OCCT edge sharing)
  const capsResult = generateCapFaces(outerWire, innerWires, profilePlane, normalizedDir, dist, allTopEdgeMaps);
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
