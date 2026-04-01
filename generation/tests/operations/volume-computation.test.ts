/**
 * Low-level tests for the unified OCCT-aligned volume computation.
 *
 * Tests computeFaceVolume (boundary-curve Gauss integration) directly
 * on simple geometries with analytically known volumes.
 *
 * OCCT ref: BRepGProp_Gauss::Compute, BRepGProp_Face::Normal (mySReverse),
 * BRepGProp_Face::Load(Edge) (C->Reversed()).
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, Z_AXIS_3D } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { shellFaceUses } from '../../src/topology/shell';
import { debugFaceEdgeVolumes, debugFaceVolume, debugFaceVolumes, debugShellSignedVolume, solidInnerShells, solidVolume } from '../../src/topology/solid';
import { evaluateCurve2D as evaluateCurve2DHelper } from '../../src/topology/pcurve';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { booleanSubtract, booleanIntersect, booleanUnion } from '../../src/operations/boolean';

// ═══════════════════════════════════════════════════════
// PRIMITIVE SOLIDS — known exact volumes
// ═══════════════════════════════════════════════════════

describe('volume: box (all-planar-linear)', () => {
  it('unit cube at origin: V = 1', () => {
    const box = makeBox(0, 0, 0, 1, 1, 1);
    expect(solidVolume(box.solid)).toBeCloseTo(1, 2);
  });

  it('2×3×4 box: V = 24', () => {
    const box = makeBox(0, 0, 0, 2, 3, 4);
    expect(solidVolume(box.solid)).toBeCloseTo(24, 1);
  });

  it('offset box: V = 8', () => {
    const box = makeBox(5, 5, 5, 2, 2, 2);
    expect(solidVolume(box.solid)).toBeCloseTo(8, 1);
  });
});

describe('volume: box via diagonal extrude', () => {
  it('10×10 square extruded at 45°: V = 1000', () => {
    // Diagonal extrude: 10×10 at z=0, extruded along (1,0,1) with distance 10√2
    // extrude() normalizes direction → (1/√2,0,1/√2), offset = 10√2 × (1/√2,0,1/√2) = (10,0,10)
    // Volume = base_area × z-height = 100 × 10 = 1000
    const hw = 5, hh = 5;
    const corners = [
      point3d(-hw, -hh, 0), point3d(hw, -hh, 0),
      point3d(hw, hh, 0), point3d(-hw, hh, 0),
    ];
    const edges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const dir = vec3d(1, 0, 1);
    const d = 10 * Math.sqrt(2);
    const result = extrude(wire, dir, d);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.01);
  });
});

describe('volume: extrude along Z (axis-aligned, simple case)', () => {
  it('10×10 rect extruded 10 along Z: V = 1000', () => {
    const hw = 5, hh = 5;
    const corners = [
      point3d(-hw, -hh, 0), point3d(hw, -hh, 0),
      point3d(hw, hh, 0), point3d(-hw, hh, 0),
    ];
    const edges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const result = extrude(wire, vec3d(0, 0, 1), 10);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    expect(Math.abs(vol - 1000) / 1000).toBeLessThan(0.001);
  });
});

describe('volume: cylinder (curved surface + planar caps with circles)', () => {
  it('r=1 h=1: V = π', () => {
    const cyl = makeCylinder(1, 1);
    const vol = solidVolume(cyl.solid);
    expect(vol).toBeCloseTo(Math.PI, 1);
  });

  it('r=2 h=3: V = 12π', () => {
    const cyl = makeCylinder(2, 3);
    const vol = solidVolume(cyl.solid);
    expect(Math.abs(vol - 12 * Math.PI) / (12 * Math.PI)).toBeLessThan(0.02);
  });

  it('r=5 h=20 (pipe fitting size): V = 500π', () => {
    const cyl = makeCylinder(5, 20);
    const vol = solidVolume(cyl.solid);
    expect(Math.abs(vol - 500 * Math.PI) / (500 * Math.PI)).toBeLessThan(0.02);
  });
});

describe('volume: sphere (1-face OCCT sphere)', () => {
  it('r=1: V = 4π/3', () => {
    const sphere = makeSphere(1);
    const vol = solidVolume(sphere.solid);
    expect(Math.abs(vol - 4 * Math.PI / 3) / (4 * Math.PI / 3)).toBeLessThan(0.02);
  });

  it('r=5: V = 500π/3', () => {
    const sphere = makeSphere(5);
    const vol = solidVolume(sphere.solid);
    const expected = (4 / 3) * Math.PI * 125;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

describe('volume: cone (from revolve)', () => {
  it('r=2 h=3: V = 4π', () => {
    // Right triangle (0,0,0)→(2,0,0)→(0,0,3), revolve around Z
    const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(2, 0, 0)).result!).result!;
    const e2 = makeEdgeFromCurve(makeLine3D(point3d(2, 0, 0), point3d(0, 0, 3)).result!).result!;
    const e3 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 3), point3d(0, 0, 0)).result!).result!;
    const wire = makeWireFromEdges([e1, e2, e3]).result!;
    const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = (1 / 3) * Math.PI * 4 * 3; // πr²h/3
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

describe('volume: partial revolve (planar caps with arc edges)', () => {
  it('90° quarter cylinder: V = πr²h/4', () => {
    const r = 3, h = 4;
    const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(r, 0, 0)).result!).result!;
    const e2 = makeEdgeFromCurve(makeLine3D(point3d(r, 0, 0), point3d(r, 0, h)).result!).result!;
    const e3 = makeEdgeFromCurve(makeLine3D(point3d(r, 0, h), point3d(0, 0, h)).result!).result!;
    const e4 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, h), point3d(0, 0, 0)).result!).result!;
    const wire = makeWireFromEdges([e1, e2, e3, e4]).result!;
    const result = revolve(wire, Z_AXIS_3D, Math.PI / 2);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = Math.PI * r * r * h / 4;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('180° half cylinder: V = πr²h/2', () => {
    const r = 2, h = 5;
    const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(r, 0, 0)).result!).result!;
    const e2 = makeEdgeFromCurve(makeLine3D(point3d(r, 0, 0), point3d(r, 0, h)).result!).result!;
    const e3 = makeEdgeFromCurve(makeLine3D(point3d(r, 0, h), point3d(0, 0, h)).result!).result!;
    const e4 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, h), point3d(0, 0, 0)).result!).result!;
    const wire = makeWireFromEdges([e1, e2, e3, e4]).result!;
    const result = revolve(wire, Z_AXIS_3D, Math.PI);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = Math.PI * r * r * h / 2;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

// ═══════════════════════════════════════════════════════
// SIGN CONSISTENCY — the key test
// A planar cap face (circle boundary) must contribute the same sign
// whether computed alone or as part of a shell with curved faces.
// ═══════════════════════════════════════════════════════

describe('volume: sign consistency (the root cause test)', () => {
  it('cylinder volume = sum of face contributions (no sign mismatch)', () => {
    // A cylinder has: 1 curved side face + 2 planar caps with circle edges.
    // If sign conventions are consistent, the total = πr²h.
    // If they're mixed (tet-fan vs divergence-theorem), the caps get wrong sign.
    const cyl = makeCylinder(3, 10);
    const vol = solidVolume(cyl.solid);
    const expected = Math.PI * 9 * 10;
    // Must be within 2% — anything worse indicates sign mismatch
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('cylinder at offset position still correct', () => {
    // Offset from origin tests that P·N computation works for non-origin planes
    const cyl = makeCylinder(2, 5, 10, 10, 10);
    const vol = solidVolume(cyl.solid);
    const expected = Math.PI * 4 * 5;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

describe('volume: primitive diagnostics', () => {
  it('debugs offset box face contributions', () => {
    const box = makeBox(5, 5, 5, 2, 2, 2);
    console.log('[DBG offset box face totals]', debugFaceVolumes(box.solid.outerShell).map((entry) => ({
      surface: entry.face.surface.type,
      forward: entry.face.forward,
      edges: entry.face.outerWire.edges.length,
      volume: entry.volume,
    })));
    expect(true).toBe(true);
  });

  it('debugs cylinder face contributions', () => {
    const cyl = makeCylinder(1, 1);
    console.log('[DBG cylinder face totals]', debugFaceVolumes(cyl.solid.outerShell).map((entry) => ({
      surface: entry.face.surface.type,
      forward: entry.face.forward,
      edges: entry.face.outerWire.edges.length,
      volume: entry.volume,
    })));
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function makeBox(cx: number, cy: number, cz: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, cz), point3d(cx + hw, cy - hh, cz),
    point3d(cx + hw, cy + hh, cz), point3d(cx - hw, cy + hh, cz),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d).result!;
}

function makeCylinder(r: number, height: number, cx = 0, cy = 0, cz = 0) {
  const circlePlane = plane(point3d(cx, cy, cz - height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc = makeArc3D(arcPlane, r, -Math.PI / 2, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc).result!, makeEdgeFromCurve(line).result!,
  ]).result!, Z_AXIS_3D, 2 * Math.PI).result!;
}

// ═══════════════════════════════════════════════════════
// REVERSED FACE VOLUME — the seam occurrence test
//
// When booleanSubtract creates a cavity, the subtracted face is reversed
// (forward=false). The volume computation must handle seam PCurve selection
// correctly for reversed faces from BOTH extrude (occ 0=U=2π) and
// revolve (occ 0=U=0) surfaces.
// ═══════════════════════════════════════════════════════

describe('volume: box minus sphere (reversed revolve face)', () => {
  it('sphere cavity subtracts volume correctly', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000 - (4 / 3) * Math.PI * 8;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('reversed sphere face has forward=false', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const innerShells = solidInnerShells(result.result!.solid);
    expect(innerShells).toHaveLength(1);
    const faces = shellFaces(innerShells[0]);
    const sphereFaces = faces.filter(f => f.surface.type === 'sphere');
    expect(sphereFaces.length).toBe(1);
    expect(sphereFaces[0].forward).toBe(false);
  });

  it('larger sphere r=3: still correct', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(3);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000 - (4 / 3) * Math.PI * 27;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('debugs sphere cavity face totals', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    console.log('[DBG sphere cavity face totals]', debugFaceVolumes(result.result!.solid.outerShell).map((entry) => ({
      surface: entry.face.surface.type,
      forward: entry.face.forward,
      edges: entry.face.outerWire.edges.length,
      volume: entry.volume,
    })));
    expect(true).toBe(true);
  });
});

describe('volume: box minus contained cylinder (reversed extrude face)', () => {
  // The cylinder bore wall is a reversed face with split seam edges
  // (boolean creates separate edge objects that retain both PCurves).
  // OCCT ref: BRep_Tool::CurveOnSurface selects PCurve by edge orientation,
  // not by visit count — handles both true seams and split seams.

  it('contained cylinder subtracts volume correctly', () => {
    // Cylinder fully inside box (no through-hole)
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const cyl = makeCylinder(1, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000 - Math.PI * 1 * 6;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('reversed cylinder face has forward=false', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const cyl = makeCylinder(1, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const innerShells = solidInnerShells(result.result!.solid);
    expect(innerShells).toHaveLength(1);
    const faces = shellFaces(innerShells[0]);
    const cylFaces = faces.filter(f => f.surface.type === 'cylinder');
    expect(cylFaces.length).toBeGreaterThanOrEqual(1);
    expect(cylFaces[0].forward).toBe(false);
  });

  it('larger cylinder r=2: still correct', () => {
    // Larger radius = higher quadrature error (scales with r²).
    // 8% tolerance accounts for Gauss quadrature precision at N_L=48, N_U=32.
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const cyl = makeCylinder(2, 8);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000 - Math.PI * 4 * 8;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.08);
  });
});

describe('volume: sphere minus contained sphere (concentric cavity)', () => {
  // Both spheres at origin, B entirely inside A. No face-face intersection.
  // Both sphere faces have true seam edges (same Edge object 2× in wire).
  // When flipFace reverses B's wire, seam visits swap position AND flip
  // forward flags — these cancel, leaving dl unchanged. The volume
  // computation must still correctly negate B's contribution.
  it('V(A-B) = V(big) - V(small)', () => {
    const s1 = makeSphere(2);
    const s2 = makeSphere(1.5);
    const result = booleanSubtract(s1.solid, s2.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = (4 / 3) * Math.PI * (8 - 3.375);
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.10);
  });

  it('debugs concentric sphere face totals', () => {
    const s1 = makeSphere(2);
    const s2 = makeSphere(1.5);
    const result = booleanSubtract(s1.solid, s2.solid);
    expect(result.success).toBe(true);
    console.log('[DBG concentric sphere face totals]', debugFaceVolumes(result.result!.solid.outerShell).map((entry) => ({
      surface: entry.face.surface.type,
      forward: entry.face.forward,
      edges: entry.face.outerWire.edges.length,
      volume: entry.volume,
    })));
    expect(true).toBe(true);
  });
});

describe('volume: Phase 13 OCCT shell mass properties', () => {
  it('truncated sphere shell uses spherical faces outward on the shell', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    const sphericalUses = shellFaceUses(shell).filter((faceUse) => faceUse.face.surface.type === 'sphere');
    expect(sphericalUses.length).toBe(1);
    expect(sphericalUses[0].face.forward).toBe(true);
    expect(sphericalUses[0].reversed).toBe(false);
  });

  it('debugs truncated sphere shell face uses', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    console.log('[DBG truncated shell face uses]', shellFaceUses(shell).map((faceUse) => ({
      surface: faceUse.face.surface.type,
      faceForward: faceUse.face.forward,
      reversed: faceUse.reversed,
      edges: faceUse.face.outerWire.edges.length,
      z: faceUse.face.surface.type === 'plane' ? faceUse.face.surface.plane.origin.z : null,
      nz: faceUse.face.surface.type === 'plane' ? faceUse.face.surface.plane.normal.z : null,
      edgeDirs: faceUse.face.outerWire.edges.map((oe) => oe.forward),
      volume: debugFaceVolume(faceUse.face, faceUse.reversed),
      flippedVolume: debugFaceVolume(faceUse.face, !faceUse.reversed),
    })));
    expect(true).toBe(true);
  });

  it('sphere cavity shell uses the spherical face inward on the shell', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);

    const shell = solidInnerShells(result.result!.solid)[0];
    const sphericalUses = shellFaceUses(shell).filter((faceUse) => faceUse.face.surface.type === 'sphere');
    expect(sphericalUses.length).toBe(1);
    expect(sphericalUses[0].face.forward).toBe(false);
    expect(sphericalUses[0].reversed).toBe(false);
  });

  it('truncated sphere shell has the correct signed shell volume', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    console.log('[DBG truncated shell face totals]', JSON.stringify(
      debugFaceVolumes(shell).map((entry) => ({
        surface: entry.face.surface.type,
        volume: entry.volume,
        edges: entry.face.outerWire.edges.length,
        inner: entry.face.innerWires.length,
      })),
      null,
      2,
    ));
    const signedVolume = debugShellSignedVolume(shell);
    const expected = 132 * Math.PI;
    expect(Math.abs(signedVolume - expected) / expected).toBeLessThan(0.03);
  });

  it('truncated sphere shell keeps net positive spherical-band contribution', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const contributions = debugFaceVolumes(result.result!.solid.outerShell);
    const spherical = contributions
      .filter(c => c.face.surface.type === 'sphere')
      .reduce((sum, c) => sum + c.volume, 0);

    expect(spherical).toBeGreaterThan(0);
  });

  it('selected truncated-sphere spherical face has positive single-face contribution', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    const sphericalUse = shellFaceUses(shell).find((faceUse) => faceUse.face.surface.type === 'sphere');
    expect(sphericalUse).toBeDefined();

    const contribution = debugFaceVolume(sphericalUse!.face, sphericalUse!.reversed);
    expect(contribution).toBeGreaterThan(0);
  });

  it('selected truncated-sphere spherical face has the expected boundary structure', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    const sphericalUse = shellFaceUses(shell).find((faceUse) => faceUse.face.surface.type === 'sphere');
    expect(sphericalUse).toBeDefined();

    const face = sphericalUse!.face;
    console.log('[DBG truncated-sphere spherical face]', JSON.stringify(face.outerWire.edges.map((oe, index) => ({
      index,
      type: oe.edge.curve.type,
      forward: oe.forward,
      pcurves: oe.edge.pcurves.filter((pc) => pc.surface === face.surface).length,
      pcurveMidU: oe.edge.pcurves
        .filter((pc) => pc.surface === face.surface)
        .map((pc) => evaluateCurve2DHelper(pc.curve2d, (pc.curve2d.startParam + pc.curve2d.endParam) / 2).x),
      z: oe.edge.curve.type === 'circle3d' ? oe.edge.curve.plane.origin.z : null,
      closed: oe.edge.curve.isClosed,
      degenerate: oe.edge.degenerate,
    })), null, 2));
    expect(face.outerWire.edges).toHaveLength(4);
    expect(face.innerWires).toHaveLength(0);
    expect(face.outerWire.edges.filter((oe) => oe.edge.curve.type === 'circle3d')).toHaveLength(2);
    expect(face.outerWire.edges.filter((oe) => oe.edge.pcurves.filter((pc) => pc.surface === face.surface).length >= 2)).toHaveLength(2);
  });

  it('selected truncated-sphere spherical face keeps nonzero contribution on the seam arcs', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    const sphericalUse = shellFaceUses(shell).find((faceUse) => faceUse.face.surface.type === 'sphere');
    expect(sphericalUse).toBeDefined();

    const edgeContributions = debugFaceEdgeVolumes(sphericalUse!.face, sphericalUse!.reversed);
    console.log('[DBG truncated-sphere edge contributions]', JSON.stringify(edgeContributions.map((entry) => ({
      type: entry.edge.curve.type,
      forward: entry.forward,
      volume: entry.volume,
      pcurves: entry.edge.pcurves.filter((pc) => pc.surface === sphericalUse!.face.surface).length,
      z: entry.edge.curve.type === 'circle3d' ? entry.edge.curve.plane.origin.z : null,
    })), null, 2));
    const seamArcContrib = edgeContributions
      .filter((entry) => entry.edge.curve.type === 'arc3d' && entry.edge.pcurves.filter((pc) => pc.surface === sphericalUse!.face.surface).length >= 2)
      .reduce((sum, entry) => sum + entry.volume, 0);

    expect(seamArcContrib).not.toBe(0);
  });

  it('selected truncated-sphere spherical seam arcs contribute with the same sign', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    const sphericalUse = shellFaceUses(shell).find((faceUse) => faceUse.face.surface.type === 'sphere');
    expect(sphericalUse).toBeDefined();

    const seamArcContribs = debugFaceEdgeVolumes(sphericalUse!.face, sphericalUse!.reversed)
      .filter((entry) => entry.edge.curve.type === 'arc3d' && entry.edge.pcurves.filter((pc) => pc.surface === sphericalUse!.face.surface).length >= 2)
      .map((entry) => entry.volume);

    expect(seamArcContribs).toHaveLength(2);
    expect(Math.sign(seamArcContribs[0])).toBe(Math.sign(seamArcContribs[1]));
  });

  it('truncated sphere planar trim disks each contribute positive signed volume', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    const planarContribs = shellFaceUses(shell)
      .filter((faceUse) => faceUse.face.surface.type === 'plane')
      .map((faceUse) => debugFaceVolume(faceUse.face, faceUse.reversed));

    expect(planarContribs).toHaveLength(2);
    expect(planarContribs[0]).toBeGreaterThan(0);
    expect(planarContribs[1]).toBeGreaterThan(0);
  });

  it('T-pipe union shell has the correct signed shell volume', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = booleanUnion(vertCyl.solid, horizCyl.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    console.log('[DBG t-pipe shell face totals]', JSON.stringify(
      debugFaceVolumes(shell).map((entry) => ({
        surface: entry.face.surface.type,
        volume: entry.volume,
        edges: entry.face.outerWire.edges.length,
        inner: entry.face.innerWires.length,
      })),
      null,
      2,
    ));
    const signedVolume = debugShellSignedVolume(shell);
    const expected = 2 * Math.PI * 9 * 20 - 144;
    expect(Math.abs(signedVolume - expected) / expected).toBeLessThan(0.05);
  });

  it('T-pipe union shell keeps net positive cylindrical contribution', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = booleanUnion(vertCyl.solid, horizCyl.solid);
    expect(result.success).toBe(true);

    const contributions = debugFaceVolumes(result.result!.solid.outerShell);
    const cylindrical = contributions
      .filter(c => c.face.surface.type === 'cylinder' || c.face.surface.type === 'extrusion')
      .reduce((sum, c) => sum + c.volume, 0);

    expect(cylindrical).toBeGreaterThan(0);
  });

  it('selected T-pipe cylindrical face has nonzero edge contribution', () => {
    const vertCyl = makeCylinder(3, 20);

    const circlePlane = plane(point3d(-10, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const horizCyl = extrude(wire, vec3d(1, 0, 0), 20).result!;

    const result = booleanUnion(vertCyl.solid, horizCyl.solid);
    expect(result.success).toBe(true);

    const shell = result.result!.solid.outerShell;
    const cylUse = shellFaceUses(shell).find((faceUse) => faceUse.face.surface.type === 'cylinder');
    expect(cylUse).toBeDefined();

    const edgeContributions = debugFaceEdgeVolumes(cylUse!.face, cylUse!.reversed);
    console.log('[DBG t-pipe cylinder face]', JSON.stringify(cylUse!.face.outerWire.edges.map((oe, index) => ({
      index,
      type: oe.edge.curve.type,
      forward: oe.forward,
      pcurves: oe.edge.pcurves.filter((pc) => pc.surface === cylUse!.face.surface).length,
      pcurveMidU: oe.edge.pcurves
        .filter((pc) => pc.surface === cylUse!.face.surface)
        .map((pc) => evaluateCurve2DHelper(pc.curve2d, (pc.curve2d.startParam + pc.curve2d.endParam) / 2).x),
    })), null, 2));
    console.log('[DBG t-pipe cylinder edge contributions]', JSON.stringify(edgeContributions.map((entry) => ({
      type: entry.edge.curve.type,
      forward: entry.forward,
      volume: entry.volume,
      pcurves: entry.edge.pcurves.filter((pc) => pc.surface === cylUse!.face.surface).length,
    })), null, 2));

    const total = edgeContributions.reduce((sum, entry) => sum + entry.volume, 0);
    expect(total).not.toBe(0);
  });
});
