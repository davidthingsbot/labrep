# Boolean Pipeline Assembly — Seam Splitting Bugs

## Date: 2026-04-01

## Summary

Two bugs in `builder-face.ts` prevented correct face splitting on periodic surfaces (cylinders, cones, spheres) when intersection edges cross the UV seam. This blocked the through-hole test case (cylinder subtracted from box) and likely affects all boolean operations involving periodic surface splitting.

## Root Cause Analysis

### Bug 1: `resolvePCurveOccurrenceForUse` returns wrong PCurve for seam edge's second occurrence

A seam edge on a periodic surface (e.g., cylinder) appears **twice** in the boundary wire — once forward (occurrence 0, right seam at U=2π) and once reverse (occurrence 1, left seam at U=0). The edge has 2 PCurves: PCurve[0] at U=2π and PCurve[1] at U=0.

The function applied an OCCT-inspired "alternate PCurve for reversed edge" swap:
```
if (!forward) return (occurrence + 1) % count;
```

For the second wire appearance (occurrence=1, forward=false): `(1+1) % 2 = 0` → returned PCurve[0] (U=2π). **Wrong.** Should return PCurve[1] (U=0).

The swap is correct for the standard case (occurrence=0, forward=false → returns 1), but for occurrence > 0 the occurrence already maps correctly to the PCurve index.

**Fix:** Skip the swap when occurrence > 0:
```typescript
if (occurrence > 0) return occurrence;
return (occurrence + 1) % count;
```

### Bug 2: Intersection half-edges called `findOrAddVertex` with `seamSplit=false`

On periodic surfaces with seam splitting enabled, vertices at the same 3D position but different UV coordinates (U=0 vs U=2π) must be kept separate. Boundary edges correctly used `seamSplit=true`, but intersection half-edges hardcoded `false`:

```typescript
// Before (bug):
const startIdx = findOrAddVertex(vertices, vertices2D, startPt, startUV, false, ...);
// After (fix):
const startIdx = findOrAddVertex(vertices, vertices2D, startPt, startUV, seamSplit, ...);
```

This caused intersection circle edges (e.g., FFI circle at z=-5 on the cylinder) to have their start vertex (U=0, V=2) merged with the boundary vertex at (U=2π, V=2), creating self-loops instead of proper cross-seam edges.

## Impact

### Before fix:
- A cylinder with 2 splitting circles produced **1 sub-face** (no actual splitting)
- The through-hole test (box - cylinder) returned `success: false`
- **boolean-cad-objects.test.ts: 12/28 passing**

### After fix:
- A cylinder with 2 splitting circles correctly produces **3 sub-faces** (3 bands)
- The through-hole test passes 3/4 (volume accuracy still 10% off — separate issue)
- **boolean-cad-objects.test.ts: 15/28 passing**
- **builder-face.test.ts: 21/21 passing** (no regressions)
- **boolean.test.ts: 14/17 passing** (same 3 pre-existing failures)

## Remaining Issues

### Through-hole volume (10% error)
The result solid has correct topology (closed shell, correct face types, tessellates) but the Gauss-integration volume is 10% off. Likely a PCurve or winding issue on the cylindrical bore face affecting the `computeFaceVolume` boundary integral.

### Pipe fitting regression (cylCount=1, expected 2)
The inner cylinder bore face is classified as "inside" and flipped, but only 1 cylindrical face appears in the result (expected 2: outer + bore). Possible causes:
- `flipFace` fails on full cylindrical surfaces (seam edge + 2 PCurves)
- The flipped face's surface type changes or the face is dropped during shell assembly

### Other failing tests
- Spherical pocket: face count wrong (sphere faces not splitting correctly)
- Cylinder with flat: boolean fails (cylinder-box intersection on curved surface)
- T-pipe union: timeouts (complex perpendicular cylinder intersection)
- Volume errors on various tests

## Files Changed

- `generation/src/operations/builder-face.ts`:
  - `resolvePCurveOccurrenceForUse()`: Added `if (occurrence > 0) return occurrence;`
  - Intersection half-edge vertex creation: Changed `false` → `seamSplit`
