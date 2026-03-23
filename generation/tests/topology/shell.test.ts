import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane } from '../../src/core';
import { makeLine3D } from '../../src/geometry';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { orientEdge, makeWire } from '../../src/topology/wire';
import { makePlanarFace } from '../../src/topology/face';

import {
  makeShell,
  shellFaces,
  shellIsClosed,
} from '../../src/topology/shell';

describe('Shell', () => {
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

  // Helper: create 6 faces of a properly oriented unit box (watertight).
  // All faces are oriented with outward normals - CCW when viewed from outside.
  // Adjacent faces share edges in opposite directions.
  function makeBoxFaces() {
    // Bottom (z=0) - normal points -Z, CCW from below
    const bottomWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(1, 1, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 1, 0), point3d(0, 1, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 1, 0), point3d(0, 0, 0)).result!).result!, true),
    ]).result!;
    const bottom = makePlanarFace(bottomWire).result!;

    // Top (z=1) - normal points +Z, CCW from above
    const topWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 1), point3d(0, 1, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 1, 1), point3d(1, 1, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 1, 1), point3d(1, 0, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 0, 1), point3d(0, 0, 1)).result!).result!, true),
    ]).result!;
    const top = makePlanarFace(topWire).result!;

    // Front (y=0) - normal points -Y, CCW from front
    const frontWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(0, 0, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 1), point3d(1, 0, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 0, 1), point3d(1, 0, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(0, 0, 0)).result!).result!, true),
    ]).result!;
    const front = makePlanarFace(frontWire).result!;

    // Back (y=1) - normal points +Y, CCW from back
    const backWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 1, 0), point3d(1, 1, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 1, 0), point3d(1, 1, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 1, 1), point3d(0, 1, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 1, 1), point3d(0, 1, 0)).result!).result!, true),
    ]).result!;
    const back = makePlanarFace(backWire).result!;

    // Left (x=0) - normal points -X, CCW from left
    const leftWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(0, 1, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 1, 0), point3d(0, 1, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 1, 1), point3d(0, 0, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(0, 0, 1), point3d(0, 0, 0)).result!).result!, true),
    ]).result!;
    const left = makePlanarFace(leftWire).result!;

    // Right (x=1) - normal points +X, CCW from right
    const rightWire = makeWire([
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(1, 0, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 0, 1), point3d(1, 1, 1)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 1, 1), point3d(1, 1, 0)).result!).result!, true),
      orientEdge(makeEdgeFromCurve(makeLine3D(point3d(1, 1, 0), point3d(1, 0, 0)).result!).result!, true),
    ]).result!;
    const right = makePlanarFace(rightWire).result!;

    return [bottom, top, front, back, left, right];
  }

  describe('makeShell', () => {
    it('creates a shell from faces', () => {
      const faces = makeBoxFaces();
      const result = makeShell(faces);

      expect(result.success).toBe(true);
      expect(result.result!.faces.length).toBe(6);
    });

    it('creates a shell from a single face', () => {
      const face = makeRectFace(0, 0, 1, 1, 0);
      const result = makeShell([face]);

      expect(result.success).toBe(true);
      expect(result.result!.faces.length).toBe(1);
    });

    it('fails for empty face list', () => {
      const result = makeShell([]);

      expect(result.success).toBe(false);
    });
  });

  describe('shellFaces', () => {
    it('returns all faces', () => {
      const faces = makeBoxFaces();
      const shell = makeShell(faces).result!;

      expect(shellFaces(shell).length).toBe(6);
    });
  });

  describe('shellIsClosed', () => {
    it('returns true for 6-face box with proper edge connectivity', () => {
      const faces = makeBoxFaces();
      const shell = makeShell(faces).result!;

      // A properly constructed 6-face box should be closed
      expect(shellIsClosed(shell)).toBe(true);
    });

    it('returns false for single face', () => {
      const face = makeRectFace(0, 0, 1, 1, 0);
      const shell = makeShell([face]).result!;

      expect(shellIsClosed(shell)).toBe(false);
    });

    it('returns false for 5 faces (open box)', () => {
      const faces = makeBoxFaces().slice(0, 5); // Remove one face
      const shell = makeShell(faces).result!;

      expect(shellIsClosed(shell)).toBe(false);
    });

    it('returns false for 2 faces that share one edge', () => {
      // Two adjacent faces share one edge but have 6 boundary edges total
      const f1 = makeRectFace(0, 0, 1, 1, 0);
      const f2 = makeRectFace(1, 0, 2, 1, 0);
      const shell = makeShell([f1, f2]).result!;

      // Even though we have faces, they don't form a closed shell
      expect(shellIsClosed(shell)).toBe(false);
    });

    it('returns false for disconnected faces', () => {
      // Two faces far apart
      const f1 = makeRectFace(0, 0, 1, 1, 0);
      const f2 = makeRectFace(100, 100, 101, 101, 0);
      const shell = makeShell([f1, f2]).result!;

      expect(shellIsClosed(shell)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('fails for empty face list', () => {
      const result = makeShell([]);
      expect(result.success).toBe(false);
    });

    it('handles single face (open shell)', () => {
      const face = makeRectFace(0, 0, 1, 1, 0);
      const result = makeShell([face]);
      expect(result.success).toBe(true);
      expect(shellIsClosed(result.result!)).toBe(false);
    });

    it('handles two disconnected faces', () => {
      // Faces that don't share any edges
      const f1 = makeRectFace(0, 0, 1, 1, 0);
      const f2 = makeRectFace(10, 10, 11, 11, 5); // Far away
      const result = makeShell([f1, f2]);
      // Should succeed - shell doesn't require connectivity
      expect(result.success).toBe(true);
    });

    it('handles duplicate faces', () => {
      const face = makeRectFace(0, 0, 1, 1, 0);
      const result = makeShell([face, face]);
      // Allowing duplicates (implementation may vary)
      expect(result.success).toBe(true);
    });
  });
});
