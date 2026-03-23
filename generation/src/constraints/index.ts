/**
 * Constraint solver module.
 *
 * Provides geometric and dimensional constraint solving for parametric sketches.
 *
 * @module constraints
 */

// Types
export type {
  PointRef,
  LineRef,
  CircleRef,
  CurveRef,
  ArcRef,
  ElementRef,
  ParameterRef,
  CoincidentConstraint,
  FixedConstraint,
  PointOnLineConstraint,
  PointOnCircleConstraint,
  HorizontalConstraint,
  VerticalConstraint,
  ParallelConstraint,
  PerpendicularConstraint,
  CollinearConstraint,
  TangentConstraint,
  EqualConstraint,
  ConcentricConstraint,
  SymmetricConstraint,
  MidpointConstraint,
  DistanceConstraint,
  HorizontalDistanceConstraint,
  VerticalDistanceConstraint,
  AngleConstraint,
  RadiusConstraint,
  DiameterConstraint,
  LengthConstraint,
  GeometricConstraint,
  DimensionalConstraint,
  Constraint,
  ConstraintEntry,
  Parameter,
  SolveStatus,
  ConstraintDiagnostic,
  SolveResult,
  SolveOptions,
} from './types';

// Parameter system
export {
  createParameter,
  evaluateExpression,
  resolveValue,
  extractParameterNames,
  getParameterDependencies,
  detectCircularDependencies,
  updateDependentParameters,
  paramRef,
} from './parameter';

// Equations (for advanced usage)
export type {
  Variable,
  VariableState,
  ResidualEquation,
} from './equations';

export {
  varKey,
  getVar,
  getPoint,
  extractVariables,
  initializeState,
  getConstraintEquations,
  computeResidual,
  computeResidualVector,
} from './equations';

// Jacobian and linear algebra
export type {
  Matrix,
  Vector,
} from './jacobian';

export {
  zeros,
  identity as identityMatrix,
  zerosVec,
  buildJacobian,
  buildSparseJacobian,
  transpose,
  multiply,
  multiplyVec,
  dot as dotVec,
  norm,
  scaleVec,
  addVec,
  subtractVec,
  negateVec,
  solve as solveLinear,
  solveLeastSquares,
  pseudoInverseSolve,
  solveDamped,
  estimateRank,
  conditionNumberEstimate,
} from './jacobian';

// Solver
export type {
  SolverState,
} from './solver';

export {
  solve,
  solveStep,
  initSolverState,
} from './solver';

// Analysis
export {
  getDegreesOfFreedom,
  isFullyConstrained,
  isUnderConstrained,
  isOverConstrained,
  findRedundantConstraints,
  findUnconstrainedElements,
  suggestConstraints,
  validateConstraintReferences,
} from './analysis';
