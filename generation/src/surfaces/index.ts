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
