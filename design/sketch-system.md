# Phase 5: Sketch System (No Constraints) — Design Document

## Overview

Implement a 2D sketch system that lets users place geometry elements (lines, arcs, circles) on a plane and automatically detect closed profiles. Profiles are the input to 3D operations like extrude and revolve.

This phase does NOT include constraint solving (parallel, perpendicular, tangent, etc.) — that's Phase 11. Here we build the container (Sketch), the element management, and the core algorithm: **region detection** — finding closed loops in a planar graph of curves.

## OCCT Reference

| labrep | OCCT | Notes |
|--------|------|-------|
| `Sketch` | `Sketcher_Sketch` (in CAD apps) | Not a core OCCT class — CAD apps build this on top |
| `SketchElement` | — | Our abstraction for sketch contents |
| `Profile2D` | `TopoDS_Wire` (closed) | Closed wire = extrudable profile |
| Region detection | `ShapeAnalysis_Wire`, `BRepBuilderAPI_MakeWire` | OCCT builds wires from edges; we detect regions |

OCCT doesn't have a "sketch" concept per se — sketches are a CAD application concept built on top of OCCT's 2D geometry and topology. Our implementation is informed by how FreeCAD Sketcher, Fusion 360 Sketch, and SolidWorks Sketch work.

---

## Data Types

### SketchElement

```typescript
/**
 * An element in a sketch — a piece of geometry with an ID.
 * Construction elements are visual guides that don't form part of profiles.
 */
interface SketchElement {
  /** Unique identifier within the sketch */
  readonly id: string;
  /** The underlying 2D curve */
  readonly geometry: Curve2D;
  /** Construction geometry doesn't contribute to profiles */
  readonly construction: boolean;
}
```

### Sketch

```typescript
/**
 * A 2D sketch on a plane.
 * Contains elements (lines, arcs, circles) and computed profiles.
 */
interface Sketch {
  /** The 3D plane this sketch lives on */
  readonly plane: Plane;
  /** All sketch elements */
  readonly elements: readonly SketchElement[];
}
```

### Profile2D

```typescript
/**
 * A closed 2D profile suitable for extrusion or revolution.
 * The outer boundary winds counter-clockwise.
 * Holes wind clockwise.
 */
interface Profile2D {
  /** Outer boundary (counter-clockwise) */
  readonly outer: Wire2D;
  /** Inner boundaries / holes (clockwise) */
  readonly holes: readonly Wire2D[];
}
```

---

## Functions

### Sketch Management

```typescript
/**
 * Create an empty sketch on a plane.
 */
function createSketch(plane: Plane): Sketch;

/**
 * Add a geometry element to a sketch.
 * Auto-generates a unique ID.
 */
function addElement(
  sketch: Sketch,
  geometry: Curve2D,
  construction?: boolean,
): Sketch;

/**
 * Remove an element by ID.
 */
function removeElement(sketch: Sketch, id: string): Sketch;

/**
 * Get an element by ID.
 */
function getElement(sketch: Sketch, id: string): SketchElement | undefined;
```

### Profile Detection (Region Finding)

This is the core algorithm of this phase.

```typescript
/**
 * Find all closed profiles in a sketch.
 *
 * Takes the non-construction elements, finds all closed loops
 * in the planar curve graph, and returns them as Profile2D objects
 * with outer boundaries and holes correctly identified.
 *
 * @returns Array of detected profiles, or empty if none found
 */
function findProfiles(sketch: Sketch): Profile2D[];

/**
 * Validate a sketch for common issues.
 */
function validateSketch(sketch: Sketch): OperationResult<{
  /** Elements that don't connect to anything */
  danglingElements: string[];
  /** Self-intersecting elements */
  selfIntersections: Array<{ element1: string; element2: string; point: Point2D }>;
  /** Number of closed regions found */
  profileCount: number;
}>;
```

### Profile Utilities

```typescript
/**
 * Compute the signed area of a profile's outer boundary.
 * Positive = counter-clockwise (valid outer boundary).
 * Negative = clockwise (hole or inverted).
 */
function profileArea(profile: Profile2D): number;

/**
 * Check if a point is inside a profile (considering holes).
 */
function profileContainsPoint(profile: Profile2D, point: Point2D): boolean;
```

---

## Region Detection Algorithm

The key algorithmic challenge. Given a set of 2D curves that may intersect, find all closed regions.

### Approach: Planar Graph → Face Finding

```
┌──────────────────────────────────────────────────────┐
│              REGION DETECTION PIPELINE                │
├──────────────────────────────────────────────────────┤
│                                                       │
│  1. SPLIT AT INTERSECTIONS                            │
│     └─► Find all curve-curve intersections            │
│     └─► Split curves at intersection points           │
│     └─► Result: a set of non-intersecting segments    │
│                                                       │
│  2. BUILD PLANAR GRAPH                                │
│     └─► Vertices = endpoints + intersection points    │
│     └─► Edges = curve segments between vertices       │
│     └─► Adjacency = which edges share vertices        │
│                                                       │
│  3. FIND MINIMAL CYCLES                               │
│     └─► At each vertex, sort outgoing edges by angle  │
│     └─► Walk: always turn right (next CW edge)        │
│     └─► Each walk produces a minimal closed region    │
│     └─► Discard the outer (infinite) region            │
│                                                       │
│  4. CLASSIFY REGIONS                                  │
│     └─► Compute signed area of each region            │
│     └─► CCW regions = outer boundaries                │
│     └─► CW regions = holes                            │
│     └─► Nest holes inside their containing boundary   │
│                                                       │
│  5. BUILD PROFILES                                    │
│     └─► Each outer boundary + its holes = Profile2D   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Step 3 Detail: Minimum Cycle Finding

The "always turn right" algorithm (also called the "planar face finding" or "next-edge-by-angle" algorithm):

```
At vertex V with incoming edge E:
1. Compute the angle of E at V
2. Sort all other edges at V by angle
3. Pick the next edge clockwise from E's angle
4. Follow that edge to the next vertex
5. Repeat until returning to start vertex
6. This traces one minimal face
```

This is well-known in computational geometry. Each directed edge participates in exactly one face traversal, so the total work is O(E log V) where E = edges, V = vertices.

### Handling Circles

Circles are closed curves with no endpoints. They need special handling:
- A standalone circle with no intersections forms its own profile (a disc)
- A circle intersected by lines gets split into arcs at the intersection points and treated like any other edge

---

## Testing Approach

### Sketch Management

| Test | Description |
|------|-------------|
| `create_empty_sketch` | `createSketch(XY_PLANE)` produces sketch with empty elements |
| `add_line_element` | Adding a line increases element count |
| `add_arc_element` | Adding an arc works |
| `add_construction_element` | Construction flag is preserved |
| `remove_element` | Removing by ID decreases count |
| `remove_nonexistent` | Removing absent ID returns sketch unchanged |
| `element_ids_unique` | Auto-generated IDs don't collide |
| `get_element_by_id` | Retrieval by ID works |
| `sketch_is_immutable` | Adding/removing returns new sketch |

### Profile Detection — Simple Cases

| Test | Description |
|------|-------------|
| `rectangle_one_profile` | 4 lines forming a rectangle → 1 profile |
| `triangle_one_profile` | 3 lines forming a triangle → 1 profile |
| `circle_one_profile` | Single circle → 1 profile (disc) |
| `open_polyline_no_profile` | 3 connected lines not closed → 0 profiles |
| `disconnected_elements_no_profile` | Lines that don't connect → 0 profiles |
| `construction_elements_excluded` | Construction lines don't form profiles |

### Profile Detection — Multiple Regions

| Test | Description |
|------|-------------|
| `two_separate_rectangles` | Two disjoint rectangles → 2 profiles |
| `rectangle_with_interior_line` | Rectangle bisected by a line → 2 profiles |
| `cross_pattern` | Two perpendicular crossing lines → 4 small profiles |
| `rectangle_with_circular_hole` | Rectangle containing a circle → 1 profile with 1 hole |
| `concentric_circles` | Two concentric circles → 1 profile (annulus) with hole |

### Profile Detection — Edge Cases

| Test | Description |
|------|-------------|
| `coincident_endpoints` | Lines that share endpoints within tolerance connect |
| `t_junction` | Line ending on another line's midpoint → correct region finding |
| `shared_edge` | Two regions sharing an edge → both detected |

### Profile Utilities

| Test | Description |
|------|-------------|
| `area_of_unit_square` | 1×1 rectangle profile has area ≈ 1 |
| `area_ccw_positive` | CCW boundary gives positive area |
| `area_cw_negative` | CW boundary (hole) gives negative area |
| `contains_point_inside` | Point inside profile returns true |
| `contains_point_outside` | Point outside returns false |
| `contains_point_in_hole` | Point inside hole returns false |

---

## Implementation Order

1. **Sketch management** — createSketch, addElement, removeElement (simple, establishes infrastructure)
2. **Profile detection: no intersections** — handle cases where curves already connect end-to-end (rectangle from 4 lines, circle as disc)
3. **Profile detection: with intersections** — split curves at intersections, build planar graph, find minimal cycles
4. **Hole detection** — classify CCW vs CW regions, nest holes inside boundaries
5. **Profile utilities** — area, containsPoint
6. **Validation** — dangling elements, self-intersections

---

## File Organization

```
generation/src/sketch/
├── index.ts
├── sketch.ts              # Sketch, SketchElement types + management functions
├── profile.ts             # Profile2D type + utilities (area, containsPoint)
├── region-detection.ts    # findProfiles algorithm
└── validation.ts          # validateSketch

generation/tests/sketch/
├── sketch.test.ts         # Management tests
├── profile.test.ts        # Area, containsPoint tests
├── region-detection.test.ts  # All profile detection tests
└── validation.test.ts     # Validation tests
```

---

## Viewer Examples

### sketch-rectangle
**Visual:** A rectangle sketch on the XY plane with the detected profile highlighted.

### sketch-with-hole
**Visual:** A rectangle with a circle inside, showing the outer boundary (CCW) and hole (CW) with different colors.

### sketch-complex
**Visual:** Crossing lines forming multiple regions, each region highlighted in a different color.

---

## STEP Extension

When exporting sketches to STEP, the detected profiles map to:
- `Profile2D.outer` → closed `EDGE_LOOP` (will be implemented in Phase 6 with topology types)
- Individual curves → `LINE`, `CIRCLE` entities (will extend STEP converters)

For now, sketch elements can be exported as their constituent foundation types (points, directions).

---

## Exit Criteria

- [x] `createSketch`, `addElement`, `removeElement` work with immutable semantics
- [x] Rectangle from 4 lines → 1 profile detected
- [x] Triangle from 3 lines → 1 profile detected
- [x] Circle → 1 profile detected
- [x] Crossing lines → correct number of regions (rectangle with divider → 2)
- [x] Rectangle + inner circle → 1 profile with 1 hole
- [x] `profileArea` returns correct signed areas
- [x] `profileContainsPoint` works with holes
- [ ] `validateSketch` reports dangling elements *(deferred)*
- [x] Construction elements excluded from profiles
- [x] All tests passing (32 tests)
- [ ] Viewer examples added *(pending)*
- [x] `generation/src/index.ts` exports all new types and functions

**Status: ✅ CORE COMPLETE** (32 tests — sketch 14, profile 8, region-detection 10)
Validation and viewer examples pending.
