'use client';

import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { makeSphere } from '@labrep/generation';
import { MeshViz } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating sphere primitive with gentle wobble. */
export function SphereExample({ animationAngle }: ExampleProps) {
  const sphere = useMemo(() => {
    const result = makeSphere(0.5);
    return result.success ? result.result : null;
  }, []);

  if (!sphere) return null;

  // Gentle wobble
  const wobbleX = Math.sin(animationAngle) * 0.1;
  const wobbleZ = Math.cos(animationAngle * 2) * 0.1;

  return (
    <group rotation={[wobbleX, 0, wobbleZ]}>
      <Text position={[0, 2, 0]} fontSize={0.4} color="white">
        Sphere
      </Text>
      <MeshViz mesh={sphere} color="coral" label="Sphere" />
    </group>
  );
}
