import { describe, it, expect } from 'vitest';
import { point2d } from '../../src/core';
import { XY_PLANE } from '../../src/core/plane';
import { makeLine2D } from '../../src/geometry/line2d';
import { makeCircle2D } from '../../src/geometry/circle2d';
import {
  createConstrainedSketch,
  addConstraint,
  addSketchParameter,
  solveSketch,
} from '../../src/sketch/constrained-sketch';
import { Constraint } from '../../src/constraints/types';
import { createParameter, paramRef } from '../../src/constraints/parameter';

// Helper to get point from sketch element
function getPointFromSketch(sketch: any, elemId: string, which: 'start' | 'end' | 'center'): { x: number; y: number } {
  const elem = sketch.elements.find((e: any) => e.id === elemId);
  if (!elem) throw new Error(`Element not found: ${elemId}`);
  const geom = elem.geometry;

  if (which === 'center') {
    return (geom as any).center;
  } else if (which === 'start') {
    return geom.startPoint;
  } else {
    return geom.endPoint;
  }
}

// Helper to get line length
function getLineLength(sketch: any, elemId: string): number {
  const start = getPointFromSketch(sketch, elemId, 'start');
  const end = getPointFromSketch(sketch, elemId, 'end');
  return Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
}

// Helper to get circle radius
function getCircleRadius(sketch: any, elemId: string): number {
  const elem = sketch.elements.find((e: any) => e.id === elemId);
  return elem.geometry.radius;
}

describe('Dimensional Constraints', () => {
  describe('Distance Constraint', () => {
    it('sets distance between two points', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(5, 0));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        {
          type: 'distance',
          point1: { elementId: 'line1', which: 'start' },
          point2: { elementId: 'line1', which: 'end' },
          value: 10,
        },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'horizontal', line: { elementId: 'line1' } },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const dist = getLineLength(solved, 'line1');

      expect(dist).toBeCloseTo(10, 4);
    });

    it('sets distance with parameter reference', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(5, 0));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      // Add a parameter
      const paramResult = addSketchParameter(sketch, 'length', 15);
      sketch = paramResult.result!.sketch;
      const param = sketch.parameters.get(paramResult.result!.parameterId)!;

      const constraints: Constraint[] = [
        {
          type: 'distance',
          point1: { elementId: 'line1', which: 'start' },
          point2: { elementId: 'line1', which: 'end' },
          value: paramRef(param),
        },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'horizontal', line: { elementId: 'line1' } },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const dist = getLineLength(solved, 'line1');

      expect(dist).toBeCloseTo(15, 4);
    });
  });

  describe('Horizontal Distance Constraint', () => {
    it('sets horizontal distance between points', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(3, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        {
          type: 'horizontalDistance',
          point1: { elementId: 'line1', which: 'start' },
          point2: { elementId: 'line1', which: 'end' },
          value: 10,
        },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const start = getPointFromSketch(solved, 'line1', 'start');
      const end = getPointFromSketch(solved, 'line1', 'end');

      expect(Math.abs(end.x - start.x)).toBeCloseTo(10, 4);
    });
  });

  describe('Vertical Distance Constraint', () => {
    it('sets vertical distance between points', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(5, 3));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        {
          type: 'verticalDistance',
          point1: { elementId: 'line1', which: 'start' },
          point2: { elementId: 'line1', which: 'end' },
          value: 10,
        },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const start = getPointFromSketch(solved, 'line1', 'start');
      const end = getPointFromSketch(solved, 'line1', 'end');

      expect(Math.abs(end.y - start.y)).toBeCloseTo(10, 4);
    });
  });

  describe('Length Constraint', () => {
    it('sets line segment length', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(5, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'length', line: { elementId: 'line1' }, value: 20 },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const len = getLineLength(solved, 'line1');

      expect(len).toBeCloseTo(20, 4);
    });

    it('sets line length with parameter', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(5, 0));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const paramResult = addSketchParameter(sketch, 'len', 25);
      sketch = paramResult.result!.sketch;
      const param = sketch.parameters.get(paramResult.result!.parameterId)!;

      const constraints: Constraint[] = [
        { type: 'length', line: { elementId: 'line1' }, value: paramRef(param) },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'horizontal', line: { elementId: 'line1' } },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const len = getLineLength(solved, 'line1');

      expect(len).toBeCloseTo(25, 4);
    });
  });

  describe('Radius Constraint', () => {
    it('sets circle radius', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const circle = makeCircle2D(point2d(0, 0), 5);
      sketch = { ...sketch, elements: [{ id: 'circle1', geometry: circle.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'radius', circle: { elementId: 'circle1' }, value: 15 },
        { type: 'fixed', point: { elementId: 'circle1', which: 'center' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const radius = getCircleRadius(solved, 'circle1');

      expect(radius).toBeCloseTo(15, 4);
    });
  });

  describe('Diameter Constraint', () => {
    it('sets circle diameter', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const circle = makeCircle2D(point2d(0, 0), 5);
      sketch = { ...sketch, elements: [{ id: 'circle1', geometry: circle.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'diameter', circle: { elementId: 'circle1' }, value: 30 },
        { type: 'fixed', point: { elementId: 'circle1', which: 'center' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const radius = getCircleRadius(solved, 'circle1');

      expect(radius).toBeCloseTo(15, 4); // diameter/2
    });
  });

  describe('Angle Constraint', () => {
    it('sets angle between two lines', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(0, 0), point2d(5, 5));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        {
          type: 'angle',
          line1: { elementId: 'line1' },
          line2: { elementId: 'line2' },
          value: Math.PI / 4, // 45 degrees
        },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
        { type: 'fixed', point: { elementId: 'line2', which: 'start' }, position: point2d(0, 0) },
        { type: 'length', line: { elementId: 'line2' }, value: 10 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Calculate angle between lines
      const l1s = getPointFromSketch(solved, 'line1', 'start');
      const l1e = getPointFromSketch(solved, 'line1', 'end');
      const l2s = getPointFromSketch(solved, 'line2', 'start');
      const l2e = getPointFromSketch(solved, 'line2', 'end');

      const dx1 = l1e.x - l1s.x;
      const dy1 = l1e.y - l1s.y;
      const dx2 = l2e.x - l2s.x;
      const dy2 = l2e.y - l2s.y;

      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      const angle = Math.acos(dot);

      expect(angle).toBeCloseTo(Math.PI / 4, 3);
    });

    it('sets perpendicular angle (90 degrees)', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(0, 0), point2d(3, 5));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        {
          type: 'angle',
          line1: { elementId: 'line1' },
          line2: { elementId: 'line2' },
          value: Math.PI / 2, // 90 degrees
        },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
        { type: 'fixed', point: { elementId: 'line2', which: 'start' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Line2 should be vertical (perpendicular to horizontal line1)
      const l2s = getPointFromSketch(solved, 'line2', 'start');
      const l2e = getPointFromSketch(solved, 'line2', 'end');

      // x coordinates should be same (vertical line)
      expect(l2e.x).toBeCloseTo(l2s.x, 3);
    });
  });

  describe('Equal Constraint', () => {
    it('makes two lines equal length', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(0, 5), point2d(15, 5));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'equal', element1: 'line1', element2: 'line2' },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
        { type: 'fixed', point: { elementId: 'line2', which: 'start' }, position: point2d(0, 5) },
        { type: 'horizontal', line: { elementId: 'line2' } },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const len1 = getLineLength(solved, 'line1');
      const len2 = getLineLength(solved, 'line2');

      expect(len1).toBeCloseTo(len2, 4);
      expect(len1).toBeCloseTo(10, 4); // Both should be 10 since line1 is fixed
    });
  });
});
