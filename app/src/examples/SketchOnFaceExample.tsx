'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  getPlaneFromFace,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

function makeRectWire(w: number, h: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(-hw, -hh, 0), point3d(hw, -hh, 0),
    point3d(hw, hh, 0), point3d(-hw, hh, 0),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  return makeWireFromEdges(edges).result!;
}

/**
 * Sketch on Face — cycles through the 6 faces of a box,
 * showing the extracted plane (normal arrow + face outline), and
 * whether the face is planar (green) or not (red).
 */
export function SketchOnFaceExample({ animationAngle }: ExampleProps) {
  // Build the box once
  const data = useMemo(() => {
    const wire = makeRectWire(6, 4);
    const result = extrude(wire, vec3d(0, 0, 1), 8);
    if (!result.success) return null;

    const { topFace, bottomFace, sideFaces } = result.result!;
    const allFaces = [topFace, bottomFace, ...sideFaces];

    // For each face, try to extract the plane
    const faceData = allFaces.map((face, idx) => {
      const planeResult = getPlaneFromFace(face);
      const isPlanar = planeResult.success;
      const facePlane = isPlanar ? planeResult.result! : null;

      // Get face boundary points for wireframe
      const pts: P3[] = [];
      for (const oe of face.outerWire.edges) {
        const curve = oe.edge.curve;
        if (curve.type === 'line3d') {
          const s = oe.forward ? curve.startPoint : curve.endPoint;
          pts.push([s.x, s.y, s.z]);
        }
      }
      if (pts.length > 0) pts.push(pts[0]); // close

      const labels = ['Top', 'Bottom', 'Side 1', 'Side 2', 'Side 3', 'Side 4'];

      return {
        face,
        isPlanar,
        facePlane,
        boundaryPts: pts,
        label: labels[idx] ?? `Face ${idx}`,
      };
    });

    return { faceData };
  }, []);

  if (!data) return null;

  // Cycle through faces — use smooth interpolation to dwell on each face
  const t = (0.5 + 0.5 * Math.sin(animationAngle)) * 0.999;
  const faceIdx = Math.floor(t * data.faceData.length);
  const current = data.faceData[faceIdx];

  return (
    <group>
      {/* All face boundaries (dim) */}
      {data.faceData.map((fd, i) => (
        fd.boundaryPts.length > 2 && (
          <Line
            key={`face-${i}`}
            points={fd.boundaryPts}
            color={i === faceIdx ? '#facc15' : '#444'}
            lineWidth={i === faceIdx ? 3 : 1}
          />
        )
      ))}

      {/* Selected face plane normal */}
      {current.facePlane && (() => {
        const o = current.facePlane.origin;
        const n = current.facePlane.normal;
        const tip: P3 = [o.x + n.x * 3, o.y + n.y * 3, o.z + n.z * 3];
        return (
          <>
            <Line
              points={[[o.x, o.y, o.z], tip]}
              color="#22d3ee"
              lineWidth={3}
            />
            <Sphere args={[0.15]} position={tip}>
              <meshBasicMaterial color="#22d3ee" />
            </Sphere>
          </>
        );
      })()}

      {/* Status */}
      <BillboardText position={[0, 0, 11]} fontSize={0.5} color={current.isPlanar ? '#4ade80' : '#ef4444'}>
        {current.label}: {current.isPlanar ? 'Planar ✓' : 'Not planar ✗'}
      </BillboardText>

      {current.facePlane && (
        <BillboardText position={[0, 0, 10]} fontSize={0.35} color="#22d3ee">
          Normal: ({current.facePlane.normal.x.toFixed(1)}, {current.facePlane.normal.y.toFixed(1)}, {current.facePlane.normal.z.toFixed(1)})
        </BillboardText>
      )}

      <BillboardText position={[0, 0, -1.5]} fontSize={0.35} color="#666">
        Cycling through {data.faceData.length} faces
      </BillboardText>
    </group>
  );
}
