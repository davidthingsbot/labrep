'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export function Viewer() {
  return (
    <div className="w-full h-full" data-testid="viewer-container">
      <Canvas camera={{ position: [3, 3, 3] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} />
        <OrbitControls />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="steelblue" />
        </mesh>
        <gridHelper args={[10, 10]} />
      </Canvas>
    </div>
  );
}
