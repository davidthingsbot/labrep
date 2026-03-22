import { Mesh } from '../mesh/mesh';

/**
 * Export a Mesh to ASCII STL format.
 *
 * Each triangle is written as an independent facet with a computed face normal.
 * The normal is derived from the cross product of two edges (right-hand rule
 * applied to the vertex order in our index buffer).
 *
 * @param mesh - The mesh to export
 * @param name - Solid name (default: 'labrep')
 * @returns STL file content as a string
 */
export function meshToStlAscii(mesh: Mesh, name: string = 'labrep'): string {
  const verts = mesh.vertices;
  const indices = mesh.indices;
  const triCount = indices.length / 3;

  const lines: string[] = [`solid ${name}`];

  for (let i = 0; i < triCount; i++) {
    const i0 = indices[i * 3] * 3;
    const i1 = indices[i * 3 + 1] * 3;
    const i2 = indices[i * 3 + 2] * 3;

    // Vertex positions
    const v0x = verts[i0],     v0y = verts[i0 + 1], v0z = verts[i0 + 2];
    const v1x = verts[i1],     v1y = verts[i1 + 1], v1z = verts[i1 + 2];
    const v2x = verts[i2],     v2y = verts[i2 + 1], v2z = verts[i2 + 2];

    // Edge vectors
    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;

    // Cross product for face normal
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    lines.push(`  facet normal ${nx} ${ny} ${nz}`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${v0x} ${v0y} ${v0z}`);
    lines.push(`      vertex ${v1x} ${v1y} ${v1z}`);
    lines.push(`      vertex ${v2x} ${v2y} ${v2z}`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
  }

  lines.push(`endsolid ${name}`);
  return lines.join('\n');
}
