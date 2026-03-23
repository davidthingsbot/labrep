// STL I/O
export { meshToStlAscii } from './stl-ascii-writer';
export { meshToStlBinary } from './stl-binary-writer';
export { stlAsciiToMesh } from './stl-ascii-reader';
export { stlBinaryToMesh } from './stl-binary-reader';
export { stlToMesh } from './stl';

// STEP types
export {
  type StepValue,
  type StepEntity,
  type StepHeader,
  type StepModel,
  defaultHeader,
} from './step-model';

// STEP I/O
export { tokenize, type Token } from './step-lexer';
export { parseStep } from './step-parser';
export { writeStep } from './step-writer';
export { createStepModelBuilder, type StepModelBuilder } from './step-model-builder';

// STEP converters
export {
  stepToPoint3D, point3DToStep,
  stepToVector3D, vector3DToStep,
  stepToAxis, axisToStep,
  stepToPlane, planeToStep,
  extractFoundationTypes,
} from './step-converters';

// STEP 3D curve converters
export {
  line3DToStep, stepToLine3D,
  circle3DToStep, stepToCircle3D,
  arc3DToStep, stepToArc3D,
} from './step-converters-3d';

// STEP topology converters
export {
  vertexToStep, stepToVertex,
  edgeToStep, stepToEdge,
  wireToStep,
  faceToStep,
  shellToStep,
  solidToStep,
} from './step-converters-topology';

// STEP surface converters
export {
  planeSurfaceToStep, stepToPlaneSurface,
  cylindricalSurfaceToStep, stepToCylindricalSurface,
  extrusionSurfaceToStep, stepToExtrusionSurface,
} from './step-converters-surfaces';
