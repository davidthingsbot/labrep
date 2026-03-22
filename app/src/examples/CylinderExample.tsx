'use client';

import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { makeCylinder } from '@labrep/generation';
import { MeshViz } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating cylinder primitive spinning on its axis. */
export function CylinderExample({ animationAngle }: ExampleProps) {
  const cylinder = useMemo(() => {
    const result = makeCylinder(0.4, 1);
    return result.success ? result.result : null;
  }, []);

  if (!cylinder) return null;

  return (
    <group rotation={[0, animationAngle * 2, 0]}>
      <Text position={[0, 2, 0]} fontSize={0.4} color="white">
        Cylinder
      </Text>
      <MeshViz mesh={cylinder} color="mediumseagreen" label="Cylinder" />
    </group>
  );
}
