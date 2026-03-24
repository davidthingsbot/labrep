export {
  type PlaneSurface,
  makePlaneSurface,
  evaluatePlaneSurface,
  normalPlaneSurface,
} from './plane-surface';

export {
  type CylindricalSurface,
  makeCylindricalSurface,
  evaluateCylindricalSurface,
  normalCylindricalSurface,
} from './cylindrical-surface';

export {
  type ExtrusionSurface,
  makeExtrusionSurface,
  evaluateExtrusionSurface,
  normalExtrusionSurface,
  derivativesExtrusionSurface,
  getCanonicalSurfaceType,
  canonicalizeExtrusionSurface,
} from './extrusion-surface';

export {
  type SphericalSurface,
  makeSphericalSurface,
  evaluateSphericalSurface,
  normalSphericalSurface,
} from './spherical-surface';

export {
  type ConicalSurface,
  makeConicalSurface,
  evaluateConicalSurface,
  normalConicalSurface,
} from './conical-surface';

export {
  type ToroidalSurface,
  makeToroidalSurface,
  evaluateToroidalSurface,
  normalToroidalSurface,
} from './toroidal-surface';

export {
  type RevolutionSurface,
  makeRevolutionSurface,
  evaluateRevolutionSurface,
  normalRevolutionSurface,
  canonicalizeRevolutionSurface,
} from './revolution-surface';
