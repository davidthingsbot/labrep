'use client';

import { Text } from '@react-three/drei';
import { point3d, ORIGIN } from '@labrep/generation';
import { PointViz } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating Point3D visualization with labels. */
export function PointsExample({ animationAngle }: ExampleProps) {
  // Subtle pulsing scale based on animation
  const pulse = 1 + 0.1 * Math.sin(animationAngle);
  
  return (
    <group scale={[pulse, pulse, pulse]}>
      <Text position={[0, 3, 0]} fontSize={0.4} color="white">
        Points
      </Text>
      <PointViz point={ORIGIN} color="yellow" label="Origin" />
      <PointViz point={point3d(1, 2, 0)} color="red" label="P1" />
      <PointViz point={point3d(-1, 1, 1)} color="green" label="P2" />
      <PointViz point={point3d(2, 0, -1)} color="blue" label="P3" />
    </group>
  );
}
