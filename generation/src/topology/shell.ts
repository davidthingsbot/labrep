import { OperationResult, success, failure } from '../mesh/mesh';
import { Face, faceOuterWire, faceInnerWires } from './face';
import { Wire } from './wire';
import { edgeStartPoint, edgeEndPoint } from './edge';
import { distance, TOLERANCE } from '../core';

/**
 * A connected set of faces.
 *
 * isClosed=true when the shell is watertight (no boundary edges).
 *
 * OCCT reference: TopoDS_Shell
 */
export interface Shell {
  /** The faces composing the shell */
  readonly faces: readonly Face[];

  /** True if the shell is watertight (closed) */
  readonly isClosed: boolean;
}

/**
 * Create an edge key from two points for edge matching.
 * The key is normalized so edges with swapped endpoints produce the same key.
 */
function makeEdgeKey(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }): string {
  // Round to tolerance to handle floating-point differences
  const round = (n: number) => Math.round(n / TOLERANCE) * TOLERANCE;
  const k1 = `${round(p1.x)},${round(p1.y)},${round(p1.z)}`;
  const k2 = `${round(p2.x)},${round(p2.y)},${round(p2.z)}`;
  // Sort to make key independent of direction
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

/**
 * Collect all edges from a wire with their direction.
 * Returns array of [edgeKey, directedKey] pairs.
 * directedKey preserves direction for detecting improper orientation.
 */
function collectWireEdges(wire: Wire): Array<{ key: string; directed: string }> {
  const edges: Array<{ key: string; directed: string }> = [];
  
  for (const oe of wire.edges) {
    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    
    const round = (n: number) => Math.round(n / TOLERANCE) * TOLERANCE;
    const k1 = `${round(start.x)},${round(start.y)},${round(start.z)}`;
    const k2 = `${round(end.x)},${round(end.y)},${round(end.z)}`;
    
    edges.push({
      key: k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`,
      directed: `${k1}->${k2}`,
    });
  }
  
  return edges;
}

/**
 * Check if a shell is closed by analyzing edge connectivity.
 * 
 * A shell is closed (watertight) when every edge is shared by exactly 2 faces.
 * Each edge should appear once in each direction (opposite orientations from
 * the two faces that share it).
 */
function analyzeShellClosure(faces: Face[]): boolean {
  if (faces.length === 0) return false;
  
  // Map from edge key to list of directed keys
  const edgeUsage = new Map<string, string[]>();
  
  for (const face of faces) {
    // Collect edges from outer wire
    const outerEdges = collectWireEdges(faceOuterWire(face));
    for (const { key, directed } of outerEdges) {
      const usages = edgeUsage.get(key) || [];
      usages.push(directed);
      edgeUsage.set(key, usages);
    }
    
    // Collect edges from inner wires (holes)
    for (const innerWire of faceInnerWires(face)) {
      const innerEdges = collectWireEdges(innerWire);
      for (const { key, directed } of innerEdges) {
        const usages = edgeUsage.get(key) || [];
        usages.push(directed);
        edgeUsage.set(key, usages);
      }
    }
  }
  
  // For a closed shell:
  // - Every edge must be used exactly 2 times
  // - The two usages should be in opposite directions
  for (const [, usages] of edgeUsage) {
    if (usages.length !== 2) {
      // Edge is used by != 2 faces (boundary edge or non-manifold)
      return false;
    }
    
    // Check that the two usages are in opposite directions
    // (same key but different directed values means opposite directions)
    if (usages[0] === usages[1]) {
      // Same direction - invalid orientation (like Möbius strip)
      return false;
    }
  }
  
  return true;
}

/**
 * Create a shell from faces.
 *
 * Analyzes edge connectivity to determine if the shell is closed (watertight).
 * A shell is closed when every edge is shared by exactly 2 faces.
 *
 * @param faces - The faces composing the shell
 * @returns Shell or failure
 */
export function makeShell(faces: Face[]): OperationResult<Shell> {
  if (faces.length === 0) {
    return failure('Cannot create shell from empty face list');
  }

  const isClosed = analyzeShellClosure(faces);

  return success({
    faces: [...faces],
    isClosed,
  });
}

/**
 * Get the faces of a shell.
 */
export function shellFaces(shell: Shell): readonly Face[] {
  return shell.faces;
}

/**
 * Check if a shell is closed (watertight).
 */
export function shellIsClosed(shell: Shell): boolean {
  return shell.isClosed;
}
