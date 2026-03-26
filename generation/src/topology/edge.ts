import { Point3D, distance, TOLERANCE } from '../core';
import { Line3D, lengthLine3D, Circle3D, lengthCircle3D, Arc3D, lengthArc3D } from '../geometry';
import { Ellipse3D, lengthEllipse3D } from '../geometry/ellipse3d';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Vertex, makeVertex } from './vertex';
import type { PCurve } from './pcurve';

/**
 * Union type for all 3D curve types that can be used in an edge.
 */
export type Curve3D = Line3D | Circle3D | Arc3D | Ellipse3D;

/**
 * A topological edge — a bounded curve segment.
 *
 * The curve is trimmed to [startParam, endParam].
 * startVertex.point must equal curve.startPoint within tolerance.
 * endVertex.point must equal curve.endPoint within tolerance.
 *
 * OCCT reference: TopoDS_Edge + BRep_TEdge
 */
export interface Edge {
  /** The underlying curve geometry */
  readonly curve: Curve3D;

  /** Vertex at the start of the edge */
  readonly startVertex: Vertex;

  /** Vertex at the end of the edge */
  readonly endVertex: Vertex;

  /** Start parameter on the curve */
  readonly startParam: number;

  /** End parameter on the curve */
  readonly endParam: number;

  /**
   * PCurves — 2D representations of this edge in adjacent faces' parameter spaces.
   * Mutable: PCurves are added incrementally as the edge is associated with faces.
   * The same Edge object is shared by multiple faces, so mutation is visible everywhere.
   *
   * OCCT reference: BRep_TEdge stores a list of BRep_CurveRepresentation,
   * modified in-place by BRep_Builder::UpdateEdge.
   */
  pcurves: PCurve[];
}

/**
 * Get the length of a curve.
 */
function curveLength(curve: Curve3D): number {
  switch (curve.type) {
    case 'line3d':
      return lengthLine3D(curve);
    case 'circle3d':
      return lengthCircle3D(curve);
    case 'arc3d':
      return lengthArc3D(curve);
    case 'ellipse3d':
      return lengthEllipse3D(curve);
  }
}

/**
 * Create an edge from a curve and two vertices.
 *
 * Validates that the vertices match the curve endpoints within tolerance.
 *
 * @param curve - The curve geometry
 * @param startVertex - Vertex at the start (must match curve.startPoint)
 * @param endVertex - Vertex at the end (must match curve.endPoint)
 * @returns Edge or failure if vertices don't match curve endpoints
 */
export function makeEdge(
  curve: Curve3D,
  startVertex: Vertex,
  endVertex: Vertex,
): OperationResult<Edge> {
  // Validate start vertex matches curve start point
  if (distance(startVertex.point, curve.startPoint) > TOLERANCE) {
    return failure('Start vertex does not match curve start point within tolerance');
  }

  // Validate end vertex matches curve end point
  if (distance(endVertex.point, curve.endPoint) > TOLERANCE) {
    return failure('End vertex does not match curve end point within tolerance');
  }

  return success({
    curve,
    startVertex,
    endVertex,
    startParam: curve.startParam,
    endParam: curve.endParam,
    pcurves: [],
  });
}

/**
 * Create an edge from a curve, automatically creating vertices at the endpoints.
 *
 * For closed curves (circles), the same vertex is used for both start and end.
 *
 * @param curve - The curve geometry
 * @returns Edge
 */
export function makeEdgeFromCurve(curve: Curve3D): OperationResult<Edge> {
  const startVertex = makeVertex(curve.startPoint);

  // For closed curves, use the same vertex for start and end
  const endVertex = curve.isClosed ? startVertex : makeVertex(curve.endPoint);

  return success({
    curve,
    startVertex,
    endVertex,
    startParam: curve.startParam,
    endParam: curve.endParam,
    pcurves: [],
  });
}

/**
 * Create a new edge with an additional PCurve appended.
 *
 * Mutates the edge in place — all faces sharing this edge see the change.
 * This follows OCCT's BRep_Builder::UpdateEdge pattern.
 *
 * @param edge - The edge to modify
 * @param pcurve - The PCurve to add
 */
export function addPCurveToEdge(edge: Edge, pcurve: PCurve): void {
  edge.pcurves.push(pcurve);
}

/**
 * Get the start point of an edge.
 *
 * @param edge - The edge
 * @returns Start point
 */
export function edgeStartPoint(edge: Edge): Point3D {
  return edge.startVertex.point;
}

/**
 * Get the end point of an edge.
 *
 * @param edge - The edge
 * @returns End point
 */
export function edgeEndPoint(edge: Edge): Point3D {
  return edge.endVertex.point;
}

/**
 * Get the length of an edge.
 *
 * @param edge - The edge
 * @returns The arc length of the underlying curve
 */
export function edgeLength(edge: Edge): number {
  return curveLength(edge.curve);
}
