/**
 * Parameter system for parametric constraints.
 *
 * Supports named parameters with numeric values and simple expressions
 * like "width * 2" or "height + 10".
 *
 * @module constraints/parameter
 */

import { Parameter, ParameterRef } from './types';

let nextParameterId = 1;

// =============================================================================
// Token Types for Expression Parsing
// =============================================================================

type TokenType = 'number' | 'identifier' | 'operator' | 'paren' | 'end';

interface Token {
  type: TokenType;
  value: string | number;
}

// =============================================================================
// Lexer
// =============================================================================

/**
 * Tokenize an expression string.
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Numbers (including decimals)
    if (/[0-9.]/.test(char)) {
      let numStr = '';
      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        numStr += expression[i];
        i++;
      }
      const num = parseFloat(numStr);
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${numStr}`);
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Identifiers (parameter names)
    if (/[a-zA-Z_]/.test(char)) {
      let id = '';
      while (i < expression.length && /[a-zA-Z0-9_]/.test(expression[i])) {
        id += expression[i];
        i++;
      }
      tokens.push({ type: 'identifier', value: id });
      continue;
    }

    // Operators
    if (/[+\-*/^]/.test(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    // Parentheses
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  tokens.push({ type: 'end', value: '' });
  return tokens;
}

// =============================================================================
// Recursive Descent Parser
// =============================================================================

interface ParseContext {
  tokens: Token[];
  pos: number;
  parameters: Map<string, Parameter>;
}

function currentToken(ctx: ParseContext): Token {
  return ctx.tokens[ctx.pos];
}

function consume(ctx: ParseContext): Token {
  return ctx.tokens[ctx.pos++];
}

function expect(ctx: ParseContext, type: TokenType, value?: string | number): Token {
  const token = currentToken(ctx);
  if (token.type !== type || (value !== undefined && token.value !== value)) {
    throw new Error(`Expected ${type}${value !== undefined ? ` '${value}'` : ''}, got ${token.type} '${token.value}'`);
  }
  return consume(ctx);
}

// Expression grammar:
// expr     -> term (('+' | '-') term)*
// term     -> power (('*' | '/') power)*
// power    -> unary ('^' power)?
// unary    -> '-' unary | primary
// primary  -> NUMBER | IDENTIFIER | '(' expr ')'

function parseExpression(ctx: ParseContext): number {
  let left = parseTerm(ctx);

  while (currentToken(ctx).type === 'operator' &&
    (currentToken(ctx).value === '+' || currentToken(ctx).value === '-')) {
    const op = consume(ctx).value as string;
    const right = parseTerm(ctx);
    left = op === '+' ? left + right : left - right;
  }

  return left;
}

function parseTerm(ctx: ParseContext): number {
  let left = parsePower(ctx);

  while (currentToken(ctx).type === 'operator' &&
    (currentToken(ctx).value === '*' || currentToken(ctx).value === '/')) {
    const op = consume(ctx).value as string;
    const right = parsePower(ctx);
    if (op === '/') {
      if (right === 0) {
        throw new Error('Division by zero');
      }
      left = left / right;
    } else {
      left = left * right;
    }
  }

  return left;
}

function parsePower(ctx: ParseContext): number {
  const base = parseUnary(ctx);

  if (currentToken(ctx).type === 'operator' && currentToken(ctx).value === '^') {
    consume(ctx);
    const exp = parsePower(ctx); // Right-associative
    return Math.pow(base, exp);
  }

  return base;
}

function parseUnary(ctx: ParseContext): number {
  if (currentToken(ctx).type === 'operator' && currentToken(ctx).value === '-') {
    consume(ctx);
    return -parseUnary(ctx);
  }
  return parsePrimary(ctx);
}

function parsePrimary(ctx: ParseContext): number {
  const token = currentToken(ctx);

  if (token.type === 'number') {
    consume(ctx);
    return token.value as number;
  }

  if (token.type === 'identifier') {
    consume(ctx);
    const name = token.value as string;

    // Look up parameter by name
    const param = findParameterByName(ctx.parameters, name);
    if (!param) {
      throw new Error(`Unknown parameter: ${name}`);
    }
    return param.value;
  }

  if (token.type === 'paren' && token.value === '(') {
    consume(ctx);
    const value = parseExpression(ctx);
    expect(ctx, 'paren', ')');
    return value;
  }

  throw new Error(`Unexpected token: ${token.type} '${token.value}'`);
}

function findParameterByName(parameters: Map<string, Parameter>, name: string): Parameter | undefined {
  for (const param of Array.from(parameters.values())) {
    if (param.name === name) {
      return param;
    }
  }
  return undefined;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a new parameter.
 *
 * @param name - Human-readable name for the parameter
 * @param value - Initial numeric value
 * @param expression - Optional expression (e.g., "width * 2")
 * @returns A new Parameter object
 */
export function createParameter(
  name: string,
  value: number,
  expression?: string,
): Parameter {
  return {
    id: `param_${nextParameterId++}`,
    name,
    value,
    expression,
  };
}

/**
 * Evaluate a parameter expression in the context of other parameters.
 *
 * @param expression - The expression to evaluate (e.g., "width * 2 + 10")
 * @param parameters - Map of parameter ID to Parameter
 * @returns The evaluated numeric result
 * @throws Error if expression is invalid or references unknown parameters
 */
export function evaluateExpression(
  expression: string,
  parameters: Map<string, Parameter>,
): number {
  const tokens = tokenize(expression);
  const ctx: ParseContext = { tokens, pos: 0, parameters };
  const result = parseExpression(ctx);

  // Ensure we consumed all tokens (except 'end')
  if (currentToken(ctx).type !== 'end') {
    throw new Error(`Unexpected token after expression: ${currentToken(ctx).value}`);
  }

  return result;
}

/**
 * Get the value of a constraint dimension (number or parameter reference).
 *
 * @param value - Either a number or a ParameterRef
 * @param parameters - Map of parameter ID to Parameter
 * @returns The numeric value
 */
export function resolveValue(
  value: number | ParameterRef,
  parameters: Map<string, Parameter>,
): number {
  if (typeof value === 'number') {
    return value;
  }

  const param = parameters.get(value.parameterId);
  if (!param) {
    throw new Error(`Unknown parameter: ${value.parameterId}`);
  }
  return param.value;
}

/**
 * Extract parameter names referenced in an expression.
 *
 * @param expression - The expression to analyze
 * @returns Array of parameter names found in the expression
 */
export function extractParameterNames(expression: string): string[] {
  const names: string[] = [];
  const tokens = tokenize(expression);

  for (const token of tokens) {
    if (token.type === 'identifier') {
      const name = token.value as string;
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }

  return names;
}

/**
 * Get all parameters that a given parameter depends on (through its expression).
 *
 * @param parameter - The parameter to analyze
 * @param parameters - Map of parameter ID to Parameter
 * @returns Array of parameter IDs that this parameter depends on
 */
export function getParameterDependencies(
  parameter: Parameter,
  parameters: Map<string, Parameter>,
): string[] {
  if (!parameter.expression) {
    return [];
  }

  const names = extractParameterNames(parameter.expression);
  const deps: string[] = [];

  for (const name of names) {
    const param = findParameterByName(parameters, name);
    if (param) {
      // Include all dependencies, including self-references
      // Self-references are circular dependencies
      deps.push(param.id);
    }
  }

  return deps;
}

/**
 * Detect circular dependencies in parameter expressions.
 *
 * @param parameters - Map of parameter ID to Parameter
 * @returns Array of parameter IDs involved in circular dependencies (empty if none)
 */
export function detectCircularDependencies(
  parameters: Map<string, Parameter>,
): string[] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const circular: string[] = [];

  function dfs(paramId: string): boolean {
    if (inStack.has(paramId)) {
      return true; // Cycle detected
    }
    if (visited.has(paramId)) {
      return false;
    }

    visited.add(paramId);
    inStack.add(paramId);

    const param = parameters.get(paramId);
    if (param) {
      const deps = getParameterDependencies(param, parameters);
      for (const depId of deps) {
        if (dfs(depId)) {
          circular.push(paramId);
          return true;
        }
      }
    }

    inStack.delete(paramId);
    return false;
  }

  for (const paramId of Array.from(parameters.keys())) {
    visited.clear();
    inStack.clear();
    if (dfs(paramId)) {
      if (!circular.includes(paramId)) {
        circular.push(paramId);
      }
    }
  }

  return circular;
}

/**
 * Update parameters that have expressions, evaluating them in dependency order.
 *
 * @param parameters - Map of parameter ID to Parameter (modified in place)
 * @throws Error if circular dependencies exist
 */
export function updateDependentParameters(
  parameters: Map<string, Parameter>,
): void {
  const circular = detectCircularDependencies(parameters);
  if (circular.length > 0) {
    throw new Error(`Circular dependency detected involving: ${circular.join(', ')}`);
  }

  // Topological sort to determine evaluation order
  const evaluated = new Set<string>();
  const order: string[] = [];

  function visit(paramId: string): void {
    if (evaluated.has(paramId)) return;

    const param = parameters.get(paramId);
    if (!param) return;

    // First visit all dependencies
    const deps = getParameterDependencies(param, parameters);
    for (const depId of deps) {
      visit(depId);
    }

    evaluated.add(paramId);
    order.push(paramId);
  }

  for (const paramId of Array.from(parameters.keys())) {
    visit(paramId);
  }

  // Evaluate in order
  for (const paramId of order) {
    const param = parameters.get(paramId);
    if (param?.expression) {
      param.value = evaluateExpression(param.expression, parameters);
    }
  }
}

/**
 * Create a ParameterRef from a parameter.
 */
export function paramRef(param: Parameter): ParameterRef {
  return { parameterId: param.id };
}
