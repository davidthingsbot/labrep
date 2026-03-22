/**
 * 01-primitives — Basic primitive mesh generation
 *
 * Demonstrates makeBox, makeSphere, and makeCylinder.
 *
 * Run: npx tsx examples/01-primitives/index.ts
 */

import { makeBox, makeSphere, makeCylinder, meshVertexCount, meshTriangleCount } from '../../generation/src';

function show(name: string, result: ReturnType<typeof makeBox>) {
  if (!result.success) {
    console.log(`  ${name}: FAILED — ${result.error}`);
    return;
  }
  const m = result.result!;
  console.log(`  ${name}: ${meshVertexCount(m)} vertices, ${meshTriangleCount(m)} triangles`);
}

console.log('labrep primitives:\n');

show('Box 1x1x1', makeBox(1, 1, 1));
show('Box 2x3x4', makeBox(2, 3, 4));
show('Sphere r=1', makeSphere(1));
show('Sphere r=2 (hi-res)', makeSphere(2, { segments: 64, rings: 32 }));
show('Cylinder r=1 h=2', makeCylinder(1, 2));
show('Cylinder r=0.5 h=3 (hi-res)', makeCylinder(0.5, 3, { segments: 64 }));

console.log('\nError cases:\n');

show('Box 0x1x1', makeBox(0, 1, 1));
show('Sphere r=-1', makeSphere(-1));
show('Cylinder r=1 h=0', makeCylinder(1, 0));
