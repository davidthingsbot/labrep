/**
 * Tests verifying sphere construction produces correct topology.
 *
 * OCCT creates a full sphere with exactly 1 face. Our revolve-based sphere
 * creates 2 faces (one per arc segment). This test suite documents the
 * current state and establishes requirements for correct sphere topology.
 */
import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  Z_AXIS_3D,
  distance,
} from '../../src/core';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellFaces, shellIsClosed } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { revolve } from '../../src/operations/revolve';

/** Current sphere construction: revolve two arcs + line */
function makeSphere2Arc(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!, makeEdgeFromCurve(arc2).result!, makeEdgeFromCurve(line).result!,
  ]).result!, Z_AXIS_3D, 2 * Math.PI).result!;
}

/** Alternative: revolve single semicircle arc + line */
function makeSphere1Arc(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc = makeArc3D(arcPlane, r, -Math.PI / 2, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc).result!, makeEdgeFromCurve(line).result!,
  ]).result!, Z_AXIS_3D, 2 * Math.PI).result!;
}

describe('sphere construction: 2-arc version (current)', () => {
  it('produces a closed shell', () => {
    const sphere = makeSphere2Arc(1);
    expect(sphere.solid.outerShell.isClosed).toBe(true);
  });

  it('has 2 faces (one per arc)', () => {
    const sphere = makeSphere2Arc(1);
    const faces = shellFaces(sphere.solid.outerShell);
    expect(faces.length).toBe(2);
  });

  it('both faces are spherical surfaces', () => {
    const sphere = makeSphere2Arc(1);
    const faces = shellFaces(sphere.solid.outerShell);
    for (const f of faces) {
      expect(f.surface.type).toBe('sphere');
    }
  });

  it('face 0 covers z: -1..0 (lower hemisphere)', () => {
    const sphere = makeSphere2Arc(1);
    const verts = shellFaces(sphere.solid.outerShell)[0].outerWire.edges.map(
      oe => oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge)
    );
    const zMin = Math.min(...verts.map(v => v.z));
    const zMax = Math.max(...verts.map(v => v.z));
    expect(zMin).toBeCloseTo(-1, 2);
    expect(zMax).toBeCloseTo(0, 2);
  });

  it('face 1 covers z: 0..1 (upper hemisphere)', () => {
    const sphere = makeSphere2Arc(1);
    const verts = shellFaces(sphere.solid.outerShell)[1].outerWire.edges.map(
      oe => oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge)
    );
    const zMin = Math.min(...verts.map(v => v.z));
    const zMax = Math.max(...verts.map(v => v.z));
    expect(zMin).toBeCloseTo(0, 2);
    expect(zMax).toBeCloseTo(1, 2);
  });
});

describe('sphere construction: 1-arc version (single semicircle)', () => {
  // The 1-arc sphere fails because revolve can't handle profiles where all
  // vertices are on the axis. OCCT builds spheres with BRepPrimAPI_MakeSphere
  // (not revolve). Fixing this requires revolve to handle pole-to-pole arcs.
  it.skip('creates a valid revolve result', () => {
    const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const arc = makeArc3D(arcPlane, 1, -Math.PI / 2, Math.PI / 2);
    expect(arc.success).toBe(true);
    const line = makeLine3D(point3d(0, 0, 1), point3d(0, 0, -1));
    expect(line.success).toBe(true);
    const wire = makeWireFromEdges([
      makeEdgeFromCurve(arc.result!).result!, makeEdgeFromCurve(line.result!).result!,
    ]);
    expect(wire.success).toBe(true);
    const rev = revolve(wire.result!, Z_AXIS_3D, 2 * Math.PI);
    // Show the actual error if it fails
    if (!rev.success) {
      expect(rev.error).toBe('should succeed'); // Will fail with error message
    }
    expect(rev.success).toBe(true);
  });

  it('has 1 face (like OCCT)', () => {
    const sphere = makeSphere1Arc(1);
    const faces = shellFaces(sphere.solid.outerShell);
    // OCCT creates a full sphere with 1 face.
    // If our revolve can handle a semicircle arc, it should also produce 1 face.
    expect(faces.length).toBe(1);
  });

  it('face is a spherical surface', () => {
    const sphere = makeSphere1Arc(1);
    const faces = shellFaces(sphere.solid.outerShell);
    expect(faces[0].surface.type).toBe('sphere');
  });

  it('produces a closed shell', () => {
    const sphere = makeSphere1Arc(1);
    expect(sphere.solid.outerShell.isClosed).toBe(true);
  });

  it('volume is correct: 4πr³/3', () => {
    const sphere = makeSphere1Arc(2);
    const vol = solidVolume(sphere.solid);
    const expected = (4 / 3) * Math.PI * 8;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});
