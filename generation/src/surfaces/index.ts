export {
  type PlaneSurface,
  makePlaneSurface,
  evaluatePlaneSurface,
  normalPlaneSurface,
  projectToPlaneSurface,
} from './plane-surface';

export {
  type CylindricalSurface,
  makeCylindricalSurface,
  evaluateCylindricalSurface,
  normalCylindricalSurface,
  projectToCylindricalSurface,
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
  projectToSphericalSurface,
} from './spherical-surface';

export {
  type ConicalSurface,
  makeConicalSurface,
  evaluateConicalSurface,
  normalConicalSurface,
  projectToConicalSurface,
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

export { type SurfaceAdapter, toAdapter } from './surface-adapter';
