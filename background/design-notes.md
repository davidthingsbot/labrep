# Design Notes from Alternative Kernels

> How others have approached BRep kernel design — subsystems, data types, and lessons learned.

---

## Table of Contents

- [Overview](#overview)
- [Projects Surveyed](#projects-surveyed)
- [Subsystem Partitioning](#subsystem-partitioning)
- [Data Type Comparison](#data-type-comparison)
- [Key Functions by Subsystem](#key-functions-by-subsystem)
- [Commentary and Gotchas](#commentary-and-gotchas)
- [AI-Assisted Development Notes](#ai-assisted-development-notes)
- [Lessons for labrep](#lessons-for-labrep)

---

## Overview

This document surveys how existing BRep kernel projects structure their code:
- What subsystems do they define?
- What data types do they use?
- What functions operate on those types?
- What mistakes did they make, and what would they do differently?

**Projects surveyed:**
- **Truck** (ricosjp) — Most mature open-source alternative, 4+ years
- **vcad** (ecto) — AI-built kernel, 12 crates, recent
- **Fornjot** (hannobraun) — Solo developer, 4+ years
- **OpenCASCADE** — The reference (30+ years, 3.6M lines)

---

## Projects Surveyed

### Truck (ricosjp)

| Attribute | Value |
|-----------|-------|
| Language | Rust |
| Structure | Workspace with 10+ crates |
| Maturity | 4+ years, active development |
| LOC | ~50K (estimated) |
| WASM | Yes |
| License | MIT/Apache-2.0 |

**Crate structure:**

```
truck/
├── truck-base         # ID types, tolerance utilities
├── truck-geotrait     # Geometry traits (curves, surfaces)
├── truck-geometry     # NURBS implementation
├── truck-topology     # Vertex, Edge, Wire, Face, Shell, Solid
├── truck-modeling     # High-level modeling operations
├── truck-polymesh     # Triangle mesh representation
├── truck-meshalgo     # Tessellation algorithms
├── truck-rendimpl     # WebGPU rendering
├── truck-stepio       # STEP file I/O
└── truck-js           # JavaScript/WASM bindings
```

**Key design choices:**
- Topology is generic over geometry: `Vertex<P>`, `Edge<P, C>`, `Face<P, C, S>`
- This allows the same topology code to work with different geometry types
- Uses `Arc<Mutex<T>>` for shared ownership with interior mutability
- Each entity has a unique ID, independent of content

---

### vcad (ecto)

| Attribute | Value |
|-----------|-------|
| Language | Rust |
| Structure | Workspace with 20+ crates |
| Maturity | Months, AI-assisted |
| LOC | ~35K (claimed) |
| WASM | Yes |
| License | MIT |

**Kernel crate structure:**

```
vcad/crates/
├── vcad-kernel-math        # Point3, transforms, tolerances
├── vcad-kernel-topo        # Half-edge topology (slotmap-based)
├── vcad-kernel-geom        # Curves and surfaces
├── vcad-kernel-primitives  # Box, cylinder, sphere, cone, torus
├── vcad-kernel-tessellate  # BRep → triangle mesh
├── vcad-kernel-booleans    # SSI, face classification (~5.4K LOC)
├── vcad-kernel-nurbs       # NURBS curves/surfaces
├── vcad-kernel-fillet      # Rolling ball algorithm
├── vcad-kernel-sketch      # Extrude, revolve, profiles
├── vcad-kernel-sweep       # Sweep and loft
├── vcad-kernel-constraints # Geometric constraint solver
├── vcad-kernel-shell       # Shell, pattern, draft
├── vcad-kernel-step        # STEP AP214 import/export
├── vcad-kernel-wasm        # Browser bindings
└── vcad-kernel             # Unified API facade
```

**Key design choices:**
- Arena-based storage using `slotmap` (efficient, cache-friendly)
- Half-edge topology with explicit `HalfEdgeId`, `LoopId`, etc.
- Exact predicates via `robust` crate (Shewchuk's algorithms)
- Separate crate for each major feature (fillets, booleans, constraints)

---

### Fornjot (hannobraun)

| Attribute | Value |
|-----------|-------|
| Language | Rust |
| Structure | Workspace with 7 crates |
| Maturity | 4+ years, still early |
| LOC | ~15K (estimated) |
| WASM | Yes |
| License | 0BSD |

**Crate structure:**

```
fornjot/crates/
├── fj           # All-in-one re-export
├── fj-math      # Math primitives
├── fj-interop   # Basic types for interop
├── fj-core      # Core BRep (topology, geometry, operations)
├── fj-export    # Export to STL, 3MF
├── fj-viewer    # 3D viewer
└── fj-window    # Windowing abstraction
```

**fj-core internal structure:**

```
fj-core/src/
├── algorithms/   # Sweep, triangulation
├── approx/       # Approximation utilities
├── geometry/     # Curves, surfaces
├── layers/       # Layered storage
├── operations/   # High-level ops
├── storage/      # Entity storage
├── topology/     # BRep structure
└── validation/   # Consistency checks
```

**Key design choices:**
- Lines and circles only (no NURBS yet)
- Focus on correctness over features
- Heavy emphasis on validation
- Single `fj-core` crate contains most logic

---

### OpenCASCADE (OCCT)

| Attribute | Value |
|-----------|-------|
| Language | C++ |
| Structure | ~50 packages |
| Maturity | 30+ years |
| LOC | 3.6 million |
| WASM | Painful but possible |
| License | LGPL with exceptions |

**Relevant packages:**

```
OCCT/src/
├── gp/          # Geometric primitives (points, vectors, planes)
├── Geom/        # Parametric geometry (curves, surfaces)
├── Geom2d/      # 2D geometry
├── GeomAPI/     # High-level geometry algorithms
├── TopoDS/      # Topological shapes
├── BRep/        # BRep-specific topology
├── BRepBuilderAPI/  # Shape construction
├── BRepAlgoAPI/     # Boolean operations
├── IntPatch/        # Surface-surface intersection
├── IntCurve/        # Curve intersection
└── BOPAlgo/         # Boolean algorithm internals
```

**Key design choices:**
- Handle system for memory management (predates smart pointers)
- Topology and geometry are separate layers
- "TShape" is the actual data; "TopoDS_Shape" is a reference + orientation
- Elaborate data exchange facilities (STEP, IGES, BREP)

---

## Subsystem Partitioning

### Common Subsystems Across Projects

| Subsystem | Truck | vcad | Fornjot | OCCT |
|-----------|-------|------|---------|------|
| Math primitives | truck-base | vcad-kernel-math | fj-math | gp |
| 2D geometry | (in geometry) | vcad-kernel-sketch | fj-core/geometry | Geom2d |
| 3D geometry | truck-geometry | vcad-kernel-geom | fj-core/geometry | Geom |
| Topology | truck-topology | vcad-kernel-topo | fj-core/topology | TopoDS, BRep |
| Primitives | truck-modeling | vcad-kernel-primitives | (limited) | BRepPrimAPI |
| Booleans | (external?) | vcad-kernel-booleans | (limited) | BRepAlgoAPI |
| Tessellation | truck-meshalgo | vcad-kernel-tessellate | fj-core/algorithms | BRepMesh |
| STEP I/O | truck-stepio | vcad-kernel-step | fj-export | STEPControl |
| WASM | truck-js | vcad-kernel-wasm | (via fj) | (community) |

### Recommended Subsystem Hierarchy

Based on the patterns above:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUBSYSTEM HIERARCHY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LAYER 1: FOUNDATION                                            │
│  ────────────────────                                           │
│  • math/           Points, vectors, transforms, tolerances      │
│                                                                 │
│  LAYER 2: GEOMETRY                                              │
│  ─────────────────                                              │
│  • geometry/       Curves, surfaces (analytic + NURBS)          │
│  • geometry2d/     2D curves for sketches                       │
│                                                                 │
│  LAYER 3: TOPOLOGY                                              │
│  ─────────────────                                              │
│  • topology/       Vertex, Edge, Wire, Face, Shell, Solid       │
│                                                                 │
│  LAYER 4: CONSTRUCTION                                          │
│  ─────────────────────                                          │
│  • primitives/     Box, cylinder, sphere, cone                  │
│  • sketch/         2D sketching with constraints                │
│  • operations/     Extrude, revolve, sweep, loft                │
│                                                                 │
│  LAYER 5: MODIFICATION                                          │
│  ─────────────────────                                          │
│  • booleans/       Union, subtract, intersect                   │
│  • fillets/        Fillet, chamfer (later)                      │
│                                                                 │
│  LAYER 6: EXPORT                                                │
│  ────────────────                                               │
│  • tessellate/     BRep → triangle mesh                         │
│  • step/           STEP file I/O                                │
│                                                                 │
│  LAYER 7: BINDINGS                                              │
│  ─────────────────                                              │
│  • wasm/           Browser runtime                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Type Comparison

### Topology Data Types

| Entity | Truck | vcad | Fornjot | OCCT |
|--------|-------|------|---------|------|
| Vertex | `Vertex<P>` | `Vertex` + `VertexId` | `Vertex` | `TopoDS_Vertex` |
| Edge | `Edge<P, C>` | `Edge` + `EdgeId` | `HalfEdge` | `TopoDS_Edge` |
| Half-edge | (implicit via orientation) | `HalfEdge` + `HalfEdgeId` | `HalfEdge` | (in BRep_TEdge) |
| Wire | `Wire<P, C>` | (via Loop) | `Cycle` | `TopoDS_Wire` |
| Loop | (Wire + direction) | `Loop` + `LoopId` | `Cycle` | (in Face) |
| Face | `Face<P, C, S>` | `Face` + `FaceId` | `Face` | `TopoDS_Face` |
| Shell | `Shell<P, C, S>` | `Shell` + `ShellId` | `Shell` | `TopoDS_Shell` |
| Solid | `Solid<P, C, S>` | `Solid` + `SolidId` | `Solid` | `TopoDS_Solid` |
| Compound | (via Vec) | (via Topology) | `Sketch` | `TopoDS_Compound` |

### Storage Patterns

**Truck — Arc<Mutex<T>> with ID:**
```rust
pub struct Vertex<P> {
    point: Arc<Mutex<P>>,
}
pub type VertexID<P> = ID<Mutex<P>>;
```

**vcad — Arena (slotmap) with typed keys:**
```rust
new_key_type! {
    pub struct VertexId;
    pub struct HalfEdgeId;
    pub struct FaceId;
}

pub struct Topology {
    pub vertices: SlotMap<VertexId, Vertex>,
    pub half_edges: SlotMap<HalfEdgeId, HalfEdge>,
    pub faces: SlotMap<FaceId, Face>,
    // ...
}
```

**Fornjot — Handle-based with central storage:**
```rust
// Entities stored in a central `Geometry` store
// Accessed via Handle<T> types
```

**OCCT — Handle system:**
```cpp
Handle(TopoDS_TShape) shape;
TopoDS_Shape oriented_shape(shape, orientation);
```

### Half-Edge Structure (vcad)

```rust
pub struct HalfEdge {
    pub origin: VertexId,           // Start vertex
    pub twin: Option<HalfEdgeId>,   // Opposite direction
    pub next: Option<HalfEdgeId>,   // Next in loop (CCW)
    pub prev: Option<HalfEdgeId>,   // Previous in loop
    pub edge: Option<EdgeId>,       // Parent edge
    pub loop_id: Option<LoopId>,    // Containing loop
}

pub struct Edge {
    pub half_edge: HalfEdgeId,      // One of the twins
}

pub struct Loop {
    pub half_edge: HalfEdgeId,      // Any half-edge in loop
    pub face: Option<FaceId>,       // Containing face
}

pub struct Face {
    pub outer_loop: LoopId,         // Outer boundary
    pub inner_loops: Vec<LoopId>,   // Holes
    pub surface_index: usize,       // Geometry reference
    pub orientation: Orientation,   // Forward/Reversed
    pub shell: Option<ShellId>,     // Containing shell
}
```

### Math Primitives

| Type | Truck | vcad | Fornjot | OCCT |
|------|-------|------|---------|------|
| Point2D | (in geometry) | Point2 | Point<2> | gp_Pnt2d |
| Point3D | (in geometry) | Point3 | Point<3> | gp_Pnt |
| Vector2D | (in geometry) | Vec2 | Vector<2> | gp_Vec2d |
| Vector3D | (in geometry) | Vec3 | Vector<3> | gp_Vec |
| Direction | (unit vector) | (unit Vec3) | (unit Vector) | gp_Dir |
| Plane | (in geometry) | Plane | (in surface) | gp_Pln |
| Axis | (in geometry) | Axis | (in surface) | gp_Ax1 |
| Transform | (4x4 matrix) | Transform | Transform | gp_Trsf |

---

## Key Functions by Subsystem

### Topology Functions

**Traversal (vcad pattern):**
```rust
// Iterate half-edges around a loop
fn loop_half_edges(&self, loop_id: LoopId) -> impl Iterator<Item = HalfEdgeId>

// Iterate half-edges from a vertex
fn vertex_half_edges(&self, vertex_id: VertexId) -> impl Iterator<Item = HalfEdgeId>

// Get faces adjacent to an edge
fn edge_faces(&self, edge_id: EdgeId) -> (Option<FaceId>, Option<FaceId>)

// Get destination vertex of half-edge
fn half_edge_dest(&self, he: HalfEdgeId) -> VertexId
```

**Euler Operators (vcad pattern):**
```rust
// Initial creation
fn make_vertex_face_shell(&mut self, point: Point3, surface_index: usize) 
    -> (VertexId, FaceId, ShellId)

// Edge split
fn make_edge_vertex(&mut self, he: HalfEdgeId, point: Point3) 
    -> (VertexId, EdgeId)
```

**Construction (Truck pattern):**
```rust
// Create edge from vertices
fn new(v0: &Vertex<P>, v1: &Vertex<P>, curve: C) -> Edge<P, C>

// Create face from boundary
fn new(boundaries: Vec<Wire<P, C>>, surface: S) -> Face<P, C, S>
```

### Boolean Functions

**vcad boolean pipeline (from CLAUDE.md):**
1. AABB Filter — broadphase candidate detection
2. Surface-Surface Intersection — analytic + sampled fallback
3. Face Classification — ray casting + winding number
4. Sewing — trim, split, merge with topology repair

**Key functions:**
```rust
fn union(solid1: &Solid, solid2: &Solid) -> Result<Solid>
fn subtract(solid1: &Solid, solid2: &Solid) -> Result<Solid>
fn intersect(solid1: &Solid, solid2: &Solid) -> Result<Solid>

// Internal
fn surface_surface_intersection(s1: &Surface, s2: &Surface) -> Vec<Curve3D>
fn classify_face(face: &Face, solid: &Solid) -> Classification // In, Out, On
```

### Constraint Solver Functions

**vcad constraint types:**
- Coincident, Horizontal, Vertical
- Parallel, Perpendicular, Tangent
- Distance, Length, Radius, Angle
- Equal Length, Fixed

**Solver approach:**
- Levenberg-Marquardt with adaptive damping
- Each constraint → error function
- Minimize total error via Newton-Raphson

**Alternative approach (from CADmium blog):**
- Physics simulation: points have mass, constraints are springs
- Friction force proportional to velocity
- Iterate until convergence
- Advantages: handles over/under-constrained, supports inequalities

---

## Commentary and Gotchas

### From the CADmium Blog

**On constraint solvers:**
> "If you have too few constraints, M will be too short which means a solution can be found by inserting assumptions. But those assumptions are not always consistent with the modeler's expectations. If you've ever had a sketch feature suddenly fly away to infinity, this is what happened."

**On OpenCASCADE:**
> "All popular b-rep kernels are old and written in C++. If you consult the official build instructions for OpenCascade, you see this screenshot... which looks like it was taken on Windows 2000?"

**On Truck:**
> "Truck is about four years old and it already covers all the basics. It can read and write .step files. It can triangulate surfaces to a fixed tolerance. It has NURBS support."
>
> "I think that Truck is the Rivian R3 of b-rep kernels: It is smaller than its cousins, it's using a lot of modern technology in an exciting but proven way, and it isn't quite finished yet!"

### From the vcad Blog

**On mesh vs BRep:**
> "On the left: a mesh. Triangles approximating a curve. The more triangles, the smoother it looks — but it's always an approximation. Zoom in far enough and you'll see the facets."
>
> "On the right: a boundary representation. The cylinder isn't stored as triangles. It's stored as a mathematical surface."

**On surface-surface intersection:**
> "Surface-surface intersection (SSI) is the dragon. Two NURBS surfaces can intersect in curves that branch, loop, and degenerate. My ssi.rs is ~500 lines of marching algorithms and Newton-Raphson refinement. She's ugly but she runs."

**On fillets:**
> "A fillet is created by rolling a ball along an edge. The ball stays tangent to both faces. The path it traces becomes the fillet surface. Simple concept. Hard math."
>
> "With triangle meshes, there's no 'edge' — just a crease between triangles. The ball has nothing smooth to roll against."

### From Shapr3D Article

**On the impossibility of covering all edge cases:**
> "This is obviously not possible, so kernel developers keep implementing edge cases to increase the robustness of their implementations over decades. Despite this heroic effort, CAD users will keep running into failing booleans, fillets, shells, because it's impossible to cover all the edge cases."

### From Fornjot README

**On reliability over features:**
> "Favor reliability over features. Anything you can do should either work as expected, or result in a clear and actionable error."

**On current limitations:**
> "Currently, Fornjot lacks the features for anything more advanced, making it unsuited for real-world use cases."

### Common Gotchas

1. **Tolerance handling** — Floating-point comparisons require tolerances. Different tolerances for different operations (vertex merge, curve approximation, intersection).

2. **Topological consistency** — Half-edges must maintain next/prev/twin invariants. One broken link corrupts the whole structure.

3. **Degenerate cases** — Tangent surfaces, coincident edges, zero-length edges all require special handling.

4. **Orientation** — Face normals must point consistently outward. Edge orientation in loops must be consistent.

5. **Memory management** — Shared entities (vertex used by multiple edges) require careful ownership. Arena/slotmap patterns help.

6. **NURBS parameterization** — Same geometric curve can have different parameterizations. Affects tessellation and intersection.

7. **Boolean robustness** — The hardest part. Most projects struggle here. vcad claims ~500 LOC for SSI alone.

---

## AI-Assisted Development Notes

### vcad's Claude-Assisted Build

**Timeline (from blog):**
```
Tue 1:30pm   HN post hits front page (criticism)
Tue 11:51pm  First kernel commit
Wed 12:07am  Booleans working
Wed 12:31am  NURBS done
Wed 1:22am   Fillets done
Wed 8:38am   Sketch + extrude done
Wed 9:10am   Manifold ripped out
Wed 9:27am   Constraint solver done
```

**~10 hours from criticism to working BRep kernel.**

**From vcad CLAUDE.md — development conventions:**
- `#![warn(missing_docs)]` on public items
- Tests in `#[cfg(test)] mod tests` at file bottom
- Coordinate system: Z-up (X right, Y forward, Z up)
- Units: f64, conventionally millimeters

**Pattern for new kernel feature:**
1. Add to appropriate `vcad-kernel-*` crate
2. Expose via `vcad-kernel` unified API
3. Add WASM bindings in `vcad-kernel-wasm`
4. Run `cargo test --workspace && cargo clippy --workspace -- -D warnings`

### What AI Can/Can't Do

**AI excels at:**
- Implementing known algorithms (de Boor, rolling ball, Newton-Raphson)
- Generating boilerplate (iterators, builders, tests)
- Translating algorithms from papers/pseudocode
- Refactoring structure

**AI struggles with:**
- Novel algorithm design
- Edge case discovery (needs exhaustive testing)
- Performance optimization (needs profiling)
- Numerical stability (subtle precision issues)

---

## Lessons for labrep

### Subsystem Structure

**Recommended for TypeScript:**

```
generation/src/
├── core/           # Points, vectors, transforms (Phase 1)
├── geometry2d/     # 2D curves for sketches (Phase 2)
├── geometry3d/     # 3D curves and surfaces (Phase 4)
├── topology/       # BRep structure (Phase 4-5)
├── sketch/         # Sketch system (Phase 3, 10)
├── primitives/     # Box, cylinder primitives (Phase 5)
├── operations/     # Extrude, revolve, booleans (Phase 5, 8, 9)
├── io/             # STEP I/O (Phase 6)
└── assembly/       # Parts and joints (Phase 11)
```

### Data Type Recommendations

**Use arena/map pattern (inspired by vcad):**
```typescript
type VertexId = number;  // or branded type
type HalfEdgeId = number;
type FaceId = number;

interface Topology {
  vertices: Map<VertexId, Vertex>;
  halfEdges: Map<HalfEdgeId, HalfEdge>;
  faces: Map<FaceId, Face>;
  // ...
  nextId: number;  // ID generator
}
```

**Use half-edge structure:**
```typescript
interface HalfEdge {
  origin: VertexId;
  twin: HalfEdgeId | null;
  next: HalfEdgeId | null;
  prev: HalfEdgeId | null;
  edge: EdgeId | null;
  loop: LoopId | null;
}
```

### Key Takeaways

1. **Start with topology** — Get Vertex/Edge/Face/Solid structure right first. Everything else builds on it.

2. **Half-edge simplifies traversal** — Following next/prev/twin is cleaner than searching.

3. **Arena storage** — Map<Id, Entity> pattern works well in TypeScript.

4. **Separate geometry from topology** — Face references a surface index, doesn't contain the surface.

5. **Tolerances everywhere** — Define a global tolerance and use it consistently.

6. **Validation is critical** — Check invariants after every operation.

7. **SSI is the dragon** — Surface-surface intersection is where projects stall. Approach carefully.

8. **AI can accelerate dramatically** — vcad proves 10 hours is possible. But correctness requires extensive testing.

---

## References

- **Truck**: https://github.com/ricosjp/truck
- **vcad**: https://github.com/ecto/vcad
- **vcad blog**: https://campedersen.com/brep-kernel
- **Fornjot**: https://github.com/hannobraun/fornjot
- **CADmium blog**: https://mattferraro.dev/posts/cadmium
- **Shapr3D BRep article**: https://www.shapr3d.com/content-library/what-is-b-rep
