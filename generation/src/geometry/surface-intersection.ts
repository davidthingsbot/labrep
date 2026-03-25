/**
 * General Surface-Surface Intersection (SSI) via predictor-corrector marching.
 *
 * Traces intersection curves numerically for ANY surface pair by:
 * 1. Finding seed points where the two surfaces meet
 * 2. Marching along the intersection curve using:
 *    - Predictor: step along tangent direction (cross of surface normals)
 *    - Corrector: Newton-Raphson to snap back onto both surfaces
 * 3. Adaptive step size based on curvature
 *
 * Result: polyline of (u1, v1, u2, v2, x, y, z) samples.
 *
 * Based on OCCT's IntWalk_PWalking algorithm.
 * See: library/opencascade/src/ModelingAlgorithms/TKGeomAlgo/IntWalk/IntWalk_PWalking.cxx
 */
import {
  Point3D, point3d, Vector3D, vec3d,
  dot, cross, normalize, distance, subtractPoints,
} from '../core';
import { evaluatePlaneSurface, normalPlaneSurface, projectToPlaneSurface, PlaneSurface } from '../surfaces/plane-surface';
import { evaluateSphericalSurface, normalSphericalSurface, projectToSphericalSurface, SphericalSurface } from '../surfaces/spherical-surface';
import { evaluateCylindricalSurface, normalCylindricalSurface, projectToCylindricalSurface, CylindricalSurface } from '../surfaces/cylindrical-surface';
import { evaluateConicalSurface, normalConicalSurface, projectToConicalSurface, ConicalSurface } from '../surfaces/conical-surface';
import type { Surface } from '../topology/face';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

/**
 * A point on the intersection curve, with UV coordinates on both surfaces.
 *
 * OCCT reference: IntSurf_PntOn2S
 */
export interface SSIPoint {
  /** 3D position */
  readonly point: Point3D;
  /** Parameter on surface A */
  readonly u1: number;
  readonly v1: number;
  /** Parameter on surface B */
  readonly u2: number;
  readonly v2: number;
}

/**
 * A single intersection curve — a polyline of SSIPoints.
 *
 * OCCT reference: IntPatch_WLine (Walking Line)
 */
export interface SSICurve {
  /** Ordered sample points along the curve */
  readonly points: readonly SSIPoint[];
  /** True if the curve forms a closed loop */
  readonly isClosed: boolean;
}

/**
 * Result of surface-surface intersection.
 */
export interface SSIResult {
  /** Intersection curves (may be 0, 1, or multiple) */
  readonly curves: readonly SSICurve[];
}

// ═══════════════════════════════════════════════
// SURFACE DISPATCH — evaluate, normal, project
// ═══════════════════════════════════════════════

function evalSurface(s: Surface, u: number, v: number): Point3D | null {
  switch (s.type) {
    case 'plane': return evaluatePlaneSurface(s, u, v);
    case 'sphere': return evaluateSphericalSurface(s, u, v);
    case 'cylinder': return evaluateCylindricalSurface(s, u, v);
    case 'cone': return evaluateConicalSurface(s, u, v);
    default: return null;
  }
}

function normalSurface(s: Surface, u: number, v: number): Vector3D | null {
  switch (s.type) {
    case 'plane': return normalPlaneSurface(s, u, v);
    case 'sphere': return normalSphericalSurface(s, u, v);
    case 'cylinder': return normalCylindricalSurface(s, u, v);
    case 'cone': return normalConicalSurface(s, u, v);
    default: return null;
  }
}

function projectToSurface(s: Surface, pt: Point3D): { u: number; v: number } | null {
  switch (s.type) {
    case 'plane': return projectToPlaneSurface(s, pt);
    case 'sphere': return projectToSphericalSurface(s, pt);
    case 'cylinder': return projectToCylindricalSurface(s, pt);
    case 'cone': return projectToConicalSurface(s, pt);
    default: return null;
  }
}

/** Get the natural UV bounds for a surface. */
function surfaceBounds(s: Surface): { uMin: number; uMax: number; vMin: number; vMax: number } {
  switch (s.type) {
    case 'plane':
      return { uMin: -100, uMax: 100, vMin: -100, vMax: 100 };
    case 'sphere':
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI / 2, vMax: Math.PI / 2 };
    case 'cylinder':
    case 'cone':
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -20, vMax: 20 };
    default:
      return { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI };
  }
}

// ═══════════════════════════════════════════════
// SEED FINDING
// ═══════════════════════════════════════════════

/**
 * Estimate the 3D spatial scale of the surfaces by sampling corner points.
 * Used to scale tolerances for large/small geometry.
 */
function estimateSpatialScale(
  surfA: Surface, boundsA: ReturnType<typeof surfaceBounds>,
  surfB: Surface, boundsB: ReturnType<typeof surfaceBounds>,
): number {
  let maxDist = 1;
  for (const [surf, bounds] of [[surfA, boundsA], [surfB, boundsB]] as const) {
    const uMid = (bounds.uMin + bounds.uMax) / 2;
    const vMid = (bounds.vMin + bounds.vMax) / 2;
    const p0 = evalSurface(surf, uMid, vMid);
    const p1 = evalSurface(surf, bounds.uMin, bounds.vMin);
    if (p0 && p1) {
      const d = distance(p0, p1);
      if (d > maxDist) maxDist = d;
    }
  }
  return maxDist;
}

/**
 * Estimate the 3D distance between adjacent grid cells on a surface.
 * This tells us how far apart seed samples are in world space.
 */
function estimateGridCellSize(surf: Surface, bounds: ReturnType<typeof surfaceBounds>): number {
  const uMid = (bounds.uMin + bounds.uMax) / 2;
  const vMid = (bounds.vMin + bounds.vMax) / 2;
  const du = (bounds.uMax - bounds.uMin) / SEED_GRID;
  const dv = (bounds.vMax - bounds.vMin) / SEED_GRID;
  const p0 = evalSurface(surf, uMid, vMid);
  const p1 = evalSurface(surf, uMid + du, vMid);
  const p2 = evalSurface(surf, uMid, vMid + dv);
  if (!p0 || !p1 || !p2) return 1;
  return Math.max(distance(p0, p1), distance(p0, p2));
}

const SEED_GRID = 30; // Grid resolution for seed finding
const SEED_TOL = 0.2; // Distance tolerance for seed candidates
const NEWTON_TOL = 1e-10; // Newton-Raphson convergence tolerance
const NEWTON_MAX = 50; // Max Newton iterations

/**
 * Find seed points where the two surfaces approximately meet.
 *
 * Uses spatial hashing to find closest-pair points between two surface grids.
 * This avoids the projection-to-nearest-point problem that misses far-side
 * intersections (e.g., second intersection line of parallel cylinders).
 *
 * Algorithm:
 * 1. Sample both surfaces on their UV grids → two sets of 3D points
 * 2. Hash all points from surface B into spatial bins
 * 3. For each point from surface A, check nearby bins for close B-points
 * 4. Refine close pairs with Newton-Raphson
 */
function findSeeds(
  surfA: Surface, surfB: Surface,
  boundsA: ReturnType<typeof surfaceBounds>,
  boundsB: ReturnType<typeof surfaceBounds>,
): SSIPoint[] {
  type GridPt = { pt: Point3D; u: number; v: number };

  // Sample both surfaces
  const gridA = sampleSurfaceGrid(surfA, boundsA);
  const gridB = sampleSurfaceGrid(surfB, boundsB);

  if (gridA.length === 0 || gridB.length === 0) return [];

  // Determine bin size from grid density
  const cellA = estimateGridCellSize(surfA, boundsA);
  const cellB = estimateGridCellSize(surfB, boundsB);
  const binSize = Math.max(cellA, cellB) * 0.8;
  const searchTol = binSize; // Points within one bin size are candidates

  // Hash B-points into spatial bins
  const bins = new Map<string, GridPt[]>();
  for (const gp of gridB) {
    const key = `${Math.floor(gp.pt.x / binSize)},${Math.floor(gp.pt.y / binSize)},${Math.floor(gp.pt.z / binSize)}`;
    const list = bins.get(key) || [];
    list.push(gp);
    bins.set(key, list);
  }

  // Find close pairs
  const seeds: SSIPoint[] = [];

  for (const gpA of gridA) {
    const bx = Math.floor(gpA.pt.x / binSize);
    const by = Math.floor(gpA.pt.y / binSize);
    const bz = Math.floor(gpA.pt.z / binSize);

    // Check 3×3×3 neighborhood
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${bx + dx},${by + dy},${bz + dz}`;
          const list = bins.get(key);
          if (!list) continue;

          for (const gpB of list) {
            const d = distance(gpA.pt, gpB.pt);
            if (d > searchTol) continue;

            // Refine with Newton-Raphson
            const refined = refineIntersectionPoint(surfA, surfB, gpA.u, gpA.v, gpB.u, gpB.v);
            if (!refined) continue;

            const pA = evalSurface(surfA, refined.u1, refined.v1);
            const pB = evalSurface(surfB, refined.u2, refined.v2);
            if (!pA || !pB) continue;
            if (distance(pA, pB) > 1e-3) continue;

            // Deduplicate
            const tooClose = seeds.some(s => distance(s.point, pA) < searchTol * 0.5);
            if (tooClose) continue;

            seeds.push({
              point: pA,
              u1: refined.u1, v1: refined.v1,
              u2: refined.u2, v2: refined.v2,
            });
          }
        }
      }
    }
  }

  return seeds;
}

/** Sample a surface on its UV grid, returning 3D points with UV coordinates. */
function sampleSurfaceGrid(
  surf: Surface,
  bounds: ReturnType<typeof surfaceBounds>,
): { pt: Point3D; u: number; v: number }[] {
  const points: { pt: Point3D; u: number; v: number }[] = [];
  const du = (bounds.uMax - bounds.uMin) / SEED_GRID;
  const dv = (bounds.vMax - bounds.vMin) / SEED_GRID;

  for (let i = 0; i <= SEED_GRID; i++) {
    for (let j = 0; j <= SEED_GRID; j++) {
      const u = bounds.uMin + i * du;
      const v = bounds.vMin + j * dv;
      const pt = evalSurface(surf, u, v);
      if (pt) points.push({ pt, u, v });
    }
  }
  return points;
}

// ═══════════════════════════════════════════════
// NEWTON-RAPHSON CORRECTOR
// ═══════════════════════════════════════════════

/**
 * Refine an approximate intersection point using Newton-Raphson.
 *
 * Solves: SA(u1, v1) = SB(u2, v2) by minimizing |SA - SB|².
 *
 * Uses OCCT's isoparametric trick: fix u1, solve for (v1, u2, v2), then
 * switch to fixing v1, etc. This reduces 4D to 3D at each iteration.
 *
 * Simplified approach: gradient descent on |SA(u1,v1) - SB(u2,v2)|²
 * with finite-difference Jacobian.
 */
function refineIntersectionPoint(
  surfA: Surface, surfB: Surface,
  u1: number, v1: number, u2: number, v2: number,
): { u1: number; v1: number; u2: number; v2: number } | null {
  let cu1 = u1, cv1 = v1, cu2 = u2, cv2 = v2;
  const h = 1e-7;

  for (let iter = 0; iter < NEWTON_MAX; iter++) {
    const pA = evalSurface(surfA, cu1, cv1);
    const pB = evalSurface(surfB, cu2, cv2);
    if (!pA || !pB) return null;

    const dx = pA.x - pB.x, dy = pA.y - pB.y, dz = pA.z - pB.z;
    const err = dx * dx + dy * dy + dz * dz;
    if (err < NEWTON_TOL * NEWTON_TOL) {
      return { u1: cu1, v1: cv1, u2: cu2, v2: cv2 };
    }

    // Compute gradient of |SA - SB|² w.r.t. [u1, v1, u2, v2]
    const pA_du = evalSurface(surfA, cu1 + h, cv1);
    const pA_dv = evalSurface(surfA, cu1, cv1 + h);
    const pB_du = evalSurface(surfB, cu2 + h, cv2);
    const pB_dv = evalSurface(surfB, cu2, cv2 + h);
    if (!pA_du || !pA_dv || !pB_du || !pB_dv) return null;

    const g = [
      2 * (dx * (pA_du.x - pA.x) / h + dy * (pA_du.y - pA.y) / h + dz * (pA_du.z - pA.z) / h),
      2 * (dx * (pA_dv.x - pA.x) / h + dy * (pA_dv.y - pA.y) / h + dz * (pA_dv.z - pA.z) / h),
      -2 * (dx * (pB_du.x - pB.x) / h + dy * (pB_du.y - pB.y) / h + dz * (pB_du.z - pB.z) / h),
      -2 * (dx * (pB_dv.x - pB.x) / h + dy * (pB_dv.y - pB.y) / h + dz * (pB_dv.z - pB.z) / h),
    ];

    const gNorm = Math.sqrt(g[0] ** 2 + g[1] ** 2 + g[2] ** 2 + g[3] ** 2);
    if (gNorm < 1e-15) return null;

    // Steepest descent with Barzilai-Borwein step size
    const step = Math.min(err / (gNorm * gNorm) * gNorm, 0.5);
    cu1 -= step * g[0] / gNorm;
    cv1 -= step * g[1] / gNorm;
    cu2 -= step * g[2] / gNorm;
    cv2 -= step * g[3] / gNorm;
  }

  const pA = evalSurface(surfA, cu1, cv1);
  const pB = evalSurface(surfB, cu2, cv2);
  if (!pA || !pB) return null;
  if (distance(pA, pB) < 1e-3) {
    return { u1: cu1, v1: cv1, u2: cu2, v2: cv2 };
  }
  return null;
}

// ═══════════════════════════════════════════════
// MARCHING (PREDICTOR-CORRECTOR)
// ═══════════════════════════════════════════════

const MARCH_STEP = 0.05; // Initial step size in 3D space
const MARCH_MIN_STEP = 1e-5;
const MARCH_MAX_STEP = 0.5;
const MARCH_MAX_POINTS = 2000;
const CURVE_CLOSE_TOL = 1e-3; // Tolerance for detecting loop closure

/**
 * March from a seed point in one direction along the intersection curve.
 *
 * At each step:
 * 1. Compute tangent T = normalize(cross(normalA, normalB))
 * 2. Predictor: step along T, project back to both surfaces
 * 3. Corrector: Newton-Raphson to snap onto intersection
 * 4. Accept or reject based on step quality
 */
function marchFromSeed(
  surfA: Surface, surfB: Surface,
  seed: SSIPoint,
  direction: 1 | -1,
  boundsA: ReturnType<typeof surfaceBounds>,
  boundsB: ReturnType<typeof surfaceBounds>,
  existingPoints: SSIPoint[],
  initialStep: number = MARCH_STEP,
): SSIPoint[] {
  const points: SSIPoint[] = [];
  let current = seed;
  let stepSize = initialStep;

  for (let iter = 0; iter < MARCH_MAX_POINTS; iter++) {
    // Get surface normals at current point
    const nA = normalSurface(surfA, current.u1, current.v1);
    const nB = normalSurface(surfB, current.u2, current.v2);
    if (!nA || !nB) break;

    // Tangent direction: perpendicular to both normals
    const tangent = cross(nA, nB);
    const tLen = Math.sqrt(tangent.x ** 2 + tangent.y ** 2 + tangent.z ** 2);
    if (tLen < 1e-12) break; // Normals are parallel — tangent point

    const T = vec3d(
      direction * tangent.x / tLen,
      direction * tangent.y / tLen,
      direction * tangent.z / tLen,
    );

    // Predictor: step along tangent in 3D
    const predicted3D = point3d(
      current.point.x + stepSize * T.x,
      current.point.y + stepSize * T.y,
      current.point.z + stepSize * T.z,
    );

    // Project predicted point onto both surfaces
    const uvA = projectToSurface(surfA, predicted3D);
    const uvB = projectToSurface(surfB, predicted3D);
    if (!uvA || !uvB) break;

    // Corrector: refine to exact intersection
    const refined = refineIntersectionPoint(surfA, surfB, uvA.u, uvA.v, uvB.u, uvB.v);
    if (!refined) {
      // Corrector failed — try smaller step
      stepSize *= 0.5;
      if (stepSize < MARCH_MIN_STEP) break;
      continue;
    }

    const nextPt = evalSurface(surfA, refined.u1, refined.v1);
    if (!nextPt) break;

    // Check corrector quality
    const ptB = evalSurface(surfB, refined.u2, refined.v2);
    if (!ptB || distance(nextPt, ptB) > 1e-3) {
      stepSize *= 0.5;
      if (stepSize < MARCH_MIN_STEP) break;
      continue;
    }

    const next: SSIPoint = {
      point: nextPt,
      u1: refined.u1, v1: refined.v1,
      u2: refined.u2, v2: refined.v2,
    };

    // Check if we've closed the loop (returned to seed or near an existing point)
    if (points.length > 5) {
      const dToSeed = distance(next.point, seed.point);

      // Check against seed (loop closure).
      // Use a tolerance proportional to step size to avoid overshoot issues.
      // Snap to the exact seed point for clean closure (eliminates gap).
      if (dToSeed < Math.max(CURVE_CLOSE_TOL, stepSize * 2)) {
        points.push(seed);
        return points; // Closed loop!
      }

      // Also check: if we've gone past the seed (distance was decreasing, now increasing),
      // we've overshot. Use the seed point itself as the closure point for precision.
      if (points.length > 10) {
        const prevDist = distance(points[points.length - 1].point, seed.point);
        if (prevDist < stepSize * 5 && dToSeed > prevDist) {
          // We just passed the seed — snap the last point to the seed for clean closure
          points.push(seed);
          return points;
        }
      }

      // Check against existing points from opposite march direction
      for (const ep of existingPoints) {
        if (distance(next.point, ep.point) < Math.max(CURVE_CLOSE_TOL, stepSize * 2)) {
          points.push(next);
          return points; // Met the other direction
        }
      }
    }

    // Check UV bounds — stop if we leave the surface domain
    if (outOfBounds(refined.u1, refined.v1, boundsA) ||
        outOfBounds(refined.u2, refined.v2, boundsB)) {
      // Still add the boundary point
      points.push(next);
      break;
    }

    // Adaptive step size based on curvature
    if (points.length > 0) {
      const prev = points[points.length - 1];
      const actualStep = distance(prev.point, next.point);
      if (actualStep < stepSize * 0.3) {
        stepSize = Math.min(stepSize * 1.5, MARCH_MAX_STEP);
      } else if (actualStep > stepSize * 3) {
        stepSize *= 0.5;
      }
    }

    points.push(next);
    current = next;
  }

  return points;
}

function outOfBounds(
  u: number, v: number,
  bounds: ReturnType<typeof surfaceBounds>,
): boolean {
  const margin = 0.01;
  return u < bounds.uMin - margin || u > bounds.uMax + margin ||
         v < bounds.vMin - margin || v > bounds.vMax + margin;
}

// ═══════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════

/**
 * Compute the intersection curves between two surfaces.
 *
 * Uses a predictor-corrector marching algorithm (OCCT's IntWalk_PWalking pattern):
 * 1. Find seed points by grid sampling + Newton refinement
 * 2. March from each seed in both directions
 * 3. Detect closed loops and merge curves
 *
 * Works for ANY surface pair that has evaluate, normal, and projectTo functions.
 *
 * @param surfA - First surface
 * @param surfB - Second surface
 * @returns Intersection curves with UV coordinates on both surfaces
 */
export function intersectSurfaces(surfA: Surface, surfB: Surface): SSIResult {
  const boundsA = surfaceBounds(surfA);
  const boundsB = surfaceBounds(surfB);

  // Scale march step with geometry size. Use a fraction of the smaller grid cell.
  // For standard geometry (cell ~0.2-1), this stays at MARCH_STEP.
  // For large geometry (cell ~20), step scales up to avoid fragmented curves.
  const cellA = estimateGridCellSize(surfA, boundsA);
  const cellB = estimateGridCellSize(surfB, boundsB);
  const smallCell = Math.min(cellA, cellB);
  const scaledMarchStep = smallCell > 2 ? smallCell * 0.1 : MARCH_STEP;

  // Find seed points (samples both A→B and B→A)
  const seeds = findSeeds(surfA, surfB, boundsA, boundsB);
  if (seeds.length === 0) {
    return { curves: [] };
  }


  // March from each seed to trace complete curves
  const curves: SSICurve[] = [];
  const usedSeeds = new Set<number>();

  for (let si = 0; si < seeds.length; si++) {
    if (usedSeeds.has(si)) continue;
    usedSeeds.add(si);

    const seed = seeds[si];

    // March forward
    const forward = marchFromSeed(surfA, surfB, seed, 1, boundsA, boundsB, [], scaledMarchStep);

    // Check if forward march closed the loop.
    // Use a generous tolerance — the march's internal closure detection already
    // verified this was a legitimate loop return, not a random approach.
    const closeTol = MARCH_STEP * 3;
    const forwardClosed = forward.length > 5 &&
      distance(forward[forward.length - 1].point, seed.point) < closeTol;

    let allPoints: SSIPoint[];
    let isClosed: boolean;

    if (forwardClosed) {
      allPoints = [seed, ...forward];
      isClosed = true;
    } else {
      // March backward from seed
      const backward = marchFromSeed(surfA, surfB, seed, -1, boundsA, boundsB, forward, scaledMarchStep);

      // Check if backward met forward (full closure via two directions)
      const backwardMetForward = backward.length > 0 && forward.length > 0 &&
        distance(backward[backward.length - 1].point, forward[forward.length - 1].point) < closeTol;

      // Assemble: backward(reversed) + seed + forward
      allPoints = [...backward.reverse(), seed, ...forward];
      isClosed = backwardMetForward;
    }

    if (allPoints.length < 3) continue; // Too few points — skip

    // Filter out degenerate curves — if all points are clustered at one spot
    // (tangent point), this isn't a real intersection curve.
    const span = allPoints.reduce((max, pt) =>
      Math.max(max, distance(pt.point, allPoints[0].point)), 0);
    if (span < scaledMarchStep * 2) continue;

    // Mark seeds that are close to this curve as "used"
    for (let sj = si + 1; sj < seeds.length; sj++) {
      if (usedSeeds.has(sj)) continue;
      for (const pt of allPoints) {
        if (distance(pt.point, seeds[sj].point) < scaledMarchStep * 2) {
          usedSeeds.add(sj);
          break;
        }
      }
    }

    curves.push({ points: allPoints, isClosed });
  }

  return { curves };
}
