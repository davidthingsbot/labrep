# BOPTools_AlgoTools3D::PointInFace Translation Brief

**Date:** 2026-04-01  
**Author:** OCCT Critic Agent  
**Target:** Faithful TypeScript port of OCCT's PointInFace algorithm  
**OCCT Source:** `library/opencascade/src/ModelingAlgorithms/TKBO/BOPTools/BOPTools_AlgoTools3D.cxx` lines 885–1045  
**Supporting:** `IntTools_Context::Hatcher` (lines 343–395 of `IntTools_Context.cxx`)

---

## 1. Executive Summary

OCCT's `PointInFace` finds a guaranteed interior point on a face by shooting a 2D line in UV parameter space and finding where that line passes through the face interior. It uses a `Geom2dHatch_Hatcher` to intersect the probe line against the face boundary edges' 2D curves (pcurves).

The current TypeScript approximation (`hatchInteriorPoint2D` in `boolean.ts`) uses polygon approximations of the boundaries for ray casting. This is lossy for curved edges and doesn't use the FClass2d classifier for validation. The result: incorrect interior points for faces with curved boundaries, causing misclassification in the boolean pipeline.

---

## 2. OCCT Algorithm: Three Overloads

### 2.1 Overload 1: Face Only (lines 885–919)

```
PointInFace(face) → (point3D, point2D, error)
```

1. Get UV bounds: `uMin, uMax, vMin, vMax`
2. Compute probe X: `uX = IntermediatePoint(uMin, uMax)` (PAR_T = 0.43213918)
3. Create vertical 2D line: origin = `(uX, 0)`, direction = Y-axis
4. Call core overload (2.3) with this line
5. If error: retry with reflected X: `uX = uMax - (uX - uMin)`
6. Return result

### 2.2 Overload 2: From Edge (lines 921–968)

```
PointInFace(face, edge, paramT, dt2D) → (point3D, point2D, error)
```

1. Get edge's 2D curve on face (pcurve): `aC2D = CurveOnSurface(edge, face)`
2. Evaluate at paramT: get point `aP2D` and tangent `aV2D`
3. Compute inward normal: rotate tangent 90° CCW → `(-tangentY, tangentX)`
4. If edge is REVERSED: flip normal
5. If face is REVERSED: flip normal
6. Create ray: `Line2D(aP2D, inwardNormal)`, trimmed to `[0, Infinity)`
7. Call core overload (2.3) with this trimmed line and `dt2D`

### 2.3 Core Overload: With 2D Curve (lines 971–1045)

```
PointInFace(face, curve2D, dt2D) → (point3D, point2D, error)
```

**This is the core algorithm using the Hatcher:**

1. Get the face's Hatcher from context (pre-loaded with all boundary edge pcurves)
2. Clear existing hatchings, add the probe curve as a new hatching
3. `Trim()` — intersect the probe line with all boundary edges
4. Check `TrimDone` → error 1 if not
5. `ComputeDomains()` — find connected inside-intervals
6. Check `IsDone` → error 2 if not
7. Check `NbDomains > 0` → error 2 if none
8. Take first domain, check it has both endpoints → errors 3/4
9. Get domain endpoints: `v1 = firstPoint.Parameter()`, `v2 = secondPoint.Parameter()`
10. Compute interior parameter:
    - If `dt2D > 0` and `(v2 - v1) > dt2D`: use `v1 + dt2D` (stay near edge)
    - Else: use `IntermediatePoint(v1, v2)` (≈43% from v1)
11. Evaluate the 2D curve at this parameter → `point2D`
12. Evaluate the surface at `point2D` → `point3D`
13. Clean up hatching, return error code 0

### 2.4 The Hatcher Setup (IntTools_Context::Hatcher)

When the hatcher is first requested for a face:
1. Tolerances: `tolHatch2D = 1e-8`, `tolHatch3D = 1e-8`, `tolArcIntr = 1e-10`, `tolTangfIntr = 1e-10`
2. Orient face FORWARD
3. For each edge of the face:
   - Get its pcurve (2D curve on surface) with parameter range `[u1, u2]`
   - Skip null curves and degenerate ranges (`|u1 - u2| < PConfusion`)
   - Create a trimmed 2D curve `[u1, u2]`
   - Add to hatcher with the edge's orientation

---

## 3. Translation Strategy

### 3.1 What We CAN'T Port Directly

The `Geom2dHatch_Hatcher` is a full 2D curve-curve intersection engine (~1000 lines). Porting it entirely is disproportionate. However, we can **replicate its effect** for our use case:

- Our probe lines are always **straight lines** in UV space (vertical lines or rays from edge midpoints)
- Our face boundary curves are **pcurves** which we can sample at high resolution
- We need to find **parameter intervals** where the probe line is inside the face

### 3.2 Approach: Line-Polygon Hatching + FClass2d Validation

Instead of porting the full Hatcher, we will:

1. **Sample each boundary edge's pcurve** at high resolution to get boundary segments in UV
2. **Intersect the probe line** with these UV boundary segments (line-segment intersection — exact for line segments)
3. **Sort intersections** along the probe line parameter
4. **Determine inside/outside domains** using winding-number parity (even-odd rule with orientation)
5. **Validate** the chosen interior point using `FClass2d.perform()` — this is the key improvement

This is structurally identical to what `hatchInteriorPoint2D` does, but with two critical improvements:
- Uses **pcurve sampling** instead of polygon approximation of 3D boundary projected to UV
- Uses **FClass2d validation** to reject false interior points

### 3.3 Key Differences from Current Code

| Aspect | Current `hatchInteriorPoint2D` | New `pointInFace` |
|--------|-------------------------------|-------------------|
| Input | Polygon arrays (Pt2[]) | Face object directly |
| Boundary data | Pre-computed polygon in UV | Sample pcurves on demand |
| Probe direction | Always vertical (X-sweep) | Vertical OR from-edge inward normal |
| Retry logic | 5 hardcoded X values | OCCT: 2 tries with reflected X |
| Validation | `pointInFaceUV()` winding test | `FClass2d.perform()` |
| Edge-based entry | Not supported | Supported (overload 2) |
| dt2D offset | Not supported | Supported (stay near edge) |

---

## 4. Implementation Specification

### 4.1 File Location

Add to `generation/src/operations/boolean.ts` (or a new `point-in-face.ts` file — coder's choice, but must be imported into boolean.ts).

### 4.2 Functions to Implement

#### `pointInFace(face: Face): { point3D: Point3D; point2D: Pt2 } | null`

Mirrors OCCT overload 1 (lines 885–919):

```typescript
function pointInFace(face: Face): { point3D: Point3D; point2D: Pt2 } | null {
  // 1. Get UV bounds from face (use existing sampleFaceOuterWireUV or adapter bounds)
  // 2. Compute uX = intermediatePoint1D(uMin, uMax)
  // 3. Create vertical probe line: origin=(uX, 0), direction=(0, 1)
  // 4. Call pointInFaceWithLine(face, probe line)
  // 5. If failed: retry with uX = uMax - (uX - uMin)
  // 6. Return result or null
}
```

#### `pointInFaceFromEdge(face: Face, edge: Edge, forward: boolean, t: number, dt2D: number): { point3D: Point3D; point2D: Pt2 } | null`

Mirrors OCCT overload 2 (lines 921–968):

```typescript
function pointInFaceFromEdge(face, edge, forward, t, dt2D) {
  // 1. Find edge's pcurve on face.surface
  // 2. Evaluate pcurve at t → get point2D and tangent2D
  // 3. Compute inward normal: rotate tangent 90° CCW
  // 4. If edge is reversed (!forward): flip normal
  // 5. If face.surface needs reversal: flip normal (check face orientation convention)
  // 6. Create ray from point2D in normal direction
  // 7. Call pointInFaceWithLine(face, ray, dt2D)
}
```

#### `pointInFaceWithLine(face: Face, lineOrigin: Pt2, lineDir: Pt2, dt2D?: number): { point3D: Point3D; point2D: Pt2 } | null`

Mirrors OCCT core overload (lines 971–1045). This is the main function:

```typescript
function pointInFaceWithLine(face, lineOrigin, lineDir, dt2D = 0) {
  // 1. Collect all boundary UV segments by sampling pcurves of all edges
  //    in outerWire and innerWires
  // 2. For each segment, compute intersection with the probe line
  //    (parametric line-segment intersection)
  // 3. Collect intersection parameters along the probe line, sorted
  // 4. Build domains: consecutive pairs of intersections where the line
  //    is inside (using edge orientation / winding)
  // 5. If no domains found → return null (error)
  // 6. Take first domain [v1, v2]:
  //    - If dt2D > 0 and (v2 - v1) > dt2D: paramV = v1 + dt2D
  //    - Else: paramV = intermediatePoint1D(v1, v2)
  // 7. Compute UV point: lineOrigin + paramV * lineDir
  // 8. VALIDATE with FClass2d: new FClass2d(face, tolerance).perform(uvPoint)
  //    - If not 'in': try midpoint instead, or return null
  // 9. Evaluate surface at UV point → point3D
  // 10. Return { point3D, point2D }
}
```

### 4.3 Integration Points

Replace these call sites in `boolean.ts`:

1. **`faceProbePoint3D`** (line 400): Should call `pointInFace(face)` instead of `faceInteriorPoint2D(polygon, inners)`. The new function works directly with the face, not polygon approximations.

2. **`classifyFaceVsOtherSolid`** (lines ~1050-1280): Where it currently uses `faceProbePoint3D` as a fallback, it should prefer `pointInFace` as the primary method for finding a reliable interior point.

3. **The centroid computation** (lines ~1497+): Where it says "Following OCCT BOPTools_AlgoTools3D::PointInFace" — replace the edge-nudge heuristic with `pointInFace(face)`.

### 4.4 Sampling pcurves for Hatching

To get UV boundary segments, for each oriented edge in a wire:

```typescript
function sampleEdgePcurveUV(face: Face, oe: OrientedEdge, numSamples = 50): Pt2[] {
  const pc = oe.edge.pcurves.find(p => p.surface === face.surface);
  if (!pc) return [];
  const c2d = pc.curve2d;
  const pts: Pt2[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = c2d.startParam + (c2d.endParam - c2d.startParam) * (i / numSamples);
    const p = evaluateCurve2D(c2d, t);
    if (p) pts.push(p);
  }
  // Respect edge orientation
  if (!oe.forward) pts.reverse();
  return pts;
}
```

### 4.5 Line-Segment Intersection

For intersecting a parametric line `P(t) = origin + t * dir` with segment `[A, B]`:

```typescript
function intersectLineSegment(
  origin: Pt2, dir: Pt2, a: Pt2, b: Pt2
): number | null {
  // Solve: origin + t * dir = a + s * (b - a)
  // Returns t (parameter along probe line) if 0 <= s <= 1
  const dx = b.x - a.x, dy = b.y - a.y;
  const denom = dir.x * dy - dir.y * dx;
  if (Math.abs(denom) < 1e-14) return null; // parallel
  const s = (dir.x * (a.y - origin.y) - dir.y * (a.x - origin.x)) / denom;
  if (s < 0 || s > 1) return null;
  const t = (dx * (a.y - origin.y) - dy * (a.x - origin.x)) / denom;
  return t;
}
```

### 4.6 Domain Computation

After collecting all intersection t-values along the probe line, sorted:

```typescript
// Intersections sorted by t → [t0, t1, t2, t3, ...]
// Domains are consecutive pairs: [t0,t1], [t2,t3], ...
// Each domain is an "inside" interval (by even-odd parity with oriented edges)
// Take the first domain, compute midpoint or offset by dt2D
```

**Important:** OCCT's hatcher uses edge orientation to determine inside/outside. The even-odd interpretation is: after crossing an oriented boundary edge, you toggle inside/outside state. For a correctly oriented face (outer wire CCW, inner wires CW in UV), the first crossing going in the line direction enters the face.

### 4.7 FClass2d Validation

After finding a candidate UV point from the hatching:

```typescript
import { FClass2d } from './fclass2d';

const classifier = new FClass2d(face, 1e-7);
const state = classifier.perform(candidateUV);
if (state !== 'in') {
  // Try the midpoint of the domain instead
  // Or try next domain
  // Or return null
}
```

This is the key safety net. Even if our polygon-based hatching produces a slightly off point, FClass2d catches it.

---

## 5. What NOT to Do

1. **Do NOT port Geom2dHatch_Hatcher.** It's 1000+ lines of 2D curve intersection code. Our line-segment approach is sufficient since our probe lines are always straight.

2. **Do NOT keep the old `hatchInteriorPoint2D` as the primary path.** It should be superseded by `pointInFace`. The old function can remain as dead code or be removed.

3. **Do NOT invent new heuristics.** The retry logic is exactly: try one X, if it fails try reflected X. Two attempts max. No grid searches, no random sampling.

4. **Do NOT skip FClass2d validation.** The whole point of target #1 was to give us a proper classifier. Use it.

---

## 6. Existing Utilities to Use

- `intermediatePoint1D(a, b)` — already exists at line 276 of boolean.ts (PAR_T = 0.43213918)
- `evaluateCurve2D(curve, t)` — already exists for pcurve evaluation
- `toAdapter(surface)` — already exists for surface evaluation
- `FClass2d` from `./fclass2d` — completed in target #1
- `sampleFaceOuterWireUV(face)` / `sampleWireUV(face, wire)` — existing UV sampling (but these go through polygon approximation; prefer direct pcurve sampling for the hatching)

---

## 7. Test Expectations

The 17 failing tests in `boolean-cad-objects.test.ts` involve:
- Through-holes (cylinder through box) — needs correct interior point on annular planar faces
- Counterbore — sequential booleans need correct face classification
- Spherical pocket — needs interior point on curved cavity faces
- Mounting plate (4 bolt holes) — multiple inner wires
- Cylinder with flat — needs correct interior point on partial cylindrical face
- Sphere intersect box — needs interior point on truncated spherical face
- T-pipe (perpendicular cylinders) — curve-curve intersection on cylindrical surfaces

A correct `pointInFace` should improve classification for all of these, especially the planar-with-holes cases (through-hole, mounting plate) where the interior point must avoid holes, and the curved surface cases (sphere, cylinder) where polygon approximation is lossy.

---

## 8. Summary of Changes

1. **New function:** `pointInFace(face)` — OCCT overload 1
2. **New function:** `pointInFaceFromEdge(face, edge, forward, t, dt2D)` — OCCT overload 2
3. **New function:** `pointInFaceWithLine(face, origin, dir, dt2D)` — OCCT core
4. **New helper:** `sampleEdgePcurveUV(face, oe, n)` — pcurve sampling
5. **New helper:** `intersectLineSegment(origin, dir, a, b)` — line-segment intersection
6. **Replace:** `faceProbePoint3D` calls → use `pointInFace`
7. **Replace:** edge-nudge centroid logic → use `pointInFace`
8. **Add:** FClass2d validation at the point selection step
