# Phase 7: Constraint Solver — Design Document

> ⚠️ **Testing Requirement:** All implementations MUST include edge case tests — not just happy paths. Test: zero/negative values, degenerate inputs, boundary conditions, near-tolerance values, and known failure modes. Edge cases reveal bugs that happy-path tests miss.

## Overview

### What Is Constraint Solving?

A geometric constraint solver takes a sketch with geometric elements (points, lines, circles, arcs) and constraints (relationships like "these lines are parallel" or "this distance is 10mm") and computes concrete positions for all elements that satisfy all constraints simultaneously.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSTRAINT SOLVING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT:                                                         │
│  ├── Geometric elements (points, lines, circles, arcs)          │
│  ├── Initial positions (approximate)                            │
│  ├── Geometric constraints (parallel, tangent, coincident)      │
│  └── Dimensional constraints (distance=10, angle=90°)           │
│                                                                 │
│  OUTPUT:                                                        │
│  ├── Updated element positions satisfying all constraints       │
│  ├── Degrees of freedom (DOF) remaining                         │
│  └── Status: solved, under-constrained, over-constrained        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why It Matters for labrep

Parametric design is **core to voice/text-controlled CAD**. Users need to:

- **Say "make that 10mm"** — set a dimension by value
- **Say "set width = 2 × height"** — create parametric relationships  
- **Say "make these parallel"** — add geometric constraints
- **Drag a point** — and have the rest of the sketch update to maintain constraints

Without a constraint solver, the sketch system is just a drawing tool. With one, it becomes a parametric design system.

### Degrees of Freedom (DOF)

Each geometric element has a certain number of degrees of freedom:

| Element | DOF | Parameters |
|---------|-----|------------|
| Point | 2 | x, y |
| Line segment | 4 | x₁, y₁, x₂, y₂ |
| Circle | 3 | cx, cy, r |
| Arc | 5 | cx, cy, r, startAngle, endAngle |

Each constraint removes degrees of freedom:

| Constraint | DOF Removed |
|------------|-------------|
| Fixed point | 2 |
| Horizontal/Vertical line | 1 |
| Coincident (point-point) | 2 |
| Point on line | 1 |
| Parallel | 1 |
| Perpendicular | 1 |
| Tangent | 1 |
| Equal length | 1 |
| Distance | 1 |
| Angle | 1 |
| Radius/Diameter | 1 |

A sketch is:
- **Fully constrained** when DOF = 0
- **Under-constrained** when DOF > 0 (elements can still move)
- **Over-constrained** when constraints conflict (no solution exists)

---

## OCCT Reference

### OCCT Does NOT Have a General Constraint Solver

OpenCASCADE does not include a general-purpose 2D geometric constraint solver. This is a critical distinction.

**What OCCT does have:**

1. **GccAna / GccEnt** — Analytic construction of circles tangent to other geometry
   - `GccAna_Circ2d2TanRad` — Circle tangent to two curves with given radius
   - `GccAna_Circ2d3Tan` — Circle tangent to three curves
   - `GccEnt::Unqualified()`, `GccEnt::Enclosing()`, `GccEnt::Outside()`
   - These solve specific construction problems, not general constraint systems

2. **Geom2dGcc** — Higher-level geometric construction
   - `Geom2dGcc_Circ2d2TanRad` — More flexible circle construction
   - Still construction-focused, not constraint-solving

3. **math_* packages** — Numerical methods
   - `math_NewtonMinimum` — Newton's method for minimization
   - `math_BFGS` — BFGS quasi-Newton optimization
   - `math_FunctionSetRoot` — Solve systems of equations
   - These are building blocks, not a constraint solver

**From the OCCT forum (dev.opencascade.org):**
> "OCCT doesn't include a sketch constraint solver. FreeCAD uses its own solver (PlaneGCS). Commercial CAD uses D-Cubed DCM or similar."

### How FreeCAD Uses OCCT

FreeCAD's Sketcher workbench:
1. Uses OCCT for geometry representation (`Geom2d_*` curves)
2. Uses a **separate constraint solver** called PlaneGCS
3. PlaneGCS is C++ code in `src/Mod/Sketcher/App/planegcs/`
4. After solving, updates OCCT geometry with new positions

**Key insight:** We need to build or integrate a constraint solver — OCCT won't provide one.

---

## Alternative Approaches

### Option 1: Build Our Own Solver

**Pros:**
- Full control over architecture and API
- Can optimize for our specific use cases
- No external dependencies
- TypeScript-native

**Cons:**
- Significant implementation effort
- Numerical stability challenges
- Need to handle many edge cases

**Complexity:** ~2000-4000 lines of TypeScript for a basic Newton-Raphson solver with common constraints.

### Option 2: Use PlaneGCS via WebAssembly

**The `@salusoft89/planegcs` npm package** is a WebAssembly port of FreeCAD's PlaneGCS solver.

```bash
npm install @salusoft89/planegcs
```

**Pros:**
- Battle-tested solver from FreeCAD
- Supports all common constraint types
- Multiple solving algorithms (DogLeg, Levenberg-Marquardt, BFGS, SQP)
- Already compiled to WASM for browser/Node

**Cons:**
- External dependency
- WASM interop overhead
- May need wrapper code
- Less control over internals

**Recommendation:** Start with our own solver for learning and control. If performance or robustness becomes an issue, consider PlaneGCS as a fallback or replacement.

### Option 3: SolveSpace's Solver

SolveSpace (GPL-3.0) has a well-regarded constraint solver:
- Symbolic algebra system for constraints
- Modified Newton's method
- Least-squares for under-constrained sketches
- Available as a C library (`slvs.h`)

**Cons:** GPL license requires careful consideration for distribution.

### Commercial Solvers (Reference Only)

- **D-Cubed DCM** (Siemens) — Used in AutoCAD, SolidWorks, Creo
- **LEDAS LGS** — Used in BricsCAD
- **C3D Solver** — Part of C3D Toolkit (KOMPAS-3D)

---

## Recommended Approach: Build Our Own

For labrep, we'll build our own constraint solver because:
1. Full TypeScript integration with our data types
2. Learning opportunity — understanding the algorithms
3. Can optimize for our specific voice/text command use cases
4. No license concerns

We'll follow the Newton-Raphson approach with Jacobian-based iteration, similar to how PlaneGCS and SolveSpace work.

---

## Constraint Types

### Geometric Constraints

```typescript
// Point constraints
interface CoincidentConstraint {
  type: 'coincident';
  point1: PointRef;
  point2: PointRef;
}

interface FixedConstraint {
  type: 'fixed';
  element: ElementRef;
  position?: Point2D;  // Optional: fix at specific position
}

interface PointOnLineConstraint {
  type: 'pointOnLine';
  point: PointRef;
  line: LineRef;
}

interface PointOnCircleConstraint {
  type: 'pointOnCircle';
  point: PointRef;
  circle: CircleRef;
}

// Line constraints
interface HorizontalConstraint {
  type: 'horizontal';
  line: LineRef;
}

interface VerticalConstraint {
  type: 'vertical';
  line: LineRef;
}

interface ParallelConstraint {
  type: 'parallel';
  line1: LineRef;
  line2: LineRef;
}

interface PerpendicularConstraint {
  type: 'perpendicular';
  line1: LineRef;
  line2: LineRef;
}

interface CollinearConstraint {
  type: 'collinear';
  line1: LineRef;
  line2: LineRef;
}

// Curve constraints
interface TangentConstraint {
  type: 'tangent';
  curve1: CurveRef;
  curve2: CurveRef;
}

interface EqualConstraint {
  type: 'equal';
  element1: ElementRef;  // length, radius, etc.
  element2: ElementRef;
}

interface ConcentricConstraint {
  type: 'concentric';
  circle1: CircleRef;
  circle2: CircleRef;
}

interface SymmetricConstraint {
  type: 'symmetric';
  element1: ElementRef;
  element2: ElementRef;
  axis: LineRef;
}

interface MidpointConstraint {
  type: 'midpoint';
  point: PointRef;
  line: LineRef;
}
```

### Dimensional Constraints

```typescript
interface DistanceConstraint {
  type: 'distance';
  from: PointRef | LineRef;
  to: PointRef | LineRef;
  value: number | ParameterRef;
}

interface HorizontalDistanceConstraint {
  type: 'horizontalDistance';
  point1: PointRef;
  point2: PointRef;
  value: number | ParameterRef;
}

interface VerticalDistanceConstraint {
  type: 'verticalDistance';
  point1: PointRef;
  point2: PointRef;
  value: number | ParameterRef;
}

interface AngleConstraint {
  type: 'angle';
  line1: LineRef;
  line2: LineRef;
  value: number | ParameterRef;  // radians
}

interface RadiusConstraint {
  type: 'radius';
  circle: CircleRef;
  value: number | ParameterRef;
}

interface DiameterConstraint {
  type: 'diameter';
  circle: CircleRef;
  value: number | ParameterRef;
}

interface ArcLengthConstraint {
  type: 'arcLength';
  arc: ArcRef;
  value: number | ParameterRef;
}
```

---

## Data Types

### Core Types

```typescript
/**
 * Reference to a sketch element or part of an element.
 */
type ElementRef = string;  // Element ID

interface PointRef {
  elementId: string;
  which: 'start' | 'end' | 'center' | 'point';
}

interface LineRef {
  elementId: string;
}

interface CircleRef {
  elementId: string;
}

interface CurveRef {
  elementId: string;
}

interface ArcRef {
  elementId: string;
}

/**
 * A named parameter that can be used in dimensional constraints.
 */
interface Parameter {
  readonly id: string;
  readonly name: string;
  value: number;
  expression?: string;  // e.g., "width * 2", "height + 10"
}

/**
 * Reference to a parameter by ID.
 */
interface ParameterRef {
  parameterId: string;
}

/**
 * Union type of all geometric constraints.
 */
type GeometricConstraint =
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
 * Union type of all dimensional constraints.
 */
type DimensionalConstraint =
  | DistanceConstraint
  | HorizontalDistanceConstraint
  | VerticalDistanceConstraint
  | AngleConstraint
  | RadiusConstraint
  | DiameterConstraint
  | ArcLengthConstraint;

/**
 * Union type of all constraints.
 */
type Constraint = GeometricConstraint | DimensionalConstraint;

/**
 * Constraint with metadata.
 */
interface ConstraintEntry {
  readonly id: string;
  readonly constraint: Constraint;
  readonly isConstruction: boolean;  // Construction constraints don't affect DOF
}
```

### Result Types

```typescript
/**
 * Status of constraint solving.
 */
type SolveStatus =
  | 'solved'           // All constraints satisfied, DOF = 0
  | 'underConstrained' // Constraints satisfied but DOF > 0
  | 'overConstrained'  // Constraints conflict, no solution
  | 'redundant'        // Some constraints are redundant
  | 'failed'           // Solver failed to converge
  ;

/**
 * Diagnostic information about a constraint.
 */
interface ConstraintDiagnostic {
  constraintId: string;
  status: 'satisfied' | 'violated' | 'redundant' | 'conflicting';
  error?: number;  // Residual error for this constraint
  message?: string;
}

/**
 * Result of constraint solving.
 */
interface SolveResult {
  status: SolveStatus;
  degreesOfFreedom: number;
  iterations: number;
  residual: number;  // Sum of squared constraint errors
  diagnostics: ConstraintDiagnostic[];
  conflictingConstraints?: string[];  // IDs of conflicting constraints
  redundantConstraints?: string[];    // IDs of redundant constraints
}

/**
 * Extended sketch with constraint information.
 */
interface ConstrainedSketch extends Sketch {
  constraints: ConstraintEntry[];
  parameters: Parameter[];
}
```

---

## Functions

### Constraint Management

```typescript
/**
 * Add a constraint to a sketch.
 * Returns updated sketch and the constraint ID.
 */
function addConstraint(
  sketch: ConstrainedSketch,
  constraint: Constraint
): OperationResult<{ sketch: ConstrainedSketch; constraintId: string }>;

/**
 * Remove a constraint from a sketch.
 */
function removeConstraint(
  sketch: ConstrainedSketch,
  constraintId: string
): OperationResult<ConstrainedSketch>;

/**
 * Update a dimensional constraint's value.
 */
function updateConstraintValue(
  sketch: ConstrainedSketch,
  constraintId: string,
  newValue: number
): OperationResult<ConstrainedSketch>;
```

### Solving

```typescript
/**
 * Solve constraints and update element positions.
 * 
 * The solver uses Newton-Raphson iteration to minimize constraint residuals.
 * Elements are updated in place (positions change to satisfy constraints).
 */
function solve(
  sketch: ConstrainedSketch,
  options?: SolveOptions
): SolveResult;

interface SolveOptions {
  maxIterations?: number;     // Default: 100
  tolerance?: number;         // Default: 1e-10
  algorithm?: 'newton' | 'dogleg' | 'levenbergMarquardt';
  dampingFactor?: number;     // For Levenberg-Marquardt
}

/**
 * Solve incrementally after a small change (e.g., dragging a point).
 * Uses previous solution as starting point for faster convergence.
 */
function solveIncremental(
  sketch: ConstrainedSketch,
  changedElements: string[]
): SolveResult;
```

### Analysis

```typescript
/**
 * Calculate degrees of freedom for a sketch.
 */
function getDegreesOfFreedom(sketch: ConstrainedSketch): number;

/**
 * Check if sketch is fully constrained (DOF = 0).
 */
function isFullyConstrained(sketch: ConstrainedSketch): boolean;

/**
 * Check if sketch has conflicting constraints.
 */
function isOverConstrained(sketch: ConstrainedSketch): boolean;

/**
 * Find redundant constraints that can be removed without changing DOF.
 */
function findRedundantConstraints(sketch: ConstrainedSketch): string[];

/**
 * Analyze which elements would move if the solver were run.
 * Returns elements that are not fully constrained.
 */
function findUnconstrainedElements(sketch: ConstrainedSketch): string[];

/**
 * Suggest constraints to fully constrain the sketch.
 */
function suggestConstraints(sketch: ConstrainedSketch): Constraint[];
```

### Parameters

```typescript
/**
 * Add a named parameter to the sketch.
 */
function addParameter(
  sketch: ConstrainedSketch,
  name: string,
  value: number,
  expression?: string
): OperationResult<{ sketch: ConstrainedSketch; parameterId: string }>;

/**
 * Update a parameter's value and re-solve.
 */
function setParameter(
  sketch: ConstrainedSketch,
  nameOrId: string,
  value: number
): OperationResult<ConstrainedSketch>;

/**
 * Update a parameter's expression and re-solve.
 */
function setParameterExpression(
  sketch: ConstrainedSketch,
  nameOrId: string,
  expression: string
): OperationResult<ConstrainedSketch>;

/**
 * Evaluate a parameter expression in the context of a sketch.
 */
function evaluateExpression(
  sketch: ConstrainedSketch,
  expression: string
): OperationResult<number>;

/**
 * Get all parameters that a given parameter depends on.
 */
function getParameterDependencies(
  sketch: ConstrainedSketch,
  parameterId: string
): string[];
```

---

## Algorithm Approach

### Newton-Raphson Overview

The constraint solver converts geometric constraints into a system of equations:

```
F(x) = 0

where:
  x = vector of element parameters [p1.x, p1.y, p2.x, p2.y, ...]
  F = vector of constraint equations [f1(x), f2(x), ...]
```

Newton-Raphson iteratively refines the solution:

```
x_{n+1} = x_n - J^{-1} · F(x_n)

where:
  J = Jacobian matrix (∂F/∂x)
  J^{-1} = inverse (or pseudo-inverse) of Jacobian
```

### Constraint Equations

Each constraint type maps to one or more equations:

```typescript
// Coincident: (p1.x - p2.x)² + (p1.y - p2.y)² = 0
// Simplified to two equations:
//   p1.x - p2.x = 0
//   p1.y - p2.y = 0

// Horizontal: p1.y - p2.y = 0

// Vertical: p1.x - p2.x = 0

// Parallel: (l1.dx * l2.dy) - (l1.dy * l2.dx) = 0
// where dx = end.x - start.x, dy = end.y - start.y

// Perpendicular: (l1.dx * l2.dx) + (l1.dy * l2.dy) = 0

// Distance: sqrt((p1.x - p2.x)² + (p1.y - p2.y)²) - d = 0
// Or squared form: (p1.x - p2.x)² + (p1.y - p2.y)² - d² = 0

// Point on line: (p.x - l.start.x) * l.dy - (p.y - l.start.y) * l.dx = 0

// Tangent (line-circle): 
//   |distance from circle center to line| - radius = 0

// Equal length:
//   sqrt((l1.dx)² + (l1.dy)²) - sqrt((l2.dx)² + (l2.dy)²) = 0
```

### Jacobian Matrix Construction

The Jacobian matrix J has dimensions (number of constraints) × (number of variables):

```
J[i][j] = ∂f_i / ∂x_j

Example for coincident constraint (p1, p2):
  f1 = p1.x - p2.x
  f2 = p1.y - p2.y

  ∂f1/∂p1.x = 1,  ∂f1/∂p2.x = -1,  others = 0
  ∂f2/∂p1.y = 1,  ∂f2/∂p2.y = -1,  others = 0
```

### Handling Under-Constrained Sketches

When DOF > 0, the Jacobian is not square (more variables than equations). We use:

1. **Least-squares solution:** Minimize ||J·Δx - (-F)||²
2. **Pseudo-inverse:** Δx = J⁺ · (-F) where J⁺ = (J^T · J)^{-1} · J^T
3. **Penalty method:** Add weak constraints to keep unchanged elements near current positions

### Handling Over-Constrained Sketches

When constraints conflict:
1. The Jacobian becomes rank-deficient
2. No solution exists that satisfies all constraints
3. Detect via SVD: zero singular values indicate linear dependencies
4. Report conflicting constraints to user

### Convergence Criteria

```typescript
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-10;

function hasConverged(residual: number, prevResidual: number): boolean {
  return residual < TOLERANCE || 
         Math.abs(residual - prevResidual) < TOLERANCE * 0.01;
}
```

### Algorithm Variants

| Algorithm | Strengths | Weaknesses |
|-----------|-----------|------------|
| **Newton-Raphson** | Fast convergence near solution | May diverge far from solution |
| **DogLeg** | Robust, handles ill-conditioning | More complex implementation |
| **Levenberg-Marquardt** | Good for nonlinear least-squares | Needs damping parameter tuning |
| **BFGS** | No Jacobian needed | Slower convergence |

**Recommendation:** Start with Newton-Raphson. Add Levenberg-Marquardt damping if convergence issues arise.

---

## Testing Approach

### Basic Constraint Tests

| Test | Description |
|------|-------------|
| `coincident_two_points` | Two points → same position |
| `horizontal_line` | Line becomes horizontal (Δy = 0) |
| `vertical_line` | Line becomes vertical (Δx = 0) |
| `parallel_lines` | Two lines → same slope |
| `perpendicular_lines` | Two lines → slopes multiply to -1 |
| `fixed_point` | Point stays at specified position |
| `point_on_line` | Point moves to lie on line |
| `point_on_circle` | Point moves to circle perimeter |

### Dimensional Constraint Tests

| Test | Description |
|------|-------------|
| `distance_two_points` | Points move to specified distance |
| `horizontal_distance` | Horizontal gap equals value |
| `vertical_distance` | Vertical gap equals value |
| `angle_between_lines` | Lines rotate to specified angle |
| `radius_of_circle` | Circle radius changes to value |
| `diameter_of_circle` | Circle diameter changes to value |

### Combined Constraint Tests

| Test | Description |
|------|-------------|
| `rectangle` | 4 lines with horizontal/vertical/perpendicular → rectangle |
| `square` | Rectangle + equal length → square |
| `equilateral_triangle` | 3 lines + 3 equal lengths → equilateral |
| `tangent_circle_line` | Circle tangent to line at exactly one point |
| `concentric_circles` | Two circles share center |

### Parameter Tests

| Test | Description |
|------|-------------|
| `parameter_creates` | Create named parameter with value |
| `parameter_in_constraint` | Use parameter in distance constraint |
| `parameter_update` | Change parameter → geometry updates |
| `parameter_expression` | Expression "width * 2" evaluates correctly |
| `parameter_dependency` | Change width → dependent params update |
| `circular_dependency` | Detect and reject circular expressions |

### Status Detection Tests

| Test | Description |
|------|-------------|
| `fully_constrained` | DOF = 0 when all DOF consumed |
| `under_constrained` | DOF > 0 reported correctly |
| `over_constrained` | Conflicting constraints detected |
| `redundant_constraint` | Adding parallel twice → redundant |
| `dof_calculation` | DOF matches expected for various sketches |

### Edge Cases

| Test | Description |
|------|-------------|
| `near_coincident_points` | Points already within tolerance |
| `parallel_nearly_parallel` | Lines nearly parallel (numerical precision) |
| `zero_length_line` | Degenerate line (start = end) |
| `zero_radius_circle` | Circle with r = 0 |
| `constraint_on_fixed` | Constraint on already-fixed element |
| `self_referential` | Constraint referencing same element twice |
| `large_sketch` | 100+ elements, 200+ constraints (performance) |
| `far_from_solution` | Initial positions very wrong → still converges |
| `near_singular_jacobian` | Numerically challenging constraint configuration |

### Performance Tests

| Test | Description |
|------|-------------|
| `solve_time_small` | < 10ms for 10 elements, 20 constraints |
| `solve_time_medium` | < 100ms for 50 elements, 100 constraints |
| `solve_time_large` | < 1s for 200 elements, 400 constraints |
| `incremental_fast` | Incremental solve after drag < 10ms |

---

## Viewer Examples

### constraint-simple

**Visual:** Rectangle with constraints visualized. Show horizontal/vertical icons on edges, coincident dots at corners, dimension annotations.

**Interaction:** Drag a corner → watch the rectangle reshape while maintaining constraints.

```typescript
import { createSketch, addLine, addConstraint, solve } from '@labrep/generation';

const sketch = createSketch(XY_PLANE);

// Draw a rough rectangle
const bottom = addLine(sketch, { x: 0, y: 0 }, { x: 10.5, y: 0.2 });
const right = addLine(sketch, { x: 10.5, y: 0.2 }, { x: 10.3, y: 5.1 });
const top = addLine(sketch, { x: 10.3, y: 5.1 }, { x: -0.1, y: 4.9 });
const left = addLine(sketch, { x: -0.1, y: 4.9 }, { x: 0, y: 0 });

// Add constraints
addConstraint(sketch, { type: 'horizontal', line: bottom });
addConstraint(sketch, { type: 'horizontal', line: top });
addConstraint(sketch, { type: 'vertical', line: left });
addConstraint(sketch, { type: 'vertical', line: right });
addConstraint(sketch, { type: 'coincident', point1: bottom.end, point2: right.start });
// ... more coincident constraints

// Solve
const result = solve(sketch);
// Lines are now perfectly horizontal/vertical and connected
```

### constraint-parametric

**Visual:** A simple bracket shape with dimension parameters. Sliders control width, height, hole diameter.

**Interaction:** Move slider → dimensions update in real-time → geometry reshapes.

```typescript
import { addParameter, addConstraint, setParameter } from '@labrep/generation';

// Add parameters
const width = addParameter(sketch, 'width', 20);
const height = addParameter(sketch, 'height', 30);
const holeD = addParameter(sketch, 'holeD', 5);

// Use parameters in constraints
addConstraint(sketch, { 
  type: 'horizontalDistance', 
  point1: left.start, 
  point2: right.start, 
  value: { parameterId: width.id } 
});

// Later: change parameter
setParameter(sketch, 'width', 25);  // Geometry updates automatically
```

### constraint-solver-viz

**Visual:** Debug visualization showing solver internals. Display DOF count, constraint satisfaction status (green=satisfied, red=violated), iteration count, residual convergence graph.

**Interaction:** Step through solver iterations one at a time to see how geometry converges.

```typescript
import { solveStep, getSolverState } from '@labrep/generation';

// Step through solving
let state = getSolverState(sketch);
while (!state.converged && state.iteration < 20) {
  solveStep(sketch);
  state = getSolverState(sketch);
  
  // Visualize: 
  // - Current element positions
  // - Residual for each constraint
  // - Jacobian matrix (as heatmap)
  // - DOF remaining
}
```

---

## File Organization

```
generation/src/
├── constraints/                 # NEW folder
│   ├── types.ts                # Constraint type definitions
│   ├── constraint.ts           # ConstraintEntry, management functions
│   ├── parameter.ts            # Parameter type and expression evaluation
│   ├── equations.ts            # Constraint → equation conversion
│   ├── jacobian.ts             # Jacobian matrix construction
│   ├── solver.ts               # Newton-Raphson solver
│   ├── analysis.ts             # DOF calculation, redundancy detection
│   └── index.ts
├── sketch/
│   └── constrained-sketch.ts   # Extended sketch with constraints
└── index.ts                    # Export constraint functions

generation/tests/
└── constraints/                 # NEW folder
    ├── geometric.test.ts       # Geometric constraint tests
    ├── dimensional.test.ts     # Dimensional constraint tests
    ├── combined.test.ts        # Combined constraint tests
    ├── parameter.test.ts       # Parameter and expression tests
    ├── analysis.test.ts        # DOF, redundancy, over-constrained tests
    ├── solver.test.ts          # Solver convergence tests
    └── performance.test.ts     # Performance benchmarks
```

---

## Implementation Order

1. **Core Types** (~100 lines)
   - Constraint type definitions
   - ConstraintEntry, Parameter types
   - SolveResult type

2. **Parameter System** (~200 lines)
   - Parameter creation and management
   - Simple expression parser (arithmetic + parameter references)
   - Expression evaluation
   - Dependency tracking

3. **Constraint Equations** (~400 lines)
   - Convert each constraint type to equation(s)
   - Residual calculation (how far is constraint from satisfied?)
   - Test each constraint type individually

4. **Jacobian Construction** (~300 lines)
   - Build Jacobian matrix from constraint equations
   - Partial derivatives for each constraint type
   - Sparse matrix representation (optional optimization)

5. **Basic Solver** (~300 lines)
   - Newton-Raphson iteration
   - Convergence detection
   - Basic solve() function

6. **Analysis Functions** (~200 lines)
   - DOF calculation
   - Redundancy detection (rank analysis)
   - Over-constrained detection
   - Suggest constraints

7. **Advanced Solver Features** (~300 lines)
   - Levenberg-Marquardt damping
   - Incremental solving
   - Better convergence for difficult cases

8. **Integration** (~200 lines)
   - ConstrainedSketch integration
   - API cleanup
   - Export from index.ts

---

## Exit Criteria

Phase 7 is complete when:

- [ ] **Constraint Types:** All geometric constraints (coincident, horizontal, vertical, parallel, perpendicular, tangent, equal, concentric, symmetric, midpoint)
- [ ] **Dimensional Constraints:** Distance, horizontal/vertical distance, angle, radius, diameter
- [ ] **Parameters:** Named parameters with numeric values
- [ ] **Expressions:** Simple expressions ("width * 2", "height + 10")
- [ ] **Solver:** Newton-Raphson converges for typical sketches
- [ ] **DOF Analysis:** Accurate degrees of freedom calculation
- [ ] **Status Detection:** Fully constrained, under-constrained, over-constrained
- [ ] **Redundancy:** Detect redundant constraints
- [ ] **Performance:** < 100ms for 50-element sketches
- [ ] **Tests:** ≥ 80 tests covering all constraint types and edge cases
- [ ] **Viewer Examples:** constraint-simple, constraint-parametric, constraint-solver-viz
- [ ] **Documentation:** Updated README, API docs for constraint functions

---

## References

- [Wikipedia: Geometric Constraint Solving](https://en.wikipedia.org/wiki/Geometric_constraint_solving)
- [SolveSpace Technology](https://solvespace.com/tech.pl)
- [FreeCAD PlaneGCS Source](https://github.com/FreeCAD/FreeCAD/tree/master/src/Mod/Sketcher/App/planegcs)
- [@salusoft89/planegcs npm package](https://www.npmjs.com/package/@salusoft89/planegcs)
- Hoffmann, C.M.: Geometric Constraint Solving (various papers)
- Roller, D.: Geometric Constraint Solving and Applications (Springer, 1998)
