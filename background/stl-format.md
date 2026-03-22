# STL File Format

> The simplest 3D file format — a flat list of triangles — and the primary export target for 3D printing from labrep.

---

## Table of Contents

- [Overview](#overview)
- [Why STL Matters](#why-stl-matters)
- [ASCII Format](#ascii-format)
- [Binary Format](#binary-format)
- [Format Comparison: ASCII vs Binary](#format-comparison-ascii-vs-binary)
- [What STL Does NOT Store](#what-stl-does-not-store)
- [Normal Vectors](#normal-vectors)
- [Common Problems](#common-problems)
- [STL in OpenCASCADE](#stl-in-opencascade)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

STL (STereoLithography, or Standard Tessellation Language) is the most widely used format for 3D printing and rapid prototyping. Created by 3D Systems in 1987 for their stereolithography machines, it has become the de facto standard for mesh-based geometry exchange.

An STL file describes a 3D surface as an unstructured collection of triangles. Each triangle is defined by three vertices and a normal vector. There is no topology — no edges, no faces, no connectivity information. Two triangles that share a geometric edge simply happen to have two vertices at the same coordinates; there is no explicit record of the relationship.

Despite its limitations, STL endures because of its extreme simplicity. Any system that can produce triangulated meshes can write STL files. Any system that can render triangles can read them. This makes STL the "lowest common denominator" of 3D file formats.

---

## Why STL Matters

### 3D Printing

STL is the primary input format for virtually every slicer:

- Cura, PrusaSlicer, OrcaSlicer
- Formlabs PreForm
- Bambu Studio
- Industrial SLS/SLA/DMLS machines

**Every 3D-printable model passes through STL** (or its successors 3MF/AMF, which are still triangle meshes at their core).

### Visualization and Rendering

STL maps directly to GPU triangle buffers:

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ STL file │────►│ vertex array │────►│ GPU renders  │
│ (tris)   │     │ + normals    │     │ triangles    │
└──────────┘     └──────────────┘     └──────────────┘
```

No complex parsing, no topology construction — just load vertices and draw.

### Simplicity

The entire ASCII format can be described in 6 lines of grammar. The binary format is a fixed-size header plus packed structs. A working STL writer can be implemented in under 50 lines of code.

---

## ASCII Format

An ASCII STL file is plain text:

```
solid name
  facet normal ni nj nk
    outer loop
      vertex v1x v1y v1z
      vertex v2x v2y v2z
      vertex v3x v3y v3z
    endloop
  endfacet
  facet normal ni nj nk
    outer loop
      vertex v1x v1y v1z
      vertex v2x v2y v2z
      vertex v3x v3y v3z
    endloop
  endfacet
  ...
endsolid name
```

### Concrete Example: A Single Triangle

```
solid triangle
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid triangle
```

### Concrete Example: A Tetrahedron (4 Faces)

```
solid tetrahedron
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0.5 0.866 0
    endloop
  endfacet
  facet normal 0 -0.471 0.882
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0.5 0.289 0.816
    endloop
  endfacet
  facet normal -0.816 0.236 0.527
    outer loop
      vertex 0 0 0
      vertex 0.5 0.866 0
      vertex 0.5 0.289 0.816
    endloop
  endfacet
  facet normal 0.816 0.236 0.527
    outer loop
      vertex 1 0 0
      vertex 0.5 0.866 0
      vertex 0.5 0.289 0.816
    endloop
  endfacet
endsolid tetrahedron
```

### Parsing Rules

- Keywords are case-insensitive (`SOLID`, `Solid`, `solid` all valid)
- Whitespace is flexible (spaces, tabs, newlines)
- The `name` after `solid` and `endsolid` should match but many parsers ignore it
- Numbers are floating-point (decimal or scientific notation: `1.5e-3`)
- No comments are allowed in the format

---

## Binary Format

Binary STL is more compact and faster to parse:

```
┌──────────────────────────────────────────────────────┐
│                  BINARY STL LAYOUT                    │
├──────────────────────────────────────────────────────┤
│                                                       │
│  HEADER          80 bytes     (arbitrary, often blank) │
│  TRIANGLE COUNT   4 bytes     (uint32, little-endian)  │
│                                                       │
│  For each triangle (50 bytes each):                   │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Normal    12 bytes  (3 × float32)              │  │
│  │  Vertex 1  12 bytes  (3 × float32)              │  │
│  │  Vertex 2  12 bytes  (3 × float32)              │  │
│  │  Vertex 3  12 bytes  (3 × float32)              │  │
│  │  Attribute  2 bytes  (uint16, usually 0)        │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Total size = 84 + (50 × triangle_count) bytes        │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Byte-Level Detail

| Offset | Size | Type | Content |
|--------|------|------|---------|
| 0 | 80 | char[] | Header (not null-terminated, often all zeros) |
| 80 | 4 | uint32 | Number of triangles |
| 84 | 12 | 3×float32 | Normal vector (nx, ny, nz) |
| 96 | 12 | 3×float32 | Vertex 1 (x, y, z) |
| 108 | 12 | 3×float32 | Vertex 2 (x, y, z) |
| 120 | 12 | 3×float32 | Vertex 3 (x, y, z) |
| 132 | 2 | uint16 | Attribute byte count (usually 0) |
| 134 | ... | ... | Next triangle... |

### The Attribute Bytes

The 2-byte attribute field after each triangle is officially "should be zero" but is abused by various tools:

- **VisCAM/SolidView**: Stores RGB color as 5-5-5 bits + 1 validity bit
- **Magics**: Stores per-facet color
- **Most tools**: Write 0 and ignore on read

This is the only "extension" mechanism in STL, and it's non-standard.

### Distinguishing ASCII from Binary

A file starting with the ASCII string `solid` could be either format. The reliable heuristic:

1. Read the first 80 bytes (header)
2. Read bytes 80–83 as a uint32 (triangle count)
3. Check if file size equals `84 + 50 × triangle_count`
4. If yes → binary; if no → try ASCII parsing

---

## Format Comparison: ASCII vs Binary

| Property | ASCII | Binary |
|----------|-------|--------|
| File size (1000 triangles) | ~75 KB | ~49 KB |
| File size (100,000 triangles) | ~7.5 MB | ~4.9 MB |
| File size (1M triangles) | ~75 MB | ~49 MB |
| Parse speed | Slow (text parsing) | Fast (memcpy structs) |
| Human readable | Yes | No |
| Precision | Variable (text digits) | Fixed (float32) |
| Color support | No | Non-standard (attribute bytes) |
| Debugging | Easy | Requires hex editor |

**Recommendation:** Use binary for production (smaller, faster). Use ASCII for debugging and tests (human-readable, diffable).

---

## What STL Does NOT Store

STL is a deliberately minimal format. It explicitly lacks:

| Missing Feature | Consequence |
|-----------------|-------------|
| **Topology** | No edge/face connectivity — must be reconstructed |
| **Exact geometry** | Circles become polygons, spheres become faceted |
| **Units** | No specification of mm vs inches — must be agreed by convention |
| **Color/material** | No standard support (attribute bytes are non-standard) |
| **Multiple solids** | One `solid...endsolid` block per file (by convention) |
| **Metadata** | No author, date, creation tool, or part name |
| **Texture coordinates** | No UV mapping |
| **Animation/transforms** | Static geometry only |

```
┌──────────────────────────────────────────────────────┐
│              INFORMATION LOST IN STL                  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  BRep Solid                    STL Mesh               │
│  ───────────                   ─────────              │
│  6 faces (planar)     ───►     12 triangles           │
│  12 edges             ───►     (lost)                 │
│  8 vertices           ───►     36 vertices (duped)    │
│  exact planes         ───►     approximate planes     │
│  shared edges         ───►     coincident verts       │
│  face normals         ───►     facet normals          │
│  topology graph       ───►     (lost)                 │
│                                                       │
│  A cylinder with BRep:         STL:                   │
│  1 cylindrical surface ───►    N flat quads           │
│  2 circular edges      ───►    N line segments        │
│  exact radius          ───►    polygon approximation  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**This is the fundamental tradeoff:** STL is trivial to produce and consume, but it destroys the exact geometric and topological information that BRep preserves. You cannot recover a cylinder from an STL mesh — you can only heuristically guess that a set of triangles "looks cylindrical."

---

## Normal Vectors

Each STL facet carries a normal vector. There are two sources of truth for the normal direction, and they should agree:

### 1. The Explicit Normal

The `facet normal nx ny nz` line provides the normal directly.

### 2. The Vertex Winding Order (Right-Hand Rule)

Vertices are ordered counter-clockwise when viewed from outside the solid. The normal follows the right-hand rule:

```
  v2
  ╱│
 ╱ │
v0─┘v1     Normal = (v1 - v0) × (v2 - v0), points toward viewer
```

### Which Takes Precedence?

The STL specification says the vertex ordering **must** be consistent with the normal vector. In practice:

- **Some tools** write zero normals `(0 0 0)` and expect readers to compute from vertices
- **Some tools** write correct normals but inconsistent vertex ordering
- **Robust readers** should recompute normals from vertices and ignore the stated normal

**For writing:** Always write correct normals AND consistent CCW vertex ordering. This maximizes compatibility.

---

## Common Problems

### Non-Manifold Geometry

STL has no topology enforcement. Common defects:

- **Gaps/holes**: Triangles that don't meet edge-to-edge
- **T-junctions**: An edge endpoint landing on another triangle's edge (not at a vertex)
- **Self-intersections**: Triangles passing through each other
- **Inverted normals**: Some triangles pointing inward, others outward
- **Degenerate triangles**: Zero-area triangles (three collinear vertices)

Slicers require **watertight** meshes — every edge shared by exactly two triangles, all normals pointing outward. Tools like Meshmixer, Netfabb, and MeshFix exist specifically to repair STL defects.

### Vertex Duplication

STL stores 3 vertices per triangle independently. A cube with 12 triangles stores 36 vertices, even though there are only 8 unique vertex positions. This wastes space and makes adjacency queries require spatial hashing.

### Precision

Binary STL uses 32-bit floats, which provide ~7 decimal digits of precision. For a 1-meter part, this means ~0.1 micron resolution — adequate for most 3D printing but insufficient for precision machining. ASCII STL precision depends on how many digits the writer outputs.

---

## STL in OpenCASCADE

OCCT provides STL reading and writing through the `RWStl` and `StlAPI` packages:

### Writing

```cpp
// High-level API
#include <StlAPI_Writer.hxx>

StlAPI_Writer writer;
writer.ASCIIMode() = false;  // binary
writer.Write(shape, "output.stl");

// The writer internally:
// 1. Triangulates the shape (BRepMesh_IncrementalMesh)
// 2. Extracts triangles from each face
// 3. Writes to STL format
```

### Reading

```cpp
#include <RWStl.hxx>

Handle(Poly_Triangulation) mesh = RWStl::ReadFile("input.stl");
// Returns a Poly_Triangulation — no BRep topology, just triangles
```

### Key OCCT Classes

| Class | Purpose |
|-------|---------|
| `StlAPI_Writer` | High-level shape-to-STL writer |
| `StlAPI_Reader` | High-level STL-to-shape reader |
| `RWStl` | Low-level STL file I/O |
| `BRepMesh_IncrementalMesh` | Tessellates BRep shapes into triangles |
| `Poly_Triangulation` | Triangle mesh data structure |

**OCCT source locations:**
- `library/opencascade/src/DataExchange/TKDESTL/RWStl/RWStl.cxx`
- `library/opencascade/src/DataExchange/TKDESTL/StlAPI/StlAPI_Writer.cxx`
- `library/opencascade/src/DataExchange/TKDESTL/StlAPI/StlAPI_Reader.cxx`

### Tessellation Parameters

The critical step is tessellation — converting exact BRep surfaces into triangles. OCCT's `BRepMesh_IncrementalMesh` accepts:

- **Linear deflection**: Maximum distance from triangle surface to true surface (in model units)
- **Angular deflection**: Maximum angle between adjacent triangle normals (in radians)

```
┌──────────────────────────────────────────────────────┐
│              TESSELLATION QUALITY                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Low quality (few triangles):                         │
│  ┌───────┐                                            │
│  │╲     ╱│     Visible faceting                       │
│  │ ╲   ╱ │     Fast to render                         │
│  │  ╲ ╱  │     Small file size                        │
│  └───────┘                                            │
│                                                       │
│  High quality (many triangles):                       │
│  ┌──┬──┬──┐                                           │
│  │╲ │╲ │╲ │    Smooth appearance                      │
│  │ ╲│ ╲│ ╲│    Slow to render                         │
│  │╱ │╱ │╱ │    Large file size                        │
│  └──┴──┴──┘                                           │
│                                                       │
│  deflection = max distance from triangle to surface   │
│  Smaller deflection = more triangles = smoother       │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## Relevance to labrep

### We Already Have the Hard Part

Our `Mesh` type in `generation/src/mesh/mesh.ts` is essentially an indexed triangle mesh:

```typescript
interface Mesh {
  readonly vertices: Float32Array;  // [x0,y0,z0, x1,y1,z1, ...]
  readonly normals: Float32Array;   // per-vertex normals
  readonly indices: Uint32Array;    // triangle indices
}
```

This is structurally close to STL. The main differences:

| Our Mesh | STL |
|----------|-----|
| Indexed (shared vertices) | Per-facet vertices (duplicated) |
| Per-vertex normals (smooth) | Per-facet normals (flat) |
| In-memory typed arrays | File format (ASCII or binary) |

### STL Writer: What We Need

An STL writer for labrep would:

1. Take a `Mesh` and produce an STL file (ASCII or binary)
2. For each triangle (from `indices`), look up the three vertices
3. Compute the face normal from the cross product of two edges
4. Write the facet

```typescript
function meshToStlAscii(mesh: Mesh, name?: string): string {
  const lines: string[] = [`solid ${name ?? 'labrep'}`];

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const i0 = mesh.indices[i] * 3;
    const i1 = mesh.indices[i + 1] * 3;
    const i2 = mesh.indices[i + 2] * 3;

    // Vertices
    const v0 = [mesh.vertices[i0], mesh.vertices[i0+1], mesh.vertices[i0+2]];
    const v1 = [mesh.vertices[i1], mesh.vertices[i1+1], mesh.vertices[i1+2]];
    const v2 = [mesh.vertices[i2], mesh.vertices[i2+1], mesh.vertices[i2+2]];

    // Face normal via cross product
    const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
    const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
    const n = normalize(cross(e1, e2));

    lines.push(`  facet normal ${n[0]} ${n[1]} ${n[2]}`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${v0[0]} ${v0[1]} ${v0[2]}`);
    lines.push(`      vertex ${v1[0]} ${v1[1]} ${v1[2]}`);
    lines.push(`      vertex ${v2[0]} ${v2[1]} ${v2[2]}`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
  }

  lines.push(`endsolid ${name ?? 'labrep'}`);
  return lines.join('\n');
}
```

The binary writer is similarly straightforward — write the header, triangle count, then packed structs.

### STL Reader: Lower Priority

Reading STL back into our system is less immediately useful because:

- STL → `Mesh` is trivial (it's already triangles)
- STL → BRep (topology reconstruction) is a hard unsolved problem
- We're more likely to import STEP and export STL than the reverse

If we do implement a reader, it should produce a `Mesh`, not attempt to reconstruct BRep topology.

### Implementation Plan

**Phase 1 (near-term):**
- `meshToStlAscii(mesh: Mesh, name?: string): string` — for debugging and small models
- `meshToStlBinary(mesh: Mesh, name?: string): ArrayBuffer` — for production export
- Add "Export STL" button to the viewer app

**Phase 2 (later):**
- `stlToMesh(data: string | ArrayBuffer): OperationResult<Mesh>` — reader for both formats
- Mesh validation (watertightness check, normal consistency)
- Tessellation quality control when exporting from BRep (once we have BRep solids)

### Winding Order Consideration

Our mesh generation uses clockwise winding to match OCCT conventions (see `design/face-orientation-analysis.md`). STL expects counter-clockwise winding when the normal points toward the viewer. The STL writer should either:

1. Flip the vertex order when writing (swap v1 and v2), or
2. Compute the normal from vertices and ensure it's consistent

Since we compute the face normal from the cross product at write time anyway, option 2 is simpler — just ensure the cross product direction matches the intended outward normal.

### File Size Estimation

For our current primitives:

| Primitive | Triangles | ASCII Size | Binary Size |
|-----------|-----------|------------|-------------|
| Box | 12 | ~1 KB | ~684 B |
| Sphere (32×16) | 992 | ~75 KB | ~49 KB |
| Cylinder (32 seg) | 128 | ~10 KB | ~6.5 KB |
| Typical part | 10,000 | ~750 KB | ~490 KB |

Binary STL is always preferable for non-trivial models.

---

## References

- [STL (file format) — Wikipedia](https://en.wikipedia.org/wiki/STL_(file_format)) — Good overview of both ASCII and binary formats
- [The StL Format — Paul Bourke](http://paulbourke.net/dataformats/stl/) — Detailed technical reference with examples
- [Fabbers.com STL Format](https://www.fabbers.com/tech/STL_Format) — Original format specification
- [3MF Consortium](https://3mf.io/) — STL's modern successor (XML-based, supports color, materials, units)
- [AMF Format (ISO/ASTM 52915)](https://en.wikipedia.org/wiki/Additive_manufacturing_file_format) — Another mesh format addressing STL's limitations
- OCCT source: `library/opencascade/src/DataExchange/TKDESTL/RWStl/RWStl.cxx`
- OCCT source: `library/opencascade/src/DataExchange/TKDESTL/StlAPI/StlAPI_Writer.cxx`
