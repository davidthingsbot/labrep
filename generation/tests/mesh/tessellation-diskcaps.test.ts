import { describe, it, expect } from 'vitest';
import {
  point3d,
  Z_AXIS_3D,
  makeLine3D,
  makeEdgeFromCurve,
  makeWireFromEdges,
  revolve,
  solidToMesh,
  meshTriangleCount,
} from '../../src';

function makeCylinderSolid(r: number, h: number) {
  const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(r, 0, h), point3d(0, 0, h)];
  const edges = pts.map((p, i) =>
    makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return revolve(wire, Z_AXIS_3D, 2 * Math.PI).result!;
}

function makeConeSolid(r: number, h: number) {
  const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(0, 0, h)];
  const edges = pts.map((p, i) =>
    makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return revolve(wire, Z_AXIS_3D, 2 * Math.PI).result!;
}

/** Check that a mesh has no untriangulated holes by verifying every triangle
 *  has nonzero area and the total covers expected regions. */
function checkNoHoles(vertices: Float32Array, indices: Uint32Array, zLevel: number, minR: number) {
  // Collect triangles at the given z level
  const trisAtZ: number[][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const vs = [0, 1, 2].map(j => {
      const idx = indices[i + j];
      return { x: vertices[idx * 3], y: vertices[idx * 3 + 1], z: vertices[idx * 3 + 2] };
    });
    // Accept triangle if all vertices are near zLevel
    if (vs.every(v => Math.abs(v.z - zLevel) < 0.01)) {
      trisAtZ.push([vs[0].x, vs[0].y, vs[1].x, vs[1].y, vs[2].x, vs[2].y]);
    }
  }

  // Sum triangle areas using cross product
  let totalArea = 0;
  for (const [x0, y0, x1, y1, x2, y2] of trisAtZ) {
    totalArea += 0.5 * Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
  }

  // Expected disk area = pi * r^2
  const expectedArea = Math.PI * minR * minR;
  return { totalArea, expectedArea, trisAtZ: trisAtZ.length };
}

describe('disk face tessellation (revolve caps)', () => {
  it('cylinder bottom disk has no holes (triangle area covers full circle)', () => {
    const rev = makeCylinderSolid(2, 4);
    const mesh = solidToMesh(rev.solid);
    expect(mesh.success).toBe(true);

    const { totalArea, expectedArea } = checkNoHoles(
      mesh.result!.vertices, mesh.result!.indices, 0, 2,
    );
    // Total triangle area at z=0 should match pi*r^2 within 5%
    expect(totalArea).toBeGreaterThan(expectedArea * 0.95);
    expect(totalArea).toBeLessThan(expectedArea * 1.05);
  });

  it('cone bottom disk has no holes', () => {
    const rev = makeConeSolid(2, 4);
    const mesh = solidToMesh(rev.solid);
    expect(mesh.success).toBe(true);

    const { totalArea, expectedArea } = checkNoHoles(
      mesh.result!.vertices, mesh.result!.indices, 0, 2,
    );
    expect(totalArea).toBeGreaterThan(expectedArea * 0.95);
    expect(totalArea).toBeLessThan(expectedArea * 1.05);
  });

  it('cylinder mesh covers bottom in all quadrants', () => {
    const rev = makeCylinderSolid(2, 4);
    const mesh = solidToMesh(rev.solid);
    expect(mesh.success).toBe(true);
    const v = mesh.result!.vertices;
    const bottomVerts: { x: number; y: number }[] = [];
    for (let i = 0; i < v.length; i += 3) {
      if (Math.abs(v[i + 2]) < 0.01) {
        bottomVerts.push({ x: v[i], y: v[i + 1] });
      }
    }
    expect(bottomVerts.some(p => p.x > 1 && p.y > 1)).toBe(true);
    expect(bottomVerts.some(p => p.x < -1 && p.y > 1)).toBe(true);
    expect(bottomVerts.some(p => p.x < -1 && p.y < -1)).toBe(true);
    expect(bottomVerts.some(p => p.x > 1 && p.y < -1)).toBe(true);
  });
});
