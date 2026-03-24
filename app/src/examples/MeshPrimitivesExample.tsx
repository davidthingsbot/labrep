'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import {
  point3d,
  vec3d,
  Z_AXIS_3D,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  revolve,
  solidVolume,
  solidToMesh,
  meshTriangleCount,
} from '@labrep/generation';
import type { Mesh } from '@labrep/generation';
import { meshToBufferGeometry } from '@/lib/mesh-to-three';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Build a Three.js BufferGeometry of line segments showing vertex normals. */
function buildNormalsGeometry(mesh: Mesh, normalLength: number = 0.3): THREE.BufferGeometry {
  const verts = mesh.vertices;
  const norms = mesh.normals;
  const numVerts = verts.length / 3;
  const positions = new Float32Array(numVerts * 6); // 2 points per normal (start + end)

  for (let i = 0; i < numVerts; i++) {
    const vx = verts[i * 3], vy = verts[i * 3 + 1], vz = verts[i * 3 + 2];
    const nx = norms[i * 3], ny = norms[i * 3 + 1], nz = norms[i * 3 + 2];
    positions[i * 6]     = vx;
    positions[i * 6 + 1] = vy;
    positions[i * 6 + 2] = vz;
    positions[i * 6 + 3] = vx + nx * normalLength;
    positions[i * 6 + 4] = vy + ny * normalLength;
    positions[i * 6 + 5] = vz + nz * normalLength;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/** Make a box solid and tessellate it */
function makeBoxMesh(w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(-hw, -hh, 0), point3d(hw, -hh, 0),
    point3d(hw, hh, 0), point3d(-hw, hh, 0),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  const ext = extrude(wire, vec3d(0, 0, 1), d);
  if (!ext.success) return null;
  const mesh = solidToMesh(ext.result!.solid);
  if (!mesh.success) return null;
  return { mesh: mesh.result!, volume: solidVolume(ext.result!.solid) };
}

/** Make a hexagonal prism and tessellate it */
function makeHexMesh(radius: number, depth: number) {
  const pts: ReturnType<typeof point3d>[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI;
    pts.push(point3d(radius * Math.cos(angle), radius * Math.sin(angle), 0));
  }
  const edges = pts.map((p, i) =>
    makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  const ext = extrude(wire, vec3d(0, 0, 1), depth);
  if (!ext.success) return null;
  const mesh = solidToMesh(ext.result!.solid);
  if (!mesh.success) return null;
  return { mesh: mesh.result!, volume: solidVolume(ext.result!.solid) };
}

/** Make a cylinder via revolve and tessellate it */
function makeCylinderMesh(r: number, h: number) {
  try {
    const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(r, 0, h), point3d(0, 0, h)];
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    if (!rev.success) return null;
    const mesh = solidToMesh(rev.result!.solid);
    if (!mesh.success) return null;
    return { mesh: mesh.result!, volume: solidVolume(rev.result!.solid) };
  } catch { return null; }
}

/** Make a cone via revolve and tessellate it */
function makeConeMesh(r: number, h: number) {
  try {
    const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(0, 0, h)];
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    if (!rev.success) return null;
    const mesh = solidToMesh(rev.result!.solid);
    if (!mesh.success) return null;
    return { mesh: mesh.result!, volume: solidVolume(rev.result!.solid) };
  } catch { return null; }
}

/** Make a sphere-ish shape via revolving a polygon semicircle */
function makeSphereMesh(r: number) {
  try {
    const n = 12;
    const pts = [point3d(0, 0, -r)];
    for (let i = 0; i <= n; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / n;
      const x = r * Math.cos(angle);
      if (x > 0.01) {
        pts.push(point3d(x, 0, r * Math.sin(angle)));
      }
    }
    pts.push(point3d(0, 0, r));
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    if (!rev.success) return null;
    const mesh = solidToMesh(rev.result!.solid);
    if (!mesh.success) return null;
    return { mesh: mesh.result!, volume: solidVolume(rev.result!.solid) };
  } catch { return null; }
}

/**
 * Mesh Primitives — Six solid primitives rendered as shaded meshes.
 * Top row: box, hexagonal prism (extruded, all planar).
 * Bottom row: cylinder, cone, sphere (revolved, curved surfaces).
 * Dimensions animate to show live tessellation.
 */
export function MeshPrimitivesExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;
  const [showNormals, setShowNormals] = useState(false);

  // Toggle normals with 'n' key
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'n' || e.key === 'N') setShowNormals(prev => !prev);
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Animate dimensions with integer harmonics
  const boxW = 3 + Math.sin(t);
  const boxH = 3 + Math.cos(2 * t);
  const boxD = 3 + 0.5 * Math.sin(t);

  const hexR = 1.8 + 0.5 * Math.cos(t);
  const hexD = 3 + Math.sin(2 * t);

  const cylR = 1.5 + 0.5 * Math.sin(t);
  const cylH = 3 + Math.sin(2 * t);

  const coneR = 2 + 0.5 * Math.cos(t);
  const coneH = 3 + Math.sin(2 * t);

  const sphR = 2 + 0.5 * Math.sin(t);

  const box = makeBoxMesh(boxW, boxH, boxD);
  const hex = makeHexMesh(hexR, hexD);
  const cyl = makeCylinderMesh(cylR, cylH);
  const cone = makeConeMesh(coneR, coneH);
  const sph = makeSphereMesh(sphR);

  /* eslint-disable react-hooks/exhaustive-deps */
  const boxGeo = useMemo(() => box ? meshToBufferGeometry(box.mesh) : null, [box?.mesh.vertices]);
  const hexGeo = useMemo(() => hex ? meshToBufferGeometry(hex.mesh) : null, [hex?.mesh.vertices]);
  const cylGeo = useMemo(() => cyl ? meshToBufferGeometry(cyl.mesh) : null, [cyl?.mesh.vertices]);
  const coneGeo = useMemo(() => cone ? meshToBufferGeometry(cone.mesh) : null, [cone?.mesh.vertices]);
  const sphGeo = useMemo(() => sph ? meshToBufferGeometry(sph.mesh) : null, [sph?.mesh.vertices]);

  const boxNormsGeo = useMemo(() => box ? buildNormalsGeometry(box.mesh) : null, [box?.mesh.vertices]);
  const hexNormsGeo = useMemo(() => hex ? buildNormalsGeometry(hex.mesh) : null, [hex?.mesh.vertices]);
  const cylNormsGeo = useMemo(() => cyl ? buildNormalsGeometry(cyl.mesh) : null, [cyl?.mesh.vertices]);
  const coneNormsGeo = useMemo(() => cone ? buildNormalsGeometry(cone.mesh) : null, [cone?.mesh.vertices]);
  const sphNormsGeo = useMemo(() => sph ? buildNormalsGeometry(sph.mesh) : null, [sph?.mesh.vertices]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const normalsMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#ff4444' }), []);

  const mat = (color: string) => (
    <meshStandardMaterial color={color} side={THREE.DoubleSide} />
  );

  const normalsViz = (geo: THREE.BufferGeometry | null) =>
    showNormals && geo ? <lineSegments geometry={geo} material={normalsMat} /> : null;

  return (
    <group>
      {/* Top row: extruded (planar) */}
      <group position={[-5, 0, -boxD / 2]}>
        {boxGeo && <mesh geometry={boxGeo}>{mat('#4ade80')}</mesh>}
        {normalsViz(boxNormsGeo)}
        <BillboardText position={[0, 0, boxD + 2]} fontSize={0.35} color="#4ade80">
          Box {boxW.toFixed(1)}x{boxH.toFixed(1)}x{boxD.toFixed(1)}
        </BillboardText>
        <BillboardText position={[0, 0, boxD + 1.3]} fontSize={0.25} color="#4ade80">
          {box ? `${meshTriangleCount(box.mesh)} tris — V=${box.volume.toFixed(1)}` : '—'}
        </BillboardText>
      </group>

      <group position={[5, 0, -hexD / 2]}>
        {hexGeo && <mesh geometry={hexGeo}>{mat('#f97316')}</mesh>}
        {normalsViz(hexNormsGeo)}
        <BillboardText position={[0, 0, hexD + 2]} fontSize={0.35} color="#f97316">
          Hexagon r={hexR.toFixed(1)}
        </BillboardText>
        <BillboardText position={[0, 0, hexD + 1.3]} fontSize={0.25} color="#f97316">
          {hex ? `${meshTriangleCount(hex.mesh)} tris — V=${hex.volume.toFixed(1)}` : '—'}
        </BillboardText>
      </group>

      {/* Bottom row: revolved (curved) — smooth shading for curved surfaces */}
      <group position={[-8, -7, -cylH / 2]}>
        {cylGeo && <mesh geometry={cylGeo}>{mat('#60a5fa')}</mesh>}
        {normalsViz(cylNormsGeo)}
        <BillboardText position={[0, 0, cylH + 2]} fontSize={0.35} color="#60a5fa">
          Cylinder r={cylR.toFixed(1)} h={cylH.toFixed(1)}
        </BillboardText>
        <BillboardText position={[0, 0, cylH + 1.3]} fontSize={0.25} color="#60a5fa">
          {cyl ? `${meshTriangleCount(cyl.mesh)} tris — V=${cyl.volume.toFixed(1)}` : '—'}
        </BillboardText>
      </group>

      <group position={[0, -7, -coneH / 2]}>
        {coneGeo && <mesh geometry={coneGeo}>{mat('#facc15')}</mesh>}
        {normalsViz(coneNormsGeo)}
        <BillboardText position={[0, 0, coneH + 2]} fontSize={0.35} color="#facc15">
          Cone r={coneR.toFixed(1)} h={coneH.toFixed(1)}
        </BillboardText>
        <BillboardText position={[0, 0, coneH + 1.3]} fontSize={0.25} color="#facc15">
          {cone ? `${meshTriangleCount(cone.mesh)} tris — V=${cone.volume.toFixed(1)}` : '—'}
        </BillboardText>
      </group>

      <group position={[8, -7, 0]}>
        {sphGeo && <mesh geometry={sphGeo}>{mat('#a78bfa')}</mesh>}
        {normalsViz(sphNormsGeo)}
        <BillboardText position={[0, 0, sphR + 2]} fontSize={0.35} color="#a78bfa">
          Sphere r={sphR.toFixed(1)}
        </BillboardText>
        <BillboardText position={[0, 0, sphR + 1.3]} fontSize={0.25} color="#a78bfa">
          {sph ? `${meshTriangleCount(sph.mesh)} tris — V=${sph.volume.toFixed(1)}` : '—'}
        </BillboardText>
      </group>

      {/* Toggle hint */}
      <BillboardText position={[0, 5, 0]} fontSize={0.3} color="#888888">
        {showNormals ? 'Normals ON (press N to hide)' : 'Press N to show vertex normals'}
      </BillboardText>
    </group>
  );
}
