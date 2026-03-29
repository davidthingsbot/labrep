import { Point3D } from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Shell, shellIsClosed, shellFaces } from './shell';
import { faceOuterWire, faceInnerWires, Face, Surface } from './face';
import { toAdapter } from '../surfaces/surface-adapter';
import { evaluateCurve2D } from './pcurve';

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
 * Compute signed volume contribution of a face using OCCT's unified
 * boundary-curve Gauss integration (BRepGProp_Gauss::Compute).
 *
 * ONE algorithm for ALL face types — no dispatch by surface type.
 * Uses the divergence theorem: V = (1/3) ∫∫_S P · N dS
 * converted via Green's theorem to a boundary-curve integral.
 *
 * Two orientation corrections matching OCCT:
 * 1. mySReverse: flip Jacobian normal for reversed faces (BRepGProp_Face::Normal)
 * 2. C->Reversed(): handle reversed edge PCurves (BRepGProp_Face::Load(Edge))
 *
 * BU1 = face's minimum U parameter (from Bounds(), not hardcoded 0).
 */
function computeFaceVolume(face: Face): number {
  const surface = face.surface;
  const wire = faceOuterWire(face);
  const adapter = toAdapter(surface);

  // OCCT applies TWO orientation corrections that cancel:
  // 1. BRepGProp_Face::Normal: reverses Jacobian for reversed faces (mySReverse)
  // 2. BRepGProp_Face::Load(Edge): reverses PCurve for reversed edges (C->Reversed())
  // Since we DON'T reverse PCurves (we swap lStart/lEnd instead, giving negative dl),
  // we also must NOT reverse the Jacobian. The wire winding (via dl sign) naturally
  // provides the correct volume sign for each face.


  // Boundary-curve algorithm for all other faces
  const N_L = 48;
  const N_U = 32;

  // OCCT: BU1 from theSurface.Bounds() — the face's actual UV bounds.
  // For periodic surfaces, BU1=0. For non-periodic (planes), derive from boundary.
  let BU1: number;
  if (adapter.isUPeriodic) {
    BU1 = 0;
  } else {
    BU1 = Infinity;
    for (const oe of wire.edges) {
      if (oe.edge.degenerate) continue;
      for (const pc of oe.edge.pcurves) {
        if (pc.surface === surface) {
          const uS = evaluateCurve2D(pc.curve2d, pc.curve2d.startParam).x;
          const uE = evaluateCurve2D(pc.curve2d, pc.curve2d.endParam).x;
          BU1 = Math.min(BU1, uS, uE);
        }
      }
    }
    if (!isFinite(BU1)) BU1 = 0;
  }

  let vol = 0;

  // OCCT BRepGProp_Domain: iterate ALL edges (outer + inner wires)
  const allEdges: { edge: typeof wire.edges[0]['edge']; forward: boolean }[] = [];
  for (const oe of wire.edges) allEdges.push(oe);
  for (const iw of faceInnerWires(face)) {
    for (const oe of iw.edges) allEdges.push(oe);
  }

  const edgeSeen = new Map<object, number>();

  // Pre-count edge appearances for true seam detection
  const edgeAppearances = new Map<object, number>();
  for (const oe of allEdges) {
    if (!oe.edge.degenerate) {
      edgeAppearances.set(oe.edge, (edgeAppearances.get(oe.edge) || 0) + 1);
    }
  }

  for (const oe of allEdges) {
    if (oe.edge.degenerate) continue;

    // PCurve selection — OCCT BRep_Tool::CurveOnSurface + seam occurrence.
    // For forward faces, rawOcc pairs each visit with the correct PCurve
    // regardless of storage order.
    // For reversed faces (flipFace reverses wire but not PCurve order), we
    // swap occurrences ONLY when occ 0 is the "far" PCurve (U≈period,
    // nonzero integral). This handles both extrude (occ 0=U=2π → swap)
    // and revolve (occ 0=U=0 → no swap) without depending on storage order.
    const rawOcc = edgeSeen.get(oe.edge) || 0;
    edgeSeen.set(oe.edge, rawOcc + 1);

    const matchingPCs: any[] = [];
    for (const p of oe.edge.pcurves) {
      if (p.surface === surface) matchingPCs.push(p);
    }

    // Only swap for TRUE seams (same edge object 2+ times in wire).
    // Split seams (boolean creates separate edges with 2 PCurves each) use
    // rawOcc=0 — their PCurve directions are already correct for the volume sign.
    // OCCT ref: IsCurveOnClosedSurface() distinguishes true seams from split edges.
    const isTrueSeam = (edgeAppearances.get(oe.edge) || 0) >= 2;
    let targetOcc = rawOcc;
    if (face.forward === false && isTrueSeam && matchingPCs.length >= 2) {
      const midU0 = evaluateCurve2D(matchingPCs[0].curve2d,
        (matchingPCs[0].curve2d.startParam + matchingPCs[0].curve2d.endParam) / 2).x;
      const farFromBU1 = Math.abs(midU0 - BU1) > (adapter.isUPeriodic ? adapter.uPeriod / 4 : 1);
      if (farFromBU1) {
        targetOcc = 1 - rawOcc;
      }
    }

    let pcIdx = 0;
    let pc = null as any;
    for (const p of oe.edge.pcurves) {
      if (p.surface === surface) {
        if (pcIdx === targetOcc) { pc = p; break; }
        pcIdx++;
      }
    }
    if (!pc) continue;

    const c2d = pc.curve2d;
    const lStart = oe.forward ? c2d.startParam : c2d.endParam;
    const lEnd = oe.forward ? c2d.endParam : c2d.startParam;
    const dl = (lEnd - lStart) / N_L;

    for (let i = 0; i < N_L; i++) {
      const l = lStart + (i + 0.5) * dl;

      const Puv = evaluateCurve2D(c2d, l);
      // Normalize u for periodic surfaces (PCurves may have out-of-range values)
      let u2 = Puv.x;
      if (adapter.isUPeriodic) {
        while (u2 < BU1) u2 += adapter.uPeriod;
        while (u2 > BU1 + adapter.uPeriod) u2 -= adapter.uPeriod;
      }
      const v = Puv.y;

      // dv/dl (OCCT: Vuv.Y())
      const eps = Math.max(Math.abs(dl) * 0.001, 1e-10);
      const PuvPrev = evaluateCurve2D(c2d, l - eps);
      const PuvNext = evaluateCurve2D(c2d, l + eps);
      const dvdl = (PuvNext.y - PuvPrev.y) / (2 * eps);

      if (Math.abs(dvdl) < 1e-14) continue;
      if (Math.abs(u2 - BU1) < 1e-15) continue;

      const duInner = (u2 - BU1) / N_U;
      let innerSum = 0;

      for (let j = 0; j < N_U; j++) {
        const u = BU1 + (j + 0.5) * duInner;
        const pt = evaluateSurface(surface, u, v);
        const jn = jacobianNormal(surface, u, v);
        innerSum += (pt.x * jn.x + pt.y * jn.y + pt.z * jn.z) * duInner;
      }

      vol += innerSum * dvdl * dl;
    }
  }

  return vol / 3;
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
 * OCCT ref: BRepGProp_Face::Normal (line 197-204) — computes D1U×D1V.
 */
function jacobianNormal(surface: Surface, u: number, v: number): Pt {
  const adapter = toAdapter(surface);
  const eps = 1e-7;

  const pUp = adapter.evaluate(u + eps, v);
  const pUm = adapter.evaluate(u - eps, v);
  const dPdu = {
    x: (pUp.x - pUm.x) / (2 * eps),
    y: (pUp.y - pUm.y) / (2 * eps),
    z: (pUp.z - pUm.z) / (2 * eps),
  };

  const pVp = adapter.evaluate(u, v + eps);
  const pVm = adapter.evaluate(u, v - eps);
  const dPdv = {
    x: (pVp.x - pVm.x) / (2 * eps),
    y: (pVp.y - pVm.y) / (2 * eps),
    z: (pVp.z - pVm.z) / (2 * eps),
  };

  return {
    x: dPdu.y * dPdv.z - dPdu.z * dPdv.y,
    y: dPdu.z * dPdv.x - dPdu.x * dPdv.z,
    z: dPdu.x * dPdv.y - dPdu.y * dPdv.x,
  };
}

/**
 * Evaluate a surface at (u, v) parameters.
 */
function evaluateSurface(surface: Surface, u: number, v: number): Pt {
  return toAdapter(surface).evaluate(u, v);
}

/**
 * Compute signed volume of a shell.
 *
 * OCCT ref: BRepGProp::VolumeProperties → BRepGProp_Vinert::Perform
 * ONE unified algorithm (computeFaceVolume) for ALL face types.
 * Inner wires are included in the boundary-curve integration automatically.
 */
function computeShellSignedVolume(shell: Shell): number {
  let totalVolume = 0;
  for (const face of shellFaces(shell)) {
    totalVolume += computeFaceVolume(face);
  }
  return totalVolume;
}
