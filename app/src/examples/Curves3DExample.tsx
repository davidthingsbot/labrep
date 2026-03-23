'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  plane,
  XY_PLANE,
  makeLine3D,
  makeCircle3D,
  makeArc3D,
  evaluateLine3D,
  evaluateCircle3D,
  evaluateArc3D,
  tangentLine3D,
  tangentCircle3D,
  tangentArc3D,
} from '@labrep/generation';
import { PointViz, VectorViz, BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Discretize a circle/arc into polyline points for rendering. */
function circlePoints(
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  xAxisX: number,
  xAxisY: number,
  xAxisZ: number,
  startAngle: number,
  endAngle: number,
  segments: number = 64,
): [number, number, number][] {
  // Compute yAxis = normalize(cross(normal, xAxis))
  const yAxisX = normalY * xAxisZ - normalZ * xAxisY;
  const yAxisY = normalZ * xAxisX - normalX * xAxisZ;
  const yAxisZ = normalX * xAxisY - normalY * xAxisX;
  const yLen = Math.sqrt(yAxisX * yAxisX + yAxisY * yAxisY + yAxisZ * yAxisZ);
  const nyX = yAxisX / yLen, nyY = yAxisY / yLen, nyZ = yAxisZ / yLen;

  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (i / segments) * (endAngle - startAngle);
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    pts.push([
      centerX + radius * (cosT * xAxisX + sinT * nyX),
      centerY + radius * (cosT * xAxisY + sinT * nyY),
      centerZ + radius * (cosT * xAxisZ + sinT * nyZ),
    ]);
  }
  return pts;
}

/** Example demonstrating Line3D, Circle3D, and Arc3D with animated evaluation. */
export function Curves3DExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Line3D on tilted path
    const lineResult = makeLine3D(point3d(-3, -1, 0), point3d(-1, 1, 2));
    if (!lineResult.success) return null;
    const line = lineResult.result!;

    // Circle3D on XY plane
    const circleResult = makeCircle3D(XY_PLANE, 1.5);
    if (!circleResult.success) return null;
    const circle = circleResult.result!;

    // Arc3D on tilted plane
    const tiltedPlane = plane(point3d(3, 0, 0), vec3d(0.5, 0.5, 0.707), vec3d(1, 0, 0));
    const arcResult = makeArc3D(tiltedPlane, 1.2, 0, Math.PI * 1.5);
    if (!arcResult.success) return null;
    const arc = arcResult.result!;

    return { line, circle, arc, tiltedPlane };
  }, []);

  if (!data) return null;
  const { line, circle, arc } = data;

  // Animated parameter for each curve
  const lineT = (animationAngle / (2 * Math.PI)) * line.segmentLength;
  const circleT = animationAngle;
  const arcT = arc.startAngle + (animationAngle / (2 * Math.PI)) * (arc.endAngle - arc.startAngle);

  // Evaluate points
  const linePt = evaluateLine3D(line, lineT);
  const circlePt = evaluateCircle3D(circle, circleT);
  const arcPt = evaluateArc3D(arc, arcT);

  // Tangent vectors
  const lineTan = tangentLine3D(line, lineT);
  const circleTan = tangentCircle3D(circle, circleT);
  const arcTan = tangentArc3D(arc, arcT);

  // Circle points for rendering
  const circlePts = circlePoints(
    circle.plane.origin.x, circle.plane.origin.y, circle.plane.origin.z,
    circle.radius,
    circle.plane.normal.x, circle.plane.normal.y, circle.plane.normal.z,
    circle.plane.xAxis.x, circle.plane.xAxis.y, circle.plane.xAxis.z,
    0, 2 * Math.PI,
  );

  // Arc points for rendering
  const arcPts = circlePoints(
    arc.plane.origin.x, arc.plane.origin.y, arc.plane.origin.z,
    arc.radius,
    arc.plane.normal.x, arc.plane.normal.y, arc.plane.normal.z,
    arc.plane.xAxis.x, arc.plane.xAxis.y, arc.plane.xAxis.z,
    arc.startAngle, arc.endAngle,
    32,
  );

  return (
    <group>
      <BillboardText position={[0, 4, 0]} fontSize={0.4} color="white">
        3D Curves
      </BillboardText>

      {/* Line3D */}
      <Line
        points={[[line.startPoint.x, line.startPoint.y, line.startPoint.z],
                 [line.endPoint.x, line.endPoint.y, line.endPoint.z]]}
        color="cyan"
        lineWidth={2}
      />
      <PointViz point={line.startPoint} color="white" label="line start" size={0.04} />
      <PointViz point={line.endPoint} color="white" label="line end" size={0.04} />
      <group position={[linePt.x, linePt.y, linePt.z]}>
        <Sphere args={[0.08, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>
      <VectorViz
        origin={linePt}
        vector={{ x: lineTan.x * 0.5, y: lineTan.y * 0.5, z: lineTan.z * 0.5 }}
        color="orange"
        label=""
      />
      <BillboardText position={[-2, -1.5, 1]} fontSize={0.12} color="cyan">
        Line3D
      </BillboardText>

      {/* Circle3D */}
      <Line points={circlePts} color="magenta" lineWidth={2} />
      <PointViz point={circle.plane.origin} color="gray" label="center" size={0.03} />
      <group position={[circlePt.x, circlePt.y, circlePt.z]}>
        <Sphere args={[0.08, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>
      <VectorViz
        origin={circlePt}
        vector={{ x: circleTan.x * 0.5, y: circleTan.y * 0.5, z: circleTan.z * 0.5 }}
        color="orange"
        label=""
      />
      <BillboardText position={[0, -2, 0]} fontSize={0.12} color="magenta">
        Circle3D (XY plane)
      </BillboardText>

      {/* Arc3D */}
      <Line points={arcPts} color="#00ff88" lineWidth={2} />
      <PointViz point={arc.startPoint} color="white" label="arc start" size={0.04} />
      <PointViz point={arc.endPoint} color="white" label="arc end" size={0.04} />
      <group position={[arcPt.x, arcPt.y, arcPt.z]}>
        <Sphere args={[0.08, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>
      <VectorViz
        origin={arcPt}
        vector={{ x: arcTan.x * 0.5, y: arcTan.y * 0.5, z: arcTan.z * 0.5 }}
        color="orange"
        label=""
      />
      <BillboardText position={[3, -2, 0]} fontSize={0.12} color="#00ff88">
        Arc3D (tilted plane)
      </BillboardText>
    </group>
  );
}
