# STEP File Format

> The universal exchange format for CAD data — and a direct serialization of BRep.

---

## Table of Contents

- [Overview](#overview)
- [Why STEP Matters](#why-step-matters)
- [File Structure](#file-structure)
- [BRep Entities in STEP](#brep-entities-in-step)
- [A Complete Example: Cube](#a-complete-example-cube)
- [Application Protocols](#application-protocols)
- [Limitations and Gotchas](#limitations-and-gotchas)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

STEP (Standard for the Exchange of Product Data) is an ISO standard (ISO 10303) for representing 3D CAD data. A STEP file (`.stp` or `.step`) is a text file containing a serialized BRep model.

**Key facts:**
- **ISO 10303-21** defines the file format (text encoding)
- **Application Protocols** (AP203, AP214, AP242) define what data can be stored
- **EXPRESS** is the schema language (like a type system for STEP)
- Files are ASCII, human-readable (if verbose)
- Entities reference each other by ID (`#123`)

**Why it's important for us:** STEP is essentially a serialization format for BRep. If our internal API doesn't map cleanly to STEP entities, import/export will be painful.

---

## Why STEP Matters

### Universal Interoperability

Every serious CAD system supports STEP:
- SolidWorks, Fusion 360, Onshape
- FreeCAD, OpenSCAD (via OpenCASCADE)
- CATIA, NX, Creo
- Manufacturing tools (CAM, CNC)

**STEP is how CAD data moves between systems.**

### Geometry Preservation

Unlike mesh formats (STL, OBJ), STEP preserves:
- Exact curves (circles are circles, not polygons)
- Exact surfaces (cylinders, spheres, NURBS)
- Topology (which faces share which edges)
- Parametric data (in some APs)

### Manufacturing Workflows

CNC machines and manufacturing processes need exact geometry:
- Toolpaths computed from BRep surfaces
- Tolerances meaningful in BRep, not mesh
- Quality control references exact dimensions

---

## File Structure

A STEP file has two sections:

```
ISO-10303-21;                    ← Magic identifier
HEADER;                          ← Metadata section
  FILE_DESCRIPTION(...);
  FILE_NAME(...);
  FILE_SCHEMA(('AP214'));        ← Which schema
ENDSEC;
DATA;                            ← Geometry section
  #1 = CARTESIAN_POINT(...);     ← Entity with ID #1
  #2 = DIRECTION(...);
  #3 = VERTEX_POINT(#1);         ← References #1
  ...
ENDSEC;
END-ISO-10303-21;
```

### Entity Format

Each entity follows this pattern:

```
#ID = ENTITY_NAME(attribute1, attribute2, ...);
```

**Examples:**
```step
#1 = CARTESIAN_POINT('origin', (0., 0., 0.));
#2 = DIRECTION('up', (0., 0., 1.));
#3 = DIRECTION('right', (1., 0., 0.));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
```

### Reference System

Entities reference each other by ID:
- `#1` references entity with ID 1
- References can be forward or backward (entity #100 can reference #200)
- This means you can't stream-parse; must read entire file first

---

## BRep Entities in STEP

STEP entities map directly to BRep concepts:

### Geometry (Math/Points/Vectors)

| STEP Entity | BRep Concept | labrep Type |
|-------------|--------------|-------------|
| `CARTESIAN_POINT` | Point in 3D space | `Point3D` |
| `DIRECTION` | Unit vector | `Vector3D` (normalized) |
| `VECTOR` | Direction + magnitude | `Vector3D` |
| `AXIS1_PLACEMENT` | Point + direction | `Axis` |
| `AXIS2_PLACEMENT_3D` | Coordinate system | `Plane` / `Transform3D` |

### Curves

| STEP Entity | BRep Concept | labrep Type |
|-------------|--------------|-------------|
| `LINE` | Infinite line | `Line3D` |
| `CIRCLE` | Circle in 3D | `Circle3D` |
| `ELLIPSE` | Ellipse | `Ellipse3D` |
| `B_SPLINE_CURVE` | NURBS curve | (future) |
| `TRIMMED_CURVE` | Bounded curve | curve + parameter range |

### Surfaces

| STEP Entity | BRep Concept | labrep Type |
|-------------|--------------|-------------|
| `PLANE` | Infinite plane | `Plane` |
| `CYLINDRICAL_SURFACE` | Cylinder | `CylindricalSurface` |
| `CONICAL_SURFACE` | Cone | `ConicalSurface` |
| `SPHERICAL_SURFACE` | Sphere | `SphericalSurface` |
| `TOROIDAL_SURFACE` | Torus | `ToroidalSurface` |
| `B_SPLINE_SURFACE` | NURBS surface | (future) |

### Topology

| STEP Entity | BRep Concept | labrep Type |
|-------------|--------------|-------------|
| `VERTEX_POINT` | Vertex with location | `Vertex` |
| `EDGE_CURVE` | Edge with geometry | `Edge` |
| `ORIENTED_EDGE` | Edge with direction | `OrientedEdge` |
| `EDGE_LOOP` | Closed loop of edges | `Wire` / `Loop` |
| `FACE_BOUND` | Face boundary (loop) | part of `Face` |
| `ADVANCED_FACE` | Face with surface | `Face` |
| `CLOSED_SHELL` | Closed set of faces | `Shell` |
| `OPEN_SHELL` | Open set of faces | `Shell` (not closed) |
| `MANIFOLD_SOLID_BREP` | Solid body | `Solid` |

### Hierarchy

```
ADVANCED_BREP_SHAPE_REPRESENTATION
  └── MANIFOLD_SOLID_BREP
        └── CLOSED_SHELL
              └── ADVANCED_FACE (×6 for cube)
                    ├── FACE_BOUND
                    │     └── EDGE_LOOP
                    │           └── ORIENTED_EDGE (×4 for rect face)
                    │                 └── EDGE_CURVE
                    │                       ├── VERTEX_POINT (start)
                    │                       ├── VERTEX_POINT (end)
                    │                       └── LINE / CIRCLE / ...
                    └── PLANE (surface geometry)
```

---

## A Complete Example: Cube

Here's a simplified STEP file for a 2×2×2 cube centered at origin:

```step
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Cube example'),'2;1');
FILE_NAME('cube.stp','2024-01-01T12:00:00',(''),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;

/* Coordinate system at origin */
#10 = CARTESIAN_POINT('origin',(0.,0.,0.));
#11 = DIRECTION('z',(0.,0.,1.));
#12 = DIRECTION('x',(1.,0.,0.));
#13 = AXIS2_PLACEMENT_3D('',#10,#11,#12);

/* Top-level shape */
#14 = ADVANCED_BREP_SHAPE_REPRESENTATION('',(#13,#15),#100);
#15 = MANIFOLD_SOLID_BREP('cube',#16);
#16 = CLOSED_SHELL('',(#20,#30,#40,#50,#60,#70));

/* Vertices (8 corners) */
#1 = CARTESIAN_POINT('',(-1.,-1.,-1.));
#2 = CARTESIAN_POINT('',( 1.,-1.,-1.));
#3 = CARTESIAN_POINT('',( 1., 1.,-1.));
#4 = CARTESIAN_POINT('',(-1., 1.,-1.));
#5 = CARTESIAN_POINT('',(-1.,-1., 1.));
#6 = CARTESIAN_POINT('',( 1.,-1., 1.));
#7 = CARTESIAN_POINT('',( 1., 1., 1.));
#8 = CARTESIAN_POINT('',(-1., 1., 1.));

#V1 = VERTEX_POINT('',#1);
#V2 = VERTEX_POINT('',#2);
/* ... etc for all 8 vertices ... */

/* Edges (12 edges of cube) */
/* Each EDGE_CURVE references two vertices and a LINE */
#E1 = EDGE_CURVE('',#V1,#V2,#L1,.T.);
/* ... etc for all 12 edges ... */

/* Faces (6 faces) */
/* Each ADVANCED_FACE has an EDGE_LOOP and a PLANE */
#20 = ADVANCED_FACE('bottom',(#21),#25,.F.);
#21 = FACE_BOUND('',#22,.F.);
#22 = EDGE_LOOP('',(#OE1,#OE2,#OE3,#OE4));
#25 = PLANE('',#26);
/* ... etc for all 6 faces ... */

ENDSEC;
END-ISO-10303-21;
```

### Key Observations

1. **Verbose but structured** — A simple cube requires 100+ entities
2. **References everywhere** — Entities reference other entities by ID
3. **Geometry separate from topology** — `VERTEX_POINT` wraps `CARTESIAN_POINT`
4. **Multiple representations** — Edges store both 3D curve and 2D pcurves on adjacent faces
5. **Orientation explicit** — `.T.` and `.F.` indicate forward/reversed direction

---

## Application Protocols

Different APs support different features:

| AP | Name | Use Case |
|----|------|----------|
| **AP203** | Configuration Controlled 3D Design | Mechanical parts, no colors |
| **AP214** | Core Data for Automotive | Automotive, includes colors/layers |
| **AP242** | Managed Model-based 3D Engineering | Modern, PMI, tessellation |

### What They Support

```
┌─────────────────────────────────────────────────────────────────┐
│                    AP FEATURE COMPARISON                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Feature              AP203    AP214    AP242                   │
│  ────────────────────────────────────────────                   │
│  Solid BRep           ✓        ✓        ✓                      │
│  Surfaces             ✓        ✓        ✓                      │
│  Assemblies           ✓        ✓        ✓                      │
│  Colors               ✗        ✓        ✓                      │
│  Layers               ✗        ✓        ✓                      │
│  PMI (dimensions)     ✗        ✗        ✓                      │
│  Tessellation         ✗        ✗        ✓                      │
│  Validation props     ✗        ✗        ✓                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**For labrep:** Start with AP203 (simplest, widely supported). Add AP214 for colors later.

---

## Limitations and Gotchas

### Same Geometry, Many Encodings

The same triangle can be encoded multiple ways:
- `FACETED_BREP`
- `ADVANCED_FACE` with `POLY_LOOP`
- `MANIFOLD_SOLID_BREP` with full edge topology
- `SHELL_BASED_SURFACE_MODEL`

**Importers must handle all variants.**

### Forward References

Entity `#10` can reference `#200` that appears later in the file:

```step
#10 = EDGE_CURVE('',#20,#30,#40,.T.);  /* #20, #30, #40 defined later */
#20 = VERTEX_POINT('',#21);
...
```

**Consequence:** Can't stream-parse. Must read entire file into memory.

### Verbose for Simple Shapes

A cube requires ~345 entities in a full STEP file. The same cube in our API:

```typescript
const cube = makeBox(2, 2, 2);
```

**STEP is exchange format, not authoring format.**

### No History

STEP stores final geometry, not construction history:
- Can't tell it was created by "extrude then fillet"
- No parametric relationships preserved
- Just the final BRep

---

## Relevance to labrep

### API Alignment Principle

**Our internal types should map cleanly to STEP entities.**

| STEP | labrep | Mapping |
|------|--------|---------|
| `CARTESIAN_POINT` | `Point3D` | Direct |
| `DIRECTION` | `Vector3D` (unit) | Normalize on import |
| `AXIS2_PLACEMENT_3D` | `Plane` | Direct |
| `VERTEX_POINT` | `Vertex` | Direct |
| `EDGE_CURVE` | `Edge` | Direct |
| `EDGE_LOOP` | `Wire` | Direct |
| `ADVANCED_FACE` | `Face` | Direct |
| `CLOSED_SHELL` | `Shell` | Direct |
| `MANIFOLD_SOLID_BREP` | `Solid` | Direct |

**If we can't map cleanly, we have a design problem.**

### Import Strategy

```typescript
// Pseudo-code for STEP import
function importStep(stepFile: string): Solid[] {
  const entities = parseStepFile(stepFile);  // Parse all entities
  const resolved = resolveReferences(entities);  // Resolve #ID references
  
  // Build bottom-up: points → vertices → edges → faces → shells → solids
  const points = entities.filter(e => e.type === 'CARTESIAN_POINT')
    .map(e => new Point3D(e.coords[0], e.coords[1], e.coords[2]));
  
  // ... continue building topology ...
  
  return solids;
}
```

### Export Strategy

```typescript
// Pseudo-code for STEP export
function exportStep(solid: Solid): string {
  const entities: StepEntity[] = [];
  let nextId = 1;
  
  // Walk topology, create entities
  for (const vertex of solid.vertices) {
    const pointId = nextId++;
    entities.push({
      id: pointId,
      type: 'CARTESIAN_POINT',
      data: [vertex.point.x, vertex.point.y, vertex.point.z]
    });
    
    const vertexId = nextId++;
    entities.push({
      id: vertexId,
      type: 'VERTEX_POINT',
      data: [pointId]
    });
  }
  
  // ... continue for edges, faces, shell, solid ...
  
  return formatStepFile(entities);
}
```

### Design Implications

1. **Vertex contains Point3D** — Maps to `VERTEX_POINT` wrapping `CARTESIAN_POINT`

2. **Edge contains Curve + Vertices** — Maps to `EDGE_CURVE`

3. **Face contains Surface + Wires** — Maps to `ADVANCED_FACE` with `FACE_BOUND`s

4. **Separate geometry and topology** — STEP does this; we should too

5. **Orientation is separate** — `ORIENTED_EDGE` wraps `EDGE_CURVE` with direction

6. **Shell before Solid** — `CLOSED_SHELL` is a valid entity; solids wrap shells

---

## References

- **ISO 10303-21** — File format specification (paywalled)
- **Wikipedia: ISO 10303-21** — https://en.wikipedia.org/wiki/ISO_10303-21
- **STEP Tools** — https://www.steptools.com/stds/stp_aim/html/
- **OpenCASCADE STEP Guide** — https://dev.opencascade.org/doc/overview/html/occt_user_guides__step.html
- **CAx-IF** (implementer forum) — https://www.cax-if.org/
