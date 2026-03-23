import { type StepModel, type StepValue, type StepEntity } from './step-model';

/**
 * Format a real number for STEP output.
 * STEP requires a decimal point (1. not 1, 0. not 0).
 */
function formatReal(v: number): string {
  const s = String(v);
  if (s.includes('.') || s.includes('e') || s.includes('E')) return s;
  return s + '.';
}

/**
 * Format a single StepValue for text output.
 */
function formatValue(v: StepValue): string {
  switch (v.type) {
    case 'integer': return String(v.value);
    case 'real': return formatReal(v.value);
    case 'string': return `'${v.value}'`;
    case 'enum': return `.${v.value}.`;
    case 'ref': return `#${v.id}`;
    case 'list': return `(${v.values.map(formatValue).join(', ')})`;
    case 'unset': return '$';
    case 'derived': return '*';
  }
}

/**
 * Format a single entity line.
 */
function formatEntity(e: StepEntity): string {
  const attrs = e.attributes.map(formatValue).join(', ');
  return `#${e.id} = ${e.typeName}(${attrs});`;
}

/**
 * Write a StepModel to STEP file text (ISO 10303-21).
 *
 * @param model - The model to serialize
 * @returns STEP file content as a string
 */
export function writeStep(model: StepModel): string {
  const h = model.header;
  const lines: string[] = [];

  lines.push('ISO-10303-21;');
  lines.push('HEADER;');

  // FILE_DESCRIPTION
  const descList = h.description.map(d => `'${d}'`).join(', ');
  lines.push(`FILE_DESCRIPTION((${descList}), '${h.implementationLevel}');`);

  // FILE_NAME
  const authorList = h.author.map(a => `'${a}'`).join(', ');
  const orgList = h.organization.map(o => `'${o}'`).join(', ');
  lines.push(`FILE_NAME('${h.fileName}', '${h.timeStamp}', (${authorList}), (${orgList}), '${h.preprocessorVersion}', '${h.originatingSystem}', '${h.authorization}');`);

  // FILE_SCHEMA
  const schemaList = h.schemaIdentifiers.map(s => `'${s}'`).join(', ');
  lines.push(`FILE_SCHEMA((${schemaList}));`);

  lines.push('ENDSEC;');
  lines.push('DATA;');

  // Sort entities by ID for deterministic output
  const sorted = Array.from(model.entities.values()).sort((a, b) => a.id - b.id);
  for (const entity of sorted) {
    lines.push(formatEntity(entity));
  }

  lines.push('ENDSEC;');
  lines.push('END-ISO-10303-21;');

  return lines.join('\n');
}
