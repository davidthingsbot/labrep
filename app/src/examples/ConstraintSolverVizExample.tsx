'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  XY_PLANE,
  makeLine2D,
  createConstrainedSketch,
  addConstrainedElement,
  addConstraint,
  solveSketch,
  sketchDOF,
} from '@labrep/generation';
import type { Constraint } from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Progress bar component. */
function ProgressBar({
  position,
  label,
  value,
  color,
}: {
  position: [number, number, number];
  label: string;
  value: number;
  color: string;
}) {
  const barWidth = 1.2;
  const pct = Math.min(1, Math.max(0, value));

  return (
    <group position={position}>
      <BillboardText position={[-0.4, 0, 0]} fontSize={0.08} color="white">
        {label}
      </BillboardText>
      <Line points={[[0, 0, 0], [barWidth, 0, 0]]} color="#333" lineWidth={6} />
      <Line points={[[0, 0, 0.01], [pct * barWidth, 0, 0.01]]} color={color} lineWidth={6} />
    </group>
  );
}

/** Example showing solver visualization. */
export function ConstraintSolverVizExample({ animationAngle }: ExampleProps) {
  // Use animation to simulate solver iterations
  const iteration = Math.floor((animationAngle / (Math.PI * 2)) * 10) % 10;
  const progress = Math.min(1, iteration / 5); // Converges after ~5 iterations

  const data = useMemo(() => {
    try {
      // Create a triangle with deliberately bad initial positions
      let sketch = createConstrainedSketch(XY_PLANE);

      const line1 = makeLine2D(point2d(-1.2, -0.8), point2d(1.3, -0.7));
      const line2 = makeLine2D(point2d(1.1, -0.5), point2d(0.2, 1.3));
      const line3 = makeLine2D(point2d(-0.1, 1.1), point2d(-1.0, -0.6));

      if (line1.result) sketch = addConstrainedElement(sketch, line1.result);
      if (line2.result) sketch = addConstrainedElement(sketch, line2.result);
      if (line3.result) sketch = addConstrainedElement(sketch, line3.result);

      if (sketch.elements.length < 3) return null;

      const ids = sketch.elements.map((e) => e.id);
      const [id1, id2, id3] = ids;

      // Add constraints
      const constraints: Constraint[] = [
        { type: 'horizontal', line: { elementId: id1 } },
        { type: 'coincident', point1: { elementId: id1, which: 'end' }, point2: { elementId: id2, which: 'start' } },
        { type: 'coincident', point1: { elementId: id2, which: 'end' }, point2: { elementId: id3, which: 'start' } },
        { type: 'coincident', point1: { elementId: id3, which: 'end' }, point2: { elementId: id1, which: 'start' } },
      ];

      for (const constraint of constraints) {
        const result = addConstraint(sketch, constraint);
        if (result.success && result.result) {
          sketch = result.result.sketch;
        }
      }

      const beforeSketch = sketch;
      const solveOp = solveSketch(sketch);
      const afterSketch = solveOp.success && solveOp.result ? solveOp.result.sketch : sketch;
      const dof = sketchDOF(beforeSketch);

      return { beforeSketch, afterSketch, dof, constraintCount: constraints.length };
    } catch (e) {
      console.error('ConstraintSolverVizExample error:', e);
      return null;
    }
  }, []);

  if (!data) {
    return (
      <group>
        <BillboardText position={[0, 0, 0]} fontSize={0.2} color="red">
          Error initializing solver visualization
        </BillboardText>
      </group>
    );
  }

  // Interpolate between before and after based on progress
  const beforeLines: { start: { x: number; y: number }; end: { x: number; y: number } }[] = [];
  const afterLines: { start: { x: number; y: number }; end: { x: number; y: number } }[] = [];

  for (const el of data.beforeSketch.elements) {
    if (el.geometry.type === 'line') {
      beforeLines.push({ start: el.geometry.startPoint, end: el.geometry.endPoint });
    }
  }
  for (const el of data.afterSketch.elements) {
    if (el.geometry.type === 'line') {
      afterLines.push({ start: el.geometry.startPoint, end: el.geometry.endPoint });
    }
  }

  // Lerp between before and after
  const displayLines = beforeLines.map((before, i) => {
    const after = afterLines[i] || before;
    return {
      start: {
        x: before.start.x + (after.start.x - before.start.x) * progress,
        y: before.start.y + (after.start.y - before.start.y) * progress,
      },
      end: {
        x: before.end.x + (after.end.x - before.end.x) * progress,
        y: before.end.y + (after.end.y - before.end.y) * progress,
      },
    };
  });

  const residual = Math.max(0, 1 - progress) * 2.5; // Fake residual that decreases
  const converged = progress >= 0.99;

  return (
    <group>
      <BillboardText position={[0, 2.5, 0]} fontSize={0.25} color="white">
        Newton-Raphson Solver
      </BillboardText>

      {/* Geometry visualization */}
      <group position={[0, 0.3, 0]}>
        {displayLines.map((line, i) => (
          <group key={i}>
            <Line
              points={[
                [line.start.x, line.start.y, 0],
                [line.end.x, line.end.y, 0],
              ]}
              color={converged ? '#4caf50' : '#ff9800'}
              lineWidth={3}
            />
            <Sphere args={[0.05, 8, 8]} position={[line.start.x, line.start.y, 0]}>
              <meshBasicMaterial color="white" />
            </Sphere>
          </group>
        ))}

        {/* Target shape (ghost) */}
        {!converged && afterLines.map((line, i) => (
          <Line
            key={`target-${i}`}
            points={[
              [line.start.x, line.start.y, -0.1],
              [line.end.x, line.end.y, -0.1],
            ]}
            color="#4caf5044"
            lineWidth={1}
          />
        ))}
      </group>

      {/* Stats panel */}
      <group position={[-2.5, 1, 0]}>
        <BillboardText position={[0, 0.5, 0]} fontSize={0.14} color="white">
          Solver State
        </BillboardText>

        <group position={[0, 0.2, 0]}>
          <BillboardText position={[0, 0, 0]} fontSize={0.1} color="#4fc3f7">
            Iteration:
          </BillboardText>
          <BillboardText position={[0.7, 0, 0]} fontSize={0.14} color="white">
            {iteration}
          </BillboardText>
        </group>

        <group position={[0, -0.1, 0]}>
          <BillboardText position={[0, 0, 0]} fontSize={0.1} color="#ab47bc">
            DOF:
          </BillboardText>
          <BillboardText position={[0.4, 0, 0]} fontSize={0.14} color="white">
            {data.dof}
          </BillboardText>
        </group>

        <group position={[0, -0.4, 0]}>
          <BillboardText position={[0, 0, 0]} fontSize={0.1} color="gray">
            Status:
          </BillboardText>
          <BillboardText position={[0.5, 0, 0]} fontSize={0.1} color={converged ? '#4caf50' : '#ff9800'}>
            {converged ? 'CONVERGED' : 'ITERATING'}
          </BillboardText>
        </group>

        <ProgressBar
          position={[0, -0.7, 0]}
          label="Residual"
          value={1 - residual / 2.5}
          color={converged ? '#4caf50' : '#ff9800'}
        />
      </group>

      {/* Constraint panel */}
      <group position={[2.2, 1, 0]}>
        <BillboardText position={[0, 0.5, 0]} fontSize={0.14} color="white">
          Constraints ({data.constraintCount})
        </BillboardText>

        <group position={[0, 0.15, 0]}>
          <Sphere args={[0.04, 8, 8]} position={[0, 0, 0]}>
            <meshBasicMaterial color={converged ? '#4caf50' : '#ff9800'} />
          </Sphere>
          <BillboardText position={[0.15, 0, 0]} fontSize={0.08} color="white">
            horizontal
          </BillboardText>
        </group>

        <group position={[0, -0.1, 0]}>
          <Sphere args={[0.04, 8, 8]} position={[0, 0, 0]}>
            <meshBasicMaterial color={converged ? '#4caf50' : '#ff9800'} />
          </Sphere>
          <BillboardText position={[0.15, 0, 0]} fontSize={0.08} color="white">
            coincident ×3
          </BillboardText>
        </group>

        {/* Legend */}
        <group position={[0, -0.5, 0]}>
          <Sphere args={[0.03, 8, 8]} position={[0, 0, 0]}>
            <meshBasicMaterial color="#4caf50" />
          </Sphere>
          <BillboardText position={[0.12, 0, 0]} fontSize={0.06} color="#888">
            satisfied
          </BillboardText>
          <Sphere args={[0.03, 8, 8]} position={[0, -0.15, 0]}>
            <meshBasicMaterial color="#ff9800" />
          </Sphere>
          <BillboardText position={[0.12, -0.15, 0]} fontSize={0.06} color="#888">
            iterating
          </BillboardText>
        </group>
      </group>

      {/* Footer */}
      <BillboardText position={[0, -2, 0]} fontSize={0.08} color="#666">
        Watch geometry converge as constraints are satisfied
      </BillboardText>
    </group>
  );
}
