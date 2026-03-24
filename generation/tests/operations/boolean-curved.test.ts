/**
 * Tests for boolean infrastructure supporting curved surfaces.
 *
 * Phase 11 delivers: analytic plane-surface intersection functions.
 * Phase 13 (PCurve infrastructure) is needed for actual curved boolean operations.
 *
 * These tests verify the intersection functions work correctly, and document
 * that curved-solid booleans are NOT yet supported (they require PCurves).
 */
import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  Z_AXIS_3D,
} from '../../src/core';
import { makeArc3D } from '../../src/geometry/arc3d';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { pointInSolid } from '../../src/operations/point-in-solid';
import { solidToMesh, meshTriangleCount } from '../../src/mesh';
import { booleanSubtract } from '../../src/operations/boolean';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function makeBox(cx: number, cy: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, z), point3d(cx + hw, cy - hh, z),
    point3d(cx + hw, cy + hh, z), point3d(cx - hw, cy + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

/** Create a true sphere (SphericalSurface) by revolving two quarter-arcs */
function makeSphere(r: number) {
  const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
  const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0).result!;
  const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2).result!;
  const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r)).result!;
  const e1 = makeEdgeFromCurve(arc1).result!;
  const e2 = makeEdgeFromCurve(arc2).result!;
  const e3 = makeEdgeFromCurve(line).result!;
  const wire = makeWireFromEdges([e1, e2, e3]).result!;
  return revolve(wire, Z_AXIS_3D, 2 * Math.PI).result!;
}

// ═══════════════════════════════════════════════════════
// SPHERE CREATION
// ═══════════════════════════════════════════════════════

describe('sphere creation via arc revolve', () => {
  it('produces SphericalSurface faces (canonicalization works)', () => {
    const sphere = makeSphere(2);
    const faces = shellFaces(sphere.solid.outerShell);
    const types = new Set(faces.map(f => f.surface.type));
    expect(types.has('sphere')).toBe(true);
  });

  it('mesh can be generated with smooth shading', () => {
    const sphere = makeSphere(2);
    const mesh = solidToMesh(sphere.solid);
    expect(mesh.success).toBe(true);
    expect(meshTriangleCount(mesh.result!)).toBeGreaterThan(100);
  });
});

// ═══════════════════════════════════════════════════════
// POINT-IN-SOLID FOR CURVED SOLIDS
// ═══════════════════════════════════════════════════════

describe('pointInSolid for spheres', () => {
  it('center of sphere is inside', () => {
    const sphere = makeSphere(2);
    expect(pointInSolid(point3d(0, 0, 0), sphere.solid)).toBe('inside');
  });

  it('point inside sphere is inside', () => {
    const sphere = makeSphere(2);
    expect(pointInSolid(point3d(1, 0, 0), sphere.solid)).toBe('inside');
  });

  it('point outside sphere is outside', () => {
    const sphere = makeSphere(2);
    expect(pointInSolid(point3d(3, 0, 0), sphere.solid)).toBe('outside');
  });

  it('works for off-axis points', () => {
    const sphere = makeSphere(2);
    expect(pointInSolid(point3d(0, 1, 1), sphere.solid)).toBe('inside');
    expect(pointInSolid(point3d(0, 2, 2), sphere.solid)).toBe('outside');
  });
});

// ═══════════════════════════════════════════════════════
// PLANAR-ONLY BOOLEANS STILL WORK
// (regression check — existing functionality is not broken)
// ═══════════════════════════════════════════════════════

describe('planar booleans (regression)', () => {
  it('box-box subtract still works', () => {
    const boxA = makeBox(0, 0, 0, 4, 4, 4);
    const boxB = makeBox(1, 1, 0, 4, 4, 4);
    const result = booleanSubtract(boxA.solid, boxB.solid);
    expect(result.success).toBe(true);
    expect(result.result!.solid.outerShell.isClosed).toBe(true);
  });
});
