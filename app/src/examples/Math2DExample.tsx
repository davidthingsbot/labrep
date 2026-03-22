'use client';

import { Line  } from '@react-three/drei';
import {
  point2d,
  ORIGIN_2D,
  distance2d,
  midpoint2d,
  addVector2d,
  subtractPoints2d,
  points2dEqual,
  vec2d,
  X_AXIS_2D,
  Y_AXIS_2D,
  length2d,
  normalize2d,
  add2d,
  subtract2d,
  scale2d,
  dot2d,
  perpendicular,
} from '@labrep/generation';
import { PointViz, VectorViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating all 2D point and vector functions. */
export function Math2DExample({ animationAngle }: ExampleProps) {
  // --- Point2D functions ---
  const pA = point2d(1, 0.5);
  const pB = point2d(-1, 1.5);
  const dist = distance2d(pA, pB);
  const mid = midpoint2d(pA, pB);

  // addVector2d — animated offset
  const offset = vec2d(Math.cos(animationAngle) * 0.5, Math.sin(animationAngle) * 0.5);
  const moved = addVector2d(pA, offset);

  // subtractPoints2d
  const diff = subtractPoints2d(pB, pA);

  // points2dEqual
  const almostA = point2d(1 + 1e-8, 0.5);
  const areEqual = points2dEqual(pA, almostA);

  // --- Vector2D functions ---
  const v1 = vec2d(1.5, 0.8);
  const v2 = vec2d(0.5, 1.2);
  const len = length2d(v1);
  const unit = normalize2d(v1);
  const vAdd = add2d(v1, v2);
  const vSub = subtract2d(v1, v2);
  const vScaled = scale2d(X_AXIS_2D, 1.5 + 0.5 * Math.sin(animationAngle));
  const dotVal = dot2d(v1, v2);
  const perp = perpendicular(v1);

  // Layout: points on left side, vectors on right side
  const ptOff = -2.5; // x offset for point section
  const vecOff = 1.5; // x offset for vector section

  return (
    <group>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.4} color="white">
        2D Math
      </BillboardText>

      {/* --- Point2D section (left) --- */}
      <BillboardText position={[ptOff, 2.5, 0]} fontSize={0.15} color="cyan">
        Point2D
      </BillboardText>

      <PointViz point={{ x: ORIGIN_2D.x + ptOff, y: ORIGIN_2D.y, z: 0 }} color="gray" label="ORIGIN_2D" size={0.04} />
      <PointViz point={{ x: pA.x + ptOff, y: pA.y, z: 0 }} color="cyan" label="A" size={0.05} />
      <PointViz point={{ x: pB.x + ptOff, y: pB.y, z: 0 }} color="cyan" label="B" size={0.05} />

      {/* distance2d */}
      <Line
        points={[[pA.x + ptOff, pA.y, 0], [pB.x + ptOff, pB.y, 0]]}
        color="#555555"
        lineWidth={1}
      />
      <BillboardText position={[(pA.x + pB.x) / 2 + ptOff, (pA.y + pB.y) / 2 + 0.2, 0]} fontSize={0.09} color="#888888">
        {`d=${dist.toFixed(2)}`}
      </BillboardText>

      {/* midpoint2d */}
      <PointViz point={{ x: mid.x + ptOff, y: mid.y, z: 0 }} color="white" label="mid" size={0.04} />

      {/* addVector2d — animated */}
      <PointViz point={{ x: moved.x + ptOff, y: moved.y, z: 0 }} color="yellow" size={0.05} />
      <VectorViz
        origin={{ x: pA.x + ptOff, y: pA.y, z: 0 }}
        vector={{ x: offset.x, y: offset.y, z: 0 }}
        color="yellow"
      />

      {/* subtractPoints2d — vector from A to B */}
      <VectorViz
        origin={{ x: pA.x + ptOff, y: pA.y - 0.5, z: 0 }}
        vector={{ x: diff.x, y: diff.y, z: 0 }}
        color="magenta"
        label="B-A"
      />

      {/* points2dEqual */}
      <BillboardText position={[ptOff, -1.5, 0]} fontSize={0.09} color={areEqual ? '#00ff88' : 'red'}>
        {`points2dEqual = ${areEqual}`}
      </BillboardText>

      {/* --- Vector2D section (right) --- */}
      <BillboardText position={[vecOff, 2.5, 0]} fontSize={0.15} color="magenta">
        Vector2D
      </BillboardText>

      {/* Basis vectors */}
      <VectorViz origin={{ x: vecOff, y: -0.5, z: 0 }} vector={{ x: X_AXIS_2D.x, y: X_AXIS_2D.y, z: 0 }} color="red" label="X_2D" />
      <VectorViz origin={{ x: vecOff, y: -0.5, z: 0 }} vector={{ x: Y_AXIS_2D.x, y: Y_AXIS_2D.y, z: 0 }} color="green" label="Y_2D" />

      {/* v1 and normalize */}
      <VectorViz origin={{ x: vecOff, y: 1.5, z: 0 }} vector={{ x: v1.x, y: v1.y, z: 0 }} color="#888888" />
      <VectorViz origin={{ x: vecOff, y: 1, z: 0 }} vector={{ x: unit.x, y: unit.y, z: 0 }} color="white" label={`norm |${len.toFixed(2)}|`} />

      {/* add2d */}
      <VectorViz origin={{ x: vecOff, y: 0.3, z: 0 }} vector={{ x: vAdd.x * 0.5, y: vAdd.y * 0.5, z: 0 }} color="cyan" label="add" />

      {/* subtract2d */}
      <VectorViz origin={{ x: vecOff + 2, y: 0.3, z: 0 }} vector={{ x: vSub.x * 0.5, y: vSub.y * 0.5, z: 0 }} color="#888888" label="sub" />

      {/* scale2d — animated */}
      <VectorViz origin={{ x: vecOff, y: -1.2, z: 0 }} vector={{ x: vScaled.x, y: vScaled.y, z: 0 }} color="orange" label="scale" />

      {/* perpendicular */}
      <VectorViz origin={{ x: vecOff + 2.5, y: 1.5, z: 0 }} vector={{ x: v1.x * 0.6, y: v1.y * 0.6, z: 0 }} color="#888888" />
      <VectorViz origin={{ x: vecOff + 2.5, y: 1.5, z: 0 }} vector={{ x: perp.x * 0.6, y: perp.y * 0.6, z: 0 }} color="#ff8800" label="perp" />

      {/* Info */}
      <BillboardText position={[0, -2.5, 0]} fontSize={0.1} color="gray">
        {`dot2d(v1, v2) = ${dotVal.toFixed(2)} | perpendicular rotates 90° CCW`}
      </BillboardText>
    </group>
  );
}
