import { point3d, vec3d, plane, Plane, cross, normalize, subtractPoints } from '../core';
import { PlaneSurface, CylindricalSurface, ExtrusionSurface, SphericalSurface, ConicalSurface, ToroidalSurface, RevolutionSurface, makePlaneSurface } from '../surfaces';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Wire, wireStartPoint } from './wire';
import { edgeStartPoint, addPCurveToEdge } from './edge';
import { buildPCurveForEdgeOnSurface } from './pcurve';

/**
 * Union type for surfaces that can bound a face.
 */
export type Surface = PlaneSurface | CylindricalSurface | ExtrusionSurface | SphericalSurface | ConicalSurface | ToroidalSurface | RevolutionSurface;

/**
 * A bounded region of a surface.
 *
 * The outerWire defines the external boundary (CCW when viewed from outside).
 * innerWires define holes (CW when viewed from outside).
 *
 * OCCT reference: TopoDS_Face + BRep_TFace
 */
export interface Face {
  /** The underlying surface geometry */
  readonly surface: Surface;

  /** Outer boundary wire (must be closed) */
  readonly outerWire: Wire;

  /** Inner boundary wires / holes (must be closed) */
  readonly innerWires: readonly Wire[];

  /**
   * Face orientation relative to the surface's natural normal direction.
   * - true (default): face normal matches surface normal (outward)
   * - false: face normal is reversed (inward, for cavity faces)
   *
   * OCCT reference: TopAbs_Orientation on TopoDS_Face (FORWARD vs REVERSED)
   */
  readonly forward: boolean;
}

/**
 * Create a face from a surface and wires.
 *
 * @param surface - The underlying surface
 * @param outerWire - The outer boundary (must be closed)
 * @param innerWires - Optional inner boundaries / holes (must be closed)
 * @returns Face or failure if wires are not closed
 */
export function makeFace(
  surface: Surface,
  outerWire: Wire,
  innerWires: Wire[] = [],
  forward: boolean = true,
): OperationResult<Face> {
  // Validate outer wire is closed
  if (!outerWire.isClosed) {
    return failure('Outer wire must be closed');
  }

  // Validate all inner wires are closed
  for (let i = 0; i < innerWires.length; i++) {
    if (!innerWires[i].isClosed) {
      return failure(`Inner wire ${i} must be closed`);
    }
  }

  // Attach PCurves to all edges that don't already have one on this surface.
  // OCCT: edges always carry PCurves for every face they belong to.
  // This is the canonical place — any code that puts an edge on a face
  // ensures the edge has a PCurve for that face's surface.
  for (const oe of outerWire.edges) {
    if (!oe.edge.pcurves.some(pc => pc.surface === surface)) {
      const pc = buildPCurveForEdgeOnSurface(oe.edge, surface, oe.forward);
      if (pc) addPCurveToEdge(oe.edge, pc);
    }
  }
  for (const inner of innerWires) {
    for (const oe of inner.edges) {
      if (!oe.edge.pcurves.some(pc => pc.surface === surface)) {
        const pc = buildPCurveForEdgeOnSurface(oe.edge, surface, oe.forward);
        if (pc) addPCurveToEdge(oe.edge, pc);
      }
    }
  }

  return success({
    surface,
    outerWire,
    innerWires: [...innerWires],
    forward,
  });
}

/**
 * Create a planar face, inferring the plane from the wire.
 *
 * The plane is derived from the first three non-collinear points of the wire.
 *
 * @param outerWire - The outer boundary (must be closed, must be planar)
 * @param innerWires - Optional inner boundaries / holes
 * @returns Face or failure
 */
export function makePlanarFace(
  outerWire: Wire,
  innerWires: Wire[] = [],
): OperationResult<Face> {
  // Validate outer wire is closed
  if (!outerWire.isClosed) {
    return failure('Outer wire must be closed');
  }

  // Validate all inner wires are closed
  for (let i = 0; i < innerWires.length; i++) {
    if (!innerWires[i].isClosed) {
      return failure(`Inner wire ${i} must be closed`);
    }
  }

  // Infer plane from wire
  // Get at least 3 points from the wire edges
  const points: { x: number; y: number; z: number }[] = [];

  for (const oe of outerWire.edges) {
    const startPt = edgeStartPoint(oe.edge);
    // Check if this point is different from existing points
    let isDifferent = true;
    for (const existing of points) {
      const dx = startPt.x - existing.x;
      const dy = startPt.y - existing.y;
      const dz = startPt.z - existing.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-6) {
        isDifferent = false;
        break;
      }
    }
    if (isDifferent) {
      points.push(startPt);
    }
    if (points.length >= 3) break;
  }

  if (points.length < 3) {
    return failure('Cannot infer plane: need at least 3 distinct points');
  }

  // Compute plane from 3 points
  const p1 = points[0];
  const p2 = points[1];
  const p3 = points[2];

  const v1 = vec3d(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
  const v2 = vec3d(p3.x - p1.x, p3.y - p1.y, p3.z - p1.z);

  const normal = normalize(cross(v1, v2));
  const xAxis = normalize(v1);

  const inferredPlane = plane(point3d(p1.x, p1.y, p1.z), normal, xAxis);
  const surface = makePlaneSurface(inferredPlane);

  // Delegate to makeFace which handles PCurve attachment
  return makeFace(surface, outerWire, innerWires);
}

/**
 * Get the outer wire of a face.
 */
export function faceOuterWire(face: Face): Wire {
  return face.outerWire;
}

/**
 * Get the inner wires (holes) of a face.
 */
export function faceInnerWires(face: Face): readonly Wire[] {
  return face.innerWires;
}

/**
 * Get the surface of a face.
 */
export function faceSurface(face: Face): Surface {
  return face.surface;
}
