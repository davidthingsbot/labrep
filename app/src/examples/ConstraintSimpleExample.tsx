'use client';

import { useMemo } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  XY_PLANE,
  makeLine2D,
  createConstrainedSketch,
  addElement,
  addConstraint,
  solveSketch,
  sketchDOF,
} from '@labrep/generation';
import type { ConstrainedSketch, Constraint, SolveResult } from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Example demonstrating basic constraint solving with visual annotations. */
export function ConstraintSimpleExample({ animationAngle }: ExampleProps) {
  const data = useMemo(() => {
    // Create a constrained sketch
    let sketch = createConstrainedSketch(XY_PLANE);

    // Create 4 lines forming a rough rectangle
    const bottom = makeLine2D(point2d(-0.8, -1.2), point2d(0.9, -0.8));
    const right = makeLine2D(point2d(1.6, -0.9), point2d(1.5, 1.1));
    const top = makeLine2D(point2d(1.4, 0.9), point2d(-0.7, 1.2));
    const left = makeLine2D(point2d(-0.9, 1.1), point2d(-1.0, -0.9));

    // Add lines to sketch
    if (bottom.result) sketch = addElement(sketch, bottom.result) as ConstrainedSketch;
    if (right.result) sketch = addElement(sketch, right.result) as ConstrainedSketch;
    if (top.result) sketch = addElement(sketch, top.result) as ConstrainedSketch;
    if (left.result) sketch = addElement(sketch, left.result) as ConstrainedSketch;

    const ids = sketch.elements.map((e) => e.id);
    const [bottomId, rightId, topId, leftId] = ids;

    // Define constraints
    const constraints: Constraint[] = [
      { type: 'horizontal', line: { elementId: bottomId } },
      { type: 'horizontal', line: { elementId: topId } },
      { type: 'vertical', line: { elementId: leftId } },
      { type: 'vertical', line: { elementId: rightId } },
      { type: 'coincident', point1: { elementId: bottomId, which: 'end' }, point2: { elementId: rightId, which: 'start' } },
      { type: 'coincident', point1: { elementId: rightId, which: 'end' }, point2: { elementId: topId, which: 'start' } },
      { type: 'coincident', point1: { elementId: topId, which: 'end' }, point2: { elementId: leftId, which: 'start' } },
      { type: 'coincident', point1: { elementId: leftId, which: 'end' }, point2: { elementId: bottomId, which: 'start' } },
    ];

    // Add constraints
    for (const constraint of constraints) {
      const result = addConstraint(sketch, constraint);
      if (result.success && result.result) {
        sketch = result.result.sketch;
      }
    }

    // Capture before state
    const beforeSketch = sketch;
    const beforeDOF = sketchDOF(beforeSketch);

    // Solve
    const solveOp = solveSketch(sketch);
    let afterSketch = sketch;
    let solveResult: SolveResult | null = null;
    if (solveOp.success && solveOp.result) {
      afterSketch = solveOp.result.sketch;
      solveResult = solveOp.result.result;
    }
    const afterDOF = sketchDOF(afterSketch);

    return { beforeSketch, afterSketch, beforeDOF, afterDOF, solveResult };
  }, []);

  if (!data) return null;

  // Animation: interpolate between before and after
  const progress = (Math.sin(animationAngle) + 1) / 2; // 0 to 1
  const displaySketch = progress < 0.5 ? data.beforeSketch : data.afterSketch;
  const solved = progress >= 0.5;

  // Extract lines for rendering
  const lines: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> = [];
  for (const el of displaySketch.elements) {
    const geom = el.geometry;
    if (geom.type === 'line') {
      lines.push({
        start: geom.startPoint,
        end: geom.endPoint,
      });
    }
  }

  return (
    <group>
      <BillboardText position={[0, 2.5, 0]} fontSize={0.3} color="white">
        Constraint Solver: Rectangle
      </BillboardText>

      {/* Draw rectangle lines */}
      {lines.map((line, i) => (
        <Line
          key={i}
          points={[
            [line.start.x, line.start.y, 0],
            [line.end.x, line.end.y, 0],
          ]}
          color={solved ? '#4caf50' : '#2196f3'}
          lineWidth={3}
        />
      ))}

      {/* Corner vertices */}
      {lines.map((line, i) => (
        <group key={`v-${i}`}>
          <Sphere args={[0.05, 8, 8]} position={[line.start.x, line.start.y, 0]}>
            <meshBasicMaterial color="white" />
          </Sphere>
        </group>
      ))}

      {/* Status text */}
      <BillboardText position={[0, -2, 0]} fontSize={0.15} color={solved ? '#4caf50' : '#2196f3'}>
        {solved ? `Solved! DOF: ${data.afterDOF}` : `Before: DOF ${data.beforeDOF}`}
      </BillboardText>

      {/* Constraint labels */}
      {lines.length >= 4 && (
        <>
          <BillboardText position={[(lines[0].start.x + lines[0].end.x) / 2, lines[0].start.y - 0.3, 0]} fontSize={0.1} color="#4fc3f7">
            H
          </BillboardText>
          <BillboardText position={[(lines[2].start.x + lines[2].end.x) / 2, lines[2].start.y + 0.3, 0]} fontSize={0.1} color="#4fc3f7">
            H
          </BillboardText>
          <BillboardText position={[lines[3].start.x - 0.3, (lines[3].start.y + lines[3].end.y) / 2, 0]} fontSize={0.1} color="#ba68c8">
            V
          </BillboardText>
          <BillboardText position={[lines[1].start.x + 0.3, (lines[1].start.y + lines[1].end.y) / 2, 0]} fontSize={0.1} color="#ba68c8">
            V
          </BillboardText>
        </>
      )}
    </group>
  );
}
