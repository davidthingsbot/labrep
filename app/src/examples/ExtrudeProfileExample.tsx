'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  orientEdge,
  makeWire,
  extrude,
  solidVolume,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Helper to create an L-shaped wire profile */
function makeLShapeWire() {
  // L-bracket profile:
  //     ┌─────┐  (20, 25)
  //     │     │
  //     │  ┌──┘  (20, 15) to (10, 15)
  //     │  │
  //     └──┘     (0, 0) to (10, 0)
  
  const points = [
    point3d(0, 0, 0),
    point3d(10, 0, 0),
    point3d(10, 15, 0),
    point3d(20, 15, 0),
    point3d(20, 25, 0),
    point3d(0, 25, 0),
  ];
  
  const edges = [];
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    edges.push(
      makeEdgeFromCurve(makeLine3D(points[i], points[next]).result!).result!
    );
  }
  
  return makeWire(edges.map(e => orientEdge(e, true))).result!;
}

/** Helper to create a U-channel wire profile */
function makeUShapeWire() {
  // U-channel profile:
  //  ┌──┐     ┌──┐
  //  │  │     │  │
  //  │  └─────┘  │
  //  └───────────┘
  
  const points = [
    point3d(0, 0, 0),
    point3d(20, 0, 0),
    point3d(20, 15, 0),
    point3d(15, 15, 0),
    point3d(15, 5, 0),
    point3d(5, 5, 0),
    point3d(5, 15, 0),
    point3d(0, 15, 0),
  ];
  
  const edges = [];
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    edges.push(
      makeEdgeFromCurve(makeLine3D(points[i], points[next]).result!).result!
    );
  }
  
  return makeWire(edges.map(e => orientEdge(e, true))).result!;
}

/** Example demonstrating extrusion of non-convex profiles (L-bracket, U-channel). */
export function ExtrudeProfileExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // L-bracket extruded 5mm
    const lWire = makeLShapeWire();
    const lResult = extrude(lWire, vec3d(0, 0, 1), 5);
    
    // U-channel extruded 5mm (offset to the right)
    const uWire = makeUShapeWire();
    const uResult = extrude(uWire, vec3d(0, 0, 1), 5);
    
    // Extract edges for visualization
    type EdgeDef = { start: [number, number, number]; end: [number, number, number] };
    
    const extractEdges = (result: typeof lResult, offset: number): EdgeDef[] => {
      const edges: EdgeDef[] = [];
      if (result.success && result.result) {
        const solid = result.result.solid;
        const seenEdges = new Set<string>();
        
        for (const shell of [solid.outerShell, ...solid.innerShells]) {
          for (const face of shell.faces) {
            for (const orientedEdge of face.outerWire.edges) {
              const curve = orientedEdge.edge.curve;
              if (curve.type === 'line3d') {
                const start = curve.origin;
                const end = {
                  x: curve.origin.x + curve.direction.x * curve.segmentLength,
                  y: curve.origin.y + curve.direction.y * curve.segmentLength,
                  z: curve.origin.z + curve.direction.z * curve.segmentLength,
                };
                const key = `${start.x},${start.y},${start.z}-${end.x},${end.y},${end.z}`;
                const keyRev = `${end.x},${end.y},${end.z}-${start.x},${start.y},${start.z}`;
                if (!seenEdges.has(key) && !seenEdges.has(keyRev)) {
                  seenEdges.add(key);
                  edges.push({
                    start: [start.x + offset, start.y, start.z],
                    end: [end.x + offset, end.y, end.z],
                  });
                }
              }
            }
          }
        }
      }
      return edges;
    };
    
    return {
      lResult,
      uResult,
      lEdges: extractEdges(lResult, -15),
      uEdges: extractEdges(uResult, 15),
      lVolume: lResult.success && lResult.result ? solidVolume(lResult.result.solid) : 0,
      uVolume: uResult.success && uResult.result ? solidVolume(uResult.result.solid) : 0,
    };
  }, []);

  // Subtle animation
  const rotation = animationAngle * 0.2;

  return (
    <group rotation={[0, 0, rotation]}>
      {/* L-bracket wireframe */}
      {data.lEdges.map((edge, i) => (
        <Line
          key={`l-${i}`}
          points={[edge.start, edge.end]}
          color="#f97316"
          lineWidth={2}
        />
      ))}
      
      {/* U-channel wireframe */}
      {data.uEdges.map((edge, i) => (
        <Line
          key={`u-${i}`}
          points={[edge.start, edge.end]}
          color="#a855f7"
          lineWidth={2}
        />
      ))}
      
      {/* Labels */}
      <BillboardText position={[-5, 30, 3]} fontSize={0.8} color="#f97316">
        L-Bracket
      </BillboardText>
      <BillboardText position={[-5, 27, 3]} fontSize={0.5} color="#f97316">
        Vol: {data.lVolume.toFixed(0)} mm³
      </BillboardText>
      
      <BillboardText position={[25, 20, 3]} fontSize={0.8} color="#a855f7">
        U-Channel
      </BillboardText>
      <BillboardText position={[25, 17, 3]} fontSize={0.5} color="#a855f7">
        Vol: {data.uVolume.toFixed(0)} mm³
      </BillboardText>
      
      {/* Status indicators */}
      <Sphere args={[0.3]} position={[-15, 0, 0]}>
        <meshBasicMaterial color={data.lResult.success ? "#4ade80" : "#ef4444"} />
      </Sphere>
      <Sphere args={[0.3]} position={[15, 0, 0]}>
        <meshBasicMaterial color={data.uResult.success ? "#4ade80" : "#ef4444"} />
      </Sphere>
    </group>
  );
}
