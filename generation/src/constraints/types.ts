/**
 * Constraint type definitions for the geometric constraint solver.
 *
 * @module constraints/types
 */

import { Point2D } from '../core';

// =============================================================================
// References
// =============================================================================

/**
 * Reference to a point on a sketch element.
 */
export interface PointRef {
  elementId: string;
  which: 'start' | 'end' | 'center' | 'point';
}

/**
 * Reference to a line element.
 */
export interface LineRef {
  elementId: string;
}

/**
 * Reference to a circle element.
 */
export interface CircleRef {
  elementId: string;
}

/**
 * Reference to a curve element (line, circle, or arc).
 */
export interface CurveRef {
  elementId: string;
}

/**
 * Reference to an arc element.
 */
export interface ArcRef {
  elementId: string;
}

/**
 * Generic element reference.
 */
export type ElementRef = string;

/**
 * Reference to a parameter by ID.
 */
export interface ParameterRef {
  parameterId: string;
}

// =============================================================================
// Geometric Constraints
// =============================================================================

/**
 * Two points coincide at the same location.
 */
export interface CoincidentConstraint {
  type: 'coincident';
  point1: PointRef;
  point2: PointRef;
}

/**
 * Fix an element at its current position (or a specified position).
 */
export interface FixedConstraint {
  type: 'fixed';
  point: PointRef;
  position?: Point2D; // Optional: fix at specific position
}

/**
 * A point lies on a line.
 */
export interface PointOnLineConstraint {
  type: 'pointOnLine';
  point: PointRef;
  line: LineRef;
}

/**
 * A point lies on a circle.
 */
export interface PointOnCircleConstraint {
  type: 'pointOnCircle';
  point: PointRef;
  circle: CircleRef;
}

/**
 * A line is horizontal (parallel to X-axis).
 */
export interface HorizontalConstraint {
  type: 'horizontal';
  line: LineRef;
}

/**
 * A line is vertical (parallel to Y-axis).
 */
export interface VerticalConstraint {
  type: 'vertical';
  line: LineRef;
}

/**
 * Two lines are parallel.
 */
export interface ParallelConstraint {
  type: 'parallel';
  line1: LineRef;
  line2: LineRef;
}

/**
 * Two lines are perpendicular.
 */
export interface PerpendicularConstraint {
  type: 'perpendicular';
  line1: LineRef;
  line2: LineRef;
}

/**
 * Two lines are collinear (lie on the same infinite line).
 */
export interface CollinearConstraint {
  type: 'collinear';
  line1: LineRef;
  line2: LineRef;
}

/**
 * Two curves are tangent at their intersection.
 */
export interface TangentConstraint {
  type: 'tangent';
  curve1: CurveRef;
  curve2: CurveRef;
}

/**
 * Two elements have equal measure (length, radius, etc.).
 */
export interface EqualConstraint {
  type: 'equal';
  element1: ElementRef;
  element2: ElementRef;
}

/**
 * Two circles share the same center.
 */
export interface ConcentricConstraint {
  type: 'concentric';
  circle1: CircleRef;
  circle2: CircleRef;
}

/**
 * Two elements are symmetric about an axis.
 */
export interface SymmetricConstraint {
  type: 'symmetric';
  point1: PointRef;
  point2: PointRef;
  axis: LineRef;
}

/**
 * A point lies at the midpoint of a line.
 */
export interface MidpointConstraint {
  type: 'midpoint';
  point: PointRef;
  line: LineRef;
}

// =============================================================================
// Dimensional Constraints
// =============================================================================

/**
 * Distance between two points or a point and a line.
 */
export interface DistanceConstraint {
  type: 'distance';
  point1: PointRef;
  point2: PointRef;
  value: number | ParameterRef;
}

/**
 * Horizontal distance between two points.
 */
export interface HorizontalDistanceConstraint {
  type: 'horizontalDistance';
  point1: PointRef;
  point2: PointRef;
  value: number | ParameterRef;
}

/**
 * Vertical distance between two points.
 */
export interface VerticalDistanceConstraint {
  type: 'verticalDistance';
  point1: PointRef;
  point2: PointRef;
  value: number | ParameterRef;
}

/**
 * Angle between two lines.
 */
export interface AngleConstraint {
  type: 'angle';
  line1: LineRef;
  line2: LineRef;
  value: number | ParameterRef; // radians
}

/**
 * Radius of a circle or arc.
 */
export interface RadiusConstraint {
  type: 'radius';
  circle: CircleRef;
  value: number | ParameterRef;
}

/**
 * Diameter of a circle or arc.
 */
export interface DiameterConstraint {
  type: 'diameter';
  circle: CircleRef;
  value: number | ParameterRef;
}

/**
 * Length of a line segment.
 */
export interface LengthConstraint {
  type: 'length';
  line: LineRef;
  value: number | ParameterRef;
}

// =============================================================================
// Union Types
// =============================================================================

/**
 * All geometric constraints.
 */
export type GeometricConstraint =
  | CoincidentConstraint
  | FixedConstraint
  | PointOnLineConstraint
  | PointOnCircleConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | CollinearConstraint
  | TangentConstraint
  | EqualConstraint
  | ConcentricConstraint
  | SymmetricConstraint
  | MidpointConstraint;

/**
 * All dimensional constraints.
 */
export type DimensionalConstraint =
  | DistanceConstraint
  | HorizontalDistanceConstraint
  | VerticalDistanceConstraint
  | AngleConstraint
  | RadiusConstraint
  | DiameterConstraint
  | LengthConstraint;

/**
 * All constraint types.
 */
export type Constraint = GeometricConstraint | DimensionalConstraint;

// =============================================================================
// Constraint Entry & Parameters
// =============================================================================

/**
 * A constraint with metadata.
 */
export interface ConstraintEntry {
  readonly id: string;
  readonly constraint: Constraint;
  readonly isConstruction: boolean; // Construction constraints don't affect DOF
}

/**
 * A named parameter for parametric constraints.
 */
export interface Parameter {
  readonly id: string;
  readonly name: string;
  value: number;
  expression?: string; // e.g., "width * 2", "height + 10"
}

// =============================================================================
// Solve Results
// =============================================================================

/**
 * Status of constraint solving.
 */
export type SolveStatus =
  | 'solved' // All constraints satisfied, DOF = 0
  | 'underConstrained' // Constraints satisfied but DOF > 0
  | 'overConstrained' // Constraints conflict, no solution
  | 'redundant' // Some constraints are redundant
  | 'failed'; // Solver failed to converge

/**
 * Diagnostic information about a single constraint.
 */
export interface ConstraintDiagnostic {
  constraintId: string;
  status: 'satisfied' | 'violated' | 'redundant' | 'conflicting';
  error?: number; // Residual error for this constraint
  message?: string;
}

/**
 * Result of constraint solving.
 */
export interface SolveResult {
  status: SolveStatus;
  degreesOfFreedom: number;
  iterations: number;
  residual: number; // Sum of squared constraint errors
  diagnostics: ConstraintDiagnostic[];
  conflictingConstraints?: string[]; // IDs of conflicting constraints
  redundantConstraints?: string[]; // IDs of redundant constraints
}

/**
 * Options for the constraint solver.
 */
export interface SolveOptions {
  maxIterations?: number; // Default: 100
  tolerance?: number; // Default: 1e-10
  dampingFactor?: number; // For Levenberg-Marquardt
}
