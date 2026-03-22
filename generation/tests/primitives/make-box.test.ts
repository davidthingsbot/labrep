import { describe, it, expect } from 'vitest';
import { makeBox } from '../../src/primitives/make-box';
import { meshVertexCount, meshTriangleCount, validateMesh } from '../../src/mesh/mesh';

describe('makeBox', () => {
  it('returns a successful OperationResult with a Mesh', () => {
    const result = makeBox(1, 1, 1);
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  it('box has 24 vertices (4 per face, 6 faces)', () => {
    const result = makeBox(1, 1, 1);
    expect(meshVertexCount(result.result!)).toBe(24);
  });

  it('box has 12 triangles (2 per face, 6 faces)', () => {
    const result = makeBox(1, 1, 1);
    expect(meshTriangleCount(result.result!)).toBe(12);
  });

  it('all normals are unit length', () => {
    const mesh = makeBox(1, 1, 1).result!;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const len = Math.sqrt(mesh.normals[i]**2 + mesh.normals[i+1]**2 + mesh.normals[i+2]**2);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it('top face normals point in +Y', () => {
    const mesh = makeBox(1, 1, 1).result!;
    // Find vertices with +Y normals and verify they sit on the top face (y = 0.5)
    let topCount = 0;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      if (Math.abs(mesh.normals[i + 1] - 1) < 0.001) {
        expect(mesh.vertices[i + 1]).toBeCloseTo(0.5, 5);
        expect(mesh.normals[i]).toBeCloseTo(0, 5);
        expect(mesh.normals[i + 2]).toBeCloseTo(0, 5);
        topCount++;
      }
    }
    expect(topCount).toBe(4); // 4 vertices on the top face
  });

  it('box with width=2, height=3, depth=4 has correct extents', () => {
    const mesh = makeBox(2, 3, 4).result!;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      minX = Math.min(minX, mesh.vertices[i]);
      maxX = Math.max(maxX, mesh.vertices[i]);
      minY = Math.min(minY, mesh.vertices[i+1]);
      maxY = Math.max(maxY, mesh.vertices[i+1]);
      minZ = Math.min(minZ, mesh.vertices[i+2]);
      maxZ = Math.max(maxZ, mesh.vertices[i+2]);
    }
    expect(maxX - minX).toBeCloseTo(2, 5);
    expect(maxY - minY).toBeCloseTo(3, 5);
    expect(maxZ - minZ).toBeCloseTo(4, 5);
  });

  it('returns error for zero width', () => {
    const result = makeBox(0, 1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error for negative dimensions', () => {
    const result = makeBox(-1, 1, 1);
    expect(result.success).toBe(false);
  });

  it('mesh passes validation', () => {
    const mesh = makeBox(1, 2, 3).result!;
    expect(validateMesh(mesh).success).toBe(true);
  });

  it('default box is centered at origin', () => {
    const mesh = makeBox(2, 2, 2).result!;
    let sumX = 0, sumY = 0, sumZ = 0;
    const count = meshVertexCount(mesh);
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      sumX += mesh.vertices[i];
      sumY += mesh.vertices[i+1];
      sumZ += mesh.vertices[i+2];
    }
    expect(sumX / count).toBeCloseTo(0, 5);
    expect(sumY / count).toBeCloseTo(0, 5);
    expect(sumZ / count).toBeCloseTo(0, 5);
  });
});
