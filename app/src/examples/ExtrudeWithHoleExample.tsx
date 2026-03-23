'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  plane,
  makeLine3D,
  makeCircle3D,
  makeEdgeFromCurve,
  orientEdge,
  makeWire,
  extrudeWithHoles,
  solidVolume,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Helper to create a square wire */
function makeSquareWire(size: number, centerX = 0, centerY = 0) {
  const hs = size / 2;
  const corners = [
    point3d(centerX - hs, centerY - hs, 0),
    point3d(centerX + hs, centerY - hs, 0),
    point3d(centerX + hs, centerY + hs, 0),
    point3d(centerX - hs, centerY + hs, 0),
  ];
  
  const edges = [
    makeEdgeFromCurve(makeLine3D(corners[0], corners[1]).result!).result!,
    makeEdgeFromCurve(makeLine3D(corners[1], corners[2]).result!).result!,
    makeEdgeFromCurve(makeLine3D(corners[2], corners[3]).result!).result!,
    makeEdgeFromCurve(makeLine3D(corners[3], corners[0]).result!).result!,
  ];
  
  return makeWire(edges.map(e => orientEdge(e, true))).result!;
}

/** Helper to create a circular hole wire (reversed orientation for hole) */
function makeHoleWire(radius: number, centerX = 0, centerY = 0) {
  const circlePlane = plane(point3d(centerX, centerY, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, radius).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  // For a hole, we need reversed orientation (clockwise when viewed from +Z)
  return makeWire([orientEdge(edge, false)]).result!;
}

/** Example demonstrating extrusion with holes (square with circular hole → housing). */
export function ExtrudeWithHoleExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Square (30x30) with circular hole (radius 8) extruded 15mm
    const outerWire = makeSquareWire(30);
    const holeWire = makeHoleWire(8);
    
    const housingResult = extrudeWithHoles(
      outerWire,
      [holeWire],
      vec3d(0, 0, 1),
      15
    );
    
    // Extract edges for visualization
    const edges: Array<{ 
      start: [number, number, number]; 
      end: [number, number, number];
      isHole: boolean;
    }> = [];
    const circlePoints: Array<{ z: number; points: Array<[number, number, number]> }> = [];
    
    if (housingResult.success && housingResult.result) {
      const solid = housingResult.result.solid;
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
              const key = `${start.x.toFixed(2)},${start.y.toFixed(2)},${start.z.toFixed(2)}-${end.x.toFixed(2)},${end.y.toFixed(2)},${end.z.toFixed(2)}`;
              if (!seenEdges.has(key)) {
                seenEdges.add(key);
                edges.push({
                  start: [start.x, start.y, start.z],
                  end: [end.x, end.y, end.z],
                  isHole: false,
                });
              }
            } else if (curve.type === 'circle3d') {
              // Sample circle for visualization
              const pts: Array<[number, number, number]> = [];
              for (let i = 0; i <= 32; i++) {
                const t = (i / 32) * Math.PI * 2;
                const p = curve.plane.origin;
                const r = curve.radius;
                pts.push([
                  p.x + r * Math.cos(t),
                  p.y + r * Math.sin(t),
                  p.z,
                ]);
              }
              circlePoints.push({ z: curve.plane.origin.z, points: pts });
            }
          }
        }
      }
    }
    
    // Calculate expected volume: outer - hole
    const outerVol = 30 * 30 * 15;
    const holeVol = Math.PI * 8 * 8 * 15;
    const expectedVol = outerVol - holeVol;
    
    return {
      housingResult,
      edges,
      circlePoints,
      actualVolume: housingResult.success && housingResult.result ? solidVolume(housingResult.result.solid) : 0,
      expectedVolume: expectedVol,
      errorMsg: housingResult.success ? null : housingResult.error,
    };
  }, []);

  // Animated height for visual interest (same as ExtrudeBasic)
  const heightScale = 0.8 + 0.2 * Math.sin(animationAngle);

  return (
    <group scale={[1, 1, heightScale]}>
      {/* Outer edges (green) */}
      {data.edges.map((edge, i) => (
        <Line
          key={`edge-${i}`}
          points={[edge.start, edge.end]}
          color="#4ade80"
          lineWidth={2}
        />
      ))}
      
      {/* Hole circles (red/orange) */}
      {data.circlePoints.map((circle, i) => (
        <Line
          key={`circle-${i}`}
          points={circle.points}
          color={circle.z === 0 ? "#ef4444" : "#f97316"}
          lineWidth={2}
        />
      ))}
      
      {/* Hole vertical lines to show the through-hole */}
      {[0, 8, 16, 24].map((idx) => {
        const bottomCircle = data.circlePoints.find(c => c.z === 0);
        const topCircle = data.circlePoints.find(c => c.z === 15);
        if (!bottomCircle || !topCircle) return null;
        return (
          <Line
            key={`hole-vert-${idx}`}
            points={[bottomCircle.points[idx], topCircle.points[idx]]}
            color="#f97316"
            lineWidth={1.5}
          />
        );
      })}
      
      {/* Labels */}
      <BillboardText position={[0, 0, 20]} fontSize={0.8} color="#4ade80">
        Housing with Through-Hole
      </BillboardText>
      {data.errorMsg ? (
        <BillboardText position={[0, 0, 17]} fontSize={0.4} color="#ef4444">
          Error: {data.errorMsg}
        </BillboardText>
      ) : (
        <>
          <BillboardText position={[0, 0, 18]} fontSize={0.5} color="#94a3b8">
            Outer: 30×30mm, Hole: ⌀16mm, Height: 15mm
          </BillboardText>
          <BillboardText position={[0, 0, 16]} fontSize={0.5} color="#60a5fa">
            Volume: {data.actualVolume.toFixed(0)} mm³ (expected: {data.expectedVolume.toFixed(0)})
          </BillboardText>
        </>
      )}
      
      {/* Status indicator */}
      <Sphere args={[0.4]} position={[0, 0, -2]}>
        <meshBasicMaterial color={data.housingResult.success ? "#4ade80" : "#ef4444"} />
      </Sphere>
    </group>
  );
}
