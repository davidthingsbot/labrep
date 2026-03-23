import { describe, it, expect } from 'vitest';
import { profileArea, profileContainsPoint, wireSignedArea } from '../../src/sketch/profile';
import { point2d } from '../../src/core';
import { makeLine2D, makeCircle2D } from '../../src/geometry';
import { makeWire2D } from '../../src/geometry';
import type { Profile2D } from '../../src/sketch/profile';

/** Helper: make a rectangular wire from 4 corners. */
function makeRectWire(x0: number, y0: number, x1: number, y1: number) {
  const l1 = makeLine2D(point2d(x0, y0), point2d(x1, y0)).result!;
  const l2 = makeLine2D(point2d(x1, y0), point2d(x1, y1)).result!;
  const l3 = makeLine2D(point2d(x1, y1), point2d(x0, y1)).result!;
  const l4 = makeLine2D(point2d(x0, y1), point2d(x0, y0)).result!;
  return makeWire2D([l1, l2, l3, l4]).result!;
}

describe('wireSignedArea', () => {
  it('unit square CCW has positive area ≈ 1', () => {
    const wire = makeRectWire(0, 0, 1, 1);
    const area = wireSignedArea(wire);
    expect(area).toBeCloseTo(1, 1);
  });

  it('CW rectangle has negative area', () => {
    // Reversed winding: go clockwise
    const l1 = makeLine2D(point2d(0, 0), point2d(0, 1)).result!;
    const l2 = makeLine2D(point2d(0, 1), point2d(1, 1)).result!;
    const l3 = makeLine2D(point2d(1, 1), point2d(1, 0)).result!;
    const l4 = makeLine2D(point2d(1, 0), point2d(0, 0)).result!;
    const wire = makeWire2D([l1, l2, l3, l4]).result!;
    expect(wireSignedArea(wire)).toBeLessThan(0);
  });

  it('2×3 rectangle has area ≈ 6', () => {
    const wire = makeRectWire(0, 0, 2, 3);
    expect(wireSignedArea(wire)).toBeCloseTo(6, 1);
  });
});

describe('profileArea', () => {
  it('unit square profile has area ≈ 1', () => {
    const wire = makeRectWire(0, 0, 1, 1);
    const profile: Profile2D = { outer: wire, holes: [] };
    expect(profileArea(profile)).toBeCloseTo(1, 1);
  });
});

describe('profileContainsPoint', () => {
  it('point inside rectangle returns true', () => {
    const wire = makeRectWire(0, 0, 2, 2);
    const profile: Profile2D = { outer: wire, holes: [] };
    expect(profileContainsPoint(profile, point2d(1, 1))).toBe(true);
  });

  it('point outside rectangle returns false', () => {
    const wire = makeRectWire(0, 0, 2, 2);
    const profile: Profile2D = { outer: wire, holes: [] };
    expect(profileContainsPoint(profile, point2d(5, 5))).toBe(false);
  });

  it('point inside hole returns false', () => {
    const outer = makeRectWire(0, 0, 4, 4);
    const holeWire = makeRectWire(1, 1, 3, 3);
    const profile: Profile2D = { outer, holes: [holeWire] };
    expect(profileContainsPoint(profile, point2d(2, 2))).toBe(false);
  });

  it('point between outer and hole returns true', () => {
    const outer = makeRectWire(0, 0, 4, 4);
    const holeWire = makeRectWire(1, 1, 3, 3);
    const profile: Profile2D = { outer, holes: [holeWire] };
    expect(profileContainsPoint(profile, point2d(0.5, 0.5))).toBe(true);
  });
});
