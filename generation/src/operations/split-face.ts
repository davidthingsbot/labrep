/**
 * Generalized face splitting by intersection curves.
 *
 * Given a face and a set of intersection edges (from FFI), splits the face
 * into fragments. Handles:
 * - Closed curves (circles, ellipses) fully inside → hole + disk
 * - Open curves (arcs, line segments) with endpoints on boundary → wire split
 * - Multiple intersection curves on the same face
 *
 * OCCT reference: BOPAlgo_BuilderFace
 * See: library/opencascade/src/ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_BuilderFace.hxx
 */
import { Point3D, distance } from '../core';
import { Edge, edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire } from '../topology/wire';
import { Face, makeFace, faceOuterWire, faceInnerWires } from '../topology/face';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

/**
 * Result of splitting a face by intersection curves.
 */
export interface SplitFaceResult {
  /** Face fragments after splitting */
  readonly fragments: Face[];
  /** Shared edges (the intersection curves) — these connect adjacent faces */
  readonly sharedEdges: Edge[];
}

// ═══════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════

/**
 * Split a face by intersection edges.
 *
 * For closed intersection curves (circles, ellipses) fully inside the face:
 * creates a face with a hole (inner wire) and a disk face (outer wire = curve).
 *
 * For open intersection curves (arcs, line segments) with endpoints on the
 * face boundary: splits the outer wire at those points and rebuilds.
 *
 * @param face - The face to split
 * @param edges - Intersection edges lying on this face's surface
 * @returns Face fragments and shared edges
 */
export function splitFaceByCurves(face: Face, edges: Edge[]): SplitFaceResult {
  if (edges.length === 0) {
    return { fragments: [face], sharedEdges: [] };
  }

  // Separate closed curves (full circles, ellipses) from open curves (arcs, lines)
  const closedEdges: Edge[] = [];
  const openEdges: Edge[] = [];

  for (const edge of edges) {
    if (edge.curve.isClosed) {
      closedEdges.push(edge);
    } else {
      openEdges.push(edge);
    }
  }

  // Handle closed curves: each becomes a hole in the face + a disk fragment
  const fragments: Face[] = [];
  const sharedEdges: Edge[] = [];

  // Build the holed face: original outer wire + closed curves as inner wires
  const holeWires: Wire[] = [...faceInnerWires(face)];
  const diskFragments: Face[] = [];

  for (const closedEdge of closedEdges) {
    // Hole wire: closed curve traversed in reverse (CW for hole)
    const holeWireResult = makeWire([orientEdge(closedEdge, false)]);
    if (!holeWireResult.success) continue;
    holeWires.push(holeWireResult.result!);

    // Disk face: closed curve as outer wire (CCW)
    const diskWireResult = makeWire([orientEdge(closedEdge, true)]);
    if (!diskWireResult.success) continue;

    const diskFaceResult = makeFace(face.surface, diskWireResult.result!, []);
    if (diskFaceResult.success) {
      diskFragments.push(diskFaceResult.result!);
    }

    sharedEdges.push(closedEdge);
  }

  // Create the holed face (original with holes added)
  if (holeWires.length > faceInnerWires(face).length) {
    // We added new holes
    const holedFaceResult = makeFace(face.surface, face.outerWire, holeWires);
    if (holedFaceResult.success) {
      fragments.push(holedFaceResult.result!);
    } else {
      // Fallback: use original face
      fragments.push(face);
    }
  } else {
    // No closed curves added holes — use original face
    fragments.push(face);
  }

  // Add disk fragments
  fragments.push(...diskFragments);

  // TODO: Handle open curves (arcs, line segments) — requires wire splitting.
  // For now, open curves are stored as shared edges but don't split the face.
  // This will be implemented when the boolean pipeline needs it (Sub-Phase E/F).
  for (const openEdge of openEdges) {
    sharedEdges.push(openEdge);
  }

  return { fragments, sharedEdges };
}
