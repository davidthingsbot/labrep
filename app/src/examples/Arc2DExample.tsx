'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  makeArc2D,
  makeArc2DThrough3Points,
  makeArc2DFromBulge,
  evaluateArc2D,
  tangentArc2D,
  lengthArc2D,
  reverseArc2D,
} from '@labrep/generation';
import { PointViz, VectorViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Discretize an arc into polyline points for rendering. */
function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = 48,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (i / segments) * (endAngle - startAngle);
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), 0]);
  }
  return pts;
}

/** Example demonstrating all Arc2D functions. */
export function Arc2DExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // makeArc2D — from center, radius, angles
    const arc1Result = makeArc2D(point2d(-2.5, 0.5), 1.0, 0, Math.PI / 2);
    if (!arc1Result.success) return null;
    const arc1 = arc1Result.result!;

    // makeArc2DThrough3Points
    const p1 = point2d(-0.5, -0.5);
    const p2 = point2d(0.5, 0.5);
    const p3 = point2d(1.5, -0.3);
    const arc2Result = makeArc2DThrough3Points(p1, p2, p3);
    if (!arc2Result.success) return null;
    const arc2 = arc2Result.result!;

    // makeArc2DFromBulge
    const arc3Result = makeArc2DFromBulge(point2d(2, -1), point2d(3.5, 1), 0.5);
    if (!arc3Result.success) return null;
    const arc3 = arc3Result.result!;

    // reverseArc2D
    const arc1Rev = reverseArc2D(arc1);

    // lengthArc2D
    const len1 = lengthArc2D(arc1);
    const len2 = lengthArc2D(arc2);
    const len3 = lengthArc2D(arc3);

    return { arc1, arc2, arc3, arc1Rev, p1, p2, p3, len1, len2, len3 };
  }, []);

  const pts1 = useMemo(() => data ? arcPoints(data.arc1.center.x, data.arc1.center.y, data.arc1.radius, data.arc1.startAngle, data.arc1.endAngle) : [], [data]);
  const pts2 = useMemo(() => data ? arcPoints(data.arc2.center.x, data.arc2.center.y, data.arc2.radius, data.arc2.startAngle, data.arc2.endAngle) : [], [data]);
  const pts3 = useMemo(() => data ? arcPoints(data.arc3.center.x, data.arc3.center.y, data.arc3.radius, data.arc3.startAngle, data.arc3.endAngle) : [], [data]);
  const ptsRev = useMemo(() => data ? arcPoints(data.arc1Rev.center.x, data.arc1Rev.center.y - 1.8, data.arc1Rev.radius, data.arc1Rev.startAngle, data.arc1Rev.endAngle) : [], [data]);

  if (!data) return null;
  const { arc1, arc2, arc3, p1, p2, p3, len1, len2, len3 } = data;

  const frac = animationAngle / (2 * Math.PI);

  // Animated point + tangent on arc1
  const t1 = arc1.startAngle + frac * (arc1.endAngle - arc1.startAngle);
  const moving1 = evaluateArc2D(arc1, t1);
  const tan1 = tangentArc2D(arc1, t1);

  // Animated point + tangent on arc2
  const t2 = arc2.startAngle + frac * (arc2.endAngle - arc2.startAngle);
  const moving2 = evaluateArc2D(arc2, t2);
  const tan2 = tangentArc2D(arc2, t2);

  return (
    <group>
      <BillboardText position={[0.5, 3.5, 0]} fontSize={0.4} color="white">
        Arc2D
      </BillboardText>

      {/* Arc 1 — makeArc2D (quarter circle) */}
      <Line points={pts1} color="cyan" lineWidth={2} />
      <PointViz point={{ x: arc1.center.x, y: arc1.center.y, z: 0 }} color="gray" label="C1" size={0.03} />
      <PointViz point={{ x: arc1.startPoint.x, y: arc1.startPoint.y, z: 0 }} color="white" size={0.03} />
      <PointViz point={{ x: arc1.endPoint.x, y: arc1.endPoint.y, z: 0 }} color="white" size={0.03} />
      <group position={[moving1.x, moving1.y, 0]}>
        <Sphere args={[0.06, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>
      <VectorViz
        origin={{ x: moving1.x, y: moving1.y, z: 0 }}
        vector={{ x: tan1.x * 0.5, y: tan1.y * 0.5, z: 0 }}
        color="orange"
      />

      {/* Reversed arc1 shown below */}
      <Line points={ptsRev} color="#555555" lineWidth={1} />
      <BillboardText position={[-2.5, -1.8, 0]} fontSize={0.09} color="#555555">
        reversed
      </BillboardText>

      {/* Arc 2 — makeArc2DThrough3Points */}
      <Line points={pts2} color="magenta" lineWidth={2} />
      <PointViz point={{ x: p1.x, y: p1.y, z: 0 }} color="magenta" label="p1" size={0.03} />
      <PointViz point={{ x: p2.x, y: p2.y, z: 0 }} color="magenta" label="p2" size={0.03} />
      <PointViz point={{ x: p3.x, y: p3.y, z: 0 }} color="magenta" label="p3" size={0.03} />
      <group position={[moving2.x, moving2.y, 0]}>
        <Sphere args={[0.06, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>
      <VectorViz
        origin={{ x: moving2.x, y: moving2.y, z: 0 }}
        vector={{ x: tan2.x * 0.5, y: tan2.y * 0.5, z: 0 }}
        color="orange"
      />

      {/* Arc 3 — makeArc2DFromBulge */}
      <Line points={pts3} color="#44aa88" lineWidth={2} />
      <PointViz point={{ x: arc3.startPoint.x, y: arc3.startPoint.y, z: 0 }} color="#44aa88" label="bulge start" size={0.03} />
      <PointViz point={{ x: arc3.endPoint.x, y: arc3.endPoint.y, z: 0 }} color="#44aa88" label="bulge end" size={0.03} />

      {/* Info */}
      <BillboardText position={[-2.5, -2.8, 0]} fontSize={0.1} color="cyan">
        {`90° arc, L=${len1.toFixed(2)}`}
      </BillboardText>
      <BillboardText position={[0.3, -2.8, 0]} fontSize={0.1} color="magenta">
        {`3pts, L=${len2.toFixed(2)}`}
      </BillboardText>
      <BillboardText position={[2.8, -2.8, 0]} fontSize={0.1} color="#44aa88">
        {`bulge=0.5, L=${len3.toFixed(2)}`}
      </BillboardText>
    </group>
  );
}
