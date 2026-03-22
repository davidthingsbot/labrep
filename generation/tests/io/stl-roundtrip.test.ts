import { describe, it, expect } from 'vitest';
import { meshToStlAscii } from '../../src/io/stl-ascii-writer';
import { meshToStlBinary } from '../../src/io/stl-binary-writer';
import { stlToMesh } from '../../src/io/stl';
import { makeBox, makeSphere, makeCylinder, meshTriangleCount } from '../../src/index';

/**
 * Compare two meshes for approximate geometric equivalence.
 * Checks triangle count match and bounding box match.
 */
function meshBoundsMatch(
  original: { vertices: Float32Array },
  imported: { vertices: Float32Array },
  tolerance: number = 0.01,
): boolean {
  function bounds(verts: Float32Array) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      minX = Math.min(minX, verts[i]);
      minY = Math.min(minY, verts[i + 1]);
      minZ = Math.min(minZ, verts[i + 2]);
      maxX = Math.max(maxX, verts[i]);
      maxY = Math.max(maxY, verts[i + 1]);
      maxZ = Math.max(maxZ, verts[i + 2]);
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  const a = bounds(original.vertices);
  const b = bounds(imported.vertices);
  return (
    Math.abs(a.minX - b.minX) < tolerance &&
    Math.abs(a.minY - b.minY) < tolerance &&
    Math.abs(a.minZ - b.minZ) < tolerance &&
    Math.abs(a.maxX - b.maxX) < tolerance &&
    Math.abs(a.maxY - b.maxY) < tolerance &&
    Math.abs(a.maxZ - b.maxZ) < tolerance
  );
}

describe('stlToMesh (auto-detect)', () => {
  it('detects and parses ASCII STL from string', () => {
    const box = makeBox(1, 1, 1).result!;
    const ascii = meshToStlAscii(box);
    const result = stlToMesh(ascii);
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(12);
  });

  it('detects and parses binary STL from ArrayBuffer', () => {
    const box = makeBox(1, 1, 1).result!;
    const binary = meshToStlBinary(box);
    const result = stlToMesh(binary);
    expect(result.success).toBe(true);
    expect(meshTriangleCount(result.result!)).toBe(12);
  });

  it('parses ASCII STL passed as ArrayBuffer', () => {
    const box = makeBox(1, 1, 1).result!;
    const ascii = meshToStlAscii(box);
    const buf = new TextEncoder().encode(ascii).buffer;
    const result = stlToMesh(buf);
    expect(result.success).toBe(true);
  });
});

describe('STL round-trip: ASCII', () => {
  it('box: preserves triangle count', () => {
    const box = makeBox(1, 1, 1).result!;
    const stl = meshToStlAscii(box);
    const imported = stlToMesh(stl).result!;
    expect(meshTriangleCount(imported)).toBe(meshTriangleCount(box));
  });

  it('box: preserves bounding box', () => {
    const box = makeBox(2, 3, 4).result!;
    const stl = meshToStlAscii(box);
    const imported = stlToMesh(stl).result!;
    expect(meshBoundsMatch(box, imported)).toBe(true);
  });

  it('sphere: preserves triangle count', () => {
    const sphere = makeSphere(1, { segments: 8, rings: 4 }).result!;
    const stl = meshToStlAscii(sphere);
    const imported = stlToMesh(stl).result!;
    expect(meshTriangleCount(imported)).toBe(meshTriangleCount(sphere));
  });

  it('sphere: preserves bounding box', () => {
    const sphere = makeSphere(1.5).result!;
    const stl = meshToStlAscii(sphere);
    const imported = stlToMesh(stl).result!;
    expect(meshBoundsMatch(sphere, imported, 0.05)).toBe(true);
  });

  it('cylinder: preserves triangle count', () => {
    const cyl = makeCylinder(0.5, 2, { segments: 8 }).result!;
    const stl = meshToStlAscii(cyl);
    const imported = stlToMesh(stl).result!;
    expect(meshTriangleCount(imported)).toBe(meshTriangleCount(cyl));
  });
});

describe('STL round-trip: Binary', () => {
  it('box: preserves triangle count', () => {
    const box = makeBox(1, 1, 1).result!;
    const binary = meshToStlBinary(box);
    const imported = stlToMesh(binary).result!;
    expect(meshTriangleCount(imported)).toBe(meshTriangleCount(box));
  });

  it('box: preserves bounding box', () => {
    const box = makeBox(2, 3, 4).result!;
    const binary = meshToStlBinary(box);
    const imported = stlToMesh(binary).result!;
    expect(meshBoundsMatch(box, imported)).toBe(true);
  });

  it('sphere: preserves triangle count', () => {
    const sphere = makeSphere(1, { segments: 8, rings: 4 }).result!;
    const binary = meshToStlBinary(sphere);
    const imported = stlToMesh(binary).result!;
    expect(meshTriangleCount(imported)).toBe(meshTriangleCount(sphere));
  });

  it('sphere: preserves bounding box', () => {
    const sphere = makeSphere(1.5).result!;
    const binary = meshToStlBinary(sphere);
    const imported = stlToMesh(binary).result!;
    expect(meshBoundsMatch(sphere, imported, 0.05)).toBe(true);
  });

  it('cylinder: preserves triangle count', () => {
    const cyl = makeCylinder(0.5, 2, { segments: 8 }).result!;
    const binary = meshToStlBinary(cyl);
    const imported = stlToMesh(binary).result!;
    expect(meshTriangleCount(imported)).toBe(meshTriangleCount(cyl));
  });

  it('cylinder: preserves bounding box', () => {
    const cyl = makeCylinder(0.5, 2).result!;
    const binary = meshToStlBinary(cyl);
    const imported = stlToMesh(binary).result!;
    expect(meshBoundsMatch(cyl, imported, 0.05)).toBe(true);
  });
});
