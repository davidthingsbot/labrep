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
