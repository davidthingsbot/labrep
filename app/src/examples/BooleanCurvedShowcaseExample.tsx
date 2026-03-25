'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
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
  op: 'subtract' | 'intersect',
): CellResult {
  try {
    const fn = op === 'subtract' ? booleanSubtract : booleanIntersect;
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
 * Boolean Curved Showcase — demonstrates working curved boolean operations.
 *
 * Row 1: Box − Sphere (animated radius), Box ∩ Sphere, Box − Sphere (partially out)
 * Row 2: Box − Cylinder (through-hole), Box − Cylinder (blind hole), Box − Cylinder (animated)
 *
 * Only shows operations that are verified to produce correct results.
 * Animation uses integer harmonics (sin(t), sin(2t)) for cyclical behavior.
 */
export function BooleanCurvedShowcaseExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Animated parameters (integer harmonics for cyclic animation)
  const sphR = 1.0 + 0.4 * Math.sin(t);         // sphere radius oscillates
  const cylR = 0.4 + 0.2 * Math.sin(2 * t);     // blind hole radius oscillates

  // Build box (shared, 4×4×4 centered at origin)
  const boxA = makeBoxSolid(0, 0, -2, 4, 4, 4);
  const box = boxA.success ? boxA.result!.solid : null;

  // Sphere at origin (animated radius)
  const sphere = makeSphereSolid(sphR);

  // Sphere partially outside: box offset so sphere sticks out bottom
  const boxOffset = makeBoxSolid(0, 0, -0.5, 4, 4, 4);
  const boxOff = boxOffset.success ? boxOffset.result!.solid : null;
  const sphereFixed = makeSphereSolid(1);

  // Cylinder for through-hole (extends well beyond box)
  const cylThrough = makeCylinderSolid(0.5, 6, -3);

  // Cylinder for blind hole (inside box, animated radius)
  const cylBlind = makeCylinderSolid(cylR, 2, -1);

  // Cylinder animated position along Z
  const cylZ = 0.8 * Math.sin(t);
  const cylAnim = makeCylinderSolid(0.6, 2, -1 + cylZ);

  // Compute boolean results — only operations known to work
  const fail: CellResult = { mesh: null, triCount: 0, volume: 0, ok: false, error: 'build failed' };

  const r1 = box && sphere ? tryBoolean(box, sphere.solid, 'subtract') : fail;
  const r2 = box && sphere ? tryBoolean(box, sphere.solid, 'intersect') : fail;
  const r3 = boxOff && sphereFixed ? tryBoolean(boxOff, sphereFixed.solid, 'subtract') : fail;
  const r4 = box && cylThrough ? tryBoolean(box, cylThrough.solid, 'subtract') : fail;
  const r5 = box && cylBlind ? tryBoolean(box, cylBlind.solid, 'subtract') : fail;
  const r6 = box && cylAnim ? tryBoolean(box, cylAnim.solid, 'subtract') : fail;

  const spacing = 8;

  return (
    <group>
      {/* Row 1: Box-Sphere operations */}
      <group position={[-spacing, 0, 0]}>
        <mesh><sphereGeometry args={[sphR, 12, 8]} /><meshBasicMaterial color="#60a5fa" wireframe opacity={0.2} transparent /></mesh>
      </group>
      <Cell result={r1} label="Box − Sphere" color="#f97316" position={[-spacing, 0, 0]} />
      <Cell result={r2} label="Box ∩ Sphere" color="#60a5fa" position={[0, 0, 0]} />
      <Cell result={r3} label="Sphere partial out" color="#22c55e" position={[spacing, 0, 0]} />

      {/* Row 2: Cylinder operations */}
      <group position={[-spacing, -spacing, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.5, 0.5, 6, 12, 1, true]} /><meshBasicMaterial color="#a855f7" wireframe opacity={0.15} transparent /></mesh>
      </group>
      <Cell result={r4} label="Through-hole" color="#a855f7" position={[-spacing, -spacing, 0]} />
      <Cell result={r5} label="Blind hole" color="#ec4899" position={[0, -spacing, 0]} />
      <Cell result={r6} label="Cyl animated" color="#14b8a6" position={[spacing, -spacing, 0]} />

      {/* Title */}
      <BillboardText position={[0, 4, 5]} fontSize={0.5} color="#fff">
        Phase 13: Curved Booleans
      </BillboardText>
      <BillboardText position={[0, 4, 4.2]} fontSize={0.25} color="#888">
        {`sphere r=${sphR.toFixed(2)}  cyl r=${cylR.toFixed(2)}`}
      </BillboardText>
    </group>
  );
}
