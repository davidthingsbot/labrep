'use client';

import { useMemo } from 'react';
import { Line  } from '@react-three/drei';
import {
  point2d,
  makeLine2D,
  makeCircle2D,
  intersectLine2DLine2D,
  intersectLine2DCircle2D,
  intersectCircle2DCircle2D,
} from '@labrep/generation';
import { PointViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Discretize a circle into polyline points. */
function circlePoints(
  cx: number,
  cy: number,
  radius: number,
  segments: number = 64,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), 0]);
  }
  return pts;
}

/** Example demonstrating all intersection functions. */
export function Intersections2DExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Two lines for intersectLine2DLine2D
    const l1Result = makeLine2D(point2d(-3, -1.5), point2d(0, 2));
    const l2Result = makeLine2D(point2d(-3, 1), point2d(0, -2));
    if (!l1Result.success || !l2Result.success) return null;
    const l1 = l1Result.result!;
    const l2 = l2Result.result!;
    const lineLineHits = intersectLine2DLine2D(l1, l2);

    // A circle and line for intersectLine2DCircle2D
    const c1Result = makeCircle2D(point2d(2, 0), 1.5);
    if (!c1Result.success) return null;
    const c1 = c1Result.result!;
    const l3Result = makeLine2D(point2d(0.5, -2), point2d(3, 2.5));
    if (!l3Result.success) return null;
    const l3 = l3Result.result!;
    const lineCircleHits = intersectLine2DCircle2D(l3, c1);

    // Two circles for intersectCircle2DCircle2D
    const c2Result = makeCircle2D(point2d(3.5, 0), 1.2);
    if (!c2Result.success) return null;
    const c2 = c2Result.result!;
    const circleCircleHits = intersectCircle2DCircle2D(c1, c2);

    return { l1, l2, l3, c1, c2, lineLineHits, lineCircleHits, circleCircleHits };
  }, []);

  if (!data) return null;
  const { l1, l2, l3, c1, c2, lineLineHits, lineCircleHits, circleCircleHits } = data;

  const c1pts = useMemo(() => circlePoints(c1.center.x, c1.center.y, c1.radius), [c1]);
  const c2pts = useMemo(() => circlePoints(c2.center.x, c2.center.y, c2.radius), [c2]);

  // Pulse the intersection points
  const pulse = 0.06 + 0.03 * Math.sin(animationAngle * 3);

  return (
    <group>
      <BillboardText position={[0.5, 3.5, 0]} fontSize={0.4} color="white">
        Intersections
      </BillboardText>

      {/* --- Line-Line intersection --- */}
      <Line
        points={[[l1.startPoint.x, l1.startPoint.y, 0], [l1.endPoint.x, l1.endPoint.y, 0]]}
        color="#888888"
        lineWidth={1.5}
      />
      <Line
        points={[[l2.startPoint.x, l2.startPoint.y, 0], [l2.endPoint.x, l2.endPoint.y, 0]]}
        color="#888888"
        lineWidth={1.5}
      />
      {lineLineHits.map((hit, i) => (
        <PointViz
          key={`ll-${i}`}
          point={{ x: hit.point.x, y: hit.point.y, z: 0 }}
          color="#00ff88"
          size={pulse}
          label={`L∩L`}
        />
      ))}

      {/* --- Line-Circle intersection --- */}
      <Line points={c1pts} color="cyan" lineWidth={1.5} />
      <Line
        points={[[l3.startPoint.x, l3.startPoint.y, 0], [l3.endPoint.x, l3.endPoint.y, 0]]}
        color="#888888"
        lineWidth={1.5}
      />
      {lineCircleHits.map((hit, i) => (
        <PointViz
          key={`lc-${i}`}
          point={{ x: hit.point.x, y: hit.point.y, z: 0 }}
          color="yellow"
          size={pulse}
          label={`L∩C ${i + 1}`}
        />
      ))}

      {/* --- Circle-Circle intersection --- */}
      <Line points={c2pts} color="magenta" lineWidth={1.5} />
      {circleCircleHits.map((hit, i) => (
        <PointViz
          key={`cc-${i}`}
          point={{ x: hit.point.x, y: hit.point.y, z: 0 }}
          color="orange"
          size={pulse}
          label={`C∩C ${i + 1}`}
        />
      ))}

      {/* Centers */}
      <PointViz point={{ x: c1.center.x, y: c1.center.y, z: 0 }} color="gray" size={0.03} />
      <PointViz point={{ x: c2.center.x, y: c2.center.y, z: 0 }} color="gray" size={0.03} />

      {/* Legend */}
      <BillboardText position={[-2, -3, 0]} fontSize={0.11} color="#00ff88">
        {`line ∩ line: ${lineLineHits.length} pt`}
      </BillboardText>
      <BillboardText position={[0.8, -3, 0]} fontSize={0.11} color="yellow">
        {`line ∩ circle: ${lineCircleHits.length} pts`}
      </BillboardText>
      <BillboardText position={[3.5, -3, 0]} fontSize={0.11} color="orange">
        {`circle ∩ circle: ${circleCircleHits.length} pts`}
      </BillboardText>
    </group>
  );
}
