'use client';

import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { makeBox, makeSphere, makeCylinder } from '@labrep/generation';
import { MeshViz } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example showing all primitives together with synchronized rotation. */
export function PrimitivesAllExample({ animationAngle }: ExampleProps) {
  const primitives = useMemo(() => {
    const box = makeBox(1, 1, 1);
    const sphere = makeSphere(0.5);
    const cylinder = makeCylinder(0.4, 1);
    return {
      box: box.success ? box.result : null,
      sphere: sphere.success ? sphere.result : null,
      cylinder: cylinder.success ? cylinder.result : null,
    };
  }, []);

  return (
    <group rotation={[0, animationAngle, 0]}>
      <Text position={[0, 3, 0]} fontSize={0.4} color="white">
        All Primitives
      </Text>
      {primitives.box && (
        <group position={[-2, 0, 0]}>
          <MeshViz mesh={primitives.box} color="steelblue" label="Box" />
        </group>
      )}
      {primitives.sphere && (
        <group position={[0, 0, 0]}>
          <MeshViz mesh={primitives.sphere} color="coral" label="Sphere" />
        </group>
      )}
      {primitives.cylinder && (
        <group position={[2, 0, 0]}>
          <MeshViz mesh={primitives.cylinder} color="mediumseagreen" label="Cylinder" />
        </group>
      )}
    </group>
  );
}
