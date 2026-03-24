# Phase 10: Sketch on Face — Design Document

## Overview

Phase 10 enables creating 2D sketches on faces of existing solids, rather than only on standard planes. This is the bridge between single-feature solids and multi-feature CAD modeling. With this capability, the workflow becomes: extrude a box → sketch a circle on its top face → extrude-cut a hole through it.

**Exit Criteria:** Can create a sketch on any planar face of a solid, project that face's boundary edges as construction geometry, and lift the resulting 2D profile back to 3D for further operations.

---

## OCCT Reference

| labrep | OCCT | Notes |
|--------|------|-------|
| `getPlaneFromFace` | `BRep_Tool::Surface` + downcast to `Geom_Plane` | OCCT stores surface on face, checks if it's a plane |
| `worldToSketch` | `ElSLib::PlaneParameters` | Maps 3D point to (u,v) on plane |
| `sketchToWorld` | `ElSLib::PlaneValue` | Maps (u,v) to 3D point on plane |
| `projectEdgeToSketch` | `BRepAlgo_NormalProjection` | Projects curves onto surface |
| `liftProfile2DToProfile3D` | `BRepBuilderAPI_MakeFace` + wire | Constructs face/wire on plane |

---

## Step 1: Coordinate Transforms (core/plane.ts)

Two general-purpose functions for converting between 3D world coordinates and 2D local coordinates on any plane.

### `worldToSketch(pl: Plane, pt: Point3D): Point2D`

```typescript
// Compute displacement from plane origin
const d = subtractPoints(pt, pl.origin);
const yAxis = cross(pl.normal, pl.xAxis);
return point2d(dot(d, pl.xAxis), dot(d, yAxis));
```

Projects the 3D point orthogonally onto the plane's local frame. If the point is off-plane, the normal component is discarded (same as `projectPoint` but returns 2D).

### `sketchToWorld(pl: Plane, pt: Point2D): Point3D`

```typescript
const yAxis = cross(pl.normal, pl.xAxis);
return point3d(
  pl.origin.x + pt.x * pl.xAxis.x + pt.y * yAxis.x,
  pl.origin.y + pt.x * pl.xAxis.y + pt.y * yAxis.y,
  pl.origin.z + pt.x * pl.xAxis.z + pt.y * yAxis.z,
);
```

Lifts 2D coordinates back to 3D world space on the plane.

**Round-trip property:** `sketchToWorld(pl, worldToSketch(pl, pt))` equals `projectPoint(pl, pt)` for any point.

---

## Step 2: getPlaneFromFace

### `getPlaneFromFace(face: Face): OperationResult<Plane>`

| Surface type | Result |
|-------------|--------|
| `plane` | `success(face.surface.plane)` |
| `extrusion` | Canonicalize → if PlaneSurface, return its plane; otherwise failure |
| `cylinder` | `failure('Cannot sketch on cylindrical face')` |
| `sphere` | `failure('Cannot sketch on spherical face')` |
| `cone` | `failure('Cannot sketch on conical face')` |
| `torus` | `failure('Cannot sketch on toroidal face')` |
| `revolution` | `failure('Cannot sketch on revolution surface face')` |

---

## Step 3: Edge Projection

### `projectEdgeToSketch(edge: Edge, pl: Plane): OperationResult<Curve2D>`

| Edge curve type | Projection |
|----------------|-----------|
| `line3d` | Project start/end via `worldToSketch` → `makeLine2D`. Fail if projected points are coincident (edge perpendicular to plane). |
| `circle3d` | Check circle plane is parallel to sketch plane (`\|dot(normals)\| > 1 - ε`). If parallel: project center, keep radius → `makeCircle2D`. If not parallel: fail ("would be ellipse, unsupported"). |
| `arc3d` | Same parallelism check. If parallel: project center, compute angle offset between arc xAxis and sketch xAxis, adjust start/end angles → `makeArc2D`. If not parallel: fail. |

### `projectWireToSketch(wire: Wire, pl: Plane): OperationResult<Curve2D[]>`

Iterates wire edges, projects each. Returns array of 2D curves or first failure.

---

## Step 4: Create Sketch on Face

### `createSketchOnFace(face: Face, options?: { projectBoundary?: boolean }): OperationResult<Sketch>`

1. `getPlaneFromFace(face)` → get the plane
2. `createSketch(plane)` → empty sketch
3. If `projectBoundary`:
   - Project each edge of `face.outerWire` → add as construction elements
   - Project each edge of `face.innerWires` → add as construction elements
   - Edges that fail projection (non-parallel circles, degenerate lines) are skipped with warnings
4. Return sketch (with warnings if any edges were skipped)

---

## Step 5: Profile Lifting (2D → 3D)

### `liftCurve2DToWorld(curve: Curve2D, pl: Plane): OperationResult<Curve3D>`

| 2D curve type | 3D result |
|--------------|-----------|
| `line` | `sketchToWorld` on both endpoints → `makeLine3D` |
| `circle` | Build 3D circle plane: center = `sketchToWorld(center2d)`, normal = `pl.normal`, xAxis = `pl.xAxis` → `makeCircle3D(circlePlane, radius)` |
| `arc` | Same plane construction → `makeArc3D(circlePlane, radius, startAngle, endAngle)` |

### `liftWire2DToWire3D(wire2d: Wire2D, pl: Plane): OperationResult<Wire>`

For each curve in wire2d: `liftCurve2DToWorld` → `makeEdgeFromCurve` → `orientEdge(edge, true)`. Collect into `makeWire`.

### `liftProfile2DToProfile3D(profile: Profile2D, pl: Plane): OperationResult<{ outerWire: Wire; innerWires: Wire[] }>`

Lift outer wire and each hole wire using `liftWire2DToWire3D`.

---

## Step 6: Tests (TDD)

### Coordinate transforms (`tests/core/plane.test.ts` — extend existing)

1. `worldToSketch` on XY_PLANE: `point3d(3, 4, 0)` → `point2d(3, 4)`
2. `worldToSketch` on XY_PLANE for off-plane point: `point3d(3, 4, 7)` → `point2d(3, 4)` (z discarded)
3. `sketchToWorld` on XY_PLANE: `point2d(3, 4)` → `point3d(3, 4, 0)`
4. Round-trip: `sketchToWorld(pl, worldToSketch(pl, pt))` ≈ `projectPoint(pl, pt)`
5. Offset plane at z=5: `worldToSketch(zPlane5, point3d(1, 2, 5))` → `point2d(1, 2)`
6. Rotated plane (45° tilt around X): verify non-trivial coordinate transform
7. Arbitrary plane: verify both directions

### getPlaneFromFace (`tests/sketch/sketch-on-face.test.ts`)

8. PlaneSurface face → returns plane with correct origin/normal
9. Top face of extruded box → plane at z=height, normal ≈ (0,0,1)
10. Bottom face of extruded box → plane at z=0, normal ≈ (0,0,-1)
11. Side face of extruded box → vertical plane
12. CylindricalSurface face → failure with descriptive message
13. SphericalSurface face → failure
14. ConicalSurface face → failure
15. ToroidalSurface face → failure
16. ExtrusionSurface from line → success (canonicalizes to plane)
17. ExtrusionSurface from circle → failure (canonicalizes to cylinder)

### Edge projection (`tests/sketch/sketch-on-face.test.ts`)

18. Line edge parallel to sketch plane → accurate 2D line
19. Line edge at 45° to sketch plane → foreshortened correctly
20. Line edge perpendicular to sketch plane → failure (degenerate)
21. Circle edge on parallel plane → Circle2D with same radius
22. Circle edge on non-parallel plane → failure (ellipse unsupported)
23. Arc edge on parallel plane → Arc2D with correct angles
24. Project wire from box top face → 4 Line2D curves forming rectangle

### createSketchOnFace (`tests/sketch/sketch-on-face.test.ts`)

25. Top face of box → sketch with correct plane
26. With projectBoundary: construction elements present, matching face edges
27. Non-planar face → failure
28. Face with hole → projects outer + hole boundary as construction

### Profile lifting (`tests/sketch/sketch-on-face.test.ts`)

29. Line2D on XY_PLANE → Line3D at z=0
30. Circle2D lifted to plane at z=10 → Circle3D centered at z=10
31. Wire2D rectangle lifted → closed Wire with 4 Line3D edges
32. Profile2D with outer + hole → { outerWire, innerWires } in 3D

### Integration (`tests/sketch/sketch-on-face.test.ts`)

33. Full workflow: extrude box → sketch circle on top → find profile → lift → extrude from top → verify solid
34. Box top face sketch → draw rectangle → find profile → lift → verify it's on the correct plane
35. Sketch on revolved solid's planar cap → verify works (cap faces of revolve are planar)

---

## Step 7: App Examples

### 7a. `SketchOnFaceExample.tsx` (id: `sketch-on-face`)
"Animate through faces of a box"
- Extrude a box. Cycle through its 6 faces using `Math.floor(6 * (0.5 + 0.5 * Math.sin(animationAngle)) * 0.999)`.
- For each face: call `getPlaneFromFace`, show the face plane as a colored outline, show the face normal as an arrow, show projected boundary edges as dashed lines.
- Clearly label which face is selected and whether it's planar.

### 7b. `SketchOnFaceWorkflowExample.tsx` (id: `sketch-on-face-workflow`)
"Multi-feature: box + cylinder from top face"
- Extrude a box. Sketch a circle on the top face. Extrude the circle upward.
- Animate the circle radius with `Math.sin(animationAngle)` — the cylinder grows and shrinks.
- Show: box wireframe (green), face plane (yellow), circle sketch (cyan), extruded cylinder (blue).
- Display volumes of both solids.

### 7c. `SketchOnFaceProjectionExample.tsx` (id: `sketch-on-face-projection`)
"Edge projection onto tilting plane"
- Show a box and an offset sketch plane. Animate the plane tilting using `sin(animationAngle)`.
- Project the box's top face edges onto the tilting plane.
- When the plane is parallel, projections match exactly; as it tilts, lines foreshorten; when a circle edge would become an ellipse, show a red warning.

All animations use integer harmonics for cyclic looping.

---

## Step 8: Implementation Order

| # | What | Files | Depends on |
|---|------|-------|-----------|
| 1 | Coordinate transform tests + impl | `core/plane.ts`, `tests/core/plane.test.ts` | — |
| 2 | `getPlaneFromFace` tests + impl | `sketch/sketch-on-face.ts`, `tests/sketch/sketch-on-face.test.ts` | — |
| 3 | Edge projection tests + impl | `sketch/sketch-on-face.ts` | 1 |
| 4 | `createSketchOnFace` tests + impl | `sketch/sketch-on-face.ts` | 2, 3 |
| 5 | Profile lifting tests + impl | `sketch/sketch-on-face.ts` | 1 |
| 6 | Integration tests (full workflow) | `tests/sketch/sketch-on-face.test.ts` | 1-5 |
| 7 | Exports | `sketch/index.ts`, `core/index.ts` | 1-5 |
| 8 | App examples | `app/src/examples/SketchOnFace*.tsx`, `registry.ts` | 1-6 |

---

## Key Files to Modify/Create

**Create:**
- `generation/src/sketch/sketch-on-face.ts`
- `generation/tests/sketch/sketch-on-face.test.ts`
- `app/src/examples/SketchOnFaceExample.tsx`
- `app/src/examples/SketchOnFaceWorkflowExample.tsx`
- `app/src/examples/SketchOnFaceProjectionExample.tsx`

**Modify:**
- `generation/src/core/plane.ts` — add worldToSketch, sketchToWorld
- `generation/src/core/index.ts` — export new functions
- `generation/src/sketch/index.ts` — export new sketch-on-face functions
- `generation/tests/core/plane.test.ts` — add coordinate transform tests
- `app/src/examples/registry.ts` — register 3 examples
- `app/src/examples/index.ts` — export 3 examples

**Reuse (read-only reference):**
- `generation/src/sketch/sketch.ts` — Sketch type, createSketch, addElement
- `generation/src/topology/face.ts` — Face type, faceOuterWire, faceSurface
- `generation/src/surfaces/extrusion-surface.ts` — canonicalizeExtrusionSurface
- `generation/src/operations/extrude.ts` — Profile3D type, extrude function for integration tests

---

## Verification

1. `cd generation && npm test` — all new + existing tests pass
2. `cd app && npx tsc --noEmit` — no type errors
3. App examples render correctly in browser
