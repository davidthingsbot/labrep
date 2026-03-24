import { describe, it, expect } from 'vitest';
import {
  point3d,
  point2d,
  vec3d,
  plane,
  distance,
  XY_PLANE,
  Z_AXIS_3D,
  worldToSketch,
  sketchToWorld,
} from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeLine2D } from '../../src/geometry/line2d';
import { makeCircle2D } from '../../src/geometry/circle2d';
import { makeWire2D, Curve2D } from '../../src/geometry/wire2d';
import { makeEdgeFromCurve, Edge } from '../../src/topology/edge';
import { makeWire, makeWireFromEdges, orientEdge, Wire } from '../../src/topology/wire';
import { Face, makeFace, makePlanarFace } from '../../src/topology/face';
import { makePlaneSurface, makeCylindricalSurface, makeSphericalSurface, makeConicalSurface, makeToroidalSurface } from '../../src/surfaces';
import { extrude, extrudeWithHoles } from '../../src/operations/extrude';
import { solidVolume } from '../../src/topology/solid';
import { solidToStep } from '../../src/io/step-converters-topology';
import { createStepModelBuilder } from '../../src/io/step-model-builder';
import { writeStep } from '../../src/io/step-writer';
import { parseStep } from '../../src/io/step-parser';
import { createSketch, addElement } from '../../src/sketch/sketch';
import { findProfiles } from '../../src/sketch/region-detection';
import {
  getPlaneFromFace,
  projectEdgeToSketch,
  projectWireToSketch,
  createSketchOnFace,
  liftCurve2DToWorld,
  liftWire2DToWire3D,
  liftProfile2DToProfile3D,
} from '../../src/sketch/sketch-on-face';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Make a rectangle wire on XY plane */
function makeRectangleWire(w: number, h: number, cx = 0, cy = 0): Wire {
  const hw = w / 2, hh = h / 2;
  const p = [
    point3d(cx - hw, cy - hh, 0), point3d(cx + hw, cy - hh, 0),
    point3d(cx + hw, cy + hh, 0), point3d(cx - hw, cy + hh, 0),
  ];
  const edges = p.map((a, i) =>
    makeEdgeFromCurve(makeLine3D(a, p[(i + 1) % 4]).result!).result!,
  );
  return makeWireFromEdges(edges).result!;
}

/** Make a circle wire on XY plane */
function makeCircleWire(r: number, cx = 0, cy = 0): Wire {
  const circlePlane = plane(point3d(cx, cy, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, r).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  return makeWire([orientEdge(edge, true)]).result!;
}

/** Make a planar face from a wire (infers plane) */
function makePlanarFaceFromWire(wire: Wire): Face {
  return makePlanarFace(wire).result!;
}

// ═══════════════════════════════════════════════════════
// getPlaneFromFace
// ═══════════════════════════════════════════════════════

describe('getPlaneFromFace', () => {
  it('PlaneSurface → returns the plane directly', () => {
    const p = plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const surface = makePlaneSurface(p);
    const wire = makeRectangleWire(4, 4);
    // Manually create face with explicit surface
    const face = makeFace(surface, wire).result!;
    const result = getPlaneFromFace(face);
    expect(result.success).toBe(true);
    expect(result.result!.origin.z).toBeCloseTo(5, 10);
    expect(result.result!.normal.z).toBeCloseTo(1, 10);
  });

  it('top face of extruded box → plane at z=height', () => {
    const wire = makeRectangleWire(4, 4);
    const extResult = extrude(wire, vec3d(0, 0, 1), 10);
    expect(extResult.success).toBe(true);
    const topFace = extResult.result!.topFace;
    const result = getPlaneFromFace(topFace);
    expect(result.success).toBe(true);
    // Top face should be at z=10 with normal pointing up
    expect(result.result!.origin.z).toBeCloseTo(10, 5);
  });

  it('bottom face of extruded box → plane at z=0', () => {
    const wire = makeRectangleWire(4, 4);
    const extResult = extrude(wire, vec3d(0, 0, 1), 10);
    expect(extResult.success).toBe(true);
    const bottomFace = extResult.result!.bottomFace;
    const result = getPlaneFromFace(bottomFace);
    expect(result.success).toBe(true);
    expect(result.result!.origin.z).toBeCloseTo(0, 5);
  });

  it('cylindrical face → failure', () => {
    const surf = makeCylindricalSurface(Z_AXIS_3D, 5).result!;
    const wire = makeCircleWire(5);
    const face = makeFace(surf, wire).result!;
    const result = getPlaneFromFace(face);
    expect(result.success).toBe(false);
    expect(result.error).toContain('cylindrical');
  });

  it('spherical face → failure', () => {
    const surf = makeSphericalSurface(point3d(0, 0, 0), 5).result!;
    const wire = makeCircleWire(5);
    const face = makeFace(surf, wire).result!;
    const result = getPlaneFromFace(face);
    expect(result.success).toBe(false);
    expect(result.error).toContain('spherical');
  });

  it('conical face → failure', () => {
    const surf = makeConicalSurface(Z_AXIS_3D, 5, Math.PI / 6).result!;
    const wire = makeCircleWire(5);
    const face = makeFace(surf, wire).result!;
    const result = getPlaneFromFace(face);
    expect(result.success).toBe(false);
    expect(result.error).toContain('conical');
  });

  it('toroidal face → failure', () => {
    const surf = makeToroidalSurface(Z_AXIS_3D, 5, 1).result!;
    const wire = makeCircleWire(6);
    const face = makeFace(surf, wire).result!;
    const result = getPlaneFromFace(face);
    expect(result.success).toBe(false);
    expect(result.error).toContain('toroidal');
  });
});

// ═══════════════════════════════════════════════════════
// projectEdgeToSketch
// ═══════════════════════════════════════════════════════

describe('projectEdgeToSketch', () => {
  it('line edge parallel to plane → accurate 2D line', () => {
    const line = makeLine3D(point3d(1, 2, 5), point3d(4, 6, 5)).result!;
    const edge = makeEdgeFromCurve(line).result!;
    const pl = plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = projectEdgeToSketch(edge, pl);

    expect(result.success).toBe(true);
    expect(result.result!.type).toBe('line');
    if (result.result!.type === 'line') {
      expect(result.result!.startPoint.x).toBeCloseTo(1, 5);
      expect(result.result!.startPoint.y).toBeCloseTo(2, 5);
      expect(result.result!.endPoint.x).toBeCloseTo(4, 5);
      expect(result.result!.endPoint.y).toBeCloseTo(6, 5);
    }
  });

  it('line edge at 45° → foreshortened', () => {
    // Line from (0,0,0) to (3,0,3) projected onto XY plane → (0,0) to (3,0)
    const line = makeLine3D(point3d(0, 0, 0), point3d(3, 0, 3)).result!;
    const edge = makeEdgeFromCurve(line).result!;
    const result = projectEdgeToSketch(edge, XY_PLANE);

    expect(result.success).toBe(true);
    if (result.result!.type === 'line') {
      expect(result.result!.startPoint.x).toBeCloseTo(0, 5);
      expect(result.result!.endPoint.x).toBeCloseTo(3, 5);
      expect(result.result!.endPoint.y).toBeCloseTo(0, 5);
    }
  });

  it('line edge perpendicular to plane → failure (degenerate)', () => {
    const line = makeLine3D(point3d(3, 4, 0), point3d(3, 4, 10)).result!;
    const edge = makeEdgeFromCurve(line).result!;
    const result = projectEdgeToSketch(edge, XY_PLANE);
    expect(result.success).toBe(false);
    expect(result.error).toContain('point');
  });

  it('circle edge parallel to sketch plane → Circle2D with same radius', () => {
    const circlePlane = plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const sketchPlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));

    const result = projectEdgeToSketch(edge, sketchPlane);
    expect(result.success).toBe(true);
    expect(result.result!.type).toBe('circle');
    if (result.result!.type === 'circle') {
      expect(result.result!.radius).toBeCloseTo(3, 10);
    }
  });

  it('circle edge on non-parallel plane → failure (ellipse)', () => {
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, 3).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    // Tilted sketch plane
    const tiltedPlane = plane(point3d(0, 0, 0), vec3d(0, 0.5, 0.866), vec3d(1, 0, 0));

    const result = projectEdgeToSketch(edge, tiltedPlane);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ellipse');
  });

  it('arc edge on parallel plane → Arc2D', () => {
    const arcPlane = plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const arc = makeArc3D(arcPlane, 3, 0, Math.PI / 2).result!;
    const edge = makeEdgeFromCurve(arc).result!;
    const sketchPlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));

    const result = projectEdgeToSketch(edge, sketchPlane);
    expect(result.success).toBe(true);
    expect(result.result!.type).toBe('arc');
    if (result.result!.type === 'arc') {
      expect(result.result!.radius).toBeCloseTo(3, 10);
    }
  });
});

// ═══════════════════════════════════════════════════════
// projectWireToSketch
// ═══════════════════════════════════════════════════════

describe('projectWireToSketch', () => {
  it('projects rectangular wire from box top face → 4 Line2D curves', () => {
    const wire = makeRectangleWire(4, 6);
    const extResult = extrude(wire, vec3d(0, 0, 1), 10);
    expect(extResult.success).toBe(true);

    const topFace = extResult.result!.topFace;
    const topPlane = getPlaneFromFace(topFace).result!;

    const result = projectWireToSketch(topFace.outerWire, topPlane);
    expect(result.success).toBe(true);
    expect(result.result!.length).toBe(4);
    for (const c of result.result!) {
      expect(c.type).toBe('line');
    }
  });
});

// ═══════════════════════════════════════════════════════
// createSketchOnFace
// ═══════════════════════════════════════════════════════

describe('createSketchOnFace', () => {
  it('creates empty sketch on top face of box', () => {
    const wire = makeRectangleWire(4, 4);
    const extResult = extrude(wire, vec3d(0, 0, 1), 10);
    const result = createSketchOnFace(extResult.result!.topFace);

    expect(result.success).toBe(true);
    expect(result.result!.elements.length).toBe(0);
    expect(result.result!.plane.origin.z).toBeCloseTo(10, 5);
  });

  it('with projectBoundary: construction elements match face edges', () => {
    const wire = makeRectangleWire(4, 4);
    const extResult = extrude(wire, vec3d(0, 0, 1), 10);
    const result = createSketchOnFace(extResult.result!.topFace, { projectBoundary: true });

    expect(result.success).toBe(true);
    // Top face of box has 4 line edges → 4 construction elements
    expect(result.result!.elements.length).toBe(4);
    for (const elem of result.result!.elements) {
      expect(elem.construction).toBe(true);
      expect(elem.geometry.type).toBe('line');
    }
  });

  it('non-planar face → failure', () => {
    const surf = makeCylindricalSurface(Z_AXIS_3D, 5).result!;
    const wire = makeCircleWire(5);
    const face = makeFace(surf, wire).result!;
    const result = createSketchOnFace(face);
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// Profile lifting (2D → 3D)
// ═══════════════════════════════════════════════════════

describe('liftCurve2DToWorld', () => {
  it('Line2D on XY_PLANE → Line3D at z=0', () => {
    const line = makeLine2D(point2d(1, 2), point2d(4, 6)).result!;
    const result = liftCurve2DToWorld(line, XY_PLANE);
    expect(result.success).toBe(true);
    if (result.result!.type === 'line3d') {
      expect(result.result!.startPoint.x).toBeCloseTo(1, 10);
      expect(result.result!.startPoint.z).toBeCloseTo(0, 10);
      expect(result.result!.endPoint.x).toBeCloseTo(4, 10);
    }
  });

  it('Circle2D lifted to plane at z=10 → Circle3D at z=10', () => {
    const circle = makeCircle2D(point2d(0, 0), 5).result!;
    const pl = plane(point3d(0, 0, 10), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = liftCurve2DToWorld(circle, pl);
    expect(result.success).toBe(true);
    if (result.result!.type === 'circle3d') {
      expect(result.result!.plane.origin.z).toBeCloseTo(10, 10);
      expect(result.result!.radius).toBeCloseTo(5, 10);
    }
  });
});

describe('liftWire2DToWire3D', () => {
  it('rectangle Wire2D → closed 3D Wire', () => {
    const lines = [
      makeLine2D(point2d(0, 0), point2d(4, 0)).result!,
      makeLine2D(point2d(4, 0), point2d(4, 3)).result!,
      makeLine2D(point2d(4, 3), point2d(0, 3)).result!,
      makeLine2D(point2d(0, 3), point2d(0, 0)).result!,
    ];
    const wire2d = makeWire2D(lines).result!;
    const pl = plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));

    const result = liftWire2DToWire3D(wire2d, pl);
    expect(result.success).toBe(true);
    expect(result.result!.isClosed).toBe(true);
    expect(result.result!.edges.length).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════
// INTEGRATION: Full workflow
// ═══════════════════════════════════════════════════════

describe('full workflow: box → sketch on top → extrude from top', () => {
  it('creates a cylinder on top of a box', () => {
    // Step 1: Extrude a box (4x4, height 10)
    const boxWire = makeRectangleWire(4, 4);
    const boxResult = extrude(boxWire, vec3d(0, 0, 1), 10);
    expect(boxResult.success).toBe(true);

    // Step 2: Get top face and create sketch on it
    const topFace = boxResult.result!.topFace;
    const sketchResult = createSketchOnFace(topFace, { projectBoundary: true });
    expect(sketchResult.success).toBe(true);

    // Step 3: Add a circle to the sketch (centered on the face)
    const circle2d = makeCircle2D(point2d(0, 0), 1.5).result!;
    let sketch = addElement(sketchResult.result!, circle2d, false);

    // Step 4: Find profiles in the sketch
    const profiles = findProfiles(sketch);
    expect(profiles.length).toBeGreaterThanOrEqual(1);

    // Find the circle profile (the smallest one)
    const circleProfile = profiles.reduce((smallest, p) => {
      const area = Math.abs(p.outer.curves.reduce((sum, c) => {
        if (c.type === 'circle') return Math.PI * c.radius * c.radius;
        return sum;
      }, 0));
      const smallestArea = Math.abs(smallest.outer.curves.reduce((sum, c) => {
        if (c.type === 'circle') return Math.PI * c.radius * c.radius;
        return sum;
      }, 0));
      return area > 0 && (smallestArea === 0 || area < smallestArea) ? p : smallest;
    });

    // Step 5: Lift the circle profile to 3D
    const liftResult = liftProfile2DToProfile3D(circleProfile, sketch.plane);
    expect(liftResult.success).toBe(true);

    // Step 6: Extrude the circle from the top face
    const cylResult = extrude(liftResult.result!.outerWire, vec3d(0, 0, 1), 5);
    expect(cylResult.success).toBe(true);

    // Verify the cylinder starts at z=10 (top of box)
    const cylVol = solidVolume(cylResult.result!.solid);
    const expectedCylVol = Math.PI * 1.5 * 1.5 * 5;
    expect(Math.abs(cylVol - expectedCylVol) / expectedCylVol).toBeLessThan(0.01);
  });

  it('sketch on side face of box works', () => {
    const boxWire = makeRectangleWire(4, 4);
    const boxResult = extrude(boxWire, vec3d(0, 0, 1), 10);
    expect(boxResult.success).toBe(true);

    // Side faces should also be planar
    const sideFace = boxResult.result!.sideFaces[0];
    const result = getPlaneFromFace(sideFace);
    expect(result.success).toBe(true);
  });

  it('STEP round-trip: multi-feature solid (box + cylinder from top)', () => {
    // Box
    const boxWire = makeRectangleWire(4, 4);
    const boxResult = extrude(boxWire, vec3d(0, 0, 1), 10);
    expect(boxResult.success).toBe(true);

    // Cylinder from top face
    const topFace = boxResult.result!.topFace;
    const sketchResult = createSketchOnFace(topFace);
    expect(sketchResult.success).toBe(true);
    const circle = makeCircle2D(point2d(0, 0), 1.5).result!;
    const sketch = addElement(sketchResult.result!, circle, false);
    const profiles = findProfiles(sketch);
    const circleProfile = profiles.find(p =>
      p.outer.curves.length === 1 && p.outer.curves[0].type === 'circle',
    )!;
    const liftResult = liftProfile2DToProfile3D(circleProfile, sketch.plane);
    expect(liftResult.success).toBe(true);
    const cylResult = extrude(liftResult.result!.outerWire, vec3d(0, 0, 1), 5);
    expect(cylResult.success).toBe(true);

    // STEP round-trip for the box
    const builder1 = createStepModelBuilder();
    solidToStep(boxResult.result!.solid, builder1);
    const stepText1 = writeStep(builder1.build());
    expect(stepText1).toContain('MANIFOLD_SOLID_BREP');
    const parse1 = parseStep(stepText1);
    expect(parse1.success).toBe(true);

    // STEP round-trip for the cylinder
    const builder2 = createStepModelBuilder();
    solidToStep(cylResult.result!.solid, builder2);
    const stepText2 = writeStep(builder2.build());
    expect(stepText2).toContain('MANIFOLD_SOLID_BREP');
    expect(stepText2).toContain('CYLINDRICAL_SURFACE');
    const parse2 = parseStep(stepText2);
    expect(parse2.success).toBe(true);
  });
});
