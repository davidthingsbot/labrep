# Boolean Operations

> Union, subtract, intersect — combining shapes is what makes CAD useful, and it depends on SSI.

---

## Table of Contents

- [Overview](#overview)
- [The Three Operations](#the-three-operations)
- [How Booleans Work](#how-booleans-work)
- [Face Classification](#face-classification)
- [Edge and Vertex Processing](#edge-and-vertex-processing)
- [Building the Result](#building-the-result)
- [Failure Modes](#failure-modes)
- [Regularized Booleans](#regularized-booleans)
- [OCCT's Boolean Pipeline](#occts-boolean-pipeline)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

Boolean operations are how CAD users build complex shapes from simple primitives. Take a block, subtract a cylinder to make a hole, union with another block — that's the workflow.

Behind the scenes, booleans are surprisingly complex. They require:
1. Computing all surface-surface intersections
2. Splitting faces along intersection curves
3. Classifying which parts are "inside" vs "outside"
4. Stitching surviving faces into a valid solid

This document covers how it all works.

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOOLEAN OPERATIONS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│      UNION (A ∪ B)              Everything in A or B            │
│                                                                 │
│      ┌─────┐                    ┌──────────┐                    │
│      │  A  │     ┌─────┐        │██████████│                    │
│      │     │·····│  B  │   →    │██████████│                    │
│      │     │     │     │        │██████████│                    │
│      └─────┘     └─────┘        └──────────┘                    │
│                                                                 │
│      SUBTRACT (A - B)           A minus any overlap with B      │
│                                                                 │
│      ┌─────┐                    ┌─────┐                         │
│      │  A  │     ┌─────┐        │█████│                         │
│      │     │·····│  B  │   →    │█████│                         │
│      │     │     │     │        │█████│                         │
│      └─────┘     └─────┘        └─────┘                         │
│                                                                 │
│                                                                 │
│      INTERSECT (A ∩ B)          Only the overlap                │
│                                                                 │
│      ┌─────┐                          ┌────┐                    │
│      │  A  │     ┌─────┐              │████│                    │
│      │     │·····│  B  │   →          │████│                    │
│      │     │     │     │              │████│                    │
│      └─────┘     └─────┘              └────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Three Operations

### Union (A ∪ B)

**Keep:** Everything that's in A OR in B

**Intuition:** Glue two shapes together, merge where they overlap.

**Result boundary:** 
- Faces of A outside B (pointing outward)
- Faces of B outside A (pointing outward)
- Remove overlapping internal faces

### Subtract (A - B)

**Keep:** Everything in A that's NOT in B

**Intuition:** Use B as a cutting tool on A.

**Result boundary:**
- Faces of A outside B (pointing outward)
- Faces of B inside A (pointing INWARD — flipped normals!)

### Intersect (A ∩ B)

**Keep:** Everything in A AND in B

**Intuition:** Keep only the overlap.

**Result boundary:**
- Faces of A inside B (pointing outward)
- Faces of B inside A (pointing outward)

---

## How Booleans Work

The general algorithm has these phases:

```
┌─────────────────────────────────────────────────────────────────┐
│                   BOOLEAN OPERATION PIPELINE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT: Solid A, Solid B                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ PHASE 1: INTERSECTION                                   │    │
│  │ • Find all face-face intersections (SSI)                │    │
│  │ • Result: intersection curves on each face              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ PHASE 2: SPLIT                                          │    │
│  │ • Split faces along intersection curves                 │    │
│  │ • Result: smaller faces with known boundaries           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ PHASE 3: CLASSIFY                                       │    │
│  │ • Determine each face's position: in A? in B?           │    │
│  │ • Mark faces as keep/discard based on operation         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ PHASE 4: BUILD                                          │    │
│  │ • Collect surviving faces                               │    │
│  │ • Fix orientations (flip if needed)                     │    │
│  │ • Stitch into new solid                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         │                                       │
│                         ▼                                       │
│  OUTPUT: Solid Result                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Face Classification

After splitting, we need to know where each face sits relative to the solids.

### The Question

For each face of A: is it **inside**, **outside**, or **on** solid B?
For each face of B: is it **inside**, **outside**, or **on** solid A?

### The Method: Point Sampling

1. Pick a point P on the face (interior, not on boundary)
2. Determine if P is inside the other solid

```
┌─────────────────────────────────────────────────────────────────┐
│                   POINT-IN-SOLID TEST                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Method: Ray casting                                            │
│                                                                 │
│  1. Cast ray from P in arbitrary direction                      │
│  2. Count intersections with solid boundary                     │
│  3. Odd count = inside, Even count = outside                    │
│                                                                 │
│         P ●────────────────────────────────────► ray            │
│           │     ×     ×     ×                                   │
│           │     │     │     │                                   │
│           ▼     ▼     ▼     ▼                                   │
│    ┌──────────────────────────────────┐                         │
│    │        SOLID                     │                         │
│    │   (boundary shown as line)       │                         │
│    └──────────────────────────────────┘                         │
│                                                                 │
│    3 intersections = ODD → P is INSIDE                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Classification Table

| Face location | Union | Subtract A-B | Intersect |
|---------------|-------|--------------|-----------|
| A outside B | Keep | Keep | Discard |
| A inside B | Discard | Discard | Keep |
| A on B (same normal) | Keep one | Keep one | Keep one |
| A on B (opposite normal) | Discard both | Keep A | Discard both |
| B outside A | Keep | Discard | Discard |
| B inside A | Discard | Keep (flip!) | Keep |
| B on A (same normal) | Keep one | Discard | Keep one |
| B on A (opposite normal) | Discard both | Discard | Discard both |

**Note:** "Keep one" for coincident faces means we keep the face but not duplicate.

---

## Edge and Vertex Processing

Faces share edges. When we split faces, we must handle shared edges consistently.

### Shared Edge Problem

```
┌─────────────────────────────────────────────────────────────────┐
│                   SHARED EDGE CONSISTENCY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│      Face A₁       Face A₂           After splitting:           │
│     ┌────────┬────────┐                                         │
│     │        │        │             ┌────┬───┬────┬───┐         │
│     │        │        │             │ A₁a│A₁b│ A₂a│A₂b│         │
│     │────────┼────────│  split →    │────┼───┼────┼───│         │
│     │        │        │             │    │   │    │   │         │
│     │    shared edge  │             │    │   │    │   │         │
│     └────────┴────────┘             └────┴───┴────┴───┘         │
│                                                                 │
│  The shared edge must be split at the SAME parameter values     │
│  on both faces. Otherwise, topology becomes inconsistent.       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Vertex Matching

When intersection curves end on edges:
- Create new vertices at intersection points
- Match vertices between the two solids
- Ensure topological consistency

### Tolerance Issues

Two intersection points might be "close enough" to merge:
- If within tolerance, they're the same vertex
- Must propagate this through all affected edges/faces

---

## Building the Result

### Collecting Faces

Based on classification:
1. Gather all "keep" faces
2. Reverse orientation of faces that need flipping (e.g., B inside A for subtract)
3. Handle coincident faces (keep only one copy)

### Sewing

Connect the faces into shells:

```
┌─────────────────────────────────────────────────────────────────┐
│                      SEWING FACES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Before:                    After sewing:                       │
│                                                                 │
│    ┌────┐  ┌────┐           ┌────────┐                          │
│    │ F1 │  │ F2 │           │   F1   │                          │
│    │    │  │    │    →      ├────────┤ edges matched            │
│    └────┘  └────┘           │   F2   │                          │
│                             └────────┘                          │
│    (gap between)            (connected shell)                   │
│                                                                 │
│  Matching edges become shared (one edge, two faces).            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Validation

Check the result:
- Shell is closed (every edge has exactly 2 faces)
- Orientations are consistent
- No self-intersection
- Volume is positive (not inside-out)

---

## Failure Modes

### When Booleans Fail

| Failure | Cause | Symptom |
|---------|-------|---------|
| Missing face | SSI missed an intersection | Hole in result |
| Self-intersecting result | Bad face classification | Invalid solid |
| Incorrect topology | Edge/vertex mismatch | Can't sew |
| Tangent surfaces | Degenerate SSI | Unpredictable |
| Coincident faces | Special case not handled | Missing or duplicate faces |
| Near-miss geometry | Numerical precision | Random failures |

### Robustness Strategies

1. **Tolerance management** — Consistent tolerances throughout
2. **Validation at each step** — Catch problems early
3. **Fallback strategies** — Retry with different parameters
4. **User feedback** — Report when uncertain

---

## Regularized Booleans

**Regularization** cleans up the result to ensure it's a proper solid.

### What It Does

- Remove dangling edges (edges not bounding faces)
- Remove dangling faces (faces not bounding volumes)
- Ensure result is 3-dimensional (not degenerate)

### Example

```
┌─────────────────────────────────────────────────────────────────┐
│                    REGULARIZATION                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Non-regularized A ∩ B:       Regularized:                      │
│                                                                 │
│        ┌─────┐┌────┐                                            │
│        │     ││    │  A and B share a face (tangent).           │
│        │  A  ││ B  │  Their intersection is 2D, not 3D.         │
│        │     ││    │                                            │
│        └─────┘└────┘                                            │
│                                                                 │
│  The "intersection" is a 2D face, not a 3D solid.               │
│  Regularization removes it, leaving empty result.               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## OCCT's Boolean Pipeline

### Key Classes

```cpp
// High-level API (src/BRepAlgoAPI/)
BRepAlgoAPI_BooleanOperation  // Base class
BRepAlgoAPI_Fuse              // Union
BRepAlgoAPI_Cut               // Subtract
BRepAlgoAPI_Common            // Intersect
BRepAlgoAPI_Section           // Just the intersection curves

// Core algorithm (src/BOPAlgo/)
BOPAlgo_BOP                   // Boolean operation
BOPAlgo_PaveFiller            // Computes intersections
BOPAlgo_Builder               // Builds result

// Intersection (src/IntTools/)
IntTools_FaceFace             // Face-face intersection
IntTools_EdgeFace             // Edge-face intersection
```

### OCCT Algorithm Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    OCCT BOOLEAN FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BRepAlgoAPI_Fuse / Cut / Common                                │
│           │                                                     │
│           ▼                                                     │
│  BOPAlgo_BOP::Perform()                                         │
│           │                                                     │
│           ├──► BOPAlgo_PaveFiller                               │
│           │        │                                            │
│           │        ├── IntTools_FaceFace (SSI)                  │
│           │        ├── IntTools_EdgeFace                        │
│           │        └── Build pave blocks (split edges)          │
│           │                                                     │
│           ├──► BOPAlgo_Builder                                  │
│           │        │                                            │
│           │        ├── Classify faces (in/out/on)               │
│           │        ├── Select faces based on operation          │
│           │        └── Build result shapes                      │
│           │                                                     │
│           └──► Return result solid                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### OCCT Source Files

| Phase | Files |
|-------|-------|
| Entry point | `src/BRepAlgoAPI/BRepAlgoAPI_BooleanOperation.cxx` |
| Intersection | `src/IntTools/IntTools_FaceFace.cxx` |
| Pave filler | `src/BOPAlgo/BOPAlgo_PaveFiller*.cxx` |
| Builder | `src/BOPAlgo/BOPAlgo_Builder*.cxx` |
| Face classification | `src/BOPAlgo/BOPAlgo_Builder_2.cxx` |

---

## Relevance to labrep

### Our Phased Approach

**Phase 1: No Booleans**
- Just primitives and viewing
- Learn BRep structure without boolean complexity

**Phase 2: Simple Booleans**
- Box-box, box-cylinder (planar intersections)
- Analytic SSI only
- Proves the pipeline works

**Phase 3: General Booleans**
- Full SSI with NURBS
- Robust face classification
- Production-quality output

### What We Need to Implement

```typescript
// Core interfaces
interface BooleanOperation {
  union(a: Solid, b: Solid): BooleanResult;
  subtract(a: Solid, b: Solid): BooleanResult;
  intersect(a: Solid, b: Solid): BooleanResult;
}

interface BooleanResult {
  solid: Solid | null;
  status: 'success' | 'empty' | 'failed';
  warnings: string[];
}

// Internal phases
interface FaceIntersector {
  intersect(f1: Face, f2: Face): IntersectionCurve[];
}

interface FaceSplitter {
  split(face: Face, curves: IntersectionCurve[]): Face[];
}

interface FaceClassifier {
  classify(face: Face, solid: Solid): 'inside' | 'outside' | 'on';
}

interface ResultBuilder {
  build(faces: ClassifiedFace[], operation: 'union' | 'subtract' | 'intersect'): Solid;
}
```

### Key Design Decisions

1. **Start simple** — Box-box before NURBS-NURBS
2. **Validate early** — Check intermediate results
3. **Clear error handling** — Don't silently produce garbage
4. **Extensible SSI** — Plug in analytic vs general methods

### OCCT Reference Files

When implementing booleans, start with:
- `src/BRepAlgoAPI/BRepAlgoAPI_Fuse.cxx` — High-level entry
- `src/BOPAlgo/BOPAlgo_BOP.cxx` — Core algorithm
- `src/BOPAlgo/BOPAlgo_Builder_2.cxx` — Face classification
- `src/BOPAlgo/BOPAlgo_Builder_3.cxx` — Result building

---

## References

### Books

- Hoffmann, C.M. (1989). *Geometric and Solid Modeling* — Classic textbook
- Mäntylä, M. (1988). *An Introduction to Solid Modeling* — Another classic

### Papers

- Requicha, A.A.G. (1980). "Representations for Rigid Solids: Theory, Methods, and Systems" — Foundational paper
- Tilove, R.B. (1980). "Set Membership Classification: A Unified Approach to Geometric Intersection Problems"

### Online

- [Boolean Operations (Wikipedia)](https://en.wikipedia.org/wiki/Constructive_solid_geometry)
- [CGAL Boolean Operations](https://doc.cgal.org/latest/Polygon_mesh_processing/index.html#title12)

### OCCT Documentation

- [OCCT Boolean Operations](https://dev.opencascade.org/doc/overview/html/occt_user_guides__boolean_operations.html)
- `library/opencascade/src/BRepAlgoAPI/` — High-level API
- `library/opencascade/src/BOPAlgo/` — Core algorithms
