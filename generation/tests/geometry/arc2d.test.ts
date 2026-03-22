import { describe, it, expect } from 'vitest';
import { point2d, distance2d } from '../../src/core';
import { 
  makeArc2D, 
  makeArc2DThrough3Points,
  makeArc2DFromBulge,
  evaluateArc2D,
  tangentArc2D,
  lengthArc2D,
  reverseArc2D,
} from '../../src/geometry/arc2d';

// Note: lengthArc2D already imported above

describe('Arc2D', () => {
  describe('construction from center, radius, angles', () => {
    it('creates arc from center, radius, and angles', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, 0, Math.PI / 2);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.type).toBe('arc');
        expect(result.result.center.x).toBeCloseTo(0);
        expect(result.result.center.y).toBeCloseTo(0);
        expect(result.result.radius).toBeCloseTo(1);
        expect(result.result.startAngle).toBeCloseTo(0);
        expect(result.result.endAngle).toBeCloseTo(Math.PI / 2);
      }
    });

    it('fails for zero radius', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 0, 0, Math.PI);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for negative radius', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, -1, 0, Math.PI);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('fails for equal start and end angles', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, Math.PI, Math.PI);

      expect(result.success).toBe(false);
      expect(result.error).toContain('different');
    });

    it('handles angles greater than 2π (preserves raw angles)', () => {
      const center = point2d(0, 0);
      // 3π: arc goes 1.5 times around, not normalized
      const result = makeArc2D(center, 1, 0, 3 * Math.PI);

      expect(result.success).toBe(true);
      if (result.success) {
        // Raw angles preserved (sweep matters for length)
        expect(result.result.endAngle).toBeCloseTo(3 * Math.PI);
        // Length is 3π * r = 3π
        expect(lengthArc2D(result.result)).toBeCloseTo(3 * Math.PI);
      }
    });
  });

  describe('construction through 3 points', () => {
    it('creates arc through three points', () => {
      // Quarter circle: (1,0) -> (√2/2, √2/2) -> (0,1)
      const p1 = point2d(1, 0);
      const p2 = point2d(Math.SQRT2 / 2, Math.SQRT2 / 2);
      const p3 = point2d(0, 1);
      
      const result = makeArc2DThrough3Points(p1, p2, p3);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.center.x).toBeCloseTo(0);
        expect(result.result.center.y).toBeCloseTo(0);
        expect(result.result.radius).toBeCloseTo(1);
      }
    });

    it('fails for collinear points', () => {
      const p1 = point2d(0, 0);
      const p2 = point2d(1, 1);
      const p3 = point2d(2, 2);
      
      const result = makeArc2DThrough3Points(p1, p2, p3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('collinear');
    });

    it('fails for coincident points', () => {
      const p = point2d(1, 1);
      
      const result = makeArc2DThrough3Points(p, p, point2d(2, 2));

      expect(result.success).toBe(false);
    });

    it('start point is first point, end point is third point', () => {
      const p1 = point2d(1, 0);
      const p2 = point2d(0, 1);
      const p3 = point2d(-1, 0);
      
      const result = makeArc2DThrough3Points(p1, p2, p3);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.startPoint.x).toBeCloseTo(1);
        expect(result.result.startPoint.y).toBeCloseTo(0);
        expect(result.result.endPoint.x).toBeCloseTo(-1);
        expect(result.result.endPoint.y).toBeCloseTo(0);
      }
    });
  });

  describe('construction from bulge', () => {
    it('creates arc from start, end, and bulge factor', () => {
      // Bulge = tan(angle/4), so bulge = 1 means angle = π (semicircle)
      const start = point2d(1, 0);
      const end = point2d(-1, 0);
      const bulge = 1; // semicircle
      
      const result = makeArc2DFromBulge(start, end, bulge);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.center.x).toBeCloseTo(0);
        expect(result.result.center.y).toBeCloseTo(0);
        expect(result.result.radius).toBeCloseTo(1);
      }
    });

    it('positive bulge curves counter-clockwise', () => {
      const start = point2d(1, 0);
      const end = point2d(0, 1);
      const bulge = Math.tan(Math.PI / 8); // quarter circle
      
      const result = makeArc2DFromBulge(start, end, bulge);

      expect(result.success).toBe(true);
      if (result.success) {
        // Arc should pass through points above the chord
        const mid = evaluateArc2D(result.result, (result.result.startAngle + result.result.endAngle) / 2);
        // For CCW quarter arc, midpoint is further from origin than chord midpoint
        const distFromOrigin = Math.sqrt(mid.x * mid.x + mid.y * mid.y);
        expect(distFromOrigin).toBeCloseTo(1); // On unit circle
      }
    });

    it('negative bulge curves clockwise', () => {
      const start = point2d(1, 0);
      const end = point2d(-1, 0);
      const bulge = -1; // semicircle, clockwise (below x-axis)
      
      const result = makeArc2DFromBulge(start, end, bulge);

      expect(result.success).toBe(true);
      if (result.success) {
        // Arc should be in the negative y region
        const mid = evaluateArc2D(result.result, (result.result.startAngle + result.result.endAngle) / 2);
        expect(mid.y).toBeLessThan(0);
      }
    });

    it('fails for zero bulge (straight line)', () => {
      const start = point2d(0, 0);
      const end = point2d(1, 0);
      
      const result = makeArc2DFromBulge(start, end, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('zero');
    });

    it('fails for coincident points', () => {
      const p = point2d(1, 1);
      
      const result = makeArc2DFromBulge(p, p, 0.5);

      expect(result.success).toBe(false);
    });
  });

  describe('evaluation', () => {
    it('evaluate at startAngle returns startPoint', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, 0, Math.PI / 2);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        const p = evaluateArc2D(arc, arc.startAngle);
        expect(p.x).toBeCloseTo(arc.startPoint.x);
        expect(p.y).toBeCloseTo(arc.startPoint.y);
      }
    });

    it('evaluate at endAngle returns endPoint', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, 0, Math.PI / 2);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        const p = evaluateArc2D(arc, arc.endAngle);
        expect(p.x).toBeCloseTo(arc.endPoint.x);
        expect(p.y).toBeCloseTo(arc.endPoint.y);
      }
    });

    it('all evaluated points are at radius distance from center', () => {
      const center = point2d(1, 2);
      const radius = 3;
      const result = makeArc2D(center, radius, Math.PI / 4, 3 * Math.PI / 4);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        const steps = 10;
        const angleRange = arc.endAngle - arc.startAngle;
        
        for (let i = 0; i <= steps; i++) {
          const t = arc.startAngle + (i / steps) * angleRange;
          const p = evaluateArc2D(arc, t);
          const dist = distance2d(center, p);
          expect(dist).toBeCloseTo(radius);
        }
      }
    });
  });

  describe('tangent', () => {
    it('tangent at start of quarter arc points upward', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, 0, Math.PI / 2);

      expect(result.success).toBe(true);
      if (result.success) {
        const t = tangentArc2D(result.result, 0);
        expect(t.x).toBeCloseTo(0);
        expect(t.y).toBeCloseTo(1);
      }
    });

    it('tangent is perpendicular to radius', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 5, Math.PI / 6, 5 * Math.PI / 6);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        const steps = 5;
        const angleRange = arc.endAngle - arc.startAngle;
        
        for (let i = 0; i <= steps; i++) {
          const t = arc.startAngle + (i / steps) * angleRange;
          const p = evaluateArc2D(arc, t);
          const tangent = tangentArc2D(arc, t);
          
          // Radius vector from center to point
          const rx = p.x - center.x;
          const ry = p.y - center.y;
          
          // Dot product should be zero
          const dot = rx * tangent.x + ry * tangent.y;
          expect(dot).toBeCloseTo(0);
        }
      }
    });

    it('tangent has unit length', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 3, 0, Math.PI);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        for (let t = arc.startAngle; t <= arc.endAngle; t += Math.PI / 6) {
          const tangent = tangentArc2D(arc, t);
          const len = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
          expect(len).toBeCloseTo(1);
        }
      }
    });
  });

  describe('length', () => {
    it('quarter circle has length πr/2', () => {
      const center = point2d(0, 0);
      const radius = 2;
      const result = makeArc2D(center, radius, 0, Math.PI / 2);

      expect(result.success).toBe(true);
      if (result.success) {
        const len = lengthArc2D(result.result);
        expect(len).toBeCloseTo(Math.PI * radius / 2);
      }
    });

    it('semicircle has length πr', () => {
      const center = point2d(0, 0);
      const radius = 3;
      const result = makeArc2D(center, radius, 0, Math.PI);

      expect(result.success).toBe(true);
      if (result.success) {
        const len = lengthArc2D(result.result);
        expect(len).toBeCloseTo(Math.PI * radius);
      }
    });

    it('length equals |angle| * radius', () => {
      const center = point2d(1, 2);
      const radius = 4;
      const startAngle = Math.PI / 6;
      const endAngle = 2 * Math.PI / 3;
      const result = makeArc2D(center, radius, startAngle, endAngle);

      expect(result.success).toBe(true);
      if (result.success) {
        const len = lengthArc2D(result.result);
        const expectedLen = Math.abs(endAngle - startAngle) * radius;
        expect(len).toBeCloseTo(expectedLen);
      }
    });
  });

  describe('reverse', () => {
    it('reversed arc has swapped start/end angles', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, Math.PI / 4, 3 * Math.PI / 4);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        const reversed = reverseArc2D(arc);

        expect(reversed.startAngle).toBeCloseTo(arc.endAngle);
        expect(reversed.endAngle).toBeCloseTo(arc.startAngle);
      }
    });

    it('reversed arc has swapped start/end points', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, 0, Math.PI / 2);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        const reversed = reverseArc2D(arc);

        expect(reversed.startPoint.x).toBeCloseTo(arc.endPoint.x);
        expect(reversed.startPoint.y).toBeCloseTo(arc.endPoint.y);
        expect(reversed.endPoint.x).toBeCloseTo(arc.startPoint.x);
        expect(reversed.endPoint.y).toBeCloseTo(arc.startPoint.y);
      }
    });

    it('reversed arc has same length', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 2, Math.PI / 3, Math.PI);

      expect(result.success).toBe(true);
      if (result.success) {
        const arc = result.result;
        const reversed = reverseArc2D(arc);

        expect(lengthArc2D(reversed)).toBeCloseTo(lengthArc2D(arc));
      }
    });
  });

  describe('properties', () => {
    it('isClosed is false', () => {
      const center = point2d(0, 0);
      const result = makeArc2D(center, 1, 0, Math.PI);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.isClosed).toBe(false);
      }
    });

    it('startParam equals startAngle', () => {
      const center = point2d(0, 0);
      const startAngle = Math.PI / 4;
      const result = makeArc2D(center, 1, startAngle, Math.PI);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.startParam).toBeCloseTo(startAngle);
      }
    });

    it('endParam equals endAngle', () => {
      const center = point2d(0, 0);
      const endAngle = 3 * Math.PI / 4;
      const result = makeArc2D(center, 1, 0, endAngle);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.endParam).toBeCloseTo(endAngle);
      }
    });
  });
});
