import { describe, it, expect } from 'vitest';
import { point2d } from '../../src/core';
import { makeLine2D } from '../../src/geometry/line2d';
import { makeCircle2D } from '../../src/geometry/circle2d';
import { 
  intersectLine2DLine2D,
  intersectLine2DCircle2D,
  intersectCircle2DCircle2D,
} from '../../src/geometry/intersections2d';

describe('Intersections2D', () => {
  describe('line-line intersection', () => {
    it('finds intersection of two crossing lines', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(2, 2));
      const line2 = makeLine2D(point2d(0, 2), point2d(2, 0));
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const intersections = intersectLine2DLine2D(line1.result, line2.result);
        
        expect(intersections.length).toBe(1);
        expect(intersections[0].point.x).toBeCloseTo(1);
        expect(intersections[0].point.y).toBeCloseTo(1);
      }
    });

    it('finds intersection at origin', () => {
      const line1 = makeLine2D(point2d(-1, 0), point2d(1, 0)); // horizontal
      const line2 = makeLine2D(point2d(0, -1), point2d(0, 1)); // vertical
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const intersections = intersectLine2DLine2D(line1.result, line2.result);
        
        expect(intersections.length).toBe(1);
        expect(intersections[0].point.x).toBeCloseTo(0);
        expect(intersections[0].point.y).toBeCloseTo(0);
      }
    });

    it('returns empty for parallel lines', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 0)); // y = 0
      const line2 = makeLine2D(point2d(0, 1), point2d(1, 1)); // y = 1
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const intersections = intersectLine2DLine2D(line1.result, line2.result);
        expect(intersections.length).toBe(0);
      }
    });

    it('returns empty for coincident lines (special case)', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 1));
      const line2 = makeLine2D(point2d(2, 2), point2d(3, 3));
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const intersections = intersectLine2DLine2D(line1.result, line2.result);
        // Coincident lines: infinite intersections, return empty
        expect(intersections.length).toBe(0);
      }
    });

    it('provides correct parameter values', () => {
      // Line1: (0,0) to (4,0), length 4
      // Line2: (2,-2) to (2,2), length 4
      // Intersection at (2,0)
      const line1 = makeLine2D(point2d(0, 0), point2d(4, 0));
      const line2 = makeLine2D(point2d(2, -2), point2d(2, 2));
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const intersections = intersectLine2DLine2D(line1.result, line2.result);
        
        expect(intersections.length).toBe(1);
        // On line1: t=2 (midpoint of 0 to 4)
        expect(intersections[0].paramOnCurve1).toBeCloseTo(2);
        // On line2: t=2 (midpoint of length 4)
        expect(intersections[0].paramOnCurve2).toBeCloseTo(2);
      }
    });

    it('finds intersection outside segment bounds (extrapolation)', () => {
      // Lines that would intersect if extended
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 0)); // length 1
      const line2 = makeLine2D(point2d(5, -1), point2d(5, 1)); // vertical at x=5
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const intersections = intersectLine2DLine2D(line1.result, line2.result);
        
        // Lines intersect at (5, 0), outside line1's segment [0,1]
        expect(intersections.length).toBe(1);
        expect(intersections[0].point.x).toBeCloseTo(5);
        expect(intersections[0].paramOnCurve1).toBeCloseTo(5); // beyond end
      }
    });
  });

  describe('line-circle intersection', () => {
    it('finds two intersections for secant line', () => {
      const line = makeLine2D(point2d(-2, 0), point2d(2, 0));
      const circle = makeCircle2D(point2d(0, 0), 1);
      
      expect(line.success && circle.success).toBe(true);
      if (line.success && circle.success) {
        const intersections = intersectLine2DCircle2D(line.result, circle.result);
        
        expect(intersections.length).toBe(2);
        
        // Points should be at (-1, 0) and (1, 0)
        const xs = intersections.map(i => i.point.x).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(-1);
        expect(xs[1]).toBeCloseTo(1);
      }
    });

    it('finds one intersection for tangent line', () => {
      // Line tangent to unit circle at (1, 0)
      const line = makeLine2D(point2d(1, -1), point2d(1, 1));
      const circle = makeCircle2D(point2d(0, 0), 1);
      
      expect(line.success && circle.success).toBe(true);
      if (line.success && circle.success) {
        const intersections = intersectLine2DCircle2D(line.result, circle.result);
        
        expect(intersections.length).toBe(1);
        expect(intersections[0].point.x).toBeCloseTo(1);
        expect(intersections[0].point.y).toBeCloseTo(0);
      }
    });

    it('returns empty when line misses circle', () => {
      const line = makeLine2D(point2d(2, 0), point2d(2, 1)); // x = 2, misses unit circle
      const circle = makeCircle2D(point2d(0, 0), 1);
      
      expect(line.success && circle.success).toBe(true);
      if (line.success && circle.success) {
        const intersections = intersectLine2DCircle2D(line.result, circle.result);
        expect(intersections.length).toBe(0);
      }
    });

    it('finds intersections for diagonal line through circle', () => {
      const line = makeLine2D(point2d(-2, -2), point2d(2, 2));
      const circle = makeCircle2D(point2d(0, 0), 1);
      
      expect(line.success && circle.success).toBe(true);
      if (line.success && circle.success) {
        const intersections = intersectLine2DCircle2D(line.result, circle.result);
        
        expect(intersections.length).toBe(2);
        
        // Points at (±√2/2, ±√2/2)
        const r = Math.SQRT2 / 2;
        for (const inter of intersections) {
          expect(Math.abs(inter.point.x)).toBeCloseTo(r);
          expect(Math.abs(inter.point.y)).toBeCloseTo(r);
        }
      }
    });

    it('provides correct parameter on circle', () => {
      // Horizontal line through unit circle at y=0
      const line = makeLine2D(point2d(-2, 0), point2d(2, 0));
      const circle = makeCircle2D(point2d(0, 0), 1);
      
      expect(line.success && circle.success).toBe(true);
      if (line.success && circle.success) {
        const intersections = intersectLine2DCircle2D(line.result, circle.result);
        
        expect(intersections.length).toBe(2);
        
        // Circle params: 0 for (1,0), π for (-1,0)
        const params = intersections.map(i => i.paramOnCurve2).sort((a, b) => a - b);
        expect(params[0]).toBeCloseTo(0);
        expect(params[1]).toBeCloseTo(Math.PI);
      }
    });

    it('works with offset circle', () => {
      const line = makeLine2D(point2d(0, 3), point2d(4, 3)); // horizontal at y=3
      const circle = makeCircle2D(point2d(2, 3), 1); // center at (2,3)
      
      expect(line.success && circle.success).toBe(true);
      if (line.success && circle.success) {
        const intersections = intersectLine2DCircle2D(line.result, circle.result);
        
        expect(intersections.length).toBe(2);
        
        // Points at (1, 3) and (3, 3)
        const xs = intersections.map(i => i.point.x).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(1);
        expect(xs[1]).toBeCloseTo(3);
      }
    });
  });

  describe('circle-circle intersection', () => {
    it('finds two intersections for overlapping circles', () => {
      // Two unit circles, centers 1 unit apart
      const circle1 = makeCircle2D(point2d(0, 0), 1);
      const circle2 = makeCircle2D(point2d(1, 0), 1);
      
      expect(circle1.success && circle2.success).toBe(true);
      if (circle1.success && circle2.success) {
        const intersections = intersectCircle2DCircle2D(circle1.result, circle2.result);
        
        expect(intersections.length).toBe(2);
        
        // Both points have x = 0.5
        for (const inter of intersections) {
          expect(inter.point.x).toBeCloseTo(0.5);
        }
        
        // y values should be ±√(1 - 0.25) = ±√0.75
        const ys = intersections.map(i => i.point.y).sort((a, b) => a - b);
        expect(ys[0]).toBeCloseTo(-Math.sqrt(0.75));
        expect(ys[1]).toBeCloseTo(Math.sqrt(0.75));
      }
    });

    it('finds one intersection for externally tangent circles', () => {
      // Two unit circles touching at (1, 0)
      const circle1 = makeCircle2D(point2d(0, 0), 1);
      const circle2 = makeCircle2D(point2d(2, 0), 1);
      
      expect(circle1.success && circle2.success).toBe(true);
      if (circle1.success && circle2.success) {
        const intersections = intersectCircle2DCircle2D(circle1.result, circle2.result);
        
        expect(intersections.length).toBe(1);
        expect(intersections[0].point.x).toBeCloseTo(1);
        expect(intersections[0].point.y).toBeCloseTo(0);
      }
    });

    it('finds one intersection for internally tangent circles', () => {
      // Circle of radius 2 at origin, circle of radius 1 at (1, 0)
      // They touch at (2, 0)
      const circle1 = makeCircle2D(point2d(0, 0), 2);
      const circle2 = makeCircle2D(point2d(1, 0), 1);
      
      expect(circle1.success && circle2.success).toBe(true);
      if (circle1.success && circle2.success) {
        const intersections = intersectCircle2DCircle2D(circle1.result, circle2.result);
        
        expect(intersections.length).toBe(1);
        expect(intersections[0].point.x).toBeCloseTo(2);
        expect(intersections[0].point.y).toBeCloseTo(0);
      }
    });

    it('returns empty for non-intersecting circles (too far apart)', () => {
      const circle1 = makeCircle2D(point2d(0, 0), 1);
      const circle2 = makeCircle2D(point2d(5, 0), 1);
      
      expect(circle1.success && circle2.success).toBe(true);
      if (circle1.success && circle2.success) {
        const intersections = intersectCircle2DCircle2D(circle1.result, circle2.result);
        expect(intersections.length).toBe(0);
      }
    });

    it('returns empty for non-intersecting circles (one inside other)', () => {
      const circle1 = makeCircle2D(point2d(0, 0), 5);
      const circle2 = makeCircle2D(point2d(0, 0), 1);
      
      expect(circle1.success && circle2.success).toBe(true);
      if (circle1.success && circle2.success) {
        const intersections = intersectCircle2DCircle2D(circle1.result, circle2.result);
        expect(intersections.length).toBe(0);
      }
    });

    it('returns empty for concentric circles', () => {
      const circle1 = makeCircle2D(point2d(0, 0), 1);
      const circle2 = makeCircle2D(point2d(0, 0), 2);
      
      expect(circle1.success && circle2.success).toBe(true);
      if (circle1.success && circle2.success) {
        const intersections = intersectCircle2DCircle2D(circle1.result, circle2.result);
        expect(intersections.length).toBe(0);
      }
    });

    it('provides correct parameter values on both circles', () => {
      // Two unit circles: one at origin, one at (1, 0)
      // They intersect at (0.5, ±√0.75)
      const circle1 = makeCircle2D(point2d(0, 0), 1);
      const circle2 = makeCircle2D(point2d(1, 0), 1);
      
      expect(circle1.success && circle2.success).toBe(true);
      if (circle1.success && circle2.success) {
        const intersections = intersectCircle2DCircle2D(circle1.result, circle2.result);
        
        expect(intersections.length).toBe(2);
        
        // Verify that evaluating circles at the given params yields the intersection points
        for (const inter of intersections) {
          // On circle1: param is angle from center (0,0)
          const angle1 = Math.atan2(inter.point.y, inter.point.x);
          expect(inter.paramOnCurve1).toBeCloseTo(angle1 >= 0 ? angle1 : angle1 + 2 * Math.PI, 4);
          
          // On circle2: param is angle from center (1,0)
          const angle2 = Math.atan2(inter.point.y - 0, inter.point.x - 1);
          expect(Math.cos(inter.paramOnCurve2)).toBeCloseTo(Math.cos(angle2), 4);
          expect(Math.sin(inter.paramOnCurve2)).toBeCloseTo(Math.sin(angle2), 4);
        }
      }
    });
  });
});
