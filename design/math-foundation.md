# Phase 1: Mathematical Foundation — Design Document

## Overview

Basic mathematical primitives that everything else builds on: points, vectors, transforms, coordinate systems, and bounding boxes.

## OCCT Reference

| labrep | OCCT | Notes |
|--------|------|-------|
| `Point2D` | `gp_Pnt2d` | 2D point |
| `Vector2D` | `gp_Vec2d` | 2D vector |
| `Point3D` | `gp_Pnt` | 3D point |
| `Vector3D` | `gp_Vec` | 3D vector |
| `Transform3D` | `gp_Trsf` | 4x4 transformation matrix |
| `Axis` | `gp_Ax1` | Origin + direction |
| `Plane` | `gp_Pln` | Origin + normal + X axis |
| `BoundingBox3D` | `Bnd_Box` | Axis-aligned bounding box |

**OCCT source locations:**
- `library/opencascade/src/FoundationClasses/TKMath/gp/gp_Pnt.hxx`
- `library/opencascade/src/FoundationClasses/TKMath/gp/gp_Vec.hxx`
- `library/opencascade/src/FoundationClasses/TKMath/gp/gp_Trsf.hxx`

---

## Data Types

### Point2D

```typescript
interface Point2D {
  readonly x: number;
  readonly y: number;
}

function point2d(x: number, y: number): Point2D;
function distance2d(p1: Point2D, p2: Point2D): number;
function midpoint2d(p1: Point2D, p2: Point2D): Point2D;
function addVector2d(p: Point2D, v: Vector2D): Point2D;
function subtractPoints2d(p1: Point2D, p2: Point2D): Vector2D;
function points2dEqual(p1: Point2D, p2: Point2D): boolean;

const ORIGIN_2D: Point2D;  // (0, 0)
```

### Vector2D

```typescript
interface Vector2D {
  readonly x: number;
  readonly y: number;
}

function vec2d(x: number, y: number): Vector2D;
function length2d(v: Vector2D): number;
function normalize2d(v: Vector2D): Vector2D;
function add2d(v1: Vector2D, v2: Vector2D): Vector2D;
function subtract2d(v1: Vector2D, v2: Vector2D): Vector2D;
function scale2d(v: Vector2D, s: number): Vector2D;
function dot2d(v1: Vector2D, v2: Vector2D): number;
function perpendicular(v: Vector2D): Vector2D;

const X_AXIS_2D: Vector2D;  // (1, 0)
const Y_AXIS_2D: Vector2D;  // (0, 1)
```

### Point3D

```typescript
interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function point3d(x: number, y: number, z: number): Point3D;
function distance(p1: Point3D, p2: Point3D): number;
function midpoint(p1: Point3D, p2: Point3D): Point3D;
function addVector(p: Point3D, v: Vector3D): Point3D;
function subtractPoints(p1: Point3D, p2: Point3D): Vector3D;
function pointsEqual(p1: Point3D, p2: Point3D): boolean;

const ORIGIN: Point3D;  // (0, 0, 0)
```

### Vector3D

```typescript
interface Vector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function vec3d(x: number, y: number, z: number): Vector3D;
function length(v: Vector3D): number;
function normalize(v: Vector3D): Vector3D;
function add(v1: Vector3D, v2: Vector3D): Vector3D;
function subtract(v1: Vector3D, v2: Vector3D): Vector3D;
function scale(v: Vector3D, s: number): Vector3D;
function dot(v1: Vector3D, v2: Vector3D): number;
function cross(v1: Vector3D, v2: Vector3D): Vector3D;
function negate(v: Vector3D): Vector3D;

const X_AXIS: Vector3D;  // (1, 0, 0)
const Y_AXIS: Vector3D;  // (0, 1, 0)
const Z_AXIS: Vector3D;  // (0, 0, 1)
```

### Transform3D

```typescript
interface Transform3D {
  readonly matrix: readonly number[];  // 16 elements, column-major
}

function identity(): Transform3D;
function translation(v: Vector3D): Transform3D;
function rotationX(angle: number): Transform3D;
function rotationY(angle: number): Transform3D;
function rotationZ(angle: number): Transform3D;
function scaling(sx: number, sy: number, sz: number): Transform3D;
function compose(t1: Transform3D, t2: Transform3D): Transform3D;
function inverse(t: Transform3D): Transform3D;
function transformPoint(t: Transform3D, p: Point3D): Point3D;
function transformVector(t: Transform3D, v: Vector3D): Vector3D;
```

### Axis

```typescript
interface Axis {
  readonly origin: Point3D;
  readonly direction: Vector3D;  // Unit vector
}

function axis(origin: Point3D, direction: Vector3D): Axis;

const X_AXIS_3D: Axis;
const Y_AXIS_3D: Axis;
const Z_AXIS_3D: Axis;
```

### Plane

```typescript
interface Plane {
  readonly origin: Point3D;
  readonly normal: Vector3D;  // Unit vector
  readonly xAxis: Vector3D;   // Unit vector in plane
}

function plane(origin: Point3D, normal: Vector3D, xAxis?: Vector3D): Plane;
function distanceToPoint(plane: Plane, point: Point3D): number;
function projectPoint(plane: Plane, point: Point3D): Point3D;
function containsPoint(plane: Plane, point: Point3D): boolean;

const XY_PLANE: Plane;
const XZ_PLANE: Plane;
const YZ_PLANE: Plane;
```

### BoundingBox3D

```typescript
interface BoundingBox3D {
  readonly min: Point3D;
  readonly max: Point3D;
}

function boundingBox(min: Point3D, max: Point3D): BoundingBox3D;
function emptyBoundingBox(): BoundingBox3D;
function addPoint(box: BoundingBox3D, point: Point3D): BoundingBox3D;
function contains(box: BoundingBox3D, point: Point3D): boolean;
function center(box: BoundingBox3D): Point3D;
function size(box: BoundingBox3D): Vector3D;
function intersects(box1: BoundingBox3D, box2: BoundingBox3D): boolean;
function isEmpty(box: BoundingBox3D): boolean;
```

### Tolerance

```typescript
const TOLERANCE = 1e-7;

function isZero(value: number): boolean;
function isEqual(a: number, b: number): boolean;
```

---

## Testing Approach

### Point2D Tests

| Test | Description |
|------|-------------|
| `creates_point` | point2d(x, y) creates point with correct coordinates |
| `distance_between_points` | distance2d computes Euclidean distance |
| `distance_coincident` | distance between same point is 0 |
| `midpoint` | midpoint2d returns point halfway between |
| `add_vector` | addVector2d translates point |
| `subtract_points` | subtractPoints2d returns displacement vector |
| `equality_within_tolerance` | points2dEqual uses tolerance |
| `origin_constant` | ORIGIN_2D is (0, 0) |

### Vector2D Tests

| Test | Description |
|------|-------------|
| `creates_vector` | vec2d(x, y) creates vector |
| `length` | length2d computes magnitude |
| `normalize` | normalize2d returns unit vector |
| `normalize_zero` | normalizing zero vector returns zero |
| `add_subtract` | add2d and subtract2d work correctly |
| `scale` | scale2d multiplies components |
| `dot_product` | dot2d computes dot product |
| `perpendicular` | perpendicular returns 90° rotated vector |
| `axis_constants` | X_AXIS_2D, Y_AXIS_2D defined |

### Vector3D Tests

| Test | Description |
|------|-------------|
| `creates_vector` | vec3d(x, y, z) creates vector |
| `length` | length computes magnitude |
| `normalize` | normalize returns unit vector |
| `cross_product` | cross returns perpendicular vector |
| `cross_anticommutative` | cross(a,b) = -cross(b,a) |
| `dot_product` | dot computes dot product |
| `orthogonal_dot_zero` | perpendicular vectors have dot = 0 |

### Transform3D Tests

| Test | Description |
|------|-------------|
| `identity` | identity transform doesn't change points |
| `translation` | translation moves points |
| `rotation_x` | rotationX rotates around X axis |
| `rotation_y` | rotationY rotates around Y axis |
| `rotation_z` | rotationZ rotates around Z axis |
| `scaling` | scaling scales coordinates |
| `compose` | compose chains transforms |
| `inverse` | inverse undoes transform |
| `transform_point` | transformPoint applies to point |
| `transform_vector` | transformVector applies to vector (no translation) |

### BoundingBox3D Tests

| Test | Description |
|------|-------------|
| `creates_box` | boundingBox creates from min/max |
| `empty_box` | emptyBoundingBox is empty |
| `add_point_expands` | addPoint grows box to include point |
| `contains_point` | contains checks if point inside |
| `center` | center returns box center |
| `size` | size returns dimensions |
| `intersects` | intersects checks overlap |

---

## Viewer Examples

### points-vectors
**Visual:** Origin point, several labeled points, and vectors shown as arrows from origin.
**Code:**
```typescript
import { point3d, vec3d, ORIGIN, X_AXIS, Y_AXIS, Z_AXIS } from '@labrep/generation';

const origin = ORIGIN;
const p1 = point3d(1, 2, 0);
const direction = vec3d(1, 1, 1);
```
**Status:** ✅ Implemented (`points` and `vectors` examples)

### primitives-box/sphere/cylinder
**Visual:** 3D primitives with rotation animation.
**Code:**
```typescript
import { makeBox, makeSphere, makeCylinder } from '@labrep/generation';

const box = makeBox(1, 1, 1);
const sphere = makeSphere(0.5);
const cylinder = makeCylinder(0.4, 1);
```
**Status:** ✅ Implemented (`primitives-*` examples)

---

## File Organization

```
generation/src/core/
├── index.ts
├── tolerance.ts
├── point2d.ts
├── vector2d.ts
├── point3d.ts
├── vector3d.ts
├── transform3d.ts
├── axis.ts
├── plane.ts
└── bounding-box.ts

generation/tests/core/
├── tolerance.test.ts
├── point2d.test.ts
├── vector2d.test.ts
├── point3d.test.ts
├── vector3d.test.ts
├── transform3d.test.ts
├── axis.test.ts
├── plane.test.ts
└── bounding-box.test.ts
```

---

## Exit Criteria

Phase 1 is complete when:
- [x] Point2D: creation, distance, midpoint, vector operations
- [x] Vector2D: creation, length, normalize, arithmetic, dot, perpendicular
- [x] Point3D: creation, distance, midpoint, vector operations
- [x] Vector3D: creation, length, normalize, arithmetic, dot, cross
- [x] Transform3D: identity, translation, rotation, scaling, compose, inverse
- [x] Axis: creation, predefined axes
- [x] Plane: creation, distance, projection, predefined planes
- [x] BoundingBox3D: creation, expansion, queries
- [x] Tolerance: constants and comparison functions
- [x] All tests passing
- [x] Viewer examples for points, vectors, primitives

**Status: ✅ COMPLETE**
