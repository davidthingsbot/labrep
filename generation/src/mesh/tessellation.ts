import { Point3D, Vector3D, normalize, dot, cross, vec3d, subtractPoints } from '../core';
import { Mesh, createMesh, OperationResult, success, failure } from './mesh';
import { Solid } from '../topology/solid';
import { Face, Surface } from '../topology/face';
import { shellFaces } from '../topology/shell';
import { edgeStartPoint, edgeEndPoint } from '../topology/edge';
import {
  CylindricalSurface, evaluateCylindricalSurface, normalCylindricalSurface,
  SphericalSurface, evaluateSphericalSurface, normalSphericalSurface,
  ConicalSurface, evaluateConicalSurface, normalConicalSurface,
  ToroidalSurface, evaluateToroidalSurface, normalToroidalSurface,
  RevolutionSurface, evaluateRevolutionSurface, normalRevolutionSurface,
  ExtrusionSurface, evaluateExtrusionSurface, normalExtrusionSurface,
} from '../surfaces';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface TessellationOptions {
  /** Max chord-to-surface distance for curved faces (default: 0.1) */
  linearDeflection?: number;
  /** Max angle between adjacent normals in radians (default: π/12) */
  angularDeflection?: number;
  /** Min subdivisions per curved edge (default: 24) */
  minSegments?: number;
}

const DEFAULT_OPTIONS: Required<TessellationOptions> = {
  linearDeflection: 0.1,
  angularDeflection: Math.PI / 12,
  minSegments: 24,
};

// ═══════════════════════════════════════════════════════
// FACE TESSELLATION RESULT
// ═══════════════════════════════════════════════════════

interface FaceTessellation {
  vertices: number[];  // flat xyz
  normals: number[];   // flat xyz
  indices: number[];   // triangle indices (local to this face)
}

// ═══════════════════════════════════════════════════════
// WIRE VERTEX EXTRACTION
// ═══════════════════════════════════════════════════════

/**
 * Extract ordered 3D vertices from a face's outer wire.
 */
function wireVertices(face: Face): Point3D[] {
  const verts: Point3D[] = [];
  for (const oe of face.outerWire.edges) {
    const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    verts.push(pt);
  }
  return verts;
}

// ═══════════════════════════════════════════════════════
// PLANAR FACE TESSELLATION
// ═══════════════════════════════════════════════════════

/**
 * Sample points along a face's outer wire, subdividing curved edges.
 * For line edges: just the start point.
 * For circle/arc edges: subdivide into segments.
 */
function sampleWireForTessellation(face: Face, segments: number = 24): Point3D[] {
  const pts: Point3D[] = [];

  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;

    if (curve.type === 'circle3d') {
      // Full circle — sample N points
      const pl = curve.plane;
      const yAxis = cross(pl.normal, pl.xAxis);
      const n = segments;
      for (let i = 0; i < n; i++) {
        const angle = oe.forward
          ? (2 * Math.PI * i) / n
          : (2 * Math.PI * (n - i)) / n;
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        pts.push({
          x: pl.origin.x + curve.radius * (cosA * pl.xAxis.x + sinA * yAxis.x),
          y: pl.origin.y + curve.radius * (cosA * pl.xAxis.y + sinA * yAxis.y),
          z: pl.origin.z + curve.radius * (cosA * pl.xAxis.z + sinA * yAxis.z),
        });
      }
    } else if (curve.type === 'arc3d') {
      // Partial arc — subdivide
      const pl = curve.plane;
      const yAxis = cross(pl.normal, pl.xAxis);
      const startA = curve.startAngle;
      const endA = curve.endAngle;
      const range = endA - startA;
      const n = Math.max(Math.ceil(segments * Math.abs(range) / (2 * Math.PI)), 2);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const angle = oe.forward
          ? startA + range * t
          : endA - range * t;
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        pts.push({
          x: pl.origin.x + curve.radius * (cosA * pl.xAxis.x + sinA * yAxis.x),
          y: pl.origin.y + curve.radius * (cosA * pl.xAxis.y + sinA * yAxis.y),
          z: pl.origin.z + curve.radius * (cosA * pl.xAxis.z + sinA * yAxis.z),
        });
      }
    } else {
      // Line or other — just the start point
      const pt = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
      pts.push(pt);
    }
  }

  return pts;
}

function tessellatePlanarFace(face: Face): FaceTessellation | null {
  if (face.surface.type !== 'plane') return null;

  // Check if any edge is curved — if so, use sampled wire
  const hasCurvedEdge = face.outerWire.edges.some(
    oe => oe.edge.curve.type === 'circle3d' || oe.edge.curve.type === 'arc3d'
  );

  const verts = hasCurvedEdge ? sampleWireForTessellation(face) : wireVertices(face);
  if (verts.length < 3) return null;

  const n = face.surface.plane.normal;

  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (const v of verts) {
    vertices.push(v.x, v.y, v.z);
    normals.push(n.x, n.y, n.z);
  }

  // Fan triangulation from vertex 0
  for (let i = 1; i < verts.length - 1; i++) {
    indices.push(0, i, i + 1);
  }

  return { vertices, normals, indices };
}

// ═══════════════════════════════════════════════════════
// PARAMETRIC SURFACE TESSELLATION
// ═══════════════════════════════════════════════════════

type SurfaceEvaluator = (u: number, v: number) => Point3D;
type SurfaceNormalFn = (u: number, v: number) => Vector3D;

/**
 * Project a 3D point onto a cylindrical surface's (θ, v) parameters.
 */
function projectToCylinder(surface: CylindricalSurface, pt: Point3D): { u: number; v: number } {
  const { axis, refDirection } = surface;
  const perpDir = cross(axis.direction, refDirection);
  const rel = subtractPoints(pt, axis.origin);
  const v = dot(rel, axis.direction);
  const inPlane = vec3d(
    rel.x - v * axis.direction.x,
    rel.y - v * axis.direction.y,
    rel.z - v * axis.direction.z,
  );
  const u = Math.atan2(dot(inPlane, perpDir), dot(inPlane, refDirection));
  return { u, v };
}

/**
 * Project a 3D point onto a spherical surface's (θ, φ) parameters.
 */
function projectToSphere(surface: SphericalSurface, pt: Point3D): { u: number; v: number } {
  const { center, radius, axis, refDirection } = surface;
  const perpDir = cross(axis.direction, refDirection);
  const rel = vec3d(pt.x - center.x, pt.y - center.y, pt.z - center.z);
  const sinPhi = dot(rel, axis.direction) / radius;
  const phi = Math.asin(Math.max(-1, Math.min(1, sinPhi)));
  const inEquator = vec3d(
    rel.x - sinPhi * radius * axis.direction.x,
    rel.y - sinPhi * radius * axis.direction.y,
    rel.z - sinPhi * radius * axis.direction.z,
  );
  const theta = Math.atan2(dot(inEquator, perpDir), dot(inEquator, refDirection));
  return { u: theta, v: phi };
}

/**
 * Project a 3D point onto a conical surface's (θ, v) parameters.
 */
function projectToCone(surface: ConicalSurface, pt: Point3D): { u: number; v: number } {
  const { axis, radius, semiAngle, refDirection } = surface;
  const perpDir = cross(axis.direction, refDirection);
  const rel = subtractPoints(pt, axis.origin);
  const axialDist = dot(rel, axis.direction);
  const v = axialDist / Math.cos(semiAngle);
  const inPlane = vec3d(
    rel.x - axialDist * axis.direction.x,
    rel.y - axialDist * axis.direction.y,
    rel.z - axialDist * axis.direction.z,
  );
  const u = Math.atan2(dot(inPlane, perpDir), dot(inPlane, refDirection));
  return { u, v };
}

/**
 * Project a 3D point onto a toroidal surface's (θ, φ) parameters.
 */
function projectToTorus(surface: ToroidalSurface, pt: Point3D): { u: number; v: number } {
  const { axis, majorRadius, refDirection } = surface;
  const perpDir = cross(axis.direction, refDirection);
  const rel = subtractPoints(pt, axis.origin);

  // Project onto equatorial plane to find θ
  const inPlane = vec3d(
    rel.x - dot(rel, axis.direction) * axis.direction.x,
    rel.y - dot(rel, axis.direction) * axis.direction.y,
    rel.z - dot(rel, axis.direction) * axis.direction.z,
  );
  const theta = Math.atan2(dot(inPlane, perpDir), dot(inPlane, refDirection));

  // Find φ: angle around the tube cross-section
  const centerOnCircle = vec3d(
    axis.origin.x + majorRadius * Math.cos(theta) * refDirection.x + majorRadius * Math.sin(theta) * perpDir.x,
    axis.origin.y + majorRadius * Math.cos(theta) * refDirection.y + majorRadius * Math.sin(theta) * perpDir.y,
    axis.origin.z + majorRadius * Math.cos(theta) * refDirection.z + majorRadius * Math.sin(theta) * perpDir.z,
  );
  const toPoint = vec3d(pt.x - centerOnCircle.x, pt.y - centerOnCircle.y, pt.z - centerOnCircle.z);
  const radialDir = vec3d(
    Math.cos(theta) * refDirection.x + Math.sin(theta) * perpDir.x,
    Math.cos(theta) * refDirection.y + Math.sin(theta) * perpDir.y,
    Math.cos(theta) * refDirection.z + Math.sin(theta) * perpDir.z,
  );
  const phi = Math.atan2(dot(toPoint, axis.direction), dot(toPoint, radialDir));

  return { u: theta, v: phi };
}

/**
 * Project a 3D point onto a revolution surface's (θ, v) parameters.
 * θ = rotation angle, v = basis curve parameter.
 * For v, we do a closest-point search along the basis curve.
 */
function projectToRevolution(surface: RevolutionSurface, pt: Point3D): { u: number; v: number } {
  const { axis, refDirection } = surface;
  const perpDir = cross(axis.direction, refDirection);
  const rel = subtractPoints(pt, axis.origin);

  // θ from the radial projection
  const axialComp = dot(rel, axis.direction);
  const inPlane = vec3d(
    rel.x - axialComp * axis.direction.x,
    rel.y - axialComp * axis.direction.y,
    rel.z - axialComp * axis.direction.z,
  );
  const theta = Math.atan2(dot(inPlane, perpDir), dot(inPlane, refDirection));

  // v: sample the basis curve and find closest parameter
  const curve = surface.basisCurve;
  let bestV = curve.startParam;
  let bestDist = Infinity;
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = curve.startParam + (curve.endParam - curve.startParam) * i / steps;
    const cp = evaluateRevolutionSurface(surface, 0, t); // evaluate at θ=0
    // Compare radial distance and axial position
    const cpRel = subtractPoints(cp, axis.origin);
    const cpAxial = dot(cpRel, axis.direction);
    const cpRadial = Math.sqrt(dot(cpRel, cpRel) - cpAxial * cpAxial);
    const ptRadial = Math.sqrt(dot(inPlane, inPlane));
    const dist = Math.abs(cpAxial - axialComp) + Math.abs(cpRadial - ptRadial);
    if (dist < bestDist) {
      bestDist = dist;
      bestV = t;
    }
  }

  return { u: theta, v: bestV };
}

/**
 * Check if any edge in the wire is a full circle or arc, and extract angular range.
 * Returns { isFullCircle, arcMin, arcMax } if found.
 */
function detectAngularRange(face: Face): { isFullCircle: boolean; arcMin: number; arcMax: number } {
  let isFullCircle = false;
  let arcMin = Infinity, arcMax = -Infinity;

  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;
    if (curve.type === 'circle3d') {
      // Full circle (0 to 2π)
      isFullCircle = true;
    } else if (curve.type === 'arc3d') {
      const start = curve.startAngle;
      const end = curve.endAngle;
      arcMin = Math.min(arcMin, start);
      arcMax = Math.max(arcMax, end);
    }
  }

  return { isFullCircle, arcMin, arcMax };
}

/**
 * Collect sample points along all wire edges (not just start points).
 * For curved edges (circles/arcs), sample intermediate points.
 */
function wireEdgeSamplePoints(face: Face): Point3D[] {
  const pts: Point3D[] = [];
  for (const oe of face.outerWire.edges) {
    const curve = oe.edge.curve;
    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    pts.push(start);

    // For arcs, sample midpoint(s) to capture angular range
    if (curve.type === 'arc3d') {
      const mid = (curve.startAngle + curve.endAngle) / 2;
      const cosA = Math.cos(mid), sinA = Math.sin(mid);
      const pl = curve.plane;
      const yAxis = cross(pl.normal, pl.xAxis);
      pts.push({
        x: pl.origin.x + curve.radius * (cosA * pl.xAxis.x + sinA * yAxis.x),
        y: pl.origin.y + curve.radius * (cosA * pl.xAxis.y + sinA * yAxis.y),
        z: pl.origin.z + curve.radius * (cosA * pl.xAxis.z + sinA * yAxis.z),
      });
    } else if (curve.type === 'circle3d') {
      // Sample a few points around the circle
      const pl = curve.plane;
      const yAxis = cross(pl.normal, pl.xAxis);
      for (const angle of [Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        pts.push({
          x: pl.origin.x + curve.radius * (cosA * pl.xAxis.x + sinA * yAxis.x),
          y: pl.origin.y + curve.radius * (cosA * pl.xAxis.y + sinA * yAxis.y),
          z: pl.origin.z + curve.radius * (cosA * pl.xAxis.z + sinA * yAxis.z),
        });
      }
    }
  }
  return pts;
}

/**
 * Get parameter bounds from a face's wire for a given surface type.
 * Examines both wire vertices and edge curve types to handle full circles.
 */
function getParameterBounds(face: Face): { uMin: number; uMax: number; vMin: number; vMax: number } | null {
  const surface = face.surface;

  let projectFn: (pt: Point3D) => { u: number; v: number };

  switch (surface.type) {
    case 'cylinder':
      projectFn = (pt) => projectToCylinder(surface, pt);
      break;
    case 'sphere':
      projectFn = (pt) => projectToSphere(surface, pt);
      break;
    case 'cone':
      projectFn = (pt) => projectToCone(surface, pt);
      break;
    case 'torus':
      projectFn = (pt) => projectToTorus(surface, pt);
      break;
    case 'revolution':
      projectFn = (pt) => projectToRevolution(surface, pt);
      break;
    default:
      return null;
  }

  // Detect full circles / arcs from edge curves
  const { isFullCircle, arcMin, arcMax } = detectAngularRange(face);

  // Sample points along edges (including arc midpoints) for v range
  const samplePts = wireEdgeSamplePoints(face);
  if (samplePts.length < 2) return null;

  const params = samplePts.map(projectFn);

  // For v (non-angular), simple min/max
  let vMin = Infinity, vMax = -Infinity;
  for (const p of params) {
    if (p.v < vMin) vMin = p.v;
    if (p.v > vMax) vMax = p.v;
  }

  // For u (angular)
  let uMin: number, uMax: number;
  if (isFullCircle) {
    uMin = 0;
    uMax = 2 * Math.PI;
  } else if (arcMax > arcMin) {
    uMin = arcMin;
    uMax = arcMax;
  } else {
    // Fall back to projected values
    const uValues = params.map(p => p.u);
    const hasNearPi = uValues.some(u => u > 2.5);
    const hasNearNegPi = uValues.some(u => u < -2.5);

    if (hasNearPi && hasNearNegPi) {
      uMin = 0;
      uMax = 2 * Math.PI;
    } else {
      uMin = Math.min(...uValues);
      uMax = Math.max(...uValues);
      if (uMax - uMin < 1e-6) return null;
    }
  }

  // For revolution surfaces, use the basis curve's parameter range for v
  if (surface.type === 'revolution') {
    vMin = surface.basisCurve.startParam;
    vMax = surface.basisCurve.endParam;
  }

  // Ensure v range is non-degenerate
  if (Math.abs(vMax - vMin) < 1e-10) {
    vMin -= 0.001;
    vMax += 0.001;
  }

  return { uMin, uMax, vMin, vMax };
}

/**
 * Build evaluate/normal functions for a given surface.
 */
function getSurfaceFunctions(surface: Surface): { evaluate: SurfaceEvaluator; normal: SurfaceNormalFn } | null {
  switch (surface.type) {
    case 'cylinder':
      return {
        evaluate: (u, v) => evaluateCylindricalSurface(surface, u, v),
        normal: (u, v) => normalCylindricalSurface(surface, u, v),
      };
    case 'sphere':
      return {
        evaluate: (u, v) => evaluateSphericalSurface(surface, u, v),
        normal: (u, v) => normalSphericalSurface(surface, u, v),
      };
    case 'cone':
      return {
        evaluate: (u, v) => evaluateConicalSurface(surface, u, v),
        normal: (u, v) => normalConicalSurface(surface, u, v),
      };
    case 'torus':
      return {
        evaluate: (u, v) => evaluateToroidalSurface(surface, u, v),
        normal: (u, v) => normalToroidalSurface(surface, u, v),
      };
    case 'revolution':
      return {
        evaluate: (u, v) => evaluateRevolutionSurface(surface, u, v),
        normal: (u, v) => normalRevolutionSurface(surface, u, v),
      };
    default:
      return null;
  }
}

/**
 * Check if points at a given v parameter converge to a single point (pole/apex).
 * Samples two different u values and checks if the resulting 3D points are the same.
 */
function isDegenerate(evaluate: SurfaceEvaluator, uMin: number, uMax: number, v: number): boolean {
  const p1 = evaluate(uMin, v);
  const p2 = evaluate((uMin + uMax) / 2, v);
  const dx = p1.x - p2.x, dy = p1.y - p2.y, dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < 1e-6;
}

/**
 * Tessellate a curved face using a parametric (u, v) grid.
 * Handles poles/apices by using fan triangulation instead of degenerate grid strips.
 */
function tessellateCurvedFace(face: Face, opts: Required<TessellationOptions>): FaceTessellation | null {
  const bounds = getParameterBounds(face);
  if (!bounds) return null;

  const fns = getSurfaceFunctions(face.surface);
  if (!fns) return null;

  const { uMin, uMax, vMin, vMax } = bounds;

  const pushNormal = (normals: number[], n: Vector3D) => {
    normals.push(n.x, n.y, n.z);
  };

  // Determine grid resolution
  const isFullCircle = Math.abs(uMax - uMin - 2 * Math.PI) < 0.01;
  const nU = isFullCircle ? opts.minSegments : Math.max(Math.ceil(opts.minSegments * (uMax - uMin) / (2 * Math.PI)), 4);

  // For v: use more divisions for surfaces that curve in v (sphere, torus, revolution)
  // For cylinder/cone: 1 division along v suffices (straight lines)
  let nV: number;
  if (face.surface.type === 'cylinder') {
    nV = 1;
  } else if (face.surface.type === 'cone') {
    nV = 1;
  } else if (face.surface.type === 'revolution') {
    nV = Math.max(opts.minSegments / 4, 4);
  } else {
    const vRange = Math.abs(vMax - vMin);
    nV = Math.max(Math.ceil(opts.minSegments * vRange / (Math.PI)), 4);
  }

  // Detect poles/apices: v endpoints where all u values converge to a single point
  const vMinDegenerate = isDegenerate(fns.evaluate, uMin, uMax, vMin);
  const vMaxDegenerate = isDegenerate(fns.evaluate, uMin, uMax, vMax);

  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  if (vMinDegenerate && vMaxDegenerate) {
    // Both ends degenerate — very thin sliver, skip
    return null;
  }

  if (vMinDegenerate) {
    // Bottom pole: single apex vertex + fan from ring at vMin+ε
    // Apex normal will be set after the ring is computed (average of ring normals)
    const apexPt = fns.evaluate(uMin, vMin);
    vertices.push(apexPt.x, apexPt.y, apexPt.z);
    normals.push(0, 0, 0); // placeholder — will be overwritten
    const apexIdx = 0;

    // Ring at the first non-degenerate v
    const vStep = (vMax - vMin) / nV;
    const vRing = vMin + vStep;
    for (let i = 0; i <= nU; i++) {
      const u = uMin + (uMax - uMin) * i / nU;
      const pt = fns.evaluate(u, vRing);
      const n = fns.normal(u, vRing);
      vertices.push(pt.x, pt.y, pt.z);
      pushNormal(normals, n);
    }

    // Set apex normal as average of ring normals
    const ringStart = 1;
    let anx = 0, any = 0, anz = 0;
    for (let i = 0; i < nU; i++) {
      const ni = (ringStart + i) * 3;
      anx += normals[ni]; any += normals[ni + 1]; anz += normals[ni + 2];
    }
    const aLen = Math.sqrt(anx * anx + any * any + anz * anz);
    if (aLen > 1e-8) { anx /= aLen; any /= aLen; anz /= aLen; }
    normals[0] = anx; normals[1] = any; normals[2] = anz;

    // Fan from apex to ring
    for (let i = 0; i < nU; i++) {
      indices.push(apexIdx, ringStart + i, ringStart + i + 1);
    }

    // Remaining grid (vRing to vMax)
    const gridStartOffset = vertices.length / 3;
    for (let j = 1; j <= nV; j++) {
      const v = vMin + vStep + (vMax - vMin - vStep) * j / nV;
      for (let i = 0; i <= nU; i++) {
        const u = uMin + (uMax - uMin) * i / nU;
        const pt = fns.evaluate(u, v);
        const n = fns.normal(u, v);
        vertices.push(pt.x, pt.y, pt.z);
        pushNormal(normals, n);
      }
    }

    // Grid indices for remaining strips
    const cols = nU + 1;
    for (let j = 0; j < nV; j++) {
      const rowA = (j === 0) ? ringStart : gridStartOffset + (j - 1) * cols;
      const rowB = (j === 0) ? gridStartOffset : gridStartOffset + j * cols;
      if (j < nV - 1 || nV === 1) {
        // Only emit if rowB exists
        if (rowB + nU < vertices.length / 3) {
          for (let i = 0; i < nU; i++) {
            indices.push(rowA + i, rowA + i + 1 + cols - cols, rowA + i + 1); // simplified below
          }
        }
      }
    }
    // Actually, let me simplify: just do the grid from ringStart onward
    // Ring is row 0, gridStart rows are 1..nV
    // Rewrite: all rows after the apex fan
    const allRows: number[] = [ringStart]; // row 0 = ring
    for (let j = 0; j < nV; j++) {
      allRows.push(gridStartOffset + j * cols);
    }
    // Clear the partial indices we added above and redo
    indices.length = nU * 3; // keep only the fan
    for (let j = 0; j < allRows.length - 1; j++) {
      for (let i = 0; i < nU; i++) {
        const a = allRows[j] + i;
        const b = a + 1;
        const c = allRows[j + 1] + i;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    return { vertices, normals, indices };
  }

  if (vMaxDegenerate) {
    // Top pole: grid from vMin to vMax-ε, then fan to apex

    // Grid rows from vMin to just before apex
    for (let j = 0; j < nV; j++) {
      const v = vMin + (vMax - vMin) * j / nV;
      for (let i = 0; i <= nU; i++) {
        const u = uMin + (uMax - uMin) * i / nU;
        const pt = fns.evaluate(u, v);
        const n = fns.normal(u, v);
        vertices.push(pt.x, pt.y, pt.z);
        pushNormal(normals, n);
      }
    }

    // Grid indices for the regular part
    const cols = nU + 1;
    for (let j = 0; j < nV - 1; j++) {
      for (let i = 0; i < nU; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const c = (j + 1) * cols + i;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // Apex vertex — use average of ring normals for the apex normal
    // (the surface normal at a pole/apex is often unreliable)
    const apexPt = fns.evaluate(uMin, vMax);
    const apexIdx = vertices.length / 3;
    vertices.push(apexPt.x, apexPt.y, apexPt.z);

    // Compute apex normal as average of the last ring's normals
    let anx = 0, any = 0, anz = 0;
    const lastRingStart = (nV - 1) * cols;
    for (let i = 0; i < nU; i++) {
      const ni = (lastRingStart + i) * 3;
      anx += normals[ni]; any += normals[ni + 1]; anz += normals[ni + 2];
    }
    const aLen = Math.sqrt(anx * anx + any * any + anz * anz);
    if (aLen > 1e-8) { anx /= aLen; any /= aLen; anz /= aLen; }
    normals.push(anx, any, anz);

    // Fan from last ring to apex
    for (let i = 0; i < nU; i++) {
      indices.push(lastRingStart + i, apexIdx, lastRingStart + i + 1);
    }

    return { vertices, normals, indices };
  }

  // Normal case: full grid with no degenerate poles
  for (let j = 0; j <= nV; j++) {
    const v = vMin + (vMax - vMin) * j / nV;
    for (let i = 0; i <= nU; i++) {
      const u = uMin + (uMax - uMin) * i / nU;
      const pt = fns.evaluate(u, v);
      const n = fns.normal(u, v);
      vertices.push(pt.x, pt.y, pt.z);
      pushNormal(normals, n);
    }
  }

  const cols = nU + 1;
  for (let j = 0; j < nV; j++) {
    for (let i = 0; i < nU; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = (j + 1) * cols + i;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return { vertices, normals, indices };
}

// ═══════════════════════════════════════════════════════
// SOLID TO MESH
// ═══════════════════════════════════════════════════════


/**
 * Convert a Solid to a renderable triangle Mesh.
 *
 * Supports:
 * - Planar faces (fan triangulation, flat shading)
 * - Cylindrical, spherical, conical, toroidal faces (parametric grid, smooth shading)
 */
export function solidToMesh(
  solid: Solid,
  options?: TessellationOptions,
): OperationResult<Mesh> {
  const faces = shellFaces(solid.outerShell);

  if (faces.length === 0) {
    return failure('Solid has no faces');
  }

  const opts: Required<TessellationOptions> = { ...DEFAULT_OPTIONS, ...options };

  const allVertices: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  for (const face of faces) {
    // Try planar first, then curved
    let tess = tessellatePlanarFace(face);
    if (!tess) {
      tess = tessellateCurvedFace(face, opts);
    }
    if (!tess) continue;


    // Append vertices and normals
    for (let i = 0; i < tess.vertices.length; i++) {
      allVertices.push(tess.vertices[i]);
      allNormals.push(tess.normals[i]);
    }

    // Append indices with offset
    for (const idx of tess.indices) {
      allIndices.push(idx + vertexOffset);
    }

    vertexOffset += tess.vertices.length / 3;
  }

  if (allIndices.length === 0) {
    return failure('No faces could be tessellated');
  }

  const mesh = createMesh(
    new Float32Array(allVertices),
    new Float32Array(allNormals),
    new Uint32Array(allIndices),
  );

  return success(mesh);
}
