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
│     └─► Select or create a 2D workplane                         │
│                                                                 │
│  2. DRAW 2D SHAPES                                              │
│     └─► Lines, arcs, circles, rectangles on the sketch          │
│                                                                 │
│  3. ADD CONSTRAINTS                                             │
│     └─► Parallel, perpendicular, tangent, coincident, equal     │
│                                                                 │
│  4. ADD PARAMETERS                                              │
│     └─► Named dimensions, variables, expressions                │
│                                                                 │
│  5. CONFIRM SKETCH                                              │
│     └─► Validate: fully constrained? closed profiles?           │
│                                                                 │
│  6. EXTRUDE OR REVOLVE                                          │
│     └─► Create first 3D body from sketch profile                │
│                                                                 │
│  7. STEP FILE I/O                                               │
│     └─► Save progress, load reference geometry                  │
│                                                                 │
│  8. SKETCH ON FACE                                              │
│     └─► Select face of body, create new sketch there            │
│                                                                 │
│  9. MORE OPERATIONS                                             │
│     └─► Extrude (add or cut), revolve, pattern                  │
│                                                                 │
│  10. LOAD EXTERNAL SKETCH                                       │
│      └─► Import sketch from file, apply to surface              │
│                                                                 │
│  11. ASSEMBLIES                                                 │
│      └─► Multiple parts, joints/mates, positioning              │
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

Features explicitly **out of scope** for initial development (may be added in later phases):

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXCLUDED FROM SCOPE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GEOMETRY                                                       │
│  • BSpline/NURBS surfaces (Phase 21+ — "the dragon")            │
│  • Offset surfaces                                              │
│  • Ellipse, parabola, hyperbola curves                          │
│                                                                 │
│  OPERATIONS (planned in future phases)                          │
│  • Fillets/chamfers — Phase 17                                  │
│  • Patterns — Phase 18                                          │
│  • Mirror — Phase 19                                            │
│  • Shell — Phase 20                                             │
│  • Loft — Phase 21                                              │
│  • Sweep — Phase 22                                             │
│                                                                 │
│  DOMAIN-SPECIFIC (no current plans)                             │
│  • Sheet metal features                                         │
│  • Mold/casting tools                                           │
│  • Weldments                                                    │
│  • Piping/routing                                               │
│                                                                 │
│  ANALYSIS                                                       │
│  • FEA integration                                              │
│  • Tolerance analysis                                           │
│                                                                 │
│  RENDERING                                                      │
│  • Materials and textures                                       │
│  • Photorealistic rendering                                     │
│                                                                 │
│  Focus enables progress — add incrementally as needed.          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Learning from OCCT's Legacy Design

OpenCASCADE carries 30+ years of design decisions, naming conventions, and architectural patterns from an era before modern C++ (let alone TypeScript). Understanding these legacy patterns helps us avoid repeating them.

### The gp / Geom / Geom2d Split

OCCT has **three parallel hierarchies** for describing the same geometric concepts:

| Package | Purpose | Example | Memory |
|---------|---------|---------|--------|
| `gp` | Lightweight value types | `gp_Pnt`, `gp_Circ`, `gp_Pln` | Stack, copyable |
| `Geom` | 3D parametric curves/surfaces | `Geom_Circle`, `Geom_Plane` | Handle (ref-counted) |
| `Geom2d` | 2D parametric curves | `Geom2d_Circle`, `Geom2d_Line` | Handle (ref-counted) |

**Why this exists:**
- `gp` classes are efficient for computation (no virtual calls, stack allocation)
- `Geom` classes support parameterization (can evaluate at any t or u,v)
- `Geom` classes participate in BRep (can be shared via handles)

**The problem:**
- A `Geom_Circle` internally contains a `gp_Circ`
- You constantly convert between them
- New users are perpetually confused ("Which circle do I use?")
- Documentation doesn't clearly explain the distinction

**Our approach:** Single representation per concept. If we need parameterization, build it in from the start. Don't create "lightweight" duplicates.

### The TopoDS / TShape / BRep Split

OCCT topology has **three layers** for the same entity:

```
┌─────────────────────────────────────────────────────────────────┐
│              OCCT'S THREE-LAYER TOPOLOGY                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LAYER 1: TopoDS_Shape                                          │
│  ─────────────────────                                          │
│  • A "reference" to topology + orientation + location           │
│  • Lightweight, copyable                                        │
│  • Multiple TopoDS_Shape can reference same TShape              │
│                                                                 │
│  LAYER 2: TopoDS_TShape (TVertex, TEdge, TFace, etc.)           │
│  ────────────────────────────────────────────────────           │
│  • The actual topological structure                             │
│  • Contains child shapes, flags                                 │
│  • Abstract — no geometry attached                              │
│                                                                 │
│  LAYER 3: BRep_TShape (BRep_TVertex, BRep_TEdge, BRep_TFace)    │
│  ───────────────────────────────────────────────────────────    │
│  • Inherits from TopoDS_TShape                                  │
│  • Adds geometric data (curves, surfaces, tolerances)           │
│  • This is where actual BRep data lives                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Example of the confusion:**
```cpp
// To get a point from a vertex, you need:
TopoDS_Vertex vertex = ...;                    // Layer 1
const TopoDS_TShape& tshape = vertex.TShape(); // Layer 2
const BRep_TVertex& tvertex = dynamic_cast<const BRep_TVertex&>(tshape); // Layer 3
gp_Pnt point = tvertex.Pnt();                  // Finally!

// Or use the helper (which hides this mess):
gp_Pnt point = BRep_Tool::Pnt(vertex);
```

**Why this exists:**
- Separation of concerns (topology vs geometry)
- Memory sharing (multiple shapes reference same TShape)
- Historical: BRep was added later as one possible geometry binding

**The problem:**
- Extreme indirection for simple operations
- Easy to hold wrong layer and get confused
- Dynamic casts everywhere
- `BRep_Tool` has 50+ static methods because the layering is too complex

**Our approach:** Flatten the hierarchy. A `Vertex` contains a `Point3D` and tolerance, period. Orientation and transforms are separate concerns, handled explicitly.

### The Handle System

OCCT predates `std::shared_ptr` (and even standardized smart pointers). It invented its own:

```cpp
Handle(Geom_Circle) circle = new Geom_Circle(...);
```

**Problems:**
- Custom memory manager (MMGT_OPT environment variable)
- Memory leaks in old versions (fixed in 6.8+)
- Doesn't integrate with modern C++ memory management
- Requires special macros in class definitions

**Our approach:** Use standard TypeScript memory management. Immutable data structures where practical.

### Naming Conventions

OCCT naming reflects its age and French origins:

| OCCT Name | What It Means | Modern Name |
|-----------|---------------|-------------|
| `gp` | Geometric Primitives | `math` or `core` |
| `Pln` | Plane | `Plane` |
| `Circ` | Circle | `Circle` |
| `Ax1`, `Ax2`, `Ax3` | Axis systems | `Axis`, `CoordinateSystem` |
| `Trsf` | Transform | `Transform` |
| `ElCLib` | Elementary Curves Library | (just put methods on curves) |
| `BRepBuilderAPI` | BRep construction | `builder` or `create` |
| `BRepAlgoAPI` | Boolean algorithms | `boolean` |
| `TopAbs` | Topology Absolute (enums) | (inline the enums) |
| `TopExp` | Topology Explorer | `traverse` or `iterate` |

**Our approach:** Use clear, modern names. Full words, not abbreviations. `Circle` not `Circ`. `Plane` not `Pln`.

### CDL and WOK (Removed in OCCT 7.0)

Until 2016, OCCT required a custom language (CDL - CAS.CADE Definition Language) and build system (WOK - Workshop Organization Kit). Classes were defined in `.cdl` files and transpiled to C++.

**This was removed in OCCT 7.0**, but the code structure still reflects CDL patterns:
- Classes organized by CDL "packages"
- Naming conventions from CDL era
- Some architectural patterns exist because CDL required them

**Our approach:** We're starting fresh in TypeScript. No legacy build systems to satisfy.

### When Unification Failed

Sometimes OCCT's layers exist for good reasons. Cautionary tales:

**1. Curve Representations**
An edge can have multiple curve representations:
- 3D curve (`BRep_Curve3D`)
- Curve on surface (`BRep_CurveOnSurface`)
- Curve on two surfaces (`BRep_CurveOn2Surfaces`)
- Polygon approximation (`BRep_Polygon3D`)

These seem redundant, but they're all needed:
- 3D curve for spatial operations
- Curve-on-surface for UV trimming
- Polygon for fast tessellation

**Lesson:** Don't unify representations that serve different purposes.

**2. Tolerances at Multiple Levels**
Vertices, edges, and faces all have tolerances. This seems redundant (why not one global tolerance?), but:
- Imported models have varying precision
- Operations can degrade precision locally
- Different features need different accuracy

**Lesson:** Local tolerances are harder but necessary.

**3. Orientation as Separate Concept**
`TopoDS_Shape` stores orientation separately from `TShape`. This allows:
- Same edge used forward in one face, reversed in another
- Efficient instancing (share geometry, vary orientation)

**Lesson:** Orientation should be composable, not baked into geometry.

### Summary: What to Avoid vs. What to Keep

**AVOID:**

| Pattern | Why |
|---------|-----|
| Multiple parallel type hierarchies | `gp` + `Geom` + `Geom2d` confusion |
| Deep inheritance for topology | `TopoDS` → `TShape` → `BRep_TShape` |
| Custom memory management | Handle system, MMGT_OPT |
| Abbreviated names | `Pln`, `Circ`, `Trsf` |
| Static helper classes | `BRep_Tool` with 50+ methods |
| Dynamic casting | `Handle::DownCast` everywhere |

**KEEP (for good reasons):**

| Pattern | Why |
|---------|-----|
| Geometry separate from topology | Different concerns, different lifecycles |
| Multiple curve representations | 3D curve ≠ UV curve ≠ polygon |
| Local tolerances | Real models have varying precision |
| Orientation as composable | Enables efficient sharing |

---

## Key Algorithmic Challenges

### Surface-Surface Intersection (SSI) — "The Dragon"

**What it is:** When two surfaces meet (like in a boolean operation), you need to find the curve where they intersect. That curve becomes a new edge in the result.

**Why it's called "the dragon":** This is the single hardest algorithmic problem in a BRep kernel. It's where projects stall and booleans fail.

**Simple cases are tractable:**

| Intersection | Result |
|--------------|--------|
| Plane ∩ Plane | Straight line |
| Plane ∩ Cylinder | Ellipse (or lines) |
| Plane ∩ Sphere | Circle |
| Sphere ∩ Sphere | Circle |
| Cylinder ∩ Cylinder | Ellipse, hyperbola, or lines |

These have closed-form analytic solutions.

**NURBS surfaces are brutal:**

- The intersection can be *multiple* disconnected curves
- Curves can branch, loop, or spiral
- Curves can degenerate to points (tangent contact)
- Curves can have cusps or self-intersections
- **No closed-form solution** — must iterate numerically

**From vcad's developer:**
> "My ssi.rs is ~500 lines of marching algorithms and Newton-Raphson refinement. She's ugly but she runs."

**Common approaches:**

1. **Marching** — Start at a known intersection point, step along the surface following the curve
2. **Subdivision** — Recursively split surfaces until intersection is locally planar
3. **Implicitization** — Convert parametric surface to implicit form and solve (expensive)

**Why it matters:** Every boolean operation (union, subtract, intersect) calls SSI internally. If SSI fails or computes the curve incorrectly, the boolean fails. This is why "failing booleans" plague CAD users — SSI hit an edge case the kernel developers hadn't handled.

**Our approach:** For Phase 8 (booleans), we start with analytic surfaces only (planes, cylinders, spheres, cones). These have tractable SSI. NURBS SSI is explicitly excluded for now — it's a Phase 12+ problem if ever.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SSI COMPLEXITY                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ANALYTIC (Phase 8)                                             │
│  ──────────────────                                             │
│  • Plane ∩ Plane         → closed-form line                     │
│  • Plane ∩ Cylinder      → closed-form ellipse                  │
│  • Plane ∩ Sphere        → closed-form circle                   │
│  • Cylinder ∩ Cylinder   → conic sections                       │
│  Complexity: Medium. Well-understood algorithms.                │
│                                                                 │
│  NURBS (Not in scope)                                           │
│  ────────────────────                                           │
│  • NURBS ∩ NURBS         → numerical marching                   │
│  • Branching, loops, degeneracies                               │
│  Complexity: Extreme. OCCT has tens of thousands of lines.      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Booleans Are Hard

Boolean operations (union, subtract, intersect) seem simple conceptually but involve a 4-stage pipeline where each stage can fail:

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOOLEAN PIPELINE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STAGE 1: CANDIDATE DETECTION                                   │
│  ────────────────────────────                                   │
│  • AABB (bounding box) overlap test                             │
│  • Filter face pairs that might intersect                       │
│  • Fast, rarely fails                                           │
│                                                                 │
│  STAGE 2: SURFACE-SURFACE INTERSECTION (SSI)                    │
│  ───────────────────────────────────────────                    │
│  • Find intersection curves between overlapping faces           │
│  • The dragon (see above)                                       │
│  • Most likely failure point                                    │
│                                                                 │
│  STAGE 3: FACE CLASSIFICATION                                   │
│  ────────────────────────────                                   │
│  • For each face, determine: Inside, Outside, or On boundary    │
│  • Ray casting + winding number                                 │
│  • Can fail on degenerate cases (face exactly on boundary)      │
│                                                                 │
│  STAGE 4: SEWING                                                │
│  ───────────────                                                │
│  • Trim faces along intersection curves                         │
│  • Split edges where curves cross                               │
│  • Merge surviving faces into new solid                         │
│  • Repair topology (match vertices within tolerance)            │
│  • Can fail if topology becomes inconsistent                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Degenerate cases that cause failures:**
- Tangent surfaces (surfaces touch but don't cross)
- Coincident faces (same surface, same boundary)
- Zero-thickness features (knife-edge results)
- Near-tangent (numerically indistinguishable from tangent)

**Our approach:** Implement booleans for analytic surfaces first. Document failure modes. Add robustness incrementally as we encounter edge cases in real use.

---

## Implementation Phases

Each phase has a dedicated design document with full details: OCCT references, data types, function signatures, testing approach, and viewer examples.

> **Note on Phase Reordering (2026-03-23):** Constraint solver moved up to Phase 7 because parametric design is core to voice/text-controlled CAD. The ability to say "make that 10mm" or "set width = 2 × height" is fundamental to the labrep vision. Operations like extrude and revolve work fine without constraints (they take explicit dimensions), but true parametric design requires the solver.

---

### Completed Phases

### Phase 1: Mathematical Foundation ✅

**Goal:** Basic math operations, fully tested.

**Design doc:** [`math-foundation.md`](math-foundation.md)

**Status:** Complete — Point2D/3D, Vector2D/3D, Transform3D, Axis, Plane, BoundingBox

---

### Phase 2: 2D Curves ✅

**Goal:** Line and arc geometry in 2D.

**Design doc:** [`curves-2d.md`](curves-2d.md)

**Status:** Complete — Line2D, Circle2D, Arc2D, Intersections, Wire2D (102 tests)

---

### Phase 3: STL Import/Export ✅

**Goal:** Read and write STL files from our Mesh type. Enables mesh-level round-trip testing.

**Design doc:** [`stl-io.md`](stl-io.md)

**Status:** Complete — ASCII/binary writer + reader, auto-detect, round-trip tests (46 tests)

---

### Phase 4: STEP Import/Export Foundation ✅

**Goal:** STEP parser/writer infrastructure + foundation-type converters (Point3D, Vector3D, Axis, Plane). The parser and writer handle all entity types syntactically; semantic conversion starts with foundation types and grows incrementally with each phase.

**Design doc:** [`step-io.md`](step-io.md)

**Rationale:** See [`io-first-refactor.md`](io-first-refactor.md) — I/O comes early so every subsequent phase can be round-trip tested through STEP and STL.

**Status:** Complete — lexer, parser, writer, model builder, foundation converters, round-trip tests (48 tests)

---

### Phase 5: Sketch System (No Constraints) ✅

**Design doc:** [`sketch-system.md`](sketch-system.md)

**Goal:** Create sketches with elements, find closed profiles.

**Status:** Complete — Sketch management, Profile2D, region detection with T-junction splitting (32 tests)

**Exit Criteria:** Can create sketch, add lines/arcs, detect closed profiles.

---

### Phase 6: Basic 3D Geometry + STEP Topology ✅

**Design doc:** [`basic-3d-geometry.md`](basic-3d-geometry.md)

**Goal:** 3D curves, planar surfaces, basic topology (Vertex → Edge → Wire → Face → Shell → Solid).

**Status:** Complete — Line3D, Circle3D, Arc3D, PlaneSurface, CylindricalSurface, full BRep topology, STEP converters (175 tests)

**Exit Criteria:** Can create 3D edges, wires, planar faces, shells, and solids with STEP round-trip.

---

### Upcoming Phases (Revised Order)

### Phase 7: Constraint Solver ✅ ← **MOVED UP**

**Goal:** Add constraints to sketches, solve for geometry. Enable parametric design.

**Design doc:** [`constraint-solver.md`](constraint-solver.md)

**Status:** Complete — geometric + dimensional constraints, Newton-Raphson solver, parametric design, analysis

**Why moved up:** Parametric design is core to voice/text-controlled CAD. Users need to say "make that 10mm" or "set width = 2 × height" — this requires a constraint solver.

```
Data Types:
├── Constraint (base type + specific constraint types)
├── DimensionalConstraint (with Parameter reference)
├── Parameter (name, value, expression)
└── SolveResult (success, DOF, errors)

Functions:
├── addConstraint(sketch, constraint)
├── removeConstraint(sketch, constraintId)
├── solve(sketch) → SolveResult
├── getDegreesOfFreedom(sketch)
├── isFullyConstrained(sketch)
├── isOverConstrained(sketch)
├── setParameter(sketch, name, value)
└── Parameter expressions: "width * 2"

Tests:
├── Simple constraints (horizontal, vertical)
├── Combined constraints (rectangle → square)
├── Dimensional constraints (distance, angle, radius)
├── Parameter-driven updates
├── Over-constrained detection
├── Under-constrained (DOF > 0)
├── Redundant constraints
├── Conflicting constraints
└── Large sketches (performance)
```

**Exit Criteria:** Sketches can be constrained and solved. Parameters drive geometry updates.

---

### Phase 8: Extrude + STEP ✅

**Goal:** Turn 2D profile into 3D solid via extrusion.

**Design doc:** [`extrude.md`](extrude.md)

**Status:** Complete — extrude, extrudeSymmetric, extrudeWithHoles, solidVolume, STEP export of solids

```
Functions:
├── extrude(profile, direction, distance) → Solid
├── extrudeSymmetric(profile, direction, distance) → Solid
├── extrudeTo(profile, targetFace) → Solid
└── STEP: SURFACE_OF_LINEAR_EXTRUSION, ADVANCED_BREP_SHAPE_REPRESENTATION

Tests:
├── Extrude rectangle → box (volume check)
├── Extrude circle → cylinder  
├── Extrude with holes → solid with through-hole
├── Extrude L-shape (non-convex profile)
├── Symmetric extrusion
└── STEP round-trip of extruded solid
```

**Exit Criteria:** Can extrude sketch profiles into valid solids, export to STEP.

---

### Phase 9: Revolve + STEP

**Goal:** Create solids by revolving profiles.

```
Data Types:
├── RevolutionSurface, SphericalSurface
├── ToroidalSurface, ConicalSurface

Functions:
├── revolve(profile, axis, angle) → Solid
├── revolvePartial(profile, axis, startAngle, endAngle) → Solid
└── STEP: SURFACE_OF_REVOLUTION, SPHERICAL_SURFACE, CONICAL_SURFACE, TOROIDAL_SURFACE

Tests:
├── Revolve rectangle 360° → cylinder
├── Revolve right triangle → cone
├── Revolve semicircle → sphere
├── 90° partial revolve → quarter solid
└── STEP round-trip for each surface type
```

**Exit Criteria:** Can create revolved solids with all analytic surface types.

---

### Phase 10: Sketch on Face

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
└── Edge projection correctness
```

**Exit Criteria:** Can create sketch on any planar face of solid.

---

### Phase 11: Boolean Operations (Planar) + STEP

**Goal:** Combine planar solids (union, subtract, intersect).

```
Functions:
├── union(solid1, solid2) → OperationResult<Solid>
├── subtract(solid1, solid2) → OperationResult<Solid>
├── intersect(solid1, solid2) → OperationResult<Solid>

Internals:
├── Stage 1: AABB overlap filtering
├── Stage 2: Face splitting (plane-plane intersection, 2D polygon clipping)
├── Stage 3: Face classification (ray casting, pointInSolid)
├── Stage 4: Face selection per operation rules
└── Stage 5: Edge stitching and shell assembly

Tests:
├── Box ∪ box (overlapping, touching, separate, identical, stacked)
├── Box ∩ box (Z-offset, B-inside-A, XY-only overlap)
├── Box - box (volume consistency, inclusion-exclusion)
├── Shell closure on all results
└── STEP round-trip of boolean result
```

**Exit Criteria:** Boolean operations work correctly for planar-face solids (extruded shapes). Closed shells, exact volumes, tight tolerances.

**Status (2026-03-24):** Complete for planar solids. 48 boolean tests passing. Analytic plane-surface intersection functions (plane-sphere, plane-cylinder, plane-cone) implemented but curved face trimming requires PCurve infrastructure (Phase 13).

**Limitation:** Curved surface booleans (box-sphere, box-cylinder) do NOT work correctly. Non-planar faces are classified whole by centroid — they cannot be split or trimmed. This requires the PCurve infrastructure in Phase 13.

---

### Phase 12: Solid Tessellation (Solid → Mesh)

> **Note (2026-03-24):** This phase should logically have been Phase 9.5 — right after we could create solids via extrude and revolve. Every visual rendering of solids depends on tessellation. Inserted here as the next phase to implement since Phases 1–11 are complete.

**Goal:** Convert any Solid (BRep) into a renderable triangle mesh with correct normals.

```
Functions:
├── solidToMesh(solid, options?) → Mesh
├── faceToTriangles(face) → { vertices, normals, indices }
│
├── Planar faces: ear clipping triangulation (convex + concave)
├── Cylindrical faces: parametric sampling (u along axis, v around circumference)
├── Spherical faces: lat/lon parametric grid
├── Conical faces: parametric sampling (u along axis, v around circumference)
├── Toroidal faces: parametric (u, v) grid
├── Revolution surfaces: parametric (u=angle, v=profile parameter)
│
├── Options:
│   ├── linearDeflection: max chord error (mm)
│   ├── angularDeflection: max angle between adjacent normals (radians)
│   └── minSegments: minimum subdivisions per face
│
└── Normals: analytic from surface definition (not inferred from triangles)

Tests:
├── Box → 12 triangles, exact normals
├── Cylinder → smooth shading, closed caps
├── Sphere → correct normals, pole handling
├── Revolved solid → correct parametric sampling
├── Boolean result → colored faces render correctly
└── Volume from mesh ≈ volume from divergence theorem (cross-check)

App Examples:
├── Shaded boolean results with colored faces
├── Smooth-shaded cylinder/sphere
└── Wireframe + shaded overlay mode
```

**Exit Criteria:** Any solid from extrude, revolve, or booleans can be rendered as a shaded mesh with correct normals. Analytic surfaces get smooth shading.

**Status (2026-03-24):** Complete. All surface types tessellated. Ear clipping handles concave polygons. Cone normal fix for negative radius. 37 tests, 6 app examples.

---

### Phase 13: PCurve Infrastructure + Curved Boolean Operations

**Goal:** Boolean operations between arbitrary curved solids (box-sphere, box-cylinder, L-bracket-sphere, etc.) with exact B-rep results.

This is the hardest geometry kernel phase. It requires the PCurve (parameter-space curve) infrastructure that enables exact face trimming along curved intersection boundaries.

```
Infrastructure (new data structures):
├── PCurve: Curve2D representation of an edge in a face's UV parameter space
├── CurveOnSurface: links a 3D edge curve to its 2D parametric form on a surface
├── Extended Edge: stores 3D curve + list of PCurves (one per adjacent face)
│
├── Based on OCCT's:
│   ├── BRep_TEdge (edge with multiple curve representations)
│   ├── BRep_CurveOnSurface (2D curve + surface + UV bounds)
│   └── IntTools_Curve (3D curve + two PCurves from face-face intersection)

Surface-Surface Intersection (analytic — already partially implemented):
├── intersectPlaneSphere → circle (✅ done)
├── intersectPlaneCylinder → circle/ellipse/lines (✅ done)
├── intersectPlaneCone → circle/ellipse/lines/parabola (✅ done)
├── intersectCylinderCylinder → conic sections (new)
├── intersectSphereSphere → circle (new)
│
├── For each intersection: produce 3D curve + PCurve in each surface's UV space
│
├── Based on OCCT's IntAna_QuadQuadGeo (analytic quadric-quadric)
│   See: library/opencascade/src/ModelingData/TKGeomBase/IntAna/

PCurve Construction:
├── projectCurveToSurface(curve3D, surface) → Curve2D
│   Project a 3D intersection curve onto a surface's (u,v) parameter space
│
├── For plane: trivial (worldToSketch)
├── For sphere: (θ, φ) from inverse trig
├── For cylinder: (θ, v) from projection onto axis + angular position
├── For cone: similar to cylinder with semi-angle correction

Face Splitting via Pave Blocks (OCCT's approach):
├── For each face pair, compute face-face intersection → IntTools_Curve
├── Find where intersection curves cross face edges → split points (pave points)
├── Split edges at pave points → pave blocks (sub-edges)
├── Rebuild faces from the pave block network
├── Each rebuilt face gets exact trim boundaries from PCurves
│
├── Based on OCCT's BOPAlgo_PaveFiller + BOPAlgo_BuilderFace
│   See: library/opencascade/src/ModelingAlgorithms/TKBO/BOPAlgo/

Trimmed Face Tessellation:
├── tessellateTrimmedFace(face, pcurveBoundary) → mesh
├── Generate parametric grid within the PCurve boundary
├── Cull/clip grid cells outside the trim boundary
├── Produce smooth normals from the surface definition
│
├── Extends existing tessellateCurvedFace with boundary awareness

Tests (must verify geometry, not just success):
├── Box − sphere: volume = box_vol − spherical_cap_vol (within 1%)
├── Box − cylinder (through-hole): volume = box_vol − π·r²·h (within 1%)
├── Box − cone: volume = box_vol − cone_cap_vol (within 1%)
├── L-bracket − sphere: correct cavity, non-convex solid handling
├── Sphere ∩ box: volume = spherical_cap (within 1%)
├── Cylinder ∪ box: correct union geometry
├── Volume consistency: V(A) + V(B) = V(union) + V(intersect)
├── Shell closure on ALL results
├── All results tessellatable with correct normals
├── STEP round-trip of curved boolean results
│
├── Edge cases:
│   ├── Tangent configurations (sphere touching plane)
│   ├── Near-degenerate intersections
│   ├── Multiple intersection loops
│   └── Non-convex solid trimming (the L-bracket case)

App Examples:
├── "Boolean: Curved Shapes" — L-bracket − sphere with animated position
├── "Boolean: Through Hole" — Box − cylinder
└── Shaded mesh with smooth normals on curved cavity surfaces
```

**Exit Criteria:** `booleanSubtract(lBracket, sphere)` produces a correct B-rep solid with exact spherical cavity surface, closed shell, correct volume, and smooth-shaded tessellation. All analytic surface pairs handled.

**Key reference:** OCCT source in `library/opencascade/src/`:
- `ModelingData/TKBRep/BRep/BRep_TEdge.hxx` — Edge with PCurve list
- `ModelingData/TKBRep/BRep/BRep_CurveOnSurface.hxx` — PCurve data structure
- `ModelingAlgorithms/TKBO/IntTools/IntTools_Curve.hxx` — Intersection result (3D + 2 PCurves)
- `ModelingAlgorithms/TKBO/IntTools/IntTools_FaceFace.hxx` — Face-face intersection
- `ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_BuilderFace.hxx` — Face reconstruction from split edges

---

### Phase 14: Command Interface

**Goal:** Text/voice command layer for parametric operations.

```
Functions:
├── parseCommand(text) → Command
├── executeCommand(model, command) → Result
├── Natural language → constraint mapping
└── Parameter modification commands

Commands:
├── "make that 10mm"
├── "set width = 2 × height"
├── "make these parallel"
├── "extrude 20mm"
└── "fillet 2mm"

Tests:
├── Command parsing
├── Ambiguity resolution
├── Undo/redo support
└── Error messages
```

**Exit Criteria:** Can control CAD operations via text commands.

---

### Phase 15: Assemblies + STEP

**Goal:** Multiple parts with joints.

```
Data Types:
├── Part
├── Assembly
└── Joint (fixed, revolute, prismatic, etc.)

Functions:
├── Add/remove parts
├── Add joints between parts
├── Solve assembly (position parts per joints)
└── Assembly validation

Tests:
├── Two parts with fixed joint
├── Revolute joint (hinge)
└── Over-constrained assembly detection
```

**Exit Criteria:** Can create simple assemblies with joints.

---

### Phase 16: External STEP Import ← **LOW PRIORITY**

**Goal:** Import complex STEP files from external CAD systems.

```
Requires:
├── BSpline curves (for edge geometry)
├── Robust topology reconstruction
└── Tolerance handling for imprecise models

Tests:
├── Import real-world STEP files
├── Handle missing/broken references
└── Surface type fallbacks
```

**Exit Criteria:** Can import STEP files from SolidWorks, Fusion 360, etc.

---

### Future Phases

```
Phase 16: Fillet and Chamfer
Phase 17: Mass Properties (volume, center of mass, moments)
Phase 18: Patterns (linear/circular array)
Phase 19: Mirror operations
Phase 20: Shell (hollow out solid)
Phase 21: Loft (multi-profile sweep)
Phase 22: Sweep along path
Phase 23: BSpline curves (for STEP import)
Phase 24: BSpline surfaces (the dragon)
```

---

## Design Validation Against OCCT

> ⚠️ **MANDATORY:** Before implementing any phase, assess the design for completeness against OpenCASCADE (OCCT). Ask:
>
> 1. **What functions does OCCT provide for this data type?** (e.g., `Geom_Circle` has 20+ methods)
> 2. **Which functions are essential for downstream operations?** (e.g., extrude needs `evaluate`, `tangent`, `length`)
> 3. **What edge cases does OCCT handle?** (degenerate inputs, tolerances, special configurations)
> 4. **What does the STEP representation require?** (which attributes must survive round-trip)
>
> **Document gaps explicitly.** If we choose to defer functionality, note it as "NOT IMPLEMENTED — reason" in the design doc.
>
> **Check the OCCT class reference** for each data type:
> - [Geom Package](https://dev.opencascade.org/doc/refman/html/package_geom.html) — 3D curves and surfaces
> - [Geom2d Package](https://dev.opencascade.org/doc/refman/html/package_geom2d.html) — 2D curves
> - [TopoDS Package](https://dev.opencascade.org/doc/refman/html/package_topods.html) — Topology
> - [BRep Package](https://dev.opencascade.org/doc/refman/html/package_brep.html) — BRep geometry bindings
>
> This step prevents discovering missing functionality late in implementation when it's expensive to add.

---

## TDD Approach

Every phase follows this pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TDD WORKFLOW PER FEATURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. WRITE TEST FIRST                                            │
│     ├── Test file: tests/<module>/<feature>.test.ts             │
│     ├── Describe expected behavior                              │
│     └── Use concrete values with known results                  │
│                                                                 │
│  2. RUN TEST → CONFIRM FAILURE                                  │
│     └── Test should fail (feature doesn't exist yet)            │
│                                                                 │
│  3. WRITE MINIMAL IMPLEMENTATION                                │
│     ├── Source file: src/<module>/<feature>.ts                  │
│     └── Just enough to pass the test                            │
│                                                                 │
│  4. RUN TEST → CONFIRM PASS                                     │
│     └── Test should now pass                                    │
│                                                                 │
│  5. REFACTOR IF NEEDED                                          │
│     ├── Clean up code                                           │
│     ├── Tests still pass                                        │
│     └── Commit                                                  │
│                                                                 │
│  6. NEXT TEST                                                   │
│     └── Repeat for next behavior                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Edge Case Testing Requirement

> ⚠️ **All implementations MUST include edge case tests** — not just happy paths.
>
> **Test categories:**
> - **Zero/negative values:** What happens with `radius = 0`? `length = -1`?
> - **Degenerate inputs:** Zero-length vectors, coincident points, collinear points
> - **Boundary conditions:** Values at exactly the tolerance threshold
> - **Near-tolerance values:** `1e-8` when tolerance is `1e-7`
> - **Extreme values:** Very large (`1e10`) and very small (`1e-10`) inputs
> - **Known failure modes:** Cases that break naive implementations
>
> **Edge cases reveal bugs that happy-path tests miss.** If a function can fail, test that it fails correctly.

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
| [AGENTS.md](./AGENTS.md) | Development workflow, TDD practices | ✅ Complete |
| [math-foundation.md](./math-foundation.md) | Phase 1: Points, vectors, transforms | ✅ Complete |
| [curves-2d.md](./curves-2d.md) | Phase 2: Line2D, Circle2D, Arc2D, Wire2D | ✅ Complete |
| [step-api-alignment.md](./step-api-alignment.md) | STEP → API mapping, design decisions | ✅ Complete |
| [app-examples-animation.md](./app-examples-animation.md) | Viewer example system & animation | ✅ Complete |
| [face-orientation-analysis.md](./face-orientation-analysis.md) | OCCT winding conventions | ✅ Complete |
| [io-first-refactor.md](./io-first-refactor.md) | I/O-first phase reordering rationale | ✅ Complete |
| [stl-io.md](./stl-io.md) | Phase 3: STL import/export | ✅ Complete |
| [step-io.md](./step-io.md) | Phase 4: STEP parser/writer + foundation converters | ✅ Complete |
| [sketch-system.md](./sketch-system.md) | Phase 5: Sketch, elements, profile detection | ✅ Complete |
| [basic-3d-geometry.md](./basic-3d-geometry.md) | Phase 6: 3D curves, surfaces, BRep topology | ✅ Complete |
| [constraint-solver.md](./constraint-solver.md) | Phase 7: Constraint solver for parametric sketches | ✅ Complete |
| [extrude.md](./extrude.md) | Phase 8: Extrude operations + STEP solid export | ✅ Complete |
| [occt-gap-analysis.md](./occt-gap-analysis.md) | OCCT structural alignment analysis | ✅ Complete |
| [boolean-operations-impl.md](./boolean-operations-impl.md) | Phase 11: Boolean operations implementation | ✅ Complete |
| [tessellation.md](./tessellation.md) | Phase 12: Solid → Mesh tessellation | ✅ Complete |

## Adding a Design Document

1. Create `<topic>.md` in this folder
2. Include: problem statement, alternatives considered, decision, rationale
3. Use diagrams (ASCII or images in `images/<topic>/`)
4. Update this README's index
