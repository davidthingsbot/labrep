import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { booleanSubtract } from '../../src/operations/boolean';
import { extrude } from '../../src/operations/extrude';

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

function makeCylinder(r: number, height: number, cx = 0, cy = 0, cz = 0) {
  const circlePlane = plane(point3d(cx, cy, cz - height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

describe('debug cylinder flat', () => {
  it('trace with diag', () => {
    (globalThis as any).__builderFaceDiag = true;
    const cyl = makeCylinder(5, 20);
    const cutter = makeBox(6.5, 0, -12, 6, 12, 24);
    const result = booleanSubtract(cyl.solid, cutter.solid);
    console.log('result.success:', result.success);
    console.log('result.error:', result.error);
    (globalThis as any).__builderFaceDiag = false;
    expect(true).toBe(true);
  });
});
