import { describe, it, expect } from 'vitest';
import { point3d, XY_PLANE, XZ_PLANE, plane, vec3d } from '../../src/core';
import { makeLine3D, makeCircle3D, makeArc3D } from '../../src/geometry';
import {
  createStepModelBuilder,
  parseStep,
  writeStep,
} from '../../src/io';

import {
  line3DToStep,
  stepToLine3D,
  circle3DToStep,
  stepToCircle3D,
  arc3DToStep,
  stepToArc3D,
} from '../../src/io/step-converters-3d';

describe('STEP Converters - 3D Curves', () => {
  describe('Line3D', () => {
    it('converts Line3D to STEP LINE entity', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0)).result!;
      const builder = createStepModelBuilder();

      const entities = line3DToStep(line, builder);

      // Should create: CARTESIAN_POINT, DIRECTION, VECTOR, LINE
      expect(entities.length).toBeGreaterThanOrEqual(4);
      const lineEntity = entities.find(e => e.typeName === 'LINE');
      expect(lineEntity).toBeDefined();
    });

    it('round-trips Line3D through STEP', () => {
      const original = makeLine3D(point3d(1, 2, 3), point3d(4, 5, 6)).result!;
      const builder = createStepModelBuilder();
      line3DToStep(original, builder);

      const stepText = writeStep(builder.build());
      const parsed = parseStep(stepText);
      expect(parsed.success).toBe(true);

      // Find the LINE entity
      const lineEntity = Array.from(parsed.result!.entities.values())
        .find(e => e.typeName === 'LINE');
      expect(lineEntity).toBeDefined();

      const recovered = stepToLine3D(lineEntity!, parsed.result!);
      expect(recovered.success).toBe(true);

      expect(recovered.result!.startPoint.x).toBeCloseTo(original.startPoint.x, 5);
      expect(recovered.result!.startPoint.y).toBeCloseTo(original.startPoint.y, 5);
      expect(recovered.result!.startPoint.z).toBeCloseTo(original.startPoint.z, 5);
    });
  });

  describe('Circle3D', () => {
    it('converts Circle3D to STEP CIRCLE entity', () => {
      const circle = makeCircle3D(XY_PLANE, 2.5).result!;
      const builder = createStepModelBuilder();

      const entities = circle3DToStep(circle, builder);

      const circleEntity = entities.find(e => e.typeName === 'CIRCLE');
      expect(circleEntity).toBeDefined();
    });

    it('round-trips Circle3D through STEP', () => {
      const original = makeCircle3D(XY_PLANE, 1.5).result!;
      const builder = createStepModelBuilder();
      circle3DToStep(original, builder);

      const stepText = writeStep(builder.build());
      const parsed = parseStep(stepText);
      expect(parsed.success).toBe(true);

      const circleEntity = Array.from(parsed.result!.entities.values())
        .find(e => e.typeName === 'CIRCLE');
      expect(circleEntity).toBeDefined();

      const recovered = stepToCircle3D(circleEntity!, parsed.result!);
      expect(recovered.success).toBe(true);

      expect(recovered.result!.radius).toBeCloseTo(original.radius, 5);
    });
  });

  describe('Arc3D', () => {
    it('converts Arc3D to STEP TRIMMED_CURVE entity', () => {
      const arc = makeArc3D(XY_PLANE, 2, 0, Math.PI / 2).result!;
      const builder = createStepModelBuilder();

      const entities = arc3DToStep(arc, builder);

      const trimmedEntity = entities.find(e => e.typeName === 'TRIMMED_CURVE');
      expect(trimmedEntity).toBeDefined();
    });

    it('round-trips Arc3D through STEP', () => {
      const original = makeArc3D(XY_PLANE, 2, 0, Math.PI).result!;
      const builder = createStepModelBuilder();
      arc3DToStep(original, builder);

      const stepText = writeStep(builder.build());
      const parsed = parseStep(stepText);
      expect(parsed.success).toBe(true);

      const trimmedEntity = Array.from(parsed.result!.entities.values())
        .find(e => e.typeName === 'TRIMMED_CURVE');
      expect(trimmedEntity).toBeDefined();

      const recovered = stepToArc3D(trimmedEntity!, parsed.result!);
      expect(recovered.success).toBe(true);

      expect(recovered.result!.radius).toBeCloseTo(original.radius, 5);
      expect(recovered.result!.startAngle).toBeCloseTo(original.startAngle, 5);
      expect(recovered.result!.endAngle).toBeCloseTo(original.endAngle, 5);
    });
  });
});
