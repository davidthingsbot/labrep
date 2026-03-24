'use client';

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import {
  point3d,
  point2d,
  vec3d,
  makeLine3D,
  makeCircle2D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  extrude,
  solidVolume,
  createSketchOnFace,
  addElement,
  findProfiles,
  liftProfile2DToProfile3D,
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

function sampleCircle(cx: number, cy: number, cz: number, r: number, n: number): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t), cz]);
  }
  return pts;
}

/**
 * Sketch-on-Face Workflow — multi-feature: box + cylinder from top face.
 * The cylinder radius animates, showing how a sketch-on-face profile
 * changes the second feature in real time.
 */
export function SketchOnFaceWorkflowExample({ animationAngle }: ExampleProps) {
  // Animate the circle radius
  const circleR = 1 + 1.2 * Math.sin(animationAngle);
  const cylHeight = 4;

  // Build box once
  const boxData = useMemo(() => {
    const wire = makeRectWire(6, 6);
    const result = extrude(wire, vec3d(0, 0, 1), 5);
    if (!result.success) return null;

    // Box wireframe
    const edges: P3[][] = [];
    for (const face of result.result!.solid.outerShell.faces) {
      for (const oe of face.outerWire.edges) {
        const c = oe.edge.curve;
        if (c.type === 'line3d') {
          edges.push([[c.startPoint.x, c.startPoint.y, c.startPoint.z],
                      [c.endPoint.x, c.endPoint.y, c.endPoint.z]]);
        }
      }
    }

    return {
      result: result.result!,
      edges,
      volume: solidVolume(result.result!.solid),
    };
  }, []);

  if (!boxData) return null;

  // Build cylinder from sketch on top face (re-computed per frame for animated radius)
  const cylWireframe: P3[][] = [];
  let cylVolume = 0;
  let cylSuccess = false;

  try {
    const topFace = boxData.result.topFace;
    const sketchResult = createSketchOnFace(topFace);
    if (sketchResult.success) {
      const circle = makeCircle2D(point2d(0, 0), circleR);
      if (circle.success) {
        const sketch = addElement(sketchResult.result!, circle.result!, false);
        const profiles = findProfiles(sketch);

        if (profiles.length > 0) {
          // Find the circle profile
          const circleProfile = profiles.find(p =>
            p.outer.curves.length === 1 && p.outer.curves[0].type === 'circle'
          );

          if (circleProfile) {
            const liftResult = liftProfile2DToProfile3D(circleProfile, sketch.plane);
            if (liftResult.success) {
              const cylResult = extrude(liftResult.result!.outerWire, vec3d(0, 0, 1), cylHeight);
              if (cylResult.success) {
                cylSuccess = true;
                cylVolume = solidVolume(cylResult.result!.solid);

                // Cylinder wireframe: circles at top and bottom + vertical lines
                const baseZ = 5; // top of box
                for (let i = 0; i <= 3; i++) {
                  const z = baseZ + (i / 3) * cylHeight;
                  cylWireframe.push(sampleCircle(0, 0, z, circleR, 48));
                }
                for (let i = 0; i < 8; i++) {
                  const t = (i / 8) * 2 * Math.PI;
                  const x = circleR * Math.cos(t), y = circleR * Math.sin(t);
                  cylWireframe.push([[x, y, baseZ], [x, y, baseZ + cylHeight]]);
                }
              }
            }
          }
        }
      }
    }
  } catch { /* animation may produce edge cases */ }

  return (
    <group>
      {/* Box wireframe */}
      {boxData.edges.map((pts, i) => (
        <Line key={`box-${i}`} points={pts} color="#4ade80" lineWidth={1.5} />
      ))}

      {/* Top face highlight */}
      <Line
        points={[[-3, -3, 5], [3, -3, 5], [3, 3, 5], [-3, 3, 5], [-3, -3, 5]]}
        color="#facc15"
        lineWidth={2}
      />

      {/* Sketch circle on top face */}
      <Line
        points={sampleCircle(0, 0, 5.01, circleR, 48)}
        color="#22d3ee"
        lineWidth={2}
      />

      {/* Cylinder wireframe */}
      {cylWireframe.map((pts, i) => (
        <Line key={`cyl-${i}`} points={pts} color="#60a5fa" lineWidth={1.5} />
      ))}

      {/* Labels */}
      <BillboardText position={[0, 0, 12]} fontSize={0.45} color="#60a5fa">
        {cylSuccess
          ? `Cylinder r=${circleR.toFixed(1)} — V=${cylVolume.toFixed(1)}`
          : 'Cylinder: building...'}
      </BillboardText>
      <BillboardText position={[0, 0, 11]} fontSize={0.35} color="#4ade80">
        Box V={boxData.volume.toFixed(0)}
      </BillboardText>
      <BillboardText position={[0, 0, -1]} fontSize={0.3} color="#facc15">
        Sketch on top face → circle profile → extrude
      </BillboardText>
    </group>
  );
}
