import { Point3D, point3d } from './point3d';
import { Vector3D, vec3d } from './vector3d';

/**
 * An axis-aligned bounding box in 3D space, defined by its minimum and
 * maximum corner points.
 */
export interface BoundingBox3D {
  readonly min: Point3D;
  readonly max: Point3D;
}

/**
 * Creates a bounding box from explicit min and max corner points.
 *
 * @param min - The corner with the smallest x, y, z values
 * @param max - The corner with the largest x, y, z values
 * @returns A new BoundingBox3D
 */
export function boundingBox(min: Point3D, max: Point3D): BoundingBox3D {
  return { min, max };
}

const INF = Infinity;

/**
 * Creates an empty bounding box with inverted extents (min = +Infinity,
 * max = -Infinity) so that adding any point produces a valid box.
 *
 * @returns An empty BoundingBox3D ready for point accumulation
 */
export function emptyBoundingBox(): BoundingBox3D {
  return {
    min: point3d(INF, INF, INF),
    max: point3d(-INF, -INF, -INF),
  };
}

/**
 * Expands a bounding box to include the given point.
 *
 * @param box - The existing bounding box
 * @param pt - The point to include
 * @returns A new BoundingBox3D that encloses both the original box and the point
 */
export function addPoint(box: BoundingBox3D, pt: Point3D): BoundingBox3D {
  return {
    min: point3d(
      Math.min(box.min.x, pt.x),
      Math.min(box.min.y, pt.y),
      Math.min(box.min.z, pt.z),
    ),
    max: point3d(
      Math.max(box.max.x, pt.x),
      Math.max(box.max.y, pt.y),
      Math.max(box.max.z, pt.z),
    ),
  };
}

/**
 * Tests whether a point lies inside or on the boundary of the bounding box.
 * Uses exact comparison (no tolerance).
 *
 * @param box - The bounding box to test against
 * @param pt - The point to test
 * @returns True if the point is inside or on the boundary
 */
export function contains(box: BoundingBox3D, pt: Point3D): boolean {
  return (
    pt.x >= box.min.x && pt.x <= box.max.x &&
    pt.y >= box.min.y && pt.y <= box.max.y &&
    pt.z >= box.min.z && pt.z <= box.max.z
  );
}

/**
 * Computes the center point of a bounding box.
 *
 * @param box - The bounding box
 * @returns The midpoint between min and max
 */
export function center(box: BoundingBox3D): Point3D {
  return point3d(
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2,
  );
}

/**
 * Computes the dimensions of a bounding box as a vector (width, height, depth).
 *
 * @param box - The bounding box
 * @returns A vector whose x, y, z components are the box extents along each axis
 */
export function size(box: BoundingBox3D): Vector3D {
  return vec3d(
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  );
}

/**
 * Tests whether two bounding boxes overlap (share any volume or touch).
 *
 * @param a - First bounding box
 * @param b - Second bounding box
 * @returns True if the boxes overlap or touch on any axis
 */
export function intersects(a: BoundingBox3D, b: BoundingBox3D): boolean {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

/**
 * Tests whether a bounding box is empty (has no volume).
 * A box is empty when any min component exceeds the corresponding max component,
 * which is the initial state produced by {@link emptyBoundingBox}.
 *
 * @param box - The bounding box to test
 * @returns True if the box has no volume
 */
export function isEmpty(box: BoundingBox3D): boolean {
  return (
    box.min.x > box.max.x ||
    box.min.y > box.max.y ||
    box.min.z > box.max.z
  );
}
