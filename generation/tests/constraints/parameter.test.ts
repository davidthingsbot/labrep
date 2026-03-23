import { describe, it, expect } from 'vitest';
import {
  createParameter,
  evaluateExpression,
  resolveValue,
  extractParameterNames,
  getParameterDependencies,
  detectCircularDependencies,
  updateDependentParameters,
  paramRef,
} from '../../src/constraints/parameter';
import { Parameter, ParameterRef } from '../../src/constraints/types';

describe('Parameter System', () => {
  describe('createParameter', () => {
    it('creates a parameter with name and value', () => {
      const param = createParameter('width', 10);
      expect(param.name).toBe('width');
      expect(param.value).toBe(10);
      expect(param.id).toMatch(/^param_\d+$/);
      expect(param.expression).toBeUndefined();
    });

    it('creates a parameter with expression', () => {
      const param = createParameter('height', 20, 'width * 2');
      expect(param.name).toBe('height');
      expect(param.value).toBe(20);
      expect(param.expression).toBe('width * 2');
    });

    it('generates unique IDs for each parameter', () => {
      const p1 = createParameter('a', 1);
      const p2 = createParameter('b', 2);
      const p3 = createParameter('c', 3);
      expect(p1.id).not.toBe(p2.id);
      expect(p2.id).not.toBe(p3.id);
      expect(p1.id).not.toBe(p3.id);
    });
  });

  describe('evaluateExpression', () => {
    const createParams = (...params: [string, number][]): Map<string, Parameter> => {
      const map = new Map<string, Parameter>();
      for (const [name, value] of params) {
        const param = createParameter(name, value);
        map.set(param.id, param);
      }
      return map;
    };

    it('evaluates simple numbers', () => {
      const params = createParams();
      expect(evaluateExpression('42', params)).toBe(42);
      expect(evaluateExpression('3.14159', params)).toBeCloseTo(3.14159);
      expect(evaluateExpression('0.001', params)).toBe(0.001);
    });

    it('evaluates basic arithmetic', () => {
      const params = createParams();
      expect(evaluateExpression('2 + 3', params)).toBe(5);
      expect(evaluateExpression('10 - 4', params)).toBe(6);
      expect(evaluateExpression('3 * 4', params)).toBe(12);
      expect(evaluateExpression('15 / 3', params)).toBe(5);
    });

    it('evaluates exponentiation', () => {
      const params = createParams();
      expect(evaluateExpression('2 ^ 3', params)).toBe(8);
      expect(evaluateExpression('3 ^ 2', params)).toBe(9);
      expect(evaluateExpression('2 ^ 0.5', params)).toBeCloseTo(Math.SQRT2);
    });

    it('respects operator precedence', () => {
      const params = createParams();
      expect(evaluateExpression('2 + 3 * 4', params)).toBe(14);
      expect(evaluateExpression('10 - 6 / 2', params)).toBe(7);
      expect(evaluateExpression('2 * 3 ^ 2', params)).toBe(18);
    });

    it('evaluates parenthesized expressions', () => {
      const params = createParams();
      expect(evaluateExpression('(2 + 3) * 4', params)).toBe(20);
      expect(evaluateExpression('((1 + 2) * 3)', params)).toBe(9);
      expect(evaluateExpression('(10 - (6 / 2))', params)).toBe(7);
    });

    it('evaluates unary minus', () => {
      const params = createParams();
      expect(evaluateExpression('-5', params)).toBe(-5);
      expect(evaluateExpression('10 + -3', params)).toBe(7);
      expect(evaluateExpression('-2 * -3', params)).toBe(6);
    });

    it('evaluates parameter references', () => {
      const params = createParams(['width', 10], ['height', 20]);
      expect(evaluateExpression('width', params)).toBe(10);
      expect(evaluateExpression('height', params)).toBe(20);
    });

    it('evaluates expressions with parameters', () => {
      const params = createParams(['width', 10], ['height', 20]);
      expect(evaluateExpression('width * 2', params)).toBe(20);
      expect(evaluateExpression('width + height', params)).toBe(30);
      expect(evaluateExpression('width * height / 2', params)).toBe(100);
      expect(evaluateExpression('(width + height) * 2', params)).toBe(60);
    });

    it('throws on unknown parameter', () => {
      const params = createParams(['width', 10]);
      expect(() => evaluateExpression('unknown', params)).toThrow('Unknown parameter');
    });

    it('throws on division by zero', () => {
      const params = createParams();
      expect(() => evaluateExpression('10 / 0', params)).toThrow('Division by zero');
    });

    it('throws on invalid expression', () => {
      const params = createParams();
      expect(() => evaluateExpression('2 + + 3', params)).toThrow();
      expect(() => evaluateExpression('(2 + 3', params)).toThrow();
      expect(() => evaluateExpression('2 @@ 3', params)).toThrow();
    });
  });

  describe('resolveValue', () => {
    it('returns numeric value directly', () => {
      const params = new Map<string, Parameter>();
      expect(resolveValue(42, params)).toBe(42);
      expect(resolveValue(3.14, params)).toBe(3.14);
    });

    it('resolves parameter reference', () => {
      const param = createParameter('width', 25);
      const params = new Map<string, Parameter>();
      params.set(param.id, param);

      const ref: ParameterRef = { parameterId: param.id };
      expect(resolveValue(ref, params)).toBe(25);
    });

    it('throws on unknown parameter reference', () => {
      const params = new Map<string, Parameter>();
      const ref: ParameterRef = { parameterId: 'unknown_id' };
      expect(() => resolveValue(ref, params)).toThrow('Unknown parameter');
    });
  });

  describe('extractParameterNames', () => {
    it('extracts parameter names from expression', () => {
      expect(extractParameterNames('width * 2')).toEqual(['width']);
      expect(extractParameterNames('width + height')).toEqual(['width', 'height']);
      expect(extractParameterNames('a * b + c')).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for numeric expressions', () => {
      expect(extractParameterNames('42')).toEqual([]);
      expect(extractParameterNames('2 + 3 * 4')).toEqual([]);
    });

    it('handles duplicate parameter names', () => {
      expect(extractParameterNames('width * width')).toEqual(['width']);
      expect(extractParameterNames('x + x + y')).toEqual(['x', 'y']);
    });
  });

  describe('getParameterDependencies', () => {
    it('returns empty array for parameter without expression', () => {
      const param = createParameter('width', 10);
      const params = new Map<string, Parameter>();
      params.set(param.id, param);

      expect(getParameterDependencies(param, params)).toEqual([]);
    });

    it('returns dependency IDs for parameter with expression', () => {
      const width = createParameter('width', 10);
      const height = createParameter('height', 20, 'width * 2');
      const params = new Map<string, Parameter>();
      params.set(width.id, width);
      params.set(height.id, height);

      const deps = getParameterDependencies(height, params);
      expect(deps).toContain(width.id);
    });

    it('returns multiple dependencies', () => {
      const a = createParameter('a', 1);
      const b = createParameter('b', 2);
      const c = createParameter('c', 0, 'a + b');
      const params = new Map<string, Parameter>();
      params.set(a.id, a);
      params.set(b.id, b);
      params.set(c.id, c);

      const deps = getParameterDependencies(c, params);
      expect(deps).toContain(a.id);
      expect(deps).toContain(b.id);
      expect(deps.length).toBe(2);
    });
  });

  describe('detectCircularDependencies', () => {
    it('returns empty array when no circular dependencies', () => {
      const a = createParameter('a', 10);
      const b = createParameter('b', 0, 'a * 2');
      const params = new Map<string, Parameter>();
      params.set(a.id, a);
      params.set(b.id, b);

      expect(detectCircularDependencies(params)).toEqual([]);
    });

    it('detects simple circular dependency', () => {
      const a = createParameter('a', 10, 'b * 2');
      const b = createParameter('b', 20, 'a * 2');
      const params = new Map<string, Parameter>();
      params.set(a.id, a);
      params.set(b.id, b);

      const circular = detectCircularDependencies(params);
      expect(circular.length).toBeGreaterThan(0);
    });

    it('detects longer dependency cycle', () => {
      const a = createParameter('a', 1, 'c + 1');
      const b = createParameter('b', 2, 'a + 1');
      const c = createParameter('c', 3, 'b + 1');
      const params = new Map<string, Parameter>();
      params.set(a.id, a);
      params.set(b.id, b);
      params.set(c.id, c);

      const circular = detectCircularDependencies(params);
      expect(circular.length).toBeGreaterThan(0);
    });

    it('detects self-referential dependency', () => {
      const a = createParameter('a', 10, 'a + 1');
      const params = new Map<string, Parameter>();
      params.set(a.id, a);

      const circular = detectCircularDependencies(params);
      expect(circular.length).toBeGreaterThan(0);
    });
  });

  describe('updateDependentParameters', () => {
    it('updates parameters with expressions', () => {
      const width = createParameter('width', 10);
      const height = createParameter('height', 0, 'width * 2');
      const params = new Map<string, Parameter>();
      params.set(width.id, width);
      params.set(height.id, height);

      updateDependentParameters(params);

      expect(params.get(height.id)!.value).toBe(20);
    });

    it('updates in correct order (topological)', () => {
      const a = createParameter('a', 5);
      const b = createParameter('b', 0, 'a * 2');
      const c = createParameter('c', 0, 'b + 3');
      const params = new Map<string, Parameter>();
      params.set(a.id, a);
      params.set(b.id, b);
      params.set(c.id, c);

      updateDependentParameters(params);

      expect(params.get(b.id)!.value).toBe(10);
      expect(params.get(c.id)!.value).toBe(13);
    });

    it('throws on circular dependency', () => {
      const a = createParameter('a', 10, 'b * 2');
      const b = createParameter('b', 20, 'a * 2');
      const params = new Map<string, Parameter>();
      params.set(a.id, a);
      params.set(b.id, b);

      expect(() => updateDependentParameters(params)).toThrow('Circular dependency');
    });
  });

  describe('paramRef', () => {
    it('creates a parameter reference', () => {
      const param = createParameter('width', 10);
      const ref = paramRef(param);
      expect(ref.parameterId).toBe(param.id);
    });
  });
});
