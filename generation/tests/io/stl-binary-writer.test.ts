import { describe, it, expect } from 'vitest';
import { meshToStlBinary } from '../../src/io/stl-binary-writer';
import { makeBox, makeSphere, makeCylinder, meshTriangleCount } from '../../src/index';

describe('meshToStlBinary', () => {
  it('returns an ArrayBuffer', () => {
    const box = makeBox(1, 1, 1).result!;
    const result = meshToStlBinary(box);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('has correct size: 84 + 50 * triangleCount', () => {
    const box = makeBox(1, 1, 1).result!;
    const triCount = meshTriangleCount(box);
    const result = meshToStlBinary(box);
    expect(result.byteLength).toBe(84 + 50 * triCount);
  });

  it('header is 80 bytes', () => {
    const box = makeBox(1, 1, 1).result!;
    const result = meshToStlBinary(box);
    // Header occupies first 80 bytes — just check total size implies it
    expect(result.byteLength).toBeGreaterThanOrEqual(84);
  });

  it('triangle count at offset 80 matches mesh', () => {
    const box = makeBox(1, 1, 1).result!;
    const result = meshToStlBinary(box);
    const view = new DataView(result);
    const storedCount = view.getUint32(80, true); // little-endian
    expect(storedCount).toBe(meshTriangleCount(box));
  });

  it('correct size for sphere', () => {
    const sphere = makeSphere(1, { segments: 8, rings: 4 }).result!;
    const triCount = meshTriangleCount(sphere);
    const result = meshToStlBinary(sphere);
    expect(result.byteLength).toBe(84 + 50 * triCount);
  });

  it('correct size for cylinder', () => {
    const cyl = makeCylinder(0.5, 1, { segments: 8 }).result!;
    const triCount = meshTriangleCount(cyl);
    const result = meshToStlBinary(cyl);
    expect(result.byteLength).toBe(84 + 50 * triCount);
  });

  it('normals are approximately unit length', () => {
    const box = makeBox(1, 1, 1).result!;
    const buf = meshToStlBinary(box);
    const view = new DataView(buf);
    const triCount = view.getUint32(80, true);
    for (let i = 0; i < triCount; i++) {
      const offset = 84 + i * 50;
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it('attribute bytes are zero', () => {
    const box = makeBox(1, 1, 1).result!;
    const buf = meshToStlBinary(box);
    const view = new DataView(buf);
    const triCount = view.getUint32(80, true);
    for (let i = 0; i < triCount; i++) {
      const offset = 84 + i * 50 + 48; // attribute bytes at end of each triangle
      expect(view.getUint16(offset, true)).toBe(0);
    }
  });
});
