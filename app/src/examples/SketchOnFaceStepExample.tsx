'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
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
  solidToStep,
  createStepModelBuilder,
  writeStep,
  parseStep,
  type Solid,
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

/** Export a solid to STEP and round-trip it */
function stepRoundTrip(solid: Solid) {
  const builder = createStepModelBuilder();
  solidToStep(solid, builder);
  const model = builder.build();
  const text = writeStep(model);
  const entityCount = model.entities.size;

  const parsed = parseStep(text);
  const roundTripOk = parsed.success;
  const parsedEntityCount = roundTripOk ? parsed.result!.entities.size : 0;

  return { text, entityCount, roundTripOk, parsedEntityCount, textLength: text.length };
}

/**
 * Sketch-on-Face STEP Round-Trip — creates a box, sketches a circle on its
 * top face to extrude a cylinder, then exports BOTH solids to STEP independently.
 * Displays live entity counts, text sizes, and round-trip verification for each.
 */
export function SketchOnFaceStepExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;
  const circleR = 1 + 1.2 * Math.sin(t);
  const cylHeight = 3 + 1 * Math.cos(2 * t);

  // Build box once (static)
  const boxData = useMemo(() => {
    const wire = makeRectWire(6, 6);
    const result = extrude(wire, vec3d(0, 0, 1), 5);
    if (!result.success) return null;

    // Box wireframe edges
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
      solid: result.result!.solid,
      volume: solidVolume(result.result!.solid),
    };
  }, []);

  if (!boxData) return null;

  // Box STEP data (static, computed once per meaningful change — but useMemo would
  // make it truly static; here it's cheap enough to recompute since it demonstrates live stats)
  let boxStep: ReturnType<typeof stepRoundTrip> | null = null;
  try {
    boxStep = stepRoundTrip(boxData.solid);
  } catch { /* ignore */ }

  // Build cylinder from sketch on top face (animated)
  const cylWireframe: P3[][] = [];
  let cylVolume = 0;
  let cylSuccess = false;
  let cylStep: ReturnType<typeof stepRoundTrip> | null = null;

  try {
    const topFace = boxData.result.topFace;
    const sketchResult = createSketchOnFace(topFace);
    if (sketchResult.success) {
      const circle = makeCircle2D(point2d(0, 0), circleR);
      if (circle.success) {
        const sketch = addElement(sketchResult.result!, circle.result!, false);
        const profiles = findProfiles(sketch);

        if (profiles.length > 0) {
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

                // STEP round-trip for cylinder
                cylStep = stepRoundTrip(cylResult.result!.solid);

                // Cylinder wireframe: circles at several heights + vertical lines
                const baseZ = 5;
                for (let i = 0; i <= 4; i++) {
                  const z = baseZ + (i / 4) * cylHeight;
                  cylWireframe.push(sampleCircle(0, 0, z, circleR, 48));
                }
                for (let i = 0; i < 8; i++) {
                  const a = (i / 8) * 2 * Math.PI;
                  const x = circleR * Math.cos(a), y = circleR * Math.sin(a);
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
      {/* Box wireframe (green) */}
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

      {/* Cylinder wireframe (blue) */}
      {cylWireframe.map((pts, i) => (
        <Line key={`cyl-${i}`} points={pts} color="#60a5fa" lineWidth={1.5} />
      ))}

      {/* Round-trip status indicators */}
      <Sphere args={[0.2]} position={[-4, 0, 13]}>
        <meshBasicMaterial color={boxStep?.roundTripOk ? '#4ade80' : '#ef4444'} />
      </Sphere>
      <Sphere args={[0.2]} position={[4, 0, 13]}>
        <meshBasicMaterial color={cylStep?.roundTripOk ? '#4ade80' : '#ef4444'} />
      </Sphere>

      {/* Entity count label */}
      <BillboardText position={[0, 0, 13]} fontSize={0.4} color="#c084fc">
        Box: {boxStep ? boxStep.entityCount : '--'} entities, Cylinder: {cylStep ? cylStep.entityCount : '--'} entities
      </BillboardText>

      {/* STEP text sizes */}
      <BillboardText position={[0, 0, 12.2]} fontSize={0.35} color="#94a3b8">
        STEP sizes — Box: {boxStep ? boxStep.textLength.toLocaleString() : '--'} chars, Cyl: {cylStep ? cylStep.textLength.toLocaleString() : '--'} chars
      </BillboardText>

      {/* Volumes */}
      <BillboardText position={[0, 0, 11.4]} fontSize={0.35} color="#4ade80">
        Box V={boxData.volume.toFixed(0)}
      </BillboardText>
      <BillboardText position={[0, 0, 10.7]} fontSize={0.35} color="#60a5fa">
        {cylSuccess
          ? `Cylinder r=${circleR.toFixed(1)} h=${cylHeight.toFixed(1)} — V=${cylVolume.toFixed(1)}`
          : 'Cylinder: building...'}
      </BillboardText>

      {/* Footer */}
      <BillboardText position={[0, 0, -1.5]} fontSize={0.3} color="#666">
        Two solids exported to STEP independently — live round-trip verification
      </BillboardText>
    </group>
  );
}
