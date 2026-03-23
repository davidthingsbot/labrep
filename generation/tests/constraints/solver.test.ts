import { describe, it, expect } from 'vitest';
import { point2d } from '../../src/core';
import { XY_PLANE } from '../../src/core/plane';
import { makeLine2D } from '../../src/geometry/line2d';
import { makeCircle2D } from '../../src/geometry/circle2d';
import {
  createConstrainedSketch,
  addConstraint,
  solveSketch,
} from '../../src/sketch/constrained-sketch';
import { solve, initSolverState, solveStep } from '../../src/constraints/solver';
import { Constraint, SolveStatus } from '../../src/constraints/types';

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

describe('Constraint Solver', () => {
  describe('Convergence', () => {
    it('converges for simple horizontal constraint', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const result = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = result.result!.sketch;

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);
      expect(solveResult.result!.result.residual).toBeLessThan(1e-6);
    });

    it('converges for already-satisfied constraints', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 5), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const result = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = result.result!.sketch;

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);
      expect(solveResult.result!.result.iterations).toBeLessThan(5);
      expect(solveResult.result!.result.residual).toBeLessThan(1e-8);
    });

    it('converges from far-from-solution initial positions', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      // Line very far from target
      const line = makeLine2D(point2d(100, 200), point2d(300, -150));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch, { maxIterations: 200 });
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;
      const start = getPointFromSketch(solved, 'line1', 'start');
      const end = getPointFromSketch(solved, 'line1', 'end');

      expect(start.x).toBeCloseTo(0, 3);
      expect(start.y).toBeCloseTo(0, 3);
      expect(end.x).toBeCloseTo(10, 3);
      expect(end.y).toBeCloseTo(0, 3);
    });

    it('reports failure when max iterations exceeded', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      // Create conflicting constraints that can't be satisfied
      const line = makeLine2D(point2d(0, 0), point2d(10, 0));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      // Both horizontal AND vertical is impossible for a non-zero-length line
      const constraints: Constraint[] = [
        { type: 'horizontal', line: { elementId: 'line1' } },
        { type: 'vertical', line: { elementId: 'line1' } },
        { type: 'length', line: { elementId: 'line1' }, value: 10 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch, { maxIterations: 50 });
      expect(solveResult.success).toBe(true);

      // Should detect as over-constrained or failed
      const status = solveResult.result!.result.status;
      expect(['overConstrained', 'failed']).toContain(status);
    });
  });

  describe('Step-by-Step Solving', () => {
    it('allows stepping through solver iterations', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const result = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = result.result!.sketch;

      // Initialize solver state
      let state = initSolverState(sketch, [...sketch.constraints]);

      expect(state.iteration).toBe(0);
      expect(state.converged).toBe(false);

      // Step a few times
      const params = new Map();
      for (let i = 0; i < 10 && !state.converged; i++) {
        const prevResidual = state.residual;
        state = solveStep(state, params);
        expect(state.iteration).toBe(i + 1);

        // Residual should generally decrease (or at least not explode)
        if (i > 0) {
          expect(state.residual).toBeLessThan(prevResidual * 10);
        }
      }

      // Should converge eventually
      expect(state.converged || state.residual < 0.01).toBe(true);
    });
  });

  describe('Solver Options', () => {
    it('respects maxIterations option', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 50));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const result = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = result.result!.sketch;

      const solveResult = solveSketch(sketch, { maxIterations: 3 });
      expect(solveResult.success).toBe(true);
      expect(solveResult.result!.result.iterations).toBeLessThanOrEqual(3);
    });

    it('respects tolerance option', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 0.001));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const result = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = result.result!.sketch;

      // With loose tolerance, should converge faster
      const solveResult = solveSketch(sketch, { tolerance: 0.01 });
      expect(solveResult.success).toBe(true);
      expect(solveResult.result!.result.residual).toBeLessThan(0.1);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty constraint list', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      // No constraints
      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);
      expect(solveResult.result!.result.status).toBe('underConstrained');
      expect(solveResult.result!.result.iterations).toBe(0);
    });

    it('handles empty sketch', () => {
      const sketch = createConstrainedSketch(XY_PLANE);

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);
    });

    it('handles near-coincident points', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      // Points already very close
      const line1 = makeLine2D(point2d(0, 0), point2d(10, 0));
      const line2 = makeLine2D(point2d(10.0001, 0.0001), point2d(20, 0));

      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        { type: 'coincident', point1: { elementId: 'line1', which: 'end' }, point2: { elementId: 'line2', which: 'start' } },
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'fixed', point: { elementId: 'line1', which: 'end' }, position: point2d(10, 0) },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);
      expect(solveResult.result!.result.residual).toBeLessThan(1e-6);
    });

    it('handles very small values', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(0.001, 0));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const constraints: Constraint[] = [
        { type: 'length', line: { elementId: 'line1' }, value: 0.01 },
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
      const end = getPointFromSketch(solved, 'line1', 'end');

      expect(end.x).toBeCloseTo(0.01, 4);
    });

    it('handles construction constraints (ignored)', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 5));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      // Add a construction constraint (should be ignored)
      const result = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } }, true);
      sketch = result.result!.sketch;

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      // Line should NOT be horizontal since constraint was construction
      const solved = solveResult.result!.sketch;
      const start = getPointFromSketch(solved, 'line1', 'start');
      const end = getPointFromSketch(solved, 'line1', 'end');

      // Original geometry preserved (approximately)
      expect(Math.abs(end.y - start.y)).toBeGreaterThan(1);
    });
  });

  describe('Diagnostics', () => {
    it('provides per-constraint diagnostics', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 0));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      const r1 = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = r1.result!.sketch;
      const conId = r1.result!.constraintId;

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const diagnostics = solveResult.result!.result.diagnostics;
      expect(diagnostics.length).toBeGreaterThan(0);

      const horizDiag = diagnostics.find(d => d.constraintId === conId);
      expect(horizDiag).toBeDefined();
      expect(horizDiag!.status).toBe('satisfied');
      expect(horizDiag!.error).toBeLessThan(1e-6);
    });

    it('identifies violated constraints', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line = makeLine2D(point2d(0, 0), point2d(10, 0));
      sketch = { ...sketch, elements: [{ id: 'line1', geometry: line.result!, construction: false }] };

      // Add conflicting constraints
      let r1 = addConstraint(sketch, { type: 'horizontal', line: { elementId: 'line1' } });
      sketch = r1.result!.sketch;

      let r2 = addConstraint(sketch, { type: 'vertical', line: { elementId: 'line1' } });
      sketch = r2.result!.sketch;

      let r3 = addConstraint(sketch, { type: 'length', line: { elementId: 'line1' }, value: 10 });
      sketch = r3.result!.sketch;

      const solveResult = solveSketch(sketch, { maxIterations: 20 });
      expect(solveResult.success).toBe(true);

      // At least one constraint should be violated
      const diagnostics = solveResult.result!.result.diagnostics;
      const violated = diagnostics.filter(d => d.status === 'violated' || d.status === 'conflicting');
      expect(violated.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Elements', () => {
    it('solves constraints across multiple elements', () => {
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(0, 0), point2d(5, 0));
      const line2 = makeLine2D(point2d(6, 1), point2d(11, 1));
      const line3 = makeLine2D(point2d(12, 2), point2d(17, 2));

      sketch = { ...sketch, elements: [
          { id: 'line1', geometry: line1.result!, construction: false },
          { id: 'line2', geometry: line2.result!, construction: false },
          { id: 'line3', geometry: line3.result!, construction: false },
        ] };

      const constraints: Constraint[] = [
        // Chain them together
        { type: 'coincident', point1: { elementId: 'line1', which: 'end' }, point2: { elementId: 'line2', which: 'start' } },
        { type: 'coincident', point1: { elementId: 'line2', which: 'end' }, point2: { elementId: 'line3', which: 'start' } },

        // All parallel
        { type: 'parallel', line1: { elementId: 'line1' }, line2: { elementId: 'line2' } },
        { type: 'parallel', line1: { elementId: 'line2' }, line2: { elementId: 'line3' } },

        // All same length
        { type: 'equal', element1: 'line1', element2: 'line2' },
        { type: 'equal', element1: 'line2', element2: 'line3' },

        // Anchor
        { type: 'fixed', point: { elementId: 'line1', which: 'start' }, position: point2d(0, 0) },
        { type: 'horizontal', line: { elementId: 'line1' } },
        { type: 'length', line: { elementId: 'line1' }, value: 5 },
      ];

      for (const c of constraints) {
        const r = addConstraint(sketch, c);
        sketch = r.result!.sketch;
      }

      const solveResult = solveSketch(sketch);
      expect(solveResult.success).toBe(true);

      const solved = solveResult.result!.sketch;

      // Check chain connectivity
      const l1End = getPointFromSketch(solved, 'line1', 'end');
      const l2Start = getPointFromSketch(solved, 'line2', 'start');
      expect(l1End.x).toBeCloseTo(l2Start.x, 3);
      expect(l1End.y).toBeCloseTo(l2Start.y, 3);

      // Check they're all horizontal
      const l2End = getPointFromSketch(solved, 'line2', 'end');
      const l3Start = getPointFromSketch(solved, 'line3', 'start');
      expect(l2End.y).toBeCloseTo(l3Start.y, 3);
    });
  });
});
