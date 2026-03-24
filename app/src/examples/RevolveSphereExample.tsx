'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  plane,
  Z_AXIS_3D,
  makeCircle3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  revolvePartial,
  solidVolume,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

/** Sample a partial torus wireframe */
function samplePartialTorus(
  R: number, r: number, sweepAngle: number,
): { majorCircles: P3[][]; minorCircles: P3[][] } {
  const majorCircles: P3[][] = [];
  const minorCircles: P3[][] = [];

  // Cross-section circles at intervals along the sweep
  const nMajor = Math.max(2, Math.round(12 * sweepAngle / (2 * Math.PI)));
  for (let i = 0; i <= nMajor; i++) {
    const theta = (i / nMajor) * sweepAngle;
    const pts: P3[] = [];
    for (let j = 0; j <= 24; j++) {
      const phi = (j / 24) * 2 * Math.PI;
      pts.push([
        (R + r * Math.cos(phi)) * Math.cos(theta),
        (R + r * Math.cos(phi)) * Math.sin(theta),
        r * Math.sin(phi),
      ]);
    }
    majorCircles.push(pts);
  }

  // Rings around the tube at outer, inner, top, bottom
  for (const phi of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const pts: P3[] = [];
    const nPts = Math.max(8, Math.round(48 * sweepAngle / (2 * Math.PI)));
    for (let i = 0; i <= nPts; i++) {
      const theta = (i / nPts) * sweepAngle;
      pts.push([
        (R + r * Math.cos(phi)) * Math.cos(theta),
        (R + r * Math.cos(phi)) * Math.sin(theta),
        r * Math.sin(phi),
      ]);
    }
    minorCircles.push(pts);
  }

  return { majorCircles, minorCircles };
}

/**
 * Revolve Sphere & Torus — animate the torus sweep angle,
 * showing the tube profile being swept around the axis.
 * The profile circle (yellow) is visible at the sweep front.
 */
export function RevolveSphereExample({ animationAngle }: ExampleProps) {
  const R = 4, r = 1.2;

  // Sweep from ~20° to 360° — uses sin(t) so it cycles cleanly
  const sweepAngle = (0.06 + 0.94 * (0.5 + 0.5 * Math.sin(animationAngle))) * 2 * Math.PI;

  // Build the torus wire (circle in XZ plane offset from axis)
  const data = useMemo(() => {
    const circlePlane = plane(point3d(R, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, r).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWireFromEdges([edge]).result!;
    return { wire };
  }, []);

  // Revolve with current sweep
  const result = revolvePartial(data.wire, Z_AXIS_3D, 0, sweepAngle);
  const vol = result.success ? solidVolume(result.result!.solid) : 0;
  const fullVol = 2 * Math.PI * Math.PI * R * r * r; // 2π²Rr²

  const wireframe = samplePartialTorus(R, r, sweepAngle);

  // Profile circle at the sweep front
  const frontProfile: P3[] = [];
  for (let j = 0; j <= 32; j++) {
    const phi = (j / 32) * 2 * Math.PI;
    frontProfile.push([
      (R + r * Math.cos(phi)) * Math.cos(sweepAngle),
      (R + r * Math.cos(phi)) * Math.sin(sweepAngle),
      r * Math.sin(phi),
    ]);
  }

  // Profile circle at start (θ=0)
  const startProfile: P3[] = [];
  for (let j = 0; j <= 32; j++) {
    const phi = (j / 32) * 2 * Math.PI;
    startProfile.push([R + r * Math.cos(phi), 0, r * Math.sin(phi)]);
  }

  const angleDeg = (sweepAngle * 180 / Math.PI).toFixed(0);

  return (
    <group>
      {/* Torus wireframe */}
      {wireframe.majorCircles.map((pts, i) => (
        <Line key={`tmaj-${i}`} points={pts} color="#f472b6" lineWidth={1} />
      ))}
      {wireframe.minorCircles.map((pts, i) => (
        <Line key={`tmin-${i}`} points={pts} color="#f472b6" lineWidth={1} />
      ))}

      {/* Profile at start (dimmer) */}
      <Line points={startProfile} color="#facc15" lineWidth={1.5} opacity={0.4} transparent />

      {/* Profile at sweep front (bright) */}
      <Line points={frontProfile} color="#facc15" lineWidth={3} />

      {/* Axis */}
      <Line points={[[0, 0, -3], [0, 0, 4]]} color="#555" lineWidth={1} />

      {/* Center axis marker */}
      <Sphere args={[0.15]} position={[0, 0, 0]}>
        <meshBasicMaterial color="#555" />
      </Sphere>

      {/* Tube center circle (the path the profile follows) */}
      {(() => {
        const pts: P3[] = [];
        const nPts = Math.max(8, Math.round(48 * sweepAngle / (2 * Math.PI)));
        for (let i = 0; i <= nPts; i++) {
          const t = (i / nPts) * sweepAngle;
          pts.push([R * Math.cos(t), R * Math.sin(t), 0]);
        }
        return <Line points={pts} color="#555" lineWidth={1} />;
      })()}

      <BillboardText position={[0, 0, 5]} fontSize={0.45} color="#f472b6">
        Torus R={R} r={r} — Sweep: {angleDeg}°
      </BillboardText>
      <BillboardText position={[0, 0, 4.2]} fontSize={0.35} color="#f472b6">
        V = {vol.toFixed(1)} (full: {fullVol.toFixed(1)})
      </BillboardText>
    </group>
  );
}
