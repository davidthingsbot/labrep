/** A triangulated mesh suitable for rendering. */
export interface Mesh {
  readonly vertices: Float32Array;  // [x0,y0,z0, x1,y1,z1, ...] flat
  readonly normals: Float32Array;   // [nx0,ny0,nz0, ...] per-vertex
  readonly indices: Uint32Array;    // triangle indices
}

/** Result of a fallible operation. */
export interface OperationResult<T> {
  readonly success: boolean;
  readonly result?: T;
  readonly error?: string;
  readonly warnings?: string[];
}

/** Create a Mesh from typed arrays. */
export function createMesh(
  vertices: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
): Mesh {
  return { vertices, normals, indices };
}

/** Number of vertices in a mesh. */
export function meshVertexCount(m: Mesh): number {
  return m.vertices.length / 3;
}

/** Number of triangles in a mesh. */
export function meshTriangleCount(m: Mesh): number {
  return m.indices.length / 3;
}

/** Validate mesh consistency. */
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

/** Create a successful result. */
export function success<T>(result: T, warnings?: string[]): OperationResult<T> {
  return { success: true, result, warnings };
}

/** Create a failure result. */
export function failure<T>(error: string): OperationResult<T> {
  return { success: false, error };
}
