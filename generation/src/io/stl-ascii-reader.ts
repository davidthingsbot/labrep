import { Mesh, OperationResult, createMesh, success, failure } from '../mesh/mesh';

const VERTEX_TOLERANCE = 1e-6;

/**
 * Parse an ASCII STL string into a Mesh.
 *
 * Vertices are de-duplicated by position (within tolerance) to produce
 * an indexed mesh. Per-vertex normals are computed by averaging the face
 * normals of all adjacent triangles.
 *
 * @param text - ASCII STL file content
 * @returns Mesh or failure
 */
export function stlAsciiToMesh(text: string): OperationResult<Mesh> {
  if (!text || text.trim().length === 0) {
    return failure('Empty STL input');
  }

  if (!text.trimStart().toLowerCase().startsWith('solid')) {
    return failure('Invalid ASCII STL: does not start with "solid"');
  }

  // Parse line by line for robustness
  const lines = text.split('\n').map(l => l.trim().toLowerCase());

  interface RawTriangle {
    normal: [number, number, number];
    verts: [number, number, number][];
  }

  const triangles: RawTriangle[] = [];
  let currentNormal: [number, number, number] | null = null;
  let currentVerts: [number, number, number][] = [];

  for (const line of lines) {
    if (line.startsWith('facet normal')) {
      const parts = line.split(/\s+/);
      currentNormal = [parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4])];
      currentVerts = [];
    } else if (line.startsWith('vertex')) {
      const parts = line.split(/\s+/);
      currentVerts.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (line.startsWith('endfacet')) {
      if (currentNormal && currentVerts.length === 3) {
        triangles.push({ normal: currentNormal, verts: currentVerts });
      }
      currentNormal = null;
      currentVerts = [];
    }
  }

  if (triangles.length === 0) {
    return failure('No valid facets found in STL');
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

  for (const tri of triangles) {
    const idx0 = getOrAddVertex(tri.verts[0][0], tri.verts[0][1], tri.verts[0][2]);
    const idx1 = getOrAddVertex(tri.verts[1][0], tri.verts[1][1], tri.verts[1][2]);
    const idx2 = getOrAddVertex(tri.verts[2][0], tri.verts[2][1], tri.verts[2][2]);
    indices.push(idx0, idx1, idx2);

    for (const idx of [idx0, idx1, idx2]) {
      const acc = vertexNormalAccum.get(idx);
      if (acc) {
        acc[0] += tri.normal[0];
        acc[1] += tri.normal[1];
        acc[2] += tri.normal[2];
      } else {
        vertexNormalAccum.set(idx, [...tri.normal]);
      }
    }
  }

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
