import { describe, it, expect } from 'vitest';
import { point3d, vec3d, XY_PLANE, TOLERANCE } from '../../src/core';
import { makeLine3D, makeCircle3D, makeArc3D } from '../../src/geometry';
import { makeVertex } from '../../src/topology/vertex';

import {
  makeEdge,
  makeEdgeFromCurve,
  edgeStartPoint,
  edgeEndPoint,
  edgeLength,
  addPCurveToEdge,
} from '../../src/topology/edge';
import { makePCurve } from '../../src/topology/pcurve';
import { makeLine2D } from '../../src/geometry';
import { makePlaneSurface } from '../../src/surfaces';

describe('Edge', () => {
  describe('makeEdge', () => {
    it('creates an edge from line and vertices', () => {
      const start = point3d(0, 0, 0);
      const end = point3d(3, 4, 0);
      const line = makeLine3D(start, end).result!;
      const v1 = makeVertex(start);
      const v2 = makeVertex(end);

      const result = makeEdge(line, v1, v2);

      expect(result.success).toBe(true);
      const edge = result.result!;
      expect(edge.curve).toBe(line);
      expect(edge.startVertex).toBe(v1);
      expect(edge.endVertex).toBe(v2);
    });

    it('creates an edge from arc and vertices', () => {
      const arc = makeArc3D(XY_PLANE, 2, 0, Math.PI / 2).result!;
      const v1 = makeVertex(arc.startPoint);
      const v2 = makeVertex(arc.endPoint);

      const result = makeEdge(arc, v1, v2);

      expect(result.success).toBe(true);
    });

    it('fails if start vertex does not match curve start', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const v1 = makeVertex(point3d(0.5, 0, 0)); // Wrong!
      const v2 = makeVertex(point3d(1, 0, 0));

      const result = makeEdge(line, v1, v2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('start');
    });

    it('fails if end vertex does not match curve end', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const v1 = makeVertex(point3d(0, 0, 0));
      const v2 = makeVertex(point3d(2, 0, 0)); // Wrong!

      const result = makeEdge(line, v1, v2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('end');
    });

    it('accepts vertices within tolerance', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const v1 = makeVertex(point3d(TOLERANCE * 0.5, 0, 0)); // Close enough
      const v2 = makeVertex(point3d(1 - TOLERANCE * 0.5, 0, 0)); // Close enough

      const result = makeEdge(line, v1, v2);

      expect(result.success).toBe(true);
    });

    it('sets correct parameter range', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0)).result!;
      const v1 = makeVertex(line.startPoint);
      const v2 = makeVertex(line.endPoint);

      const edge = makeEdge(line, v1, v2).result!;

      expect(edge.startParam).toBe(0);
      expect(edge.endParam).toBeCloseTo(5, 10);
    });
  });

  describe('makeEdgeFromCurve', () => {
    it('auto-creates vertices from curve endpoints', () => {
      const line = makeLine3D(point3d(1, 2, 3), point3d(4, 5, 6)).result!;
      const result = makeEdgeFromCurve(line);

      expect(result.success).toBe(true);
      const edge = result.result!;

      expect(edge.startVertex.point).toEqual(line.startPoint);
      expect(edge.endVertex.point).toEqual(line.endPoint);
    });

    it('works with arc', () => {
      const arc = makeArc3D(XY_PLANE, 1, 0, Math.PI).result!;
      const result = makeEdgeFromCurve(arc);

      expect(result.success).toBe(true);
      expect(result.result!.startVertex.point).toEqual(arc.startPoint);
      expect(result.result!.endVertex.point).toEqual(arc.endPoint);
    });

    it('creates same start/end vertex for closed curve', () => {
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      const result = makeEdgeFromCurve(circle);

      expect(result.success).toBe(true);
      const edge = result.result!;

      // For closed curve, startVertex and endVertex should be the same object
      expect(edge.startVertex).toBe(edge.endVertex);
    });
  });

  describe('edgeStartPoint', () => {
    it('returns start vertex point', () => {
      const line = makeLine3D(point3d(1, 2, 3), point3d(4, 5, 6)).result!;
      const edge = makeEdgeFromCurve(line).result!;

      expect(edgeStartPoint(edge)).toEqual(point3d(1, 2, 3));
    });
  });

  describe('edgeEndPoint', () => {
    it('returns end vertex point', () => {
      const line = makeLine3D(point3d(1, 2, 3), point3d(4, 5, 6)).result!;
      const edge = makeEdgeFromCurve(line).result!;

      expect(edgeEndPoint(edge)).toEqual(point3d(4, 5, 6));
    });
  });

  describe('edgeLength', () => {
    it('returns line length', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;

      expect(edgeLength(edge)).toBeCloseTo(5, 10);
    });

    it('returns arc length', () => {
      const arc = makeArc3D(XY_PLANE, 2, 0, Math.PI / 2).result!;
      const edge = makeEdgeFromCurve(arc).result!;

      // Arc length = r * θ = 2 * π/2 = π
      expect(edgeLength(edge)).toBeCloseTo(Math.PI, 10);
    });

    it('returns circle circumference', () => {
      const circle = makeCircle3D(XY_PLANE, 1).result!;
      const edge = makeEdgeFromCurve(circle).result!;

      expect(edgeLength(edge)).toBeCloseTo(2 * Math.PI, 10);
    });
  });

  describe('pcurves', () => {
    it('makeEdge creates edge with empty pcurves', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const v1 = makeVertex(point3d(0, 0, 0));
      const v2 = makeVertex(point3d(1, 0, 0));
      const edge = makeEdge(line, v1, v2).result!;
      expect(edge.pcurves).toEqual([]);
    });

    it('makeEdgeFromCurve creates edge with empty pcurves', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      expect(edge.pcurves).toEqual([]);
    });

    it('addPCurveToEdge appends a PCurve', () => {
      const line3d = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line3d).result!;

      const surface = makePlaneSurface(XY_PLANE);
      const line2d = makeLine2D({ x: 0, y: 0 }, { x: 1, y: 0 }).result!;
      const pcurve = makePCurve(line2d, surface);

      const edgeWithPC = addPCurveToEdge(edge, pcurve);
      expect(edgeWithPC.pcurves).toHaveLength(1);
      expect(edgeWithPC.pcurves[0]).toBe(pcurve);
      // Original edge unchanged
      expect(edge.pcurves).toHaveLength(0);
    });

    it('addPCurveToEdge can add multiple PCurves', () => {
      const line3d = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line3d).result!;

      const surface = makePlaneSurface(XY_PLANE);
      const line2d = makeLine2D({ x: 0, y: 0 }, { x: 1, y: 0 }).result!;
      const pc1 = makePCurve(line2d, surface);
      const pc2 = makePCurve(line2d, surface);

      const edge1 = addPCurveToEdge(edge, pc1);
      const edge2 = addPCurveToEdge(edge1, pc2);
      expect(edge2.pcurves).toHaveLength(2);
      expect(edge2.pcurves[0]).toBe(pc1);
      expect(edge2.pcurves[1]).toBe(pc2);
    });

    it('addPCurveToEdge preserves all other edge fields', () => {
      const line3d = makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line3d).result!;

      const surface = makePlaneSurface(XY_PLANE);
      const line2d = makeLine2D({ x: 0, y: 0 }, { x: 1, y: 0 }).result!;
      const pcurve = makePCurve(line2d, surface);

      const edgeWithPC = addPCurveToEdge(edge, pcurve);
      expect(edgeWithPC.curve).toBe(edge.curve);
      expect(edgeWithPC.startVertex).toBe(edge.startVertex);
      expect(edgeWithPC.endVertex).toBe(edge.endVertex);
      expect(edgeWithPC.startParam).toBe(edge.startParam);
      expect(edgeWithPC.endParam).toBe(edge.endParam);
    });
  });
});
