import { describe, it, expect } from 'vitest';
import { makeCylinder } from '../../src/primitives/make-cylinder';
import { meshVertexCount, meshTriangleCount, validateMesh } from '../../src/mesh/mesh';

describe('makeCylinder', () => {
  it('returns a successful OperationResult with a Mesh', () => {
    const result = makeCylinder(1, 2);
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  it('cylinder is aligned along Y axis (height goes from -h/2 to h/2)', () => {
    const mesh = makeCylinder(1, 4).result!;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      minY = Math.min(minY, mesh.vertices[i + 1]);
      maxY = Math.max(maxY, mesh.vertices[i + 1]);
    }
    expect(minY).toBeCloseTo(-2, 5);
    expect(maxY).toBeCloseTo(2, 5);
  });

  it('side vertices are at distance radius from Y axis', () => {
    const radius = 3;
    const mesh = makeCylinder(radius, 2, { segments: 16 }).result!;
    // Side vertices should be exactly at the given radius
    // (cap center vertices are at distance 0, so skip those)
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i];
      const z = mesh.vertices[i + 2];
      const dist = Math.sqrt(x * x + z * z);
      // Each vertex is either at radius (ring) or at origin (cap center)
      if (dist > 0.001) {
        expect(dist).toBeCloseTo(radius, 5);
      }
    }
  });

  it('top cap vertices have y = height/2', () => {
    const height = 6;
    const mesh = makeCylinder(1, height, { segments: 8 }).result!;
    // Find vertices with normal pointing up (+Y) — those belong to top cap
    let foundTopCap = false;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      if (mesh.normals[i + 1] > 0.99) {
        // This is a top-cap vertex; its y should be height/2
        expect(mesh.vertices[i + 1]).toBeCloseTo(height / 2, 5);
        foundTopCap = true;
      }
    }
    expect(foundTopCap).toBe(true);
  });

  it('bottom cap vertices have y = -height/2', () => {
    const height = 6;
    const mesh = makeCylinder(1, height, { segments: 8 }).result!;
    let foundBottomCap = false;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      if (mesh.normals[i + 1] < -0.99) {
        expect(mesh.vertices[i + 1]).toBeCloseTo(-height / 2, 5);
        foundBottomCap = true;
      }
    }
    expect(foundBottomCap).toBe(true);
  });

  it('side normals point outward (perpendicular to Y axis, unit length)', () => {
    const mesh = makeCylinder(1, 2, { segments: 16 }).result!;
    // Side normals have ny=0 and (nx,nz) is a unit vector
    let foundSideNormal = false;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nx = mesh.normals[i];
      const ny = mesh.normals[i + 1];
      const nz = mesh.normals[i + 2];
      // Identify side normals: ny should be 0 (not +1 or -1)
      if (Math.abs(ny) < 0.001) {
        const len = Math.sqrt(nx * nx + nz * nz);
        expect(len).toBeCloseTo(1, 5);
        // Normal should point outward: same direction as vertex position in XZ
        const vx = mesh.vertices[i];
        const vz = mesh.vertices[i + 2];
        const dot = nx * vx + nz * vz;
        expect(dot).toBeGreaterThan(0);
        foundSideNormal = true;
      }
    }
    expect(foundSideNormal).toBe(true);
  });

  it('top cap normals point in +Y', () => {
    const mesh = makeCylinder(1, 2, { segments: 8 }).result!;
    let count = 0;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      if (mesh.normals[i + 1] > 0.99) {
        expect(mesh.normals[i]).toBeCloseTo(0, 5);
        expect(mesh.normals[i + 1]).toBeCloseTo(1, 5);
        expect(mesh.normals[i + 2]).toBeCloseTo(0, 5);
        count++;
      }
    }
    // segments + 1 center vertex for the top cap
    expect(count).toBe(8 + 1);
  });

  it('bottom cap normals point in -Y', () => {
    const mesh = makeCylinder(1, 2, { segments: 8 }).result!;
    let count = 0;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      if (mesh.normals[i + 1] < -0.99) {
        expect(mesh.normals[i]).toBeCloseTo(0, 5);
        expect(mesh.normals[i + 1]).toBeCloseTo(-1, 5);
        expect(mesh.normals[i + 2]).toBeCloseTo(0, 5);
        count++;
      }
    }
    expect(count).toBe(8 + 1);
  });

  it('returns error for zero radius', () => {
    const result = makeCylinder(0, 2);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error for zero height', () => {
    const result = makeCylinder(1, 0);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error for negative dimensions', () => {
    expect(makeCylinder(-1, 2).success).toBe(false);
    expect(makeCylinder(1, -2).success).toBe(false);
  });

  it('accepts segments parameter', () => {
    const r8 = makeCylinder(1, 2, { segments: 8 });
    const r16 = makeCylinder(1, 2, { segments: 16 });
    expect(r8.success).toBe(true);
    expect(r16.success).toBe(true);
    // More segments means more vertices
    expect(meshVertexCount(r16.result!)).toBeGreaterThan(meshVertexCount(r8.result!));
  });

  it('mesh passes validation', () => {
    const mesh = makeCylinder(1, 2).result!;
    expect(validateMesh(mesh).success).toBe(true);
  });
});
