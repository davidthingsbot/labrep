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

## Implementation Order (completed 2026-03-24)

1. ✅ `solidToMesh` with planar faces (fan triangulation)
2. ✅ Tests — box, boolean results, volume cross-checks
3. ✅ App examples — shaded boolean results, 3 mesh demo pages
4. ✅ Cylindrical faces — parametric (θ, v) grid
5. ✅ Conical faces — parametric grid with pole/apex fan handling
6. ✅ Spherical faces — via polygon-approximated revolve profiles
7. ✅ Revolution surfaces — general parametric tessellation
8. ✅ Ear clipping — concave polygon support (star, L-shapes)
9. ✅ Cone normal fix — `normalConicalSurface` handles negative radius

---

## OCCT Reference

OCCT's tessellation lives in `BRepMesh_IncrementalMesh`. Key insights:
- Uses Delaunay triangulation for curved faces
- Respects `LinearDeflection` and `AngularDeflection` parameters
- Stores mesh on the shape (cached)
- Our approach: ear clipping for planar faces, parametric grids for curved faces

---

## Validation

1. **Triangle count** — box produces exactly 12 triangles (2 per face)
2. **Normal consistency** — all normals point outward (verified at sphere poles)
3. **Volume cross-check** — mesh volume ≈ `solidVolume()` for all primitives
4. **Spatial coverage** — bounding box reaches all extremes for every primitive
5. **No degenerate triangles** — pole/apex fan tessellation eliminates zero-area triangles
6. **Concave polygons** — ear clipping produces correct triangulation for star and L-shapes

---

## Implemented API (2026-03-24, updated end of session)

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

**Supported surface types:**

| Surface Type | Tessellation Method | Normals |
|-------------|-------------------|---------|
| Planar | Ear clipping (handles convex and concave) | Face plane normal (flat shading) |
| Cylindrical | Parametric (θ, v) grid, 1 row along axis | Analytic radial normal (smooth) |
| Conical | Parametric grid + apex fan | Analytic, negated when r(v) < 0 |
| Spherical | Parametric (θ, φ) grid | Analytic radial normal |
| Toroidal | Parametric (θ, φ) grid | Analytic normal |
| Revolution | Parametric (θ, v) grid, v from basis curve | Analytic cross-product normal |

**Planar face tessellation:** Uses ear clipping algorithm that works for all simple polygons (convex and concave). Projects 3D vertices to 2D via `worldToSketch`, triangulates in 2D, maps indices back to 3D vertices. For a polygon with N vertices, produces N-2 triangles.

**Curved face tessellation:** Determines parameter bounds from wire edge geometry (detecting full circles, arcs). Generates a regular (u, v) parametric grid. Uses analytic surface `evaluate()` and `normal()` functions for exact positions and smooth-shading normals.

**Pole/apex handling:** When one end of the v parameter range converges to a single point (cone apex, sphere pole), uses fan triangulation from a single apex vertex to the adjacent ring. Apex normal is computed as the average of the ring's normals, avoiding the surface normal singularity at the pole.

**Curved edge sampling:** For planar faces bounded by circle or arc edges (e.g., disk caps of a cylinder), the wire is sampled with configurable segment count to approximate the curve.

**Options:**

```typescript
interface TessellationOptions {
  linearDeflection?: number;   // Max chord-to-surface distance (default: 0.1)
  angularDeflection?: number;  // Max angle between adjacent normals (default: π/12)
  minSegments?: number;        // Min subdivisions per curved edge (default: 24)
}
```

`minSegments` controls the number of divisions around curved surfaces (default 24). `linearDeflection` and `angularDeflection` are reserved for future adaptive refinement.

### Key Bug Fixes

1. **Cone normal for negative radius** (`generation/src/surfaces/conical-surface.ts`): When the effective radius `r(v) = radius + v·sin(α)` goes negative, the surface folds through the axis and the outward normal reverses. The `normalConicalSurface` function now detects this and negates the normal. This was causing sphere pole caps to shade as if facing the wrong way.

2. **Ear clipping for concave polygons** (`generation/src/mesh/tessellation.ts`): Fan triangulation only works for convex polygons. Star-shaped faces, L-shaped boolean results, and other concave planar faces produced overlapping triangles. Replaced with ear clipping algorithm that works for all simple polygons.

3. **Degenerate triangles at poles**: The original parametric grid generated triangles where all vertices converged to the apex point (zero area). Now uses fan triangulation from a single apex vertex, eliminating degenerate triangles entirely.

### Test Coverage

**File:** `generation/tests/mesh/tessellation.test.ts` (37 tests)

**Basic planar:**
- Box: succeeds, valid mesh, 12 triangles, 24 vertices, unit normals, volume matches
- Boolean subtract/union/intersect: mesh volume matches solid volume
- Tall box: non-cubic dimensions

**Curved surfaces:**
- Cylinder (revolved rectangle): succeeds, valid mesh, >20 triangles, unit normals, volume ≈ πr²h (within 3%)
- Cone (revolved triangle): succeeds, volume ≈ ⅓πr²h
- Sphere (revolved polygon semicircle): succeeds, volume ≈ ⁴⁄₃πr³ (within 10%)

**Spatial coverage:**
- Box, cylinder, cone, sphere bounding boxes cover full expected extent
- Sphere reaches both poles (z_max ≈ r, z_min ≈ -r)
- Cone apex reached (z_max = h)

**Normal direction:**
- Sphere top pole normals point upward (avg nz > 0)
- Sphere bottom pole normals point downward (avg nz < 0)
- No NaN or Infinity in any primitive's vertices or normals
- Zero degenerate triangles at cone apex

**Concave polygons (ear clipping):**
- Star extrusion (10-vertex concave polygon): mesh volume matches solid volume
- L-shaped extrusion (concave hexagon): volume = 48.0
- Star face produces correct triangle count (n-2 per face)

**Every face contributes:** Box, cylinder, cone all have at least as many triangles as faces.

### App Examples

Six viewer examples use `solidToMesh` (3 mesh demos + 3 boolean examples with shaded rendering):

| ID | Name | What it shows |
|----|------|---------------|
| `mesh-primitives` | Mesh: Primitives | Box, hexagon (extruded) + cylinder, cone, sphere (revolved) — animated dimensions |
| `mesh-extrude-revolve` | Mesh: Extrude & Revolve | L-bracket (fully shaded) + revolved annulus (wireframe + planar caps) |
| `mesh-complex` | Mesh: Complex Solids | Star extrusion, stepped tower (union stack), notched L-bracket (subtract) |
| `boolean-basic` | Boolean Basic | Shaded union/subtract/intersect results with orbiting boxes |
| `boolean-shapes` | Boolean Shapes | Shaded L-bracket with orbiting box (subtract/intersect) |

### Remaining Work

- [ ] Inner wire (hole) support via constrained triangulation
- [ ] Adaptive refinement using `linearDeflection` / `angularDeflection` options
- [ ] Extrusion surface tessellation (currently only planar extrusions handled)
- [ ] Mesh caching (avoid re-tessellating unchanged solids)
