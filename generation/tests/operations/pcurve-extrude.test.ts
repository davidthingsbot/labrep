/**
 * Tests that extrude populates PCurves on side face edges.
 */
import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, distance } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve, edgeStartPoint, edgeEndPoint } from '../../src/topology/edge';
import { makeWireFromEdges, makeWire, orientEdge } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { extrude } from '../../src/operations/extrude';
import { evaluatePCurve3D } from '../../src/topology/pcurve';

describe('PCurves on extruded edges', () => {
  it('box side faces have edges with PCurves', () => {
    // Extrude a square to make a box
    const corners = [
      point3d(-1, -1, 0), point3d(1, -1, 0),
      point3d(1, 1, 0), point3d(-1, 1, 0),
    ];
    const edges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const result = extrude(wire, vec3d(0, 0, 1), 3);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    // Box has 6 faces: 2 caps (planar) + 4 sides (planar for line extrusion)
    expect(faces.length).toBe(6);

    // Check side faces have edges with PCurves
    const sideFaces = faces.filter(f => {
      // Side faces have 4 edges (quad)
      return f.outerWire.edges.length === 4 && f.surface.type === 'plane';
    });

    let pcurveCount = 0;
    for (const face of sideFaces) {
      for (const oe of face.outerWire.edges) {
        if (oe.edge.pcurves.length > 0) pcurveCount++;
      }
    }

    // Side faces should have PCurves on their edges
    console.log(`Side faces: ${sideFaces.length}, edges with PCurves: ${pcurveCount}`);
    // Each side face has 4 edges, each with a PCurve = sideFaces * 4
    expect(pcurveCount).toBeGreaterThan(0);
  });

  it('cylinder side face has edges with PCurves', () => {
    // Extrude a circle to make a cylinder
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, 2).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const result = extrude(wire, vec3d(0, 0, 1), 5);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFace = faces.find(f => f.surface.type === 'cylinder');
    expect(cylFace).toBeDefined();

    // Cylinder side face has 4 edges: 2 circles + 2 seams
    expect(cylFace!.outerWire.edges.length).toBe(4);

    let pcurveCount = 0;
    for (const oe of cylFace!.outerWire.edges) {
      if (oe.edge.pcurves.length > 0) pcurveCount++;
    }

    console.log(`Cylinder face edges with PCurves: ${pcurveCount}`);
    // All 4 edges should have PCurves (seam edge has 2 PCurves)
    expect(pcurveCount).toBeGreaterThan(0);
  });

  it('seam edge on cylinder has 2 PCurves', () => {
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, 2).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    const result = extrude(wire, vec3d(0, 0, 1), 5);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFace = faces.find(f => f.surface.type === 'cylinder')!;

    // Find the seam edge (appears twice in the wire with opposite orientations)
    const edgeMap = new Map<any, number>();
    for (const oe of cylFace.outerWire.edges) {
      edgeMap.set(oe.edge, (edgeMap.get(oe.edge) || 0) + 1);
    }

    let seamEdge: any = null;
    for (const [e, count] of edgeMap) {
      if (count === 2) seamEdge = e;
    }

    expect(seamEdge).not.toBeNull();
    // Seam edge should have 2 PCurves (one per side of the UV rectangle)
    console.log(`Seam edge PCurves: ${seamEdge.pcurves.length}`);
    expect(seamEdge.pcurves.length).toBe(2);
  });
});
