import { describe, it, expect } from 'vitest';
import { TOLERANCE, isZero, isEqual } from '../../src/core/tolerance';

describe('tolerance', () => {
  it('TOLERANCE equals 1e-7', () => {
    expect(TOLERANCE).toBe(1e-7);
  });

  it('isZero returns true for values smaller than TOLERANCE', () => {
    expect(isZero(1e-8)).toBe(true);
    expect(isZero(-1e-8)).toBe(true);
    expect(isZero(0)).toBe(true);
    expect(isZero(TOLERANCE)).toBe(true); // <= comparison
  });

  it('isZero returns false for values larger than TOLERANCE', () => {
    expect(isZero(1e-6)).toBe(false);
    expect(isZero(-1e-6)).toBe(false);
    expect(isZero(1.0)).toBe(false);
  });

  it('isEqual returns true for values within TOLERANCE', () => {
    expect(isEqual(1.0, 1.0 + 1e-8)).toBe(true);
    expect(isEqual(1.0, 1.0 - 1e-8)).toBe(true);
    expect(isEqual(5.0, 5.0)).toBe(true);
  });

  it('isEqual returns false for values outside TOLERANCE', () => {
    expect(isEqual(1.0, 1.001)).toBe(false);
    expect(isEqual(0.0, 1e-6)).toBe(false);
  });
});
