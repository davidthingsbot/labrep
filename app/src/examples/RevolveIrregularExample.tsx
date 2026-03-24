'use client';

import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  Z_AXIS_3D,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  revolve,
  solidVolume,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

/** Try to build an irregular wire in XZ plane and revolve it */
function tryRevolve(points: { x: number; z: number }[]) {
  try {
    const pts3d = points.map(p => point3d(p.x, 0, p.z));
    const edges = [];
    for (let i = 0; i < pts3d.length; i++) {
      const next = (i + 1) % pts3d.length;
      const lineResult = makeLine3D(pts3d[i], pts3d[next]);
      if (!lineResult.success) return { success: false, error: lineResult.error! };
      const edgeResult = makeEdgeFromCurve(lineResult.result!);
      if (!edgeResult.success) return { success: false, error: edgeResult.error! };
      edges.push(edgeResult.result!);
    }
    const wireResult = makeWireFromEdges(edges);
    if (!wireResult.success) return { success: false, error: wireResult.error! };

    const result = revolve(wireResult.result!, Z_AXIS_3D, 2 * Math.PI);
    if (!result.success) return { success: false, error: result.error! };

    return {
      success: true,
      volume: solidVolume(result.result!.solid),
      sideFaces: result.result!.sideFaces.length,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

/** Sample wireframe circles for a profile revolved around Z */
function sampleRevolvedProfile(points: { x: number; z: number }[]): P3[][] {
  const lines: P3[][] = [];

  // Draw circles at each vertex height
  const heights = Array.from(new Set(points.map(p => p.z)));
  for (const z of heights) {
    // Find radius at this height by interpolation from profile
    const radii = points.filter(p => Math.abs(p.z - z) < 0.01).map(p => Math.abs(p.x));
    const r = Math.max(...radii, 0);
    if (r < 0.01) continue;
    const pts: P3[] = [];
    for (let j = 0; j <= 48; j++) {
      const t = (j / 48) * 2 * Math.PI;
      pts.push([r * Math.cos(t), r * Math.sin(t), z]);
    }
    lines.push(pts);
  }

  // Meridional lines — sample the profile at several angles
  for (let a = 0; a < 6; a++) {
    const theta = (a / 6) * 2 * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const pts: P3[] = points.map(p => [
      Math.abs(p.x) * cosT,
      Math.abs(p.x) * sinT,
      p.z,
    ] as P3);
    pts.push(pts[0]); // close
    lines.push(pts);
  }

  return lines;
}

/**
 * Revolve Irregular — Animate an irregular profile deforming over time.
 * Shows an L-shaped / stepped profile that morphs, sometimes creating
 * valid revolved solids, sometimes failing (e.g., when edges collapse).
 * The profile wire (yellow) is always visible; the revolved solid (if valid)
 * appears as a green wireframe; errors show in red.
 */
export function RevolveIrregularExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Animate an irregular stepped profile in XZ plane
  // The profile is a "goblet" / "vase" shape with animated control points.
  // All frequencies are integer multiples so the animation loops cleanly.
  const baseR = 2 + 0.5 * Math.sin(t);
  const waistR = 0.8 + 1.2 * Math.sin(2 * t);        // Can get very thin
  const topR = 1.5 + 1.5 * Math.sin(3 * t);          // Can get very small or large
  const waistZ = 2 + 0.8 * Math.cos(t);
  const topZ = 5 + Math.sin(2 * t);

  // Build profile: vase shape from axis outward
  // bottom-left on axis → bottom-right → waist → top → top-left on axis
  const profile = [
    { x: 0, z: 0 },
    { x: baseR, z: 0 },
    { x: waistR, z: waistZ },
    { x: topR, z: topZ },
    { x: 0, z: topZ },
  ];

  // Check for degenerate cases: if waistR ≈ 0, edges nearly collapse
  // waistR < 0.1 or topR < 0.1 can produce degenerate edges

  const result = tryRevolve(profile);

  // Profile wire for display (in XZ plane, y=0)
  const profileLine: P3[] = [
    ...profile.map(p => [p.x, 0, p.z] as P3),
    [profile[0].x, 0, profile[0].z],
  ];

  // Revolved wireframe
  const wireframe = result.success ? sampleRevolvedProfile(profile) : [];

  // Also build a "mirror" profile to show it's symmetric about axis
  const mirrorLine: P3[] = profile.map(p => [-p.x, 0, p.z] as P3);
  mirrorLine.push([-profile[0].x, 0, profile[0].z]);

  const color = result.success ? '#4ade80' : '#ef4444';

  return (
    <group>
      {/* Profile wire (always visible, yellow) */}
      <Line points={profileLine} color="#facc15" lineWidth={3} />
      {/* Mirror profile (dimmer) */}
      <Line points={mirrorLine} color="#facc15" lineWidth={1.5} opacity={0.3} transparent />

      {/* Axis */}
      <Line points={[[0, 0, -0.5], [0, 0, 7.5]]} color="#555" lineWidth={1} />

      {/* Revolved wireframe (green if success) */}
      {wireframe.map((pts, i) => (
        <Line key={`w-${i}`} points={pts} color={color} lineWidth={1} />
      ))}

      {/* Status indicator */}
      <Sphere args={[0.2]} position={[0, 0, -1]}>
        <meshBasicMaterial color={color} />
      </Sphere>

      {/* Labels */}
      <BillboardText position={[0, 0, 8.5]} fontSize={0.4} color={color}>
        {result.success
          ? `Vase — V = ${'volume' in result ? (result.volume as number).toFixed(1) : '?'} mm³ — ${'sideFaces' in result ? result.sideFaces : '?'} faces`
          : `Failed: ${'error' in result ? String(result.error).substring(0, 40) : '?'}`}
      </BillboardText>

      <BillboardText position={[0, 0, 7.7]} fontSize={0.3} color="#facc15">
        base={baseR.toFixed(1)} waist={waistR.toFixed(1)} top={topR.toFixed(1)}
      </BillboardText>

      {/* Dimension markers on profile */}
      {profile.filter(p => p.x > 0.05).map((p, i) => (
        <Sphere key={`dot-${i}`} args={[0.08]} position={[p.x, 0, p.z]}>
          <meshBasicMaterial color="#facc15" />
        </Sphere>
      ))}
    </group>
  );
}
