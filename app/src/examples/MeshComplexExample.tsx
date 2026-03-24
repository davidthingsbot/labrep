'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  solidVolume,
  solidToMesh,
  meshTriangleCount,
  meshVertexCount,
  booleanSubtract,
  booleanUnion,
} from '@labrep/generation';
import type { Mesh } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

function makeBoxSolid(x: number, y: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(x - hw, y - hh, z), point3d(x + hw, y - hh, z),
    point3d(x + hw, y + hh, z), point3d(x - hw, y + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d);
}

/** Build a star-shaped profile and extrude it */
function buildStarSolid(outerR: number, innerR: number, points: number, depth: number) {
  try {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (i / (points * 2)) * 2 * Math.PI - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push(point3d(r * Math.cos(angle), r * Math.sin(angle), 0));
    }
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const ext = extrude(wire, vec3d(0, 0, 1), depth);
    if (!ext.success) return null;
    const mesh = solidToMesh(ext.result!.solid);
    if (!mesh.success) return null;
    return { mesh: mesh.result!, volume: solidVolume(ext.result!.solid) };
  } catch { return null; }
}

/** Build a stepped tower: stack of boxes with decreasing size */
function buildTowerSolid(levels: number, baseSize: number, stepHeight: number) {
  try {
    // Start with the base
    const base = makeBoxSolid(0, 0, 0, baseSize, baseSize, stepHeight);
    if (!base.success) return null;
    let current = base.result!.solid;

    // Add each level
    for (let i = 1; i < levels; i++) {
      const size = baseSize * (1 - i * 0.2);
      if (size < 0.5) break;
      const level = makeBoxSolid(0, 0, i * stepHeight, size, size, stepHeight);
      if (!level.success) continue;
      const union = booleanUnion(current, level.result!.solid);
      if (union.success) {
        current = union.result!.solid;
      }
    }

    const mesh = solidToMesh(current);
    if (!mesh.success) return null;
    return { mesh: mesh.result!, volume: solidVolume(current) };
  } catch { return null; }
}

/** Build an L-bracket with a notch cut out */
function buildNotchedBracket(notchDepth: number, notchWidth: number) {
  try {
    // L-bracket base
    const pts = [
      point3d(0, 0, 0), point3d(5, 0, 0), point3d(5, 2, 0),
      point3d(2, 2, 0), point3d(2, 5, 0), point3d(0, 5, 0),
    ];
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const ext = extrude(wire, vec3d(0, 0, 1), 3);
    if (!ext.success) return null;

    // Cut a notch from the horizontal arm
    const notch = makeBoxSolid(2.5, 1, 0, notchWidth, notchDepth, 3);
    if (!notch.success) return null;

    const result = booleanSubtract(ext.result!.solid, notch.result!.solid);
    if (!result.success) return null;

    const mesh = solidToMesh(result.result!.solid);
    if (!mesh.success) return null;
    return { mesh: mesh.result!, volume: solidVolume(result.result!.solid) };
  } catch { return null; }
}

/**
 * Complex Mesh — Star extrusion, stepped tower (boolean union stack),
 * and an L-bracket with animated notch cut (boolean subtract).
 */
export function MeshComplexExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Star: animate inner radius
  const starOuter = 3;
  const starInner = 1.2 + 0.8 * Math.sin(t);
  const starDepth = 2 + Math.sin(2 * t);
  const star = buildStarSolid(starOuter, starInner, 5, starDepth);

  // Tower: 4 levels, animate base size
  const towerBase = 4 + Math.sin(t);
  const tower = buildTowerSolid(4, towerBase, 1.5);

  // Notched bracket: animate notch dimensions
  const notchD = 1.0 + 0.5 * Math.sin(t);
  const notchW = 2.0 + Math.cos(2 * t);
  const bracket = buildNotchedBracket(notchD, notchW);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const starGeo = useMemo(() => star ? meshToBufferGeometry(star.mesh) : null, [star?.mesh.vertices]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const towerGeo = useMemo(() => tower ? meshToBufferGeometry(tower.mesh) : null, [tower?.mesh.vertices]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bracketGeo = useMemo(() => bracket ? meshToBufferGeometry(bracket.mesh) : null, [bracket?.mesh.vertices]);

  return (
    <group>
      {/* Star extrusion (left) */}
      <group position={[-8, 0, -starDepth / 2]}>
        {starGeo && (
          <mesh geometry={starGeo}>
            <meshStandardMaterial color="#facc15" side={THREE.DoubleSide} />
          </mesh>
        )}
        <BillboardText position={[0, 0, starDepth + 2]} fontSize={0.4} color="#facc15">
          Star Extrude
        </BillboardText>
        <BillboardText position={[0, 0, starDepth + 1.3]} fontSize={0.3} color="#facc15">
          {star ? `inner=${starInner.toFixed(1)} — ${meshTriangleCount(star.mesh)} tris` : '—'}
        </BillboardText>
        <BillboardText position={[0, 0, starDepth + 0.6]} fontSize={0.25} color="#facc15">
          {star ? `V=${star.volume.toFixed(1)}` : ''}
        </BillboardText>
      </group>

      {/* Stepped tower (center) */}
      <group position={[0, 0, -3]}>
        {towerGeo && (
          <mesh geometry={towerGeo}>
            <meshStandardMaterial color="#a78bfa" side={THREE.DoubleSide} />
          </mesh>
        )}
        <BillboardText position={[0, 0, 9]} fontSize={0.4} color="#a78bfa">
          Tower (Union Stack)
        </BillboardText>
        <BillboardText position={[0, 0, 8.3]} fontSize={0.3} color="#a78bfa">
          {tower ? `4 levels — ${meshTriangleCount(tower.mesh)} tris` : '—'}
        </BillboardText>
        <BillboardText position={[0, 0, 7.6]} fontSize={0.25} color="#a78bfa">
          {tower ? `base=${towerBase.toFixed(1)} — V=${tower.volume.toFixed(1)}` : ''}
        </BillboardText>
      </group>

      {/* Notched L-bracket (right) */}
      <group position={[8, -2.5, -1.5]}>
        {bracketGeo && (
          <mesh geometry={bracketGeo}>
            <meshStandardMaterial color="#f97316" side={THREE.DoubleSide} />
          </mesh>
        )}
        <BillboardText position={[2.5, 2.5, 5]} fontSize={0.4} color="#f97316">
          Notched Bracket
        </BillboardText>
        <BillboardText position={[2.5, 2.5, 4.3]} fontSize={0.3} color="#f97316">
          {bracket ? `notch=${notchW.toFixed(1)}x${notchD.toFixed(1)} — ${meshTriangleCount(bracket.mesh)} tris` : '—'}
        </BillboardText>
        <BillboardText position={[2.5, 2.5, 3.6]} fontSize={0.25} color="#f97316">
          {bracket ? `V=${bracket.volume.toFixed(1)}` : ''}
        </BillboardText>
      </group>
    </group>
  );
}
