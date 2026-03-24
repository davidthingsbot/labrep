import type { Example } from './types';
import { PointsExample } from './PointsExample';
import { VectorsExample } from './VectorsExample';
import { LinesExample } from './LinesExample';
import { BoxExample } from './BoxExample';
import { SphereExample } from './SphereExample';
import { CylinderExample } from './CylinderExample';
import { PrimitivesAllExample } from './PrimitivesAllExample';
import { Line2DExample } from './Line2DExample';
import { Circle2DExample } from './Circle2DExample';
import { Arc2DExample } from './Arc2DExample';
import { Intersections2DExample } from './Intersections2DExample';
import { Wire2DExample } from './Wire2DExample';
import { Math2DExample } from './Math2DExample';
import { TransformsExample } from './TransformsExample';
import { PlanesAxesExample } from './PlanesAxesExample';
import { BoundingBoxExample } from './BoundingBoxExample';
import { StlRoundtripExample } from './StlRoundtripExample';
import { SketchProfilesExample } from './SketchProfilesExample';
import { StepRoundtripExample } from './StepRoundtripExample';
import { Curves3DExample } from './Curves3DExample';
import { TopologyBoxExample } from './TopologyBoxExample';
import { TopologyStepExample } from './TopologyStepExample';
import { ConstraintSimpleExample } from './ConstraintSimpleExample';
import { ConstraintParametricExample } from './ConstraintParametricExample';
import { ConstraintSolverVizExample } from './ConstraintSolverVizExample';
import { ExtrudeBasicExample } from './ExtrudeBasicExample';
import { ExtrudeProfileExample } from './ExtrudeProfileExample';
import { ExtrudeWithHoleExample } from './ExtrudeWithHoleExample';
import { RevolveBasicExample } from './RevolveBasicExample';
import { RevolveSphereExample } from './RevolveSphereExample';
import { RevolvePartialExample } from './RevolvePartialExample';
import { RevolveIrregularExample } from './RevolveIrregularExample';
import { SketchOnFaceExample } from './SketchOnFaceExample';
import { SketchOnFaceWorkflowExample } from './SketchOnFaceWorkflowExample';
import { SketchOnFaceProjectionExample } from './SketchOnFaceProjectionExample';
import { ExtrudeStepExample } from './ExtrudeStepExample';
import { RevolveStepExample } from './RevolveStepExample';
import { SketchOnFaceStepExample } from './SketchOnFaceStepExample';

/** All registered examples. */
export const examples: Example[] = [
  {
    id: 'points',
    name: 'Points',
    description: 'Point3D functions: distance, midpoint, addVector, tolerance',
    component: PointsExample,
    code: `// Points — all Point3D & tolerance functions
import {
  point3d, ORIGIN, distance, midpoint,
  addVector, subtractPoints, pointsEqual,
  vec3d, TOLERANCE, isZero, isEqual,
} from '@labrep/generation';

const p1 = point3d(2, 0, 0);
const p2 = point3d(0, 2, 0);

const dist = distance(p1, p2);       // ~2.83
const mid = midpoint(p1, p2);        // (1, 1, 0)

const offset = vec3d(0, 0.5, 0);
const moved = addVector(p1, offset);  // (2, 0.5, 0)

const vec = subtractPoints(p2, p1);   // (-2, 2, 0)

// Tolerance-aware comparison
const almostP1 = point3d(2 + TOLERANCE * 0.5, 0, 0);
pointsEqual(p1, almostP1);  // true

isZero(1e-8);               // true
isEqual(1.0, 1.0 + 1e-8);   // true
`,
  },
  {
    id: 'vectors',
    name: 'Vectors',
    description: 'Vector3D: add, cross, dot, normalize, scale, negate',
    component: VectorsExample,
    code: `// Vectors — all Vector3D functions
import {
  vec3d, X_AXIS, Y_AXIS, Z_AXIS,
  length, normalize, add, subtract,
  scale, dot, cross, negate,
} from '@labrep/generation';

const v = vec3d(2, 1, 0);
length(v);                     // ~2.24
const unit = normalize(v);     // unit vector

const v1 = vec3d(1.5, 0, 0);
const v2 = vec3d(0.5, 1, 0);
const sum = add(v1, v2);       // (2, 1, 0)
const diff = subtract(v1, v2); // (1, -1, 0)

scale(Y_AXIS, 2);             // (0, 2, 0)
dot(v1, v2);                   // 0.75
cross(X_AXIS, Y_AXIS);        // Z_AXIS
negate(X_AXIS);                // (-1, 0, 0)
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
    id: 'math-2d',
    name: '2D Math',
    description: 'All Point2D and Vector2D functions',
    component: Math2DExample,
    code: `// 2D Math — Point2D & Vector2D functions
import {
  point2d, ORIGIN_2D, distance2d, midpoint2d,
  addVector2d, subtractPoints2d, points2dEqual,
  vec2d, X_AXIS_2D, Y_AXIS_2D,
  length2d, normalize2d, add2d, subtract2d,
  scale2d, dot2d, perpendicular,
} from '@labrep/generation';

const a = point2d(1, 0.5);
const b = point2d(-1, 1.5);
distance2d(a, b);            // ~2.24
midpoint2d(a, b);            // (0, 1)
addVector2d(a, vec2d(1, 0)); // (2, 0.5)
subtractPoints2d(b, a);      // (-2, 1)
points2dEqual(a, point2d(1 + 1e-8, 0.5)); // true

const v = vec2d(1.5, 0.8);
length2d(v);       // ~1.7
normalize2d(v);    // unit vector
add2d(v, vec2d(0.5, 1.2));
subtract2d(v, vec2d(0.5, 1.2));
scale2d(X_AXIS_2D, 2);
dot2d(v, Y_AXIS_2D);
perpendicular(v);  // 90° CCW rotation
`,
  },
  {
    id: 'transforms',
    name: 'Transforms',
    description: 'Transform3D: translate, rotate, scale, compose, inverse',
    component: TransformsExample,
    code: `// Transforms — all Transform3D functions
import {
  point3d, ORIGIN, vec3d,
  identity, translation, rotationX, rotationY, rotationZ,
  scaling, compose, inverse,
  transformPoint, transformVector,
} from '@labrep/generation';

const id = identity();
transformPoint(id, point3d(1, 2, 3));  // unchanged

const t = translation(2, 0, 0);
transformPoint(t, ORIGIN);              // (2, 0, 0)

const r = rotationY(Math.PI / 4);      // 45° around Y
transformPoint(r, point3d(1, 0, 0));

scaling(2, 1, 0.5);                     // non-uniform

// compose: apply translate then rotate
const orbit = compose(rotationY(0.5), translation(1.5, 0, 0));
transformPoint(orbit, ORIGIN);

// inverse: undo a transform
const inv = inverse(t);
transformPoint(compose(inv, t), point3d(1, 1, 1));  // (1, 1, 1)

// transformVector ignores translation
transformVector(t, vec3d(1, 0, 0));  // still (1, 0, 0)
`,
  },
  {
    id: 'planes-axes',
    name: 'Planes & Axes',
    description: 'Axis, Plane, distanceToPoint, projectPoint, containsPoint',
    component: PlanesAxesExample,
    code: `// Planes & Axes — coordinate systems
import {
  point3d, vec3d,
  axis, X_AXIS_3D, Y_AXIS_3D, Z_AXIS_3D,
  plane, XY_PLANE, XZ_PLANE, YZ_PLANE,
  distanceToPoint, projectPoint, containsPoint,
} from '@labrep/generation';

// Axes: origin + direction
const customAxis = axis(point3d(0, 0, 0), vec3d(1, 1, 0));
// direction is auto-normalized

// Plane constants
const xy = XY_PLANE;  // normal = +Z

// Custom plane
const tilted = plane(
  point3d(0, 0, 0), vec3d(0, 1, 0.5), vec3d(1, 0, 0)
);

// Queries
const pt = point3d(1, 2, 3);
distanceToPoint(xy, pt);     // 3 (signed, +Z side)
const proj = projectPoint(xy, pt);  // (1, 2, 0)
containsPoint(xy, proj);     // true
containsPoint(xy, pt);       // false
`,
  },
  {
    id: 'bounding-boxes',
    name: 'Bounding Boxes',
    description: 'BoundingBox3D: create, addPoint, contains, intersects',
    component: BoundingBoxExample,
    code: `// Bounding Boxes — axis-aligned bounds
import {
  point3d, boundingBox, emptyBoundingBox,
  addPoint, contains, center, size,
  intersects, isEmpty,
} from '@labrep/generation';

// Create from min/max corners
const box = boundingBox(
  point3d(-1, -0.5, -0.5),
  point3d(1, 1, 0.5)
);

// Build incrementally
let b = emptyBoundingBox();
isEmpty(b);  // true
b = addPoint(b, point3d(0, 0, 0));
b = addPoint(b, point3d(1, 2, 1));
isEmpty(b);  // false

// Queries
center(box);                        // (0, 0.25, 0)
size(box);                          // (2, 1.5, 1)
contains(box, point3d(0, 0, 0));    // true
contains(box, point3d(5, 5, 5));    // false
intersects(box, b);                 // true/false
`,
  },
  {
    id: 'curves-line2d',
    name: 'Line2D',
    description: 'All Line2D functions: evaluate, tangent, reverse, fromPointDir',
    component: Line2DExample,
    code: `// Line2D — all functions
import {
  point2d, vec2d, makeLine2D, makeLine2DFromPointDir,
  evaluateLine2D, tangentLine2D, lengthLine2D, reverseLine2D,
} from '@labrep/generation';

const line = makeLine2D(point2d(-2, -0.5), point2d(2, 1.5));
const dirLine = makeLine2DFromPointDir(point2d(0, 0), vec2d(3, 1));

if (line.success) {
  const seg = line.result;
  evaluateLine2D(seg, seg.segmentLength / 2);  // midpoint
  tangentLine2D(seg, 0);       // constant direction
  lengthLine2D(seg);           // segment length
  const rev = reverseLine2D(seg);  // reversed copy
}
`,
  },
  {
    id: 'curves-circle2d',
    name: 'Circle2D',
    description: 'All Circle2D functions: tangent, through3Points, circumference',
    component: Circle2DExample,
    code: `// Circle2D — all functions
import {
  point2d, makeCircle2D, makeCircle2DThrough3Points,
  evaluateCircle2D, tangentCircle2D, lengthCircle2D,
} from '@labrep/generation';

const c1 = makeCircle2D(point2d(0, 0), 1.5);
const c2 = makeCircle2DThrough3Points(
  point2d(2.5, -0.5), point2d(3.5, 0.5), point2d(2.5, 1.5)
);

if (c1.success) {
  evaluateCircle2D(c1.result, Math.PI / 4);  // point at 45°
  tangentCircle2D(c1.result, Math.PI / 4);   // tangent vector
  lengthCircle2D(c1.result);                  // 2*pi*r
}
`,
  },
  {
    id: 'curves-arc2d',
    name: 'Arc2D',
    description: 'All Arc2D functions: tangent, reverse, through3Points, fromBulge',
    component: Arc2DExample,
    code: `// Arc2D — all functions
import {
  point2d, makeArc2D, makeArc2DThrough3Points,
  makeArc2DFromBulge, evaluateArc2D, tangentArc2D,
  lengthArc2D, reverseArc2D,
} from '@labrep/generation';

const a1 = makeArc2D(point2d(0, 0), 1, 0, Math.PI / 2);
const a2 = makeArc2DThrough3Points(
  point2d(-0.5, -0.5), point2d(0.5, 0.5), point2d(1.5, -0.3)
);
const a3 = makeArc2DFromBulge(point2d(2, -1), point2d(3.5, 1), 0.5);

if (a1.success) {
  evaluateArc2D(a1.result, Math.PI / 4);   // point on arc
  tangentArc2D(a1.result, Math.PI / 4);    // tangent vector
  lengthArc2D(a1.result);                   // arc length
  reverseArc2D(a1.result);                  // reversed copy
}
`,
  },
  {
    id: 'curves-intersection',
    name: 'Intersections',
    description: 'All intersection functions: line-line, line-circle, circle-circle',
    component: Intersections2DExample,
    code: `// 2D Curve Intersections — all 3 functions
import {
  point2d, makeLine2D, makeCircle2D,
  intersectLine2DLine2D,
  intersectLine2DCircle2D,
  intersectCircle2DCircle2D,
} from '@labrep/generation';

const l1 = makeLine2D(point2d(-3, -1.5), point2d(0, 2));
const l2 = makeLine2D(point2d(-3, 1), point2d(0, -2));
const c1 = makeCircle2D(point2d(2, 0), 1.5);
const c2 = makeCircle2D(point2d(3.5, 0), 1.2);

// Line-line: 0 or 1 intersection
intersectLine2DLine2D(l1.result, l2.result);

// Line-circle: 0, 1, or 2
intersectLine2DCircle2D(l1.result, c1.result);

// Circle-circle: 0, 1, or 2
intersectCircle2DCircle2D(c1.result, c2.result);
// Each: { point, paramOnCurve1, paramOnCurve2 }
`,
  },
  {
    id: 'curves-wire2d',
    name: 'Wire2D',
    description: 'Connected curve sequence forming a closed path',
    component: Wire2DExample,
    code: `// Wire2D - connected curve path
import {
  point2d, makeLine2D, makeArc2D,
  makeWire2D, lengthWire2D,
} from '@labrep/generation';

// Build a rounded rectangle from lines + arcs
const bottom = makeLine2D(point2d(-2, -1.4), point2d(2, -1.4));
const corner = makeArc2D(point2d(2, -1), 0.4, -Math.PI/2, 0);
// ... more segments ...

const wire = makeWire2D([
  bottom.result, corner.result, /* ... */
]);

if (wire.success) {
  const w = wire.result;
  // w.isClosed — true if ends connect
  // w.curves   — the curve sequence
  // lengthWire2D(w) — total path length
}
`,
  },
  {
    id: 'stl-roundtrip',
    name: 'STL Round-Trip',
    description: 'Export to STL, import back, compare original vs imported',
    component: StlRoundtripExample,
    code: `// STL Round-Trip — export and re-import
import {
  makeBox, makeSphere, makeCylinder,
  meshToStlAscii, meshToStlBinary, stlToMesh,
  meshVertexCount, meshTriangleCount, validateMesh,
} from '@labrep/generation';

// Create a mesh
const box = makeBox(1, 1, 1).result;

// Export to ASCII STL
const asciiStl = meshToStlAscii(box, 'mybox');
// asciiStl is a string: "solid mybox\\n  facet normal..."

// Export to binary STL (smaller, faster)
const binaryStl = meshToStlBinary(box);
// binaryStl is an ArrayBuffer

// Import back (auto-detects format)
const imported = stlToMesh(asciiStl);
// or: stlToMesh(binaryStl)

if (imported.success) {
  const m = imported.result;
  meshTriangleCount(m);  // same as original
  meshVertexCount(m);    // de-duplicated vertices
  validateMesh(m);       // check mesh validity
}
`,
  },
  {
    id: 'step-roundtrip',
    name: 'STEP Round-Trip',
    description: 'Export foundation types to STEP, parse back, compare',
    component: StepRoundtripExample,
    code: `// STEP Round-Trip — foundation types
import {
  point3d, XY_PLANE, X_AXIS,
  createStepModelBuilder, point3DToStep,
  vector3DToStep, planeToStep,
  writeStep, parseStep, extractFoundationTypes,
} from '@labrep/generation';

// Build a STEP model
const builder = createStepModelBuilder();
builder.addEntity(point3DToStep(point3d(1, 2, 3), builder.nextId()));
vector3DToStep(X_AXIS, builder.nextId());
planeToStep(XY_PLANE, builder);

// Export to STEP text
const stepText = writeStep(builder.build());
// stepText is ISO-10303-21 formatted text

// Parse it back
const parsed = parseStep(stepText);

// Extract typed objects from the parsed model
const types = extractFoundationTypes(parsed.result);
// types.points — Map<number, Point3D>
// types.directions — Map<number, Vector3D>
// types.planes — Map<number, Plane>
`,
  },
  {
    id: 'sketch-profiles',
    name: 'Sketch Profiles',
    description: 'Region detection: rectangle, divider, hole, arc+line',
    component: SketchProfilesExample,
    code: `// Sketch Profiles — region detection
import {
  point2d, XY_PLANE,
  createSketch, addElement, findProfiles,
  profileArea, profileContainsPoint,
  makeLine2D, makeCircle2D, makeArc2D,
} from '@labrep/generation';

// Create a sketch and add geometry
let sketch = createSketch(XY_PLANE);
sketch = addElement(sketch, makeLine2D(point2d(0, 0), point2d(2, 0)).result);
sketch = addElement(sketch, makeLine2D(point2d(2, 0), point2d(2, 1)).result);
sketch = addElement(sketch, makeLine2D(point2d(2, 1), point2d(0, 1)).result);
sketch = addElement(sketch, makeLine2D(point2d(0, 1), point2d(0, 0)).result);

// Add a hole (circle inside the rectangle)
sketch = addElement(sketch, makeCircle2D(point2d(1, 0.5), 0.3).result);

// Detect closed profiles automatically
const profiles = findProfiles(sketch);
// profiles[0].outer — CCW boundary wire
// profiles[0].holes — array of CW hole wires

profileArea(profiles[0]);                    // signed area
profileContainsPoint(profiles[0], point2d(0.5, 0.5));  // true
profileContainsPoint(profiles[0], point2d(1, 0.5));    // false (in hole)
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
    description: 'All primitives with mesh stats (vertex/triangle counts)',
    component: PrimitivesAllExample,
    code: `// All Primitives — with mesh inspection
import {
  makeBox, makeSphere, makeCylinder,
  meshVertexCount, meshTriangleCount, validateMesh,
} from '@labrep/generation';

const box = makeBox(1, 1, 1);
const sphere = makeSphere(0.5);
const cylinder = makeCylinder(0.4, 1);

if (box.success) {
  const m = box.result;
  meshVertexCount(m);       // 24 (4 per face)
  meshTriangleCount(m);     // 12 (2 per face)
  validateMesh(m).success;  // true
}
`,
  },
  {
    id: 'curves-3d',
    name: '3D Curves',
    description: 'Line3D, Circle3D, Arc3D with animated evaluation and tangent vectors',
    component: Curves3DExample,
    code: `// 3D Curves — Line3D, Circle3D, Arc3D
import {
  point3d, vec3d, plane, XY_PLANE,
  makeLine3D, makeCircle3D, makeArc3D,
  evaluateLine3D, evaluateCircle3D, evaluateArc3D,
  tangentLine3D, tangentCircle3D, tangentArc3D,
} from '@labrep/generation';

// Line3D — 3D line segment
const line = makeLine3D(point3d(0, 0, 0), point3d(3, 4, 5));
evaluateLine3D(line.result, t);  // point at parameter t
tangentLine3D(line.result, t);   // constant direction

// Circle3D — full circle on a plane
const circle = makeCircle3D(XY_PLANE, 1.5);
evaluateCircle3D(circle.result, theta);  // θ in radians
tangentCircle3D(circle.result, theta);   // perpendicular to radius

// Arc3D — portion of a circle
const arc = makeArc3D(tiltedPlane, 1.2, 0, Math.PI);
evaluateArc3D(arc.result, theta);
tangentArc3D(arc.result, theta);
`,
  },
  {
    id: 'topology-box',
    name: 'Topology Box',
    description: 'Unit cube as explicit BRep: 8 vertices, 12 edges, 6 faces, 1 shell, 1 solid',
    component: TopologyBoxExample,
    code: `// Topology Box — explicit BRep structure
import {
  point3d, makeLine3D,
  makeVertex, makeEdgeFromCurve, orientEdge,
  makeWire, makePlanarFace, makeShell, makeSolid,
  solidVolume,
} from '@labrep/generation';

// 8 vertices
const v0 = makeVertex(point3d(0, 0, 0));
const v1 = makeVertex(point3d(1, 0, 0));
// ... 6 more

// 12 edges
const e0 = makeEdgeFromCurve(makeLine3D(v0.point, v1.point).result);
// ... 11 more

// 6 faces from wires
const bottomWire = makeWire([orientEdge(e0, true), ...]);
const bottomFace = makePlanarFace(bottomWire.result);
// ... 5 more faces

// Shell and Solid
const shell = makeShell([bottomFace, topFace, ...]);
const solid = makeSolid(shell.result);
solidVolume(solid.result);  // 1.0
`,
  },
  {
    id: 'topology-step',
    name: 'STEP Export',
    description: 'Export BRep solid to STEP format, showing entity count',
    component: TopologyStepExample,
    code: `// STEP Export — BRep to STEP serialization
import {
  point3d, makeLine3D,
  makeEdgeFromCurve, orientEdge, makeWire,
  makePlanarFace, makeShell, makeSolid,
  createStepModelBuilder, solidToStep, writeStep,
} from '@labrep/generation';

// Build a box solid
const faces = [bottomFace, topFace, front, back, left, right];
const shell = makeShell(faces);
const solid = makeSolid(shell.result);

// Export to STEP
const builder = createStepModelBuilder();
solidToStep(solid.result, builder);
const stepText = writeStep(builder.build());

// stepText is ISO-10303-21 formatted:
// ISO-10303-21;
// HEADER; ... ENDSEC;
// DATA;
//   #1 = CARTESIAN_POINT(...);
//   #2 = DIRECTION(...);
//   ...
//   #N = MANIFOLD_SOLID_BREP(...);
// ENDSEC;
// END-ISO-10303-21;
`,
  },
  {
    id: 'constraint-simple',
    name: 'Constraint Solver',
    description: 'Rectangle with H/V constraints, coincident corners, solve visualization',
    component: ConstraintSimpleExample,
    code: `// Constraint Solving — Rectangle
import {
  point2d, XY_PLANE, makeLine2D,
  createConstrainedSketch, addElement, addConstraint,
  solveSketch, sketchDOF,
} from '@labrep/generation';

// Create sketch with imperfect rectangle
let sketch = createConstrainedSketch(XY_PLANE);
sketch = addElement(sketch, makeLine2D(point2d(-1.5, -1.0), point2d(1.6, -0.9)).result);
// ... more lines

// Add constraints
addConstraint(sketch, { type: 'horizontal', line: { elementId: bottomId } });
addConstraint(sketch, { type: 'vertical', line: { elementId: leftId } });
addConstraint(sketch, {
  type: 'coincident',
  point1: { elementId: bottomId, which: 'end' },
  point2: { elementId: rightId, which: 'start' },
});

// Solve — geometry updates to satisfy constraints
const result = solveSketch(sketch);
// result.status === 'solved'
// Lines are now perfectly H/V and connected
`,
  },
  {
    id: 'constraint-parametric',
    name: 'Parametric Design',
    description: 'L-bracket with live parameter sliders for width, height, thickness',
    component: ConstraintParametricExample,
    code: `// Parametric Design — L-Bracket
import {
  point2d, XY_PLANE, makeLine2D, makeCircle2D,
  createConstrainedSketch, addElement,
  addSketchParameter, setSketchParameter,
  addConstraint, solveSketch, paramRef,
} from '@labrep/generation';

// Create bracket shape
let sketch = createConstrainedSketch(XY_PLANE);
// ... add lines for L-shape and hole

// Add parameters
addSketchParameter(sketch, 'width', 3);
addSketchParameter(sketch, 'height', 2.5);
addSketchParameter(sketch, 'thickness', 0.8);
addSketchParameter(sketch, 'holeRadius', 0.3);

// Use parameters in constraints
addConstraint(sketch, {
  type: 'horizontalDistance',
  point1: { elementId: leftId, which: 'start' },
  point2: { elementId: rightId, which: 'start' },
  value: paramRef('width'),
});

// Change parameter → geometry updates
setSketchParameter(sketch, 'width', 4.0);
solveSketch(sketch);
`,
  },
  {
    id: 'constraint-solver-viz',
    name: 'Solver Visualization',
    description: 'Step-by-step Newton-Raphson iteration, residual convergence, DOF',
    component: ConstraintSolverVizExample,
    code: `// Solver Internals — Step-by-step
import {
  point2d, XY_PLANE, makeLine2D,
  createConstrainedSketch, addElement, addConstraint,
  initSolverState, solveStep, sketchDOF,
} from '@labrep/generation';

// Create sketch with bad initial geometry
let sketch = createConstrainedSketch(XY_PLANE);
// ... add triangle with misaligned vertices

// Add constraints
addConstraint(sketch, { type: 'horizontal', line: { elementId: id1 } });
addConstraint(sketch, { type: 'coincident', ... });

// Initialize solver state
let state = initSolverState(sketch, sketch.constraints);

// Step through iterations
while (!state.converged) {
  state = solveStep(state, sketch.parameters);
  console.log(\`Iteration \${state.iteration}: residual = \${state.residual}\`);
  // Visualize intermediate geometry
}
`,
  },
  {
    id: 'extrude-basic',
    name: 'Extrude Basic',
    description: 'Rectangle → Box and Circle → Cylinder with volume calculation',
    component: ExtrudeBasicExample,
    code: `// Extrude Basic — Rectangle to Box, Circle to Cylinder
import {
  point3d, vec3d, plane,
  makeLine3D, makeCircle3D, makeEdgeFromCurve,
  orientEdge, makeWire, extrude, solidVolume,
} from '@labrep/generation';

// Create a rectangular wire on XY plane
const corners = [
  point3d(-5, -3, 0), point3d(5, -3, 0),
  point3d(5, 3, 0), point3d(-5, 3, 0),
];
const edges = corners.map((p, i) =>
  makeEdgeFromCurve(makeLine3D(p, corners[(i+1)%4]).result).result
);
const rectWire = makeWire(edges.map(e => orientEdge(e, true))).result;

// Extrude to create box
const boxResult = extrude(rectWire, vec3d(0, 0, 1), 8);
// boxResult.solid — the 3D solid
// boxResult.bottomFace, topFace — cap faces
// boxResult.sideFaces — 4 side faces

solidVolume(boxResult.result.solid);  // 10 * 6 * 8 = 480
`,
  },
  {
    id: 'extrude-profile',
    name: 'Extrude Profile',
    description: 'L-bracket and U-channel non-convex profile extrusions',
    component: ExtrudeProfileExample,
    code: `// Extrude Profile — Non-convex shapes
import {
  point3d, vec3d, makeLine3D, makeEdgeFromCurve,
  orientEdge, makeWire, extrude, solidVolume,
} from '@labrep/generation';

// L-bracket profile
const lPoints = [
  point3d(0, 0, 0), point3d(10, 0, 0),
  point3d(10, 15, 0), point3d(20, 15, 0),
  point3d(20, 25, 0), point3d(0, 25, 0),
];
const lEdges = lPoints.map((p, i) =>
  makeEdgeFromCurve(makeLine3D(p, lPoints[(i+1)%6]).result).result
);
const lWire = makeWire(lEdges.map(e => orientEdge(e, true))).result;

// Extrude L-bracket 5mm
const bracket = extrude(lWire, vec3d(0, 0, 1), 5);
// 8 faces: 2 L-shaped caps + 6 side faces

// U-channel similarly...
`,
  },
  {
    id: 'extrude-with-hole',
    name: 'Extrude with Hole',
    description: 'Square profile with circular through-hole → housing',
    component: ExtrudeWithHoleExample,
    code: `// Extrude with Hole — Through-hole housing
import {
  point3d, vec3d, plane,
  makeLine3D, makeCircle3D, makeEdgeFromCurve,
  orientEdge, makeWire, extrudeWithHoles, solidVolume,
} from '@labrep/generation';

// Outer profile: 30x30 square
const outerWire = makeSquareWire(30);

// Hole: circle with radius 8, reversed orientation
const holePlane = plane(point3d(0, 0, 0), vec3d(0, 0, 1));
const circle = makeCircle3D(holePlane, 8).result;
const holeEdge = makeEdgeFromCurve(circle).result;
const holeWire = makeWire([orientEdge(holeEdge, false)]).result;

// Extrude with hole
const housing = extrudeWithHoles(
  outerWire, [holeWire], vec3d(0, 0, 1), 15
);

// Volume = (30² - π×8²) × 15 ≈ 10479
solidVolume(housing.result.solid);
`,
  },
  {
    id: 'extrude-step',
    name: 'Extrude STEP Round-Trip',
    description: 'Animated box and cylinder exported to STEP and parsed back with live stats',
    component: ExtrudeStepExample,
    code: `// Extrude STEP Round-Trip
import { extrude, solidToStep, createStepModelBuilder,
  writeStep, parseStep } from '@labrep/generation';

const solid = extrude(wire, vec3d(0,0,1), 10).result!.solid;
const builder = createStepModelBuilder();
solidToStep(solid, builder);
const stepText = writeStep(builder.build());
const parsed = parseStep(stepText); // Round-trip!
console.log('Entities:', parsed.result!.entities.size);
`,
  },
  {
    id: 'revolve-basic',
    name: 'Revolve Basic',
    description: 'Animated profile morphing — cylinder and cone dimensions change live',
    component: RevolveBasicExample,
    code: `// Revolve Basic — Rectangle to Cylinder, Triangle to Cone
import { point3d, vec3d, Z_AXIS_3D, makeLine3D, makeEdgeFromCurve,
  makeWireFromEdges, revolve, solidVolume } from '@labrep/generation';

// Rectangle in XZ plane (one edge on Z axis)
const p1 = point3d(0, 0, 0), p2 = point3d(3, 0, 0);
const p3 = point3d(3, 0, 5), p4 = point3d(0, 0, 5);
const edges = [p1, p2, p3, p4].map((a, i, arr) =>
  makeEdgeFromCurve(makeLine3D(a, arr[(i + 1) % 4]).result!).result!
);
const wire = makeWireFromEdges(edges).result!;

// Full 360° revolve around Z axis → solid cylinder
const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
console.log('Volume:', solidVolume(result.result!.solid));
// → ~141.37 (π × 3² × 5)
`,
  },
  {
    id: 'revolve-sphere',
    name: 'Revolve Sphere & Torus',
    description: 'Animated torus sweep — circle profile swept around axis with growing angle',
    component: RevolveSphereExample,
    code: `// Revolve — Circle offset from axis → Torus
import { point3d, vec3d, plane, Z_AXIS_3D, makeCircle3D,
  makeEdgeFromCurve, makeWireFromEdges, revolve, solidVolume } from '@labrep/generation';

// Circle of radius 1 centered at (4, 0, 0) in the XZ plane
const circlePlane = plane(point3d(4, 0, 0), vec3d(0, -1, 0), vec3d(1, 0, 0));
const circle = makeCircle3D(circlePlane, 1).result!;
const edge = makeEdgeFromCurve(circle).result!;
const wire = makeWireFromEdges([edge]).result!;

// Revolve around Z axis → torus (major R=4, minor r=1)
const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
console.log('Volume:', solidVolume(result.result!.solid));
// → ~78.96 (2π²Rr² = 2π² × 4 × 1)
`,
  },
  {
    id: 'revolve-partial',
    name: 'Revolve Partial',
    description: 'Animated partial revolve with varying sweep angle',
    component: RevolvePartialExample,
    code: `// Partial Revolve — sweep angle varies
import { point3d, Z_AXIS_3D, makeLine3D, makeEdgeFromCurve,
  makeWireFromEdges, revolvePartial, solidVolume } from '@labrep/generation';

// Rectangle profile
const wire = makeWireFromEdges([...]).result!;

// 90° partial revolve → quarter cylinder
const result = revolvePartial(wire, Z_AXIS_3D, 0, Math.PI / 2);
console.log('Volume:', solidVolume(result.result!.solid));
// → ~35.34 (π × 3² × 5 / 4)
`,
  },
  {
    id: 'revolve-irregular',
    name: 'Revolve Irregular',
    description: 'Animated deforming vase profile — shows success/failure states',
    component: RevolveIrregularExample,
    code: `// Revolve Irregular — deforming vase profile
import { point3d, Z_AXIS_3D, makeLine3D, makeEdgeFromCurve,
  makeWireFromEdges, revolve, solidVolume } from '@labrep/generation';

// Irregular "vase" profile in XZ plane
const profile = [
  point3d(0, 0, 0),    // on axis
  point3d(3, 0, 0),    // base
  point3d(1.5, 0, 2),  // waist (narrow)
  point3d(2.5, 0, 5),  // top rim
  point3d(0, 0, 5),    // back to axis
];
// Build wire from consecutive line edges...
const wire = makeWireFromEdges([...edges...]).result!;

// Revolve — creates a vase-shaped solid of revolution
const result = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
if (result.success) {
  console.log('Volume:', solidVolume(result.result!.solid));
}
`,
  },
  {
    id: 'revolve-step',
    name: 'Revolve STEP Round-Trip',
    description: 'Revolve solid to STEP and back — live entity counts and verification',
    component: RevolveStepExample,
    code: `// Revolve STEP Round-Trip
import { revolve, solidToStep, createStepModelBuilder,
  writeStep, parseStep } from '@labrep/generation';

const solid = revolve(wire, Z_AXIS_3D, 2 * Math.PI).result!.solid;
const builder = createStepModelBuilder();
solidToStep(solid, builder);
const stepText = writeStep(builder.build());
const parsed = parseStep(stepText); // Round-trip!
console.log('Entities:', parsed.result!.entities.size);
`,
  },
  {
    id: 'sketch-on-face',
    name: 'Sketch on Face',
    description: 'Cycle through box faces — extract plane, show normal and planar status',
    component: SketchOnFaceExample,
    code: `// Sketch on Face — extract plane from face
import { extrude, getPlaneFromFace } from '@labrep/generation';

// Extrude a box, then extract planes from each face
const box = extrude(wire, vec3d(0,0,1), 8).result!;
const topPlane = getPlaneFromFace(box.topFace);
// topPlane.result → { origin: (0,0,8), normal: (0,0,1), xAxis: (1,0,0) }
`,
  },
  {
    id: 'sketch-on-face-workflow',
    name: 'Sketch on Face: Workflow',
    description: 'Multi-feature: box + animated cylinder sketched and extruded from top face',
    component: SketchOnFaceWorkflowExample,
    code: `// Multi-feature workflow: box + cylinder from top face
import { extrude, createSketchOnFace, addElement, findProfiles,
  liftProfile2DToProfile3D, makeCircle2D, point2d } from '@labrep/generation';

const box = extrude(boxWire, vec3d(0,0,1), 5).result!;
const sketch = createSketchOnFace(box.topFace).result!;
const withCircle = addElement(sketch, makeCircle2D(point2d(0,0), 1.5).result!);
const profiles = findProfiles(withCircle);
const lifted = liftProfile2DToProfile3D(profiles[0], withCircle.plane).result!;
const cylinder = extrude(lifted.outerWire, vec3d(0,0,1), 4);
`,
  },
  {
    id: 'sketch-on-face-projection',
    name: 'Sketch on Face: Projection',
    description: 'Project edges onto a tilting plane — lines foreshorten as angle changes',
    component: SketchOnFaceProjectionExample,
    code: `// Edge projection onto a plane
import { projectEdgeToSketch, sketchToWorld } from '@labrep/generation';

// Project 3D edge onto a sketch plane
const result = projectEdgeToSketch(edge, sketchPlane);
if (result.success) {
  const line2d = result.result; // Line2D on the sketch plane
  // Lift back to 3D for visualization:
  const start3d = sketchToWorld(sketchPlane, line2d.startPoint);
}
`,
  },
  {
    id: 'sketch-on-face-step',
    name: 'Sketch-on-Face STEP Round-Trip',
    description: 'Multi-feature (box + cylinder) with independent STEP export and round-trip',
    component: SketchOnFaceStepExample,
    code: `// Multi-feature STEP Round-Trip
import { extrude, createSketchOnFace, solidToStep,
  createStepModelBuilder, writeStep, parseStep } from '@labrep/generation';

// Box + cylinder from sketch-on-face workflow
const boxSolid = extrude(boxWire, dir, height).result!.solid;
const cylSolid = extrude(liftedWire, dir, cylH).result!.solid;

// Export each independently to STEP
for (const solid of [boxSolid, cylSolid]) {
  const builder = createStepModelBuilder();
  solidToStep(solid, builder);
  const text = writeStep(builder.build());
  const parsed = parseStep(text);
  console.log('OK:', parsed.success, 'Entities:', parsed.result!.entities.size);
}
`,
  },
];

/** Get an example by its ID. */
export function getExampleById(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}
