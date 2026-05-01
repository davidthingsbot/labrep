# WireSplitter Single-Cut Brief: Splitting Periodic Faces with One Intersection Wire

## Problem Statement

When a cylinder or sphere is cut by a single intersection edge (e.g., one circle from a plane intersection), `builderFace()` produces **1 subface instead of 2**. The traced loop contains the full seam + intersection but fails to separate into two distinct regions.

**Affected tests:** cylinder-with-flat (3 tests), sphere-intersect-box (3 tests).

## How OCCT Handles This

### Architecture
OCCT's `BOPAlgo_BuilderFace::PerformLoops()` (BuilderFace.cxx:239) delegates wire construction to `BOPAlgo_WireSplitter`. The flow is:

1. All edges (boundary + intersection) go into a `WireEdgeSet`
2. `WireSplitter::Perform()` calls `MakeConnexityBlocks()` to group connected edges
3. For each connexity block:
   - If "regular" (every vertex has exactly 1 in + 1 out, no duplicate TShape edges) → make a single wire
   - Otherwise → call `SplitBlock()` which builds a SmartMap and runs `Path()` to trace loops

### The SmartMap (BOPAlgo_WireSplitter_1.cxx)

`SplitBlock()` builds `mySmartMap`: vertex → list of `BOPAlgo_EdgeInfo` entries. Each entry stores:
- The edge
- Whether it's incoming (`isIn`) at this vertex — determined by vertex orientation (REVERSED = incoming)
- The 2D tangent angle at this vertex (`Angle2D()` using the PCurve)
- Whether it's an "inside" edge (not on the boundary — tracked via `aMS` edge set)
- Whether it's been "passed" (used in a traced loop)

### How Seam Edges Work in OCCT

On a periodic surface (cylinder, sphere), the **seam edge** appears in the wire with **two PCurves** on the same surface:
- PCurve 1 (forward): constant U = 0, V varies
- PCurve 2 (reverse): constant U = 2π, V varies

When a single intersection circle at height V=h splits the cylinder:

**Before intersection**, the boundary wire has:
- Bottom circle (V=Vmin)
- Seam edge forward (U=0, V goes Vmin→Vmax)
- Top circle (V=Vmax)  
- Seam edge reverse (U=2π, V goes Vmax→Vmin)

**After splitting at V=h**, the boundary becomes:
- Bottom circle
- Seam_bottom_fwd (U=0, V: Vmin→h)
- **Intersection circle** (U: 0→2π, V=h)
- Seam_top_fwd (U=0, V: h→Vmax) — wait, this is wrong

Actually, the key insight: **the seam edge gets split at the intersection point**. Where the intersection circle meets the seam (at U=0,V=h and U=2π,V=h — same 3D point), the seam edge splits into:
- seam_bottom: from (0,Vmin) to (0,h) forward / (2π,Vmin) to (2π,h) reverse  
- seam_top: from (0,h) to (0,Vmax) forward / (2π,h) to (2π,Vmax) reverse

The intersection circle PCurve goes from (0,h) to (2π,h).

### Path Tracing with Angle Selection

`Path()` traces loops by:
1. Start from an un-passed outgoing edge at some vertex
2. At each vertex, compute incoming angle (from `AngleIn`)
3. Find the outgoing candidate with **minimum clockwise angle** (`ClockWiseAngle`)
4. Special: if entering from boundary and there's exactly 1 inside way out, take it
5. On closed vertices (seam), use **2D distance** (`Coord2dVf`) to filter candidates to the correct seam side

The **2D distance check** is critical for seam vertices. At a seam vertex (same 3D position but U=0 vs U=2π), OCCT checks:
```cpp
aP2Dx = Coord2dVf(aE, myFace);  // UV at candidate edge's forward vertex
aD2 = aP2Dx.SquareDistance(aPb);  // distance to current position
if (aD2 > aTol2D2) continue;  // skip if too far in UV
```

This ensures that when at the seam vertex on the U=0 side, only edges whose PCurve starts near U=0 are considered — not edges on the U=2π side.

### Result for Single-Cut Cylinder

Path tracing produces **2 loops**:
1. **Bottom loop**: bottom_circle → seam_bottom_rev(U=2π) → intersection_circle_rev → seam_bottom_fwd(U=0)
2. **Top loop**: intersection_circle_fwd → seam_top_rev(U=2π) → top_circle → seam_top_fwd(U=0) (backwards, but you get the idea)

Each loop forms a closed wire in UV space that covers half the cylinder.

## What the TypeScript Code Does Now

### Vertex Handling (builder-face.ts)

`findOrAddVertex()` with `seamSplit=true` keeps vertices on opposite seam sides separate. This is correct.

### Seam Edge Splitting

The boundary processing iterates over `outerWire.edges`, finds intersection endpoints on each edge, and creates sub-edges. For seam edges that get split:
- The occurrence counter tracks which PCurve to use (0=first, 1=second)
- Sub-edges get both PCurves (forward and reverse seam)

### Loop Tracing

The `traceBuilderFace()` function builds a SmartMap-like structure and traces paths using clockwise angle selection, matching OCCT's `Path()`.

## Root Cause Analysis

The TypeScript code's loop tracing is very close to OCCT. The most likely failure points for single-cut periodic surfaces are:

### 1. Seam Edge Splitting at Intersection Points

When the intersection circle meets the seam, the seam must be split. In the boundary processing loop, `hitsOnEdge` detects intersection endpoints on boundary edges. For arc/circle seam edges, the hit detection code handles `arc3d` and `circle3d` types, but **seam edges on cylinders are typically `line3d`** (straight lines in 3D along the cylinder axis). The line3d hit detection should work.

However, the seam edge appears **twice** in the outer wire (with different orientations/occurrences). The split must happen on **both** occurrences.

### 2. UV Distance Filtering at Seam Vertices

During path tracing, when choosing the next edge at a seam vertex, the code checks:
```typescript
if (closedVertices.has(vtx) && currentUV && cand.startVtx !== cand.endVtx) {
  // UV distance check
}
```

The `cand.startVtx !== cand.endVtx` guard skips the UV filter for self-loops. But this is correct for the single-cut case.

### 3. Connexity Block Detection

OCCT uses `MakeConnexityBlocks` to group connected edges. If the intersection circle and split seam edges don't form a single connected group with the rest of the boundary, the WireSplitter may produce wrong results. The TypeScript code doesn't explicitly group into connexity blocks — it traces all edges together.

### 4. Most Likely Issue: Missing Split or Vertex Merging

The most likely bug: when the intersection circle touches the seam at a single 3D point (same 3D for U=0 and U=2π), the vertex merging may collapse two distinct seam-side vertices into one, preventing two separate loops from forming.

Check that:
- The intersection circle's PCurve endpoints produce distinct UV vertices (one at u≈0, one at u≈2π)  
- The seam sub-edges' vertices match these distinct UV vertices
- The SmartMap has the right connectivity: each seam-side vertex has exactly the right incoming/outgoing edges

## Implementation Guidance

### What to Fix

1. **Verify seam splitting**: Ensure both occurrences of the seam edge are properly split at intersection points. The `hitsOnEdge` detection must work for both the forward (occurrence=0) and reverse (occurrence=1) seam appearances.

2. **Verify vertex separation at seam**: At the intersection point on the seam, there should be **two** vertices:
   - Vertex A at UV (0, h) — connects to seam_bottom_fwd, intersection_circle_start, seam_top_fwd
   - Vertex B at UV (2π, h) — connects to seam_bottom_rev, intersection_circle_end, seam_top_rev

3. **Ensure the intersection circle has a PCurve** spanning (0,h) → (2π,h) on the cylinder surface. If it doesn't have a PCurve, the projection-based UV will give the same U for both endpoints (since they're the same 3D point), breaking vertex separation.

4. **Debug the actual traced loops**: Add logging to see what vertices and edges the tracer produces. The fix should make the tracer produce 2 closed loops instead of 1.

### What NOT to Do

- Don't add surface-type-specific heuristics ("if cylinder, split differently")
- Don't bypass the loop tracing — fix the input data (edges, vertices, PCurves) so the tracer naturally produces the right result
- Don't change the angle-based selection algorithm — it matches OCCT and is correct when given proper input

### Testing

Run: `npx vitest run generation/tests/operations/boolean-cad-objects.test.ts generation/tests/operations/boolean.test.ts`

Expected improvement: cylinder-with-flat (3 tests) and sphere-intersect-box (3 tests) should go from FAIL to PASS.

Current baseline: 33/45 passing.
