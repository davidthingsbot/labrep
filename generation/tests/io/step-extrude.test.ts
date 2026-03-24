import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges, makeWire, orientEdge } from '../../src/topology/wire';
import { extrude, extrudeWithHoles } from '../../src/operations/extrude';
import { solidToStep } from '../../src/io/step-converters-topology';
import { createStepModelBuilder } from '../../src/io/step-model-builder';
import { writeStep } from '../../src/io/step-writer';
import { parseStep } from '../../src/io/step-parser';

function makeRectWire(w: number, h: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(-hw, -hh, 0), point3d(hw, -hh, 0),
    point3d(hw, hh, 0), point3d(-hw, hh, 0),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return makeWireFromEdges(edges).result!;
}

function makeCircleWire(r: number) {
  const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  return makeWire([orientEdge(edge, true)]).result!;
}

describe('STEP Extrude Solid Round-Trip', () => {
  it('writes and parses an extruded box', () => {
    const wire = makeRectWire(4, 6);
    const result = extrude(wire, vec3d(0, 0, 1), 10);
    expect(result.success).toBe(true);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText).toContain('MANIFOLD_SOLID_BREP');
    expect(stepText).toContain('CLOSED_SHELL');
    expect(stepText).toContain('ADVANCED_FACE');
    expect(stepText).toContain('PLANE');

    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);

    let solidCount = 0;
    for (const [, entity] of parseResult.result!.entities) {
      if (entity.typeName === 'MANIFOLD_SOLID_BREP') solidCount++;
    }
    expect(solidCount).toBe(1);
  });

  it('writes and parses an extruded cylinder', () => {
    const wire = makeCircleWire(3);
    const result = extrude(wire, vec3d(0, 0, 1), 8);
    expect(result.success).toBe(true);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText).toContain('MANIFOLD_SOLID_BREP');
    expect(stepText).toContain('CYLINDRICAL_SURFACE');

    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);
  });

  it('writes and parses an extruded box with hole', () => {
    const outer = makeRectWire(6, 6);
    // Hole: reversed circle
    const holePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const holeCircle = makeCircle3D(holePlane, 1.5).result!;
    const holeEdge = makeEdgeFromCurve(holeCircle).result!;
    const holeWire = makeWire([orientEdge(holeEdge, false)]).result!;

    const result = extrudeWithHoles(outer, [holeWire], vec3d(0, 0, 1), 5);
    expect(result.success).toBe(true);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText).toContain('MANIFOLD_SOLID_BREP');

    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);
  });
});
