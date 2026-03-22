'use client';

import { useMemo } from 'react';
import {
  makeBox,
  makeSphere,
  makeCylinder,
  meshToStlAscii,
  meshToStlBinary,
  stlToMesh,
  meshVertexCount,
  meshTriangleCount,
  validateMesh,
} from '@labrep/generation';
import { MeshViz, BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating STL export → import round-trip. */
export function StlRoundtripExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Original meshes
    const box = makeBox(1, 1, 1).result!;
    const sphere = makeSphere(0.6, { segments: 12, rings: 8 }).result!;
    const cyl = makeCylinder(0.4, 1, { segments: 12 }).result!;

    // ASCII round-trip: box
    const boxAscii = meshToStlAscii(box, 'box');
    const boxImported = stlToMesh(boxAscii).result!;

    // Binary round-trip: sphere
    const sphereBinary = meshToStlBinary(sphere);
    const sphereImported = stlToMesh(sphereBinary).result!;

    // Binary round-trip: cylinder
    const cylBinary = meshToStlBinary(cyl);
    const cylImported = stlToMesh(cylBinary).result!;

    return {
      box, boxImported, boxAscii,
      sphere, sphereImported, sphereBinarySize: sphereBinary.byteLength,
      cyl, cylImported, cylBinarySize: cylBinary.byteLength,
    };
  }, []);

  if (!data) return null;

  const {
    box, boxImported, boxAscii,
    sphere, sphereImported, sphereBinarySize,
    cyl, cylImported, cylBinarySize,
  } = data;

  // Stats
  const boxOrigTris = meshTriangleCount(box);
  const boxImpTris = meshTriangleCount(boxImported);
  const boxOrigVerts = meshVertexCount(box);
  const boxImpVerts = meshVertexCount(boxImported);
  const boxValid = validateMesh(boxImported).success;

  const sphereOrigTris = meshTriangleCount(sphere);
  const sphereImpTris = meshTriangleCount(sphereImported);
  const sphereValid = validateMesh(sphereImported).success;

  const cylOrigTris = meshTriangleCount(cyl);
  const cylImpTris = meshTriangleCount(cylImported);
  const cylValid = validateMesh(cylImported).success;

  return (
    <group rotation={[0, animationAngle, 0]}>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.35} color="white">
        STL Round-Trip
      </BillboardText>

      {/* --- Box: ASCII round-trip --- */}
      <group position={[-2.5, 0.5, 0]}>
        {/* Original (wireframe) */}
        <MeshViz mesh={box} color="#555555" wireframe />
        {/* Imported (solid, overlaid) */}
        <MeshViz mesh={boxImported} color="cyan" />
      </group>
      <group rotation={[0, -animationAngle, 0]}>
        <BillboardText position={[-2.5, -1.2, 0]} fontSize={0.08} color="cyan">
          {`box (ASCII): ${boxOrigTris}→${boxImpTris} tris, ${boxOrigVerts}→${boxImpVerts} verts`}
        </BillboardText>
        <BillboardText position={[-2.5, -1.5, 0]} fontSize={0.07} color="gray">
          {`${boxAscii.length} chars, valid=${boxValid}`}
        </BillboardText>
      </group>

      {/* --- Sphere: Binary round-trip --- */}
      <group position={[0, 0.5, 0]}>
        <MeshViz mesh={sphere} color="#555555" wireframe />
        <MeshViz mesh={sphereImported} color="magenta" />
      </group>
      <group rotation={[0, -animationAngle, 0]}>
        <BillboardText position={[0, -1.2, 0]} fontSize={0.08} color="magenta">
          {`sphere (binary): ${sphereOrigTris}→${sphereImpTris} tris`}
        </BillboardText>
        <BillboardText position={[0, -1.5, 0]} fontSize={0.07} color="gray">
          {`${sphereBinarySize} bytes, valid=${sphereValid}`}
        </BillboardText>
      </group>

      {/* --- Cylinder: Binary round-trip --- */}
      <group position={[2.5, 0.5, 0]}>
        <MeshViz mesh={cyl} color="#555555" wireframe />
        <MeshViz mesh={cylImported} color="#44aa88" />
      </group>
      <group rotation={[0, -animationAngle, 0]}>
        <BillboardText position={[2.5, -1.2, 0]} fontSize={0.08} color="#44aa88">
          {`cylinder (binary): ${cylOrigTris}→${cylImpTris} tris`}
        </BillboardText>
        <BillboardText position={[2.5, -1.5, 0]} fontSize={0.07} color="gray">
          {`${cylBinarySize} bytes, valid=${cylValid}`}
        </BillboardText>
      </group>

      {/* Legend */}
      <group rotation={[0, -animationAngle, 0]}>
        <BillboardText position={[0, -2.3, 0]} fontSize={0.09} color="gray">
          wireframe = original, solid = imported from STL
        </BillboardText>
      </group>
    </group>
  );
}
