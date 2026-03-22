import { describe, it, expect } from 'vitest';
import { writeStep } from '../../src/io/step-writer';
import { parseStep } from '../../src/io/step-parser';
import { type StepModel, type StepEntity, defaultHeader } from '../../src/io/step-model';

function makeModel(entities: StepEntity[]): StepModel {
  const map = new Map<number, StepEntity>();
  for (const e of entities) map.set(e.id, e);
  return { header: defaultHeader({ fileName: 'test.stp' }), entities: map };
}

describe('writeStep', () => {
  it('produces valid ISO-10303-21 structure', () => {
    const model = makeModel([]);
    const text = writeStep(model);
    expect(text).toContain('ISO-10303-21;');
    expect(text).toContain('HEADER;');
    expect(text).toContain('ENDSEC;');
    expect(text).toContain('DATA;');
    expect(text).toContain('END-ISO-10303-21;');
  });

  it('writes header metadata', () => {
    const model = makeModel([]);
    const text = writeStep(model);
    expect(text).toContain("FILE_NAME('test.stp'");
    expect(text).toContain('FILE_SCHEMA');
  });

  it('writes a CARTESIAN_POINT entity', () => {
    const model = makeModel([{
      id: 1,
      typeName: 'CARTESIAN_POINT',
      attributes: [
        { type: 'string', value: 'origin' },
        { type: 'list', values: [
          { type: 'real', value: 0 },
          { type: 'real', value: 0 },
          { type: 'real', value: 0 },
        ]},
      ],
    }]);
    const text = writeStep(model);
    expect(text).toContain("#1 = CARTESIAN_POINT('origin', (0., 0., 0.));");
  });

  it('writes entity references', () => {
    const model = makeModel([
      { id: 1, typeName: 'CARTESIAN_POINT', attributes: [
        { type: 'string', value: '' },
        { type: 'list', values: [
          { type: 'real', value: 1 },
          { type: 'real', value: 2 },
          { type: 'real', value: 3 },
        ]},
      ]},
      { id: 2, typeName: 'VERTEX_POINT', attributes: [
        { type: 'string', value: '' },
        { type: 'ref', id: 1 },
      ]},
    ]);
    const text = writeStep(model);
    expect(text).toContain("#2 = VERTEX_POINT('', #1);");
  });

  it('writes enum values', () => {
    const model = makeModel([{
      id: 5,
      typeName: 'EDGE_CURVE',
      attributes: [
        { type: 'string', value: '' },
        { type: 'ref', id: 3 },
        { type: 'ref', id: 4 },
        { type: 'ref', id: 10 },
        { type: 'enum', value: 'T' },
      ],
    }]);
    const text = writeStep(model);
    expect(text).toContain("#5 = EDGE_CURVE('', #3, #4, #10, .T.);");
  });

  it('writes unset ($) values', () => {
    const model = makeModel([{
      id: 1,
      typeName: 'TEST',
      attributes: [{ type: 'unset' }],
    }]);
    const text = writeStep(model);
    expect(text).toContain('#1 = TEST($);');
  });

  it('round-trips through parse', () => {
    const model = makeModel([
      { id: 1, typeName: 'CARTESIAN_POINT', attributes: [
        { type: 'string', value: 'pt' },
        { type: 'list', values: [
          { type: 'real', value: 1.5 },
          { type: 'real', value: -2.3 },
          { type: 'real', value: 0 },
        ]},
      ]},
      { id: 2, typeName: 'DIRECTION', attributes: [
        { type: 'string', value: '' },
        { type: 'list', values: [
          { type: 'real', value: 0 },
          { type: 'real', value: 0 },
          { type: 'real', value: 1 },
        ]},
      ]},
    ]);

    const text = writeStep(model);
    const parsed = parseStep(text);
    expect(parsed.success).toBe(true);
    expect(parsed.result!.entities.size).toBe(2);

    const pt = parsed.result!.entities.get(1)!;
    expect(pt.typeName).toBe('CARTESIAN_POINT');
    const coords = pt.attributes[1];
    if (coords.type === 'list') {
      expect(coords.values[0]).toEqual({ type: 'real', value: 1.5 });
      expect(coords.values[1]).toEqual({ type: 'real', value: -2.3 });
    }
  });
});
