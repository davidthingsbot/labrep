'use client';


import {
  point3d,
  ORIGIN,
  distance,
  midpoint,
  addVector,
  subtractPoints,
  pointsEqual,
  vec3d,
  TOLERANCE,
  isZero,
  isEqual,
} from '@labrep/generation';
import { PointViz, VectorViz, LineViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating Point3D and tolerance functions. */
export function PointsExample({ animationAngle }: ExampleProps) {
  const pulse = 1 + 0.1 * Math.sin(animationAngle);

  const p1 = point3d(2, 0, 0);
  const p2 = point3d(0, 2, 0);
  const p3 = point3d(1, 1, 1);

  // distance
  const dist12 = distance(p1, p2);

  // midpoint
  const mid = midpoint(p1, p2);

  // addVector — translate p1 by an animated vector
  const offset = vec3d(0, Math.sin(animationAngle) * 0.5, 0);
  const translated = addVector(p1, offset);

  // subtractPoints — vector from ORIGIN to p3
  const vec = subtractPoints(p3, ORIGIN);

  // pointsEqual — two very close points
  const almostP1 = point3d(2 + TOLERANCE * 0.5, 0, 0);
  const areEqual = pointsEqual(p1, almostP1);

  // isZero / isEqual
  const zeroCheck = isZero(0.00000001);
  const equalCheck = isEqual(1.0, 1.0 + TOLERANCE * 0.1);

  return (
    <group scale={[pulse, pulse, pulse]}>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.4} color="white">
        Points
      </BillboardText>

      {/* Base points */}
      <PointViz point={ORIGIN} color="yellow" label="Origin" />
      <PointViz point={p1} color="red" label="P1" />
      <PointViz point={p2} color="green" label="P2" />
      <PointViz point={p3} color="blue" label="P3" />

      {/* distance — labeled line between P1 and P2 */}
      <LineViz start={p1} end={p2} color="#555555" label={`d=${dist12.toFixed(2)}`} />

      {/* midpoint */}
      <PointViz point={mid} color="white" label="midpoint" size={0.04} />

      {/* addVector — animated translated point */}
      <PointViz point={translated} color="red" size={0.04} />
      <VectorViz origin={p1} vector={offset} color="#ff666666" />

      {/* subtractPoints — vector from origin to P3 */}
      <VectorViz
        origin={ORIGIN}
        vector={{ x: vec.x, y: vec.y, z: vec.z }}
        color="blue"
        label="P3-O"
      />

      {/* pointsEqual — show two nearly-coincident points */}
      <PointViz point={almostP1} color="red" size={0.06} />
      <BillboardText position={[2, -0.4, 0]} fontSize={0.1} color={areEqual ? '#00ff88' : 'red'}>
        {areEqual ? 'equal (within tol)' : 'not equal'}
      </BillboardText>

      {/* Tolerance info */}
      <BillboardText position={[0, -2.5, 0]} fontSize={0.1} color="gray">
        {`TOLERANCE = ${TOLERANCE} | isZero(1e-8) = ${zeroCheck} | isEqual(1, 1+ε) = ${equalCheck}`}
      </BillboardText>
    </group>
  );
}
