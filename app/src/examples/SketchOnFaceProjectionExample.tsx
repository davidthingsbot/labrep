'use client';

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import {
  point3d,
  vec3d,
  plane,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  projectEdgeToSketch,
  sketchToWorld,
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
 * Sketch-on-Face Projection — shows edge projection onto a tilting plane.
 * A box's top face edges are projected onto a separate plane that tilts
 * with the animation. Lines foreshorten as the plane tilts.
 */
export function SketchOnFaceProjectionExample({ animationAngle }: ExampleProps) {
  const tiltAngle = Math.sin(animationAngle) * 0.4; // ±0.4 radians

  const data = useMemo(() => {
    const wire = makeRectWire(6, 4);
    const result = extrude(wire, vec3d(0, 0, 1), 6);
    if (!result.success) return null;

    return { result: result.result! };
  }, []);

  if (!data) return null;

  const topFace = data.result.topFace;

  // Create a tilted projection plane above the box
  const cosT = Math.cos(tiltAngle);
  const sinT = Math.sin(tiltAngle);
  const projPlane = plane(
    point3d(0, 0, 10),
    vec3d(0, -sinT, cosT),    // tilted normal
    vec3d(1, 0, 0),            // xAxis stays horizontal
  );

  // Projection plane outline (in 3D)
  // yAxis = cross(normal, xAxis) = cross((0,-sinT,cosT), (1,0,0)) = (0, cosT, sinT)
  const planeHW = 5, planeHH = 4;
  const yAxisY = cosT;
  const yAxisZ = sinT;

  const planeCorners: P3[] = [
    [-planeHW, yAxisY * (-planeHH), 10 + yAxisZ * (-planeHH)],
    [planeHW, yAxisY * (-planeHH), 10 + yAxisZ * (-planeHH)],
    [planeHW, yAxisY * planeHH, 10 + yAxisZ * planeHH],
    [-planeHW, yAxisY * planeHH, 10 + yAxisZ * planeHH],
  ].map(([x, y, z]) => [x, y, z] as P3);
  planeCorners.push(planeCorners[0]);

  // Project top face edges onto the tilted plane
  const projectedEdges: { pts: P3[]; success: boolean; error?: string }[] = [];
  for (const oe of topFace.outerWire.edges) {
    const result = projectEdgeToSketch(oe.edge, projPlane);
    if (result.success && result.result!.type === 'line') {
      const line2d = result.result!;
      const start3d = sketchToWorld(projPlane, line2d.startPoint);
      const end3d = sketchToWorld(projPlane, line2d.endPoint);
      projectedEdges.push({
        pts: [[start3d.x, start3d.y, start3d.z], [end3d.x, end3d.y, end3d.z]],
        success: true,
      });
    } else {
      projectedEdges.push({ pts: [], success: false, error: result.error });
    }
  }

  // Projection rays (dashed lines from source to projected)
  const sourceEdgePts: P3[][] = [];
  for (const oe of topFace.outerWire.edges) {
    const c = oe.edge.curve;
    if (c.type === 'line3d') {
      sourceEdgePts.push([[c.startPoint.x, c.startPoint.y, c.startPoint.z],
                          [c.endPoint.x, c.endPoint.y, c.endPoint.z]]);
    }
  }

  const tiltDeg = (tiltAngle * 180 / Math.PI).toFixed(1);
  const successCount = projectedEdges.filter(e => e.success).length;

  return (
    <group>
      {/* Box wireframe (dim) */}
      {(() => {
        const edges: P3[][] = [];
        for (const face of data.result.solid.outerShell.faces) {
          for (const oe of face.outerWire.edges) {
            const c = oe.edge.curve;
            if (c.type === 'line3d') {
              edges.push([[c.startPoint.x, c.startPoint.y, c.startPoint.z],
                          [c.endPoint.x, c.endPoint.y, c.endPoint.z]]);
            }
          }
        }
        return edges.map((pts, i) => (
          <Line key={`box-${i}`} points={pts} color="#444" lineWidth={1} />
        ));
      })()}

      {/* Source edges (top face, bright) */}
      {sourceEdgePts.map((pts, i) => (
        <Line key={`src-${i}`} points={pts} color="#facc15" lineWidth={2} />
      ))}

      {/* Projection plane outline */}
      <Line points={planeCorners} color="#60a5fa" lineWidth={2} />

      {/* Projected edges on the tilted plane */}
      {projectedEdges.map((e, i) => (
        e.success && e.pts.length === 2 && (
          <Line key={`proj-${i}`} points={e.pts} color="#4ade80" lineWidth={2.5} />
        )
      ))}

      {/* Projection rays (connecting source to projected) */}
      {projectedEdges.map((e, i) => {
        if (!e.success || !sourceEdgePts[i]) return null;
        const srcMid: P3 = [
          (sourceEdgePts[i][0][0] + sourceEdgePts[i][1][0]) / 2,
          (sourceEdgePts[i][0][1] + sourceEdgePts[i][1][1]) / 2,
          (sourceEdgePts[i][0][2] + sourceEdgePts[i][1][2]) / 2,
        ];
        const projMid: P3 = [
          (e.pts[0][0] + e.pts[1][0]) / 2,
          (e.pts[0][1] + e.pts[1][1]) / 2,
          (e.pts[0][2] + e.pts[1][2]) / 2,
        ];
        return <Line key={`ray-${i}`} points={[srcMid, projMid]} color="#555" lineWidth={1} />;
      })}

      {/* Labels */}
      <BillboardText position={[0, 0, 13]} fontSize={0.45} color="#60a5fa">
        Projection plane tilt: {tiltDeg}°
      </BillboardText>
      <BillboardText position={[0, 0, 12.2]} fontSize={0.35} color="#4ade80">
        {successCount}/{sourceEdgePts.length} edges projected
      </BillboardText>
    </group>
  );
}
