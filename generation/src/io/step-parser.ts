import { OperationResult, success, failure } from '../mesh/mesh';
import { tokenize, type Token } from './step-lexer';
import { type StepModel, type StepEntity, type StepValue, type StepHeader, defaultHeader } from './step-model';

/**
 * Parse a STEP file string into a StepModel.
 *
 * Handles any valid ISO-10303-21 file. Extracts the header metadata
 * and all entities in the DATA section into an id-indexed map.
 *
 * @param text - STEP file content
 * @returns Parsed model or failure
 */
export function parseStep(text: string): OperationResult<StepModel> {
  if (!text || text.trim().length === 0) {
    return failure('Empty STEP input');
  }

  const tokens = tokenize(text);
  let pos = 0;

  function peek(): Token {
    return tokens[pos] ?? { type: 'EOF' };
  }

  function advance(): Token {
    return tokens[pos++];
  }

  function expect(type: Token['type']): Token {
    const t = advance();
    if (t.type !== type) {
      throw new Error(`Expected ${type}, got ${t.type}`);
    }
    return t;
  }

  function skipTo(type: Token['type'], value?: string): void {
    while (pos < tokens.length) {
      const t = peek();
      if (t.type === type && (value === undefined || ('value' in t && t.value === value))) return;
      if (t.type === 'EOF') return;
      advance();
    }
  }

  try {
    // Skip to HEADER
    skipTo('KEYWORD', 'HEADER');
    if (peek().type === 'EOF') {
      return failure('No HEADER section found');
    }
    advance(); // HEADER
    expect('SEMICOLON');

    // Parse header entities
    const header = parseHeader();

    // Skip to DATA
    skipTo('KEYWORD', 'DATA');
    if (peek().type === 'EOF') {
      return failure('No DATA section found');
    }
    advance(); // DATA
    expect('SEMICOLON');

    // Parse entities
    const entities = new Map<number, StepEntity>();
    while (pos < tokens.length) {
      const t = peek();
      if (t.type === 'KEYWORD' && t.value === 'ENDSEC') break;
      if (t.type === 'EOF') break;
      if (t.type === 'ENTITY_ID') {
        const entity = parseEntity();
        if (entity) {
          entities.set(entity.id, entity);
        }
      } else {
        advance(); // skip unexpected tokens
      }
    }

    return success({ header, entities });
  } catch (e: any) {
    return failure(`STEP parse error: ${e.message}`);
  }

  function parseHeader(): StepHeader {
    // Use a mutable object for building, then return as readonly
    const h: {
      description: string[];
      implementationLevel: string;
      fileName: string;
      timeStamp: string;
      author: string[];
      organization: string[];
      preprocessorVersion: string;
      originatingSystem: string;
      authorization: string;
      schemaIdentifiers: string[];
    } = {
      description: [],
      implementationLevel: '',
      fileName: '',
      timeStamp: '',
      author: [],
      organization: [],
      preprocessorVersion: '',
      originatingSystem: '',
      authorization: '',
      schemaIdentifiers: [],
    };

    while (pos < tokens.length) {
      const t = peek();
      if (t.type === 'KEYWORD' && t.value === 'ENDSEC') {
        advance();
        expect('SEMICOLON');
        break;
      }
      if (t.type === 'EOF') break;

      if (t.type === 'KEYWORD') {
        const name = t.value;
        advance();
        if (peek().type === 'LPAREN') {
          const attrs = parseAttributeList();
          expect('SEMICOLON');

          if (name === 'FILE_DESCRIPTION') {
            if (attrs[0]?.type === 'list') {
              h.description = attrs[0].values
                .filter((v): v is { type: 'string'; value: string } => v.type === 'string')
                .map(v => v.value);
            }
            if (attrs[1]?.type === 'string') {
              h.implementationLevel = attrs[1].value;
            }
          } else if (name === 'FILE_NAME') {
            const strs = attrs
              .filter((v): v is { type: 'string'; value: string } => v.type === 'string')
              .map(v => v.value);
            if (strs.length >= 1) h.fileName = strs[0];
            if (strs.length >= 2) h.timeStamp = strs[1];
            // Extract author/org from list attrs
            const lists = attrs.filter((v): v is { type: 'list'; values: StepValue[] } => v.type === 'list');
            if (lists.length >= 1) {
              h.author = lists[0].values
                .filter((v): v is { type: 'string'; value: string } => v.type === 'string')
                .map(v => v.value);
            }
            if (lists.length >= 2) {
              h.organization = lists[1].values
                .filter((v): v is { type: 'string'; value: string } => v.type === 'string')
                .map(v => v.value);
            }
          } else if (name === 'FILE_SCHEMA') {
            if (attrs[0]?.type === 'list') {
              h.schemaIdentifiers = attrs[0].values
                .filter((v): v is { type: 'string'; value: string } => v.type === 'string')
                .map(v => v.value);
            }
          }
        } else {
          // skip keyword without parens
        }
      } else {
        advance();
      }
    }

    return defaultHeader(h);
  }

  function parseEntity(): StepEntity | null {
    const idToken = advance(); // ENTITY_ID
    if (idToken.type !== 'ENTITY_ID') return null;
    const id = idToken.value;

    expect('EQUALS');

    const typeToken = advance();
    if (typeToken.type !== 'KEYWORD') return null;
    const typeName = typeToken.value;

    const attributes = parseAttributeList();
    expect('SEMICOLON');

    return { id, typeName, attributes };
  }

  function parseAttributeList(): StepValue[] {
    expect('LPAREN');
    const values: StepValue[] = [];

    if (peek().type === 'RPAREN') {
      advance();
      return values;
    }

    values.push(parseValue());
    while (peek().type === 'COMMA') {
      advance(); // skip comma
      values.push(parseValue());
    }

    expect('RPAREN');
    return values;
  }

  function parseValue(): StepValue {
    const t = peek();

    switch (t.type) {
      case 'INTEGER':
        advance();
        return { type: 'integer', value: t.value };
      case 'REAL':
        advance();
        return { type: 'real', value: t.value };
      case 'STRING':
        advance();
        return { type: 'string', value: t.value };
      case 'ENUM':
        advance();
        return { type: 'enum', value: t.value };
      case 'ENTITY_ID':
        advance();
        return { type: 'ref', id: t.value };
      case 'UNSET':
        advance();
        return { type: 'unset' };
      case 'DERIVED':
        advance();
        return { type: 'derived' };
      case 'LPAREN':
        return parseListValue();
      default:
        advance();
        return { type: 'unset' }; // graceful fallback
    }
  }

  function parseListValue(): StepValue {
    expect('LPAREN');
    const values: StepValue[] = [];

    if (peek().type === 'RPAREN') {
      advance();
      return { type: 'list', values };
    }

    values.push(parseValue());
    while (peek().type === 'COMMA') {
      advance();
      values.push(parseValue());
    }

    expect('RPAREN');
    return { type: 'list', values };
  }
}
