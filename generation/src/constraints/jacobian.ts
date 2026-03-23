/**
 * Jacobian matrix construction and linear algebra utilities.
 *
 * @module constraints/jacobian
 */

import { Parameter } from './types';
import { ResidualEquation, VariableState, varKey } from './equations';

// =============================================================================
// Matrix Types
// =============================================================================

/**
 * A dense matrix stored as a 2D array.
 */
export type Matrix = number[][];

/**
 * A vector (1D array).
 */
export type Vector = number[];

// =============================================================================
// Matrix Construction
// =============================================================================

/**
 * Create a zero matrix of the given dimensions.
 */
export function zeros(rows: number, cols: number): Matrix {
  const m: Matrix = [];
  for (let i = 0; i < rows; i++) {
    m[i] = new Array(cols).fill(0);
  }
  return m;
}

/**
 * Create an identity matrix.
 */
export function identity(n: number): Matrix {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) {
    m[i][i] = 1;
  }
  return m;
}

/**
 * Create a zero vector.
 */
export function zerosVec(n: number): Vector {
  return new Array(n).fill(0);
}

// =============================================================================
// Jacobian Construction
// =============================================================================

/**
 * Build the Jacobian matrix using numerical differentiation.
 *
 * J[i][j] = ∂f_i / ∂x_j
 *
 * @param equations - The residual equations
 * @param state - Current variable state
 * @param variableKeys - Ordered list of variable keys
 * @param parameters - Parameter map for expression evaluation
 * @param epsilon - Step size for finite differences (default: 1e-7)
 * @returns The Jacobian matrix
 */
export function buildJacobian(
  equations: ResidualEquation[],
  state: VariableState,
  variableKeys: string[],
  parameters: Map<string, Parameter>,
  epsilon: number = 1e-7,
): Matrix {
  const numEquations = equations.length;
  const numVariables = variableKeys.length;

  const J = zeros(numEquations, numVariables);

  // For each variable, compute partial derivatives
  for (let j = 0; j < numVariables; j++) {
    const key = variableKeys[j];
    const originalValue = state.values.get(key)!;

    // f(x + epsilon)
    state.values.set(key, originalValue + epsilon);
    const residualsPlus: number[] = equations.map(eq =>
      eq.evaluate(state, parameters)
    );

    // f(x - epsilon)
    state.values.set(key, originalValue - epsilon);
    const residualsMinus: number[] = equations.map(eq =>
      eq.evaluate(state, parameters)
    );

    // Restore original value
    state.values.set(key, originalValue);

    // Central difference: (f(x+e) - f(x-e)) / (2e)
    for (let i = 0; i < numEquations; i++) {
      J[i][j] = (residualsPlus[i] - residualsMinus[i]) / (2 * epsilon);
    }
  }

  return J;
}

/**
 * Build the Jacobian matrix only for equations that depend on specific variables.
 * This is an optimization for sparse systems.
 */
export function buildSparseJacobian(
  equations: ResidualEquation[],
  state: VariableState,
  variableKeys: string[],
  parameters: Map<string, Parameter>,
  epsilon: number = 1e-7,
): Matrix {
  const numEquations = equations.length;
  const numVariables = variableKeys.length;

  const J = zeros(numEquations, numVariables);

  // Create a map from variable key to column index
  const varIndex = new Map<string, number>();
  for (let j = 0; j < numVariables; j++) {
    varIndex.set(variableKeys[j], j);
  }

  // For each equation, only compute derivatives for variables it depends on
  for (let i = 0; i < numEquations; i++) {
    const eq = equations[i];
    const baseValue = eq.evaluate(state, parameters);

    for (const varKey of eq.variables) {
      const j = varIndex.get(varKey);
      if (j === undefined) continue;

      const originalValue = state.values.get(varKey);
      if (originalValue === undefined) continue;

      // Forward difference for sparse computation
      state.values.set(varKey, originalValue + epsilon);
      const perturbedValue = eq.evaluate(state, parameters);
      state.values.set(varKey, originalValue);

      J[i][j] = (perturbedValue - baseValue) / epsilon;
    }
  }

  return J;
}

// =============================================================================
// Matrix Operations
// =============================================================================

/**
 * Transpose a matrix.
 */
export function transpose(A: Matrix): Matrix {
  if (A.length === 0) return [];
  const rows = A.length;
  const cols = A[0].length;
  const T = zeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

/**
 * Matrix multiplication: C = A × B
 */
export function multiply(A: Matrix, B: Matrix): Matrix {
  const rowsA = A.length;
  const colsA = A[0]?.length ?? 0;
  const rowsB = B.length;
  const colsB = B[0]?.length ?? 0;

  if (colsA !== rowsB) {
    throw new Error(`Matrix dimensions incompatible: ${rowsA}×${colsA} × ${rowsB}×${colsB}`);
  }

  const C = zeros(rowsA, colsB);
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

/**
 * Matrix-vector multiplication: y = A × x
 */
export function multiplyVec(A: Matrix, x: Vector): Vector {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;

  if (cols !== x.length) {
    throw new Error(`Dimensions incompatible: ${rows}×${cols} × ${x.length}`);
  }

  const y: Vector = zerosVec(rows);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      sum += A[i][j] * x[j];
    }
    y[i] = sum;
  }
  return y;
}

/**
 * Vector dot product.
 */
export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions incompatible: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Vector norm (Euclidean length).
 */
export function norm(v: Vector): number {
  return Math.sqrt(dot(v, v));
}

/**
 * Scale a vector: y = alpha * x
 */
export function scaleVec(alpha: number, x: Vector): Vector {
  return x.map(xi => alpha * xi);
}

/**
 * Add two vectors: z = x + y
 */
export function addVec(x: Vector, y: Vector): Vector {
  if (x.length !== y.length) {
    throw new Error(`Vector dimensions incompatible: ${x.length} vs ${y.length}`);
  }
  return x.map((xi, i) => xi + y[i]);
}

/**
 * Subtract two vectors: z = x - y
 */
export function subtractVec(x: Vector, y: Vector): Vector {
  if (x.length !== y.length) {
    throw new Error(`Vector dimensions incompatible: ${x.length} vs ${y.length}`);
  }
  return x.map((xi, i) => xi - y[i]);
}

/**
 * Negate a vector: y = -x
 */
export function negateVec(x: Vector): Vector {
  return x.map(xi => -xi);
}

// =============================================================================
// Linear Solve
// =============================================================================

/**
 * Solve a linear system A × x = b using Gaussian elimination with partial pivoting.
 *
 * @param A - Coefficient matrix (n × n)
 * @param b - Right-hand side vector
 * @returns Solution vector x
 */
export function solve(A: Matrix, b: Vector): Vector {
  const n = A.length;
  if (n === 0) return [];
  if (A[0].length !== n) {
    throw new Error('Matrix must be square');
  }
  if (b.length !== n) {
    throw new Error('Right-hand side dimension mismatch');
  }

  // Create augmented matrix [A|b]
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Check for singular matrix
    if (Math.abs(aug[col][col]) < 1e-12) {
      // Near-singular, use pseudo-solution
      aug[col][col] = 1e-12;
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = zerosVec(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = aug[row][n];
    for (let j = row + 1; j < n; j++) {
      sum -= aug[row][j] * x[j];
    }
    x[row] = sum / aug[row][row];
  }

  return x;
}

/**
 * Solve the least-squares problem: minimize ||A × x - b||²
 *
 * Uses the normal equations: (A^T × A) × x = A^T × b
 *
 * @param A - Coefficient matrix (m × n, m >= n)
 * @param b - Right-hand side vector
 * @returns Least-squares solution x
 */
export function solveLeastSquares(A: Matrix, b: Vector): Vector {
  const AT = transpose(A);
  const ATA = multiply(AT, A);
  const ATb = multiplyVec(AT, b);

  // Add small regularization to handle rank-deficient cases
  const n = ATA.length;
  for (let i = 0; i < n; i++) {
    ATA[i][i] += 1e-10;
  }

  return solve(ATA, ATb);
}

/**
 * Compute the pseudo-inverse solution: x = A⁺ × b
 *
 * For overdetermined systems (m > n), this gives the least-squares solution.
 * For underdetermined systems (m < n), this gives the minimum-norm solution.
 */
export function pseudoInverseSolve(A: Matrix, b: Vector): Vector {
  const m = A.length;
  const n = A[0]?.length ?? 0;

  if (m >= n) {
    // Overdetermined: use normal equations
    return solveLeastSquares(A, b);
  } else {
    // Underdetermined: minimize ||x||² subject to Ax = b
    // Solution: x = A^T × (A × A^T)^{-1} × b
    const AT = transpose(A);
    const AAT = multiply(A, AT);

    // Regularize
    for (let i = 0; i < m; i++) {
      AAT[i][i] += 1e-10;
    }

    const y = solve(AAT, b);
    return multiplyVec(AT, y);
  }
}

// =============================================================================
// Damped Least Squares (Levenberg-Marquardt)
// =============================================================================

/**
 * Solve the damped least-squares problem:
 * minimize ||A × x - b||² + λ²||x||²
 *
 * This is equivalent to solving (A^T × A + λ² I) × x = A^T × b
 *
 * @param A - Jacobian matrix
 * @param b - Residual vector (negated)
 * @param lambda - Damping factor
 * @returns Solution vector
 */
export function solveDamped(A: Matrix, b: Vector, lambda: number): Vector {
  const AT = transpose(A);
  const ATA = multiply(AT, A);
  const ATb = multiplyVec(AT, b);

  // Add damping term: λ² I
  const n = ATA.length;
  const lambdaSq = lambda * lambda;
  for (let i = 0; i < n; i++) {
    ATA[i][i] += lambdaSq;
  }

  return solve(ATA, ATb);
}

// =============================================================================
// Matrix Analysis
// =============================================================================

/**
 * Estimate the rank of a matrix using QR decomposition.
 * Returns the number of linearly independent rows/columns.
 */
export function estimateRank(A: Matrix, tolerance: number = 1e-10): number {
  const m = A.length;
  if (m === 0) return 0;
  const n = A[0].length;

  // Simple rank estimation using row echelon form
  const B = A.map(row => [...row]); // Copy
  let rank = 0;
  const rowUsed = new Array(m).fill(false);

  for (let col = 0; col < n && rank < m; col++) {
    // Find best pivot in this column
    let bestRow = -1;
    let bestVal = tolerance;
    for (let row = 0; row < m; row++) {
      if (!rowUsed[row] && Math.abs(B[row][col]) > bestVal) {
        bestVal = Math.abs(B[row][col]);
        bestRow = row;
      }
    }

    if (bestRow === -1) continue; // No pivot found

    rowUsed[bestRow] = true;
    rank++;

    // Eliminate this column in other rows
    for (let row = 0; row < m; row++) {
      if (row !== bestRow && Math.abs(B[row][col]) > tolerance) {
        const factor = B[row][col] / B[bestRow][col];
        for (let j = col; j < n; j++) {
          B[row][j] -= factor * B[bestRow][j];
        }
      }
    }
  }

  return rank;
}

/**
 * Compute the condition number estimate of a matrix.
 * High condition number indicates ill-conditioning.
 */
export function conditionNumberEstimate(A: Matrix): number {
  const m = A.length;
  if (m === 0) return 1;
  const n = A[0].length;

  // Estimate using max/min singular value ratio
  // Simple approximation using matrix norms
  let maxRowNorm = 0;
  let minNonZeroRowNorm = Infinity;

  for (let i = 0; i < m; i++) {
    let rowNorm = 0;
    for (let j = 0; j < n; j++) {
      rowNorm += A[i][j] * A[i][j];
    }
    rowNorm = Math.sqrt(rowNorm);

    if (rowNorm > maxRowNorm) maxRowNorm = rowNorm;
    if (rowNorm > 1e-10 && rowNorm < minNonZeroRowNorm) {
      minNonZeroRowNorm = rowNorm;
    }
  }

  if (minNonZeroRowNorm === Infinity || minNonZeroRowNorm < 1e-10) {
    return Infinity;
  }

  return maxRowNorm / minNonZeroRowNorm;
}
