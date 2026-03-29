import { OperationResult, success, failure } from '../mesh/mesh';
import { Face, faceOuterWire, faceInnerWires } from './face';
import { Wire } from './wire';
import { edgeStartPoint, edgeEndPoint } from './edge';
import { evaluateArc3D } from '../geometry/arc3d';
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
    // Skip degenerate edges (zero 3D length, e.g., at poles) — they don't
    // participate in shell closure analysis.
    if (oe.edge.degenerate) continue;
    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    
    const round = (n: number) => Math.round(n / TOLERANCE) * TOLERANCE;
    const k1 = `${round(start.x)},${round(start.y)},${round(start.z)}`;
    const k2 = `${round(end.x)},${round(end.y)},${round(end.z)}`;

    // For closed curves (circles/arcs), use geometry-based key (center + radius + normal)
    // instead of start point. Different circle objects at the same location may have
    // different start angles. OCCT avoids this via shared topology (IsSame).
    const curve = oe.edge.curve;
    const isClosed = curve.isClosed;
    let key: string;
    let directed: string;
    if (isClosed && (curve.type === 'circle3d' || curve.type === 'arc3d') && 'plane' in curve) {
      const c = curve as any;
      const ctr = c.plane.origin;
      const n = c.plane.normal;
      const geoKey = `C:${round(ctr.x)},${round(ctr.y)},${round(ctr.z)}|r=${round(c.radius)}|n=${round(n.x)},${round(n.y)},${round(n.z)}`;
      key = geoKey;
      directed = `${geoKey}|${oe.forward ? 'fwd' : 'rev'}`;
    } else if (isClosed) {
      key = `${k1}|${k1}`;
      directed = `${k1}|${oe.forward ? 'fwd' : 'rev'}`;
    } else if (curve.type === 'arc3d' && 'plane' in curve) {
      // Open arcs: include midpoint to disambiguate from lines with same endpoints.
      // An arc and a line can share endpoints but traverse different paths.
      const midT = (curve.startParam + curve.endParam) / 2;
      const mid = evaluateArc3D(curve as any, midT);
      const midKey = `M:${round(mid.x)},${round(mid.y)},${round(mid.z)}`;
      key = k1 < k2 ? `${k1}|${k2}|${midKey}` : `${k2}|${k1}|${midKey}`;
      directed = `${k1}->${k2}|${midKey}`;
    } else {
      key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      directed = `${k1}->${k2}`;
    }

    edges.push({
      key,
      directed,
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
  for (const [, usages] of Array.from(edgeUsage)) {
    if (usages.length !== 2) {
      return false;
    }

    if (usages[0] === usages[1]) {
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
