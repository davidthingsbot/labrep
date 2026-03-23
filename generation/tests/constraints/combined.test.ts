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
  sketchDOF,
  sketchIsFullyConstrained,
} from '../../src/sketch/constrained-sketch';
import { Constraint } from '../../src/constraints/types';
import { paramRef } from '../../src/constraints/parameter';

// Helper functions
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

function getLineLength(sketch: any, elemId: string): number {
  const start = getPointFromSketch(sketch, elemId, 'start');
  const end = getPointFromSketch(sketch, elemId, 'end');
  return Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
}

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

describe('Combined Constraints', () => {
  describe('Rectangle', () => {
    it('creates a rectangle with horizontal/vertical and coincident constraints', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      // Create four lines roughly forming a rectangle
      const bottom = makeLine2D(point2d(0, 0), point2d(10.5, 0.2));
      const right = makeLine2D(point2d(10.5, 0.2), point2d(10.3, 5.1));
      const top = makeLine2D(point2d(10.3, 5.1), point2d(-0.1, 4.9));
      const left = makeLine2D(point2d(-0.1, 4.9), point2d(0, 0));

      sketch = { ...sketch, elements: [
          { id: 'bottom', geometry: bottom.result!, construction: false },
          { id: 'right', geometry: right.result!, construction: false },
          { id: 'top', geometry: top.result!, construction: false },
          { id: 'left', geometry: left.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        // Make horizontal/vertical
        { type: 'horizontal', line: { elementId: 'bottom' } },
        { type: 'horizontal', line: { elementId: 'top' } },
        { type: 'vertical', line: { elementId: 'left' } },
        { type: 'vertical', line: { elementId: 'right' } },

        // Connect corners
        { type: 'coincident', point1: { elementId: 'bottom', which: 'end' }, point2: { elementId: 'right', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'right', which: 'end' }, point2: { elementId: 'top', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'top', which: 'end' }, point2: { elementId: 'left', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'left', which: 'end' }, point2: { elementId: 'bottom', which: 'start' } },

        // Fix origin and size
        { type: 'fixed', point: { elementId: 'bottom', which: 'start' }, position: point2d(0, 0) },
        { type: 'length', line: { elementId: 'bottom' }, value: 10 },
        { type: 'length', line: { elementId: 'left' }, value: 5 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Check rectangle shape
      const bottomStart = getPointFromSketch(solved, 'bottom', 'start');
      const bottomEnd = getPointFromSketch(solved, 'bottom', 'end');
      const topStart = getPointFromSketch(solved, 'top', 'start');
      const topEnd = getPointFromSketch(solved, 'top', 'end');

      // Origin at (0,0)
      expect(bottomStart.x).toBeCloseTo(0, 3);
      expect(bottomStart.y).toBeCloseTo(0, 3);

      // Correct dimensions
      expect(getLineLength(solved, 'bottom')).toBeCloseTo(10, 3);
      expect(getLineLength(solved, 'left')).toBeCloseTo(5, 3);

      // Horizontal lines
      expect(bottomStart.y).toBeCloseTo(bottomEnd.y, 3);
      expect(topStart.y).toBeCloseTo(topEnd.y, 3);
    });

    it('creates a parametric rectangle', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const bottom = makeLine2D(point2d(0, 0), point2d(10, 0));
      const right = makeLine2D(point2d(10, 0), point2d(10, 5));
      const top = makeLine2D(point2d(10, 5), point2d(0, 5));
      const left = makeLine2D(point2d(0, 5), point2d(0, 0));

      sketch = { ...sketch, elements: [
          { id: 'bottom', geometry: bottom.result!, construction: false },
          { id: 'right', geometry: right.result!, construction: false },
          { id: 'top', geometry: top.result!, construction: false },
          { id: 'left', geometry: left.result!, construction: false },
        ] };

      // Add parameters
      const widthResult = addSketchParameter(sketch, 'width', 20);
      sketch = widthResult.result!.sketch;
      const width = sketch.parameters.get(widthResult.result!.parameterId)!;

      const heightResult = addSketchParameter(sketch, 'height', 15);
      sketch = heightResult.result!.sketch;
      const height = sketch.parameters.get(heightResult.result!.parameterId)!;

      const constraints: Constraint[] = [
        { type: 'horizontal', line: { elementId: 'bottom' } },
        { type: 'horizontal', line: { elementId: 'top' } },
        { type: 'vertical', line: { elementId: 'left' } },
        { type: 'vertical', line: { elementId: 'right' } },
        { type: 'coincident', point1: { elementId: 'bottom', which: 'end' }, point2: { elementId: 'right', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'right', which: 'end' }, point2: { elementId: 'top', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'top', which: 'end' }, point2: { elementId: 'left', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'left', which: 'end' }, point2: { elementId: 'bottom', which: 'start' } },
        { type: 'fixed', point: { elementId: 'bottom', which: 'start' }, position: point2d(0, 0) },
        { type: 'length', line: { elementId: 'bottom' }, value: paramRef(width) },
        { type: 'length', line: { elementId: 'left' }, value: paramRef(height) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      expect(getLineLength(solved, 'bottom')).toBeCloseTo(20, 3);
      expect(getLineLength(solved, 'left')).toBeCloseTo(15, 3);
    });
  });

  describe('Square', () => {
    it('creates a square with equal length constraint', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const bottom = makeLine2D(point2d(0, 0), point2d(10, 0));
      const right = makeLine2D(point2d(10, 0), point2d(10, 8));
      const top = makeLine2D(point2d(10, 8), point2d(0, 8));
      const left = makeLine2D(point2d(0, 8), point2d(0, 0));

      sketch = { ...sketch, elements: [
          { id: 'bottom', geometry: bottom.result!, construction: false },
          { id: 'right', geometry: right.result!, construction: false },
          { id: 'top', geometry: top.result!, construction: false },
          { id: 'left', geometry: left.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        // Rectangle constraints
        { type: 'horizontal', line: { elementId: 'bottom' } },
        { type: 'horizontal', line: { elementId: 'top' } },
        { type: 'vertical', line: { elementId: 'left' } },
        { type: 'vertical', line: { elementId: 'right' } },
        { type: 'coincident', point1: { elementId: 'bottom', which: 'end' }, point2: { elementId: 'right', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'right', which: 'end' }, point2: { elementId: 'top', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'top', which: 'end' }, point2: { elementId: 'left', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'left', which: 'end' }, point2: { elementId: 'bottom', which: 'start' } },

        // Square: equal sides
        { type: 'equal', element1: 'bottom', element2: 'left' },

        // Fix origin and one dimension
        { type: 'fixed', point: { elementId: 'bottom', which: 'start' }, position: point2d(0, 0) },
        { type: 'length', line: { elementId: 'bottom' }, value: 10 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      const bottomLen = getLineLength(solved, 'bottom');
      const leftLen = getLineLength(solved, 'left');

      expect(bottomLen).toBeCloseTo(10, 3);
      expect(leftLen).toBeCloseTo(10, 3); // Equal to bottom
      expect(bottomLen).toBeCloseTo(leftLen, 4);
    });
  });

  describe('Equilateral Triangle', () => {
    it('creates an equilateral triangle with equal length constraints', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      // Rough triangle
      const side1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const side2 = makeLine2D(point2d(10, 0), point2d(5, 8));
      const side3 = makeLine2D(point2d(5, 8), point2d(0, 0));

      sketch = { ...sketch, elements: [
          { id: 'side1', geometry: side1.result!, construction: false },
          { id: 'side2', geometry: side2.result!, construction: false },
          { id: 'side3', geometry: side3.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        // Connect vertices
        { type: 'coincident', point1: { elementId: 'side1', which: 'end' }, point2: { elementId: 'side2', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'side2', which: 'end' }, point2: { elementId: 'side3', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'side3', which: 'end' }, point2: { elementId: 'side1', which: 'start' } },

        // Equal sides
        { type: 'equal', element1: 'side1', element2: 'side2' },
        { type: 'equal', element1: 'side2', element2: 'side3' },

        // Anchor
        { type: 'fixed', point: { elementId: 'side1', which: 'start' }, position: point2d(0, 0) },
        { type: 'horizontal', line: { elementId: 'side1' } },
        { type: 'length', line: { elementId: 'side1' }, value: 10 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      const len1 = getLineLength(solved, 'side1');
      const len2 = getLineLength(solved, 'side2');
      const len3 = getLineLength(solved, 'side3');

      // All sides equal
      expect(len1).toBeCloseTo(len2, 3);
      expect(len2).toBeCloseTo(len3, 3);
      expect(len1).toBeCloseTo(10, 3);
    });
  });

  describe('Right Triangle', () => {
    it('creates a right triangle with perpendicular constraint', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const horizontal = makeLine2D(point2d(0, 0), point2d(10, 0));
      const vertical = makeLine2D(point2d(0, 0), point2d(0, 8));
      const hypotenuse = makeLine2D(point2d(10, 0), point2d(0, 8));

      sketch = { ...sketch, elements: [
          { id: 'horizontal', geometry: horizontal.result!, construction: false },
          { id: 'vertical', geometry: vertical.result!, construction: false },
          { id: 'hypotenuse', geometry: hypotenuse.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        // Connect vertices
        { type: 'coincident', point1: { elementId: 'horizontal', which: 'start' }, point2: { elementId: 'vertical', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'horizontal', which: 'end' }, point2: { elementId: 'hypotenuse', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'vertical', which: 'end' }, point2: { elementId: 'hypotenuse', which: 'end' } },

        // Right angle
        { type: 'perpendicular', line1: { elementId: 'horizontal' }, line2: { elementId: 'vertical' } },

        // Orientation
        { type: 'horizontal', line: { elementId: 'horizontal' } },

        // Anchor and dimensions
        { type: 'fixed', point: { elementId: 'horizontal', which: 'start' }, position: point2d(0, 0) },
        { type: 'length', line: { elementId: 'horizontal' }, value: 3 },
        { type: 'length', line: { elementId: 'vertical' }, value: 4 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      const horizLen = getLineLength(solved, 'horizontal');
      const vertLen = getLineLength(solved, 'vertical');
      const hypotLen = getLineLength(solved, 'hypotenuse');

      expect(horizLen).toBeCloseTo(3, 3);
      expect(vertLen).toBeCloseTo(4, 3);
      // Pythagorean: 3² + 4² = 5²
      expect(hypotLen).toBeCloseTo(5, 3);
    });
  });

  describe('Concentric Circles', () => {
    it('creates concentric circles with specific radii', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const inner = makeCircle2D(point2d(1, 1), 3);
      const outer = makeCircle2D(point2d(2, 3), 8);

      sketch = { ...sketch, elements: [
          { id: 'inner', geometry: inner.result!, construction: false },
          { id: 'outer', geometry: outer.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'concentric', circle1: { elementId: 'inner' }, circle2: { elementId: 'outer' } },
        { type: 'fixed', point: { elementId: 'inner', which: 'center' }, position: point2d(0, 0) },
        { type: 'radius', circle: { elementId: 'inner' }, value: 5 },
        { type: 'radius', circle: { elementId: 'outer' }, value: 10 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      const innerCenter = getPointFromSketch(solved, 'inner', 'center');
      const outerCenter = getPointFromSketch(solved, 'outer', 'center');

      // Same center
      expect(innerCenter.x).toBeCloseTo(outerCenter.x, 4);
      expect(innerCenter.y).toBeCloseTo(outerCenter.y, 4);

      // At origin
      expect(innerCenter.x).toBeCloseTo(0, 4);
      expect(innerCenter.y).toBeCloseTo(0, 4);
    });
  });

  describe('Circle with Tangent Line', () => {
    it('creates a line tangent to a circle', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const circle = makeCircle2D(point2d(0, 0), 5);
      const line = makeLine2D(point2d(5, -10), point2d(5, 10));

      sketch = { ...sketch, elements: [
          { id: 'circle', geometry: circle.result!, construction: false },
          { id: 'line', geometry: line.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'tangent', curve1: { elementId: 'line' }, curve2: { elementId: 'circle' } },
        { type: 'fixed', point: { elementId: 'circle', which: 'center' }, position: point2d(0, 0) },
        { type: 'radius', circle: { elementId: 'circle' }, value: 5 },
        { type: 'vertical', line: { elementId: 'line' } },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Line should be at distance = radius from center
      const center = getPointFromSketch(solved, 'circle', 'center');
      const lineStart = getPointFromSketch(solved, 'line', 'start');
      const lineEnd = getPointFromSketch(solved, 'line', 'end');

      // For a vertical tangent line at x = 5 (or -5), the distance from (0,0) to the line is |x|
      const lineX = lineStart.x; // vertical line, both points have same x
      expect(lineStart.x).toBeCloseTo(lineEnd.x, 4); // Verify vertical

      const distToLine = Math.abs(lineX - center.x);
      expect(distToLine).toBeCloseTo(5, 3); // Equal to radius
    });
  });

  describe('DOF Tracking', () => {
    it('tracks DOF as constraints are added', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      // Line has 4 DOF (2 endpoints × 2 coords)
      expect(sketchDOF(sketch)).toBe(4);

      // Fixing start removes 2 DOF
      let result = addConstraint(sketch, {
        type: 'fixed',
        point: { elementId: 'line1', which: 'start' },
        position: point2d(0, 0),
      });
      sketch = result.result!.sketch;
      expect(sketchDOF(sketch)).toBe(2);

      // Horizontal removes 1 DOF
      result = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = result.result!.sketch;
      expect(sketchDOF(sketch)).toBe(1);

      // Length removes 1 DOF → fully constrained
      result = addConstraint(sketch, { type: 'length', line: { elementId: 'line1' }, value: 10 });
      sketch = result.result!.sketch;
      expect(sketchDOF(sketch)).toBe(0);
      expect(sketchIsFullyConstrained(sketch)).toBe(true);
    });
  });
});
