# BuilderFace Non-Planar/Periodic Surface Translation Brief

## Problem Statement

`builder-face.ts` correctly traces wire loops (PerformLoops equivalent) but fails at **PerformAreas** — the growth/hole classification and hole-to-face assignment — on non-planar/periodic surfaces (cylinders, spheres, cones).

The through-hole test (cylinder subtracted from box) produces 2 intersection edges on the cylindrical side face, but BuilderFace produces only 1 subface instead of 3. The root cause: the growth/hole classification uses polygon signed-area heuristics instead of OCCT's `IntTools_FClass2d`.

## Key Finding: FClass2d Exists But Is Not Used

`fclass2d.ts` (1031 lines) is a faithful translation of OCCT's `IntTools_FClass2d`. It provides:
- `constructor(face: Face, tolUV: number)` — initializes from face wires
- `perform(puv: Pt2, recadreOnPeriodic?: boolean): FaceClassifyState` — point classification
- `isHole: boolean` — whether the face's outer wire encloses a hole
- `performInfinitePoint(): FaceClassifyState` — infinite point classification

**It is imported on line 21 but never instantiated.** All classification is done via ad-hoc polygon area checks.

## OCCT PerformAreas Algorithm (BOPAlgo_BuilderFace.cxx lines 417-600)

```
For each wire loop:
  1. Create temporary face: MakeFace(aFace, aS, aLoc, aTol); Add(aFace, aWire)
  2. Quick check: IsGrowthWire(aWire, aMHE) — if wire contains hole edges, it's growth
  3. If not quick-determined: IntTools_FClass2d& aClsf = myContext->FClass2d(aFace)
     bIsGrowth = !aClsf.IsHole()
  4. Growth → aNewFaces; Hole → aHoleFaces + add wire edges to aMHE

For hole assignment:
  1. Build 2D bounding-box tree of hole faces
  2. For each growth face: find hole faces whose boxes overlap
  3. For each candidate: IsInside(aHole, aFace, myContext) — uses FClass2d::Perform()
  4. Keep innermost containing growth face for each hole
  5. Add hole wires to their growth faces
  6. Re-initialize FClass2d on the final faces: myContext->FClass2d(aFace).Init(aFace, aTol)
```

## OCCT IsInside Algorithm (BOPAlgo_BuilderFace.cxx lines 793-838)

```
IsInside(theWire, theF, theContext):
  1. Get face edge set: TopExp::MapShapes(theF, TopAbs_EDGE, aFaceEdgesMap)
  2. Get FClass2d: IntTools_FClass2d& aClassifier = theContext->FClass2d(aF)
  3. For each wire edge (skip degenerated, return false if face contains edge):
     a. Get 2D curve: BRep_Tool::CurveOnSurface(aE, aF, aT1, aT2)
     b. Get midpoint: aP2D = aC2D->Value((aT1 + aT2) / 2.)
     c. Classify: aState = aClassifier.Perform(aP2D)
     d. return (aState == TopAbs_IN)
```

## Current TypeScript Divergences

### 1. Growth/Hole Classification (Critical)
**OCCT:** Creates temp face per wire, calls `FClass2d.isHole` on the temp face.
**Current TS:** `analyzeTemporaryWire()` computes polygon signed area in raw UV space. On periodic surfaces, UV polygons wrap across seams, giving wrong areas and wrong hole/growth decisions.

### 2. IsInside / Hole Assignment (Critical)
**OCCT:** Uses `FClass2d.perform()` to classify a wire midpoint against a face's classifier.
**Current TS:** `loopInsideOuter()` uses `pointInPolygonUV()` — naive 2D point-in-polygon on UV-sampled polygons. Breaks on periodic surfaces where UV wrapping confuses containment.

### 3. Missing Temp Face Construction
**OCCT:** For each wire loop, constructs an actual temporary `TopoDS_Face` with the wire added, then initializes FClass2d on that face.
**Current TS:** Never creates temporary faces for classification. The FClass2d class expects a `Face` object with wires.

### 4. Missing Re-initialization After Hole Addition
**OCCT:** After adding holes to growth faces, re-initializes FClass2d: `myContext->FClass2d(aFace).Init(aFace, aTol)`
**Current TS:** No such step exists.

## Translation Plan

### Step 1: Create temporary Face objects for each wire loop
After tracing loops and building wires, create a temporary `Face` for each wire:
```typescript
const tempFace = makeFace(surface, wire, []);
```
This gives FClass2d a proper face to analyze.

### Step 2: Replace growth/hole classification with FClass2d.isHole
```typescript
// CURRENT (wrong on periodic):
const analysis = analyzeTemporaryWire(wire, surface, adapter, periodic);
const isGrowth = !analysis.isHole;

// REPLACE WITH:
const tempFaceResult = makeFace(surface, wire, []);
if (!tempFaceResult.success) continue;
const tempFace = tempFaceResult.result!;
let isGrowth = isGrowthWire(wire, holeEdgeSet); // quick check first
if (!isGrowth) {
  const classifier = new FClass2d(tempFace, TOL);
  isGrowth = !classifier.isHole;
}
```

### Step 3: Replace loopInsideOuter with FClass2d-based IsInside
```typescript
function isInsideFace(holeWire: Wire, outerFace: Face, surface: Surface): boolean {
  // Get edges of the outer face
  const faceEdges = new Set<Edge>();
  for (const oe of outerFace.outerWire.edges) faceEdges.add(oe.edge);
  for (const iw of outerFace.innerWires) 
    for (const oe of iw.edges) faceEdges.add(oe.edge);
  
  const classifier = new FClass2d(outerFace, TOL);
  
  for (const oe of holeWire.edges) {
    if (oe.edge.degenerate) continue;
    if (faceEdges.has(oe.edge)) return false; // shared edge → not inside
    
    // Get midpoint on PCurve
    const pc = findPCurveForUse(oe.edge, surface, oe.forward, 0);
    if (!pc) continue;
    const mid = evaluateCurve2D(pc.curve2d, 
      (pc.curve2d.startParam + pc.curve2d.endParam) / 2);
    
    const state = classifier.perform(mid, true);
    return state === 'IN';
  }
  return false;
}
```

### Step 4: Simplify hole assignment 
Replace the complex `loopInsideOuter` with the FClass2d-based `isInsideFace`. Keep the innermost-containing-face logic (find the most-inner growth face for each hole).

### Step 5: Re-initialize classifiers after hole addition
After adding hole wires to growth faces, the face geometry changes. OCCT re-initializes the classifier. We should do the same if we cache classifiers.

## What NOT to Change

- **Wire loop tracing** (traceBuilderFace / Path equivalent) — this is working correctly
- **Angle computation** (tangentAngle / Angle2D) — already OCCT-aligned
- **RefineAngles** — already translated
- **filterShapesToAvoid** (PerformShapesToAvoid) — working
- **The FClass2d class itself** — already translated faithfully

## Files to Modify

1. **`generation/src/operations/builder-face.ts`** — the `builderFace()` function's PerformAreas section (lines ~2107-2540)

## Test Command

```bash
npx vitest run generation/tests/operations/boolean-cad-objects.test.ts
```

Current: 11 passed, 17 failed
Target: Through-hole test passes (4 tests in that group)

## Critical Constraint

Translate faithfully from OCCT. No heuristic shortcuts. The FClass2d foundation is ready — use it.
