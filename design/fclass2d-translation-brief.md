# IntTools_FClass2d Translation Brief

**Date:** 2026-04-01  
**Author:** OCCT Critic Agent  
**Target:** Faithful TypeScript port of OCCT's 2D face domain classifier  
**OCCT Source:** `library/opencascade/src/ModelingAlgorithms/TKBO/IntTools/IntTools_FClass2d.cxx` (892 lines)  
**Supporting:** `FoundationClasses/TKMath/CSLib/CSLib_Class2d.cxx` (~280 lines)

---

## 1. Executive Summary

The TypeScript codebase has **no equivalent** of `IntTools_FClass2d`. Instead it uses:
- `pointInFaceUV()` — a simple winding-number test with no tolerance, no periodic handling, no bad-wire detection, no ON-boundary detection
- `hatchInteriorPoint2D()` — an ad-hoc hatch that approximates `BOPTools_AlgoTools3D::PointInFace` but without using the actual hatcher against face boundaries
- `analyzeTemporaryWire()` in builder-face.ts — partial replication of `Init()` but missing adaptive re-discretization and proper CSLib_Class2d construction

The result: point classification is unreliable, especially for:
- Points near boundaries (no tolerance/ON detection)
- Periodic surfaces (no UV domain adjustment)  
- Faces with bad wires (no fallback classifier)
- Growth/hole classification in BuilderFace (wrong sign convention, no area/perimeter ratio check)

---

## 2. OCCT Architecture Overview

### 2.1 Data Flow

```
Face + Tolerance
      │
      ▼
IntTools_FClass2d::Init()
      │
      ├── For each Wire:
      │     ├── BRepTools_WireExplorer iterates edges in order
      │     ├── Sample each edge's pcurve (2D curve on surface) at N points
      │     ├── Track UV bounding box (Umin, Umax, Vmin, Vmax)
      │     ├── Filter degenerate 3D-coincident points
      │     ├── Compute FlecheU/FlecheV (max deflection)
      │     ├── Adaptive re-discretization if deflection > area/perimeter thickness
      │     └── Build CSLib_Class2d from sampled polygon
      │
      ├── TabClass[]: array of CSLib_Class2d (one per wire)
      ├── TabOrien[]: array of int (1=outer, 0=hole, -1=bad)
      └── U1/U2/V1/V2: periodic domain shift
```

### 2.2 Classification Flow (Perform)

```
Perform(Puv, RecadreOnPeriodic)
      │
      ├── If no TabClass → return IN
      │
      ├── If RecadreOnPeriodic:
      │     └── AdjustPeriodic(u, Umin, Umax, period) → shifted u
      │
      ├── Loop (periodic retry):
      │     ├── If TabOrien[0] != -1 (good wires):
      │     │     ├── For each wire n:
      │     │     │     ├── cur = TabClass[n].SiDans(Puv)
      │     │     │     ├── If cur=IN and wire is hole → OUTSIDE face
      │     │     │     ├── If cur=OUT and wire is outer → OUTSIDE face
      │     │     │     └── If cur=ON → fall through to BRepClass classifier
      │     │     └── If all pass → INSIDE face
      │     │
      │     └── If TabOrien[0] == -1 (bad wire):
      │           └── Use BRepClass_FaceClassifier directly
      │
      ├── If result is IN or ON → return immediately
      └── If OUT and periodic → shift UV and retry
```

---

## 3. CSLib_Class2d — The Polygon Classifier

### 3.1 Construction (OCCT lines: CSLib_Class2d.cxx, `init()` template)

1. **Validate**: UMax > UMin, VMax > VMin, points.Length >= 3. If not → pointsCount = 0.
2. **Normalize** all polygon points to [0,1] space: `(x - UMin) / (UMax - UMin)`
3. **Close polygon**: copy first point to last position (N+1 entries)
4. **Normalize tolerances**: `tolU /= (UMax - UMin)`, `tolV /= (VMax - VMin)`
5. Store: `myPnts2dX[]`, `myPnts2dY[]`, `myTolU`, `myTolV`, `myUMin/Max`, `myVMin/Max`

### 3.2 SiDans() — Classify with tolerance (OCCT: CSLib_Class2d.cxx ~line 120)

Returns: `Result_Inside(1)`, `Result_Outside(-1)`, `Result_Uncertain(0)`

1. **Quick reject**: if point is outside bbox + tolerance → OUTSIDE
2. **Transform** point to normalized coordinates
3. Call `internalSiDansOuOn(x, y)` → gets IN/OUT/ON
4. **If ON** → return UNCERTAIN (= on boundary)
5. **If tolerance > 0**: test 4 corner offsets `(x±tolU, y±tolV)` with `internalSiDans()`
   - If any corner disagrees with center → UNCERTAIN (near boundary)
6. Return IN or OUT

### 3.3 internalSiDansOuOn() — Ray casting with ON detection

1. Standard horizontal ray-casting (count crossings to +X∞)
2. **ON detection at vertices**: if `|dx| < tolU && |dy| < tolV` → UNCERTAIN
3. **ON detection at edges**: if point's X is between edge endpoints' X values, interpolate Y on the edge. If `|interpolatedY - pointY| < tolV` → UNCERTAIN
4. Count crossings using standard algorithm
5. Odd crossings → INSIDE, even → OUTSIDE

### 3.4 internalSiDans() — Pure ray casting (no ON)

Standard ray-casting only. Used for the tolerance corner tests.

### 3.5 SiDans_OnMode() — For TestOnRestriction

Same as SiDans but uses explicit tolerance parameter instead of stored myTolU/myTolV.

---

## 4. IntTools_FClass2d::Init() — Wire Tabulation

### 4.1 Algorithm (OCCT: IntTools_FClass2d.cxx lines 73-380)

For each wire in face (Forward orientation):

1. **Count edges** via TopExp_Explorer
2. **Iterate edges** via BRepTools_WireExplorer (respects wire ordering)
3. For each edge:
   a. Skip if orientation is INTERNAL or EXTERNAL
   b. Get pcurve: `BRep_Tool::CurveOnSurface(edge, face, pFirst, pLast)`
   c. **Degenerate check**:
      - `BRep_Tool::Degenerated(edge)` or `BRep_Tool::IsClosed(edge, face)`
      - Or: sample 10 points on 3D curve — if all within `0.25 * Precision::Confusion()²` of midpoint → degenerate
   d. **Compute sample count**: `nbs = Geom2dInt_Geom2dCurveTool::NbSamples(C)` then `if nbs > 2: nbs *= 4`
   e. **Sample parameters**: 
      - If FORWARD: u goes from pFirst to pLast
      - If REVERSED: u goes from pLast to pFirst (negative du)
      - Special case for nbs=2: insert point at 0.0025 from start
   f. **For each sample point**:
      - Evaluate 2D point on pcurve
      - Update Umin/Umax/Vmin/Vmax bounding box
      - **Filter**: if 3D distance to previous point < Precision::Confusion()², check midpoint too. If midpoint also coincident → skip (not a real curve segment)
      - Append to SeqPnt2d
      - **Compute deflection** (after 4+ points past edge start): max deviation of middle point from line through neighbors, tracked in FlecheU/FlecheV

4. **After all edges of wire**:
   - If NbEdges counter is nonzero (WireExplorer missed some) → BadWire
   - If SeqPnt2d.Length() <= 3 → BadWire
   - **Compute signed area** and perimeter: `Poly::PolygonProperties(SeqPnt2d, area, perimeter)`
   - **Adaptive re-discretization** (OCCT lines ~265-330):
     - `expectedThickness = max(2 * |area| / perimeter, 1e-7)`
     - `deflection = max(FlecheU, FlecheV)`
     - While `deflection > expectedThickness`:
       - Re-sample all edges using `GCPnts_QuasiUniformDeflection` with tighter tolerance
       - `discreteDeflection *= 0.1` each iteration
     - This prevents self-intersecting polygons from crude sampling
   - **If area ≈ 0** (< Precision::SquareConfusion()) → BadWire
   - **Orientation**: area > 0 → outer (TabOrien=1, isHole=false), area < 0 → hole (TabOrien=0, isHole=true)
   - **Create CSLib_Class2d** from SeqPnt2d with FlecheU/FlecheV as tolerances (clamped to >= Toluv)

5. **Periodic surface handling** (OCCT lines ~370-395):
   - For revolution surfaces (cone, cylinder, torus, sphere, surface of revolution):
     - `U1 = Umin - (2π - (Umax-Umin))/2`
     - `U2 = U1 + 2π`
   - For torus additionally:
     - `V1 = Vmin - (2π - (Vmax-Vmin))/2`
     - `V2 = V1 + 2π`
   - Otherwise U1=U2=0, V1=V2=0

---

## 5. Perform() — Point Classification

### 5.1 Algorithm (OCCT lines ~400-520)

```
function Perform(Puv, RecadreOnPeriodic = true):
  if TabClass.length == 0: return IN
  
  u = Puv.x; v = Puv.y
  uu = u; vv = v
  
  // Get surface info
  IsUPer = surface.IsUPeriodic()
  IsVPer = surface.IsVPeriodic()
  uperiod = IsUPer ? surface.UPeriod() : 0
  vperiod = IsVPer ? surface.VPeriod() : 0
  
  if RecadreOnPeriodic:
    if IsUPer: uu = AdjustPeriodic(uu, Umin, Umax, uperiod)
    if IsVPer: vv = AdjustPeriodic(vv, Vmin, Vmax, vperiod)
  
  urecadre = false; vrecadre = false
  
  loop:
    dedans = 1  // assume inside
    Puv = (u, v)
    
    if TabOrien[0] != -1:  // good wires
      for n = 0..nbtabclass-1:
        cur = TabClass[n].SiDans(Puv)
        if cur == 1:        // point inside this polygon
          if TabOrien[n] == 0: dedans = -1; break  // inside a HOLE → outside face
        elif cur == -1:     // point outside this polygon
          if TabOrien[n] == 1: dedans = -1; break  // outside an OUTER → outside face
        else:               // ON boundary
          dedans = 0; break
      
      if dedans == 0: useClassifier = true
      else: status = dedans==1 ? IN : OUT
    else:
      useClassifier = true  // bad wire fallback
    
    if useClassifier:
      // BRepClass_FaceClassifier with computed tolerance
      aURes = surface.UResolution(Toluv)
      aVRes = surface.VResolution(Toluv)
      bUIn = u >= Umin && u <= Umax
      bVIn = v >= Vmin && v <= Vmax
      if bUIn == bVIn: fcTol = min(aURes, aVRes)
      else: fcTol = !bUIn ? aURes : aVRes
      status = BRepClass_FaceClassifier(face, Puv, fcTol)
    
    if !RecadreOnPeriodic || (!IsUPer && !IsVPer): return status
    if status == IN || status == ON: return status
    
    // Periodic retry: shift u, then v
    if !urecadre: u = uu; urecadre = true
    else: if IsUPer: u += uperiod
    
    if u > Umax || !IsUPer:
      if !vrecadre: v = vv; vrecadre = true
      else: if IsVPer: v += vperiod
      u = uu
      if v > Vmax || !IsVPer: return status
```

### 5.2 Key Insight: The Wire Logic

The classification logic is **not** simple point-in-polygon. It's:
- For each wire (which may be outer or hole):
  - CSLib_Class2d tells us if the point is inside/outside/on *that wire's polygon*
  - If the point is **inside a hole wire** → the point is **outside the face**
  - If the point is **outside an outer wire** → the point is **outside the face**
  - If all wires agree the point is inside the face domain → **inside the face**
  - If any result is ON → fall through to precise BRepClass classifier

This is fundamentally different from the TypeScript `pointInFaceUV()` which does winding number on outer then checks inner polygons separately.

---

## 6. TypeScript Divergences — What Must Change

### 6.1 `pointInFaceUV()` (boolean.ts:637)

**Current:** Simple winding number test. Returns boolean (no IN/OUT/ON).  
**Problems:**
- No tolerance handling (no ON detection)
- No periodic UV adjustment
- No bad wire fallback
- No CSLib_Class2d equivalent (no normalized coordinates, no deflection-based tolerance)
- Returns `true` if winding ≠ 0 for outer and winding == 0 for all inner — this is roughly correct for the IN case but misses ON entirely

**Action:** Replace with `FClass2d.perform()` that returns `'in' | 'out' | 'on'`

### 6.2 `hatchInteriorPoint2D()` (boolean.ts:279)

**Current:** Tries several X values, computes Y-domains by intersecting a vertical line with all ring boundaries, then picks a point inside a domain.  
**Problems:**
- Uses `pointInFaceUV` to validate (which has the problems above)
- Not the OCCT approach — OCCT's `PointInFace` uses `Geom2dHatch_Hatcher` which intersects a line with the actual face boundary curves, not polygons
- However, for the TypeScript port where we work with sampled polygons, this hatching approach is actually reasonable for finding interior points

**Action:** Keep the general approach but ensure it uses the improved classifier for validation.

### 6.3 `analyzeTemporaryWire()` (builder-face.ts:1798)

**Current:** Samples wire polygon, computes signed area and deflection, has badWire detection.  
**Problems:**
- Missing adaptive re-discretization (the OCCT loop that tightens sampling when deflection > expectedThickness)
- badWire condition is too aggressive (rejects near-zero area faces that OCCT would handle with fallback)
- `isHole` derived from `signedArea < 0` — this is correct for OCCT's convention (CCW=positive=outer on a forward face), but the polygon sampling must be consistent with this

**Action:** Add adaptive re-discretization. Soften badWire to match OCCT exactly.

### 6.4 `loopClassificationPoint()` (builder-face.ts:2103)

**Current:** Takes edge midpoint in UV as classification point.  
**Problems:**
- OCCT's `IsInside()` (BuilderFace.cxx:829) does the same (midpoint of pcurve), so this is actually close
- But it doesn't check for degenerate edges or shared edges, which OCCT does

**Action:** Add degenerate/shared-edge filtering per OCCT `IsInside()`.

---

## 7. Implementation Plan

### 7.1 New Class: `FClass2d`

Create a new file: `generation/src/operations/fclass2d.ts`

```typescript
interface FClass2dWireEntry {
  classifier: Class2d;    // CSLib_Class2d equivalent
  orientation: 1 | 0 | -1; // 1=outer, 0=hole, -1=bad
}

interface FClass2dResult {
  state: 'in' | 'out' | 'on';
}

class FClass2d {
  private wires: FClass2dWireEntry[];
  private toluv: number;
  private uMin: number;
  private uMax: number;
  private vMin: number;
  private vMax: number;
  private u1: number; // periodic shift
  private u2: number;
  private v1: number;
  private v2: number;
  private isHole: boolean;
  private face: Face;
  
  constructor(face: Face, tolUV: number);
  perform(puv: Pt2, recadreOnPeriodic?: boolean): 'in' | 'out' | 'on';
  performInfinitePoint(): 'in' | 'out' | 'on';
  testOnRestriction(puv: Pt2, tol: number, recadreOnPeriodic?: boolean): 'in' | 'out' | 'on';
  get isHoleWire(): boolean;
}
```

### 7.2 New Class: `Class2d` (CSLib_Class2d equivalent)

```typescript
class Class2d {
  private pnts2dX: number[];  // normalized X coordinates
  private pnts2dY: number[];  // normalized Y coordinates  
  private pointsCount: number;
  private tolU: number;       // normalized tolerance
  private tolV: number;
  private uMin: number;
  private uMax: number;
  private vMin: number;
  private vMax: number;
  
  constructor(
    points: Pt2[],     // or NCollection_Sequence equivalent
    tolU: number,
    tolV: number,
    uMin: number, vMin: number,
    uMax: number, vMax: number,
  );
  
  siDans(point: Pt2): 1 | -1 | 0;        // inside/outside/uncertain
  siDansOnMode(point: Pt2, tol: number): 1 | -1 | 0;
  
  private internalSiDans(px: number, py: number): boolean;
  private internalSiDansOuOn(px: number, py: number): 1 | -1 | 0;
}
```

### 7.3 Wire Sampling for Init()

Map OCCT concepts to TypeScript:

| OCCT | TypeScript |
|------|-----------|
| `BRepTools_WireExplorer` | Iterate `wire.edges` in order |
| `BRep_Tool::CurveOnSurface` → pcurve | `findPCurveForUse(edge, surface)` → evaluate |
| `BRepAdaptor_Curve2d::Value(u)` | `evaluateCurve2D(pcurve, t)` |
| `BRepAdaptor_Curve::Value(u)` | `evaluateCurveAt(edge.curve, t)` |
| `BRep_Tool::Degenerated(edge)` | `edge.degenerate` |
| `BRep_Tool::IsClosed(edge, face)` | Check if edge is a seam (same edge used for two pcurves) |
| `Geom2dInt_Geom2dCurveTool::NbSamples` | Estimate based on curve type (line=2, circle=~24, bspline=degree*spans) |
| `GCPnts_QuasiUniformDeflection` | Adaptive sampling with deflection control |
| `Poly::PolygonProperties` | `polygonSignedAreaRaw()` + `polygonPerimeterRaw()` (already exist) |
| `TopExp::Vertices(edge, Va, Vb)` | `edgeStartPoint(edge)`, `edgeEndPoint(edge)` |
| `Precision::Confusion()` | `1e-7` (or existing project constant) |
| `Precision::SquareConfusion()` | `1e-14` |

### 7.4 Periodic Surface Handling

For `AdjustPeriodic(u, uMin, uMax, period)`:
```typescript
function adjustPeriodic(u: number, uMin: number, uMax: number, period: number): number {
  // Shift u into [uMin, uMax] range using period
  if (period <= 0) return u;
  while (u < uMin) u += period;
  while (u > uMax) u -= period;
  // OCCT's GeomInt::AdjustPeriodic is more nuanced — check exact implementation
  return u;
}
```

### 7.5 Surface Type Detection for Periodic Shifts

```typescript
function isRevolutionSurface(surface: Surface): boolean {
  return surface.type === 'cylindrical' || surface.type === 'conical' 
    || surface.type === 'spherical' || surface.type === 'toroidal'
    || surface.type === 'surface-of-revolution';
}
```

---

## 8. Function Signatures to Implement

### 8.1 `fclass2d.ts` — New file

```typescript
// ═══════════════════════════════════════════════════════
// CSLib_Class2d equivalent — 2D polygon point classifier
// OCCT ref: FoundationClasses/TKMath/CSLib/CSLib_Class2d.cxx
// ═══════════════════════════════════════════════════════

export type ClassifyResult = 1 | -1 | 0;  // inside | outside | on-boundary

export class Class2d {
  // Constructor: OCCT CSLib_Class2d::init() template
  // Takes sampled 2D polygon, deflection tolerances, and UV bounding box
  constructor(points: Pt2[], tolU: number, tolV: number, 
              uMin: number, vMin: number, uMax: number, vMax: number);
  
  // OCCT: CSLib_Class2d::SiDans
  siDans(point: Pt2): ClassifyResult;
  
  // OCCT: CSLib_Class2d::SiDans_OnMode  
  siDansOnMode(point: Pt2, tol: number): ClassifyResult;
}

// ═══════════════════════════════════════════════════════
// IntTools_FClass2d equivalent — face domain classifier
// OCCT ref: ModelingAlgorithms/TKBO/IntTools/IntTools_FClass2d.cxx
// ═══════════════════════════════════════════════════════

export type FaceClassifyState = 'in' | 'out' | 'on';

export class FClass2d {
  // OCCT: IntTools_FClass2d(face, tolUV) → calls Init
  constructor(face: Face, tolUV: number);
  
  // OCCT: IntTools_FClass2d::Perform
  perform(puv: Pt2, recadreOnPeriodic?: boolean): FaceClassifyState;
  
  // OCCT: IntTools_FClass2d::PerformInfinitePoint
  performInfinitePoint(): FaceClassifyState;
  
  // OCCT: IntTools_FClass2d::TestOnRestriction
  testOnRestriction(puv: Pt2, tol: number, recadreOnPeriodic?: boolean): FaceClassifyState;
  
  // OCCT: IntTools_FClass2d::IsHole
  get isHole(): boolean;
}
```

### 8.2 Updates to `boolean.ts`

Replace `pointInFaceUV()` calls with `FClass2d.perform()`:
- Where current code does `pointInFaceUV(pt, outer, inner)` returning boolean
- New code: create `FClass2d` for the face, call `perform(pt)`, check result

Replace `faceProbePoint3D()` to use the hatch approach from `BOPTools_AlgoTools3D::PointInFace`:
- Construct a vertical line at `IntermediatePoint(uMin, uMax)` in UV
- Intersect with face boundary polygon to find domains  
- Pick `IntermediatePoint(v1, v2)` of first domain
- Evaluate surface at that UV → 3D point

### 8.3 Updates to `builder-face.ts`

In `analyzeTemporaryWire()`:
- Add adaptive re-discretization loop (OCCT lines 265-330)
- Match OCCT's badWire criteria exactly

In the growth/hole classification:
- Use `FClass2d.isHole` instead of `signedArea < 0` directly
- Match OCCT's `IsGrowthWire()` + `FClass2d.IsHole()` two-step check

In `loopInsideOuter()` / `IsInside()`:
- Use `FClass2d.perform()` for proper classification with tolerance

---

## 9. Edge Cases OCCT Handles That We Don't

1. **Degenerate edge detection** (lines 131-167): OCCT samples 10 points on 3D curve to detect edges that appear non-degenerate but actually collapse to a point. We only check `edge.degenerate`.

2. **Adaptive re-discretization** (lines 265-330): When polygon deflection exceeds the area/perimeter thickness ratio, OCCT iteratively re-samples with `GCPnts_QuasiUniformDeflection`. We don't re-sample.

3. **3D point filtering** (lines 195-225): OCCT skips 2D sample points when their 3D positions coincide with the previous point (within Precision::Confusion²). This avoids duplicate polygon vertices from seam edges. We don't filter.

4. **Closed edge handling** (line 133): `BRep_Tool::IsClosed(edge, face)` detects seam edges (same edge with two pcurves on a periodic surface). We don't handle this in the classifier.

5. **Tolerance corner test** (CSLib_Class2d::SiDans): Testing 4 corner offsets to detect near-boundary points. We have no ON detection at all.

6. **Periodic UV retry loop** (lines 480-520): If classification returns OUT on a periodic surface, OCCT shifts the point by the period and retries. We do ad-hoc periodic normalization but not this systematic retry.

7. **BRepClass_FaceClassifier fallback** (lines 460-475): When polygon classification gives ON or bad wire, OCCT falls back to a precise curve-based classifier. We have no fallback.

8. **Wire edge count validation** (lines 240-250): If BRepTools_WireExplorer misses edges that TopExp_Explorer found, the wire is marked bad. We don't check this.

9. **FlecheU/FlecheV clamping** (line 340): Deflection tolerances are clamped to be >= Toluv. Without this, the CSLib_Class2d tolerance can be too small.

10. **Vertex tolerance tracking** (lines 140-155): OCCT tracks the max vertex tolerance across the wire. Our code doesn't factor vertex tolerances into classification.

---

## 10. OCCT Line References for Cross-Checking

| Concept | File | Lines |
|---------|------|-------|
| Init: wire iteration | IntTools_FClass2d.cxx | 73-100 |
| Init: edge sampling | IntTools_FClass2d.cxx | 100-240 |
| Init: degenerate check | IntTools_FClass2d.cxx | 131-167 |
| Init: 3D point filtering | IntTools_FClass2d.cxx | 195-225 |
| Init: deflection computation | IntTools_FClass2d.cxx | 226-240 |
| Init: adaptive re-discretization | IntTools_FClass2d.cxx | 265-330 |
| Init: signed area / orientation | IntTools_FClass2d.cxx | 332-360 |
| Init: periodic domain | IntTools_FClass2d.cxx | 370-395 |
| Perform: main logic | IntTools_FClass2d.cxx | 400-520 |
| Perform: periodic retry | IntTools_FClass2d.cxx | 480-520 |
| TestOnRestriction | IntTools_FClass2d.cxx | 525-620 |
| CSLib_Class2d: init | CSLib_Class2d.cxx | 40-90 |
| CSLib_Class2d: SiDans | CSLib_Class2d.cxx | 120-160 |
| CSLib_Class2d: internalSiDansOuOn | CSLib_Class2d.cxx | 200-280 |
| CSLib_Class2d: internalSiDans | CSLib_Class2d.cxx | 165-200 |
| BuilderFace: IsHole usage | BOPAlgo_BuilderFace.cxx | 443-450 |
| BuilderFace: IsInside | BOPAlgo_BuilderFace.cxx | 829-860 |
| BuilderFace: IsGrowthWire | BOPAlgo_BuilderFace.cxx | 863-877 |
| PointInFace: line hatch | BOPTools_AlgoTools3D.cxx | 971-1045 |

---

## 11. Testing Strategy

After implementation:

1. Run the full test suite: `npx vitest run tests/operations/`
2. Focus especially on:
   - `tests/operations/cad-objects.test.ts` — the 17 failing tests
   - `tests/operations/boolean-*.test.ts` — boolean pipeline tests  
   - Tests involving cylindrical/toroidal faces (periodic surfaces)
3. **Baseline before changes**: 140 failures / 465 tests in operations suite
4. **Goal**: Reduce failures, especially in cad-objects

---

## 12. What NOT to Implement

1. **BRepClass_FaceClassifier fallback**: This is a full curve-based classifier that intersects a ray with actual face boundaries (not polygons). It's complex and rarely needed — the polygon classifier with proper tolerances handles 99%+ of cases. Skip for now; if tests still fail due to ON-boundary points, we can add it later.

2. **Geom2dHatch_Hatcher**: The hatcher is used in `PointInFace`, not in `FClass2d` itself. Our existing `hatchInteriorPoint2D` approximation is good enough for finding interior points — the real fix is in the classifier.

3. **D1 derivatives at edge junctions**: OCCT stores derivatives (`aD1Prev`, `aD1Next`) at wire junction points (lines 240-260). These seem to be for future use or debugging — they're not used in classification.

---

## 13. Priority Order

1. **Class2d** (CSLib_Class2d port) — foundation, used by everything
2. **FClass2d.init()** — wire tabulation with proper sampling
3. **FClass2d.perform()** — classification with periodic retry
4. **Update builder-face.ts** — use FClass2d for growth/hole classification
5. **Update boolean.ts** — replace pointInFaceUV with FClass2d.perform()
6. **Run tests** — verify improvement
