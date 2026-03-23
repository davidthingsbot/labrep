import { describe, it, expect } from 'vitest';
import { point3d, XY_PLANE, XZ_PLANE, plane, vec3d, Z_AXIS_3D } from '../../src/core';
import { makeLine3D, makeCircle3D } from '../../src/geometry';
import { makePlaneSurface, makeCylindricalSurface } from '../../src/surfaces';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { orientEdge, makeWire } from '../../src/topology/wire';

import {
  makeFace,
  makePlanarFace,
  faceOuterWire,
  faceInnerWires,
  faceSurface,
} from '../../src/topology/face';

describe('Face', () => {
  // Helper: create a rectangular wire on XY plane
  function makeRectangleWire(x1: number, y1: number, x2: number, y2: number) {
    const e1 = makeEdgeFromCurve(makeLine3D(point3d(x1, y1, 0), point3d(x2, y1, 0)).result!).result!;
    const e2 = makeEdgeFromCurve(makeLine3D(point3d(x2, y1, 0), point3d(x2, y2, 0)).result!).result!;
    const e3 = makeEdgeFromCurve(makeLine3D(point3d(x2, y2, 0), point3d(x1, y2, 0)).result!).result!;
    const e4 = makeEdgeFromCurve(makeLine3D(point3d(x1, y2, 0), point3d(x1, y1, 0)).result!).result!;

    return makeWire([
      orientEdge(e1, true),
      orientEdge(e2, true),
      orientEdge(e3, true),
      orientEdge(e4, true),
    ]).result!;
  }

  // Helper: create a circular wire
  function makeCircleWire(cx: number, cy: number, r: number) {
    const circlePlane = plane(point3d(cx, cy, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, r).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    return makeWire([orientEdge(edge, true)]).result!;
  }

  describe('makeFace', () => {
    it('creates a face from surface and outer wire', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const outerWire = makeRectangleWire(0, 0, 2, 1);

      const result = makeFace(surface, outerWire);

      expect(result.success).toBe(true);
      const face = result.result!;
      expect(face.surface).toBe(surface);
      expect(face.outerWire).toBe(outerWire);
      expect(face.innerWires).toEqual([]);
    });

    it('creates a face with holes', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const outerWire = makeRectangleWire(0, 0, 4, 4);
      const hole1 = makeCircleWire(1, 1, 0.3);
      const hole2 = makeCircleWire(3, 3, 0.3);

      const result = makeFace(surface, outerWire, [hole1, hole2]);

      expect(result.success).toBe(true);
      const face = result.result!;
      expect(face.innerWires.length).toBe(2);
    });

    it('fails if outer wire is not closed', () => {
      const surface = makePlaneSurface(XY_PLANE);
      
      // Open wire (not closed)
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(1, 1, 0)).result!).result!;
      const openWire = makeWire([orientEdge(e1, true), orientEdge(e2, true)]).result!;

      const result = makeFace(surface, openWire);

      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });

    it('fails if inner wire is not closed', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const outerWire = makeRectangleWire(0, 0, 4, 4);
      
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(1, 1, 0), point3d(2, 1, 0)).result!).result!;
      const openHole = makeWire([orientEdge(e1, true)]).result!;

      const result = makeFace(surface, outerWire, [openHole]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });
  });

  describe('makePlanarFace', () => {
    it('infers plane from wire and creates face', () => {
      const outerWire = makeRectangleWire(0, 0, 2, 1);

      const result = makePlanarFace(outerWire);

      expect(result.success).toBe(true);
      const face = result.result!;
      expect(face.surface.type).toBe('plane');
    });

    it('creates planar face with hole', () => {
      const outerWire = makeRectangleWire(0, 0, 4, 4);
      const hole = makeCircleWire(2, 2, 0.5);

      const result = makePlanarFace(outerWire, [hole]);

      expect(result.success).toBe(true);
      expect(result.result!.innerWires.length).toBe(1);
    });

    it('fails if outer wire is not closed', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const openWire = makeWire([orientEdge(e1, true)]).result!;

      const result = makePlanarFace(openWire);

      expect(result.success).toBe(false);
    });
  });

  describe('faceOuterWire', () => {
    it('returns the outer wire', () => {
      const outerWire = makeRectangleWire(0, 0, 2, 1);
      const face = makePlanarFace(outerWire).result!;

      expect(faceOuterWire(face)).toBe(outerWire);
    });
  });

  describe('faceInnerWires', () => {
    it('returns empty array when no holes', () => {
      const outerWire = makeRectangleWire(0, 0, 2, 1);
      const face = makePlanarFace(outerWire).result!;

      expect(faceInnerWires(face)).toEqual([]);
    });

    it('returns inner wires', () => {
      const outerWire = makeRectangleWire(0, 0, 4, 4);
      const hole = makeCircleWire(2, 2, 0.5);
      const face = makePlanarFace(outerWire, [hole]).result!;

      expect(faceInnerWires(face).length).toBe(1);
    });
  });

  describe('faceSurface', () => {
    it('returns the underlying surface', () => {
      const surface = makePlaneSurface(XY_PLANE);
      const outerWire = makeRectangleWire(0, 0, 2, 1);
      const face = makeFace(surface, outerWire).result!;

      expect(faceSurface(face)).toBe(surface);
    });
  });
});
