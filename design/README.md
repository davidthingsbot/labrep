# Design

Architecture and design documentation for labrep.

---

## Purpose

This folder contains design documents that describe how labrep should be built — the architecture, APIs, data structures, and design decisions before implementation.

Unlike `background/` (which covers external knowledge), `design/` is about **our specific choices** for labrep.

---

## Core Design Overview

### The Guiding Workflow

Our design is driven by a typical CAD workflow:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TARGET USER WORKFLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CREATE SKETCH                                               │
│     └─► Select or create a 2D workplane                        │
│                                                                 │
│  2. DRAW 2D SHAPES                                              │
│     └─► Lines, arcs, circles, rectangles on the sketch        │
│                                                                 │
│  3. ADD CONSTRAINTS                                             │
│     └─► Parallel, perpendicular, tangent, coincident, equal   │
│                                                                 │
│  4. ADD PARAMETERS                                              │
│     └─► Named dimensions, variables, expressions               │
│                                                                 │
│  5. CONFIRM SKETCH                                              │
│     └─► Validate: fully constrained? closed profiles?          │
│                                                                 │
│  6. EXTRUDE OR REVOLVE                                          │
│     └─► Create first 3D body from sketch profile               │
│                                                                 │
│  7. STEP FILE I/O                                               │
│     └─► Save progress, load reference geometry                 │
│                                                                 │
│  8. SKETCH ON FACE                                              │
│     └─► Select face of body, create new sketch there           │
│                                                                 │
│  9. MORE OPERATIONS                                             │
│     └─► Extrude (add or cut), revolve, pattern                 │
│                                                                 │
│  10. LOAD EXTERNAL SKETCH                                       │
│      └─► Import sketch from file, apply to surface             │
│                                                                 │
│  11. ASSEMBLIES                                                 │
│      └─► Multiple parts, joints/mates, positioning             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Types

### Tier 1: Mathematical Foundation

The primitives everything else builds on.

```typescript
// 2D Primitives
interface Point2D { x: number; y: number; }
interface Vector2D { x: number; y: number; }

// 3D Primitives  
interface Point3D { x: number; y: number; z: number; }
interface Vector3D { x: number; y: number; z: number; }

// Transforms
interface Transform2D { /* 3x3 matrix */ }
interface Transform3D { /* 4x4 matrix */ }

// Coordinate systems
interface Axis { origin: Point3D; direction: Vector3D; }
interface Plane { origin: Point3D; normal: Vector3D; xAxis: Vector3D; }
```

### Tier 2: 2D Geometry (Sketch Elements)

Curves that live in a sketch.

```typescript
// Base curve interface
interface Curve2D {
  evaluate(t: number): Point2D;
  derivative(t: number): Vector2D;
  startParam: number;
  endParam: number;
  isClosed: boolean;
}

// Concrete curve types
interface Line2D extends Curve2D {
  start: Point2D;
  end: Point2D;
}

interface Arc2D extends Curve2D {
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
}

interface Circle2D extends Curve2D {
  center: Point2D;
  radius: number;
}

// Composite
interface Wire2D {
  curves: Curve2D[];  // Connected sequence
  isClosed: boolean;
}

interface Profile2D {
  outer: Wire2D;      // Outer boundary (CCW)
  holes: Wire2D[];    // Inner boundaries (CW)
}
```

### Tier 3: Sketch System

The constrained 2D environment.

```typescript
interface Sketch {
  plane: Plane;                    // Where the sketch lives in 3D
  elements: SketchElement[];       // Lines, arcs, circles, points
  constraints: Constraint[];       // Geometric relationships
  parameters: Parameter[];         // Named dimensions
  profiles: Profile2D[];           // Closed regions (computed)
}

interface SketchElement {
  id: string;
  geometry: Curve2D | Point2D;
  construction: boolean;           // Construction geometry?
}

// Constraints
type ConstraintType = 
  | 'coincident'      // Two points same location
  | 'parallel'        // Two lines parallel
  | 'perpendicular'   // Two lines perpendicular
  | 'tangent'         // Curve tangent to curve
  | 'equal'           // Two lengths equal
  | 'horizontal'      // Line is horizontal
  | 'vertical'        // Line is vertical
  | 'concentric'      // Two circles share center
  | 'symmetric'       // Elements symmetric about line
  | 'fixed'           // Element cannot move
  ;

interface Constraint {
  type: ConstraintType;
  elements: string[];              // IDs of constrained elements
}

// Parameters (dimensional constraints)
interface Parameter {
  name: string;
  value: number;
  expression?: string;             // e.g., "width * 2"
  appliedTo: DimensionalConstraint;
}

interface DimensionalConstraint {
  type: 'distance' | 'angle' | 'radius' | 'diameter';
  elements: string[];
}
```

### Tier 4: 3D Geometry

Curves and surfaces in 3D space.

```typescript
// 3D Curves
interface Curve3D {
  evaluate(t: number): Point3D;
  derivative(t: number): Vector3D;
  startParam: number;
  endParam: number;
}

interface Line3D extends Curve3D { start: Point3D; end: Point3D; }
interface Circle3D extends Curve3D { plane: Plane; radius: number; }
interface Arc3D extends Curve3D { plane: Plane; radius: number; startAngle: number; endAngle: number; }

// Surfaces
interface Surface {
  evaluate(u: number, v: number): Point3D;
  normal(u: number, v: number): Vector3D;
  uRange: [number, number];
  vRange: [number, number];
}

interface PlaneSurface extends Surface { plane: Plane; }
interface CylindricalSurface extends Surface { axis: Axis; radius: number; }
interface ConicalSurface extends Surface { axis: Axis; angle: number; }
interface SphericalSurface extends Surface { center: Point3D; radius: number; }
```

### Tier 5: Topology (BRep)

The structure of 3D solids.

```typescript
interface Vertex {
  point: Point3D;
  tolerance: number;
}

interface Edge {
  curve: Curve3D;
  startVertex: Vertex;
  endVertex: Vertex;
  startParam: number;
  endParam: number;
  tolerance: number;
}

interface Wire {
  edges: OrientedEdge[];           // Edges with direction
  isClosed: boolean;
}

interface OrientedEdge {
  edge: Edge;
  forward: boolean;                // Same direction as edge curve?
}

interface Face {
  surface: Surface;
  outerWire: Wire;                 // Boundary (CCW when viewed from outside)
  innerWires: Wire[];              // Holes
  tolerance: number;
}

interface Shell {
  faces: Face[];
  isClosed: boolean;
}

interface Solid {
  outerShell: Shell;
  innerShells: Shell[];            // Cavities
}

interface Compound {
  solids: Solid[];
}
```

### Tier 6: Operations

Functions that create or modify geometry.

```typescript
// Sketch → 3D
interface ExtrudeOperation {
  profile: Profile2D;
  direction: Vector3D;
  distance: number;
  symmetric: boolean;              // Extrude both directions?
}

interface RevolveOperation {
  profile: Profile2D;
  axis: Axis;
  angle: number;                   // Radians, up to 2π
}

// Solid → Solid
interface BooleanOperation {
  type: 'union' | 'subtract' | 'intersect';
  body: Solid;
  tool: Solid;
}

// Result type
interface OperationResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  warnings?: string[];
}
```

### Tier 7: Assembly

Multiple parts and their relationships.

```typescript
interface Part {
  id: string;
  name: string;
  solid: Solid;
  transform: Transform3D;          // Position in assembly
}

interface Assembly {
  parts: Part[];
  joints: Joint[];
}

interface Joint {
  type: JointType;
  part1: string;                   // Part ID
  part2: string;
  geometry1: JointGeometry;        // What's mating on part 1
  geometry2: JointGeometry;        // What's mating on part 2
}

type JointType = 
  | 'fixed'           // No relative motion
  | 'revolute'        // Rotation about axis
  | 'prismatic'       // Translation along axis
  | 'cylindrical'     // Rotation + translation along axis
  | 'planar'          // Sliding on plane
  ;

interface JointGeometry {
  type: 'point' | 'axis' | 'plane' | 'face';
  reference: Vertex | Edge | Face;
}
```

### Tier 8: File I/O

```typescript
interface StepReader {
  read(data: string): OperationResult<Compound>;
}

interface StepWriter {
  write(compound: Compound): string;
}

interface SketchFileFormat {
  read(data: string): OperationResult<Sketch>;
  write(sketch: Sketch): string;
}
```

---

## Functions by Data Type

### Point/Vector Operations

```typescript
// Point2D / Point3D
add(p: Point, v: Vector): Point
subtract(p1: Point, p2: Point): Vector
distance(p1: Point, p2: Point): number
midpoint(p1: Point, p2: Point): Point
transform(p: Point, t: Transform): Point

// Vector2D / Vector3D
add(v1: Vector, v2: Vector): Vector
scale(v: Vector, s: number): Vector
dot(v1: Vector, v2: Vector): number
cross(v1: Vector3D, v2: Vector3D): Vector3D  // 3D only
normalize(v: Vector): Vector
length(v: Vector): number
angle(v1: Vector, v2: Vector): number
```

### Curve Operations

```typescript
// Evaluation
evaluate(curve: Curve, t: number): Point
tangent(curve: Curve, t: number): Vector
curvature(curve: Curve, t: number): number
length(curve: Curve): number

// Queries
pointOnCurve(curve: Curve, p: Point, tolerance: number): boolean
nearestPoint(curve: Curve, p: Point): { point: Point; param: number }

// Modification
trim(curve: Curve, t1: number, t2: number): Curve
reverse(curve: Curve): Curve
transform(curve: Curve, t: Transform): Curve

// Intersection
intersect(c1: Curve, c2: Curve): Point[]
```

### Sketch Operations

```typescript
// Element management
addLine(sketch: Sketch, start: Point2D, end: Point2D): SketchElement
addCircle(sketch: Sketch, center: Point2D, radius: number): SketchElement
addArc(sketch: Sketch, center: Point2D, radius: number, start: number, end: number): SketchElement
removeElement(sketch: Sketch, id: string): void

// Constraints
addConstraint(sketch: Sketch, constraint: Constraint): void
removeConstraint(sketch: Sketch, index: number): void
solve(sketch: Sketch): SolveResult  // Constraint solver

// Parameters
setParameter(sketch: Sketch, name: string, value: number): void
getParameter(sketch: Sketch, name: string): number

// Queries
isFullyConstrained(sketch: Sketch): boolean
findProfiles(sketch: Sketch): Profile2D[]  // Find closed regions
validate(sketch: Sketch): ValidationResult
```

### Solid Operations

```typescript
// Construction from sketch
extrude(profile: Profile2D, direction: Vector3D, distance: number): Solid
revolve(profile: Profile2D, axis: Axis, angle: number): Solid

// Boolean operations
union(s1: Solid, s2: Solid): Solid
subtract(s1: Solid, s2: Solid): Solid
intersect(s1: Solid, s2: Solid): Solid

// Queries
volume(solid: Solid): number
surfaceArea(solid: Solid): number
boundingBox(solid: Solid): BoundingBox
isValid(solid: Solid): boolean

// Face selection
getFaces(solid: Solid): Face[]
findFace(solid: Solid, point: Point3D): Face | null
getPlaneFromFace(face: Face): Plane  // For sketch-on-face
```

### Assembly Operations

```typescript
// Part management
addPart(assembly: Assembly, solid: Solid, name: string): Part
removePart(assembly: Assembly, partId: string): void
transformPart(assembly: Assembly, partId: string, transform: Transform3D): void

// Joints
addJoint(assembly: Assembly, joint: Joint): void
removeJoint(assembly: Assembly, jointIndex: number): void
solveAssembly(assembly: Assembly): AssemblySolveResult  // Position parts per joints
```

---

## What We Exclude (For Now)

These features are explicitly **out of scope** for initial development:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXCLUDED FROM SCOPE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GEOMETRY                                                       │
│  • NURBS freeform curves/surfaces (use analytic only)          │
│  • Offset surfaces                                              │
│  • Loft, sweep with guide rails                                │
│  • Blend/fillet surfaces                                       │
│                                                                 │
│  OPERATIONS                                                     │
│  • Fillets and chamfers                                        │
│  • Shell (hollow out)                                           │
│  • Draft angles                                                 │
│  • Patterns (linear, circular array)                           │
│  • Mirror operations                                            │
│                                                                 │
│  DOMAIN-SPECIFIC                                                │
│  • Sheet metal features                                         │
│  • Mold/casting tools                                           │
│  • Weldments                                                    │
│  • Piping/routing                                               │
│                                                                 │
│  ANALYSIS                                                       │
│  • FEA integration                                              │
│  • Mass properties beyond volume                                │
│  • Tolerance analysis                                           │
│                                                                 │
│  RENDERING                                                      │
│  • Materials and textures                                       │
│  • Photorealistic rendering                                     │
│  • Animation                                                    │
│                                                                 │
│  These can be added later. Focus enables progress.              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Mathematical Foundation

**Goal:** Basic math operations, fully tested.

```
Data Types:
├── Point2D, Vector2D
├── Point3D, Vector3D
├── Transform2D, Transform3D
├── Plane, Axis
└── BoundingBox2D, BoundingBox3D

Functions:
├── Vector arithmetic (add, subtract, scale, dot, cross)
├── Point operations (distance, midpoint, transform)
├── Matrix operations (multiply, inverse, decompose)
└── Plane/Axis construction and queries

Tests:
├── All operations with known values
├── Edge cases (zero vectors, degenerate transforms)
└── Numerical precision tests
```

**Exit Criteria:** Can create points, vectors, transforms; all operations pass tests.

---

### Phase 2: 2D Curves

**Goal:** Line and arc geometry in 2D.

```
Data Types:
├── Curve2D (interface)
├── Line2D
├── Arc2D
├── Circle2D
└── Wire2D

Functions:
├── Construction (from points, center+radius, etc.)
├── Evaluation (point at parameter, tangent, length)
├── Intersection (line-line, line-arc, arc-arc)
├── Trim, reverse, transform
└── Wire construction from curves

Tests:
├── Evaluation at known parameters
├── Intersection with known solutions
├── Wire closure detection
└── Transform correctness
```

**Exit Criteria:** Can create and manipulate 2D curves; intersection works.

---

### Phase 3: Sketch System (No Constraints)

**Goal:** Create sketches with elements, find closed profiles.

```
Data Types:
├── Sketch
├── SketchElement
└── Profile2D

Functions:
├── Create sketch on plane
├── Add/remove elements
├── Find closed profiles (region detection)
└── Validate sketch

Tests:
├── Profile detection for simple shapes
├── Multiple profiles (with holes)
├── Open sketch detection
└── Sketch on arbitrary planes
```

**Exit Criteria:** Can create sketch, add lines/arcs, detect closed profiles.

---

### Phase 4: Basic 3D Geometry

**Goal:** 3D curves, planar surfaces, basic topology.

```
Data Types:
├── Curve3D, Line3D, Circle3D, Arc3D
├── Surface (interface)
├── PlaneSurface
├── Vertex, Edge, Wire (3D)
└── Face (planar only)

Functions:
├── 3D curve construction and evaluation
├── Planar surface from plane
├── Topology construction (vertex → edge → wire → face)
└── Topology validation

Tests:
├── 3D curve evaluation
├── Face construction from wire
├── Topology consistency checks
└── Normal computation
```

**Exit Criteria:** Can create 3D edges, wires, and planar faces.

---

### Phase 5: Extrude Operation

**Goal:** Turn 2D profile into 3D solid via extrusion.

```
Data Types:
├── CylindricalSurface (for extruded arcs)
├── Shell
└── Solid

Functions:
├── extrude(profile, direction, distance) → Solid
├── Shell construction from faces
├── Solid validation (closed, consistent normals)
└── Volume computation

Tests:
├── Extrude rectangle → box
├── Extrude circle → cylinder
├── Extrude with holes → solid with through-hole
├── Symmetric extrusion
└── Volume correctness
```

**Exit Criteria:** Can extrude sketch profiles into valid solids.

---

### Phase 6: STEP File I/O

**Goal:** Read and write STEP files for interoperability.

```
Data Types:
├── StepReader
├── StepWriter
└── StepEntity (internal AST)

Functions:
├── Parse STEP text → entity tree
├── Convert entities → labrep geometry
├── Convert labrep geometry → entities
├── Write entities → STEP text

Tests:
├── Round-trip: write → read → compare
├── Read known STEP files
├── Handle STEP from other CAD systems
└── Error handling for malformed files
```

**Exit Criteria:** Can save work, load external geometry.

---

### Phase 7: Sketch on Face

**Goal:** Create sketches on faces of existing solids.

```
Functions:
├── getPlaneFromFace(face) → Plane
├── Create sketch on arbitrary plane
├── Project edges onto sketch plane
└── Reference existing geometry in sketch

Tests:
├── Sketch on top face of box
├── Sketch on cylindrical face (unwrap?)
├── Edge projection correctness
```

**Exit Criteria:** Can create sketch on any planar face of solid.

---

### Phase 8: Boolean Operations

**Goal:** Combine solids (union, subtract, intersect).

```
Functions:
├── union(solid1, solid2) → Solid
├── subtract(solid1, solid2) → Solid
├── intersect(solid1, solid2) → Solid

Internals (see background/boolean-operations.md):
├── Surface-surface intersection
├── Face splitting
├── Face classification
├── Result construction

Tests:
├── Box ∪ box (overlapping, touching, separate)
├── Box - cylinder (hole)
├── Known volume results
├── Edge cases (tangent, coincident faces)
```

**Exit Criteria:** Boolean operations work on primitives and extruded shapes.

---

### Phase 9: Revolve Operation

**Goal:** Create solids by revolving profiles.

```
Data Types:
├── SphericalSurface
├── ToroidalSurface
└── ConicalSurface

Functions:
├── revolve(profile, axis, angle) → Solid
└── Handle full revolution and partial arcs

Tests:
├── Revolve rectangle → cylinder
├── Revolve offset rectangle → tube
├── Revolve triangle → cone
├── 90° partial revolve
```

**Exit Criteria:** Can create revolved solids.

---

### Phase 10: Constraint Solver

**Goal:** Add constraints to sketches, solve for geometry.

```
Data Types:
├── Constraint (various types)
├── DimensionalConstraint
└── Parameter

Functions:
├── addConstraint() / removeConstraint()
├── solve(sketch) → update element positions
├── Check: over-constrained, under-constrained
└── Parameter expressions

Tests:
├── Simple constraints (horizontal, vertical)
├── Dimensional constraints (distance, angle)
├── Over-constrained detection
├── Parameter-driven updates
```

**Exit Criteria:** Sketches can be constrained and solved.

---

### Phase 11: Assemblies

**Goal:** Multiple parts with joints.

```
Data Types:
├── Part
├── Assembly
└── Joint (various types)

Functions:
├── Add/remove parts
├── Add joints between parts
├── Solve assembly (position parts per joints)
└── Assembly validation

Tests:
├── Two parts with fixed joint
├── Revolute joint (hinge)
├── Over-constrained assembly detection
```

**Exit Criteria:** Can create simple assemblies with joints.

---

## TDD Approach

Every phase follows this pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TDD WORKFLOW PER FEATURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. WRITE TEST FIRST                                            │
│     ├── Test file: tests/<module>/<feature>.test.ts            │
│     ├── Describe expected behavior                              │
│     └── Use concrete values with known results                 │
│                                                                 │
│  2. RUN TEST → CONFIRM FAILURE                                  │
│     └── Test should fail (feature doesn't exist yet)           │
│                                                                 │
│  3. WRITE MINIMAL IMPLEMENTATION                                │
│     ├── Source file: src/<module>/<feature>.ts                 │
│     └── Just enough to pass the test                           │
│                                                                 │
│  4. RUN TEST → CONFIRM PASS                                     │
│     └── Test should now pass                                   │
│                                                                 │
│  5. REFACTOR IF NEEDED                                          │
│     ├── Clean up code                                           │
│     ├── Tests still pass                                        │
│     └── Commit                                                  │
│                                                                 │
│  6. NEXT TEST                                                   │
│     └── Repeat for next behavior                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Test Organization

```
tests/
├── core/
│   ├── point.test.ts
│   ├── vector.test.ts
│   └── transform.test.ts
├── geometry/
│   ├── line2d.test.ts
│   ├── arc2d.test.ts
│   └── ...
├── topology/
│   ├── vertex.test.ts
│   ├── edge.test.ts
│   └── ...
└── operations/
    ├── extrude.test.ts
    ├── boolean.test.ts
    └── ...
```

### Test Examples

```typescript
// tests/core/vector.test.ts
describe('Vector3D', () => {
  describe('cross product', () => {
    it('computes correct cross product', () => {
      const v1 = { x: 1, y: 0, z: 0 };
      const v2 = { x: 0, y: 1, z: 0 };
      const result = cross(v1, v2);
      expect(result).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('returns zero for parallel vectors', () => {
      const v1 = { x: 1, y: 0, z: 0 };
      const v2 = { x: 2, y: 0, z: 0 };
      const result = cross(v1, v2);
      expect(length(result)).toBeCloseTo(0);
    });
  });
});

// tests/operations/extrude.test.ts
describe('extrude', () => {
  it('extrudes rectangle into box', () => {
    const profile = makeRectangleProfile(10, 20);
    const solid = extrude(profile, { x: 0, y: 0, z: 1 }, 30);
    
    expect(volume(solid)).toBeCloseTo(10 * 20 * 30);
    expect(getFaces(solid).length).toBe(6);
    expect(isValid(solid)).toBe(true);
  });
});
```

---

## Document Index

| Document | Topic | Status |
|----------|-------|--------|
| (This README) | Overview, data types, phases | ✅ Complete |

## Adding a Design Document

1. Create `<topic>.md` in this folder
2. Include: problem statement, alternatives considered, decision, rationale
3. Use diagrams (ASCII or images in `images/<topic>/`)
4. Update this README's index
