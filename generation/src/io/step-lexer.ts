/**
 * Token types produced by the STEP lexer.
 */
export type Token =
  | { type: 'ENTITY_ID'; value: number }
  | { type: 'INTEGER'; value: number }
  | { type: 'REAL'; value: number }
  | { type: 'STRING'; value: string }
  | { type: 'ENUM'; value: string }
  | { type: 'KEYWORD'; value: string }
  | { type: 'UNSET' }
  | { type: 'DERIVED' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' }
  | { type: 'SEMICOLON' }
  | { type: 'EQUALS' }
  | { type: 'EOF' }
  ;

/**
 * Tokenize a STEP file string into an array of tokens.
 *
 * Handles: entity IDs (#N), integers, reals (with scientific notation),
 * strings ('...'), enums (.NAME.), keywords, punctuation, comments, and whitespace.
 *
 * @param input - STEP file text
 * @returns Array of tokens ending with EOF
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    // Skip whitespace
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    // Skip comments /* ... */
    if (input[pos] === '/' && pos + 1 < len && input[pos + 1] === '*') {
      pos += 2;
      while (pos < len - 1 && !(input[pos] === '*' && input[pos + 1] === '/')) {
        pos++;
      }
      pos += 2; // skip */
      continue;
    }

    // Entity ID: #NNN
    if (input[pos] === '#') {
      pos++;
      let numStr = '';
      while (pos < len && /\d/.test(input[pos])) {
        numStr += input[pos++];
      }
      tokens.push({ type: 'ENTITY_ID', value: parseInt(numStr, 10) });
      continue;
    }

    // String: '...'
    if (input[pos] === "'") {
      pos++;
      let str = '';
      while (pos < len && input[pos] !== "'") {
        str += input[pos++];
      }
      pos++; // skip closing '
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Enum: .NAME.
    if (input[pos] === '.' && pos + 1 < len && /[A-Za-z]/.test(input[pos + 1])) {
      pos++;
      let name = '';
      while (pos < len && input[pos] !== '.') {
        name += input[pos++];
      }
      pos++; // skip closing .
      tokens.push({ type: 'ENUM', value: name });
      continue;
    }

    // Number (integer or real, possibly negative)
    if (/[\d]/.test(input[pos]) || (input[pos] === '-' && pos + 1 < len && /[\d]/.test(input[pos + 1]))) {
      let numStr = '';
      if (input[pos] === '-') {
        numStr += '-';
        pos++;
      }
      while (pos < len && /\d/.test(input[pos])) {
        numStr += input[pos++];
      }
      if (pos < len && input[pos] === '.') {
        // Real number
        numStr += '.';
        pos++;
        while (pos < len && /\d/.test(input[pos])) {
          numStr += input[pos++];
        }
        // Scientific notation
        if (pos < len && (input[pos] === 'E' || input[pos] === 'e')) {
          numStr += 'E';
          pos++;
          if (pos < len && (input[pos] === '+' || input[pos] === '-')) {
            numStr += input[pos++];
          }
          while (pos < len && /\d/.test(input[pos])) {
            numStr += input[pos++];
          }
        }
        tokens.push({ type: 'REAL', value: parseFloat(numStr) });
      } else {
        tokens.push({ type: 'INTEGER', value: parseInt(numStr, 10) });
      }
      continue;
    }

    // Unset: $
    if (input[pos] === '$') {
      tokens.push({ type: 'UNSET' });
      pos++;
      continue;
    }

    // Derived: *
    if (input[pos] === '*') {
      tokens.push({ type: 'DERIVED' });
      pos++;
      continue;
    }

    // Punctuation
    if (input[pos] === '(') { tokens.push({ type: 'LPAREN' }); pos++; continue; }
    if (input[pos] === ')') { tokens.push({ type: 'RPAREN' }); pos++; continue; }
    if (input[pos] === ',') { tokens.push({ type: 'COMMA' }); pos++; continue; }
    if (input[pos] === ';') { tokens.push({ type: 'SEMICOLON' }); pos++; continue; }
    if (input[pos] === '=') { tokens.push({ type: 'EQUALS' }); pos++; continue; }

    // Keyword / type name: letters, digits, underscore, hyphen
    if (/[A-Za-z_]/.test(input[pos])) {
      let word = '';
      while (pos < len && /[A-Za-z0-9_-]/.test(input[pos])) {
        word += input[pos++];
      }
      tokens.push({ type: 'KEYWORD', value: word });
      continue;
    }

    // Unknown character — skip
    pos++;
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}
