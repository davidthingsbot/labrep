'use client';

import { useMemo } from 'react';
import type { Mesh as LabrepMesh } from '@labrep/generation';
import { Cone, Line, Sphere, Text } from '@react-three/drei';
import * as THREE from 'three';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';

// --- PointViz ---

interface PointVizProps {
  point: { x: number; y: number; z: number };
  color?: string;
  size?: number;
  label?: string;
}

export function PointViz({ point, color = 'yellow', size = 0.05, label }: PointVizProps) {
  return (
    <group position={[point.x, point.y, point.z]}>
      <Sphere args={[size, 8, 8]}>
        <meshStandardMaterial color={color} />
      </Sphere>
      {label && (
        <Text position={[0, size + 0.1, 0]} fontSize={0.1} color={color}>
          {label}
        </Text>
      )}
    </group>
  );
}

// --- VectorViz ---

interface VectorVizProps {
  origin: { x: number; y: number; z: number };
  vector: { x: number; y: number; z: number };
  color?: string;
  label?: string;
}

export function VectorViz({ origin, vector, color = 'red', label }: VectorVizProps) {
  const start: [number, number, number] = [origin.x, origin.y, origin.z];
  const end: [number, number, number] = [
    origin.x + vector.x,
    origin.y + vector.y,
    origin.z + vector.z,
  ];

  const coneRotation = useMemo(() => {
    const dir = new THREE.Vector3(vector.x, vector.y, vector.z).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return [euler.x, euler.y, euler.z] as [number, number, number];
  }, [vector.x, vector.y, vector.z]);

  return (
    <group>
      <Line points={[start, end]} color={color} lineWidth={2} />
      <group position={end} rotation={coneRotation}>
        <Cone args={[0.03, 0.1, 8]}>
          <meshStandardMaterial color={color} />
        </Cone>
      </group>
      {label && (
        <Text position={end} fontSize={0.1} color={color}>
          {label}
        </Text>
      )}
    </group>
  );
}

// --- LineViz ---

interface LineVizProps {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  color?: string;
  label?: string;
}

export function LineViz({ start, end, color = 'cyan', label }: LineVizProps) {
  const points: [number, number, number][] = [
    [start.x, start.y, start.z],
    [end.x, end.y, end.z],
  ];
  const midpoint: [number, number, number] = [
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2,
  ];

  return (
    <group>
      <Line points={points} color={color} lineWidth={2} />
      {label && (
        <Text position={midpoint} fontSize={0.1} color={color}>
          {label}
        </Text>
      )}
    </group>
  );
}

// --- MeshViz ---

interface MeshVizProps {
  mesh: LabrepMesh;
  color?: string;
  wireframe?: boolean;
  label?: string;
}

export function MeshViz({ mesh, color = 'steelblue', wireframe = false, label }: MeshVizProps) {
  const geometry = useMemo(() => meshToBufferGeometry(mesh), [mesh]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} />
      </mesh>
      {wireframe && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={color} wireframe transparent opacity={0.3} />
        </mesh>
      )}
      {label && (
        <Text position={[0, 1.2, 0]} fontSize={0.15} color={color}>
          {label}
        </Text>
      )}
    </group>
  );
}
