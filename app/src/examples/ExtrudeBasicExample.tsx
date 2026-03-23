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
  extrude,
  solidVolume,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Helper to create a rectangular wire on XY plane */
function makeRectangleWire(width: number, height: number, centerX = 0, centerY = 0) {
  const hw = width / 2;
  const hh = height / 2;
  const corners = [
    point3d(centerX - hw, centerY - hh, 0),
    point3d(centerX + hw, centerY - hh, 0),
    point3d(centerX + hw, centerY + hh, 0),
    point3d(centerX - hw, centerY + hh, 0),
  ];
  
  const edges = [
    makeEdgeFromCurve(makeLine3D(corners[0], corners[1]).result!).result!,
    makeEdgeFromCurve(makeLine3D(corners[1], corners[2]).result!).result!,
    makeEdgeFromCurve(makeLine3D(corners[2], corners[3]).result!).result!,
    makeEdgeFromCurve(makeLine3D(corners[3], corners[0]).result!).result!,
  ];
  
  return makeWire(edges.map(e => orientEdge(e, true))).result!;
}

/** Helper to create a circular wire on XY plane */
function makeCircleWire(radius: number, centerX = 0, centerY = 0) {
  const circlePlane = plane(point3d(centerX, centerY, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
  const circle = makeCircle3D(circlePlane, radius).result!;
  const edge = makeEdgeFromCurve(circle).result!;
  return makeWire([orientEdge(edge, true)]).result!;
}

/** Example demonstrating basic extrusion: rectangle→box and circle→cylinder. */
export function ExtrudeBasicExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Rectangle (10x6) extruded 8 units → Box
    const rectWire = makeRectangleWire(10, 6, -8, 0);
    const boxResult = extrude(rectWire, vec3d(0, 0, 1), 8);
    
    // Circle (radius 4) extruded 8 units → Cylinder
    const circleWire = makeCircleWire(4, 8, 0);
    const cylinderResult = extrude(circleWire, vec3d(0, 0, 1), 8);
    
    // Collect edges for visualization
    const boxEdges: Array<{ start: [number, number, number]; end: [number, number, number] }> = [];
    const cylinderPoints: Array<[number, number, number]> = [];
    
    if (boxResult.success && boxResult.result) {
      // Extract edges from box solid for wireframe
      const solid = boxResult.result.solid;
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
              boxEdges.push({
                start: [start.x, start.y, start.z],
                end: [end.x, end.y, end.z],
              });
            }
          }
        }
      }
    }
    
    if (cylinderResult.success && cylinderResult.result) {
      // Sample cylinder edges
      const solid = cylinderResult.result.solid;
      for (const shell of [solid.outerShell, ...solid.innerShells]) {
        for (const face of shell.faces) {
          for (const orientedEdge of face.outerWire.edges) {
            const curve = orientedEdge.edge.curve;
            if (curve.type === 'circle3d') {
              // Sample circle at intervals
              for (let i = 0; i <= 32; i++) {
                const t = (i / 32) * Math.PI * 2;
                const p = curve.plane.origin;
                const r = curve.radius;
                // Simplified: assume circle in XY plane
                cylinderPoints.push([
                  p.x + r * Math.cos(t),
                  p.y + r * Math.sin(t),
                  p.z,
                ]);
              }
            }
          }
        }
      }
    }
    
    return {
      boxResult,
      cylinderResult,
      boxEdges,
      cylinderPoints,
      boxVolume: boxResult.success && boxResult.result ? solidVolume(boxResult.result.solid) : 0,
      cylinderVolume: cylinderResult.success && cylinderResult.result ? solidVolume(cylinderResult.result.solid) : 0,
    };
  }, []);

  // Animated height for visual interest
  const heightScale = 0.8 + 0.2 * Math.sin(animationAngle);

  return (
    <group scale={[1, 1, heightScale]}>
      {/* Box wireframe */}
      {data.boxEdges.map((edge, i) => (
        <Line
          key={`box-${i}`}
          points={[edge.start, edge.end]}
          color="#4ade80"
          lineWidth={2}
        />
      ))}
      
      {/* Cylinder circles (top and bottom) */}
      {data.cylinderPoints.length > 0 && (
        <>
          <Line
            points={data.cylinderPoints.slice(0, 33)}
            color="#60a5fa"
            lineWidth={2}
          />
          <Line
            points={data.cylinderPoints.slice(33, 66)}
            color="#60a5fa"
            lineWidth={2}
          />
        </>
      )}
      
      {/* Cylinder vertical lines */}
      {[0, 8, 16, 24].map((i) => {
        const bottom = data.cylinderPoints[i];
        const top = data.cylinderPoints[i + 33];
        if (!bottom || !top) return null;
        return (
          <Line
            key={`cyl-vert-${i}`}
            points={[bottom, top]}
            color="#60a5fa"
            lineWidth={2}
          />
        );
      })}
      
      {/* Labels */}
      <BillboardText position={[-8, 0, 10]} fontSize={0.6} color="#4ade80">
        Box: {data.boxVolume.toFixed(0)} mm³
      </BillboardText>
      <BillboardText position={[8, 0, 10]} fontSize={0.6} color="#60a5fa">
        Cylinder: {data.cylinderVolume.toFixed(0)} mm³
      </BillboardText>
      
      {/* Origin markers */}
      <Sphere args={[0.2]} position={[-8, 0, 0]}>
        <meshBasicMaterial color="#4ade80" />
      </Sphere>
      <Sphere args={[0.2]} position={[8, 0, 0]}>
        <meshBasicMaterial color="#60a5fa" />
      </Sphere>
    </group>
  );
}
