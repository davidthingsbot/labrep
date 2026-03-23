/**
 * Newton-Raphson constraint solver.
 *
 * @module constraints/solver
 */

import { Point2D, point2d } from '../core';
import { Sketch, SketchElement } from '../sketch/sketch';
import { makeLine2D } from '../geometry/line2d';
import { makeCircle2D } from '../geometry/circle2d';
import { makeArc2D } from '../geometry/arc2d';
import { Line2D } from '../geometry/line2d';
import { Circle2D } from '../geometry/circle2d';
import { Arc2D } from '../geometry/arc2d';
import {
  Constraint,
  ConstraintEntry,
  Parameter,
  SolveResult,
  SolveStatus,
  ConstraintDiagnostic,
  SolveOptions,
} from './types';
import {
  ResidualEquation,
  VariableState,
  varKey,
  getConstraintEquations,
  initializeState,
  computeResidual,
  computeResidualVector,
} from './equations';
import {
  Matrix,
  Vector,
  buildJacobian,
  pseudoInverseSolve,
  solveDamped,
  norm,
  negateVec,
} from './jacobian';

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-10;
const DEFAULT_DAMPING = 0.001;

// =============================================================================
// Solver State
// =============================================================================

/**
 * Internal solver state for step-by-step visualization.
 */
export interface SolverState {
  iteration: number;
  residual: number;
  converged: boolean;
  state: VariableState;
  equations: ResidualEquation[];
  variableKeys: string[];
}

// =============================================================================
// Main Solver
// =============================================================================

/**
 * Solve constraints on a sketch using Newton-Raphson iteration.
 *
 * The solver modifies element positions to satisfy all constraints.
 * Returns a SolveResult with status and diagnostics.
 *
 * @param sketch - The sketch to solve (elements will be modified)
 * @param constraints - Constraint entries to satisfy
 * @param parameters - Parameter definitions
 * @param options - Solver options
 * @returns SolveResult with status, DOF, iterations, etc.
 */
export function solve(
  sketch: Sketch,
  constraints: ConstraintEntry[],
  parameters: Map<string, Parameter>,
  options?: SolveOptions,
): { result: SolveResult; updatedSketch: Sketch } {
  const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;
  const damping = options?.dampingFactor ?? DEFAULT_DAMPING;

  // Initialize state from sketch geometry
  let state = initializeState(sketch);

  // Build all equations from constraints
  const equations: ResidualEquation[] = [];
  const constraintToEquations = new Map<string, number[]>();

  for (const entry of constraints) {
    if (entry.isConstruction) continue; // Skip construction constraints

    const eqs = getConstraintEquations(entry.constraint, sketch);
    const startIdx = equations.length;
    equations.push(...eqs);
    constraintToEquations.set(entry.id, eqs.map((_, i) => startIdx + i));
  }

  // Get all variable keys
  const variableKeys = extractVariableKeys(state);

  // No equations means nothing to solve
  if (equations.length === 0) {
    const dof = computeDOF(sketch, constraints);
    return {
      result: {
        status: dof === 0 ? 'solved' : 'underConstrained',
        degreesOfFreedom: dof,
        iterations: 0,
        residual: 0,
        diagnostics: [],
      },
      updatedSketch: sketch,
    };
  }

  // Newton-Raphson iteration
  let prevResidual = Infinity;
  let iteration = 0;
  let converged = false;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    // Compute residual vector
    const residualVec = computeResidualVector(equations, state, parameters);
    const residual = norm(residualVec);

    // Check convergence
    if (residual < tolerance) {
      converged = true;
      break;
    }

    // Check if stuck
    if (Math.abs(residual - prevResidual) < tolerance * 0.01 && residual > tolerance) {
      // Not converging, but residual is small enough
      if (residual < tolerance * 100) {
        converged = true;
      }
      break;
    }

    prevResidual = residual;

    // Build Jacobian
    const J = buildJacobian(equations, state, variableKeys, parameters);

    // Solve for update: J × Δx = -residual
    const negResidual = negateVec(residualVec);

    let deltaX: Vector;
    if (equations.length === variableKeys.length) {
      // Square system: use direct solve with damping
      deltaX = solveDamped(J, negResidual, damping);
    } else {
      // Non-square: use pseudo-inverse
      deltaX = pseudoInverseSolve(J, negResidual);
    }

    // Line search: try full step, then halve if needed
    let alpha = 1.0;
    const originalValues = new Map(state.values);

    for (let ls = 0; ls < 10; ls++) {
      // Apply update
      for (let i = 0; i < variableKeys.length; i++) {
        const key = variableKeys[i];
        const original = originalValues.get(key)!;
        state.values.set(key, original + alpha * deltaX[i]);
      }

      const newResidual = computeResidual(equations, state, parameters);

      if (newResidual < residual * 1.5) {
        // Accept this step
        break;
      }

      // Reduce step size
      alpha *= 0.5;
    }
  }

  // Build diagnostics
  const finalResidualVec = computeResidualVector(equations, state, parameters);
  const diagnostics = buildDiagnostics(constraints, constraintToEquations, finalResidualVec, tolerance);

  // Compute DOF
  const dof = computeDOF(sketch, constraints);

  // Determine status
  let status: SolveStatus;
  const finalResidual = norm(finalResidualVec);

  if (converged && finalResidual < tolerance * 100) {
    status = dof === 0 ? 'solved' : 'underConstrained';
  } else if (finalResidual < tolerance * 1000) {
    status = 'underConstrained';
  } else {
    // Check for over-constrained
    const satisfied = diagnostics.filter(d => d.status === 'satisfied').length;
    if (satisfied < constraints.length * 0.5) {
      status = 'overConstrained';
    } else {
      status = 'failed';
    }
  }

  // Update sketch geometry from state
  const updatedSketch = updateSketchFromState(sketch, state);

  return {
    result: {
      status,
      degreesOfFreedom: dof,
      iterations: iteration,
      residual: finalResidual,
      diagnostics,
      conflictingConstraints: diagnostics
        .filter(d => d.status === 'conflicting')
        .map(d => d.constraintId),
      redundantConstraints: diagnostics
        .filter(d => d.status === 'redundant')
        .map(d => d.constraintId),
    },
    updatedSketch,
  };
}

/**
 * Solve a single step for visualization.
 *
 * @param solverState - Current solver state
 * @param parameters - Parameter definitions
 * @param damping - Damping factor
 * @returns Updated solver state
 */
export function solveStep(
  solverState: SolverState,
  parameters: Map<string, Parameter>,
  damping: number = DEFAULT_DAMPING,
): SolverState {
  const { state, equations, variableKeys } = solverState;

  if (solverState.converged) {
    return solverState;
  }

  // Compute residual vector
  const residualVec = computeResidualVector(equations, state, parameters);
  const residual = norm(residualVec);

  // Check convergence
  if (residual < DEFAULT_TOLERANCE) {
    return {
      ...solverState,
      converged: true,
      residual,
    };
  }

  // Build Jacobian
  const J = buildJacobian(equations, state, variableKeys, parameters);

  // Solve for update
  const negResidual = negateVec(residualVec);
  let deltaX: Vector;

  if (equations.length === variableKeys.length) {
    deltaX = solveDamped(J, negResidual, damping);
  } else {
    deltaX = pseudoInverseSolve(J, negResidual);
  }

  // Apply update (no line search for visualization)
  const newValues = new Map(state.values);
  for (let i = 0; i < variableKeys.length; i++) {
    const key = variableKeys[i];
    const original = newValues.get(key)!;
    newValues.set(key, original + 0.5 * deltaX[i]); // Half step for stability
  }

  return {
    ...solverState,
    iteration: solverState.iteration + 1,
    residual,
    state: { values: newValues },
  };
}

/**
 * Initialize solver state for step-by-step solving.
 */
export function initSolverState(
  sketch: Sketch,
  constraints: ConstraintEntry[],
): SolverState {
  const state = initializeState(sketch);
  const equations: ResidualEquation[] = [];

  for (const entry of constraints) {
    if (entry.isConstruction) continue;
    equations.push(...getConstraintEquations(entry.constraint, sketch));
  }

  const variableKeys = extractVariableKeys(state);
  const residual = computeResidual(equations, state, new Map());

  return {
    iteration: 0,
    residual,
    converged: residual < DEFAULT_TOLERANCE,
    state,
    equations,
    variableKeys,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract all variable keys from the state.
 */
function extractVariableKeys(state: VariableState): string[] {
  return Array.from(state.values.keys());
}

/**
 * Build diagnostic information for each constraint.
 */
function buildDiagnostics(
  constraints: ConstraintEntry[],
  constraintToEquations: Map<string, number[]>,
  residualVec: number[],
  tolerance: number,
): ConstraintDiagnostic[] {
  const diagnostics: ConstraintDiagnostic[] = [];

  for (const entry of constraints) {
    const eqIndices = constraintToEquations.get(entry.id);

    if (!eqIndices || eqIndices.length === 0) {
      diagnostics.push({
        constraintId: entry.id,
        status: entry.isConstruction ? 'satisfied' : 'redundant',
        error: 0,
      });
      continue;
    }

    // Sum of squared residuals for this constraint
    let error = 0;
    for (const idx of eqIndices) {
      if (idx < residualVec.length) {
        error += residualVec[idx] * residualVec[idx];
      }
    }
    error = Math.sqrt(error);

    let status: 'satisfied' | 'violated' | 'redundant' | 'conflicting';
    if (error < tolerance) {
      status = 'satisfied';
    } else if (error < tolerance * 100) {
      status = 'satisfied'; // Close enough
    } else if (error < tolerance * 10000) {
      status = 'violated';
    } else {
      status = 'conflicting';
    }

    diagnostics.push({
      constraintId: entry.id,
      status,
      error,
    });
  }

  return diagnostics;
}

/**
 * Compute degrees of freedom.
 */
function computeDOF(sketch: Sketch, constraints: ConstraintEntry[]): number {
  let dof = 0;

  // Count DOF from elements
  for (const element of sketch.elements) {
    switch (element.geometry.type) {
      case 'line':
        dof += 4; // Two points × 2 coords
        break;
      case 'circle':
        dof += 3; // Center (2) + radius (1)
        break;
      case 'arc':
        dof += 5; // Center (2) + radius (1) + angles (2)
        break;
    }
  }

  // Subtract DOF consumed by constraints
  for (const entry of constraints) {
    if (entry.isConstruction) continue;
    dof -= constraintDOF(entry.constraint);
  }

  return Math.max(0, dof);
}

/**
 * Get the DOF consumed by a constraint type.
 */
function constraintDOF(constraint: Constraint): number {
  switch (constraint.type) {
    case 'coincident':
      return 2;
    case 'fixed':
      return 2;
    case 'horizontal':
    case 'vertical':
    case 'parallel':
    case 'perpendicular':
    case 'pointOnLine':
    case 'distance':
    case 'horizontalDistance':
    case 'verticalDistance':
    case 'angle':
    case 'radius':
    case 'diameter':
    case 'length':
    case 'tangent':
    case 'equal':
      return 1;
    case 'concentric':
    case 'midpoint':
    case 'symmetric':
    case 'collinear':
      return 2;
    case 'pointOnCircle':
      return 1;
    default:
      return 0;
  }
}

/**
 * Update sketch geometry from solver state.
 */
function updateSketchFromState(sketch: Sketch, state: VariableState): Sketch {
  const newElements: SketchElement[] = [];

  for (const element of sketch.elements) {
    const geom = element.geometry;

    switch (geom.type) {
      case 'line': {
        const start = point2d(
          state.values.get(varKey(element.id, 'start', 'x')) ?? geom.startPoint.x,
          state.values.get(varKey(element.id, 'start', 'y')) ?? geom.startPoint.y,
        );
        const end = point2d(
          state.values.get(varKey(element.id, 'end', 'x')) ?? geom.endPoint.x,
          state.values.get(varKey(element.id, 'end', 'y')) ?? geom.endPoint.y,
        );

        const newLineResult = makeLine2D(start, end);
        if (newLineResult.success && newLineResult.result) {
          newElements.push({
            id: element.id,
            geometry: newLineResult.result,
            construction: element.construction,
          });
        } else {
          newElements.push(element); // Keep original if invalid
        }
        break;
      }

      case 'circle': {
        const center = point2d(
          state.values.get(varKey(element.id, 'center', 'x')) ?? geom.center.x,
          state.values.get(varKey(element.id, 'center', 'y')) ?? geom.center.y,
        );
        const radius = state.values.get(varKey(element.id, 'center', 'radius')) ?? geom.radius;

        const newCircleResult = makeCircle2D(center, Math.max(0.001, radius));
        if (newCircleResult.success && newCircleResult.result) {
          newElements.push({
            id: element.id,
            geometry: newCircleResult.result,
            construction: element.construction,
          });
        } else {
          newElements.push(element);
        }
        break;
      }

      case 'arc': {
        const center = point2d(
          state.values.get(varKey(element.id, 'center', 'x')) ?? geom.center.x,
          state.values.get(varKey(element.id, 'center', 'y')) ?? geom.center.y,
        );
        const radius = state.values.get(varKey(element.id, 'center', 'radius')) ?? geom.radius;

        const newArcResult = makeArc2D(
          center,
          Math.max(0.001, radius),
          geom.startAngle,
          geom.endAngle,
        );
        if (newArcResult.success && newArcResult.result) {
          newElements.push({
            id: element.id,
            geometry: newArcResult.result,
            construction: element.construction,
          });
        } else {
          newElements.push(element);
        }
        break;
      }
    }
  }

  return {
    plane: sketch.plane,
    elements: newElements,
  };
}
