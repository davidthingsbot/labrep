import { Mesh, OperationResult, createMesh, success, failure } from '../mesh/mesh';

const VERTEX_TOLERANCE = 1e-5; // float32 precision needs slightly larger tolerance

/**
 * Parse a binary STL ArrayBuffer into a Mesh.
 *
 * Vertices are de-duplicated by position (within tolerance) to produce
 * an indexed mesh. Per-vertex normals are computed by averaging the face
 * normals of all adjacent triangles.
 *
 * @param data - Binary STL file content
 * @returns Mesh or failure
 */
export function stlBinaryToMesh(data: ArrayBuffer): OperationResult<Mesh> {
  if (data.byteLength < 84) {
    return failure('Binary STL too small: must be at least 84 bytes');
  }

  const view = new DataView(data);
  const triCount = view.getUint32(80, true);
  const expectedSize = 84 + 50 * triCount;

  if (data.byteLength !== expectedSize) {
    return failure(`Binary STL size mismatch: expected ${expectedSize} bytes, got ${data.byteLength}`);
  }

  if (triCount === 0) {
    return failure('Binary STL has zero triangles');
  }

  // De-duplicate vertices by spatial hashing
  const uniqueVerts: number[] = [];
  const vertexMap = new Map<string, number>();

  function getOrAddVertex(x: number, y: number, z: number): number {
    const qx = Math.round(x / VERTEX_TOLERANCE) * VERTEX_TOLERANCE;
    const qy = Math.round(y / VERTEX_TOLERANCE) * VERTEX_TOLERANCE;
    const qz = Math.round(z / VERTEX_TOLERANCE) * VERTEX_TOLERANCE;
    const key = `${qx},${qy},${qz}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const idx = uniqueVerts.length / 3;
    uniqueVerts.push(x, y, z);
    vertexMap.set(key, idx);
    return idx;
  }

  const indices: number[] = [];
  const vertexNormalAccum = new Map<number, [number, number, number]>();

  for (let i = 0; i < triCount; i++) {
    const offset = 84 + i * 50;

    // Face normal
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);

    // 3 vertices
    const triIndices: number[] = [];
    for (let v = 0; v < 3; v++) {
      const voff = offset + 12 + v * 12;
      const x = view.getFloat32(voff, true);
      const y = view.getFloat32(voff + 4, true);
      const z = view.getFloat32(voff + 8, true);
      triIndices.push(getOrAddVertex(x, y, z));
    }

    indices.push(triIndices[0], triIndices[1], triIndices[2]);

    // Accumulate face normal
    for (const idx of triIndices) {
      const acc = vertexNormalAccum.get(idx);
      if (acc) {
        acc[0] += nx;
        acc[1] += ny;
        acc[2] += nz;
      } else {
        vertexNormalAccum.set(idx, [nx, ny, nz]);
      }
    }
  }

  // Build normals
  const normals = new Float32Array(uniqueVerts.length);
  for (let i = 0; i < uniqueVerts.length / 3; i++) {
    const acc = vertexNormalAccum.get(i);
    if (acc) {
      const len = Math.sqrt(acc[0] * acc[0] + acc[1] * acc[1] + acc[2] * acc[2]);
      if (len > 0) {
        normals[i * 3] = acc[0] / len;
        normals[i * 3 + 1] = acc[1] / len;
        normals[i * 3 + 2] = acc[2] / len;
      }
    }
  }

  return success(createMesh(
    new Float32Array(uniqueVerts),
    normals,
    new Uint32Array(indices),
  ));
}
