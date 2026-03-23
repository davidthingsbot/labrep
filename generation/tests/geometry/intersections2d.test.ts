import { describe, it, expect } from 'vitest';
import { point2d } from '../../src/core';
import { makeLine2D } from '../../src/geometry/line2d';
import { makeCircle2D } from '../../src/geometry/circle2d';
import { makeArc2D } from '../../src/geometry/arc2d';
import { 
  intersectLine2DLine2D,
  intersectLine2DCircle2D,
  intersectCircle2DCircle2D,
  intersectLine2DArc2D,
  intersectCircle2DArc2D,
  intersectArc2DArc2D,
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

  describe('edge cases', () => {
    it('handles very small circles', () => {
      const c1 = makeCircle2D(point2d(0, 0), 0.001).result!;
      const c2 = makeCircle2D(point2d(0.001, 0), 0.001).result!;
      const result = intersectCircle2DCircle2D(c1, c2);
      expect(result.length).toBe(2); // Two intersection points
    });

    it('handles circles with very different radii', () => {
      // Large circle at origin, small circle at edge
      const c1 = makeCircle2D(point2d(0, 0), 10).result!;
      const c2 = makeCircle2D(point2d(10, 0), 1).result!;
      const result = intersectCircle2DCircle2D(c1, c2);
      // Small circle overlaps edge of large circle
      expect(result.length).toBe(2);
    });

    it('handles nearly tangent circles', () => {
      // Circles that are just barely touching
      const c1 = makeCircle2D(point2d(0, 0), 1).result!;
      const c2 = makeCircle2D(point2d(2 + 1e-9, 0), 1).result!;
      const result = intersectCircle2DCircle2D(c1, c2);
      // Should find 0 or 1 intersection depending on tolerance
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it('handles line through circle center', () => {
      const line = makeLine2D(point2d(-5, 0), point2d(5, 0)).result!;
      const circle = makeCircle2D(point2d(0, 0), 2).result!;
      const result = intersectLine2DCircle2D(line, circle);
      expect(result.length).toBe(2);
      // Intersections at (-2,0) and (2,0)
      expect(result[0].point.y).toBeCloseTo(0);
      expect(result[1].point.y).toBeCloseTo(0);
    });

    it('handles vertical line', () => {
      const line = makeLine2D(point2d(0, -5), point2d(0, 5)).result!;
      const circle = makeCircle2D(point2d(0, 0), 1).result!;
      const result = intersectLine2DCircle2D(line, circle);
      expect(result.length).toBe(2);
    });
  });

  describe('line-arc intersection', () => {
    it('finds intersection when line crosses arc', () => {
      // Horizontal line through unit circle, arc is right half (from -π/2 to π/2)
      const line = makeLine2D(point2d(-2, 0), point2d(2, 0)).result!;
      const arc = makeArc2D(point2d(0, 0), 1, -Math.PI / 2, Math.PI / 2).result!;
      
      const result = intersectLine2DArc2D(line, arc);
      
      expect(result.length).toBe(1);
      expect(result[0].point.x).toBeCloseTo(1);
      expect(result[0].point.y).toBeCloseTo(0);
    });

    it('returns empty when line misses arc but would hit full circle', () => {
      // Horizontal line through unit circle, but arc is on top half only
      const line = makeLine2D(point2d(-2, 0), point2d(2, 0)).result!;
      // Arc from π/4 to 3π/4 (top portion only)
      const arc = makeArc2D(point2d(0, 0), 1, Math.PI / 4, 3 * Math.PI / 4).result!;
      
      const result = intersectLine2DArc2D(line, arc);
      
      expect(result.length).toBe(0);
    });

    it('finds two intersections when line crosses both ends of arc', () => {
      // Vertical line through arc that spans most of circle
      const line = makeLine2D(point2d(0, -2), point2d(0, 2)).result!;
      // Arc spanning from -3π/4 to 3π/4 (covers top and bottom at x=0)
      const arc = makeArc2D(point2d(0, 0), 1, -3 * Math.PI / 4, 3 * Math.PI / 4).result!;
      
      const result = intersectLine2DArc2D(line, arc);
      
      expect(result.length).toBe(2);
    });

    it('finds tangent intersection', () => {
      // Vertical line tangent to right side of arc
      const line = makeLine2D(point2d(1, -1), point2d(1, 1)).result!;
      // Arc including right side
      const arc = makeArc2D(point2d(0, 0), 1, -Math.PI / 4, Math.PI / 4).result!;
      
      const result = intersectLine2DArc2D(line, arc);
      
      expect(result.length).toBe(1);
      expect(result[0].point.x).toBeCloseTo(1);
      expect(result[0].point.y).toBeCloseTo(0);
    });

    it('returns empty when line misses arc entirely', () => {
      const line = makeLine2D(point2d(5, 0), point2d(5, 1)).result!;
      const arc = makeArc2D(point2d(0, 0), 1, 0, Math.PI).result!;
      
      const result = intersectLine2DArc2D(line, arc);
      
      expect(result.length).toBe(0);
    });
  });

  describe('circle-arc intersection', () => {
    it('finds intersections when circle crosses arc', () => {
      // Two overlapping circles, but arc only covers part
      const circle = makeCircle2D(point2d(1, 0), 1).result!;
      // Arc is top half of first circle
      const arc = makeArc2D(point2d(0, 0), 1, 0, Math.PI).result!;
      
      const result = intersectCircle2DArc2D(circle, arc);
      
      // One intersection in top half at (0.5, √0.75)
      expect(result.length).toBe(1);
      expect(result[0].point.x).toBeCloseTo(0.5);
      expect(result[0].point.y).toBeGreaterThan(0);
    });

    it('returns empty when circle intersects full circle but not arc portion', () => {
      // Circle that would intersect bottom of unit circle
      const circle = makeCircle2D(point2d(0, -1), 0.5).result!;
      // Arc is top half only
      const arc = makeArc2D(point2d(0, 0), 1, 0, Math.PI).result!;
      
      const result = intersectCircle2DArc2D(circle, arc);
      
      expect(result.length).toBe(0);
    });

    it('finds tangent point', () => {
      // Circle tangent to arc at one point
      const circle = makeCircle2D(point2d(2, 0), 1).result!;
      // Arc covering the right side
      const arc = makeArc2D(point2d(0, 0), 1, -Math.PI / 2, Math.PI / 2).result!;
      
      const result = intersectCircle2DArc2D(circle, arc);
      
      expect(result.length).toBe(1);
      expect(result[0].point.x).toBeCloseTo(1);
      expect(result[0].point.y).toBeCloseTo(0);
    });
  });

  describe('arc-arc intersection', () => {
    it('finds intersections when arcs overlap', () => {
      // Two arcs from circles centered 1 unit apart
      const arc1 = makeArc2D(point2d(0, 0), 1, -Math.PI / 2, Math.PI / 2).result!;
      const arc2 = makeArc2D(point2d(1, 0), 1, Math.PI / 2, 3 * Math.PI / 2).result!;
      
      const result = intersectArc2DArc2D(arc1, arc2);
      
      // Both arcs include the intersection region
      expect(result.length).toBe(2);
    });

    it('returns empty when arcs from same circle don\'t overlap', () => {
      // Two arcs on same circle but different portions
      const arc1 = makeArc2D(point2d(0, 0), 1, 0, Math.PI / 4).result!;
      const arc2 = makeArc2D(point2d(0, 0), 1, Math.PI / 2, Math.PI).result!;
      
      const result = intersectArc2DArc2D(arc1, arc2);
      
      expect(result.length).toBe(0);
    });

    it('finds intersection when circles intersect but only one point in arc ranges', () => {
      // Two unit circles 1 unit apart, but arcs only cover partial range
      const arc1 = makeArc2D(point2d(0, 0), 1, 0, Math.PI / 2).result!; // top-right quarter
      const arc2 = makeArc2D(point2d(1, 0), 1, Math.PI / 2, Math.PI).result!; // top-left quarter
      
      const result = intersectArc2DArc2D(arc1, arc2);
      
      // Only top intersection point is in both arcs
      expect(result.length).toBe(1);
      expect(result[0].point.y).toBeGreaterThan(0);
    });

    it('returns empty when circles don\'t intersect', () => {
      const arc1 = makeArc2D(point2d(0, 0), 1, 0, Math.PI).result!;
      const arc2 = makeArc2D(point2d(5, 0), 1, 0, Math.PI).result!;
      
      const result = intersectArc2DArc2D(arc1, arc2);
      
      expect(result.length).toBe(0);
    });
  });
});
