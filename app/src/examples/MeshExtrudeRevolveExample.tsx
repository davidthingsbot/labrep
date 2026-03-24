'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import {
  point3d,
  vec3d,
  Z_AXIS_3D,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  revolve,
  solidVolume,
  solidToMesh,
  meshTriangleCount,
} from '@labrep/generation';
import type { Mesh, Solid } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

/** Build an L-shaped extrusion and tessellate it */
function buildLExtrude(armW: number, depth: number) {
  try {
    const pts = [
      point3d(0, 0, 0),
      point3d(4, 0, 0),
      point3d(4, armW, 0),
      point3d(armW, armW, 0),
      point3d(armW, 4, 0),
      point3d(0, 4, 0),
    ];
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const ext = extrude(wire, vec3d(0, 0, 1), depth);
    if (!ext.success) return null;
    const mesh = solidToMesh(ext.result!.solid);
    if (!mesh.success) return null;

    // Profile outline for display
    const profile: P3[] = pts.map(p => [p.x, p.y, p.z]);
    profile.push(profile[0]);

    return {
      mesh: mesh.result!,
      volume: solidVolume(ext.result!.solid),
      profile,
    };
  } catch { return null; }
}

/** Build a revolved shape (vase profile) and tessellate it.
 *  Only planar faces will render for now — caps and flat sections. */
function buildRevolvedShape(r1: number, r2: number, h: number) {
  try {
    // Simple rectangular profile → cylinder
    const p1 = point3d(r1, 0, 0);
    const p2 = point3d(r2, 0, 0);
    const p3 = point3d(r2, 0, h);
    const p4 = point3d(r1, 0, h);
    const edges = [
      makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
      makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
      makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
      makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
    ];
    const wire = makeWireFromEdges(edges).result!;
    const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    if (!result.success) return null;

    const solid = result.result!.solid;
    const mesh = solidToMesh(solid);
    // Even partial mesh is useful — planar caps will render
    const vol = solidVolume(solid);

    // Wireframe for the full shape (sampled circles)
    const circles: P3[][] = [];
    for (let i = 0; i <= 8; i++) {
      const frac = i / 8;
      const z = frac * h;
      const r = (i === 0 || i === 8) ? r2 : r2; // cylindrical for now
      const pts: P3[] = [];
      for (let j = 0; j <= 48; j++) {
        const t = (j / 48) * 2 * Math.PI;
        pts.push([r * Math.cos(t), r * Math.sin(t), z]);
      }
      circles.push(pts);
    }

    return {
      mesh: mesh.success ? mesh.result! : null,
      volume: vol,
      circles,
      profile: [[r1, 0, 0], [r2, 0, 0], [r2, 0, h], [r1, 0, h], [r1, 0, 0]] as P3[],
    };
  } catch { return null; }
}

/**
 * Mesh Extrude & Revolve — Shows solidToMesh applied to extrude and revolve results.
 * L-bracket extrusion is fully shaded. Revolved shape shows wireframe + planar caps.
 */
export function MeshExtrudeRevolveExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Animate L-bracket dimensions
  const armW = 1.5 + 0.5 * Math.sin(t);
  const depth = 2.5 + 1.0 * Math.sin(2 * t);

  // Animate cylinder dimensions
  const innerR = 0.8 + 0.3 * Math.sin(t);
  const outerR = 2.5 + 0.5 * Math.cos(t);
  const cylH = 3 + Math.sin(2 * t);

  const lData = buildLExtrude(armW, depth);
  const revData = buildRevolvedShape(innerR, outerR, cylH);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lGeo = useMemo(() => lData?.mesh ? meshToBufferGeometry(lData.mesh) : null, [lData?.mesh?.vertices]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const revGeo = useMemo(() => revData?.mesh ? meshToBufferGeometry(revData.mesh) : null, [revData?.mesh?.vertices]);

  return (
    <group>
      {/* L-bracket extrusion (left) — fully shaded */}
      <group position={[-5, -2, -depth / 2]}>
        {lGeo && (
          <mesh geometry={lGeo}>
            <meshStandardMaterial color="#4ade80" side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* Profile outline */}
        {lData && (
          <Line points={lData.profile} color="#facc15" lineWidth={2} />
        )}

        <BillboardText position={[2, 2, depth + 2]} fontSize={0.4} color="#4ade80">
          L-Bracket Extrude
        </BillboardText>
        <BillboardText position={[2, 2, depth + 1.3]} fontSize={0.3} color="#4ade80">
          {lData ? `arm=${armW.toFixed(1)} d=${depth.toFixed(1)} — V=${lData.volume.toFixed(1)}` : '—'}
        </BillboardText>
        <BillboardText position={[2, 2, depth + 0.6]} fontSize={0.25} color="#4ade80">
          {lData ? `${meshTriangleCount(lData.mesh)} triangles (all planar)` : ''}
        </BillboardText>
      </group>

      {/* Revolved shape (right) — wireframe + planar caps shaded */}
      <group position={[5, 0, -cylH / 2]}>
        {/* Wireframe circles for the curved surface */}
        {revData?.circles.map((pts, i) => (
          <Line key={`c-${i}`} points={pts} color="#60a5fa" lineWidth={1} />
        ))}

        {/* Meridional lines */}
        {revData && [0, 12, 24, 36].map(j => {
          const bottom = revData.circles[0]?.[j];
          const top = revData.circles[revData.circles.length - 1]?.[j];
          if (!bottom || !top) return null;
          return <Line key={`m-${j}`} points={[bottom, top]} color="#60a5fa" lineWidth={1} />;
        })}

        {/* Shaded planar caps (what solidToMesh can tessellate now) */}
        {revGeo && (
          <mesh geometry={revGeo}>
            <meshStandardMaterial color="#60a5fa" side={THREE.DoubleSide} transparent opacity={0.9} />
          </mesh>
        )}

        {/* Profile */}
        {revData && <Line points={revData.profile} color="#facc15" lineWidth={2} />}

        {/* Axis */}
        <Line points={[[0, 0, -0.5], [0, 0, cylH + 0.5]]} color="#555" lineWidth={1} />

        <BillboardText position={[0, 0, cylH + 2]} fontSize={0.4} color="#60a5fa">
          Revolved Annulus
        </BillboardText>
        <BillboardText position={[0, 0, cylH + 1.3]} fontSize={0.3} color="#60a5fa">
          {revData ? `r=${innerR.toFixed(1)}..{outerR.toFixed(1)} h=${cylH.toFixed(1)} — V=${revData.volume.toFixed(1)}` : '—'}
        </BillboardText>
        <BillboardText position={[0, 0, cylH + 0.6]} fontSize={0.25} color="#888">
          Curved faces: wireframe (tessellation Phase 12 WIP)
        </BillboardText>
      </group>
    </group>
  );
}
