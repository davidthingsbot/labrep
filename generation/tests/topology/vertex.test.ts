import { describe, it, expect } from 'vitest';
import { point3d, ORIGIN, pointsEqual } from '../../src/core';

import { makeVertex, vertexPoint } from '../../src/topology/vertex';

describe('Vertex', () => {
  describe('makeVertex', () => {
    it('creates a vertex from a point', () => {
      const pt = point3d(1, 2, 3);
      const vertex = makeVertex(pt);

      expect(vertex.point).toEqual(pt);
    });

    it('creates a vertex at origin', () => {
      const vertex = makeVertex(ORIGIN);

      expect(vertex.point).toEqual(ORIGIN);
    });

    it('preserves exact coordinates', () => {
      const pt = point3d(1.23456789, -9.87654321, 0.00000001);
      const vertex = makeVertex(pt);

      expect(vertex.point.x).toBe(1.23456789);
      expect(vertex.point.y).toBe(-9.87654321);
      expect(vertex.point.z).toBe(0.00000001);
    });
  });

  describe('vertexPoint', () => {
    it('returns the vertex point', () => {
      const pt = point3d(5, 6, 7);
      const vertex = makeVertex(pt);

      expect(vertexPoint(vertex)).toEqual(pt);
    });
  });

  describe('vertex equality', () => {
    it('two vertices at same point are equal by point comparison', () => {
      const v1 = makeVertex(point3d(1, 2, 3));
      const v2 = makeVertex(point3d(1, 2, 3));

      expect(pointsEqual(v1.point, v2.point)).toBe(true);
    });

    it('two vertices at different points are not equal', () => {
      const v1 = makeVertex(point3d(1, 2, 3));
      const v2 = makeVertex(point3d(4, 5, 6));

      expect(pointsEqual(v1.point, v2.point)).toBe(false);
    });
  });
});
