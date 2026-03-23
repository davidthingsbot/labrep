import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  XY_PLANE,
  distance,
} from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeEdgeFromCurve, Edge } from '../../src/topology/edge';
import { makeWire, orientEdge, Wire, makeWireFromEdges } from '../../src/topology/wire';
import { solidVolume, solidOuterShell } from '../../src/topology/solid';
import { shellFaces, shellIsClosed } from '../../src/topology/shell';
import {
  extrude,
  extrudeWithHoles,
  extrudeSymmetric,
  extrudeSymmetricWithHoles,
  validateExtrudeProfile,
  validateExtrudeProfileWithHoles,
} from '../../src/operations/extrude';

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Create a rectangular wire on the XY plane.
 */
function makeRectangleWire(width: number, height: number, center?: { x: number; y: number }): Wire {
  const cx = center?.x ?? width / 2;
  const cy = center?.y ?? height / 2;

  const p1 = point3d(cx - width / 2, cy - height / 2, 0);
  const p2 = point3d(cx + width / 2, cy - height / 2, 0);
  const p3 = point3d(cx + width / 2, cy + height / 2, 0);
  const p4 = point3d(cx - width / 2, cy + height / 2, 0);

  const e1 = makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!;
  const e2 = makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!;
  const e3 = makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!;
  const e4 = makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!;

  return makeWireFromEdges([e1, e2, e3, e4]).result!;
}

/**
 * Create a square wire on the XY plane.
 */
function makeSquareWire(size: number, center?: { x: number; y: number }): Wire {
  return makeRectangleWire(size, size, center);
}

/**
 * Create a triangular wire on the XY plane.
 */
function makeTriangleWire(base: number, height: number): Wire {
  const p1 = point3d(0, 0, 0);
  const p2 = point3d(base, 0, 0);
  const p3 = point3d(base / 2, height, 0);

  const e1 = makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!;
  const e2 = makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!;
  const e3 = makeEdgeFromCurve(makeLine3D(p3, p1).result!).result!;

  return makeWireFromEdges([e1, e2, e3]).result!;
}

/**
 * Create a circular wire on the XY plane.
 */
function makeCircleWire(radius: number, center?: { x: number; y: number }): Wire {
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;

  const circlePlane = plane(point3d(cx, cy, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, radius).result!;
  const edge = makeEdgeFromCurve(circle).result!;

  return makeWire([orientEdge(edge, true)]).result!;
}

/**
 * Create an L-shaped wire on the XY plane.
 */
function makeLShapeWire(): Wire {
  // L-shape: 
  //    ┌─────┐
  //    │     │
  //    │  ┌──┘
  //    │  │
  //    └──┘
  const p1 = point3d(0, 0, 0);
  const p2 = point3d(10, 0, 0);
  const p3 = point3d(10, 15, 0);
  const p4 = point3d(20, 15, 0);
  const p5 = point3d(20, 25, 0);
  const p6 = point3d(0, 25, 0);

  const edges: Edge[] = [
    makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
    makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
    makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
    makeEdgeFromCurve(makeLine3D(p4, p5).result!).result!,
    makeEdgeFromCurve(makeLine3D(p5, p6).result!).result!,
    makeEdgeFromCurve(makeLine3D(p6, p1).result!).result!,
  ];

  return makeWireFromEdges(edges).result!;
}

/**
 * Create a U-shaped wire on the XY plane.
 */
function makeUShapeWire(): Wire {
  // U-shape:
  //    ┌──┐  ┌──┐
  //    │  │  │  │
  //    │  └──┘  │
  //    │        │
  //    └────────┘
  const p1 = point3d(0, 0, 0);
  const p2 = point3d(30, 0, 0);
  const p3 = point3d(30, 20, 0);
  const p4 = point3d(20, 20, 0);
  const p5 = point3d(20, 10, 0);
  const p6 = point3d(10, 10, 0);
  const p7 = point3d(10, 20, 0);
  const p8 = point3d(0, 20, 0);

  const edges: Edge[] = [
    makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
    makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
    makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
    makeEdgeFromCurve(makeLine3D(p4, p5).result!).result!,
    makeEdgeFromCurve(makeLine3D(p5, p6).result!).result!,
    makeEdgeFromCurve(makeLine3D(p6, p7).result!).result!,
    makeEdgeFromCurve(makeLine3D(p7, p8).result!).result!,
    makeEdgeFromCurve(makeLine3D(p8, p1).result!).result!,
  ];

  return makeWireFromEdges(edges).result!;
}

// ═══════════════════════════════════════════════════════
// PROFILE VALIDATION TESTS
// ═══════════════════════════════════════════════════════

describe('Profile Validation', () => {
  describe('validateExtrudeProfile', () => {
    it('accepts closed rectangular wire', () => {
      const wire = makeRectangleWire(10, 20);
      const result = validateExtrudeProfile(wire);

      expect(result.success).toBe(true);
      expect(result.result!.plane).toBeDefined();
      expect(result.result!.outerWire).toBe(wire);
    });

    it('accepts closed circular wire', () => {
      const wire = makeCircleWire(5);
      const result = validateExtrudeProfile(wire);

      expect(result.success).toBe(true);
    });

    it('accepts closed triangular wire', () => {
      const wire = makeTriangleWire(10, 8);
      const result = validateExtrudeProfile(wire);

      expect(result.success).toBe(true);
    });

    it('rejects open wire', () => {
      // Create an open wire (line segment)
      const line = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      const wire = makeWire([orientEdge(edge, true)]).result!;

      expect(wire.isClosed).toBe(false);

      const result = validateExtrudeProfile(wire);
      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });

    it('extracts correct plane for XY profile', () => {
      const wire = makeRectangleWire(10, 20);
      const result = validateExtrudeProfile(wire);

      expect(result.success).toBe(true);
      const p = result.result!.plane;

      // Normal should be along Z
      expect(Math.abs(p.normal.z)).toBeCloseTo(1, 5);
    });
  });

  describe('validateExtrudeProfileWithHoles', () => {
    it('accepts outer wire with single hole', () => {
      const outer = makeSquareWire(30, { x: 15, y: 15 });
      const hole = makeCircleWire(5, { x: 15, y: 15 });

      const result = validateExtrudeProfileWithHoles(outer, [hole]);
      expect(result.success).toBe(true);
    });

    it('rejects open outer wire', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      const wire = makeWire([orientEdge(edge, true)]).result!;

      const result = validateExtrudeProfileWithHoles(wire, []);
      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });

    it('rejects open hole wire', () => {
      const outer = makeSquareWire(30, { x: 15, y: 15 });

      const line = makeLine3D(point3d(10, 10, 0), point3d(20, 10, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      const openHole = makeWire([orientEdge(edge, true)]).result!;

      const result = validateExtrudeProfileWithHoles(outer, [openHole]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });
  });
});

// ═══════════════════════════════════════════════════════
// BASIC SHAPE TESTS
// ═══════════════════════════════════════════════════════

describe('Basic Extrusion', () => {
  describe('extrude_rectangle_to_box', () => {
    it('creates box from rectangle', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 1), 30);

      expect(result.success).toBe(true);
      expect(result.result!.solid).toBeDefined();
    });

    it('has correct volume', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 1), 30);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);

      // Volume = 10 * 20 * 30 = 6000
      expect(volume).toBeCloseTo(6000, 5);
    });

    it('has 6 faces', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 1), 30);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      const faces = shellFaces(shell);

      // 2 caps + 4 sides = 6 faces
      expect(faces.length).toBe(6);
    });

    it('has closed shell', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 1), 30);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      expect(shellIsClosed(shell)).toBe(true);
    });
  });

  describe('extrude_circle_to_cylinder', () => {
    it('creates cylinder from circle', () => {
      const wire = makeCircleWire(5);
      const result = extrude(wire, vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      expect(result.result!.solid).toBeDefined();
    });

    it('has 3 faces', () => {
      const wire = makeCircleWire(5);
      const result = extrude(wire, vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      const faces = shellFaces(shell);

      // 2 caps + 1 cylindrical side = 3 faces
      expect(faces.length).toBe(3);
    });

    it('has cylindrical side face', () => {
      const wire = makeCircleWire(5);
      const result = extrude(wire, vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);

      // The side face should have cylindrical surface
      const sideFace = result.result!.sideFaces[0];
      expect(sideFace.surface.type).toBe('cylinder');

      // Verify radius
      if (sideFace.surface.type === 'cylinder') {
        expect(sideFace.surface.radius).toBe(5);
      }
    });

    // Note: Volume calculation for curved faces requires mesh tessellation
    // The solidVolume function triangulates from wire vertices, which doesn't
    // work for circular wires (single vertex). This test is skipped for now.
    it.skip('has correct volume (requires tessellation)', () => {
      const wire = makeCircleWire(5);
      const result = extrude(wire, vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);

      // Volume = π * r² * h = π * 25 * 20 ≈ 1570.8
      expect(volume).toBeCloseTo(Math.PI * 25 * 20, 0);
    });
  });

  describe('extrude_triangle', () => {
    it('creates triangular prism', () => {
      const wire = makeTriangleWire(10, 8);
      const result = extrude(wire, vec3d(0, 0, 1), 15);

      expect(result.success).toBe(true);
    });

    it('has correct volume', () => {
      const wire = makeTriangleWire(10, 8);
      const result = extrude(wire, vec3d(0, 0, 1), 15);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);

      // Volume = (base * height / 2) * depth = (10 * 8 / 2) * 15 = 600
      expect(volume).toBeCloseTo(600, 5);
    });

    it('has 5 faces', () => {
      const wire = makeTriangleWire(10, 8);
      const result = extrude(wire, vec3d(0, 0, 1), 15);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      const faces = shellFaces(shell);

      // 2 caps + 3 sides = 5 faces
      expect(faces.length).toBe(5);
    });
  });
});

// ═══════════════════════════════════════════════════════
// NON-CONVEX PROFILE TESTS
// ═══════════════════════════════════════════════════════

describe('Non-convex Extrusion', () => {
  describe('extrude_l_shape', () => {
    it('creates L-shaped solid', () => {
      const wire = makeLShapeWire();
      const result = extrude(wire, vec3d(0, 0, 1), 5);

      expect(result.success).toBe(true);
    });

    it('has correct volume', () => {
      const wire = makeLShapeWire();
      const result = extrude(wire, vec3d(0, 0, 1), 5);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);

      // L-shape area = 10*25 + 10*10 = 250 + 100 = 350
      // Volume = 350 * 5 = 1750
      expect(volume).toBeCloseTo(1750, 5);
    });

    it('has 8 faces', () => {
      const wire = makeLShapeWire();
      const result = extrude(wire, vec3d(0, 0, 1), 5);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      const faces = shellFaces(shell);

      // 2 caps + 6 sides = 8 faces
      expect(faces.length).toBe(8);
    });
  });

  describe('extrude_u_shape', () => {
    it('creates U-shaped solid', () => {
      const wire = makeUShapeWire();
      const result = extrude(wire, vec3d(0, 0, 1), 5);

      expect(result.success).toBe(true);
    });

    it('has 10 faces', () => {
      const wire = makeUShapeWire();
      const result = extrude(wire, vec3d(0, 0, 1), 5);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      const faces = shellFaces(shell);

      // 2 caps + 8 sides = 10 faces
      expect(faces.length).toBe(10);
    });
  });
});

// ═══════════════════════════════════════════════════════
// PROFILES WITH HOLES TESTS
// ═══════════════════════════════════════════════════════

describe('Extrusion with Holes', () => {
  describe('extrude_square_with_circular_hole', () => {
    it('creates tube/housing shape', () => {
      const outer = makeSquareWire(30, { x: 15, y: 15 });
      const hole = makeCircleWire(5, { x: 15, y: 15 });

      const result = extrudeWithHoles(outer, [hole], vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
    });

    it('has correct face count', () => {
      const outer = makeSquareWire(30, { x: 15, y: 15 });
      const hole = makeCircleWire(5, { x: 15, y: 15 });

      const result = extrudeWithHoles(outer, [hole], vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      const faces = shellFaces(shell);

      // 2 caps (with holes) + 4 outer sides + 1 inner cylindrical side = 7 faces
      expect(faces.length).toBe(7);
    });

    // Note: Volume calculation for curved faces requires mesh tessellation
    it.skip('has correct volume (requires tessellation)', () => {
      const outer = makeSquareWire(30, { x: 15, y: 15 });
      const hole = makeCircleWire(5, { x: 15, y: 15 });

      const result = extrudeWithHoles(outer, [hole], vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);

      // Volume = (30² - π*5²) * 20 = (900 - 78.54) * 20 ≈ 16429
      const expectedVolume = (30 * 30 - Math.PI * 25) * 20;
      expect(volume).toBeCloseTo(expectedVolume, 0);
    });
  });

  describe('extrude_concentric_circles', () => {
    it('creates pipe shape', () => {
      const outer = makeCircleWire(10, { x: 0, y: 0 });
      const hole = makeCircleWire(5, { x: 0, y: 0 });

      const result = extrudeWithHoles(outer, [hole], vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
    });

    it('has correct face count', () => {
      const outer = makeCircleWire(10, { x: 0, y: 0 });
      const hole = makeCircleWire(5, { x: 0, y: 0 });

      const result = extrudeWithHoles(outer, [hole], vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      const shell = solidOuterShell(result.result!.solid);
      const faces = shellFaces(shell);

      // 2 caps (with holes) + 1 outer cylindrical + 1 inner cylindrical = 4 faces
      expect(faces.length).toBe(4);
    });

    // Note: Volume calculation for curved faces requires mesh tessellation
    it.skip('has correct volume (requires tessellation)', () => {
      const outer = makeCircleWire(10, { x: 0, y: 0 });
      const hole = makeCircleWire(5, { x: 0, y: 0 });

      const result = extrudeWithHoles(outer, [hole], vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);

      // Volume = π * (R² - r²) * h = π * (100 - 25) * 20 = 1500π ≈ 4712
      const expectedVolume = Math.PI * (100 - 25) * 20;
      expect(volume).toBeCloseTo(expectedVolume, 0);
    });
  });
});

// ═══════════════════════════════════════════════════════
// SYMMETRIC EXTRUSION TESTS
// ═══════════════════════════════════════════════════════

describe('Symmetric Extrusion', () => {
  describe('symmetric_rectangle', () => {
    it('creates centered box', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrudeSymmetric(wire, vec3d(0, 0, 1), 30);

      expect(result.success).toBe(true);
    });

    it('has same volume as basic extrude', () => {
      const wire = makeRectangleWire(10, 20);

      const basicResult = extrude(wire, vec3d(0, 0, 1), 30);
      const symResult = extrudeSymmetric(wire, vec3d(0, 0, 1), 30);

      expect(basicResult.success).toBe(true);
      expect(symResult.success).toBe(true);

      const basicVol = solidVolume(basicResult.result!.solid);
      const symVol = solidVolume(symResult.result!.solid);

      expect(symVol).toBeCloseTo(basicVol, 5);
    });
  });

  describe('symmetric_circle', () => {
    it('creates centered cylinder', () => {
      const wire = makeCircleWire(5);
      const result = extrudeSymmetric(wire, vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
    });

    it('has same volume as basic extrude', () => {
      const wire = makeCircleWire(5);

      const basicResult = extrude(wire, vec3d(0, 0, 1), 20);
      const symResult = extrudeSymmetric(wire, vec3d(0, 0, 1), 20);

      expect(basicResult.success).toBe(true);
      expect(symResult.success).toBe(true);

      const basicVol = solidVolume(basicResult.result!.solid);
      const symVol = solidVolume(symResult.result!.solid);

      expect(symVol).toBeCloseTo(basicVol, 0);
    });
  });

  describe('symmetric_with_hole', () => {
    it('creates centered tube', () => {
      const outer = makeCircleWire(10);
      const hole = makeCircleWire(5);

      const result = extrudeSymmetricWithHoles(outer, [hole], vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════
// EDGE CASE TESTS (MUST FAIL)
// ═══════════════════════════════════════════════════════

describe('Edge Cases - Must Fail', () => {
  describe('zero_distance', () => {
    it('rejects zero distance', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 1), 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });
  });

  describe('negative_distance', () => {
    it('rejects negative distance', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 1), -10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });
  });

  describe('open_wire', () => {
    it('rejects open wire', () => {
      const line = makeLine3D(point3d(0, 0, 0), point3d(10, 0, 0)).result!;
      const edge = makeEdgeFromCurve(line).result!;
      const wire = makeWire([orientEdge(edge, true)]).result!;

      const result = extrude(wire, vec3d(0, 0, 1), 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('closed');
    });
  });

  describe('zero_direction', () => {
    it('rejects zero direction', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 0), 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-zero');
    });
  });

  describe('symmetric_zero_distance', () => {
    it('rejects zero total distance', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrudeSymmetric(wire, vec3d(0, 0, 1), 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });
  });

  describe('symmetric_negative_distance', () => {
    it('rejects negative total distance', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrudeSymmetric(wire, vec3d(0, 0, 1), -10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });
  });
});

// ═══════════════════════════════════════════════════════
// DIRECTION TESTS
// ═══════════════════════════════════════════════════════

describe('Extrusion Direction', () => {
  describe('extrude_along_x', () => {
    it('extrudes profile along X axis', () => {
      // Create profile on YZ plane
      const p1 = point3d(0, 0, 0);
      const p2 = point3d(0, 10, 0);
      const p3 = point3d(0, 10, 10);
      const p4 = point3d(0, 0, 10);

      const edges: Edge[] = [
        makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
        makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
        makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
        makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
      ];
      const wire = makeWireFromEdges(edges).result!;

      const result = extrude(wire, vec3d(1, 0, 0), 20);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);
      expect(volume).toBeCloseTo(10 * 10 * 20, 5);
    });
  });

  describe('extrude_along_y', () => {
    it('extrudes profile along Y axis', () => {
      // Create profile on XZ plane
      const p1 = point3d(0, 0, 0);
      const p2 = point3d(10, 0, 0);
      const p3 = point3d(10, 0, 10);
      const p4 = point3d(0, 0, 10);

      const edges: Edge[] = [
        makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
        makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
        makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
        makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
      ];
      const wire = makeWireFromEdges(edges).result!;

      const result = extrude(wire, vec3d(0, 1, 0), 15);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);
      expect(volume).toBeCloseTo(10 * 10 * 15, 5);
    });
  });

  describe('extrude_diagonal', () => {
    it('extrudes at 45 degrees', () => {
      const wire = makeRectangleWire(10, 10);
      // Extrude at 45 degrees, distance = 10*sqrt(2) so vertical component is 10
      const result = extrude(wire, vec3d(1, 0, 1), 10 * Math.sqrt(2));

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);

      // For diagonal extrusion, the solid is a parallelepiped
      // Volume = base area * height (perpendicular component of extrusion)
      // The extrusion vector is (1,0,1)/sqrt(2) * 10*sqrt(2) = (10, 0, 10)
      // So the "height" perpendicular to base (XY plane) is 10
      // Volume = 10 * 10 * 10 = 1000
      expect(volume).toBeCloseTo(10 * 10 * 10, 5);
    });
  });

  describe('extrude_opposite_normal', () => {
    it('extrudes against plane normal', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, -1), 30);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);
      expect(volume).toBeCloseTo(10 * 20 * 30, 5);
    });
  });
});

// ═══════════════════════════════════════════════════════
// NUMERICAL EDGE CASES
// ═══════════════════════════════════════════════════════

describe('Numerical Edge Cases', () => {
  describe('very_small_distance', () => {
    it('handles very small but valid distance', () => {
      const wire = makeRectangleWire(10, 10);
      const result = extrude(wire, vec3d(0, 0, 1), 0.001);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);
      expect(volume).toBeCloseTo(10 * 10 * 0.001, 5);
    });
  });

  describe('large_distance', () => {
    it('handles large distance', () => {
      const wire = makeRectangleWire(1, 1);
      const result = extrude(wire, vec3d(0, 0, 1), 1000);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);
      expect(volume).toBeCloseTo(1 * 1 * 1000, 5);
    });
  });

  describe('profile_not_at_origin', () => {
    it('handles offset profile', () => {
      const wire = makeRectangleWire(10, 10, { x: 100, y: 200 });
      const result = extrude(wire, vec3d(0, 0, 1), 30);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);
      expect(volume).toBeCloseTo(10 * 10 * 30, 5);
    });
  });

  describe('tiny_profile', () => {
    it('handles tiny profile', () => {
      const wire = makeRectangleWire(0.01, 0.01);
      const result = extrude(wire, vec3d(0, 0, 1), 0.01);

      expect(result.success).toBe(true);
      const volume = solidVolume(result.result!.solid);
      expect(volume).toBeCloseTo(0.01 * 0.01 * 0.01, 10);
    });
  });
});

// ═══════════════════════════════════════════════════════
// SURFACE CANONICALIZATION TESTS
// ═══════════════════════════════════════════════════════

describe('Surface Canonicalization', () => {
  describe('line_becomes_plane', () => {
    it('creates planar side faces for rectangle', () => {
      const wire = makeRectangleWire(10, 20);
      const result = extrude(wire, vec3d(0, 0, 1), 30);

      expect(result.success).toBe(true);

      // All side faces should have plane surfaces
      for (const face of result.result!.sideFaces) {
        expect(face.surface.type).toBe('plane');
      }
    });
  });

  describe('circle_becomes_cylinder', () => {
    it('creates cylindrical side face for circle', () => {
      const wire = makeCircleWire(5);
      const result = extrude(wire, vec3d(0, 0, 1), 20);

      expect(result.success).toBe(true);
      expect(result.result!.sideFaces.length).toBe(1);

      const sideFace = result.result!.sideFaces[0];
      expect(sideFace.surface.type).toBe('cylinder');
    });
  });
});

// ═══════════════════════════════════════════════════════
// RESULT METADATA TESTS
// ═══════════════════════════════════════════════════════

describe('Result Metadata', () => {
  it('returns bottom face', () => {
    const wire = makeRectangleWire(10, 20);
    const result = extrude(wire, vec3d(0, 0, 1), 30);

    expect(result.success).toBe(true);
    expect(result.result!.bottomFace).toBeDefined();
    expect(result.result!.bottomFace.surface.type).toBe('plane');
  });

  it('returns top face', () => {
    const wire = makeRectangleWire(10, 20);
    const result = extrude(wire, vec3d(0, 0, 1), 30);

    expect(result.success).toBe(true);
    expect(result.result!.topFace).toBeDefined();
    expect(result.result!.topFace.surface.type).toBe('plane');
  });

  it('returns correct number of side faces', () => {
    const wire = makeRectangleWire(10, 20);
    const result = extrude(wire, vec3d(0, 0, 1), 30);

    expect(result.success).toBe(true);
    expect(result.result!.sideFaces.length).toBe(4);
  });

  it('returns edge-to-face mapping', () => {
    const wire = makeRectangleWire(10, 20);
    const result = extrude(wire, vec3d(0, 0, 1), 30);

    expect(result.success).toBe(true);
    expect(result.result!.edgeToFaceIndex.size).toBe(4);
  });
});
