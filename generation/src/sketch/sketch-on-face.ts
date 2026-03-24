import {
  Point3D,
  Point2D,
  point2d,
  point3d,
  Vector3D,
  vec3d,
  Plane,
  plane,
  dot,
  cross,
  normalize,
  distance,
  isZero,
  worldToSketch,
  sketchToWorld,
} from '../core';
import { OperationResult, success, failure } from '../mesh/mesh';
import { Face } from '../topology/face';
import { Edge, edgeStartPoint, edgeEndPoint, makeEdgeFromCurve, Curve3D } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire } from '../topology/wire';
import { Sketch, createSketch, addElement } from './sketch';
import { Profile2D } from './profile';
import { Curve2D, Wire2D } from '../geometry/wire2d';
import { Line2D, makeLine2D } from '../geometry/line2d';
import { Circle2D, makeCircle2D } from '../geometry/circle2d';
import { Arc2D, makeArc2D } from '../geometry/arc2d';
import { makeLine3D } from '../geometry/line3d';
import { makeCircle3D } from '../geometry/circle3d';
import { makeArc3D } from '../geometry/arc3d';
import { canonicalizeExtrusionSurface } from '../surfaces/extrusion-surface';

// ═══════════════════════════════════════════════════════
// GET PLANE FROM FACE
// ═══════════════════════════════════════════════════════

/**
 * Extract a 3D plane from a face.
 *
 * Only planar faces are supported. Non-planar faces (cylindrical, spherical, etc.)
 * return a failure with a descriptive message.
 *
 * @param face - The face to extract a plane from
 * @returns The face's plane, or failure for non-planar faces
 */
export function getPlaneFromFace(face: Face): OperationResult<Plane> {
  switch (face.surface.type) {
    case 'plane':
      return success(face.surface.plane);

    case 'extrusion': {
      const canonical = canonicalizeExtrusionSurface(face.surface);
      if (canonical.type === 'plane') {
        return success(canonical.plane);
      }
      return failure(`Cannot create sketch on non-planar extrusion surface (canonicalizes to ${canonical.type})`);
    }

    case 'cylinder':
      return failure('Cannot create sketch on cylindrical face. Only planar faces are supported.');

    case 'sphere':
      return failure('Cannot create sketch on spherical face. Only planar faces are supported.');

    case 'cone':
      return failure('Cannot create sketch on conical face. Only planar faces are supported.');

    case 'torus':
      return failure('Cannot create sketch on toroidal face. Only planar faces are supported.');

    case 'revolution':
      return failure('Cannot create sketch on revolution surface face. Only planar faces are supported.');
  }
}

// ═══════════════════════════════════════════════════════
// EDGE PROJECTION (3D → 2D)
// ═══════════════════════════════════════════════════════

const PARALLEL_TOL = 1e-6;

/**
 * Project a 3D edge onto a sketch plane as a 2D curve.
 *
 * - Line3D → Line2D (project endpoints)
 * - Circle3D → Circle2D (if circle plane is parallel to sketch plane)
 * - Arc3D → Arc2D (if arc plane is parallel to sketch plane)
 *
 * Returns failure for degenerate projections (perpendicular edges)
 * or non-parallel circles/arcs (would be ellipses, unsupported).
 *
 * @param edge - The 3D edge to project
 * @param pl - The sketch plane to project onto
 * @returns 2D curve, or failure
 */
export function projectEdgeToSketch(edge: Edge, pl: Plane): OperationResult<Curve2D> {
  const curve = edge.curve;

  switch (curve.type) {
    case 'line3d': {
      const start2d = worldToSketch(pl, curve.startPoint);
      const end2d = worldToSketch(pl, curve.endPoint);

      // Check for degenerate projection (line perpendicular to plane)
      const dx = end2d.x - start2d.x;
      const dy = end2d.y - start2d.y;
      const projLen = Math.sqrt(dx * dx + dy * dy);
      if (projLen < PARALLEL_TOL) {
        return failure('Edge projects to a point on the sketch plane (perpendicular to plane)');
      }

      return makeLine2D(start2d, end2d);
    }

    case 'circle3d': {
      // Check that circle plane is parallel to sketch plane
      const dotNormals = Math.abs(dot(curve.plane.normal, pl.normal));
      if (Math.abs(dotNormals - 1) > PARALLEL_TOL) {
        return failure('Circle edge is not parallel to sketch plane; projection would be an ellipse (unsupported)');
      }

      const center2d = worldToSketch(pl, curve.plane.origin);
      return makeCircle2D(center2d, curve.radius);
    }

    case 'arc3d': {
      // Check that arc plane is parallel to sketch plane
      const dotNormals = Math.abs(dot(curve.plane.normal, pl.normal));
      if (Math.abs(dotNormals - 1) > PARALLEL_TOL) {
        return failure('Arc edge is not parallel to sketch plane; projection would be an ellipse (unsupported)');
      }

      const center2d = worldToSketch(pl, curve.plane.origin);

      // Compute angle offset: the arc's xAxis may differ from the sketch plane's xAxis
      // Both planes are parallel, so project arc's xAxis into sketch plane 2D coords
      const arcXAxis2d = worldToSketch(
        plane(curve.plane.origin, pl.normal, pl.xAxis),
        point3d(
          curve.plane.origin.x + curve.plane.xAxis.x,
          curve.plane.origin.y + curve.plane.xAxis.y,
          curve.plane.origin.z + curve.plane.xAxis.z,
        ),
      );
      const angleOffset = Math.atan2(arcXAxis2d.y, arcXAxis2d.x);

      // Check if normals point the same way or opposite
      const sameDir = dot(curve.plane.normal, pl.normal) > 0;
      let startAngle: number, endAngle: number;

      if (sameDir) {
        startAngle = curve.startAngle + angleOffset;
        endAngle = curve.endAngle + angleOffset;
      } else {
        // Normals point opposite → angles flip
        startAngle = -curve.endAngle + angleOffset;
        endAngle = -curve.startAngle + angleOffset;
      }

      return makeArc2D(center2d, curve.radius, startAngle, endAngle);
    }
  }
}

/**
 * Project all edges of a 3D wire onto a sketch plane as 2D curves.
 *
 * @param wire - The wire to project
 * @param pl - The sketch plane
 * @returns Array of 2D curves, or failure if any edge can't be projected
 */
export function projectWireToSketch(wire: Wire, pl: Plane): OperationResult<Curve2D[]> {
  const curves: Curve2D[] = [];

  for (const oe of wire.edges) {
    const result = projectEdgeToSketch(oe.edge, pl);
    if (!result.success) {
      return failure(`Failed to project wire edge: ${result.error}`);
    }
    curves.push(result.result!);
  }

  return success(curves);
}

// ═══════════════════════════════════════════════════════
// CREATE SKETCH ON FACE
// ═══════════════════════════════════════════════════════

/**
 * Create a new sketch on a face of an existing solid.
 *
 * Extracts the plane from the face, creates an empty sketch, and optionally
 * projects the face boundary edges as construction geometry.
 *
 * @param face - The face to sketch on (must be planar)
 * @param options - Configuration options
 * @param options.projectBoundary - If true, project face boundary edges as construction elements
 * @returns Sketch on the face's plane, or failure for non-planar faces
 */
export function createSketchOnFace(
  face: Face,
  options?: { projectBoundary?: boolean },
): OperationResult<Sketch> {
  const planeResult = getPlaneFromFace(face);
  if (!planeResult.success) {
    return failure(planeResult.error!);
  }

  const pl = planeResult.result!;
  let sketch = createSketch(pl);
  const warnings: string[] = [];

  if (options?.projectBoundary) {
    // Project outer wire edges as construction geometry
    for (const oe of face.outerWire.edges) {
      const projResult = projectEdgeToSketch(oe.edge, pl);
      if (projResult.success) {
        sketch = addElement(sketch, projResult.result!, true);
      } else {
        warnings.push(`Skipped outer edge: ${projResult.error}`);
      }
    }

    // Project inner wire (hole) edges as construction geometry
    for (const innerWire of face.innerWires) {
      for (const oe of innerWire.edges) {
        const projResult = projectEdgeToSketch(oe.edge, pl);
        if (projResult.success) {
          sketch = addElement(sketch, projResult.result!, true);
        } else {
          warnings.push(`Skipped inner edge: ${projResult.error}`);
        }
      }
    }
  }

  if (warnings.length > 0) {
    return { success: true, result: sketch, warnings };
  }

  return success(sketch);
}

// ═══════════════════════════════════════════════════════
// PROFILE LIFTING (2D → 3D)
// ═══════════════════════════════════════════════════════

/**
 * Lift a 2D curve to a 3D curve on a plane.
 *
 * @param curve - The 2D curve
 * @param pl - The plane to lift onto
 * @returns 3D curve on the plane, or failure
 */
export function liftCurve2DToWorld(curve: Curve2D, pl: Plane): OperationResult<Curve3D> {
  switch (curve.type) {
    case 'line': {
      const start3d = sketchToWorld(pl, curve.startPoint);
      const end3d = sketchToWorld(pl, curve.endPoint);
      return makeLine3D(start3d, end3d);
    }

    case 'circle': {
      const center3d = sketchToWorld(pl, curve.center);
      const yAxis = cross(pl.normal, pl.xAxis);
      const circlePlane = plane(center3d, pl.normal, pl.xAxis);
      return makeCircle3D(circlePlane, curve.radius);
    }

    case 'arc': {
      const center3d = sketchToWorld(pl, curve.center);
      const circlePlane = plane(center3d, pl.normal, pl.xAxis);
      return makeArc3D(circlePlane, curve.radius, curve.startAngle, curve.endAngle);
    }
  }
}

/**
 * Lift a 2D wire to a 3D wire on a plane.
 *
 * @param wire2d - The 2D wire
 * @param pl - The plane to lift onto
 * @returns 3D wire on the plane, or failure
 */
export function liftWire2DToWire3D(wire2d: Wire2D, pl: Plane): OperationResult<Wire> {
  const orientedEdges: OrientedEdge[] = [];

  for (const curve of wire2d.curves) {
    const curve3dResult = liftCurve2DToWorld(curve, pl);
    if (!curve3dResult.success) {
      return failure(`Failed to lift curve: ${curve3dResult.error}`);
    }

    const edgeResult = makeEdgeFromCurve(curve3dResult.result!);
    if (!edgeResult.success) {
      return failure(`Failed to create edge: ${edgeResult.error}`);
    }

    orientedEdges.push(orientEdge(edgeResult.result!, true));
  }

  return makeWire(orientedEdges);
}

/**
 * Lift a 2D profile (outer wire + holes) to 3D wires on a plane.
 *
 * @param profile - The 2D profile
 * @param pl - The plane to lift onto
 * @returns 3D outer wire and inner wires, or failure
 */
export function liftProfile2DToProfile3D(
  profile: Profile2D,
  pl: Plane,
): OperationResult<{ outerWire: Wire; innerWires: Wire[] }> {
  const outerResult = liftWire2DToWire3D(profile.outer, pl);
  if (!outerResult.success) {
    return failure(`Failed to lift outer wire: ${outerResult.error}`);
  }

  const innerWires: Wire[] = [];
  for (let i = 0; i < profile.holes.length; i++) {
    const holeResult = liftWire2DToWire3D(profile.holes[i], pl);
    if (!holeResult.success) {
      return failure(`Failed to lift hole wire ${i}: ${holeResult.error}`);
    }
    innerWires.push(holeResult.result!);
  }

  return success({
    outerWire: outerResult.result!,
    innerWires,
  });
}
