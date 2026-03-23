# Phase 8: Extrude — Design Document

> ⚠️ **Testing Requirement:** All implementations MUST include edge case tests — not just happy paths. Test: zero/negative values, degenerate inputs, boundary conditions, near-tolerance values, and known failure modes. Edge cases reveal bugs that happy-path tests miss.

## Overview

### What Is Extrusion?

Extrusion is the fundamental operation that transforms 2D sketch profiles into 3D solid bodies. Given a closed 2D profile and a direction/distance, extrusion "sweeps" the profile through space to create a solid.

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTRUSION OPERATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INPUT:                                                         │
│  ├── Profile: Closed 2D wire (with optional holes)              │
│  ├── Direction: Unit vector (typically face normal)             │
│  └── Distance: How far to extrude                               │
│                                                                 │
│  OUTPUT:                                                        │
│  └── Solid: 3D BRep solid with:                                 │
│      ├── Bottom face (original profile plane)                   │
│      ├── Top face (translated profile)                          │
│      └── Side faces (one per profile edge)                      │
│                                                                 │
│  EXAMPLE:                                                       │
│                                                                 │
│       2D Profile                    3D Solid                    │
│      ┌─────────┐                  ╔═════════╗                   │
│      │         │     extrude      ║         ║╲                  │
│      │  rect   │  ───────────►    ║   box   ║ ║                 │
│      │         │    direction     ║         ║ ║                 │
│      └─────────┘    + distance    ╚═════════╝═╝                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Extrusion Matters

Extrusion is the **most common** operation in parametric CAD:

1. **First solid creation** — Most parts start as an extruded sketch
2. **Additive features** — Bosses, ribs, tabs are extruded profiles
3. **Subtractive features** — Holes, pockets, slots are extruded cuts
4. **Simple geometry** — Many real parts are primarily extrusions

For voice/text-controlled CAD, extrusion is essential:
- "Extrude this profile 20mm"
- "Add a 10mm boss here"
- "Cut a rectangular slot through"

### Extrusion Variants

| Variant | Description | Use Case |
|---------|-------------|----------|
| **Basic** | Extrude in one direction by distance | Standard feature |
| **Symmetric** | Extrude equally in both directions | Centered features |
| **To Face** | Extrude until hitting a target surface | Adaptive features |
| **Through All** | Extrude through entire model | Through holes |

Phase 8 focuses on **basic** and **symmetric** extrusion. "To face" requires boolean-like face intersection logic, which comes in Phase 11.

---

## OCCT Reference

### Primary Classes

| OCCT Class | Purpose | Notes |
|------------|---------|-------|
| `BRepPrimAPI_MakePrism` | Main extrusion builder | Takes wire/face + vector |
| `Geom_SurfaceOfLinearExtrusion` | Parametric extrusion surface | Surface type for side faces |
| `BRepBuilderAPI_MakeFace` | Create face from wire | Used for caps |
| `BRepBuilderAPI_Sewing` | Join faces into shell | Topology cleanup |

### BRepPrimAPI_MakePrism

The primary OCCT class for extrusion. From `BRepPrimAPI_MakePrism.hxx`:

```cpp
class BRepPrimAPI_MakePrism : public BRepPrimAPI_MakeSweep
{
public:
  // Extrude shape along vector
  BRepPrimAPI_MakePrism(const TopoDS_Shape& S,     // Base shape (wire or face)
                        const gp_Vec& V,            // Direction + distance
                        const Standard_Boolean Copy = Standard_False,
                        const Standard_Boolean Canonize = Standard_True);

  // Extrude shape to infinite
  BRepPrimAPI_MakePrism(const TopoDS_Shape& S,
                        const gp_Dir& D,            // Direction only (infinite)
                        const Standard_Boolean Inf = Standard_True,
                        const Standard_Boolean Copy = Standard_False,
                        const Standard_Boolean Canonize = Standard_True);
  
  // Access results
  const TopoDS_Shape& FirstShape();    // Bottom cap
  const TopoDS_Shape& LastShape();     // Top cap
  TopoDS_Shape Generated(const TopoDS_Shape& S);  // Side face from edge
};
```

**Key behaviors:**
- Input can be `TopoDS_Wire` (creates shell) or `TopoDS_Face` (creates solid)
- Vector `V` encodes both direction and distance (`V.Magnitude()`)
- `Canonize = true` means simplify surfaces where possible (e.g., plane stays plane)
- `Generated()` maps each input edge to its generated side face

### Geom_SurfaceOfLinearExtrusion

The surface type created when extruding a curve. From `Geom_SurfaceOfLinearExtrusion.hxx`:

```cpp
class Geom_SurfaceOfLinearExtrusion : public Geom_SweptSurface
{
public:
  // Create extrusion surface from curve + direction
  Geom_SurfaceOfLinearExtrusion(const Handle(Geom_Curve)& C,
                                 const gp_Dir& V);
  
  // Parametrization: S(u, v) = C(u) + v * V
  // u: parameter along basis curve
  // v: parameter along extrusion direction
  
  gp_Pnt Value(const Standard_Real U, const Standard_Real V) const;
  void D0(const Standard_Real U, const Standard_Real V, gp_Pnt& P) const;
  void D1(const Standard_Real U, const Standard_Real V, 
          gp_Pnt& P, gp_Vec& D1U, gp_Vec& D1V) const;
  
  const gp_Dir& Direction() const;           // Extrusion direction
  Handle(Geom_Curve) BasisCurve() const;    // The curve being extruded
};
```

**Parametrization:**
```
S(u, v) = C(u) + v × direction

where:
  C(u) = basis curve evaluated at parameter u
  v = distance along extrusion direction
  direction = unit vector of extrusion
```

### How OCCT Handles Different Cases

#### Simple Profiles (Rectangle, Circle)

For a rectangle:
```cpp
// Input: Wire with 4 Line3D edges on XY plane
// Direction: (0, 0, 1), Distance: 10

// Result:
// - 6 faces total
// - Top/bottom: PlaneSurface bounded by rectangles
// - 4 sides: PlaneSurface (line extruded → plane)
```

For a circle:
```cpp
// Input: Wire with 1 Circle3D edge
// Direction: (0, 0, 1), Distance: 10

// Result:
// - 3 faces total
// - Top/bottom: PlaneSurface bounded by circles  
// - 1 side: CylindricalSurface (circle extruded → cylinder)
```

**Surface simplification:** OCCT's `Canonize` flag detects when:
- Line extruded → `Geom_Plane` (not `Geom_SurfaceOfLinearExtrusion`)
- Circle extruded → `Geom_CylindricalSurface` (not `Geom_SurfaceOfLinearExtrusion`)
- Arc extruded → `Geom_CylindricalSurface` (partial cylinder)

#### Profiles with Holes

```cpp
// Input: Face with outer wire + inner wire (hole)
// Direction: (0, 0, 1), Distance: 10

// Result:
// - Solid with through-hole
// - Bottom face has hole
// - Top face has hole
// - Outer side faces + inner side faces (hole walls)
```

OCCT handles this by:
1. Creating cap faces with inner wires (holes)
2. Generating side faces for both outer and inner wires
3. Inner wire side faces have **reversed orientation** (face inward)

#### Symmetric Extrusion

OCCT doesn't have a built-in symmetric extrude. The pattern is:
```cpp
// Symmetric extrude of distance D:
gp_Vec halfVec = direction * (D / 2.0);

// First, translate profile backward by D/2
gp_Trsf translate;
translate.SetTranslation(-halfVec);
TopoDS_Shape translatedProfile = BRepBuilderAPI_Transform(profile, translate);

// Then extrude forward by full distance D
BRepPrimAPI_MakePrism prism(translatedProfile, direction * D);
```

#### Extrusion to Face/Surface

`BRepFeat_MakePrism` handles "extrude until" operations:
```cpp
class BRepFeat_MakePrism : public BRepFeat_Form
{
public:
  // Extrude until hitting a face
  void Perform(const TopoDS_Shape& Until);
  
  // Extrude from one face to another
  void PerformFromEnd(const TopoDS_Shape& FFrom);
  void PerformThruAll();  // Through entire model
  void PerformUntilEnd(); // Until natural end
};
```

This requires face intersection logic — deferred to Phase 11 (Booleans).

---

## Data Types

### ExtrusionSurface

A parametric surface created by extruding a curve along a direction.

```typescript
/**
 * A surface created by translating a curve along a direction.
 * 
 * Parametrization: S(u, v) = curve(u) + v × direction
 * 
 * - u: parameter along basis curve [curve.startParam, curve.endParam]
 * - v: parameter along extrusion direction (unbounded, but typically [0, distance])
 * 
 * @example
 * // Extrude a line → plane
 * const line = makeLine3D(origin, point3d(10, 0, 0));
 * const surface = makeExtrusionSurface(line.result, vector3d(0, 0, 1));
 * // surface.evaluate(5, 3) = point at u=5 along line, v=3 up
 * 
 * @example  
 * // Extrude a circle → cylinder
 * const circle = makeCircle3D(XY_PLANE, 5);
 * const surface = makeExtrusionSurface(circle.result, vector3d(0, 0, 1));
 * // Equivalent to CylindricalSurface with radius 5
 */
interface ExtrusionSurface extends Surface {
  readonly type: 'extrusion';
  readonly basisCurve: Curve3D;
  readonly direction: Vector3D;  // Unit vector
}
```

### ExtrudeOptions

Configuration for extrusion operations.

```typescript
/**
 * Options for extrusion operations.
 */
interface ExtrudeOptions {
  /**
   * Extrusion direction. If not provided, uses the profile plane's normal.
   */
  direction?: Vector3D;
  
  /**
   * Extrusion distance. Required for basic extrusion.
   */
  distance: number;
  
  /**
   * If true, extrude equally in both directions (distance/2 each way).
   * Default: false
   */
  symmetric?: boolean;
  
  /**
   * If true, attempt to simplify surface types:
   * - Line extruded → PlaneSurface (not ExtrusionSurface)
   * - Circle extruded → CylindricalSurface (not ExtrusionSurface)
   * Default: true
   */
  canonicalize?: boolean;
}

/**
 * Options for "extrude to face" operation.
 */
interface ExtrudeToOptions {
  /**
   * Extrusion direction. Required — determines which way to extrude.
   */
  direction: Vector3D;
  
  /**
   * Target face to extrude to.
   */
  targetFace: Face;
  
  /**
   * If true, extrude through the target face (cut operation).
   * Default: false (stop at face)
   */
  through?: boolean;
}
```

### ExtrudeResult

Result of an extrusion operation.

```typescript
/**
 * Result of an extrusion operation.
 */
interface ExtrudeResult {
  /**
   * The resulting solid.
   */
  solid: Solid;
  
  /**
   * The bottom cap face (original profile location).
   */
  bottomFace: Face;
  
  /**
   * The top cap face (translated profile).
   */
  topFace: Face;
  
  /**
   * Side faces, one per profile edge. Order matches profile wire edges.
   */
  sideFaces: Face[];
  
  /**
   * Map from profile edge to its generated side face.
   * Key: edge from input profile
   * Value: generated side face
   */
  edgeToFace: Map<Edge, Face>;
}
```

### Profile Input Types

```typescript
/**
 * Valid inputs for extrusion.
 */
type ExtrudeInput = 
  | Wire      // Single closed wire (no holes) → creates solid
  | Profile2D // 2D profile with optional holes → creates solid with holes
  | Face      // Existing face → creates solid
  ;

/**
 * A 2D profile with optional holes, on a plane.
 * Used as input for extrusion when holes are needed.
 */
interface Profile3D {
  readonly plane: Plane;
  readonly outerWire: Wire;
  readonly innerWires: readonly Wire[];  // Holes
}
```

---

## Functions

### Basic Extrusion

```typescript
/**
 * Extrude a profile to create a solid.
 * 
 * The profile must be:
 * - Closed (wire.isClosed = true)
 * - Planar (all edges lie on the same plane)
 * 
 * @param profile - Closed wire, Profile2D, or Face to extrude
 * @param direction - Extrusion direction (unit vector)
 * @param distance - Extrusion distance (must be > 0)
 * @returns Solid and metadata, or error if profile is invalid
 * 
 * @example
 * // Extrude a rectangle into a box
 * const rect = makeRectangleWire(10, 20);
 * const result = extrude(rect, vector3d(0, 0, 1), 30);
 * // result.solid has volume 10 * 20 * 30 = 6000
 */
function extrude(
  profile: ExtrudeInput,
  direction: Vector3D,
  distance: number
): OperationResult<ExtrudeResult>;

/**
 * Extrude with full options.
 */
function extrudeWithOptions(
  profile: ExtrudeInput,
  options: ExtrudeOptions
): OperationResult<ExtrudeResult>;
```

### Symmetric Extrusion

```typescript
/**
 * Extrude symmetrically in both directions.
 * 
 * Creates a solid centered on the profile plane, extending
 * distance/2 in each direction along the extrusion vector.
 * 
 * @param profile - Closed wire, Profile2D, or Face to extrude
 * @param direction - Extrusion direction (unit vector)
 * @param totalDistance - Total extrusion distance (distance/2 each way)
 * @returns Solid centered on profile plane
 * 
 * @example
 * // Symmetric extrude rectangle 30mm total (15mm each way)
 * const rect = makeRectangleWire(10, 20);
 * const result = extrudeSymmetric(rect, vector3d(0, 0, 1), 30);
 * // Profile is at z=0, solid spans z=-15 to z=+15
 */
function extrudeSymmetric(
  profile: ExtrudeInput,
  direction: Vector3D,
  totalDistance: number
): OperationResult<ExtrudeResult>;
```

### Extrude to Face (Phase 11 Preview)

```typescript
/**
 * Extrude until hitting a target face.
 * 
 * ⚠️ NOT IMPLEMENTED IN PHASE 8 — requires face intersection from Phase 11.
 * 
 * @param profile - Closed wire, Profile2D, or Face to extrude  
 * @param direction - Extrusion direction
 * @param targetFace - Face to extrude to
 * @returns Solid extending from profile plane to target face
 */
function extrudeTo(
  profile: ExtrudeInput,
  direction: Vector3D,
  targetFace: Face
): OperationResult<ExtrudeResult>;
```

### Surface Construction

```typescript
/**
 * Create an extrusion surface from a 3D curve.
 * 
 * The surface is defined by: S(u, v) = curve(u) + v × direction
 * 
 * @param curve - The basis curve to extrude
 * @param direction - Extrusion direction (will be normalized)
 * @returns ExtrusionSurface or error if curve is degenerate
 * 
 * @example
 * const line = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0));
 * const surface = makeExtrusionSurface(line.result, vector3d(0, 0, 1));
 * // surface.evaluate(5, 3) = point3d(5, 0, 3)
 */
function makeExtrusionSurface(
  curve: Curve3D,
  direction: Vector3D
): OperationResult<ExtrusionSurface>;
```

### Surface Evaluation

```typescript
/**
 * Evaluate an extrusion surface at parameters (u, v).
 * 
 * S(u, v) = basisCurve(u) + v × direction
 */
function evaluateExtrusionSurface(
  surface: ExtrusionSurface,
  u: number,
  v: number
): Point3D;

/**
 * Compute the normal of an extrusion surface at (u, v).
 * 
 * Normal = normalize(tangent(u) × direction)
 * where tangent(u) is the curve tangent at parameter u.
 */
function normalExtrusionSurface(
  surface: ExtrusionSurface,
  u: number,
  v: number
): Vector3D;

/**
 * Compute partial derivatives of an extrusion surface.
 * 
 * ∂S/∂u = curve'(u) (curve tangent)
 * ∂S/∂v = direction
 */
function derivativesExtrusionSurface(
  surface: ExtrusionSurface,
  u: number,
  v: number
): { dU: Vector3D; dV: Vector3D };
```

### Canonicalization

```typescript
/**
 * Attempt to simplify an extrusion surface to a canonical form.
 * 
 * - Line → PlaneSurface
 * - Circle → CylindricalSurface
 * - Arc → CylindricalSurface (partial)
 * 
 * Returns the original surface if no simplification applies.
 */
function canonicalizeExtrusionSurface(
  surface: ExtrusionSurface
): Surface;

/**
 * Check if a curve extruded along a direction produces a known surface type.
 */
function getCanonicalSurfaceType(
  curve: Curve3D,
  direction: Vector3D
): 'plane' | 'cylinder' | 'extrusion';
```

---

## Algorithm Approach

### Overview

The extrusion algorithm has four main steps:

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTRUSION ALGORITHM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STEP 1: VALIDATE PROFILE                                       │
│  ─────────────────────────                                      │
│  • Check: wire is closed                                        │
│  • Check: all edges lie on same plane                           │
│  • Check: no self-intersection                                  │
│  • Extract plane from profile                                   │
│                                                                 │
│  STEP 2: CREATE SIDE FACES                                      │
│  ─────────────────────────                                      │
│  • For each edge in profile wire:                               │
│      - Create extrusion surface from edge curve                 │
│      - Canonicalize if possible (line→plane, circle→cylinder)   │
│      - Create bounded face with 4-edge wire                     │
│  • For holes: same process, reversed orientation                │
│                                                                 │
│  STEP 3: CREATE CAP FACES                                       │
│  ────────────────────────                                       │
│  • Bottom cap: original profile as face                         │
│  • Top cap: translate profile by direction × distance           │
│  • Both caps have same surface (plane), different locations     │
│  • Include holes in cap faces if profile has holes              │
│                                                                 │
│  STEP 4: ASSEMBLE SOLID                                         │
│  ───────────────────────                                        │
│  • Combine all faces into shell                                 │
│  • Verify shell is closed (watertight)                          │
│  • Create solid from shell                                      │
│  • Validate: volume > 0, all faces correctly oriented           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Step 1: Profile Validation

```typescript
function validateExtrudeProfile(profile: ExtrudeInput): OperationResult<{
  plane: Plane;
  outerWire: Wire;
  innerWires: Wire[];
}> {
  // 1. Get wire(s) from input
  const { outerWire, innerWires } = extractWires(profile);
  
  // 2. Check outer wire is closed
  if (!outerWire.isClosed) {
    return failure("Profile outer wire must be closed");
  }
  
  // 3. Check all edges are planar (lie on same plane)
  const planeResult = extractPlaneFromWire(outerWire);
  if (!planeResult.success) {
    return failure("Profile must be planar: " + planeResult.error);
  }
  const plane = planeResult.result;
  
  // 4. Verify inner wires also lie on same plane
  for (const innerWire of innerWires) {
    if (!wireIsOnPlane(innerWire, plane)) {
      return failure("All profile wires must lie on same plane");
    }
    if (!innerWire.isClosed) {
      return failure("Inner wires (holes) must be closed");
    }
  }
  
  // 5. Check winding direction
  // Outer wire: CCW when viewed from plane normal
  // Inner wires: CW when viewed from plane normal
  
  return success({ plane, outerWire, innerWires });
}
```

### Step 2: Side Face Generation

Each profile edge generates one side face:

```typescript
function generateSideFace(
  edge: Edge,
  direction: Vector3D,
  distance: number,
  canonicalize: boolean
): Face {
  const curve = edge.curve;
  
  // 1. Create extrusion surface
  let surface: Surface = makeExtrusionSurface(curve, direction).result;
  
  // 2. Canonicalize if requested
  if (canonicalize) {
    surface = canonicalizeExtrusionSurface(surface);
  }
  
  // 3. Create bounding wire for the side face
  // The wire has 4 edges:
  //   - bottom: original edge curve
  //   - top: translated edge curve  
  //   - left: vertical line connecting start points
  //   - right: vertical line connecting end points
  
  const bottomEdge = edge;
  const topEdge = translateEdge(edge, scale(direction, distance));
  const leftEdge = makeVerticalEdge(edge.startVertex, direction, distance);
  const rightEdge = makeVerticalEdge(edge.endVertex, direction, distance);
  
  // Wire order: bottom → right → top(reversed) → left(reversed)
  // This gives CCW orientation when viewed from outside
  const wire = makeWire([
    orientEdge(bottomEdge, true),
    orientEdge(rightEdge, true),
    orientEdge(topEdge, false),
    orientEdge(leftEdge, false)
  ]);
  
  return makeFace(surface, wire.result);
}
```

### Handling Different Curve Types

| Profile Edge | Side Surface | Notes |
|--------------|--------------|-------|
| Line2D | PlaneSurface | Simplest case — 4 vertices, 4 line edges |
| Arc2D | CylindricalSurface | Partial cylinder |
| Circle2D | CylindricalSurface | Full cylinder (single side face) |
| BSpline (future) | ExtrusionSurface | No simplification possible |

```
┌─────────────────────────────────────────────────────────────────┐
│                LINE EXTRUSION → PLANE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Profile Edge (Line):          Side Face:                       │
│                                                                 │
│        •──────────•            ┌──────────┐                     │
│        A          B            │          │                     │
│                                │  PLANE   │  direction          │
│                            ───►│          │                     │
│                                └──────────┘                     │
│                                A'         B'                    │
│                                                                 │
│  Surface: S(u,v) = A + u(B-A) + v·direction                     │
│  This is a plane with normal = (B-A) × direction                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                ARC EXTRUSION → CYLINDER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Profile Edge (Arc):           Side Face:                       │
│                                                                 │
│          ╭───╮                     ╭───╮                        │
│        •       •                  ╱     ╲                       │
│        A       B                 │       │  direction           │
│                              ───►│ CYL   │                      │
│                                  │       │                      │
│                                   ╲     ╱                       │
│                                    ╰───╯                        │
│                                                                 │
│  Surface: CylindricalSurface with axis = center + t·direction   │
│  Only valid when direction ∥ arc plane normal                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Step 3: Cap Face Generation

```typescript
function generateCapFaces(
  outerWire: Wire,
  innerWires: Wire[],
  plane: Plane,
  direction: Vector3D,
  distance: number
): { bottomFace: Face; topFace: Face } {
  
  // Bottom cap: original profile location
  const bottomSurface = makePlaneSurface(plane);
  const bottomFace = makeFace(
    bottomSurface,
    reverseWire(outerWire),  // CW for bottom (facing -normal)
    innerWires.map(w => reverseWire(w))
  );
  
  // Top cap: translated profile
  const topPlane = translatePlane(plane, scale(direction, distance));
  const topSurface = makePlaneSurface(topPlane);
  const topWire = translateWire(outerWire, scale(direction, distance));
  const topInnerWires = innerWires.map(w => 
    translateWire(w, scale(direction, distance))
  );
  const topFace = makeFace(
    topSurface,
    topWire,  // CCW for top (facing +normal)
    topInnerWires
  );
  
  return { bottomFace, topFace };
}
```

### Step 4: Shell Assembly

```typescript
function assembleExtrudedSolid(
  bottomFace: Face,
  topFace: Face,
  sideFaces: Face[]
): OperationResult<Solid> {
  
  // 1. Collect all faces
  const allFaces = [bottomFace, topFace, ...sideFaces];
  
  // 2. Create shell
  const shellResult = makeShell(allFaces);
  if (!shellResult.success) {
    return failure("Failed to create shell: " + shellResult.error);
  }
  
  // 3. Verify shell is closed
  if (!shellResult.result.isClosed) {
    return failure("Extruded shell is not watertight — topology error");
  }
  
  // 4. Create solid
  const solidResult = makeSolid(shellResult.result);
  if (!solidResult.success) {
    return failure("Failed to create solid: " + solidResult.error);
  }
  
  // 5. Validate solid
  const volume = solidVolume(solidResult.result);
  if (volume <= 0) {
    return failure("Solid has non-positive volume — face orientation error");
  }
  
  return success(solidResult.result);
}
```

### Wire Direction Convention

Correct wire direction is critical for solid validity:

```
┌─────────────────────────────────────────────────────────────────┐
│                WIRE DIRECTION CONVENTION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OUTER WIRE: Counter-clockwise when viewed from outside solid   │
│  INNER WIRE (hole): Clockwise when viewed from outside solid    │
│                                                                 │
│  For bottom face (normal pointing -Z):                          │
│    • Outer wire: CW when viewed from +Z (CCW from -Z)           │
│    • Inner wire: CCW when viewed from +Z (CW from -Z)           │
│                                                                 │
│  For top face (normal pointing +Z):                             │
│    • Outer wire: CCW when viewed from +Z                        │
│    • Inner wire: CW when viewed from +Z                         │
│                                                                 │
│  For side faces (normal pointing outward):                      │
│    • Wire: CCW when viewed from outside                         │
│                                                                 │
│                     ┌─────────┐ ←── top face wire: CCW          │
│                    ╱│         │╲    from above                  │
│                   ╱ │         │ ╲                               │
│   side face ────►│  │         │  │◄── side face                 │
│   wire: CCW      │  │    ◯    │  │    wire: CCW                 │
│   from outside    ╲ │  hole   │ ╱     from outside              │
│                    ╲│   CW    │╱                                │
│                     └─────────┘ ←── bottom face wire: CW        │
│                                     from above                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## STEP Extensions

### Required STEP Entities

Phase 8 introduces one new surface type and uses existing topology entities.

| labrep Type | STEP Entity | Notes |
|-------------|-------------|-------|
| `ExtrusionSurface` | `SURFACE_OF_LINEAR_EXTRUSION` | New converter needed |
| `Solid` (extruded) | `MANIFOLD_SOLID_BREP` | Existing (Phase 6) |
| `Shell` | `CLOSED_SHELL` | Existing |
| `Face` | `ADVANCED_FACE` | Existing |

### SURFACE_OF_LINEAR_EXTRUSION

STEP definition (ISO 10303-42):

```step
ENTITY SURFACE_OF_LINEAR_EXTRUSION
  SUBTYPE OF (SWEPT_SURFACE);
  extrusion_axis : VECTOR;
END_ENTITY;

ENTITY SWEPT_SURFACE
  SUBTYPE OF (SURFACE);
  swept_curve : CURVE;
END_ENTITY;
```

Example STEP representation:

```step
#1 = CARTESIAN_POINT('', (0., 0., 0.));
#2 = CARTESIAN_POINT('', (10., 0., 0.));
#3 = VERTEX_POINT('', #1);
#4 = VERTEX_POINT('', #2);
#5 = LINE('', #1, #6);
#6 = VECTOR('', #7, 1.);
#7 = DIRECTION('', (1., 0., 0.));
#8 = EDGE_CURVE('', #3, #4, #5, .T.);

/* Extrusion direction */
#9 = DIRECTION('', (0., 0., 1.));
#10 = VECTOR('', #9, 30.);

/* The extrusion surface */
#11 = SURFACE_OF_LINEAR_EXTRUSION('', #5, #10);

/* Face bounded by this surface */
#12 = ADVANCED_FACE('', (#13), #11, .T.);
/* ... bounds follow */
```

### Converter Functions

```typescript
/**
 * Convert ExtrusionSurface to STEP entities.
 */
function extrusionSurfaceToStep(
  surface: ExtrusionSurface,
  builder: StepModelBuilder
): StepEntityRef {
  // 1. Convert basis curve
  const curveRef = curve3dToStep(surface.basisCurve, builder);
  
  // 2. Create direction
  const dirRef = directionToStep(surface.direction, builder);
  
  // 3. Create vector (direction + magnitude for STEP)
  // Note: STEP SURFACE_OF_LINEAR_EXTRUSION uses unbounded surface,
  // the distance comes from face bounds, not the surface definition
  const vecRef = builder.addEntity('VECTOR', {
    orientation: dirRef,
    magnitude: 1.0  // Unit vector; actual distance in face bounds
  });
  
  // 4. Create extrusion surface
  return builder.addEntity('SURFACE_OF_LINEAR_EXTRUSION', {
    swept_curve: curveRef,
    extrusion_axis: vecRef
  });
}

/**
 * Convert STEP SURFACE_OF_LINEAR_EXTRUSION to ExtrusionSurface.
 */
function stepToExtrusionSurface(
  entity: StepEntity,
  model: StepModel
): OperationResult<ExtrusionSurface> {
  // 1. Get swept curve
  const curveEntity = model.getEntity(entity.swept_curve);
  const curveResult = stepToCurve3d(curveEntity, model);
  if (!curveResult.success) return curveResult;
  
  // 2. Get extrusion axis (VECTOR)
  const vectorEntity = model.getEntity(entity.extrusion_axis);
  const dirEntity = model.getEntity(vectorEntity.orientation);
  const direction = stepToDirection(dirEntity, model);
  
  // 3. Create surface
  return makeExtrusionSurface(curveResult.result, direction);
}
```

### Round-Trip Requirements

For valid STEP round-trip of extruded solids:

1. **Topology must be complete:** All vertices, edges, wires, faces, shells, solid
2. **Surface types preserved:** PlaneSurface stays PLANE, CylindricalSurface stays CYLINDRICAL_SURFACE, ExtrusionSurface stays SURFACE_OF_LINEAR_EXTRUSION
3. **Wire orientations correct:** Same sense flags in ORIENTED_EDGE
4. **Face orientations correct:** Same side flags in ADVANCED_FACE

---

## Testing Approach

### Basic Shape Tests

| Test | Description | Validation |
|------|-------------|------------|
| `extrude_rectangle_to_box` | Rectangle profile → box | Volume = w × h × d |
| `extrude_circle_to_cylinder` | Circle profile → cylinder | Volume = π × r² × h |
| `extrude_triangle` | Triangle profile → triangular prism | Volume = (base × height / 2) × depth |
| `extrude_hexagon` | Regular hexagon → hexagonal prism | Face count = 8 (2 caps + 6 sides) |

### Profiles with Holes

| Test | Description | Validation |
|------|-------------|------------|
| `extrude_square_with_circular_hole` | Square with center hole → tube | Volume = (w² - π×r²) × h |
| `extrude_with_multiple_holes` | Profile with 2+ holes | Correct hole wall faces |
| `extrude_concentric_circles` | Annulus → pipe | Inner and outer cylindrical faces |

### Non-Convex Profiles

| Test | Description | Validation |
|------|-------------|------------|
| `extrude_l_shape` | L-bracket profile | Volume = correct L-shape volume |
| `extrude_u_shape` | U-channel profile | 10 faces (8 sides + 2 caps) |
| `extrude_star` | 5-point star | Complex edge connectivity |

### Symmetric Extrusion

| Test | Description | Validation |
|------|-------------|------------|
| `symmetric_rectangle` | Centered box | BBox: z ∈ [-d/2, +d/2] |
| `symmetric_circle` | Centered cylinder | Volume unchanged from basic |
| `symmetric_with_hole` | Centered tube | Holes correct in both directions |

### Extrusion Direction

| Test | Description | Validation |
|------|-------------|------------|
| `extrude_along_x` | Profile on YZ, extrude X | Correct orientation |
| `extrude_along_y` | Profile on XZ, extrude Y | Correct orientation |
| `extrude_diagonal` | Extrude at 45° | Faces are parallelograms |
| `extrude_opposite_normal` | Extrude against plane normal | Still valid solid |

### Edge Cases — Must Fail

| Test | Description | Expected Error |
|------|-------------|----------------|
| `zero_distance` | distance = 0 | "Distance must be positive" |
| `negative_distance` | distance = -10 | "Distance must be positive" |
| `open_wire` | Wire not closed | "Profile must be closed" |
| `non_planar_wire` | Wire with non-coplanar edges | "Profile must be planar" |
| `self_intersecting_wire` | Figure-8 profile | "Profile must not self-intersect" |
| `zero_length_direction` | direction = (0,0,0) | "Direction must be non-zero" |

### Numerical Edge Cases

| Test | Description | Validation |
|------|-------------|------------|
| `very_small_distance` | distance = 1e-6 | Volume ≈ area × 1e-6 |
| `very_large_distance` | distance = 1e6 | No overflow, correct volume |
| `profile_not_at_origin` | Profile at (100, 200, 300) | Solid at correct location |
| `tiny_profile` | 0.001 × 0.001 square | Valid solid, tiny volume |

### Surface Canonicalization

| Test | Description | Validation |
|------|-------------|------------|
| `line_becomes_plane` | Line edge → PlaneSurface | surface.type === 'plane' |
| `circle_becomes_cylinder` | Circle edge → CylindricalSurface | surface.type === 'cylinder' |
| `arc_becomes_partial_cylinder` | Arc edge → CylindricalSurface | Bounded v-range |
| `bspline_stays_extrusion` | (future) BSpline → ExtrusionSurface | Not canonicalized |

### STEP Round-Trip Tests

| Test | Description | Validation |
|------|-------------|------------|
| `step_roundtrip_box` | Box → STEP → Box | Same volume, same face count |
| `step_roundtrip_cylinder` | Cylinder → STEP → Cylinder | Same radius, same height |
| `step_roundtrip_with_hole` | Tube → STEP → Tube | Hole preserved |
| `step_extrusion_surface` | ExtrusionSurface → STEP → ExtrusionSurface | Surface type preserved |

### Performance Tests

| Test | Description | Target |
|------|-------------|--------|
| `extrude_simple_profile` | Rectangle extrusion | < 5ms |
| `extrude_100_edge_profile` | Complex 100-edge profile | < 100ms |
| `extrude_profile_with_20_holes` | Many holes | < 200ms |

---

## Viewer Examples

### extrude-basic

**Visual:** Side-by-side comparison of 2D profile and resulting 3D solid. Animated extrusion showing the sweep.

**Elements:**
- Left panel: 2D rectangle on XY plane
- Right panel: 3D box with transparent faces
- Animation: Profile sweeps upward, solid materializes

**Code:**
```typescript
import { makeRectangleWire, extrude, vector3d } from '@labrep/generation';

// 2D profile
const rect = makeRectangleWire(10, 20);

// Extrude to 3D
const result = extrude(rect.result, vector3d(0, 0, 1), 30);

// result.solid: 6 faces, volume = 6000
// result.sideFaces: 4 planar faces
// result.bottomFace, result.topFace: caps
```

**Second example in same viewer:** Circle → Cylinder
```typescript
const circle = makeCircle3D(XY_PLANE, 5);
const cylinder = extrude(circle, vector3d(0, 0, 1), 20);
// Volume = π × 25 × 20 ≈ 1571
```

### extrude-profile

**Visual:** L-bracket extrusion demonstrating non-convex profile handling.

**Elements:**
- Complex 2D L-shaped profile with dimensions annotated
- Resulting 3D solid with face coloring (caps in blue, sides in gray)
- Wireframe overlay showing edges

**Code:**
```typescript
import { createSketch, addLine, findProfiles, extrude } from '@labrep/generation';

// Create L-shaped profile
const sketch = createSketch(XY_PLANE);
//    ┌─────┐
//    │     │
//    │  ┌──┘
//    │  │
//    └──┘
addLine(sketch, point2d(0, 0), point2d(10, 0));
addLine(sketch, point2d(10, 0), point2d(10, 15));
addLine(sketch, point2d(10, 15), point2d(20, 15));
addLine(sketch, point2d(20, 15), point2d(20, 25));
addLine(sketch, point2d(20, 25), point2d(0, 25));
addLine(sketch, point2d(0, 25), point2d(0, 0));

const profile = findProfiles(sketch)[0];
const bracket = extrude(profile, vector3d(0, 0, 1), 5);

// 8 faces: 2 caps + 6 sides
```

### extrude-with-hole

**Visual:** Profile with circular hole extruded to create a tube/housing.

**Elements:**
- 2D view: Square with centered circular hole
- 3D view: Extruded result showing through-hole
- Cross-section view (cut plane) showing internal cavity

**Code:**
```typescript
import { makeSquareWire, makeCircle2D, extrudeProfile } from '@labrep/generation';

// Outer profile: 30×30 square
const outer = makeSquareWire(30);

// Inner profile: diameter 15 circle at center
const hole = makeCircle2D(point2d(15, 15), 7.5);

// Create profile with hole
const profile: Profile2D = {
  outer: outer.result,
  holes: [wireFromCircle(hole)]
};

// Extrude
const housing = extrude(profile, vector3d(0, 0, 1), 20);

// Volume = (30×30 - π×7.5²) × 20 = 18000 - 3534 = 14466
// 5 faces: 2 caps (with holes) + 1 outer cylindrical + 1 inner cylindrical + 4 outer planes
// Wait, actually: 2 caps + 4 outer side planes + 1 inner cylinder = 7 faces
```

---

## Exit Criteria

Phase 8 is complete when:

- [ ] `ExtrusionSurface`: type definition, construction, evaluation, normal
- [ ] `makeExtrusionSurface(curve, direction)` creates valid surface
- [ ] `evaluateExtrusionSurface` / `normalExtrusionSurface` work correctly
- [ ] `extrude(wire, direction, distance)` creates valid Solid
- [ ] `extrudeSymmetric(wire, direction, totalDistance)` works correctly
- [ ] Surface canonicalization: line→plane, circle→cylinder
- [ ] Profile validation: rejects open, non-planar, self-intersecting
- [ ] Profiles with holes create solids with through-holes
- [ ] Non-convex profiles (L-shape, U-shape) work correctly
- [ ] STEP converter: `SURFACE_OF_LINEAR_EXTRUSION`
- [ ] STEP round-trip tests pass for extruded solids
- [ ] Volume verification tests pass (known formulas)
- [ ] All edge case tests (zero distance, negative, etc.) fail appropriately
- [ ] Tests: ≥ 50 tests covering all cases
- [ ] Viewer example: extrude-basic (rectangle→box, circle→cylinder)
- [ ] Viewer example: extrude-profile (L-bracket)
- [ ] Viewer example: extrude-with-hole (square with hole → housing)

---

## Implementation Order

1. **ExtrusionSurface Type** (~100 lines)
   - Interface definition
   - `makeExtrusionSurface` constructor
   - Validation (non-zero direction, valid curve)

2. **Surface Evaluation** (~150 lines)
   - `evaluateExtrusionSurface(surface, u, v)`
   - `normalExtrusionSurface(surface, u, v)`
   - `derivativesExtrusionSurface(surface, u, v)`
   - Tests for each function

3. **Surface Canonicalization** (~100 lines)
   - `getCanonicalSurfaceType(curve, direction)`
   - `canonicalizeExtrusionSurface(surface)`
   - Tests: line→plane, circle→cylinder, arc→cylinder

4. **Profile Validation** (~150 lines)
   - `validateExtrudeProfile(input)`
   - Closed wire check
   - Planarity check
   - Wire direction normalization (CCW outer, CW inner)

5. **Side Face Generation** (~200 lines)
   - `generateSideFace(edge, direction, distance)`
   - Handle line edges (4-edge rectangular face)
   - Handle arc edges (4-edge curved face)
   - Handle circle edges (special case: single side face)

6. **Cap Face Generation** (~150 lines)
   - `generateCapFaces(outerWire, innerWires, plane, direction, distance)`
   - Bottom face with correct orientation
   - Top face (translated) with correct orientation
   - Include holes in both caps

7. **Main Extrude Function** (~150 lines)
   - `extrude(profile, direction, distance)`
   - Orchestrate validation → sides → caps → assembly
   - Build `ExtrudeResult` with metadata

8. **Symmetric Extrude** (~50 lines)
   - `extrudeSymmetric(profile, direction, totalDistance)`
   - Translate profile, call basic extrude

9. **STEP Converters** (~150 lines)
   - `extrusionSurfaceToStep`
   - `stepToExtrusionSurface`
   - Update face/solid converters to handle new surface type

10. **Integration & Polish** (~100 lines)
    - Export from index.ts
    - Additional edge case tests
    - Performance tests

11. **Viewer Examples** (~200 lines)
    - extrude-basic
    - extrude-profile  
    - extrude-with-hole

**Estimated total:** ~1500 lines of implementation + ~800 lines of tests

---

## References

- [OCCT BRepPrimAPI_MakePrism](https://dev.opencascade.org/doc/refman/html/class_b_rep_prim_a_p_i___make_prism.html)
- [OCCT Geom_SurfaceOfLinearExtrusion](https://dev.opencascade.org/doc/refman/html/class_geom___surface_of_linear_extrusion.html)
- [ISO 10303-42: SURFACE_OF_LINEAR_EXTRUSION](https://www.steptools.com/stds/smrl/data/modules/elemental_geometric_shape/sys/4_info_reqs.htm#elemental_geometric_shape_arm.surface_of_linear_extrusion)
- [FreeCAD Part Extrude](https://wiki.freecad.org/Part_Extrude)
