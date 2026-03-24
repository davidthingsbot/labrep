'use client';

import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  solidVolume,
  booleanIntersect,
  solidToStep,
  createStepModelBuilder,
  writeStep,
  parseStep,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

function makeBoxSolid(x: number, y: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(x - hw, y - hh, z), point3d(x + hw, y - hh, z),
    point3d(x + hw, y + hh, z), point3d(x - hw, y + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d);
}

function boxWireframe(x: number, y: number, z: number, w: number, h: number, d: number): P3[][] {
  const hw = w / 2, hh = h / 2;
  return [
    [[x-hw,y-hh,z],[x+hw,y-hh,z]], [[x+hw,y-hh,z],[x+hw,y+hh,z]],
    [[x+hw,y+hh,z],[x-hw,y+hh,z]], [[x-hw,y+hh,z],[x-hw,y-hh,z]],
    [[x-hw,y-hh,z+d],[x+hw,y-hh,z+d]], [[x+hw,y-hh,z+d],[x+hw,y+hh,z+d]],
    [[x+hw,y+hh,z+d],[x-hw,y+hh,z+d]], [[x-hw,y+hh,z+d],[x-hw,y-hh,z+d]],
    [[x-hw,y-hh,z],[x-hw,y-hh,z+d]], [[x+hw,y-hh,z],[x+hw,y-hh,z+d]],
    [[x+hw,y+hh,z],[x+hw,y+hh,z+d]], [[x-hw,y+hh,z],[x-hw,y+hh,z+d]],
  ];
}

/**
 * Boolean STEP Round-Trip — performs box-box intersection,
 * exports to STEP, parses back, with live stats.
 */
export function BooleanStepExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;
  const offset = 1 + 1 * Math.sin(t);

  let resultVol = 0;
  let stepEntities = 0;
  let stepLen = 0;
  let parsedEntities = 0;
  let roundTripOk = false;

  try {
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const boxB = makeBoxSolid(offset, offset, 0, 4, 4, 4);

    if (boxA.success && boxB.success) {
      const result = booleanIntersect(boxA.result!.solid, boxB.result!.solid);
      if (result.success) {
        resultVol = solidVolume(result.result!.solid);

        const builder = createStepModelBuilder();
        solidToStep(result.result!.solid, builder);
        const model = builder.build();
        const stepText = writeStep(model);
        stepEntities = model.entities.size;
        stepLen = stepText.length;

        const parsed = parseStep(stepText);
        roundTripOk = parsed.success;
        parsedEntities = parsed.success ? parsed.result!.entities.size : 0;
      }
    }
  } catch { /* animation edge cases */ }

  const wireA = boxWireframe(0, 0, 0, 4, 4, 4);
  const wireB = boxWireframe(offset, offset, 0, 4, 4, 4);

  return (
    <group>
      {wireA.map((pts, i) => (
        <Line key={`a-${i}`} points={pts} color="#666" lineWidth={1} />
      ))}
      {wireB.map((pts, i) => (
        <Line key={`b-${i}`} points={pts} color="#888" lineWidth={1} />
      ))}

      <Sphere args={[0.2]} position={[0, 0, 6]}>
        <meshBasicMaterial color={roundTripOk ? '#4ade80' : '#ef4444'} />
      </Sphere>

      <BillboardText position={[0, 0, 7.5]} fontSize={0.45} color="#60a5fa">
        Intersect: V={resultVol.toFixed(1)}
      </BillboardText>
      <BillboardText position={[0, 0, 6.7]} fontSize={0.35} color="#c084fc">
        STEP: {stepEntities} entities, {stepLen.toLocaleString()} chars
      </BillboardText>
      <BillboardText position={[0, 0, 6]} fontSize={0.3} color={roundTripOk ? '#4ade80' : '#ef4444'}>
        Round-trip: {roundTripOk ? `parsed ${parsedEntities} entities` : 'failed'}
      </BillboardText>
    </group>
  );
}
