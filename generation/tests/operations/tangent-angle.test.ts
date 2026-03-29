/**
 * Tests for tangentAngle — the OCCT Angle2D equivalent.
 *
 * OCCT ref: BOPAlgo_WireSplitter_1.cxx Angle2D()
 *
 * Angle2D computes the 2D tangent direction of a half-edge at a vertex.
 * For outgoing edges (atStart=true): direction FROM the vertex INTO the edge.
 * For incoming edges (atStart=false): direction FROM the edge INTO the vertex.
 *
 * Both should give the direction of travel at the vertex.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, Z_AXIS_3D } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint, addPCurveToEdge } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { revolve } from '../../src/operations/revolve';
import { tangentAngle, type HalfEdge } from '../../src/operations/builder-face';
import { buildPCurveForEdgeOnSurface } from '../../src/topology/pcurve';
import { toAdapter } from '../../src/surfaces/surface-adapter';

function makeSphere1Face(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc = makeArc3D(arcPlane, r, -Math.PI / 2, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const axis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc).result!, makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI).result!;
}

function makeHE(edge: any, forward: boolean, startVtx = 0, endVtx = 1, occ = 0): HalfEdge {
  return {
    edge, forward, startVtx, endVtx,
    angleAtStart: 0, angleAtEnd: 0,
    used: false, isBoundary: true, pcurveOccurrence: occ,
  };
}

describe('tangentAngle on sphere face edges', () => {
  const sphere = makeSphere1Face(3);
  const faces = shellFaces(sphere.solid.outerShell);
  const sphereFace = faces.find(f => f.surface.type === 'sphere')!;
  const adapter = toAdapter(sphereFace.surface);

  // The sphere face has 4 edges: seam_fwd, degen_north, seam_rev, degen_south
  // seam_fwd: south pole → north pole (arc3d along profile, at u=0, v goes -π/2 → π/2)
  // degen_north: north pole (degenerate, u=0 → u=2π at v=π/2)
  // seam_rev: north pole → south pole (same arc reversed, at u=2π, v goes π/2 → -π/2)
  // degen_south: south pole (degenerate, u=2π → u=0 at v=-π/2)

  const seamFwdOE = sphereFace.outerWire.edges.find(oe =>
    !oe.edge.degenerate && oe.forward
  )!;
  const seamRevOE = sphereFace.outerWire.edges.find(oe =>
    !oe.edge.degenerate && !oe.forward
  )!;
  const degenNorthOE = sphereFace.outerWire.edges.find(oe => {
    if (!oe.edge.degenerate) return false;
    const p = edgeStartPoint(oe.edge);
    return p.z > 0; // north pole
  })!;
  const degenSouthOE = sphereFace.outerWire.edges.find(oe => {
    if (!oe.edge.degenerate) return false;
    const p = edgeStartPoint(oe.edge);
    return p.z < 0; // south pole
  })!;

  it('seam forward outgoing from south pole: direction is +V (upward)', () => {
    // seam_fwd starts at south pole, goes up to north pole
    // At south pole (outgoing, atStart=true): tangent should point upward = +V
    // +V direction on a sphere is "up in latitude" → angle ≈ π/2
    const he = makeHE(seamFwdOE.edge, seamFwdOE.forward);
    const angle = tangentAngle(he, true, sphereFace.surface, adapter);
    expect(angle).toBeCloseTo(Math.PI / 2, 1); // π/2 = upward
  });

  it('seam forward incoming at north pole: direction is +V (arriving from below)', () => {
    // seam_fwd ends at north pole
    // At north pole (incoming, atStart=false): tangent should still point +V
    // (the direction the edge was traveling when it arrived)
    const he = makeHE(seamFwdOE.edge, seamFwdOE.forward);
    const angle = tangentAngle(he, false, sphereFace.surface, adapter);
    expect(angle).toBeCloseTo(Math.PI / 2, 1); // π/2 = upward
  });

  it('seam reverse outgoing from north pole: direction is -V (downward)', () => {
    // seam_rev starts at north pole (wire direction), goes down to south pole
    // At north pole (outgoing): tangent is downward = -V → angle ≈ 3π/2
    const he = makeHE(seamRevOE.edge, seamRevOE.forward, 0, 1, 1);
    const angle = tangentAngle(he, true, sphereFace.surface, adapter);
    expect(angle).toBeCloseTo(3 * Math.PI / 2, 1); // 3π/2 = downward
  });

  it('degen north outgoing: direction is +U (angle ≈ 0)', () => {
    // degen_north at north pole, goes from u=0 to u=2π
    // outgoing direction: +U → angle ≈ 0
    const he = makeHE(degenNorthOE.edge, degenNorthOE.forward);
    const angle = tangentAngle(he, true, sphereFace.surface, adapter);
    expect(angle).toBeCloseTo(0, 1);
  });

  it('degen north incoming: direction is +U (angle ≈ 0)', () => {
    // OCCT ref: Angle2D with bIsIN=true steps from the end backward then reverses.
    // For a degenerate edge going u=0→2π, incoming at the end vertex steps from
    // 2π toward 2π-dt, giving direction (-1,0). Reversed for bIsIN: (+1,0) → angle 0.
    const he = makeHE(degenNorthOE.edge, degenNorthOE.forward);
    const angle = tangentAngle(he, false, sphereFace.surface, adapter);
    expect(angle).toBeCloseTo(0, 1);
  });
});
