# I/O-First Phase Refactor

> Move STEP and STL import/export earlier in the roadmap so every future feature can be round-trip tested.

---

## Table of Contents

- [Motivation](#motivation)
- [Current Phase Order vs Proposed](#current-phase-order-vs-proposed)
- [The Dependency Problem](#the-dependency-problem)
- [Incremental I/O Strategy](#incremental-io-strategy)
- [Revised Phase Order](#revised-phase-order)

---

## Motivation

The original plan puts STEP I/O at Phase 6, after Sketch System, 3D Geometry, and Extrude. STL export isn't in the plan at all.

**Problem:** Every new feature (topology types, extrude, booleans) should be tested by round-tripping through STEP. If we wait until Phase 6 to build I/O, we've accumulated 3 phases of untested serialization assumptions. Bugs in our data structures that would be caught by "export → import → compare" go undetected.

**Solution:** Move I/O up. Build it incrementally alongside the data types it serializes. Each phase that adds new types also extends the I/O to cover them.

---

## Current Phase Order vs Proposed

```
CURRENT:                          PROPOSED:
────────                          ────────
1. Math Foundation    ✅          1. Math Foundation        ✅
2. 2D Curves          ✅          2. 2D Curves              ✅
3. Sketch System                  3. STL I/O (Mesh-level)
4. Basic 3D Geometry              4. STEP I/O (Foundation)
5. Extrude                        5. Sketch System
6. STEP I/O  ◄── too late         6. Basic 3D Geometry + extend STEP
7. Sketch on Face                 7. Extrude + extend STEP
8. Booleans                       8. Sketch on Face
9. Revolve                        9. Booleans + extend STEP
10. Constraints                   10. Revolve + extend STEP
11. Assemblies                    11. Constraints
                                  12. Assemblies + extend STEP
```

---

## The Dependency Problem

STEP export of a full BRep solid requires types that don't exist yet (Vertex, Edge, Face, Shell, Solid). But we don't need to wait for all of them:

**What we CAN export now:**
- Foundation types → `CARTESIAN_POINT`, `DIRECTION`, `VECTOR`, `AXIS2_PLACEMENT_3D`
- Our `Mesh` primitives (box, sphere, cylinder) → STL directly (no topology needed)

**What requires new types:**
- `VERTEX_POINT` → needs `Vertex`
- `EDGE_CURVE` → needs `Edge`, `Curve3D`
- `ADVANCED_FACE` → needs `Face`, `Surface`
- `MANIFOLD_SOLID_BREP` → needs `Solid`, `Shell`

**The incremental approach:** Build STEP I/O for the types we have now. When we add topology types later, extend the I/O to cover them. Each extension is tested by round-trip.

---

## Incremental I/O Strategy

### Phase 3: STL I/O (Mesh-level)

Our `Mesh` type (vertices + normals + indices) maps directly to STL. No new types needed.

```
┌────────────┐     ┌──────────┐     ┌────────────┐
│ makeBox()  │────►│   Mesh   │────►│  STL file  │
│ makeSphere │     │ (tri mesh)│     │ (triangles)│
│ makeCylinder│     └──────────┘     └────────────┘
└────────────┘           │                │
                         │     import     │
                         ◄────────────────┘
                    round-trip test
```

**Exit criteria:** `mesh → STL → mesh → compare` passes for all primitives.

### Phase 4: STEP I/O (Foundation)

Start with the entities we can already represent:

```
STEP entities we can handle now:
├── CARTESIAN_POINT       ←→ Point3D
├── DIRECTION             ←→ Vector3D (normalized)
├── VECTOR                ←→ Vector3D (with magnitude)
├── AXIS1_PLACEMENT       ←→ Axis
├── AXIS2_PLACEMENT_3D    ←→ Plane
└── HEADER/DATA structure  ←→ parse/serialize

STEP entities that wait for Phase 6:
├── LINE, CIRCLE          ←→ Curve3D (Phase 6)
├── PLANE, CYLINDRICAL_SURFACE ←→ Surface (Phase 6)
├── VERTEX_POINT          ←→ Vertex (Phase 6)
├── EDGE_CURVE            ←→ Edge (Phase 6)
├── EDGE_LOOP             ←→ Loop (Phase 6)
├── ADVANCED_FACE         ←→ Face (Phase 6)
├── CLOSED_SHELL          ←→ Shell (Phase 7)
└── MANIFOLD_SOLID_BREP   ←→ Solid (Phase 7)
```

We also build the **STEP parser** (text → entity map) and **STEP writer** (entity map → text) as general infrastructure. The parser handles all entity types syntactically even if we don't yet convert all of them semantically.

**Exit criteria:**
- Parse any valid STEP file into an entity map
- Write a valid STEP file from an entity map
- Round-trip foundation types: `Point3D → CARTESIAN_POINT → Point3D`
- Import a STEP file from FreeCAD/Fusion360 (parse succeeds, extract points and axes)

### Phase 6+: Extend STEP for Topology

Each phase that adds topology types also extends the STEP reader/writer:

| Phase | New Types | New STEP Entities |
|-------|-----------|-------------------|
| 6 (3D Geometry) | Curve3D, Surface, Vertex, Edge, Face | LINE, CIRCLE, PLANE, VERTEX_POINT, EDGE_CURVE, ADVANCED_FACE |
| 7 (Extrude) | Shell, Solid, CylindricalSurface | CLOSED_SHELL, MANIFOLD_SOLID_BREP, CYLINDRICAL_SURFACE |
| 9+ (Booleans, Revolve) | SphericalSurface, ConicalSurface | SPHERICAL_SURFACE, CONICAL_SURFACE |

Each extension includes round-trip tests: create geometry → export STEP → import STEP → compare.

---

## Revised Phase Order

### Phase 3: STL I/O *(NEW — was not in plan)*

Design doc: `design/stl-io.md`

### Phase 4: STEP I/O Foundation *(moved from Phase 6)*

Design doc: `design/step-io.md`

### Phase 5: Sketch System *(was Phase 3)*

Design doc: `design/sketch-system.md` (to be written)

### Phase 6: Basic 3D Geometry + STEP Topology *(was Phase 4)*

Extend STEP reader/writer for Vertex, Edge, Face.

### Phase 7: Extrude + STEP Solids *(was Phase 5)*

Extend STEP reader/writer for Shell, Solid. Full round-trip of extruded solids through STEP.

### Phases 8–12: Unchanged *(renumbered)*

Each phase that adds new geometry or topology also extends STEP I/O with round-trip tests.

---

## Testing Regimen

After Phase 3 and 4 are complete, every subsequent phase includes:

```
For each new feature:
1. Write the feature (TDD as always)
2. Extend STEP writer to serialize the new types
3. Extend STEP reader to deserialize the new types
4. Add round-trip test: create → export STEP → import → compare
5. Add STL export test: create → tessellate → export STL → import → compare mesh
```

This ensures I/O never falls behind the data model.
