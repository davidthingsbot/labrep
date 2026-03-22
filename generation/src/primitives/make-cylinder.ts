import { Mesh, OperationResult, createMesh, success, failure } from '../mesh/mesh';

/**
 * Create a cylinder mesh centered at the origin, aligned along the Y axis.
 *
 * The cylinder extends from -height/2 to +height/2. It consists of three
 * parts: the side barrel, a top cap, and a bottom cap. Vertices are
 * duplicated at the seam edges so that each part has its own normals.
 */
export function makeCylinder(
  radius: number,
  height: number,
  options?: { segments?: number },
): OperationResult<Mesh> {
  if (radius <= 0) return failure('radius must be positive');
  if (height <= 0) return failure('height must be positive');

  const segments = options?.segments ?? 32;
  const halfH = height / 2;

  // Vertex counts:
  // Side barrel: (segments + 1) * 2 — extra column to close the seam
  // Top cap: 1 center + segments ring vertices
  // Bottom cap: 1 center + segments ring vertices
  const sideVerts = (segments + 1) * 2;
  const capVerts = 1 + segments;
  const totalVerts = sideVerts + capVerts * 2;

  // Triangle counts:
  // Side: segments * 2
  // Top cap: segments
  // Bottom cap: segments
  const totalTris = segments * 2 + segments + segments;

  const vertices = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalTris * 3);

  let vi = 0; // vertex write index (in floats)
  let ii = 0; // index write index

  // Helper: push a vertex + normal
  function vert(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
    vertices[vi] = x;
    vertices[vi + 1] = y;
    vertices[vi + 2] = z;
    normals[vi] = nx;
    normals[vi + 1] = ny;
    normals[vi + 2] = nz;
    vi += 3;
  }

  // --- Side barrel ---
  const sideBase = 0; // first vertex index for sides
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x = radius * cos;
    const z = radius * sin;
    // Top ring vertex
    vert(x, halfH, z, cos, 0, sin);
    // Bottom ring vertex
    vert(x, -halfH, z, cos, 0, sin);
  }

  // Side indices: quads made of 2 triangles per segment
  for (let i = 0; i < segments; i++) {
    const topCur = sideBase + i * 2;
    const botCur = topCur + 1;
    const topNext = topCur + 2;
    const botNext = topCur + 3;

    // Triangle 1 (upper-left triangle of quad)
    indices[ii++] = topCur;
    indices[ii++] = botCur;
    indices[ii++] = topNext;

    // Triangle 2 (lower-right triangle of quad)
    indices[ii++] = topNext;
    indices[ii++] = botCur;
    indices[ii++] = botNext;
  }

  // --- Top cap ---
  const topCenterIdx = vi / 3;
  vert(0, halfH, 0, 0, 1, 0); // center vertex
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    vert(radius * Math.cos(theta), halfH, radius * Math.sin(theta), 0, 1, 0);
  }
  // Triangle fan
  for (let i = 0; i < segments; i++) {
    const cur = topCenterIdx + 1 + i;
    const next = topCenterIdx + 1 + ((i + 1) % segments);
    indices[ii++] = topCenterIdx;
    indices[ii++] = cur;
    indices[ii++] = next;
  }

  // --- Bottom cap ---
  const botCenterIdx = vi / 3;
  vert(0, -halfH, 0, 0, -1, 0); // center vertex
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    vert(radius * Math.cos(theta), -halfH, radius * Math.sin(theta), 0, -1, 0);
  }
  // Triangle fan (wound opposite to top cap)
  for (let i = 0; i < segments; i++) {
    const cur = botCenterIdx + 1 + i;
    const next = botCenterIdx + 1 + ((i + 1) % segments);
    indices[ii++] = botCenterIdx;
    indices[ii++] = next;
    indices[ii++] = cur;
  }

  return success(createMesh(vertices, normals, indices));
}
