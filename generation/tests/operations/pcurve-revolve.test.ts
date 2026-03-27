/**
 * Tests that revolve populates PCurves on face edges.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, Z_AXIS_3D } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { revolve } from '../../src/operations/revolve';

describe('PCurves on revolved edges', () => {
  it('sphere seam edge has 2 PCurves (left and right sides of UV rect)', () => {
    // Single-face sphere: revolve a semicircle arc 360°
    const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const arc = makeArc3D(arcPlane, 1, -Math.PI / 2, Math.PI / 2).result!;
    const line = makeLine3D(point3d(0, 0, 1), point3d(0, 0, -1)).result!;
    const wire = makeWireFromEdges([
      makeEdgeFromCurve(arc).result!,
      makeEdgeFromCurve(line).result!,
    ]).result!;
    const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const sphereFace = faces.find(f => f.surface.type === 'sphere');
    expect(sphereFace).toBeDefined();

    // Sphere face wire has 4 edges: seam fwd + degen_pole + seam rev + degen_pole
    // (OCCT convention: degenerate edges at poles connect left/right seam in UV)
    expect(sphereFace!.outerWire.edges.length).toBe(4);

    // The seam edge should have 2 PCurves
    const seamEdge = sphereFace!.outerWire.edges[0].edge;
    console.log(`Sphere seam edge PCurves: ${seamEdge.pcurves.length}`);
    expect(seamEdge.pcurves.length).toBe(2);

    // First PCurve should be at U=0 (left side)
    const pc0 = seamEdge.pcurves[0];
    expect(pc0.curve2d.type).toBe('line');
    // Second PCurve should be at U=2π (right side)
    const pc1 = seamEdge.pcurves[1];
    expect(pc1.curve2d.type).toBe('line');
  });

  it('2-face sphere (2 hemisphere arcs) has PCurves on seam edges', () => {
    // Two-arc sphere: revolve 2 quarter-arcs + line
    const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const arc1 = makeArc3D(arcPlane, 1, -Math.PI / 2, 0).result!;
    const arc2 = makeArc3D(arcPlane, 1, 0, Math.PI / 2).result!;
    const line = makeLine3D(point3d(0, 0, 1), point3d(0, 0, -1)).result!;
    const wire = makeWireFromEdges([
      makeEdgeFromCurve(arc1).result!,
      makeEdgeFromCurve(arc2).result!,
      makeEdgeFromCurve(line).result!,
    ]).result!;
    const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const sphereFaces = faces.filter(f => f.surface.type === 'sphere');
    expect(sphereFaces.length).toBe(2);

    // Each sphere face should have edges with PCurves
    let totalPCurves = 0;
    for (const sf of sphereFaces) {
      for (const oe of sf.outerWire.edges) {
        totalPCurves += oe.edge.pcurves.length;
      }
    }
    console.log(`2-face sphere total PCurves: ${totalPCurves}`);
    expect(totalPCurves).toBeGreaterThan(0);
  });
});
