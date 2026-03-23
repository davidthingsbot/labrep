import { describe, it, expect } from 'vitest';
import { point3d, XY_PLANE } from '../../src/core';
import { makeLine3D, makeArc3D, makeCircle3D } from '../../src/geometry';
import { makeEdgeFromCurve } from '../../src/topology/edge';

import {
  orientEdge,
  reverseOrientedEdge,
  makeWire,
  makeWireFromEdges,
  wireLength,
  wireStartPoint,
  wireEndPoint,
} from '../../src/topology/wire';

describe('Wire', () => {
  describe('orientEdge', () => {
    it('creates forward oriented edge', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;

      const oe = orientEdge(edge, true);

      expect(oe.edge).toBe(edge);
      expect(oe.forward).toBe(true);
    });

    it('creates reversed oriented edge', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;

      const oe = orientEdge(edge, false);

      expect(oe.edge).toBe(edge);
      expect(oe.forward).toBe(false);
    });
  });

  describe('reverseOrientedEdge', () => {
    it('flips forward to reversed', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      const oe = orientEdge(edge, true);

      const reversed = reverseOrientedEdge(oe);

      expect(reversed.edge).toBe(edge);
      expect(reversed.forward).toBe(false);
    });

    it('flips reversed to forward', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      const oe = orientEdge(edge, false);

      const reversed = reverseOrientedEdge(oe);

      expect(reversed.forward).toBe(true);
    });
  });

  describe('makeWire', () => {
    it('creates a wire from connected oriented edges', () => {
      // Triangle
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(0.5, 1, 0)).result!).result!;
      const e3 = makeEdgeFromCurve(makeLine3D(point3d(0.5, 1, 0), point3d(0, 0, 0)).result!).result!;

      const oe1 = orientEdge(e1, true);
      const oe2 = orientEdge(e2, true);
      const oe3 = orientEdge(e3, true);

      const result = makeWire([oe1, oe2, oe3]);

      expect(result.success).toBe(true);
      const wire = result.result!;
      expect(wire.edges.length).toBe(3);
      expect(wire.isClosed).toBe(true);
    });

    it('creates an open wire', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(2, 1, 0)).result!).result!;

      const result = makeWire([orientEdge(e1, true), orientEdge(e2, true)]);

      expect(result.success).toBe(true);
      expect(result.result!.isClosed).toBe(false);
    });

    it('fails if edges do not connect', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(5, 5, 5), point3d(6, 6, 6)).result!).result!;

      const result = makeWire([orientEdge(e1, true), orientEdge(e2, true)]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('connect');
    });

    it('handles reversed edges', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      // e2 goes the "wrong way" but we reverse it
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(2, 1, 0), point3d(1, 0, 0)).result!).result!;

      // e1 forward: 0,0,0 -> 1,0,0
      // e2 reversed: 1,0,0 -> 2,1,0
      const result = makeWire([orientEdge(e1, true), orientEdge(e2, false)]);

      expect(result.success).toBe(true);
    });

    it('creates wire from single closed edge (circle)', () => {
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      const edge = makeEdgeFromCurve(circle).result!;

      const result = makeWire([orientEdge(edge, true)]);

      expect(result.success).toBe(true);
      expect(result.result!.isClosed).toBe(true);
    });

    it('fails for empty edge list', () => {
      const result = makeWire([]);

      expect(result.success).toBe(false);
    });
  });

  describe('makeWireFromEdges', () => {
    it('auto-orients edges to form a connected wire', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(1, 1, 0)).result!).result!;
      const e3 = makeEdgeFromCurve(makeLine3D(point3d(1, 1, 0), point3d(0, 0, 0)).result!).result!;

      const result = makeWireFromEdges([e1, e2, e3]);

      expect(result.success).toBe(true);
      expect(result.result!.isClosed).toBe(true);
    });

    it('auto-reverses edges as needed', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      // e2 is "backwards"
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(2, 0, 0), point3d(1, 0, 0)).result!).result!;

      const result = makeWireFromEdges([e1, e2]);

      expect(result.success).toBe(true);
      // e2 should be reversed
      expect(result.result!.edges[1].forward).toBe(false);
    });

    it('fails if edges cannot be connected', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(10, 10, 10), point3d(11, 11, 11)).result!).result!;

      const result = makeWireFromEdges([e1, e2]);

      expect(result.success).toBe(false);
    });
  });

  describe('wireLength', () => {
    it('sums edge lengths', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(3, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(3, 0, 0), point3d(3, 4, 0)).result!).result!;

      const wire = makeWire([orientEdge(e1, true), orientEdge(e2, true)]).result!;

      expect(wireLength(wire)).toBeCloseTo(7, 10); // 3 + 4
    });
  });

  describe('wireStartPoint', () => {
    it('returns start of first edge (forward)', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(1, 2, 3), point3d(4, 5, 6)).result!).result!;
      const wire = makeWire([orientEdge(e1, true)]).result!;

      expect(wireStartPoint(wire)).toEqual(point3d(1, 2, 3));
    });

    it('returns end of first edge (reversed)', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(1, 2, 3), point3d(4, 5, 6)).result!).result!;
      const wire = makeWire([orientEdge(e1, false)]).result!;

      expect(wireStartPoint(wire)).toEqual(point3d(4, 5, 6));
    });
  });

  describe('wireEndPoint', () => {
    it('returns end of last edge (forward)', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(1, 1, 0)).result!).result!;
      const wire = makeWire([orientEdge(e1, true), orientEdge(e2, true)]).result!;

      expect(wireEndPoint(wire)).toEqual(point3d(1, 1, 0));
    });
  });

  describe('edge cases', () => {
    it('handles single-edge wire', () => {
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const result = makeWire([orientEdge(e1, true)]);
      expect(result.success).toBe(true);
      expect(result.result!.edges.length).toBe(1);
      expect(result.result!.isClosed).toBe(false);
    });

    it('fails for empty edge list', () => {
      const result = makeWire([]);
      expect(result.success).toBe(false);
    });

    it('detects closed single-edge loop', () => {
      // A circular edge that closes on itself
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      const edge = makeEdgeFromCurve(circle).result!;
      const result = makeWire([orientEdge(edge, true)]);
      expect(result.success).toBe(true);
      expect(result.result!.isClosed).toBe(true);
    });

    it('handles edges connected with tolerance', () => {
      // Edges that almost connect (within tolerance)
      const e1 = makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!;
      const e2 = makeEdgeFromCurve(makeLine3D(point3d(1 + 1e-9, 0, 0), point3d(2, 0, 0)).result!).result!;
      const result = makeWire([orientEdge(e1, true), orientEdge(e2, true)]);
      // Should succeed if within tolerance
      expect(result.success).toBe(true);
    });
  });
});
