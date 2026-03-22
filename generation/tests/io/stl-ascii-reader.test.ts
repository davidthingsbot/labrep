import { describe, it, expect } from 'vitest';
import { stlAsciiToMesh } from '../../src/io/stl-ascii-reader';
import { meshTriangleCount, meshVertexCount } from '../../src/index';

const SINGLE_TRIANGLE = `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test`;

const TETRAHEDRON = `solid tet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0.5 0.866 0
    endloop
  endfacet
  facet normal 0 -0.471 0.882
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0.5 0.289 0.816
    endloop
  endfacet
  facet normal -0.816 0.236 0.527
    outer loop
      vertex 0 0 0
      vertex 0.5 0.866 0
      vertex 0.5 0.289 0.816
    endloop
  endfacet
  facet normal 0.816 0.236 0.527
    outer loop
      vertex 1 0 0
      vertex 0.5 0.866 0
      vertex 0.5 0.289 0.816
    endloop
  endfacet
endsolid tet`;

describe('stlAsciiToMesh', () => {
  it('parses a single triangle', () => {
    const result = stlAsciiToMesh(SINGLE_TRIANGLE);
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(1);
  });

  it('parses a tetrahedron (4 triangles)', () => {
    const result = stlAsciiToMesh(TETRAHEDRON);
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(4);
  });

  it('de-duplicates shared vertices', () => {
    // A tetrahedron has 4 unique vertices, but STL stores 12 (3 per face)
    const result = stlAsciiToMesh(TETRAHEDRON);
    expect(result.success).toBe(true);
    expect(meshVertexCount(result.result!)).toBe(4);
  });

  it('single triangle has 3 unique vertices', () => {
    const result = stlAsciiToMesh(SINGLE_TRIANGLE);
    expect(result.success).toBe(true);
    expect(meshVertexCount(result.result!)).toBe(3);
  });

  it('vertices have correct positions', () => {
    const result = stlAsciiToMesh(SINGLE_TRIANGLE);
    const verts = result.result!.vertices;
    // 3 vertices × 3 components = 9 floats
    expect(verts.length).toBe(9);
    // vertex 0: (0, 0, 0)
    expect(verts[0]).toBeCloseTo(0);
    expect(verts[1]).toBeCloseTo(0);
    expect(verts[2]).toBeCloseTo(0);
  });

  it('computes per-vertex normals', () => {
    const result = stlAsciiToMesh(SINGLE_TRIANGLE);
    const normals = result.result!.normals;
    expect(normals.length).toBe(result.result!.vertices.length);
    // For a single triangle with normal (0,0,1), all vertex normals should be (0,0,1)
    for (let i = 0; i < 3; i++) {
      expect(normals[i * 3 + 2]).toBeCloseTo(1, 3); // z component ≈ 1
    }
  });

  it('rejects empty input', () => {
    const result = stlAsciiToMesh('');
    expect(result.success).toBe(false);
  });

  it('rejects malformed input', () => {
    const result = stlAsciiToMesh('not a valid stl file');
    expect(result.success).toBe(false);
  });

  it('handles case-insensitive keywords', () => {
    const upper = `SOLID test
  FACET NORMAL 0 0 1
    OUTER LOOP
      VERTEX 0 0 0
      VERTEX 1 0 0
      VERTEX 0 1 0
    ENDLOOP
  ENDFACET
ENDSOLID test`;
    const result = stlAsciiToMesh(upper);
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(1);
  });

  it('handles scientific notation in coordinates', () => {
    const sci = `solid test
  facet normal 0 0 1
    outer loop
      vertex 1.5e-3 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test`;
    const result = stlAsciiToMesh(sci);
    expect(result.success).toBe(true);
    expect(result.result!.vertices[0]).toBeCloseTo(0.0015, 6);
  });
});
