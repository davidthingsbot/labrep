'use client';

import { useMemo } from 'react';
import {
  point3d,
  makeLine3D,
  makeEdgeFromCurve,
  orientEdge,
  makeWire,
  makePlanarFace,
  makeShell,
  makeSolid,
  solidVolume,
  createStepModelBuilder,
  solidToStep,
  writeStep,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating STEP export of a BRep solid. */
export function TopologyStepExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Create a simple box solid
    function makeRectFace(x1: number, y1: number, x2: number, y2: number, z: number) {
      const edges = [
        makeEdgeFromCurve(makeLine3D(point3d(x1, y1, z), point3d(x2, y1, z)).result!).result!,
        makeEdgeFromCurve(makeLine3D(point3d(x2, y1, z), point3d(x2, y2, z)).result!).result!,
        makeEdgeFromCurve(makeLine3D(point3d(x2, y2, z), point3d(x1, y2, z)).result!).result!,
        makeEdgeFromCurve(makeLine3D(point3d(x1, y2, z), point3d(x1, y1, z)).result!).result!,
      ];
      const wire = makeWire(edges.map(e => orientEdge(e, true))).result!;
      return makePlanarFace(wire).result!;
    }

    function makeVertFace(coords: [number, number, number][]) {
      const edges = [];
      for (let i = 0; i < coords.length; i++) {
        const [x1, y1, z1] = coords[i];
        const [x2, y2, z2] = coords[(i + 1) % coords.length];
        edges.push(makeEdgeFromCurve(makeLine3D(point3d(x1, y1, z1), point3d(x2, y2, z2)).result!).result!);
      }
      const wire = makeWire(edges.map(e => orientEdge(e, true))).result!;
      return makePlanarFace(wire).result!;
    }

    const w = 2, h = 1, d = 1.5;
    const faces = [
      makeRectFace(0, 0, w, h, 0),  // bottom
      makeRectFace(0, 0, w, h, d),  // top
      makeVertFace([[0,0,0], [w,0,0], [w,0,d], [0,0,d]]), // front
      makeVertFace([[0,h,0], [w,h,0], [w,h,d], [0,h,d]]), // back
      makeVertFace([[0,0,0], [0,h,0], [0,h,d], [0,0,d]]), // left
      makeVertFace([[w,0,0], [w,h,0], [w,h,d], [w,0,d]]), // right
    ];

    const shell = makeShell(faces).result!;
    const solid = makeSolid(shell).result!;
    const volume = solidVolume(solid);

    // Export to STEP
    const builder = createStepModelBuilder();
    solidToStep(solid, builder);
    const stepText = writeStep(builder.build());

    // Count entities
    const entityCount = (stepText.match(/#\d+ =/g) || []).length;

    return { solid, volume, stepText, entityCount, w, h, d };
  }, []);

  if (!data) return null;
  const { volume, entityCount, w, h, d } = data;

  return (
    <group rotation={[0, animationAngle * 0.2, 0]}>
      <BillboardText position={[1, 3, 0]} fontSize={0.3} color="white">
        STEP Export
      </BillboardText>

      {/* Show the box */}
      <mesh position={[w/2, h/2, d/2]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="steelblue" />
      </mesh>

      {/* Wireframe overlay */}
      <mesh position={[w/2, h/2, d/2]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial color="white" wireframe />
      </mesh>

      {/* Info */}
      <BillboardText position={[1, -1, 0]} fontSize={0.12} color="cyan">
        {`${w}×${h}×${d} box → STEP file`}
      </BillboardText>
      <BillboardText position={[1, -1.4, 0]} fontSize={0.1} color="gray">
        {`Volume: ${volume.toFixed(2)} | STEP entities: ${entityCount}`}
      </BillboardText>
      <BillboardText position={[1, -1.8, 0]} fontSize={0.08} color="#666">
        {`Header + ${entityCount} entities exported`}
      </BillboardText>
    </group>
  );
}
