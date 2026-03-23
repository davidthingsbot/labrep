import { Point3D } from '../core';

/**
 * A topological vertex — a point in the BRep structure.
 *
 * OCCT reference: TopoDS_Vertex + BRep_TVertex
 */
export interface Vertex {
  /** The geometric point */
  readonly point: Point3D;
}

/**
 * Create a vertex at a point.
 *
 * @param point - The geometric location
 * @returns Vertex
 */
export function makeVertex(point: Point3D): Vertex {
  return { point };
}

/**
 * Get the point of a vertex.
 *
 * @param vertex - The vertex
 * @returns The geometric point
 */
export function vertexPoint(vertex: Vertex): Point3D {
  return vertex.point;
}
