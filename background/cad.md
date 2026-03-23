# CAD Overview

> A comprehensive reference on computer-aided design software — the workflow, major programs, operations, and file formats.

---

## Table of Contents

- [Overview](#overview)
- [The CAD Workflow](#the-cad-workflow)
- [Major CAD Programs](#major-cad-programs)
- [Geometric Kernels](#geometric-kernels)
- [Operations Catalog](#operations-catalog)
- [Import/Export Formats](#importexport-formats)
- [What Survives Translation](#what-survives-translation)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

Computer-Aided Design (CAD) software enables engineers, designers, and makers to create precise 2D and 3D models of physical objects. Modern CAD evolved from 2D drafting systems in the 1960s to today's parametric solid modelers that maintain full design intent and modification history.

The CAD landscape spans from heavyweight enterprise systems (CATIA, NX) costing tens of thousands of dollars per seat to free open-source alternatives (FreeCAD, OpenSCAD). Despite their differences, most follow similar paradigms:

- **Parametric modeling** — Dimensions and relationships drive the design
- **Feature-based** — Models are built from sequential operations (extrude, revolve, fillet)
- **History-based** — A timeline of operations that can be edited and replayed
- **Assembly-centric** — Parts compose into assemblies with defined relationships

---

## The CAD Workflow

Most CAD work follows a consistent progression:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TYPICAL CAD WORKFLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SKETCH                                                      │
│     └─► Create 2D profiles on planes or faces                   │
│         Lines, arcs, circles, splines, rectangles               │
│                                                                 │
│  2. CONSTRAIN                                                   │
│     └─► Add geometric and dimensional constraints               │
│         Horizontal, vertical, tangent, equal, parallel          │
│         Dimensions lock specific values                         │
│                                                                 │
│  3. EXTRUDE / REVOLVE                                           │
│     └─► Transform 2D sketch into 3D solid                       │
│         Extrude: push sketch along a path                       │
│         Revolve: spin sketch around an axis                     │
│                                                                 │
│  4. MODIFY                                                      │
│     └─► Refine the shape                                        │
│         Fillets, chamfers, shell, patterns, booleans            │
│                                                                 │
│  5. ASSEMBLE                                                    │
│     └─► Combine parts into assemblies                           │
│         Mates/joints define relationships                       │
│         Interference detection validates fit                    │
│                                                                 │
│  6. ANALYZE / OUTPUT                                            │
│     └─► Mass properties, drawings, export for manufacturing     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### The Sketch-Constrain-Extrude Pattern

This is the bread and butter of parametric CAD:

1. **Sketch** — Create a 2D profile. Start with raw geometry.
2. **Constrain** — Make the sketch "fully constrained" by adding:
   - Geometric constraints (parallel, perpendicular, tangent, concentric)
   - Dimensional constraints (lengths, angles, radii)
3. **Extrude** — Push the constrained profile into 3D space

A fully constrained sketch turns black (typically) — no degrees of freedom remain. Under-constrained sketches (blue) can shift unexpectedly when dimensions change.

### Direct Modeling vs. History-Based

**History-based (parametric):**
- Maintains a feature tree / timeline
- Edit an early feature → later features update
- Change a dimension → model rebuilds
- Industry standard for mechanical design

**Direct modeling:**
- Push/pull faces directly
- No history — edits are immediate
- Faster for conceptual work
- Harder to make systematic changes

Most modern CAD systems offer both modes.

---

## Major CAD Programs

### Commercial

| Software | Developer | Kernel | Market Position |
|----------|-----------|--------|-----------------|
| **SolidWorks** | Dassault | Parasolid | Industry standard for SMB mechanical design |
| **Fusion 360** | Autodesk | ShapeManager (ACIS-derived) | Cloud-native, popular with makers/startups |
| **Inventor** | Autodesk | ShapeManager (ACIS-derived) | Autodesk's traditional desktop CAD |
| **CATIA** | Dassault | CGM (proprietary) | Aerospace/automotive heavyweight |
| **Creo** | PTC | Granite (proprietary) | Enterprise, formerly Pro/ENGINEER |
| **NX** | Siemens | Parasolid | High-end enterprise, aerospace/automotive |
| **Solid Edge** | Siemens | Parasolid | Mid-range, synchronous technology |
| **Onshape** | PTC | Parasolid | Cloud-native SaaS, no install |

#### SolidWorks
The most widely used mechanical CAD globally. Known for intuitive UI, huge ecosystem of add-ons, and strong community. Runs only on Windows. Uses Parasolid kernel and D-Cubed constraint solver (both from Siemens). Standard for manufacturing, product design, mechanical engineering education.

#### Fusion 360
Autodesk's cloud-connected modeler. Combines CAD, CAM, simulation, and rendering. Uses ShapeManager kernel (Autodesk's fork of ACIS 7.0) plus T-Splines for organic modeling. Free tier for hobbyists/startups. Data lives in Autodesk cloud by default.

#### Inventor
Autodesk's traditional parametric modeler. Competes with SolidWorks. Uses ShapeManager kernel. Desktop-focused with better PLM integration than Fusion 360. Part of Autodesk's Product Design & Manufacturing Collection.

#### CATIA
Dassault Systèmes' flagship. Uses their proprietary CGM (Convergence Geometric Modeler) kernel. Industry standard for aerospace (Boeing, Airbus) and automotive (most major OEMs). Extremely powerful surface modeling. Complex, expensive, steep learning curve.

#### Creo
PTC's flagship (formerly Pro/ENGINEER). Uses PTC's proprietary Granite kernel, developed since 1985. Strong in enterprise/manufacturing. Known for robust parametric capabilities. Includes Creo Parametric, Creo Direct, Creo Simulate, and other modules.

#### NX (formerly Unigraphics)
Siemens' high-end system. Uses Parasolid (which Siemens owns). Comprehensive: CAD, CAM, CAE, PLM integration. Popular in aerospace, automotive, machinery. Powerful synchronous technology for direct modeling.

#### Solid Edge
Siemens' mid-market offering. Also uses Parasolid. Pioneer of "synchronous technology" (blending direct and parametric). More accessible than NX, positioned against SolidWorks.

#### Onshape
Cloud-native SaaS CAD, no local install. Founded by ex-SolidWorks team, now owned by PTC. Uses Parasolid kernel and D-Cubed solver (like SolidWorks). Built-in version control, real-time collaboration. All computation happens server-side.

### Open Source

| Software | Kernel | Approach |
|----------|--------|----------|
| **FreeCAD** | OpenCASCADE (OCCT) | Traditional parametric, workbench-based |
| **OpenSCAD** | CGAL (mesh) + Manifold | Programmatic/script-based CSG |
| **BRL-CAD** | Custom (librt) | CSG-focused, military heritage |
| **Solvespace** | Custom | Lightweight constraint-based |

#### FreeCAD
The most feature-complete open-source parametric CAD. Built on OpenCASCADE Technology (OCCT) kernel. Modular "workbench" architecture: Part Design, Sketcher, Assembly, FEM, CAM, etc. Python-scriptable. Active development. Known quirk: the "topological naming problem" can break models when sketch order changes (being addressed in v1.0).

#### OpenSCAD
Unique code-first approach — models are defined in a C-like scripting language. Uses CGAL for geometry operations (recently added Manifold for faster rendering). Pure CSG: primitives + boolean operations. No interactive manipulation. Beloved by programmers. Excellent for parametric designs that need programmatic generation.

```openscad
// OpenSCAD example
difference() {
    cube([10, 10, 10]);
    cylinder(r=3, h=12, center=true);
}
```

#### BRL-CAD
One of the oldest open-source CAD systems (started 1979 at US Army). Custom kernel focused on CSG and ray-tracing. Used for military/ballistic analysis. Large codebase, steep learning curve. Not aimed at typical mechanical design.

#### Solvespace
Lightweight, fast 2D/3D parametric CAD. Custom constraint solver and geometry engine. Single executable, ~6MB. Supports STEP export. Limited feature set compared to FreeCAD but much simpler. Good for simpler mechanical parts.

---

## Geometric Kernels

The **geometric kernel** (or modeling kernel) is the mathematical engine that represents and manipulates 3D geometry. It handles:

- Representing curves, surfaces, and solids (BRep)
- Boolean operations (union, intersection, subtraction)
- Filleting, chamfering, shelling
- Surface/surface intersection
- Tolerance handling
- Import/export of geometry

```
┌─────────────────────────────────────────────────────────────────┐
│                     KERNEL LANDSCAPE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  COMMERCIAL KERNELS                                             │
│  ──────────────────                                             │
│                                                                 │
│  Parasolid ─────► Siemens                                       │
│                   └─► Used by: SolidWorks, NX, Solid Edge,      │
│                       Onshape, many others                      │
│                   └─► Market leader, excellent booleans         │
│                                                                 │
│  ACIS ──────────► Spatial (Dassault)                            │
│                   └─► Used by: SpaceClaim, many CAM systems     │
│                   └─► More surface types than Parasolid         │
│                                                                 │
│  ShapeManager ──► Autodesk (internal, ACIS 7.0 fork)            │
│                   └─► Used by: Inventor, Fusion 360, AutoCAD    │
│                                                                 │
│  CGM ───────────► Dassault (internal)                           │
│                   └─► Used by: CATIA, 3DEXPERIENCE              │
│                   └─► "Convergence Geometric Modeler"           │
│                                                                 │
│  Granite ───────► PTC (internal)                                │
│                   └─► Used by: Creo                             │
│                   └─► In development since 1985                 │
│                                                                 │
│  OPEN SOURCE                                                    │
│  ───────────                                                    │
│                                                                 │
│  OpenCASCADE ───► Open CASCADE SAS (dual license)               │
│                   └─► Used by: FreeCAD, CadQuery, Analysis Situs│
│                   └─► Most complete open-source BRep kernel     │
│                                                                 │
│  CGAL ──────────► Open source (academic origins)                │
│                   └─► Used by: OpenSCAD                         │
│                   └─► Computational geometry, mesh operations   │
│                                                                 │
│  Custom ────────► BRL-CAD (librt), Solvespace                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Kernel vs. CAD Software

The kernel is the math engine; the CAD software provides UI, feature tree, sketcher, assemblies, drawings, etc. Multiple CAD programs can share the same kernel:

- **Parasolid**: SolidWorks, NX, Solid Edge, Onshape, Shapr3D, SketchUp (3D Warehouse)
- **ShapeManager**: Inventor, Fusion 360, AutoCAD 3D
- **OCCT**: FreeCAD, CadQuery, BRL-CAD (partial), IFCOpenShell

---

## Operations Catalog

### Essential Operations

These operations exist in virtually every parametric CAD system:

#### Sketch Operations
| Operation | Description |
|-----------|-------------|
| **Line** | Straight line between two points |
| **Arc** | Circular arc (3-point, center-radius, tangent) |
| **Circle** | Full circle by center and radius |
| **Rectangle** | 2-corner or center rectangle |
| **Spline** | Free-form curve through control points |
| **Offset** | Parallel copy of existing sketch geometry |
| **Trim/Extend** | Cut or lengthen sketch entities to intersections |
| **Mirror** | Reflect sketch geometry across a line |
| **Pattern** | Linear or circular array of sketch elements |

#### Sketch Constraints
| Constraint | Description |
|------------|-------------|
| **Horizontal/Vertical** | Lock line orientation |
| **Parallel/Perpendicular** | Relate two lines |
| **Tangent** | Smooth transition between curves |
| **Concentric** | Shared center for circles/arcs |
| **Equal** | Same length or radius |
| **Coincident** | Point lies on line/curve |
| **Fix** | Lock point in absolute position |
| **Dimension** | Explicit numeric constraint |

#### 3D Operations (Feature Creation)
| Operation | Description |
|-----------|-------------|
| **Extrude** | Push sketch profile along a direction |
| **Revolve** | Spin sketch around an axis |
| **Sweep** | Move profile along a path curve |
| **Loft** | Blend between multiple profiles |

#### Boolean Operations
| Operation | Description |
|-----------|-------------|
| **Union / Add** | Combine two bodies |
| **Subtract / Cut** | Remove one body from another |
| **Intersect** | Keep only overlapping volume |

#### Modification Operations
| Operation | Description |
|-----------|-------------|
| **Fillet** | Round edges with specified radius |
| **Chamfer** | Bevel edges at angle or distance |
| **Shell** | Hollow out solid, leaving wall thickness |
| **Draft** | Taper faces for mold release |
| **Pattern** | Linear/circular array of features |
| **Mirror** | Reflect features across a plane |

### Advanced Operations

Found in professional systems, may require specific workbenches or modules:

| Operation | Description |
|-----------|-------------|
| **Variable fillet** | Radius changes along edge |
| **Face blend** | Fillet with face-pair selection |
| **Multi-section loft** | Guide curves control shape between profiles |
| **Boundary fill** | Create surface/solid from edge boundaries |
| **Thicken** | Turn surface into solid with offset |
| **Split body** | Divide solid with surface or plane |
| **Wrap/Emboss** | Project 2D onto curved surface |
| **Deform/Flex** | Bend, twist, or taper bodies |
| **Direct edit** | Push/pull faces without feature history |

### Specialized Operations

Domain-specific, often in premium modules:

| Operation | Domain | Description |
|-----------|--------|-------------|
| **Sheet metal bend** | Manufacturing | Add flanges, bends, flat pattern |
| **Weldment** | Manufacturing | Structural frame members |
| **Mold tools** | Manufacturing | Parting lines, core/cavity split |
| **Surfacing** | Industrial design | G2/G3 continuous surfaces |
| **Generative design** | Optimization | AI-driven topology optimization |
| **T-Splines/SubD** | Organic modeling | Smooth subdivision surfaces |

### Assembly Operations

| Operation | Description |
|-----------|-------------|
| **Mate/Joint** | Define relationship between parts (coincident, concentric, distance, angle) |
| **Ground** | Fix part in space |
| **Motion link** | Gear, rack-pinion, cam relationships |
| **Flexible component** | Allow internal DoF in assembly context |

### Analysis Operations

| Operation | Description |
|-----------|-------------|
| **Mass properties** | Volume, surface area, center of mass, moments of inertia |
| **Interference detection** | Find collisions between parts |
| **Draft analysis** | Color-map faces by draft angle |
| **Curvature analysis** | Visualize surface continuity |
| **Section view** | Cut model with plane to see interior |
| **Measure** | Distance, angle, radius queries |

---

## Import/Export Formats

### Native Formats

Each CAD system has proprietary formats optimized for its feature set:

| Software | Part Extension | Assembly Extension | Notes |
|----------|----------------|-------------------|-------|
| SolidWorks | `.sldprt` | `.sldasm` | Binary, includes feature tree |
| Fusion 360 | `.f3d` / `.f3z` | (same) | Cloud-stored, .f3z is archive |
| Inventor | `.ipt` | `.iam` | Plus `.idw` for drawings |
| CATIA | `.CATPart` | `.CATProduct` | V4/V5/V6 have different formats |
| Creo | `.prt` | `.asm` | Plus `.drw` for drawings |
| NX | `.prt` | (same) | Single file for parts and assemblies |
| Solid Edge | `.par` | `.asm` | Plus `.dft` for drawings |
| FreeCAD | `.FCStd` | (same) | Zipped XML + BRep |
| OpenSCAD | `.scad` | (same) | Plain text script |

### Exchange Formats (Neutral)

For sharing between different CAD systems:

| Format | Extension | Description |
|--------|-----------|-------------|
| **STEP** | `.step`, `.stp` | ISO 10303 — the standard for BRep exchange. AP203 for geometry, AP214 for automotive, AP242 for PMI/MBD |
| **IGES** | `.iges`, `.igs` | Legacy (1996), still common. Surfaces, limited solids |
| **Parasolid** | `.x_t`, `.x_b` | Native Parasolid format. Text (.x_t) or binary (.x_b) |
| **ACIS** | `.sat`, `.sab` | Native ACIS format. Text (.sat) or binary (.sab) |
| **JT** | `.jt` | Siemens visualization format, includes BRep option |
| **3DXML** | `.3dxml` | Dassault lightweight format |

### Mesh Formats

For visualization, 3D printing, rendering (no BRep precision):

| Format | Extension | Description |
|--------|-----------|-------------|
| **STL** | `.stl` | Triangulated surface. Universal but loses precision. ASCII or binary |
| **OBJ** | `.obj` | Wavefront. Triangles/quads, optional materials/textures |
| **3MF** | `.3mf` | Modern STL replacement. Colors, materials, units, multiple objects |
| **PLY** | `.ply` | Stanford polygon format. Good for scans |
| **GLTF/GLB** | `.gltf`, `.glb` | Web/realtime 3D. Materials, animations |
| **FBX** | `.fbx` | Autodesk interchange. Animation, materials |

---

## What Survives Translation

When moving between CAD systems or formats, data fidelity varies:

```
┌─────────────────────────────────────────────────────────────────┐
│                WHAT SURVIVES TRANSLATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ ALWAYS SURVIVES (via STEP/Parasolid/ACIS)                   │
│  ─────────────────────────────────────────────                  │
│  • Final 3D geometry (BRep: faces, edges, vertices)             │
│  • Surface/curve mathematics (planes, cylinders, NURBS)         │
│  • Assembly structure (which parts, positions)                  │
│  • Basic colors/appearance                                      │
│                                                                 │
│  ⚠️  SOMETIMES SURVIVES                                         │
│  ───────────────────                                            │
│  • PMI (dimensions, tolerances) — STEP AP242 only               │
│  • Part names and metadata                                      │
│  • Layer/group organization                                     │
│  • Construction geometry (reference planes, axes)               │
│                                                                 │
│  ❌ NEVER SURVIVES (neutral formats)                            │
│  ─────────────────────────────────                              │
│  • Feature tree / parametric history                            │
│  • Sketch constraints and dimensions                            │
│  • Design intent (why was this fillet 3mm?)                     │
│  • Custom features and macros                                   │
│  • In-context assembly references                               │
│  • Simulation/analysis setup                                    │
│                                                                 │
│  📉 MESH FORMATS (STL, OBJ) LOSE EVEN MORE                      │
│  ──────────────────────────────────────────                     │
│  • Exact geometry → approximated triangles                      │
│  • Curved surfaces → faceted representation                     │
│  • Topology structure (which face is which)                     │
│  • Hole vs. outer boundary distinction                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Translation Hierarchy (Best to Worst)

1. **Native format** — Everything preserved, but vendor lock-in
2. **Kernel format** (Parasolid ↔ Parasolid apps) — Near-perfect geometry
3. **STEP AP242** — Best neutral format, includes PMI
4. **STEP AP203/214** — Geometry and assembly, no PMI
5. **IGES** — Legacy, surface-focused, occasionally lossy
6. **Mesh** — Approximation only, no editability

### Practical Advice

- **Same kernel?** Use kernel format (Parasolid x_t between SW/NX/SE/Onshape)
- **Different kernels?** STEP is safest neutral choice
- **For 3D printing?** 3MF preferred over STL (units, colors, multiple bodies)
- **Need parametrics?** There is no neutral parametric format — recreate features manually or use direct modeling

---

## Relevance to labrep

Understanding the CAD landscape helps position labrep:

### What Commercial Systems Offer

- Mature, well-tested geometric kernels (Parasolid, ACIS)
- Comprehensive feature trees with robust parametric updates
- Professional constraint solvers (D-Cubed)
- Decades of edge-case handling

### What Open Source Provides

- OpenCASCADE: Most complete open-source BRep kernel
- FreeCAD: Feature-rich but complexity/stability tradeoffs
- OpenSCAD: Proves programmatic CAD is viable
- Solvespace: Shows custom kernels can work for focused scope

### labrep's Position

Building on OCCT provides:
- Full BRep capability (see `brep-fundamentals.md`)
- Robust STEP/IGES import/export
- Boolean operations (see `boolean-operations.md`)
- NURBS mathematics (see `nurbs-mathematics.md`)

Key challenges for any new CAD implementation:
- Topological naming stability
- Robust constraint solving
- Feature tree dependency management
- Tolerance handling across operations

---

## References

### Kernel Documentation

- [Parasolid Technical Overview](https://www.plm.automation.siemens.com/global/en/products/plm-components/parasolid.html)
- [ACIS 3D Modeler](https://www.spatial.com/products/3d-acis-modeling)
- [OpenCASCADE Documentation](https://dev.opencascade.org/doc/overview/html/)

### File Format Standards

- [ISO 10303 (STEP)](https://www.iso.org/standard/72167.html)
- [3MF Specification](https://3mf.io/specification/)
- [IGES 5.3](https://www.nist.gov/services-resources/software/iges-50-iges-files-and-applications)

### CAD Comparison Resources

- [CAD Software Comparison (Shapr3D)](https://www.shapr3d.com/content-library/cad-software-comparison-2025-complete-analysis-of-11-leading-platforms-for-manufacturing)
- [Wikipedia: Geometric Modeling Kernel](https://en.wikipedia.org/wiki/Geometric_modeling_kernel)
- [CAD Interoperability Guide](https://www.cadinterop.com/)

### Related Background Files

- `brep-fundamentals.md` — Core BRep concepts
- `boolean-operations.md` — Union, intersection, subtraction
- `nurbs-mathematics.md` — NURBS curves and surfaces
- `step-format.md` — STEP file format details
- `opencascade-architecture.md` — OCCT internals
