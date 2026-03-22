/** Parameter or property descriptor for an API entry. */
export interface ApiParam {
  name: string;
  type: string;
  description: string;
}

/** A single documented API entry (function, interface, constant, or type). */
export interface ApiEntry {
  /** Export name */
  name: string;
  /** Kind of export */
  kind: 'function' | 'interface' | 'constant' | 'type';
  /** Module this belongs to */
  module: typeof API_MODULES[number];
  /** JSDoc description */
  description: string;
  /** Function signature (for functions) */
  signature?: string;
  /** @param entries (for functions) */
  params?: ApiParam[];
  /** @returns text (for functions) */
  returns?: string;
  /** Interface/type properties */
  properties?: ApiParam[];
}

/** All module names. */
export const API_MODULES = ['core', 'geometry', 'io', 'mesh', 'primitives'] as const;

/** All API entries, extracted from generation/ JSDoc. */
export const apiEntries: ApiEntry[] = [
  // ═══════════════════════════════════════════════════════
  // CORE — Tolerance
  // ═══════════════════════════════════════════════════════
  {
    name: 'TOLERANCE',
    kind: 'constant',
    module: 'core',
    description: 'Default absolute tolerance for floating-point comparisons (1e-7).',
  },
  {
    name: 'isZero',
    kind: 'function',
    module: 'core',
    description: 'Check whether a value is effectively zero within a tolerance.',
    signature: 'isZero(value: number, tol?: number): boolean',
    params: [
      { name: 'value', type: 'number', description: 'The value to test' },
      { name: 'tol', type: 'number', description: 'Absolute tolerance threshold (defaults to TOLERANCE)' },
    ],
    returns: 'True if |value| <= tol',
  },
  {
    name: 'isEqual',
    kind: 'function',
    module: 'core',
    description: 'Check whether two numbers are equal within a tolerance.',
    signature: 'isEqual(a: number, b: number, tol?: number): boolean',
    params: [
      { name: 'a', type: 'number', description: 'First value' },
      { name: 'b', type: 'number', description: 'Second value' },
      { name: 'tol', type: 'number', description: 'Absolute tolerance threshold (defaults to TOLERANCE)' },
    ],
    returns: 'True if |a - b| <= tol',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — Point2D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Point2D',
    kind: 'interface',
    module: 'core',
    description: 'An immutable point in 2D Cartesian space.',
    properties: [
      { name: 'x', type: 'number', description: 'X coordinate' },
      { name: 'y', type: 'number', description: 'Y coordinate' },
    ],
  },
  {
    name: 'point2d',
    kind: 'function',
    module: 'core',
    description: 'Create a 2D point from coordinates.',
    signature: 'point2d(x: number, y: number): Point2D',
    params: [
      { name: 'x', type: 'number', description: 'X coordinate' },
      { name: 'y', type: 'number', description: 'Y coordinate' },
    ],
    returns: 'A new Point2D',
  },
  {
    name: 'ORIGIN_2D',
    kind: 'constant',
    module: 'core',
    description: 'The 2D origin point (0, 0).',
  },
  {
    name: 'distance2d',
    kind: 'function',
    module: 'core',
    description: 'Compute the Euclidean distance between two 2D points.',
    signature: 'distance2d(a: Point2D, b: Point2D): number',
    params: [
      { name: 'a', type: 'Point2D', description: 'First point' },
      { name: 'b', type: 'Point2D', description: 'Second point' },
    ],
    returns: 'The straight-line distance between a and b',
  },
  {
    name: 'midpoint2d',
    kind: 'function',
    module: 'core',
    description: 'Compute the midpoint between two 2D points.',
    signature: 'midpoint2d(a: Point2D, b: Point2D): Point2D',
    params: [
      { name: 'a', type: 'Point2D', description: 'First point' },
      { name: 'b', type: 'Point2D', description: 'Second point' },
    ],
    returns: 'The point equidistant from a and b',
  },
  {
    name: 'addVector2d',
    kind: 'function',
    module: 'core',
    description: 'Translate a 2D point by a vector.',
    signature: 'addVector2d(p: Point2D, v: Vector2D): Point2D',
    params: [
      { name: 'p', type: 'Point2D', description: 'The point to translate' },
      { name: 'v', type: 'Vector2D', description: 'The displacement vector' },
    ],
    returns: 'A new point offset from p by v',
  },
  {
    name: 'subtractPoints2d',
    kind: 'function',
    module: 'core',
    description: 'Compute the displacement vector from point b to point a (a - b).',
    signature: 'subtractPoints2d(a: Point2D, b: Point2D): Vector2D',
    params: [
      { name: 'a', type: 'Point2D', description: 'The target point' },
      { name: 'b', type: 'Point2D', description: 'The origin point' },
    ],
    returns: 'The vector from b to a',
  },
  {
    name: 'points2dEqual',
    kind: 'function',
    module: 'core',
    description: 'Test whether two 2D points are equal within the default tolerance.',
    signature: 'points2dEqual(a: Point2D, b: Point2D): boolean',
    params: [
      { name: 'a', type: 'Point2D', description: 'First point' },
      { name: 'b', type: 'Point2D', description: 'Second point' },
    ],
    returns: 'True if both coordinates are equal within TOLERANCE',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — Vector2D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Vector2D',
    kind: 'interface',
    module: 'core',
    description: 'An immutable vector in 2D Cartesian space.',
    properties: [
      { name: 'x', type: 'number', description: 'X component' },
      { name: 'y', type: 'number', description: 'Y component' },
    ],
  },
  {
    name: 'vec2d',
    kind: 'function',
    module: 'core',
    description: 'Create a 2D vector from components.',
    signature: 'vec2d(x: number, y: number): Vector2D',
    params: [
      { name: 'x', type: 'number', description: 'X component' },
      { name: 'y', type: 'number', description: 'Y component' },
    ],
    returns: 'A new Vector2D',
  },
  {
    name: 'X_AXIS_2D',
    kind: 'constant',
    module: 'core',
    description: 'Unit vector along the positive X axis in 2D.',
  },
  {
    name: 'Y_AXIS_2D',
    kind: 'constant',
    module: 'core',
    description: 'Unit vector along the positive Y axis in 2D.',
  },
  {
    name: 'length2d',
    kind: 'function',
    module: 'core',
    description: 'Compute the Euclidean length (magnitude) of a 2D vector.',
    signature: 'length2d(v: Vector2D): number',
    params: [{ name: 'v', type: 'Vector2D', description: 'The vector' }],
    returns: 'The length of v',
  },
  {
    name: 'normalize2d',
    kind: 'function',
    module: 'core',
    description: 'Return a unit vector in the same direction as v. Throws if v is effectively zero-length.',
    signature: 'normalize2d(v: Vector2D): Vector2D',
    params: [{ name: 'v', type: 'Vector2D', description: 'The vector to normalize' }],
    returns: 'A unit vector parallel to v',
  },
  {
    name: 'add2d',
    kind: 'function',
    module: 'core',
    description: 'Add two 2D vectors component-wise.',
    signature: 'add2d(a: Vector2D, b: Vector2D): Vector2D',
    params: [
      { name: 'a', type: 'Vector2D', description: 'First vector' },
      { name: 'b', type: 'Vector2D', description: 'Second vector' },
    ],
    returns: 'The sum a + b',
  },
  {
    name: 'subtract2d',
    kind: 'function',
    module: 'core',
    description: 'Subtract vector b from vector a component-wise.',
    signature: 'subtract2d(a: Vector2D, b: Vector2D): Vector2D',
    params: [
      { name: 'a', type: 'Vector2D', description: 'First vector' },
      { name: 'b', type: 'Vector2D', description: 'Second vector' },
    ],
    returns: 'The difference a - b',
  },
  {
    name: 'scale2d',
    kind: 'function',
    module: 'core',
    description: 'Scale a 2D vector by a scalar factor.',
    signature: 'scale2d(v: Vector2D, s: number): Vector2D',
    params: [
      { name: 'v', type: 'Vector2D', description: 'The vector to scale' },
      { name: 's', type: 'number', description: 'The scalar multiplier' },
    ],
    returns: 'A new vector with each component multiplied by s',
  },
  {
    name: 'dot2d',
    kind: 'function',
    module: 'core',
    description: 'Compute the dot product of two 2D vectors.',
    signature: 'dot2d(a: Vector2D, b: Vector2D): number',
    params: [
      { name: 'a', type: 'Vector2D', description: 'First vector' },
      { name: 'b', type: 'Vector2D', description: 'Second vector' },
    ],
    returns: 'The scalar dot product a . b',
  },
  {
    name: 'perpendicular',
    kind: 'function',
    module: 'core',
    description: 'Rotate a vector 90 degrees counter-clockwise: (x, y) -> (-y, x).',
    signature: 'perpendicular(v: Vector2D): Vector2D',
    params: [{ name: 'v', type: 'Vector2D', description: 'The vector to rotate' }],
    returns: 'A new vector perpendicular to v (CCW rotation)',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — Point3D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Point3D',
    kind: 'interface',
    module: 'core',
    description: 'An immutable point in 3D Cartesian space.',
    properties: [
      { name: 'x', type: 'number', description: 'X coordinate' },
      { name: 'y', type: 'number', description: 'Y coordinate' },
      { name: 'z', type: 'number', description: 'Z coordinate' },
    ],
  },
  {
    name: 'point3d',
    kind: 'function',
    module: 'core',
    description: 'Create a 3D point from coordinates.',
    signature: 'point3d(x: number, y: number, z: number): Point3D',
    params: [
      { name: 'x', type: 'number', description: 'X coordinate' },
      { name: 'y', type: 'number', description: 'Y coordinate' },
      { name: 'z', type: 'number', description: 'Z coordinate' },
    ],
    returns: 'A new Point3D',
  },
  {
    name: 'ORIGIN',
    kind: 'constant',
    module: 'core',
    description: 'The origin point (0, 0, 0).',
  },
  {
    name: 'distance',
    kind: 'function',
    module: 'core',
    description: 'Compute the Euclidean distance between two 3D points.',
    signature: 'distance(a: Point3D, b: Point3D): number',
    params: [
      { name: 'a', type: 'Point3D', description: 'First point' },
      { name: 'b', type: 'Point3D', description: 'Second point' },
    ],
    returns: 'The straight-line distance between a and b',
  },
  {
    name: 'midpoint',
    kind: 'function',
    module: 'core',
    description: 'Compute the midpoint between two 3D points.',
    signature: 'midpoint(a: Point3D, b: Point3D): Point3D',
    params: [
      { name: 'a', type: 'Point3D', description: 'First point' },
      { name: 'b', type: 'Point3D', description: 'Second point' },
    ],
    returns: 'The point equidistant from a and b',
  },
  {
    name: 'addVector',
    kind: 'function',
    module: 'core',
    description: 'Translate a point by a vector.',
    signature: 'addVector(p: Point3D, v: Vector3D): Point3D',
    params: [
      { name: 'p', type: 'Point3D', description: 'The point to translate' },
      { name: 'v', type: 'Vector3D', description: 'The displacement vector' },
    ],
    returns: 'A new point offset from p by v',
  },
  {
    name: 'subtractPoints',
    kind: 'function',
    module: 'core',
    description: 'Compute the displacement vector from point b to point a (a - b).',
    signature: 'subtractPoints(a: Point3D, b: Point3D): Vector3D',
    params: [
      { name: 'a', type: 'Point3D', description: 'The target point' },
      { name: 'b', type: 'Point3D', description: 'The origin point' },
    ],
    returns: 'The vector from b to a',
  },
  {
    name: 'pointsEqual',
    kind: 'function',
    module: 'core',
    description: 'Test whether two 3D points are equal within the default tolerance.',
    signature: 'pointsEqual(a: Point3D, b: Point3D): boolean',
    params: [
      { name: 'a', type: 'Point3D', description: 'First point' },
      { name: 'b', type: 'Point3D', description: 'Second point' },
    ],
    returns: 'True if all coordinates are equal within TOLERANCE',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — Vector3D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Vector3D',
    kind: 'interface',
    module: 'core',
    description: 'An immutable vector in 3D Cartesian space.',
    properties: [
      { name: 'x', type: 'number', description: 'X component' },
      { name: 'y', type: 'number', description: 'Y component' },
      { name: 'z', type: 'number', description: 'Z component' },
    ],
  },
  {
    name: 'vec3d',
    kind: 'function',
    module: 'core',
    description: 'Create a 3D vector from components.',
    signature: 'vec3d(x: number, y: number, z: number): Vector3D',
    params: [
      { name: 'x', type: 'number', description: 'X component' },
      { name: 'y', type: 'number', description: 'Y component' },
      { name: 'z', type: 'number', description: 'Z component' },
    ],
    returns: 'A new Vector3D',
  },
  {
    name: 'X_AXIS',
    kind: 'constant',
    module: 'core',
    description: 'Unit vector along the positive X axis.',
  },
  {
    name: 'Y_AXIS',
    kind: 'constant',
    module: 'core',
    description: 'Unit vector along the positive Y axis.',
  },
  {
    name: 'Z_AXIS',
    kind: 'constant',
    module: 'core',
    description: 'Unit vector along the positive Z axis.',
  },
  {
    name: 'length',
    kind: 'function',
    module: 'core',
    description: 'Compute the Euclidean length (magnitude) of a vector.',
    signature: 'length(v: Vector3D): number',
    params: [{ name: 'v', type: 'Vector3D', description: 'The vector' }],
    returns: 'The length of v',
  },
  {
    name: 'normalize',
    kind: 'function',
    module: 'core',
    description: 'Return a unit vector in the same direction as v. If v is effectively zero-length, returns the zero vector.',
    signature: 'normalize(v: Vector3D): Vector3D',
    params: [{ name: 'v', type: 'Vector3D', description: 'The vector to normalize' }],
    returns: 'A unit vector parallel to v, or (0,0,0) if v is near-zero',
  },
  {
    name: 'add',
    kind: 'function',
    module: 'core',
    description: 'Add two vectors component-wise.',
    signature: 'add(a: Vector3D, b: Vector3D): Vector3D',
    params: [
      { name: 'a', type: 'Vector3D', description: 'First vector' },
      { name: 'b', type: 'Vector3D', description: 'Second vector' },
    ],
    returns: 'The sum a + b',
  },
  {
    name: 'subtract',
    kind: 'function',
    module: 'core',
    description: 'Subtract vector b from vector a component-wise.',
    signature: 'subtract(a: Vector3D, b: Vector3D): Vector3D',
    params: [
      { name: 'a', type: 'Vector3D', description: 'First vector' },
      { name: 'b', type: 'Vector3D', description: 'Second vector' },
    ],
    returns: 'The difference a - b',
  },
  {
    name: 'scale',
    kind: 'function',
    module: 'core',
    description: 'Scale a vector by a scalar factor.',
    signature: 'scale(v: Vector3D, s: number): Vector3D',
    params: [
      { name: 'v', type: 'Vector3D', description: 'The vector to scale' },
      { name: 's', type: 'number', description: 'The scalar multiplier' },
    ],
    returns: 'A new vector with each component multiplied by s',
  },
  {
    name: 'dot',
    kind: 'function',
    module: 'core',
    description: 'Compute the dot product of two vectors.',
    signature: 'dot(a: Vector3D, b: Vector3D): number',
    params: [
      { name: 'a', type: 'Vector3D', description: 'First vector' },
      { name: 'b', type: 'Vector3D', description: 'Second vector' },
    ],
    returns: 'The scalar dot product a . b',
  },
  {
    name: 'cross',
    kind: 'function',
    module: 'core',
    description: 'Compute the cross product of two vectors (right-hand rule).',
    signature: 'cross(a: Vector3D, b: Vector3D): Vector3D',
    params: [
      { name: 'a', type: 'Vector3D', description: 'First vector' },
      { name: 'b', type: 'Vector3D', description: 'Second vector' },
    ],
    returns: 'The vector a x b, perpendicular to both a and b',
  },
  {
    name: 'negate',
    kind: 'function',
    module: 'core',
    description: 'Negate a vector, reversing its direction.',
    signature: 'negate(v: Vector3D): Vector3D',
    params: [{ name: 'v', type: 'Vector3D', description: 'The vector to negate' }],
    returns: 'A new vector pointing in the opposite direction',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — Transform3D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Transform3D',
    kind: 'interface',
    module: 'core',
    description: '4x4 transformation matrix stored in column-major order.',
    properties: [
      { name: 'elements', type: 'Float64Array', description: '16 elements in column-major order' },
    ],
  },
  {
    name: 'identity',
    kind: 'function',
    module: 'core',
    description: 'Create the 4x4 identity transform (no rotation, translation, or scale).',
    signature: 'identity(): Transform3D',
    returns: 'The identity Transform3D',
  },
  {
    name: 'translation',
    kind: 'function',
    module: 'core',
    description: 'Create a translation transform.',
    signature: 'translation(dx: number, dy: number, dz: number): Transform3D',
    params: [
      { name: 'dx', type: 'number', description: 'Translation along the X axis' },
      { name: 'dy', type: 'number', description: 'Translation along the Y axis' },
      { name: 'dz', type: 'number', description: 'Translation along the Z axis' },
    ],
    returns: 'A Transform3D that translates by (dx, dy, dz)',
  },
  {
    name: 'rotationX',
    kind: 'function',
    module: 'core',
    description: 'Create a rotation transform about the X axis.',
    signature: 'rotationX(angle: number): Transform3D',
    params: [{ name: 'angle', type: 'number', description: 'Rotation angle in radians (right-hand rule)' }],
    returns: 'A Transform3D that rotates around the X axis',
  },
  {
    name: 'rotationY',
    kind: 'function',
    module: 'core',
    description: 'Create a rotation transform about the Y axis.',
    signature: 'rotationY(angle: number): Transform3D',
    params: [{ name: 'angle', type: 'number', description: 'Rotation angle in radians (right-hand rule)' }],
    returns: 'A Transform3D that rotates around the Y axis',
  },
  {
    name: 'rotationZ',
    kind: 'function',
    module: 'core',
    description: 'Create a rotation transform about the Z axis.',
    signature: 'rotationZ(angle: number): Transform3D',
    params: [{ name: 'angle', type: 'number', description: 'Rotation angle in radians (right-hand rule)' }],
    returns: 'A Transform3D that rotates around the Z axis',
  },
  {
    name: 'scaling',
    kind: 'function',
    module: 'core',
    description: 'Create a non-uniform scaling transform.',
    signature: 'scaling(sx: number, sy: number, sz: number): Transform3D',
    params: [
      { name: 'sx', type: 'number', description: 'Scale factor along the X axis' },
      { name: 'sy', type: 'number', description: 'Scale factor along the Y axis' },
      { name: 'sz', type: 'number', description: 'Scale factor along the Z axis' },
    ],
    returns: 'A Transform3D that scales by (sx, sy, sz)',
  },
  {
    name: 'compose',
    kind: 'function',
    module: 'core',
    description: 'Compose two transforms: result = a * b (apply b first, then a).',
    signature: 'compose(a: Transform3D, b: Transform3D): Transform3D',
    params: [
      { name: 'a', type: 'Transform3D', description: 'The outer (second-applied) transform' },
      { name: 'b', type: 'Transform3D', description: 'The inner (first-applied) transform' },
    ],
    returns: 'A new Transform3D equivalent to applying b then a',
  },
  {
    name: 'inverse',
    kind: 'function',
    module: 'core',
    description: 'Compute the inverse of a 4x4 transform using cofactor expansion.',
    signature: 'inverse(t: Transform3D): Transform3D',
    params: [{ name: 't', type: 'Transform3D', description: 'The transform to invert' }],
    returns: 'The inverse Transform3D',
  },
  {
    name: 'transformPoint',
    kind: 'function',
    module: 'core',
    description: 'Transform a point by applying the full 4x4 matrix, including translation.',
    signature: 'transformPoint(t: Transform3D, p: Point3D): Point3D',
    params: [
      { name: 't', type: 'Transform3D', description: 'The transform to apply' },
      { name: 'p', type: 'Point3D', description: 'The point to transform' },
    ],
    returns: 'The transformed point',
  },
  {
    name: 'transformVector',
    kind: 'function',
    module: 'core',
    description: 'Transform a vector by applying only the rotational/scale part of the matrix (translation is ignored).',
    signature: 'transformVector(t: Transform3D, v: Vector3D): Vector3D',
    params: [
      { name: 't', type: 'Transform3D', description: 'The transform to apply' },
      { name: 'v', type: 'Vector3D', description: 'The vector to transform' },
    ],
    returns: 'The transformed vector',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — Axis
  // ═══════════════════════════════════════════════════════
  {
    name: 'Axis',
    kind: 'interface',
    module: 'core',
    description: 'An infinite directed line in 3D space, defined by an origin point and a unit direction vector.',
    properties: [
      { name: 'origin', type: 'Point3D', description: 'A point on the axis' },
      { name: 'direction', type: 'Vector3D', description: 'Unit direction vector' },
    ],
  },
  {
    name: 'axis',
    kind: 'function',
    module: 'core',
    description: 'Creates an axis from an origin point and a direction vector. The direction is normalized automatically.',
    signature: 'axis(origin: Point3D, direction: Vector3D): Axis',
    params: [
      { name: 'origin', type: 'Point3D', description: 'A point on the axis' },
      { name: 'direction', type: 'Vector3D', description: 'The axis direction (will be normalized)' },
    ],
    returns: 'A new Axis with a unit direction vector',
  },
  {
    name: 'X_AXIS_3D',
    kind: 'constant',
    module: 'core',
    description: 'The global X axis through the origin.',
  },
  {
    name: 'Y_AXIS_3D',
    kind: 'constant',
    module: 'core',
    description: 'The global Y axis through the origin.',
  },
  {
    name: 'Z_AXIS_3D',
    kind: 'constant',
    module: 'core',
    description: 'The global Z axis through the origin.',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — Plane
  // ═══════════════════════════════════════════════════════
  {
    name: 'Plane',
    kind: 'interface',
    module: 'core',
    description: 'An infinite plane in 3D space defined by an origin, unit normal, and unit x-axis direction.',
    properties: [
      { name: 'origin', type: 'Point3D', description: 'A point on the plane' },
      { name: 'normal', type: 'Vector3D', description: 'Unit surface normal' },
      { name: 'xAxis', type: 'Vector3D', description: 'Unit in-plane x-axis direction' },
    ],
  },
  {
    name: 'plane',
    kind: 'function',
    module: 'core',
    description: 'Creates a plane from an origin, normal, and x-axis direction. Both are normalized automatically.',
    signature: 'plane(origin: Point3D, normal: Vector3D, xAxis: Vector3D): Plane',
    params: [
      { name: 'origin', type: 'Point3D', description: 'A point on the plane' },
      { name: 'normal', type: 'Vector3D', description: 'The surface normal direction' },
      { name: 'xAxis', type: 'Vector3D', description: 'The in-plane x-axis direction' },
    ],
    returns: 'A new Plane with unit normal and xAxis',
  },
  {
    name: 'distanceToPoint',
    kind: 'function',
    module: 'core',
    description: 'Returns the signed distance from the plane to the point. Positive means the point is on the normal side.',
    signature: 'distanceToPoint(pl: Plane, pt: Point3D): number',
    params: [
      { name: 'pl', type: 'Plane', description: 'The reference plane' },
      { name: 'pt', type: 'Point3D', description: 'The point to measure' },
    ],
    returns: 'Signed distance (positive on the normal side)',
  },
  {
    name: 'projectPoint',
    kind: 'function',
    module: 'core',
    description: 'Projects a point onto the plane along the plane normal.',
    signature: 'projectPoint(pl: Plane, pt: Point3D): Point3D',
    params: [
      { name: 'pl', type: 'Plane', description: 'The plane to project onto' },
      { name: 'pt', type: 'Point3D', description: 'The point to project' },
    ],
    returns: 'The closest point on the plane',
  },
  {
    name: 'containsPoint',
    kind: 'function',
    module: 'core',
    description: 'Returns true if the point lies on the plane (within tolerance).',
    signature: 'containsPoint(pl: Plane, pt: Point3D): boolean',
    params: [
      { name: 'pl', type: 'Plane', description: 'The plane to test against' },
      { name: 'pt', type: 'Point3D', description: 'The point to test' },
    ],
    returns: 'True if the point-to-plane distance is within tolerance',
  },
  {
    name: 'XY_PLANE',
    kind: 'constant',
    module: 'core',
    description: 'The XY plane through the origin (normal along +Z).',
  },
  {
    name: 'XZ_PLANE',
    kind: 'constant',
    module: 'core',
    description: 'The XZ plane through the origin (normal along +Y).',
  },
  {
    name: 'YZ_PLANE',
    kind: 'constant',
    module: 'core',
    description: 'The YZ plane through the origin (normal along +X).',
  },

  // ═══════════════════════════════════════════════════════
  // CORE — BoundingBox3D
  // ═══════════════════════════════════════════════════════
  {
    name: 'BoundingBox3D',
    kind: 'interface',
    module: 'core',
    description: 'An axis-aligned bounding box in 3D space.',
    properties: [
      { name: 'min', type: 'Point3D', description: 'Corner with smallest x, y, z values' },
      { name: 'max', type: 'Point3D', description: 'Corner with largest x, y, z values' },
    ],
  },
  {
    name: 'boundingBox',
    kind: 'function',
    module: 'core',
    description: 'Creates a bounding box from explicit min and max corner points.',
    signature: 'boundingBox(min: Point3D, max: Point3D): BoundingBox3D',
    params: [
      { name: 'min', type: 'Point3D', description: 'The corner with smallest values' },
      { name: 'max', type: 'Point3D', description: 'The corner with largest values' },
    ],
    returns: 'A new BoundingBox3D',
  },
  {
    name: 'emptyBoundingBox',
    kind: 'function',
    module: 'core',
    description: 'Creates an empty bounding box with inverted extents so that adding any point produces a valid box.',
    signature: 'emptyBoundingBox(): BoundingBox3D',
    returns: 'An empty BoundingBox3D ready for point accumulation',
  },
  {
    name: 'addPoint',
    kind: 'function',
    module: 'core',
    description: 'Expands a bounding box to include the given point.',
    signature: 'addPoint(box: BoundingBox3D, pt: Point3D): BoundingBox3D',
    params: [
      { name: 'box', type: 'BoundingBox3D', description: 'The existing bounding box' },
      { name: 'pt', type: 'Point3D', description: 'The point to include' },
    ],
    returns: 'A new BoundingBox3D enclosing the original box and the point',
  },
  {
    name: 'contains',
    kind: 'function',
    module: 'core',
    description: 'Tests whether a point lies inside or on the boundary of the bounding box.',
    signature: 'contains(box: BoundingBox3D, pt: Point3D): boolean',
    params: [
      { name: 'box', type: 'BoundingBox3D', description: 'The bounding box to test against' },
      { name: 'pt', type: 'Point3D', description: 'The point to test' },
    ],
    returns: 'True if the point is inside or on the boundary',
  },
  {
    name: 'center',
    kind: 'function',
    module: 'core',
    description: 'Computes the center point of a bounding box.',
    signature: 'center(box: BoundingBox3D): Point3D',
    params: [{ name: 'box', type: 'BoundingBox3D', description: 'The bounding box' }],
    returns: 'The midpoint between min and max',
  },
  {
    name: 'size',
    kind: 'function',
    module: 'core',
    description: 'Computes the dimensions of a bounding box as a vector (width, height, depth).',
    signature: 'size(box: BoundingBox3D): Vector3D',
    params: [{ name: 'box', type: 'BoundingBox3D', description: 'The bounding box' }],
    returns: 'A vector whose x, y, z components are the box extents',
  },
  {
    name: 'intersects',
    kind: 'function',
    module: 'core',
    description: 'Tests whether two bounding boxes overlap (share any volume or touch).',
    signature: 'intersects(a: BoundingBox3D, b: BoundingBox3D): boolean',
    params: [
      { name: 'a', type: 'BoundingBox3D', description: 'First bounding box' },
      { name: 'b', type: 'BoundingBox3D', description: 'Second bounding box' },
    ],
    returns: 'True if the boxes overlap or touch on any axis',
  },
  {
    name: 'isEmpty',
    kind: 'function',
    module: 'core',
    description: 'Tests whether a bounding box is empty (has no volume).',
    signature: 'isEmpty(box: BoundingBox3D): boolean',
    params: [{ name: 'box', type: 'BoundingBox3D', description: 'The bounding box to test' }],
    returns: 'True if the box has no volume',
  },

  // ═══════════════════════════════════════════════════════
  // GEOMETRY — Line2D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Line2D',
    kind: 'interface',
    module: 'geometry',
    description: 'A 2D line segment. P(t) = origin + t * direction, t in [0, length].',
    properties: [
      { name: 'origin', type: 'Point2D', description: 'Origin point (start of segment)' },
      { name: 'direction', type: 'Vector2D', description: 'Unit direction vector' },
      { name: 'segmentLength', type: 'number', description: 'Length of the segment' },
      { name: 'startPoint', type: 'Point2D', description: 'Point at start' },
      { name: 'endPoint', type: 'Point2D', description: 'Point at end' },
      { name: 'isClosed', type: 'boolean', description: 'Always false for lines' },
    ],
  },
  {
    name: 'makeLine2D',
    kind: 'function',
    module: 'geometry',
    description: 'Create a line segment from two points.',
    signature: 'makeLine2D(start: Point2D, end: Point2D): OperationResult<Line2D>',
    params: [
      { name: 'start', type: 'Point2D', description: 'Start point of the segment' },
      { name: 'end', type: 'Point2D', description: 'End point of the segment' },
    ],
    returns: 'Line2D or failure if points are coincident',
  },
  {
    name: 'makeLine2DFromPointDir',
    kind: 'function',
    module: 'geometry',
    description: 'Create a line from a point and direction vector. Creates a unit-length segment.',
    signature: 'makeLine2DFromPointDir(origin: Point2D, direction: Vector2D): OperationResult<Line2D>',
    params: [
      { name: 'origin', type: 'Point2D', description: 'Origin point' },
      { name: 'direction', type: 'Vector2D', description: 'Direction vector (will be normalized)' },
    ],
    returns: 'Line2D or failure if direction is zero vector',
  },
  {
    name: 'evaluateLine2D',
    kind: 'function',
    module: 'geometry',
    description: 'Evaluate the line at parameter t. P(t) = origin + t * direction.',
    signature: 'evaluateLine2D(line: Line2D, t: number): Point2D',
    params: [
      { name: 'line', type: 'Line2D', description: 'The line to evaluate' },
      { name: 't', type: 'number', description: 'Parameter value (0 = start, length = end)' },
    ],
    returns: 'Point on the line at parameter t',
  },
  {
    name: 'tangentLine2D',
    kind: 'function',
    module: 'geometry',
    description: 'Get the tangent vector at parameter t. For a line, the tangent is constant.',
    signature: 'tangentLine2D(line: Line2D, t: number): Vector2D',
    params: [
      { name: 'line', type: 'Line2D', description: 'The line' },
      { name: 't', type: 'number', description: 'Parameter value (unused for lines)' },
    ],
    returns: 'Unit tangent vector (same as direction)',
  },
  {
    name: 'lengthLine2D',
    kind: 'function',
    module: 'geometry',
    description: 'Get the length of the line segment.',
    signature: 'lengthLine2D(line: Line2D): number',
    params: [{ name: 'line', type: 'Line2D', description: 'The line' }],
    returns: 'Length of the segment',
  },
  {
    name: 'reverseLine2D',
    kind: 'function',
    module: 'geometry',
    description: 'Create a reversed copy of the line with opposite direction and swapped start/end.',
    signature: 'reverseLine2D(line: Line2D): Line2D',
    params: [{ name: 'line', type: 'Line2D', description: 'The line to reverse' }],
    returns: 'A new Line2D with reversed direction',
  },

  // ═══════════════════════════════════════════════════════
  // GEOMETRY — Circle2D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Circle2D',
    kind: 'interface',
    module: 'geometry',
    description: 'A full circle in 2D. P(t) = center + radius * (cos(t), sin(t)), t in [0, 2pi].',
    properties: [
      { name: 'center', type: 'Point2D', description: 'Center point' },
      { name: 'radius', type: 'number', description: 'Radius (always positive)' },
      { name: 'isClosed', type: 'boolean', description: 'Always true for circles' },
    ],
  },
  {
    name: 'makeCircle2D',
    kind: 'function',
    module: 'geometry',
    description: 'Create a circle from center point and radius.',
    signature: 'makeCircle2D(center: Point2D, radius: number): OperationResult<Circle2D>',
    params: [
      { name: 'center', type: 'Point2D', description: 'Center point of the circle' },
      { name: 'radius', type: 'number', description: 'Radius (must be positive)' },
    ],
    returns: 'Circle2D or failure if radius is not positive',
  },
  {
    name: 'makeCircle2DThrough3Points',
    kind: 'function',
    module: 'geometry',
    description: 'Create a circle through three non-collinear points.',
    signature: 'makeCircle2DThrough3Points(p1: Point2D, p2: Point2D, p3: Point2D): OperationResult<Circle2D>',
    params: [
      { name: 'p1', type: 'Point2D', description: 'First point on the circle' },
      { name: 'p2', type: 'Point2D', description: 'Second point on the circle' },
      { name: 'p3', type: 'Point2D', description: 'Third point on the circle' },
    ],
    returns: 'Circle2D or failure if points are collinear or coincident',
  },
  {
    name: 'evaluateCircle2D',
    kind: 'function',
    module: 'geometry',
    description: 'Evaluate the circle at parameter t. P(t) = center + radius * (cos(t), sin(t)).',
    signature: 'evaluateCircle2D(circle: Circle2D, t: number): Point2D',
    params: [
      { name: 'circle', type: 'Circle2D', description: 'The circle to evaluate' },
      { name: 't', type: 'number', description: 'Parameter value in radians' },
    ],
    returns: 'Point on the circle at parameter t',
  },
  {
    name: 'tangentCircle2D',
    kind: 'function',
    module: 'geometry',
    description: 'Get the unit tangent vector at parameter t on a circle.',
    signature: 'tangentCircle2D(circle: Circle2D, t: number): Vector2D',
    params: [
      { name: 'circle', type: 'Circle2D', description: 'The circle' },
      { name: 't', type: 'number', description: 'Parameter value in radians' },
    ],
    returns: 'Unit tangent vector',
  },
  {
    name: 'lengthCircle2D',
    kind: 'function',
    module: 'geometry',
    description: 'Get the circumference of the circle (2*pi*r).',
    signature: 'lengthCircle2D(circle: Circle2D): number',
    params: [{ name: 'circle', type: 'Circle2D', description: 'The circle' }],
    returns: 'Circumference',
  },

  // ═══════════════════════════════════════════════════════
  // GEOMETRY — Arc2D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Arc2D',
    kind: 'interface',
    module: 'geometry',
    description: 'A circular arc in 2D. P(t) = center + radius * (cos(t), sin(t)), t in [startAngle, endAngle].',
    properties: [
      { name: 'center', type: 'Point2D', description: 'Center of the underlying circle' },
      { name: 'radius', type: 'number', description: 'Radius (always positive)' },
      { name: 'startAngle', type: 'number', description: 'Start angle in radians' },
      { name: 'endAngle', type: 'number', description: 'End angle in radians' },
      { name: 'startPoint', type: 'Point2D', description: 'Point at start angle' },
      { name: 'endPoint', type: 'Point2D', description: 'Point at end angle' },
      { name: 'isClosed', type: 'boolean', description: 'Always false for arcs' },
    ],
  },
  {
    name: 'makeArc2D',
    kind: 'function',
    module: 'geometry',
    description: 'Create an arc from center, radius, and angles.',
    signature: 'makeArc2D(center: Point2D, radius: number, startAngle: number, endAngle: number): OperationResult<Arc2D>',
    params: [
      { name: 'center', type: 'Point2D', description: 'Center point' },
      { name: 'radius', type: 'number', description: 'Radius (must be positive)' },
      { name: 'startAngle', type: 'number', description: 'Start angle in radians' },
      { name: 'endAngle', type: 'number', description: 'End angle in radians' },
    ],
    returns: 'Arc2D or failure',
  },
  {
    name: 'makeArc2DThrough3Points',
    kind: 'function',
    module: 'geometry',
    description: 'Create an arc through three points. The arc starts at p1, passes through p2, and ends at p3.',
    signature: 'makeArc2DThrough3Points(p1: Point2D, p2: Point2D, p3: Point2D): OperationResult<Arc2D>',
    params: [
      { name: 'p1', type: 'Point2D', description: 'Start point' },
      { name: 'p2', type: 'Point2D', description: 'Point on the arc (determines direction)' },
      { name: 'p3', type: 'Point2D', description: 'End point' },
    ],
    returns: 'Arc2D or failure if points are collinear or coincident',
  },
  {
    name: 'makeArc2DFromBulge',
    kind: 'function',
    module: 'geometry',
    description: 'Create an arc from start point, end point, and bulge factor. Bulge = tan(theta/4).',
    signature: 'makeArc2DFromBulge(start: Point2D, end: Point2D, bulge: number): OperationResult<Arc2D>',
    params: [
      { name: 'start', type: 'Point2D', description: 'Start point' },
      { name: 'end', type: 'Point2D', description: 'End point' },
      { name: 'bulge', type: 'number', description: 'Bulge factor (positive = CCW, negative = CW)' },
    ],
    returns: 'Arc2D or failure',
  },
  {
    name: 'evaluateArc2D',
    kind: 'function',
    module: 'geometry',
    description: 'Evaluate the arc at parameter t (angle in radians).',
    signature: 'evaluateArc2D(arc: Arc2D, t: number): Point2D',
    params: [
      { name: 'arc', type: 'Arc2D', description: 'The arc to evaluate' },
      { name: 't', type: 'number', description: 'Parameter value (angle in radians)' },
    ],
    returns: 'Point on the arc at parameter t',
  },
  {
    name: 'tangentArc2D',
    kind: 'function',
    module: 'geometry',
    description: 'Get the unit tangent vector at parameter t on an arc.',
    signature: 'tangentArc2D(arc: Arc2D, t: number): Vector2D',
    params: [
      { name: 'arc', type: 'Arc2D', description: 'The arc' },
      { name: 't', type: 'number', description: 'Parameter value (angle in radians)' },
    ],
    returns: 'Unit tangent vector',
  },
  {
    name: 'lengthArc2D',
    kind: 'function',
    module: 'geometry',
    description: 'Get the arc length: |endAngle - startAngle| * radius.',
    signature: 'lengthArc2D(arc: Arc2D): number',
    params: [{ name: 'arc', type: 'Arc2D', description: 'The arc' }],
    returns: 'Arc length',
  },
  {
    name: 'reverseArc2D',
    kind: 'function',
    module: 'geometry',
    description: 'Create a reversed copy of the arc with swapped start/end.',
    signature: 'reverseArc2D(arc: Arc2D): Arc2D',
    params: [{ name: 'arc', type: 'Arc2D', description: 'The arc to reverse' }],
    returns: 'A new Arc2D with swapped start/end',
  },

  // ═══════════════════════════════════════════════════════
  // GEOMETRY — Intersections2D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Intersection2D',
    kind: 'interface',
    module: 'geometry',
    description: 'Result of a curve-curve intersection.',
    properties: [
      { name: 'point', type: 'Point2D', description: 'The intersection point' },
      { name: 'paramOnCurve1', type: 'number', description: 'Parameter value on the first curve' },
      { name: 'paramOnCurve2', type: 'number', description: 'Parameter value on the second curve' },
    ],
  },
  {
    name: 'intersectLine2DLine2D',
    kind: 'function',
    module: 'geometry',
    description: 'Find intersections between two lines (treated as infinite).',
    signature: 'intersectLine2DLine2D(line1: Line2D, line2: Line2D): Intersection2D[]',
    params: [
      { name: 'line1', type: 'Line2D', description: 'First line' },
      { name: 'line2', type: 'Line2D', description: 'Second line' },
    ],
    returns: 'Array of intersections (0 or 1 for non-coincident lines)',
  },
  {
    name: 'intersectLine2DCircle2D',
    kind: 'function',
    module: 'geometry',
    description: 'Find intersections between a line and a circle.',
    signature: 'intersectLine2DCircle2D(line: Line2D, circle: Circle2D): Intersection2D[]',
    params: [
      { name: 'line', type: 'Line2D', description: 'The line (treated as infinite)' },
      { name: 'circle', type: 'Circle2D', description: 'The circle' },
    ],
    returns: 'Array of intersections (0, 1, or 2)',
  },
  {
    name: 'intersectCircle2DCircle2D',
    kind: 'function',
    module: 'geometry',
    description: 'Find intersections between two circles.',
    signature: 'intersectCircle2DCircle2D(circle1: Circle2D, circle2: Circle2D): Intersection2D[]',
    params: [
      { name: 'circle1', type: 'Circle2D', description: 'First circle' },
      { name: 'circle2', type: 'Circle2D', description: 'Second circle' },
    ],
    returns: 'Array of intersections (0, 1, or 2)',
  },

  // ═══════════════════════════════════════════════════════
  // GEOMETRY — Wire2D
  // ═══════════════════════════════════════════════════════
  {
    name: 'Curve2D',
    kind: 'type',
    module: 'geometry',
    description: 'Union type for all 2D curve types: Line2D | Circle2D | Arc2D.',
    properties: [
      { name: 'type', type: "'line' | 'circle' | 'arc'", description: 'Discriminant tag' },
    ],
  },
  {
    name: 'Wire2D',
    kind: 'interface',
    module: 'geometry',
    description: 'A connected sequence of 2D curves forming a path. Curves must connect end-to-end.',
    properties: [
      { name: 'curves', type: 'readonly Curve2D[]', description: 'Ordered sequence of curves' },
      { name: 'isClosed', type: 'boolean', description: 'True if wire forms a closed loop' },
      { name: 'startPoint', type: 'Point2D', description: 'Start of the wire' },
      { name: 'endPoint', type: 'Point2D', description: 'End of the wire' },
    ],
  },
  {
    name: 'makeWire2D',
    kind: 'function',
    module: 'geometry',
    description: 'Create a wire from connected curves. Curves must connect end-to-end within tolerance.',
    signature: 'makeWire2D(curves: Curve2D[]): OperationResult<Wire2D>',
    params: [
      { name: 'curves', type: 'Curve2D[]', description: 'Array of curves that must connect end-to-end' },
    ],
    returns: "Wire2D or failure if curves don't connect or array is empty",
  },
  {
    name: 'lengthWire2D',
    kind: 'function',
    module: 'geometry',
    description: 'Get the total length of the wire (sum of all curve lengths).',
    signature: 'lengthWire2D(wire: Wire2D): number',
    params: [{ name: 'wire', type: 'Wire2D', description: 'The wire' }],
    returns: 'Sum of all curve lengths',
  },

  // ═══════════════════════════════════════════════════════
  // I/O — STL
  // ═══════════════════════════════════════════════════════
  {
    name: 'meshToStlAscii',
    kind: 'function',
    module: 'io',
    description: 'Export a Mesh to ASCII STL format. Each triangle is written as an independent facet with a computed face normal.',
    signature: 'meshToStlAscii(mesh: Mesh, name?: string): string',
    params: [
      { name: 'mesh', type: 'Mesh', description: 'The mesh to export' },
      { name: 'name', type: 'string', description: 'Solid name (default: "labrep")' },
    ],
    returns: 'STL file content as a string',
  },
  {
    name: 'meshToStlBinary',
    kind: 'function',
    module: 'io',
    description: 'Export a Mesh to binary STL format. 80-byte header + uint32 triangle count + packed triangles.',
    signature: 'meshToStlBinary(mesh: Mesh): ArrayBuffer',
    params: [
      { name: 'mesh', type: 'Mesh', description: 'The mesh to export' },
    ],
    returns: 'STL file content as an ArrayBuffer',
  },
  {
    name: 'stlAsciiToMesh',
    kind: 'function',
    module: 'io',
    description: 'Parse ASCII STL text into a Mesh. Vertices are de-duplicated by position and normals averaged.',
    signature: 'stlAsciiToMesh(text: string): OperationResult<Mesh>',
    params: [
      { name: 'text', type: 'string', description: 'ASCII STL file content' },
    ],
    returns: 'Mesh or failure',
  },
  {
    name: 'stlBinaryToMesh',
    kind: 'function',
    module: 'io',
    description: 'Parse binary STL data into a Mesh. Vertices are de-duplicated by position and normals averaged.',
    signature: 'stlBinaryToMesh(data: ArrayBuffer): OperationResult<Mesh>',
    params: [
      { name: 'data', type: 'ArrayBuffer', description: 'Binary STL file content' },
    ],
    returns: 'Mesh or failure',
  },
  {
    name: 'stlToMesh',
    kind: 'function',
    module: 'io',
    description: 'Import an STL file (ASCII or binary) into a Mesh. Auto-detects format from input type and content.',
    signature: 'stlToMesh(data: string | ArrayBuffer): OperationResult<Mesh>',
    params: [
      { name: 'data', type: 'string | ArrayBuffer', description: 'STL file content (string for ASCII, ArrayBuffer for either)' },
    ],
    returns: 'Mesh or failure',
  },

  // ═══════════════════════════════════════════════════════
  // I/O — STEP
  // ═══════════════════════════════════════════════════════
  {
    name: 'parseStep',
    kind: 'function',
    module: 'io',
    description: 'Parse a STEP file string into a StepModel. Handles any valid ISO-10303-21 file.',
    signature: 'parseStep(text: string): OperationResult<StepModel>',
    params: [{ name: 'text', type: 'string', description: 'STEP file content' }],
    returns: 'Parsed StepModel or failure',
  },
  {
    name: 'writeStep',
    kind: 'function',
    module: 'io',
    description: 'Write a StepModel to STEP file text (ISO 10303-21 format).',
    signature: 'writeStep(model: StepModel): string',
    params: [{ name: 'model', type: 'StepModel', description: 'The model to serialize' }],
    returns: 'STEP file content as a string',
  },
  {
    name: 'createStepModelBuilder',
    kind: 'function',
    module: 'io',
    description: 'Create a builder for constructing a StepModel for export. Manages entity ID allocation.',
    signature: 'createStepModelBuilder(): StepModelBuilder',
    returns: 'A StepModelBuilder',
  },
  {
    name: 'stepToPoint3D',
    kind: 'function',
    module: 'io',
    description: 'Extract a Point3D from a CARTESIAN_POINT STEP entity.',
    signature: 'stepToPoint3D(entity: StepEntity): OperationResult<Point3D>',
    params: [{ name: 'entity', type: 'StepEntity', description: 'A CARTESIAN_POINT entity' }],
    returns: 'Point3D or failure',
  },
  {
    name: 'point3DToStep',
    kind: 'function',
    module: 'io',
    description: 'Create a CARTESIAN_POINT STEP entity from a Point3D.',
    signature: 'point3DToStep(point: Point3D, id: number): StepEntity',
    params: [
      { name: 'point', type: 'Point3D', description: 'The point' },
      { name: 'id', type: 'number', description: 'Entity ID to assign' },
    ],
    returns: 'A StepEntity',
  },
  {
    name: 'stepToVector3D',
    kind: 'function',
    module: 'io',
    description: 'Extract a normalized Vector3D from a DIRECTION STEP entity.',
    signature: 'stepToVector3D(entity: StepEntity): OperationResult<Vector3D>',
    params: [{ name: 'entity', type: 'StepEntity', description: 'A DIRECTION entity' }],
    returns: 'Vector3D or failure',
  },
  {
    name: 'vector3DToStep',
    kind: 'function',
    module: 'io',
    description: 'Create a DIRECTION STEP entity from a Vector3D (auto-normalized).',
    signature: 'vector3DToStep(vector: Vector3D, id: number): StepEntity',
    params: [
      { name: 'vector', type: 'Vector3D', description: 'The vector (will be normalized)' },
      { name: 'id', type: 'number', description: 'Entity ID to assign' },
    ],
    returns: 'A StepEntity',
  },
  {
    name: 'stepToAxis',
    kind: 'function',
    module: 'io',
    description: 'Extract an Axis from an AXIS1_PLACEMENT STEP entity by resolving its point and direction references.',
    signature: 'stepToAxis(entity: StepEntity, model: StepModel): OperationResult<Axis>',
    params: [
      { name: 'entity', type: 'StepEntity', description: 'An AXIS1_PLACEMENT entity' },
      { name: 'model', type: 'StepModel', description: 'The full model (to resolve references)' },
    ],
    returns: 'Axis or failure',
  },
  {
    name: 'axisToStep',
    kind: 'function',
    module: 'io',
    description: 'Create STEP entities for an Axis (AXIS1_PLACEMENT + CARTESIAN_POINT + DIRECTION).',
    signature: 'axisToStep(ax: Axis, builder: StepModelBuilder): StepEntity[]',
    params: [
      { name: 'ax', type: 'Axis', description: 'The axis' },
      { name: 'builder', type: 'StepModelBuilder', description: 'Model builder for ID allocation' },
    ],
    returns: 'Array of created entities',
  },
  {
    name: 'stepToPlane',
    kind: 'function',
    module: 'io',
    description: 'Extract a Plane from an AXIS2_PLACEMENT_3D STEP entity by resolving its point and direction references.',
    signature: 'stepToPlane(entity: StepEntity, model: StepModel): OperationResult<Plane>',
    params: [
      { name: 'entity', type: 'StepEntity', description: 'An AXIS2_PLACEMENT_3D entity' },
      { name: 'model', type: 'StepModel', description: 'The full model (to resolve references)' },
    ],
    returns: 'Plane or failure',
  },
  {
    name: 'planeToStep',
    kind: 'function',
    module: 'io',
    description: 'Create STEP entities for a Plane (AXIS2_PLACEMENT_3D + CARTESIAN_POINT + 2 DIRECTIONs).',
    signature: 'planeToStep(pl: Plane, builder: StepModelBuilder): StepEntity[]',
    params: [
      { name: 'pl', type: 'Plane', description: 'The plane' },
      { name: 'builder', type: 'StepModelBuilder', description: 'Model builder for ID allocation' },
    ],
    returns: 'Array of created entities',
  },
  {
    name: 'extractFoundationTypes',
    kind: 'function',
    module: 'io',
    description: 'Extract all Point3D, Vector3D, Axis, and Plane objects from a parsed STEP model.',
    signature: 'extractFoundationTypes(model: StepModel): { points, directions, axes, planes }',
    params: [{ name: 'model', type: 'StepModel', description: 'A parsed StepModel' }],
    returns: 'Maps of extracted objects keyed by entity ID',
  },

  // ═══════════════════════════════════════════════════════
  // MESH
  // ═══════════════════════════════════════════════════════
  {
    name: 'Mesh',
    kind: 'interface',
    module: 'mesh',
    description: 'A triangulated mesh suitable for rendering. Vertices and normals are flat XYZ triples.',
    properties: [
      { name: 'vertices', type: 'Float32Array', description: 'Flat array of vertex positions [x0,y0,z0, x1,y1,z1, ...]' },
      { name: 'normals', type: 'Float32Array', description: 'Flat array of per-vertex normals' },
      { name: 'indices', type: 'Uint32Array', description: 'Triangle index buffer (triples)' },
    ],
  },
  {
    name: 'OperationResult',
    kind: 'interface',
    module: 'mesh',
    description: 'Result of a fallible operation. Check success before accessing result.',
    properties: [
      { name: 'success', type: 'boolean', description: 'Whether the operation succeeded' },
      { name: 'result', type: 'T | undefined', description: 'The computed value (when success is true)' },
      { name: 'error', type: 'string | undefined', description: 'Error description (when success is false)' },
      { name: 'warnings', type: 'string[] | undefined', description: 'Non-fatal warnings' },
    ],
  },
  {
    name: 'createMesh',
    kind: 'function',
    module: 'mesh',
    description: 'Create a Mesh from pre-built typed arrays. No validation is performed.',
    signature: 'createMesh(vertices: Float32Array, normals: Float32Array, indices: Uint32Array): Mesh',
    params: [
      { name: 'vertices', type: 'Float32Array', description: 'Flat array of vertex positions' },
      { name: 'normals', type: 'Float32Array', description: 'Flat array of per-vertex normals' },
      { name: 'indices', type: 'Uint32Array', description: 'Triangle index buffer' },
    ],
    returns: 'A new Mesh wrapping the provided arrays',
  },
  {
    name: 'meshVertexCount',
    kind: 'function',
    module: 'mesh',
    description: 'Count the number of vertices in a mesh.',
    signature: 'meshVertexCount(m: Mesh): number',
    params: [{ name: 'm', type: 'Mesh', description: 'The mesh to inspect' }],
    returns: 'The vertex count (vertices.length / 3)',
  },
  {
    name: 'meshTriangleCount',
    kind: 'function',
    module: 'mesh',
    description: 'Count the number of triangles in a mesh.',
    signature: 'meshTriangleCount(m: Mesh): number',
    params: [{ name: 'm', type: 'Mesh', description: 'The mesh to inspect' }],
    returns: 'The triangle count (indices.length / 3)',
  },
  {
    name: 'validateMesh',
    kind: 'function',
    module: 'mesh',
    description: 'Validate mesh consistency. Checks normals match vertices and indices are in range.',
    signature: 'validateMesh(m: Mesh): OperationResult<Mesh>',
    params: [{ name: 'm', type: 'Mesh', description: 'The mesh to validate' }],
    returns: 'Successful result with the mesh, or failure describing the inconsistency',
  },
  {
    name: 'success',
    kind: 'function',
    module: 'mesh',
    description: 'Create a successful operation result.',
    signature: 'success<T>(result: T, warnings?: string[]): OperationResult<T>',
    params: [
      { name: 'result', type: 'T', description: 'The value produced by the operation' },
      { name: 'warnings', type: 'string[]', description: 'Optional non-fatal warnings' },
    ],
    returns: 'An OperationResult with success: true',
  },
  {
    name: 'failure',
    kind: 'function',
    module: 'mesh',
    description: 'Create a failed operation result.',
    signature: 'failure<T>(error: string): OperationResult<T>',
    params: [
      { name: 'error', type: 'string', description: 'A human-readable description of what went wrong' },
    ],
    returns: 'An OperationResult with success: false',
  },

  // ═══════════════════════════════════════════════════════
  // PRIMITIVES
  // ═══════════════════════════════════════════════════════
  {
    name: 'makeBox',
    kind: 'function',
    module: 'primitives',
    description: 'Create an axis-aligned box mesh centered at the origin.',
    signature: 'makeBox(width: number, height: number, depth: number): OperationResult<Mesh>',
    params: [
      { name: 'width', type: 'number', description: 'Extent along the X axis (must be positive)' },
      { name: 'height', type: 'number', description: 'Extent along the Y axis (must be positive)' },
      { name: 'depth', type: 'number', description: 'Extent along the Z axis (must be positive)' },
    ],
    returns: 'A 24-vertex, 12-triangle mesh, or failure if any dimension is non-positive',
  },
  {
    name: 'makeSphere',
    kind: 'function',
    module: 'primitives',
    description: 'Generate a UV sphere mesh centered at the origin.',
    signature: 'makeSphere(radius: number, options?: { segments?: number; rings?: number }): OperationResult<Mesh>',
    params: [
      { name: 'radius', type: 'number', description: 'Sphere radius (must be positive)' },
      { name: 'options.segments', type: 'number', description: 'Longitudinal divisions (default 32)' },
      { name: 'options.rings', type: 'number', description: 'Latitudinal divisions (default 16)' },
    ],
    returns: 'The sphere mesh, or failure if radius is non-positive',
  },
  {
    name: 'makeCylinder',
    kind: 'function',
    module: 'primitives',
    description: 'Create a cylinder mesh centered at the origin, aligned along the Y axis.',
    signature: 'makeCylinder(radius: number, height: number, options?: { segments?: number }): OperationResult<Mesh>',
    params: [
      { name: 'radius', type: 'number', description: 'Radius of the circular cross-section (must be positive)' },
      { name: 'height', type: 'number', description: 'Total height along the Y axis (must be positive)' },
      { name: 'options.segments', type: 'number', description: 'Circumferential divisions (default 32)' },
    ],
    returns: 'The cylinder mesh, or failure if radius or height is non-positive',
  },
];

/** Get all entries for a specific module. */
export function getEntriesByModule(module: string): ApiEntry[] {
  return apiEntries.filter((e) => e.module === module);
}
