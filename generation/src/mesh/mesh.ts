/**
 * A triangulated mesh suitable for rendering.
 *
 * Vertices and normals are stored as flat, interleaved XYZ triples.
 * Indices reference vertices by position (0-based) and are grouped
 * in triples that define triangles with counter-clockwise winding
 * when viewed from outside the surface.
 *
 * Invariant: `vertices.length === normals.length` and every value in
 * `indices` is less than `vertices.length / 3`.
 */
export interface Mesh {
  readonly vertices: Float32Array;  // [x0,y0,z0, x1,y1,z1, ...] flat
  readonly normals: Float32Array;   // [nx0,ny0,nz0, ...] per-vertex
  readonly indices: Uint32Array;    // triangle indices
}

/**
 * Result of a fallible operation.
 *
 * When `success` is `true`, `result` contains the computed value and
 * `warnings` may list non-fatal issues. When `success` is `false`,
 * `error` describes why the operation failed and `result` is undefined.
 */
export interface OperationResult<T> {
  readonly success: boolean;
  readonly result?: T;
  readonly error?: string;
  readonly warnings?: string[];
}

/**
 * Create a Mesh from pre-built typed arrays.
 *
 * No validation is performed; call {@link validateMesh} to check consistency.
 *
 * @param vertices - Flat array of vertex positions (XYZ triples).
 * @param normals - Flat array of per-vertex normals (XYZ triples, same length as `vertices`).
 * @param indices - Triangle index buffer (triples of 0-based vertex indices).
 * @returns A new Mesh wrapping the provided arrays.
 */
export function createMesh(
  vertices: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
): Mesh {
  return { vertices, normals, indices };
}

/**
 * Count the number of vertices in a mesh.
 *
 * @param m - The mesh to inspect.
 * @returns The vertex count (i.e. `vertices.length / 3`).
 */
export function meshVertexCount(m: Mesh): number {
  return m.vertices.length / 3;
}

/**
 * Count the number of triangles in a mesh.
 *
 * @param m - The mesh to inspect.
 * @returns The triangle count (i.e. `indices.length / 3`).
 */
export function meshTriangleCount(m: Mesh): number {
  return m.indices.length / 3;
}

/**
 * Validate mesh consistency.
 *
 * Checks that the normals array matches the vertices array in length
 * and that every index falls within the valid vertex range.
 *
 * @param m - The mesh to validate.
 * @returns A successful result containing the same mesh, or a failure
 *          describing the first inconsistency found.
 */
export function validateMesh(m: Mesh): OperationResult<Mesh> {
  if (m.normals.length !== m.vertices.length) {
    return failure(`normals length (${m.normals.length}) does not match vertices length (${m.vertices.length})`);
  }
  const vertexCount = meshVertexCount(m);
  for (let i = 0; i < m.indices.length; i++) {
    if (m.indices[i] >= vertexCount) {
      return failure(`index ${m.indices[i]} at position ${i} is out of range (${vertexCount} vertices)`);
    }
  }
  return success(m);
}

/**
 * Create a successful operation result.
 *
 * @param result - The value produced by the operation.
 * @param warnings - Optional non-fatal warnings encountered during the operation.
 * @returns An {@link OperationResult} with `success: true`.
 */
export function success<T>(result: T, warnings?: string[]): OperationResult<T> {
  return { success: true, result, warnings };
}

/**
 * Create a failed operation result.
 *
 * @param error - A human-readable description of what went wrong.
 * @returns An {@link OperationResult} with `success: false`.
 */
export function failure<T>(error: string): OperationResult<T> {
  return { success: false, error };
}
