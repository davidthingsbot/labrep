import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, Z_AXIS_3D } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
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

// ═══════════════════════════════════════════════════════
// CURVED BOOLEAN STEP ROUND-TRIPS (Phase 13)
// ═══════════════════════════════════════════════════════

function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  return revolve(makeWireFromEdges([
    makeEdgeFromCurve(arc1).result!, makeEdgeFromCurve(arc2).result!, makeEdgeFromCurve(line).result!,
  ]).result!, Z_AXIS_3D, 2 * Math.PI).result!;
}

function makeCylinder(r: number, height: number) {
  const circlePlane = plane(point3d(0, 0, -height / 2), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  const wire = makeWire([orientEdge(edge, true)]).result!;
  return extrude(wire, vec3d(0, 0, 1), height).result!;
}

describe('STEP Curved Boolean Round-Trip (Phase 13)', () => {
  it('box − sphere → STEP contains SPHERICAL_SURFACE', () => {
    const box = makeBoxSolid(0, 0, -2, 4, 4, 4);
    const sphere = makeSphere(1);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText).toContain('SPHERICAL_SURFACE');
    expect(stepText).toContain('PLANE');
    expect(stepText).toContain('ADVANCED_FACE');

    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);
  });

  it('box − cylinder (through-hole) → STEP contains CYLINDRICAL_SURFACE', () => {
    const box = makeBoxSolid(0, 0, -2, 4, 4, 4);
    const cyl = makeCylinder(0.5, 6);
    const result = booleanSubtract(box.solid, cyl.solid);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);
    const cylFaces = faces.filter(f => f.surface.type === 'cylinder');
    expect(cylFaces.length).toBeGreaterThan(0);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    expect(stepText).toContain('CYLINDRICAL_SURFACE');
    expect(stepText).toContain('PLANE');

    const parseResult = parseStep(stepText);
    expect(parseResult.success).toBe(true);
  });

  it('box − sphere → STEP has correct face count', () => {
    const box = makeBoxSolid(0, 0, -2, 4, 4, 4);
    const sphere = makeSphere(1);
    const result = booleanSubtract(box.solid, sphere.solid);
    expect(result.success).toBe(true);

    const faces = shellFaces(result.result!.solid.outerShell);

    const builder = createStepModelBuilder();
    solidToStep(result.result!.solid, builder);
    const stepText = writeStep(builder.build());

    // Count ADVANCED_FACE entries — should match shell face count
    const faceMatches = stepText.match(/ADVANCED_FACE/g) || [];
    expect(faceMatches.length).toBe(faces.length);
  });
});
