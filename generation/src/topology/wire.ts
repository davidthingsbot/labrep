import { Point3D, distance, TOLERANCE } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Edge, edgeStartPoint, edgeEndPoint, edgeLength } from './edge';

/**
 * An edge with orientation information.
 *
 * When forward=true, traverse from startVertex to endVertex.
 * When forward=false, traverse from endVertex to startVertex.
 *
 * OCCT reference: Part of TopoDS_Wire structure
 */
export interface OrientedEdge {
  readonly edge: Edge;
  readonly forward: boolean;
}

/**
 * A connected sequence of edges forming a path or loop.
 *
 * Edges must connect end-to-end (within tolerance).
 * isClosed=true when the last edge connects back to the first.
 *
 * OCCT reference: TopoDS_Wire
 */
export interface Wire {
  readonly edges: readonly OrientedEdge[];
  readonly isClosed: boolean;
}

/**
 * Create an oriented edge from an edge and direction flag.
 *
 * @param edge - The underlying edge
 * @param forward - True to traverse in curve direction, false to reverse
 * @returns OrientedEdge
 */
export function orientEdge(edge: Edge, forward: boolean): OrientedEdge {
  return { edge, forward };
}

/**
 * Reverse the orientation of an oriented edge.
 *
 * @param oe - The oriented edge to reverse
 * @returns New OrientedEdge with flipped direction
 */
export function reverseOrientedEdge(oe: OrientedEdge): OrientedEdge {
  return { edge: oe.edge, forward: !oe.forward };
}

/**
 * Get the effective start point of an oriented edge.
 */
export function orientedEdgeStartPoint(oe: OrientedEdge): Point3D {
  return oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
}

/**
 * Get the effective end point of an oriented edge.
 */
export function orientedEdgeEndPoint(oe: OrientedEdge): Point3D {
  return oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
}

/**
 * Create a wire from oriented edges.
 *
 * Validates that edges connect end-to-end within tolerance.
 *
 * @param edges - Oriented edges in order
 * @returns Wire or failure if edges don't connect
 */
export function makeWire(edges: OrientedEdge[]): OperationResult<Wire> {
  if (edges.length === 0) {
    return failure('Cannot create wire from empty edge list');
  }

  // Validate connectivity.
  // OCCT ref: BRep_Builder::Add(wire, edge) does NOT check connectivity —
  // wires are ordered edge collections. But we validate where possible.
  // Exception: closed (self-loop) edges always connect because start=end.
  for (let i = 0; i < edges.length - 1; i++) {
    const currentClosed = edges[i].edge.curve.isClosed;
    const nextClosed = edges[i + 1].edge.curve.isClosed;

    // Skip connectivity check if either edge is a self-loop (start=end)
    if (currentClosed || nextClosed) continue;

    const endOfCurrent = orientedEdgeEndPoint(edges[i]);
    const startOfNext = orientedEdgeStartPoint(edges[i + 1]);

    if (distance(endOfCurrent, startOfNext) > TOLERANCE) {
      return failure(`Edges do not connect at index ${i} to ${i + 1}`);
    }
  }

  // Check if closed
  const firstNonClosed = edges.find(e => !e.edge.curve.isClosed);
  const lastNonClosed = [...edges].reverse().find(e => !e.edge.curve.isClosed);
  let isClosed: boolean;
  if (!firstNonClosed || !lastNonClosed) {
    // All edges are self-loops → wire is closed
    isClosed = true;
  } else {
    const start = orientedEdgeStartPoint(edges[0]);
    const end = orientedEdgeEndPoint(edges[edges.length - 1]);
    isClosed = distance(start, end) <= TOLERANCE;
  }

  return success({
    edges: [...edges],
    isClosed,
  });
}

/**
 * Create a wire from edges, automatically orienting them.
 *
 * Attempts to orient edges so they form a connected chain.
 *
 * @param edges - Edges (orientation will be determined automatically)
 * @returns Wire or failure if edges cannot be connected
 */
export function makeWireFromEdges(edges: Edge[]): OperationResult<Wire> {
  if (edges.length === 0) {
    return failure('Cannot create wire from empty edge list');
  }

  if (edges.length === 1) {
    // Single edge, use forward orientation
    return makeWire([orientEdge(edges[0], true)]);
  }

  // Build the wire by finding correct orientations
  const orientedEdges: OrientedEdge[] = [];

  // Start with first edge in forward direction
  orientedEdges.push(orientEdge(edges[0], true));
  let currentEnd = edgeEndPoint(edges[0]);

  // For each subsequent edge, determine orientation
  for (let i = 1; i < edges.length; i++) {
    const edge = edges[i];
    const startPt = edgeStartPoint(edge);
    const endPt = edgeEndPoint(edge);

    if (distance(currentEnd, startPt) <= TOLERANCE) {
      // Forward orientation
      orientedEdges.push(orientEdge(edge, true));
      currentEnd = endPt;
    } else if (distance(currentEnd, endPt) <= TOLERANCE) {
      // Reversed orientation
      orientedEdges.push(orientEdge(edge, false));
      currentEnd = startPt;
    } else {
      return failure(`Edge ${i} cannot be connected to previous edges`);
    }
  }

  return makeWire(orientedEdges);
}

/**
 * Get the total length of the wire.
 *
 * @param wire - The wire
 * @returns Sum of all edge lengths
 */
export function wireLength(wire: Wire): number {
  return wire.edges.reduce((sum, oe) => sum + edgeLength(oe.edge), 0);
}

/**
 * Get the start point of the wire.
 *
 * @param wire - The wire
 * @returns Start point of the first edge (respecting orientation)
 */
export function wireStartPoint(wire: Wire): Point3D {
  return orientedEdgeStartPoint(wire.edges[0]);
}

/**
 * Get the end point of the wire.
 *
 * @param wire - The wire
 * @returns End point of the last edge (respecting orientation)
 */
export function wireEndPoint(wire: Wire): Point3D {
  return orientedEdgeEndPoint(wire.edges[wire.edges.length - 1]);
}
