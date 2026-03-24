'use client';

import { Line, Sphere } from '@react-three/drei';
import {
  point3d,
  Z_AXIS_3D,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  revolve,
  solidVolume,
  solidToStep,
  createStepModelBuilder,
  writeStep,
  parseStep,
} from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

type P3 = [number, number, number];

/** Build a revolved cylinder from a rectangle profile, export to STEP, and round-trip */
function buildRevolveStepData(r: number, h: number) {
  try {
    // Rectangle profile in XZ plane
    const p1 = point3d(0, 0, 0), p2 = point3d(r, 0, 0);
    const p3 = point3d(r, 0, h), p4 = point3d(0, 0, h);
    const edges = [
      makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
      makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
      makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
      makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
    ];
    const wire = makeWireFromEdges(edges).result!;
    const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    if (!result.success) return null;

    const solid = result.result!.solid;
    const volume = solidVolume(solid);

    // Export to STEP
    const builder = createStepModelBuilder();
    solidToStep(solid, builder);
    const stepModel = builder.build();
    const stepText = writeStep(stepModel);
    const entityCount = stepModel.entities.size;

    // Round-trip: parse the STEP text back
    const parsed = parseStep(stepText);
    const roundTripOk = parsed.success;
    const parsedEntityCount = roundTripOk ? parsed.result!.entities.size : 0;

    // Sample wireframe circles
    const circles: P3[][] = [];
    for (let i = 0; i <= 5; i++) {
      const z = (i / 5) * h;
      const pts: P3[] = [];
      for (let j = 0; j <= 48; j++) {
        const t = (j / 48) * 2 * Math.PI;
        pts.push([r * Math.cos(t), r * Math.sin(t), z]);
      }
      circles.push(pts);
    }

    // Profile outline in XZ plane
    const profile: P3[] = [[0, 0, 0], [r, 0, 0], [r, 0, h], [0, 0, h], [0, 0, 0]];

    return {
      circles,
      profile,
      volume,
      stepTextLength: stepText.length,
      entityCount,
      roundTripOk,
      parsedEntityCount,
    };
  } catch { return null; }
}

/**
 * Revolve STEP Round-Trip — builds a revolved cylinder with animated radius,
 * exports to STEP format, parses it back, and displays live statistics about
 * the serialisation process.
 */
export function RevolveStepExample({ animationAngle }: ExampleProps) {
  const t = animationAngle;
  const r = 2 + 1.2 * Math.sin(t);
  const h = 4 + 1.5 * Math.cos(2 * t);

  const data = buildRevolveStepData(r, h);

  return (
    <group>
      {/* Profile wire in XZ plane */}
      {data && <Line points={data.profile} color="#facc15" lineWidth={3} />}

      {/* Revolved wireframe */}
      {data?.circles.map((pts, i) => (
        <Line key={`c-${i}`} points={pts} color="#4ade80" lineWidth={1} />
      ))}

      {/* Meridional lines */}
      {data && [0, 12, 24, 36].map(j => {
        const bottom = data.circles[0]?.[j];
        const top = data.circles[data.circles.length - 1]?.[j];
        if (!bottom || !top) return null;
        return <Line key={`v-${j}`} points={[bottom, top]} color="#4ade80" lineWidth={1} />;
      })}

      {/* Rotation axis */}
      <Line points={[[0, 0, -0.5], [0, 0, 8]]} color="#555" lineWidth={1} />

      {/* Round-trip status indicator */}
      <Sphere args={[0.25]} position={[5, 0, 9]}>
        <meshBasicMaterial color={data?.roundTripOk ? '#4ade80' : '#ef4444'} />
      </Sphere>
      <BillboardText position={[5, 0, 10]} fontSize={0.4} color={data?.roundTripOk ? '#4ade80' : '#ef4444'}>
        STEP Round-Trip: {data?.roundTripOk ? 'OK' : 'FAILED'}
      </BillboardText>

      {/* STEP statistics */}
      <BillboardText position={[0, 0, 9.5]} fontSize={0.4} color="#60a5fa">
        Cylinder r={r.toFixed(1)} h={h.toFixed(1)} — V={data ? data.volume.toFixed(1) : '--'}
      </BillboardText>
      <BillboardText position={[0, 0, 8.7]} fontSize={0.35} color="#c084fc">
        STEP: {data ? data.entityCount : '--'} entities, {data ? data.stepTextLength.toLocaleString() : '--'} chars
      </BillboardText>
      <BillboardText position={[0, 0, 8]} fontSize={0.3} color="#94a3b8">
        Parsed back: {data ? data.parsedEntityCount : '--'} entities
      </BillboardText>

      {/* Footer */}
      <BillboardText position={[0, 0, -1.5]} fontSize={0.3} color="#666">
        Revolve solid to STEP text and back — live
      </BillboardText>
    </group>
  );
}
