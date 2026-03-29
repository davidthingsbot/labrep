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

**Our approach:** Use standard TypeScript memory management (garbage collection, no custom handles).

### Mutability: Following OCCT's Shared Graph Model

BRep topology is inherently a **shared mutable graph**: an edge belongs to multiple faces, a vertex is shared between edges, and operations like adding PCurves must be visible from all faces that reference the edge.

OCCT models this with shared pointers and in-place mutation (`BRep_Builder::UpdateEdge` adds a PCurve to an existing edge — all faces sharing that edge see the change).

Early labrep design used TypeScript `readonly` interfaces with immutable spread-copy patterns (`{...edge, pcurves: [...edge.pcurves, newPCurve]}`). This was a default "modern TypeScript" style choice, not an OCCT-informed decision. **It actively fights the BRep graph model:**

- Adding a PCurve to an edge creates a NEW edge object
- Faces holding the OLD edge don't see the PCurve
- Shell closure breaks because side faces and cap faces reference different Edge objects
- Cascading rebuilds needed: Edge → Wire → Face → Shell → Solid

**Decision (2026-03-26): Mutable topology, immutable math.**

| Layer | Mutable? | Why |
|-------|----------|-----|
| Math primitives (Point3D, Vector3D, Plane, Transform) | **Immutable** | Value types. Sharing is safe. No graph relationships. |
| 2D/3D Curves (Line3D, Circle3D, Arc3D) | **Immutable** | Value types. Parameterized geometry doesn't change. |
| Topology (Edge, Wire, Face, Shell, Solid) | **Mutable** | Graph nodes. Shared references. PCurves/tolerances added incrementally. |

This matches OCCT exactly: `gp_Pnt` (point) is a value type copied freely, while `TopoDS_Edge` is a handle to mutable shared state.

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

### Phase 13: General Boolean Operations via BuilderFace

**Goal:** Boolean operations between arbitrary solids with exact B-rep results, using a general pipeline that scales to any surface type — not special-case code per surface combination.

**Exit Criteria:** `booleanSubtract(lBracket, sphere)` produces a correct B-rep solid with exact spherical cavity surface, closed shell, correct volume, and smooth-shaded tessellation. All analytic surface pairs handled. `V(A) + V(B) = V(union) + V(intersect)` invariant holds for all test cases.

**Status (2026-03-28):** OCCT-aligned boolean pipeline. 1395/1412 tests passing. Through-hole (box−cylinder), spherical pocket, spherical cavity, mounting plate all work end-to-end. Sphere is OCCT 1-face with both-pole tessellation. OCCT boundary-curve volume integration (BRepGProp_Gauss) implemented for trimmed curved faces. 5 volume regressions from PCurve occurrence issue on flipped seam edges (see Remaining Work).

**Architecture:**

The boolean pipeline follows OCCT's approach: one general pipeline for all surface combinations, not special-case handlers per surface pair.

```
booleanOperation(A, B, op)
  ├─ Stage 1: AABB overlap check
  ├─ Stage 2: FFI + coplanar detection (OCCT BOPAlgo_PaveFiller)
  │   ├─ Coplanar pairs: skip FFI (no intersection curve for coincident planes)
  │   │   ├─ Same-normal + overlap: register for overlap classification
  │   │   └─ Opposite-normal: register for special handling (internal faces)
  │   ├─ Non-coplanar pairs: FFI → intersection edges added to ALL faces
  │   │   ├─ Analytic: plane-plane → Line3D, plane-sphere/cyl/cone → Circle3D/Arc3D
  │   │   └─ General: SSI marcher → polyline (future BSpline/NURBS)
  │   └─ Key: coplanar faces get splitting edges FROM non-coplanar FFI
  ├─ Stage 3: BuilderFace splits all faces with intersection edges
  │   ├─ UV-space wire tracing (OCCT BOPAlgo_WireSplitter)
  │   ├─ Containment-based loop classification + winding correction
  │   ├─ Periodic surface UV continuity (seam tracking)
  │   └─ Coplanar sub-faces: expanded-polygon overlap detection
  ├─ Stage 4: Classify sub-faces (OCCT BOPTools_AlgoTools)
  │   ├─ Coplanar overlap: operation-specific (A keeps 'on', B discards)
  │   ├─ Opposite-normal coplanar: discard for union, keep A for subtract
  │   ├─ IsInternalFace: intersection-edge binormal + nudge test
  │   └─ Fallback: farthest-edge midpoint, then centroid + normal nudge
  ├─ Stage 5: Select faces per operation rules
  ├─ Stage 6: Orient faces on shell (BFS edge-winding consistency)
  └─ Stage 7: Stitch edges and assemble
```

**Why this matters:** The old approach had ~15 special-case functions (`splitFaceByAllFaces`, `splitPlanarFaceByCircle`, `splitPlanarFaceByPartialCircle`, `trimCurvedFaceByPlanes`, `buildTrimmedCurvedFace`, etc.). Every new surface type (fillets = torus, BSpline sweeps, etc.) would need new code. The general approach handles any surface pair through the same FFI → BuilderFace path. Adding a new surface type means implementing `evaluate`, `normal`, and `projectTo*Surface` — the boolean pipeline just works.

---

#### Completed Sub-Phases

**A: Surface Inverse Mapping** ✅ — `projectTo*Surface` functions for plane, sphere, cylinder, cone.

**B: General SSI Marching** ✅ — `intersectSurfaces` predictor-corrector marcher handles any surface pair. 21 tests. OCCT ref: IntWalk_PWalking.

**C: Face-Face Intersection (FFI)** ✅ — `intersectFaceFace` trims SSI curves to face boundaries in UV space. 7 tests. OCCT ref: IntTools_FaceFace. *(Needs enhancement: analytic dispatch in Sub-Phase G.)*

**D: Ellipse3D** ✅ — Full ellipse curve type. 23 tests.

**E: BuilderFace** ✅ — General face splitter in UV space. 6 tests. OCCT ref: BOPAlgo_BuilderFace + BOPAlgo_WireSplitter.
- Line splitting (single, crossing, diagonal)
- Circle splitting (full circle → hole + disk)
- Arc splitting (arc at corner → 2 faces with mixed line+arc edges)
- Sub-loop extraction for crossing vertices
- Signed-area classification for outer/hole loops

**F: Unified Boolean Pipeline (legacy)** ✅ — 89 boolean tests passed with special-case handlers. *(Deleted — replaced by G+H pipeline cutover.)*

**G: FFI Analytic Edge Dispatch** ✅ — `intersectFaceFace` dispatches to analytic intersection for plane-plane (→Line3D), plane-sphere/cylinder/cone (→Circle3D/Arc3D). Falls back to SSI marcher for other pairs. 3 analytic dispatch tests.

**H: Pipeline Cutover — PCurves + Surface-Agnostic + OCCT Coplanar** 🔧 IN PROGRESS

Major architectural refactor (2026-03-26):

**Completed:**
- **SurfaceAdapter**: Polymorphic interface (`evaluate`, `normal`, `projectPoint`, `isUPeriodic`). Replaces 15 switch-dispatch functions. All 7 surface types.
- **PCurves on all edges**: Extrude, revolve, FFI attach PCurves at creation. `makeFace()` auto-attaches. PCurves always in edge geometric direction.
- **Mutable Edge topology**: `Edge.pcurves` mutated in place. Shared graph model like OCCT.
- **BuilderFace pure 2D**: All UV from PCurves or SurfaceAdapter fallback. No surface-type branching. 525 lines deleted.
- **Coplanar handling (OCCT-aligned)**: Removed old polygon clipping (Sutherland-Hodgman). Coplanar faces get splitting edges from non-coplanar FFI — no separate boundary clipping. `classifyCoplanarSubFace` for same-domain overlap detection. `handleOppositeNormalCoplanar` for opposite-normal pairs. Full-overlap detection for identical faces.
- **BuilderFace loop classification**: Containment-based (not area-sign-only) with winding correction for reversed outers from face splitting.
- **Periodic surface UV continuity**: Seam tracking in BuilderFace boundary processing ensures consecutive edges have continuous UV across periodic seams.
- **Cylinder through-hole**: Fixed `edgeLiesOnFaceBoundary` for closed curves, extrude seam PCurve direction, BuilderFace UV continuity.
- **Degenerate edges at poles** (OCCT `BRepSweep_Rotation`): Sphere faces from revolve now have 4-edge wire: seam_fwd + degen_NP + seam_rev + degen_SP. Degenerate edges have zero 3D length but span the full U period in UV, forming a proper UV rectangle. Handled throughout: shell closure, orientation BFS, stitching, tessellation, volume computation.
- **Revolve seam PCurve direction**: Both seam PCurves in edge geometric direction (vStart→vEnd). Fixes double-reverse via getEdgeUV.
- **BuilderFace sub-arc forward flag**: When boundary arcs split at intersection points, sub-arcs from `makeArc3D(min,max)` always go ascending angle; for reversed wire traversal, forward=false with reversed PCurve.
- **Curved boundary edge detection** (`findMatchingBoundaryEdge`): Checks circle/arc boundary edges by center+radius+normal. Returns boundary Edge for sharing (OCCT shared topology pattern). Copies PCurves from FFI edge to shared boundary edge.
- **Self-loop containment in BuilderFace**: Samples circle self-loops to build polygons for containment testing (was failing `length >= 3` check with 1-vertex circles). Fixes cylindrical cap splitting to produce correct 2-face result (annulus + disk).
- **Geometry-based circle edge keys**: Shell closure and orientation BFS match circles by center+radius+normal instead of start point. Inner wire edges included in orientation BFS.

**OCCT-aligned self-loop circle handling (2026-03-27):**
- **Circles stay as single closed edges**: OCCT `BRepPrim_OneAxis` convention. Never split into arcs. `BOPAlgo_Builder_2` adds section edges with BOTH orientations (FORWARD + REVERSED) — 4 SmartMap entries per circle at its single vertex (2 In + 2 Out). BuilderFace traces loops natively through self-loop edges.
- **UV-aware vertex merging** (`findOrAddVertex`): On periodic surfaces, same 3D point at U≈0 vs U≈2π stays as separate vertex indices. Matches OCCT's `Coord2d` per-(vertex, edge) pattern in `Path()`.
- **Seam filter on all edges**: Boundary self-loop circles on periodic surfaces get UV-based edge selection (no self-loop exception). Matches `Path()` line 565: `aE.IsSame(aEOuta) → anAngle = aTwoPI`.
- **Loop area from 3D curve sampling**: `loopPolygon` samples curved 3D edges (not PCurve line type) for proper signed area and containment. Matches `IntTools_FClass2d`.
- **Innermost-containment hole assignment**: Holes go to the smallest enclosing outer face. Matches `PerformAreas` lines 490-530.
- **Sphere = 1 face**: All `makeSphere` now uses single semicircle arc revolve (OCCT `BRepPrim_Sphere`). Both-poles tessellation (fan+grid+fan) matches `BRepMesh_SphereRangeSplitter`.
- **Plane-cylinder line FFI**: Analytic dispatch for plane parallel to cylinder axis. Matches `IntAna_QuadQuadGeo::Perform(Plane, Cylinder)`.

**PCurve and BuilderFace fixes (2026-03-28):**
- **Circle2D PCurve on plane**: `buildPCurveForEdgeOnSurface` now creates Circle2D for closed circles on non-periodic surfaces (planes). Matches OCCT `ProjLib_Plane::Project(gp_Circ)` — projects center via dot products with plane axes, radius unchanged (orthonormal frame).
- **BuilderFace seam UV normalization fix**: Intersection edge UV is no longer normalized to [0, period) when `seamSplit` is active. A circle PCurve from (0,v)→(2π,v) was being collapsed to (0,v)→(0,v), making it a self-loop. Matches OCCT `BOPAlgo_WireSplitter_1::Coord2d` which evaluates PCurves directly.
- **Generic seamSplit detection**: Replaced hardcoded `surface.type === 'cylinder' || 'cone'` with runtime detection: any boundary edge with 2+ PCurves on the same surface triggers seamSplit. Matches OCCT `BRep_Tool::IsClosed(aE, myFace)`. Works for cylinders, cones, AND OCCT 1-face spheres.
- **Both-pole sphere tessellation**: Fan+grid+fan mesh for faces with both vMin and vMax degenerate (full sphere). Matches OCCT `BRepMesh_SphereRangeSplitter`.
- **Unified OCCT volume computation**: Single `computeFaceVolume` for ALL face types — no dispatch by surface type. Uses OCCT's boundary-curve Gauss integration (`BRepGProp_Gauss::Compute`). Green's theorem converts 2D surface integral to 1D boundary-curve integral. Outer loop iterates boundary edge PCurves; inner loop integrates P·J from BU1 to u(l). BU1 derived from face boundary PCurves (matching OCCT `BRepGProp_Face::Bounds`). All old non-OCCT methods deleted: computeQuadFaceVolume, computeTriFaceVolume, computeBoundarySampledVolume, computeParametricFaceVolume, computeLinearFaceVolume, computeWireSignedVolume. solid.ts reduced from ~730 to 277 lines.
- **Arc2D PCurves on planes**: `buildPCurveForEdgeOnSurface` now creates proper Arc2D for arcs on non-periodic surfaces. Previously created Line2D (start→end), which gave wrong boundary-curve integral. Matches OCCT `ProjLib_Plane::Project(gp_Circ)`.
- **Bottom face REVERSED**: `extrude` sets `face.forward=false` for bottom cap. Matches OCCT `BRepPrim_OneAxis::BottomFace` which calls `ReverseFace`.

**Key OCCT patterns adopted:**
- `BOPAlgo_PaveFiller::PerformFF`: coplanar detection + FFI-based splitting (no separate coplanar edge computation)
- `BOPAlgo_Builder::FillSameDomainFaces`: same-domain face classification via expanded-polygon overlap test
- `BOPAlgo_BuilderFace` / `BOPAlgo_WireSplitter`: wire tracing in 2D parameter space
- `BOPAlgo_Builder_2::BuildSplitFaces`: section edges added with BOTH orientations (FORWARD + REVERSED)
- `BOPAlgo_BuilderFace::PerformAreas`: loop classification via IsGrowthWire + IntTools_FClass2d
- `BRep_CurveOnSurface`: PCurves stored per edge per surface, in edge geometric direction
- `BRep_Builder::UpdateEdge`: in-place mutation of edge PCurves (mutable topology)
- `BRepPrim_OneAxis`: full circles = single closed edges, parameter [0, 2π], Closed(true). Bottom face REVERSED.
- `IntAna_QuadQuadGeo`: analytic plane-quadric intersections (circle, line, ellipse dispatch)
- `ProjLib_Plane::Project(gp_Circ)`: circle-on-plane PCurve projection (Circle2D for circles, Arc2D for arcs)
- `BRepGProp_Gauss::Compute`: unified boundary-curve Gauss integration for ALL face types (plane, cylinder, sphere, cone, etc). No dispatch by surface type.
- `BRepGProp_Face::Bounds`: face UV bounds from BRepAdaptor_Surface (not infinite surface bounds)
- `BRepGProp_Face::Load(Edge)`: reverses PCurve for reversed edges (`C->Reversed()`)
- `BRepGProp_Face::Normal`: reverses Jacobian for reversed faces (`mySReverse`). Both corrections cancel — wire winding provides volume sign.
- `BRepGProp_Domain`: iterates ALL boundary edges (outer + inner wires)
- `BOPTools_AlgoTools::OrientFacesOnShell`: BFS orientation with canonicalized circle normals for edge matching

---

#### Remaining Work

##### Authoritative Test Suites (new, 2026-03-27)

These describe CORRECT geometry. Old tests that disagree should be updated when these pass.

**`boolean-cad-objects.test.ts`** — 21/28 passing:
| Test | Status | Notes |
|------|--------|-------|
| Through-hole (cyl through box) | ✅ 3/4 | Volume off — PCurve occurrence on flipped seam |
| Counterbore (sequential booleans) | ❌ 0/1 | Sequential boolean edge case |
| Spherical pocket (sphere inside box) | ✅ 4/4 | |
| Mounting plate (4 bolt holes) | ✅ 1/1 | |
| Pipe fitting (tube) | ✅ 3/4 | Volume off — PCurve occurrence on flipped seam |
| Equatorial slot (sphere−box) | ✅ 2/2 | Fixed by seamSplit + Circle2D PCurve |
| Cylinder flat (plane cut) | ❌ 1/3 | Volume off |
| Spherical cavity (large scale) | ✅ 3/3 | |
| T-pipe union (perp cylinders) | ❌ 0/3 | Needs cylinder-cylinder SSI |
| Truncated sphere (intersect) | ✅ 2/3 | Volume tolerance |

**`boolean-pipeline-internals.test.ts`** — 14/16 passing:
| Group | Tests | Status | What it targets |
|-------|-------|--------|----------------|
| A: Circle on cylinder | 2 | ✅ | UV-aware vertex merging + seam filtering |
| B: Circle on sphere | 1 | ✅ | Same on OCCT 1-face sphere (single semicircle) |
| C: Tube classification | 2 | ✅ | Cylindrical bore face in subtract result |
| D: Sphere cavity | 2 | ✅ | UV interior point fallback (OCCT 1-face sphere) |
| E: Through-hole pipeline | 3 | ✅ 1/3 | Volume off — PCurve occurrence on flipped seam |
| F: Edge sharing | 1 | ✅ | Circle edges in both planar and cylindrical faces |
| G: PCurve construction | 2 | ✅ | Circle2D on plane, arc on plane |

**`occt-fundamentals.test.ts`** — 31/31 passing:
Locks down OCCT-aligned invariants: primitive topology, circle representation, BuilderFace on planar and periodic surfaces, box−sphere boolean, box−cylinder through-hole, sphere tessellation, revolve face conventions.

##### OCCT Alignment (completed 2026-03-27)

Key principle: **circles are single closed edges, never split into arcs.** OCCT's `BRepPrim_OneAxis` creates full circles as one edge with parameter [0, 2π] and startVertex === endVertex. BuilderFace handles self-loop circles natively on both planar and periodic surfaces.

**Fixes applied:**
- **UV-aware `findOrAddVertex`**: On periodic surfaces, vertices at U≈0 (left seam) vs U≈2π (right seam) are kept as separate indices. Matches OCCT's `Coord2d` per-(vertex, edge) disambiguation in `BOPAlgo_WireSplitter_1::Path()`.
- **Seam filter on all edges**: Removed self-loop exception. On periodic surfaces, all edges (including boundary circles) get UV-based filtering. Matches OCCT's seam-aware edge selection.
- **Loop polygon sampling**: Curved edges sampled via 3D curve evaluation (not PCurve type) for area computation and containment testing. Matches OCCT's `IntTools_FClass2d`.
- **Innermost-containment hole assignment**: Holes assigned to smallest enclosing outer face. Matches OCCT's `BOPAlgo_BuilderFace::PerformAreas`.
- **Sphere = 1 face**: All `makeSphere` uses single semicircle arc revolve. Matches OCCT's `BRepPrim_Sphere`.
- **Both-poles tessellation**: Fan+grid+fan for full sphere faces. Matches OCCT's `BRepMesh_SphereRangeSplitter`.
- **Plane-cylinder line FFI**: Analytic dispatch for parallel plane cases producing Line3D edges. Matches OCCT's `IntAna_QuadQuadGeo`.

##### Remaining Work (2026-03-28)

**RESOLVED in this session:**
- **PCurve occurrence on flipped seam edges** — Detect true seam edges (same object appearing twice), swap occurrence for reversed faces. Matches OCCT `BRep_Tool::CurveOnSurface` + `BRepGProp_Face::Load(Edge)`.
- **Negative U in boundary-curve integral** — PCurves from BuilderFace may have negative U on periodic surfaces. Added normalization: `while (u2 < BU1) u2 += uPeriod`.
- **Circle edge normal in BFS** — Canonicalized normal direction for circle geometry keys. Matches OCCT topological edge identity.
- **Unified volume computation** — Purged ALL non-OCCT volume methods. Single `computeFaceVolume` for all face types. Arc2D PCurves for arcs on planes. Bottom face REVERSED.

**Low-level volume tests (`volume-computation.test.ts`)** — 14/15 passing:
| Test | Status |
|------|--------|
| Box (unit, offset, 2×3×4) | ✅ 3/3 |
| Cylinder (r=1,2,5) | ✅ 3/3 |
| Sphere (r=1,5) | ✅ 2/2 |
| Cone (revolve) | ✅ 1/1 |
| Partial revolve (90°, 180°) | ✅ 2/2 |
| Extrude along Z | ✅ 1/1 |
| Sign consistency (cylinder, offset) | ✅ 2/2 |
| Diagonal extrude (45°) | ❌ | PCurve issue on tilted plane side faces |

**Remaining higher-level failures** — now dominated by the volume algorithm transition (old tests calibrated to non-OCCT code). These need investigation with the new unified algorithm:

| Category | What's needed |
|----------|---------------|
| Diagonal/offset extrude volume | PCurve accuracy on tilted planes — `buildPCurveForEdgeOnSurface` creates Line2D from projected endpoints but tilted planes may need more samples or analytic projection |
| Boolean volume (through-hole, pipe, etc) | Re-validate with unified algorithm — some may just pass, others may need PCurve fixes |
| T-pipe union | Cylinder-cylinder SSI (algorithmic, unrelated to volume) |
| Counterbore | Sequential boolean shell stitching |
| 2-hemisphere sphere tests | Need migration to OCCT 1-face sphere |

---

#### Key OCCT Patterns Adopted

- `IntWalk_PWalking` — predictor-corrector SSI marching for general surface pairs
- `IntPatch_ALine` / `IntPatch_GLine` — analytic intersection for quadric surface pairs
- `IntTools_FaceFace` — face-face intersection with UV clipping
- `BOPAlgo_BuilderFace` — face reconstruction from split edges (UV-space angle tracing)
- `BOPAlgo_WireSplitter` — wire loop tracing via smallest-clockwise-angle, sub-loop extraction
- `BOPAlgo_PaveFiller` — pairwise edge intersection before face splitting
- `BOPTools_AlgoTools::IsInternalFace` — intersection-edge binormal classification for non-convex sub-faces
- `BOPTools_AlgoTools::ComputeState` — fallback classification using edge midpoints far from intersection boundary
- `BOPTools_AlgoTools::OrientFacesOnShell` — BFS face orientation for consistent edge winding
- `BRepSweep_Rotation::MakeEmptyDirectingEdge` — degenerate edges at poles (zero 3D length, full UV period)
- `ShapeAnalysis_WireOrder` — angular seam unwrapping for periodic surfaces
- Coplanar faces handled separately (polygon clipping, not SSI) per `BRepAlgo_FaceRestrictor`

#### Key Reference

OCCT source in `library/opencascade/src/`:
- `ModelingAlgorithms/TKGeomAlgo/IntWalk/IntWalk_PWalking.cxx` — Marching algorithm
- `ModelingAlgorithms/TKBO/IntTools/IntTools_FaceFace.hxx` — Face-face intersection
- `ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_BuilderFace.cxx` — Face reconstruction
- `ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_WireSplitter_1.cxx` — Wire loop tracing (Path, Angle2D, ClockWiseAngle, Coord2d)
- `ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_PaveFiller.hxx` — Pairwise intersection
- `ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_Builder.hxx` — Single unified pipeline
- `ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_Builder_3.cxx` — FillIn3DParts, BuildDraftSolid
- `ModelingAlgorithms/TKBO/BOPTools/BOPTools_AlgoTools.cxx` — IsInternalFace, ComputeState, OrientFacesOnShell, IsSplitToReverse
- `ModelingAlgorithms/TKShHealing/ShapeFix/ShapeFix_Shell.cxx` — GetShells (edge-balance shell assembly)
- `ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Gauss.cxx` — Volume integration (boundary-curve nested Gauss, lines 489-800)
- `ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Face.cxx` — Load(Edge): PCurve reversal (line 172-178), Normal: J reversal (line 197-203)
- `ModelingAlgorithms/TKMesh/BRepMesh/BRepMesh_SphereRangeSplitter.cxx` — Sphere tessellation UV grid
- `ModelingData/TKGeomBase/ProjLib/ProjLib_Plane.cxx` — Circle→plane PCurve projection (line 110-123)

#### Files

| File | Status |
|------|--------|
| `src/operations/boolean.ts` | ✅ **Rewritten** — OCCT-aligned: FFI splits all faces, BuilderFace + classification + orientation |
| `src/operations/builder-face.ts` | ✅ — General face splitter: generic seamSplit detection, UV normalization fix, all periodic surfaces |
| `src/operations/face-face-intersection.ts` | ✅ — Analytic dispatch for plane-plane/sphere/cylinder/cone |
| `src/topology/pcurve.ts` | ✅ — Circle2D PCurve for circles on planes (OCCT ProjLib_Plane) |
| `src/topology/solid.ts` | 🔧 — OCCT boundary-curve volume (BRepGProp_Gauss), inner wire ADD. PCurve occurrence bug on flipped seams |
| `src/mesh/tessellation.ts` | ✅ — Both-pole sphere tessellation (fan+grid+fan) |
| `src/operations/split-face-by-circle.ts` | **Dead code** — no longer used by pipeline |
| `src/operations/trim-curved-face.ts` | **Dead code** — no longer used by pipeline |
| `src/geometry/intersections3d.ts` | Reference: analytic intersections (complete) |
| `src/surfaces/*-surface.ts` | Reference: projectTo*Surface (complete) |

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

> ⚠️ **MANDATORY:** Before implementing any phase, assess the design for completeness against OpenCASCADE (OCCT).
>
> **OCCT is the primary reference for all design and implementation decisions.** It has correct, battle-tested solutions to every problem in this project. Do not diverge from OCCT's approach without an explicit, documented reason. "I felt like doing it differently" is not a reason.
>
> Before implementing anything:
>
> 1. **Read the OCCT source** in `library/opencascade/`. Find the corresponding class or algorithm. Understand its data structures, edge cases, and design decisions.
> 2. **Map OCCT's design to our types.** If OCCT's lower-level objects have methods or fields that our corresponding types lack, **add them first**. Do not build on incomplete foundations.
> 3. **What functions does OCCT provide for this data type?** (e.g., `Geom_Circle` has 20+ methods)
> 4. **Which functions are essential for downstream operations?** (e.g., extrude needs `evaluate`, `tangent`, `length`)
> 5. **What edge cases does OCCT handle?** (degenerate inputs, tolerances, special configurations)
> 6. **What does the STEP representation require?** (which attributes must survive round-trip)
>
> **Document gaps explicitly.** If we choose to defer functionality, note it as "NOT IMPLEMENTED — reason" in the design doc.
>
> **Check the OCCT class reference** for each data type:
> - [Geom Package](https://dev.opencascade.org/doc/refman/html/package_geom.html) — 3D curves and surfaces
> - [Geom2d Package](https://dev.opencascade.org/doc/refman/html/package_geom2d.html) — 2D curves
> - [TopoDS Package](https://dev.opencascade.org/doc/refman/html/package_topods.html) — Topology
> - [BRep Package](https://dev.opencascade.org/doc/refman/html/package_brep.html) — BRep geometry bindings
>
> Also search online for blog posts, papers, and open-source implementations. But OCCT is the primary source of truth.
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
