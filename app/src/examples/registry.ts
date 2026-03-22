import type { Example } from './types';
import { PointsExample } from './PointsExample';
import { VectorsExample } from './VectorsExample';
import { LinesExample } from './LinesExample';
import { BoxExample } from './BoxExample';
import { SphereExample } from './SphereExample';
import { CylinderExample } from './CylinderExample';
import { PrimitivesAllExample } from './PrimitivesAllExample';

/** All registered examples. */
export const examples: Example[] = [
  {
    id: 'points',
    name: 'Points',
    description: 'Point3D visualization with labels',
    component: PointsExample,
    code: `// Points - 3D point visualization
import { point3d, ORIGIN } from '@labrep/generation';

// Origin point
const origin = ORIGIN;  // { x: 0, y: 0, z: 0 }

// Create points at specific coordinates
const p1 = point3d(1, 2, 0);
const p2 = point3d(-1, 1, 1);
const p3 = point3d(2, 0, -1);

// Points are the fundamental building block
// for all geometry in labrep.
`,
  },
  {
    id: 'vectors',
    name: 'Vectors',
    description: 'Vector3D with direction arrows',
    component: VectorsExample,
    code: `// Vectors - 3D direction and magnitude
import { vec3d, X_AXIS, Y_AXIS, Z_AXIS } from '@labrep/generation';

// Standard basis vectors
const xAxis = X_AXIS;  // { x: 1, y: 0, z: 0 }
const yAxis = Y_AXIS;  // { x: 0, y: 1, z: 0 }
const zAxis = Z_AXIS;  // { x: 0, y: 0, z: 1 }

// Custom vector
const diagonal = vec3d(1, 1, 1);

// Vectors represent direction and magnitude,
// used for normals, translations, and more.
`,
  },
  {
    id: 'lines',
    name: 'Lines',
    description: 'Line segments and edges',
    component: LinesExample,
    code: `// Lines - connecting points
import { point3d } from '@labrep/generation';

// Define triangle vertices
const v0 = point3d(0, 0, 0);
const v1 = point3d(2, 0, 0);
const v2 = point3d(1, 1.5, 0);

// Lines connect two points
// Edge 1: v0 -> v1
// Edge 2: v1 -> v2
// Edge 3: v2 -> v0

// Lines form the edges of faces in BRep.
`,
  },
  {
    id: 'primitives-box',
    name: 'Box',
    description: 'Box primitive with Y-axis rotation',
    component: BoxExample,
    code: `// Box - axis-aligned rectangular solid
import { makeBox } from '@labrep/generation';

// Create a unit cube centered at origin
const result = makeBox(1, 1, 1);

if (result.success) {
  const mesh = result.result;
  // mesh.vertices - Float32Array of XYZ positions
  // mesh.normals  - Float32Array of XYZ normals
  // mesh.indices  - Uint32Array of triangle indices
}

// makeBox(width, height, depth)
// Extends from -w/2 to +w/2 along each axis.
`,
  },
  {
    id: 'primitives-sphere',
    name: 'Sphere',
    description: 'Sphere primitive with gentle wobble',
    component: SphereExample,
    code: `// Sphere - UV sphere mesh
import { makeSphere } from '@labrep/generation';

// Create sphere with radius 0.5
const result = makeSphere(0.5);

// Optional: control tessellation
const detailed = makeSphere(0.5, {
  segments: 64,  // longitudinal divisions
  rings: 32      // latitudinal divisions
});

// Sphere is centered at origin.
// Higher segments/rings = smoother surface.
`,
  },
  {
    id: 'primitives-cylinder',
    name: 'Cylinder',
    description: 'Cylinder primitive spinning on axis',
    component: CylinderExample,
    code: `// Cylinder - circular cross-section
import { makeCylinder } from '@labrep/generation';

// Create cylinder: radius 0.4, height 1
const result = makeCylinder(0.4, 1);

// Optional: control tessellation
const detailed = makeCylinder(0.4, 1, {
  segments: 64  // circumference divisions
});

// Cylinder axis is along Y.
// Centered at origin, extends from -h/2 to +h/2.
`,
  },
  {
    id: 'primitives-all',
    name: 'All Primitives',
    description: 'Box, Sphere, and Cylinder together',
    component: PrimitivesAllExample,
    code: `// All Primitives - side by side
import { makeBox, makeSphere, makeCylinder } from '@labrep/generation';

// Create each primitive
const box = makeBox(1, 1, 1);
const sphere = makeSphere(0.5);
const cylinder = makeCylinder(0.4, 1);

// All primitives return OperationResult<Mesh>
// Check .success before using .result

// These are the basic building blocks.
// More complex shapes come from:
// - Boolean operations (union, subtract, intersect)
// - Extrusion and revolution
// - Lofting and sweeping
`,
  },
];

/** Get an example by its ID. */
export function getExampleById(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}
