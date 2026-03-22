'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Mesh as LabrepMesh } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';
import { DemoScene } from './DemoScene';

/** Props for the Viewer component. */
interface ViewerProps {
  /** Optional labrep mesh to render; falls back to a demo scene when absent. */
  mesh?: LabrepMesh;
}

/** Internal helper that renders a labrep mesh as a Three.js mesh object. */
function GeneratedMesh({ mesh }: { mesh: LabrepMesh }) {
  const geometry = useMemo(() => meshToBufferGeometry(mesh), [mesh]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}

/** 3D viewport that renders a labrep mesh or a demo showcase of all geometry types. */
export function Viewer({ mesh }: ViewerProps = {}) {
  return (
    <div className="w-full h-full" data-testid="viewer-container">
      <Canvas camera={{ position: [6, 4, 6] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} />
        <OrbitControls />
        {mesh ? <GeneratedMesh mesh={mesh} /> : <DemoScene />}
        <gridHelper args={[20, 20]} />
      </Canvas>
    </div>
  );
}
