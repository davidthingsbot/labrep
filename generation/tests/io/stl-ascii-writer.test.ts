import { describe, it, expect } from 'vitest';
import { meshToStlAscii } from '../../src/io/stl-ascii-writer';
import { makeBox, makeSphere, makeCylinder, meshTriangleCount } from '../../src/index';

describe('meshToStlAscii', () => {
  it('starts with solid and ends with endsolid', () => {
    const box = makeBox(1, 1, 1).result!;
    const stl = meshToStlAscii(box);
    expect(stl.startsWith('solid labrep')).toBe(true);
    expect(stl.trimEnd().endsWith('endsolid labrep')).toBe(true);
  });

  it('uses custom name when provided', () => {
    const box = makeBox(1, 1, 1).result!;
    const stl = meshToStlAscii(box, 'mybox');
    expect(stl.startsWith('solid mybox')).toBe(true);
    expect(stl.trimEnd().endsWith('endsolid mybox')).toBe(true);
  });

  it('has correct number of facet blocks for a box', () => {
    const box = makeBox(1, 1, 1).result!;
    const stl = meshToStlAscii(box);
    const facetCount = (stl.match(/facet normal/g) || []).length;
    expect(facetCount).toBe(meshTriangleCount(box));
    expect(facetCount).toBe(12);
  });

  it('has correct number of facet blocks for a sphere', () => {
    const sphere = makeSphere(1, { segments: 8, rings: 4 }).result!;
    const stl = meshToStlAscii(sphere);
    const facetCount = (stl.match(/facet normal/g) || []).length;
    expect(facetCount).toBe(meshTriangleCount(sphere));
  });

  it('all normals are approximately unit length', () => {
    const box = makeBox(1, 1, 1).result!;
    const stl = meshToStlAscii(box);
    const normalRegex = /facet normal\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g;
    let match;
    while ((match = normalRegex.exec(stl)) !== null) {
      const nx = parseFloat(match[1]);
      const ny = parseFloat(match[2]);
      const nz = parseFloat(match[3]);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1, 4);
    }
  });

  it('each facet has exactly 3 vertices', () => {
    const box = makeBox(1, 1, 1).result!;
    const stl = meshToStlAscii(box);
    // Split into facet blocks
    const facets = stl.split('endfacet').slice(0, -1); // last split is the endsolid line
    for (const facet of facets) {
      const vertexCount = (facet.match(/vertex\s/g) || []).length;
      expect(vertexCount).toBe(3);
    }
  });

  it('produces parseable floating-point values', () => {
    const box = makeBox(2, 3, 4).result!;
    const stl = meshToStlAscii(box);
    const vertexRegex = /vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g;
    let match;
    let count = 0;
    while ((match = vertexRegex.exec(stl)) !== null) {
      expect(isNaN(parseFloat(match[1]))).toBe(false);
      expect(isNaN(parseFloat(match[2]))).toBe(false);
      expect(isNaN(parseFloat(match[3]))).toBe(false);
      count++;
    }
    expect(count).toBe(meshTriangleCount(box) * 3);
  });
});
