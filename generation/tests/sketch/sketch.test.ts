import { describe, it, expect } from 'vitest';
import { createSketch, addElement, removeElement, getElement } from '../../src/sketch/sketch';
import { XY_PLANE, XZ_PLANE } from '../../src/core';
import { makeLine2D, makeCircle2D, makeArc2D } from '../../src/geometry';
import { point2d } from '../../src/core';

describe('createSketch', () => {
  it('creates an empty sketch on the given plane', () => {
    const sketch = createSketch(XY_PLANE);
    expect(sketch.plane).toBe(XY_PLANE);
    expect(sketch.elements.length).toBe(0);
  });

  it('works with different planes', () => {
    const sketch = createSketch(XZ_PLANE);
    expect(sketch.plane).toBe(XZ_PLANE);
  });
});

describe('addElement', () => {
  it('adds a line element and increases count', () => {
    const sketch = createSketch(XY_PLANE);
    const line = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    const updated = addElement(sketch, line);
    expect(updated.elements.length).toBe(1);
    expect(updated.elements[0].geometry).toBe(line);
  });

  it('adds an arc element', () => {
    const sketch = createSketch(XY_PLANE);
    const arc = makeArc2D(point2d(0, 0), 1, 0, Math.PI / 2).result!;
    const updated = addElement(sketch, arc);
    expect(updated.elements.length).toBe(1);
    expect(updated.elements[0].geometry.type).toBe('arc');
  });

  it('adds a circle element', () => {
    const sketch = createSketch(XY_PLANE);
    const circle = makeCircle2D(point2d(0, 0), 1).result!;
    const updated = addElement(sketch, circle);
    expect(updated.elements.length).toBe(1);
    expect(updated.elements[0].geometry.type).toBe('circle');
  });

  it('sets construction flag when specified', () => {
    const sketch = createSketch(XY_PLANE);
    const line = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    const updated = addElement(sketch, line, true);
    expect(updated.elements[0].construction).toBe(true);
  });

  it('defaults construction to false', () => {
    const sketch = createSketch(XY_PLANE);
    const line = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    const updated = addElement(sketch, line);
    expect(updated.elements[0].construction).toBe(false);
  });

  it('generates unique IDs', () => {
    let sketch = createSketch(XY_PLANE);
    const line1 = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    const line2 = makeLine2D(point2d(1, 0), point2d(1, 1)).result!;
    sketch = addElement(sketch, line1);
    sketch = addElement(sketch, line2);
    const ids = sketch.elements.map(e => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('returns a new sketch (immutable)', () => {
    const sketch = createSketch(XY_PLANE);
    const line = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    const updated = addElement(sketch, line);
    expect(updated).not.toBe(sketch);
    expect(sketch.elements.length).toBe(0);
  });
});

describe('removeElement', () => {
  it('removes an element by ID', () => {
    let sketch = createSketch(XY_PLANE);
    const line = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    sketch = addElement(sketch, line);
    const id = sketch.elements[0].id;
    const updated = removeElement(sketch, id);
    expect(updated.elements.length).toBe(0);
  });

  it('returns sketch unchanged for nonexistent ID', () => {
    const sketch = createSketch(XY_PLANE);
    const updated = removeElement(sketch, 'nonexistent');
    expect(updated.elements.length).toBe(0);
  });

  it('returns a new sketch (immutable)', () => {
    let sketch = createSketch(XY_PLANE);
    const line = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    sketch = addElement(sketch, line);
    const updated = removeElement(sketch, sketch.elements[0].id);
    expect(updated).not.toBe(sketch);
    expect(sketch.elements.length).toBe(1);
  });
});

describe('getElement', () => {
  it('retrieves element by ID', () => {
    let sketch = createSketch(XY_PLANE);
    const line = makeLine2D(point2d(0, 0), point2d(1, 0)).result!;
    sketch = addElement(sketch, line);
    const id = sketch.elements[0].id;
    const elem = getElement(sketch, id);
    expect(elem).toBeDefined();
    expect(elem!.geometry).toBe(line);
  });

  it('returns undefined for nonexistent ID', () => {
    const sketch = createSketch(XY_PLANE);
    expect(getElement(sketch, 'nope')).toBeUndefined();
  });
});
