'use client';

import { useRef } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  solidVolume,
  booleanSubtract,
  booleanIntersect,
} from '@labrep/generation';
import type { Solid } from '@labrep/generation';
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

function makeLSolid(x: number, y: number, z: number, d: number) {
  const pts = [
    point3d(x, y, z),
    point3d(x + 5, y, z),
    point3d(x + 5, y + 2, z),
    point3d(x + 2, y + 2, z),
    point3d(x + 2, y + 5, z),
    point3d(x, y + 5, z),
  ];
  const edges = pts.map((p, i) =>
    makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
  );
  return extrude(makeWireFromEdges(edges).result!, vec3d(0, 0, 1), d);
}

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

/**
 * Boolean Shapes — L-bracket with a box orbiting through it.
 * Alternates between subtract and intersect once per full cycle.
 * Result edges highlighted in operation color.
 */
export function BooleanShapesExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Track cycle to change operation once per full loop
  const prevAngle = useRef(0);
  const cycleCount = useRef(0);
  if (t < prevAngle.current - 1) {
    cycleCount.current = (cycleCount.current + 1) % 2;
  }
  prevAngle.current = t;

  const useSubtract = cycleCount.current === 0;
  const opLabel = useSubtract ? 'L \u2212 Box (Subtract)' : 'L \u2229 Box (Intersect)';
  const color = useSubtract ? '#f97316' : '#60a5fa';

  // The cutting box orbits in a tilted path through the L
  const cx = 1.5 + 2.5 * Math.cos(t);
  const cy = 1.5 + 2.5 * Math.sin(t);
  const cz = 0.5 + 1.5 * Math.sin(2 * t);

  const lResult = makeLSolid(0, 0, 0, 4);
  const boxResult = makeBoxSolid(cx, cy, cz, 3, 3, 3);

  let resultOk = false;
  let resultVol = 0;
  let resultEdges: P3[][] = [];
  let lEdges: P3[][] = [];

  if (lResult.success) {
    lEdges = solidEdges(lResult.result!.solid);
  }

  const boxEdgesViz = boxWireframe(cx, cy, cz, 3, 3, 3);

  if (lResult.success && boxResult.success) {
    try {
      const fn = useSubtract ? booleanSubtract : booleanIntersect;
      const result = fn(lResult.result!.solid, boxResult.result!.solid);
      if (result.success) {
        resultOk = true;
        resultVol = solidVolume(result.result!.solid);
        resultEdges = solidEdges(result.result!.solid);
      }
    } catch { /* edge cases */ }
  }

  return (
    <group>
      {/* L-bracket wireframe (dim) */}
      {lEdges.map((pts, i) => (
        <Line key={`l-${i}`} points={pts} color="#444" lineWidth={1} />
      ))}
      <BillboardText position={[-0.5, -0.5, 2]} fontSize={0.3} color="#666">L</BillboardText>

      {/* Cutting box wireframe (dim) */}
      {boxEdgesViz.map((pts, i) => (
        <Line key={`b-${i}`} points={pts} color="#555" lineWidth={1} />
      ))}
      <BillboardText position={[cx + 2, cy + 2, cz + 2]} fontSize={0.3} color="#666">Box</BillboardText>

      {/* Result edges (highlighted) */}
      {resultEdges.map((pts, i) => (
        <Line key={`r-${i}`} points={pts} color={color} lineWidth={3} />
      ))}

      {/* Status */}
      <Sphere args={[0.15]} position={[2.5, 2.5, 7]}>
        <meshBasicMaterial color={resultOk ? color : '#ef4444'} />
      </Sphere>

      <BillboardText position={[2.5, 2.5, 8]} fontSize={0.5} color={color}>
        {opLabel}
      </BillboardText>
      <BillboardText position={[2.5, 2.5, 7.2]} fontSize={0.35} color={resultOk ? color : '#ef4444'}>
        {resultOk ? `V = ${resultVol.toFixed(1)}` : 'no overlap'}
      </BillboardText>
    </group>
  );
}
