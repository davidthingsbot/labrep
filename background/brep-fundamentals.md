# BRep Fundamentals

> The foundational data structures and concepts for boundary representation — the core of what labrep implements.

---

## Table of Contents

- [Overview](#overview)
- [What is BRep?](#what-is-brep)
- [Comparison with Other Representations](#comparison-with-other-representations)
- [Topology vs Geometry](#topology-vs-geometry)
- [The Topological Hierarchy](#the-topological-hierarchy)
- [Orientation and Sense](#orientation-and-sense)
- [Tolerances](#tolerances)
- [The Winged-Edge and Half-Edge Data Structures](#the-winged-edge-and-half-edge-data-structures)
- [Building a Simple BRep: The Cube Example](#building-a-simple-brep-the-cube-example)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

Boundary Representation (BRep) is the standard way professional CAD systems represent 3D solid models. Instead of storing a solid as a volumetric description (like voxels) or a construction recipe (like CSG), BRep stores only the **boundary** — the surfaces, edges, and vertices that enclose the solid.

This approach has dominated mechanical CAD since the 1980s because it:
- Supports exact geometry (circles are circles, not polygons)
- Enables surface-based operations (fillets, chamfers, blends)
- Maps naturally to manufacturing processes
- Allows efficient intersection and boolean operations

Every professional CAD kernel — Parasolid, ACIS, OpenCASCADE — uses BRep as its core representation.

---

## What is BRep?

A BRep model describes a solid by its boundary. Think of it like describing a cardboard box: you don't say "it's a 10×10×10 region of space" — you say "it has 6 faces, 12 edges, and 8 corners, and here's how they connect."

```
┌─────────────────────────────────────────────────────────────────┐
│                     WHAT BREP STORES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  A cube in BRep is NOT:              A cube in BRep IS:         │
│  ─────────────────────               ──────────────────         │
│                                                                 │
│  • "A 10×10×10 box"                  • 8 vertices (corners)     │
│  • "Extrude square 10mm"             • 12 edges (lines)         │
│  • A grid of voxels                  • 6 faces (planes)         │
│  • A mesh of triangles               • How they connect         │
│                                      • The math for each        │
│                                                                 │
│  The STRUCTURE (topology) and MATH (geometry) are separate.     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** BRep separates **what connects to what** (topology) from **where things are in space** (geometry). This separation is fundamental and we'll explore it in detail.

---

## Comparison with Other Representations

### Constructive Solid Geometry (CSG)

CSG stores a recipe: "Take a cube, subtract a cylinder, union with a sphere."

```
        CSG Tree                        BRep
        ────────                        ────
        
          Union                    Explicit faces, edges,
         ╱     ╲                   vertices with geometry
    Subtract    Sphere             
     ╱    ╲                        No history — just the
   Cube  Cylinder                  final boundary
```

| Aspect | CSG | BRep |
|--------|-----|------|
| Storage | Operation tree | Explicit boundary |
| Edit history | Preserved | Lost (unless tracked separately) |
| Surface ops | Difficult | Native |
| Booleans | Native (tree) | Must compute intersections |
| Exact geometry | Yes | Yes |

### Polygon Mesh

Meshes store triangles approximating surfaces.

```
        Mesh Cylinder                BRep Cylinder
        ─────────────                ─────────────
        
           ╱╲                        Mathematical surface:
          ╱  ╲                       x² + y² = r²
         ╱    ╲                      
        ╱──────╲                     Exact at any zoom level
       ╱╲      ╱╲                    
      ╱  ╲    ╱  ╲                   
     ╱────╲──╱────╲                  
     
    Triangles approximate            Curve is exact
```

| Aspect | Mesh | BRep |
|--------|------|------|
| Curved surfaces | Approximation | Exact |
| File size | Grows with resolution | Compact |
| Rendering | Direct (GPU-native) | Must tessellate |
| Precision | Limited by triangle count | Mathematical |
| CNC manufacturing | Problematic | Native |

### Why BRep Wins for CAD

1. **Precision** — A 10mm radius is exactly 10mm, not 9.998mm due to tessellation
2. **Derivatives** — Exact normals, tangents, curvatures at any point
3. **Manufacturability** — CNC machines need exact toolpaths, not triangle approximations
4. **Surface operations** — Fillets roll along exact edges, not polygon creases

---

## Topology vs Geometry

This is the core concept of BRep: **topology** and **geometry** are separate but linked.

### Topology (Structure)

Topology answers: **What connects to what?**

- This vertex is an endpoint of these three edges
- This edge bounds these two faces
- This face is part of this shell

Topology doesn't care about coordinates. A topological cube and a topological sphere are the same — 8 vertices, 12 edges, 6 faces (for the cube's topology mapped to a sphere, think of "inflating" the cube).

### Geometry (Math)

Geometry answers: **Where is it in space? What's the shape?**

- This vertex is at (10, 20, 30)
- This edge follows the curve y = x² from t=0 to t=5
- This face lies on the plane z = 0

### How They Link

Each topological entity has associated geometry:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOPOLOGY ←→ GEOMETRY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TOPOLOGY              GEOMETRY                                 │
│  ────────              ────────                                 │
│                                                                 │
│  Vertex  ─────────────► Point (x, y, z)                         │
│                                                                 │
│  Edge    ─────────────► Curve (line, circle, NURBS)             │
│          └──────────► Parameter range [t₁, t₂]                  │
│                                                                 │
│  Face    ─────────────► Surface (plane, cylinder, NURBS)        │
│          └──────────► Trim loops (how the surface is cut)       │
│                                                                 │
│  The same curve can be shared by multiple edges.                │
│  The same surface can be shared by multiple faces.              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Separate Them?

1. **Reuse** — Two edges can share the same underlying curve
2. **Flexibility** — Change geometry without changing topology
3. **Algorithms** — Many algorithms work purely on topology
4. **Validation** — Can check topological consistency independent of geometry

---

## The Topological Hierarchy

BRep defines a hierarchy of topological entities:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOPOLOGICAL HIERARCHY                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  COMPOUND ──────► Collection of unrelated solids                │
│      │            (e.g., all parts of an assembly)              │
│      ▼                                                          │
│  COMPSOLID ────► Solids sharing faces                           │
│      │            (rare — mostly in imported models)            │
│      ▼                                                          │
│  SOLID ────────► Closed volume, watertight boundary             │
│      │            (the "part" you're designing)                 │
│      ▼                                                          │
│  SHELL ────────► Connected set of faces                         │
│      │            (a solid has one or more shells)              │
│      ▼                                                          │
│  FACE ─────────► Bounded region of a surface                    │
│      │            (a face of the solid)                         │
│      ▼                                                          │
│  WIRE ─────────► Connected sequence of edges                    │
│      │            (boundary loop of a face)                     │
│      ▼                                                          │
│  EDGE ─────────► Bounded piece of a curve                       │
│      │            (where two faces meet)                        │
│      ▼                                                          │
│  VERTEX ───────► A point                                        │
│                  (where edges meet — a corner)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Definitions

**Vertex**
- Zero-dimensional: a point in space
- Knows which edges connect to it
- Has a tolerance (see Tolerances section)

**Edge**
- One-dimensional: a bounded curve segment
- Has two vertices (start and end) — or one for a closed loop
- References an underlying curve + parameter bounds [t₁, t₂]
- Knows which faces it bounds

**Wire**
- A connected sequence of edges forming a loop
- Used to bound faces
- Must be closed for valid face boundaries
- Can be a single closed edge (like a circle)

**Face**
- Two-dimensional: a bounded region of a surface
- Has one outer wire (the boundary)
- May have inner wires (holes)
- References an underlying surface

**Shell**
- A connected set of faces
- Must be closed (watertight) for a valid solid
- Open shells exist but don't form solids

**Solid**
- A closed 3D volume
- Has one outer shell
- May have inner shells (voids/cavities)

**Compound**
- A collection of any shapes
- No connectivity requirement
- Used for assemblies or grouping

---

## Orientation and Sense

Orientation matters in BRep. It determines:
- Which side of a face is "outside" the solid
- Which direction an edge traverses its curve
- How wires wind around faces

### Face Orientation

Every face has a surface normal. By convention:
- Normal points **outward** from the solid
- Looking along the normal, the outer wire goes **counter-clockwise**

```
            Normal (outward)
                 ↑
                 │
        ┌────────┼────────┐
        │        │        │
        │    CCW │        │    Outer wire goes
        │   ◄────┼────    │    counter-clockwise
        │        │    │   │    when viewed from
        │        │    ▼   │    outside
        └─────────────────┘
```

### Edge Orientation

Edges can be used "forward" or "reversed" by different faces:

```
┌─────────────────────────────────────────────────────────────────┐
│                     EDGE ORIENTATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  The same edge bounds two faces, but in opposite directions:    │
│                                                                 │
│         Face A                    Face B                        │
│        ┌──────┐                  ┌──────┐                       │
│        │      │                  │      │                       │
│        │   ──►│ (forward)        │◄──   │ (reversed)            │
│        │      │                  │      │                       │
│        └──────┘                  └──────┘                       │
│                                                                 │
│  Same underlying edge, different orientation in each face.      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

This is called the edge's "sense" with respect to a face.

---

## Tolerances

Real-world CAD must handle numerical imprecision. BRep uses tolerances:

### What Tolerances Mean

- **Vertex tolerance**: The vertex represents any point within this radius of its coordinates
- **Edge tolerance**: Points on the edge are within this distance of the curve
- **Face tolerance**: Points on the face are within this distance of the surface

```
┌─────────────────────────────────────────────────────────────────┐
│                       VERTEX TOLERANCE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ╭─────╮                                      │
│                   ╱       ╲                                     │
│                  │    ●    │   The vertex "is" any point        │
│                   ╲       ╱    within this sphere               │
│                    ╰─────╯                                      │
│                                                                 │
│          Tolerance = radius of uncertainty sphere               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Tolerances Matter

1. **Import/export** — Different systems have different precision
2. **Boolean operations** — Near-coincident geometry needs tolerance to classify
3. **Healing** — Small gaps/overlaps can be closed within tolerance
4. **Display** — Tolerance affects tessellation quality

### Typical Values

- Modeling tolerance: 1e-7 to 1e-4 (depends on units and application)
- STEP files often use 1e-6 or 1e-7
- Larger tolerances for imports from mesh-based systems

---

## The Winged-Edge and Half-Edge Data Structures

Two classic data structures for representing BRep topology:

### Winged-Edge

Each edge stores pointers to:
- Two vertices (endpoints)
- Two faces (on either side)
- Four edges (predecessor and successor on each face)

```
┌─────────────────────────────────────────────────────────────────┐
│                      WINGED-EDGE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     Face Left                                   │
│                    ╱         ╲                                  │
│              pred_L           succ_L                            │
│                 ↖               ↗                               │
│                  ╲             ╱                                │
│       Vertex A ───────EDGE───────► Vertex B                     │
│                  ╱             ╲                                │
│                 ↙               ↘                               │
│              succ_R           pred_R                            │
│                    ╲         ╱                                  │
│                     Face Right                                  │
│                                                                 │
│  Each edge knows its neighbors on both sides.                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Half-Edge (more common in modern systems)

Each edge is split into two "half-edges," one for each direction:

```
┌─────────────────────────────────────────────────────────────────┐
│                       HALF-EDGE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Instead of one edge with complex pointers,                     │
│  we have two half-edges that are twins:                         │
│                                                                 │
│       ┌─────────────────────────────────────┐                   │
│       │              Face A                 │                   │
│       │                                     │                   │
│       │   ←──────── half-edge 1 ←────────   │                   │
│       │   V2 ────────────────────────► V1   │                   │
│       │                                     │                   │
│       └─────────────────────────────────────┘                   │
│                         ║ twin                                  │
│       ┌─────────────────║───────────────────┐                   │
│       │              Face B                 │                   │
│       │                                     │                   │
│       │   ──────────► half-edge 2 ────────► │                   │
│       │   V1 ────────────────────────► V2   │                   │
│       │                                     │                   │
│       └─────────────────────────────────────┘                   │
│                                                                 │
│  Each half-edge knows: origin vertex, twin, next in loop, face  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Half-edge is simpler to traverse** — you always move in one consistent direction around each face.

### OCCT's Approach

OCCT uses a variant where edges have "partner" coedges (similar to half-edges) stored in the face's wire loops. Each coedge knows its edge and its orientation.

---

## Building a Simple BRep: The Cube Example

Let's trace how a unit cube is represented in BRep:

### The Cube

```
        V7──────────V6
       ╱│          ╱│
      ╱ │         ╱ │
    V4──────────V5  │
     │  │        │  │           Z
     │  V3───────│─V2           │
     │ ╱         │ ╱            │
     │╱          │╱             └───Y
    V0──────────V1             ╱
                              X
```

### Vertices (8)

| Vertex | Coordinates |
|--------|-------------|
| V0 | (0, 0, 0) |
| V1 | (1, 0, 0) |
| V2 | (1, 1, 0) |
| V3 | (0, 1, 0) |
| V4 | (0, 0, 1) |
| V5 | (1, 0, 1) |
| V6 | (1, 1, 1) |
| V7 | (0, 1, 1) |

### Edges (12)

| Edge | Vertices | Curve |
|------|----------|-------|
| E0 | V0 → V1 | Line along X |
| E1 | V1 → V2 | Line along Y |
| E2 | V2 → V3 | Line along -X |
| E3 | V3 → V0 | Line along -Y |
| E4 | V4 → V5 | Line along X |
| E5 | V5 → V6 | Line along Y |
| E6 | V6 → V7 | Line along -X |
| E7 | V7 → V4 | Line along -Y |
| E8 | V0 → V4 | Line along Z |
| E9 | V1 → V5 | Line along Z |
| E10 | V2 → V6 | Line along Z |
| E11 | V3 → V7 | Line along Z |

### Faces (6)

| Face | Surface | Outer Wire | Normal |
|------|---------|------------|--------|
| Bottom | Plane z=0 | E0, E1, E2, E3 | (0, 0, -1) |
| Top | Plane z=1 | E4, E5, E6, E7 | (0, 0, +1) |
| Front | Plane y=0 | E0, E9, -E4, -E8 | (0, -1, 0) |
| Back | Plane y=1 | -E2, E10, E6, -E11 | (0, +1, 0) |
| Left | Plane x=0 | -E3, E8, E7, -E11 | (-1, 0, 0) |
| Right | Plane x=1 | E1, E10, -E5, -E9 | (+1, 0, 0) |

Note: `-E` means the edge is used in reverse orientation.

### The Shell and Solid

- One shell containing all 6 faces
- One solid containing that shell
- No inner shells (no cavities)

---

## Relevance to labrep

### What We Need to Implement

**Phase 1: Core Data Structures**

```typescript
// Topology
class Vertex { point: Point3D; tolerance: number; }
class Edge { curve: Curve; start: Vertex; end: Vertex; }
class Wire { edges: OrientedEdge[]; }
class Face { surface: Surface; outerWire: Wire; innerWires: Wire[]; }
class Shell { faces: Face[]; }
class Solid { outerShell: Shell; innerShells: Shell[]; }

// Geometry
interface Point3D { x: number; y: number; z: number; }
interface Curve { evaluate(t: number): Point3D; }
interface Surface { evaluate(u: number, v: number): Point3D; }
```

**Phase 2: Traversal and Queries**

- Get all edges of a face
- Get all faces sharing an edge
- Get all edges meeting at a vertex
- Check if a solid is valid (closed, consistent orientation)

**Phase 3: Construction**

- Build vertices, edges, faces from geometry
- Construct primitives (box, cylinder, sphere)
- Validate topology consistency

### OCCT Reference

Key OCCT classes to study:

| Our Concept | OCCT Class | File |
|-------------|------------|------|
| Vertex | TopoDS_Vertex | src/TopoDS/TopoDS_Vertex.hxx |
| Edge | TopoDS_Edge | src/TopoDS/TopoDS_Edge.hxx |
| Wire | TopoDS_Wire | src/TopoDS/TopoDS_Wire.hxx |
| Face | TopoDS_Face | src/TopoDS/TopoDS_Face.hxx |
| Shell | TopoDS_Shell | src/TopoDS/TopoDS_Shell.hxx |
| Solid | TopoDS_Solid | src/TopoDS/TopoDS_Solid.hxx |
| Building | BRep_Builder | src/BRep/BRep_Builder.hxx |

### Design Decisions for labrep

1. **Half-edge vs OCCT-style** — Consider half-edge for simpler traversal
2. **Tolerance model** — Start simple (single global tolerance), evolve as needed
3. **Immutability** — Consider immutable structures for easier reasoning
4. **Validation** — Build validation into construction, not as afterthought

---

## References

### Foundational

- [Wikipedia: Boundary Representation](https://en.wikipedia.org/wiki/Boundary_representation)
- [Wikipedia: Solid Modeling](https://en.wikipedia.org/wiki/Solid_modeling)
- Mäntylä, M. (1988). *An Introduction to Solid Modeling* — The classic textbook

### OCCT Documentation

- [OCCT Modeling Data Guide](https://dev.opencascade.org/doc/overview/html/occt_user_guides__modeling_data.html)
- [OCCT Topology and Geometry Blog Post](https://opencascade.blogspot.com/2009/02/topology-and-geometry-in-open-cascade.html)

### OCCT Source Files

- `library/opencascade/src/TopoDS/` — Topology classes
- `library/opencascade/src/BRep/` — BRep representation
- `library/opencascade/src/BRepBuilderAPI/` — High-level construction

### Academic

- Weiler, K. (1985). "Edge-Based Data Structures for Solid Modeling in Curved-Surface Environments" — Winged-edge and radial-edge
- Baumgart, B. (1972). "Winged Edge Polyhedron Representation" — Original winged-edge paper
