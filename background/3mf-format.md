# 3MF File Format

> STL's modern successor — a ZIP-based package that carries meshes, colors, materials, units, and multi-part assemblies in a single file.

---

## Table of Contents

- [Overview](#overview)
- [Why 3MF Exists](#why-3mf-exists)
- [Package Structure](#package-structure)
- [The Core Model (3dmodel.model)](#the-core-model-3dmodelmodel)
- [Mesh Representation](#mesh-representation)
- [Components and Build Items](#components-and-build-items)
- [Extensions](#extensions)
- [A Complete Example: Colored Box](#a-complete-example-colored-box)
- [3MF vs STL vs STEP](#3mf-vs-stl-vs-step)
- [3MF in OpenCASCADE](#3mf-in-opencascade)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

3MF (3D Manufacturing Format) is an open standard developed by the 3MF Consortium — a group including Microsoft, HP, Autodesk, Stratasys, 3D Systems, and others. Version 1.0 was released in 2015 as a direct replacement for STL in additive manufacturing workflows.

A 3MF file is a ZIP archive (with the `.3mf` extension) containing XML documents that describe one or more 3D models, their materials, colors, textures, and metadata. Unlike STL's flat triangle soup, 3MF uses an indexed mesh representation (shared vertices), supports multiple objects in a single file, and has a well-defined extension mechanism for colors, materials, slicing data, and more.

The format was designed from the start to address every shortcoming of STL: it specifies units, enforces mesh validity rules, supports per-vertex and per-triangle colors, carries print-specific metadata (infill, support settings), and packages everything into a single compressed file. Major slicers — Cura, PrusaSlicer, Bambu Studio, and all Microsoft 3D tools — support 3MF natively.

---

## Why 3MF Exists

STL was created in 1987 and has not evolved since. Its deficiencies are well-documented:

```
┌──────────────────────────────────────────────────────┐
│                 PROBLEMS WITH STL                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  No units           → "Is this millimeters or inches?"│
│  No color/material  → Everything is gray              │
│  No topology        → Can't detect non-manifold       │
│  Vertex duplication  → 3× the necessary vertex data   │
│  No multi-part      → One solid per file              │
│  No metadata        → Who made this? When? What for?  │
│  No compression     → Large files for complex models  │
│  No validation      → Broken meshes pass silently     │
│                                                       │
│  3MF addresses every single one of these.             │
│                                                       │
└──────────────────────────────────────────────────────┘
```

The 3MF Consortium's stated goal: **"a format that contains all of the information needed to make a part, fully and unambiguously."**

---

## Package Structure

A 3MF file is a standard ZIP archive following the Open Packaging Conventions (OPC), the same packaging system used by `.docx`, `.xlsx`, and `.pptx` files.

```
my-model.3mf (ZIP archive)
│
├── [Content_Types].xml          ← MIME type declarations
├── _rels/
│   └── .rels                    ← Root relationships
├── 3D/
│   ├── 3dmodel.model            ← THE core model file (XML)
│   └── Textures/                ← Optional texture images
│       ├── wood-grain.png
│       └── label.jpg
└── Metadata/
    └── thumbnail.png            ← Optional preview image
```

### Content_Types.xml

Declares MIME types for files in the package:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="png" ContentType="image/png" />
</Types>
```

### Root Relationships (.rels)

Points to the primary model file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0"
    Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>
```

---

## The Core Model (3dmodel.model)

The heart of a 3MF file is the `3dmodel.model` XML document. Its structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter"
       xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">

  <metadata name="Title">My Part</metadata>
  <metadata name="Designer">labrep</metadata>
  <metadata name="CreationDate">2026-03-22</metadata>

  <resources>
    <!-- Object definitions (meshes, components) -->
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0" />
          <vertex x="1" y="0" z="0" />
          <!-- ... -->
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" />
          <!-- ... -->
        </triangles>
      </mesh>
    </object>
  </resources>

  <build>
    <!-- What to actually print -->
    <item objectid="1" />
  </build>

</model>
```

### Units

The `unit` attribute on the `<model>` element specifies the coordinate system:

| Value | Meaning |
|-------|---------|
| `millimeter` | Default and most common |
| `centimeter` | |
| `meter` | |
| `inch` | |
| `foot` | |
| `micron` | For micro-scale parts |

**STL has no unit specification at all.** This single attribute eliminates an entire class of 3D printing failures ("my part came out 25.4× too large").

### Metadata

The `<metadata>` elements carry human-readable information:

```xml
<metadata name="Title">Bracket v3</metadata>
<metadata name="Designer">Alice</metadata>
<metadata name="Description">Load-bearing bracket for shelf unit</metadata>
<metadata name="Copyright">2026 Acme Corp</metadata>
<metadata name="CreationDate">2026-03-22</metadata>
<metadata name="ModificationDate">2026-03-22</metadata>
<metadata name="Application">labrep</metadata>
```

---

## Mesh Representation

3MF uses an **indexed mesh** — vertices are defined once and referenced by index in triangles. This is identical in concept to our `Mesh` type.

### Vertices

```xml
<vertices>
  <vertex x="0" y="0" z="0" />       <!-- index 0 -->
  <vertex x="10" y="0" z="0" />      <!-- index 1 -->
  <vertex x="10" y="10" z="0" />     <!-- index 2 -->
  <vertex x="0" y="10" z="0" />      <!-- index 3 -->
  <vertex x="0" y="0" z="10" />      <!-- index 4 -->
  <!-- ... -->
</vertices>
```

Coordinates are floating-point numbers in the declared unit. The index is implicit (order of appearance, zero-based).

### Triangles

```xml
<triangles>
  <triangle v1="0" v2="1" v3="2" />
  <triangle v1="0" v2="2" v3="3" />
  <!-- ... -->
</triangles>
```

**Winding order:** 3MF specifies **counter-clockwise** winding when viewed from outside the solid. The normal is computed from the vertex order via the right-hand rule — there is no explicit normal field (unlike STL).

### Comparison with Our Mesh Type

```
┌──────────────────────────────────────────────────────┐
│           LABREP MESH ←→ 3MF MESH MAPPING            │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Mesh.vertices (Float32Array)                         │
│    [x0,y0,z0, x1,y1,z1, ...]                         │
│                    ↕                                  │
│  <vertex x="x0" y="y0" z="z0" />                     │
│  <vertex x="x1" y="y1" z="z1" />                     │
│                                                       │
│  Mesh.indices (Uint32Array)                           │
│    [0,1,2, 0,2,3, ...]                                │
│                    ↕                                  │
│  <triangle v1="0" v2="1" v3="2" />                    │
│  <triangle v1="0" v2="2" v3="3" />                    │
│                                                       │
│  Mesh.normals (Float32Array)                          │
│    per-vertex smooth normals                          │
│                    ↕                                  │
│  (not stored — computed from winding order)           │
│                                                       │
│  The mapping is nearly 1:1.                           │
│  3MF doesn't store per-vertex normals.                │
│  3MF uses CCW winding; we use CW (OCCT convention).  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Mesh Validity Rules

3MF defines strict validity requirements that STL lacks:

1. **Manifold**: Every edge must be shared by exactly two triangles
2. **Consistent orientation**: All triangle normals point outward
3. **No self-intersection**: Triangles must not pass through each other
4. **Positive volume**: The enclosed region must have positive volume
5. **No degenerate triangles**: All triangles must have nonzero area

A conforming 3MF producer should only emit valid meshes. Conforming consumers may reject invalid meshes.

---

## Components and Build Items

3MF natively supports multi-part models — a feature that requires multiple STL files or ad-hoc conventions.

### Objects

Each `<object>` in `<resources>` defines a printable thing:

```xml
<resources>
  <!-- A mesh object -->
  <object id="1" type="model" name="gear">
    <mesh>...</mesh>
  </object>

  <!-- Another mesh object -->
  <object id="2" type="model" name="shaft">
    <mesh>...</mesh>
  </object>

  <!-- A component object (assembly of other objects) -->
  <object id="3" type="model" name="gear-assembly">
    <components>
      <component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
      <component objectid="2" transform="1 0 0 0 1 0 0 0 1 5 0 0" />
    </components>
  </object>
</resources>
```

### Transforms

The `transform` attribute is a 3×4 affine transformation matrix in row-major order:

```
transform="m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz"
```

This maps to the upper-left 3×3 (rotation/scale) and right column (translation) of a 4×4 matrix:

```
┌                     ┐
│ m00  m01  m02  tx   │
│ m10  m11  m12  ty   │
│ m20  m21  m22  tz   │
│  0    0    0    1   │
└                     ┘
```

### Build Items

The `<build>` section lists what to actually manufacture:

```xml
<build>
  <item objectid="3" />                           <!-- the assembly -->
  <item objectid="1" transform="..." />            <!-- extra copy of gear, repositioned -->
</build>
```

Each `<item>` can have its own transform, allowing multiple copies of the same object at different positions on the print bed.

---

## Extensions

3MF uses XML namespaces to add capabilities beyond the core spec. Each extension is a separate specification document.

### Materials and Properties Extension

Adds colors, materials, and multi-material support:

```xml
<model xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <resources>
    <m:colorgroup id="10">
      <m:color color="#FF0000" />    <!-- index 0: red -->
      <m:color color="#00FF00" />    <!-- index 1: green -->
      <m:color color="#0000FF" />    <!-- index 2: blue -->
    </m:colorgroup>

    <object id="1" type="model">
      <mesh>
        <vertices>...</vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="10" p1="0" />  <!-- red -->
          <triangle v1="0" v2="2" v3="3" pid="10" p1="1" />  <!-- green -->
        </triangles>
      </mesh>
    </object>
  </resources>
</model>
```

The `pid` attribute references a property group, and `p1`/`p2`/`p3` assign properties per-vertex for interpolation (gradient colors across a triangle).

### Production Extension

Adds a unique UUID to each object for tracking through manufacturing:

```xml
<object id="1" p:UUID="e3a8e53e-1b72-4a5e-a5c4-9e8e1b2c3d4e" ...>
```

### Slice Extension

Embeds pre-sliced layer data directly in the file, bypassing the slicer entirely:

```xml
<s:slicestack id="20" zbottom="0">
  <s:slice ztop="0.2">
    <s:vertices>
      <s:vertex x="0" y="0" />
      <s:vertex x="10" y="0" />
      <!-- 2D vertices for this layer -->
    </s:vertices>
    <s:polygon startv="0">
      <s:segment v2="1" />
      <s:segment v2="2" />
      <!-- ... closed polygon -->
    </s:polygon>
  </s:slice>
</s:slicestack>
```

### Beam Lattice Extension

Defines lattice structures as beam networks rather than surface meshes — useful for lightweight structural parts.

### Summary of Extensions

| Extension | Namespace | Purpose |
|-----------|-----------|---------|
| Materials | `/material/2015/02` | Colors, textures, multi-material |
| Production | `/production/2015/06` | UUIDs, build tracking |
| Slice | `/slice/2015/07` | Pre-computed slice data |
| Beam Lattice | `/beamlattice/2017/02` | Lattice/strut structures |
| Secure Content | `/securecontent/2019/04` | Encryption and DRM |

---

## A Complete Example: Colored Box

A minimal but complete 3MF file for a unit cube with colored faces:

**3D/3dmodel.model:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter"
       xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">

  <metadata name="Application">labrep</metadata>

  <resources>
    <m:colorgroup id="10">
      <m:color color="#4A9EFF" />
    </m:colorgroup>

    <object id="1" type="model" name="box">
      <mesh>
        <vertices>
          <vertex x="0"  y="0"  z="0"  />
          <vertex x="10" y="0"  z="0"  />
          <vertex x="10" y="10" z="0"  />
          <vertex x="0"  y="10" z="0"  />
          <vertex x="0"  y="0"  z="10" />
          <vertex x="10" y="0"  z="10" />
          <vertex x="10" y="10" z="10" />
          <vertex x="0"  y="10" z="10" />
        </vertices>
        <triangles>
          <!-- Bottom face (z=0) -->
          <triangle v1="0" v2="2" v3="1" pid="10" p1="0" />
          <triangle v1="0" v2="3" v3="2" pid="10" p1="0" />
          <!-- Top face (z=10) -->
          <triangle v1="4" v2="5" v3="6" pid="10" p1="0" />
          <triangle v1="4" v2="6" v3="7" pid="10" p1="0" />
          <!-- Front face (y=0) -->
          <triangle v1="0" v2="1" v3="5" pid="10" p1="0" />
          <triangle v1="0" v2="5" v3="4" pid="10" p1="0" />
          <!-- Back face (y=10) -->
          <triangle v1="2" v2="3" v3="7" pid="10" p1="0" />
          <triangle v1="2" v2="7" v3="6" pid="10" p1="0" />
          <!-- Left face (x=0) -->
          <triangle v1="0" v2="4" v3="7" pid="10" p1="0" />
          <triangle v1="0" v2="7" v3="3" pid="10" p1="0" />
          <!-- Right face (x=10) -->
          <triangle v1="1" v2="2" v3="6" pid="10" p1="0" />
          <triangle v1="1" v2="6" v3="5" pid="10" p1="0" />
        </triangles>
      </mesh>
    </object>
  </resources>

  <build>
    <item objectid="1" />
  </build>

</model>
```

Note: 8 unique vertices for a cube (vs 36 in STL). The indexed representation eliminates duplication.

---

## 3MF vs STL vs STEP

| Feature | STL | 3MF | STEP |
|---------|-----|-----|------|
| **Data model** | Triangle soup | Indexed triangles | Exact BRep |
| **Geometry** | Approximate | Approximate | Exact |
| **Topology** | None | Mesh-level | Full BRep |
| **Units** | None | Explicit | Explicit |
| **Color** | Non-standard hack | Full (per-vertex, per-face, texture) | Limited |
| **Materials** | No | Yes (extension) | Yes (AP214/242) |
| **Multi-part** | No | Yes (components) | Yes (assemblies) |
| **Transforms** | No | 3×4 affine matrix | Full |
| **Metadata** | No | Yes | Yes |
| **Compression** | No | ZIP | No |
| **File size** | Large | Small (compressed) | Medium |
| **Ease of writing** | Trivial | Moderate (ZIP + XML) | Complex |
| **Ease of reading** | Trivial | Moderate | Complex |
| **3D printing** | Universal | Growing | Not direct |
| **Manufacturing** | Rough prototyping | Additive manufacturing | Subtractive + additive |
| **Round-trip fidelity** | Lossy | Lossy (mesh) | Lossless (BRep) |

```
┌──────────────────────────────────────────────────────┐
│              FORMAT POSITIONING                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Simplicity ◄──────────────────────────► Fidelity     │
│                                                       │
│  STL          3MF                      STEP           │
│  ───          ───                      ────           │
│  Triangle     Indexed mesh +           Exact BRep +   │
│  dump         metadata + color         full topology   │
│                                                       │
│  Quick &      Rich enough for          Design intent   │
│  dirty        manufacturing            preserved       │
│                                                       │
│  1987         2015                     1994 (AP203)    │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**For labrep:**
- **STEP** is the canonical exchange format (lossless BRep round-trip)
- **3MF** is the primary output for 3D printing (rich mesh with metadata)
- **STL** is the fallback output (maximum compatibility, no dependencies)

---

## 3MF in OpenCASCADE

OCCT added 3MF support via the `RWGltf` and `DE3MF` modules (introduced in OCCT 7.x). The implementation is more complex than STL because of the ZIP+XML packaging.

### Key OCCT Classes

| Class | Purpose |
|-------|---------|
| `RWMesh_CafReader` | Base class for mesh-format readers |
| `DE3MF_ReaderWriter` | 3MF-specific reader/writer |
| `XCAFDoc_ShapeTool` | Manages shape hierarchy in XDE documents |
| `XCAFDoc_ColorTool` | Manages colors in XDE documents |
| `BRepMesh_IncrementalMesh` | Tessellates BRep into triangles (same as for STL) |

**OCCT source locations:**
- `library/opencascade/src/DataExchange/TKDE3MF/` — 3MF reader/writer package

### Writing Flow

```
┌───────────┐     ┌──────────────┐     ┌───────────┐     ┌──────────┐
│ BRep      │────►│ Tessellate   │────►│ Build XML │────►│ ZIP into │
│ Shape     │     │ (BRepMesh)   │     │ model     │     │ .3mf     │
└───────────┘     └──────────────┘     └───────────┘     └──────────┘
```

The tessellation step is identical to STL export — the difference is the output packaging.

---

## Relevance to labrep

### Why We Should Support 3MF

1. **It's the future of 3D printing** — major slicers prefer 3MF over STL
2. **Our Mesh type is a natural fit** — indexed vertices + triangle indices map directly
3. **We can add value** — unit specification, part names, colors from BRep faces
4. **It's not much harder than STL** — the extra work is ZIP packaging and XML generation

### Implementation Approach

A 3MF writer for labrep would:

1. Create the XML model document from our `Mesh`
2. Wrap it in a ZIP archive with the required packaging files
3. Optionally attach color/material information

```typescript
interface ThreeMfOptions {
  /** Unit for coordinates (default: 'millimeter') */
  unit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot' | 'micron';
  /** Model name */
  name?: string;
  /** Part color as hex (#RRGGBB or #RRGGBBAA) */
  color?: string;
  /** Application name for metadata */
  application?: string;
}

function meshToThreeMf(mesh: Mesh, options?: ThreeMfOptions): ArrayBuffer {
  // 1. Build the XML model
  const model = buildModelXml(mesh, options);

  // 2. Build Content_Types.xml and .rels
  const contentTypes = buildContentTypesXml();
  const rels = buildRelsXml();

  // 3. Package into ZIP
  return createZipArchive({
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rels,
    '3D/3dmodel.model': model,
  });
}
```

### Vertex XML Generation

The core mesh conversion is straightforward:

```typescript
function buildMeshXml(mesh: Mesh): string {
  const vertexCount = mesh.vertices.length / 3;
  const triCount = mesh.indices.length / 3;

  let xml = '<mesh>\n  <vertices>\n';
  for (let i = 0; i < vertexCount; i++) {
    const x = mesh.vertices[i * 3];
    const y = mesh.vertices[i * 3 + 1];
    const z = mesh.vertices[i * 3 + 2];
    xml += `    <vertex x="${x}" y="${y}" z="${z}" />\n`;
  }
  xml += '  </vertices>\n  <triangles>\n';

  for (let i = 0; i < triCount; i++) {
    // Note: may need to swap v2/v3 to convert CW → CCW winding
    const v1 = mesh.indices[i * 3];
    const v2 = mesh.indices[i * 3 + 1];
    const v3 = mesh.indices[i * 3 + 2];
    xml += `    <triangle v1="${v1}" v2="${v2}" v3="${v3}" />\n`;
  }
  xml += '  </triangles>\n</mesh>';

  return xml;
}
```

### The ZIP Problem

The one complexity 3MF adds over STL is ZIP packaging. Options:

1. **Use a library** — `fflate` or `pako` for browser-compatible ZIP creation (~8KB gzipped)
2. **Write minimal ZIP** — the ZIP format is well-documented; a writer for uncompressed or DEFLATE-compressed entries is ~200 lines
3. **Generate in Node only** — use Node's built-in `zlib` module (won't work in browser)

**Recommendation:** Use `fflate` — it's small, fast, works in browser and Node, and has no dependencies. Adding it as a dependency is justified since ZIP creation is genuinely complex to implement correctly.

### Winding Order

3MF uses CCW winding; we use CW (OCCT convention). The writer must swap two vertices in each triangle:

```typescript
// Our mesh: indices [v0, v1, v2] with CW winding
// 3MF needs: [v0, v2, v1] for CCW winding
const v1 = mesh.indices[i * 3];
const v2 = mesh.indices[i * 3 + 2];  // swapped
const v3 = mesh.indices[i * 3 + 1];  // swapped
```

This is the same swap needed for STL export.

### Multi-Part Support

When labrep gains assemblies (Phase 11), 3MF's component system maps naturally:

| labrep | 3MF |
|--------|-----|
| `Solid` → `Mesh` | `<object>` with `<mesh>` |
| `Part` (solid + transform) | `<component objectid="..." transform="...">` |
| `Assembly` (parts + joints) | `<object>` with `<components>` |
| `Transform3D` | 3×4 `transform` attribute |

Our `Transform3D` is a 4×4 column-major matrix. The 3MF transform is 3×4 row-major. Conversion:

```typescript
// Our column-major 4×4:  [m0 m1 m2 m3 m4 m5 m6 m7 m8 m9 m10 m11 m12 m13 m14 m15]
// 3MF row-major 3×4:     "m0 m4 m8 m1 m5 m9 m2 m6 m10 m12 m13 m14"
function transformTo3mf(t: Transform3D): string {
  const e = t.elements;
  return `${e[0]} ${e[4]} ${e[8]} ${e[1]} ${e[5]} ${e[9]} ${e[2]} ${e[6]} ${e[10]} ${e[12]} ${e[13]} ${e[14]}`;
}
```

### Implementation Plan

**Phase 1 (with STL export):**
- `meshToThreeMfModel(mesh: Mesh, options?): string` — generate just the XML model (no ZIP)
- Useful for testing and inspection

**Phase 2 (full 3MF):**
- Add `fflate` dependency
- `meshToThreeMf(mesh: Mesh, options?): ArrayBuffer` — complete .3mf file
- Add "Export 3MF" button to the viewer app alongside "Export STL"

**Phase 3 (rich 3MF):**
- Per-face colors (when BRep faces carry color information)
- Multi-part export (when assemblies exist)
- Metadata (part name, creation date, application)

### File Size Comparison

For a sphere mesh (992 triangles, 482 vertices):

| Format | Size |
|--------|------|
| STL ASCII | ~75 KB |
| STL Binary | ~49 KB |
| 3MF (uncompressed XML in ZIP) | ~35 KB |
| 3MF (compressed XML in ZIP) | ~12 KB |

3MF with compression is typically **3-6× smaller** than STL for the same geometry, thanks to indexed vertices plus ZIP compression.

---

## References

- [3MF Specification (Core)](https://3mf.io/specification/) — Official spec from the 3MF Consortium
- [3MF Consortium](https://3mf.io/) — Organization homepage, member list, news
- [3MF Materials Extension](https://github.com/3MFConsortium/spec_materials/blob/master/3MF%20Materials%20Extension.md) — Color and material specification
- [3MF Production Extension](https://github.com/3MFConsortium/spec_production/blob/master/3MF%20Production%20Extension.md) — UUID tracking for manufacturing
- [3MF on GitHub](https://github.com/3MFConsortium) — All specs, sample files, reference implementations
- [Open Packaging Conventions (OPC)](https://en.wikipedia.org/wiki/Open_Packaging_Conventions) — The ZIP packaging standard 3MF is built on
- [lib3mf](https://github.com/3MFConsortium/lib3mf) — Official C++ reference implementation
- [fflate](https://github.com/101arrowz/fflate) — Lightweight JS/TS ZIP library suitable for 3MF packaging
- OCCT source: `library/opencascade/src/DataExchange/TKDE3MF/` — OCCT's 3MF reader/writer
