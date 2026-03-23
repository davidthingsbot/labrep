/**
 * Constraint equations module.
 *
 * Converts geometric constraints into mathematical equations for the solver.
 * Each constraint type maps to one or more residual equations.
 *
 * @module constraints/equations
 */

import { Point2D, distance2d } from '../core';
import { Sketch, SketchElement } from '../sketch/sketch';
import { Line2D } from '../geometry/line2d';
import { Circle2D } from '../geometry/circle2d';
import { Arc2D } from '../geometry/arc2d';
import {
  Constraint,
  PointRef,
  LineRef,
  CircleRef,
  CurveRef,
  Parameter,
  ParameterRef,
} from './types';
import { resolveValue } from './parameter';

// =============================================================================
// Variable Extraction
// =============================================================================

/**
 * A variable in the constraint system.
 * Maps to a specific coordinate of a point on an element.
 */
export interface Variable {
  elementId: string;
  which: 'start' | 'end' | 'center';
  coord: 'x' | 'y';
}

/**
 * Current state of all variables (element positions).
 */
export interface VariableState {
  /** Map from "elementId:which:coord" to value */
  values: Map<string, number>;
}

/**
 * Create a variable key for the state map.
 */
export function varKey(elementId: string, which: string, coord: string): string {
  return `${elementId}:${which}:${coord}`;
}

/**
 * Get the value of a variable from state.
 */
export function getVar(state: VariableState, elementId: string, which: string, coord: string): number {
  const key = varKey(elementId, which, coord);
  const val = state.values.get(key);
  if (val === undefined) {
    throw new Error(`Variable not found: ${key}`);
  }
  return val;
}

/**
 * Get a point from the variable state.
 */
export function getPoint(state: VariableState, ref: PointRef): Point2D {
  return {
    x: getVar(state, ref.elementId, ref.which, 'x'),
    y: getVar(state, ref.elementId, ref.which, 'y'),
  };
}

/**
 * Get all variables for a sketch.
 */
export function extractVariables(sketch: Sketch): Variable[] {
  const vars: Variable[] = [];

  for (const element of sketch.elements) {
    const geom = element.geometry;

    switch (geom.type) {
      case 'line':
        vars.push(
          { elementId: element.id, which: 'start', coord: 'x' },
          { elementId: element.id, which: 'start', coord: 'y' },
          { elementId: element.id, which: 'end', coord: 'x' },
          { elementId: element.id, which: 'end', coord: 'y' },
        );
        break;

      case 'circle':
        vars.push(
          { elementId: element.id, which: 'center', coord: 'x' },
          { elementId: element.id, which: 'center', coord: 'y' },
        );
        // Radius is also a variable, but we handle it specially
        break;

      case 'arc':
        vars.push(
          { elementId: element.id, which: 'center', coord: 'x' },
          { elementId: element.id, which: 'center', coord: 'y' },
          { elementId: element.id, which: 'start', coord: 'x' },
          { elementId: element.id, which: 'start', coord: 'y' },
          { elementId: element.id, which: 'end', coord: 'x' },
          { elementId: element.id, which: 'end', coord: 'y' },
        );
        break;
    }
  }

  return vars;
}

/**
 * Initialize variable state from sketch geometry.
 */
export function initializeState(sketch: Sketch): VariableState {
  const values = new Map<string, number>();

  for (const element of sketch.elements) {
    const geom = element.geometry;

    switch (geom.type) {
      case 'line':
        values.set(varKey(element.id, 'start', 'x'), geom.startPoint.x);
        values.set(varKey(element.id, 'start', 'y'), geom.startPoint.y);
        values.set(varKey(element.id, 'end', 'x'), geom.endPoint.x);
        values.set(varKey(element.id, 'end', 'y'), geom.endPoint.y);
        break;

      case 'circle':
        values.set(varKey(element.id, 'center', 'x'), geom.center.x);
        values.set(varKey(element.id, 'center', 'y'), geom.center.y);
        values.set(varKey(element.id, 'center', 'radius'), geom.radius);
        break;

      case 'arc':
        values.set(varKey(element.id, 'center', 'x'), geom.center.x);
        values.set(varKey(element.id, 'center', 'y'), geom.center.y);
        values.set(varKey(element.id, 'center', 'radius'), geom.radius);
        values.set(varKey(element.id, 'start', 'x'), geom.startPoint.x);
        values.set(varKey(element.id, 'start', 'y'), geom.startPoint.y);
        values.set(varKey(element.id, 'end', 'x'), geom.endPoint.x);
        values.set(varKey(element.id, 'end', 'y'), geom.endPoint.y);
        break;
    }
  }

  return { values };
}

// =============================================================================
// Residual Equations
// =============================================================================

/**
 * A residual equation: f(x) = 0 when the constraint is satisfied.
 */
export interface ResidualEquation {
  /** Human-readable description */
  description: string;
  /** Compute the residual value (should be 0 when satisfied) */
  evaluate: (state: VariableState, parameters: Map<string, Parameter>) => number;
  /** Which variables this equation depends on */
  variables: string[];
}

/**
 * Get residual equations for a constraint.
 */
export function getConstraintEquations(
  constraint: Constraint,
  sketch: Sketch,
): ResidualEquation[] {
  switch (constraint.type) {
    case 'coincident':
      return getCoincidentEquations(constraint.point1, constraint.point2);

    case 'fixed':
      return getFixedEquations(constraint.point, constraint.position);

    case 'horizontal':
      return getHorizontalEquations(constraint.line);

    case 'vertical':
      return getVerticalEquations(constraint.line);

    case 'parallel':
      return getParallelEquations(constraint.line1, constraint.line2);

    case 'perpendicular':
      return getPerpendicularEquations(constraint.line1, constraint.line2);

    case 'pointOnLine':
      return getPointOnLineEquations(constraint.point, constraint.line);

    case 'pointOnCircle':
      return getPointOnCircleEquations(constraint.point, constraint.circle, sketch);

    case 'distance':
      return getDistanceEquations(constraint.point1, constraint.point2, constraint.value);

    case 'horizontalDistance':
      return getHorizontalDistanceEquations(constraint.point1, constraint.point2, constraint.value);

    case 'verticalDistance':
      return getVerticalDistanceEquations(constraint.point1, constraint.point2, constraint.value);

    case 'angle':
      return getAngleEquations(constraint.line1, constraint.line2, constraint.value);

    case 'radius':
      return getRadiusEquations(constraint.circle, constraint.value, sketch);

    case 'diameter':
      return getDiameterEquations(constraint.circle, constraint.value, sketch);

    case 'length':
      return getLengthEquations(constraint.line, constraint.value);

    case 'equal':
      return getEqualEquations(constraint.element1, constraint.element2, sketch);

    case 'midpoint':
      return getMidpointEquations(constraint.point, constraint.line);

    case 'concentric':
      return getConcentricEquations(constraint.circle1, constraint.circle2);

    case 'symmetric':
      return getSymmetricEquations(constraint.point1, constraint.point2, constraint.axis);

    case 'collinear':
      return getCollinearEquations(constraint.line1, constraint.line2);

    case 'tangent':
      return getTangentEquations(constraint.curve1, constraint.curve2, sketch);

    default:
      return [];
  }
}

// =============================================================================
// Individual Constraint Equations
// =============================================================================

/**
 * Coincident: two points at the same location.
 * Equations: p1.x - p2.x = 0, p1.y - p2.y = 0
 */
function getCoincidentEquations(p1: PointRef, p2: PointRef): ResidualEquation[] {
  const vars1 = [
    varKey(p1.elementId, p1.which, 'x'),
    varKey(p1.elementId, p1.which, 'y'),
  ];
  const vars2 = [
    varKey(p2.elementId, p2.which, 'x'),
    varKey(p2.elementId, p2.which, 'y'),
  ];

  return [
    {
      description: `coincident X: ${p1.elementId}.${p1.which} = ${p2.elementId}.${p2.which}`,
      evaluate: (state) => {
        const x1 = getVar(state, p1.elementId, p1.which, 'x');
        const x2 = getVar(state, p2.elementId, p2.which, 'x');
        return x1 - x2;
      },
      variables: [...vars1, ...vars2],
    },
    {
      description: `coincident Y: ${p1.elementId}.${p1.which} = ${p2.elementId}.${p2.which}`,
      evaluate: (state) => {
        const y1 = getVar(state, p1.elementId, p1.which, 'y');
        const y2 = getVar(state, p2.elementId, p2.which, 'y');
        return y1 - y2;
      },
      variables: [...vars1, ...vars2],
    },
  ];
}

/**
 * Fixed: a point at a specific location.
 * Equations: p.x - target.x = 0, p.y - target.y = 0
 */
function getFixedEquations(p: PointRef, position?: Point2D): ResidualEquation[] {
  const vars = [
    varKey(p.elementId, p.which, 'x'),
    varKey(p.elementId, p.which, 'y'),
  ];

  // If no position specified, we'll fix at current position
  // This is determined at solve time from initial state
  return [
    {
      description: `fixed X: ${p.elementId}.${p.which}`,
      evaluate: (state) => {
        const x = getVar(state, p.elementId, p.which, 'x');
        const targetX = position?.x ?? x; // If no position, stays at current
        return x - targetX;
      },
      variables: vars,
    },
    {
      description: `fixed Y: ${p.elementId}.${p.which}`,
      evaluate: (state) => {
        const y = getVar(state, p.elementId, p.which, 'y');
        const targetY = position?.y ?? y;
        return y - targetY;
      },
      variables: vars,
    },
  ];
}

/**
 * Horizontal: line endpoints have the same Y coordinate.
 * Equation: start.y - end.y = 0
 */
function getHorizontalEquations(line: LineRef): ResidualEquation[] {
  return [
    {
      description: `horizontal: ${line.elementId}`,
      evaluate: (state) => {
        const y1 = getVar(state, line.elementId, 'start', 'y');
        const y2 = getVar(state, line.elementId, 'end', 'y');
        return y1 - y2;
      },
      variables: [
        varKey(line.elementId, 'start', 'y'),
        varKey(line.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Vertical: line endpoints have the same X coordinate.
 * Equation: start.x - end.x = 0
 */
function getVerticalEquations(line: LineRef): ResidualEquation[] {
  return [
    {
      description: `vertical: ${line.elementId}`,
      evaluate: (state) => {
        const x1 = getVar(state, line.elementId, 'start', 'x');
        const x2 = getVar(state, line.elementId, 'end', 'x');
        return x1 - x2;
      },
      variables: [
        varKey(line.elementId, 'start', 'x'),
        varKey(line.elementId, 'end', 'x'),
      ],
    },
  ];
}

/**
 * Parallel: two lines have the same direction.
 * Equation: dx1 * dy2 - dy1 * dx2 = 0 (cross product of direction vectors)
 */
function getParallelEquations(l1: LineRef, l2: LineRef): ResidualEquation[] {
  return [
    {
      description: `parallel: ${l1.elementId} || ${l2.elementId}`,
      evaluate: (state) => {
        const dx1 = getVar(state, l1.elementId, 'end', 'x') - getVar(state, l1.elementId, 'start', 'x');
        const dy1 = getVar(state, l1.elementId, 'end', 'y') - getVar(state, l1.elementId, 'start', 'y');
        const dx2 = getVar(state, l2.elementId, 'end', 'x') - getVar(state, l2.elementId, 'start', 'x');
        const dy2 = getVar(state, l2.elementId, 'end', 'y') - getVar(state, l2.elementId, 'start', 'y');
        return dx1 * dy2 - dy1 * dx2;
      },
      variables: [
        varKey(l1.elementId, 'start', 'x'), varKey(l1.elementId, 'start', 'y'),
        varKey(l1.elementId, 'end', 'x'), varKey(l1.elementId, 'end', 'y'),
        varKey(l2.elementId, 'start', 'x'), varKey(l2.elementId, 'start', 'y'),
        varKey(l2.elementId, 'end', 'x'), varKey(l2.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Perpendicular: two lines at 90 degrees.
 * Equation: dx1 * dx2 + dy1 * dy2 = 0 (dot product = 0)
 */
function getPerpendicularEquations(l1: LineRef, l2: LineRef): ResidualEquation[] {
  return [
    {
      description: `perpendicular: ${l1.elementId} ⊥ ${l2.elementId}`,
      evaluate: (state) => {
        const dx1 = getVar(state, l1.elementId, 'end', 'x') - getVar(state, l1.elementId, 'start', 'x');
        const dy1 = getVar(state, l1.elementId, 'end', 'y') - getVar(state, l1.elementId, 'start', 'y');
        const dx2 = getVar(state, l2.elementId, 'end', 'x') - getVar(state, l2.elementId, 'start', 'x');
        const dy2 = getVar(state, l2.elementId, 'end', 'y') - getVar(state, l2.elementId, 'start', 'y');
        return dx1 * dx2 + dy1 * dy2;
      },
      variables: [
        varKey(l1.elementId, 'start', 'x'), varKey(l1.elementId, 'start', 'y'),
        varKey(l1.elementId, 'end', 'x'), varKey(l1.elementId, 'end', 'y'),
        varKey(l2.elementId, 'start', 'x'), varKey(l2.elementId, 'start', 'y'),
        varKey(l2.elementId, 'end', 'x'), varKey(l2.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Point on line: point lies on the infinite line through the line segment.
 * Equation: (p.x - l.start.x) * dy - (p.y - l.start.y) * dx = 0
 */
function getPointOnLineEquations(p: PointRef, l: LineRef): ResidualEquation[] {
  return [
    {
      description: `point on line: ${p.elementId}.${p.which} on ${l.elementId}`,
      evaluate: (state) => {
        const px = getVar(state, p.elementId, p.which, 'x');
        const py = getVar(state, p.elementId, p.which, 'y');
        const lsx = getVar(state, l.elementId, 'start', 'x');
        const lsy = getVar(state, l.elementId, 'start', 'y');
        const lex = getVar(state, l.elementId, 'end', 'x');
        const ley = getVar(state, l.elementId, 'end', 'y');
        const dx = lex - lsx;
        const dy = ley - lsy;
        return (px - lsx) * dy - (py - lsy) * dx;
      },
      variables: [
        varKey(p.elementId, p.which, 'x'), varKey(p.elementId, p.which, 'y'),
        varKey(l.elementId, 'start', 'x'), varKey(l.elementId, 'start', 'y'),
        varKey(l.elementId, 'end', 'x'), varKey(l.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Point on circle: point lies on the circle perimeter.
 * Equation: (p.x - c.x)² + (p.y - c.y)² - r² = 0
 */
function getPointOnCircleEquations(p: PointRef, c: CircleRef, sketch: Sketch): ResidualEquation[] {
  return [
    {
      description: `point on circle: ${p.elementId}.${p.which} on ${c.elementId}`,
      evaluate: (state) => {
        const px = getVar(state, p.elementId, p.which, 'x');
        const py = getVar(state, p.elementId, p.which, 'y');
        const cx = getVar(state, c.elementId, 'center', 'x');
        const cy = getVar(state, c.elementId, 'center', 'y');
        const r = getVar(state, c.elementId, 'center', 'radius');
        const dx = px - cx;
        const dy = py - cy;
        return dx * dx + dy * dy - r * r;
      },
      variables: [
        varKey(p.elementId, p.which, 'x'), varKey(p.elementId, p.which, 'y'),
        varKey(c.elementId, 'center', 'x'), varKey(c.elementId, 'center', 'y'),
        varKey(c.elementId, 'center', 'radius'),
      ],
    },
  ];
}

/**
 * Distance: distance between two points equals a value.
 * Equation: sqrt((p1.x - p2.x)² + (p1.y - p2.y)²) - d = 0
 * We use squared form to avoid sqrt discontinuity at 0:
 * (p1.x - p2.x)² + (p1.y - p2.y)² - d² = 0
 */
function getDistanceEquations(
  p1: PointRef,
  p2: PointRef,
  value: number | ParameterRef,
): ResidualEquation[] {
  return [
    {
      description: `distance: ${p1.elementId}.${p1.which} to ${p2.elementId}.${p2.which}`,
      evaluate: (state, params) => {
        const x1 = getVar(state, p1.elementId, p1.which, 'x');
        const y1 = getVar(state, p1.elementId, p1.which, 'y');
        const x2 = getVar(state, p2.elementId, p2.which, 'x');
        const y2 = getVar(state, p2.elementId, p2.which, 'y');
        const d = resolveValue(value, params);
        const dx = x1 - x2;
        const dy = y1 - y2;
        const actualDist = Math.sqrt(dx * dx + dy * dy);
        // Use non-squared form for better convergence with other linear constraints
        return actualDist - d;
      },
      variables: [
        varKey(p1.elementId, p1.which, 'x'), varKey(p1.elementId, p1.which, 'y'),
        varKey(p2.elementId, p2.which, 'x'), varKey(p2.elementId, p2.which, 'y'),
      ],
    },
  ];
}

/**
 * Horizontal distance: horizontal gap between two points.
 * Equation: |p2.x - p1.x| - d = 0
 * We use signed form: p2.x - p1.x - d = 0 (assumes p2 is to the right)
 */
function getHorizontalDistanceEquations(
  p1: PointRef,
  p2: PointRef,
  value: number | ParameterRef,
): ResidualEquation[] {
  return [
    {
      description: `horizontal distance: ${p1.elementId}.${p1.which} to ${p2.elementId}.${p2.which}`,
      evaluate: (state, params) => {
        const x1 = getVar(state, p1.elementId, p1.which, 'x');
        const x2 = getVar(state, p2.elementId, p2.which, 'x');
        const d = resolveValue(value, params);
        return Math.abs(x2 - x1) - d;
      },
      variables: [
        varKey(p1.elementId, p1.which, 'x'),
        varKey(p2.elementId, p2.which, 'x'),
      ],
    },
  ];
}

/**
 * Vertical distance: vertical gap between two points.
 * Equation: |p2.y - p1.y| - d = 0
 */
function getVerticalDistanceEquations(
  p1: PointRef,
  p2: PointRef,
  value: number | ParameterRef,
): ResidualEquation[] {
  return [
    {
      description: `vertical distance: ${p1.elementId}.${p1.which} to ${p2.elementId}.${p2.which}`,
      evaluate: (state, params) => {
        const y1 = getVar(state, p1.elementId, p1.which, 'y');
        const y2 = getVar(state, p2.elementId, p2.which, 'y');
        const d = resolveValue(value, params);
        return Math.abs(y2 - y1) - d;
      },
      variables: [
        varKey(p1.elementId, p1.which, 'y'),
        varKey(p2.elementId, p2.which, 'y'),
      ],
    },
  ];
}

/**
 * Angle: angle between two lines equals a value.
 * Equation: atan2(cross, dot) - angle = 0
 * Or: cross - dot * tan(angle) = 0 (avoiding atan2)
 */
function getAngleEquations(
  l1: LineRef,
  l2: LineRef,
  value: number | ParameterRef,
): ResidualEquation[] {
  return [
    {
      description: `angle: ${l1.elementId} to ${l2.elementId}`,
      evaluate: (state, params) => {
        const dx1 = getVar(state, l1.elementId, 'end', 'x') - getVar(state, l1.elementId, 'start', 'x');
        const dy1 = getVar(state, l1.elementId, 'end', 'y') - getVar(state, l1.elementId, 'start', 'y');
        const dx2 = getVar(state, l2.elementId, 'end', 'x') - getVar(state, l2.elementId, 'start', 'x');
        const dy2 = getVar(state, l2.elementId, 'end', 'y') - getVar(state, l2.elementId, 'start', 'y');

        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (len1 < 1e-10 || len2 < 1e-10) return 0;

        // Normalize
        const nx1 = dx1 / len1, ny1 = dy1 / len1;
        const nx2 = dx2 / len2, ny2 = dy2 / len2;

        // Compute actual angle via cross and dot product
        const dot = nx1 * nx2 + ny1 * ny2;
        const cross = nx1 * ny2 - ny1 * nx2;
        const actualAngle = Math.atan2(cross, dot);

        const targetAngle = resolveValue(value, params);
        return actualAngle - targetAngle;
      },
      variables: [
        varKey(l1.elementId, 'start', 'x'), varKey(l1.elementId, 'start', 'y'),
        varKey(l1.elementId, 'end', 'x'), varKey(l1.elementId, 'end', 'y'),
        varKey(l2.elementId, 'start', 'x'), varKey(l2.elementId, 'start', 'y'),
        varKey(l2.elementId, 'end', 'x'), varKey(l2.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Radius: circle radius equals a value.
 * Equation: r - value = 0
 */
function getRadiusEquations(
  c: CircleRef,
  value: number | ParameterRef,
  sketch: Sketch,
): ResidualEquation[] {
  return [
    {
      description: `radius: ${c.elementId}`,
      evaluate: (state, params) => {
        const r = getVar(state, c.elementId, 'center', 'radius');
        const target = resolveValue(value, params);
        return r - target;
      },
      variables: [varKey(c.elementId, 'center', 'radius')],
    },
  ];
}

/**
 * Diameter: circle diameter equals a value.
 * Equation: 2r - value = 0
 */
function getDiameterEquations(
  c: CircleRef,
  value: number | ParameterRef,
  sketch: Sketch,
): ResidualEquation[] {
  return [
    {
      description: `diameter: ${c.elementId}`,
      evaluate: (state, params) => {
        const r = getVar(state, c.elementId, 'center', 'radius');
        const target = resolveValue(value, params);
        return 2 * r - target;
      },
      variables: [varKey(c.elementId, 'center', 'radius')],
    },
  ];
}

/**
 * Length: line segment length equals a value.
 * Equation: sqrt(dx² + dy²) - length = 0
 * We use squared form: dx² + dy² - length² = 0
 */
function getLengthEquations(
  l: LineRef,
  value: number | ParameterRef,
): ResidualEquation[] {
  return [
    {
      description: `length: ${l.elementId}`,
      evaluate: (state, params) => {
        const dx = getVar(state, l.elementId, 'end', 'x') - getVar(state, l.elementId, 'start', 'x');
        const dy = getVar(state, l.elementId, 'end', 'y') - getVar(state, l.elementId, 'start', 'y');
        const target = resolveValue(value, params);
        const actualLen = Math.sqrt(dx * dx + dy * dy);
        return actualLen - target;
      },
      variables: [
        varKey(l.elementId, 'start', 'x'), varKey(l.elementId, 'start', 'y'),
        varKey(l.elementId, 'end', 'x'), varKey(l.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Equal: two elements have equal measure (length for lines, radius for circles).
 * Equation: measure1 - measure2 = 0
 */
function getEqualEquations(e1: string, e2: string, sketch: Sketch): ResidualEquation[] {
  const elem1 = sketch.elements.find(e => e.id === e1);
  const elem2 = sketch.elements.find(e => e.id === e2);

  if (!elem1 || !elem2) return [];

  // Both lines: equal length
  if (elem1.geometry.type === 'line' && elem2.geometry.type === 'line') {
    return [
      {
        description: `equal length: ${e1} = ${e2}`,
        evaluate: (state) => {
          const dx1 = getVar(state, e1, 'end', 'x') - getVar(state, e1, 'start', 'x');
          const dy1 = getVar(state, e1, 'end', 'y') - getVar(state, e1, 'start', 'y');
          const dx2 = getVar(state, e2, 'end', 'x') - getVar(state, e2, 'start', 'x');
          const dy2 = getVar(state, e2, 'end', 'y') - getVar(state, e2, 'start', 'y');
          const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
          const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          return len1 - len2;
        },
        variables: [
          varKey(e1, 'start', 'x'), varKey(e1, 'start', 'y'),
          varKey(e1, 'end', 'x'), varKey(e1, 'end', 'y'),
          varKey(e2, 'start', 'x'), varKey(e2, 'start', 'y'),
          varKey(e2, 'end', 'x'), varKey(e2, 'end', 'y'),
        ],
      },
    ];
  }

  // Both circles: equal radius
  if ((elem1.geometry.type === 'circle' || elem1.geometry.type === 'arc') &&
    (elem2.geometry.type === 'circle' || elem2.geometry.type === 'arc')) {
    return [
      {
        description: `equal radius: ${e1} = ${e2}`,
        evaluate: (state) => {
          const r1 = getVar(state, e1, 'center', 'radius');
          const r2 = getVar(state, e2, 'center', 'radius');
          return r1 - r2;
        },
        variables: [
          varKey(e1, 'center', 'radius'),
          varKey(e2, 'center', 'radius'),
        ],
      },
    ];
  }

  return [];
}

/**
 * Midpoint: a point lies at the midpoint of a line.
 * Equations: p.x - (l.start.x + l.end.x)/2 = 0, p.y - (l.start.y + l.end.y)/2 = 0
 */
function getMidpointEquations(p: PointRef, l: LineRef): ResidualEquation[] {
  return [
    {
      description: `midpoint X: ${p.elementId}.${p.which} on ${l.elementId}`,
      evaluate: (state) => {
        const px = getVar(state, p.elementId, p.which, 'x');
        const lsx = getVar(state, l.elementId, 'start', 'x');
        const lex = getVar(state, l.elementId, 'end', 'x');
        return px - (lsx + lex) / 2;
      },
      variables: [
        varKey(p.elementId, p.which, 'x'),
        varKey(l.elementId, 'start', 'x'),
        varKey(l.elementId, 'end', 'x'),
      ],
    },
    {
      description: `midpoint Y: ${p.elementId}.${p.which} on ${l.elementId}`,
      evaluate: (state) => {
        const py = getVar(state, p.elementId, p.which, 'y');
        const lsy = getVar(state, l.elementId, 'start', 'y');
        const ley = getVar(state, l.elementId, 'end', 'y');
        return py - (lsy + ley) / 2;
      },
      variables: [
        varKey(p.elementId, p.which, 'y'),
        varKey(l.elementId, 'start', 'y'),
        varKey(l.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Concentric: two circles share the same center.
 * Equations: c1.x - c2.x = 0, c1.y - c2.y = 0
 */
function getConcentricEquations(c1: CircleRef, c2: CircleRef): ResidualEquation[] {
  return [
    {
      description: `concentric X: ${c1.elementId} = ${c2.elementId}`,
      evaluate: (state) => {
        const x1 = getVar(state, c1.elementId, 'center', 'x');
        const x2 = getVar(state, c2.elementId, 'center', 'x');
        return x1 - x2;
      },
      variables: [
        varKey(c1.elementId, 'center', 'x'),
        varKey(c2.elementId, 'center', 'x'),
      ],
    },
    {
      description: `concentric Y: ${c1.elementId} = ${c2.elementId}`,
      evaluate: (state) => {
        const y1 = getVar(state, c1.elementId, 'center', 'y');
        const y2 = getVar(state, c2.elementId, 'center', 'y');
        return y1 - y2;
      },
      variables: [
        varKey(c1.elementId, 'center', 'y'),
        varKey(c2.elementId, 'center', 'y'),
      ],
    },
  ];
}

/**
 * Symmetric: two points are symmetric about a line axis.
 * The midpoint of p1-p2 lies on the axis, and the vector p1-p2 is perpendicular to the axis.
 */
function getSymmetricEquations(p1: PointRef, p2: PointRef, axis: LineRef): ResidualEquation[] {
  return [
    // Midpoint lies on axis
    {
      description: `symmetric: midpoint of ${p1.elementId}.${p1.which} - ${p2.elementId}.${p2.which} on axis ${axis.elementId}`,
      evaluate: (state) => {
        const x1 = getVar(state, p1.elementId, p1.which, 'x');
        const y1 = getVar(state, p1.elementId, p1.which, 'y');
        const x2 = getVar(state, p2.elementId, p2.which, 'x');
        const y2 = getVar(state, p2.elementId, p2.which, 'y');
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        const asx = getVar(state, axis.elementId, 'start', 'x');
        const asy = getVar(state, axis.elementId, 'start', 'y');
        const aex = getVar(state, axis.elementId, 'end', 'x');
        const aey = getVar(state, axis.elementId, 'end', 'y');
        const dx = aex - asx;
        const dy = aey - asy;

        // Point on line equation
        return (mx - asx) * dy - (my - asy) * dx;
      },
      variables: [
        varKey(p1.elementId, p1.which, 'x'), varKey(p1.elementId, p1.which, 'y'),
        varKey(p2.elementId, p2.which, 'x'), varKey(p2.elementId, p2.which, 'y'),
        varKey(axis.elementId, 'start', 'x'), varKey(axis.elementId, 'start', 'y'),
        varKey(axis.elementId, 'end', 'x'), varKey(axis.elementId, 'end', 'y'),
      ],
    },
    // p1-p2 perpendicular to axis
    {
      description: `symmetric: ${p1.elementId}.${p1.which} - ${p2.elementId}.${p2.which} perpendicular to axis ${axis.elementId}`,
      evaluate: (state) => {
        const x1 = getVar(state, p1.elementId, p1.which, 'x');
        const y1 = getVar(state, p1.elementId, p1.which, 'y');
        const x2 = getVar(state, p2.elementId, p2.which, 'x');
        const y2 = getVar(state, p2.elementId, p2.which, 'y');
        const px = x2 - x1;
        const py = y2 - y1;

        const asx = getVar(state, axis.elementId, 'start', 'x');
        const asy = getVar(state, axis.elementId, 'start', 'y');
        const aex = getVar(state, axis.elementId, 'end', 'x');
        const aey = getVar(state, axis.elementId, 'end', 'y');
        const dx = aex - asx;
        const dy = aey - asy;

        // Dot product = 0 for perpendicular
        return px * dx + py * dy;
      },
      variables: [
        varKey(p1.elementId, p1.which, 'x'), varKey(p1.elementId, p1.which, 'y'),
        varKey(p2.elementId, p2.which, 'x'), varKey(p2.elementId, p2.which, 'y'),
        varKey(axis.elementId, 'start', 'x'), varKey(axis.elementId, 'start', 'y'),
        varKey(axis.elementId, 'end', 'x'), varKey(axis.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Collinear: two lines lie on the same infinite line.
 * The start of line2 must lie on line1.
 */
function getCollinearEquations(l1: LineRef, l2: LineRef): ResidualEquation[] {
  // All four points must be collinear
  // We check that start2 is on line1 and end2 is on line1
  return [
    // start2 on line1
    {
      description: `collinear: ${l2.elementId}.start on ${l1.elementId}`,
      evaluate: (state) => {
        const px = getVar(state, l2.elementId, 'start', 'x');
        const py = getVar(state, l2.elementId, 'start', 'y');
        const lsx = getVar(state, l1.elementId, 'start', 'x');
        const lsy = getVar(state, l1.elementId, 'start', 'y');
        const lex = getVar(state, l1.elementId, 'end', 'x');
        const ley = getVar(state, l1.elementId, 'end', 'y');
        const dx = lex - lsx;
        const dy = ley - lsy;
        return (px - lsx) * dy - (py - lsy) * dx;
      },
      variables: [
        varKey(l2.elementId, 'start', 'x'), varKey(l2.elementId, 'start', 'y'),
        varKey(l1.elementId, 'start', 'x'), varKey(l1.elementId, 'start', 'y'),
        varKey(l1.elementId, 'end', 'x'), varKey(l1.elementId, 'end', 'y'),
      ],
    },
    // end2 on line1
    {
      description: `collinear: ${l2.elementId}.end on ${l1.elementId}`,
      evaluate: (state) => {
        const px = getVar(state, l2.elementId, 'end', 'x');
        const py = getVar(state, l2.elementId, 'end', 'y');
        const lsx = getVar(state, l1.elementId, 'start', 'x');
        const lsy = getVar(state, l1.elementId, 'start', 'y');
        const lex = getVar(state, l1.elementId, 'end', 'x');
        const ley = getVar(state, l1.elementId, 'end', 'y');
        const dx = lex - lsx;
        const dy = ley - lsy;
        return (px - lsx) * dy - (py - lsy) * dx;
      },
      variables: [
        varKey(l2.elementId, 'end', 'x'), varKey(l2.elementId, 'end', 'y'),
        varKey(l1.elementId, 'start', 'x'), varKey(l1.elementId, 'start', 'y'),
        varKey(l1.elementId, 'end', 'x'), varKey(l1.elementId, 'end', 'y'),
      ],
    },
  ];
}

/**
 * Tangent: two curves are tangent (touch at exactly one point with same tangent).
 * For line-circle: distance from center to line = radius
 */
function getTangentEquations(c1: CurveRef, c2: CurveRef, sketch: Sketch): ResidualEquation[] {
  const elem1 = sketch.elements.find(e => e.id === c1.elementId);
  const elem2 = sketch.elements.find(e => e.id === c2.elementId);

  if (!elem1 || !elem2) return [];

  // Line-circle tangent
  if (elem1.geometry.type === 'line' &&
    (elem2.geometry.type === 'circle' || elem2.geometry.type === 'arc')) {
    return [
      {
        description: `tangent: line ${c1.elementId} to circle ${c2.elementId}`,
        evaluate: (state) => {
          // Distance from circle center to line = radius
          const cx = getVar(state, c2.elementId, 'center', 'x');
          const cy = getVar(state, c2.elementId, 'center', 'y');
          const r = getVar(state, c2.elementId, 'center', 'radius');

          const lsx = getVar(state, c1.elementId, 'start', 'x');
          const lsy = getVar(state, c1.elementId, 'start', 'y');
          const lex = getVar(state, c1.elementId, 'end', 'x');
          const ley = getVar(state, c1.elementId, 'end', 'y');

          const dx = lex - lsx;
          const dy = ley - lsy;
          const len = Math.sqrt(dx * dx + dy * dy);

          if (len < 1e-10) return r; // Degenerate line

          // Signed distance from center to line
          const dist = Math.abs((cx - lsx) * dy - (cy - lsy) * dx) / len;
          return dist - r;
        },
        variables: [
          varKey(c2.elementId, 'center', 'x'), varKey(c2.elementId, 'center', 'y'),
          varKey(c2.elementId, 'center', 'radius'),
          varKey(c1.elementId, 'start', 'x'), varKey(c1.elementId, 'start', 'y'),
          varKey(c1.elementId, 'end', 'x'), varKey(c1.elementId, 'end', 'y'),
        ],
      },
    ];
  }

  // Circle-line tangent (swap order)
  if ((elem1.geometry.type === 'circle' || elem1.geometry.type === 'arc') &&
    elem2.geometry.type === 'line') {
    return getTangentEquations(c2, c1, sketch);
  }

  // Circle-circle tangent: |c1 - c2| = r1 + r2 (external) or |r1 - r2| (internal)
  // For now, we do external tangent
  if ((elem1.geometry.type === 'circle' || elem1.geometry.type === 'arc') &&
    (elem2.geometry.type === 'circle' || elem2.geometry.type === 'arc')) {
    return [
      {
        description: `tangent: circle ${c1.elementId} to circle ${c2.elementId}`,
        evaluate: (state) => {
          const x1 = getVar(state, c1.elementId, 'center', 'x');
          const y1 = getVar(state, c1.elementId, 'center', 'y');
          const r1 = getVar(state, c1.elementId, 'center', 'radius');
          const x2 = getVar(state, c2.elementId, 'center', 'x');
          const y2 = getVar(state, c2.elementId, 'center', 'y');
          const r2 = getVar(state, c2.elementId, 'center', 'radius');

          const dx = x2 - x1;
          const dy = y2 - y1;
          const distSq = dx * dx + dy * dy;
          const sumR = r1 + r2;
          // External tangent: dist = r1 + r2
          return distSq - sumR * sumR;
        },
        variables: [
          varKey(c1.elementId, 'center', 'x'), varKey(c1.elementId, 'center', 'y'),
          varKey(c1.elementId, 'center', 'radius'),
          varKey(c2.elementId, 'center', 'x'), varKey(c2.elementId, 'center', 'y'),
          varKey(c2.elementId, 'center', 'radius'),
        ],
      },
    ];
  }

  return [];
}

// =============================================================================
// Residual Computation
// =============================================================================

/**
 * Compute the total residual (sum of squared errors) for all equations.
 */
export function computeResidual(
  equations: ResidualEquation[],
  state: VariableState,
  parameters: Map<string, Parameter>,
): number {
  let sum = 0;
  for (const eq of equations) {
    const r = eq.evaluate(state, parameters);
    sum += r * r;
  }
  return sum;
}

/**
 * Compute the residual vector for all equations.
 */
export function computeResidualVector(
  equations: ResidualEquation[],
  state: VariableState,
  parameters: Map<string, Parameter>,
): number[] {
  return equations.map(eq => eq.evaluate(state, parameters));
}
