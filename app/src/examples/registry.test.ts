import { describe, it, expect } from 'vitest';
import { examples, getExampleById } from './registry';

describe('example registry', () => {
  it('exports all expected examples', () => {
    const expectedIds = [
      'points',
      'vectors',
      'lines',
      'primitives-box',
      'primitives-sphere',
      'primitives-cylinder',
      'primitives-all',
      'math-2d',
      'transforms',
      'planes-axes',
      'bounding-boxes',
      'curves-line2d',
      'curves-circle2d',
      'curves-arc2d',
      'curves-intersection',
      'curves-wire2d',
    ];
    
    const actualIds = examples.map(e => e.id);
    
    expectedIds.forEach(id => {
      expect(actualIds).toContain(id);
    });
  });

  it('examples have required fields', () => {
    examples.forEach(example => {
      expect(example.id).toBeDefined();
      expect(typeof example.id).toBe('string');
      expect(example.id.length).toBeGreaterThan(0);

      expect(example.name).toBeDefined();
      expect(typeof example.name).toBe('string');
      expect(example.name.length).toBeGreaterThan(0);

      expect(example.description).toBeDefined();
      expect(typeof example.description).toBe('string');

      expect(example.component).toBeDefined();
      expect(typeof example.component).toBe('function');

      expect(example.code).toBeDefined();
      expect(typeof example.code).toBe('string');
      expect(example.code.length).toBeGreaterThan(0);
    });
  });

  it('example ids are unique', () => {
    const ids = examples.map(e => e.id);
    const uniqueIds = new Set(ids);
    
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('getExampleById returns correct example', () => {
    const box = getExampleById('primitives-box');
    
    expect(box).toBeDefined();
    expect(box?.name).toBe('Box');
  });

  it('getExampleById returns undefined for unknown id', () => {
    const result = getExampleById('nonexistent-example');
    
    expect(result).toBeUndefined();
  });
});
