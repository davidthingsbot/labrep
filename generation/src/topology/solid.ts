import { Point3D } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Shell, shellIsClosed, shellFaces } from './shell';
import { faceOuterWire, faceInnerWires, Face, Surface } from './face';
import type { Wire } from './wire';
import { edgeStartPoint, edgeEndPoint, Curve3D } from './edge';
import { evaluateLine3D } from '../geometry/line3d';
import { evaluateCircle3D } from '../geometry/circle3d';
import { evaluateArc3D } from '../geometry/arc3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';
import { toAdapter } from '../surfaces/surface-adapter';

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
    case 'ellipse3d':
      return evaluateEllipse3D(curve, t);
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
  const edges = wire.edges;

  // For surfaces with parametric evaluation, use a UV grid for accurate volume.
  // This handles sphere/cylinder/cone faces correctly by sampling the actual surface.
  const surfType = face.surface.type;
  // Sphere faces always use parametric integration (pole-fan misses curvature).
  if (surfType === 'sphere') {
    return computeParametricFaceVolume(face, N);
  }
  // Cylinder/cone faces from boolean operations may be flipped (forward=false).
  // The quad/tri rail approach doesn't account for face.forward orientation,
  // giving wrong volume for cavity walls. Use parametric integration for these.
  if ((surfType === 'cylinder' || surfType === 'cone') && face.forward === false) {
    return computeParametricFaceVolume(face, N);
  }

  // Separate edges into curves and lines for rail-based approaches
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

  if (edges.length === 4) {
    return computeQuadFaceVolume(face, N);
  } else if (edges.length === 3) {
    return computeTriFaceVolume(face, N);
  }

  return computeBoundarySampledVolume(face, N);
}

/**
 * Compute signed volume for a face using parametric surface evaluation.
 *
 * Projects boundary vertices to UV space to find the face's parameter bounds,
 * then creates a UV grid, evaluates the surface at each grid point, and sums
 * signed tet volumes for the resulting triangles.
 */
/**
 * Compute signed volume for a curved face using the divergence theorem
 * with parametric surface integration.
 *
 * Volume contribution = (1/3) ∫∫ P(u,v) · (∂P/∂u × ∂P/∂v) du dv
 *
 * The cross product ∂P/∂u × ∂P/∂v is the "Jacobian normal": it carries both
 * the surface orientation AND the area Jacobian. This is the correct integrand
 * for the divergence theorem — no separate orientation detection needed.
 *
 * Face orientation is handled by the wire winding direction in UV space:
 * a forward face traverses UV in CCW order, giving positive Jacobian determinant;
 * a reversed (flipped) face traverses CW, giving negative Jacobian.
 * We detect this via the signed area of the UV boundary polygon.
 *
 * Based on OCCT's BRepGProp_Gauss / BRepGProp_Vinert.
 */
function computeParametricFaceVolume(face: Face, N: number): number {
  const surface = face.surface;

  // Determine UV bounds. Following OCCT's BRepGProp_Gauss approach:
  // - "Natural restriction" faces (full surface, no real trim boundary) use
  //   the surface's natural parametric range directly.
  // - Trimmed faces derive bounds from the wire boundary.
  //
  // A face is natural-restriction if the wire is just a seam (same edge
  // forward and reversed) or if it's a 2-hemisphere face where the wire
  // traces a single meridian.
  const { uMin, uMax, vMin, vMax } = getParametricBounds(face, N);

  // Face orientation: forward=true → surface normal points outward → positive volume.
  // forward=false → reversed face (cavity) → negative volume contribution.
  // Based on OCCT's TopAbs_Orientation (FORWARD vs REVERSED) on TopoDS_Face.
  const orientSign = face.forward !== false ? 1 : -1;

  // Integrate: vol = (1/3) ∫∫ P(u,v) · J(u,v) du dv
  // where J = ∂P/∂u × ∂P/∂v (Jacobian normal)
  // Using midpoint rule over a UV grid
  const nu = N, nv = Math.max(Math.round(N / 2), 8);
  const du = (uMax - uMin) / nu;
  const dv = (vMax - vMin) / nv;
  let vol = 0;

  for (let i = 0; i < nu; i++) {
    const u = uMin + (i + 0.5) * du;
    for (let j = 0; j < nv; j++) {
      const v = vMin + (j + 0.5) * dv;

      const pt = evaluateSurface(surface, u, v);
      const jn = jacobianNormal(surface, u, v);

      // P · J  (position dot Jacobian normal)
      vol += (pt.x * jn.x + pt.y * jn.y + pt.z * jn.z) * du * dv;
    }
  }

  return (vol / 3) * orientSign;
}

/**
 * Get the parametric UV bounds for a face's volume integration.
 *
 * For "natural restriction" faces (OCCT term: faces covering the full surface
 * with no real trim boundary), uses the surface's natural parametric range.
 * For trimmed faces, derives bounds from the wire boundary points.
 *
 * Based on OCCT BRepGProp_Gauss: isNaturalRestriction = (NbChildren == 0).
 */
function getParametricBounds(
  face: Face,
  N: number,
): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const surface = face.surface;

  // Check for natural restriction: the face covers the full surface.
  // Detect this by checking if the wire is a seam (same edge fwd+rev)
  // or if the wire boundary projects to a degenerate UV region.
  if (isNaturalRestriction(face)) {
    // Use the surface's natural parametric range
    return getNaturalBounds(surface);
  }

  // Trimmed face: derive bounds from wire boundary
  const wire = faceOuterWire(face);
  const uvPts: { u: number; v: number }[] = [];
  for (const oe of wire.edges) {
    const e = oe.edge;
    if (e.degenerate) continue; // Skip degenerate edges (zero 3D length at poles)
    const nSamples = e.curve.type === 'line3d' ? 2 : N;
    for (let i = 0; i < nSamples; i++) {
      const tStart = oe.forward ? e.startParam : e.endParam;
      const tEnd = oe.forward ? e.endParam : e.startParam;
      const t = tStart + (i / nSamples) * (tEnd - tStart);
      const pt = evaluateCurve(e.curve, t);
      const uv = projectPointToSurface(surface, pt);
      uvPts.push(uv);
    }
  }

  if (uvPts.length < 3) return getNaturalBounds(surface);

  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const uv of uvPts) {
    if (uv.u < uMin) uMin = uv.u;
    if (uv.u > uMax) uMax = uv.u;
    if (uv.v < vMin) vMin = uv.v;
    if (uv.v > vMax) vMax = uv.v;
  }

  // Handle wrap-around for angular parameters
  const hasNegU = uvPts.some(p => p.u < -Math.PI / 2);
  const hasPosU = uvPts.some(p => p.u > Math.PI / 2);
  if (hasNegU && hasPosU && (uMax - uMin) > Math.PI) {
    for (const uv of uvPts) {
      if (uv.u < 0) uv.u += 2 * Math.PI;
    }
    uMin = Infinity; uMax = -Infinity;
    for (const uv of uvPts) {
      if (uv.u < uMin) uMin = uv.u;
      if (uv.u > uMax) uMax = uv.u;
    }
  }

  return { uMin, uMax, vMin, vMax };
}

/**
 * Check if a face is a "natural restriction" — covering the full surface
 * with no real trim boundary.
 *
 * Detection: a face whose wire consists of the same edge traversed forward
 * and reversed (a seam), or whose wire projects to a degenerate UV area.
 *
 * Based on OCCT: NbChildren() == 0 (no edge topology).
 */
function isNaturalRestriction(face: Face): boolean {
  const wire = faceOuterWire(face);
  const edges = wire.edges;

  // Case 1: wire has exactly 2 non-degenerate oriented edges using the SAME
  // underlying edge (seam: forward + reversed). With degenerate edges at poles,
  // the wire may have 4 edges: seam_fwd + degen + seam_rev + degen.
  const nonDegen = edges.filter(oe => !oe.edge.degenerate);
  if (nonDegen.length === 2) {
    if (nonDegen[0].edge === nonDegen[1].edge && nonDegen[0].forward !== nonDegen[1].forward) {
      return true;
    }
  }

  return false;
}

/**
 * Get the natural parametric bounds for a surface type.
 * Delegates to the SurfaceAdapter.
 */
function getNaturalBounds(surface: Surface): { uMin: number; uMax: number; vMin: number; vMax: number } {
  return toAdapter(surface).uvBounds();
}

/**
 * Compute ∂P/∂u × ∂P/∂v — the unnormalized surface normal (Jacobian normal).
 *
 * This vector encodes both:
 * - The surface orientation (direction)
 * - The area Jacobian (magnitude = |∂P/∂u × ∂P/∂v|)
 *
 * Uses central finite differences on the adapter's evaluate() to compute
 * partial derivatives, then cross product. This works for all surface types.
 *
 * Based on OCCT's BRepGProp_Face::Normal().
 */
function jacobianNormal(surface: Surface, u: number, v: number): Pt {
  const adapter = toAdapter(surface);
  const eps = 1e-7;

  // Central finite differences for ∂P/∂u
  const pUp = adapter.evaluate(u + eps, v);
  const pUm = adapter.evaluate(u - eps, v);
  const dPdu = {
    x: (pUp.x - pUm.x) / (2 * eps),
    y: (pUp.y - pUm.y) / (2 * eps),
    z: (pUp.z - pUm.z) / (2 * eps),
  };

  // Central finite differences for ∂P/∂v
  const pVp = adapter.evaluate(u, v + eps);
  const pVm = adapter.evaluate(u, v - eps);
  const dPdv = {
    x: (pVp.x - pVm.x) / (2 * eps),
    y: (pVp.y - pVm.y) / (2 * eps),
    z: (pVp.z - pVm.z) / (2 * eps),
  };

  // Cross product ∂P/∂u × ∂P/∂v
  return {
    x: dPdu.y * dPdv.z - dPdu.z * dPdv.y,
    y: dPdu.z * dPdv.x - dPdu.x * dPdv.z,
    z: dPdu.x * dPdv.y - dPdu.y * dPdv.x,
  };
}

/**
 * Evaluate a surface at (u, v) parameters.
 * Delegates to the SurfaceAdapter.
 */
function evaluateSurface(surface: Surface, u: number, v: number): Pt {
  return toAdapter(surface).evaluate(u, v);
}

/**
 * Project a 3D point to surface UV parameters.
 * Delegates to the SurfaceAdapter.
 */
function projectPointToSurface(surface: Surface, pt: Pt): { u: number; v: number } {
  return toAdapter(surface).projectPoint(pt as Point3D);
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

  let curvedIdx = -1;
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].edge.curve.type !== 'line3d') {
      curvedIdx = i;
      break;
    }
  }

  if (curvedIdx === -1) {
    return computeLinearFaceVolume(face);
  }

  const curvedOe = edges[curvedIdx];
  const curve = curvedOe.edge;
  const pts = sampleCurve(curve.curve, curve.startParam, curve.endParam, curvedOe.forward, N);

  let pole: Pt | null = null;
  for (let i = 0; i < edges.length; i++) {
    if (i === curvedIdx) continue;
    const oe = edges[i];
    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
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
    let faceVol: number;
    if (faceIsLinear(face)) {
      faceVol = computeLinearFaceVolume(face);
    } else {
      faceVol = computeCurvedFaceVolume(face);
    }
    totalVolume += faceVol;

    // Subtract inner wire (hole) contributions.
    // Each inner wire represents a hole in the face. The divergence theorem
    // requires the hole volume to have the SAME sign as the outer wire (so
    // subtracting it reduces the face's contribution). Inner wires are stored
    // CW (hole convention), but the outer wire's winding varies per face.
    // We match signs: compute the inner wire volume as-is, and if its sign
    // disagrees with the outer wire, negate it before subtracting.
    for (const innerWire of faceInnerWires(face)) {
      const iwVol = computeWireSignedVolume(innerWire, face.surface);
      const iwVolMatched = (Math.sign(faceVol) === Math.sign(iwVol) || faceVol === 0 || iwVol === 0)
        ? iwVol : -iwVol;
      totalVolume -= iwVolMatched;
    }
  }

  return totalVolume;
}

/**
 * Compute signed volume contribution of a wire boundary using fan triangulation.
 * For closed circle/arc wires, samples the curve to create a polygon.
 *
 * @param reversed - If true, traverse edges in reverse order with flipped
 *   orientation. Used for inner wires (holes), which are stored CW. Reversing
 *   gives CCW traversal, matching the outer wire's sign convention so the
 *   subtraction works correctly regardless of face position/normal direction.
 */
function computeWireSignedVolume(wire: Wire, surface: Surface, reversed = false): number {
  const vertices: Pt[] = [];
  const edges = reversed ? [...wire.edges].reverse() : wire.edges;
  for (const oe of edges) {
    const fwd = reversed ? !oe.forward : oe.forward;
    const curve = oe.edge.curve;
    const isCurved = curve.type === 'circle3d' || curve.type === 'arc3d' || curve.type === 'ellipse3d';
    if (isCurved) {
      const n = curve.isClosed ? 32 : 16;
      for (let i = 0; i < n; i++) {
        const t = fwd
          ? curve.startParam + (i / n) * (curve.endParam - curve.startParam)
          : curve.endParam - (i / n) * (curve.endParam - curve.startParam);
        vertices.push(evaluateCurve(curve, t));
      }
    } else {
      const pt = fwd ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      vertices.push(pt);
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

// edgeEndPoint imported from ./edge
