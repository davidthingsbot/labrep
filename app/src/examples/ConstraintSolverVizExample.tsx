'use client';

import { useMemo, useState, useEffect } from 'react';
import { Line, Sphere } from '@react-three/drei';
import {
  point2d,
  XY_PLANE,
  makeLine2D,
  createConstrainedSketch,
  addElement,
  addConstraint,
  sketchDOF,
  initSolverState,
  solveStep,
} from '@labrep/generation';
import type { ConstrainedSketch, Constraint, SolverState, ConstraintEntry } from '@labrep/generation';
import { BillboardText } from '@/components/Viewer/SceneObjects';
import type { ExampleProps } from './types';

/** Helper to add an element to a constrained sketch. */
function addToSketch(
  sketch: ConstrainedSketch,
  geometry: ReturnType<typeof makeLine2D>['result'],
): ConstrainedSketch {
  if (!geometry) return sketch;
  return addElement(sketch, geometry) as ConstrainedSketch;
}

/** Constraint status indicator. */
function ConstraintStatus({
  position,
  constraintId,
  satisfied,
  error,
}: {
  position: [number, number, number];
  constraintId: string;
  satisfied: boolean;
  error: number;
}) {
  const color = satisfied ? '#4caf50' : error < 0.1 ? '#ff9800' : '#f44336';

  return (
    <group position={position}>
      {/* Status dot */}
      <mesh>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Label */}
      <BillboardText position={[0.15, 0, 0]} fontSize={0.08} color={color}>
        {constraintId}
      </BillboardText>
      {/* Error value */}
      <BillboardText position={[0.6, 0, 0]} fontSize={0.06} color="#888">
        {error < 0.0001 ? '✓' : error.toExponential(1)}
      </BillboardText>
    </group>
  );
}

/** Progress bar for residual. */
function ResidualBar({
  position,
  value,
  maxValue = 10,
}: {
  position: [number, number, number];
  value: number;
  maxValue?: number;
}) {
  const barWidth = 1.5;
  const logValue = Math.max(0, 1 - Math.log10(Math.max(value, 1e-12)) / Math.log10(maxValue));
  const pct = Math.min(1, Math.max(0, logValue));

  // Color gradient from red to green
  const r = Math.floor(255 * (1 - pct));
  const g = Math.floor(255 * pct);
  const color = `rgb(${r}, ${g}, 0)`;

  return (
    <group position={position}>
      <BillboardText position={[-0.5, 0, 0]} fontSize={0.1} color="white">
        Residual
      </BillboardText>

      {/* Track */}
      <Line
        points={[
          [0, 0, 0],
          [barWidth, 0, 0],
        ]}
        color="#333"
        lineWidth={8}
      />

      {/* Fill */}
      <Line
        points={[
          [0, 0, 0.01],
          [pct * barWidth, 0, 0.01],
        ]}
        color={color}
        lineWidth={8}
      />

      {/* Value */}
      <BillboardText position={[barWidth + 0.3, 0, 0]} fontSize={0.1} color={color}>
        {value.toExponential(2)}
      </BillboardText>
    </group>
  );
}

/** Extract positions from solver state for rendering. */
function getPositionsFromState(
  state: SolverState,
  elementIds: string[],
): Map<string, { start: { x: number; y: number }; end: { x: number; y: number } }> {
  const positions = new Map();

  for (const id of elementIds) {
    const startX = state.state.values.get(`${id}:start:x`);
    const startY = state.state.values.get(`${id}:start:y`);
    const endX = state.state.values.get(`${id}:end:x`);
    const endY = state.state.values.get(`${id}:end:y`);

    if (startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
      positions.set(id, {
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
      });
    }
  }

  return positions;
}

/** Example showing solver internals step-by-step. */
export function ConstraintSolverVizExample({ animationAngle }: ExampleProps) {
  // Build sketch with intentionally bad initial positions
  const { initialSketch, constraintEntries, elementIds } = useMemo(() => {
    let sketch = createConstrainedSketch(XY_PLANE);

    // Create a triangle with bad initial positions
    const line1 = makeLine2D(point2d(-1.2, -0.8), point2d(1.3, -0.7)); // Should be horizontal at y=-1
    const line2 = makeLine2D(point2d(1.1, -0.5), point2d(0.2, 1.3)); // Should connect
    const line3 = makeLine2D(point2d(-0.1, 1.1), point2d(-1.0, -0.6)); // Should close

    sketch = addToSketch(sketch, line1.result);
    sketch = addToSketch(sketch, line2.result);
    sketch = addToSketch(sketch, line3.result);

    const ids = sketch.elements.map((e) => e.id);
    const [id1, id2, id3] = ids;

    // Add constraints
    const constraints: Constraint[] = [
      // Make bottom line horizontal
      { type: 'horizontal', line: { elementId: id1 } },
      // Connect corners
      {
        type: 'coincident',
        point1: { elementId: id1, which: 'end' },
        point2: { elementId: id2, which: 'start' },
      },
      {
        type: 'coincident',
        point1: { elementId: id2, which: 'end' },
        point2: { elementId: id3, which: 'start' },
      },
      {
        type: 'coincident',
        point1: { elementId: id3, which: 'end' },
        point2: { elementId: id1, which: 'start' },
      },
    ];

    const entries: ConstraintEntry[] = [];
    for (const constraint of constraints) {
      const result = addConstraint(sketch, constraint);
      if (result.success && result.result) {
        sketch = result.result.sketch;
        entries.push({
          id: result.result.constraintId,
          constraint,
          isConstruction: false,
        });
      }
    }

    return { initialSketch: sketch, constraintEntries: entries, elementIds: ids };
  }, []);

  // Solver state management
  const [solverState, setSolverState] = useState<SolverState | null>(null);
  const [iteration, setIteration] = useState(0);

  // Initialize solver state
  useEffect(() => {
    const state = initSolverState(initialSketch, [...initialSketch.constraints]);
    setSolverState(state);
    setIteration(0);
  }, [initialSketch]);

  // Step solver based on animation angle (every ~1 second)
  const stepTrigger = Math.floor(animationAngle / (Math.PI / 3));
  useEffect(() => {
    if (solverState && !solverState.converged && stepTrigger > iteration) {
      const params = new Map(initialSketch.parameters);
      const newState = solveStep(solverState, params);
      setSolverState(newState);
      setIteration(stepTrigger);
    }
  }, [stepTrigger, solverState, iteration, initialSketch.parameters]);

  // Get current line positions from solver state
  const linePositions = solverState
    ? getPositionsFromState(solverState, elementIds)
    : new Map();

  // If we don't have solver state positions, use initial sketch
  const displayLines = elementIds.map((id, i) => {
    const pos = linePositions.get(id);
    if (pos) {
      return { id, ...pos };
    }
    // Fallback to sketch geometry
    const el = initialSketch.elements[i];
    if (el?.geometry.type === 'line') {
      return {
        id,
        start: el.geometry.startPoint,
        end: el.geometry.endPoint,
      };
    }
    return null;
  }).filter(Boolean) as Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number } }>;

  const dof = sketchDOF(initialSketch);
  const residual = solverState?.residual ?? 0;
  const converged = solverState?.converged ?? false;

  // Compute constraint errors (simplified)
  const constraintErrors = constraintEntries.map((entry) => {
    // Simplified error computation based on residual
    const baseError = residual / Math.max(1, constraintEntries.length);
    return {
      id: entry.id,
      type: entry.constraint.type,
      error: baseError,
      satisfied: baseError < 1e-8,
    };
  });

  return (
    <group>
      <BillboardText position={[0, 2.8, 0]} fontSize={0.3} color="white">
        Solver Internals
      </BillboardText>

      {/* Geometry visualization */}
      <group position={[0, 0.3, 0]}>
        {/* Lines with color based on convergence */}
        {displayLines.map((line, i) => (
          <group key={line.id}>
            <Line
              points={[
                [line.start.x, line.start.y, 0],
                [line.end.x, line.end.y, 0],
              ]}
              color={converged ? '#4caf50' : '#ff9800'}
              lineWidth={3}
            />
            {/* Vertices */}
            <Sphere args={[0.05, 8, 8]} position={[line.start.x, line.start.y, 0]}>
              <meshBasicMaterial color="white" />
            </Sphere>
            <Sphere args={[0.05, 8, 8]} position={[line.end.x, line.end.y, 0]}>
              <meshBasicMaterial color="white" />
            </Sphere>
            {/* Line label */}
            <BillboardText
              position={[
                (line.start.x + line.end.x) / 2 + 0.15,
                (line.start.y + line.end.y) / 2 + 0.15,
                0,
              ]}
              fontSize={0.08}
              color="#888"
            >
              {`L${i + 1}`}
            </BillboardText>
          </group>
        ))}

        {/* Target shape (ghost) when not converged */}
        {!converged && (
          <group>
            <Line
              points={[
                [-1, -1, -0.1],
                [1, -1, -0.1],
              ]}
              color="#4caf5033"
              lineWidth={1}
              dashed
              dashSize={0.1}
              gapSize={0.05}
            />
            <Line
              points={[
                [1, -1, -0.1],
                [0, 1, -0.1],
              ]}
              color="#4caf5033"
              lineWidth={1}
              dashed
              dashSize={0.1}
              gapSize={0.05}
            />
            <Line
              points={[
                [0, 1, -0.1],
                [-1, -1, -0.1],
              ]}
              color="#4caf5033"
              lineWidth={1}
              dashed
              dashSize={0.1}
              gapSize={0.05}
            />
          </group>
        )}
      </group>

      {/* Solver stats panel */}
      <group position={[-3.5, 1.5, 0]}>
        <BillboardText position={[0.5, 0.5, 0]} fontSize={0.14} color="white">
          Solver State
        </BillboardText>

        {/* Iteration counter */}
        <group position={[0, 0, 0]}>
          <BillboardText position={[0, 0, 0]} fontSize={0.1} color="#4fc3f7">
            Iteration:
          </BillboardText>
          <BillboardText position={[0.8, 0, 0]} fontSize={0.15} color="white">
            {solverState?.iteration ?? 0}
          </BillboardText>
        </group>

        {/* DOF */}
        <group position={[0, -0.3, 0]}>
          <BillboardText position={[0, 0, 0]} fontSize={0.1} color="#ab47bc">
            DOF:
          </BillboardText>
          <BillboardText position={[0.5, 0, 0]} fontSize={0.15} color="white">
            {dof}
          </BillboardText>
        </group>

        {/* Convergence status */}
        <group position={[0, -0.6, 0]}>
          <BillboardText position={[0, 0, 0]} fontSize={0.1} color="gray">
            Status:
          </BillboardText>
          <BillboardText
            position={[0.6, 0, 0]}
            fontSize={0.12}
            color={converged ? '#4caf50' : '#ff9800'}
          >
            {converged ? 'CONVERGED' : 'ITERATING...'}
          </BillboardText>
        </group>

        {/* Residual bar */}
        <ResidualBar position={[0, -1.0, 0]} value={residual} />
      </group>

      {/* Constraint status panel */}
      <group position={[2.5, 1.5, 0]}>
        <BillboardText position={[0, 0.5, 0]} fontSize={0.14} color="white">
          Constraints
        </BillboardText>

        {constraintErrors.map((c, i) => (
          <ConstraintStatus
            key={c.id}
            position={[0, -i * 0.25, 0]}
            constraintId={c.type}
            satisfied={c.satisfied}
            error={c.error}
          />
        ))}

        {/* Legend */}
        <group position={[0, -constraintErrors.length * 0.25 - 0.3, 0]}>
          <mesh position={[0, 0, 0]}>
            <circleGeometry args={[0.04, 12]} />
            <meshBasicMaterial color="#4caf50" />
          </mesh>
          <BillboardText position={[0.2, 0, 0]} fontSize={0.06} color="#888">
            satisfied
          </BillboardText>

          <mesh position={[0, -0.15, 0]}>
            <circleGeometry args={[0.04, 12]} />
            <meshBasicMaterial color="#ff9800" />
          </mesh>
          <BillboardText position={[0.2, -0.15, 0]} fontSize={0.06} color="#888">
            close
          </BillboardText>

          <mesh position={[0, -0.3, 0]}>
            <circleGeometry args={[0.04, 12]} />
            <meshBasicMaterial color="#f44336" />
          </mesh>
          <BillboardText position={[0.2, -0.3, 0]} fontSize={0.06} color="#888">
            violated
          </BillboardText>
        </group>
      </group>

      {/* Info footer */}
      <group position={[0, -2.5, 0]}>
        <BillboardText position={[0, 0, 0]} fontSize={0.1} color="#666">
          Newton-Raphson solver stepping toward solution
        </BillboardText>
        <BillboardText position={[0, -0.2, 0]} fontSize={0.08} color="#555">
          Watch geometry converge as constraints are satisfied
        </BillboardText>
      </group>
    </group>
  );
}
