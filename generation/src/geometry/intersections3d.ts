import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  Plane,
  normalize,
  cross,
  dot,
  length,
  isZero,
} from '../core';
import { Line3D, makeLine3D, makeLine3DFromPointDir } from './line3d';
import { OperationResult, success, failure } from '../mesh/mesh';

/**
 * Compute the intersection of two planes.
 *
 * Two non-parallel planes intersect along a line.
 * Parallel or coincident planes return null.
 *
 * @param pl1 - First plane
 * @param pl2 - Second plane
 * @returns Line3D along the intersection, or null if planes are parallel/coincident
 */
export function intersectPlanePlane(
  pl1: Plane,
  pl2: Plane,
): OperationResult<Line3D | null> {
  // Direction of intersection line = cross product of normals
  const dir = cross(pl1.normal, pl2.normal);
  const dirLen = length(dir);

  // Parallel or coincident planes
  if (isZero(dirLen)) {
    return success(null);
  }

  const direction = normalize(dir);

  // Find a point on the intersection line.
  // Solve the system:
  //   dot(pt - pl1.origin, pl1.normal) = 0
  //   dot(pt - pl2.origin, pl2.normal) = 0
  //
  // We find the point closest to the origin on the intersection line.
  // Using the formula: pt = (d1 * n2 - d2 * n1) × dir / |dir|²
  // where d1 = dot(pl1.origin, pl1.normal), d2 = dot(pl2.origin, pl2.normal)
  const d1 = dot(pl1.normal, pl1.origin as unknown as Vector3D);
  const d2 = dot(pl2.normal, pl2.origin as unknown as Vector3D);

  const n1 = pl1.normal;
  const n2 = pl2.normal;
  const dirLenSq = dirLen * dirLen;

  // pt = (d1 * (n2 × dir) + d2 * (dir × n1)) / |dir|²
  const n2xDir = cross(n2, dir);
  const dirxN1 = cross(dir, n1);

  const origin = point3d(
    (d1 * n2xDir.x + d2 * dirxN1.x) / dirLenSq,
    (d1 * n2xDir.y + d2 * dirxN1.y) / dirLenSq,
    (d1 * n2xDir.z + d2 * dirxN1.z) / dirLenSq,
  );

  const lineResult = makeLine3DFromPointDir(origin, direction, 1);
  if (!lineResult.success) {
    return failure(`Failed to create intersection line: ${lineResult.error}`);
  }

  return success(lineResult.result!);
}
