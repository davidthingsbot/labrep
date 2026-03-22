import {
  Mesh,
  OperationResult,
  createMesh,
  success,
  failure,
} from "../mesh/mesh";

/**
 * Generate a UV sphere mesh centered at the origin.
 *
 * The sphere is tessellated using a latitude/longitude grid. The south
 * pole sits at `(0, -radius, 0)` and the north pole at `(0, radius, 0)`.
 * Normals point outward and are smooth (per-vertex, not per-face).
 *
 * Higher `segments` and `rings` values produce a smoother sphere at the
 * cost of more geometry.
 *
 * @param radius - Sphere radius (must be positive).
 * @param options - Optional tessellation controls.
 * @param options.segments - Number of longitudinal divisions (default 32).
 * @param options.rings - Number of latitudinal divisions (default 16).
 * @returns A successful result containing the sphere mesh, or a failure
 *          if `radius` is non-positive.
 */
export function makeSphere(
  radius: number,
  options?: { segments?: number; rings?: number },
): OperationResult<Mesh> {
  if (radius <= 0) {
    return failure<Mesh>(`radius must be positive, got ${radius}`);
  }

  const segments = options?.segments ?? 32;
  const rings = options?.rings ?? 16;

  // Vertex layout:
  //   index 0            = south pole  (bottom)
  //   1 .. rings-1 rows  = ring vertices (rings-1 rows x segments cols)
  //   last index         = north pole  (top)
  const vertexCount = (rings - 1) * segments + 2;
  const vertices = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);

  // South pole
  vertices[0] = 0;
  vertices[1] = -radius;
  vertices[2] = 0;
  normals[0] = 0;
  normals[1] = -1;
  normals[2] = 0;

  // Ring vertices (latitude bands from south to north, excluding poles)
  let idx = 1;
  for (let ring = 1; ring < rings; ring++) {
    const phi = Math.PI * (ring / rings) - Math.PI / 2; // -PI/2 .. +PI/2
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    for (let seg = 0; seg < segments; seg++) {
      const theta = (2 * Math.PI * seg) / segments;
      const nx = cosPhi * Math.cos(theta);
      const ny = sinPhi;
      const nz = cosPhi * Math.sin(theta);

      const vi = idx * 3;
      vertices[vi] = nx * radius;
      vertices[vi + 1] = ny * radius;
      vertices[vi + 2] = nz * radius;
      normals[vi] = nx;
      normals[vi + 1] = ny;
      normals[vi + 2] = nz;
      idx++;
    }
  }

  // North pole
  const npIdx = idx * 3;
  vertices[npIdx] = 0;
  vertices[npIdx + 1] = radius;
  vertices[npIdx + 2] = 0;
  normals[npIdx] = 0;
  normals[npIdx + 1] = 1;
  normals[npIdx + 2] = 0;

  // Index buffer
  // South pole cap: segments triangles
  // Middle bands: (rings - 2) bands x segments x 2 triangles
  // North pole cap: segments triangles
  const triCount = segments * 2 + (rings - 2) * segments * 2;
  const indices = new Uint32Array(triCount * 3);
  let ii = 0;

  const southPole = 0;
  const northPole = vertexCount - 1;

  // Helper: index of ring vertex at (ring 1-based from south, segment)
  const ringVertex = (r: number, s: number): number =>
    1 + (r - 1) * segments + (s % segments);

  // South pole cap (ring = 1)
  // Winding: (pole, s, s+1) for consistent CW from outside
  for (let s = 0; s < segments; s++) {
    indices[ii++] = southPole;
    indices[ii++] = ringVertex(1, s);
    indices[ii++] = ringVertex(1, s + 1);
  }

  // Middle bands
  for (let r = 1; r < rings - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const curr = ringVertex(r, s);
      const next = ringVertex(r, s + 1);
      const currUp = ringVertex(r + 1, s);
      const nextUp = ringVertex(r + 1, s + 1);

      // Triangle 1
      indices[ii++] = curr;
      indices[ii++] = nextUp;
      indices[ii++] = next;

      // Triangle 2
      indices[ii++] = curr;
      indices[ii++] = currUp;
      indices[ii++] = nextUp;
    }
  }

  // North pole cap (ring = rings - 1)
  // Winding must match south pole cap: (pole, s+1, s) for consistent CW from outside
  for (let s = 0; s < segments; s++) {
    indices[ii++] = northPole;
    indices[ii++] = ringVertex(rings - 1, s + 1);
    indices[ii++] = ringVertex(rings - 1, s);
  }

  return success(createMesh(vertices, normals, indices));
}
