'use client';

import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  solidVolume,
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
} from '@labrep/generation';
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

const OPS = ['union', 'subtract', 'intersect'] as const;
const OP_COLORS: Record<string, string> = {
  union: '#4ade80',
  subtract: '#f97316',
  intersect: '#60a5fa',
};

/**
 * Boolean Basic — two overlapping boxes with animated offset.
 * Cycles through union, subtract, intersect. Shows input wireframes
 * and result volume.
 */
export function BooleanBasicExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;
  const offset = 1 + 1.5 * Math.sin(t);
  const opIdx = Math.floor(3 * (0.5 + 0.5 * Math.sin(2 * t)) * 0.999);
  const op = OPS[opIdx];

  const boxAResult = makeBoxSolid(0, 0, 0, 4, 4, 4);
  const boxBResult = makeBoxSolid(offset, offset, 0, 4, 4, 4);

  let resultVol = 0;
  let resultOk = false;
  let resultFaces = 0;

  if (boxAResult.success && boxBResult.success) {
    try {
      const fn = op === 'union' ? booleanUnion : op === 'subtract' ? booleanSubtract : booleanIntersect;
      const result = fn(boxAResult.result!.solid, boxBResult.result!.solid);
      if (result.success) {
        resultOk = true;
        resultVol = solidVolume(result.result!.solid);
        resultFaces = result.result!.facesFromA.length + result.result!.facesFromB.length;
      }
    } catch { /* edge cases during animation */ }
  }

  const color = OP_COLORS[op];
  const wireA = boxWireframe(0, 0, 0, 4, 4, 4);
  const wireB = boxWireframe(offset, offset, 0, 4, 4, 4);

  return (
    <group>
      {/* Box A wireframe (dim) */}
      {wireA.map((pts, i) => (
        <Line key={`a-${i}`} points={pts} color="#666" lineWidth={1} />
      ))}
      {/* Box B wireframe (dim) */}
      {wireB.map((pts, i) => (
        <Line key={`b-${i}`} points={pts} color="#888" lineWidth={1} />
      ))}

      {/* Status */}
      <Sphere args={[0.2]} position={[0, 0, 6]}>
        <meshBasicMaterial color={resultOk ? color : '#ef4444'} />
      </Sphere>

      <BillboardText position={[0, 0, 7]} fontSize={0.5} color={color}>
        {op.toUpperCase()} — {resultOk ? `V=${resultVol.toFixed(1)}, ${resultFaces} faces` : 'failed'}
      </BillboardText>
      <BillboardText position={[0, 0, 6.2]} fontSize={0.3} color="#888">
        offset = {offset.toFixed(1)}
      </BillboardText>
    </group>
  );
}
