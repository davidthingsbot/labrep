'use client';

import { Text } from '@react-three/drei';
import { point3d } from '@labrep/generation';
import { LineViz } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating line segment visualization. */
export function LinesExample({ animationAngle }: ExampleProps) {
  // Animate diagonal endpoint
  const diagonalEnd = point3d(
    2.5 + Math.sin(animationAngle) * 0.5,
    2 + Math.cos(animationAngle) * 0.5,
    0.5
  );
  
  return (
    <group>
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
      {/* Animated diagonal */}
      <LineViz
        start={point3d(-0.5, -0.5, -0.5)}
        end={diagonalEnd}
        color="magenta"
        label="diagonal"
      />
    </group>
  );
}
