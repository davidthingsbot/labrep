'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  solidVolume,
  shellIsClosed,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

/** Example demonstrating BRep topology: vertices, edges, faces, shell, solid. */
export function TopologyBoxExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Build a box using extrude (which creates proper shared-edge topology)
    const corners = [
      point3d(0, 0, 0), point3d(1, 0, 0),
      point3d(1, 1, 0), point3d(0, 1, 0),
    ];
    const edges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const result = extrude(wire, vec3d(0, 0, 1), 1);

    if (!result.success) return null;

    const solid = result.result!.solid;
    const shell = solid.outerShell;
    const volume = solidVolume(solid);
    const closed = shellIsClosed(shell);

    // Collect unique vertices and edge segments for visualization
    const vertexSet = new Map<string, P3>();
    const edgeSegments: P3[][] = [];

    for (const face of shell.faces) {
      for (const oe of face.outerWire.edges) {
        const s = oe.edge.startVertex.point;
        const e = oe.edge.endVertex.point;
        const sKey = `${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)}`;
        const eKey = `${e.x.toFixed(4)},${e.y.toFixed(4)},${e.z.toFixed(4)}`;
        vertexSet.set(sKey, [s.x, s.y, s.z]);
        vertexSet.set(eKey, [e.x, e.y, e.z]);

        // Deduplicate edges by sorted key
        const edgeKey = [sKey, eKey].sort().join('|');
        if (!edgeSegments.some(seg => {
          const sk = `${seg[0][0].toFixed(4)},${seg[0][1].toFixed(4)},${seg[0][2].toFixed(4)}`;
          const ek = `${seg[1][0].toFixed(4)},${seg[1][1].toFixed(4)},${seg[1][2].toFixed(4)}`;
          return [sk, ek].sort().join('|') === edgeKey;
        })) {
          edgeSegments.push([[s.x, s.y, s.z], [e.x, e.y, e.z]]);
        }
      }
    }

    const verts = Array.from(vertexSet.values());

    return {
      verts,
      edgeSegments,
      faceCount: shell.faces.length,
      volume,
      closed,
    };
  }, []);

  if (!data) return null;

  const faceColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'];

  return (
    <group rotation={[0, animationAngle * 0.3, 0]}>
      <BillboardText position={[0.5, 2.5, 0]} fontSize={0.3} color="white">
        Topology Box
      </BillboardText>

      {/* Vertices as spheres */}
      {data.verts.map((v, i) => (
        <Sphere key={`v-${i}`} args={[0.06, 12, 12]} position={v}>
          <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.3} />
        </Sphere>
      ))}

      {/* Edges as lines */}
      {data.edgeSegments.map((seg, i) => (
        <Line key={`e-${i}`} points={seg} color="#888888" lineWidth={2} />
      ))}

      {/* Faces as semi-transparent colored quads */}
      <mesh position={[0.5, 0.5, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[0]} transparent opacity={0.4} side={2} />
      </mesh>
      <mesh position={[0.5, 0.5, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[1]} transparent opacity={0.4} side={2} />
      </mesh>
      <mesh position={[0.5, 0, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[2]} transparent opacity={0.4} side={2} />
      </mesh>
      <mesh position={[0.5, 1, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[3]} transparent opacity={0.4} side={2} />
      </mesh>
      <mesh position={[0, 0.5, 0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[4]} transparent opacity={0.4} side={2} />
      </mesh>
      <mesh position={[1, 0.5, 0.5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[5]} transparent opacity={0.4} side={2} />
      </mesh>

      {/* Info */}
      <BillboardText position={[0.5, -0.8, 0]} fontSize={0.1} color="gray">
        {`${data.verts.length} vertices • ${data.edgeSegments.length} edges • ${data.faceCount} faces • shell ${data.closed ? 'closed' : 'OPEN'} • volume = ${data.volume.toFixed(2)}`}
      </BillboardText>
    </group>
  );
}
