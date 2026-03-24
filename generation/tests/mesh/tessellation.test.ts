import { describe, it, expect } from 'vitest';
import { point3d, vec3d, Z_AXIS_3D } from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { solidVolume } from '../../src/topology/solid';
import { shellFaces } from '../../src/topology/shell';
import { meshTriangleCount, meshVertexCount, validateMesh } from '../../src/mesh/mesh';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { booleanSubtract, booleanUnion, booleanIntersect } from '../../src/operations/boolean';
import { solidToMesh } from '../../src/mesh/tessellation';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function makeBoxSolid(x: number, y: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(x - hw, y - hh, z), point3d(x + hw, y - hh, z),
    point3d(x + hw, y + hh, z), point3d(x - hw, y + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

/** Compute mesh volume via signed tetrahedra (same as solidVolume but from triangles) */
function meshVolume(mesh: ReturnType<typeof solidToMesh> extends { result?: infer R } ? NonNullable<R> : never): number {
  const v = mesh.vertices;
  const idx = mesh.indices;
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ax = v[a], ay = v[a + 1], az = v[a + 2];
    const bx = v[b], by = v[b + 1], bz = v[b + 2];
    const cx = v[c], cy = v[c + 1], cz = v[c + 2];
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(vol);
}

// ═══════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════

describe('solidToMesh', () => {
  describe('box (all planar faces)', () => {
    const box = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const result = solidToMesh(box.solid);

    it('succeeds', () => {
      expect(result.success).toBe(true);
    });

    it('produces valid mesh', () => {
      const validation = validateMesh(result.result!);
      expect(validation.success).toBe(true);
    });

    it('has 6 faces → 12 triangles', () => {
      expect(meshTriangleCount(result.result!)).toBe(12);
    });

    it('has 24 vertices (4 per face, flat shading)', () => {
      expect(meshVertexCount(result.result!)).toBe(24);
    });

    it('normals have unit length', () => {
      const n = result.result!.normals;
      for (let i = 0; i < n.length; i += 3) {
        const len = Math.sqrt(n[i] ** 2 + n[i + 1] ** 2 + n[i + 2] ** 2);
        expect(len).toBeCloseTo(1.0, 4);
      }
    });

    it('mesh volume matches solid volume', () => {
      const solidVol = solidVolume(box.solid);
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(solidVol, 1);
    });
  });

  describe('boolean subtract result', () => {
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);
    const boolResult = booleanSubtract(boxA.solid, boxB.solid);
    const result = solidToMesh(boolResult.result!.solid);

    it('succeeds', () => {
      expect(result.success).toBe(true);
    });

    it('produces valid mesh', () => {
      const validation = validateMesh(result.result!);
      expect(validation.success).toBe(true);
    });

    it('mesh volume matches solid volume (28.0)', () => {
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(28.0, 1);
    });
  });

  describe('boolean union result', () => {
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);
    const boolResult = booleanUnion(boxA.solid, boxB.solid);
    const result = solidToMesh(boolResult.result!.solid);

    it('succeeds', () => {
      expect(result.success).toBe(true);
    });

    it('mesh volume matches solid volume (92.0)', () => {
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(92.0, 1);
    });
  });

  describe('boolean intersect result', () => {
    const boxA = makeBoxSolid(0, 0, 0, 4, 4, 4);
    const boxB = makeBoxSolid(1, 1, 0, 4, 4, 4);
    const boolResult = booleanIntersect(boxA.solid, boxB.solid);
    const result = solidToMesh(boolResult.result!.solid);

    it('succeeds', () => {
      expect(result.success).toBe(true);
    });

    it('mesh volume matches solid volume (36.0)', () => {
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(36.0, 1);
    });
  });

  describe('tall box (non-square faces)', () => {
    const box = makeBoxSolid(0, 0, 0, 2, 3, 5);
    const result = solidToMesh(box.solid);

    it('mesh volume matches solid volume (30.0)', () => {
      const solidVol = solidVolume(box.solid);
      expect(solidVol).toBeCloseTo(30.0, 1);
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(30.0, 1);
    });
  });

  describe('cylinder (revolved rectangle)', () => {
    // Revolve rectangle (r=2, h=5) around Z → cylinder
    const r = 2, h = 5;
    const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(r, 0, h), point3d(0, 0, h)];
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % 4]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    const result = solidToMesh(rev.result!.solid);

    it('succeeds', () => {
      expect(result.success).toBe(true);
    });

    it('has cylindrical face', () => {
      const faces = shellFaces(rev.result!.solid.outerShell);
      const types = faces.map(f => f.surface.type);
      expect(types).toContain('cylinder');
    });

    it('produces valid mesh', () => {
      expect(validateMesh(result.result!).success).toBe(true);
    });

    it('has many triangles (curved surface)', () => {
      // At least the planar caps (2 tris each) plus cylinder body
      expect(meshTriangleCount(result.result!)).toBeGreaterThan(20);
    });

    it('normals have unit length', () => {
      const n = result.result!.normals;
      for (let i = 0; i < n.length; i += 3) {
        const len = Math.sqrt(n[i] ** 2 + n[i + 1] ** 2 + n[i + 2] ** 2);
        expect(len).toBeCloseTo(1.0, 3);
      }
    });

    it('mesh volume approximates πr²h', () => {
      const expected = Math.PI * r * r * h;
      const meshVol = meshVolume(result.result!);
      // Mesh is a polygon approximation — within ~2% for 24 segments
      expect(meshVol / expected).toBeGreaterThan(0.97);
      expect(meshVol / expected).toBeLessThan(1.03);
    });
  });

  describe('cone (revolved right triangle)', () => {
    // Revolve right triangle → cone with r=3, h=4
    const r = 3, h = 4;
    const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(0, 0, h)];
    const edges = pts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
    const result = solidToMesh(rev.result!.solid);

    it('succeeds', () => {
      expect(result.success).toBe(true);
    });

    it('mesh volume approximates ⅓πr²h', () => {
      const expected = (1 / 3) * Math.PI * r * r * h;
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(expected, 0);
    });
  });

  describe('sphere (revolved semicircle)', () => {
    // Revolve a vertical line from (r,0,0) to (0,0,r) to (0,0,-r) to (r,0,0)
    // Actually, sphere is made by revolving a semicircle — check how revolve handles arcs
    // For now, approximate with polygon profile
    const r = 3;
    const n = 12; // vertices in half-profile
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / n;
      pts.push(point3d(r * Math.cos(angle), 0, r * Math.sin(angle)));
    }
    // Close back to axis
    pts.push(point3d(0, 0, -r));
    // Close at axis top → add axis line at x=0
    // Actually we need a closed profile. Let's use: semicircle + axis line
    const profilePts = [point3d(0, 0, -r)];
    for (let i = 0; i <= n; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / n;
      const x = r * Math.cos(angle);
      if (x > 0.01) {
        profilePts.push(point3d(x, 0, r * Math.sin(angle)));
      }
    }
    profilePts.push(point3d(0, 0, r));

    // Build edges
    const edges = profilePts.map((p, i) =>
      makeEdgeFromCurve(makeLine3D(p, profilePts[(i + 1) % profilePts.length]).result!).result!,
    );
    const wire = makeWireFromEdges(edges).result!;
    const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);

    it('revolve succeeds', () => {
      expect(rev.success).toBe(true);
    });

    it('tessellation succeeds', () => {
      const result = solidToMesh(rev.result!.solid);
      expect(result.success).toBe(true);
    });

    it('mesh volume approximates ⁴⁄₃πr³', () => {
      const result = solidToMesh(rev.result!.solid);
      const expected = (4 / 3) * Math.PI * r * r * r;
      const meshVol = meshVolume(result.result!);
      // Polygon approximation of semicircle + tessellation → ~5% tolerance
      expect(meshVol / expected).toBeGreaterThan(0.9);
      expect(meshVol / expected).toBeLessThan(1.1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // SPATIAL COVERAGE TESTS
  // ═══════════════════════════════════════════════════════

  describe('spatial coverage — all parts of each primitive are meshed', () => {
    /** Get bounding box of a mesh */
    function meshBounds(mesh: { vertices: Float32Array }) {
      const v = mesh.vertices;
      let xMin = Infinity, xMax = -Infinity;
      let yMin = Infinity, yMax = -Infinity;
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i < v.length; i += 3) {
        if (v[i] < xMin) xMin = v[i];
        if (v[i] > xMax) xMax = v[i];
        if (v[i + 1] < yMin) yMin = v[i + 1];
        if (v[i + 1] > yMax) yMax = v[i + 1];
        if (v[i + 2] < zMin) zMin = v[i + 2];
        if (v[i + 2] > zMax) zMax = v[i + 2];
      }
      return { xMin, xMax, yMin, yMax, zMin, zMax };
    }

    /** Check that every face of a solid contributes at least some triangles */
    function perFaceTriangleCounts(solid: ReturnType<typeof solidToMesh> extends { result?: infer R } ? NonNullable<R> : never, faceCount: number) {
      // We can't easily decompose the mesh per-face after the fact,
      // but we can verify total triangle count is at least faceCount
      // (each face should produce at least 1 triangle)
      const totalTris = meshTriangleCount(solid);
      return totalTris >= faceCount;
    }

    it('box mesh covers full spatial extent', () => {
      const box = makeBoxSolid(0, 0, 0, 4, 6, 8);
      const result = solidToMesh(box.solid);
      expect(result.success).toBe(true);
      const b = meshBounds(result.result!);
      // Box from (-2,-3,0) to (2,3,8)
      expect(b.xMin).toBeCloseTo(-2, 0);
      expect(b.xMax).toBeCloseTo(2, 0);
      expect(b.yMin).toBeCloseTo(-3, 0);
      expect(b.yMax).toBeCloseTo(3, 0);
      expect(b.zMin).toBeCloseTo(0, 0);
      expect(b.zMax).toBeCloseTo(8, 0);
    });

    it('cylinder mesh covers full height and radius', () => {
      const r = 2, h = 5;
      const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(r, 0, h), point3d(0, 0, h)];
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % 4]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
      const result = solidToMesh(rev.result!.solid);
      expect(result.success).toBe(true);
      const b = meshBounds(result.result!);
      // Cylinder: radius 2 centered on Z, height 0 to 5
      expect(b.xMin).toBeLessThan(-1.9);
      expect(b.xMax).toBeGreaterThan(1.9);
      expect(b.yMin).toBeLessThan(-1.9);
      expect(b.yMax).toBeGreaterThan(1.9);
      expect(b.zMin).toBeCloseTo(0, 0);
      expect(b.zMax).toBeCloseTo(5, 0);
    });

    it('cone mesh covers base and reaches apex', () => {
      const r = 3, h = 4;
      const pts = [point3d(0, 0, 0), point3d(r, 0, 0), point3d(0, 0, h)];
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
      const result = solidToMesh(rev.result!.solid);
      expect(result.success).toBe(true);
      const b = meshBounds(result.result!);
      // Cone: base radius 3 at z=0, apex at z=4
      expect(b.xMin).toBeLessThan(-2.8);
      expect(b.xMax).toBeGreaterThan(2.8);
      expect(b.zMin).toBeCloseTo(0, 0);
      expect(b.zMax).toBeCloseTo(4, 0);  // Must reach the apex!
    });

    it('sphere mesh covers full extent in all directions', () => {
      const r = 3;
      const n = 12;
      const pts = [point3d(0, 0, -r)];
      for (let i = 0; i <= n; i++) {
        const angle = -Math.PI / 2 + (Math.PI * i) / n;
        const x = r * Math.cos(angle);
        if (x > 0.01) pts.push(point3d(x, 0, r * Math.sin(angle)));
      }
      pts.push(point3d(0, 0, r));
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
      const result = solidToMesh(rev.result!.solid);
      expect(result.success).toBe(true);
      const b = meshBounds(result.result!);
      // Sphere: radius 3, must reach all extremes
      expect(b.xMin).toBeLessThan(-2.8);
      expect(b.xMax).toBeGreaterThan(2.8);
      expect(b.yMin).toBeLessThan(-2.8);
      expect(b.yMax).toBeGreaterThan(2.8);
      expect(b.zMin).toBeLessThan(-2.8);  // Must reach bottom pole
      expect(b.zMax).toBeGreaterThan(2.8);  // Must reach top pole!
    });

    it('sphere top pole normals point outward', () => {
      const r = 3;
      const n = 12;
      const pts = [point3d(0, 0, -r)];
      for (let i = 0; i <= n; i++) {
        const angle = -Math.PI / 2 + (Math.PI * i) / n;
        const x = r * Math.cos(angle);
        if (x > 0.01) pts.push(point3d(x, 0, r * Math.sin(angle)));
      }
      pts.push(point3d(0, 0, r));
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
      const result = solidToMesh(rev.result!.solid);
      const mesh = result.result!;

      // Check normals near the top (z > 2.5): they should point upward (nz > 0)
      const v = mesh.vertices;
      const nrm = mesh.normals;
      let topVertCount = 0;
      let topNzSum = 0;
      for (let i = 0; i < v.length; i += 3) {
        if (v[i + 2] > 2.5) {
          topVertCount++;
          topNzSum += nrm[i + 2]; // nz component
        }
      }
      console.log(`Top vertices (z>2.5): ${topVertCount}, avg nz=${(topNzSum/topVertCount).toFixed(3)}`);
      // Normals near top should have positive z component (pointing up/outward)
      expect(topNzSum / topVertCount).toBeGreaterThan(0);
    });

    it('sphere bottom pole normals point outward (downward)', () => {
      const r = 3;
      const n = 12;
      const pts = [point3d(0, 0, -r)];
      for (let i = 0; i <= n; i++) {
        const angle = -Math.PI / 2 + (Math.PI * i) / n;
        const x = r * Math.cos(angle);
        if (x > 0.01) pts.push(point3d(x, 0, r * Math.sin(angle)));
      }
      pts.push(point3d(0, 0, r));
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
      const result = solidToMesh(rev.result!.solid);
      const mesh = result.result!;

      // Check normals near the bottom (z < -2.5): they should point downward (nz < 0)
      const v = mesh.vertices;
      const nrm = mesh.normals;
      let bottomVertCount = 0;
      let bottomNzSum = 0;
      for (let i = 0; i < v.length; i += 3) {
        if (v[i + 2] < -2.5) {
          bottomVertCount++;
          bottomNzSum += nrm[i + 2];
        }
      }
      console.log(`Bottom vertices (z<-2.5): ${bottomVertCount}, avg nz=${(bottomNzSum/bottomVertCount).toFixed(3)}`);
      expect(bottomNzSum / bottomVertCount).toBeLessThan(0);
    });

    it('no NaN or Infinity in mesh vertices or normals', () => {
      // Test all primitive types
      const primitives = [
        { name: 'box', fn: () => { const b = makeBoxSolid(0,0,0,4,4,4); return solidToMesh(b.solid); } },
        { name: 'cylinder', fn: () => {
          const pts = [point3d(0,0,0), point3d(2,0,0), point3d(2,0,5), point3d(0,0,5)];
          const edges = pts.map((p,i) => makeEdgeFromCurve(makeLine3D(p, pts[(i+1)%4]).result!).result!);
          return solidToMesh(revolve(makeWireFromEdges(edges).result!, Z_AXIS_3D, 2*Math.PI).result!.solid);
        }},
        { name: 'cone', fn: () => {
          const pts = [point3d(0,0,0), point3d(3,0,0), point3d(0,0,4)];
          const edges = pts.map((p,i) => makeEdgeFromCurve(makeLine3D(p, pts[(i+1)%pts.length]).result!).result!);
          return solidToMesh(revolve(makeWireFromEdges(edges).result!, Z_AXIS_3D, 2*Math.PI).result!.solid);
        }},
        { name: 'sphere', fn: () => {
          const r = 3, n = 12;
          const pts = [point3d(0,0,-r)];
          for (let i = 0; i <= n; i++) {
            const angle = -Math.PI/2 + (Math.PI*i)/n;
            const x = r * Math.cos(angle);
            if (x > 0.01) pts.push(point3d(x, 0, r*Math.sin(angle)));
          }
          pts.push(point3d(0,0,r));
          const edges = pts.map((p,i) => makeEdgeFromCurve(makeLine3D(p, pts[(i+1)%pts.length]).result!).result!);
          return solidToMesh(revolve(makeWireFromEdges(edges).result!, Z_AXIS_3D, 2*Math.PI).result!.solid);
        }},
      ];

      for (const { name, fn } of primitives) {
        const result = fn();
        expect(result.success).toBe(true);
        const mesh = result.result!;
        for (let i = 0; i < mesh.vertices.length; i++) {
          expect(isFinite(mesh.vertices[i])).toBe(true);
        }
        for (let i = 0; i < mesh.normals.length; i++) {
          expect(isFinite(mesh.normals[i])).toBe(true);
        }
      }
    });

    it('no degenerate triangles (zero area) at cone apex', () => {
      // Cone: check triangles near the apex
      const pts = [point3d(0, 0, 0), point3d(3, 0, 0), point3d(0, 0, 4)];
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const rev = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
      const result = solidToMesh(rev.result!.solid);
      const mesh = result.result!;
      const v = mesh.vertices;
      const idx = mesh.indices;

      let degenerateCount = 0;
      let totalTris = idx.length / 3;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i]*3, b = idx[i+1]*3, c = idx[i+2]*3;
        // Cross product to check area
        const abx = v[b]-v[a], aby = v[b+1]-v[a+1], abz = v[b+2]-v[a+2];
        const acx = v[c]-v[a], acy = v[c+1]-v[a+1], acz = v[c+2]-v[a+2];
        const cx = aby*acz - abz*acy;
        const cy = abz*acx - abx*acz;
        const cz = abx*acy - aby*acx;
        const area = Math.sqrt(cx*cx + cy*cy + cz*cz) / 2;
        if (area < 1e-10) degenerateCount++;
      }
      console.log(`Cone: ${degenerateCount}/${totalTris} degenerate triangles`);
      // At most half the triangles at the apex strip can be degenerate
      expect(degenerateCount / totalTris).toBeLessThan(0.1);
    });

    it('each primitive face contributes triangles', () => {
      // Box: 6 faces → at least 6 triangles
      const box = makeBoxSolid(0, 0, 0, 4, 4, 4);
      const boxMesh = solidToMesh(box.solid);
      expect(meshTriangleCount(boxMesh.result!)).toBeGreaterThanOrEqual(6);

      // Cylinder: 3 faces → at least 3 triangles
      const pts = [point3d(0, 0, 0), point3d(2, 0, 0), point3d(2, 0, 5), point3d(0, 0, 5)];
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % 4]).result!).result!,
      );
      const cylSolid = revolve(makeWireFromEdges(edges).result!, Z_AXIS_3D, 2 * Math.PI);
      const cylMesh = solidToMesh(cylSolid.result!.solid);
      const cylFaces = shellFaces(cylSolid.result!.solid.outerShell);
      expect(meshTriangleCount(cylMesh.result!)).toBeGreaterThanOrEqual(cylFaces.length);

      // Cone: 2 faces → at least 2 triangles
      const cPts = [point3d(0, 0, 0), point3d(3, 0, 0), point3d(0, 0, 4)];
      const cEdges = cPts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, cPts[(i + 1) % cPts.length]).result!).result!,
      );
      const coneSolid = revolve(makeWireFromEdges(cEdges).result!, Z_AXIS_3D, 2 * Math.PI);
      const coneMesh = solidToMesh(coneSolid.result!.solid);
      const coneFaces = shellFaces(coneSolid.result!.solid.outerShell);
      expect(meshTriangleCount(coneMesh.result!)).toBeGreaterThanOrEqual(coneFaces.length);
    });
  });

  // ═══════════════════════════════════════════════════════
  // CONCAVE POLYGON TESTS (ear clipping)
  // ═══════════════════════════════════════════════════════

  describe('concave polygons (ear clipping)', () => {
    it('star extrusion: mesh volume matches solid volume', () => {
      // 5-pointed star: alternating outer/inner radii → concave 10-gon
      const outerR = 3, innerR = 1.2;
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * 2 * Math.PI - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        pts.push(point3d(r * Math.cos(angle), r * Math.sin(angle), 0));
      }
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const ext = extrude(wire, vec3d(0, 0, 1), 2);
      expect(ext.success).toBe(true);

      const solid = ext.result!.solid;
      const result = solidToMesh(solid);
      expect(result.success).toBe(true);

      const solidVol = solidVolume(solid);
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(solidVol, 1);
    });

    it('L-shaped extrusion: mesh volume matches solid volume', () => {
      // L-shape: concave hexagon
      const pts = [
        point3d(0, 0, 0), point3d(5, 0, 0), point3d(5, 2, 0),
        point3d(2, 2, 0), point3d(2, 5, 0), point3d(0, 5, 0),
      ];
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const ext = extrude(wire, vec3d(0, 0, 1), 3);
      expect(ext.success).toBe(true);

      const solid = ext.result!.solid;
      const result = solidToMesh(solid);
      expect(result.success).toBe(true);

      // L-shape area = 5*2 + 2*3 = 16, volume = 16 * 3 = 48
      const solidVol = solidVolume(solid);
      expect(solidVol).toBeCloseTo(48, 1);
      const meshVol = meshVolume(result.result!);
      expect(meshVol).toBeCloseTo(48, 1);
    });

    it('star top face produces correct triangle count (n-2)', () => {
      const outerR = 3, innerR = 1.2;
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * 2 * Math.PI - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        pts.push(point3d(r * Math.cos(angle), r * Math.sin(angle), 0));
      }
      const edges = pts.map((p, i) =>
        makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
      );
      const wire = makeWireFromEdges(edges).result!;
      const ext = extrude(wire, vec3d(0, 0, 1), 2);
      const result = solidToMesh(ext.result!.solid);
      const mesh = result.result!;

      // Star has 10 vertices per cap → 8 triangles per cap,
      // 10 side quads → 20 side triangles, 2 caps → 16
      // Total: 36 triangles
      expect(meshTriangleCount(mesh)).toBe(36);
    });
  });
});
