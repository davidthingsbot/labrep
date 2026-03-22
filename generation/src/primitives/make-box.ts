import { Mesh, OperationResult, createMesh, success, failure } from '../mesh/mesh';

/**
 * Create a box mesh centered at the origin.
 * @param width  extent along X
 * @param height extent along Y
 * @param depth  extent along Z
 */
export function makeBox(
  width: number,
  height: number,
  depth: number,
): OperationResult<Mesh> {
  if (width <= 0 || height <= 0 || depth <= 0) {
    return failure('All dimensions must be positive');
  }

  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;

  // 6 faces, 4 vertices each = 24 vertices
  // Each face: [position x3, normal x3] x 4 vertices
  // prettier-ignore
  const faceData: Array<{ normal: [number, number, number]; corners: [number, number, number][] }> = [
    // +X face
    { normal: [1, 0, 0], corners: [[ hw, -hh, -hd], [ hw,  hh, -hd], [ hw,  hh,  hd], [ hw, -hh,  hd]] },
    // -X face
    { normal: [-1, 0, 0], corners: [[-hw, -hh,  hd], [-hw,  hh,  hd], [-hw,  hh, -hd], [-hw, -hh, -hd]] },
    // +Y face
    { normal: [0, 1, 0], corners: [[-hw,  hh, -hd], [ hw,  hh, -hd], [ hw,  hh,  hd], [-hw,  hh,  hd]] },
    // -Y face
    { normal: [0, -1, 0], corners: [[-hw, -hh,  hd], [ hw, -hh,  hd], [ hw, -hh, -hd], [-hw, -hh, -hd]] },
    // +Z face
    { normal: [0, 0, 1], corners: [[-hw, -hh,  hd], [ hw, -hh,  hd], [ hw,  hh,  hd], [-hw,  hh,  hd]] },
    // -Z face
    { normal: [0, 0, -1], corners: [[ hw, -hh, -hd], [-hw, -hh, -hd], [-hw,  hh, -hd], [ hw,  hh, -hd]] },
  ];

  const vertices = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const indices = new Uint32Array(12 * 3);

  let vi = 0; // vertex component index
  let ii = 0; // index array index

  for (let f = 0; f < faceData.length; f++) {
    const { normal, corners } = faceData[f];
    const base = f * 4; // base vertex index for this face

    for (const corner of corners) {
      vertices[vi] = corner[0];
      vertices[vi + 1] = corner[1];
      vertices[vi + 2] = corner[2];
      normals[vi] = normal[0];
      normals[vi + 1] = normal[1];
      normals[vi + 2] = normal[2];
      vi += 3;
    }

    // Two triangles per face (CCW winding viewed from outside)
    indices[ii++] = base;
    indices[ii++] = base + 1;
    indices[ii++] = base + 2;
    indices[ii++] = base;
    indices[ii++] = base + 2;
    indices[ii++] = base + 3;
  }

  return success(createMesh(vertices, normals, indices));
}
