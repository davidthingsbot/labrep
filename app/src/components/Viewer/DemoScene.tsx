'use client';

import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { point3d, vec3d, ORIGIN, X_AXIS, Y_AXIS, Z_AXIS } from '@labrep/generation';
import { makeBox, makeSphere, makeCylinder } from '@labrep/generation';
import { PointViz, VectorViz, LineViz, MeshViz } from '@/components/Viewer/SceneObjects';

/** Showcase scene demonstrating all labrep geometry types. */
export function DemoScene() {
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
    <group>
      {/* Group 1: Points */}
      <group position={[-4, 0, 0]}>
        <Text position={[0, 3, 0]} fontSize={0.4} color="white">
          Points
        </Text>
        <PointViz point={ORIGIN} color="yellow" label="Origin" />
        <PointViz point={point3d(1, 2, 0)} color="red" label="P1" />
        <PointViz point={point3d(-1, 1, 1)} color="green" label="P2" />
        <PointViz point={point3d(2, 0, -1)} color="blue" label="P3" />
      </group>

      {/* Group 2: Vectors */}
      <group position={[-1, 0, 0]}>
        <Text position={[0, 3, 0]} fontSize={0.4} color="white">
          Vectors
        </Text>
        <VectorViz origin={ORIGIN} vector={X_AXIS} color="red" label="X" />
        <VectorViz origin={ORIGIN} vector={Y_AXIS} color="green" label="Y" />
        <VectorViz origin={ORIGIN} vector={Z_AXIS} color="blue" label="Z" />
        <VectorViz
          origin={ORIGIN}
          vector={vec3d(1, 1, 1)}
          color="orange"
          label="(1,1,1)"
        />
      </group>

      {/* Group 3: Lines */}
      <group position={[2, 0, 0]}>
        <Text position={[0, 3, 0]} fontSize={0.4} color="white">
          Lines
        </Text>
        {/* Triangle */}
        <LineViz
          start={point3d(0, 0, 0)}
          end={point3d(2, 0, 0)}
          color="cyan"
          label="edge-1"
        />
        <LineViz
          start={point3d(2, 0, 0)}
          end={point3d(1, 1.5, 0)}
          color="cyan"
          label="edge-2"
        />
        <LineViz
          start={point3d(1, 1.5, 0)}
          end={point3d(0, 0, 0)}
          color="cyan"
          label="edge-3"
        />
        {/* Diagonal */}
        <LineViz
          start={point3d(-0.5, -0.5, -0.5)}
          end={point3d(2.5, 2, 0.5)}
          color="magenta"
          label="diagonal"
        />
      </group>

      {/* Group 4: Primitives */}
      <group position={[5, 0, 0]}>
        <Text position={[0, 3, 0]} fontSize={0.4} color="white">
          Primitives
        </Text>
        {primitives.box && (
          <group position={[0, 0, -2]}>
            <MeshViz mesh={primitives.box} color="steelblue" label="Box" />
          </group>
        )}
        {primitives.sphere && (
          <group position={[0, 0, 0]}>
            <MeshViz mesh={primitives.sphere} color="coral" label="Sphere" />
          </group>
        )}
        {primitives.cylinder && (
          <group position={[0, 0, 2]}>
            <MeshViz
              mesh={primitives.cylinder}
              color="mediumseagreen"
              label="Cylinder"
            />
          </group>
        )}
      </group>
    </group>
  );
}
