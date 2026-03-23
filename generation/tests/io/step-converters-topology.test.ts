import { describe, it, expect } from 'vitest';
import { point3d, XY_PLANE, plane, vec3d } from '../../src/core';
import { makeLine3D } from '../../src/geometry';
import { makeVertex } from '../../src/topology/vertex';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { orientEdge, makeWire } from '../../src/topology/wire';
import { makePlanarFace } from '../../src/topology/face';
import { makeShell } from '../../src/topology/shell';
import { makeSolid } from '../../src/topology/solid';
import {
  createStepModelBuilder,
  parseStep,
  writeStep,
} from '../../src/io';

import {
  vertexToStep,
  stepToVertex,
  edgeToStep,
  stepToEdge,
  wireToStep,
  faceToStep,
  shellToStep,
  solidToStep,
} from '../../src/io/step-converters-topology';

describe('STEP Converters - Topology', () => {
  // Helper: create a rectangular wire
  function makeRectWire(x1: number, y1: number, x2: number, y2: number, z: number = 0) {
    const e1 = makeEdgeFromCurve(makeLine3D(point3d(x1, y1, z), point3d(x2, y1, z)).result!).result!;
    const e2 = makeEdgeFromCurve(makeLine3D(point3d(x2, y1, z), point3d(x2, y2, z)).result!).result!;
    const e3 = makeEdgeFromCurve(makeLine3D(point3d(x2, y2, z), point3d(x1, y2, z)).result!).result!;
    const e4 = makeEdgeFromCurve(makeLine3D(point3d(x1, y2, z), point3d(x1, y1, z)).result!).result!;
    return makeWire([
      orientEdge(e1, true),
      orientEdge(e2, true),
      orientEdge(e3, true),
      orientEdge(e4, true),
    ]).result!;
  }

  describe('Vertex', () => {
    it('converts Vertex to STEP VERTEX_POINT', () => {
      const vertex = makeVertex(point3d(1, 2, 3));
      const builder = createStepModelBuilder();

      const entities = vertexToStep(vertex, builder);

      const vertexEntity = entities.find(e => e.typeName === 'VERTEX_POINT');
      expect(vertexEntity).toBeDefined();
    });

    it('round-trips Vertex through STEP', () => {
      const original = makeVertex(point3d(5, 6, 7));
      const builder = createStepModelBuilder();
      vertexToStep(original, builder);

      const stepText = writeStep(builder.build());
      const parsed = parseStep(stepText);
      expect(parsed.success).toBe(true);

      const vertexEntity = Array.from(parsed.result!.entities.values())
        .find(e => e.typeName === 'VERTEX_POINT');
      const recovered = stepToVertex(vertexEntity!, parsed.result!);
      expect(recovered.success).toBe(true);

      expect(recovered.result!.point.x).toBeCloseTo(5, 5);
      expect(recovered.result!.point.y).toBeCloseTo(6, 5);
      expect(recovered.result!.point.z).toBeCloseTo(7, 5);
    });
  });

  describe('Edge', () => {
    it('converts Edge to STEP EDGE_CURVE', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      const builder = createStepModelBuilder();

      const entities = edgeToStep(edge, builder);

      const edgeEntity = entities.find(e => e.typeName === 'EDGE_CURVE');
      expect(edgeEntity).toBeDefined();
    });

    it('round-trips Edge through STEP', () => {
      const line = makeLine3D(point3d(1, 2, 3), point3d(4, 5, 6)).result!;
      const original = makeEdgeFromCurve(line).result!;
      const builder = createStepModelBuilder();
      edgeToStep(original, builder);

      const stepText = writeStep(builder.build());
      const parsed = parseStep(stepText);
      expect(parsed.success).toBe(true);

      const edgeEntity = Array.from(parsed.result!.entities.values())
        .find(e => e.typeName === 'EDGE_CURVE');
      const recovered = stepToEdge(edgeEntity!, parsed.result!);
      expect(recovered.success).toBe(true);

      expect(recovered.result!.startVertex.point.x).toBeCloseTo(1, 5);
      expect(recovered.result!.endVertex.point.x).toBeCloseTo(4, 5);
    });
  });

  describe('Wire', () => {
    it('converts Wire to STEP EDGE_LOOP', () => {
      const wire = makeRectWire(0, 0, 1, 1);
      const builder = createStepModelBuilder();

      const entities = wireToStep(wire, builder);

      const loopEntity = entities.find(e => e.typeName === 'EDGE_LOOP');
      expect(loopEntity).toBeDefined();
    });
  });

  describe('Face', () => {
    it('converts Face to STEP ADVANCED_FACE', () => {
      const wire = makeRectWire(0, 0, 2, 2);
      const face = makePlanarFace(wire).result!;
      const builder = createStepModelBuilder();

      const entities = faceToStep(face, builder);

      const faceEntity = entities.find(e => e.typeName === 'ADVANCED_FACE');
      expect(faceEntity).toBeDefined();
    });
  });

  describe('Shell', () => {
    it('converts Shell to STEP CLOSED_SHELL', () => {
      // Create a simple box shell (6 faces)
      const faces = createBoxFaces(1, 1, 1);
      const shell = makeShell(faces).result!;
      const builder = createStepModelBuilder();

      const entities = shellToStep(shell, builder);

      const shellEntity = entities.find(e => 
        e.typeName === 'CLOSED_SHELL' || e.typeName === 'OPEN_SHELL'
      );
      expect(shellEntity).toBeDefined();
    });
  });

  describe('Solid', () => {
    it('converts Solid to STEP MANIFOLD_SOLID_BREP', () => {
      const faces = createBoxFaces(1, 1, 1);
      const shell = makeShell(faces).result!;
      const solid = makeSolid(shell).result!;
      const builder = createStepModelBuilder();

      const entities = solidToStep(solid, builder);

      const solidEntity = entities.find(e => e.typeName === 'MANIFOLD_SOLID_BREP');
      expect(solidEntity).toBeDefined();
    });
  });
});

// Helper function to create box faces
function createBoxFaces(w: number, h: number, d: number) {
  function makeRectFace(x1: number, y1: number, x2: number, y2: number, z: number) {
    const e1 = makeEdgeFromCurve(makeLine3D(point3d(x1, y1, z), point3d(x2, y1, z)).result!).result!;
    const e2 = makeEdgeFromCurve(makeLine3D(point3d(x2, y1, z), point3d(x2, y2, z)).result!).result!;
    const e3 = makeEdgeFromCurve(makeLine3D(point3d(x2, y2, z), point3d(x1, y2, z)).result!).result!;
    const e4 = makeEdgeFromCurve(makeLine3D(point3d(x1, y2, z), point3d(x1, y1, z)).result!).result!;
    const wire = makeWire([
      orientEdge(e1, true), orientEdge(e2, true), 
      orientEdge(e3, true), orientEdge(e4, true),
    ]).result!;
    return makePlanarFace(wire).result!;
  }

  function makeVerticalFace(coords: [number, number, number][]) {
    const edges = [];
    for (let i = 0; i < coords.length; i++) {
      const [x1, y1, z1] = coords[i];
      const [x2, y2, z2] = coords[(i + 1) % coords.length];
      edges.push(makeEdgeFromCurve(makeLine3D(point3d(x1, y1, z1), point3d(x2, y2, z2)).result!).result!);
    }
    const wire = makeWire(edges.map(e => orientEdge(e, true))).result!;
    return makePlanarFace(wire).result!;
  }

  return [
    makeRectFace(0, 0, w, h, 0),  // bottom
    makeRectFace(0, 0, w, h, d),  // top
    makeVerticalFace([[0,0,0], [w,0,0], [w,0,d], [0,0,d]]), // front
    makeVerticalFace([[0,h,0], [w,h,0], [w,h,d], [0,h,d]]), // back
    makeVerticalFace([[0,0,0], [0,h,0], [0,h,d], [0,0,d]]), // left
    makeVerticalFace([[w,0,0], [w,h,0], [w,h,d], [w,0,d]]), // right
  ];
}
