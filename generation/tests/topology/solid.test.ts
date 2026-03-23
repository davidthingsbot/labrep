import { describe, it, expect } from 'vitest';
import { point3d } from '../../src/core';
import { makeLine3D } from '../../src/geometry';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { orientEdge, makeWire } from '../../src/topology/wire';
import { makePlanarFace } from '../../src/topology/face';
import { makeShell } from '../../src/topology/shell';

import {
  makeSolid,
  solidOuterShell,
  solidInnerShells,
  solidVolume,
} from '../../src/topology/solid';

describe('Solid', () => {
  // Helper: create a rectangular face at given z
  function makeRectFace(x1: number, y1: number, x2: number, y2: number, z: number) {
    const e1 = makeEdgeFromCurve(makeLine3D(point3d(x1, y1, z), point3d(x2, y1, z)).result!).result!;
    const e2 = makeEdgeFromCurve(makeLine3D(point3d(x2, y1, z), point3d(x2, y2, z)).result!).result!;
    const e3 = makeEdgeFromCurve(makeLine3D(point3d(x2, y2, z), point3d(x1, y2, z)).result!).result!;
    const e4 = makeEdgeFromCurve(makeLine3D(point3d(x1, y2, z), point3d(x1, y1, z)).result!).result!;

    const wire = makeWire([
      orientEdge(e1, true),
      orientEdge(e2, true),
      orientEdge(e3, true),
      orientEdge(e4, true),
    ]).result!;

    return makePlanarFace(wire).result!;
  }

  // Helper: create a properly oriented box shell (watertight)
  // All faces oriented with outward normals - CCW when viewed from outside.
  function makeBoxShell(w: number, h: number, d: number) {
    // Bottom (z=0) - normal points -Z, CCW from below
    const bottomWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(w, 0, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, 0, 0), point3d(w, h, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, h, 0), point3d(0, h, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, h, 0), point3d(0, 0, 0)).result!).result!, true),
    ]).result!;
    const bottom = makePlanarFace(bottomWire).result!;

    // Top (z=d) - normal points +Z, CCW from above
    const topWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, d), point3d(0, h, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, h, d), point3d(w, h, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, h, d), point3d(w, 0, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, 0, d), point3d(0, 0, d)).result!).result!, true),
    ]).result!;
    const top = makePlanarFace(topWire).result!;

    // Front (y=0) - normal points -Y, CCW from front
    const frontWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(0, 0, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, d), point3d(w, 0, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, 0, d), point3d(w, 0, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, 0, 0), point3d(0, 0, 0)).result!).result!, true),
    ]).result!;
    const front = makePlanarFace(frontWire).result!;

    // Back (y=h) - normal points +Y, CCW from back
    const backWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, h, 0), point3d(w, h, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, h, 0), point3d(w, h, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, h, d), point3d(0, h, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, h, d), point3d(0, h, 0)).result!).result!, true),
    ]).result!;
    const back = makePlanarFace(backWire).result!;

    // Left (x=0) - normal points -X, CCW from left
    const leftWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(0, h, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, h, 0), point3d(0, h, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, h, d), point3d(0, 0, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, d), point3d(0, 0, 0)).result!).result!, true),
    ]).result!;
    const left = makePlanarFace(leftWire).result!;

    // Right (x=w) - normal points +X, CCW from right
    const rightWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, 0, 0), point3d(w, 0, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, 0, d), point3d(w, h, d)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, h, d), point3d(w, h, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(w, h, 0), point3d(w, 0, 0)).result!).result!, true),
    ]).result!;
    const right = makePlanarFace(rightWire).result!;

    return makeShell([bottom, top, front, back, left, right]).result!;
  }

  describe('makeSolid', () => {
    it('creates a solid from a shell', () => {
      const shell = makeBoxShell(1, 1, 1);
      const result = makeSolid(shell);

      expect(result.success).toBe(true);
      const solid = result.result!;
      expect(solid.outerShell).toBe(shell);
      expect(solid.innerShells).toEqual([]);
    });

    it('creates a solid with inner shells (voids)', () => {
      const outerShell = makeBoxShell(4, 4, 4);
      // Inner void (smaller box)
      const innerShell = makeBoxShell(1, 1, 1);

      const result = makeSolid(outerShell, [innerShell]);

      expect(result.success).toBe(true);
      expect(result.result!.innerShells.length).toBe(1);
    });

    it('fails if outer shell is not closed', () => {
      // Create an open shell (just one face)
      const face = makeRectFace(0, 0, 1, 1, 0);
      const openShell = makeShell([face]).result!;

      const result = makeSolid(openShell);

      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });
  });

  describe('solidOuterShell', () => {
    it('returns the outer shell', () => {
      const shell = makeBoxShell(1, 1, 1);
      const solid = makeSolid(shell).result!;

      expect(solidOuterShell(solid)).toBe(shell);
    });
  });

  describe('solidInnerShells', () => {
    it('returns empty array when no voids', () => {
      const shell = makeBoxShell(1, 1, 1);
      const solid = makeSolid(shell).result!;

      expect(solidInnerShells(solid)).toEqual([]);
    });
  });

  describe('solidVolume', () => {
    it('computes volume of unit cube', () => {
      const shell = makeBoxShell(1, 1, 1);
      const solid = makeSolid(shell).result!;

      expect(solidVolume(solid)).toBeCloseTo(1, 5);
    });

    it('computes volume of 2x3x4 box', () => {
      const shell = makeBoxShell(2, 3, 4);
      const solid = makeSolid(shell).result!;

      expect(solidVolume(solid)).toBeCloseTo(24, 5);
    });

    it('subtracts inner shell volumes', () => {
      // 4x4x4 outer, 1x1x1 inner void
      const outerShell = makeBoxShell(4, 4, 4);
      const innerShell = makeBoxShell(1, 1, 1);
      const solid = makeSolid(outerShell, [innerShell]).result!;

      // 64 - 1 = 63
      expect(solidVolume(solid)).toBeCloseTo(63, 5);
    });
  });

  describe('edge cases', () => {
    it('fails if outer shell is not closed', () => {
      // Single face is not a closed shell
      const face = makeRectFace(0, 0, 1, 1, 0);
      const openShell = makeShell([face]).result!;
      const result = makeSolid(openShell);
      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });

    it('handles solid with multiple voids', () => {
      const outerShell = makeBoxShell(10, 10, 10);
      const void1 = makeBoxShell(1, 1, 1);
      const void2 = makeBoxShell(1, 1, 1);
      const solid = makeSolid(outerShell, [void1, void2]).result!;

      // 1000 - 1 - 1 = 998
      expect(solidVolume(solid)).toBeCloseTo(998, 5);
    });

    it('handles very thin box (near-degenerate)', () => {
      const shell = makeBoxShell(1, 1, 0.001);
      const solid = makeSolid(shell).result!;
      expect(solidVolume(solid)).toBeCloseTo(0.001, 6);
    });

    it('handles large box', () => {
      const shell = makeBoxShell(100, 100, 100);
      const solid = makeSolid(shell).result!;
      expect(solidVolume(solid)).toBeCloseTo(1000000, 0);
    });
  });
});
