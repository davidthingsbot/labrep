import { describe, it, expect } from 'vitest';
import { point2d } from '../../src/core';
import { XY_PLANE } from '../../src/core/plane';
import { makeLine2D } from '../../src/geometry/line2d';
import { makeCircle2D } from '../../src/geometry/circle2d';
import { createSketch, addElement } from '../../src/sketch/sketch';
import {
  createConstrainedSketch,
  toConstrainedSketch,
  addConstraint,
  solveSketch,
  sketchDOF,
} from '../../src/sketch/constrained-sketch';
import { Constraint, PointRef, LineRef, CircleRef } from '../../src/constraints/types';

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

describe('Geometric Constraints', () => {
  describe('Coincident Constraint', () => {
    it('makes two points coincide', () => {
      // Create sketch with two lines that don't share endpoints
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(15, 5), point2d(25, 5));

      sketch = { ...sketch, elements: [...sketch.elements, { id: 'line1', geometry: line1.result!, construction: false }] };
      sketch = { ...sketch, elements: [...sketch.elements, { id: 'line2', geometry: line2.result!, construction: false }] };

      // Add coincident constraint: end of line1 = start of line2
      const constraint: Constraint = {
        type: 'coincident',
        point1: { elementId: 'line1', which: 'end' },
        point2: { elementId: 'line2', which: 'start' },
      };

      const result1 = addConstraint(sketch, constraint);
      expect(result1.success).toBe(true);
      sketch = result1.result!.sketch;

      // Fix line1's start to anchor the sketch
      const fixConstraint: Constraint = {
        type: 'fixed',
        point: { elementId: 'line1', which: 'start' },
        position: point2d(0, 0),
      };
      const result2 = addConstraint(sketch, fixConstraint);
      sketch = result2.result!.sketch;

      // Solve
      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solvedSketch = solveResult.result!.sketch;
      const p1 = getPointFromSketch(solvedSketch, 'line1', 'end');
      const p2 = getPointFromSketch(solvedSketch, 'line2', 'start');

      expect(p1.x).toBeCloseTo(p2.x, 5);
      expect(p1.y).toBeCloseTo(p2.y, 5);
    });

    it('makes multiple coincident points converge', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      // Create three lines forming a rough triangle
      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0.5));
      const line2 = makeLine2D(point2d(11, 0), point2d(5, 8));
      const line3 = makeLine2D(point2d(4, 9), point2d(-0.5, 0.5));

      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
          { id: 'line3', geometry: line3.result!, construction: false },
        ] };

      // Connect all endpoints
      const constraints: Constraint[] = [
        { type: 'coincident', point1: { elementId: 'line1', which: 'end' }, point2: { elementId: 'line2', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'line2', which: 'end' }, point2: { elementId: 'line3', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'line3', which: 'end' }, point2: { elementId: 'line1', which: 'start' } },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Check all vertices are connected
      const l1End = getPointFromSketch(solved, 'line1', 'end');
      const l2Start = getPointFromSketch(solved, 'line2', 'start');
      expect(l1End.x).toBeCloseTo(l2Start.x, 4);
      expect(l1End.y).toBeCloseTo(l2Start.y, 4);

      const l2End = getPointFromSketch(solved, 'line2', 'end');
      const l3Start = getPointFromSketch(solved, 'line3', 'start');
      expect(l2End.x).toBeCloseTo(l3Start.x, 4);
      expect(l2End.y).toBeCloseTo(l3Start.y, 4);
    });
  });

  describe('Fixed Constraint', () => {
    it('fixes a point at a specific position', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(5, 5), point2d(15, 10));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraint: Constraint = {
        type: 'fixed',
        point: { elementId: 'line1', which: 'start' },
        position: point2d(0, 0),
      };

      const result = addConstraint(sketch, constraint);
      sketch = result.result!.sketch;

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const p = getPointFromSketch(solved, 'line1', 'start');

      expect(p.x).toBeCloseTo(0, 5);
      expect(p.y).toBeCloseTo(0, 5);
    });
  });

  describe('Horizontal Constraint', () => {
    it('makes a line horizontal', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'horizontal', line: { elementId: 'line1' } },
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

      expect(start.y).toBeCloseTo(end.y, 5);
    });

    it('makes an already horizontal line stay horizontal', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 5), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraint: Constraint = { type: 'horizontal', line: { elementId: 'line1' } };
      const result = addConstraint(sketch, constraint);
      sketch = result.result!.sketch;

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);
      expect(solveResult.result!.result.residual).toBeLessThan(1e-6);
    });
  });

  describe('Vertical Constraint', () => {
    it('makes a line vertical', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(5, 10));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'vertical', line: { elementId: 'line1' } },
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

      expect(start.x).toBeCloseTo(end.x, 5);
    });
  });

  describe('Parallel Constraint', () => {
    it('makes two lines parallel', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(0, 5), point2d(10, 8));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'parallel', line1: { elementId: 'line1' }, line2: { elementId: 'line2' } },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
        { type: 'fixed', point: { elementId: 'line2', which: 'start' }, position: point2d(0, 5) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Check parallel: direction vectors should have same direction (cross product = 0)
      const l1s = getPointFromSketch(solved, 'line1', 'start');
      const l1e = getPointFromSketch(solved, 'line1', 'end');
      const l2s = getPointFromSketch(solved, 'line2', 'start');
      const l2e = getPointFromSketch(solved, 'line2', 'end');

      const dx1 = l1e.x - l1s.x;
      const dy1 = l1e.y - l1s.y;
      const dx2 = l2e.x - l2s.x;
      const dy2 = l2e.y - l2s.y;

      const cross = dx1 * dy2 - dy1 * dx2;
      expect(cross).toBeCloseTo(0, 4);
    });
  });

  describe('Perpendicular Constraint', () => {
    it('makes two lines perpendicular', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(5, 0), point2d(8, 8));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'perpendicular', line1: { elementId: 'line1' }, line2: { elementId: 'line2' } },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
        { type: 'fixed', point: { elementId: 'line2', which: 'start' }, position: point2d(5, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Check perpendicular: dot product of direction vectors = 0
      const l1s = getPointFromSketch(solved, 'line1', 'start');
      const l1e = getPointFromSketch(solved, 'line1', 'end');
      const l2s = getPointFromSketch(solved, 'line2', 'start');
      const l2e = getPointFromSketch(solved, 'line2', 'end');

      const dx1 = l1e.x - l1s.x;
      const dy1 = l1e.y - l1s.y;
      const dx2 = l2e.x - l2s.x;
      const dy2 = l2e.y - l2s.y;

      const dot = dx1 * dx2 + dy1 * dy2;
      expect(dot).toBeCloseTo(0, 4);
    });
  });

  describe('Point on Line Constraint', () => {
    it('moves a point onto a line', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 10));
      const line2 = makeLine2D(point2d(5, 2), point2d(8, 2));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'pointOnLine', point: { elementId: 'line2', which: 'start' }, line: { elementId: 'line1' } },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 10) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const p = getPointFromSketch(solved, 'line2', 'start');

      // Point should be on line y = x
      expect(p.x).toBeCloseTo(p.y, 4);
    });
  });

  describe('Midpoint Constraint', () => {
    it('places a point at the midpoint of a line', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(3, 5), point2d(3, 10));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'midpoint', point: { elementId: 'line2', which: 'start' }, line: { elementId: 'line1' } },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const p = getPointFromSketch(solved, 'line2', 'start');

      expect(p.x).toBeCloseTo(5, 4);
      expect(p.y).toBeCloseTo(0, 4);
    });
  });

  describe('Concentric Constraint', () => {
    it('makes two circles share the same center', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const circle1 = makeCircle2D(point2d(0, 0), 5);
      const circle2 = makeCircle2D(point2d(3, 2), 10);
      sketch = { ...sketch, elements: [
          { id: 'circle1', geometry: circle1.result!, construction: false },
          { id: 'circle2', geometry: circle2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'concentric', circle1: { elementId: 'circle1' }, circle2: { elementId: 'circle2' } },
        { type: 'fixed', point: { elementId: 'circle1', which: 'center' }, position: point2d(0, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const c1 = getPointFromSketch(solved, 'circle1', 'center');
      const c2 = getPointFromSketch(solved, 'circle2', 'center');

      expect(c1.x).toBeCloseTo(c2.x, 4);
      expect(c1.y).toBeCloseTo(c2.y, 4);
    });
  });

  describe('Collinear Constraint', () => {
    it('makes two lines collinear', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(5, 0));
      const line2 = makeLine2D(point2d(7, 1), point2d(12, 2));
      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'collinear', line1: { elementId: 'line1' }, line2: { elementId: 'line2' } },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(5, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Both points of line2 should be on line y = 0
      const l2s = getPointFromSketch(solved, 'line2', 'start');
      const l2e = getPointFromSketch(solved, 'line2', 'end');

      expect(l2s.y).toBeCloseTo(0, 4);
      expect(l2e.y).toBeCloseTo(0, 4);
    });
  });
});
