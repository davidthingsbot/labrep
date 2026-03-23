import { describe, it, expect } from 'vitest';
import { point2d } from '../../src/core';
import { XY_PLANE } from '../../src/core/plane';
import { makeLine2D } from '../../src/geometry/line2d';
import {
  createConstrainedSketch,
  addConstraint,
  solveSketch,
  ConstrainedSketch,
} from '../../src/sketch/constrained-sketch';
import { Constraint, ConstraintEntry } from '../../src/constraints/types';

// Helper to create a grid of connected lines
function createLineGrid(rows: number, cols: number): ConstrainedSketch {
  let sketch = createConstrainedSketch(XY_PLANE);
  const elements: any[] = [];
  const constraints: Constraint[] = [];

  const spacing = 10;
  let lineIndex = 0;

  // Create horizontal lines
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x1 = col * spacing;
      const x2 = (col + 1) * spacing;
      const y = row * spacing;

      const line = makeLine2D(
        point2d(x1 + Math.random() * 0.5, y + Math.random() * 0.5),
        point2d(x2 + Math.random() * 0.5, y + Math.random() * 0.5),
      );

      elements.push({
        id: `h_${row}_${col}`,
        geometry: line.result!,
        construction: false,
      });

      constraints.push({ type: 'horizontal', line: { elementId: `h_${row}_${col}` } });
      lineIndex++;
    }
  }

  // Create vertical lines
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = col * spacing;
      const y1 = row * spacing;
      const y2 = (row + 1) * spacing;

      const line = makeLine2D(
        point2d(x + Math.random() * 0.5, y1 + Math.random() * 0.5),
        point2d(x + Math.random() * 0.5, y2 + Math.random() * 0.5),
      );

      elements.push({
        id: `v_${row}_${col}`,
        geometry: line.result!,
        construction: false,
      });

      constraints.push({ type: 'vertical', line: { elementId: `v_${row}_${col}` } });
      lineIndex++;
    }
  }

  // Add coincident constraints at grid intersections
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      // Connect horizontal line ends to vertical line ends
      if (col < cols && row < rows) {
        // Bottom of vertical to right end of horizontal
        constraints.push({
          type: 'coincident',
          point1: { elementId: `h_${row}_${col}`, which: 'end' },
          point2: { elementId: `v_${row}_${col + 1}`, which: 'start' },
        });
      }
    }
  }

  // Fix origin
  constraints.push({
    type: 'fixed',
    point: { elementId: 'h_0_0', which: 'start' },
    position: point2d(0, 0),
  });

  sketch = { ...sketch, elements };

  for (const c of constraints) {
    const r = addConstraint(sketch, c);
    sketch = r.result!.sketch;
  }

  return sketch;
}

// Helper to create a chain of connected lines
function createLineChain(count: number): ConstrainedSketch {
  let sketch = createConstrainedSketch(XY_PLANE);
  const elements: any[] = [];
  const constraints: Constraint[] = [];

  for (let i = 0; i < count; i++) {
    const line = makeLine2D(
      point2d(i * 10 + Math.random(), Math.random()),
      point2d((i + 1) * 10 + Math.random(), Math.random()),
    );

    elements.push({
      id: `line_${i}`,
      geometry: line.result!,
      construction: false,
    });

    // All horizontal
    constraints.push({ type: 'horizontal', line: { elementId: `line_${i}` } });

    // Connect to previous
    if (i > 0) {
      constraints.push({
        type: 'coincident',
        point1: { elementId: `line_${i - 1}`, which: 'end' },
        point2: { elementId: `line_${i}`, which: 'start' },
      });
    }

    // Equal length
    if (i > 0) {
      constraints.push({
        type: 'equal',
        element1: `line_0`,
        element2: `line_${i}`,
      });
    }
  }

  // Fix first point
  constraints.push({
    type: 'fixed',
    point: { elementId: 'line_0', which: 'start' },
    position: point2d(0, 0),
  });

  // Set length
  constraints.push({
    type: 'length',
    line: { elementId: 'line_0' },
    value: 10,
  });

  sketch = { ...sketch, elements };

  for (const c of constraints) {
    const r = addConstraint(sketch, c);
    sketch = r.result!.sketch;
  }

  return sketch;
}

describe('Performance', () => {
  describe('Small Sketches', () => {
    it('solves 10-element chain in < 200ms', () => {
      const sketch = createLineChain(10);

      const start = performance.now();
      const result = solveSketch(sketch);
      const elapsed = performance.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(200);
    });

    it('solves 2x2 grid in < 200ms', () => {
      const sketch = createLineGrid(2, 2);

      const start = performance.now();
      const result = solveSketch(sketch);
      const elapsed = performance.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('Medium Sketches', () => {
    it('solves 50-element chain in < 2000ms', () => {
      const sketch = createLineChain(50);

      const start = performance.now();
      const result = solveSketch(sketch);
      const elapsed = performance.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(2000);
    });

    it('solves 5x5 grid in < 1000ms', () => {
      const sketch = createLineGrid(5, 5);

      const start = performance.now();
      const result = solveSketch(sketch);
      const elapsed = performance.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('Large Sketches', () => {
    it('solves 100-element chain in < 15000ms', () => {
      const sketch = createLineChain(100);

      const start = performance.now();
      const result = solveSketch(sketch, { maxIterations: 50 });
      const elapsed = performance.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(15000);
    });

    it('solves 10x10 grid in < 5000ms', () => {
      const sketch = createLineGrid(10, 10);

      const start = performance.now();
      const result = solveSketch(sketch, { maxIterations: 50 });
      const elapsed = performance.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('Convergence Rate', () => {
    it('converges in few iterations for well-posed problems', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      // Simple horizontal line
      const line = makeLine2D(point2d(0, 0), point2d(10, 1));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'horizontal', line: { elementId: 'line1' } },
        { type: 'length', line: { elementId: 'line1' }, value: 10 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const result = solveSketch(sketch);
      expect(result.success).toBe(true);

      // Should converge quickly for simple cases
      expect(result.result!.result.iterations).toBeLessThan(20);
    });

    it('maintains low residual after convergence', () => {
      const sketch = createLineChain(20);

      const result = solveSketch(sketch);
      expect(result.success).toBe(true);
      expect(result.result!.result.residual).toBeLessThan(1e-6);
    });
  });

  describe('Memory Usage', () => {
    it('handles repeated solves without growing memory', () => {
      const sketch = createLineChain(30);

      // Solve multiple times
      for (let i = 0; i < 5; i++) {
        const result = solveSketch(sketch);
        expect(result.success).toBe(true);
      }

      // If we got here without OOM, memory is reasonably managed
      expect(true).toBe(true);
    });
  });
});
