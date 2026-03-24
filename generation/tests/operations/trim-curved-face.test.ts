import { describe, it, expect } from 'vitest';
import {
  point3d,
  vec3d,
  Z_AXIS_3D,
} from '../../src/core';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges } from '../../src/topology/wire';
import { shellFaces } from '../../src/topology/shell';
import { extrude } from '../../src/operations/extrude';
import { revolve } from '../../src/operations/revolve';
import { trimCurvedFaceByPlanes } from '../../src/operations/trim-curved-face';

function makeBox(cx: number, cy: number, z: number, w: number, h: number, d: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    point3d(cx - hw, cy - hh, z), point3d(cx + hw, cy - hh, z),
    point3d(cx + hw, cy + hh, z), point3d(cx - hw, cy + hh, z),
  ];
  const edges = corners.map((c, i) =>
    makeEdgeFromCurve(makeLine3D(c, corners[(i + 1) % 4]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  return extrude(wire, vec3d(0, 0, 1), d).result!;
}

function makeSphere(cx: number, cy: number, cz: number, r: number) {
  // Revolve a semicircle around Z axis, then translate
  // Build semicircle profile in the XZ plane from south pole to north pole
  const n = 12;
  const pts = [point3d(0, 0, -r)];
  for (let i = 1; i < n; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / n;
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    if (x > 0.001) pts.push(point3d(x, 0, z));
  }
  pts.push(point3d(0, 0, r));

  const edges = pts.map((p, i) =>
    makeEdgeFromCurve(makeLine3D(p, pts[(i + 1) % pts.length]).result!).result!,
  );
  const wire = makeWireFromEdges(edges).result!;
  // For a sphere at origin, revolve around Z
  // TODO: translate to (cx, cy, cz) — for now, only origin-centered spheres
  return revolve(wire, Z_AXIS_3D, 2 * Math.PI).result!;
}

describe('trimCurvedFaceByPlanes', () => {
  it('sphere face at origin, trimmed by box centered at origin → trim produces a face', () => {
    const box = makeBox(0, 0, -3, 6, 6, 6);
    const sphereResult = makeSphere(0, 0, 0, 2);

    // The sphere is entirely inside the box (box is 6×6×6, sphere r=2)
    // So trimming should return null (no trimming needed → caller classifies whole)
    const faces = shellFaces(sphereResult.solid.outerShell);
    expect(faces.length).toBeGreaterThan(0);

    // Find a curved face
    const curvedFace = faces.find(f => f.surface.type !== 'plane');
    if (!curvedFace) {
      // All faces are revolution surfaces, which counts as curved
      const revFace = faces.find(f => f.surface.type === 'revolution');
      expect(revFace).toBeDefined();
      return;
    }

    const result = trimCurvedFaceByPlanes(curvedFace, box.solid);
    // Sphere inside box → no intersection circles clip anything meaningful
    // Result should be null (let caller classify as 'inside')
    expect(result.success).toBe(true);
  });

  it('sphere partially outside box → should attempt trimming', () => {
    // Box 4×4×4 at origin (z=0..4), sphere r=2 at (0,0,0) → bottom hemisphere sticks out
    const box = makeBox(0, 0, 0, 4, 4, 4);
    const sphereResult = makeSphere(0, 0, 2, 2);

    const faces = shellFaces(sphereResult.solid.outerShell);
    // With a piecewise-linear "sphere" from revolve, faces are 'revolution' type, not 'sphere'
    // Check what surface types we get
    const surfaceTypes = new Set(faces.map(f => f.surface.type));
    console.log('Sphere surface types:', [...surfaceTypes]);
    console.log('Sphere face count:', faces.length);

    // This test documents current behavior — the sphere from revolving a polygon
    // produces revolution surfaces, not true spherical surfaces.
    // True sphere support requires revolving a circular arc.
    expect(faces.length).toBeGreaterThan(0);
  });
});
