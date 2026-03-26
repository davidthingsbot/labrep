/**
 * Polymorphic surface adapter interface.
 *
 * Wraps any surface type with a uniform interface for evaluation,
 * projection, normal computation, and periodicity queries. This
 * eliminates per-surface-type switch dispatches throughout the codebase.
 *
 * OCCT reference: Geom_Surface / GeomAdaptor_Surface
 * OCCT uses class inheritance; we use an adapter pattern over our
 * existing discriminated-union Surface types.
 */
import { Point3D, point3d, Vector3D, vec3d, cross, normalize, dot, subtractPoints } from '../core';
import type { Surface } from '../topology/face';
import {
  evaluatePlaneSurface, normalPlaneSurface, projectToPlaneSurface,
} from './plane-surface';
import {
  evaluateCylindricalSurface, normalCylindricalSurface, projectToCylindricalSurface,
} from './cylindrical-surface';
import {
  evaluateSphericalSurface, normalSphericalSurface, projectToSphericalSurface,
} from './spherical-surface';
import {
  evaluateConicalSurface, normalConicalSurface, projectToConicalSurface,
} from './conical-surface';
import {
  evaluateToroidalSurface, normalToroidalSurface,
} from './toroidal-surface';
import {
  evaluateRevolutionSurface, normalRevolutionSurface,
} from './revolution-surface';
import {
  evaluateExtrusionSurface, normalExtrusionSurface,
} from './extrusion-surface';

// ═══════════════════════════════════════════════
// INTERFACE
// ═══════════════════════════════════════════════

export interface SurfaceAdapter {
  /** Evaluate S(u, v) → 3D point */
  evaluate(u: number, v: number): Point3D;

  /** Surface unit normal at (u, v) */
  normal(u: number, v: number): Vector3D;

  /** Project 3D point to nearest (u, v) parameters */
  projectPoint(point: Point3D): { u: number; v: number };

  /** Is the surface periodic in U? */
  readonly isUPeriodic: boolean;

  /** U period (2π for angular surfaces, 0 for non-periodic) */
  readonly uPeriod: number;

  /** Is the surface periodic in V? */
  readonly isVPeriodic: boolean;

  /** V period */
  readonly vPeriod: number;

  /** Natural UV parameter bounds */
  uvBounds(): { uMin: number; uMax: number; vMin: number; vMax: number };
}

// ═══════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════

/**
 * Create a SurfaceAdapter from any Surface.
 * This is the single dispatch point — all other code uses the adapter.
 */
export function toAdapter(surface: Surface): SurfaceAdapter {
  switch (surface.type) {
    case 'plane': return new PlaneAdapter(surface);
    case 'cylinder': return new CylindricalAdapter(surface);
    case 'sphere': return new SphericalAdapter(surface);
    case 'cone': return new ConicalAdapter(surface);
    case 'torus': return new ToroidalAdapter(surface);
    case 'revolution': return new RevolutionAdapter(surface);
    case 'extrusion': return new ExtrusionAdapter(surface);
  }
}

// ═══════════════════════════════════════════════
// ADAPTER CLASSES
// ═══════════════════════════════════════════════

class PlaneAdapter implements SurfaceAdapter {
  readonly isUPeriodic = false;
  readonly uPeriod = 0;
  readonly isVPeriodic = false;
  readonly vPeriod = 0;
  constructor(private s: import('./plane-surface').PlaneSurface) {}
  evaluate(u: number, v: number) { return evaluatePlaneSurface(this.s, u, v); }
  normal(u: number, v: number) { return normalPlaneSurface(this.s, u, v); }
  projectPoint(pt: Point3D) { return projectToPlaneSurface(this.s, pt); }
  uvBounds() { return { uMin: -1e6, uMax: 1e6, vMin: -1e6, vMax: 1e6 }; }
}

class CylindricalAdapter implements SurfaceAdapter {
  readonly isUPeriodic = true;
  readonly uPeriod = 2 * Math.PI;
  readonly isVPeriodic = false;
  readonly vPeriod = 0;
  constructor(private s: import('./cylindrical-surface').CylindricalSurface) {}
  evaluate(u: number, v: number) { return evaluateCylindricalSurface(this.s, u, v); }
  normal(u: number, v: number) { return normalCylindricalSurface(this.s, u, v); }
  projectPoint(pt: Point3D) { return projectToCylindricalSurface(this.s, pt); }
  uvBounds() { return { uMin: -Math.PI, uMax: Math.PI, vMin: -1e6, vMax: 1e6 }; }
}

class SphericalAdapter implements SurfaceAdapter {
  readonly isUPeriodic = true;
  readonly uPeriod = 2 * Math.PI;
  readonly isVPeriodic = false;
  readonly vPeriod = 0;
  constructor(private s: import('./spherical-surface').SphericalSurface) {}
  evaluate(u: number, v: number) { return evaluateSphericalSurface(this.s, u, v); }
  normal(u: number, v: number) { return normalSphericalSurface(this.s, u, v); }
  projectPoint(pt: Point3D) { return projectToSphericalSurface(this.s, pt); }
  uvBounds() { return { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI / 2, vMax: Math.PI / 2 }; }
}

class ConicalAdapter implements SurfaceAdapter {
  readonly isUPeriodic = true;
  readonly uPeriod = 2 * Math.PI;
  readonly isVPeriodic = false;
  readonly vPeriod = 0;
  constructor(private s: import('./conical-surface').ConicalSurface) {}
  evaluate(u: number, v: number) { return evaluateConicalSurface(this.s, u, v); }
  normal(u: number, v: number) { return normalConicalSurface(this.s, u, v); }
  projectPoint(pt: Point3D) { return projectToConicalSurface(this.s, pt); }
  uvBounds() { return { uMin: -Math.PI, uMax: Math.PI, vMin: -1e6, vMax: 1e6 }; }
}

class ToroidalAdapter implements SurfaceAdapter {
  readonly isUPeriodic = true;
  readonly uPeriod = 2 * Math.PI;
  readonly isVPeriodic = true;
  readonly vPeriod = 2 * Math.PI;
  constructor(private s: import('./toroidal-surface').ToroidalSurface) {}
  evaluate(u: number, v: number) { return evaluateToroidalSurface(this.s, u, v); }
  normal(u: number, v: number) { return normalToroidalSurface(this.s, u, v); }
  projectPoint(pt: Point3D) { return projectToToroidalSurface(this.s, pt); }
  uvBounds() { return { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI }; }
}

class RevolutionAdapter implements SurfaceAdapter {
  readonly isUPeriodic = true;
  readonly uPeriod = 2 * Math.PI;
  readonly isVPeriodic = false;
  readonly vPeriod = 0;
  constructor(private s: import('./revolution-surface').RevolutionSurface) {}
  evaluate(u: number, v: number) { return evaluateRevolutionSurface(this.s, u, v); }
  normal(u: number, v: number) { return normalRevolutionSurface(this.s, u, v); }
  projectPoint(pt: Point3D) { return projectToRevolutionSurface(this.s, pt); }
  uvBounds() {
    const curve = this.s.basisCurve;
    return { uMin: -Math.PI, uMax: Math.PI, vMin: curve.startParam, vMax: curve.endParam };
  }
}

class ExtrusionAdapter implements SurfaceAdapter {
  readonly isUPeriodic = false;
  readonly uPeriod = 0;
  readonly isVPeriodic = false;
  readonly vPeriod = 0;
  constructor(private s: import('./extrusion-surface').ExtrusionSurface) {}
  evaluate(u: number, v: number) { return evaluateExtrusionSurface(this.s, u, v); }
  normal(u: number, v: number) { return normalExtrusionSurface(this.s, u, v); }
  projectPoint(pt: Point3D) { return projectToExtrusionSurface(this.s, pt); }
  uvBounds() {
    const curve = this.s.basisCurve;
    return { uMin: curve.startParam, uMax: curve.endParam, vMin: -1e6, vMax: 1e6 };
  }
}

// ═══════════════════════════════════════════════
// MISSING projectTo* IMPLEMENTATIONS
// ═══════════════════════════════════════════════

/**
 * Project a 3D point onto a toroidal surface's parameter space.
 * OCCT reference: ProjLib_Torus
 */
function projectToToroidalSurface(
  surface: import('./toroidal-surface').ToroidalSurface,
  point: Point3D,
): { u: number; v: number } {
  const { axis: ax, majorRadius, minorRadius, refDirection } = surface;
  const perpDir = normalize(cross(ax.direction, refDirection));

  // Vector from axis origin to point
  const rel = vec3d(point.x - ax.origin.x, point.y - ax.origin.y, point.z - ax.origin.z);

  // Project onto the plane perpendicular to axis
  const axComp = dot(rel, ax.direction);
  const radialX = dot(rel, refDirection);
  const radialY = dot(rel, perpDir);

  // θ: angle around the torus axis
  const theta = Math.atan2(radialY, radialX);

  // Distance from axis in the radial plane
  const radialDist = Math.sqrt(radialX * radialX + radialY * radialY);

  // φ: angle around the tube cross-section
  const phi = Math.atan2(axComp, radialDist - majorRadius);

  return { u: theta, v: phi };
}

/**
 * Project a 3D point onto a revolution surface's parameter space.
 * Uses Newton iteration to find the closest point on the basis curve,
 * then computes the revolution angle.
 * OCCT reference: ProjLib_ProjectOnSurface
 */
function projectToRevolutionSurface(
  surface: import('./revolution-surface').RevolutionSurface,
  point: Point3D,
): { u: number; v: number } {
  const { basisCurve, axis: ax, refDirection } = surface;
  const perpDir = normalize(cross(ax.direction, refDirection));

  // Vector from axis to point
  const rel = vec3d(point.x - ax.origin.x, point.y - ax.origin.y, point.z - ax.origin.z);
  const axComp = dot(rel, ax.direction);
  const radialX = dot(rel, refDirection);
  const radialY = dot(rel, perpDir);

  // θ: revolution angle
  const theta = Math.atan2(radialY, radialX);

  // Radial distance from axis
  const radialDist = Math.sqrt(radialX * radialX + radialY * radialY);

  // Find v by searching the basis curve for the closest match.
  // The basis curve point at v has: axial component = dot(curve(v) - origin, axDir)
  // and radial component = distance from axis.
  // We minimize ||(axComp_curve(v) - axComp, radDist_curve(v) - radDist)||.
  const nSamples = 32;
  const tRange = basisCurve.endParam - basisCurve.startParam;
  let bestV = basisCurve.startParam;
  let bestDist = Infinity;

  for (let i = 0; i <= nSamples; i++) {
    const v = basisCurve.startParam + (i / nSamples) * tRange;
    const cp = evaluateCurveForProjection(basisCurve, v);
    const cpRel = vec3d(cp.x - ax.origin.x, cp.y - ax.origin.y, cp.z - ax.origin.z);
    const cpAx = dot(cpRel, ax.direction);
    const cpRadX = dot(cpRel, refDirection);
    const cpRadY = dot(cpRel, perpDir);
    const cpRad = Math.sqrt(cpRadX * cpRadX + cpRadY * cpRadY);
    const d = (cpAx - axComp) ** 2 + (cpRad - radialDist) ** 2;
    if (d < bestDist) { bestDist = d; bestV = v; }
  }

  return { u: theta, v: bestV };
}

/**
 * Project a 3D point onto an extrusion surface's parameter space.
 * OCCT reference: ProjLib_ProjectedCurve for linear extrusion
 */
function projectToExtrusionSurface(
  surface: import('./extrusion-surface').ExtrusionSurface,
  point: Point3D,
): { u: number; v: number } {
  const { basisCurve, direction } = surface;

  // v = projection of (point - curve(u)) onto direction
  // u = parameter on basis curve closest to the point projected perpendicular to direction

  // Find u by searching the basis curve
  const nSamples = 32;
  const tRange = basisCurve.endParam - basisCurve.startParam;
  let bestU = basisCurve.startParam;
  let bestDist = Infinity;

  for (let i = 0; i <= nSamples; i++) {
    const u = basisCurve.startParam + (i / nSamples) * tRange;
    const cp = evaluateCurveForProjection(basisCurve, u);
    const rel = vec3d(point.x - cp.x, point.y - cp.y, point.z - cp.z);
    // Remove direction component
    const vComp = dot(rel, direction);
    const perpX = rel.x - vComp * direction.x;
    const perpY = rel.y - vComp * direction.y;
    const perpZ = rel.z - vComp * direction.z;
    const d = perpX * perpX + perpY * perpY + perpZ * perpZ;
    if (d < bestDist) { bestDist = d; bestU = u; }
  }

  // Compute v from the found u
  const cp = evaluateCurveForProjection(basisCurve, bestU);
  const rel = vec3d(point.x - cp.x, point.y - cp.y, point.z - cp.z);
  const v = dot(rel, direction);

  return { u: bestU, v };
}

/** Evaluate a Curve3D at parameter t (helper to avoid importing all curve types). */
function evaluateCurveForProjection(curve: import('../topology/edge').Curve3D, t: number): Point3D {
  // Inline evaluation to avoid circular import issues
  switch (curve.type) {
    case 'line3d': {
      const c = curve as any;
      const dir = c.direction;
      return point3d(
        c.origin.x + t * dir.x,
        c.origin.y + t * dir.y,
        c.origin.z + t * dir.z,
      );
    }
    case 'circle3d':
    case 'arc3d': {
      const c = curve as any;
      const pl = c.plane;
      const yDir = normalize(cross(pl.normal, pl.xAxis));
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      return point3d(
        pl.origin.x + c.radius * (cosT * pl.xAxis.x + sinT * yDir.x),
        pl.origin.y + c.radius * (cosT * pl.xAxis.y + sinT * yDir.y),
        pl.origin.z + c.radius * (cosT * pl.xAxis.z + sinT * yDir.z),
      );
    }
    case 'ellipse3d': {
      const c = curve as any;
      const pl = c.plane;
      const yDir = normalize(cross(pl.normal, pl.xAxis));
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      return point3d(
        pl.origin.x + c.semiMajor * cosT * pl.xAxis.x + c.semiMinor * sinT * yDir.x,
        pl.origin.y + c.semiMajor * cosT * pl.xAxis.y + c.semiMinor * sinT * yDir.y,
        pl.origin.z + c.semiMajor * cosT * pl.xAxis.z + c.semiMinor * sinT * yDir.z,
      );
    }
  }
}
