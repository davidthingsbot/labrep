'use client';

import { useMemo } from 'react';

import {
  point3d,
  ORIGIN,
  vec3d,
  identity,
  translation,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  compose,
  inverse,
  transformPoint,
  transformVector,
  makeBox,
} from '@labrep/generation';
import { PointViz, MeshViz, VectorViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating all Transform3D functions. */
export function TransformsExample({ animationAngle }: ExampleProps) {
  const box = useMemo(() => {
    const result = makeBox(0.5, 0.5, 0.5);
    return result.success ? result.result! : null;
  }, []);

  if (!box) return null;

  // identity — reference point (unchanged)
  const idTransform = identity();
  const refPoint = transformPoint(idTransform, point3d(0, 0, 0));

  // translation
  const transT = translation(2, 0, 0);
  const translatedPt = transformPoint(transT, ORIGIN);

  // rotationY — animated
  const rotT = rotationY(animationAngle);
  const rotatedPt = transformPoint(rotT, point3d(1, 0, 0));

  // rotationX, rotationZ — static demonstrations
  const rotXPt = transformPoint(rotationX(Math.PI / 4), point3d(0, 1, 0));
  const rotZPt = transformPoint(rotationZ(Math.PI / 4), point3d(1, 0, 0));

  // scaling
  const scaleT = scaling(1.5, 0.5, 1);
  const scaledPt = transformPoint(scaleT, point3d(1, 1, 0));

  // compose — translation then rotation
  const composed = compose(rotationY(animationAngle), translation(1.5, 0, 0));
  const composedPt = transformPoint(composed, ORIGIN);

  // inverse — round-trip test
  const fwd = translation(2, 1, 0);
  const inv = inverse(fwd);
  const roundTrip = transformPoint(compose(inv, fwd), point3d(1, 1, 1));

  // transformVector — rotation affects direction but not translation
  const vec = vec3d(1, 0, 0);
  const rotVec = transformVector(rotationY(animationAngle), vec);

  return (
    <group>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.4} color="white">
        Transforms
      </BillboardText>

      {/* identity — reference box at origin */}
      <group position={[refPoint.x - 3, refPoint.y + 1.5, refPoint.z]}>
        <MeshViz mesh={box} color="#555555" />
      </group>
      <BillboardText position={[-3, 0.8, 0]} fontSize={0.09} color="#555555">identity</BillboardText>

      {/* translation */}
      <group position={[translatedPt.x - 3, translatedPt.y + 1.5, translatedPt.z]}>
        <MeshViz mesh={box} color="cyan" />
      </group>
      <BillboardText position={[-1, 0.8, 0]} fontSize={0.09} color="cyan">translate(2,0,0)</BillboardText>

      {/* rotationY — animated */}
      <PointViz point={ORIGIN} color="gray" size={0.03} />
      <PointViz point={rotatedPt} color="orange" label="rotY" size={0.05} />

      {/* rotationX and rotationZ */}
      <PointViz point={rotXPt} color="red" label="rotX(45°)" size={0.04} />
      <PointViz point={rotZPt} color="blue" label="rotZ(45°)" size={0.04} />

      {/* scaling */}
      <PointViz point={scaledPt} color="magenta" label="scale(1.5,0.5,1)" size={0.04} />

      {/* compose — orbiting point */}
      <PointViz point={composedPt} color="yellow" label="compose" size={0.06} />
      <BillboardText position={[0, -1.5, 0]} fontSize={0.09} color="yellow">
        compose(rotY, translate) = orbit
      </BillboardText>

      {/* inverse — round-trip */}
      <PointViz point={roundTrip} color="#00ff88" label="inverse round-trip" size={0.04} />
      <BillboardText position={[0, -2, 0]} fontSize={0.09} color="#00ff88">
        {`inv(T) * T * P = P → (${roundTrip.x.toFixed(1)}, ${roundTrip.y.toFixed(1)}, ${roundTrip.z.toFixed(1)})`}
      </BillboardText>

      {/* transformVector — direction only, no translation */}
      <VectorViz
        origin={{ x: 2.5, y: 1.5, z: 0 }}
        vector={{ x: rotVec.x, y: rotVec.y, z: rotVec.z }}
        color="orange"
        label="transformVector"
      />

      {/* Info */}
      <BillboardText position={[0, -2.8, 0]} fontSize={0.1} color="gray">
        transforms: identity, translate, rotX/Y/Z, scale, compose, inverse
      </BillboardText>
    </group>
  );
}
