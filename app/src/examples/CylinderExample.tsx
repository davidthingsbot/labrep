'use client';

import { useMemo } from 'react';

import { makeCylinder } from '@labrep/generation';
import { MeshViz , BillboardText } from '@/components/Viewer/SceneObjects';
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
      <BillboardText position={[0, 2, 0]} fontSize={0.4} color="white">
        Cylinder
      </BillboardText>
      <MeshViz mesh={cylinder} color="mediumseagreen" label="Cylinder" />
    </group>
  );
}
