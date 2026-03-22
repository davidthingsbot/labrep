import { describe, it, expect } from 'vitest';
import { meshToBufferGeometry } from './mesh-to-three';
import type { Mesh } from '@labrep/generation';

describe('meshToBufferGeometry', () => {
  const triangleMesh: Mesh = {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  };

  it('returns a BufferGeometry', () => {
    const geom = meshToBufferGeometry(triangleMesh);
    expect(geom).toBeDefined();
    expect(geom.getAttribute('position')).toBeDefined();
  });

  it('sets position attribute from vertices', () => {
    const geom = meshToBufferGeometry(triangleMesh);
    const pos = geom.getAttribute('position');
    expect(pos.count).toBe(3);
    expect(pos.array[0]).toBe(0);
    expect(pos.array[3]).toBe(1);
  });

  it('sets normal attribute from normals', () => {
    const geom = meshToBufferGeometry(triangleMesh);
    const norm = geom.getAttribute('normal');
    expect(norm.count).toBe(3);
    expect(norm.array[2]).toBe(1); // z component of first normal
  });

  it('sets index from indices', () => {
    const geom = meshToBufferGeometry(triangleMesh);
    const idx = geom.getIndex();
    expect(idx).not.toBeNull();
    expect(idx!.count).toBe(3);
  });
});
