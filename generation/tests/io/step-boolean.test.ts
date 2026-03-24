import { describe, it, expect } from 'vitest';
import { point3d, vec3d } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { extrude } from '../../src/operations/extrude';
import { booleanIntersect, booleanSubtract, booleanUnion } from '../../src/operations/boolean';
import { solidToStep } from '../../src/io/step-converters-topology';
import { createStepModelBuilder } from '../../src/io/step-model-builder';
import { writeStep } from '../../src/io/step-writer';
import { parseStep } from '../../src/io/step-parser';

function makeBoxSolid(x: number, y: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(x - hw, y - hh, z), point3d(x + hw, y - hh, z),
    point3d(x + hw, y + hh, z), point3d(x - hw, y + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

describe('STEP Boolean Solid Round-Trip', () => {
  it('intersect result → STEP → parse', () => {
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText).toContain('ADVANCED_FACE');
    expect(stepText).toContain('PLANE');

    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);
  });

  it('subtract result → STEP → parse', () => {
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);
    const result = booleanSubtract(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText.length).toBeGreaterThan(100);
    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);
  });

  it('union result → STEP → parse', () => {
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);
    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText.length).toBeGreaterThan(100);
    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);
  });
});
