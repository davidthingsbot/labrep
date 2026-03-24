import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  XY_PLANE,
  XZ_PLANE,
  YZ_PLANE,
} from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { intersectPlanePlane } from '../../src/geometry/intersections3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellIsClosed } from '../../src/topology/shell';
import { solidVolume } from '../../src/topology/solid';
import { extrude } from '../../src/operations/extrude';
import { pointInSolid } from '../../src/operations/point-in-solid';
import { booleanUnion, booleanSubtract, booleanIntersect } from '../../src/operations/boolean';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function makeBoxSolid(x: number, y: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(x - hw, y - hh, z), point3d(x + hw, y - hh, z),
    point3d(x + hw, y + hh, z), point3d(x - hw, y + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

// ═══════════════════════════════════════════════════════
// PLANE-PLANE INTERSECTION
// ═══════════════════════════════════════════════════════

describe('intersectPlanePlane', () => {
  it('XY and XZ planes → line along X axis', () => {
    const result = intersectPlanePlane(XY_PLANE, XZ_PLANE);
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    const line = result.result!;
    // Direction should be along X axis (or -X)
    expect(Math.abs(line.direction.x)).toBeCloseTo(1, 5);
    expect(Math.abs(line.direction.y)).toBeCloseTo(0, 5);
    expect(Math.abs(line.direction.z)).toBeCloseTo(0, 5);
  });

  it('XY and YZ planes → line along Y axis', () => {
    const result = intersectPlanePlane(XY_PLANE, YZ_PLANE);
    expect(result.success).toBe(true);
    const line = result.result!;
    expect(Math.abs(line.direction.y)).toBeCloseTo(1, 5);
  });

  it('XZ and YZ planes → line along Z axis', () => {
    const result = intersectPlanePlane(XZ_PLANE, YZ_PLANE);
    expect(result.success).toBe(true);
    const line = result.result!;
    expect(Math.abs(line.direction.z)).toBeCloseTo(1, 5);
  });

  it('parallel planes → null', () => {
    const pl1 = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const pl2 = plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = intersectPlanePlane(pl1, pl2);
    expect(result.success).toBe(true);
    expect(result.result).toBeNull();
  });

  it('coincident planes → null', () => {
    const result = intersectPlanePlane(XY_PLANE, XY_PLANE);
    expect(result.success).toBe(true);
    expect(result.result).toBeNull();
  });

  it('two offset planes at 45° → correct intersection line', () => {
    const pl1 = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const pl2 = plane(point3d(0, 0, 0), vec3d(0, 1, 1), vec3d(1, 0, 0));
    const result = intersectPlanePlane(pl1, pl2);
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    // Line should be along X axis (both normals are in YZ plane)
    expect(Math.abs(result.result!.direction.x)).toBeCloseTo(1, 3);
  });

  it('intersection line lies on both planes', () => {
    const pl1 = plane(point3d(0, 0, 3), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const pl2 = plane(point3d(0, 5, 0), vec3d(0, 1, 0), vec3d(1, 0, 0));
    const result = intersectPlanePlane(pl1, pl2);
    expect(result.success).toBe(true);
    const line = result.result!;
    // Origin should be on both planes
    const d1 = (line.origin.z - 3) * 1; // distance to pl1 (z=3)
    const d2 = (line.origin.y - 5) * 1; // distance to pl2 (y=5)
    expect(Math.abs(d1)).toBeLessThan(1e-6);
    expect(Math.abs(d2)).toBeLessThan(1e-6);
  });
});

// ═══════════════════════════════════════════════════════
// POINT-IN-SOLID
// ═══════════════════════════════════════════════════════

describe('pointInSolid', () => {
  it('point clearly inside box → inside', () => {
    const box = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const result = pointInSolid(point3d(0, 0, 2), box.solid);
    expect(result).toBe('inside');
  });

  it('point clearly outside box → outside', () => {
    const box = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const result = pointInSolid(point3d(10, 10, 10), box.solid);
    expect(result).toBe('outside');
  });

  it('point outside box in -X → outside', () => {
    const box = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const result = pointInSolid(point3d(-5, 0, 2), box.solid);
    expect(result).toBe('outside');
  });

  it('point near center of box → inside', () => {
    const box = makeBoxSolid(5, 5, 0, 6, 6, 10);
    const result = pointInSolid(point3d(5, 5, 5), box.solid);
    expect(result).toBe('inside');
  });

  it('point above box → outside', () => {
    const box = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const result = pointInSolid(point3d(0, 0, 10), box.solid);
    expect(result).toBe('outside');
  });

  it('point below box → outside', () => {
    const box = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const result = pointInSolid(point3d(0, 0, -5), box.solid);
    expect(result).toBe('outside');
  });
});

// ═══════════════════════════════════════════════════════
// BOOLEAN OPERATIONS: BOX-BOX
// ═══════════════════════════════════════════════════════

describe('booleanIntersect', () => {
  it('overlapping boxes → correct intersection volume', () => {
    // Box A: centered at (0,0), 4x4, height 4 → occupies (-2,-2,0) to (2,2,4)
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    // Box B: centered at (1,1), 4x4, height 4 → occupies (-1,-1,0) to (3,3,4)
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);

    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);

    // Intersection: (-1,-1,0) to (2,2,4) → 3×3×4 = 36
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(36, 1);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });

  it('no overlap → failure', () => {
    const boxA = makeBoxSolid(0, 0, 0, 2, 2, 2);
    const boxB = makeBoxSolid(10, 10, 0, 2, 2, 2);
    const result = booleanIntersect(boxA.solid, boxB.solid);
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });
});

describe('booleanSubtract', () => {
  it('subtract overlapping box → correct volume', () => {
    // Box A: 4x4x4 at origin → V = 64
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    // Box B: 4x4x4 offset by (1,1,0) → overlap is 3×3×4 = 36
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);

    const result = booleanSubtract(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);

    // Expected: 64 - 36 = 28
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(28.0, 1);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });
});

describe('booleanUnion', () => {
  it('overlapping boxes → correct union volume', () => {
    // Box A: 4x4x4 at origin → V = 64
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    // Box B: 4x4x4 offset by (1,1,0) → V = 64, overlap = 36
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);

    const result = booleanUnion(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);

    // Expected: 64 + 64 - 36 = 92
    const vol = solidVolume(result.result!.solid);
    expect(vol).toBeCloseTo(92, 1);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });
});
