# CommonBlock/PaveBlock Edge Sharing — Translation Brief

**Date:** 2026-04-01  
**Author:** OCCT Critic Agent  
**Target:** Faithful TypeScript port of OCCT's edge-sharing mechanism for FFI section edges  
**Problem:** 9 test failures in boolean-cad-objects + 3 in boolean caused by FFI edges not being shared between adjacent faces

---

## 1. Executive Summary

When two face-face intersections (FFI) produce geometrically identical edges (e.g., face A∩B and face A∩C both produce an edge along the A-B-C triple line), OCCT ensures they share a **single topological edge** through the **PaveBlock → CommonBlock** pipeline. The current TypeScript has no equivalent mechanism — each FFI call produces independent Edge objects. The `stitchEdges()` post-pass in `occt-common-edges.ts` tries to reconcile them after the fact via string-based canonical keys and fuzzy endpoint matching, but this is fragile and fails for:

- Non-line edges (arcs, ellipses) 
- Edges that need splitting at shared vertices
- The fundamental problem: by the time stitching runs, BuilderFace has already consumed unshared edges, producing open wires

### The Real Problem

The issue is **not** in stitchEdges itself — it's that **FFI edge distribution to faces happens without sharing**. In OCCT:

1. FFI computes section curves
2. Section curves become PaveBlocks (edge segments between vertex params)  
3. PaveBlocks that cover the same geometric interval are grouped into CommonBlocks
4. A CommonBlock assigns **one shared edge** to all its PaveBlocks
5. When faces query "what edges are on me?", they get the **same Edge object**

In the current TypeScript:
1. FFI computes section edges per face-pair
2. Each face-pair produces **independent** Edge objects
3. `addEdgeIfNotDuplicate` doesn't deduplicate open edges at all (line 1693: "Do not collapse open FFI edges here")
4. `stitchEdges` runs **after** BuilderFace, too late to help wire closure

---

## 2. OCCT Algorithm — The PaveBlock → CommonBlock Pipeline

### 2.1 Key Data Structures

**PaveBlock** (`BOPDS_PaveBlock.hxx`):
- Represents a segment of an edge between two vertices (paves)
- Fields: `originalEdge`, `pave1`, `pave2` (vertex index + parameter), `edge` (result edge index)
- A pave block on edge E from vertex V1(t1) to V2(t2) is written PB(E, V1@t1, V2@t2)

**CommonBlock** (`BOPDS_CommonBlock.hxx`):
- Groups PaveBlocks from different original edges that are geometrically coincident
- Fields: `paveBlocks` (list of PBs), `faces` (list of face indices on which the edge lies)
- The **first** pave block (PaveBlock1) is the "real" representative
- `SetEdge(n)` assigns edge index n to **all** PaveBlocks in the group
- `RealPaveBlock` returns PaveBlock1 — this is how shared edge identity works

**BOPDS_DS** (`BOPDS_DS.cxx:654`):
```cpp
handle<BOPDS_PaveBlock> BOPDS_DS::RealPaveBlock(const handle<BOPDS_PaveBlock>& thePB) const {
    const handle<BOPDS_CommonBlock>& aCB = CommonBlock(thePB);
    return aCB ? aCB->PaveBlock1() : thePB;
}
```
This is the **core sharing mechanism**: any PaveBlock in a CommonBlock resolves to the same PaveBlock1, which holds the shared edge.

### 2.2 Pipeline Stages

#### Stage 1: EE intersection → CommonBlocks (`PaveFiller_3.cxx:557`)
```
For each edge-edge interference:
  Map PB1 → [PB2, ...] (pave blocks with same bounds)
  BOPAlgo_Tools::PerformCommonBlocks(map) 
    → groups into connected blocks
    → creates CommonBlock per group
    → assigns all PBs in group to same CB
```

#### Stage 2: EF intersection → CommonBlocks (`PaveFiller_5.cxx:568`)
```
For each edge-face interference:
  Map PB → [face indices where edge lies on face]
  BOPAlgo_Tools::PerformCommonBlocks(map)
    → creates/extends CommonBlocks with face associations
```

#### Stage 3: FF intersection → Section Edges (`PaveFiller_6.cxx:647`, MakeBlocks)
```
For each FF interference (face pair nF1, nF2):
  For each intersection curve:
    Split into PaveBlocks at vertex params
    For each PaveBlock:
      Check IsExistingPaveBlock against shared edges (aLSE)
      Check IsExistingPaveBlock against ON/IN edges (aMPBOnIn)
        → If found: reuse existing edge, add to aPBFacesMap
        → If not found: create new section edge, add to aMSCPB
```

**Key insight at line ~920-930 of PaveFiller_6.cxx**: When an FFI pave block matches an existing ON/IN pave block, OCCT does NOT create a new edge. It reuses the existing one and records which additional face needs it via `aPBFacesMap`.

#### Stage 4: PostTreatFF → Vertex/Edge fusion (`PaveFiller_6.cxx:1155`)
Section edges and their vertices enter a **mini Boolean** (a nested PaveFiller) to fuse coincident vertices and detect edge overlaps. This produces:
- `aDMExEdges`: old PB → list of new PBs (when edges get split)
- `aDMNewSD`: old vertex → new SD vertex (same-domain vertex fusion)

#### Stage 5: UpdateFaceInfo → Common Block creation (`PaveFiller_6.cxx:1630`)
```
For each edge with multiple PaveBlocks from different original edges:
  Create CommonBlock grouping all PBs
  Set all PBs to point to same CB
  CB inherits faces from any pre-existing CBs
```

#### Stage 6: MakeSplitEdges → Shared edge creation (`PaveFiller_7.cxx:363`)
```
For each CommonBlock (processed once via fence map):
  If no new vertices on any member PB:
    Find member edge that wasn't split → reuse it as shared edge
    CB.SetEdge(existingEdge) → all PBs get same edge
  Else:
    Split the representative edge (PaveBlock1)
    CB.SetEdge(newSplitEdge) → all PBs get same edge
```

#### Stage 7: PutSEInOtherFaces → Edge-face distribution (`PaveFiller_6.cxx:4132`)
Section edges are intersected with ALL faces (not just their creating pair) via ForceInterfEF, which can add edges to additional faces.

### 2.3 How SharedEdges Flow to BuilderFace

When BuilderFace runs (in BOPAlgo_Builder), it queries `BOPDS_FaceInfo`:
- `PaveBlocksOn()` — edges lying ON the face boundary  
- `PaveBlocksIn()` — edges lying IN the face interior
- `PaveBlocksSc()` — section edges

For each PaveBlock, it calls `RealPaveBlock(PB)` → gets PaveBlock1 of the CommonBlock → gets the **shared edge**. This means two faces that need the same geometric edge both get the **identical Edge object** (same BOPDS index → same TopoDS_Edge).

---

## 3. Current TypeScript Divergences

### 3.1 No PaveBlock / CommonBlock Infrastructure
The TypeScript has no concept of PaveBlocks or CommonBlocks. Each `intersectFaceFace()` call produces fresh Edge objects. There is no global registry of edges.

### 3.2 Edge Distribution is Per-Pair, Not Global
In `boolean.ts:debugSelectBooleanFaces()`:
```typescript
for (const faceA of facesOfA) {
  for (const faceB of facesOfB) {
    const ffiResult = intersectFaceFace(faceA, faceB);
    for (const ffiEdge of ffiResult.edges) {
      // Each ffiEdge.edge is a NEW object
      addEdgeIfNotDuplicate(edgesOnA.get(faceA)!, e);
      addEdgeIfNotDuplicate(edgesOnB.get(faceB)!, e);
    }
  }
}
```

The same geometric edge from A∩B and A∩C will be TWO different Edge objects added to face A. BuilderFace sees two edges that don't connect (different endpoint objects), producing an open wire.

### 3.3 addEdgeIfNotDuplicate Does Not Deduplicate Open Edges
```typescript
function addEdgeIfNotDuplicate(list: Edge[], edge: Edge): void {
  if (list.includes(edge)) return;
  if (!edge.curve.isClosed) {
    list.push(edge);  // ← Always adds open edges!
    return;
  }
  // ... only deduplicates closed curves
}
```

### 3.4 stitchEdges is a Post-Hoc Fix, Not a Pre-Sharing Mechanism
`occt-common-edges.ts:stitchEdges()` runs AFTER face selection and tries to reconcile edges via:
- String-based canonical keys (line direction + parameter intervals)
- Fuzzy endpoint matching
- Wire splitting by "common intervals"

This is ~1250 lines of complex heuristic code that attempts to replicate what OCCT does in 3 lines:
```cpp
handle<BOPDS_PaveBlock> aPBR = myDS->RealPaveBlock(aPB);
int nE = aPBR->Edge();  // ← same edge for all faces
```

### 3.5 Consequence: Open FFI Wires
When BuilderFace splits a face, it needs section edges to form closed wire loops (with face boundary edges). If two section edges that should be the same Edge object are instead different objects, BuilderFace can't close the wire → it produces fewer sub-faces or degenerate faces → classification fails → boolean result is wrong.

---

## 4. Implementation Plan

### 4.1 Core Concept: Edge Registry

Instead of translating the full BOPDS_DS + PaveBlock + CommonBlock infrastructure (which is deeply tied to OCCT's integer-indexed shape database), we implement the **semantic equivalent**: a global edge registry that ensures geometric coincidence → topological identity.

This is the same result OCCT achieves, just through a simpler mechanism appropriate for our data model where edges are objects, not integer indices.

### 4.2 New Module: `generation/src/operations/ffi-edge-sharing.ts`

```typescript
/**
 * FFI Edge Registry — ensures geometrically coincident FFI edges share 
 * the same Edge object. This is the TypeScript equivalent of OCCT's 
 * BOPDS_CommonBlock / PaveBlock / RealPaveBlock pipeline.
 *
 * OCCT ref: BOPDS_DS::RealPaveBlock() + BOPDS_CommonBlock::SetEdge()
 */

interface PaveBlock {
  edge: Edge;              // The edge segment
  startPt: Point3D;        // Canonical start vertex
  endPt: Point3D;          // Canonical end vertex  
  startParam: number;      // Parameter on support curve
  endParam: number;        // Parameter on support curve
  sourceFacePairs: [Face, Face][]; // Which FFI pairs produced this
}

interface CommonBlock {
  paveBlocks: PaveBlock[];  // All PBs sharing this geometry
  sharedEdge: Edge;         // The canonical shared Edge object
  faces: Set<Face>;         // All faces this edge touches
}

export class FFIEdgeRegistry {
  private commonBlocks: CommonBlock[] = [];
  private vertexPool: Point3D[] = [];   // Canonical vertices
  
  /**
   * Register an FFI edge. Returns the canonical (shared) edge.
   * If a geometrically equivalent edge already exists, returns 
   * that edge (with PCurves merged). Otherwise registers this
   * edge as canonical.
   * 
   * OCCT ref: IsExistingPaveBlock() + CommonBlock creation in
   * PaveFiller_6.cxx MakeBlocks
   */
  registerEdge(edge: Edge, faceA: Face, faceB: Face): Edge;
  
  /**
   * After all FFI pairs are processed, get the canonical edges
   * that should be added to a given face.
   * 
   * OCCT ref: BOPDS_FaceInfo::PaveBlocksIn/On/Sc → RealPaveBlock
   */
  getEdgesForFace(face: Face): Edge[];
  
  /**
   * Canonicalize a vertex: if a vertex within tolerance already 
   * exists, return that one. Otherwise add to pool and return.
   * 
   * OCCT ref: MakeSDVerticesFF / aDMNewSD vertex fusion
   */
  private canonicalVertex(point: Point3D): Point3D;
  
  /**
   * Find existing PaveBlock that matches geometry of candidate.
   * Checks both line edges (via support direction + parameter range)
   * and curved edges (via geometric comparison).
   * 
   * OCCT ref: IsExistingPaveBlock (two overloads in PaveFiller_6.cxx)
   */
  private findExistingPaveBlock(edge: Edge): PaveBlock | null;
  
  /**
   * Split an edge at shared vertices from other face-pairs.
   * When edge A∩B passes through vertex V that's on the A∩C 
   * intersection, both edges must be split at V to share 
   * the sub-segments.
   * 
   * OCCT ref: PaveBlock::AppendExtPave + Update (splitting at paves)
   */
  private splitAtSharedVertices(pb: PaveBlock): PaveBlock[];
}
```

### 4.3 Integration into Boolean Pipeline

Replace the current per-pair edge distribution in `boolean.ts:debugSelectBooleanFaces()`:

```typescript
// BEFORE (current):
for (const faceA of facesOfA) {
  for (const faceB of facesOfB) {
    const ffiResult = intersectFaceFace(faceA, faceB);
    for (const ffiEdge of ffiResult.edges) {
      addEdgeIfNotDuplicate(edgesOnA.get(faceA)!, ffiEdge.edge);
      addEdgeIfNotDuplicate(edgesOnB.get(faceB)!, ffiEdge.edge);
    }
  }
}

// AFTER (new):
const registry = new FFIEdgeRegistry();
for (const faceA of facesOfA) {
  for (const faceB of facesOfB) {
    const ffiResult = intersectFaceFace(faceA, faceB);
    for (const ffiEdge of ffiResult.edges) {
      registry.registerEdge(ffiEdge.edge, faceA, faceB);
    }
  }
}
// Now get canonical edges per face
for (const faceA of facesOfA) {
  const edges = registry.getEdgesForFace(faceA);
  if (edges.length > 0) edgesOnA.set(faceA, edges);
}
for (const faceB of facesOfB) {
  const edges = registry.getEdgesForFace(faceB);
  if (edges.length > 0) edgesOnB.set(faceB, edges);
}
```

### 4.4 Edge Matching Algorithm

For **line edges** (most common in box-box, box-cylinder cases):

```typescript
private findExistingLineEdge(edge: Edge): PaveBlock | null {
  // 1. Compute support line: canonical direction + anchor point
  //    (same approach as current lineSupportFrame but used structurally)
  // 2. Project edge endpoints onto support line → parameter interval [t1, t2]
  // 3. Search existing PaveBlocks for same support line + overlapping interval
  // 4. If interval matches within tolerance → same edge
  // 5. If intervals overlap but differ → edges need splitting at shared vertices
}
```

For **curved edges** (circles, arcs, ellipses):

```typescript
private findExistingCurvedEdge(edge: Edge): PaveBlock | null {
  // 1. For circles: match center + radius + plane normal
  // 2. For arcs: match center + radius + plane + angular range
  // 3. For general curves: sample N points and check proximity
  // OCCT ref: IsExistingPaveBlock uses IsPointInOnShape (BRep_Tool::Tolerance)
}
```

### 4.5 Vertex Canonicalization

```typescript
private canonicalVertex(point: Point3D): Point3D {
  const TOL = 1e-5;  // OCCT uses BRep_Tool::Tolerance(vertex)
  for (const existing of this.vertexPool) {
    if (distance(point, existing) < TOL) {
      return existing;  // Reuse existing vertex
    }
  }
  this.vertexPool.push(point);
  return point;
}
```

When an edge is registered, its start/end points are canonicalized. This ensures that edges sharing a vertex literally share the same Point3D object reference.

### 4.6 PaveBlock Splitting at Shared Vertices

When PB1 covers [A, C] and PB2 covers [A, B] where B is interior to [A, C]:
- PB1 must be split into [A, B] + [B, C]
- The [A, B] segment becomes a CommonBlock shared between PB1-split and PB2
- OCCT ref: `PaveBlock::AppendExtPave` + `Update` in `PaveFiller_2.cxx:417`

This is critical for the box-box case where three face pairs produce edges along the same line but with different extents.

### 4.7 What Happens to stitchEdges?

`stitchEdges` in `occt-common-edges.ts` becomes **unnecessary** for new FFI edges because sharing is done upfront. However, it may still be needed for:
- Edges inherited from original faces (boundary edges)
- Legacy compatibility during transition

Plan: Keep `stitchEdges` but make it a no-op for edges that went through the registry (they're already shared). Gradually remove it as the registry handles more cases.

### 4.8 Boundary Edge Matching (findMatchingBoundaryEdge)

The current `findMatchingBoundaryEdge` logic for detecting FFI edges on face boundaries should be **kept and enhanced**. When an FFI edge matches a boundary edge:
- OCCT: `IsExistingPaveBlock` against `aLSE` (shared edges between faces)
- The existing boundary edge is used directly (no new edge created)
- This is correct behavior — keep it.

---

## 5. Function Signatures

### New file: `generation/src/operations/ffi-edge-sharing.ts`

```typescript
export class FFIEdgeRegistry {
  constructor(tolerance?: number);
  
  // Register an FFI edge from a face-pair intersection
  // Returns the canonical edge (may be the same or a shared existing one)
  registerEdge(edge: Edge, faceA: Face, faceB: Face): Edge;
  
  // Get all canonical edges that should be added to a face
  getEdgesForFace(face: Face): Edge[];
  
  // Get all canonical edges (for debugging)
  getAllEdges(): Edge[];
  
  // Get faces associated with an edge
  getFacesForEdge(edge: Edge): Face[];
}
```

### Modified: `generation/src/operations/boolean.ts`

```typescript
// In debugSelectBooleanFaces:
// Replace the per-pair edge distribution loop with FFIEdgeRegistry usage
// Remove addEdgeIfNotDuplicate (no longer needed)
// Keep findMatchingBoundaryEdge (still needed for boundary detection)
```

### Modified: `generation/src/operations/occt-common-edges.ts`

```typescript
// stitchEdges: Keep but short-circuit for edges already in the registry
// Eventually deprecate most of this file
```

---

## 6. What NOT to Implement (Scope Control)

1. **NO BOPDS_DS integer-indexed shape database** — We use object references, not integer indices. The TypeScript Edge object IS the topological identity (same object = same edge).

2. **NO nested PaveFiller for PostTreatFF** — OCCT runs a mini Boolean to fuse section edge vertices. We handle vertex fusion in the registry itself via `canonicalVertex()`.

3. **NO FillShrunkData / bounding box computation for PaveBlocks** — Not needed; we don't use bounding-box trees for edge lookup (our face counts are small enough for direct comparison).

4. **NO PutSEInOtherFaces / ForceInterfEF** — OCCT intersects section edges with ALL faces post-hoc. For our use cases, the per-pair FFI already produces the needed edges. Can be added later if needed.

5. **NO periodic surface handling in edge splitting** — This is handled elsewhere (builder-face). Keep it separate.

6. **NO MakePCurves** — PCurves are already computed by intersectFaceFace. The registry just merges them when sharing edges.

7. **NO tolerance management beyond simple distance checks** — OCCT has an elaborate tolerance propagation system. We use a fixed tolerance (1e-5).

---

## 7. Test Impact Prediction

### Currently failing tests and expected impact:

**boolean.test.ts (3 failures — all box-box):**
- `overlapping boxes → correct intersection volume` — **SHOULD FIX**: Two boxes produce 12 FFI edges along face-pair intersections. Currently each face gets independent copies → BuilderFace produces open wires → degenerate result. With shared edges, wires will close.
- `subtract overlapping box → correct volume` — **SHOULD FIX**: Same root cause.
- `overlapping boxes → correct union volume` — **SHOULD FIX**: Same root cause.

**boolean-cad-objects.test.ts (9 failures):**
- `Counterbore: succeeds with closed shell and correct volume` — **SHOULD FIX**: Sequential boolean (box - big cylinder - small cylinder). The second subtraction's edges don't share with first subtraction's edges.
- `Spherical pocket: has all 6 planar faces + spherical cavity faces` — **SHOULD FIX**: Box - sphere. Sphere-plane intersection edges (circles) need sharing between adjacent box faces.
- `Cylinder with flat (3 tests)` — **SHOULD FIX**: Cylinder - box. Line edges on cylinder surface need sharing.
- `Sphere intersect box: correct volume` — **LIKELY FIX**: Sphere ∩ box. Similar to spherical pocket.
- `T-pipe union (3 tests)` — **PARTIAL FIX**: Two cylinders union. This involves cylinder-cylinder intersection curves (ellipses/complex curves) which are harder. May need additional curve-comparison logic.

---

## 8. Implementation Notes for Claude Code

1. **Create `ffi-edge-sharing.ts` as a new file** — Do not modify `occt-common-edges.ts` internals. The registry is a clean new module.

2. **Modify `boolean.ts` to use the registry** — The changes in boolean.ts should be surgical: replace the edge distribution loop, remove `addEdgeIfNotDuplicate`, keep everything else.

3. **Line edge matching must use support-line parameterization** — Two line edges are "the same" if they lie on the same infinite line (same direction + same anchor point) AND their parameter intervals overlap. Use the `lineSupportFrame` approach from `occt-common-edges.ts` as reference.

4. **Vertex canonicalization is critical** — When two edges share a vertex (same 3D point), they MUST share the same Point3D object. This is what makes wire closure work in BuilderFace.

5. **PCurve merging** — When two edges are identified as the same, merge their PCurve arrays. Each edge may carry PCurves for different surfaces. The shared edge needs all of them.

6. **Edge orientation** — The shared Edge object has a fixed geometric direction. Individual face uses track orientation (forward/reverse) separately. The FFIEdgeRegistry returns Edge objects; the caller handles orientation.

7. **Don't break existing passing tests** — The 33 currently passing tests must continue to pass. The registry should be additive, not destructive.

8. **Both `debugSelectBooleanFaces` and `debugBooleanFaceSplits` need updating** — They have duplicated edge distribution logic. Both must use the registry.

---

## 9. OCCT Source References

| Concept | File | Line(s) | Key Function |
|---------|------|---------|--------------|
| PaveBlock definition | `BOPDS_PaveBlock.hxx` | Full file | Class definition |
| CommonBlock definition | `BOPDS_CommonBlock.hxx` | Full file | Class definition |
| CommonBlock.AddPaveBlock (ordering) | `BOPDS_CommonBlock.cxx` | 38-50 | Keeps min-index PB first |
| RealPaveBlock (sharing key) | `BOPDS_DS.cxx` | 654-660 | Returns CB→PaveBlock1 |
| PerformCommonBlocks (grouping) | `BOPAlgo_Tools.cxx` | 107-178 | Groups PBs into CBs |
| MakeBlocks (FF section edges) | `BOPAlgo_PaveFiller_6.cxx` | 647-1050 | Main FF processing |
| IsExistingPaveBlock (reuse check) | `BOPAlgo_PaveFiller_6.cxx` | ~890-930 | Checks if PB already exists |
| MakeSplitEdges (shared edge creation) | `BOPAlgo_PaveFiller_7.cxx` | 363-520 | Creates/reuses split edges |
| UpdateFaceInfo (CB for post-treat) | `BOPAlgo_PaveFiller_6.cxx` | 1630-1850 | Creates CBs from unified PBs |
| PutSEInOtherFaces | `BOPAlgo_PaveFiller_6.cxx` | 4132-4160 | Distributes SEs to all faces |
