import { type Point3D } from '../core';
import { evaluateArc3D } from '../geometry/arc3d';
import { evaluateCircle3D } from '../geometry/circle3d';
import { evaluateEllipse3D } from '../geometry/ellipse3d';
import { edgeEndPoint, edgeStartPoint, type Edge } from '../topology/edge';
import { faceOrientedEdges, type Face } from '../topology/face';
import { materializeShellFaceUse, type ShellFaceUse } from '../topology/shell';

interface EdgeUse {
  key: string;
  directed: string;
  faceClosed: boolean;
}

function round7(value: number): number {
  return Math.round(value / 1e-7) * 1e-7;
}

function edgeKey(oe: { edge: Edge; forward: boolean }): Omit<EdgeUse, 'faceClosed'> | null {
  if (oe.edge.degenerate) {
    return null;
  }

  const start = oe.forward ? edgeStartPoint(oe.edge) : edgeEndPoint(oe.edge);
  const end = oe.forward ? edgeEndPoint(oe.edge) : edgeStartPoint(oe.edge);
  const startKey = `${round7(start.x)},${round7(start.y)},${round7(start.z)}`;
  const endKey = `${round7(end.x)},${round7(end.y)},${round7(end.z)}`;
  const curve = oe.edge.curve;

  if (curve.isClosed && (curve.type === 'circle3d' || curve.type === 'arc3d') && 'plane' in curve) {
    const center = curve.plane.origin;
    const normal = curve.plane.normal;
    let nx = round7(normal.x);
    let ny = round7(normal.y);
    let nz = round7(normal.z);
    const firstNonZero = nx !== 0 ? nx : ny !== 0 ? ny : nz;
    if (firstNonZero < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const key = `C:${round7(center.x)},${round7(center.y)},${round7(center.z)}|r=${round7(curve.radius)}|n=${nx},${ny},${nz}`;
    return {
      key,
      directed: `${key}|${oe.forward ? 'F' : 'R'}`,
    };
  }

  if (curve.type === 'arc3d' && 'plane' in curve) {
    const midParam = (curve.startParam + curve.endParam) / 2;
    const mid = evaluateCurveAt(curve, midParam);
    if (mid) {
      const midKey = `M:${round7(mid.x)},${round7(mid.y)},${round7(mid.z)}`;
      const key = startKey < endKey ? `${startKey}|${endKey}|${midKey}` : `${endKey}|${startKey}|${midKey}`;
      return {
        key,
        directed: `${startKey}->${endKey}|${midKey}`,
      };
    }
  }

  const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
  return {
    key,
    directed: curve.isClosed ? `${startKey}|${oe.forward ? 'F' : 'R'}` : `${startKey}->${endKey}`,
  };
}

function evaluateCurveAt(curve: Edge['curve'], parameter: number): Point3D | null {
  switch (curve.type) {
    case 'line3d':
      return {
        x: curve.start.x + (curve.end.x - curve.start.x) * parameter,
        y: curve.start.y + (curve.end.y - curve.start.y) * parameter,
        z: curve.start.z + (curve.end.z - curve.start.z) * parameter,
      };
    case 'circle3d':
      return evaluateCircle3D(curve, parameter);
    case 'arc3d':
      return evaluateArc3D(curve, parameter);
    case 'ellipse3d':
      return evaluateEllipse3D(curve, parameter);
    default:
      return null;
  }
}

function faceEdgeKeys(face: Face): EdgeUse[] {
  const rawKeys: Omit<EdgeUse, 'faceClosed'>[] = [];
  for (const oe of faceOrientedEdges(face)) {
    const key = edgeKey(oe);
    if (key) {
      rawKeys.push(key);
    }
  }

  const counts = new Map<string, number>();
  for (const key of rawKeys) {
    counts.set(key.key, (counts.get(key.key) || 0) + 1);
  }

  return rawKeys.map((key) => ({
    ...key,
    faceClosed: (counts.get(key.key) || 0) > 1,
  }));
}

export function orientFacesOnShell(faces: Face[]): ShellFaceUse[] {
  if (faces.length <= 1) {
    return faces.map((face) => ({ face, reversed: false }));
  }

  const edgeToFaces = new Map<string, number[]>();
  const faceUses: ShellFaceUse[] = faces.map((face) => ({ face, reversed: false }));
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    for (const { key } of faceEdgeKeys(faceUses[faceIndex].face)) {
      if (!edgeToFaces.has(key)) {
        edgeToFaces.set(key, []);
      }
      const attached = edgeToFaces.get(key)!;
      if (!attached.includes(faceIndex)) {
        attached.push(faceIndex);
      }
    }
  }

  const processed = new Set<number>([0]);
  const queue = [0];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentFace = materializeShellFaceUse(faceUses[current]);
    for (const currentEdge of faceEdgeKeys(currentFace)) {
      const neighbors = edgeToFaces.get(currentEdge.key);
      if (!neighbors) {
        continue;
      }

      for (const neighborIndex of neighbors) {
        if (neighborIndex === current || processed.has(neighborIndex)) {
          continue;
        }

        const neighborFace = materializeShellFaceUse(faceUses[neighborIndex]);
        const neighborEdge = faceEdgeKeys(neighborFace).find((candidate) => candidate.key === currentEdge.key);
        if (!neighborEdge) {
          continue;
        }

        if (currentEdge.directed === neighborEdge.directed && !currentEdge.faceClosed && !neighborEdge.faceClosed) {
          faceUses[neighborIndex] = {
            face: faceUses[neighborIndex].face,
            reversed: true,
          };
        }

        processed.add(neighborIndex);
        queue.push(neighborIndex);
      }
    }
  }

  return faceUses;
}
