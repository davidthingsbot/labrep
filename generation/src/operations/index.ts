export {
  type ExtrudeInput,
  type Profile3D,
  type ExtrudeResult,
  validateExtrudeProfile,
  validateExtrudeProfileWithHoles,
  generateSideFace,
  generateCapFaces,
  extrude,
  extrudeWithHoles,
  extrudeSymmetric,
  extrudeSymmetricWithHoles,
} from './extrude';

export {
  type RevolveResult,
  validateRevolveProfile,
  revolve,
  revolvePartial,
} from './revolve';

export {
  type BooleanOp,
  type BooleanResult,
  booleanOperation,
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
} from './boolean';

export { pointInSolid } from './point-in-solid';

export { intersectFaceFace } from './face-face-intersection';

export { builderFace } from './builder-face';
