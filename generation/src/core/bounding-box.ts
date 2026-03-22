import { Point3D, point3d } from './point3d';
import { Vector3D, vec3d } from './vector3d';

export interface BoundingBox3D {
  readonly min: Point3D;
  readonly max: Point3D;
}

export function boundingBox(min: Point3D, max: Point3D): BoundingBox3D {
  return { min, max };
}

const INF = Infinity;

export function emptyBoundingBox(): BoundingBox3D {
  return {
    min: point3d(INF, INF, INF),
    max: point3d(-INF, -INF, -INF),
  };
}

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

export function contains(box: BoundingBox3D, pt: Point3D): boolean {
  return (
    pt.x >= box.min.x && pt.x <= box.max.x &&
    pt.y >= box.min.y && pt.y <= box.max.y &&
    pt.z >= box.min.z && pt.z <= box.max.z
  );
}

export function center(box: BoundingBox3D): Point3D {
  return point3d(
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2,
  );
}

export function size(box: BoundingBox3D): Vector3D {
  return vec3d(
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  );
}

export function intersects(a: BoundingBox3D, b: BoundingBox3D): boolean {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

export function isEmpty(box: BoundingBox3D): boolean {
  return (
    box.min.x > box.max.x ||
    box.min.y > box.max.y ||
    box.min.z > box.max.z
  );
}
