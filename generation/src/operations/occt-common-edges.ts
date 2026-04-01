import { distance, type Point3D } from '../core';
import { makeLine3D } from '../geometry/line3d';
import { makeEdgeFromCurve, edgeEndPoint, edgeStartPoint, type Edge } from '../topology/edge';
import { type Surface, makeFace, type Face } from '../topology/face';
import { evaluateCurve2D } from '../topology/pcurve';
import { makeWire, orientEdge, type OrientedEdge, type Wire } from '../topology/wire';
import { toAdapter } from '../surfaces/surface-adapter';

const STITCH_TOL = 1e-6;
const SPLIT_VERTEX_TOL = 5e-4;
const SUPPORT_KEY_TOL = 1e-4;
const INTERVAL_PARAM_TOL = 5e-4;

interface PaveBlock {
  edge: Edge;
  sourceEdge: Edge;
  startT: number;
  endT: number;
}

interface CommonInterval {
  sourceEdge: Edge;
  startT: number;
  endT: number;
  canonicalStart: Point3D;
  canonicalEnd: Point3D;
}

interface OpenLineInterval {
  supportKey: string;
  supportEdge: Edge;
  startT: number;
  endT: number;
  canonicalStart: Point3D;
  canonicalEnd: Point3D;
}

function assignObservedIntervalPoint(
  interval: CommonInterval,
  intervalStartT: number,
  intervalEndT: number,
  edgeStartT: number | null,
  edgeEndT: number | null,
  edgeStart: Point3D,
  edgeEnd: Point3D,
): void {
  if (edgeStartT !== null) {
    if (Math.abs(edgeStartT - intervalStartT) < 1e-5) interval.canonicalStart = edgeStart;
    if (Math.abs(edgeStartT - intervalEndT) < 1e-5) interval.canonicalEnd = edgeStart;
  }
  if (edgeEndT !== null) {
    if (Math.abs(edgeEndT - intervalStartT) < 1e-5) interval.canonicalStart = edgeEnd;
    if (Math.abs(edgeEndT - intervalEndT) < 1e-5) interval.canonicalEnd = edgeEnd;
  }
}

function snapToCanonical(point: Point3D, canonicalVertices: Point3D[]): Point3D {
  for (const vertex of canonicalVertices) {
    if (distance(point, vertex) < STITCH_TOL) {
      return vertex;
    }
  }
  return point;
}

function pushUnique(points: Point3D[], point: Point3D): void {
  for (const existing of points) {
    if (distance(existing, point) < STITCH_TOL) {
      return;
    }
  }
  points.push(point);
}

function addClusteredValue(values: number[], value: number): number {
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i] - value) <= INTERVAL_PARAM_TOL) {
      values[i] = (values[i] + value) / 2;
      return values[i];
    }
  }
  values.push(value);
  return value;
}

function findClusteredValue(values: number[], value: number): number | null {
  for (const existing of values) {
    if (Math.abs(existing - value) <= INTERVAL_PARAM_TOL) {
      return existing;
    }
  }
  return null;
}

function sameInterval(startA: number, endA: number, startB: number, endB: number): boolean {
  return (
    Math.abs(startA - startB) <= INTERVAL_PARAM_TOL &&
    Math.abs(endA - endB) <= INTERVAL_PARAM_TOL
  );
}

function roundToTolerance(value: number): number {
  return Math.round(value / STITCH_TOL) * STITCH_TOL;
}

function roundSupportValue(value: number): number {
  return Math.round(value / SUPPORT_KEY_TOL) * SUPPORT_KEY_TOL;
}

function canonicalClosedEdgeKey(edge: Edge): string | null {
  const curve = edge.curve;
  if (!curve.isClosed) {
    return null;
  }

  if ((curve.type === 'circle3d' || curve.type === 'arc3d') && 'plane' in curve) {
    const center = curve.plane.origin;
    const normal = curve.plane.normal;
    let nx = roundToTolerance(normal.x);
    let ny = roundToTolerance(normal.y);
    let nz = roundToTolerance(normal.z);
    if (nx < 0 || (nx === 0 && ny < 0) || (nx === 0 && ny === 0 && nz < 0)) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    return `C:${roundToTolerance(center.x)},${roundToTolerance(center.y)},${roundToTolerance(center.z)}|r=${roundToTolerance(curve.radius)}|n=${nx},${ny},${nz}`;
  }

  const start = edgeStartPoint(edge);
  return `L:${roundToTolerance(start.x)},${roundToTolerance(start.y)},${roundToTolerance(start.z)}`;
}

function canonicalOpenEdgeKey(edge: Edge): string | null {
  if (edge.degenerate || edge.curve.isClosed) {
    return null;
  }

  if (edge.curve.type === 'line3d' && edge.sourceEdge && edge.sourceEdge.curve.type === 'line3d') {
    const source = edge.sourceEdge;
    const key = sourceEdgeIdentity(edge);
    const startT = pointParamOnSupportLine(edgeStartPoint(edge), source);
    const endT = pointParamOnSupportLine(edgeEndPoint(edge), source);
    if (key && startT !== null && endT !== null) {
      const a = roundToTolerance(Math.min(startT, endT));
      const b = roundToTolerance(Math.max(startT, endT));
      return `${key}|t=${a}:${b}`;
    }
  }

  const start = edgeStartPoint(edge);
  const end = edgeEndPoint(edge);
  const sKey = `${roundToTolerance(start.x)},${roundToTolerance(start.y)},${roundToTolerance(start.z)}`;
  const eKey = `${roundToTolerance(end.x)},${roundToTolerance(end.y)},${roundToTolerance(end.z)}`;
  return sKey < eKey ? `O:${sKey}|${eKey}` : `O:${eKey}|${sKey}`;
}

function mergePCurves(target: Edge, source: Edge): void {
  for (const pcurve of source.pcurves) {
    if (!target.pcurves.includes(pcurve)) {
      target.pcurves.push(pcurve);
    }
  }
}

function canonicalizeClosedEdges(
  wire: Wire,
  faceForward: boolean,
  canonicalEdges: Map<string, Edge>,
  canonicalDirections: Map<string, boolean>,
): Wire {
  let changed = false;
  const edges: OrientedEdge[] = wire.edges.map((oe) => {
    const key = canonicalClosedEdgeKey(oe.edge);
    if (!key) {
      return oe;
    }

    const canonical = canonicalEdges.get(key);
    const effectiveForward = faceForward ? oe.forward : !oe.forward;
    if (!canonical) {
      canonicalEdges.set(key, oe.edge);
      canonicalDirections.set(key, effectiveForward);
      return oe;
    }

    if (canonical !== oe.edge) {
      mergePCurves(canonical, oe.edge);
      changed = true;
      const firstEffectiveForward = canonicalDirections.get(key);
      const targetEffectiveForward =
        firstEffectiveForward === undefined ? effectiveForward : !firstEffectiveForward;
      const canonicalForward = faceForward ? targetEffectiveForward : !targetEffectiveForward;
      return orientEdge(canonical, canonicalForward);
    }

    return oe;
  });

  if (!changed) {
    return wire;
  }

  const wireResult = makeWire(edges);
  return wireResult.success ? wireResult.result! : wire;
}

function canonicalizeOpenEdges(
  wire: Wire,
  faceForward: boolean,
  canonicalEdges: Map<string, Edge>,
  canonicalDirections: Map<string, boolean>,
  fuzzyCanonicalEdges: { edge: Edge; effectiveForward: boolean }[],
): Wire {
  let changed = false;
  const edges: OrientedEdge[] = wire.edges.map((oe) => {
    const key = canonicalOpenEdgeKey(oe.edge);
    const canonical = canonicalEdges.get(key);
    const effectiveForward = faceForward ? oe.forward : !oe.forward;
    if (key && !canonical) {
      canonicalEdges.set(key, oe.edge);
      canonicalDirections.set(key, effectiveForward);
      fuzzyCanonicalEdges.push({ edge: oe.edge, effectiveForward });
      return oe;
    }

    const fuzzyCanonical = canonical ?? findCoincidentOpenEdge(oe.edge, fuzzyCanonicalEdges);
    if (!key && !fuzzyCanonical) {
      return oe;
    }

    if (!canonical && fuzzyCanonical) {
      if (fuzzyCanonical.edge !== oe.edge) {
        mergePCurves(fuzzyCanonical.edge, oe.edge);
        changed = true;
        const targetEffectiveForward = !fuzzyCanonical.effectiveForward;
        const canonicalForward = faceForward ? targetEffectiveForward : !targetEffectiveForward;
        return orientEdge(fuzzyCanonical.edge, canonicalForward);
      }
      return oe;
    }

    if (canonical && canonical !== oe.edge) {
      mergePCurves(canonical, oe.edge);
      changed = true;
      const firstEffectiveForward = canonicalDirections.get(key);
      const targetEffectiveForward =
        firstEffectiveForward === undefined ? effectiveForward : !firstEffectiveForward;
      const canonicalForward = faceForward ? targetEffectiveForward : !targetEffectiveForward;
      return orientEdge(canonical, canonicalForward);
    }

    return oe;
  });

  if (!changed) {
    return wire;
  }

  const wireResult = makeWire(edges);
  return wireResult.success ? wireResult.result! : wire;
}

function lineEndpointsCoincident(a: Edge, b: Edge): boolean {
  if (a.curve.type !== 'line3d' || b.curve.type !== 'line3d') {
    return false;
  }

  const aStart = edgeStartPoint(a);
  const aEnd = edgeEndPoint(a);
  const bStart = edgeStartPoint(b);
  const bEnd = edgeEndPoint(b);
  const sameDirection =
    distance(aStart, bStart) <= SPLIT_VERTEX_TOL &&
    distance(aEnd, bEnd) <= SPLIT_VERTEX_TOL;
  const reverseDirection =
    distance(aStart, bEnd) <= SPLIT_VERTEX_TOL &&
    distance(aEnd, bStart) <= SPLIT_VERTEX_TOL;
  return sameDirection || reverseDirection;
}

function findCoincidentOpenEdge(
  edge: Edge,
  canonicalEdges: { edge: Edge; effectiveForward: boolean }[],
): { edge: Edge; effectiveForward: boolean } | null {
  if (edge.degenerate || edge.curve.type !== 'line3d' || edge.curve.isClosed) {
    return null;
  }

  for (const candidate of canonicalEdges) {
    if (lineEndpointsCoincident(edge, candidate.edge)) {
      return candidate;
    }
  }

  return null;
}

function pointToSegmentDistanceSquared2D(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): { distanceSq: number; t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= STITCH_TOL * STITCH_TOL) {
    const px = point.x - start.x;
    const py = point.y - start.y;
    return { distanceSq: px * px + py * py, t: 0 };
  }

  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
  const clampedT = Math.max(0, Math.min(1, t));
  const closestX = start.x + clampedT * dx;
  const closestY = start.y + clampedT * dy;
  const px = point.x - closestX;
  const py = point.y - closestY;
  return { distanceSq: px * px + py * py, t: clampedT };
}

function pointNearEdgeOnFace(
  point: Point3D,
  edge: Edge,
  surface: Surface,
): { onEdge: boolean; t: number } {
  const start = edgeStartPoint(edge);
  const end = edgeEndPoint(edge);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < STITCH_TOL * STITCH_TOL) {
    return { onEdge: false, t: 0 };
  }

  const vx = point.x - start.x;
  const vy = point.y - start.y;
  const vz = point.z - start.z;
  const t3d = (vx * dx + vy * dy + vz * dz) / lenSq;
  if (t3d < STITCH_TOL || t3d > 1 - STITCH_TOL) {
    return { onEdge: false, t: t3d };
  }

  const px = start.x + t3d * dx - point.x;
  const py = start.y + t3d * dy - point.y;
  const pz = start.z + t3d * dz - point.z;
  const d3 = Math.sqrt(px * px + py * py + pz * pz);

  const adapter = toAdapter(surface);
  const pcurve = edge.pcurves.find((candidate) => candidate.surface === surface);
  if (!pcurve) {
    return { onEdge: d3 <= SPLIT_VERTEX_TOL, t: t3d };
  }

  const startUV = evaluateCurve2D(pcurve.curve2d, pcurve.curve2d.startParam);
  const endUV = evaluateCurve2D(pcurve.curve2d, pcurve.curve2d.endParam);
  const pointUV = adapter.projectPoint(point);
  const uOffsets = adapter.isUPeriodic ? [-adapter.uPeriod, 0, adapter.uPeriod] : [0];
  let best = { distanceSq: Number.POSITIVE_INFINITY, t: t3d };
  for (const pointShift of uOffsets) {
    const shiftedPoint = { x: pointUV.u + pointShift, y: pointUV.v };
    for (const startShift of uOffsets) {
      for (const endShift of uOffsets) {
        const candidate = pointToSegmentDistanceSquared2D(
          shiftedPoint,
          { x: startUV.x + startShift, y: startUV.y },
          { x: endUV.x + endShift, y: endUV.y },
        );
        if (candidate.distanceSq < best.distanceSq) {
          best = candidate;
        }
      }
    }
  }

  const d2 = Math.sqrt(best.distanceSq);
  const isOnEdge = d3 <= SPLIT_VERTEX_TOL * 2 && d2 <= SPLIT_VERTEX_TOL;
  return { onEdge: isOnEdge, t: best.t };
}

function pointParamOnLineEdge(point: Point3D, edge: Edge): number | null {
  if (edge.curve.type !== 'line3d') {
    return null;
  }

  const start = edgeStartPoint(edge);
  const end = edgeEndPoint(edge);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < STITCH_TOL * STITCH_TOL) {
    return null;
  }

  const vx = point.x - start.x;
  const vy = point.y - start.y;
  const vz = point.z - start.z;
  return (vx * dx + vy * dy + vz * dz) / lenSq;
}

function lineSupportFrame(edge: Edge): { key: string; anchor: Point3D; direction: Point3D } | null {
  if (edge.curve.type !== 'line3d') {
    return null;
  }

  let dir = edge.curve.direction;
  if (
    dir.x < 0 ||
    (Math.abs(dir.x) < 1e-9 && dir.y < 0) ||
    (Math.abs(dir.x) < 1e-9 && Math.abs(dir.y) < 1e-9 && dir.z < 0)
  ) {
    dir = { x: -dir.x, y: -dir.y, z: -dir.z };
  }

  const origin = edge.curve.origin;
  const dot = origin.x * dir.x + origin.y * dir.y + origin.z * dir.z;
  const anchor = {
    x: origin.x - dir.x * dot,
    y: origin.y - dir.y * dot,
    z: origin.z - dir.z * dot,
  };

  return {
    key:
      `L:${roundSupportValue(anchor.x)},${roundSupportValue(anchor.y)},${roundSupportValue(anchor.z)}` +
      `|d=${roundSupportValue(dir.x)},${roundSupportValue(dir.y)},${roundSupportValue(dir.z)}`,
    anchor,
    direction: dir,
  };
}

function parseSupportFrame(key: string): { key: string; anchor: Point3D; direction: Point3D } | null {
  if (!key.startsWith('L:')) {
    return null;
  }

  const [anchorPart, directionPart] = key.split('|d=');
  if (!anchorPart || !directionPart) {
    return null;
  }

  const anchorValues = anchorPart.slice(2).split(',').map(Number);
  const directionValues = directionPart.split(',').map(Number);
  if (anchorValues.length !== 3 || directionValues.length !== 3 || anchorValues.some(Number.isNaN) || directionValues.some(Number.isNaN)) {
    return null;
  }

  const rawDirection = {
    x: directionValues[0],
    y: directionValues[1],
    z: directionValues[2],
  };
  const directionLength = Math.sqrt(
    rawDirection.x * rawDirection.x +
    rawDirection.y * rawDirection.y +
    rawDirection.z * rawDirection.z,
  );
  if (directionLength <= 1e-12) {
    return null;
  }

  return {
    key,
    anchor: {
      x: anchorValues[0],
      y: anchorValues[1],
      z: anchorValues[2],
    },
    direction: {
      x: rawDirection.x / directionLength,
      y: rawDirection.y / directionLength,
      z: rawDirection.z / directionLength,
    },
  };
}

function canonicalSupportFrame(edge: Edge): { key: string; anchor: Point3D; direction: Point3D } | null {
  const support = lineSupportFrame(edge);
  if (!support) {
    return null;
  }
  return parseSupportFrame(support.key) ?? support;
}

function pointParamOnSupportFrame(
  point: Point3D,
  frame: { anchor: Point3D; direction: Point3D },
): number {
  return (
    (point.x - frame.anchor.x) * frame.direction.x +
    (point.y - frame.anchor.y) * frame.direction.y +
    (point.z - frame.anchor.z) * frame.direction.z
  );
}

function pointParamOnSupportLine(point: Point3D, edge: Edge): number | null {
  const frame = canonicalSupportFrame(edge);
  if (!frame) {
    return null;
  }
  return pointParamOnSupportFrame(point, frame);
}

function supportEdgeIdentity(edge: Edge): string | null {
  const support = lineSupportFrame(edge.sourceEdge ?? edge);
  return support?.key ?? null;
}

function buildOpenLineIntervals(faces: Face[]): Map<string, OpenLineInterval[]> {
  const breakpoints = new Map<string, number[]>();

  function addBreakpoint(key: string, value: number): void {
    let values = breakpoints.get(key);
    if (!values) {
      values = [];
      breakpoints.set(key, values);
    }
    addClusteredValue(values, value);
  }

  function addEdge(edge: Edge): void {
    if (edge.degenerate || edge.curve.type !== 'line3d' || edge.curve.isClosed) {
      return;
    }
    const supportEdge = edge.sourceEdge ?? edge;
    if (supportEdge.curve.type !== 'line3d') {
      return;
    }
    const key = supportEdgeIdentity(edge);
    const startT = pointParamOnSupportLine(edgeStartPoint(edge), supportEdge);
    const endT = pointParamOnSupportLine(edgeEndPoint(edge), supportEdge);
    if (!key || startT === null || endT === null) {
      return;
    }
    addBreakpoint(key, startT);
    addBreakpoint(key, endT);
  }

  for (const face of faces) {
    for (const oe of face.outerWire.edges) addEdge(oe.edge);
    for (const wire of face.innerWires) {
      for (const oe of wire.edges) addEdge(oe.edge);
    }
  }

  for (const values of breakpoints.values()) {
    values.sort((a, b) => a - b);
  }

  const intervalMap = new Map<string, OpenLineInterval[]>();

  function addIntervalsForEdge(edge: Edge): void {
    if (edge.degenerate || edge.curve.type !== 'line3d' || edge.curve.isClosed) {
      return;
    }
    const supportEdge = edge.sourceEdge ?? edge;
    if (supportEdge.curve.type !== 'line3d') {
      return;
    }
    const key = supportEdgeIdentity(edge);
    const sourceBreakpoints = key ? breakpoints.get(key) ?? [] : [];
    const edgeStart = edgeStartPoint(edge);
    const edgeEnd = edgeEndPoint(edge);
    const edgeStartT = pointParamOnSupportLine(edgeStart, supportEdge);
    const edgeEndT = pointParamOnSupportLine(edgeEnd, supportEdge);
    if (!key || sourceBreakpoints.length < 2 || edgeStartT === null || edgeEndT === null) {
      return;
    }

    let intervals = intervalMap.get(key);
    if (!intervals) {
      intervals = [];
      intervalMap.set(key, intervals);
    }

    const minT = Math.min(edgeStartT, edgeEndT);
    const maxT = Math.max(edgeStartT, edgeEndT);
    const support = lineSupportFrame(supportEdge);
    if (!support) {
      return;
    }

    for (let i = 0; i + 1 < sourceBreakpoints.length; i++) {
      const startT = sourceBreakpoints[i];
      const endT = sourceBreakpoints[i + 1];
      if (endT - startT <= INTERVAL_PARAM_TOL) {
        continue;
      }
      if (startT < minT - INTERVAL_PARAM_TOL || endT > maxT + INTERVAL_PARAM_TOL) {
        continue;
      }

      const existing = intervals.find((entry) =>
        sameInterval(entry.startT, entry.endT, startT, endT));
      if (existing) {
        assignObservedIntervalPoint(existing, startT, endT, edgeStartT, edgeEndT, edgeStart, edgeEnd);
        continue;
      }

      const interval: OpenLineInterval = {
        supportKey: key,
        supportEdge,
        startT,
        endT,
        canonicalStart: {
          x: support.anchor.x + support.direction.x * startT,
          y: support.anchor.y + support.direction.y * startT,
          z: support.anchor.z + support.direction.z * startT,
        },
        canonicalEnd: {
          x: support.anchor.x + support.direction.x * endT,
          y: support.anchor.y + support.direction.y * endT,
          z: support.anchor.z + support.direction.z * endT,
        },
      };
      assignObservedIntervalPoint(interval, startT, endT, edgeStartT, edgeEndT, edgeStart, edgeEnd);
      intervals.push(interval);
    }
  }

  for (const face of faces) {
    for (const oe of face.outerWire.edges) addIntervalsForEdge(oe.edge);
    for (const wire of face.innerWires) {
      for (const oe of wire.edges) addIntervalsForEdge(oe.edge);
    }
  }

  for (const intervals of intervalMap.values()) {
    intervals.sort((a, b) => a.startT - b.startT || a.endT - b.endT);
  }

  return intervalMap;
}

export function debugBuildOpenLineIntervals(faces: Face[]): Map<string, OpenLineInterval[]> {
  return buildOpenLineIntervals(faces);
}

function pointNearLineEdge3D(point: Point3D, edge: Edge): { onEdge: boolean; t: number } {
  const t = pointParamOnLineEdge(point, edge);
  if (t === null) {
    return { onEdge: false, t: 0 };
  }
  if (t < STITCH_TOL || t > 1 - STITCH_TOL) {
    return { onEdge: false, t };
  }

  const start = edgeStartPoint(edge);
  const end = edgeEndPoint(edge);
  const closest = {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  };
  return {
    onEdge: distance(point, closest) <= SPLIT_VERTEX_TOL * 20,
    t,
  };
}

function pointNearSupportLineSegment(
  point: Point3D,
  edge: Edge,
  sourceEdge: Edge,
): { onEdge: boolean; t: number } {
  const frame = canonicalSupportFrame(sourceEdge);
  if (!frame) {
    return { onEdge: false, t: 0 };
  }

  const edgeStartT = pointParamOnSupportFrame(edgeStartPoint(edge), frame);
  const edgeEndT = pointParamOnSupportFrame(edgeEndPoint(edge), frame);
  const pointT = pointParamOnSupportFrame(point, frame);
  if (edgeStartT === null || edgeEndT === null || pointT === null) {
    return { onEdge: false, t: 0 };
  }

  const minT = Math.min(edgeStartT, edgeEndT);
  const maxT = Math.max(edgeStartT, edgeEndT);
  if (pointT < minT + STITCH_TOL || pointT > maxT - STITCH_TOL) {
    return { onEdge: false, t: pointT };
  }

  const closest = {
    x: frame.anchor.x + frame.direction.x * pointT,
    y: frame.anchor.y + frame.direction.y * pointT,
    z: frame.anchor.z + frame.direction.z * pointT,
  };
  const onEdge = distance(point, closest) <= SPLIT_VERTEX_TOL * 10;
  return { onEdge, t: pointT };
}

function buildPaveBlock(edge: Edge): PaveBlock | null {
  if (edge.curve.type !== 'line3d') {
    return null;
  }
  const sourceEdge = edge.sourceEdge;
  if (!sourceEdge || sourceEdge.curve.type !== 'line3d') {
    return null;
  }
  const startT = pointParamOnSupportLine(edgeStartPoint(edge), sourceEdge);
  const endT = pointParamOnSupportLine(edgeEndPoint(edge), sourceEdge);
  if (startT === null || endT === null) {
    return null;
  }
  return {
    edge,
    sourceEdge,
    startT: Math.min(startT, endT),
    endT: Math.max(startT, endT),
  };
}

function sourceEdgeIdentity(edge: Edge): string | null {
  if (edge.curve.type !== 'line3d') {
    return null;
  }
  const source = edge.sourceEdge;
  if (!source || source.curve.type !== 'line3d') {
    return null;
  }
  const frame = lineSupportFrame(source);
  if (!frame) {
    return null;
  }
  return frame.key;
}

function collectCommonBlockIntervals(faces: Face[]): Map<string, number[]> {
  const intervals = new Map<string, number[]>();

  function addEdge(edge: Edge): void {
    const pave = buildPaveBlock(edge);
    const sourceKey = sourceEdgeIdentity(edge);
    if (!pave || !sourceKey) {
      return;
    }
    let values = intervals.get(sourceKey);
    if (!values) {
      values = [];
      intervals.set(sourceKey, values);
    }
    for (const value of [pave.startT, pave.endT]) {
      addClusteredValue(values, value);
    }
  }

  for (const face of faces) {
    for (const oe of face.outerWire.edges) addEdge(oe.edge);
    for (const wire of face.innerWires) {
      for (const oe of wire.edges) addEdge(oe.edge);
    }
  }

  for (const values of intervals.values()) {
    values.sort((a, b) => a - b);
  }

  return intervals;
}

function buildCommonIntervals(faces: Face[]): Map<string, CommonInterval[]> {
  const breakpoints = collectCommonBlockIntervals(faces);
  const intervalMap = new Map<string, CommonInterval[]>();

  function addEdge(edge: Edge): void {
    const pave = buildPaveBlock(edge);
    const sourceKey = sourceEdgeIdentity(edge);
    if (!pave || !sourceKey) {
      return;
    }

    const sourceBreakpoints = breakpoints.get(sourceKey) ?? [];
    if (sourceBreakpoints.length < 2) {
      return;
    }

    const edgeStart = edgeStartPoint(edge);
    const edgeEnd = edgeEndPoint(edge);
    const edgeStartT = pointParamOnSupportLine(edgeStart, pave.sourceEdge);
    const edgeEndT = pointParamOnSupportLine(edgeEnd, pave.sourceEdge);

    let intervals = intervalMap.get(sourceKey);
    if (!intervals) {
      intervals = [];
      intervalMap.set(sourceKey, intervals);
    }

    for (let i = 0; i + 1 < sourceBreakpoints.length; i++) {
      const startT = sourceBreakpoints[i];
      const endT = sourceBreakpoints[i + 1];
      if (endT - startT <= INTERVAL_PARAM_TOL) {
        continue;
      }
      if (startT < pave.startT - INTERVAL_PARAM_TOL || endT > pave.endT + INTERVAL_PARAM_TOL) {
        continue;
      }

      const existing = intervals.find((entry) =>
        sameInterval(entry.startT, entry.endT, startT, endT));
      if (existing) {
        assignObservedIntervalPoint(existing, startT, endT, edgeStartT, edgeEndT, edgeStart, edgeEnd);
        continue;
      }

      const support = lineSupportFrame(pave.sourceEdge);
      if (!support) {
        continue;
      }
      const interval: CommonInterval = {
        sourceEdge: pave.sourceEdge,
        startT,
        endT,
        canonicalStart: {
        x: support.anchor.x + support.direction.x * startT,
        y: support.anchor.y + support.direction.y * startT,
        z: support.anchor.z + support.direction.z * startT,
        },
        canonicalEnd: {
        x: support.anchor.x + support.direction.x * endT,
        y: support.anchor.y + support.direction.y * endT,
        z: support.anchor.z + support.direction.z * endT,
        },
      };
      assignObservedIntervalPoint(interval, startT, endT, edgeStartT, edgeEndT, edgeStart, edgeEnd);
      intervals.push(interval);
    }
  }

  for (const face of faces) {
    for (const oe of face.outerWire.edges) addEdge(oe.edge);
    for (const wire of face.innerWires) {
      for (const oe of wire.edges) addEdge(oe.edge);
    }
  }

  for (const intervals of intervalMap.values()) {
    intervals.sort((a, b) => a.startT - b.startT || a.endT - b.endT);
  }

  return intervalMap;
}

export function debugBuildCommonIntervals(faces: Face[]): Map<string, CommonInterval[]> {
  return buildCommonIntervals(faces);
}

function splitWireByCommonBlocks(
  wire: Wire,
  commonIntervals: Map<string, CommonInterval[]>,
): Wire {
  const splitEdges: OrientedEdge[] = [];
  let anySplit = false;

  for (const oe of wire.edges) {
    const pave = buildPaveBlock(oe.edge);
    const sourceKey = sourceEdgeIdentity(oe.edge);
    if (!pave || !sourceKey) {
      splitEdges.push(oe);
      continue;
    }

    const intervals = commonIntervals.get(sourceKey) ?? [];
    const covering = intervals.filter((entry) =>
      entry.startT >= pave.startT - INTERVAL_PARAM_TOL &&
      entry.endT <= pave.endT + INTERVAL_PARAM_TOL);
    if (covering.length <= 1) {
      splitEdges.push(oe);
      continue;
    }

    const interior = covering.filter((entry) =>
      entry.startT > pave.startT + INTERVAL_PARAM_TOL ||
      entry.endT < pave.endT - INTERVAL_PARAM_TOL);
    if (interior.length === 0) {
      splitEdges.push(oe);
      continue;
    }

    anySplit = true;
    const ordered = oe.forward ? covering : [...covering].reverse();
    const wireStart = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const wireEnd = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i];
      const isFirst = i === 0;
      const isLast = i === ordered.length - 1;
      const canonicalStart = oe.forward ? entry.canonicalStart : entry.canonicalEnd;
      const canonicalEnd = oe.forward ? entry.canonicalEnd : entry.canonicalStart;
      const segStart = isFirst ? wireStart : canonicalStart;
      const segEnd = isLast ? wireEnd : canonicalEnd;
      const lineResult = makeLine3D(segStart, segEnd);
      if (!lineResult.success) {
        continue;
      }
      const edgeResult = makeEdgeFromCurve(lineResult.result!);
      if (!edgeResult.success) {
        continue;
      }
      splitEdges.push(orientEdge({ ...edgeResult.result!, sourceEdge: pave.sourceEdge }, true));
    }
  }

  if (!anySplit) {
    return wire;
  }

  const wireResult = makeWire(splitEdges);
  return wireResult.success ? wireResult.result! : wire;
}

function splitWireByOpenLineIntervals(
  wire: Wire,
  openIntervals: Map<string, OpenLineInterval[]>,
): Wire {
  const splitEdges: OrientedEdge[] = [];
  let anySplit = false;

  for (const oe of wire.edges) {
    if (oe.edge.degenerate || oe.edge.curve.type !== 'line3d' || oe.edge.curve.isClosed) {
      splitEdges.push(oe);
      continue;
    }

    const supportEdge = oe.edge.sourceEdge ?? oe.edge;
    if (supportEdge.curve.type !== 'line3d') {
      splitEdges.push(oe);
      continue;
    }

    const key = supportEdgeIdentity(oe.edge);
    const startT = pointParamOnSupportLine(edgeStartPoint(oe.edge), supportEdge);
    const endT = pointParamOnSupportLine(edgeEndPoint(oe.edge), supportEdge);
    if (!key || startT === null || endT === null) {
      splitEdges.push(oe);
      continue;
    }

    const intervals = openIntervals.get(key) ?? [];
    const minT = Math.min(startT, endT);
    const maxT = Math.max(startT, endT);
    const covering = intervals.filter((entry) =>
      entry.startT >= minT - INTERVAL_PARAM_TOL &&
      entry.endT <= maxT + INTERVAL_PARAM_TOL);
    if (covering.length <= 1) {
      splitEdges.push(oe);
      continue;
    }

    anySplit = true;
    const ordered = oe.forward ? covering : [...covering].reverse();
    const wireStart = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const wireEnd = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i];
      const isFirst = i === 0;
      const isLast = i === ordered.length - 1;
      const canonicalStart = oe.forward ? entry.canonicalStart : entry.canonicalEnd;
      const canonicalEnd = oe.forward ? entry.canonicalEnd : entry.canonicalStart;
      const segStart = isFirst ? wireStart : canonicalStart;
      const segEnd = isLast ? wireEnd : canonicalEnd;
      const lineResult = makeLine3D(segStart, segEnd);
      if (!lineResult.success) {
        continue;
      }
      const edgeResult = makeEdgeFromCurve(lineResult.result!);
      if (!edgeResult.success) {
        continue;
      }
      splitEdges.push(orientEdge({ ...edgeResult.result!, sourceEdge: supportEdge }, true));
    }
  }

  if (!anySplit) {
    return wire;
  }

  const wireResult = makeWire(splitEdges);
  return wireResult.success ? wireResult.result! : wire;
}

export function debugSplitWireByCommonBlocks(wire: Wire, faces: Face[]): Wire {
  return splitWireByCommonBlocks(wire, buildCommonIntervals(faces));
}

export function debugApplyCommonBlocks(face: Face, faces: Face[]): Face {
  const commonIntervals = buildCommonIntervals(faces);
  const outerWire = splitWireByCommonBlocks(face.outerWire, commonIntervals);
  const innerWires = face.innerWires.map((wire) => splitWireByCommonBlocks(wire, commonIntervals));
  const faceResult = makeFace(face.surface, outerWire, [...innerWires], face.forward);
  return faceResult.success ? faceResult.result! : face;
}

function splitWireAtVertices(wire: Wire, surface: Surface, vertices: Point3D[]): Wire {
  const splitEdges: OrientedEdge[] = [];
  let anySplit = false;

  function appendLineSegment(start: Point3D, end: Point3D): void {
    if (distance(start, end) <= STITCH_TOL) {
      return;
    }

    const previous = splitEdges[splitEdges.length - 1];
    if (previous) {
      const previousStart = edgeStartPoint(previous.edge);
      const previousEnd = edgeEndPoint(previous.edge);
      const sameDirection =
        distance(previousStart, start) <= STITCH_TOL && distance(previousEnd, end) <= STITCH_TOL;
      const reversedDirection =
        distance(previousStart, end) <= STITCH_TOL && distance(previousEnd, start) <= STITCH_TOL;
      if (sameDirection || reversedDirection) {
        return;
      }
    }

    const lineResult = makeLine3D(start, end);
    if (!lineResult.success) {
      return;
    }
    const edgeResult = makeEdgeFromCurve(lineResult.result!);
    if (!edgeResult.success) {
      return;
    }
    splitEdges.push(orientEdge(edgeResult.result!, true));
  }

  for (const oe of wire.edges) {
    if (oe.edge.degenerate || oe.edge.curve.type !== 'line3d') {
      splitEdges.push(oe);
      continue;
    }

    // OCCT common-block splitting subdivides section/common edges, not untouched
    // original periodic boundaries. Preserving those boundaries here avoids
    // spuriously paving a periodic face outer wire with vertices that belong to
    // interior coincident sections on another face.
    if (toAdapter(surface).isUPeriodic && !oe.edge.sourceEdge) {
      splitEdges.push(oe);
      continue;
    }

    const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
    const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq < STITCH_TOL * STITCH_TOL) {
      splitEdges.push(oe);
      continue;
    }

    const referenceEdge = oe.edge;
    const sourceEdge =
      referenceEdge.sourceEdge && referenceEdge.sourceEdge.curve.type === 'line3d'
        ? referenceEdge.sourceEdge
        : null;
    const refStartT = sourceEdge
      ? pointParamOnSupportLine(start, sourceEdge)
      : pointParamOnLineEdge(start, referenceEdge);
    const refEndT = sourceEdge
      ? pointParamOnSupportLine(end, sourceEdge)
      : pointParamOnLineEdge(end, referenceEdge);
    const refMinT = refStartT !== null && refEndT !== null ? Math.min(refStartT, refEndT) : 0;
    const refMaxT = refStartT !== null && refEndT !== null ? Math.max(refStartT, refEndT) : 1;

    const intermediates: { t: number; point: Point3D }[] = [];
    for (const vertex of vertices) {
      if (distance(vertex, start) < STITCH_TOL || distance(vertex, end) < STITCH_TOL) {
        continue;
      }

      const hit = sourceEdge
        ? pointNearSupportLineSegment(vertex, referenceEdge, sourceEdge)
        : pointNearEdgeOnFace(vertex, referenceEdge, surface);
      if (!hit.onEdge) {
        continue;
      }
      if (hit.t < refMinT - 1e-5 || hit.t > refMaxT + 1e-5) {
        continue;
      }

      const denom = refMaxT - refMinT;
      const localT = denom > 1e-10 ? (hit.t - refMinT) / denom : hit.t;
      if (localT < STITCH_TOL || localT > 1 - STITCH_TOL) {
        continue;
      }

      intermediates.push({ t: localT, point: vertex });
    }

    if (intermediates.length === 0) {
      const snappedStart = snapToCanonical(start, vertices);
      const snappedEnd = snapToCanonical(end, vertices);
      if (snappedStart !== start || snappedEnd !== end) {
        const lineResult = makeLine3D(snappedStart, snappedEnd);
        if (lineResult.success) {
          const edgeResult = makeEdgeFromCurve(lineResult.result!);
          if (edgeResult.success) {
            splitEdges.push(orientEdge(edgeResult.result!, true));
            anySplit = true;
            continue;
          }
        }
      }

      splitEdges.push(oe);
      continue;
    }

    anySplit = true;
    intermediates.sort((left, right) => left.t - right.t);
    const dedupedIntermediates: { t: number; point: Point3D }[] = [];
    for (const intermediate of intermediates) {
      const snappedPoint = snapToCanonical(intermediate.point, vertices);
      const prev = dedupedIntermediates[dedupedIntermediates.length - 1];
      if (
        prev &&
        (Math.abs(prev.t - intermediate.t) < 1e-5 || distance(prev.point, snappedPoint) <= STITCH_TOL)
      ) {
        continue;
      }
      dedupedIntermediates.push({ t: intermediate.t, point: snappedPoint });
    }

    let current = snapToCanonical(start, vertices);
    for (const intermediate of dedupedIntermediates) {
      appendLineSegment(current, intermediate.point);
      current = intermediate.point;
    }

    appendLineSegment(current, snapToCanonical(end, vertices));
  }

  if (!anySplit) {
    return wire;
  }

  const wireResult = makeWire(splitEdges);
  return wireResult.success ? wireResult.result! : wire;
}

export function preSplitFaceAtVertices(face: Face, vertices: Point3D[]): Face {
  if (vertices.length === 0) {
    return face;
  }

  const outerWire = splitWireAtVertices(face.outerWire, face.surface, vertices);
  const innerWires = face.innerWires.map((wire) => splitWireAtVertices(wire, face.surface, vertices));

  if (outerWire === face.outerWire && innerWires.every((wire, index) => wire === face.innerWires[index])) {
    return face;
  }

  const faceResult = makeFace(face.surface, outerWire, [...innerWires], face.forward);
  return faceResult.success ? faceResult.result! : face;
}

export function stitchEdges(faces: Face[]): Face[] {
  const commonIntervals = buildCommonIntervals(faces);
  const commonVertices: Point3D[] = [];
  for (const intervals of commonIntervals.values()) {
    for (const interval of intervals) {
      pushUnique(commonVertices, interval.canonicalStart);
      pushUnique(commonVertices, interval.canonicalEnd);
    }
  }

  const preSplitFaces = faces.map((face) => {
    const faceVertices: Point3D[] = [...commonVertices];
    for (const oe of face.outerWire.edges) {
      pushUnique(faceVertices, edgeStartPoint(oe.edge));
      pushUnique(faceVertices, edgeEndPoint(oe.edge));
    }
    for (const innerWire of face.innerWires) {
      for (const oe of innerWire.edges) {
        pushUnique(faceVertices, edgeStartPoint(oe.edge));
        pushUnique(faceVertices, edgeEndPoint(oe.edge));
      }
    }
    const preOuter = splitWireByCommonBlocks(face.outerWire, commonIntervals);
    const preInner = face.innerWires.map((wire) => splitWireByCommonBlocks(wire, commonIntervals));
    const preFaceResult = makeFace(face.surface, preOuter, [...preInner], face.forward);
    const preFace = preFaceResult.success ? preFaceResult.result! : face;
    return preSplitFaceAtVertices(preFace, faceVertices);
  });

  const openIntervals = buildOpenLineIntervals(preSplitFaces);

  const intervalFaces = preSplitFaces.map((splitFace) => {
    const splitOuter = splitWireByOpenLineIntervals(splitFace.outerWire, openIntervals);
    const splitInner = splitFace.innerWires.map((wire) => splitWireByOpenLineIntervals(wire, openIntervals));
    const intervalFaceResult = makeFace(splitFace.surface, splitOuter, [...splitInner], splitFace.forward);
    return intervalFaceResult.success ? intervalFaceResult.result! : splitFace;
  });

  function canonicalizeFaces(inputFaces: Face[]): Face[] {
    const canonicalClosedEdges = new Map<string, Edge>();
    const canonicalClosedDirections = new Map<string, boolean>();
    const canonicalOpenEdges = new Map<string, Edge>();
    const canonicalOpenDirections = new Map<string, boolean>();
    const fuzzyCanonicalOpenEdges: { edge: Edge; effectiveForward: boolean }[] = [];

    return inputFaces.map((intervalFace) => {
      const outerWire = canonicalizeClosedEdges(
        intervalFace.outerWire,
        intervalFace.forward,
        canonicalClosedEdges,
        canonicalClosedDirections,
      );
      const outerWireOpen = canonicalizeOpenEdges(
        outerWire,
        intervalFace.forward,
        canonicalOpenEdges,
        canonicalOpenDirections,
        fuzzyCanonicalOpenEdges,
      );
      const innerWires = intervalFace.innerWires.map((wire) =>
        canonicalizeClosedEdges(wire, intervalFace.forward, canonicalClosedEdges, canonicalClosedDirections));
      const innerWiresOpen = innerWires.map((wire) =>
        canonicalizeOpenEdges(
          wire,
          intervalFace.forward,
          canonicalOpenEdges,
          canonicalOpenDirections,
          fuzzyCanonicalOpenEdges,
        ));
      if (outerWireOpen === intervalFace.outerWire && innerWiresOpen.every((wire, index) => wire === intervalFace.innerWires[index])) {
        return intervalFace;
      }

      const rebuilt = makeFace(intervalFace.surface, outerWireOpen, [...innerWiresOpen], intervalFace.forward);
      return rebuilt.success ? rebuilt.result! : intervalFace;
    });
  }

  const canonicalFaces = canonicalizeFaces(intervalFaces);
  const propagatedOpenIntervals = buildOpenLineIntervals(canonicalFaces);
  const propagatedFaces = canonicalFaces.map((face) => {
    const splitOuter = splitWireByOpenLineIntervals(face.outerWire, propagatedOpenIntervals);
    const splitInner = face.innerWires.map((wire) => splitWireByOpenLineIntervals(wire, propagatedOpenIntervals));
    const rebuilt = makeFace(face.surface, splitOuter, [...splitInner], face.forward);
    return rebuilt.success ? rebuilt.result! : face;
  });

  return canonicalizeFaces(propagatedFaces);
}
