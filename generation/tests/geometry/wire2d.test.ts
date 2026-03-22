import { describe, it, expect } from 'vitest';
import { point2d, isEqual } from '../../src/core';
import { makeLine2D } from '../../src/geometry/line2d';
import { makeArc2D } from '../../src/geometry/arc2d';
import { makeWire2D, lengthWire2D } from '../../src/geometry/wire2d';

describe('Wire2D', () => {
  describe('construction', () => {
    it('creates wire from single line', () => {
      const line = makeLine2D(point2d(0, 0), point2d(1, 0));
      
      expect(line.success).toBe(true);
      if (line.success) {
        const wire = makeWire2D([line.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          expect(wire.result.curves.length).toBe(1);
          expect(wire.result.isClosed).toBe(false);
        }
      }
    });

    it('creates wire from connected lines', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 0));
      const line2 = makeLine2D(point2d(1, 0), point2d(1, 1));
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const wire = makeWire2D([line1.result, line2.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          expect(wire.result.curves.length).toBe(2);
          expect(wire.result.isClosed).toBe(false);
        }
      }
    });

    it('creates closed wire (triangle)', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 0));
      const line2 = makeLine2D(point2d(1, 0), point2d(0.5, 1));
      const line3 = makeLine2D(point2d(0.5, 1), point2d(0, 0));
      
      expect(line1.success && line2.success && line3.success).toBe(true);
      if (line1.success && line2.success && line3.success) {
        const wire = makeWire2D([line1.result, line2.result, line3.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          expect(wire.result.curves.length).toBe(3);
          expect(wire.result.isClosed).toBe(true);
        }
      }
    });

    it('creates wire with mixed curve types', () => {
      // Line from (0,0) to (1,0), then arc from (1,0) to (2,1) centered at (1,1)
      const line = makeLine2D(point2d(0, 0), point2d(1, 0));
      const arc = makeArc2D(point2d(1, 1), 1, -Math.PI / 2, 0);
      
      expect(line.success && arc.success).toBe(true);
      if (line.success && arc.success) {
        const wire = makeWire2D([line.result, arc.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          expect(wire.result.curves.length).toBe(2);
        }
      }
    });

    it('fails for disconnected curves', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 0));
      const line2 = makeLine2D(point2d(5, 5), point2d(6, 5)); // far away
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const wire = makeWire2D([line1.result, line2.result]);
        
        expect(wire.success).toBe(false);
        expect(wire.error).toContain('connect');
      }
    });

    it('fails for empty curve array', () => {
      const wire = makeWire2D([]);
      
      expect(wire.success).toBe(false);
      expect(wire.error).toContain('empty');
    });

    it('tolerates small gaps between curves', () => {
      // Two lines with a tiny gap (within tolerance)
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 0));
      const line2 = makeLine2D(point2d(1 + 1e-8, 0), point2d(2, 0)); // tiny gap
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const wire = makeWire2D([line1.result, line2.result]);
        
        expect(wire.success).toBe(true);
      }
    });
  });

  describe('properties', () => {
    it('startPoint is start of first curve', () => {
      const line1 = makeLine2D(point2d(1, 2), point2d(3, 4));
      const line2 = makeLine2D(point2d(3, 4), point2d(5, 6));
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const wire = makeWire2D([line1.result, line2.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          expect(wire.result.startPoint.x).toBeCloseTo(1);
          expect(wire.result.startPoint.y).toBeCloseTo(2);
        }
      }
    });

    it('endPoint is end of last curve', () => {
      const line1 = makeLine2D(point2d(1, 2), point2d(3, 4));
      const line2 = makeLine2D(point2d(3, 4), point2d(5, 6));
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const wire = makeWire2D([line1.result, line2.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          expect(wire.result.endPoint.x).toBeCloseTo(5);
          expect(wire.result.endPoint.y).toBeCloseTo(6);
        }
      }
    });

    it('closed wire has matching start and end points', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(1, 0));
      const line2 = makeLine2D(point2d(1, 0), point2d(0, 1));
      const line3 = makeLine2D(point2d(0, 1), point2d(0, 0));
      
      expect(line1.success && line2.success && line3.success).toBe(true);
      if (line1.success && line2.success && line3.success) {
        const wire = makeWire2D([line1.result, line2.result, line3.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          expect(wire.result.isClosed).toBe(true);
          expect(wire.result.startPoint.x).toBeCloseTo(wire.result.endPoint.x);
          expect(wire.result.startPoint.y).toBeCloseTo(wire.result.endPoint.y);
        }
      }
    });
  });

  describe('length', () => {
    it('length is sum of curve lengths', () => {
      const line1 = makeLine2D(point2d(0, 0), point2d(3, 0)); // length 3
      const line2 = makeLine2D(point2d(3, 0), point2d(3, 4)); // length 4
      
      expect(line1.success && line2.success).toBe(true);
      if (line1.success && line2.success) {
        const wire = makeWire2D([line1.result, line2.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          const len = lengthWire2D(wire.result);
          expect(len).toBeCloseTo(7); // 3 + 4
        }
      }
    });

    it('length of single curve wire equals curve length', () => {
      const line = makeLine2D(point2d(0, 0), point2d(3, 4)); // length 5
      
      expect(line.success).toBe(true);
      if (line.success) {
        const wire = makeWire2D([line.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          const len = lengthWire2D(wire.result);
          expect(len).toBeCloseTo(5);
        }
      }
    });

    it('length includes arc contribution', () => {
      // Line of length 2, then quarter circle of radius 1 (length π/2)
      const line = makeLine2D(point2d(0, 0), point2d(2, 0));
      const arc = makeArc2D(point2d(2, 1), 1, -Math.PI / 2, 0);
      
      expect(line.success && arc.success).toBe(true);
      if (line.success && arc.success) {
        const wire = makeWire2D([line.result, arc.result]);
        
        expect(wire.success).toBe(true);
        if (wire.success) {
          const len = lengthWire2D(wire.result);
          expect(len).toBeCloseTo(2 + Math.PI / 2);
        }
      }
    });
  });
});
