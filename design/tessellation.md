# Phase 12: Solid Tessellation (Solid → Mesh)

## Problem

We can create solids (extrude, revolve, booleans) but can only render them as wireframes. Every CAD viewer needs shaded rendering, which requires converting BRep solids into triangle meshes. This is the bridge between our topology layer and the rendering layer.

## Approach

### Core Function

```typescript
solidToMesh(solid: Solid, options?: TessellationOptions): Mesh
```

Takes a Solid (boundary representation with faces, edges, wires) and produces a Mesh (flat arrays of vertices, normals, indices) suitable for GPU rendering.

### Strategy Per Surface Type

#### 1. Planar Faces (Immediate Priority)

All extrude caps, side faces, and boolean results are planar. Tessellation is a solved problem:

- **Fan triangulation** from the first vertex of the outer wire
- **Normal** from the face's `PlaneSurface` plane normal (analytic, exact)
- Handles convex polygons directly; concave polygons need ear clipping (defer if not needed)
- Inner wires (holes) need constrained triangulation (defer to later)

```
Fan triangulation of polygon [v0, v1, v2, v3, v4]:
  Triangle 0: v0, v1, v2
  Triangle 1: v0, v2, v3
  Triangle 2: v0, v3, v4
```

#### 2. Cylindrical Faces

Extrude side faces and cylinder bodies. Parametric sampling:

- **u** = along the axis (linear, 2 samples suffice)
- **v** = around the circumference (angular, governed by `angularDeflection`)
- Produces a strip of quads → split into triangles
- **Normal** = analytic: `normalize(point - closestPointOnAxis)`

#### 3. Spherical Faces

Sphere caps and spherical surfaces from revolve.

- **u** = longitude (0 to 2π or partial)
- **v** = latitude (partial range based on face trim)
- Pole handling: degenerate triangles at poles (single vertex fan)
- **Normal** = analytic: `normalize(point - center)`

#### 4. Conical Faces

- Same as cylindrical but radius varies linearly with u
- **Normal** = analytic from cone geometry

#### 5. Toroidal Faces

- **(u, v)** parametric grid, both periodic
- **Normal** = analytic from torus geometry

#### 6. Revolution Surfaces (General)

- **u** = revolution angle
- **v** = profile parameter (evaluate the generating curve)
- Adaptive: more segments where curvature is high

### Options

```typescript
interface TessellationOptions {
  linearDeflection?: number;   // Max distance from chord to surface (default: 0.1)
  angularDeflection?: number;  // Max angle between adjacent normals (default: π/12 = 15°)
  minSegments?: number;        // Min subdivisions per curved edge (default: 8)
}
```

### Normal Strategy

Always use **analytic normals** from the surface definition, never infer from triangle cross products. This gives:
- Exact flat shading for planar faces
- Smooth shading for curved surfaces (Phong interpolation of per-vertex normals)

### Wire Vertex Extraction

For planar faces, we traverse the outer wire's oriented edges to get ordered vertices:

```typescript
for (const oe of face.outerWire.edges) {
  const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
  vertices.push(pt);
}
```

This gives vertices in the wire's traversal order, suitable for fan triangulation.

---

## Implementation Order

1. **`solidToMesh` with planar faces only** — covers box, extrude results, boolean results
2. **Tests** — box gives 12 triangles, correct normals, mesh volume ≈ solid volume
3. **App example** — shaded boolean results with colored faces
4. **Cylindrical faces** — covers extrude side faces with arc profiles
5. **Spherical, conical, toroidal** — covers revolve results
6. **Revolution surfaces** — general case

Step 1 is the immediate priority — it unblocks shaded rendering for all current examples.

---

## OCCT Reference

OCCT's tessellation lives in `BRepMesh_IncrementalMesh`. Key insights:
- Uses Delaunay triangulation for curved faces
- Respects `LinearDeflection` and `AngularDeflection` parameters
- Stores mesh on the shape (cached)
- We don't need that complexity for planar faces — fan triangulation suffices

---

## Validation

1. **Triangle count** — box should produce exactly 12 triangles (2 per face)
2. **Normal consistency** — all normals should point outward (dot with known outward direction > 0)
3. **Volume cross-check** — sum of signed tetrahedra volumes from mesh ≈ `solidVolume()` result
4. **Visual** — shaded render should look correct (no inside-out faces, no gaps)

---

## Implemented API (2026-03-24)

### `solidToMesh(solid, options?) → OperationResult<Mesh>`

**Location:** `generation/src/mesh/tessellation.ts`
**Exported from:** `@labrep/generation` (via `mesh/index.ts`)

Converts a `Solid` (BRep boundary representation) into a renderable triangle `Mesh`.

```typescript
import { solidToMesh } from '@labrep/generation';
import type { TessellationOptions } from '@labrep/generation';

const result = solidToMesh(solid);
if (result.success) {
  const mesh = result.result!;
  // mesh.vertices: Float32Array — flat [x0,y0,z0, x1,y1,z1, ...]
  // mesh.normals:  Float32Array — per-vertex normals, same layout
  // mesh.indices:  Uint32Array  — triangle indices (CCW winding)
}
```

**Current scope:** Planar faces only (fan triangulation). Non-planar faces (cylindrical, spherical, etc.) are silently skipped. This covers:
- All faces from `extrude()` results
- All faces from `booleanUnion/Subtract/Intersect()` results
- Box primitives (via extrude)
- Any solid with only planar faces

**Normals:** Uses the face's `PlaneSurface` plane normal directly (analytic, exact). All vertices of a planar face share the same normal, giving flat shading. Each face gets its own set of vertices (not shared across faces) so normals are discontinuous at edges.

**Triangle generation:** Fan triangulation from vertex 0 of each face's outer wire. For a polygon with N vertices, produces N-2 triangles. A box (6 quad faces) produces 12 triangles with 24 vertices.

**Options (reserved for curved surfaces):**

```typescript
interface TessellationOptions {
  linearDeflection?: number;   // Max chord-to-surface distance (default: 0.1)
  angularDeflection?: number;  // Max angle between adjacent normals (default: π/12)
  minSegments?: number;        // Min subdivisions per curved edge (default: 8)
}
```

Options are accepted but not yet used — they will control curved surface tessellation density.

### Test Coverage

**File:** `generation/tests/mesh/tessellation.test.ts` (14 tests)

| Test | What it verifies |
|------|-----------------|
| Box → succeeds | `solidToMesh` returns success for a simple box |
| Box → valid mesh | Passes `validateMesh()` (normals length matches vertices, indices in range) |
| Box → 12 triangles | 6 faces × 2 triangles per quad = 12 |
| Box → 24 vertices | 4 vertices per face × 6 faces (flat shading, unshared) |
| Box → unit normals | All normals have length 1.0 |
| Box → volume matches | Mesh volume (signed tetrahedra) ≈ `solidVolume()` |
| Subtract → succeeds | Boolean subtract result tessellates successfully |
| Subtract → valid mesh | Passes validation |
| Subtract → volume 28.0 | Mesh volume matches expected subtract result |
| Union → succeeds | Boolean union result tessellates |
| Union → volume 92.0 | Mesh volume matches expected |
| Intersect → succeeds | Boolean intersect result tessellates |
| Intersect → volume 36.0 | Mesh volume matches expected |
| Tall box → volume 30.0 | Non-cubic box (2×3×5) for shape generality |

### App Examples

Three viewer examples demonstrate the tessellation (registered after Revolve examples):

| ID | Name | What it shows |
|----|------|---------------|
| `mesh-primitives` | Mesh: Primitives | Box, triangular prism, hexagonal prism with animated dimensions |
| `mesh-extrude-revolve` | Mesh: Extrude & Revolve | L-bracket (fully shaded) + revolved annulus (caps shaded, curves wireframe) |
| `mesh-complex` | Mesh: Complex Solids | Star extrude, union tower stack, notched L-bracket (subtract) |

### Remaining Work

- [ ] Cylindrical face tessellation (parametric u,v sampling)
- [ ] Spherical face tessellation (lat/lon grid with pole handling)
- [ ] Conical face tessellation
- [ ] Toroidal face tessellation
- [ ] Revolution surface tessellation (general)
- [ ] Inner wire (hole) support via constrained triangulation
- [ ] Concave polygon support via ear clipping (fan triangulation only handles convex)
