'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Mesh as LabrepMesh } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';
import { DemoScene } from './DemoScene';
import { ExampleRenderer } from './ExampleRenderer';
import { useAnimationLoop } from '@/hooks/useAnimationLoop';

/** Props for the Viewer component. */
interface ViewerProps {
  /** Optional labrep mesh to render; falls back to example or demo scene when absent. */
  mesh?: LabrepMesh;
  /** Optional example ID to render instead of DemoScene. */
  exampleId?: string;
  /** Whether animation is enabled (default: true) */
  animationEnabled?: boolean;
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

/** Inner component that uses animation hook (must be inside Canvas). */
function ViewerContent({ mesh, exampleId, animationEnabled = true }: ViewerProps) {
  const animationAngle = useAnimationLoop(10000, animationEnabled);

  if (mesh) {
    return <GeneratedMesh mesh={mesh} />;
  }

  if (exampleId) {
    return <ExampleRenderer exampleId={exampleId} animationAngle={animationAngle} />;
  }

  return <DemoScene />;
}

/** 3D viewport that renders a labrep mesh, a selected example, or a demo showcase. */
export function Viewer({ mesh, exampleId, animationEnabled = true }: ViewerProps = {}) {
  return (
    <div className="w-full h-full" data-testid="viewer-container">
      <Canvas camera={{ position: [6, 4, 6] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} />
        <OrbitControls />
        <ViewerContent mesh={mesh} exampleId={exampleId} animationEnabled={animationEnabled} />
        <gridHelper args={[20, 20]} />
      </Canvas>
    </div>
  );
}
