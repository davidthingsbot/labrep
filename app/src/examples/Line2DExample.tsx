'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  vec2d,
  makeLine2D,
  makeLine2DFromPointDir,
  evaluateLine2D,
  tangentLine2D,
  lengthLine2D,
  reverseLine2D,
} from '@labrep/generation';
import { PointViz, VectorViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating all Line2D functions. */
export function Line2DExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    const lineResult = makeLine2D(point2d(-2, -0.5), point2d(2, 1.5));
    if (!lineResult.success) return null;
    const line = lineResult.result!;

    // makeLine2DFromPointDir — create from point + direction
    const dirLineResult = makeLine2DFromPointDir(point2d(-2, -2), vec2d(3, 1));
    if (!dirLineResult.success) return null;
    const dirLine = dirLineResult.result!;

    // reverseLine2D — reversed copy
    const reversed = reverseLine2D(line);

    // lengthLine2D
    const len = lengthLine2D(line);

    return { line, dirLine, reversed, len };
  }, []);

  if (!data) return null;
  const { line, dirLine, reversed, len } = data;

  // Animated parameter from 0 to segmentLength
  const t = (animationAngle / (2 * Math.PI)) * line.segmentLength;
  const movingPoint = evaluateLine2D(line, t);

  // tangentLine2D — tangent vector at animated point
  const tangent = tangentLine2D(line, t);

  return (
    <group>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.4} color="white">
        Line2D
      </BillboardText>

      {/* Main line segment */}
      <Line
        points={[
          [line.startPoint.x, line.startPoint.y, 0],
          [line.endPoint.x, line.endPoint.y, 0],
        ]}
        color="cyan"
        lineWidth={2}
      />
      <PointViz point={{ x: line.startPoint.x, y: line.startPoint.y, z: 0 }} color="white" label="start" size={0.04} />
      <PointViz point={{ x: line.endPoint.x, y: line.endPoint.y, z: 0 }} color="white" label="end" size={0.04} />

      {/* Animated point + tangent vector */}
      <group position={[movingPoint.x, movingPoint.y, 0]}>
        <Sphere args={[0.07, 12, 12]}>
          <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
        </Sphere>
      </group>
      <VectorViz
        origin={{ x: movingPoint.x, y: movingPoint.y, z: 0 }}
        vector={{ x: tangent.x * 0.6, y: tangent.y * 0.6, z: 0 }}
        color="orange"
        label="tangent"
      />

      {/* makeLine2DFromPointDir line */}
      <Line
        points={[
          [dirLine.startPoint.x, dirLine.startPoint.y, 0],
          [dirLine.endPoint.x, dirLine.endPoint.y, 0],
        ]}
        color="#666666"
        lineWidth={1.5}
      />
      <BillboardText position={[-0.5, -2.3, 0]} fontSize={0.1} color="#666666">
        fromPointDir
      </BillboardText>

      {/* reverseLine2D — shown offset below */}
      <Line
        points={[
          [reversed.startPoint.x, reversed.startPoint.y - 0.4, 0],
          [reversed.endPoint.x, reversed.endPoint.y - 0.4, 0],
        ]}
        color="magenta"
        lineWidth={1.5}
      />
      <PointViz point={{ x: reversed.startPoint.x, y: reversed.startPoint.y - 0.4, z: 0 }} color="magenta" label="rev start" size={0.03} />
      <PointViz point={{ x: reversed.endPoint.x, y: reversed.endPoint.y - 0.4, z: 0 }} color="magenta" label="rev end" size={0.03} />

      {/* Info */}
      <BillboardText position={[0, -3, 0]} fontSize={0.12} color="gray">
        {`length = ${len.toFixed(2)} | tangent = (${tangent.x.toFixed(2)}, ${tangent.y.toFixed(2)})`}
      </BillboardText>
    </group>
  );
}
