'use client';

import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  vec3d,
  plane,
  makeLine3D,
  makeCircle3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  orientEdge,
  makeWire,
  extrude,
  solidVolume,
  solidToStep,
  createStepModelBuilder,
  writeStep,
  parseStep,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

function sampleCircle(cx: number, cy: number, cz: number, r: number): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t), cz]);
  }
  return pts;
}

function buildExtrudedBox(w: number, h: number, depth: number) {
  try {
    const hw = w / 2, hh = h / 2;
    const corners = [
      point3d(-hw, -hh, 0), point3d(hw, -hh, 0),
      point3d(hw, hh, 0), point3d(-hw, hh, 0),
    ];
    const edges = corners.map((c, i) =>
      makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    return extrude(wire, vec3d(0, 0, 1), depth);
  } catch { return null; }
}

function buildExtrudedCylinder(r: number, depth: number) {
  try {
    const circlePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1), vec3d(1, 0, 0));
    const circle = makeCircle3D(circlePlane, r).result!;
    const edge = makeEdgeFromCurve(circle).result!;
    const wire = makeWire([orientEdge(edge, true)]).result!;
    return extrude(wire, vec3d(0, 0, 1), depth);
  } catch { return null; }
}

function stepRoundTrip(solid: Parameters<typeof solidToStep>[0]) {
  const builder = createStepModelBuilder();
  solidToStep(solid, builder);
  const model = builder.build();
  const text = writeStep(model);
  const parsed = parseStep(text);
  return {
    entityCount: model.entities.size,
    textLength: text.length,
    roundTripOk: parsed.success,
    parsedEntityCount: parsed.success ? parsed.result!.entities.size : 0,
  };
}

/**
 * Extrude STEP Round-Trip — box and cylinder with animated dimensions,
 * exported to STEP and parsed back with live verification stats.
 */
export function ExtrudeStepExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;
  const boxW = 4 + 2 * Math.sin(t);
  const boxH = 3 + 1.5 * Math.cos(t);
  const boxD = 5 + 2 * Math.sin(2 * t);
  const cylR = 2 + 1 * Math.cos(t);
  const cylD = 4 + 2 * Math.cos(2 * t);

  // Build solids
  const boxResult = buildExtrudedBox(boxW, boxH, boxD);
  const cylResult = buildExtrudedCylinder(cylR, cylD);

  // STEP round-trips
  let boxStep: ReturnType<typeof stepRoundTrip> | null = null;
  let cylStep: ReturnType<typeof stepRoundTrip> | null = null;
  let boxVol = 0;
  let cylVol = 0;

  if (boxResult?.success) {
    try {
      boxStep = stepRoundTrip(boxResult.result!.solid);
      boxVol = solidVolume(boxResult.result!.solid);
    } catch { /* edge cases */ }
  }
  if (cylResult?.success) {
    try {
      cylStep = stepRoundTrip(cylResult.result!.solid);
      cylVol = solidVolume(cylResult.result!.solid);
    } catch { /* edge cases */ }
  }

  // Box wireframe
  const hw = boxW / 2, hh = boxH / 2;
  const boxLines: P3[][] = [
    // Bottom
    [[-hw, -hh, 0], [hw, -hh, 0]], [[hw, -hh, 0], [hw, hh, 0]],
    [[hw, hh, 0], [-hw, hh, 0]], [[-hw, hh, 0], [-hw, -hh, 0]],
    // Top
    [[-hw, -hh, boxD], [hw, -hh, boxD]], [[hw, -hh, boxD], [hw, hh, boxD]],
    [[hw, hh, boxD], [-hw, hh, boxD]], [[-hw, hh, boxD], [-hw, -hh, boxD]],
    // Verticals
    [[-hw, -hh, 0], [-hw, -hh, boxD]], [[hw, -hh, 0], [hw, -hh, boxD]],
    [[hw, hh, 0], [hw, hh, boxD]], [[-hw, hh, 0], [-hw, hh, boxD]],
  ];

  return (
    <group>
      {/* Box (left) */}
      <group position={[-6, 0, 0]}>
        {boxLines.map((pts, i) => (
          <Line key={`b-${i}`} points={pts} color="#4ade80" lineWidth={1.5} />
        ))}
        <Sphere args={[0.15]} position={[0, 0, boxD + 1]}>
          <meshBasicMaterial color={boxStep?.roundTripOk ? '#4ade80' : '#ef4444'} />
        </Sphere>
        <BillboardText position={[0, 0, boxD + 2]} fontSize={0.35} color="#4ade80">
          Box {boxW.toFixed(1)}x{boxH.toFixed(1)}x{boxD.toFixed(1)} V={boxVol.toFixed(0)}
        </BillboardText>
        <BillboardText position={[0, 0, boxD + 1.3]} fontSize={0.3} color="#c084fc">
          STEP: {boxStep ? boxStep.entityCount : '--'} entities, {boxStep ? boxStep.textLength.toLocaleString() : '--'} chars
        </BillboardText>
      </group>

      {/* Cylinder (right) */}
      <group position={[6, 0, 0]}>
        <Line points={sampleCircle(0, 0, 0, cylR)} color="#60a5fa" lineWidth={1.5} />
        <Line points={sampleCircle(0, 0, cylD, cylR)} color="#60a5fa" lineWidth={1.5} />
        {[0, 12, 24, 36].map(j => {
          const a = (j / 48) * 2 * Math.PI;
          const x = cylR * Math.cos(a), y = cylR * Math.sin(a);
          return <Line key={`cv-${j}`} points={[[x, y, 0], [x, y, cylD]]} color="#60a5fa" lineWidth={1.5} />;
        })}
        <Sphere args={[0.15]} position={[0, 0, cylD + 1]}>
          <meshBasicMaterial color={cylStep?.roundTripOk ? '#4ade80' : '#ef4444'} />
        </Sphere>
        <BillboardText position={[0, 0, cylD + 2]} fontSize={0.35} color="#60a5fa">
          Cylinder r={cylR.toFixed(1)} h={cylD.toFixed(1)} V={cylVol.toFixed(0)}
        </BillboardText>
        <BillboardText position={[0, 0, cylD + 1.3]} fontSize={0.3} color="#c084fc">
          STEP: {cylStep ? cylStep.entityCount : '--'} entities, {cylStep ? cylStep.textLength.toLocaleString() : '--'} chars
        </BillboardText>
      </group>

      {/* Footer */}
      <BillboardText position={[0, 0, -1.5]} fontSize={0.3} color="#666">
        Extruded solids to STEP and back — live round-trip
      </BillboardText>
    </group>
  );
}
