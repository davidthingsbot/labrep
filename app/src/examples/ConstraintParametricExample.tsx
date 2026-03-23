'use client';

import { Line, Sphere } from '@react-three/drei';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example showing parametric design with animated parameters. */
export function ConstraintParametricExample({ animationAngle }: ExampleProps) {
  // Animated parameter values
  const width = 1.5 + 0.5 * Math.sin(animationAngle * 0.7);
  const height = 1.0 + 0.3 * Math.sin(animationAngle * 0.5 + 1);
  const thickness = 0.3 + 0.1 * Math.sin(animationAngle * 0.9 + 2);
  const holeRadius = 0.15 + 0.05 * Math.sin(animationAngle * 1.1 + 3);

  if (false) { // Simplified - no sketch initialization needed for pure visualization
    return (
      <group>
        <BillboardText position={[0, 0, 0]} fontSize={0.2} color="red">
          Error initializing parametric example
        </BillboardText>
      </group>
    );
  }

  // Draw an L-bracket shape based on animated parameters
  // This is a visualization - the actual constraint solver would compute these positions
  const bracketLines: [number, number, number][][] = [
    // Outer L shape
    [[0, 0, 0], [width, 0, 0]],
    [[width, 0, 0], [width, thickness, 0]],
    [[width, thickness, 0], [thickness, thickness, 0]],
    [[thickness, thickness, 0], [thickness, height, 0]],
    [[thickness, height, 0], [0, height, 0]],
    [[0, height, 0], [0, 0, 0]],
  ];

  // Hole circle points
  const holeCenter = { x: thickness / 2, y: height - thickness / 2 };
  const holePoints: [number, number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    holePoints.push([
      holeCenter.x + holeRadius * Math.cos(t),
      holeCenter.y + holeRadius * Math.sin(t),
      0,
    ]);
  }

  return (
    <group position={[-width / 2, -height / 2, 0]}>
      <BillboardText position={[width / 2, height + 0.8, 0]} fontSize={0.25} color="white">
        Parametric Design
      </BillboardText>

      {/* Bracket outline */}
      {bracketLines.map((pts, i) => (
        <Line key={i} points={pts} color="#2196f3" lineWidth={3} />
      ))}

      {/* Hole */}
      <Line points={holePoints} color="#f44336" lineWidth={2} />

      {/* Dimension annotations */}
      <group>
        {/* Width dimension */}
        <Line
          points={[
            [0, -0.15, 0],
            [width, -0.15, 0],
          ]}
          color="#4fc3f7"
          lineWidth={1}
        />
        <BillboardText position={[width / 2, -0.3, 0]} fontSize={0.1} color="#4fc3f7">
          {`width: ${width.toFixed(2)}`}
        </BillboardText>

        {/* Height dimension */}
        <Line
          points={[
            [-0.15, 0, 0],
            [-0.15, height, 0],
          ]}
          color="#ab47bc"
          lineWidth={1}
        />
        <BillboardText position={[-0.4, height / 2, 0]} fontSize={0.1} color="#ab47bc">
          {`h: ${height.toFixed(2)}`}
        </BillboardText>

        {/* Thickness dimension */}
        <BillboardText position={[thickness / 2, thickness + 0.15, 0]} fontSize={0.08} color="#ff9800">
          {`t: ${thickness.toFixed(2)}`}
        </BillboardText>

        {/* Hole diameter */}
        <BillboardText position={[holeCenter.x + holeRadius + 0.1, holeCenter.y, 0]} fontSize={0.08} color="#f44336">
          {`ø${(holeRadius * 2).toFixed(2)}`}
        </BillboardText>
      </group>

      {/* Parameter sliders visualization */}
      <group position={[width + 0.5, height / 2, 0]}>
        <BillboardText position={[0.5, 0.6, 0]} fontSize={0.12} color="white">
          Parameters
        </BillboardText>

        {/* Width slider */}
        <group position={[0, 0.3, 0]}>
          <Line points={[[0, 0, 0], [1, 0, 0]]} color="#333" lineWidth={4} />
          <Line points={[[0, 0, 0.01], [(width - 1) / 1.5, 0, 0.01]]} color="#4fc3f7" lineWidth={4} />
          <Sphere args={[0.04, 8, 8]} position={[(width - 1) / 1.5, 0, 0]}>
            <meshBasicMaterial color="#4fc3f7" />
          </Sphere>
        </group>

        {/* Height slider */}
        <group position={[0, 0, 0]}>
          <Line points={[[0, 0, 0], [1, 0, 0]]} color="#333" lineWidth={4} />
          <Line points={[[0, 0, 0.01], [(height - 0.7) / 0.9, 0, 0.01]]} color="#ab47bc" lineWidth={4} />
          <Sphere args={[0.04, 8, 8]} position={[(height - 0.7) / 0.9, 0, 0]}>
            <meshBasicMaterial color="#ab47bc" />
          </Sphere>
        </group>

        {/* Thickness slider */}
        <group position={[0, -0.3, 0]}>
          <Line points={[[0, 0, 0], [1, 0, 0]]} color="#333" lineWidth={4} />
          <Line points={[[0, 0, 0.01], [(thickness - 0.2) / 0.3, 0, 0.01]]} color="#ff9800" lineWidth={4} />
          <Sphere args={[0.04, 8, 8]} position={[(thickness - 0.2) / 0.3, 0, 0]}>
            <meshBasicMaterial color="#ff9800" />
          </Sphere>
        </group>
      </group>

      {/* Info text */}
      <BillboardText position={[width / 2, -0.7, 0]} fontSize={0.08} color="#888">
        Parameters animate to show parametric updates
      </BillboardText>
    </group>
  );
}
