'use client';

import { useMemo } from 'react';
import {
  point3d,
  vec3d,
  axis,
  plane,
  ORIGIN,
  X_AXIS,
  Y_AXIS,
  Z_AXIS,
  XY_PLANE,
  XZ_PLANE,
  YZ_PLANE,
  createStepModelBuilder,
  point3DToStep,
  vector3DToStep,
  planeToStep,
  writeStep,
  parseStep,
  extractFoundationTypes,
} from '@labrep/generation';
import { PointViz, VectorViz, BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating STEP export → import round-trip for foundation types. */
export function StepRoundtripExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Build a STEP model with foundation types
    const builder = createStepModelBuilder();

    // Add some points
    const pts = [
      point3d(1, 0, 0),
      point3d(0, 2, 0),
      point3d(0, 0, 1.5),
      point3d(-1, 1, 0.5),
    ];
    for (const p of pts) {
      builder.addEntity(point3DToStep(p, builder.nextId()));
    }

    // Add some directions
    const dirs = [X_AXIS, Y_AXIS, Z_AXIS];
    for (const d of dirs) {
      builder.addEntity(vector3DToStep(d, builder.nextId()));
    }

    // Add planes
    planeToStep(XY_PLANE, builder);
    planeToStep(XZ_PLANE, builder);

    // Write to STEP text
    const model = builder.build({ fileName: 'roundtrip-test.stp' });
    const stepText = writeStep(model);

    // Parse it back
    const parsed = parseStep(stepText);
    if (!parsed.success) return null;

    // Extract foundation types from the parsed model
    const extracted = extractFoundationTypes(parsed.result!);

    return {
      stepText,
      entityCount: parsed.result!.entities.size,
      pointCount: extracted.points.size,
      directionCount: extracted.directions.size,
      planeCount: extracted.planes.size,
      importedPoints: [...extracted.points.values()],
      importedPlanes: [...extracted.planes.values()],
      originalPoints: pts,
    };
  }, []);

  if (!data) return null;

  const {
    stepText, entityCount, pointCount, directionCount, planeCount,
    importedPoints, importedPlanes, originalPoints,
  } = data;

  // Animated highlight of one point
  const highlightIdx = Math.floor((animationAngle / (2 * Math.PI)) * originalPoints.length) % originalPoints.length;

  return (
    <group>
      <BillboardText position={[0, 3.5, 0]} fontSize={0.35} color="white">
        STEP Round-Trip
      </BillboardText>

      {/* Original points (left side) */}
      <BillboardText position={[-2, 2.5, 0]} fontSize={0.13} color="cyan">
        original
      </BillboardText>
      {originalPoints.map((p, i) => (
        <PointViz
          key={`orig-${i}`}
          point={{ x: p.x - 2, y: p.y, z: p.z }}
          color={i === highlightIdx ? 'yellow' : 'cyan'}
          size={i === highlightIdx ? 0.08 : 0.05}
          label={`(${p.x}, ${p.y}, ${p.z})`}
        />
      ))}

      {/* Imported points (right side) */}
      <BillboardText position={[2, 2.5, 0]} fontSize={0.13} color="magenta">
        imported from STEP
      </BillboardText>
      {importedPoints.map((p, i) => (
        <PointViz
          key={`imp-${i}`}
          point={{ x: p.x + 2, y: p.y, z: p.z }}
          color={i === highlightIdx ? 'yellow' : 'magenta'}
          size={i === highlightIdx ? 0.08 : 0.05}
          label={`(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`}
        />
      ))}

      {/* Imported planes — show as normal vectors */}
      {importedPlanes.map((pl, i) => (
        <VectorViz
          key={`pl-${i}`}
          origin={{ x: pl.origin.x, y: pl.origin.y, z: pl.origin.z }}
          vector={{ x: pl.normal.x * 0.8, y: pl.normal.y * 0.8, z: pl.normal.z * 0.8 }}
          color="#44aa88"
          label={`plane ${i + 1}`}
        />
      ))}

      {/* Stats */}
      <BillboardText position={[0, -2, 0]} fontSize={0.1} color="gray">
        {`STEP: ${entityCount} entities → ${pointCount} points, ${directionCount} directions, ${planeCount} planes`}
      </BillboardText>
      <BillboardText position={[0, -2.5, 0]} fontSize={0.09} color="gray">
        {`file: ${stepText.length} chars, ${stepText.split('\n').length} lines`}
      </BillboardText>
    </group>
  );
}
