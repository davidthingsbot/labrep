/**
 * OCCT-aligned face orientation helpers.
 *
 * These implement the low-level behavior of
 * `BOPTools_AlgoTools::IsSplitToReverse` for faces.
 */
import { dot, point3d, type Point3D, type Vector3D } from '../core';
import { evaluateCurve2D } from '../topology/pcurve';
import { type Face } from '../topology/face';
import { edgeStartPoint, edgeEndPoint } from '../topology/edge';
import { toAdapter } from '../surfaces/surface-adapter';

/**
 * Determine whether a split face should be reversed to match its original face.
 *
 * OCCT reference: `BOPTools_AlgoTools::IsSplitToReverse(const TopoDS_Face&, ...)`.
 *
 * The algorithm has two branches:
 * 1. If the split and original face share the exact same surface object, compare
 *    only their orientation flags.
 * 2. Otherwise, sample an interior point on the split face, compute effective
 *    normals on both faces at the corresponding point, and reverse when the
 *    normals oppose each other.
 *
 * @param splitFace - The candidate split face
 * @param originalFace - The original parent face
 * @returns `true` when the split face should be reversed
 */
export function isSplitFaceReversed(splitFace: Face, originalFace: Face): boolean {
  if (splitFace.surface === originalFace.surface) {
    return splitFace.forward !== originalFace.forward;
  }

  const samplePoint = samplePointOnFace(splitFace);
  const splitNormal = effectiveFaceNormalAtPoint(splitFace, samplePoint);
  const originalNormal = effectiveFaceNormalAtPoint(originalFace, samplePoint);

  return dot(splitNormal, originalNormal) < 0;
}

/**
 * Compute a representative point on a face interior.
 *
 * This is a pragmatic TypeScript adaptation of OCCT's point-in-face sampling:
 * use the face PCurves when available, average in UV space, then evaluate the
 * underlying surface at the averaged parameters.
 *
 * @param face - The face to sample
 * @returns A point on the face surface
 */
export function samplePointOnFace(face: Face): Point3D {
  const adapter = toAdapter(face.surface);
  const uvSamples: { u: number; v: number }[] = [];

  for (const oe of face.outerWire.edges) {
    if (oe.edge.degenerate) {
      continue;
    }

    const matchingPCurves = oe.edge.pcurves.filter((pc) => pc.surface === face.surface);
    if (matchingPCurves.length === 1) {
      const c2d = matchingPCurves[0].curve2d;
      const uvs = [
        evaluateCurve2D(c2d, c2d.startParam),
        evaluateCurve2D(c2d, (c2d.startParam + c2d.endParam) / 2),
        evaluateCurve2D(c2d, c2d.endParam),
      ];
      for (const uv of uvs) {
        let u = uv.x;
        if (adapter.isUPeriodic && u < 0) {
          u += adapter.uPeriod;
        }
        uvSamples.push({ u, v: uv.y });
      }
      continue;
    }

    for (const point of [edgeStartPoint(oe.edge), edgeEndPoint(oe.edge)]) {
      let uv = adapter.projectPoint(point);
      if (adapter.isUPeriodic && uv.u < 0) {
        uv = { u: uv.u + adapter.uPeriod, v: uv.v };
      }
      uvSamples.push(uv);
    }
  }

  if (uvSamples.length === 0) {
    const start = edgeStartPoint(face.outerWire.edges[0].edge);
    const end = edgeEndPoint(face.outerWire.edges[0].edge);
    return point3d(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    );
  }

  const vAverage = uvSamples.reduce((sum, uv) => sum + uv.v, 0) / uvSamples.length;
  const uAverage = averagePeriodicU(uvSamples.map((uv) => uv.u), adapter.isUPeriodic, adapter.uPeriod);
  return adapter.evaluate(uAverage, vAverage);
}

function effectiveFaceNormalAtPoint(face: Face, point: Point3D): Vector3D {
  const adapter = toAdapter(face.surface);
  const uv = adapter.projectPoint(point);
  const normal = adapter.normal(uv.u, uv.v);
  if (face.forward) {
    return normal;
  }
  return { x: -normal.x, y: -normal.y, z: -normal.z };
}

function averagePeriodicU(samples: number[], isPeriodic: boolean, period: number): number {
  if (!isPeriodic || samples.length === 0) {
    return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  let maxGap = -Infinity;
  let gapEnd = 0;

  for (let index = 0; index < sorted.length; index++) {
    const current = sorted[index];
    const next = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + period;
    const gap = next - current;
    if (gap > maxGap) {
      maxGap = gap;
      gapEnd = next % period;
    }
  }

  let shiftedSum = 0;
  for (const sample of samples) {
    let shifted = sample - gapEnd;
    if (shifted < 0) {
      shifted += period;
    }
    shiftedSum += shifted;
  }

  return (shiftedSum / samples.length + gapEnd) % period;
}
