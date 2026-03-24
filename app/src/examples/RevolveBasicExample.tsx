'use client';

import { Line } from '@react-three/drei';
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

/** Build a rectangle in XZ plane and revolve it — returns wireframe data */
function buildCylinderData(r: number, h: number) {
  try {
    const p1 = point3d(0, 0, 0), p2 = point3d(r, 0, 0);
    const p3 = point3d(r, 0, h), p4 = point3d(0, 0, h);
    const edges = [
      makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
      makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
      makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
      makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
    ];
    const wire = makeWireFromEdges(edges).result!;
    const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    if (!result.success) return null;

    // Sample wireframe
    const circles: P3[][] = [];
    for (let i = 0; i <= 5; i++) {
      const z = (i / 5) * h;
      const pts: P3[] = [];
      for (let j = 0; j <= 48; j++) {
        const t = (j / 48) * 2 * Math.PI;
        pts.push([r * Math.cos(t), r * Math.sin(t), z]);
      }
      circles.push(pts);
    }

    return {
      circles,
      volume: solidVolume(result.result!.solid),
      profile: [[0, 0, 0], [r, 0, 0], [r, 0, h], [0, 0, h], [0, 0, 0]] as P3[],
    };
  } catch { return null; }
}

/** Build a right triangle in XZ plane and revolve → cone */
function buildConeData(r: number, h: number) {
  try {
    const p1 = point3d(0, 0, 0), p2 = point3d(r, 0, 0), p3 = point3d(0, 0, h);
    const edges = [
      makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
      makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
      makeEdgeFromCurve(makeLine3D(p3, p1).result!).result!,
    ];
    const wire = makeWireFromEdges(edges).result!;
    const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    if (!result.success) return null;

    // Sample wireframe — cone circles shrink toward apex
    const circles: P3[][] = [];
    for (let i = 0; i <= 5; i++) {
      const z = (i / 5) * h;
      const cr = r * (1 - z / h);
      const pts: P3[] = [];
      for (let j = 0; j <= 48; j++) {
        const t = (j / 48) * 2 * Math.PI;
        pts.push([cr * Math.cos(t), cr * Math.sin(t), z]);
      }
      circles.push(pts);
    }

    return {
      circles,
      volume: solidVolume(result.result!.solid),
      profile: [[0, 0, 0], [r, 0, 0], [0, 0, h], [0, 0, 0]] as P3[],
    };
  } catch { return null; }
}

/**
 * Revolve Basic — animate the profile dimensions morphing.
 * The cylinder radius and cone height pulse, showing how the
 * revolved solid changes with the generatrix profile.
 */
export function RevolveBasicExample({ animationAngle }: ExampleProps) {
  // Animate dimensions — all frequencies are integer multiples of base
  // so the animation loops cleanly every cycle (0 → 2π)
  const t = animationAngle;
  const cylR = 2 + 1.5 * Math.sin(t);
  const cylH = 4 + 1.5 * Math.cos(2 * t);
  const coneR = 2.5 + 1 * Math.cos(t);
  const coneH = 3 + 2 * Math.sin(2 * t);

  const cyl = buildCylinderData(cylR, cylH);
  const cone = buildConeData(coneR, coneH);

  return (
    <group>
      {/* Cylinder (left) */}
      <group position={[-5, 0, 0]}>
        {/* Profile wire in XZ plane (highlighted) */}
        {cyl && <Line points={cyl.profile} color="#facc15" lineWidth={3} />}

        {/* Revolved wireframe */}
        {cyl?.circles.map((pts, i) => (
          <Line key={`cc-${i}`} points={pts} color="#4ade80" lineWidth={1} />
        ))}
        {/* Meridional lines */}
        {cyl && [0, 12, 24, 36].map(j => {
          const bottom = cyl.circles[0]?.[j];
          const top = cyl.circles[cyl.circles.length - 1]?.[j];
          if (!bottom || !top) return null;
          return <Line key={`cv-${j}`} points={[bottom, top]} color="#4ade80" lineWidth={1} />;
        })}

        {/* Axis */}
        <Line points={[[0, 0, -0.5], [0, 0, 7]]} color="#555" lineWidth={1} />

        <BillboardText position={[0, 0, 8]} fontSize={0.4} color="#4ade80">
          Cylinder r={cylR.toFixed(1)} h={cylH.toFixed(1)}
        </BillboardText>
        <BillboardText position={[0, 0, 7.2]} fontSize={0.35} color="#4ade80">
          V = {cyl ? cyl.volume.toFixed(1) : '—'} (π·r²·h = {(Math.PI * cylR * cylR * cylH).toFixed(1)})
        </BillboardText>
      </group>

      {/* Cone (right) */}
      <group position={[5, 0, 0]}>
        {/* Profile wire */}
        {cone && <Line points={cone.profile} color="#facc15" lineWidth={3} />}

        {/* Revolved wireframe */}
        {cone?.circles.map((pts, i) => (
          <Line key={`kc-${i}`} points={pts} color="#f97316" lineWidth={1} />
        ))}
        {/* Generatrix lines to apex */}
        {cone && [0, 12, 24, 36].map(j => {
          const bottom = cone.circles[0]?.[j];
          if (!bottom) return null;
          return <Line key={`kv-${j}`} points={[bottom, [0, 0, coneH]]} color="#f97316" lineWidth={1} />;
        })}

        <Line points={[[0, 0, -0.5], [0, 0, 7]]} color="#555" lineWidth={1} />

        <BillboardText position={[0, 0, 8]} fontSize={0.4} color="#f97316">
          Cone r={coneR.toFixed(1)} h={coneH.toFixed(1)}
        </BillboardText>
        <BillboardText position={[0, 0, 7.2]} fontSize={0.35} color="#f97316">
          V = {cone ? cone.volume.toFixed(1) : '—'} (⅓πr²h = {((1/3) * Math.PI * coneR * coneR * coneH).toFixed(1)})
        </BillboardText>
      </group>
    </group>
  );
}
