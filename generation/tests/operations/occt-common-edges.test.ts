import { describe, expect, it } from 'vitest';
import { plane, point3d, vec3d } from '../../src/core';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeLine3D } from '../../src/geometry/line3d';
import { preSplitFaceAtVertices, stitchEdges } from '../../src/operations/occt-common-edges';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeFace } from '../../src/topology/face';
import { makeWire, orientEdge } from '../../src/topology/wire';

function makeEdge(start: ReturnType<typeof point3d>, end: ReturnType<typeof point3d>) {
  return makeEdgeFromCurve(makeLine3D(start, end).result!).result!;
}

describe('OCCT common edges', () => {
  it('splits inner-wire edges at shared vertices from other faces', () => {
    const outer = makeWire([
      orientEdge(makeEdge(point3d(-3, -3, 0), point3d(3, -3, 0)), true),
      orientEdge(makeEdge(point3d(3, -3, 0), point3d(3, 3, 0)), true),
      orientEdge(makeEdge(point3d(3, 3, 0), point3d(-3, 3, 0)), true),
      orientEdge(makeEdge(point3d(-3, 3, 0), point3d(-3, -3, 0)), true),
    ]).result!;

    const inner = makeWire([
      orientEdge(makeEdge(point3d(-1, -1, 0), point3d(1, -1, 0)), true),
      orientEdge(makeEdge(point3d(1, -1, 0), point3d(1, 1, 0)), true),
      orientEdge(makeEdge(point3d(1, 1, 0), point3d(-1, 1, 0)), true),
      orientEdge(makeEdge(point3d(-1, 1, 0), point3d(-1, -1, 0)), true),
    ]).result!;

    const face = makeFace(
      { type: 'plane', plane: plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)) },
      outer,
      [inner],
    ).result!;

    const rebuilt = preSplitFaceAtVertices(face, [point3d(0, -1, 0)]);
    expect(rebuilt.innerWires).toHaveLength(1);
    expect(rebuilt.innerWires[0].edges.length).toBe(5);
  });

  it('canonicalizes coincident closed circles into a shared edge', () => {
    const topPlane = plane(point3d(0, 0, 3), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const bottomPlane = plane(point3d(0, 0, 3), vec3d(0, 0, -1), vec3d(1, 0, 0));

    const topCircle = makeEdgeFromCurve(makeCircle3D(topPlane, 4).result!).result!;
    const bottomCircle = makeEdgeFromCurve(makeCircle3D(bottomPlane, 4).result!).result!;
    expect(topCircle).not.toBe(bottomCircle);

    const topFace = makeFace(
      { type: 'plane', plane: topPlane },
      makeWire([orientEdge(topCircle, true)]).result!,
      [],
      true,
    ).result!;
    const bottomFace = makeFace(
      { type: 'plane', plane: bottomPlane },
      makeWire([orientEdge(bottomCircle, true)]).result!,
      [],
      true,
    ).result!;

    const stitched = stitchEdges([topFace, bottomFace]);
    const stitchedTopCircle = stitched[0].outerWire.edges[0].edge;
    const stitchedBottomCircle = stitched[1].outerWire.edges[0].edge;

    expect(stitchedTopCircle).toBe(stitchedBottomCircle);
  });

  it('canonicalizes coincident open line segments into a shared edge', () => {
    const sharedA = makeEdge(point3d(0, 0, 0), point3d(1, 0, 0));
    const sharedB = makeEdge(point3d(0, 0, 0), point3d(1, 0, 0));
    expect(sharedA).not.toBe(sharedB);

    const faceA = makeFace(
      { type: 'plane', plane: plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)) },
      makeWire([
        orientEdge(sharedA, true),
        orientEdge(makeEdge(point3d(1, 0, 0), point3d(1, 1, 0)), true),
        orientEdge(makeEdge(point3d(1, 1, 0), point3d(0, 1, 0)), true),
        orientEdge(makeEdge(point3d(0, 1, 0), point3d(0, 0, 0)), true),
      ]).result!,
    ).result!;

    const faceB = makeFace(
      { type: 'plane', plane: plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0)) },
      makeWire([
        orientEdge(sharedB, false),
        orientEdge(makeEdge(point3d(0, 0, 0), point3d(0, 0, 1)), true),
        orientEdge(makeEdge(point3d(0, 0, 1), point3d(1, 0, 1)), true),
        orientEdge(makeEdge(point3d(1, 0, 1), point3d(1, 0, 0)), true),
      ]).result!,
    ).result!;

    const stitched = stitchEdges([faceA, faceB]);
    expect(stitched[0].outerWire.edges[0].edge).toBe(stitched[1].outerWire.edges[0].edge);
  });
});
