import { describe, it, expect } from 'vitest';
import {
  type Mesh,
  createMesh,
  meshVertexCount,
  meshTriangleCount,
  validateMesh,
  type OperationResult,
  success,
  failure,
} from '../../src/mesh/mesh';

describe('Mesh', () => {
  const triangleMesh: Mesh = {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  };

  it('can create a mesh with vertices, normals, and indices', () => {
    const m = createMesh(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      new Uint32Array([0, 1, 2]),
    );
    expect(m.vertices.length).toBe(9);
    expect(m.normals.length).toBe(9);
    expect(m.indices.length).toBe(3);
  });

  it('vertex count is vertices.length / 3', () => {
    expect(meshVertexCount(triangleMesh)).toBe(3);
  });

  it('triangle count is indices.length / 3', () => {
    expect(meshTriangleCount(triangleMesh)).toBe(1);
  });

  it('validates that normals length matches vertices length', () => {
    const bad: Mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0]),
      normals: new Float32Array([0, 0, 1]),
      indices: new Uint32Array([0, 1]),
    };
    const result = validateMesh(bad);
    expect(result.success).toBe(false);
    expect(result.error).toContain('normals');
  });

  it('validates that indices reference valid vertices', () => {
    const bad: Mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 5]), // index 5 is out of range
    };
    const result = validateMesh(bad);
    expect(result.success).toBe(false);
    expect(result.error).toContain('index');
  });

  it('validates a correct mesh successfully', () => {
    const result = validateMesh(triangleMesh);
    expect(result.success).toBe(true);
    expect(result.result).toBe(triangleMesh);
  });
});

describe('OperationResult', () => {
  it('success result has result value', () => {
    const r = success(42);
    expect(r.success).toBe(true);
    expect(r.result).toBe(42);
    expect(r.error).toBeUndefined();
  });

  it('failure result has error message', () => {
    const r = failure<number>('something went wrong');
    expect(r.success).toBe(false);
    expect(r.error).toBe('something went wrong');
    expect(r.result).toBeUndefined();
  });

  it('can include warnings on success', () => {
    const r = success(42, ['minor issue']);
    expect(r.success).toBe(true);
    expect(r.warnings).toEqual(['minor issue']);
  });

  // Edge cases
  it('handles empty mesh', () => {
    const mesh: Mesh = { vertices: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) };
    expect(meshVertexCount(mesh)).toBe(0);
    expect(meshTriangleCount(mesh)).toBe(0);
  });

  it('handles single triangle mesh', () => {
    const mesh: Mesh = {
      vertices: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
      normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
      indices: new Uint32Array([0, 1, 2]),
    };
    expect(meshVertexCount(mesh)).toBe(3);
    expect(meshTriangleCount(mesh)).toBe(1);
  });

  it('validateMesh catches mismatched vertex/normal count', () => {
    const mesh: Mesh = {
      vertices: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
      normals: new Float32Array([0,0,1, 0,0,1]), // Only 2 normals, need 3
      indices: new Uint32Array([0, 1, 2]),
    };
    const result = validateMesh(mesh);
    expect(result.success).toBe(false);
  });

  it('validateMesh catches out-of-bounds index', () => {
    const mesh: Mesh = {
      vertices: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
      normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
      indices: new Uint32Array([0, 1, 99]), // 99 is out of bounds
    };
    const result = validateMesh(mesh);
    expect(result.success).toBe(false);
  });
});
