import { describe, it, expect } from "vitest";
import { makeSphere } from "../../src/primitives/make-sphere";
import {
  Mesh,
  meshVertexCount,
  meshTriangleCount,
  validateMesh,
} from "../../src/mesh/mesh";

describe("makeSphere", () => {
  it("returns a successful OperationResult with a Mesh", () => {
    const result = makeSphere(1);
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result!.vertices).toBeInstanceOf(Float32Array);
    expect(result.result!.normals).toBeInstanceOf(Float32Array);
    expect(result.result!.indices).toBeInstanceOf(Uint32Array);
  });

  it("all vertices are at distance radius from origin (within tolerance)", () => {
    const radius = 2.5;
    const result = makeSphere(radius);
    const verts = result.result!.vertices;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i], y = verts[i + 1], z = verts[i + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      expect(dist).toBeCloseTo(radius, 5);
    }
  });

  it("all normals are unit length", () => {
    const result = makeSphere(3);
    const normals = result.result!.normals;
    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it("normals point outward (normal direction matches vertex direction from origin)", () => {
    const result = makeSphere(2);
    const verts = result.result!.vertices;
    const normals = result.result!.normals;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i], y = verts[i + 1], z = verts[i + 2];
      const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
      // dot product of position and normal should be positive (outward)
      const dot = x * nx + y * ny + z * nz;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("returns error for zero radius", () => {
    const result = makeSphere(0);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns error for negative radius", () => {
    const result = makeSphere(-1);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("accepts segments and rings parameters for quality", () => {
    const result = makeSphere(1, { segments: 16, rings: 8 });
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  it("more segments produces more triangles", () => {
    const low = makeSphere(1, { segments: 8, rings: 8 });
    const high = makeSphere(1, { segments: 32, rings: 8 });
    const lowCount = meshTriangleCount(low.result!);
    const highCount = meshTriangleCount(high.result!);
    expect(highCount).toBeGreaterThan(lowCount);
  });

  it("mesh passes validation", () => {
    const result = makeSphere(1);
    const validation = validateMesh(result.result!);
    expect(validation.success).toBe(true);
  });

  it("default segments/rings produce reasonable mesh (at least 100 triangles)", () => {
    const result = makeSphere(1);
    const triCount = meshTriangleCount(result.result!);
    expect(triCount).toBeGreaterThanOrEqual(100);
  });

  // Edge cases
  it('handles very small radius', () => {
    const result = makeSphere(0.001);
    expect(result.success).toBe(true);
  });

  it('handles very large radius', () => {
    const result = makeSphere(1e6);
    expect(result.success).toBe(true);
  });

  it('handles minimum segments/rings', () => {
    const result = makeSphere(1, { segments: 4, rings: 2 });
    expect(result.success).toBe(true);
  });

  it('handles high resolution', () => {
    const result = makeSphere(1, { segments: 64, rings: 32 });
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBeGreaterThan(1000);
  });

  it('returns error for very small radius near zero', () => {
    const result = makeSphere(1e-10);
    expect(result.success).toBe(false);
  });
});
