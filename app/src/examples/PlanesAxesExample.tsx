'use client';

import { useMemo } from 'react';
import { Line, Plane as DreiPlane } from '@react-three/drei';
import * as THREE from 'three';
import {
  point3d,
  ORIGIN,
  vec3d,
  axis,
  X_AXIS_3D,
  Y_AXIS_3D,
  Z_AXIS_3D,
  plane,
  XY_PLANE,
  XZ_PLANE,
  YZ_PLANE,
  distanceToPoint,
  projectPoint,
  containsPoint,
  X_AXIS,
  Y_AXIS,
  Z_AXIS,
} from '@labrep/generation';
import { PointViz, VectorViz, LineViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating Axis, Plane, and their query functions. */
export function PlanesAxesExample({ animationAngle }: ExampleProps) {
  // Axis constants
  const xAx = X_AXIS_3D;
  const yAx = Y_AXIS_3D;
  const zAx = Z_AXIS_3D;

  // Custom axis
  const customAx = useMemo(() => axis(point3d(0, 0, 0), vec3d(1, 1, 0)), []);

  // Plane constants
  const xyPl = XY_PLANE;

  // Custom plane
  const tiltedPl = useMemo(
    () => plane(point3d(0, 0, 0), vec3d(0, 1, 0.5), vec3d(1, 0, 0)),
    [],
  );

  // Animated point above the XY plane
  const testPoint = point3d(
    1.5 * Math.cos(animationAngle),
    1.5 * Math.sin(animationAngle),
    1 + 0.5 * Math.sin(animationAngle * 2),
  );

  // distanceToPoint
  const dist = distanceToPoint(xyPl, testPoint);

  // projectPoint
  const projected = projectPoint(xyPl, testPoint);

  // containsPoint
  const onPlane = containsPoint(xyPl, projected);
  const offPlane = containsPoint(xyPl, testPoint);

  return (
    <group>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.4} color="white">
        Planes and Axes
      </BillboardText>

      {/* XY Plane — translucent quad */}
      <mesh rotation={[0, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[5, 5]} />
        <meshStandardMaterial
          color="#224488"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
      <BillboardText position={[2.2, 0.2, 0]} fontSize={0.12} color="#4488cc">
        XY plane
      </BillboardText>

      {/* Axes — shown as long lines through origin */}
      <LineViz
        start={point3d(-3, 0, 0)}
        end={point3d(3, 0, 0)}
        color="red"
        label="X axis"
      />
      <LineViz
        start={point3d(0, -3, 0)}
        end={point3d(0, 3, 0)}
        color="green"
        label="Y axis"
      />
      <LineViz
        start={point3d(0, 0, -2)}
        end={point3d(0, 0, 2)}
        color="blue"
        label="Z axis"
      />

      {/* Custom axis */}
      <VectorViz
        origin={{ x: customAx.origin.x, y: customAx.origin.y, z: customAx.origin.z }}
        vector={{
          x: customAx.direction.x * 2,
          y: customAx.direction.y * 2,
          z: customAx.direction.z * 2,
        }}
        color="orange"
        label="custom axis"
      />

      {/* Normal vector of XY plane */}
      <VectorViz
        origin={ORIGIN}
        vector={{ x: 0, y: 0, z: 1.5 }}
        color="#4488cc"
        label="normal"
      />

      {/* Animated test point */}
      <PointViz
        point={testPoint}
        color="yellow"
        label="test pt"
        size={0.06}
      />

      {/* Projection onto XY plane */}
      <PointViz
        point={projected}
        color="#00ff88"
        label="projected"
        size={0.05}
      />

      {/* Dashed line from point to projection */}
      <Line
        points={[
          [testPoint.x, testPoint.y, testPoint.z],
          [projected.x, projected.y, projected.z],
        ]}
        color="#555555"
        lineWidth={1}
      />

      {/* Info */}
      <BillboardText position={[0, -2.5, 0]} fontSize={0.1} color="gray">
        {`distanceToPoint = ${dist.toFixed(2)} | containsPoint(proj) = ${onPlane} | containsPoint(test) = ${offPlane}`}
      </BillboardText>
      <BillboardText position={[0, -3, 0]} fontSize={0.1} color="gray">
        planes: XY, XZ, YZ | axes: X, Y, Z, custom
      </BillboardText>
    </group>
  );
}
