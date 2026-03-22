'use client';

import { useMemo } from 'react';
import { Line, Edges } from '@react-three/drei';
import {
  point3d,
  boundingBox,
  emptyBoundingBox,
  addPoint,
  contains,
  center,
  size,
  intersects,
  isEmpty,
} from '@labrep/generation';
import { PointViz , BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Render a wireframe box from min/max corners. */
function WireBox({ min, max, color }: {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  color: string;
}) {
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  const sx = max.x - min.x;
  const sy = max.y - min.y;
  const sz = max.z - min.z;

  if (sx <= 0 || sy <= 0 || sz <= 0) return null;

  return (
    <mesh position={[cx, cy, cz]}>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial color={color} wireframe transparent opacity={0.6} />
    </mesh>
  );
}

/** Example demonstrating all BoundingBox3D functions. */
export function BoundingBoxExample({ animationAngle }: ExampleProps) {
  // boundingBox — create from min/max
  const box1 = useMemo(
    () => boundingBox(point3d(-1, -0.5, -0.5), point3d(1, 1, 0.5)),
    [],
  );

  // emptyBoundingBox + addPoint — build incrementally
  const animatedBox = useMemo(() => {
    let b = emptyBoundingBox();
    b = addPoint(b, point3d(1.5, -1, -0.3));
    b = addPoint(b, point3d(3, 0.5, 0.3));
    return b;
  }, []);

  // Add an animated point to grow the box
  const animPt = point3d(
    2 + Math.cos(animationAngle) * 1.2,
    -0.5 + Math.sin(animationAngle) * 1.5,
    Math.sin(animationAngle * 0.7) * 0.5,
  );
  const grownBox = addPoint(animatedBox, animPt);

  // center + size
  const c1 = center(box1);
  const s1 = size(box1);
  const cGrown = center(grownBox);

  // contains — test a point
  const testPt = point3d(0, 0, 0);
  const inside1 = contains(box1, testPt);
  const outsidePt = point3d(5, 5, 5);
  const outside1 = contains(box1, outsidePt);

  // intersects — check if boxes overlap
  const doIntersect = intersects(box1, grownBox);

  // isEmpty
  const emptyB = emptyBoundingBox();
  const emptyCheck = isEmpty(emptyB);
  const notEmptyCheck = isEmpty(box1);

  return (
    <group>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.4} color="white">
        Bounding Boxes
      </BillboardText>

      {/* Box 1 — static */}
      <WireBox min={box1.min} max={box1.max} color="cyan" />
      <PointViz point={c1} color="cyan" label="center" size={0.04} />

      {/* Grown box — animated */}
      <WireBox min={grownBox.min} max={grownBox.max} color="magenta" />
      <PointViz point={cGrown} color="magenta" size={0.03} />

      {/* Animated point being added */}
      <PointViz point={animPt} color="yellow" label="addPoint" size={0.06} />

      {/* contains — test points */}
      <PointViz
        point={testPt}
        color={inside1 ? '#00ff88' : 'red'}
        label={inside1 ? 'inside' : 'outside'}
        size={0.05}
      />

      {/* intersects indicator */}
      <BillboardText
        position={[1, 2, 0]}
        fontSize={0.12}
        color={doIntersect ? '#00ff88' : 'red'}
      >
        {doIntersect ? 'boxes intersect' : 'no intersection'}
      </BillboardText>

      {/* Info */}
      <BillboardText position={[0, -2.5, 0]} fontSize={0.1} color="gray">
        {`box1 size = (${s1.x.toFixed(1)}, ${s1.y.toFixed(1)}, ${s1.z.toFixed(1)}) | isEmpty(empty) = ${emptyCheck} | isEmpty(box1) = ${notEmptyCheck}`}
      </BillboardText>
      <BillboardText position={[0, -3, 0]} fontSize={0.1} color="gray">
        boundingBox, emptyBoundingBox, addPoint, contains, center, size, intersects, isEmpty
      </BillboardText>
    </group>
  );
}
