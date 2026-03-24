'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  Z_AXIS_3D,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  revolvePartial,
  solidVolume,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Rectangle in XZ plane with one edge on Z axis */
function makeRectangleXZ(r: number, h: number) {
  const p1 = point3d(0, 0, 0);
  const p2 = point3d(r, 0, 0);
  const p3 = point3d(r, 0, h);
  const p4 = point3d(0, 0, h);
  const edges = [
    makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
    makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
    makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
    makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
  ];
  return makeWireFromEdges(edges).result!;
}

/** Sample a partial cylinder wireframe */
function samplePartialCylinder(
  r: number, h: number, startAngle: number, endAngle: number, nCircles: number,
) {
  const circles: [number, number, number][][] = [];
  const meridians: [number, number, number][][] = [];

  // Cross-section circles at various heights
  for (let i = 0; i <= nCircles; i++) {
    const z = (i / nCircles) * h;
    const pts: [number, number, number][] = [];
    const nPts = 32;
    for (let j = 0; j <= nPts; j++) {
      const t = startAngle + (j / nPts) * (endAngle - startAngle);
      pts.push([r * Math.cos(t), r * Math.sin(t), z]);
    }
    circles.push(pts);
  }

  // Meridional lines
  const nMeridians = 5;
  for (let j = 0; j <= nMeridians; j++) {
    const t = startAngle + (j / nMeridians) * (endAngle - startAngle);
    meridians.push([
      [r * Math.cos(t), r * Math.sin(t), 0],
      [r * Math.cos(t), r * Math.sin(t), h],
    ]);
  }

  // Cap face outlines (pie-slice shapes)
  const startCap: [number, number, number][] = [
    [0, 0, 0], [r * Math.cos(startAngle), r * Math.sin(startAngle), 0],
    [r * Math.cos(startAngle), r * Math.sin(startAngle), h], [0, 0, h], [0, 0, 0],
  ];
  const endCap: [number, number, number][] = [
    [0, 0, 0], [r * Math.cos(endAngle), r * Math.sin(endAngle), 0],
    [r * Math.cos(endAngle), r * Math.sin(endAngle), h], [0, 0, h], [0, 0, 0],
  ];

  return { circles, meridians, startCap, endCap };
}

export function RevolvePartialExample({ animationAngle }: ExampleProps) {
  // Sweep angle varies from ~30° to 330° based on animation
  const sweepAngle = (0.15 + 0.85 * (0.5 + 0.5 * Math.sin(animationAngle))) * 2 * Math.PI;
  const r = 3, h = 5;

  const data = useMemo(() => {
    return { wire: makeRectangleXZ(r, h) };
  }, []);

  // Revolve with current sweep angle
  const result = revolvePartial(data.wire, Z_AXIS_3D, 0, sweepAngle);
  const vol = result.success ? solidVolume(result.result!.solid) : 0;
  const wireframe = samplePartialCylinder(r, h, 0, sweepAngle, 4);

  const angleDeg = (sweepAngle * 180 / Math.PI).toFixed(0);

  return (
    <group>
      {/* Partial cylinder wireframe */}
      {wireframe.circles.map((pts, i) => (
        <Line key={`circ-${i}`} points={pts} color="#22d3ee" lineWidth={1.5} />
      ))}
      {wireframe.meridians.map((pts, i) => (
        <Line key={`mer-${i}`} points={pts} color="#22d3ee" lineWidth={1.5} />
      ))}

      {/* Cap face outlines */}
      <Line points={wireframe.startCap} color="#facc15" lineWidth={2} />
      <Line points={wireframe.endCap} color="#facc15" lineWidth={2} />

      {/* Axis */}
      <Line points={[[0, 0, -1], [0, 0, 7]]} color="#666" lineWidth={1} />

      {/* Labels */}
      <BillboardText position={[0, 0, 7.5]} fontSize={0.5} color="#22d3ee">
        Sweep: {angleDeg}° — Vol: {vol.toFixed(1)} mm³
      </BillboardText>

      <Sphere args={[0.15]} position={[0, 0, 0]}>
        <meshBasicMaterial color="#22d3ee" />
      </Sphere>
    </group>
  );
}
