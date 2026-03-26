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
import { type SurfaceAdapter, toAdapter } from '../surfaces/surface-adapter';
import type { Edge } from './edge';

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
export function evaluateCurve2D(curve: Curve2D, t: number): { x: number; y: number } {
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
  return toAdapter(pcurve.surface).evaluate(uv.x, uv.y);
}

/**
 * Project a 3D point to a surface's (u, v) parameter space.
 *
 * @param surface - The surface
 * @param point - 3D point to project
 * @returns UV parameters
 */
function projectToSurface(surface: Surface, point: Point3D): { u: number; v: number } {
  return toAdapter(surface).projectPoint(point);
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

  const adapter = toAdapter(surface);
  const centerUV = adapter.projectPoint(circle.center);

  if (!adapter.isUPeriodic) {
    // Non-periodic surface (plane): circle remains a Circle2D in UV space
    const circle2d = makeCircle2D({ x: centerUV.u, y: centerUV.v }, circle.radius);
    if (!circle2d.result) return null;
    return circle2d.result;
  }

  // For periodic surfaces (cylinder, sphere, cone): a circle of constant
  // latitude/height maps to a horizontal line in (θ, v) parameter space.
  // The line goes from θ=0 to θ=2π at constant v.

  // The PCurve is a line in parameter space from (0, v) to (2π, v)
  // where v is the constant parameter (height for cylinder, latitude for sphere, etc.)
  const v = centerUV.v;
  const line2d = makeLine2D({ x: 0, y: v }, { x: 2 * Math.PI, y: v });
  if (!line2d.result) return null;
  return line2d.result;
}

// ═══════════════════════════════════════════════
// PCURVE BUILDING FOR EDGES
// ═══════════════════════════════════════════════

/**
 * Build a PCurve for an edge on a given surface by projecting endpoints to UV
 * and creating a Line2D between them.
 *
 * For closed curves on periodic surfaces, the PCurve spans the full U period
 * (e.g., a horizontal line from u=0 to u=2π at constant v for a circle on
 * a cylinder).
 *
 * For seam edges (same 3D edge appearing twice on a face), the second
 * occurrence needs `seamOccurrence=1` to get a shifted PCurve at u+2π.
 *
 * OCCT reference: BRepLib::BuildPCurveForEdgeOnPlane, GeomProjLib::Curve2d
 *
 * @param edge - The 3D edge
 * @param surface - The surface the edge lies on
 * @param forward - Wire traversal direction for this edge
 * @param seamOccurrence - 0 for first occurrence, 1 for second (shifted by period)
 * @returns PCurve, or null if construction fails
 */
export function buildPCurveForEdgeOnSurface(
  edge: Edge,
  surface: Surface,
  forward: boolean,
  seamOccurrence: number = 0,
): PCurve | null {
  const adapter = toAdapter(surface);
  const startPt = edge.startVertex.point;
  const endPt = edge.endVertex.point;

  // Project endpoints to UV
  let startUV = adapter.projectPoint(startPt);
  let endUV = adapter.projectPoint(endPt);

  if (adapter.isUPeriodic && edge.curve.isClosed) {
    // Closed curve on periodic surface (e.g., circle on cylinder):
    // PCurve is a horizontal line spanning the full U period.
    // The V coordinate is constant (same for start and end since the curve
    // lies at a constant height/latitude).
    const v = startUV.v;
    const uStart = seamOccurrence === 0 ? 0 : adapter.uPeriod;
    const uEnd = uStart + adapter.uPeriod;
    // PCurve in edge geometric direction (always forward).
    // Wire direction handled by getEdgeUV.
    const u0 = uStart;
    const u1 = uEnd;
    const line2d = makeLine2D({ x: u0, y: v }, { x: u1, y: v });
    if (!line2d.result) return null;
    return makePCurve(line2d.result, surface);
  }

  if (adapter.isUPeriodic) {
    // Open edge on periodic surface: unwrap U for continuity
    // Ensure endUV.u is within π of startUV.u
    while (endUV.u - startUV.u > Math.PI) endUV = { u: endUV.u - adapter.uPeriod, v: endUV.v };
    while (startUV.u - endUV.u > Math.PI) endUV = { u: endUV.u + adapter.uPeriod, v: endUV.v };

    // For seam edges (second occurrence), shift by one period
    if (seamOccurrence > 0) {
      startUV = { u: startUV.u + adapter.uPeriod, v: startUV.v };
      endUV = { u: endUV.u + adapter.uPeriod, v: endUV.v };
    }
  }

  // PCurve always goes in edge geometric direction (startVertex → endVertex).
  // Wire traversal direction is handled by the consumer (getEdgeUV swaps if needed).
  // This matches OCCT where BRep_CurveOnSurface stores the curve in edge direction.
  const line2d = makeLine2D({ x: startUV.u, y: startUV.v }, { x: endUV.u, y: endUV.v });
  if (!line2d.result) return null;
  return makePCurve(line2d.result, surface);
}

