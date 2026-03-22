# Phase 2: 2D Curves — Design Document

## Overview

Implement 2D parametric curves for use in sketches. These are the fundamental elements from which sketch profiles are built.

## OCCT Reference

| labrep | OCCT | Notes |
|--------|------|-------|
| `Curve2D` | `Geom2d_Curve` | Abstract base interface |
| `Line2D` | `Geom2d_Line` | Infinite line with parametric form P(u) = origin + u*direction |
| `Circle2D` | `Geom2d_Circle` | Full circle, parameter 0 to 2π |
| `Arc2D` | `Geom2d_TrimmedCurve` + `Geom2d_Circle` | Circular arc (trimmed circle) |
| `Wire2D` | `TopoDS_Wire` (2D) | Connected sequence of curves |

**OCCT source locations:**
- `library/opencascade/src/ModelingData/TKG2d/Geom2d/Geom2d_Curve.hxx`
- `library/opencascade/src/ModelingData/TKG2d/Geom2d/Geom2d_Line.hxx`
- `library/opencascade/src/ModelingData/TKG2d/Geom2d/Geom2d_Circle.hxx`

---

## Data Types

### Curve2D (Interface)

All 2D curves share this interface:

```typescript
interface Curve2D {
  /** Curve type identifier */
  readonly type: 'line' | 'circle' | 'arc';
  
  /** Evaluate point at parameter t */
  evaluate(t: number): Point2D;
  
  /** Evaluate tangent (first derivative) at parameter t */
  tangent(t: number): Vector2D;
  
  /** Start of parameter range */
  readonly startParam: number;
  
  /** End of parameter range */
  readonly endParam: number;
  
  /** Is the curve closed (start point equals end point)? */
  readonly isClosed: boolean;
  
  /** Point at start of curve */
  readonly startPoint: Point2D;
  
  /** Point at end of curve */
  readonly endPoint: Point2D;
  
  /** Approximate arc length (may be exact for some curve types) */
  length(): number;
  
  /** Create a reversed copy (same geometry, opposite direction) */
  reversed(): Curve2D;
  
  /** Transform by a 2D transformation matrix */
  transformed(transform: Transform2D): Curve2D;
}
```

### Line2D

Infinite line in parametric form: `P(t) = origin + t * direction`

For bounded line segments, we use parameter range [0, length].

```typescript
interface Line2D extends Curve2D {
  readonly type: 'line';
  
  /** A point on the line (typically the "start" for a segment) */
  readonly origin: Point2D;
  
  /** Unit direction vector */
  readonly direction: Vector2D;
}

/** Create a line segment from two points */
function makeLine2D(start: Point2D, end: Point2D): OperationResult<Line2D>;

/** Create an infinite line from point and direction */
function makeLine2DFromPointDir(origin: Point2D, direction: Vector2D): OperationResult<Line2D>;
```

**Parametrization:**
- `startParam = 0`
- `endParam = distance(start, end)` for segments
- `evaluate(t) = origin + t * direction`
- `tangent(t) = direction` (constant for lines)

### Circle2D

Full circle centered at a point.

```typescript
interface Circle2D extends Curve2D {
  readonly type: 'circle';
  
  /** Center point */
  readonly center: Point2D;
  
  /** Radius (positive) */
  readonly radius: number;
}

/** Create a circle from center and radius */
function makeCircle2D(center: Point2D, radius: number): OperationResult<Circle2D>;

/** Create a circle through three points */
function makeCircle2DThrough3Points(p1: Point2D, p2: Point2D, p3: Point2D): OperationResult<Circle2D>;
```

**Parametrization:**
- `startParam = 0`
- `endParam = 2π`
- `isClosed = true`
- `evaluate(t) = center + radius * (cos(t), sin(t))`
- `tangent(t) = radius * (-sin(t), cos(t))`

### Arc2D

Circular arc — a portion of a circle.

```typescript
interface Arc2D extends Curve2D {
  readonly type: 'arc';
  
  /** Center of the underlying circle */
  readonly center: Point2D;
  
  /** Radius of the underlying circle */
  readonly radius: number;
  
  /** Start angle in radians */
  readonly startAngle: number;
  
  /** End angle in radians */
  readonly endAngle: number;
}

/** Create an arc from center, radius, and angles */
function makeArc2D(
  center: Point2D, 
  radius: number, 
  startAngle: number, 
  endAngle: number
): OperationResult<Arc2D>;

/** Create an arc through three points */
function makeArc2DThrough3Points(
  start: Point2D, 
  mid: Point2D, 
  end: Point2D
): OperationResult<Arc2D>;

/** Create an arc from start point, end point, and bulge factor */
function makeArc2DFromBulge(
  start: Point2D,
  end: Point2D,
  bulge: number
): OperationResult<Arc2D>;
```

**Parametrization:**
- `startParam = startAngle`
- `endParam = endAngle`
- `isClosed = false` (arcs are never closed; use Circle2D for closed)
- `evaluate(t) = center + radius * (cos(t), sin(t))`
- `tangent(t) = radius * (-sin(t), cos(t))`

**Note on angle direction:** 
- Positive angles go counter-clockwise (standard mathematical convention)
- If `endAngle < startAngle`, the arc goes clockwise (or we normalize by adding 2π)

### Wire2D

A connected sequence of curves forming a path.

```typescript
interface Wire2D {
  /** Ordered sequence of curves */
  readonly curves: readonly Curve2D[];
  
  /** Is the wire closed (end of last curve connects to start of first)? */
  readonly isClosed: boolean;
  
  /** Total length of all curves */
  length(): number;
  
  /** Start point of the wire */
  readonly startPoint: Point2D;
  
  /** End point of the wire */
  readonly endPoint: Point2D;
}

/** Create a wire from connected curves */
function makeWire2D(curves: Curve2D[]): OperationResult<Wire2D>;
```

**Validation:**
- Curves must connect end-to-end (within tolerance)
- Empty wire is invalid
- Single curve wire is valid

---

## Functions

### Curve Evaluation

```typescript
/** Evaluate curve at parameter */
function evaluateCurve2D(curve: Curve2D, t: number): Point2D;

/** Evaluate tangent at parameter */
function tangentCurve2D(curve: Curve2D, t: number): Vector2D;

/** Compute curve length */
function lengthCurve2D(curve: Curve2D): number;

/** Find parameter closest to a point */
function projectPointOnCurve2D(curve: Curve2D, point: Point2D): { param: number; distance: number };
```

### Curve Intersections

```typescript
interface Intersection2D {
  point: Point2D;
  paramOnCurve1: number;
  paramOnCurve2: number;
}

/** Find intersections between two curves */
function intersectCurves2D(curve1: Curve2D, curve2: Curve2D): Intersection2D[];

/** Specialized: line-line intersection */
function intersectLine2DLine2D(line1: Line2D, line2: Line2D): Intersection2D[];

/** Specialized: line-circle intersection */
function intersectLine2DCircle2D(line: Line2D, circle: Circle2D): Intersection2D[];

/** Specialized: circle-circle intersection */
function intersectCircle2DCircle2D(circle1: Circle2D, circle2: Circle2D): Intersection2D[];
```

### Curve Operations

```typescript
/** Reverse curve direction */
function reverseCurve2D<T extends Curve2D>(curve: T): T;

/** Transform curve */
function transformCurve2D<T extends Curve2D>(curve: T, transform: Transform2D): T;

/** Split curve at parameter */
function splitCurve2D(curve: Curve2D, t: number): [Curve2D, Curve2D];

/** Trim curve to parameter range */
function trimCurve2D(curve: Curve2D, t1: number, t2: number): Curve2D;
```

---

## Implementation Order

1. **Line2D** — Simplest curve, foundation for testing infrastructure
2. **Circle2D** — Closed curve, introduces angular parametrization  
3. **Arc2D** — Bounded circular arc, parameter range handling
4. **Intersections** — Line-line first, then line-circle, then circle-circle
5. **Wire2D** — Composite curve, connectivity validation

---

## Testing Approach

### Line2D Tests

| Test | Description |
|------|-------------|
| `construction_from_two_points` | Create line from start/end points |
| `construction_from_point_direction` | Create line from origin + direction |
| `evaluate_at_start` | evaluate(0) returns start point |
| `evaluate_at_end` | evaluate(length) returns end point |
| `evaluate_at_midpoint` | evaluate(length/2) returns midpoint |
| `tangent_is_constant` | tangent(t) equals direction for all t |
| `length_is_correct` | length() equals distance(start, end) |
| `reversed_swaps_direction` | reversed line has negated direction |
| `startPoint_endPoint` | Accessors return correct points |

### Circle2D Tests

| Test | Description |
|------|-------------|
| `construction_from_center_radius` | Create circle with center and radius |
| `construction_from_3_points` | Circle through three non-collinear points |
| `evaluate_at_0` | evaluate(0) is at (center.x + radius, center.y) |
| `evaluate_at_pi` | evaluate(π) is at (center.x - radius, center.y) |
| `is_closed` | isClosed returns true |
| `length_is_2pi_r` | length() equals 2πr |
| `tangent_is_perpendicular` | tangent is perpendicular to radius vector |
| `invalid_radius` | radius ≤ 0 fails |
| `collinear_3_points` | Three collinear points fails |

### Arc2D Tests

| Test | Description |
|------|-------------|
| `construction_from_center_radius_angles` | Create arc with angles |
| `construction_from_3_points` | Arc through three points |
| `evaluate_at_start_angle` | evaluate(startAngle) is startPoint |
| `evaluate_at_end_angle` | evaluate(endAngle) is endPoint |
| `is_not_closed` | isClosed returns false |
| `length_is_angle_times_radius` | length = |endAngle - startAngle| * radius |
| `reversed_swaps_angles` | reversed arc has swapped start/end angles |
| `bulge_construction` | Arc from bulge factor |

### Intersection Tests

| Test | Description |
|------|-------------|
| `parallel_lines_no_intersection` | Parallel lines return empty |
| `intersecting_lines_one_point` | Non-parallel lines return one point |
| `coincident_lines` | Coincident lines: special case handling |
| `line_through_circle_two_points` | Secant line hits circle twice |
| `line_tangent_to_circle` | Tangent line hits circle once |
| `line_misses_circle` | Distant line returns empty |
| `circles_intersect_two_points` | Overlapping circles return two points |
| `circles_tangent_internal` | Internally tangent circles return one point |
| `circles_tangent_external` | Externally tangent circles return one point |
| `circles_no_intersection` | Distant circles return empty |
| `concentric_circles` | Concentric circles: special case |

### Wire2D Tests

| Test | Description |
|------|-------------|
| `construction_from_curves` | Create wire from curve array |
| `closed_wire_detection` | Wire that closes is marked closed |
| `open_wire_detection` | Wire that doesn't close is marked open |
| `disconnected_curves_fail` | Curves that don't connect fail validation |
| `single_curve_wire` | Single curve wire is valid |
| `length_is_sum` | Wire length is sum of curve lengths |
| `startPoint_endPoint` | Wire endpoints match first/last curve |

---

## File Organization

```
generation/src/geometry/
├── index.ts
├── curve2d.ts           # Curve2D interface
├── line2d.ts            # Line2D type and functions
├── circle2d.ts          # Circle2D type and functions
├── arc2d.ts             # Arc2D type and functions
├── wire2d.ts            # Wire2D type and functions
└── intersections2d.ts   # Intersection functions

generation/tests/geometry/
├── line2d.test.ts
├── circle2d.test.ts
├── arc2d.test.ts
├── wire2d.test.ts
└── intersections2d.test.ts
```

---

## Exit Criteria

Phase 2 is complete when:
- [ ] Line2D: construction, evaluation, tangent, length, reverse, transform
- [ ] Circle2D: construction (center+radius, 3 points), evaluation, tangent, length
- [ ] Arc2D: construction (center+radius+angles, 3 points, bulge), evaluation, tangent, length
- [ ] Intersections: line-line, line-circle, circle-circle all working
- [ ] Wire2D: construction, validation, closed detection
- [ ] All tests pass
- [ ] Demo examples in viewer app
