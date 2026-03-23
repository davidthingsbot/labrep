'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  XY_PLANE,
  makeLine2D,
  makeCircle2D,
  createConstrainedSketch,
  addElement,
  sketchDOF,
} from '@labrep/generation';
import type { ConstrainedSketch, Curve2D } from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Helper to add an element to a constrained sketch. */
function addToSketch<T extends { result?: Curve2D }>(
  sketch: ConstrainedSketch,
  result: T,
): ConstrainedSketch {
  if (!result.result) return sketch;
  return addElement(sketch, result.result) as ConstrainedSketch;
}

/** Render a 2D curve as a Three.js Line. */
function curveToPoints(curve: Curve2D, segs: number = 32): [number, number, number][] {
  const pts: [number, number, number][] = [];
  if (curve.type === 'line') {
    pts.push([curve.startPoint.x, curve.startPoint.y, 0]);
    pts.push([curve.endPoint.x, curve.endPoint.y, 0]);
  } else if (curve.type === 'circle') {
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * 2 * Math.PI;
      pts.push([
        curve.center.x + curve.radius * Math.cos(t),
        curve.center.y + curve.radius * Math.sin(t),
        0,
      ]);
    }
  }
  return pts;
}

/** Slider visualization component. */
function SliderViz({
  position,
  label,
  value,
  min,
  max,
  color = '#4fc3f7',
}: {
  position: [number, number, number];
  label: string;
  value: number;
  min: number;
  max: number;
  color?: string;
}) {
  const pct = (value - min) / (max - min);
  const barWidth = 1.2;

  return (
    <group position={position}>
      {/* Label */}
      <BillboardText position={[-0.7, 0, 0]} fontSize={0.1} color="white">
        {label}
      </BillboardText>

      {/* Track */}
      <Line
        points={[
          [0, 0, 0],
          [barWidth, 0, 0],
        ]}
        color="#444"
        lineWidth={4}
      />

      {/* Filled portion */}
      <Line
        points={[
          [0, 0, 0.01],
          [pct * barWidth, 0, 0.01],
        ]}
        color={color}
        lineWidth={4}
      />

      {/* Handle */}
      <Sphere args={[0.06, 12, 12]} position={[pct * barWidth, 0, 0.02]}>
        <meshBasicMaterial color={color} />
      </Sphere>

      {/* Value */}
      <BillboardText position={[barWidth + 0.3, 0, 0]} fontSize={0.1} color={color}>
        {value.toFixed(1)}
      </BillboardText>
    </group>
  );
}

/** Build an L-bracket shape with parameters. */
function buildBracket(width: number, height: number, thickness: number, holeRadius: number) {
  let sketch = createConstrainedSketch(XY_PLANE);

  // L-bracket shape (counter-clockwise from bottom-left)
  //    ┌────────┐
  //    │        │
  //    │   ○    │  <- hole
  //    │        │
  // ┌──┘        │
  // │           │
  // └───────────┘

  const lines = [
    // Bottom edge
    makeLine2D(point2d(0, 0), point2d(width, 0)),
    // Right edge
    makeLine2D(point2d(width, 0), point2d(width, height)),
    // Top edge
    makeLine2D(point2d(width, height), point2d(thickness, height)),
    // Inner vertical
    makeLine2D(point2d(thickness, height), point2d(thickness, thickness)),
    // Inner horizontal
    makeLine2D(point2d(thickness, thickness), point2d(0, thickness)),
    // Left edge
    makeLine2D(point2d(0, thickness), point2d(0, 0)),
  ];

  for (const line of lines) {
    sketch = addToSketch(sketch, line);
  }

  // Add hole in upper portion
  const holeCenterX = thickness + (width - thickness) / 2;
  const holeCenterY = thickness + (height - thickness) / 2;
  const hole = makeCircle2D(point2d(holeCenterX, holeCenterY), holeRadius);
  sketch = addToSketch(sketch, hole);

  return sketch;
}

/** Example demonstrating parametric constraints with sliders. */
export function ConstraintParametricExample({ animationAngle }: ExampleProps) {
  // Animate parameters based on animationAngle
  const baseWidth = 3;
  const baseHeight = 2.5;
  const baseThickness = 0.8;
  const baseHoleRadius = 0.3;

  // Modulate parameters with animation
  const width = baseWidth + Math.sin(animationAngle) * 0.5;
  const height = baseHeight + Math.sin(animationAngle * 0.7) * 0.4;
  const thickness = baseThickness + Math.sin(animationAngle * 1.3) * 0.15;
  const holeRadius = baseHoleRadius + Math.sin(animationAngle * 0.5) * 0.1;

  const { sketch, lines, hole } = useMemo(() => {
    const sketch = buildBracket(width, height, thickness, holeRadius);

    // Extract geometry for rendering
    const lines: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> = [];
    let hole: { center: { x: number; y: number }; radius: number } | null = null;

    for (const el of sketch.elements) {
      const geom = el.geometry;
      if (geom.type === 'line') {
        lines.push({ start: geom.startPoint, end: geom.endPoint });
      } else if (geom.type === 'circle') {
        hole = { center: geom.center, radius: geom.radius };
      }
    }

    return { sketch, lines, hole };
  }, [width, height, thickness, holeRadius]);

  const dof = sketchDOF(sketch);

  // Center the bracket for display
  const offsetX = -width / 2;
  const offsetY = -height / 2;

  return (
    <group>
      <BillboardText position={[0, 2.8, 0]} fontSize={0.3} color="white">
        Parametric L-Bracket
      </BillboardText>

      {/* Bracket geometry */}
      <group position={[offsetX, offsetY, 0]}>
        {/* Outer lines */}
        {lines.map((line, i) => (
          <Line
            key={i}
            points={[
              [line.start.x, line.start.y, 0],
              [line.end.x, line.end.y, 0],
            ]}
            color="#4caf50"
            lineWidth={3}
          />
        ))}

        {/* Vertices */}
        {lines.map((line, i) => (
          <Sphere key={`v-${i}`} args={[0.04, 8, 8]} position={[line.start.x, line.start.y, 0]}>
            <meshBasicMaterial color="white" />
          </Sphere>
        ))}

        {/* Hole */}
        {hole && (
          <group>
            <Line
              points={curveToPoints({ type: 'circle', center: hole.center, radius: hole.radius } as Curve2D)}
              color="#ff5722"
              lineWidth={2}
            />
            {/* Center mark */}
            <Line
              points={[
                [hole.center.x - 0.08, hole.center.y, 0.01],
                [hole.center.x + 0.08, hole.center.y, 0.01],
              ]}
              color="#ff5722"
              lineWidth={1}
            />
            <Line
              points={[
                [hole.center.x, hole.center.y - 0.08, 0.01],
                [hole.center.x, hole.center.y + 0.08, 0.01],
              ]}
              color="#ff5722"
              lineWidth={1}
            />
          </group>
        )}

        {/* Dimension lines */}
        {/* Width */}
        <Line
          points={[
            [0, -0.3, 0],
            [width, -0.3, 0],
          ]}
          color="#aaa"
          lineWidth={1}
        />
        <BillboardText position={[width / 2, -0.5, 0]} fontSize={0.1} color="#aaa">
          {`width`}
        </BillboardText>

        {/* Height */}
        <Line
          points={[
            [width + 0.3, 0, 0],
            [width + 0.3, height, 0],
          ]}
          color="#aaa"
          lineWidth={1}
        />
        <BillboardText position={[width + 0.5, height / 2, 0]} fontSize={0.1} color="#aaa">
          {`height`}
        </BillboardText>

        {/* Thickness indicator */}
        <Line
          points={[
            [thickness, height + 0.15, 0],
            [0, height + 0.15, 0],
          ]}
          color="#aaa"
          lineWidth={1}
          dashed
          dashSize={0.05}
          gapSize={0.05}
        />
        <BillboardText position={[thickness / 2, height + 0.3, 0]} fontSize={0.08} color="#aaa">
          {`t`}
        </BillboardText>
      </group>

      {/* Parameter sliders panel */}
      <group position={[-3.5, 1, 0]}>
        <BillboardText position={[0.6, 0.5, 0]} fontSize={0.12} color="white">
          Parameters
        </BillboardText>
        <SliderViz
          position={[0, 0, 0]}
          label="width"
          value={width}
          min={2}
          max={4}
          color="#4fc3f7"
        />
        <SliderViz
          position={[0, -0.35, 0]}
          label="height"
          value={height}
          min={1.5}
          max={3.5}
          color="#ab47bc"
        />
        <SliderViz
          position={[0, -0.7, 0]}
          label="thick"
          value={thickness}
          min={0.4}
          max={1.2}
          color="#66bb6a"
        />
        <SliderViz
          position={[0, -1.05, 0]}
          label="hole ⌀"
          value={holeRadius * 2}
          min={0.3}
          max={0.8}
          color="#ff7043"
        />
      </group>

      {/* Status info */}
      <group position={[0, -2.3, 0]}>
        <BillboardText position={[0, 0, 0]} fontSize={0.12} color="#4caf50">
          Live Parametric Preview
        </BillboardText>
        <BillboardText position={[0, -0.25, 0]} fontSize={0.1} color="gray">
          {`DOF: ${dof} • Elements: ${sketch.elements.length}`}
        </BillboardText>
        <BillboardText position={[0, -0.45, 0]} fontSize={0.08} color="#666">
          Parameters animate automatically — in real use, sliders would be interactive
        </BillboardText>
      </group>

      {/* Code hint */}
      <group position={[3, -0.5, 0]}>
        <BillboardText position={[0, 0, 0]} fontSize={0.09} color="#888">
          setParameter(sketch, &apos;width&apos;, 3.5)
        </BillboardText>
        <BillboardText position={[0, -0.2, 0]} fontSize={0.09} color="#888">
          → geometry updates
        </BillboardText>
      </group>
    </group>
  );
}
