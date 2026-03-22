# OpenCASCADE Architecture

> Understanding OCCT's structure so we can reference it effectively when building labrep.

---

## Table of Contents

- [Overview](#overview)
- [History](#history)
- [Module Organization](#module-organization)
- [The Foundation Layer](#the-foundation-layer)
- [The Modeling Data Layer](#the-modeling-data-layer)
- [The Modeling Algorithms Layer](#the-modeling-algorithms-layer)
- [Code Conventions](#code-conventions)
- [The Handle System](#the-handle-system)
- [Navigating the Source](#navigating-the-source)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

OpenCASCADE Technology (OCCT) is a 3.6 million line C++ codebase that has evolved since the 1990s. It's organized into **modules**, which contain **toolkits**, which contain **packages**, which contain **classes**.

Understanding this organization is essential for using OCCT as a reference. When we're stuck on a problem, we need to know where to look.

```
┌─────────────────────────────────────────────────────────────────┐
│                    OCCT ORGANIZATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Module ────────► A major functional area                       │
│     │             (e.g., ModelingData, ModelingAlgorithms)      │
│     ▼                                                           │
│  Toolkit ───────► A library (.dll / .so)                        │
│     │             (e.g., TKGeomBase, TKBRep)                    │
│     ▼                                                           │
│  Package ───────► A namespace/folder of related classes         │
│     │             (e.g., gp, Geom, TopoDS, BRep)                │
│     ▼                                                           │
│  Class ─────────► Individual C++ class                          │
│                   (e.g., gp_Pnt, Geom_Line, TopoDS_Edge)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## History

Understanding OCCT's history explains some of its quirks:

| Year | Event |
|------|-------|
| 1980s | Matra Datavision develops CAS.CADE (internal CAD kernel) |
| 1999 | Released as open source "Open CASCADE" |
| 2000s | Community grows, used in FreeCAD, many research projects |
| 2011 | Renamed to "Open CASCADE Technology" (OCCT) |
| 2014 | Moved to GitHub |
| Present | Version 7.x, actively maintained by Open Cascade SAS |

**Why this matters:** OCCT predates modern C++. You'll see:
- Custom smart pointers (Handles) instead of std::shared_ptr
- Custom collections instead of STL containers
- Naming conventions from 1980s C++ practices
- Some code unchanged since initial release

---

## Module Organization

OCCT has seven modules:

```
┌─────────────────────────────────────────────────────────────────┐
│                      OCCT MODULES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Application Framework                │    │
│  │  OCAF, XDE — Document structure, assemblies, metadata   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Data Exchange                       │    │
│  │  STEP, IGES, STL, OBJ — File format I/O                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Visualization                       │    │
│  │  AIS, V3d — 3D display, selection, rendering            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Modeling Algorithms                    │    │
│  │  BRepAlgoAPI, BRepBuilderAPI — Booleans, fillets, etc.  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Modeling Data                       │    │
│  │  gp, Geom, TopoDS, BRep — Core geometry and topology    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      Foundation                         │    │
│  │  Standard, TCollection — Basic types, collections       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Lower modules depend on higher. Foundation is at the bottom.   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Module Details

| Module | Purpose | Key Packages |
|--------|---------|--------------|
| **Foundation** | Basic infrastructure | Standard, TCollection, NCollection |
| **Modeling Data** | Geometry and topology | gp, Geom, Geom2d, TopoDS, BRep |
| **Modeling Algorithms** | Shape operations | BRepBuilderAPI, BRepAlgoAPI, BRepFilletAPI |
| **Visualization** | 3D display | AIS, V3d, Graphic3d |
| **Data Exchange** | File formats | STEPControl, IGESControl, StlAPI |
| **Application Framework** | Document management | OCAF, TDocStd, XDE |

**For labrep, we primarily care about:**
- Foundation (understanding OCCT's types)
- Modeling Data (geometry and topology)
- Modeling Algorithms (when implementing operations)

---

## The Foundation Layer

### Standard Package

Basic types and memory management:

```cpp
// Basic types (src/Standard/)
Standard_Integer   // int
Standard_Real      // double
Standard_Boolean   // bool
Standard_CString   // const char*

// Smart pointer base class
Standard_Transient // Base for reference-counted objects
```

### Collection Packages

OCCT has its own collections (predating STL):

```cpp
// TCollection — older, based on Handle
TCollection_AsciiString  // String type
TColStd_Array1OfReal     // Fixed-size array of doubles

// NCollection — newer, template-based
NCollection_Array1<T>    // Template array
NCollection_List<T>      // Template list
NCollection_Map<K,V>     // Template map
```

**For labrep:** We'll use standard TypeScript/JavaScript collections. This is an area where we improve on OCCT.

---

## The Modeling Data Layer

This is the core of OCCT and most relevant to labrep.

### gp Package — Basic Geometry

The `gp` package contains simple geometric types (not reference-counted):

```cpp
// Points and vectors (src/gp/)
gp_Pnt    // 3D point (x, y, z)
gp_Vec    // 3D vector
gp_Dir    // Unit vector (normalized)
gp_Pnt2d  // 2D point
gp_Vec2d  // 2D vector

// Transforms
gp_Trsf   // 3D transformation (rotation, translation, scale)
gp_Ax1    // Axis (point + direction)
gp_Ax2    // Coordinate system (point + 2 directions)
gp_Ax3    // Full coordinate system (point + 3 directions)

// Analytic geometry
gp_Lin    // Infinite line
gp_Circ   // Circle
gp_Pln    // Plane
gp_Cylinder // Cylinder
gp_Cone   // Cone
gp_Sphere // Sphere
gp_Torus  // Torus
```

**Key insight:** `gp` classes are lightweight values, not Handles. They're copied, not reference-counted.

### Geom Package — Curves and Surfaces

The `Geom` package contains bounded geometric entities:

```cpp
// Curves (src/Geom/)
Geom_Curve        // Abstract base
Geom_Line         // Infinite line
Geom_Circle       // Circle
Geom_Ellipse      // Ellipse
Geom_BSplineCurve // NURBS curve
Geom_TrimmedCurve // Bounded portion of another curve

// Surfaces
Geom_Surface       // Abstract base
Geom_Plane         // Plane
Geom_CylindricalSurface
Geom_ConicalSurface
Geom_SphericalSurface
Geom_ToroidalSurface
Geom_BSplineSurface // NURBS surface
```

**Key methods on curves:**

```cpp
// Evaluation
gp_Pnt Value(Standard_Real U);           // Point at parameter U
void D1(Standard_Real U, gp_Pnt& P, gp_Vec& V1);  // Point + 1st derivative
void D2(...);                             // Point + 1st + 2nd derivatives

// Properties
Standard_Real FirstParameter();
Standard_Real LastParameter();
Standard_Boolean IsClosed();
```

### Geom2d Package — 2D Geometry

Same structure as Geom, but for 2D:

```cpp
Geom2d_Curve
Geom2d_Line
Geom2d_Circle
Geom2d_BSplineCurve
```

Used for: sketch geometry, pcurves (curves in surface parameter space).

### TopoDS Package — Abstract Topology

The `TopoDS` package defines topology without geometry:

```cpp
// Base class (src/TopoDS/)
TopoDS_Shape    // Abstract shape — any of the below

// Specific types
TopoDS_Vertex   // 0D — point
TopoDS_Edge     // 1D — curve segment
TopoDS_Wire     // 1D — sequence of edges
TopoDS_Face     // 2D — bounded surface
TopoDS_Shell    // 2D — set of faces
TopoDS_Solid    // 3D — volume
TopoDS_CompSolid // 3D — solids sharing faces
TopoDS_Compound // Collection of anything
```

**TopoDS shapes are lightweight wrappers.** They point to shared internal data.

### BRep Package — Topology + Geometry

The `BRep` package adds geometry to topology:

```cpp
// Access geometry from topology (src/BRep/)
BRep_Tool::Pnt(TopoDS_Vertex)      // Get point from vertex
BRep_Tool::Curve(TopoDS_Edge, ...) // Get curve from edge
BRep_Tool::Surface(TopoDS_Face)    // Get surface from face

// Build topology with geometry
BRep_Builder builder;
builder.MakeVertex(vertex, point, tolerance);
builder.MakeEdge(edge, curve, tolerance);
builder.MakeFace(face, surface, tolerance);
```

### TopExp Package — Topology Exploration

```cpp
// Iterate over sub-shapes
TopExp_Explorer exp(solid, TopAbs_FACE);
for (; exp.More(); exp.Next()) {
    TopoDS_Face face = TopoDS::Face(exp.Current());
    // process face
}

// Get all edges of a shape
TopTools_IndexedMapOfShape edges;
TopExp::MapShapes(solid, TopAbs_EDGE, edges);
```

---

## The Modeling Algorithms Layer

### BRepBuilderAPI — High-Level Construction

```cpp
// Create primitives (src/BRepBuilderAPI/)
BRepBuilderAPI_MakeVertex  // Point → Vertex
BRepBuilderAPI_MakeEdge    // Curve → Edge
BRepBuilderAPI_MakeFace    // Surface → Face
BRepBuilderAPI_MakeWire    // Edges → Wire
BRepBuilderAPI_MakeShell   // Faces → Shell
BRepBuilderAPI_MakeSolid   // Shell → Solid

// Transforms
BRepBuilderAPI_Transform   // Apply transformation
BRepBuilderAPI_Copy        // Deep copy
```

### BRepPrimAPI — Primitives

```cpp
// src/BRepPrimAPI/
BRepPrimAPI_MakeBox        // Box
BRepPrimAPI_MakeCylinder   // Cylinder
BRepPrimAPI_MakeCone       // Cone
BRepPrimAPI_MakeSphere     // Sphere
BRepPrimAPI_MakeTorus      // Torus
BRepPrimAPI_MakePrism      // Extrude profile
BRepPrimAPI_MakeRevol      // Revolve profile
```

### BRepAlgoAPI — Boolean Operations

```cpp
// src/BRepAlgoAPI/
BRepAlgoAPI_Fuse    // Union
BRepAlgoAPI_Cut     // Subtract
BRepAlgoAPI_Common  // Intersect
BRepAlgoAPI_Section // Intersection curves
```

### BRepFilletAPI — Fillets and Chamfers

```cpp
// src/BRepFilletAPI/
BRepFilletAPI_MakeFillet   // Round edges
BRepFilletAPI_MakeChamfer  // Bevel edges
```

---

## Code Conventions

### Naming

```cpp
// Package_Class
gp_Pnt              // gp package, Pnt class
TopoDS_Edge         // TopoDS package, Edge class
BRepBuilderAPI_MakeEdge

// File names
gp_Pnt.hxx         // Header
gp_Pnt.cxx         // Implementation (rare for gp)

// Method names
Standard_Real FirstParameter();  // Query
void SetFirstParameter(...);     // Mutator
Standard_Boolean IsClosed();     // Boolean query
```

### File Extensions

| Extension | Meaning |
|-----------|---------|
| `.hxx` | Header file (declarations) |
| `.cxx` | Implementation file |
| `.lxx` | Inline implementation (included by .hxx) |
| `.gxx` | Generic (template-like) implementation |

---

## The Handle System

OCCT uses "Handles" — reference-counted smart pointers from before `std::shared_ptr`:

```cpp
// A Handle is a smart pointer
Handle(Geom_Curve) curve = new Geom_BSplineCurve(...);

// Reference counting
Handle(Geom_Curve) curve2 = curve;  // Shares ownership
curve.Nullify();                     // Release one reference
// curve2 still valid

// Downcasting
Handle(Geom_BSplineCurve) bspline = Handle(Geom_BSplineCurve)::DownCast(curve);
if (!bspline.IsNull()) {
    // Safe to use as BSpline
}
```

**Why Handles exist:** OCCT predates C++11. Handles provide reference counting and safe downcasting.

**For labrep:** We'll use standard TypeScript objects. No need for custom reference counting — JavaScript has garbage collection.

---

## Navigating the Source

### File Layout

```
opencascade/
├── src/
│   ├── gp/                    # Basic geometry
│   │   ├── gp_Pnt.hxx
│   │   ├── gp_Pnt.cxx
│   │   └── ...
│   ├── Geom/                  # Curves and surfaces
│   ├── TopoDS/                # Abstract topology
│   ├── BRep/                  # Topology + geometry
│   ├── BRepBuilderAPI/        # High-level construction
│   ├── BRepAlgoAPI/           # Booleans
│   └── ...
├── inc/                       # Some headers also here
└── CMakeLists.txt
```

### Finding Things

```bash
# Find where a class is defined
find library/opencascade/src -name "TopoDS_Edge*"

# Search for a method implementation
grep -r "BRep_Builder::MakeEdge" library/opencascade/src/

# Find all uses of a function
grep -rn "BRepAlgoAPI_Fuse" library/opencascade/src/
```

### Reading Order for a Topic

1. **Header file** (.hxx) — See the public API
2. **Implementation** (.cxx) — See how it works
3. **Tests** — OCCT has tests in `tests/` that show usage

---

## Relevance to labrep

### What We Take from OCCT

| OCCT Concept | labrep Approach |
|--------------|-----------------|
| Topology/Geometry separation | Keep it — fundamental |
| Handle system | Drop it — use JS garbage collection |
| gp types (Pnt, Vec, Trsf) | Reimplement in TypeScript |
| Geom classes | Reimplement simplified versions |
| TopoDS structure | Reimplement with our hierarchy |
| BRep binding | Reimplement |
| BRepBuilderAPI | Reference for algorithms |
| BRepAlgoAPI | Reference for booleans |

### Key Files to Reference

| When implementing... | Look at... |
|---------------------|------------|
| Points, vectors | `src/gp/gp_Pnt.cxx`, `gp_Vec.cxx` |
| Transformations | `src/gp/gp_Trsf.cxx` |
| Line geometry | `src/Geom/Geom_Line.cxx` |
| Circle geometry | `src/Geom/Geom_Circle.cxx` |
| NURBS curves | `src/Geom/Geom_BSplineCurve.cxx` |
| Topology structure | `src/TopoDS/TopoDS_Shape.cxx` |
| Building vertices | `src/BRep/BRep_Builder.cxx` |
| Making boxes | `src/BRepPrimAPI/BRepPrimAPI_MakeBox.cxx` |
| Booleans | `src/BRepAlgoAPI/BRepAlgoAPI_BooleanOperation.cxx` |

### Patterns to Copy

1. **Separation of concerns** — Keep topology and geometry separate
2. **Builder pattern** — Use builders for complex construction
3. **Tolerance propagation** — Track tolerances through operations
4. **Validation** — Validate topology consistency

### Patterns to Avoid

1. **Handle system** — Use standard references
2. **Custom collections** — Use standard arrays/maps
3. **Complex inheritance** — Keep class hierarchies simple
4. **Macro magic** — Write plain, readable code

---

## References

### Official OCCT

- [OCCT Documentation Portal](https://dev.opencascade.org/doc/overview/html/)
- [OCCT GitHub Repository](https://github.com/Open-Cascade-SAS/OCCT)
- [OCCT Modeling Data Guide](https://dev.opencascade.org/doc/overview/html/occt_user_guides__modeling_data.html)
- [OCCT Modeling Algorithms Guide](https://dev.opencascade.org/doc/overview/html/occt_user_guides__modeling_algos.html)

### Community Resources

- [Open CASCADE Blog](https://opencascade.blogspot.com/) — Technical deep dives
- [Open CASCADE Forum](https://dev.opencascade.org/forums) — Q&A

### Wrappers and Bindings

- [pythonOCC](https://github.com/tpaviot/pythonocc-core) — Python bindings
- [opencascade-rs](https://github.com/bschwind/opencascade-rs) — Rust bindings
- [CadQuery](https://github.com/CadQuery/cadquery) — Pythonic API on OCCT

### Local Reference

- `library/opencascade/src/` — The actual source code
