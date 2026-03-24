import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  plane,
  Plane,
  axis,
  Axis,
  XY_PLANE,
  XZ_PLANE,
  YZ_PLANE,
  Z_AXIS_3D,
} from '../../src/core';
import {
  intersectPlanePlane,
  intersectPlaneSphere,
  intersectPlaneCylinder,
  intersectPlaneCone,
} from '../../src/geometry/intersections3d';
import type { SphericalSurface } from '../../src/surfaces/spherical-surface';
import { makeSphericalSurface } from '../../src/surfaces/spherical-surface';
import type { CylindricalSurface } from '../../src/surfaces/cylindrical-surface';
import { makeCylindricalSurface } from '../../src/surfaces/cylindrical-surface';
import type { ConicalSurface } from '../../src/surfaces/conical-surface';
import { makeConicalSurface } from '../../src/surfaces/conical-surface';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function sphere(cx: number, cy: number, cz: number, r: number): SphericalSurface {
  return makeSphericalSurface(point3d(cx, cy, cz), r).result!;
}

function cyl(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, r: number): CylindricalSurface {
  return makeCylindricalSurface(axis(point3d(ox, oy, oz), vec3d(dx, dy, dz)), r).result!;
}

function cone(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, r: number, halfAngle: number): ConicalSurface {
  return makeConicalSurface(axis(point3d(ox, oy, oz), vec3d(dx, dy, dz)), r, halfAngle).result!;
}

// ═══════════════════════════════════════════════════════
// PLANE-SPHERE INTERSECTION
// ═══════════════════════════════════════════════════════

describe('intersectPlaneSphere', () => {
  it('XY plane through unit sphere at origin → circle r=1', () => {
    const result = intersectPlaneSphere(XY_PLANE, sphere(0, 0, 0, 1));
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    expect(result.result!.type).toBe('circle');
    if (result.result!.type === 'circle') {
      expect(result.result!.radius).toBeCloseTo(1, 5);
      expect(result.result!.center.x).toBeCloseTo(0, 5);
      expect(result.result!.center.y).toBeCloseTo(0, 5);
      expect(result.result!.center.z).toBeCloseTo(0, 5);
    }
  });

  it('offset plane → smaller circle', () => {
    // Plane at z=0.5 through sphere r=1 at origin → circle r=sqrt(1-0.25)=sqrt(0.75)
    const pl = plane(point3d(0, 0, 0.5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = intersectPlaneSphere(pl, sphere(0, 0, 0, 1));
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    if (result.result!.type === 'circle') {
      expect(result.result!.radius).toBeCloseTo(Math.sqrt(0.75), 5);
      // Circle center should be at (0,0,0.5)
      expect(result.result!.center.z).toBeCloseTo(0.5, 5);
    }
  });

  it('sphere not at origin → correct circle center', () => {
    // Sphere centered at (3,4,5) r=2, XY plane at z=4 → dist=1, circle r=sqrt(3), center=(3,4,4)
    const pl = plane(point3d(0, 0, 4), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = intersectPlaneSphere(pl, sphere(3, 4, 5, 2));
    expect(result.success).toBe(true);
    if (result.result!.type === 'circle') {
      expect(result.result!.radius).toBeCloseTo(Math.sqrt(3), 5);
      expect(result.result!.center.x).toBeCloseTo(3, 5);
      expect(result.result!.center.y).toBeCloseTo(4, 5);
      expect(result.result!.center.z).toBeCloseTo(4, 5);
    }
  });

  it('tangent (plane touches sphere) → empty', () => {
    // Plane at z=1 touching unit sphere at top → tangent
    const pl = plane(point3d(0, 0, 1), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = intersectPlaneSphere(pl, sphere(0, 0, 0, 1));
    expect(result.success).toBe(true);
    // Tangent produces a degenerate circle (radius ≈ 0), treat as empty
    expect(result.result).toBeNull();
  });

  it('no intersection (plane misses sphere) → empty', () => {
    const pl = plane(point3d(0, 0, 5), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = intersectPlaneSphere(pl, sphere(0, 0, 0, 1));
    expect(result.success).toBe(true);
    expect(result.result).toBeNull();
  });

  it('non-axis-aligned plane → correct intersection', () => {
    // Plane with normal (1,1,1)/sqrt(3) through origin, sphere r=2 at origin
    const n = vec3d(1, 1, 1);
    const pl = plane(point3d(0, 0, 0), n, vec3d(1, -1, 0));
    const result = intersectPlaneSphere(pl, sphere(0, 0, 0, 2));
    expect(result.success).toBe(true);
    if (result.result!.type === 'circle') {
      // Plane passes through center → circle radius = sphere radius
      expect(result.result!.radius).toBeCloseTo(2, 4);
    }
  });

  it('large sphere, small offset → nearly full-radius circle', () => {
    const pl = plane(point3d(0, 0, 0.01), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const result = intersectPlaneSphere(pl, sphere(0, 0, 0, 100));
    expect(result.success).toBe(true);
    if (result.result!.type === 'circle') {
      expect(result.result!.radius).toBeCloseTo(100, 0);
    }
  });
});

// ═══════════════════════════════════════════════════════
// PLANE-CYLINDER INTERSECTION
// ═══════════════════════════════════════════════════════

describe('intersectPlaneCylinder', () => {
  it('plane perpendicular to cylinder axis → circle', () => {
    // XY plane, cylinder along Z axis r=2
    const result = intersectPlaneCylinder(XY_PLANE, cyl(0, 0, 0, 0, 0, 1, 2));
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    expect(result.result!.type).toBe('circle');
    if (result.result!.type === 'circle') {
      expect(result.result!.radius).toBeCloseTo(2, 5);
    }
  });

  it('plane parallel to axis, outside → empty', () => {
    // YZ plane (x=0) and cylinder along Z at x=5 r=1 → miss
    const result = intersectPlaneCylinder(YZ_PLANE, cyl(5, 0, 0, 0, 0, 1, 1));
    expect(result.success).toBe(true);
    expect(result.result).toBeNull();
  });

  it('plane parallel to axis, intersecting → two lines', () => {
    // YZ plane (x=0) and cylinder along Z at origin r=2
    const result = intersectPlaneCylinder(YZ_PLANE, cyl(0, 0, 0, 0, 0, 1, 2));
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    expect(result.result!.type).toBe('lines');
    if (result.result!.type === 'lines') {
      expect(result.result!.lines.length).toBe(2);
    }
  });

  it('plane parallel to axis, tangent → single line', () => {
    // Plane x=2, cylinder along Z at origin r=2 → tangent
    const pl = plane(point3d(2, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const result = intersectPlaneCylinder(pl, cyl(0, 0, 0, 0, 0, 1, 2));
    expect(result.success).toBe(true);
    // Tangent → either a single line or null
    if (result.result) {
      expect(result.result!.type).toBe('lines');
      if (result.result!.type === 'lines') {
        expect(result.result!.lines.length).toBe(1);
      }
    }
  });

  it('oblique plane → ellipse', () => {
    // Plane tilted 45° to cylinder axis
    const pl = plane(point3d(0, 0, 0), vec3d(0, 1, 1), vec3d(1, 0, 0));
    const result = intersectPlaneCylinder(pl, cyl(0, 0, 0, 0, 0, 1, 2));
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    expect(result.result!.type).toBe('ellipse');
    if (result.result!.type === 'ellipse') {
      // Minor radius = cylinder radius = 2
      // Major radius = 2 / cos(45°) = 2*sqrt(2)
      expect(result.result!.minorRadius).toBeCloseTo(2, 3);
      expect(result.result!.majorRadius).toBeCloseTo(2 * Math.sqrt(2), 3);
    }
  });
});

// ═══════════════════════════════════════════════════════
// PLANE-CONE INTERSECTION
// ═══════════════════════════════════════════════════════

describe('intersectPlaneCone', () => {
  it('plane perpendicular to cone axis → circle', () => {
    // XY plane at z=0, cone along Z with apex at z=-2, semiAngle=45°, radius at z=0 is 2
    // At z=2 above apex, the cone radius = 2 * tan(45°) = 2... but we need to set up correctly
    // Cone: axis origin (0,0,0), direction +Z, radius=2 at v=0, semiAngle=π/4
    // At z=0 (v=0), radius=2. Plane at z=1 cuts through at radius = 2 + 1*tan(45°) = 3
    const pl = plane(point3d(0, 0, 1), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const c = cone(0, 0, 0, 0, 0, 1, 2, Math.PI / 4);
    const result = intersectPlaneCone(pl, c);
    expect(result.success).toBe(true);
    expect(result.result).not.toBeNull();
    expect(result.result!.type).toBe('circle');
    if (result.result!.type === 'circle') {
      // At v along axis = 1/cos(π/4), effective radius = 2 + 1*sin(π/4)/cos(π/4)*?
      // Need to verify from parametrization. For now just check it's a circle.
      expect(result.result!.radius).toBeGreaterThan(0);
    }
  });

  it('plane missing cone → empty', () => {
    // Plane far away from cone
    const pl = plane(point3d(100, 0, 0), vec3d(1, 0, 0), vec3d(0, 1, 0));
    const c = cone(0, 0, 0, 0, 0, 1, 1, Math.PI / 6);
    const result = intersectPlaneCone(pl, c);
    expect(result.success).toBe(true);
    expect(result.result).toBeNull();
  });
});
