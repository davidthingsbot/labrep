import { describe, it, expect } from 'vitest';
import {
  point3DToStep, stepToPoint3D,
  vector3DToStep, stepToVector3D,
  axisToStep, stepToAxis,
  planeToStep, stepToPlane,
  extractFoundationTypes,
} from '../../src/io/step-converters';
import { createStepModelBuilder } from '../../src/io/step-model-builder';
import { parseStep } from '../../src/io/step-parser';
import { writeStep } from '../../src/io/step-writer';
import { point3d, vec3d, axis, plane, ORIGIN, X_AXIS, Y_AXIS, Z_AXIS, XY_PLANE } from '../../src/core';

describe('stepToPoint3D', () => {
  it('converts CARTESIAN_POINT to Point3D', () => {
    const entity = {
      id: 1,
      typeName: 'CARTESIAN_POINT',
      attributes: [
        { type: 'string' as const, value: '' },
        { type: 'list' as const, values: [
          { type: 'real' as const, value: 1.5 },
          { type: 'real' as const, value: -2.3 },
          { type: 'real' as const, value: 0.7 },
        ]},
      ],
    };
    const result = stepToPoint3D(entity);
    expect(result.success).toBe(true);
    expect(result.result!.x).toBeCloseTo(1.5);
    expect(result.result!.y).toBeCloseTo(-2.3);
    expect(result.result!.z).toBeCloseTo(0.7);
  });

  it('rejects non-CARTESIAN_POINT entity', () => {
    const entity = { id: 1, typeName: 'DIRECTION', attributes: [] };
    const result = stepToPoint3D(entity);
    expect(result.success).toBe(false);
  });
});

describe('point3DToStep', () => {
  it('creates correct STEP entity', () => {
    const entity = point3DToStep(point3d(1, 2, 3), 1);
    expect(entity.id).toBe(1);
    expect(entity.typeName).toBe('CARTESIAN_POINT');
    expect(entity.attributes[1]).toEqual({
      type: 'list',
      values: [
        { type: 'real', value: 1 },
        { type: 'real', value: 2 },
        { type: 'real', value: 3 },
      ],
    });
  });
});

describe('stepToVector3D', () => {
  it('converts DIRECTION to normalized Vector3D', () => {
    const entity = {
      id: 2,
      typeName: 'DIRECTION',
      attributes: [
        { type: 'string' as const, value: '' },
        { type: 'list' as const, values: [
          { type: 'real' as const, value: 0 },
          { type: 'real' as const, value: 0 },
          { type: 'real' as const, value: 1 },
        ]},
      ],
    };
    const result = stepToVector3D(entity);
    expect(result.success).toBe(true);
    expect(result.result!.z).toBeCloseTo(1);
  });
});

describe('vector3DToStep', () => {
  it('creates correct DIRECTION entity', () => {
    const entity = vector3DToStep(vec3d(0, 1, 0), 5);
    expect(entity.typeName).toBe('DIRECTION');
    expect(entity.id).toBe(5);
  });
});

describe('axisToStep / stepToAxis', () => {
  it('round-trips an axis through STEP entities', () => {
    const ax = axis(point3d(1, 2, 3), vec3d(0, 0, 1));
    const builder = createStepModelBuilder();
    const entities = axisToStep(ax, builder);
    expect(entities.length).toBeGreaterThanOrEqual(2); // point + direction + axis1

    const model = builder.build();
    const text = writeStep(model);
    const parsed = parseStep(text).result!;

    // Find the AXIS1_PLACEMENT entity
    const ax1Entity = [...parsed.entities.values()].find(e => e.typeName === 'AXIS1_PLACEMENT');
    expect(ax1Entity).toBeDefined();

    const result = stepToAxis(ax1Entity!, parsed);
    expect(result.success).toBe(true);
    expect(result.result!.origin.x).toBeCloseTo(1);
    expect(result.result!.origin.y).toBeCloseTo(2);
    expect(result.result!.origin.z).toBeCloseTo(3);
    expect(result.result!.direction.z).toBeCloseTo(1);
  });
});

describe('planeToStep / stepToPlane', () => {
  it('round-trips a plane through STEP entities', () => {
    const pl = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const builder = createStepModelBuilder();
    planeToStep(pl, builder);

    const model = builder.build();
    const text = writeStep(model);
    const parsed = parseStep(text).result!;

    const ax2Entity = [...parsed.entities.values()].find(e => e.typeName === 'AXIS2_PLACEMENT_3D');
    expect(ax2Entity).toBeDefined();

    const result = stepToPlane(ax2Entity!, parsed);
    expect(result.success).toBe(true);
    expect(result.result!.normal.z).toBeCloseTo(1);
    expect(result.result!.xAxis.x).toBeCloseTo(1);
  });

  it('round-trips XY_PLANE', () => {
    const builder = createStepModelBuilder();
    planeToStep(XY_PLANE, builder);

    const model = builder.build();
    const text = writeStep(model);
    const parsed = parseStep(text).result!;

    const ax2Entity = [...parsed.entities.values()].find(e => e.typeName === 'AXIS2_PLACEMENT_3D');
    const result = stepToPlane(ax2Entity!, parsed);
    expect(result.success).toBe(true);
    expect(result.result!.origin.x).toBeCloseTo(0);
    expect(result.result!.origin.y).toBeCloseTo(0);
    expect(result.result!.origin.z).toBeCloseTo(0);
    expect(result.result!.normal.z).toBeCloseTo(1);
    expect(result.result!.xAxis.x).toBeCloseTo(1);
  });
});

describe('extractFoundationTypes', () => {
  it('extracts points, directions, axes, and planes from a STEP model', () => {
    const step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('origin', (0., 0., 0.));
#2 = CARTESIAN_POINT('p1', (1., 2., 3.));
#3 = DIRECTION('up', (0., 0., 1.));
#4 = DIRECTION('right', (1., 0., 0.));
#5 = AXIS2_PLACEMENT_3D('', #1, #3, #4);
ENDSEC;
END-ISO-10303-21;`;

    const model = parseStep(step).result!;
    const result = extractFoundationTypes(model);

    expect(result.points.size).toBe(2);
    expect(result.directions.size).toBe(2);
    expect(result.planes.size).toBe(1);

    const origin = result.points.get(1)!;
    expect(origin.x).toBeCloseTo(0);
    expect(origin.y).toBeCloseTo(0);
    expect(origin.z).toBeCloseTo(0);

    const p1 = result.points.get(2)!;
    expect(p1.x).toBeCloseTo(1);

    const plane = result.planes.get(5)!;
    expect(plane.normal.z).toBeCloseTo(1);
  });
});
