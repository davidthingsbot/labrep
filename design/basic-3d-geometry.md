# Phase 6: Basic 3D Geometry + STEP Topology — Design Document

## Overview

Implement 3D curves, surfaces, and the core BRep topology hierarchy: Vertex → Edge → Wire → Face → Shell → Solid. This phase brings labrep from 2D sketch geometry to actual 3D solid representation.

## OCCT Reference

| labrep | OCCT | Notes |
|--------|------|-------|
| `Line3D` | `Geom_Line` + parameter bounds | Bounded 3D line segment |
| `Circle3D` | `Geom_Circle` | Full circle in 3D |
| `Arc3D` | `Geom_TrimmedCurve` wrapping `Geom_Circle` | Bounded arc |
| `PlaneSurface` | `Geom_Plane` | Infinite planar surface |
| `CylindricalSurface` | `Geom_CylindricalSurface` | Infinite cylinder |
| `Vertex` | `TopoDS_Vertex` + `BRep_TVertex` | Point + tolerance |
| `Edge` | `TopoDS_Edge` + `BRep_TEdge` | Curve + bounds + tolerance |
| `Wire` | `TopoDS_Wire` | Connected edge sequence |
| `Face` | `TopoDS_Face` + `BRep_TFace` | Bounded surface region |
| `Shell` | `TopoDS_Shell` | Connected face set |
| `Solid` | `TopoDS_Solid` | Closed volume |

**OCCT source locations:**
- `library/opencascade/src/Geom/Geom_Line.cxx`
- `library/opencascade/src/Geom/Geom_Circle.cxx`
- `library/opencascade/src/Geom/Geom_Plane.cxx`
- `library/opencascade/src/TopoDS/TopoDS_Vertex.hxx`
- `library/opencascade/src/BRep/BRep_Builder.cxx`

---

## Design Decisions

### Tolerance Model

**Decision:** Global tolerance constant for Phase 6.

```typescript
// Use existing TOLERANCE from core/tolerance.ts
import { TOLERANCE } from './tolerance';  // 1e-7
```

Per-entity tolerances can be added later when importing models with varying precision.

### Circle3D/Arc3D Parametrization

**Decision:** OCCT approach — angle measured from `plane.xAxis` in the plane's coordinate system.

```
Circle3D at angle θ:
  P(θ) = plane.origin 
       + radius * cos(θ) * plane.xAxis 
       + radius * sin(θ) * (plane.normal × plane.xAxis)
```

This means:
- `θ = 0` → point along `plane.xAxis` from center
- `θ = π/2` → point along `plane.yAxis` (computed as `normal × xAxis`)
- CCW when viewed from the direction of `plane.normal`

### Validation

**Decision:** Validate on construction. Factory functions return `OperationResult<T>`.

Examples:
- `makeEdge` fails if curve endpoints don't match vertices within tolerance
- `makeWire` fails if edges don't connect
- `makeFace` fails if outer wire isn't closed
- `makeSolid` fails if shell isn't closed

---

## Data Types

### Geometry: 3D Curves

```typescript
/**
 * Common interface for all 3D parametric curves.
 */
interface Curve3D {
  readonly type: 'line3d' | 'circle3d' | 'arc3d';
  readonly startParam: number;
  readonly endParam: number;
  readonly isClosed: boolean;
  readonly startPoint: Point3D;
  readonly endPoint: Point3D;
}

/**
 * A 3D line segment.
 * 
 * Parametrization: P(t) = origin + t * direction
 * t ranges from 0 to segmentLength.
 */
interface Line3D extends Curve3D {
  readonly type: 'line3d';
  readonly origin: Point3D;
  readonly direction: Vector3D;  // unit vector
  readonly segmentLength: number;
}

/**
 * A full circle in 3D space.
 * 
 * The circle lies in the given plane, centered at plane.origin.
 * Parametrization: P(θ) = center + r*cos(θ)*xAxis + r*sin(θ)*yAxis
 * where yAxis = normalize(cross(normal, xAxis))
 * θ ranges from 0 to 2π.
 */
interface Circle3D extends Curve3D {
  readonly type: 'circle3d';
  readonly plane: Plane;
  readonly radius: number;
}

/**
 * A circular arc in 3D space.
 * 
 * Same parametrization as Circle3D, but θ ranges from startAngle to endAngle.
 */
interface Arc3D extends Curve3D {
  readonly type: 'arc3d';
  readonly plane: Plane;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}
```

### Geometry: Surfaces

```typescript
/**
 * Common interface for all parametric surfaces.
 */
interface Surface {
  readonly type: 'plane' | 'cylinder';
}

/**
 * An infinite planar surface.
 * 
 * Parametrization: P(u, v) = origin + u * xAxis + v * yAxis
 * where yAxis = normalize(cross(normal, xAxis))
 */
interface PlaneSurface extends Surface {
  readonly type: 'plane';
  readonly plane: Plane;
}

/**
 * An infinite cylindrical surface.
 * 
 * Parametrization: P(θ, v) = axis.origin + v * axis.direction
 *                          + radius * cos(θ) * refDir
 *                          + radius * sin(θ) * cross(axis.direction, refDir)
 * where refDir is perpendicular to axis.direction.
 */
interface CylindricalSurface extends Surface {
  readonly type: 'cylinder';
  readonly axis: Axis;
  readonly radius: number;
  readonly refDirection: Vector3D;  // perpendicular to axis, defines θ=0
}
```

### Topology

```typescript
/**
 * A topological vertex — a point in the BRep structure.
 */
interface Vertex {
  readonly point: Point3D;
}

/**
 * A topological edge — a bounded curve segment.
 * 
 * The curve is trimmed to [startParam, endParam].
 * startVertex.point must equal curve.evaluate(startParam) within tolerance.
 * endVertex.point must equal curve.evaluate(endParam) within tolerance.
 */
interface Edge {
  readonly curve: Curve3D;
  readonly startVertex: Vertex;
  readonly endVertex: Vertex;
  readonly startParam: number;
  readonly endParam: number;
}

/**
 * An edge with orientation information.
 * 
 * When forward=true, traverse from startVertex to endVertex.
 * When forward=false, traverse from endVertex to startVertex.
 */
interface OrientedEdge {
  readonly edge: Edge;
  readonly forward: boolean;
}

/**
 * A connected sequence of edges forming a path or loop.
 * 
 * Edges must connect end-to-end (within tolerance).
 * isClosed=true when the last edge connects back to the first.
 */
interface Wire {
  readonly edges: readonly OrientedEdge[];
  readonly isClosed: boolean;
}

/**
 * A bounded region of a surface.
 * 
 * The outerWire defines the external boundary (CCW when viewed from outside).
 * innerWires define holes (CW when viewed from outside).
 */
interface Face {
  readonly surface: Surface;
  readonly outerWire: Wire;
  readonly innerWires: readonly Wire[];
}

/**
 * A connected set of faces.
 * 
 * isClosed=true when the shell is watertight (no boundary edges).
 */
interface Shell {
  readonly faces: readonly Face[];
  readonly isClosed: boolean;
}

/**
 * A closed 3D volume defined by its boundary shell(s).
 * 
 * outerShell is the external boundary.
 * innerShells define internal voids/cavities.
 */
interface Solid {
  readonly outerShell: Shell;
  readonly innerShells: readonly Shell[];
}
```

---

## Functions

### 3D Curve Construction

```typescript
// Line3D
function makeLine3D(start: Point3D, end: Point3D): OperationResult<Line3D>;
function makeLine3DFromPointDir(origin: Point3D, direction: Vector3D, length: number): OperationResult<Line3D>;

// Circle3D
function makeCircle3D(plane: Plane, radius: number): OperationResult<Circle3D>;

// Arc3D
function makeArc3D(plane: Plane, radius: number, startAngle: number, endAngle: number): OperationResult<Arc3D>;
function makeArc3DThrough3Points(p1: Point3D, p2: Point3D, p3: Point3D): OperationResult<Arc3D>;
```

### 3D Curve Evaluation

```typescript
function evaluateCurve3D(curve: Curve3D, t: number): Point3D;
function tangentCurve3D(curve: Curve3D, t: number): Vector3D;
function lengthCurve3D(curve: Curve3D): number;
function reverseCurve3D(curve: Curve3D): Curve3D;
```

### Surface Construction

```typescript
function makePlaneSurface(plane: Plane): PlaneSurface;
function makeCylindricalSurface(axis: Axis, radius: number): OperationResult<CylindricalSurface>;
```

### Surface Evaluation

```typescript
function evaluateSurface(surface: Surface, u: number, v: number): Point3D;
function normalSurface(surface: Surface, u: number, v: number): Vector3D;
```

### Topology Construction

```typescript
// Vertex
function makeVertex(point: Point3D): Vertex;

// Edge
function makeEdge(curve: Curve3D, startVertex: Vertex, endVertex: Vertex): OperationResult<Edge>;
function makeEdgeFromCurve(curve: Curve3D): OperationResult<Edge>;  // auto-create vertices

// OrientedEdge
function orientEdge(edge: Edge, forward: boolean): OrientedEdge;
function reverseOrientedEdge(oe: OrientedEdge): OrientedEdge;

// Wire
function makeWire(edges: OrientedEdge[]): OperationResult<Wire>;
function makeWireFromEdges(edges: Edge[]): OperationResult<Wire>;  // auto-orient

// Face  
function makeFace(surface: Surface, outerWire: Wire, innerWires?: Wire[]): OperationResult<Face>;
function makePlanarFace(outerWire: Wire, innerWires?: Wire[]): OperationResult<Face>;  // infer plane from wire

// Shell
function makeShell(faces: Face[]): OperationResult<Shell>;

// Solid
function makeSolid(outerShell: Shell, innerShells?: Shell[]): OperationResult<Solid>;
```

### Topology Queries

```typescript
// Edge
function edgeStartPoint(edge: Edge): Point3D;
function edgeEndPoint(edge: Edge): Point3D;
function edgeLength(edge: Edge): number;

// OrientedEdge
function orientedEdgeStartPoint(oe: OrientedEdge): Point3D;
function orientedEdgeEndPoint(oe: OrientedEdge): Point3D;

// Wire
function wireLength(wire: Wire): number;
function wireStartPoint(wire: Wire): Point3D;
function wireEndPoint(wire: Wire): Point3D;

// Face
function faceNormal(face: Face, u: number, v: number): Vector3D;
function faceArea(face: Face): number;  // numerical integration

// Shell
function shellSurfaceArea(shell: Shell): number;
function shellIsClosed(shell: Shell): boolean;

// Solid
function solidVolume(solid: Solid): number;  // numerical integration
function solidSurfaceArea(solid: Solid): number;
```

### Validation

```typescript
function validateEdge(edge: Edge): OperationResult<Edge>;
function validateWire(wire: Wire): OperationResult<Wire>;
function validateFace(face: Face): OperationResult<Face>;
function validateShell(shell: Shell): OperationResult<Shell>;
function validateSolid(solid: Solid): OperationResult<Solid>;
```

---

## STEP Entity Mapping

### New Converters Needed

| labrep Type | STEP Entity | Direction |
|-------------|-------------|-----------|
| `Line3D` | `LINE` | ↔ |
| `Circle3D` | `CIRCLE` | ↔ |
| `Arc3D` | `TRIMMED_CURVE` wrapping `CIRCLE` | ↔ |
| `PlaneSurface` | `PLANE` | ↔ |
| `CylindricalSurface` | `CYLINDRICAL_SURFACE` | ↔ |
| `Vertex` | `VERTEX_POINT` | ↔ |
| `Edge` | `EDGE_CURVE` | ↔ |
| `OrientedEdge` | `ORIENTED_EDGE` | ↔ |
| `Wire` | `EDGE_LOOP` | ↔ |
| `Face` | `ADVANCED_FACE` | ↔ |
| `Shell` | `CLOSED_SHELL` / `OPEN_SHELL` | ↔ |
| `Solid` | `MANIFOLD_SOLID_BREP` | ↔ |

### Example STEP Structure

```step
#1 = CARTESIAN_POINT('', (0., 0., 0.));
#2 = DIRECTION('', (0., 0., 1.));
#3 = DIRECTION('', (1., 0., 0.));
#4 = AXIS2_PLACEMENT_3D('', #1, #2, #3);
#5 = PLANE('', #4);
#6 = VERTEX_POINT('', #1);
#7 = LINE('', #1, ...);
#8 = EDGE_CURVE('', #6, #6, #7, .T.);
#9 = ORIENTED_EDGE('', *, *, #8, .T.);
#10 = EDGE_LOOP('', (#9, ...));
#11 = FACE_BOUND('', #10, .T.);
#12 = ADVANCED_FACE('', (#11), #5, .T.);
#13 = CLOSED_SHELL('', (#12, ...));
#14 = MANIFOLD_SOLID_BREP('', #13);
```

---

## Testing Approach

### Line3D Tests

| Test | Description |
|------|-------------|
| `construction_from_two_points` | Create line from start/end |
| `construction_from_point_dir` | Create from origin + direction + length |
| `construction_fails_coincident` | Coincident points → failure |
| `evaluate_at_endpoints` | evaluate(0) = start, evaluate(len) = end |
| `evaluate_midpoint` | evaluate(len/2) = midpoint |
| `tangent_is_direction` | tangent equals unit direction |
| `length_correct` | length = distance(start, end) |

### Circle3D Tests

| Test | Description |
|------|-------------|
| `construction_on_xy_plane` | Circle on XY_PLANE |
| `construction_on_tilted_plane` | Circle on arbitrary plane |
| `construction_fails_zero_radius` | radius ≤ 0 → failure |
| `evaluate_at_0` | θ=0 → point along xAxis |
| `evaluate_at_pi_2` | θ=π/2 → point along yAxis |
| `is_closed` | isClosed = true |
| `length_is_2pi_r` | circumference = 2πr |

### Arc3D Tests

| Test | Description |
|------|-------------|
| `construction_quarter_arc` | 0 to π/2 |
| `construction_through_3_points` | Fit arc to 3 points |
| `is_not_closed` | isClosed = false |
| `length_is_angle_times_r` | length = |Δθ| * r |
| `evaluate_endpoints` | evaluate(startAngle) = startPoint |

### PlaneSurface Tests

| Test | Description |
|------|-------------|
| `evaluate_at_origin` | evaluate(0, 0) = plane.origin |
| `evaluate_offset` | evaluate(u, v) offset correctly |
| `normal_is_plane_normal` | normal(u, v) = plane.normal |

### Vertex/Edge/Wire Tests

| Test | Description |
|------|-------------|
| `make_vertex` | Creates vertex from point |
| `make_edge_from_line` | Edge from Line3D + vertices |
| `make_edge_validates_endpoints` | Fails if vertices don't match curve |
| `make_wire_from_edges` | Wire from connected edges |
| `make_wire_fails_gap` | Fails if edges don't connect |
| `wire_is_closed` | Detects closed loops |

### Face Tests

| Test | Description |
|------|-------------|
| `make_planar_face_from_rectangle` | 4-edge wire → face |
| `make_planar_face_with_hole` | Outer + inner wires |
| `face_normal_points_outward` | Normal consistent with winding |
| `make_face_fails_open_wire` | Open outer wire → failure |

### Shell/Solid Tests

| Test | Description |
|------|-------------|
| `make_shell_from_box_faces` | 6 faces → closed shell |
| `shell_is_closed` | Detects watertight shell |
| `make_solid_from_shell` | Shell → solid |
| `solid_volume_unit_cube` | 1×1×1 box has volume 1 |

---

## File Organization

```
generation/src/
├── core/                 # (existing)
├── geometry/
│   ├── line2d.ts         # (existing)
│   ├── ...
│   ├── curve3d.ts        # NEW: Curve3D interface + helpers
│   ├── line3d.ts         # NEW
│   ├── circle3d.ts       # NEW
│   ├── arc3d.ts          # NEW
│   └── index.ts          # Update exports
├── surfaces/             # NEW folder
│   ├── surface.ts        # Surface interface
│   ├── plane-surface.ts
│   ├── cylindrical-surface.ts
│   └── index.ts
├── topology/             # NEW folder
│   ├── vertex.ts
│   ├── edge.ts
│   ├── wire.ts
│   ├── face.ts
│   ├── shell.ts
│   ├── solid.ts
│   ├── validation.ts
│   └── index.ts
├── io/
│   ├── step-converters.ts  # Extend with new types
│   └── ...
└── index.ts              # Update exports

generation/tests/
├── geometry/
│   ├── line3d.test.ts    # NEW
│   ├── circle3d.test.ts  # NEW
│   └── arc3d.test.ts     # NEW
├── surfaces/             # NEW
│   ├── plane-surface.test.ts
│   └── cylindrical-surface.test.ts
└── topology/             # NEW
    ├── vertex.test.ts
    ├── edge.test.ts
    ├── wire.test.ts
    ├── face.test.ts
    ├── shell.test.ts
    └── solid.test.ts
```

---

## Implementation Order

1. **3D Curves** (geometry only, no topology yet)
   - `Curve3D` interface
   - `Line3D` + tests
   - `Circle3D` + tests
   - `Arc3D` + tests

2. **Surfaces**
   - `Surface` interface
   - `PlaneSurface` + tests
   - `CylindricalSurface` + tests

3. **Basic Topology**
   - `Vertex` + tests
   - `Edge` + tests
   - `Wire` + tests

4. **Face**
   - `Face` + tests
   - Planar face construction

5. **Shell & Solid**
   - `Shell` + tests
   - `Solid` + tests
   - Volume/area calculations

6. **STEP Converters**
   - Extend existing converters
   - Round-trip tests

7. **Viewer Examples**
   - Line3D / Circle3D / Arc3D visualization
   - Wire → Face construction demo
   - Box as explicit topology (6 faces)

---

## Viewer Examples

### curves-3d
**Visual:** 3D curves in space — Line3D, Circle3D, Arc3D on tilted planes. Animated point traveling along each curve with tangent vectors shown.
**Code:**
```typescript
import { makeLine3D, makeCircle3D, makeArc3D, evaluateCurve3D, tangentCurve3D } from '@labrep/generation';

const line = makeLine3D(point3d(0, 0, 0), point3d(2, 1, 1));
const circle = makeCircle3D(XY_PLANE, 1.5);
const arc = makeArc3D(tiltedPlane, 1, 0, Math.PI);

// Evaluate at parameter t
const pt = evaluateCurve3D(circle.result, t);
const tangent = tangentCurve3D(circle.result, t);
```

### topology-box
**Visual:** Unit cube as explicit BRep topology. Vertices shown as small spheres, edges as lines, faces as semi-transparent colored surfaces. Demonstrates the full Vertex → Edge → Wire → Face → Shell → Solid hierarchy.
**Code:**
```typescript
import { makeVertex, makeEdge, makeWire, makePlanarFace, makeShell, makeSolid } from '@labrep/generation';

// 8 vertices
const v000 = makeVertex(point3d(0, 0, 0));
const v100 = makeVertex(point3d(1, 0, 0));
// ... 6 more vertices

// 12 edges connecting vertices
const e_bottom_front = makeEdge(makeLine3D(v000.point, v100.point).result, v000, v100);
// ... 11 more edges

// 6 faces from wires
const bottomFace = makePlanarFace(makeWire([...]).result);
// ... 5 more faces

// Shell and Solid
const shell = makeShell([bottomFace, topFace, ...]);
const solid = makeSolid(shell.result);
```

### topology-cylinder
**Visual:** Cylinder as BRep with mixed surface types. Two planar circular faces (top/bottom) and one cylindrical side face. Shows how different surface types combine in a single solid.
**Code:**
```typescript
import { makePlaneSurface, makeCylindricalSurface, makeFace, makeShell, makeSolid } from '@labrep/generation';

// Top and bottom are planar
const topSurface = makePlaneSurface(topPlane);
const bottomSurface = makePlaneSurface(bottomPlane);

// Side is cylindrical
const sideSurface = makeCylindricalSurface(Z_AXIS_3D, radius);

// Build faces with appropriate wires
const topFace = makeFace(topSurface, topWire);
const bottomFace = makeFace(bottomSurface, bottomWire);
const sideFace = makeFace(sideSurface, sideWire);

const cylinder = makeSolid(makeShell([topFace, bottomFace, sideFace]).result);
```

### topology-step-roundtrip
**Visual:** Export a BRep solid to STEP, parse it back, show both original and imported side-by-side. Demonstrates full topology serialization.
**Code:**
```typescript
import { makeSolid, solidToStep, writeStep, parseStep, stepToSolid } from '@labrep/generation';

// Build a solid
const original = makeSolid(...);

// Export to STEP
const builder = createStepModelBuilder();
solidToStep(original, builder);
const stepText = writeStep(builder.build());

// Import back
const parsed = parseStep(stepText);
const imported = stepToSolid(parsed.result);

// Compare: same topology, same volume
solidVolume(original);   // 1.0
solidVolume(imported);   // 1.0
```

---

## Exit Criteria

Phase 6 is complete when:
- [x] Line3D: construction, evaluation, tangent, length *(21 tests)*
- [x] Circle3D: construction, evaluation, tangent, length *(20 tests)*
- [x] Arc3D: construction, evaluation, tangent, length, through-3-points *(27 tests)*
- [x] PlaneSurface: construction, evaluation, normal *(13 tests)*
- [x] CylindricalSurface: construction, evaluation, normal *(17 tests)*
- [x] Vertex: construction *(6 tests)*
- [x] Edge: construction with validation *(14 tests)*
- [x] Wire: construction with connectivity validation *(17 tests)*
- [x] Face: construction from surface + wires *(11 tests)*
- [x] Shell: construction, isClosed detection *(7 tests)*
- [x] Solid: construction, volume calculation *(8 tests)*
- [x] STEP converters for all new types *(14 tests)*
- [x] Round-trip STEP tests pass
- [x] All tests passing *(535 total)*
- [ ] Viewer example: curves-3d (Line3D, Circle3D, Arc3D with animation)
- [ ] Viewer example: topology-box (explicit BRep cube)
- [ ] Viewer example: topology-cylinder (mixed surface types)
- [ ] Viewer example: topology-step-roundtrip (export/import demo)

**Status:** 🔄 Core Complete — awaiting viewer examples
