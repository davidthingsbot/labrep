import {
  Point3D,
  point3d,
  Vector3D,
  vec3d,
  Plane,
  dot,
  cross,
  worldToSketch,
  isZero,
  distance,
  subtractPoints,
} from '../core';
import { Solid } from '../topology/solid';
import { shellFaces } from '../topology/shell';
import { Face, faceOuterWire, faceInnerWires } from '../topology/face';
import { edgeStartPoint, edgeEndPoint } from '../topology/edge';
import type { SphericalSurface } from '../surfaces/spherical-surface';
import type { CylindricalSurface } from '../surfaces/cylindrical-surface';
import type { ConicalSurface } from '../surfaces/conical-surface';

/**
 * Test whether a point is inside, outside, or on the boundary of a solid.
 *
 * Uses ray casting: cast a ray in the +X direction and count intersections
 * with the solid's faces. Odd count = inside, even = outside.
 *
 * Currently supports planar faces only. Non-planar faces are approximated
 * by their wire boundary polygon.
 *
 * @param pt - The point to test
 * @param solid - The solid to test against
 * @returns 'inside', 'outside', or 'on'
 */
export function pointInSolid(
  pt: Point3D,
  solid: Solid,
): 'inside' | 'outside' | 'on' {
  const ON_TOL = 1e-6;
  let crossings = 0;

  // Track unique spheres to avoid double-counting (a sphere split into 2+ faces
  // is one geometric surface — the ray intersects it 0 or 2 times total)
  const processedSpheres = new Set<string>();

  for (const face of shellFaces(solid.outerShell)) {
    const surface = face.surface;

    if (surface.type === 'plane') {
      const result = rayIntersectsPlanarFace(pt, face.outerWire, surface.plane);
      if (result === 'on') return 'on';
      if (result === 'hit') crossings++;
    } else if (surface.type === 'sphere') {
      // Deduplicate: only test each sphere once regardless of how many faces it's split into
      const key = `${surface.center.x},${surface.center.y},${surface.center.z},${surface.radius}`;
      if (!processedSpheres.has(key)) {
        processedSpheres.add(key);
        crossings += rayIntersectsSphere(pt, surface);
      }
    } else if (surface.type === 'cylinder') {
      const hits = rayIntersectsCylinder(pt, surface, face);
      crossings += hits;
    } else if (surface.type === 'cone') {
      const hits = rayIntersectsCone(pt, surface, face);
      crossings += hits;
    } else {
      // For other non-planar faces, approximate using wire boundary vertices
      const result = rayIntersectsPolygonFace(pt, face);
      if (result === 'on') return 'on';
      if (result === 'hit') crossings++;
    }
  }

  return crossings % 2 === 1 ? 'inside' : 'outside';
}

/**
 * Cast ray in +X from pt, test intersection with a planar face.
 */
function rayIntersectsPlanarFace(
  pt: Point3D,
  wire: { edges: readonly { edge: { curve: any; startVertex: { point: Point3D }; endVertex: { point: Point3D } }; forward: boolean }[] },
  facePlane: Plane,
): 'hit' | 'miss' | 'on' {
  const ON_TOL = 1e-6;

  // Ray: P(t) = pt + t * (1, 0, 0), t >= 0
  // Plane: dot(P - origin, normal) = 0
  // dot(pt + t*X - origin, normal) = 0
  // dot(pt - origin, normal) + t * normal.x = 0
  // t = -dot(pt - origin, normal) / normal.x

  const normalDotRay = facePlane.normal.x; // dot(normal, (1,0,0))

  if (Math.abs(normalDotRay) < ON_TOL) {
    // Ray parallel to plane — check if point is on the plane
    const distToPlane =
      (pt.x - facePlane.origin.x) * facePlane.normal.x +
      (pt.y - facePlane.origin.y) * facePlane.normal.y +
      (pt.z - facePlane.origin.z) * facePlane.normal.z;

    if (Math.abs(distToPlane) < ON_TOL) {
      // Point is on the plane — could be "on" the face
      // Check if point is inside the face boundary
      const pt2d = worldToSketch(facePlane, pt);
      if (pointInPolygon2D(pt2d, wire, facePlane)) {
        return 'on';
      }
    }
    return 'miss';
  }

  const distToPlane =
    (pt.x - facePlane.origin.x) * facePlane.normal.x +
    (pt.y - facePlane.origin.y) * facePlane.normal.y +
    (pt.z - facePlane.origin.z) * facePlane.normal.z;

  const t = -distToPlane / normalDotRay;

  if (t < ON_TOL) return 'miss'; // Intersection behind ray origin (or at origin)

  // Intersection point on the plane
  const hitPt = point3d(pt.x + t, pt.y, pt.z);

  // Check if hit point is inside the face boundary (2D point-in-polygon)
  const hit2d = worldToSketch(facePlane, hitPt);

  // Check if on boundary
  if (pointOnPolygonBoundary2D(hit2d, wire, facePlane, ON_TOL)) {
    return 'on';
  }

  if (pointInPolygon2D(hit2d, wire, facePlane)) {
    return 'hit';
  }

  return 'miss';
}

/**
 * Approximate ray test for non-planar faces using their wire boundary vertices.
 */
function rayIntersectsPolygonFace(
  pt: Point3D,
  face: { outerWire: { edges: readonly any[] }; surface: any },
): 'hit' | 'miss' | 'on' {
  // Collect vertices from wire
  const verts: Point3D[] = [];
  for (const oe of face.outerWire.edges) {
    const p = oe.forward ? oe.edge.startVertex.point : oe.edge.endVertex.point;
    verts.push(p);
  }
  if (verts.length < 3) return 'miss';

  // Triangulate by fan from first vertex and test each triangle
  const v0 = verts[0];
  let hits = 0;
  for (let i = 1; i < verts.length - 1; i++) {
    if (rayIntersectsTriangle(pt, v0, verts[i], verts[i + 1])) {
      hits++;
    }
  }
  return hits % 2 === 1 ? 'hit' : 'miss';
}

/**
 * Möller–Trumbore ray-triangle intersection.
 * Ray: origin = pt, direction = (1, 0, 0)
 */
function rayIntersectsTriangle(
  pt: Point3D,
  v0: Point3D, v1: Point3D, v2: Point3D,
): boolean {
  const EPS = 1e-10;
  const edge1x = v1.x - v0.x, edge1y = v1.y - v0.y, edge1z = v1.z - v0.z;
  const edge2x = v2.x - v0.x, edge2y = v2.y - v0.y, edge2z = v2.z - v0.z;

  // h = dir × edge2 = (1,0,0) × edge2 = (0, -edge2z, edge2y)
  const hx = 0, hy = -edge2z, hz = edge2y;
  const a = edge1x * hx + edge1y * hy + edge1z * hz;

  if (Math.abs(a) < EPS) return false;

  const f = 1 / a;
  const sx = pt.x - v0.x, sy = pt.y - v0.y, sz = pt.z - v0.z;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return false;

  // q = s × edge1
  const qx = sy * edge1z - sz * edge1y;
  const qy = sz * edge1x - sx * edge1z;
  const qz = sx * edge1y - sy * edge1x;

  const v = f * (1 * qx + 0 * qy + 0 * qz); // dir · q, dir = (1,0,0)
  if (v < 0 || u + v > 1) return false;

  const t = f * (edge2x * qx + edge2y * qy + edge2z * qz);
  return t > EPS;
}

/**
 * 2D point-in-polygon test using ray casting (horizontal ray in +X).
 */
function pointInPolygon2D(
  pt: { x: number; y: number },
  wire: { edges: readonly { edge: { startVertex: { point: Point3D }; endVertex: { point: Point3D } }; forward: boolean }[] },
  facePlane: Plane,
): boolean {
  // Collect 2D vertices
  const verts: { x: number; y: number }[] = [];
  for (const oe of wire.edges) {
    const p3d = oe.forward ? oe.edge.startVertex.point : oe.edge.endVertex.point;
    verts.push(worldToSketch(facePlane, p3d));
  }

  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const yi = verts[i].y, yj = verts[j].y;
    if ((yi > pt.y) !== (yj > pt.y)) {
      const xIntersect = verts[j].x + ((verts[i].x - verts[j].x) * (pt.y - yj)) / (yi - yj);
      if (pt.x < xIntersect) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Check if a 2D point is on the polygon boundary.
 */
function pointOnPolygonBoundary2D(
  pt: { x: number; y: number },
  wire: { edges: readonly { edge: { startVertex: { point: Point3D }; endVertex: { point: Point3D } }; forward: boolean }[] },
  facePlane: Plane,
  tol: number,
): boolean {
  for (const oe of wire.edges) {
    const p1 = worldToSketch(facePlane, oe.forward ? oe.edge.startVertex.point : oe.edge.endVertex.point);
    const p2 = worldToSketch(facePlane, oe.forward ? oe.edge.endVertex.point : oe.edge.startVertex.point);

    // Distance from point to line segment
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < tol * tol) continue;

    let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = p1.x + t * dx, projY = p1.y + t * dy;
    const dist = Math.sqrt((pt.x - projX) ** 2 + (pt.y - projY) ** 2);
    if (dist < tol) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════
// ANALYTIC RAY-SURFACE INTERSECTION
// ═══════════════════════════════════════════════════════

/**
 * Count intersections of a +X ray from pt with a sphere.
 * Ray: P(t) = pt + t*(1,0,0), t > 0
 * Sphere: |P - center|² = r²
 * Expanding: (pt.x + t - cx)² + (pt.y - cy)² + (pt.z - cz)² = r²
 * → t² + 2*(pt.x - cx)*t + [(pt.x-cx)² + (pt.y-cy)² + (pt.z-cz)² - r²] = 0
 */
function rayIntersectsSphere(pt: Point3D, sphere: SphericalSurface): number {
  const dx = pt.x - sphere.center.x;
  const dy = pt.y - sphere.center.y;
  const dz = pt.z - sphere.center.z;
  const a = 1;
  const b = 2 * dx;
  const c = dx * dx + dy * dy + dz * dz - sphere.radius * sphere.radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / 2;
  const t2 = (-b + sqrtD) / 2;

  let hits = 0;
  if (t1 > 1e-8) hits++;
  if (t2 > 1e-8) hits++;
  return hits;
}

/**
 * Count intersections of a +X ray with a cylinder.
 * Only counts hits within the cylinder's axial extent (bounded by the face's wire).
 */
function rayIntersectsCylinder(pt: Point3D, cyl: CylindricalSurface, face: Face): number {
  const ax = cyl.axis;
  const r = cyl.radius;

  // Ray direction is (1,0,0). Project everything perpendicular to cylinder axis.
  // The cylinder equation in the plane perpendicular to axis:
  // |P_perp - axisOrigin_perp|² = r²

  // Vector from axis origin to ray origin
  const ox = pt.x - ax.origin.x, oy = pt.y - ax.origin.y, oz = pt.z - ax.origin.z;

  // Components of ray direction perpendicular to axis
  const d = ax.direction;
  const rayDotAxis = d.x; // dot((1,0,0), axis_dir)
  const rayPerpX = 1 - rayDotAxis * d.x;
  const rayPerpY = 0 - rayDotAxis * d.y;
  const rayPerpZ = 0 - rayDotAxis * d.z;

  // Components of offset perpendicular to axis
  const oDotAxis = ox * d.x + oy * d.y + oz * d.z;
  const oPerpX = ox - oDotAxis * d.x;
  const oPerpY = oy - oDotAxis * d.y;
  const oPerpZ = oz - oDotAxis * d.z;

  // Quadratic: |oPerp + t*rayPerp|² = r²
  const a = rayPerpX * rayPerpX + rayPerpY * rayPerpY + rayPerpZ * rayPerpZ;
  const b = 2 * (oPerpX * rayPerpX + oPerpY * rayPerpY + oPerpZ * rayPerpZ);
  const c = oPerpX * oPerpX + oPerpY * oPerpY + oPerpZ * oPerpZ - r * r;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a < 1e-12) return 0;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  // Check each hit is within the cylinder's axial extent
  let hits = 0;
  for (const t of [t1, t2]) {
    if (t <= 1e-8) continue;
    // Intersection point
    const ix = pt.x + t, iy = pt.y, iz = pt.z;
    // Axial position
    const axialPos = (ix - ax.origin.x) * d.x + (iy - ax.origin.y) * d.y + (iz - ax.origin.z) * d.z;
    // Check if within face's axial range (approximate from wire vertices)
    if (isWithinFaceAxialRange(face, ax, axialPos)) {
      hits++;
    }
  }
  return hits;
}

/**
 * Count intersections of a +X ray with a cone.
 */
function rayIntersectsCone(pt: Point3D, cone: ConicalSurface, face: Face): number {
  // For simplicity, fall back to wire-polygon approximation for cones.
  // Full analytic ray-cone is complex (apex handling, two nappes).
  const result = rayIntersectsPolygonFace(pt, face);
  return result === 'hit' ? 1 : 0;
}

/**
 * Check if an axial position is within the face's axial extent.
 * Examines wire vertex positions to determine the v-range.
 */
function isWithinFaceAxialRange(face: Face, ax: { origin: Point3D; direction: Vector3D }, axialPos: number): boolean {
  let vMin = Infinity, vMax = -Infinity;
  for (const oe of face.outerWire.edges) {
    for (const p of [edgeStartPoint(oe.edge), edgeEndPoint(oe.edge)]) {
      const v = (p.x - ax.origin.x) * ax.direction.x +
                (p.y - ax.origin.y) * ax.direction.y +
                (p.z - ax.origin.z) * ax.direction.z;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  return axialPos >= vMin - 1e-6 && axialPos <= vMax + 1e-6;
}
