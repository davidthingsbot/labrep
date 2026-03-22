'use client';

import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { makeBox } from '@labrep/generation';
import { MeshViz } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating box primitive with Y-axis rotation. */
export function BoxExample({ animationAngle }: ExampleProps) {
  const box = useMemo(() => {
    const result = makeBox(1, 1, 1);
    return result.success ? result.result : null;
  }, []);

  if (!box) return null;

  return (
    <group rotation={[0, animationAngle, 0]}>
      <Text position={[0, 2, 0]} fontSize={0.4} color="white">
        Box
      </Text>
      <MeshViz mesh={box} color="steelblue" label="Box" />
    </group>
  );
}
