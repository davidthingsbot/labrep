import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, XY_PLANE, normalize, cross } from '../../src/core';
import { makeLine3D, makeCircle3D } from '../../src/geometry';
import type { PlaneCircleIntersection } from '../../src/geometry/intersections3d';
import {
  makeEdgeFromCurve,
  makeWireFromEdges,
  makeFace,
} from '../../src/topology';
import { makePlaneSurface } from '../../src/surfaces';
import { splitPlanarFaceByCircle } from '../../src/operations/split-face-by-circle';

/**
 * Build a square planar face centered at (cx, cy, cz) in the XY plane with given half-width.
 */
function makeSquareFace(cx: number, cy: number, cz: number, halfW: number) {
  const p00 = point3d(cx - halfW, cy - halfW, cz);
  const p10 = point3d(cx + halfW, cy - halfW, cz);
  const p11 = point3d(cx + halfW, cy + halfW, cz);
  const p01 = point3d(cx - halfW, cy + halfW, cz);

  const e0 = makeEdgeFromCurve(makeLine3D(p00, p10).result!).result!;
  const e1 = makeEdgeFromCurve(makeLine3D(p10, p11).result!).result!;
  const e2 = makeEdgeFromCurve(makeLine3D(p11, p01).result!).result!;
  const e3 = makeEdgeFromCurve(makeLine3D(p01, p00).result!).result!;

  const wire = makeWireFromEdges([e0, e1, e2, e3]).result!;
  const surface = makePlaneSurface(plane(
    point3d(cx, cy, cz),
    vec3d(0, 0, 1),
    vec3d(1, 0, 0),
  ));
  return makeFace(surface, wire).result!;
}

describe('splitPlanarFaceByCircle', () => {
  describe('C1: full circle inside face', () => {
    it('splits 4×4 face by circle r=1 at center', () => {
      const face = makeSquareFace(0, 0, 0, 2); // 4×4 from (-2,-2) to (2,2)
      const circle: PlaneCircleIntersection = {
        type: 'circle',
        center: point3d(0, 0, 0),
        radius: 1,
        normal: vec3d(0, 0, 1),
      };

      const result = splitPlanarFaceByCircle(face, circle);
      expect(result).not.toBeNull();

      const { outside, inside } = result!;

      // Outside face: square with circular hole
      expect(outside.surface.type).toBe('plane');
      expect(outside.outerWire.edges).toHaveLength(4); // 4 line edges
      expect(outside.innerWires).toHaveLength(1); // 1 circular hole
      expect(outside.innerWires[0].edges).toHaveLength(1); // 1 circle edge
      expect(outside.innerWires[0].isClosed).toBe(true);

      // Inside face: circular disk
      expect(inside.surface.type).toBe('plane');
      expect(inside.outerWire.edges).toHaveLength(1); // 1 circle edge
      expect(inside.outerWire.isClosed).toBe(true);
      expect(inside.innerWires).toHaveLength(0);
    });

    it('returns null when circle is entirely outside face', () => {
      const face = makeSquareFace(0, 0, 0, 1); // 2×2 from (-1,-1) to (1,1)
      const circle: PlaneCircleIntersection = {
        type: 'circle',
        center: point3d(5, 0, 0),
        radius: 1,
        normal: vec3d(0, 0, 1),
      };

      const result = splitPlanarFaceByCircle(face, circle);
      expect(result).toBeNull();
    });

    it('returns null when face is entirely inside circle', () => {
      const face = makeSquareFace(0, 0, 0, 0.5); // 1×1 from (-0.5,-0.5) to (0.5,0.5)
      const circle: PlaneCircleIntersection = {
        type: 'circle',
        center: point3d(0, 0, 0),
        radius: 5,
        normal: vec3d(0, 0, 1),
      };

      const result = splitPlanarFaceByCircle(face, circle);
      expect(result).toBeNull();
    });

    it('handles off-center circle inside face', () => {
      const face = makeSquareFace(0, 0, 0, 3); // 6×6
      const circle: PlaneCircleIntersection = {
        type: 'circle',
        center: point3d(1, 1, 0),
        radius: 0.5,
        normal: vec3d(0, 0, 1),
      };

      const result = splitPlanarFaceByCircle(face, circle);
      expect(result).not.toBeNull();

      const { outside, inside } = result!;
      expect(outside.innerWires).toHaveLength(1);
      expect(inside.outerWire.edges).toHaveLength(1);
    });

    it('circle edge curve type is circle3d', () => {
      const face = makeSquareFace(0, 0, 0, 2);
      const circle: PlaneCircleIntersection = {
        type: 'circle',
        center: point3d(0, 0, 0),
        radius: 1,
        normal: vec3d(0, 0, 1),
      };

      const result = splitPlanarFaceByCircle(face, circle)!;
      const holeEdge = result.outside.innerWires[0].edges[0].edge;
      expect(holeEdge.curve.type).toBe('circle3d');

      const diskEdge = result.inside.outerWire.edges[0].edge;
      expect(diskEdge.curve.type).toBe('circle3d');
    });

    it('works on a face at z=5', () => {
      const face = makeSquareFace(0, 0, 5, 2);
      const circle: PlaneCircleIntersection = {
        type: 'circle',
        center: point3d(0, 0, 5),
        radius: 1,
        normal: vec3d(0, 0, 1),
      };

      const result = splitPlanarFaceByCircle(face, circle);
      expect(result).not.toBeNull();
      expect(result!.outside.innerWires).toHaveLength(1);
    });
  });
});
