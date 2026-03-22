import { Point3D, point3d } from './point3d';
import { Vector3D, vec3d } from './vector3d';

/**
 * 4x4 transformation matrix stored in column-major order.
 * elements[0..3] = column 0, elements[4..7] = column 1, etc.
 *
 * Layout (row, col):
 *   [0]  [4]  [8]  [12]     m00 m01 m02 tx
 *   [1]  [5]  [9]  [13]     m10 m11 m12 ty
 *   [2]  [6]  [10] [14]     m20 m21 m22 tz
 *   [3]  [7]  [11] [15]     0   0   0   1
 */
export interface Transform3D {
  readonly elements: Float64Array;
}

function mat(e: Float64Array): Transform3D {
  return { elements: e };
}

/**
 * Create the 4x4 identity transform (no rotation, translation, or scale).
 *
 * @returns The identity Transform3D
 */
export function identity(): Transform3D {
  const e = new Float64Array(16);
  e[0] = 1; e[5] = 1; e[10] = 1; e[15] = 1;
  return mat(e);
}

/**
 * Create a translation transform.
 *
 * @param dx - Translation along the X axis
 * @param dy - Translation along the Y axis
 * @param dz - Translation along the Z axis
 * @returns A Transform3D that translates by (dx, dy, dz)
 */
export function translation(dx: number, dy: number, dz: number): Transform3D {
  const e = new Float64Array(16);
  e[0] = 1; e[5] = 1; e[10] = 1; e[15] = 1;
  e[12] = dx; e[13] = dy; e[14] = dz;
  return mat(e);
}

/**
 * Create a rotation transform about the X axis.
 *
 * @param angle - Rotation angle in radians (right-hand rule)
 * @returns A Transform3D that rotates around the X axis
 */
export function rotationX(angle: number): Transform3D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const e = new Float64Array(16);
  e[0] = 1;
  e[5] = c;  e[6] = s;
  e[9] = -s; e[10] = c;
  e[15] = 1;
  return mat(e);
}

/**
 * Create a rotation transform about the Y axis.
 *
 * @param angle - Rotation angle in radians (right-hand rule)
 * @returns A Transform3D that rotates around the Y axis
 */
export function rotationY(angle: number): Transform3D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const e = new Float64Array(16);
  e[0] = c;  e[2] = -s;
  e[5] = 1;
  e[8] = s;  e[10] = c;
  e[15] = 1;
  return mat(e);
}

/**
 * Create a rotation transform about the Z axis.
 *
 * @param angle - Rotation angle in radians (right-hand rule)
 * @returns A Transform3D that rotates around the Z axis
 */
export function rotationZ(angle: number): Transform3D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const e = new Float64Array(16);
  e[0] = c;  e[1] = s;
  e[4] = -s; e[5] = c;
  e[10] = 1;
  e[15] = 1;
  return mat(e);
}

/**
 * Create a non-uniform scaling transform.
 *
 * @param sx - Scale factor along the X axis
 * @param sy - Scale factor along the Y axis
 * @param sz - Scale factor along the Z axis
 * @returns A Transform3D that scales by (sx, sy, sz)
 */
export function scaling(sx: number, sy: number, sz: number): Transform3D {
  const e = new Float64Array(16);
  e[0] = sx; e[5] = sy; e[10] = sz; e[15] = 1;
  return mat(e);
}

/**
 * Compose two transforms: result = a * b (apply b first, then a).
 *
 * @param a - The outer (second-applied) transform
 * @param b - The inner (first-applied) transform
 * @returns A new Transform3D equivalent to applying b then a
 */
export function compose(a: Transform3D, b: Transform3D): Transform3D {
  const ae = a.elements;
  const be = b.elements;
  const e = new Float64Array(16);

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += ae[k * 4 + row] * be[col * 4 + k];
      }
      e[col * 4 + row] = sum;
    }
  }

  return mat(e);
}

/**
 * Compute the inverse of a 4x4 transform using cofactor expansion.
 *
 * @param t - The transform to invert
 * @returns The inverse Transform3D
 * @throws Error if the matrix determinant is near zero (not invertible)
 */
export function inverse(t: Transform3D): Transform3D {
  const m = t.elements;
  const inv = new Float64Array(16);

  inv[0] =
    m[5] * (m[10] * m[15] - m[14] * m[11]) -
    m[9] * (m[6] * m[15] - m[14] * m[7]) +
    m[13] * (m[6] * m[11] - m[10] * m[7]);

  inv[1] = -(
    m[1] * (m[10] * m[15] - m[14] * m[11]) -
    m[9] * (m[2] * m[15] - m[14] * m[3]) +
    m[13] * (m[2] * m[11] - m[10] * m[3])
  );

  inv[2] =
    m[1] * (m[6] * m[15] - m[14] * m[7]) -
    m[5] * (m[2] * m[15] - m[14] * m[3]) +
    m[13] * (m[2] * m[7] - m[6] * m[3]);

  inv[3] = -(
    m[1] * (m[6] * m[11] - m[10] * m[7]) -
    m[5] * (m[2] * m[11] - m[10] * m[3]) +
    m[9] * (m[2] * m[7] - m[6] * m[3])
  );

  inv[4] = -(
    m[4] * (m[10] * m[15] - m[14] * m[11]) -
    m[8] * (m[6] * m[15] - m[14] * m[7]) +
    m[12] * (m[6] * m[11] - m[10] * m[7])
  );

  inv[5] =
    m[0] * (m[10] * m[15] - m[14] * m[11]) -
    m[8] * (m[2] * m[15] - m[14] * m[3]) +
    m[12] * (m[2] * m[11] - m[10] * m[3]);

  inv[6] = -(
    m[0] * (m[6] * m[15] - m[14] * m[7]) -
    m[4] * (m[2] * m[15] - m[14] * m[3]) +
    m[12] * (m[2] * m[7] - m[6] * m[3])
  );

  inv[7] =
    m[0] * (m[6] * m[11] - m[10] * m[7]) -
    m[4] * (m[2] * m[11] - m[10] * m[3]) +
    m[8] * (m[2] * m[7] - m[6] * m[3]);

  inv[8] =
    m[4] * (m[9] * m[15] - m[13] * m[11]) -
    m[8] * (m[5] * m[15] - m[13] * m[7]) +
    m[12] * (m[5] * m[11] - m[9] * m[7]);

  inv[9] = -(
    m[0] * (m[9] * m[15] - m[13] * m[11]) -
    m[8] * (m[1] * m[15] - m[13] * m[3]) +
    m[12] * (m[1] * m[11] - m[9] * m[3])
  );

  inv[10] =
    m[0] * (m[5] * m[15] - m[13] * m[7]) -
    m[4] * (m[1] * m[15] - m[13] * m[3]) +
    m[12] * (m[1] * m[7] - m[5] * m[3]);

  inv[11] = -(
    m[0] * (m[5] * m[11] - m[9] * m[7]) -
    m[4] * (m[1] * m[11] - m[9] * m[3]) +
    m[8] * (m[1] * m[7] - m[5] * m[3])
  );

  inv[12] = -(
    m[4] * (m[9] * m[14] - m[13] * m[10]) -
    m[8] * (m[5] * m[14] - m[13] * m[6]) +
    m[12] * (m[5] * m[10] - m[9] * m[6])
  );

  inv[13] =
    m[0] * (m[9] * m[14] - m[13] * m[10]) -
    m[8] * (m[1] * m[14] - m[13] * m[2]) +
    m[12] * (m[1] * m[10] - m[9] * m[2]);

  inv[14] = -(
    m[0] * (m[5] * m[14] - m[13] * m[6]) -
    m[4] * (m[1] * m[14] - m[13] * m[2]) +
    m[12] * (m[1] * m[6] - m[5] * m[2])
  );

  inv[15] =
    m[0] * (m[5] * m[10] - m[9] * m[6]) -
    m[4] * (m[1] * m[10] - m[9] * m[2]) +
    m[8] * (m[1] * m[6] - m[5] * m[2]);

  const det =
    m[0] * inv[0] + m[4] * inv[1] + m[8] * inv[2] + m[12] * inv[3];

  if (Math.abs(det) < 1e-15) {
    throw new Error('Matrix is not invertible');
  }

  const invDet = 1.0 / det;
  const result = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    result[i] = inv[i] * invDet;
  }

  return mat(result);
}

/**
 * Transform a point by applying the full 4x4 matrix, including translation.
 *
 * @param t - The transform to apply
 * @param p - The point to transform
 * @returns The transformed point
 */
export function transformPoint(t: Transform3D, p: Point3D): Point3D {
  const e = t.elements;
  return point3d(
    e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12],
    e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13],
    e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14],
  );
}

/**
 * Transform a vector by applying only the rotational/scale part of the matrix
 * (translation is ignored).
 *
 * @param t - The transform to apply
 * @param v - The vector to transform
 * @returns The transformed vector
 */
export function transformVector(t: Transform3D, v: Vector3D): Vector3D {
  const e = t.elements;
  return vec3d(
    e[0] * v.x + e[4] * v.y + e[8] * v.z,
    e[1] * v.x + e[5] * v.y + e[9] * v.z,
    e[2] * v.x + e[6] * v.y + e[10] * v.z,
  );
}
