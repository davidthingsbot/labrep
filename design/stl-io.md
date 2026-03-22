# Phase 3: STL Import/Export — Design Document

## Overview

Implement STL reading and writing for our `Mesh` type. This is the simplest I/O target — our mesh representation (indexed vertices + normals + indices) maps almost directly to STL's triangle list.

## OCCT Reference

| labrep | OCCT | Notes |
|--------|------|-------|
| `meshToStlAscii` | `StlAPI_Writer` (ASCII mode) | Shape → STL text |
| `meshToStlBinary` | `StlAPI_Writer` (binary mode) | Shape → STL binary |
| `stlToMesh` | `RWStl::ReadFile` | STL file → `Poly_Triangulation` |

**OCCT source locations:**
- `library/opencascade/src/DataExchange/TKDESTL/StlAPI/StlAPI_Writer.cxx`
- `library/opencascade/src/DataExchange/TKDESTL/RWStl/RWStl.cxx`

---

## Data Types

No new data types needed. STL I/O operates on the existing `Mesh` interface:

```typescript
interface Mesh {
  readonly vertices: Float32Array;  // [x0,y0,z0, x1,y1,z1, ...] flat
  readonly normals: Float32Array;   // per-vertex normals
  readonly indices: Uint32Array;    // triangle indices
}
```

---

## Functions

### Export

```typescript
/**
 * Export a Mesh to ASCII STL format.
 *
 * @param mesh - The mesh to export
 * @param name - Solid name (default: 'labrep')
 * @returns STL file content as a string
 */
function meshToStlAscii(mesh: Mesh, name?: string): string;

/**
 * Export a Mesh to binary STL format.
 *
 * @param mesh - The mesh to export
 * @returns STL file content as an ArrayBuffer
 */
function meshToStlBinary(mesh: Mesh): ArrayBuffer;
```

### Import

```typescript
/**
 * Import an STL file (ASCII or binary) into a Mesh.
 * Auto-detects format.
 *
 * @param data - STL file content (string for ASCII, ArrayBuffer for binary)
 * @returns Mesh or failure
 */
function stlToMesh(data: string | ArrayBuffer): OperationResult<Mesh>;

/**
 * Parse ASCII STL text into a Mesh.
 */
function stlAsciiToMesh(text: string): OperationResult<Mesh>;

/**
 * Parse binary STL data into a Mesh.
 */
function stlBinaryToMesh(data: ArrayBuffer): OperationResult<Mesh>;
```

---

## Implementation Details

### ASCII Export

For each triangle in the index buffer:
1. Look up 3 vertices by index
2. Compute face normal: `normalize(cross(v1 - v0, v2 - v0))`
3. Write `facet normal ... outer loop ... vertex ... endloop endfacet`

**Winding order:** Our mesh uses CW winding (OCCT convention). STL expects CCW when the normal points outward. The face normal is computed from vertices, so the cross product direction is determined by the vertex order we write. We write vertices in the order from our index buffer — the computed normal will be consistent with the winding.

### Binary Export

1. Write 80-byte header (zeros or `"labrep"` padded)
2. Write uint32 triangle count (little-endian)
3. For each triangle: write normal (3×float32), 3 vertices (3×3×float32), attribute bytes (uint16 = 0)

### ASCII Import

1. Verify file starts with `solid`
2. Parse `facet normal` / `outer loop` / `vertex` / `endloop` / `endfacet` blocks
3. Build vertex array and index array (de-duplicate vertices by position within tolerance)
4. Compute per-vertex normals by averaging adjacent face normals

**Vertex de-duplication:** STL stores 3 independent vertices per triangle. To produce an indexed mesh, we spatial-hash vertex positions and merge vertices within tolerance. This recovers the shared-vertex structure.

### Binary Import

1. Read 80-byte header (skip)
2. Read uint32 triangle count
3. For each triangle: read normal + 3 vertices + attribute bytes
4. De-duplicate vertices (same as ASCII)

### Format Auto-Detection

```typescript
function stlToMesh(data: string | ArrayBuffer): OperationResult<Mesh> {
  if (typeof data === 'string') {
    return stlAsciiToMesh(data);
  }
  // Binary: check if size matches 84 + 50 * triangleCount
  const view = new DataView(data);
  const triCount = view.getUint32(80, true);
  if (data.byteLength === 84 + 50 * triCount) {
    return stlBinaryToMesh(data);
  }
  // Try ASCII (some tools write ASCII as ArrayBuffer)
  const text = new TextDecoder().decode(data);
  return stlAsciiToMesh(text);
}
```

---

## Testing Approach

### Export Tests

| Test | Description |
|------|-------------|
| `ascii_box_valid_stl` | `makeBox → meshToStlAscii` produces valid STL text |
| `ascii_starts_with_solid` | Output begins with `solid` and ends with `endsolid` |
| `ascii_correct_triangle_count` | Number of `facet` blocks equals `meshTriangleCount` |
| `ascii_normals_unit_length` | All facet normals have length ≈ 1 |
| `binary_box_correct_size` | Binary output size = 84 + 50 × triangle count |
| `binary_header_80_bytes` | Header is exactly 80 bytes |
| `binary_triangle_count_matches` | uint32 at offset 80 matches `meshTriangleCount` |
| `binary_sphere_all_vertices_on_sphere` | All vertex positions at radius ± tolerance |

### Import Tests

| Test | Description |
|------|-------------|
| `ascii_parse_single_triangle` | Hand-crafted 1-triangle STL parses correctly |
| `ascii_parse_tetrahedron` | 4-triangle STL produces mesh with 4 triangles |
| `binary_parse_matches_ascii` | Same geometry in ASCII and binary produces same mesh |
| `import_deduplicates_vertices` | Shared vertices are merged (cube: 36 STL → 8 unique) |
| `import_rejects_empty` | Empty/malformed file returns failure |
| `import_rejects_truncated_binary` | Binary file with wrong size returns failure |

### Round-Trip Tests

| Test | Description |
|------|-------------|
| `roundtrip_ascii_box` | `makeBox → STL ASCII → parse → compare vertices` |
| `roundtrip_binary_box` | `makeBox → STL binary → parse → compare vertices` |
| `roundtrip_ascii_sphere` | `makeSphere → STL ASCII → parse → compare vertices` |
| `roundtrip_binary_sphere` | `makeSphere → STL binary → parse → compare vertices` |
| `roundtrip_ascii_cylinder` | `makeCylinder → STL ASCII → parse → compare` |
| `roundtrip_preserves_triangle_count` | Exported and re-imported mesh has same triangle count |

**Round-trip comparison:** Since STL uses float32 and de-duplication may reorder vertices, comparison checks:
- Same number of triangles
- Every triangle in the original appears in the imported mesh (within tolerance)
- Bounding box matches within tolerance

---

## File Organization

```
generation/src/io/
├── index.ts
├── stl-ascii-writer.ts
├── stl-binary-writer.ts
├── stl-ascii-reader.ts
├── stl-binary-reader.ts
└── stl.ts                 # Re-exports + auto-detect

generation/tests/io/
├── stl-ascii-writer.test.ts
├── stl-binary-writer.test.ts
├── stl-ascii-reader.test.ts
├── stl-binary-reader.test.ts
└── stl-roundtrip.test.ts
```

---

## Viewer Integration

Add "Export STL" button to the app header. When clicked:
1. Get the current example's mesh (if it has one)
2. Call `meshToStlBinary(mesh)`
3. Trigger browser download of the `.stl` file

---

## Exit Criteria

- [  ] `meshToStlAscii` produces valid ASCII STL
- [  ] `meshToStlBinary` produces valid binary STL
- [  ] `stlAsciiToMesh` parses ASCII STL with vertex de-duplication
- [  ] `stlBinaryToMesh` parses binary STL with vertex de-duplication
- [  ] `stlToMesh` auto-detects format
- [  ] Round-trip tests pass for box, sphere, cylinder
- [  ] All tests passing
- [  ] `generation/src/index.ts` exports all new functions

**Status: ✅ COMPLETE** (46 tests)
