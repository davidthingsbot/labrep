/**
 * Constraint analysis functions.
 *
 * Provides DOF calculation, redundancy detection, and constraint status analysis.
 *
 * @module constraints/analysis
 */

import { Sketch } from '../sketch/sketch';
import { Constraint, ConstraintEntry, Parameter } from './types';
import {
  ResidualEquation,
  getConstraintEquations,
  initializeState,
  computeResidualVector,
} from './equations';
import { buildJacobian, estimateRank, norm } from './jacobian';

// =============================================================================
// DOF Calculation
// =============================================================================

/**
 * Calculate the degrees of freedom for a sketch element.
 */
function elementDOF(elementType: 'line' | 'circle' | 'arc'): number {
  switch (elementType) {
    case 'line':
      return 4; // Two points × 2 coordinates
    case 'circle':
      return 3; // Center (2) + radius (1)
    case 'arc':
      return 5; // Center (2) + radius (1) + angles (2)
  }
}

/**
 * Calculate the degrees of freedom consumed by a constraint.
 */
function constraintDOFConsumed(constraint: Constraint): number {
  switch (constraint.type) {
    case 'coincident':
      return 2; // Two equations (X and Y)
    case 'fixed':
      return 2; // Two equations (X and Y)
    case 'horizontal':
    case 'vertical':
      return 1; // One equation
    case 'parallel':
    case 'perpendicular':
      return 1;
    case 'pointOnLine':
    case 'pointOnCircle':
      return 1;
    case 'distance':
    case 'horizontalDistance':
    case 'verticalDistance':
      return 1;
    case 'angle':
      return 1;
    case 'radius':
    case 'diameter':
    case 'length':
      return 1;
    case 'tangent':
      return 1;
    case 'equal':
      return 1;
    case 'concentric':
      return 2; // X and Y coincidence
    case 'symmetric':
      return 2; // Midpoint on axis + perpendicular
    case 'midpoint':
      return 2; // X and Y midpoint
    case 'collinear':
      return 2; // Two points on line
  }
}

/**
 * Calculate the total degrees of freedom for a constrained sketch.
 *
 * DOF = (sum of element DOFs) - (sum of constraint DOFs consumed)
 *
 * @param sketch - The sketch
 * @param constraints - Active constraints
 * @returns Degrees of freedom (0 = fully constrained, >0 = under-constrained)
 */
export function getDegreesOfFreedom(
  sketch: Sketch,
  constraints: ConstraintEntry[],
): number {
  // Sum element DOFs
  let totalDOF = 0;
  for (const element of sketch.elements) {
    totalDOF += elementDOF(element.geometry.type);
  }

  // Subtract constraint DOFs
  for (const entry of constraints) {
    if (!entry.isConstruction) {
      totalDOF -= constraintDOFConsumed(entry.constraint);
    }
  }

  return Math.max(0, totalDOF);
}

/**
 * Check if a sketch is fully constrained (DOF = 0).
 */
export function isFullyConstrained(
  sketch: Sketch,
  constraints: ConstraintEntry[],
): boolean {
  return getDegreesOfFreedom(sketch, constraints) === 0;
}

/**
 * Check if a sketch is under-constrained (DOF > 0).
 */
export function isUnderConstrained(
  sketch: Sketch,
  constraints: ConstraintEntry[],
): boolean {
  return getDegreesOfFreedom(sketch, constraints) > 0;
}

// =============================================================================
// Over-Constrained Detection
// =============================================================================

/**
 * Check if a sketch is over-constrained (conflicting constraints).
 *
 * A sketch is over-constrained if the constraint equations are inconsistent
 * (no solution exists) or if the Jacobian is rank-deficient.
 *
 * @param sketch - The sketch
 * @param constraints - Active constraints
 * @param parameters - Parameter definitions
 * @returns True if over-constrained
 */
export function isOverConstrained(
  sketch: Sketch,
  constraints: ConstraintEntry[],
  parameters: Map<string, Parameter>,
): boolean {
  // Build all equations
  const equations: ResidualEquation[] = [];
  for (const entry of constraints) {
    if (!entry.isConstruction) {
      equations.push(...getConstraintEquations(entry.constraint, sketch));
    }
  }

  if (equations.length === 0) {
    return false;
  }

  const state = initializeState(sketch);
  const variableKeys = Array.from(state.values.keys());

  // More equations than variables suggests over-constraint
  if (equations.length > variableKeys.length) {
    // Check if the system is consistent by looking at residuals
    const residualVec = computeResidualVector(equations, state, parameters);
    const totalResidual = norm(residualVec);

    // If residual is large, constraints are inconsistent
    if (totalResidual > 1e-3) {
      return true;
    }
  }

  // Check Jacobian rank
  const J = buildJacobian(equations, state, variableKeys, parameters);
  const rank = estimateRank(J);

  // If rank is less than number of equations, system is over-constrained
  // (some constraints are redundant or conflicting)
  if (rank < equations.length) {
    // Determine if redundant (consistent) or conflicting
    const residualVec = computeResidualVector(equations, state, parameters);
    const totalResidual = norm(residualVec);

    if (totalResidual > 1e-3) {
      return true; // Conflicting
    }
  }

  return false;
}

// =============================================================================
// Redundancy Detection
// =============================================================================

/**
 * Find redundant constraints that can be removed without changing DOF.
 *
 * A constraint is redundant if removing it doesn't increase the degrees of freedom.
 * This happens when the constraint is already implied by other constraints.
 *
 * @param sketch - The sketch
 * @param constraints - Active constraints
 * @param parameters - Parameter definitions
 * @returns Array of constraint IDs that are redundant
 */
export function findRedundantConstraints(
  sketch: Sketch,
  constraints: ConstraintEntry[],
  parameters: Map<string, Parameter>,
): string[] {
  const redundant: string[] = [];

  // Build full equation system
  const allEquations: ResidualEquation[] = [];
  const constraintToEquationIndices = new Map<string, number[]>();

  for (const entry of constraints) {
    if (entry.isConstruction) continue;

    const eqs = getConstraintEquations(entry.constraint, sketch);
    const startIdx = allEquations.length;
    allEquations.push(...eqs);
    constraintToEquationIndices.set(
      entry.id,
      eqs.map((_, i) => startIdx + i),
    );
  }

  if (allEquations.length === 0) {
    return [];
  }

  const state = initializeState(sketch);
  const variableKeys = Array.from(state.values.keys());

  // Build Jacobian for all equations
  const fullJ = buildJacobian(allEquations, state, variableKeys, parameters);
  const fullRank = estimateRank(fullJ);

  // Try removing each constraint and check if rank decreases
  for (const entry of constraints) {
    if (entry.isConstruction) continue;

    const eqIndices = constraintToEquationIndices.get(entry.id);
    if (!eqIndices || eqIndices.length === 0) continue;

    // Build Jacobian without this constraint
    const remainingEquations = allEquations.filter(
      (_, i) => !eqIndices.includes(i),
    );

    if (remainingEquations.length === 0) continue;

    const reducedJ = buildJacobian(
      remainingEquations,
      state,
      variableKeys,
      parameters,
    );
    const reducedRank = estimateRank(reducedJ);

    // If rank doesn't decrease, the constraint is redundant
    if (reducedRank >= fullRank - eqIndices.length + 1) {
      // Check if the constraint is actually satisfied
      const residualVec = computeResidualVector(
        eqIndices.map(i => allEquations[i]),
        state,
        parameters,
      );
      const residual = norm(residualVec);

      if (residual < 1e-6) {
        redundant.push(entry.id);
      }
    }
  }

  return redundant;
}

// =============================================================================
// Unconstrained Elements
// =============================================================================

/**
 * Find elements that are not fully constrained (can still move).
 *
 * @param sketch - The sketch
 * @param constraints - Active constraints
 * @returns Array of element IDs that have remaining DOF
 */
export function findUnconstrainedElements(
  sketch: Sketch,
  constraints: ConstraintEntry[],
): string[] {
  const unconstrained: string[] = [];

  // Track which element coordinates are constrained
  const constrainedVars = new Set<string>();

  for (const entry of constraints) {
    if (entry.isConstruction) continue;

    const constraint = entry.constraint;

    // Add constrained variables based on constraint type
    switch (constraint.type) {
      case 'fixed':
        constrainedVars.add(`${constraint.point.elementId}:${constraint.point.which}:x`);
        constrainedVars.add(`${constraint.point.elementId}:${constraint.point.which}:y`);
        break;

      case 'horizontal':
        // Y coordinates are related
        constrainedVars.add(`${constraint.line.elementId}:start:y`);
        constrainedVars.add(`${constraint.line.elementId}:end:y`);
        break;

      case 'vertical':
        // X coordinates are related
        constrainedVars.add(`${constraint.line.elementId}:start:x`);
        constrainedVars.add(`${constraint.line.elementId}:end:x`);
        break;

      case 'coincident':
        constrainedVars.add(`${constraint.point1.elementId}:${constraint.point1.which}:x`);
        constrainedVars.add(`${constraint.point1.elementId}:${constraint.point1.which}:y`);
        constrainedVars.add(`${constraint.point2.elementId}:${constraint.point2.which}:x`);
        constrainedVars.add(`${constraint.point2.elementId}:${constraint.point2.which}:y`);
        break;

      // Add more cases as needed...
    }
  }

  // Check each element for unconstrained coordinates
  for (const element of sketch.elements) {
    let hasUnconstrainedVar = false;

    switch (element.geometry.type) {
      case 'line':
        if (!constrainedVars.has(`${element.id}:start:x`) ||
          !constrainedVars.has(`${element.id}:start:y`) ||
          !constrainedVars.has(`${element.id}:end:x`) ||
          !constrainedVars.has(`${element.id}:end:y`)) {
          hasUnconstrainedVar = true;
        }
        break;

      case 'circle':
      case 'arc':
        if (!constrainedVars.has(`${element.id}:center:x`) ||
          !constrainedVars.has(`${element.id}:center:y`)) {
          hasUnconstrainedVar = true;
        }
        break;
    }

    if (hasUnconstrainedVar) {
      unconstrained.push(element.id);
    }
  }

  return unconstrained;
}

// =============================================================================
// Constraint Suggestions
// =============================================================================

/**
 * Suggest constraints that would help fully constrain the sketch.
 *
 * This is a simple heuristic that suggests fixing the origin and
 * adding distance/angle constraints.
 *
 * @param sketch - The sketch
 * @param constraints - Current constraints
 * @returns Array of suggested constraints
 */
export function suggestConstraints(
  sketch: Sketch,
  constraints: ConstraintEntry[],
): Constraint[] {
  const suggestions: Constraint[] = [];
  const dof = getDegreesOfFreedom(sketch, constraints);

  if (dof === 0) {
    return []; // Already fully constrained
  }

  // Find first line element
  const firstLine = sketch.elements.find(e => e.geometry.type === 'line');

  if (firstLine) {
    // Check if start point is fixed
    const hasFixedStart = constraints.some(
      e =>
        e.constraint.type === 'fixed' &&
        e.constraint.point.elementId === firstLine.id &&
        e.constraint.point.which === 'start',
    );

    if (!hasFixedStart) {
      suggestions.push({
        type: 'fixed',
        point: { elementId: firstLine.id, which: 'start' },
      });
    }

    // Check if line is horizontal or vertical
    const hasOrientation = constraints.some(
      e =>
        (e.constraint.type === 'horizontal' || e.constraint.type === 'vertical') &&
        e.constraint.line.elementId === firstLine.id,
    );

    if (!hasOrientation) {
      suggestions.push({
        type: 'horizontal',
        line: { elementId: firstLine.id },
      });
    }
  }

  return suggestions;
}

// =============================================================================
// Constraint Validation
// =============================================================================

/**
 * Validate that all constraint references point to existing elements.
 *
 * @param sketch - The sketch
 * @param constraints - Constraints to validate
 * @returns Array of invalid constraint IDs
 */
export function validateConstraintReferences(
  sketch: Sketch,
  constraints: ConstraintEntry[],
): string[] {
  const invalid: string[] = [];
  const elementIds = new Set(sketch.elements.map(e => e.id));

  for (const entry of constraints) {
    const constraint = entry.constraint;
    let isValid = true;

    // Check all element references in the constraint
    switch (constraint.type) {
      case 'coincident':
        if (!elementIds.has(constraint.point1.elementId) ||
          !elementIds.has(constraint.point2.elementId)) {
          isValid = false;
        }
        break;

      case 'fixed':
        if (!elementIds.has(constraint.point.elementId)) {
          isValid = false;
        }
        break;

      case 'horizontal':
      case 'vertical':
        if (!elementIds.has(constraint.line.elementId)) {
          isValid = false;
        }
        break;

      case 'parallel':
      case 'perpendicular':
      case 'collinear':
        if (!elementIds.has(constraint.line1.elementId) ||
          !elementIds.has(constraint.line2.elementId)) {
          isValid = false;
        }
        break;

      case 'pointOnLine':
        if (!elementIds.has(constraint.point.elementId) ||
          !elementIds.has(constraint.line.elementId)) {
          isValid = false;
        }
        break;

      case 'pointOnCircle':
        if (!elementIds.has(constraint.point.elementId) ||
          !elementIds.has(constraint.circle.elementId)) {
          isValid = false;
        }
        break;

      case 'distance':
      case 'horizontalDistance':
      case 'verticalDistance':
        if (!elementIds.has(constraint.point1.elementId) ||
          !elementIds.has(constraint.point2.elementId)) {
          isValid = false;
        }
        break;

      case 'angle':
        if (!elementIds.has(constraint.line1.elementId) ||
          !elementIds.has(constraint.line2.elementId)) {
          isValid = false;
        }
        break;

      case 'radius':
      case 'diameter':
        if (!elementIds.has(constraint.circle.elementId)) {
          isValid = false;
        }
        break;

      case 'length':
        if (!elementIds.has(constraint.line.elementId)) {
          isValid = false;
        }
        break;

      case 'concentric':
        if (!elementIds.has(constraint.circle1.elementId) ||
          !elementIds.has(constraint.circle2.elementId)) {
          isValid = false;
        }
        break;

      case 'equal':
        if (!elementIds.has(constraint.element1) ||
          !elementIds.has(constraint.element2)) {
          isValid = false;
        }
        break;

      case 'midpoint':
        if (!elementIds.has(constraint.point.elementId) ||
          !elementIds.has(constraint.line.elementId)) {
          isValid = false;
        }
        break;

      case 'symmetric':
        if (!elementIds.has(constraint.point1.elementId) ||
          !elementIds.has(constraint.point2.elementId) ||
          !elementIds.has(constraint.axis.elementId)) {
          isValid = false;
        }
        break;

      case 'tangent':
        if (!elementIds.has(constraint.curve1.elementId) ||
          !elementIds.has(constraint.curve2.elementId)) {
          isValid = false;
        }
        break;
    }

    if (!isValid) {
      invalid.push(entry.id);
    }
  }

  return invalid;
}
