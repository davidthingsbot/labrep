'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import {
  point3d,
  vec3d,
  plane,
  Z_AXIS_3D,
  makeLine3D,
  makeArc3D,
  makeCircle3D,
  makeEdgeFromCurve,
  makeWire,
  makeWireFromEdges,
  orientEdge,
  extrude,
  revolve,
  solidVolume,
  solidToMesh,
  meshTriangleCount,
  booleanSubtract,
  booleanUnion,
  booleanIntersect,
} from '@labrep/generation';
import type { Solid, Mesh } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

// ═══════════════════════════════════════════════
// PRIMITIVE BUILDERS
// ═══════════════════════════════════════════════

function makeBoxSolid(cx: number, cy: number, cz: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, cz), point3d(cx + hw, cy - hh, cz),
    point3d(cx + hw, cy + hh, cz), point3d(cx - hw, cy + hh, cz),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d);
}

function makeSphereSolid(r: number): { solid: Solid } | null {
  try {
    const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0);
    const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2);
    const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r));
    if (!arc1.success || !arc2.success || !line.success) return null;
    const wire = makeWireFromEdges([
      makeEdgeFromCurve(arc1.result!).result!,
      makeEdgeFromCurve(arc2.result!).result!,
      makeEdgeFromCurve(line.result!).result!,
    ]);
    if (!wire.success) return null;
    const rev = revolve(wire.result!, Z_AXIS_3D, 2 * Math.PI);
    if (!rev.success) return null;
    return { solid: rev.result!.solid };
  } catch { return null; }
}

function makeCylinderSolid(r: number, height: number, oz: number = -height / 2) {
  try {
    const circlePlane = plane(point3d(0, 0, oz), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, r);
    if (!circle.success) return null;
    const edge = makeEdgeFromCurve(circle.result!);
    if (!edge.success) return null;
    const wire = makeWire([orientEdge(edge.result!, true)]);
    if (!wire.success) return null;
    const ext = extrude(wire.result!, vec3d(0, 0, 1), height);
    if (!ext.success) return null;
    return { solid: ext.result!.solid };
  } catch { return null; }
}

function makeLSolid(x: number, y: number, z: number, d: number) {
  const pts = [
    point3d(x, y, z), point3d(x + 5, y, z),
    point3d(x + 5, y + 2, z), point3d(x + 2, y + 2, z),
    point3d(x + 2, y + 5, z), point3d(x, y + 5, z),
  ];
  const edges = pts.map((p, i) =>
    makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d);
}

// ═══════════════════════════════════════════════
// RENDERING HELPERS
// ═══════════════════════════════════════════════

interface CellResult {
  mesh: Mesh | null;
  triCount: number;
  volume: number;
  ok: boolean;
  error: string;
}

function tryBoolean(
  a: Solid, b: Solid,
  op: 'subtract' | 'union' | 'intersect',
): CellResult {
  try {
    const fn = op === 'subtract' ? booleanSubtract
      : op === 'union' ? booleanUnion
      : booleanIntersect;
    const result = fn(a, b);
    if (!result.success) return { mesh: null, triCount: 0, volume: 0, ok: false, error: result.error || 'failed' };
    const vol = solidVolume(result.result!.solid);
    const meshResult = solidToMesh(result.result!.solid);
    if (!meshResult.success) return { mesh: null, triCount: 0, volume: vol, ok: true, error: 'mesh failed' };
    return { mesh: meshResult.result!, triCount: meshTriangleCount(meshResult.result!), volume: vol, ok: true, error: '' };
  } catch (e) {
    return { mesh: null, triCount: 0, volume: 0, ok: false, error: String(e) };
  }
}

function Cell({ result, label, color, position }: {
  result: CellResult;
  label: string;
  color: string;
  position: P3;
}) {
  /* eslint-disable react-hooks/exhaustive-deps */
  const geometry = useMemo(
    () => result.mesh ? meshToBufferGeometry(result.mesh) : null,
    [result.mesh?.vertices],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <group position={position}>
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      )}
      <BillboardText position={[0, 0, 4]} fontSize={0.35} color={result.ok ? color : '#ef4444'}>
        {label}
      </BillboardText>
      <BillboardText position={[0, 0, 3.4]} fontSize={0.22} color={result.ok ? '#999' : '#ef4444'}>
        {result.ok ? `${result.triCount} tris  V=${result.volume.toFixed(1)}` : result.error.slice(0, 40)}
      </BillboardText>
    </group>
  );
}

// ═══════════════════════════════════════════════
// MAIN EXAMPLE
// ═══════════════════════════════════════════════

/**
 * Boolean Curved Showcase — demonstrates all working curved boolean operations.
 *
 * Row 1: Box − Sphere (animated radius), Box ∪ Sphere, Box ∩ Sphere
 * Row 2: Box − Cylinder (through-hole), Box − Cylinder (blind hole), L-bracket − Sphere
 *
 * Animation uses integer harmonics (sin(t), sin(2t)) for cyclical behavior.
 */
export function BooleanCurvedShowcaseExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Animated parameters (integer harmonics for cyclic animation)
  const sphR = 1.0 + 0.4 * Math.sin(t);         // sphere radius oscillates
  const cylZ = 0.5 * Math.sin(2 * t);            // cylinder offset oscillates

  // Build box (shared)
  const boxA = makeBoxSolid(0, 0, -2, 4, 4, 4);
  const box = boxA.success ? boxA.result!.solid : null;

  // Build sphere
  const sphere = makeSphereSolid(sphR);

  // Build cylinder for through-hole (extends beyond box)
  const cylThrough = makeCylinderSolid(0.5, 6, -3);

  // Build cylinder for blind hole (inside box)
  const cylBlind = makeCylinderSolid(0.7, 2, -1 + cylZ);

  // Build L-bracket
  const lResult = makeLSolid(-2.5, -1, -2, 4);
  const lSolid = lResult.success ? lResult.result!.solid : null;
  const lSphere = makeSphereSolid(1.2);

  // Compute all boolean results
  const r1 = box && sphere ? tryBoolean(box, sphere.solid, 'subtract') : { mesh: null, triCount: 0, volume: 0, ok: false, error: 'build failed' };
  const r2 = box && sphere ? tryBoolean(box, sphere.solid, 'union') : { mesh: null, triCount: 0, volume: 0, ok: false, error: 'build failed' };
  const r3 = box && sphere ? tryBoolean(box, sphere.solid, 'intersect') : { mesh: null, triCount: 0, volume: 0, ok: false, error: 'build failed' };
  const r4 = box && cylThrough ? tryBoolean(box, cylThrough.solid, 'subtract') : { mesh: null, triCount: 0, volume: 0, ok: false, error: 'build failed' };
  const r5 = box && cylBlind ? tryBoolean(box, cylBlind.solid, 'subtract') : { mesh: null, triCount: 0, volume: 0, ok: false, error: 'build failed' };
  const r6 = lSolid && lSphere ? tryBoolean(lSolid, lSphere.solid, 'subtract') : { mesh: null, triCount: 0, volume: 0, ok: false, error: 'build failed' };

  // Sphere wireframe indicator
  const spacing = 8;

  return (
    <group>
      {/* Row 1: Box-Sphere operations */}
      <group position={[-spacing, 0, 0]}>
        {/* Sphere wireframe */}
        <mesh>
          <sphereGeometry args={[sphR, 12, 8]} />
          <meshBasicMaterial color="#60a5fa" wireframe opacity={0.2} transparent />
        </mesh>
      </group>
      <Cell result={r1} label="Box − Sphere" color="#f97316" position={[-spacing, 0, 0]} />
      <Cell result={r2} label="Box ∪ Sphere" color="#22c55e" position={[0, 0, 0]} />
      <Cell result={r3} label="Box ∩ Sphere" color="#60a5fa" position={[spacing, 0, 0]} />

      {/* Row 2: Cylinder and L-bracket */}
      <Cell result={r4} label="Box − Cyl (thru)" color="#a855f7" position={[-spacing, -spacing, 0]} />
      <Cell result={r5} label="Box − Cyl (blind)" color="#ec4899" position={[0, -spacing, 0]} />
      <Cell result={r6} label="L − Sphere" color="#f97316" position={[spacing, -spacing, 0]} />

      {/* Cylinder wireframe indicators */}
      <group position={[-spacing, -spacing, 0]}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 6, 12, 1, true]} />
          <meshBasicMaterial color="#a855f7" wireframe opacity={0.2} transparent />
        </mesh>
      </group>
      <group position={[0, -spacing, 0]}>
        <mesh position={[0, cylZ, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.7, 0.7, 2, 12, 1, true]} />
          <meshBasicMaterial color="#ec4899" wireframe opacity={0.2} transparent />
        </mesh>
      </group>

      {/* Title */}
      <BillboardText position={[0, 4, 5]} fontSize={0.5} color="#fff">
        Phase 13: Curved Booleans
      </BillboardText>
      <BillboardText position={[0, 4, 4.2]} fontSize={0.25} color="#888">
        {`r=${sphR.toFixed(2)}  offset=${cylZ.toFixed(2)}`}
      </BillboardText>
    </group>
  );
}
