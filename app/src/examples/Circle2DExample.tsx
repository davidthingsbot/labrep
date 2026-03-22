'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  makeCircle2D,
  makeCircle2DThrough3Points,
  evaluateCircle2D,
  tangentCircle2D,
  lengthCircle2D,
} from '@labrep/generation';
import { PointViz, VectorViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Discretize a circle into polyline points for rendering. */
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

/** Example demonstrating all Circle2D functions. */
export function Circle2DExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // makeCircle2D — from center and radius
    const c1Result = makeCircle2D(point2d(-1, 0), 1.3);
    if (!c1Result.success) return null;
    const c1 = c1Result.result!;

    // makeCircle2DThrough3Points — from three points
    const p1 = point2d(2.5, -0.5);
    const p2 = point2d(3.5, 0.5);
    const p3 = point2d(2.5, 1.5);
    const c2Result = makeCircle2DThrough3Points(p1, p2, p3);
    if (!c2Result.success) return null;
    const c2 = c2Result.result!;

    // lengthCircle2D
    const circumference1 = lengthCircle2D(c1);
    const circumference2 = lengthCircle2D(c2);

    return { c1, c2, p1, p2, p3, circumference1, circumference2 };
  }, []);

  if (!data) return null;
  const { c1, c2, p1, p2, p3, circumference1, circumference2 } = data;

  const pts1 = useMemo(() => circlePoints(c1.center.x, c1.center.y, c1.radius), [c1]);
  const pts2 = useMemo(() => circlePoints(c2.center.x, c2.center.y, c2.radius), [c2]);

  // Animated point on c1
  const movingPoint = evaluateCircle2D(c1, animationAngle);

  // tangentCircle2D — tangent at animated point
  const tangent = tangentCircle2D(c1, animationAngle);

  // Radius line from center to moving point
  const radiusEnd: [number, number, number] = [movingPoint.x, movingPoint.y, 0];

  return (
    <group>
      <BillboardText position={[0.5, 3.5, 0]} fontSize={0.4} color="white">
        Circle2D
      </BillboardText>

      {/* Circle 1 — makeCircle2D */}
      <Line points={pts1} color="cyan" lineWidth={2} />
      <PointViz point={{ x: c1.center.x, y: c1.center.y, z: 0 }} color="gray" label="center" size={0.04} />

      {/* Radius line */}
      <Line
        points={[[c1.center.x, c1.center.y, 0], radiusEnd]}
        color="#555555"
        lineWidth={1}
      />

      {/* Animated point */}
      <group position={radiusEnd}>
        <Sphere args={[0.07, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>

      {/* Tangent vector at animated point */}
      <VectorViz
        origin={{ x: movingPoint.x, y: movingPoint.y, z: 0 }}
        vector={{ x: tangent.x * 0.7, y: tangent.y * 0.7, z: 0 }}
        color="orange"
        label="tangent"
      />

      {/* Circle 2 — makeCircle2DThrough3Points */}
      <Line points={pts2} color="magenta" lineWidth={1.5} />
      <PointViz point={{ x: c2.center.x, y: c2.center.y, z: 0 }} color="gray" size={0.03} />
      {/* The 3 defining points */}
      <PointViz point={{ x: p1.x, y: p1.y, z: 0 }} color="magenta" label="p1" size={0.04} />
      <PointViz point={{ x: p2.x, y: p2.y, z: 0 }} color="magenta" label="p2" size={0.04} />
      <PointViz point={{ x: p3.x, y: p3.y, z: 0 }} color="magenta" label="p3" size={0.04} />

      {/* Info */}
      <BillboardText position={[-1, -2.5, 0]} fontSize={0.11} color="cyan">
        {`C = 2*pi*r = ${circumference1.toFixed(2)}`}
      </BillboardText>
      <BillboardText position={[2.5, -2.5, 0]} fontSize={0.11} color="magenta">
        {`through 3pts, C = ${circumference2.toFixed(2)}`}
      </BillboardText>
    </group>
  );
}
