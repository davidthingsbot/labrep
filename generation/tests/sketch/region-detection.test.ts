import { describe, it, expect } from 'vitest';
import { findProfiles } from '../../src/sketch/region-detection';
import { createSketch, addElement } from '../../src/sketch/sketch';
import { point2d, XY_PLANE } from '../../src/core';
import { makeLine2D, makeCircle2D, makeArc2D } from '../../src/geometry';
import { profileArea } from '../../src/sketch/profile';

/** Helper: add a line to a sketch. */
function addLine(sketch: ReturnType<typeof createSketch>, x0: number, y0: number, x1: number, y1: number) {
  const line = makeLine2D(point2d(x0, y0), point2d(x1, y1)).result!;
  return addElement(sketch, line);
}

describe('findProfiles — simple cases', () => {
  it('rectangle from 4 lines → 1 profile', () => {
    let s = createSketch(XY_PLANE);
    s = addLine(s, 0, 0, 2, 0);
    s = addLine(s, 2, 0, 2, 1);
    s = addLine(s, 2, 1, 0, 1);
    s = addLine(s, 0, 1, 0, 0);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(1);
    expect(Math.abs(profileArea(profiles[0]))).toBeCloseTo(2, 1);
  });

  it('triangle from 3 lines → 1 profile', () => {
    let s = createSketch(XY_PLANE);
    s = addLine(s, 0, 0, 2, 0);
    s = addLine(s, 2, 0, 1, 1.5);
    s = addLine(s, 1, 1.5, 0, 0);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(1);
  });

  it('circle → 1 profile (disc)', () => {
    let s = createSketch(XY_PLANE);
    const circle = makeCircle2D(point2d(0, 0), 1).result!;
    s = addElement(s, circle);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(1);
    expect(Math.abs(profileArea(profiles[0]))).toBeCloseTo(Math.PI, 0);
  });

  it('open polyline → 0 profiles', () => {
    let s = createSketch(XY_PLANE);
    s = addLine(s, 0, 0, 1, 0);
    s = addLine(s, 1, 0, 1, 1);
    s = addLine(s, 1, 1, 2, 1);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(0);
  });

  it('disconnected elements → 0 profiles', () => {
    let s = createSketch(XY_PLANE);
    s = addLine(s, 0, 0, 1, 0);
    s = addLine(s, 5, 5, 6, 5);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(0);
  });

  it('construction elements excluded', () => {
    let s = createSketch(XY_PLANE);
    // Rectangle in construction mode
    const l1 = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    const l2 = makeLine2D(point2d(1, 0), point2d(1, 1)).result!;
    const l3 = makeLine2D(point2d(1, 1), point2d(0, 1)).result!;
    const l4 = makeLine2D(point2d(0, 1), point2d(0, 0)).result!;
    s = addElement(s, l1, true);
    s = addElement(s, l2, true);
    s = addElement(s, l3, true);
    s = addElement(s, l4, true);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(0);
  });
});

describe('findProfiles — multiple regions', () => {
  it('two separate rectangles → 2 profiles', () => {
    let s = createSketch(XY_PLANE);
    // Rectangle 1
    s = addLine(s, 0, 0, 1, 0);
    s = addLine(s, 1, 0, 1, 1);
    s = addLine(s, 1, 1, 0, 1);
    s = addLine(s, 0, 1, 0, 0);
    // Rectangle 2 (separated)
    s = addLine(s, 3, 0, 4, 0);
    s = addLine(s, 4, 0, 4, 1);
    s = addLine(s, 4, 1, 3, 1);
    s = addLine(s, 3, 1, 3, 0);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(2);
  });

  it('rectangle with interior dividing line → 2 profiles', () => {
    let s = createSketch(XY_PLANE);
    // Outer rectangle
    s = addLine(s, 0, 0, 4, 0);
    s = addLine(s, 4, 0, 4, 2);
    s = addLine(s, 4, 2, 0, 2);
    s = addLine(s, 0, 2, 0, 0);
    // Vertical divider at x=2
    s = addLine(s, 2, 0, 2, 2);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(2);
    // Each half should have area ≈ 4
    const areas = profiles.map(p => Math.abs(profileArea(p))).sort();
    expect(areas[0]).toBeCloseTo(4, 0);
    expect(areas[1]).toBeCloseTo(4, 0);
  });
});

describe('findProfiles — with holes', () => {
  it('rectangle with inner circle → 1 profile with 1 hole', () => {
    let s = createSketch(XY_PLANE);
    // Outer rectangle
    s = addLine(s, -3, -3, 3, -3);
    s = addLine(s, 3, -3, 3, 3);
    s = addLine(s, 3, 3, -3, 3);
    s = addLine(s, -3, 3, -3, -3);
    // Inner circle (doesn't touch the rectangle)
    const circle = makeCircle2D(point2d(0, 0), 1).result!;
    s = addElement(s, circle);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(1);
    expect(profiles[0].holes.length).toBe(1);
  });
});

describe('findProfiles — with arcs', () => {
  it('semicircle arc + line → 1 profile', () => {
    let s = createSketch(XY_PLANE);
    // Bottom line
    s = addLine(s, -1, 0, 1, 0);
    // Top semicircle arc
    const arc = makeArc2D(point2d(0, 0), 1, 0, Math.PI).result!;
    s = addElement(s, arc);
    const profiles = findProfiles(s);
    expect(profiles.length).toBe(1);
  });
});
