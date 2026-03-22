import { Mesh } from '../mesh/mesh';

/**
 * Export a Mesh to binary STL format.
 *
 * Binary layout:
 *   80 bytes  — header (zeros)
 *   4 bytes   — triangle count (uint32 LE)
 *   Per triangle (50 bytes each):
 *     12 bytes — normal (3×float32 LE)
 *     36 bytes — 3 vertices (3×3×float32 LE)
 *     2 bytes  — attribute byte count (uint16 LE, always 0)
 *
 * @param mesh - The mesh to export
 * @returns STL file content as an ArrayBuffer
 */
export function meshToStlBinary(mesh: Mesh): ArrayBuffer {
  const verts = mesh.vertices;
  const indices = mesh.indices;
  const triCount = indices.length / 3;

  const bufSize = 84 + 50 * triCount;
  const buf = new ArrayBuffer(bufSize);
  const view = new DataView(buf);

  // Header: 80 bytes of zeros (already zeroed by ArrayBuffer)
  // Triangle count at offset 80
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const i0 = indices[i * 3] * 3;
    const i1 = indices[i * 3 + 1] * 3;
    const i2 = indices[i * 3 + 2] * 3;

    const v0x = verts[i0],     v0y = verts[i0 + 1], v0z = verts[i0 + 2];
    const v1x = verts[i1],     v1y = verts[i1 + 1], v1z = verts[i1 + 2];
    const v2x = verts[i2],     v2y = verts[i2 + 1], v2z = verts[i2 + 2];

    // Cross product for face normal
    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    // Normal
    view.setFloat32(offset, nx, true);      offset += 4;
    view.setFloat32(offset, ny, true);      offset += 4;
    view.setFloat32(offset, nz, true);      offset += 4;
    // Vertex 0
    view.setFloat32(offset, v0x, true);     offset += 4;
    view.setFloat32(offset, v0y, true);     offset += 4;
    view.setFloat32(offset, v0z, true);     offset += 4;
    // Vertex 1
    view.setFloat32(offset, v1x, true);     offset += 4;
    view.setFloat32(offset, v1y, true);     offset += 4;
    view.setFloat32(offset, v1z, true);     offset += 4;
    // Vertex 2
    view.setFloat32(offset, v2x, true);     offset += 4;
    view.setFloat32(offset, v2y, true);     offset += 4;
    view.setFloat32(offset, v2z, true);     offset += 4;
    // Attribute bytes (0)
    view.setUint16(offset, 0, true);        offset += 2;
  }

  return buf;
}
