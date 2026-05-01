# Face Selection Brief: OCCT vs TypeScript Implementation

## Executive Summary

The TypeScript boolean implementation fundamentally differs from OCCT in how it selects faces from `BuilderFace` output. OCCT does **not** classify individual sub-faces; instead, it collects all sub-faces and uses **set membership** and **BuilderSolid** to reconstruct valid closed solids. The TypeScript implementation classifies each sub-face individually using `pointInSolid`, which leads to incorrect selection when faces share boundaries or have complex topological relationships.

---

## Part 1: OCCT Face Selection Mechanism

### 1.1 Pipeline Overview

OCCT's boolean operation flow (BOPAlgo_BOP/BOPAlgo_Builder):

```
PaveFiller → FillImagesFaces → BuildResult → BuildShape → BuildRC/BuildSolid
```

**Critical insight**: Selection does NOT happen in `FillImagesFaces`. All sub-faces from `BuilderFace` are stored in `myImages`. Selection happens later in `BuildRC` and `BuildSolid`.

### 1.2 FillImagesFaces (BOPAlgo_Builder_2.cxx)

**Lines 197-289**: `BuildSplitFaces()`
- For each face with intersection edges, calls `BOPAlgo_BuilderFace`
- Stores ALL resulting areas (sub-faces) in `myImages`:

```cpp
// Line 289-297
for (k = 0; k < aNbBF; ++k) {
  BOPAlgo_BuilderFace& aBF = aVBF(k);
  aFacesIm.Add(myDS->Index(aBF.Face()), aBF.Areas());  // ALL areas stored
  myReport->Merge(aBF.GetReport());
}
```

**No filtering occurs here** — all sub-faces are kept regardless of position relative to other solids.

### 1.3 BuildResult (BOPAlgo_BOP.cxx)

**Lines 221-248**: `BuildResult(TopAbs_ShapeEnum theType)`
- Simply adds images of arguments to `myShape` compound
- No classification — just collecting images:

```cpp
// Lines 231-247
if (myImages.IsBound(aS)) {
  const NCollection_List<TopoDS_Shape>& aLSIm = myImages.Find(aS);
  for (aItIm.Initialize(aLSIm); aItIm.More(); aItIm.Next()) {
    const TopoDS_Shape& aSIm = aItIm.Value();
    if (aM.Add(aSIm)) {
      aBB.Add(myShape, aSIm);  // Add ALL images, no classification
    }
  }
}
```

### 1.4 BuildRC (BOPAlgo_BOP.cxx) — The Key Selection Logic

**Lines 257-392**: This is where face selection actually happens.

**For FUSE (lines 266-279)**:
```cpp
if (myOperation == BOPAlgo_FUSE) {
  aType = TypeToExplore(myDims[0]);
  TopExp_Explorer aExp(myShape, aType);
  for (; aExp.More(); aExp.Next()) {
    const TopoDS_Shape& aS = aExp.Current();
    if (aMFence.Add(aS)) {
      aBB.Add(aC, aS);  // Keep all unique faces
    }
  }
  myRC = aC;
  return;
}
```

**For COMMON, CUT, CUT21 (lines 284-370)**:

1. **Build image maps** from arguments and tools:
```cpp
// Lines 290-325: Build aMArgsIm and aMToolsIm
for (i = 0; i < 2; ++i) {
  const NCollection_IndexedMap<...>& aMS = !i ? aMArgs : aMTools;
  NCollection_IndexedMap<...>& aMSIm = !i ? aMArgsIm : aMToolsIm;
  
  for (j = 1; j <= aNb; ++j) {
    const TopoDS_Shape& aS = aMS(j);
    if (myImages.IsBound(aS)) {
      const NCollection_List<TopoDS_Shape>& aLSIm = myImages.Find(aS);
      for (aItLS.Initialize(aLSIm); aItLS.More(); aItLS.Next()) {
        aMSIm.Add(aItLS.Value());  // Collect ALL split images
      }
    } else {
      aMSIm.Add(aS);
    }
  }
}
```

2. **Selection by set membership** (lines 357-370):
```cpp
for (i = 1; i <= aNb; ++i) {
  const TopoDS_Shape& aS = aMItExp(i);
  bContains = aMCheckExp.Contains(aS);  // Set membership check!
  
  if (bCommon) {
    if (bContains) {       // COMMON: in BOTH sets
      aBB.Add(aC, aS);
    }
  } else {
    if (!bContains) {      // CUT: in Args but NOT in Tools
      aBB.Add(aC, aS);
    }
  }
}
```

**Key point**: Selection is based on whether a shape appears in both argument and tool image sets — NOT on `pointInSolid` classification.

### 1.5 BuildSolid (BOPAlgo_BOP.cxx)

**Lines 513-695**: For 3D solids, reconstructs closed shells from faces.

1. **MapFacesToBuildSolids** (lines 750-788):
```cpp
// Collect faces from solid images, tracking which solids own them
for (; aExp.More(); aExp.Next()) {
  const TopoDS_Shape& aF = aExp.Current();
  if (aF.Orientation() == TopAbs_INTERNAL) continue;
  
  NCollection_List<TopoDS_Shape>* pLSol = theMFS.ChangeSeek(aF);
  if (!pLSol) {
    pLSol = &theMFS(theMFS.Add(aF, NCollection_List<TopoDS_Shape>()));
    pLSol->Append(theSol);
  } else {
    const TopoDS_Shape& aF1 = theMFS.FindKey(theMFS.FindIndex(aF));
    if (aF1.Orientation() != aF.Orientation()) {  // Opposite orientation
      pLSol->Append(theSol);  // Face shared between solids
    }
  }
}
```

2. **Face selection for BuilderSolid** (lines 661-677):
```cpp
// Only faces appearing ONCE (in one orientation from one solid) go to BuilderSolid
for (i = 1; i <= aNb; ++i) {
  const NCollection_List<TopoDS_Shape>& aLSx = aMFS(i);
  if (aLSx.Extent() == 1) {  // Face in only ONE solid
    const TopoDS_Shape& aFx = aMFS.FindKey(i);
    aSFS.Append(aFx);  // Include in result
  }
  // Faces in multiple solids (shared interface) are dropped!
}
```

3. **BuilderSolid assembles valid shells** (lines 686-702):
```cpp
BOPAlgo_BuilderSolid aBS;
aBS.SetShapes(aSFS);  // Only single-owned faces
aBS.Perform();
// BuilderSolid finds closed shells from available faces
```

### 1.6 BuilderSolid Face Grouping (BOPAlgo_BuilderSolid.cxx)

**PerformLoops** (lines 205-341):
- Uses `BOPAlgo_ShellSplitter` to group faces into connected shells
- Faces are grouped by edge connectivity, not by classification

**PerformAreas** (lines 388-539):
- Classifies shells as "growth" (outer) or "hole" (inner)
- Uses `IsHole()` / `IsGrowthShell()` for shell-level classification
- Holes are assigned to containing growth shells

**Key insight**: Individual face classification never happens. Shells are built from edge-connected faces, then shells are classified as a whole.

---

## Part 2: TypeScript Current Implementation

### 2.1 Face Selection Logic (boolean.ts)

**Lines 1450-1520** in `debugSelectBooleanFaces`:

```typescript
// Process faces of A
for (const faceA of facesOfA) {
  const intEdges = edgesOnA.get(faceA);
  if (intEdges && intEdges.length > 0) {
    const subFaces = builderFace(faceA, intEdges);
    for (const sf of subFaces) {
      const aligned = orientSplitFaceLikeOriginal(sf, faceA);
      const cls = classifySubFace(aligned.result!, b, intEdges);  // ← PROBLEM
      allFacesA.push({ face: aligned.result!, classification: cls });
    }
  }
}
```

### 2.2 classifySubFace Implementation (lines 940-1100)

Uses multiple strategies to classify a single sub-face:
1. Find intersection edges, compute binormal, nudge midpoint
2. Fall back to edge midpoints not on intersection
3. Fall back to UV interior point (faceProbePoint3D)
4. Last resort: classifyFace with centroid

All strategies use `pointInSolid` to determine if the face is inside/outside.

### 2.3 Selection Rules (lines 1558-1578)

```typescript
for (const { face, classification } of allFacesA) {
  let keep = false;
  if (op === 'union' && (classification === 'outside' || classification === 'on')) keep = true;
  if (op === 'subtract' && (classification === 'outside' || classification === 'on')) keep = true;
  if (op === 'intersect' && classification === 'inside') keep = true;
  
  if (keep) {
    selectedFaces.push(face);
    facesFromA.push(face);
  }
}
```

---

## Part 3: Critical Differences

| Aspect | OCCT | TypeScript |
|--------|------|------------|
| **When selection happens** | After all faces collected, during BuildRC/BuildSolid | Immediately after BuilderFace |
| **Selection basis** | Set membership (face in Args vs Tools) | pointInSolid classification |
| **Multiple sub-faces** | All kept, filtered by shared-face count | Each classified independently |
| **Shared interface faces** | Dropped via `aLSx.Extent() == 1` check | May be duplicated or misclassified |
| **Shell assembly** | BuilderSolid groups by connectivity | Faces selected, then stitched |
| **Deduplication** | Implicit via set operations | Edge-based, may miss cases |

---

## Part 4: The Missing OCCT Mechanism

### 4.1 Set-Based Selection

OCCT's `BuildRC` (lines 357-370) uses a fundamentally different approach:

```cpp
// For CUT: select faces that are in argument images but NOT in tool images
bContains = aMCheckExp.Contains(aS);
if (!bContains) {
  aBB.Add(aC, aS);
}
```

This is **topological**, not **geometric**. A sub-face from solid A that shares geometry with solid B's sub-face will still be selected if it's in A's image set.

### 4.2 Shared Interface Filtering

In `BuildSolid` (lines 661-677), shared interface faces are filtered:

```cpp
if (aLSx.Extent() == 1) {  // Only faces owned by ONE solid
  aSFS.Append(aFx);
}
```

This handles the case where both A and B produce the same sub-face at their interface — only one copy is kept, and it's selected based on which solid "owns" it.

### 4.3 BuilderSolid Reassembly

Rather than selecting individual faces, OCCT:
1. Collects ALL candidate faces
2. Filters shared-interface duplicates
3. Uses `BOPAlgo_ShellSplitter` to find closed shells from available faces
4. Classifies shells (not faces) as growth/hole

---

## Part 5: Proposed Changes

### 5.1 Option A: Translate OCCT Set-Based Selection

Replace `classifySubFace` with set membership tracking:

```typescript
// Track which solid each sub-face came from
const subFacesFromA: Map<Face, Face[]> = new Map(); // original → splits
const subFacesFromB: Map<Face, Face[]> = new Map();

// In selection:
for (const [original, splits] of subFacesFromA) {
  for (const split of splits) {
    const inToolSet = subFacesFromB.values().some(bs => 
      bs.some(s => facesGeometricallyEqual(s, split)));
    
    if (op === 'common' && inToolSet) keep(split);
    if (op === 'cut' && !inToolSet) keep(split);
    // etc.
  }
}
```

### 5.2 Option B: Implement Shared-Face Filtering

Before selection, identify and deduplicate shared interface faces:

```typescript
// After builderFace for both solids:
const faceOwnership = new Map<Face, 'A' | 'B' | 'both'>();

for (const fA of allSubFacesA) {
  for (const fB of allSubFacesB) {
    if (facesShareBoundary(fA, fB)) {
      faceOwnership.set(fA, 'both');
      faceOwnership.set(fB, 'both');
    }
  }
}

// In selection: skip 'both' faces or pick one based on operation
```

### 5.3 Option C: Implement BuilderSolid

Port OCCT's `BOPAlgo_BuilderSolid` approach:
1. Collect all candidate faces (no early classification)
2. Use shell splitter to find closed shells from edges
3. Classify shells as growth/hole
4. Select shells based on operation

This is the most faithful but most complex translation.

---

## Part 6: Recommendation

**Start with Option B** (shared-face filtering) as it's the smallest change that addresses the core issue:

1. After `builderFace` produces sub-faces for both solids, build a map of which faces are shared at the interface
2. For shared faces, select based on operation:
   - UNION: keep one copy from either solid (doesn't matter which)
   - CUT: keep A's copy if it's on the outside; drop B's copies at interface
   - INTERSECT: keep one copy if both solids contribute it
3. For non-shared faces, existing `classifySubFace` logic can remain

This preserves the current architecture while fixing the fundamental selection error.

---

## References

- `BOPAlgo_BOP.cxx`: Lines 221-248 (BuildResult), 257-392 (BuildRC), 513-695 (BuildSolid), 750-788 (MapFacesToBuildSolids)
- `BOPAlgo_Builder_2.cxx`: Lines 197-310 (BuildSplitFaces), 289-297 (storing areas)
- `BOPAlgo_BuilderSolid.cxx`: Lines 94-341 (PerformLoops), 388-539 (PerformAreas)
- `boolean.ts`: Lines 1450-1520 (face processing), 940-1100 (classifySubFace), 1558-1578 (selection rules)
