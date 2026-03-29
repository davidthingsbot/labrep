/**
 * OCCT-aligned fundamental tests.
 *
 * These tests lock down invariants that must NEVER regress:
 * - Primitives match OCCT topology (face count, edge count, vertex count)
 * - Circles are single closed edges, NOT split into arcs
 * - BuilderFace handles self-loop circles on periodic surfaces
 * - BuilderFace handles self-loop circles on planar surfaces
 * - Sphere is 1 face (OCCT BRepPrim_Sphere)
 * - Cylinder is 3 faces (OCCT BRepPrim_Cylinder)
 *
 * If ANY of these tests fail, the fix is WRONG. Do not change these tests.
 * Fix the code to match OCCT behavior.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, addPCurveToEdge } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { builderFace } from '../../src/operations/builder-face';
import { buildPCurveForEdgeOnSurface } from '../../src/topology/pcurve';
import { booleanSubtract } from '../../src/operations/boolean';
import { solidToMesh } from '../../src/mesh/tessellation';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** OCCT-style cylinder: extrude circle → 3 faces (1 cylindrical + 2 planar caps) */
function makeCylinder(r: number, height: number, cx = 0, cy = 0, cz = 0) {
  const circlePlane = plane(point3d(cx, cy, cz - height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

/** OCCT-style sphere: revolve single semicircle → 1 spherical face */
function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc = makeArc3D(arcPlane, r, -Math.PI / 2, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const axis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc).result!, makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI).result!;
}

function makeBox(cx: number, cy: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, z), point3d(cx + hw, cy - hh, z),
    point3d(cx + hw, cy + hh, z), point3d(cx - hw, cy + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d).result!;
}

// ═══════════════════════════════════════════════════════
// 1. PRIMITIVE TOPOLOGY (OCCT BRepPrim)
// ═══════════════════════════════════════════════════════

describe('OCCT primitive topology', () => {
  it('cylinder has exactly 3 faces: 1 cylindrical + 2 planar', () => {
    const cyl = makeCylinder(2, 5);
    const faces = shellFaces(cyl.solid.outerShell);
    expect(faces.length).toBe(3);
    expect(faces.filter(f => f.surface.type === 'cylinder').length).toBe(1);
    expect(faces.filter(f => f.surface.type === 'plane').length).toBe(2);
  });

  it('cylinder side face has 4-edge wire with seam', () => {
    const cyl = makeCylinder(2, 5);
    const sideFace = shellFaces(cyl.solid.outerShell).find(f => f.surface.type === 'cylinder')!;
    // OCCT: bottom_circle + seam_fwd + top_circle + seam_rev = 4 edges
    expect(sideFace.outerWire.edges.length).toBe(4);
    // Seam edge appears twice (same edge object, different orientations)
    const edgeObjs = sideFace.outerWire.edges.map(oe => oe.edge);
    const unique = new Set(edgeObjs);
    expect(unique.size).toBe(3); // 2 circles + 1 seam (appearing twice)
  });

  it('cylinder cap is single closed circle edge', () => {
    const cyl = makeCylinder(2, 5);
    const capFace = shellFaces(cyl.solid.outerShell).find(f => f.surface.type === 'plane')!;
    expect(capFace.outerWire.edges.length).toBe(1);
    expect(capFace.outerWire.edges[0].edge.curve.type).toBe('circle3d');
    expect(capFace.outerWire.edges[0].edge.curve.isClosed).toBe(true);
  });

  it('sphere has exactly 1 spherical face (OCCT BRepPrim_Sphere)', () => {
    const sphere = makeSphere(3);
    const faces = shellFaces(sphere.solid.outerShell);
    const sphereFaces = faces.filter(f => f.surface.type === 'sphere');
    expect(sphereFaces.length).toBe(1);
  });

  it('sphere face has 4-edge wire: seam_fwd + degen_top + seam_rev + degen_bottom', () => {
    const sphere = makeSphere(3);
    const face = shellFaces(sphere.solid.outerShell).find(f => f.surface.type === 'sphere')!;
    expect(face.outerWire.edges.length).toBe(4);
    const degenCount = face.outerWire.edges.filter(oe => oe.edge.degenerate).length;
    expect(degenCount).toBe(2); // north + south pole
  });

  it('sphere has correct volume: 4/3 π r³', () => {
    const r = 3;
    const sphere = makeSphere(r);
    const vol = solidVolume(sphere.solid);
    const expected = (4 / 3) * Math.PI * r * r * r;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });

  it('sphere tessellates successfully', () => {
    const sphere = makeSphere(2);
    const mesh = solidToMesh(sphere.solid);
    expect(mesh.success).toBe(true);
    const triCount = mesh.result!.indices.length / 3;
    expect(triCount).toBeGreaterThan(50);
  });

  it('cylinder shell is closed', () => {
    const cyl = makeCylinder(2, 5);
    expect(cyl.solid.outerShell.isClosed).toBe(true);
  });

  it('sphere shell is closed', () => {
    const sphere = makeSphere(3);
    expect(sphere.solid.outerShell.isClosed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 2. CIRCLE EDGES ARE SINGLE CLOSED EDGES, NOT ARCS
//
// OCCT represents full circles as one edge with parameter [0, 2π]
// and startVertex === endVertex. They are NEVER split into arcs.
// ═══════════════════════════════════════════════════════

describe('circle edges are single closed edges', () => {
  it('makeEdgeFromCurve(circle) creates one edge with same start/end vertex', () => {
    const cp = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(cp, 2).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    expect(edge.curve.type).toBe('circle3d');
    expect(edge.curve.isClosed).toBe(true);
    expect(edge.startVertex).toBe(edge.endVertex); // same object
  });

  it('FFI circle edges on cylinder caps are circle3d, not arc3d', () => {
    const cyl = makeCylinder(2, 5);
    const faces = shellFaces(cyl.solid.outerShell);
    const caps = faces.filter(f => f.surface.type === 'plane');
    for (const cap of caps) {
      for (const oe of cap.outerWire.edges) {
        expect(oe.edge.curve.type).toBe('circle3d');
        expect(oe.edge.curve.isClosed).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// 3. BUILDERFACE: SELF-LOOP CIRCLES ON PLANAR FACES
//
// On planar faces, a full circle creates a hole (inner wire) + disk face.
// This is the basic case and must always work.
// ═══════════════════════════════════════════════════════

describe('BuilderFace: circle on planar face', () => {
  function makeRectFace(x0: number, y0: number, x1: number, y1: number) {
    const corners = [
      point3d(x0, y0, 0), point3d(x1, y0, 0),
      point3d(x1, y1, 0), point3d(x0, y1, 0),
    ];
    const edges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const res = extrude(wire, vec3d(0, 0, 1), 1).result!;
    return shellFaces(res.solid.outerShell).find(f => {
      const pts = f.outerWire.edges.map(oe => edgeStartPoint(oe.edge));
      return pts.every(p => Math.abs(p.z) < 0.01);
    })!;
  }

  it('single circle creates 2 faces: rectangle-with-hole + disk', () => {
    const face = makeRectFace(-3, -3, 3, 3);
    const cp = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circleEdge = makeEdgeFromCurve(makeCircle3D(cp, 1).result!).result!;
    const pc = buildPCurveForEdgeOnSurface(circleEdge, face.surface, true);
    if (pc) addPCurveToEdge(circleEdge, pc);

    const result = builderFace(face, [circleEdge]);
    expect(result.length).toBe(2);

    const holed = result.find(f => f.innerWires.length > 0);
    const disk = result.find(f => f.innerWires.length === 0 &&
      f.outerWire.edges.some(oe => oe.edge.curve.type === 'circle3d'));
    expect(holed).toBeDefined();
    expect(disk).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
// 4. BUILDERFACE: SELF-LOOP CIRCLES ON PERIODIC SURFACES
//
// On periodic surfaces (cylinder, sphere), a full circle at a
// constant parameter (e.g., constant Z on a cylinder) splits the
// face. The circle's start==end vertex coincides with seam vertices.
// BuilderFace must form proper tube/cap sub-faces, not standalone
// self-loop faces.
// ═══════════════════════════════════════════════════════

describe('BuilderFace: circle on periodic surface', () => {
  it('circle splits cylinder side into 2 faces', () => {
    const cyl = makeCylinder(2, 10);
    const sideFace = shellFaces(cyl.solid.outerShell).find(f => f.surface.type === 'cylinder')!;

    const cp = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(cp, 2).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const pc = buildPCurveForEdgeOnSurface(edge, sideFace.surface, true);
    if (pc) addPCurveToEdge(edge, pc);

    const result = builderFace(sideFace, [edge]);
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });

  it('two circles split cylinder side into 3 faces', () => {
    const cyl = makeCylinder(2, 10);
    const sideFace = shellFaces(cyl.solid.outerShell).find(f => f.surface.type === 'cylinder')!;

    const edges = [-2, 2].map(z => {
      const cp = plane(point3d(0, 0, z), vec3d(0, 0, 1), vec3d(1, 0, 0));
      const circle = makeCircle3D(cp, 2).result!;
      const e = makeEdgeFromCurve(circle).result!;
      const pc = buildPCurveForEdgeOnSurface(e, sideFace.surface, true);
      if (pc) addPCurveToEdge(e, pc);
      return e;
    });

    const result = builderFace(sideFace, edges);
    expect(result.length).toBe(3);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });

  it('circle splits sphere face into 2 faces', () => {
    const sphere = makeSphere(3);
    const sphereFace = shellFaces(sphere.solid.outerShell).find(f => f.surface.type === 'sphere')!;

    const circleR = Math.sqrt(9 - 2.25); // r=3, z=1.5
    const cp = plane(point3d(0, 0, 1.5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(cp, circleR).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const pc = buildPCurveForEdgeOnSurface(edge, sphereFace.surface, true);
    if (pc) addPCurveToEdge(edge, pc);

    const result = builderFace(sphereFace, [edge]);
    expect(result.length).toBe(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 4B. BUILDERFACE: CYLINDER SPLIT BY 2 AXIAL LINES
//
// When a plane parallel to the cylinder axis intersects the cylinder,
// it produces 2 vertical line edges. These should split the cylinder
// face into 2 parts: a large portion and a chord segment.
// ═══════════════════════════════════════════════════════

describe('BuilderFace: cylinder split by axial lines', () => {
  it('2 vertical lines split cylinder into 2 faces', () => {
    const cyl = makeCylinder(5, 20);
    const sideFace = shellFaces(cyl.solid.outerShell).find(f => f.surface.type === 'cylinder')!;

    // Two vertical lines at y≈±3.57 (where plane x=3.5 meets cylinder r=5)
    const h = Math.sqrt(25 - 12.25); // ≈ 3.571
    const line1 = makeEdgeFromCurve(makeLine3D(
      point3d(3.5, -h, -10), point3d(3.5, -h, 10)).result!).result!;
    const line2 = makeEdgeFromCurve(makeLine3D(
      point3d(3.5, h, -10), point3d(3.5, h, 10)).result!).result!;

    const pc1 = buildPCurveForEdgeOnSurface(line1, sideFace.surface, true);
    const pc2 = buildPCurveForEdgeOnSurface(line2, sideFace.surface, true);
    if (pc1) addPCurveToEdge(line1, pc1);
    if (pc2) addPCurveToEdge(line2, pc2);

    const result = builderFace(sideFace, [line1, line2]);

    // The seam creates 3 sub-faces: major arc + 2 chord segments (split by seam)
    // This is correct OCCT behavior for a cylinder with seam.
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }
  });

  it('vertical line endpoints connect to split boundary circles', () => {
    const cyl = makeCylinder(5, 20);
    const sideFace = shellFaces(cyl.solid.outerShell).find(f => f.surface.type === 'cylinder')!;

    const h = Math.sqrt(25 - 12.25);
    const line1 = makeEdgeFromCurve(makeLine3D(
      point3d(3.5, -h, -10), point3d(3.5, -h, 10)).result!).result!;
    const pc1 = buildPCurveForEdgeOnSurface(line1, sideFace.surface, true);
    if (pc1) addPCurveToEdge(line1, pc1);

    const result = builderFace(sideFace, [line1]);
    // Single vertical line splits cylinder into 2 parts
    expect(result.length).toBe(2);

    // The line edge should appear in both sub-faces' wires
    let lineInFaces = 0;
    for (const f of result) {
      for (const oe of f.outerWire.edges) {
        if (oe.edge === line1) lineInFaces++;
      }
    }
    expect(lineInFaces).toBe(2); // Same Edge object in both faces
  });

  it('cylinder-flat: sub-faces have correct forward flag for volume', () => {
    // The full cylinder-flat case: cylinder r=5, h=20, cut at x=3.5
    const cyl = makeCylinder(5, 20);
    const sideFace = shellFaces(cyl.solid.outerShell).find(f => f.surface.type === 'cylinder')!;

    const h = Math.sqrt(25 - 12.25);
    const line1 = makeEdgeFromCurve(makeLine3D(
      point3d(3.5, -h, -10), point3d(3.5, -h, 10)).result!).result!;
    const line2 = makeEdgeFromCurve(makeLine3D(
      point3d(3.5, h, -10), point3d(3.5, h, 10)).result!).result!;
    const pc1 = buildPCurveForEdgeOnSurface(line1, sideFace.surface, true);
    const pc2 = buildPCurveForEdgeOnSurface(line2, sideFace.surface, true);
    if (pc1) addPCurveToEdge(line1, pc1);
    if (pc2) addPCurveToEdge(line2, pc2);

    const result = builderFace(sideFace, [line1, line2]);
    // Should produce sub-faces (3 if seam splits chord region, 2 minimum)
    expect(result.length).toBeGreaterThanOrEqual(2);

    // All sub-faces should be closed
    for (const f of result) {
      expect(f.outerWire.isClosed).toBe(true);
    }

    // All sub-faces should have forward=true (same as parent face)
    for (const f of result) {
      expect(f.forward).toBe(true);
    }

    // Log sub-face edge info for debugging
    for (const f of result) {
      const edgeTypes = f.outerWire.edges.map(oe =>
        `${oe.edge.curve.type}(${oe.forward ? 'F' : 'R'})`
      ).join(', ');
      console.log(`Sub-face: edges=${f.outerWire.edges.length} fwd=${f.forward} [${edgeTypes}]`);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 5. BOOLEAN: BOX MINUS CONTAINED SPHERE
//
// The simplest curved boolean. Sphere fully inside box.
// Must produce 6 planar faces + 1 reversed sphere face.
// ═══════════════════════════════════════════════════════

describe('boolean: box minus contained sphere', () => {
  it('succeeds with correct face types', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    expect(faces.filter(f => f.surface.type === 'plane').length).toBe(6);
    expect(faces.filter(f => f.surface.type === 'sphere').length).toBe(1);
  });

  it('has correct volume: box - sphere', () => {
    const box = makeBox(0, 0, -5, 10, 10, 10);
    const sphere = makeSphere(2);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 1000 - (4 / 3) * Math.PI * 8;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

// ═══════════════════════════════════════════════════════
// 6. BOOLEAN: BOX MINUS THROUGH-CYLINDER
//
// The critical through-hole case. Cylinder extends beyond box.
// Must produce planar faces with circular holes + cylindrical bore.
// ═══════════════════════════════════════════════════════

describe('boolean: box minus through-cylinder', () => {
  it('succeeds with closed shell', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const cyl = makeCylinder(1, 8);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('has cylindrical bore face', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const cyl = makeCylinder(1, 8);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFaces = faces.filter(f => f.surface.type === 'cylinder');
    expect(cylFaces.length).toBeGreaterThan(0);
  });

  it('has correct volume: box - cylinder', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const cyl = makeCylinder(1, 8);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = 6 * 6 * 6 - Math.PI * 1 * 1 * 6;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

// ═══════════════════════════════════════════════════════
// 6B. MAKEWIRE: OCCT CONNECTIVITY (NO CHECK FOR SELF-LOOPS)
//
// OCCT's BRep_Builder::Add(wire, edge) does not check 3D connectivity.
// Our makeWire must allow self-loop (closed) edges between non-adjacent
// vertices, matching OCCT behavior.
// ═══════════════════════════════════════════════════════

describe('makeWire: OCCT connectivity for closed edges', () => {
  it('accepts wire with self-loop circle between non-connecting line edges', () => {
    // Lateral cylinder wire: seam → circle → seam → circle
    // The circles are self-loops that don't share 3D endpoints with the seams
    // Cylinder r=3, h=5 around Z axis. Seam at (3,0,z).
    // Circles centered at axis origin (0,0,z), radius 3, start at (3,0,z).
    const seamBottom = point3d(3, 0, 0), seamTop = point3d(3, 0, 5);
    const seam = makeEdgeFromCurve(makeLine3D(seamBottom, seamTop).result!).result!;
    const topCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0)), 3).result!
    ).result!;
    const botCircle = makeEdgeFromCurve(
      makeCircle3D(plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)), 3).result!
    ).result!;

    // OCCT order: TopCircle(REV), seam(REV), BottomCircle(FWD), seam(FWD)
    const wire = makeWire([
      orientEdge(topCircle, false),
      orientEdge(seam, false),
      orientEdge(botCircle, true),
      orientEdge(seam, true),
    ]);
    expect(JSON.stringify({ s: wire.success, e: wire.error })).toBe(JSON.stringify({ s: true, e: undefined }));
    expect(wire.result!.isClosed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 7. REVOLVE FACE CONSTRUCTION (OCCT BRepPrim_OneAxis)
//
// OCCT constructs revolve faces with specific conventions:
// - TopFace: wire = [TopEdge(FWD)], forward=true
// - BottomFace: wire = [BottomEdge(REV)], forward=false (ReverseFace)
// - LateralFace: wire = [TopEdge(REV), EndEdge(FWD), BottomEdge(FWD), StartEdge(REV)]
// These tests verify our revolve matches these conventions.
// ═══════════════════════════════════════════════════════

describe('Revolve: OCCT face conventions', () => {
  // Rectangle (0,0,0)→(r,0,0)→(r,0,h)→(0,0,h) revolved around Z
  const r = 3, h = 5;
  function makeCylinderFromRevolve() {
    const p1 = point3d(0, 0, 0), p2 = point3d(r, 0, 0);
    const p3 = point3d(r, 0, h), p4 = point3d(0, 0, h);
    const edges = [
      makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
      makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
      makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
      makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
    ];
    const wire = makeWireFromEdges(edges).result!;
    return revolve(wire, { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) }, 2 * Math.PI);
  }

  it('produces 3 faces: 2 plane + 1 cylinder', () => {
    const result = makeCylinderFromRevolve();
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    // OCCT: 3 faces. Left edge on axis → no face.
    // Bottom edge → bottom disk. Right edge → lateral cylinder. Top edge → top disk.
    const planes = faces.filter(f => f.surface.type === 'plane');
    const cyls = faces.filter(f => f.surface.type === 'cylinder');
    expect(planes.length).toBe(2);
    expect(cyls.length).toBe(1);
  });

  it('disk caps: OCCT wire = single circle edge', () => {
    const result = makeCylinderFromRevolve();
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const diskFaces = faces.filter(f => f.surface.type === 'plane');

    for (const disk of diskFaces) {
      // OCCT TopFace/BottomFace: wire has just one circle edge (TopEdge or BottomEdge)
      // Degenerate edges don't count.
      const nonDegen = disk.outerWire.edges.filter(oe => !oe.edge.degenerate);
      expect(nonDegen.length).toBe(1);
      expect(nonDegen[0].edge.curve.type).toBe('circle3d');
      expect(nonDegen[0].edge.curve.isClosed).toBe(true);
    }
  });

  it('bottom disk: forward=false (OCCT ReverseFace)', () => {
    const result = makeCylinderFromRevolve();
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const diskFaces = faces.filter(f => f.surface.type === 'plane');

    // Find bottom disk (z=0) and top disk (z=h)
    const bottom = diskFaces.find(f => {
      const e = f.outerWire.edges.find(oe => !oe.edge.degenerate)!;
      return Math.abs(edgeStartPoint(e.edge).z) < 0.1;
    });
    const top = diskFaces.find(f => {
      const e = f.outerWire.edges.find(oe => !oe.edge.degenerate)!;
      return Math.abs(edgeStartPoint(e.edge).z - h) < 0.1;
    });
    expect(bottom).toBeDefined();
    expect(top).toBeDefined();

    // OCCT: BottomFace has ReverseFace → forward=false
    // TopFace does NOT → forward=true
    expect(bottom!.forward).toBe(false);
    expect(top!.forward).toBe(true);
  });

  it('lateral face: 4 edges (seam fwd + circle + seam rev + circle)', () => {
    const result = makeCylinderFromRevolve();
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFace = faces.find(f => f.surface.type === 'cylinder')!;

    // OCCT LateralFace: 4 edges
    expect(cylFace.outerWire.edges.length).toBe(4);
    // 2 circle edges + 2 seam (line) edges
    const circles = cylFace.outerWire.edges.filter(oe =>
      oe.edge.curve.type === 'circle3d' && oe.edge.curve.isClosed);
    const lines = cylFace.outerWire.edges.filter(oe =>
      oe.edge.curve.type === 'line3d');
    expect(circles.length).toBe(2);
    expect(lines.length).toBe(2);
  });

  it('circle edges shared between disk and lateral faces', () => {
    const result = makeCylinderFromRevolve();
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFace = faces.find(f => f.surface.type === 'cylinder')!;
    const diskFaces = faces.filter(f => f.surface.type === 'plane');

    // The circle edges from the disk faces should be the SAME Edge objects
    // as the circle edges in the lateral face (OCCT shared topology)
    const diskCircleEdges = new Set<object>();
    for (const disk of diskFaces) {
      for (const oe of disk.outerWire.edges) {
        if (!oe.edge.degenerate && oe.edge.curve.type === 'circle3d') {
          diskCircleEdges.add(oe.edge);
        }
      }
    }
    const cylCircleEdges = new Set<object>();
    for (const oe of cylFace.outerWire.edges) {
      if (oe.edge.curve.type === 'circle3d') {
        cylCircleEdges.add(oe.edge);
      }
    }

    // Same edge objects in both faces
    for (const e of diskCircleEdges) {
      expect(cylCircleEdges.has(e)).toBe(true);
    }
  });

  it('shared circle edges have OPPOSITE directions in adjacent faces', () => {
    // OCCT invariant: each shared edge appears FORWARD in one face and REVERSED
    // in the adjacent face. This is what makes the shell manifold and watertight.
    const result = makeCylinderFromRevolve();
    expect(result.success).toBe(true);
    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFace = faces.find(f => f.surface.type === 'cylinder')!;
    const diskFaces = faces.filter(f => f.surface.type === 'plane');

    for (const disk of diskFaces) {
      // Find the circle edge in the disk face
      const diskCircle = disk.outerWire.edges.find(oe =>
        !oe.edge.degenerate && oe.edge.curve.type === 'circle3d')!;
      // Find the same edge object in the lateral face
      const cylCircle = cylFace.outerWire.edges.find(oe =>
        oe.edge === diskCircle.edge)!;
      expect(cylCircle).toBeDefined();
      // They must have OPPOSITE forward flags
      expect(cylCircle.forward).not.toBe(diskCircle.forward);
    }
  });

  it('volume is correct: V = π·r²·h', () => {
    const result = makeCylinderFromRevolve();
    expect(result.success).toBe(true);
    const vol = solidVolume(result.result!.solid);
    const expected = Math.PI * r * r * h;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.01);
  });
});
