import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { point3d, vec3d, plane } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { booleanIntersect, booleanSubtract } from '../../src/operations/boolean';

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

function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const axis = { origin: point3d(0, 0, 0), direction: vec3d(0, 0, 1) };
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!, makeEdgeFromCurve(arc2).result!, makeEdgeFromCurve(line).result!,
  ]).result!, axis, 2 * Math.PI).result!;
}

function makeCylinder(r: number, height: number, cx = 0, cy = 0, cz = 0) {
  const circlePlane = plane(point3d(cx, cy, cz - height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = require('../../src/geometry/circle3d').makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

describe('DIAG: sphere-intersect-box', () => {
  beforeAll(() => { (globalThis as any).__builderFaceDiag = true; });
  afterAll(() => { (globalThis as any).__builderFaceDiag = false; });

  it('diagnose sphere intersect box', () => {
    const sphere = makeSphere(5);
    const box = makeBox(0, 0, -3, 12, 12, 6);
    const result = booleanIntersect(sphere.solid, box.solid);
    console.log('sphere-box result.success:', result.success);
  });
});

describe('DIAG: cylinder-with-flat', () => {
  beforeAll(() => { (globalThis as any).__builderFaceDiag = true; });
  afterAll(() => { (globalThis as any).__builderFaceDiag = false; });

  it('diagnose cylinder subtract box', () => {
    const cyl = makeCylinder(5, 20);
    const cutter = makeBox(6.5, 0, -12, 6, 12, 24);
    const result = booleanSubtract(cyl.solid, cutter.solid);
    console.log('cyl-flat result.success:', result.success);
  });
});
