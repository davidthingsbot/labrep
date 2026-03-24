'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  solidVolume,
  solidToMesh,
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
} from '@labrep/generation';
import type { Solid, Mesh } from '@labrep/generation';
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
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d);
}

function boxWireframe(x: number, y: number, z: number, w: number, h: number, d: number): P3[][] {
  const hw = w / 2, hh = h / 2;
  return [
    [[x-hw,y-hh,z],[x+hw,y-hh,z]], [[x+hw,y-hh,z],[x+hw,y+hh,z]],
    [[x+hw,y+hh,z],[x-hw,y+hh,z]], [[x-hw,y+hh,z],[x-hw,y-hh,z]],
    [[x-hw,y-hh,z+d],[x+hw,y-hh,z+d]], [[x+hw,y-hh,z+d],[x+hw,y+hh,z+d]],
    [[x+hw,y+hh,z+d],[x-hw,y+hh,z+d]], [[x-hw,y+hh,z+d],[x-hw,y-hh,z+d]],
    [[x-hw,y-hh,z],[x-hw,y-hh,z+d]], [[x+hw,y-hh,z],[x+hw,y-hh,z+d]],
    [[x+hw,y+hh,z],[x+hw,y+hh,z+d]], [[x-hw,y+hh,z],[x-hw,y+hh,z+d]],
  ];
}

/** Extract unique edge segments from a solid's faces */
function solidEdges(solid: Solid): P3[][] {
  const edges: P3[][] = [];
  const seen = new Set<string>();
  for (const face of solid.outerShell.faces) {
    for (const oe of face.outerWire.edges) {
      const s = oe.edge.startVertex.point;
      const e = oe.edge.endVertex.point;
      const key = [
        [s.x, s.y, s.z].map(n => n.toFixed(2)).join(','),
        [e.x, e.y, e.z].map(n => n.toFixed(2)).join(','),
      ].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([[s.x, s.y, s.z], [e.x, e.y, e.z]]);
      }
    }
  }
  return edges;
}

const OPS = ['intersect', 'subtract', 'union'] as const;
const OP_LABELS: Record<string, string> = {
  union: 'A \u222A B (Union)',
  subtract: 'A \u2212 B (Subtract)',
  intersect: 'A \u2229 B (Intersect)',
};
const OP_COLORS: Record<string, string> = {
  union: '#4ade80',
  subtract: '#f97316',
  intersect: '#60a5fa',
};

/**
 * Boolean Basic — Box A is fixed, Box B orbits on a tilted circular path.
 * The operation changes once per full animation cycle (10s per operation).
 * Result solid edges are highlighted in the operation color.
 */
export function BooleanBasicExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Track which cycle we're on to change operation once per full loop
  const prevAngle = useRef(0);
  const cycleCount = useRef(0);
  if (t < prevAngle.current - 1) {
    // Angle wrapped from ~2π back to ~0
    cycleCount.current = (cycleCount.current + 1) % 3;
  }
  prevAngle.current = t;

  const op = OPS[cycleCount.current];

  // Box B orbits in a tilted circle around Box A
  const orbitR = 2.2;
  const bx = orbitR * Math.cos(t);
  const by = orbitR * Math.sin(t);
  const bz = 1.0 * Math.sin(2 * t);

  const boxAResult = makeBoxSolid(0, 0, 0, 4, 4, 4);
  const boxBResult = makeBoxSolid(bx, by, bz, 3, 3, 3);

  let resultVol = 0;
  let resultOk = false;
  let resultMesh: Mesh | null = null;
  let resultEdges: P3[][] = [];
  let resultFaces = 0;
  let errorMsg = '';

  if (boxAResult.success && boxBResult.success) {
    try {
      const fn = op === 'union' ? booleanUnion
               : op === 'subtract' ? booleanSubtract
               : booleanIntersect;
      const result = fn(boxAResult.result!.solid, boxBResult.result!.solid);
      if (result.success) {
        resultOk = true;
        resultVol = solidVolume(result.result!.solid);
        resultFaces = result.result!.facesFromA.length + result.result!.facesFromB.length;
        resultEdges = solidEdges(result.result!.solid);
        const meshResult = solidToMesh(result.result!.solid);
        if (meshResult.success) {
          resultMesh = meshResult.result!;
        }
      } else {
        errorMsg = result.error ?? '';
      }
    } catch { /* edge cases during animation */ }
  }

  const color = OP_COLORS[op];
  const wireA = boxWireframe(0, 0, 0, 4, 4, 4);
  const wireB = boxWireframe(bx, by, bz, 3, 3, 3);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => resultMesh ? meshToBufferGeometry(resultMesh) : null, [resultMesh?.vertices]);

  return (
    <group>
      {/* Box A wireframe (dim) */}
      {wireA.map((pts, i) => (
        <Line key={`a-${i}`} points={pts} color="#555" lineWidth={1} />
      ))}
      <BillboardText position={[-2.5, -2.5, 2]} fontSize={0.3} color="#777">A</BillboardText>

      {/* Box B wireframe (dim) */}
      {wireB.map((pts, i) => (
        <Line key={`b-${i}`} points={pts} color="#555" lineWidth={1} />
      ))}
      <BillboardText position={[bx + 2, by + 2, bz + 2]} fontSize={0.3} color="#777">B</BillboardText>

      {/* RESULT: shaded mesh */}
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* RESULT: edge outlines */}
      {resultEdges.map((pts, i) => (
        <Line key={`r-${i}`} points={pts} color="#222" lineWidth={1.5} />
      ))}

      {/* Status */}
      <Sphere args={[0.15]} position={[0, 0, 7]}>
        <meshBasicMaterial color={resultOk ? color : '#ef4444'} />
      </Sphere>

      <BillboardText position={[0, 0, 8]} fontSize={0.5} color={color}>
        {OP_LABELS[op]}
      </BillboardText>
      <BillboardText position={[0, 0, 7.2]} fontSize={0.35} color={resultOk ? color : '#ef4444'}>
        {resultOk
          ? `V = ${resultVol.toFixed(1)} — ${resultFaces} faces`
          : errorMsg.length > 0 ? errorMsg.substring(0, 30) : 'computing...'}
      </BillboardText>
    </group>
  );
}
