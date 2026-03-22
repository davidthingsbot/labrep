import { describe, it, expect } from 'vitest';
import { point2d, vec2d, distance2d } from '../../src/core';
import { 
  makeCircle2D, 
  makeCircle2DThrough3Points,
  evaluateCircle2D,
  tangentCircle2D,
  lengthCircle2D,
} from '../../src/geometry/circle2d';

describe('Circle2D', () => {
  describe('construction', () => {
    it('creates circle from center and radius', () => {
      const center = point2d(1, 2);
      const result = makeCircle2D(center, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.type).toBe('circle');
        expect(result.result.center.x).toBeCloseTo(1);
        expect(result.result.center.y).toBeCloseTo(2);
        expect(result.result.radius).toBeCloseTo(5);
      }
    });

    it('fails for zero radius', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative radius', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, -5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('creates circle through three points', () => {
      // Points on a circle centered at (0,0) with radius 1
      const p1 = point2d(1, 0);
      const p2 = point2d(0, 1);
      const p3 = point2d(-1, 0);
      
      const result = makeCircle2DThrough3Points(p1, p2, p3);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.center.x).toBeCloseTo(0);
        expect(result.result.center.y).toBeCloseTo(0);
        expect(result.result.radius).toBeCloseTo(1);
      }
    });

    it('creates circle through three arbitrary points', () => {
      // Points on circle centered at (2, 3) with radius 5
      // (2 + 5, 3) = (7, 3)
      // (2, 3 + 5) = (2, 8)
      // (2 - 5, 3) = (-3, 3)
      const p1 = point2d(7, 3);
      const p2 = point2d(2, 8);
      const p3 = point2d(-3, 3);
      
      const result = makeCircle2DThrough3Points(p1, p2, p3);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.center.x).toBeCloseTo(2);
        expect(result.result.center.y).toBeCloseTo(3);
        expect(result.result.radius).toBeCloseTo(5);
      }
    });

    it('fails for collinear points', () => {
      const p1 = point2d(0, 0);
      const p2 = point2d(1, 1);
      const p3 = point2d(2, 2);
      
      const result = makeCircle2DThrough3Points(p1, p2, p3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('collinear');
    });

    it('fails for coincident points', () => {
      const p = point2d(1, 1);
      
      const result = makeCircle2DThrough3Points(p, p, point2d(2, 2));

      expect(result.success).toBe(false);
    });
  });

  describe('evaluation', () => {
    it('evaluate at 0 returns point at (center.x + radius, center.y)', () => {
      const center = point2d(1, 2);
      const result = makeCircle2D(center, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        const p = evaluateCircle2D(result.result, 0);
        expect(p.x).toBeCloseTo(4);  // 1 + 3
        expect(p.y).toBeCloseTo(2);
      }
    });

    it('evaluate at π/2 returns point at (center.x, center.y + radius)', () => {
      const center = point2d(1, 2);
      const result = makeCircle2D(center, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        const p = evaluateCircle2D(result.result, Math.PI / 2);
        expect(p.x).toBeCloseTo(1);
        expect(p.y).toBeCloseTo(5);  // 2 + 3
      }
    });

    it('evaluate at π returns point at (center.x - radius, center.y)', () => {
      const center = point2d(1, 2);
      const result = makeCircle2D(center, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        const p = evaluateCircle2D(result.result, Math.PI);
        expect(p.x).toBeCloseTo(-2);  // 1 - 3
        expect(p.y).toBeCloseTo(2);
      }
    });

    it('evaluate at 2π returns same as evaluate at 0', () => {
      const center = point2d(1, 2);
      const result = makeCircle2D(center, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        const p0 = evaluateCircle2D(result.result, 0);
        const p2pi = evaluateCircle2D(result.result, 2 * Math.PI);
        expect(p2pi.x).toBeCloseTo(p0.x);
        expect(p2pi.y).toBeCloseTo(p0.y);
      }
    });

    it('all evaluated points are at radius distance from center', () => {
      const center = point2d(1, 2);
      const radius = 3;
      const result = makeCircle2D(center, radius);

      expect(result.success).toBe(true);
      if (result.success) {
        for (let t = 0; t < 2 * Math.PI; t += Math.PI / 6) {
          const p = evaluateCircle2D(result.result, t);
          const dist = distance2d(center, p);
          expect(dist).toBeCloseTo(radius);
        }
      }
    });
  });

  describe('tangent', () => {
    it('tangent at 0 points in +Y direction', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        const t = tangentCircle2D(result.result, 0);
        expect(t.x).toBeCloseTo(0);
        expect(t.y).toBeCloseTo(1);
      }
    });

    it('tangent at π/2 points in -X direction', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        const t = tangentCircle2D(result.result, Math.PI / 2);
        expect(t.x).toBeCloseTo(-1);
        expect(t.y).toBeCloseTo(0);
      }
    });

    it('tangent is perpendicular to radius vector', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        for (let t = 0; t < 2 * Math.PI; t += Math.PI / 6) {
          const p = evaluateCircle2D(result.result, t);
          const tangent = tangentCircle2D(result.result, t);
          
          // Radius vector from center to point
          const rx = p.x - center.x;
          const ry = p.y - center.y;
          
          // Dot product should be zero (perpendicular)
          const dot = rx * tangent.x + ry * tangent.y;
          expect(dot).toBeCloseTo(0);
        }
      }
    });

    it('tangent has unit length', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        for (let t = 0; t < 2 * Math.PI; t += Math.PI / 4) {
          const tangent = tangentCircle2D(result.result, t);
          const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
          expect(len).toBeCloseTo(1);
        }
      }
    });
  });

  describe('length', () => {
    it('length is 2πr', () => {
      const center = point2d(0, 0);
      const radius = 5;
      const result = makeCircle2D(center, radius);

      expect(result.success).toBe(true);
      if (result.success) {
        const len = lengthCircle2D(result.result);
        expect(len).toBeCloseTo(2 * Math.PI * radius);
      }
    });

    it('unit circle has length 2π', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        const len = lengthCircle2D(result.result);
        expect(len).toBeCloseTo(2 * Math.PI);
      }
    });
  });

  describe('properties', () => {
    it('isClosed is true', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.isClosed).toBe(true);
      }
    });

    it('startParam is 0', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.startParam).toBe(0);
      }
    });

    it('endParam is 2π', () => {
      const center = point2d(0, 0);
      const result = makeCircle2D(center, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.endParam).toBeCloseTo(2 * Math.PI);
      }
    });

    it('startPoint equals endPoint (closed)', () => {
      const center = point2d(1, 2);
      const result = makeCircle2D(center, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        const circle = result.result;
        expect(circle.startPoint.x).toBeCloseTo(circle.endPoint.x);
        expect(circle.startPoint.y).toBeCloseTo(circle.endPoint.y);
      }
    });
  });
});
