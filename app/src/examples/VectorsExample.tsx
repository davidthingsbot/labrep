'use client';


import {
  vec3d,
  ORIGIN,
  X_AXIS,
  Y_AXIS,
  Z_AXIS,
  length,
  normalize,
  add,
  subtract,
  scale,
  dot,
  cross,
  negate,
} from '@labrep/generation';
import { VectorViz, PointViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating all Vector3D functions. */
export function VectorsExample({ animationAngle }: ExampleProps) {
  // Basis vectors
  const rotatedVec = vec3d(
    Math.cos(animationAngle),
    Math.sin(animationAngle),
    0.5,
  );

  // length
  const len = length(rotatedVec);

  // normalize — show unit version of a non-unit vector
  const bigVec = vec3d(2, 1, 0);
  const normVec = normalize(bigVec);

  // add — parallelogram rule
  const v1 = vec3d(1.5, 0, 0);
  const v2 = vec3d(0.5, 1, 0);
  const vSum = add(v1, v2);

  // subtract
  const vDiff = subtract(v1, v2);

  // scale — animated scaling
  const scaleFactor = 0.5 + 0.5 * Math.sin(animationAngle);
  const vScaled = scale(Y_AXIS, scaleFactor * 2);

  // dot product
  const dotVal = dot(v1, v2);

  // cross product
  const vCross = cross(X_AXIS, Y_AXIS);

  // negate
  const vNeg = negate(X_AXIS);

  return (
    <group>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.4} color="white">
        Vectors
      </BillboardText>

      {/* Basis vectors */}
      <VectorViz origin={ORIGIN} vector={X_AXIS} color="red" label="X" />
      <VectorViz origin={ORIGIN} vector={Y_AXIS} color="green" label="Y" />
      <VectorViz origin={ORIGIN} vector={Z_AXIS} color="blue" label="Z" />

      {/* Rotating vector */}
      <VectorViz origin={ORIGIN} vector={rotatedVec} color="orange" label={`|v|=${len.toFixed(2)}`} />

      {/* normalize — big vector + its unit version side by side */}
      <VectorViz origin={{ x: -3, y: -1, z: 0 }} vector={bigVec} color="#888888" />
      <VectorViz origin={{ x: -3, y: -1.5, z: 0 }} vector={normVec} color="white" label="normalized" />

      {/* add — parallelogram */}
      <VectorViz origin={{ x: -3, y: 1, z: 0 }} vector={v1} color="cyan" label="v1" />
      <VectorViz origin={{ x: -3, y: 1, z: 0 }} vector={v2} color="magenta" label="v2" />
      <VectorViz origin={{ x: -3, y: 1, z: 0 }} vector={vSum} color="yellow" label="v1+v2" />

      {/* subtract */}
      <VectorViz origin={{ x: -3 + v1.x, y: 1 + v1.y, z: 0 }} vector={vDiff} color="#666666" />

      {/* scale — animated */}
      <VectorViz origin={{ x: 3, y: -1, z: 0 }} vector={vScaled} color="green" label={`scale(${scaleFactor.toFixed(1)})`} />

      {/* cross product — X x Y = Z */}
      <VectorViz origin={{ x: 3, y: 0, z: 0 }} vector={vCross} color="#ff8800" label="X×Y=Z" />

      {/* negate */}
      <VectorViz origin={{ x: 3, y: -2, z: 0 }} vector={X_AXIS} color="red" />
      <VectorViz origin={{ x: 3, y: -2, z: 0 }} vector={vNeg} color="#ff4444" label="negate" />

      {/* Info */}
      <BillboardText position={[0, -3, 0]} fontSize={0.1} color="gray">
        {`dot(v1, v2) = ${dotVal.toFixed(2)} | cross(X, Y) = Z`}
      </BillboardText>
    </group>
  );
}
