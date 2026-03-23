/**
 * Constrained sketch integration.
 *
 * Extends the basic Sketch type with constraint management and solving.
 *
 * @module sketch/constrained-sketch
 */

import { Plane } from '../core/plane';
import { Sketch, SketchElement, createSketch } from './sketch';
import {
  Constraint,
  ConstraintEntry,
  Parameter,
  SolveResult,
  SolveOptions,
} from '../constraints/types';
import { solve } from '../constraints/solver';
import {
  getDegreesOfFreedom,
  isFullyConstrained,
  isUnderConstrained,
  isOverConstrained,
  findRedundantConstraints,
  findUnconstrainedElements,
} from '../constraints/analysis';
import {
  createParameter,
  resolveValue,
  evaluateExpression,
  updateDependentParameters,
} from '../constraints/parameter';
import { OperationResult, success, failure } from '../mesh/mesh';

let nextConstraintId = 1;

// =============================================================================
// Constrained Sketch Type
// =============================================================================

/**
 * A sketch with constraints and parameters for parametric design.
 */
export interface ConstrainedSketch extends Sketch {
  /** All constraint entries. */
  readonly constraints: readonly ConstraintEntry[];
  /** Named parameters for dimensional constraints. */
  readonly parameters: Map<string, Parameter>;
}

// =============================================================================
// Creation
// =============================================================================

/**
 * Create an empty constrained sketch on a plane.
 *
 * @param plane - The 3D plane the sketch lives on
 * @returns A new ConstrainedSketch
 */
export function createConstrainedSketch(plane: Plane): ConstrainedSketch {
  return {
    plane,
    elements: [],
    constraints: [],
    parameters: new Map(),
  };
}

/**
 * Convert a basic Sketch to a ConstrainedSketch.
 *
 * @param sketch - The basic sketch
 * @returns A ConstrainedSketch with no constraints
 */
export function toConstrainedSketch(sketch: Sketch): ConstrainedSketch {
  return {
    ...sketch,
    constraints: [],
    parameters: new Map(),
  };
}

let nextElementId = 1;

/**
 * Add an element to a constrained sketch, preserving constraints and parameters.
 *
 * @param sketch - The constrained sketch
 * @param geometry - The curve to add
 * @param construction - Whether this is a construction element
 * @returns A new ConstrainedSketch with the element added
 */
export function addConstrainedElement(
  sketch: ConstrainedSketch,
  geometry: import('../geometry').Curve2D,
  construction: boolean = false,
): ConstrainedSketch {
  const element: SketchElement = {
    id: `elem_${nextElementId++}`,
    geometry,
    construction,
  };
  return {
    plane: sketch.plane,
    elements: [...sketch.elements, element],
    constraints: sketch.constraints,
    parameters: new Map(sketch.parameters),
  };
}

// =============================================================================
// Constraint Management
// =============================================================================

/**
 * Add a constraint to a sketch.
 *
 * @param sketch - The constrained sketch
 * @param constraint - The constraint to add
 * @param isConstruction - Whether this is a construction constraint (default: false)
 * @returns Result with updated sketch and constraint ID
 */
export function addConstraint(
  sketch: ConstrainedSketch,
  constraint: Constraint,
  isConstruction: boolean = false,
): OperationResult<{ sketch: ConstrainedSketch; constraintId: string }> {
  const id = `con_${nextConstraintId++}`;

  const entry: ConstraintEntry = {
    id,
    constraint,
    isConstruction,
  };

  const newSketch: ConstrainedSketch = {
    ...sketch,
    constraints: [...sketch.constraints, entry],
  };

  return success({ sketch: newSketch, constraintId: id });
}

/**
 * Remove a constraint from a sketch.
 *
 * @param sketch - The constrained sketch
 * @param constraintId - ID of the constraint to remove
 * @returns Result with updated sketch
 */
export function removeConstraint(
  sketch: ConstrainedSketch,
  constraintId: string,
): OperationResult<ConstrainedSketch> {
  const filtered = sketch.constraints.filter(c => c.id !== constraintId);

  if (filtered.length === sketch.constraints.length) {
    return failure(`Constraint not found: ${constraintId}`);
  }

  return success({
    ...sketch,
    constraints: filtered,
  });
}

/**
 * Get a constraint by ID.
 *
 * @param sketch - The constrained sketch
 * @param constraintId - ID of the constraint
 * @returns The constraint entry, or undefined if not found
 */
export function getConstraint(
  sketch: ConstrainedSketch,
  constraintId: string,
): ConstraintEntry | undefined {
  return sketch.constraints.find(c => c.id === constraintId);
}

/**
 * Update a dimensional constraint's value.
 *
 * @param sketch - The constrained sketch
 * @param constraintId - ID of the constraint to update
 * @param newValue - New numeric value
 * @returns Result with updated sketch
 */
export function updateConstraintValue(
  sketch: ConstrainedSketch,
  constraintId: string,
  newValue: number,
): OperationResult<ConstrainedSketch> {
  const entry = sketch.constraints.find(c => c.id === constraintId);
  if (!entry) {
    return failure(`Constraint not found: ${constraintId}`);
  }

  const constraint = entry.constraint;

  // Check if this is a dimensional constraint with a value
  if (!('value' in constraint)) {
    return failure('Constraint does not have a numeric value');
  }

  // Create updated constraint
  const updatedConstraint = { ...constraint, value: newValue };
  const updatedEntry: ConstraintEntry = {
    ...entry,
    constraint: updatedConstraint as Constraint,
  };

  const newConstraints = sketch.constraints.map(c =>
    c.id === constraintId ? updatedEntry : c,
  );

  return success({
    ...sketch,
    constraints: newConstraints,
  });
}

// =============================================================================
// Parameter Management
// =============================================================================

/**
 * Add a named parameter to the sketch.
 *
 * @param sketch - The constrained sketch
 * @param name - Human-readable parameter name
 * @param value - Initial numeric value
 * @param expression - Optional expression (e.g., "width * 2")
 * @returns Result with updated sketch and parameter ID
 */
export function addSketchParameter(
  sketch: ConstrainedSketch,
  name: string,
  value: number,
  expression?: string,
): OperationResult<{ sketch: ConstrainedSketch; parameterId: string }> {
  // Check for duplicate name
  for (const param of Array.from(sketch.parameters.values())) {
    if (param.name === name) {
      return failure(`Parameter name already exists: ${name}`);
    }
  }

  const param = createParameter(name, value, expression);
  const newParams = new Map(sketch.parameters);
  newParams.set(param.id, param);

  return success({
    sketch: { ...sketch, parameters: newParams },
    parameterId: param.id,
  });
}

/**
 * Update a parameter's value.
 *
 * @param sketch - The constrained sketch
 * @param nameOrId - Parameter name or ID
 * @param value - New value
 * @returns Result with updated sketch
 */
export function setSketchParameter(
  sketch: ConstrainedSketch,
  nameOrId: string,
  value: number,
): OperationResult<ConstrainedSketch> {
  const newParams = new Map(sketch.parameters);
  let found = false;

  for (const [id, param] of Array.from(newParams)) {
    if (id === nameOrId || param.name === nameOrId) {
      newParams.set(id, { ...param, value, expression: undefined });
      found = true;
      break;
    }
  }

  if (!found) {
    return failure(`Parameter not found: ${nameOrId}`);
  }

  // Update dependent parameters
  try {
    updateDependentParameters(newParams);
  } catch (e) {
    return failure(`Failed to update parameters: ${e}`);
  }

  return success({ ...sketch, parameters: newParams });
}

/**
 * Update a parameter's expression.
 *
 * @param sketch - The constrained sketch
 * @param nameOrId - Parameter name or ID
 * @param expression - New expression
 * @returns Result with updated sketch
 */
export function setSketchParameterExpression(
  sketch: ConstrainedSketch,
  nameOrId: string,
  expression: string,
): OperationResult<ConstrainedSketch> {
  const newParams = new Map(sketch.parameters);
  let found = false;

  for (const [id, param] of Array.from(newParams)) {
    if (id === nameOrId || param.name === nameOrId) {
      // Evaluate the expression to get the new value
      try {
        const value = evaluateExpression(expression, newParams);
        newParams.set(id, { ...param, value, expression });
        found = true;
      } catch (e) {
        return failure(`Failed to evaluate expression: ${e}`);
      }
      break;
    }
  }

  if (!found) {
    return failure(`Parameter not found: ${nameOrId}`);
  }

  return success({ ...sketch, parameters: newParams });
}

/**
 * Get a parameter by name or ID.
 *
 * @param sketch - The constrained sketch
 * @param nameOrId - Parameter name or ID
 * @returns The parameter, or undefined if not found
 */
export function getSketchParameter(
  sketch: ConstrainedSketch,
  nameOrId: string,
): Parameter | undefined {
  for (const [id, param] of Array.from(sketch.parameters)) {
    if (id === nameOrId || param.name === nameOrId) {
      return param;
    }
  }
  return undefined;
}

// =============================================================================
// Solving
// =============================================================================

/**
 * Solve constraints and update element positions.
 *
 * @param sketch - The constrained sketch
 * @param options - Solver options
 * @returns Result with solve result and updated sketch
 */
export function solveSketch(
  sketch: ConstrainedSketch,
  options?: SolveOptions,
): OperationResult<{ result: SolveResult; sketch: ConstrainedSketch }> {
  // Update dependent parameters first
  const newParams = new Map(sketch.parameters);
  try {
    updateDependentParameters(newParams);
  } catch (e) {
    return failure(`Failed to update parameters: ${e}`);
  }

  const sketchWithUpdatedParams: ConstrainedSketch = {
    ...sketch,
    parameters: newParams,
  };

  // Run the solver
  const { result, updatedSketch } = solve(
    sketchWithUpdatedParams,
    [...sketch.constraints],
    newParams,
    options,
  );

  const finalSketch: ConstrainedSketch = {
    ...updatedSketch,
    constraints: sketch.constraints,
    parameters: newParams,
  };

  return success({ result, sketch: finalSketch });
}

// =============================================================================
// Analysis
// =============================================================================

/**
 * Get the degrees of freedom for a constrained sketch.
 */
export function sketchDOF(sketch: ConstrainedSketch): number {
  return getDegreesOfFreedom(sketch, [...sketch.constraints]);
}

/**
 * Check if sketch is fully constrained.
 */
export function sketchIsFullyConstrained(sketch: ConstrainedSketch): boolean {
  return isFullyConstrained(sketch, [...sketch.constraints]);
}

/**
 * Check if sketch is under-constrained.
 */
export function sketchIsUnderConstrained(sketch: ConstrainedSketch): boolean {
  return isUnderConstrained(sketch, [...sketch.constraints]);
}

/**
 * Check if sketch is over-constrained.
 */
export function sketchIsOverConstrained(sketch: ConstrainedSketch): boolean {
  return isOverConstrained(sketch, [...sketch.constraints], sketch.parameters);
}

/**
 * Find redundant constraints.
 */
export function sketchRedundantConstraints(sketch: ConstrainedSketch): string[] {
  return findRedundantConstraints(
    sketch,
    [...sketch.constraints],
    sketch.parameters,
  );
}

/**
 * Find unconstrained elements.
 */
export function sketchUnconstrainedElements(sketch: ConstrainedSketch): string[] {
  return findUnconstrainedElements(sketch, [...sketch.constraints]);
}
