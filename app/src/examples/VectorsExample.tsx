'use client';

import { Text } from '@react-three/drei';
import { vec3d, ORIGIN, X_AXIS, Y_AXIS, Z_AXIS } from '@labrep/generation';
import { VectorViz } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating Vector3D visualization with direction arrows. */
export function VectorsExample({ animationAngle }: ExampleProps) {
  // Rotate the custom vector around Z axis
  const rotatedVec = vec3d(
    Math.cos(animationAngle),
    Math.sin(animationAngle),
    0.5
  );
  
  return (
    <group>
      <Text position={[0, 3, 0]} fontSize={0.4} color="white">
        Vectors
      </Text>
      <VectorViz origin={ORIGIN} vector={X_AXIS} color="red" label="X" />
      <VectorViz origin={ORIGIN} vector={Y_AXIS} color="green" label="Y" />
      <VectorViz origin={ORIGIN} vector={Z_AXIS} color="blue" label="Z" />
      <VectorViz
        origin={ORIGIN}
        vector={rotatedVec}
        color="orange"
        label="rotating"
      />
    </group>
  );
}
