import { describe, expect, it } from 'vitest';
import { plane, point3d, vec3d } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { orientFacesOnShell } from '../../src/operations/occt-shell-orientation';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { faceOrientedEdges, makeFace } from '../../src/topology/face';
import { makeShell, materializeShellFaceUse } from '../../src/topology/shell';
import { makeWire, orientEdge } from '../../src/topology/wire';
import { extrude } from '../../src/operations/extrude';
import { booleanSubtract } from '../../src/operations/boolean';

function makeCylinder(r: number, height: number) {
  const circle = makeCircle3D(
    plane(point3d(0, 0, -height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0)),
    r,
  ).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

function makeEdge(start: ReturnType<typeof point3d>, end: ReturnType<typeof point3d>) {
  return makeEdgeFromCurve(makeLine3D(start, end).result!).result!;
}

describe('OCCT shell orientation', () => {
  it('returns a reversed shell face use without mutating the underlying face', () => {
    const shared = makeEdge(point3d(0, 0, 0), point3d(1, 0, 0));

    const faceAEdges = [
      orientEdge(shared, true),
      orientEdge(makeEdge(point3d(1, 0, 0), point3d(1, 1, 0)), true),
      orientEdge(makeEdge(point3d(1, 1, 0), point3d(0, 1, 0)), true),
      orientEdge(makeEdge(point3d(0, 1, 0), point3d(0, 0, 0)), true),
    ];
    const faceAWire = makeWire(faceAEdges).result!;
    const faceA = makeFace(
      { type: 'plane', plane: plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)) },
      faceAWire,
    ).result!;

    const faceBEdges = [
      orientEdge(shared, true),
      orientEdge(makeEdge(point3d(1, 0, 0), point3d(1, 0, 1)), true),
      orientEdge(makeEdge(point3d(1, 0, 1), point3d(0, 0, 1)), true),
      orientEdge(makeEdge(point3d(0, 0, 1), point3d(0, 0, 0)), true),
    ];
    const faceBWire = makeWire(faceBEdges).result!;
    const faceB = makeFace(
      { type: 'plane', plane: plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0)) },
      faceBWire,
      [],
      false,
    ).result!;

    const oriented = orientFacesOnShell([faceA, faceB]);
    const orientedFace = materializeShellFaceUse(oriented[1]);
    const orientedEdges = faceOrientedEdges(orientedFace);

    expect(oriented[1].face.forward).toBe(false);
    expect(oriented[1].reversed).toBe(true);
    expect(orientedFace.forward).toBe(true);
    const sharedUse = orientedEdges.find((oe) => oe.edge === shared);
    expect(sharedUse).toBeDefined();
    expect(sharedUse!.forward).toBe(true);
  });

  it('shell closure treats identical closed circles with opposite normals as the same edge', () => {
    const topCircle = makeCircle3D(
      plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)),
      1,
    ).result!;
    const bottomCircle = makeCircle3D(
      plane(point3d(0, 0, 0), vec3d(0, 0, -1), vec3d(1, 0, 0)),
      1,
    ).result!;

    const topEdge = makeEdgeFromCurve(topCircle).result!;
    const bottomEdge = makeEdgeFromCurve(bottomCircle).result!;

    const topWire = makeWire([orientEdge(topEdge, true)]).result!;
    const bottomWire = makeWire([orientEdge(bottomEdge, true)]).result!;

    const topFace = makeFace(
      { type: 'plane', plane: plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0)) },
      topWire,
    ).result!;
    const bottomFace = makeFace(
      { type: 'plane', plane: plane(point3d(0, 0, 0), vec3d(0, 0, -1), vec3d(1, 0, 0)) },
      bottomWire,
    ).result!;

    const shell = makeShell([topFace, bottomFace]);
    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });

  it('tube shell face uses materialize to a closed shell', () => {
    const outer = makeCylinder(5, 20);
    const inner = makeCylinder(3, 20);
    const result = booleanSubtract(outer.solid, inner.solid);
    expect(result.success).toBe(true);
    const oriented = orientFacesOnShell([
      ...result.result!.facesFromA,
      ...result.result!.facesFromB,
    ]);
    const shell = makeShell(oriented);
    expect(shell.success).toBe(true);
    expect(shell.result!.isClosed).toBe(true);
  });

});
