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
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  revolve,
  solidToMesh,
  meshTriangleCount,
  booleanSubtract,
} from '@labrep/generation';
import type { Mesh, Solid } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

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

/** Create a true sphere at origin by revolving quarter-arcs */
function makeSphereSolid(r: number): { solid: Solid } | null {
  try {
    const arcPlane = plane(point3d(0, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
    const arc1 = makeArc3D(arcPlane, r, -Math.PI / 2, 0);
    const arc2 = makeArc3D(arcPlane, r, 0, Math.PI / 2);
    const line = makeLine3D(point3d(0, 0, r), point3d(0, 0, -r));
    if (!arc1.success || !arc2.success || !line.success) return null;

    const e1 = makeEdgeFromCurve(arc1.result!);
    const e2 = makeEdgeFromCurve(arc2.result!);
    const e3 = makeEdgeFromCurve(line.result!);
    if (!e1.success || !e2.success || !e3.success) return null;

    const wire = makeWireFromEdges([e1.result!, e2.result!, e3.result!]);
    if (!wire.success) return null;

    const rev = revolve(wire.result!, Z_AXIS_3D, 2 * Math.PI);
    if (!rev.success) return null;

    return { solid: rev.result!.solid };
  } catch { return null; }
}

function solidEdges(solid: Solid): P3[][] {
  const edges: P3[][] = [];
  const seen = new Set<string>();
  for (const face of solid.outerShell.faces) {
    for (const oe of face.outerWire.edges) {
      // Only show line edges for wireframe (arcs are hard to render as lines)
      if (oe.edge.curve.type !== 'line3d') continue;
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

/**
 * Boolean: Curved Shapes — L-bracket with a sphere cutting through it.
 * Demonstrates boolean subtract with curved (spherical) surfaces.
 */
export function BooleanCurvedExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;

  // Sphere at a fixed position inside the L-bracket, with animated radius
  const sphR = 1.2 + 0.3 * Math.sin(t);

  // Build the L-bracket centered so the sphere at origin sits inside it.
  // L-bracket: 5×5 footprint, 4 tall. Offset so the sphere center (0,0,0) is at (2.5, 1, 2)
  const lResult = makeLSolid(-2.5, -1, -2, 4);

  let resultMesh: Mesh | null = null;
  let triCount = 0;
  let resultOk = false;
  let errorMsg = '';
  let lEdges: P3[][] = [];

  if (lResult.success) {
    lEdges = solidEdges(lResult.result!.solid);

    try {
      const sphereResult = makeSphereSolid(sphR);
      if (sphereResult) {
        const result = booleanSubtract(lResult.result!.solid, sphereResult.solid);
        if (result.success) {
          resultOk = true;
          const meshResult = solidToMesh(result.result!.solid);
          if (meshResult.success) {
            resultMesh = meshResult.result!;
            triCount = meshTriangleCount(resultMesh);
          }
        } else {
          errorMsg = result.error || 'unknown error';
        }
      }
    } catch (e) {
      errorMsg = String(e);
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  const geometry = useMemo(
    () => resultMesh ? meshToBufferGeometry(resultMesh) : null,
    [resultMesh?.vertices],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <group>
      {/* L-bracket wireframe (dim) */}
      {lEdges.map((pts, i) => (
        <Line key={`l-${i}`} points={pts} color="#444" lineWidth={1} />
      ))}

      {/* Sphere indicator */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[sphR, 16, 12]} />
        <meshBasicMaterial color="#60a5fa" wireframe opacity={0.3} transparent />
      </mesh>

      {/* Result: shaded mesh */}
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color="#f97316" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Labels */}
      <BillboardText position={[0, 0, 5]} fontSize={0.5} color="#f97316">
        L − Sphere (Subtract)
      </BillboardText>
      <BillboardText position={[0, 0, 4.3]} fontSize={0.3} color={resultOk ? '#f97316' : '#ef4444'}>
        {resultOk ? `${triCount} tris, r=${sphR.toFixed(2)}` : errorMsg || 'failed'}
      </BillboardText>
    </group>
  );
}
