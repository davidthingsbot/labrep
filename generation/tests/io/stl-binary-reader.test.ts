import { describe, it, expect } from 'vitest';
import { stlBinaryToMesh } from '../../src/io/stl-binary-reader';
import { meshToStlBinary } from '../../src/io/stl-binary-writer';
import { makeBox, makeSphere, meshTriangleCount, meshVertexCount } from '../../src/index';

/** Create a minimal binary STL with one triangle. */
function makeSingleTriBinary(): ArrayBuffer {
  const buf = new ArrayBuffer(84 + 50);
  const view = new DataView(buf);
  view.setUint32(80, 1, true); // 1 triangle
  let off = 84;
  // Normal: 0, 0, 1
  view.setFloat32(off, 0, true); off += 4;
  view.setFloat32(off, 0, true); off += 4;
  view.setFloat32(off, 1, true); off += 4;
  // Vertex 0: 0, 0, 0
  view.setFloat32(off, 0, true); off += 4;
  view.setFloat32(off, 0, true); off += 4;
  view.setFloat32(off, 0, true); off += 4;
  // Vertex 1: 1, 0, 0
  view.setFloat32(off, 1, true); off += 4;
  view.setFloat32(off, 0, true); off += 4;
  view.setFloat32(off, 0, true); off += 4;
  // Vertex 2: 0, 1, 0
  view.setFloat32(off, 0, true); off += 4;
  view.setFloat32(off, 1, true); off += 4;
  view.setFloat32(off, 0, true); off += 4;
  // Attribute bytes
  view.setUint16(off, 0, true);
  return buf;
}

describe('stlBinaryToMesh', () => {
  it('parses a single-triangle binary STL', () => {
    const result = stlBinaryToMesh(makeSingleTriBinary());
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(1);
    expect(meshVertexCount(result.result!)).toBe(3);
  });

  it('parses binary STL generated from makeBox', () => {
    const box = makeBox(1, 1, 1).result!;
    const binary = meshToStlBinary(box);
    const result = stlBinaryToMesh(binary);
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(12);
  });

  it('de-duplicates vertices from box (36 STL → 8 unique)', () => {
    const box = makeBox(1, 1, 1).result!;
    const binary = meshToStlBinary(box);
    const result = stlBinaryToMesh(binary);
    expect(result.success).toBe(true);
    expect(meshVertexCount(result.result!)).toBe(8);
  });

  it('parses binary STL from sphere', () => {
    const sphere = makeSphere(1, { segments: 8, rings: 4 }).result!;
    const binary = meshToStlBinary(sphere);
    const result = stlBinaryToMesh(binary);
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(meshTriangleCount(sphere));
  });

  it('rejects truncated buffer', () => {
    const result = stlBinaryToMesh(new ArrayBuffer(50));
    expect(result.success).toBe(false);
  });

  it('rejects buffer with mismatched size', () => {
    const buf = new ArrayBuffer(84 + 50); // claims 1 tri
    const view = new DataView(buf);
    view.setUint32(80, 100, true); // but says 100 triangles
    const result = stlBinaryToMesh(buf);
    expect(result.success).toBe(false);
  });

  it('vertex normals are approximately unit length', () => {
    const box = makeBox(1, 1, 1).result!;
    const binary = meshToStlBinary(box);
    const result = stlBinaryToMesh(binary);
    const normals = result.result!.normals;
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2);
      expect(len).toBeCloseTo(1, 2);
    }
  });
});
