'use client';

import { useMemo } from 'react';

import { makeSphere } from '@labrep/generation';
import { MeshViz , BillboardText } from '@/components/Viewer/SceneObjects';
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
      <BillboardText position={[0, 2, 0]} fontSize={0.4} color="white">
        Sphere
      </BillboardText>
      <MeshViz mesh={sphere} color="coral" label="Sphere" />
    </group>
  );
}
