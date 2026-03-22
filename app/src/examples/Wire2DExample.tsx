'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  makeLine2D,
  makeArc2D,
  makeWire2D,
  evaluateLine2D,
  evaluateArc2D,
  lengthWire2D,
} from '@labrep/generation';
import { PointViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Discretize an arc into polyline points. */
function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = 32,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (i / segments) * (endAngle - startAngle);
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), 0]);
  }
  return pts;
}

/** Example demonstrating Wire2D — connected curve sequences. */
export function Wire2DExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Build a rounded rectangle-ish shape from lines and arcs
    const r = 0.4; // corner radius
    const w = 2;   // half-width (to corner center)
    const h = 1;   // half-height (to corner center)

    // Bottom edge
    const bottom = makeLine2D(point2d(-w, -h - r), point2d(w, -h - r));
    // Bottom-right arc (quarter circle, -π/2 to 0)
    const brArc = makeArc2D(point2d(w, -h), r, -Math.PI / 2, 0);
    // Right edge
    const right = makeLine2D(point2d(w + r, -h), point2d(w + r, h));
    // Top-right arc (0 to π/2)
    const trArc = makeArc2D(point2d(w, h), r, 0, Math.PI / 2);
    // Top edge
    const top = makeLine2D(point2d(w, h + r), point2d(-w, h + r));
    // Top-left arc (π/2 to π)
    const tlArc = makeArc2D(point2d(-w, h), r, Math.PI / 2, Math.PI);
    // Left edge
    const left = makeLine2D(point2d(-w - r, h), point2d(-w - r, -h));
    // Bottom-left arc (π to 3π/2)
    const blArc = makeArc2D(point2d(-w, -h), r, Math.PI, (3 * Math.PI) / 2);

    const curves = [bottom, brArc, right, trArc, top, tlArc, left, blArc];
    // Check all succeeded
    for (const c of curves) {
      if (!c.success) return null;
    }

    const wireResult = makeWire2D(curves.map((c) => c.result!));
    if (!wireResult.success) return null;

    return {
      wire: wireResult.result!,
      bottom: bottom.result!,
      right: right.result!,
      top: top.result!,
      left: left.result!,
      brArc: brArc.result!,
      trArc: trArc.result!,
      tlArc: tlArc.result!,
      blArc: blArc.result!,
    };
  }, []);

  if (!data) return null;

  const { wire, bottom, right, top, left, brArc, trArc, tlArc, blArc } = data;

  // Render line segments
  const lineSegments = [bottom, right, top, left];
  const arcs = [brArc, trArc, tlArc, blArc];

  // Compute animated point position along the wire
  // Walk through curves based on animation fraction
  const totalLength = lengthWire2D(wire);
  const frac = animationAngle / (2 * Math.PI);
  const targetDist = frac * totalLength;

  let accumulated = 0;
  let movingX = wire.startPoint.x;
  let movingY = wire.startPoint.y;

  for (const curve of wire.curves) {
    let curveLen: number;
    if (curve.type === 'line') {
      curveLen = curve.segmentLength;
    } else if (curve.type === 'arc') {
      curveLen = Math.abs(curve.endAngle - curve.startAngle) * curve.radius;
    } else {
      curveLen = 0;
    }

    if (accumulated + curveLen >= targetDist) {
      const localFrac = (targetDist - accumulated) / curveLen;
      if (curve.type === 'line') {
        const pt = evaluateLine2D(curve, localFrac * curve.segmentLength);
        movingX = pt.x;
        movingY = pt.y;
      } else if (curve.type === 'arc') {
        const t = curve.startAngle + localFrac * (curve.endAngle - curve.startAngle);
        const pt = evaluateArc2D(curve, t);
        movingX = pt.x;
        movingY = pt.y;
      }
      break;
    }
    accumulated += curveLen;
  }

  return (
    <group>
      <BillboardText position={[0, 3, 0]} fontSize={0.4} color="white">
        Wire2D
      </BillboardText>

      {/* Line segments */}
      {lineSegments.map((seg, i) => (
        <Line
          key={`seg-${i}`}
          points={[
            [seg.startPoint.x, seg.startPoint.y, 0],
            [seg.endPoint.x, seg.endPoint.y, 0],
          ]}
          color="cyan"
          lineWidth={2}
        />
      ))}

      {/* Arcs */}
      {arcs.map((arc, i) => (
        <Line
          key={`arc-${i}`}
          points={arcPoints(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.endAngle)}
          color="cyan"
          lineWidth={2}
        />
      ))}

      {/* Junction points */}
      {wire.curves.map((curve, i) => (
        <PointViz
          key={`jn-${i}`}
          point={{ x: curve.startPoint.x, y: curve.startPoint.y, z: 0 }}
          color="gray"
          size={0.03}
        />
      ))}

      {/* Animated point */}
      <group position={[movingX, movingY, 0]}>
        <Sphere args={[0.08, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>

      {/* Info */}
      <BillboardText position={[0, -2.5, 0]} fontSize={0.13} color="gray">
        {`${wire.curves.length} curves, ${wire.isClosed ? 'closed' : 'open'}, length = ${totalLength.toFixed(2)}`}
      </BillboardText>
    </group>
  );
}
