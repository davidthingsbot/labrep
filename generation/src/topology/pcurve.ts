import { Point3D, point3d, Vector3D } from '../core';
import {
  Curve2D, evaluateLine2D, evaluateArc2D, evaluateCircle2D,
  makeLine2D, makeCircle2D,
} from '../geometry';
import type { PlaneCircleIntersection } from '../geometry/intersections3d';
import type { Line2D } from '../geometry/line2d';
import type { Arc2D } from '../geometry/arc2d';
import type { Circle2D } from '../geometry/circle2d';
import { Surface } from './face';
import {
  evaluatePlaneSurface, projectToPlaneSurface,
  evaluateCylindricalSurface, projectToCylindricalSurface,
  evaluateSphericalSurface, projectToSphericalSurface,
  evaluateConicalSurface, projectToConicalSurface,
  evaluateToroidalSurface,
  evaluateRevolutionSurface,
  evaluateExtrusionSurface,
} from '../surfaces';

/**
 * A parametric curve on a surface — the 2D representation of a 3D edge
 * in a surface's (u, v) parameter space.
 *
 * Evaluating surface.evaluate(curve2d(t)) produces the 3D point on the edge.
 *
 * OCCT reference: BRep_CurveOnSurface
 */
export interface PCurve {
  /** 2D curve in the surface's parameter space */
  readonly curve2d: Curve2D;

  /** The surface this curve lies on */
  readonly surface: Surface;
}

/**
 * Create a PCurve from a 2D curve and a surface.
 *
 * @param curve2d - Curve in the surface's (u, v) parameter space
 * @param surface - The surface the curve lies on
 * @returns PCurve
 */
export function makePCurve(curve2d: Curve2D, surface: Surface): PCurve {
  return { curve2d, surface };
}

/**
 * Evaluate a 2D curve at parameter t, returning the (u, v) point.
 */
function evaluateCurve2D(curve: Curve2D, t: number): { x: number; y: number } {
  switch (curve.type) {
    case 'line':
      return evaluateLine2D(curve as Line2D, t);
    case 'arc':
      return evaluateArc2D(curve as Arc2D, t);
    case 'circle':
      return evaluateCircle2D(curve as Circle2D, t);
  }
}

/**
 * Evaluate a PCurve at parameter t, returning the 3D point on the surface.
 *
 * Computes surface.evaluate(curve2d(t).x, curve2d(t).y).
 *
 * @param pcurve - The PCurve to evaluate
 * @param t - Parameter value (in the curve2d's parameter domain)
 * @returns 3D point on the surface
 */
export function evaluatePCurve3D(pcurve: PCurve, t: number): Point3D {
  const uv = evaluateCurve2D(pcurve.curve2d, t);
  const { surface } = pcurve;

  switch (surface.type) {
    case 'plane':
      return evaluatePlaneSurface(surface, uv.x, uv.y);
    case 'cylinder':
      return evaluateCylindricalSurface(surface, uv.x, uv.y);
    case 'sphere':
      return evaluateSphericalSurface(surface, uv.x, uv.y);
    case 'cone':
      return evaluateConicalSurface(surface, uv.x, uv.y);
    case 'torus':
      return evaluateToroidalSurface(surface, uv.x, uv.y);
    case 'revolution':
      return evaluateRevolutionSurface(surface, uv.x, uv.y);
    case 'extrusion':
      return evaluateExtrusionSurface(surface, uv.x, uv.y);
  }
}

/**
 * Project a 3D point to a surface's (u, v) parameter space.
 *
 * @param surface - The surface
 * @param point - 3D point to project
 * @returns UV parameters
 */
function projectToSurface(surface: Surface, point: Point3D): { u: number; v: number } {
  switch (surface.type) {
    case 'plane':
      return projectToPlaneSurface(surface, point);
    case 'cylinder':
      return projectToCylindricalSurface(surface, point);
    case 'sphere':
      return projectToSphericalSurface(surface, point);
    case 'cone':
      return projectToConicalSurface(surface, point);
    default:
      // For torus, revolution, extrusion — not yet needed for Phase 13 scope
      throw new Error(`projectToSurface not implemented for surface type: ${surface.type}`);
  }
}

/**
 * Compute PCurves for a circular intersection curve on two surfaces.
 *
 * Given a 3D circle that lies on both surfaceA and surfaceB (the result of a
 * plane-surface intersection), compute the 2D parametric representation of that
 * circle on each surface.
 *
 * The PCurve parameter is θ ∈ [0, 2π), matching the circle's angular parametrization.
 *
 * Based on OCCT IntTools_FaceFace + GeomInt_IntSS::BuildPCurves.
 *
 * @param circle - The 3D intersection circle
 * @param surfaceA - First surface (typically a plane)
 * @param surfaceB - Second surface (typically a curved surface)
 * @returns PCurves on each surface, or null if construction fails
 */
export function computeIntersectionPCurves(
  circle: PlaneCircleIntersection,
  surfaceA: Surface,
  surfaceB: Surface,
): { pcurveA: PCurve; pcurveB: PCurve } | null {
  const pcurveA = buildPCurveForCircle(circle, surfaceA);
  const pcurveB = buildPCurveForCircle(circle, surfaceB);

  if (!pcurveA || !pcurveB) return null;

  return {
    pcurveA: makePCurve(pcurveA, surfaceA),
    pcurveB: makePCurve(pcurveB, surfaceB),
  };
}

/**
 * Build a 2D curve in a surface's parameter space that represents a 3D circle.
 *
 * For a plane: the result is a Circle2D in (u, v) space.
 * For cylinder/sphere/cone: the result is a Line2D at constant v (or φ) in (θ, v) space,
 * since circles of constant latitude/height project to horizontal lines in parameter space.
 */
function buildPCurveForCircle(circle: PlaneCircleIntersection, surface: Surface): Curve2D | null {
  // Sample the circle at θ=0 and θ=π to get two representative UV points
  // Then determine the curve type based on the surface

  if (surface.type === 'plane') {
    // Circle on plane → Circle2D in (u, v) space
    const centerUV = projectToPlaneSurface(surface, circle.center);
    const circle2d = makeCircle2D({ x: centerUV.u, y: centerUV.v }, circle.radius);
    if (!circle2d.result) return null;
    return circle2d.result;
  }

  // For curved surfaces (cylinder, sphere, cone): a circle of constant
  // latitude/height maps to a horizontal line in (θ, v) parameter space.
  // The line goes from θ=0 to θ=2π at constant v.
  const centerUV = projectToSurface(surface, circle.center);

  // The PCurve is a line in parameter space from (0, v) to (2π, v)
  // where v is the constant parameter (height for cylinder, latitude for sphere, etc.)
  const v = centerUV.v;
  const line2d = makeLine2D({ x: 0, y: v }, { x: 2 * Math.PI, y: v });
  if (!line2d.result) return null;
  return line2d.result;
}
