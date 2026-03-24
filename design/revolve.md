# Phase 9: Revolve + STEP — Implementation Plan

## Context

LaBREP has completed Phases 1-8 (math, 2D curves, STL, STEP, sketch, 3D geometry, constraints, extrude). Phase 9 adds **revolve operations** — creating solids by revolving 2D profiles around an axis. This unlocks cylinders, cones, spheres, and tori from sketch profiles, which are fundamental CAD primitives.

---

## Step 1: New Surface Types

Four new surfaces in `generation/src/surfaces/`, following the `CylindricalSurface` pattern (interface + make + evaluate + normal).

### 1a. `spherical-surface.ts` — SphericalSurface
- `type: 'sphere'`, fields: `center`, `radius`, `axis`, `refDirection`
- Parametrization: `S(θ, φ) = center + R*(cosφ·cosθ·ref + cosφ·sinθ·perp + sinφ·axisDir)`
- θ = longitude [0, 2π), φ = latitude [-π/2, π/2]
- Normal = radially outward from center
- OCCT ref: `Geom_SphericalSurface`

### 1b. `conical-surface.ts` — ConicalSurface
- `type: 'cone'`, fields: `axis`, `radius`, `semiAngle`, `refDirection`
- Parametrization: `S(θ, v) = origin + v·cos(α)·axisDir + (R + v·sin(α))·(cosθ·ref + sinθ·perp)`
- Normal = outward perpendicular to cone surface
- OCCT ref: `Geom_ConicalSurface`

### 1c. `toroidal-surface.ts` — ToroidalSurface
- `type: 'torus'`, fields: `axis`, `majorRadius`, `minorRadius`, `refDirection`
- Parametrization: `S(θ, φ) = origin + (R + r·cosφ)·(cosθ·ref + sinθ·perp) + r·sinφ·axisDir`
- θ = major angle, φ = minor angle
- Normal = outward from tube center
- OCCT ref: `Geom_ToroidalSurface`

### 1d. `revolution-surface.ts` — RevolutionSurface (generic)
- `type: 'revolution'`, fields: `basisCurve`, `axis`, `refDirection`
- Parametrization: `S(θ, v) = rotate(basisCurve(v), axis, θ)` via Rodrigues
- Includes `canonicalizeRevolutionSurface()`:
  - Line parallel to axis → `CylindricalSurface`
  - Line through axis at angle → `ConicalSurface`
  - Line perpendicular through axis → `PlaneSurface`
  - Semicircle centered on axis → `SphericalSurface`
  - Circle/arc in meridional plane → `ToroidalSurface`
- OCCT ref: `Geom_SurfaceOfRevolution`

### 1e. Update Surface union type
- `generation/src/topology/face.ts` line 10: add all 4 new types to `Surface` union
- `generation/src/surfaces/index.ts`: add exports for all 4 new modules

---

## Step 2: Revolve Operation

New file: `generation/src/operations/revolve.ts`

### Result type
```typescript
interface RevolveResult {
  solid: Solid;
  startFace?: Face;    // Cap at start angle (partial only)
  endFace?: Face;      // Cap at end angle (partial only)
  sideFaces: Face[];   // One per profile edge
}
```

### Functions
- `revolve(profile: Wire, axis: Axis, angle: number) → OperationResult<RevolveResult>`
- `revolvePartial(profile: Wire, axis: Axis, startAngle: number, endAngle: number) → OperationResult<RevolveResult>`
- `validateRevolveProfile(wire: Wire, axis: Axis)` — closed, coplanar, doesn't cross axis, lies in meridional plane

### Algorithm (mirrors extrude pipeline)

1. **Validate** profile wire (closed, coplanar, in meridional plane, no axis crossing)
2. **Classify** each edge → what surface type it generates (line→cylinder/cone/plane, arc→torus/sphere)
3. **Generate side faces**: For each profile edge:
   - Create the revolution surface (canonicalized)
   - Build face wire: profile edge (seam) + circle/arc at end vertex + profile edge (reversed seam) + circle/arc at start vertex
   - Handle poles: vertex on axis → degenerate (3-edge face, no circle)
   - Handle edge on axis: skip (no face generated)
4. **Generate cap faces** (partial revolve only): two planar faces at start/end angles from rotated profile wire
5. **Assemble** shell → verify closure → create solid

### Helpers needed
- `rotateCurve(curve, axis, angle)` — using existing `rotationAxis` + `transformPoint` from `core/transform3d.ts`
- `rotateEdge(edge, axis, angle)`, `rotateWire(wire, axis, angle)` — analogous to translate* in extrude

### Edge cases
- Vertex on axis → pole (no circle edge, 3-edge face)
- Edge on axis → skip (zero-radius sweep)
- Profile crossing axis → validation error
- Profile not in meridional plane → validation error (Phase 9 restriction)
- Zero angle → validation error

---

## Step 3: STEP Integration

### New converters in `generation/src/io/step-converters-surfaces.ts`

| Surface | STEP Entity | Key fields |
|---------|------------|------------|
| RevolutionSurface | `SURFACE_OF_REVOLUTION` | basis_curve, axis |
| SphericalSurface | `SPHERICAL_SURFACE` | placement, radius |
| ConicalSurface | `CONICAL_SURFACE` | placement, radius, semi_angle |
| ToroidalSurface | `TOROIDAL_SURFACE` | placement, major_radius, minor_radius |

Each needs `*ToStep()` and `stepTo*()` pair.

### Updates
- `step-converters-topology.ts` line 222: add 4 new cases to `faceToStep` switch
- `io/index.ts`: export new converters

---

## Step 4: Tests (TDD — written BEFORE implementation)

### Surface tests (`tests/surfaces/`)
- `spherical-surface.test.ts`: make, evaluate (equator, poles), normal (radially outward), invalid radius
- `conical-surface.test.ts`: make, evaluate (apex, base circle), normal, invalid semi-angle
- `toroidal-surface.test.ts`: make, evaluate (outer/inner points), normal, invalid radii
- `revolution-surface.test.ts`: make, evaluate (θ=0 returns curve point, θ=π/2 rotated), normal, all 5 canonicalization cases

### Revolve operation tests (`tests/operations/revolve.test.ts`)
Per design doc:
1. Rectangle (one edge on axis) → 360° → solid cylinder, V = π·r²·h
2. Right triangle → 360° → cone, V = ⅓·π·r²·h
3. Semicircle → 360° → sphere, V = ⁴⁄₃·π·r³
4. Any profile → 90° partial → quarter solid, V = ¼ of full
5. STEP round-trip for each surface type

Plus validation:
- Open wire → error
- Profile crossing axis → error
- Zero angle → error
- Vertex on axis → pole handling (3-edge face)
- Full revolve → closed shell
- Partial revolve → closed shell (with caps)

### STEP tests (`tests/io/`)
- Round-trip for each surface type individually
- Round-trip for complete revolved solid

---

## Step 5: App Examples

Three new examples in `app/src/examples/`, following the `ExtrudeBasicExample.tsx` pattern.

### 5a. `RevolveBasicExample.tsx` (id: `revolve-basic`)
"Rectangle → Cylinder and Triangle → Cone"
- Two solids side by side with wireframe visualization
- Volume labels via BillboardText
- Gentle rotation via animationAngle

### 5b. `RevolveSphereExample.tsx` (id: `revolve-sphere`)
"Semicircle → Sphere and Circle → Torus"
- Sphere on left, torus on right
- Shows surface type diversity
- Volume labels

### 5c. `RevolvePartialExample.tsx` (id: `revolve-partial`)
"Animated partial revolve (sweep angle varies)"
- animationAngle drives the revolve sweep from small angle to 2π
- Cap faces visible, volume updates with angle

Register all three in `registry.ts`, export from `index.ts`.

---

## Step 6: Implementation Order

Strict TDD — test first, then implement, for each item:

| # | What | Files | Depends on |
|---|------|-------|-----------|
| 1 | SphericalSurface tests + impl | `spherical-surface.{test,ts}` | — |
| 2 | ConicalSurface tests + impl | `conical-surface.{test,ts}` | — |
| 3 | ToroidalSurface tests + impl | `toroidal-surface.{test,ts}` | — |
| 4 | RevolutionSurface + canonicalize tests + impl | `revolution-surface.{test,ts}` | 1,2,3 (for canonicalize) |
| 5 | Update Surface union + exports | `face.ts`, `surfaces/index.ts` | 1-4 |
| 6 | Revolve validation tests + impl | `revolve.{test,ts}` | 5 |
| 7 | Revolve full (360°) tests + impl | `revolve.{test,ts}` | 6 |
| 8 | Revolve partial tests + impl | `revolve.{test,ts}` | 7 |
| 9 | STEP surface converters tests + impl | `step-converters-surfaces.{test,ts}` | 5 |
| 10 | STEP topology updates + round-trip tests | `step-converters-topology.ts` | 9 |
| 11 | App examples | `app/src/examples/Revolve*.tsx`, `registry.ts` | 7,8 |

---

## Verification

1. `cd generation && npm test` — all new + existing tests pass
2. `cd app && npm run build` — no type errors from new Surface union members
3. Manually check app examples render in browser (or `npm run dev`)

---

## Key Files to Modify/Create

**Create:**
- `generation/src/surfaces/spherical-surface.ts`
- `generation/src/surfaces/conical-surface.ts`
- `generation/src/surfaces/toroidal-surface.ts`
- `generation/src/surfaces/revolution-surface.ts`
- `generation/src/operations/revolve.ts`
- `generation/tests/surfaces/spherical-surface.test.ts`
- `generation/tests/surfaces/conical-surface.test.ts`
- `generation/tests/surfaces/toroidal-surface.test.ts`
- `generation/tests/surfaces/revolution-surface.test.ts`
- `generation/tests/operations/revolve.test.ts`
- `generation/tests/io/step-revolve.test.ts`
- `app/src/examples/RevolveBasicExample.tsx`
- `app/src/examples/RevolveSphereExample.tsx`
- `app/src/examples/RevolvePartialExample.tsx`

**Modify:**
- `generation/src/topology/face.ts` — Surface union type
- `generation/src/surfaces/index.ts` — exports
- `generation/src/operations/index.ts` — exports
- `generation/src/io/step-converters-surfaces.ts` — 4 new converter pairs
- `generation/src/io/step-converters-topology.ts` — faceToStep switch
- `generation/src/io/index.ts` — exports
- `app/src/examples/registry.ts` — register 3 examples
- `app/src/examples/index.ts` — export 3 examples

**Reuse (read-only reference):**
- `generation/src/core/transform3d.ts` — `rotationAxis`, `transformPoint`, `transformVector`
- `generation/src/surfaces/cylindrical-surface.ts` — pattern for analytic surfaces
- `generation/src/surfaces/extrusion-surface.ts` — pattern for generic surface + canonicalize
- `generation/src/operations/extrude.ts` — pipeline pattern for revolve
- `app/src/examples/ExtrudeBasicExample.tsx` — pattern for app examples
