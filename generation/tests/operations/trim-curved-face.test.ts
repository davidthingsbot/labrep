import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  Z_AXIS_3D,
  distance,
} from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { trimCurvedFaceByPlanes } from '../../src/operations/trim-curved-face';

function makeBox(cx: number, cy: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, z), point3d(cx + hw, cy - hh, z),
    point3d(cx + hw, cy + hh, z), point3d(cx - hw, cy + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

/** Create a true sphere via revolving two arc segments around Z axis */
function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const e1 = makeEdgeFromCurve(arc1).result!;
  const e2 = makeEdgeFromCurve(arc2).result!;
  const e3 = makeEdgeFromCurve(line).result!;
  const wire = makeWireFromEdges([e1, e2, e3]).result!;
  return revolve(wire, Z_AXIS_3D, 2 * Math.PI).result!;
}

describe('trimCurvedFaceByPlanes', () => {
  describe('D1: sphere fully inside box', () => {
    it('returns null (no trimming needed) when sphere is inside box', () => {
      const box = makeBox(0, 0, -3, 6, 6, 6); // 6×6×6 box centered at origin
      const sphere = makeSphere(1);             // unit sphere at origin

      const sphereFaces = shellFaces(sphere.solid.outerShell);
      const sphereFace = sphereFaces.find(f => f.surface.type === 'sphere');
      expect(sphereFace).toBeDefined();

      const result = trimCurvedFaceByPlanes(sphereFace!, box.solid);
      expect(result.success).toBe(true);
      // Sphere entirely inside box → no intersection circles exist → null
      expect(result.result).toBeNull();
    });
  });

  describe('D1: sphere face trimmed by single plane equivalent', () => {
    it('trims sphere by a small box that clips the top → produces trimmed face', () => {
      // Box from z=-2 to z=0.5 (clips the unit sphere above z=0.5)
      // The sphere extends from z=-1 to z=1, so the box clips the top cap
      const box = makeBox(0, 0, -2, 4, 4, 2.5); // 4×4, z from -2 to 0.5

      const sphere = makeSphere(1);
      const sphereFaces = shellFaces(sphere.solid.outerShell);

      // The sphere has 2 faces (upper and lower hemisphere)
      // The upper hemisphere (z > 0 part) will be partially clipped by the box top at z=0.5
      let trimmedCount = 0;
      let nullCount = 0;
      for (const sf of sphereFaces) {
        if (sf.surface.type !== 'sphere') continue;
        const result = trimCurvedFaceByPlanes(sf, box.solid);
        expect(result.success).toBe(true);
        if (result.result !== null) {
          trimmedCount++;
          // Trimmed face should have a closed wire
          expect(result.result.outerWire.isClosed).toBe(true);
          // Surface should still be spherical
          expect(result.result.surface.type).toBe('sphere');
        } else {
          nullCount++;
        }
      }
      // At least one face should be trimmed (the upper hemisphere gets clipped by z=0.5)
      // The lower hemisphere is fully inside the box → null
      expect(trimmedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('D2: sphere trimmed by a box that clips one side', () => {
    it('sphere r=1, box from x=-2..0.5 clips the right side → trimmed face', () => {
      // Box: x from -2 to 0.5, y from -2 to 2, z from -2 to 2
      // Sphere r=1 at origin → the x=0.5 plane clips the sphere
      // Only 1 plane intersects (x=0.5), producing a full circle
      const box = makeBox(-0.75, 0, -2, 2.5, 4, 4);

      const sphere = makeSphere(1);
      const sphereFaces = shellFaces(sphere.solid.outerShell);

      let trimmedCount = 0;
      for (const sf of sphereFaces) {
        if (sf.surface.type !== 'sphere') continue;
        const result = trimCurvedFaceByPlanes(sf, box.solid);
        if (result.success && result.result !== null) {
          trimmedCount++;
          expect(result.result.outerWire.isClosed).toBe(true);
          expect(result.result.surface.type).toBe('sphere');
        }
      }
      // At least one hemisphere face should be trimmed
      expect(trimmedCount).toBeGreaterThanOrEqual(1);
    });

    it('trimmed face wire has circle or arc edges', () => {
      const box = makeBox(-0.75, 0, -2, 2.5, 4, 4);
      const sphere = makeSphere(1);

      const sphereFaces = shellFaces(sphere.solid.outerShell);
      for (const sf of sphereFaces) {
        if (sf.surface.type !== 'sphere') continue;
        const result = trimCurvedFaceByPlanes(sf, box.solid);
        if (result.success && result.result !== null) {
          for (const oe of result.result.outerWire.edges) {
            expect(['arc3d', 'circle3d']).toContain(oe.edge.curve.type);
          }
        }
      }
    });
  });
});
