'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  makeLine3D,
  makeVertex,
  makeEdgeFromCurve,
  orientEdge,
  makeWire,
  makePlanarFace,
  makeShell,
  makeSolid,
  solidVolume,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating explicit BRep topology for a unit cube. */
export function TopologyBoxExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // 8 vertices of unit cube
    const vertices = [
      makeVertex(point3d(0, 0, 0)), // 0: front-bottom-left
      makeVertex(point3d(1, 0, 0)), // 1: front-bottom-right
      makeVertex(point3d(1, 1, 0)), // 2: back-bottom-right
      makeVertex(point3d(0, 1, 0)), // 3: back-bottom-left
      makeVertex(point3d(0, 0, 1)), // 4: front-top-left
      makeVertex(point3d(1, 0, 1)), // 5: front-top-right
      makeVertex(point3d(1, 1, 1)), // 6: back-top-right
      makeVertex(point3d(0, 1, 1)), // 7: back-top-left
    ];

    // 12 edges connecting vertices
    const edgeDefs: [number, number][] = [
      // Bottom face
      [0, 1], [1, 2], [2, 3], [3, 0],
      // Top face
      [4, 5], [5, 6], [6, 7], [7, 4],
      // Vertical edges
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    const edges = edgeDefs.map(([i, j]) => {
      const line = makeLine3D(vertices[i].point, vertices[j].point).result!;
      return makeEdgeFromCurve(line).result!;
    });

    // 6 faces
    const faces = [];

    // Bottom face (z=0): edges 0,1,2,3
    const bottomWire = makeWire([
      orientEdge(edges[0], true),
      orientEdge(edges[1], true),
      orientEdge(edges[2], true),
      orientEdge(edges[3], true),
    ]).result!;
    faces.push(makePlanarFace(bottomWire).result!);

    // Top face (z=1): edges 4,5,6,7
    const topWire = makeWire([
      orientEdge(edges[4], true),
      orientEdge(edges[5], true),
      orientEdge(edges[6], true),
      orientEdge(edges[7], true),
    ]).result!;
    faces.push(makePlanarFace(topWire).result!);

    // Front face (y=0): edges 0, 9, 4(rev), 8(rev)
    const frontEdges = [
      makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(1, 0, 0)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(1, 0, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(1, 0, 1), point3d(0, 0, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(0, 0, 1), point3d(0, 0, 0)).result!).result!,
    ];
    const frontWire = makeWire(frontEdges.map(e => orientEdge(e, true))).result!;
    faces.push(makePlanarFace(frontWire).result!);

    // Back face (y=1)
    const backEdges = [
      makeEdgeFromCurve(makeLine3D(point3d(0, 1, 0), point3d(1, 1, 0)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(1, 1, 0), point3d(1, 1, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(1, 1, 1), point3d(0, 1, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(0, 1, 1), point3d(0, 1, 0)).result!).result!,
    ];
    const backWire = makeWire(backEdges.map(e => orientEdge(e, true))).result!;
    faces.push(makePlanarFace(backWire).result!);

    // Left face (x=0)
    const leftEdges = [
      makeEdgeFromCurve(makeLine3D(point3d(0, 0, 0), point3d(0, 1, 0)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(0, 1, 0), point3d(0, 1, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(0, 1, 1), point3d(0, 0, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(0, 0, 1), point3d(0, 0, 0)).result!).result!,
    ];
    const leftWire = makeWire(leftEdges.map(e => orientEdge(e, true))).result!;
    faces.push(makePlanarFace(leftWire).result!);

    // Right face (x=1)
    const rightEdges = [
      makeEdgeFromCurve(makeLine3D(point3d(1, 0, 0), point3d(1, 1, 0)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(1, 1, 0), point3d(1, 1, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(1, 1, 1), point3d(1, 0, 1)).result!).result!,
      makeEdgeFromCurve(makeLine3D(point3d(1, 0, 1), point3d(1, 0, 0)).result!).result!,
    ];
    const rightWire = makeWire(rightEdges.map(e => orientEdge(e, true))).result!;
    faces.push(makePlanarFace(rightWire).result!);

    // Shell and Solid
    const shell = makeShell(faces).result!;
    const solid = makeSolid(shell).result!;
    const volume = solidVolume(solid);

    return { vertices, edges, edgeDefs, faces, solid, volume };
  }, []);

  if (!data) return null;
  const { vertices, edgeDefs, volume } = data;

  // Colors for visualization
  const faceColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'];

  return (
    <group rotation={[0, animationAngle * 0.3, 0]}>
      <BillboardText position={[0.5, 2.5, 0]} fontSize={0.3} color="white">
        Topology Box
      </BillboardText>

      {/* Vertices as spheres */}
      {vertices.map((v, i) => (
        <group key={`v-${i}`} position={[v.point.x, v.point.y, v.point.z]}>
          <Sphere args={[0.06, 12, 12]}>
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.3} />
          </Sphere>
        </group>
      ))}

      {/* Edges as lines */}
      {edgeDefs.map(([i, j], idx) => (
        <Line
          key={`e-${idx}`}
          points={[
            [vertices[i].point.x, vertices[i].point.y, vertices[i].point.z],
            [vertices[j].point.x, vertices[j].point.y, vertices[j].point.z],
          ]}
          color="#888888"
          lineWidth={2}
        />
      ))}

      {/* Faces as semi-transparent colored quads */}
      {/* Bottom */}
      <mesh position={[0.5, 0.5, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[0]} transparent opacity={0.4} side={2} />
      </mesh>
      {/* Top */}
      <mesh position={[0.5, 0.5, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[1]} transparent opacity={0.4} side={2} />
      </mesh>
      {/* Front */}
      <mesh position={[0.5, 0, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[2]} transparent opacity={0.4} side={2} />
      </mesh>
      {/* Back */}
      <mesh position={[0.5, 1, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[3]} transparent opacity={0.4} side={2} />
      </mesh>
      {/* Left */}
      <mesh position={[0, 0.5, 0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[4]} transparent opacity={0.4} side={2} />
      </mesh>
      {/* Right */}
      <mesh position={[1, 0.5, 0.5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={faceColors[5]} transparent opacity={0.4} side={2} />
      </mesh>

      {/* Info */}
      <BillboardText position={[0.5, -0.8, 0]} fontSize={0.1} color="gray">
        {`8 vertices • 12 edges • 6 faces • volume = ${volume.toFixed(2)}`}
      </BillboardText>
    </group>
  );
}
