import { Point3D } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Shell, shellIsClosed, shellFaces } from './shell';
import { faceOuterWire, Face } from './face';
import { edgeStartPoint, Curve3D } from './edge';
import { evaluateLine3D } from '../geometry/line3d';
import { evaluateCircle3D } from '../geometry/circle3d';
import { evaluateArc3D } from '../geometry/arc3d';

/**
 * A closed 3D volume defined by its boundary shell(s).
 *
 * outerShell is the external boundary.
 * innerShells define internal voids/cavities.
 *
 * OCCT reference: TopoDS_Solid
 */
export interface Solid {
  /** The external boundary shell (must be closed) */
  readonly outerShell: Shell;

  /** Internal void shells */
  readonly innerShells: readonly Shell[];
}

/**
 * Create a solid from a shell.
 *
 * @param outerShell - The external boundary (must be closed)
 * @param innerShells - Optional internal voids
 * @returns Solid or failure if outer shell is not closed
 */
export function makeSolid(
  outerShell: Shell,
  innerShells: Shell[] = [],
): OperationResult<Solid> {
  if (!shellIsClosed(outerShell)) {
    return failure('Outer shell must be closed');
  }

  return success({
    outerShell,
    innerShells: [...innerShells],
  });
}

/**
 * Get the outer shell of a solid.
 */
export function solidOuterShell(solid: Solid): Shell {
  return solid.outerShell;
}

/**
 * Get the inner shells (voids) of a solid.
 */
export function solidInnerShells(solid: Solid): readonly Shell[] {
  return solid.innerShells;
}

/**
 * Compute the volume of a solid using the divergence theorem.
 *
 * Uses the signed tetrahedra method: for each face, triangulate it and sum
 * the signed volumes of tetrahedra formed with the origin.
 *
 * Volume = (1/6) * Σ (v0 · (v1 × v2)) for each triangle (v0, v1, v2)
 *
 * @param solid - The solid
 * @returns Volume (always positive via absolute value)
 */
export function solidVolume(solid: Solid): number {
  // Compute outer shell volume
  const outerVolume = Math.abs(computeShellSignedVolume(solid.outerShell));

  // Subtract inner shell volumes (voids)
  let innerVolume = 0;
  for (const inner of solid.innerShells) {
    innerVolume += Math.abs(computeShellSignedVolume(inner));
  }

  return outerVolume - innerVolume;
}

type Pt = { x: number; y: number; z: number };

/**
 * Evaluate a curve at a parameter.
 */
function evaluateCurve(curve: Curve3D, t: number): Pt {
  switch (curve.type) {
    case 'line3d':
      return evaluateLine3D(curve, t);
    case 'circle3d':
      return evaluateCircle3D(curve, t);
    case 'arc3d':
      return evaluateArc3D(curve, t);
  }
}

/**
 * Signed volume of tetrahedron (origin, a, b, c).
 */
function tetVol(a: Pt, b: Pt, c: Pt): number {
  const cx = b.y * c.z - b.z * c.y;
  const cy = b.z * c.x - b.x * c.z;
  const cz = b.x * c.y - b.y * c.x;
  return (a.x * cx + a.y * cy + a.z * cz) / 6.0;
}

/**
 * Compute signed volume for a face with all-linear edges (planar polygon).
 * Uses fan triangulation from the first vertex.
 */
function computeLinearFaceVolume(face: Face): number {
  const wire = faceOuterWire(face);
  const vertices: Pt[] = [];
  for (const oe of wire.edges) {
    const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    vertices.push(pt);
  }
  if (vertices.length < 3) return 0;

  let vol = 0;
  const v0 = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    vol += tetVol(v0, vertices[i], vertices[i + 1]);
  }
  return vol;
}

/**
 * Compute signed volume for a curved face by tessellating with a strip
 * of triangles between corresponding edge pairs.
 *
 * For faces with 4 edges (bottom, right, top, left) like extrude/revolve faces:
 * we identify the two "profile" edges (bottom/top) and sample them, creating
 * a strip of quads between them.
 *
 * For faces with 3 edges (pole faces): we identify the arc edge and the two
 * meridional edges, sampling the arc and fanning from the pole.
 *
 * General fallback: dense boundary sampling with fan triangulation.
 */
function computeCurvedFaceVolume(face: Face): number {
  const wire = faceOuterWire(face);
  const N = 64;

  // Collect all edges with their effective orientations
  const edges = wire.edges;

  // Separate edges into curves (circles/arcs) and lines
  const curveEdges: { curve: Curve3D; forward: boolean; idx: number }[] = [];
  const lineEdges: { curve: Curve3D; forward: boolean; idx: number }[] = [];

  for (let idx = 0; idx < edges.length; idx++) {
    const oe = edges[idx];
    const info = { curve: oe.edge.curve, forward: oe.forward, idx };
    if (oe.edge.curve.type === 'line3d') {
      lineEdges.push(info);
    } else {
      curveEdges.push(info);
    }
  }

  // Strategy: sample both "sides" of the face and create a triangle strip
  // For a typical 4-edge face: 2 curve edges (top/bottom circles) and 2 line edges (seams)
  // Or: 1 curve edge + 1 line edge + more edges

  // We'll use the general approach: sample all edges and create a boundary polygon,
  // then tessellate using strips between opposite edges.

  // For the most common case (4-edge face with 2 curves and 2 lines, or 2 curves and 2 curves):
  // Build two "rails" by pairing up opposite edge pairs and sampling them.
  if (edges.length === 4) {
    return computeQuadFaceVolume(face, N);
  } else if (edges.length === 3) {
    return computeTriFaceVolume(face, N);
  }

  // Fallback for other edge counts: dense boundary sampling
  return computeBoundarySampledVolume(face, N);
}

/**
 * Sample points along a curve in the given direction.
 */
function sampleCurve(curve: Curve3D, startP: number, endP: number, forward: boolean, n: number): Pt[] {
  const pts: Pt[] = [];
  const tStart = forward ? startP : endP;
  const tEnd = forward ? endP : startP;
  for (let i = 0; i <= n; i++) {
    const t = tStart + (i / n) * (tEnd - tStart);
    pts.push(evaluateCurve(curve, t));
  }
  return pts;
}

/**
 * Tessellate a 4-edge face as a quad strip between opposite edge pairs.
 *
 * The face boundary is: edge0 → edge1 → edge2 → edge3.
 * We pair the two edges that carry the most curvature information.
 *
 * For a full revolve face (seam,circle,seam,circle): pair circles (1,3)
 * For a partial revolve face (line,arc,line,arc): pair arcs (1,3)
 * For a flat face: either pairing works
 *
 * Heuristic: if edges 1 and 3 are curved (or edges 0 and 2 are the same),
 * pair (1,3). Otherwise pair (0,2).
 */
function computeQuadFaceVolume(face: Face, N: number): number {
  const wire = faceOuterWire(face);
  const edges = wire.edges;

  const e0 = edges[0].edge;
  const e1 = edges[1].edge;
  const e2 = edges[2].edge;
  const e3 = edges[3].edge;

  // Prefer pairing the curved edges (they carry the shape)
  const e0Curved = e0.curve.type !== 'line3d';
  const e1Curved = e1.curve.type !== 'line3d';
  const e2Curved = e2.curve.type !== 'line3d';
  const e3Curved = e3.curve.type !== 'line3d';
  const sameEdge02 = (e0 === e2);

  // Use pairing (1,3) when: edges 0&2 are the same (seam), or edges 1&3 are curved
  const use13 = sameEdge02 || (e1Curved && e3Curved) || (!e0Curved && !e2Curved);

  let railA: Pt[], railB: Pt[];

  if (use13) {
    railA = sampleCurve(e1.curve, e1.startParam, e1.endParam, edges[1].forward, N);
    railB = sampleCurve(e3.curve, e3.startParam, e3.endParam, !edges[3].forward, N);
  } else {
    railA = sampleCurve(e0.curve, e0.startParam, e0.endParam, edges[0].forward, N);
    railB = sampleCurve(e2.curve, e2.startParam, e2.endParam, !edges[2].forward, N);
  }

  let vol = 0;
  for (let i = 0; i < N; i++) {
    vol += tetVol(railA[i], railA[i + 1], railB[i + 1]);
    vol += tetVol(railA[i], railB[i + 1], railB[i]);
  }
  return vol;
}

/**
 * Tessellate a 3-edge face (pole face) by fanning from the pole vertex
 * to samples along the arc/circle edge.
 */
function computeTriFaceVolume(face: Face, N: number): number {
  const wire = faceOuterWire(face);
  const edges = wire.edges;

  // Find the curved edge and sample it
  let curvedIdx = -1;
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].edge.curve.type !== 'line3d') {
      curvedIdx = i;
      break;
    }
  }

  if (curvedIdx === -1) {
    return computeLinearFaceVolume(face); // No curves — treat as linear
  }

  const curvedOe = edges[curvedIdx];
  const curve = curvedOe.edge;
  const pts = sampleCurve(curve.curve, curve.startParam, curve.endParam, curvedOe.forward, N);

  // The pole is the point shared by the two non-curved edges that is NOT on the curved edge
  // Find it: it's the vertex that appears in the other edges but not as an endpoint of the curve
  let pole: Pt | null = null;
  for (let i = 0; i < edges.length; i++) {
    if (i === curvedIdx) continue;
    const oe = edges[i];
    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    // Check which point is NOT an endpoint of the curved edge
    for (const p of [start, end]) {
      const curveStart = curvedOe.forward ? edgeStartPoint(curve) : edgeEndPoint(curve);
      const curveEnd = curvedOe.forward ? edgeEndPoint(curve) : edgeStartPoint(curve);
      const dStart = Math.sqrt((p.x - curveStart.x) ** 2 + (p.y - curveStart.y) ** 2 + (p.z - curveStart.z) ** 2);
      const dEnd = Math.sqrt((p.x - curveEnd.x) ** 2 + (p.y - curveEnd.y) ** 2 + (p.z - curveEnd.z) ** 2);
      if (dStart > 1e-6 && dEnd > 1e-6) {
        pole = p;
        break;
      }
    }
    if (pole) break;
  }

  if (!pole) {
    // Fallback: use the start of the first non-curved edge
    const firstNonCurved = edges.find((_, i) => i !== curvedIdx)!;
    pole = firstNonCurved.forward ? edgeStartPoint(firstNonCurved.edge) : edgeEndPoint(firstNonCurved.edge);
  }

  // Fan from pole to sampled curve
  let vol = 0;
  for (let i = 0; i < N; i++) {
    vol += tetVol(pole!, pts[i], pts[i + 1]);
  }
  return vol;
}

/**
 * Fallback: sample all edges densely and fan-triangulate.
 */
function computeBoundarySampledVolume(face: Face, samplesPerEdge: number): number {
  const wire = faceOuterWire(face);
  const vertices: Pt[] = [];

  for (const oe of wire.edges) {
    const e = oe.edge;
    if (e.curve.type === 'line3d') {
      const pt = oe.forward ? edgeStartPoint(e) : edgeEndPoint(e);
      vertices.push(pt);
    } else {
      const tStart = oe.forward ? e.startParam : e.endParam;
      const tEnd = oe.forward ? e.endParam : e.startParam;
      for (let i = 0; i < samplesPerEdge; i++) {
        const t = tStart + (i / samplesPerEdge) * (tEnd - tStart);
        vertices.push(evaluateCurve(e.curve, t));
      }
    }
  }

  if (vertices.length < 3) return 0;

  let vol = 0;
  const v0 = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    vol += tetVol(v0, vertices[i], vertices[i + 1]);
  }
  return vol;
}

/**
 * Check if face has only linear edges.
 */
function faceIsLinear(face: Face): boolean {
  const wire = faceOuterWire(face);
  for (const oe of wire.edges) {
    if (oe.edge.curve.type !== 'line3d') return false;
  }
  return true;
}

/**
 * Compute signed volume of a shell using the divergence theorem.
 *
 * For planar faces: exact fan triangulation from vertices.
 * For curved faces: tessellation by sampling opposite edge pairs.
 *
 * @param shell - The shell
 * @returns Signed volume (positive if normals point outward)
 */
function computeShellSignedVolume(shell: Shell): number {
  let totalVolume = 0;

  for (const face of shellFaces(shell)) {
    if (faceIsLinear(face)) {
      totalVolume += computeLinearFaceVolume(face);
    } else {
      totalVolume += computeCurvedFaceVolume(face);
    }
  }

  return totalVolume;
}

/**
 * Helper to get edge end point.
 */
function edgeEndPoint(edge: { endVertex: { point: { x: number; y: number; z: number } } }): { x: number; y: number; z: number } {
  return edge.endVertex.point;
}
