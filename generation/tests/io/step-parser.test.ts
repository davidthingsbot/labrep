import { describe, it, expect } from 'vitest';
import { parseStep } from '../../src/io/step-parser';

const MINIMAL_STEP = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
ENDSEC;
END-ISO-10303-21;`;

const STEP_WITH_POINT = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('origin', (0., 0., 0.));
ENDSEC;
END-ISO-10303-21;`;

const STEP_WITH_REFS = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('origin', (0., 0., 0.));
#2 = DIRECTION('up', (0., 0., 1.));
#3 = DIRECTION('right', (1., 0., 0.));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
ENDSEC;
END-ISO-10303-21;`;

const STEP_WITH_ENUMS = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0., 0., 0.));
#2 = CARTESIAN_POINT('', (1., 0., 0.));
#3 = VERTEX_POINT('', #1);
#4 = VERTEX_POINT('', #2);
#5 = EDGE_CURVE('', #3, #4, #10, .T.);
ENDSEC;
END-ISO-10303-21;`;

describe('parseStep', () => {
  it('parses a minimal valid STEP file', () => {
    const result = parseStep(MINIMAL_STEP);
    expect(result.success).toBe(true);
    expect(result.result!.entities.size).toBe(0);
  });

  it('extracts header schema', () => {
    const result = parseStep(MINIMAL_STEP);
    expect(result.result!.header.schemaIdentifiers).toContain('AUTOMOTIVE_DESIGN');
  });

  it('extracts header file name', () => {
    const result = parseStep(MINIMAL_STEP);
    expect(result.result!.header.fileName).toBe('test.stp');
  });

  it('parses a CARTESIAN_POINT entity', () => {
    const result = parseStep(STEP_WITH_POINT);
    expect(result.success).toBe(true);
    const entity = result.result!.entities.get(1);
    expect(entity).toBeDefined();
    expect(entity!.typeName).toBe('CARTESIAN_POINT');
    expect(entity!.attributes.length).toBe(2);
    // First attr: string 'origin'
    expect(entity!.attributes[0]).toEqual({ type: 'string', value: 'origin' });
    // Second attr: list of 3 reals
    const list = entity!.attributes[1];
    expect(list.type).toBe('list');
    if (list.type === 'list') {
      expect(list.values.length).toBe(3);
      expect(list.values[0]).toEqual({ type: 'real', value: 0 });
    }
  });

  it('parses entity references', () => {
    const result = parseStep(STEP_WITH_REFS);
    expect(result.success).toBe(true);
    const ax = result.result!.entities.get(4);
    expect(ax).toBeDefined();
    expect(ax!.typeName).toBe('AXIS2_PLACEMENT_3D');
    // Attributes: string, ref, ref, ref
    expect(ax!.attributes[1]).toEqual({ type: 'ref', id: 1 });
    expect(ax!.attributes[2]).toEqual({ type: 'ref', id: 2 });
    expect(ax!.attributes[3]).toEqual({ type: 'ref', id: 3 });
  });

  it('parses enum values', () => {
    const result = parseStep(STEP_WITH_ENUMS);
    expect(result.success).toBe(true);
    const edge = result.result!.entities.get(5);
    expect(edge).toBeDefined();
    expect(edge!.typeName).toBe('EDGE_CURVE');
    // Last attribute is .T.
    const lastAttr = edge!.attributes[edge!.attributes.length - 1];
    expect(lastAttr).toEqual({ type: 'enum', value: 'T' });
  });

  it('parses multiple entities', () => {
    const result = parseStep(STEP_WITH_REFS);
    expect(result.result!.entities.size).toBe(4);
  });

  it('handles forward references', () => {
    // #5 references #10 which doesn't exist yet — parser should still succeed
    const result = parseStep(STEP_WITH_ENUMS);
    expect(result.success).toBe(true);
    const edge = result.result!.entities.get(5);
    expect(edge!.attributes[3]).toEqual({ type: 'ref', id: 10 });
  });

  it('handles multiline entities', () => {
    const step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('',
  (1.,
   2.,
   3.));
ENDSEC;
END-ISO-10303-21;`;
    const result = parseStep(step);
    expect(result.success).toBe(true);
    const pt = result.result!.entities.get(1);
    expect(pt!.typeName).toBe('CARTESIAN_POINT');
    const list = pt!.attributes[1];
    if (list.type === 'list') {
      expect(list.values[0]).toEqual({ type: 'real', value: 1 });
      expect(list.values[1]).toEqual({ type: 'real', value: 2 });
      expect(list.values[2]).toEqual({ type: 'real', value: 3 });
    }
  });

  it('handles comments in DATA section', () => {
    const step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
/* a comment */
#1 = CARTESIAN_POINT('', (0., 0., 0.));
ENDSEC;
END-ISO-10303-21;`;
    const result = parseStep(step);
    expect(result.success).toBe(true);
    expect(result.result!.entities.size).toBe(1);
  });

  it('handles unset ($) attributes', () => {
    const step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''), '2;1');
FILE_NAME('test.stp', '2024-01-01', (''), (''), '', '', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = SOME_ENTITY('name', $, #2);
ENDSEC;
END-ISO-10303-21;`;
    const result = parseStep(step);
    expect(result.success).toBe(true);
    const e = result.result!.entities.get(1);
    expect(e!.attributes[1]).toEqual({ type: 'unset' });
  });

  it('rejects empty input', () => {
    const result = parseStep('');
    expect(result.success).toBe(false);
  });
});
