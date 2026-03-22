import { describe, it, expect } from 'vitest';
import { tokenize, type Token } from '../../src/io/step-lexer';

describe('step lexer', () => {
  it('tokenizes entity id', () => {
    const tokens = tokenize('#1');
    expect(tokens).toContainEqual({ type: 'ENTITY_ID', value: 1 });
  });

  it('tokenizes integer', () => {
    const tokens = tokenize('42');
    expect(tokens).toContainEqual({ type: 'INTEGER', value: 42 });
  });

  it('tokenizes negative integer', () => {
    const tokens = tokenize('-5');
    expect(tokens).toContainEqual({ type: 'INTEGER', value: -5 });
  });

  it('tokenizes real number', () => {
    const tokens = tokenize('3.14');
    expect(tokens).toContainEqual({ type: 'REAL', value: 3.14 });
  });

  it('tokenizes real with no fractional part', () => {
    const tokens = tokenize('1.');
    expect(tokens).toContainEqual({ type: 'REAL', value: 1.0 });
  });

  it('tokenizes scientific notation', () => {
    const tokens = tokenize('1.5E-3');
    expect(tokens).toContainEqual({ type: 'REAL', value: 0.0015 });
  });

  it('tokenizes negative real', () => {
    const tokens = tokenize('-2.5');
    expect(tokens).toContainEqual({ type: 'REAL', value: -2.5 });
  });

  it('tokenizes string', () => {
    const tokens = tokenize("'hello world'");
    expect(tokens).toContainEqual({ type: 'STRING', value: 'hello world' });
  });

  it('tokenizes empty string', () => {
    const tokens = tokenize("''");
    expect(tokens).toContainEqual({ type: 'STRING', value: '' });
  });

  it('tokenizes enum', () => {
    const tokens = tokenize('.TRUE.');
    expect(tokens).toContainEqual({ type: 'ENUM', value: 'TRUE' });
  });

  it('tokenizes short enums (.T. and .F.)', () => {
    const tokens = tokenize('.T.');
    expect(tokens).toContainEqual({ type: 'ENUM', value: 'T' });
  });

  it('tokenizes keyword/type name', () => {
    const tokens = tokenize('CARTESIAN_POINT');
    expect(tokens).toContainEqual({ type: 'KEYWORD', value: 'CARTESIAN_POINT' });
  });

  it('tokenizes unset ($)', () => {
    const tokens = tokenize('$');
    expect(tokens).toContainEqual({ type: 'UNSET' });
  });

  it('tokenizes derived (*)', () => {
    const tokens = tokenize('*');
    expect(tokens).toContainEqual({ type: 'DERIVED' });
  });

  it('tokenizes punctuation', () => {
    const tokens = tokenize('(,);=');
    const types = tokens.map(t => t.type);
    expect(types).toContain('LPAREN');
    expect(types).toContain('COMMA');
    expect(types).toContain('RPAREN');
    expect(types).toContain('SEMICOLON');
    expect(types).toContain('EQUALS');
  });

  it('skips whitespace', () => {
    const tokens = tokenize('  #1  =  ');
    const nonWs = tokens.filter(t => t.type !== 'EOF');
    expect(nonWs.length).toBe(2); // ENTITY_ID, EQUALS
  });

  it('skips comments', () => {
    const tokens = tokenize('/* comment */ #1');
    expect(tokens).toContainEqual({ type: 'ENTITY_ID', value: 1 });
    expect(tokens.filter(t => t.type === 'ENTITY_ID').length).toBe(1);
  });

  it('tokenizes a full entity line', () => {
    const line = "#1 = CARTESIAN_POINT('origin', (0., 0., 0.));";
    const tokens = tokenize(line);
    const types = tokens.map(t => t.type);
    expect(types).toContain('ENTITY_ID');
    expect(types).toContain('EQUALS');
    expect(types).toContain('KEYWORD');
    expect(types).toContain('LPAREN');
    expect(types).toContain('STRING');
    expect(types).toContain('REAL');
    expect(types).toContain('SEMICOLON');
  });

  it('tokenizes STEP section keywords', () => {
    const tokens = tokenize('ISO-10303-21; HEADER; ENDSEC; DATA; END-ISO-10303-21;');
    const keywords = tokens.filter(t => t.type === 'KEYWORD').map(t => t.value);
    expect(keywords).toContain('ISO-10303-21');
    expect(keywords).toContain('HEADER');
    expect(keywords).toContain('ENDSEC');
    expect(keywords).toContain('DATA');
    expect(keywords).toContain('END-ISO-10303-21');
  });

  it('ends with EOF', () => {
    const tokens = tokenize('#1');
    expect(tokens[tokens.length - 1].type).toBe('EOF');
  });
});
