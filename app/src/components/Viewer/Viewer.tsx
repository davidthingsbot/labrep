'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Mesh as LabrepMesh } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';

interface ViewerProps {
  mesh?: LabrepMesh;
}

function GeneratedMesh({ mesh }: { mesh: LabrepMesh }) {
  const geometry = useMemo(() => meshToBufferGeometry(mesh), [mesh]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}

function DefaultMesh() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}

export function Viewer({ mesh }: ViewerProps = {}) {
  return (
    <div className="w-full h-full" data-testid="viewer-container">
      <Canvas camera={{ position: [3, 3, 3] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} />
        <OrbitControls />
        {mesh ? <GeneratedMesh mesh={mesh} /> : <DefaultMesh />}
        <gridHelper args={[10, 10]} />
      </Canvas>
    </div>
  );
}
