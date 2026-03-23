import { Point2D, point2d, distance2d, points2dEqual } from '../core';
import { Curve2D, Wire2D, makeWire2D } from '../geometry/wire2d';
import { Line2D, makeLine2D, evaluateLine2D } from '../geometry/line2d';
import { Arc2D, makeArc2D, evaluateArc2D } from '../geometry/arc2d';
import { Circle2D, makeCircle2D, evaluateCircle2D } from '../geometry/circle2d';
import { Sketch } from './sketch';
import { Profile2D, wireSignedArea } from './profile';

const CONNECT_TOL = 1e-4;

// ═══════════════════════════════════════════════════════
// GRAPH TYPES
// ═══════════════════════════════════════════════════════

interface GraphNode {
  point: Point2D;
  /** Indices into the directed edge list. */
  outgoing: number[];
}

interface DirectedEdge {
  from: number; // node index
  to: number;   // node index
  curve: Curve2D;
  /** Index of the reverse directed edge. */
  reverse: number;
  /** Has this directed edge been used in a face traversal? */
  used: boolean;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Find or create a node at the given point. */
function findOrAddNode(nodes: GraphNode[], pt: Point2D): number {
  for (let i = 0; i < nodes.length; i++) {
    if (distance2d(nodes[i].point, pt) < CONNECT_TOL) return i;
  }
  nodes.push({ point: pt, outgoing: [] });
  return nodes.length - 1;
}

/** Compute the outgoing angle of a directed edge from a node. */
function edgeAngle(nodes: GraphNode[], edge: DirectedEdge): number {
  const from = nodes[edge.from].point;
  const to = nodes[edge.to].point;
  const curve = edge.curve;

  if (curve.type === 'arc') {
    // Use the tangent at the start of the arc to determine direction
    // Tangent of circle at angle t is (-sin(t), cos(t)) for CCW,
    // and (sin(t), -cos(t)) for CW sweep
    const sweep = curve.endAngle - curve.startAngle;
    const sign = sweep > 0 ? 1 : -1;
    const tx = -Math.sin(curve.startAngle) * sign;
    const ty = Math.cos(curve.startAngle) * sign;
    return Math.atan2(ty, tx);
  }

  return Math.atan2(to.y - from.y, to.x - from.x);
}

// ═══════════════════════════════════════════════════════
// T-JUNCTION SPLITTING
// ═══════════════════════════════════════════════════════

/**
 * Split curves at T-junctions: where one curve's endpoint falls on
 * the interior of another curve (specifically lines).
 */
function splitAtTJunctions(curves: Curve2D[]): Curve2D[] {
  // Collect all endpoints
  const endpoints: Point2D[] = [];
  for (const c of curves) {
    endpoints.push(c.startPoint);
    if (!c.isClosed) endpoints.push(c.endPoint);
  }

  let result: Curve2D[] = [...curves];
  let changed = true;

  // Iterate until no more splits (handles cascading splits)
  while (changed) {
    changed = false;
    const newResult: Curve2D[] = [];

    for (const curve of result) {
      if (curve.type === 'line') {
        // Check if any endpoint falls on the interior of this line
        const splitPoints: Array<{ point: Point2D; t: number }> = [];

        for (const ep of endpoints) {
          // Skip this line's own endpoints
          if (distance2d(ep, curve.startPoint) < CONNECT_TOL) continue;
          if (distance2d(ep, curve.endPoint) < CONNECT_TOL) continue;

          // Project ep onto the line and check if it's on the segment
          const t = projectPointOnLine(curve, ep);
          if (t > CONNECT_TOL && t < curve.segmentLength - CONNECT_TOL) {
            const projected = evaluateLine2D(curve, t);
            if (distance2d(projected, ep) < CONNECT_TOL) {
              splitPoints.push({ point: ep, t });
            }
          }
        }

        if (splitPoints.length > 0) {
          // Sort split points by parameter
          splitPoints.sort((a, b) => a.t - b.t);
          changed = true;

          // Split the line at each point
          let currentStart = curve.startPoint;
          for (const sp of splitPoints) {
            const seg = makeLine2D(currentStart, sp.point);
            if (seg.success) newResult.push(seg.result!);
            currentStart = sp.point;
          }
          const lastSeg = makeLine2D(currentStart, curve.endPoint);
          if (lastSeg.success) newResult.push(lastSeg.result!);
        } else {
          newResult.push(curve);
        }
      } else {
        newResult.push(curve);
      }
    }

    result = newResult;
    // Update endpoints for the next iteration
    endpoints.length = 0;
    for (const c of result) {
      endpoints.push(c.startPoint);
      if (!c.isClosed) endpoints.push(c.endPoint);
    }
  }

  return result;
}

/** Project a point onto a line, returning the parameter t. */
function projectPointOnLine(line: Line2D, point: Point2D): number {
  const dx = point.x - line.origin.x;
  const dy = point.y - line.origin.y;
  return dx * line.direction.x + dy * line.direction.y;
}

// ═══════════════════════════════════════════════════════
// MAIN ALGORITHM
// ═══════════════════════════════════════════════════════

/**
 * Find all closed profiles in a sketch.
 *
 * Algorithm:
 * 1. Collect all non-construction curves
 * 2. Handle standalone circles as disc profiles
 * 3. Build a planar graph (nodes at endpoints, directed edges for each curve)
 * 4. Find minimal cycles by always-turn-right traversal
 * 5. Classify cycles as outer boundaries or holes
 * 6. Nest holes inside their containing boundary
 *
 * @param sketch - The sketch to analyze
 * @returns Array of detected profiles
 */
export function findProfiles(sketch: Sketch): Profile2D[] {
  const curves = sketch.elements
    .filter(e => !e.construction)
    .map(e => e.geometry);

  if (curves.length === 0) return [];

  // Separate standalone circles from other curves
  const circles: Circle2D[] = [];
  const nonCircles: Curve2D[] = [];

  for (const c of curves) {
    if (c.type === 'circle') {
      circles.push(c);
    } else {
      nonCircles.push(c);
    }
  }

  // Split lines at T-junctions: if another curve's endpoint falls on
  // the interior of a line, split that line into two segments there.
  const splitCurves = splitAtTJunctions(nonCircles);

  // Build planar graph from split curves
  const nodes: GraphNode[] = [];
  const edges: DirectedEdge[] = [];

  for (const curve of splitCurves) {
    const startIdx = findOrAddNode(nodes, curve.startPoint);
    const endIdx = findOrAddNode(nodes, curve.endPoint);

    if (startIdx === endIdx) continue; // degenerate

    // Add forward and reverse directed edges
    const fwdIdx = edges.length;
    const revIdx = fwdIdx + 1;
    const revCurve = reverseCurve(curve);
    edges.push({ from: startIdx, to: endIdx, curve, reverse: revIdx, used: false });
    edges.push({ from: endIdx, to: startIdx, curve: revCurve, reverse: fwdIdx, used: false });

    nodes[startIdx].outgoing.push(fwdIdx);
    nodes[endIdx].outgoing.push(revIdx);
  }

  // Sort outgoing edges at each node by angle
  for (const node of nodes) {
    node.outgoing.sort((a, b) => edgeAngle(nodes, edges[a]) - edgeAngle(nodes, edges[b]));
  }

  // Find minimal cycles using the "next CW edge" algorithm
  const cycles: Wire2D[] = [];

  // Debug: log graph structure
  for (let startEdgeIdx = 0; startEdgeIdx < edges.length; startEdgeIdx++) {
    if (edges[startEdgeIdx].used) continue;

    const cycle = traceCycle(nodes, edges, startEdgeIdx);
    if (cycle) {
      cycles.push(cycle);
    }
  }

  // Add standalone circles as disc cycles
  for (const circle of circles) {
    const wire = makeWire2D([circle]);
    if (wire.success) {
      cycles.push(wire.result!);
    }
  }

  if (cycles.length === 0) return [];

  // Classify cycles by signed area
  // CCW (positive area) = outer boundary
  // CW (negative area) = hole from the graph algorithm
  // But standalone circles (always CCW) inside an outer boundary are also holes
  const outers: Wire2D[] = [];
  const graphHoles: Wire2D[] = [];
  const circleWires: Wire2D[] = [];

  for (const cycle of cycles) {
    // Check if this is a standalone circle wire
    const isCircleWire = cycle.curves.length === 1 && cycle.curves[0].type === 'circle';
    if (isCircleWire) {
      circleWires.push(cycle);
      continue;
    }

    const area = wireSignedArea(cycle);
    if (area > CONNECT_TOL) {
      outers.push(cycle);
    } else if (area < -CONNECT_TOL) {
      graphHoles.push(cycle);
    }
  }

  // Circle wires: if inside an outer boundary, they are holes.
  // If standalone (not inside anything), they are outer boundaries (discs).
  const circleOuters: Wire2D[] = [];
  const circleHoles: Wire2D[] = [];

  for (const cw of circleWires) {
    const testPt = cw.startPoint;
    let insideAnOuter = false;
    for (const outer of outers) {
      const outerPts = sampleWirePoints(outer);
      if (pointInPolygon(testPt, outerPts)) {
        insideAnOuter = true;
        break;
      }
    }
    if (insideAnOuter) {
      circleHoles.push(cw);
    } else {
      circleOuters.push(cw);
    }
  }

  const allHoles = [...graphHoles, ...circleHoles];

  // Build profiles: each outer boundary may contain holes
  const profiles: Profile2D[] = [];

  for (const outer of [...outers, ...circleOuters]) {
    const containedHoles: Wire2D[] = [];

    for (const hole of allHoles) {
      const testPt = hole.startPoint;
      const outerPts = sampleWirePoints(outer);
      if (pointInPolygon(testPt, outerPts)) {
        containedHoles.push(hole);
      }
    }

    profiles.push({ outer, holes: containedHoles });
  }

  return profiles;
}

// ═══════════════════════════════════════════════════════
// CYCLE TRACING
// ═══════════════════════════════════════════════════════

/**
 * Trace a minimal cycle starting from a directed edge.
 * At each vertex, turn to the next CW edge (right turn).
 */
function traceCycle(nodes: GraphNode[], edges: DirectedEdge[], startEdgeIdx: number): Wire2D | null {
  const curvesInCycle: Curve2D[] = [];
  let currentEdgeIdx = startEdgeIdx;
  const maxSteps = edges.length; // safety limit

  for (let step = 0; step < maxSteps; step++) {
    const edge = edges[currentEdgeIdx];
    if (edge.used && step > 0) {
      // We've come back to a used edge — this shouldn't happen in a valid traversal
      break;
    }

    edge.used = true;
    curvesInCycle.push(edge.curve);

    const arriveAt = edge.to;

    // The reverse of the edge we just traversed
    const reverseEdgeIdx = edge.reverse;

    // Find the next CW edge at this vertex
    const outgoing = nodes[arriveAt].outgoing;
    const revPosInOutgoing = outgoing.indexOf(reverseEdgeIdx);
    if (revPosInOutgoing === -1) break;

    // Next CW = previous in the sorted list (wrapping around)
    const nextPos = (revPosInOutgoing - 1 + outgoing.length) % outgoing.length;
    const nextEdgeIdx = outgoing[nextPos];

    if (nextEdgeIdx === startEdgeIdx) {
      // Completed the cycle
      const wire = makeWire2D(curvesInCycle);
      return wire.success ? wire.result! : null;
    }

    if (edges[nextEdgeIdx].used) {
      // Hit a used edge before completing — not a valid cycle from here
      break;
    }

    currentEdgeIdx = nextEdgeIdx;
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// CURVE REVERSAL
// ═══════════════════════════════════════════════════════

function reverseCurve(curve: Curve2D): Curve2D {
  switch (curve.type) {
    case 'line': {
      const rev = makeLine2D(curve.endPoint, curve.startPoint);
      return rev.success ? rev.result! : curve;
    }
    case 'arc': {
      const rev = makeArc2D(curve.center, curve.radius, curve.endAngle, curve.startAngle);
      return rev.success ? rev.result! : curve;
    }
    case 'circle':
      return curve; // circles are already closed, direction doesn't matter
  }
}

// ═══════════════════════════════════════════════════════
// POLYGON UTILITIES (duplicated from profile.ts to avoid circular deps)
// ═══════════════════════════════════════════════════════

function sampleWirePoints(wire: Wire2D, segmentsPerCurve: number = 32): Point2D[] {
  const pts: Point2D[] = [];
  for (const curve of wire.curves) {
    const curvePts = sampleCurvePoints(curve, segmentsPerCurve);
    if (pts.length > 0) {
      pts.push(...curvePts.slice(1));
    } else {
      pts.push(...curvePts);
    }
  }
  return pts;
}

function sampleCurvePoints(curve: Curve2D, segments: number): Point2D[] {
  const pts: Point2D[] = [];
  switch (curve.type) {
    case 'line':
      for (let i = 0; i <= segments; i++) {
        const t = curve.startParam + (i / segments) * (curve.endParam - curve.startParam);
        pts.push(evaluateLine2D(curve, t));
      }
      break;
    case 'arc':
      for (let i = 0; i <= segments; i++) {
        const t = curve.startAngle + (i / segments) * (curve.endAngle - curve.startAngle);
        pts.push(evaluateArc2D(curve, t));
      }
      break;
    case 'circle':
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * 2 * Math.PI;
        pts.push(evaluateCircle2D(curve, t));
      }
      break;
  }
  return pts;
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygon[i].y;
    const yj = polygon[j].y;
    const xi = polygon[i].x;
    const xj = polygon[j].x;
    if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
