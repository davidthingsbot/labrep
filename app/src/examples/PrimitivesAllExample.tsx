'use client';

import { useMemo } from 'react';

import {
  makeBox,
  makeSphere,
  makeCylinder,
  meshVertexCount,
  meshTriangleCount,
  validateMesh,
} from '@labrep/generation';
import { MeshViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example showing all primitives together with mesh stats. */
export function PrimitivesAllExample({ animationAngle }: ExampleProps) {
  const primitives = useMemo(() => {
    const box = makeBox(1, 1, 1);
    const sphere = makeSphere(0.5);
    const cylinder = makeCylinder(0.4, 1);
    return {
      box: box.success ? box.result! : null,
      sphere: sphere.success ? sphere.result! : null,
      cylinder: cylinder.success ? cylinder.result! : null,
    };
  }, []);

  // meshVertexCount, meshTriangleCount, validateMesh
  const stats = useMemo(() => {
    if (!primitives.box || !primitives.sphere || !primitives.cylinder) return null;
    return {
      boxVerts: meshVertexCount(primitives.box),
      boxTris: meshTriangleCount(primitives.box),
      boxValid: validateMesh(primitives.box).success,
      sphereVerts: meshVertexCount(primitives.sphere),
      sphereTris: meshTriangleCount(primitives.sphere),
      sphereValid: validateMesh(primitives.sphere).success,
      cylVerts: meshVertexCount(primitives.cylinder),
      cylTris: meshTriangleCount(primitives.cylinder),
      cylValid: validateMesh(primitives.cylinder).success,
    };
  }, [primitives]);

  return (
    <group rotation={[0, animationAngle, 0]}>
      <BillboardText position={[0, 3, 0]} fontSize={0.4} color="white">
        All Primitives
      </BillboardText>
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
      {/* Mesh stats */}
      {stats && (
        <group rotation={[0, -animationAngle, 0]}>
          <BillboardText position={[-2, -1.5, 0]} fontSize={0.09} color="gray">
            {`${stats.boxVerts}v ${stats.boxTris}t ${stats.boxValid ? 'valid' : 'invalid'}`}
          </BillboardText>
          <BillboardText position={[0, -1.5, 0]} fontSize={0.09} color="gray">
            {`${stats.sphereVerts}v ${stats.sphereTris}t ${stats.sphereValid ? 'valid' : 'invalid'}`}
          </BillboardText>
          <BillboardText position={[2, -1.5, 0]} fontSize={0.09} color="gray">
            {`${stats.cylVerts}v ${stats.cylTris}t ${stats.cylValid ? 'valid' : 'invalid'}`}
          </BillboardText>
        </group>
      )}
    </group>
  );
}
