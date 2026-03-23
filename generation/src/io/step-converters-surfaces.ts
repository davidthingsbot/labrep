import { point3d, vec3d, normalize, plane, axis } from '../core';
import { PlaneSurface, CylindricalSurface, ExtrusionSurface } from '../surfaces';
import { OperationResult, success, failure } from '../mesh/mesh';
import { type StepEntity, type StepModel } from './step-model';
import { type StepModelBuilder } from './step-model-builder';
import {
  point3DToStep,
  vector3DToStep,
  planeToStep,
  axisToStep,
  stepToPoint3D,
  stepToVector3D,
  stepToAxis,
  stepToPlane,
} from './step-converters';
import { line3DToStep, circle3DToStep, stepToLine3D, stepToCircle3D } from './step-converters-3d';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function resolveRef(val: any, model: StepModel): StepEntity | null {
  if (val?.type !== 'ref') return null;
  return model.entities.get(val.id) ?? null;
}

function extractReal(val: any): number | null {
  if (val?.type === 'real') return val.value;
  if (val?.type === 'integer') return val.value;
  return null;
}

// ═══════════════════════════════════════════════════════
// PLANE SURFACE ←→ STEP PLANE
// ═══════════════════════════════════════════════════════

/**
 * Create STEP entities for a PlaneSurface.
 *
 * STEP structure:
 * - AXIS2_PLACEMENT_3D (plane position)
 * - PLANE (placement reference)
 */
export function planeSurfaceToStep(
  surface: PlaneSurface,
  builder: StepModelBuilder,
): StepEntity[] {
  const entities: StepEntity[] = [];

  // Create placement
  const planeEntities = planeToStep(surface.plane, builder);
  entities.push(...planeEntities);
  const ax2Id = planeEntities[planeEntities.length - 1].id;

  // Create PLANE
  const planeId = builder.nextId();
  const planeEntity: StepEntity = {
    id: planeId,
    typeName: 'PLANE',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: ax2Id },
    ],
  };
  builder.addEntity(planeEntity);
  entities.push(planeEntity);

  return entities;
}

/**
 * Extract a PlaneSurface from a STEP PLANE entity.
 */
export function stepToPlaneSurface(
  entity: StepEntity,
  model: StepModel,
): OperationResult<PlaneSurface> {
  if (entity.typeName !== 'PLANE') {
    return failure(`Expected PLANE, got ${entity.typeName}`);
  }

  const ax2Entity = resolveRef(entity.attributes[1], model);
  if (!ax2Entity) return failure('PLANE: cannot resolve placement reference');

  const planeResult = stepToPlane(ax2Entity, model);
  if (!planeResult.success) return failure(`PLANE placement: ${planeResult.error}`);

  return success({
    type: 'plane',
    plane: planeResult.result!,
  });
}

// ═══════════════════════════════════════════════════════
// CYLINDRICAL SURFACE ←→ STEP CYLINDRICAL_SURFACE
// ═══════════════════════════════════════════════════════

/**
 * Create STEP entities for a CylindricalSurface.
 *
 * STEP structure:
 * - AXIS1_PLACEMENT (cylinder axis)
 * - CYLINDRICAL_SURFACE (axis + radius)
 */
export function cylindricalSurfaceToStep(
  surface: CylindricalSurface,
  builder: StepModelBuilder,
): StepEntity[] {
  const entities: StepEntity[] = [];

  // Create axis placement
  const axisEntities = axisToStep(surface.axis, builder);
  entities.push(...axisEntities);
  const ax1Id = axisEntities[axisEntities.length - 1].id;

  // Create CYLINDRICAL_SURFACE
  const surfaceId = builder.nextId();
  const surfaceEntity: StepEntity = {
    id: surfaceId,
    typeName: 'CYLINDRICAL_SURFACE',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: ax1Id },
      { type: 'real', value: surface.radius },
    ],
  };
  builder.addEntity(surfaceEntity);
  entities.push(surfaceEntity);

  return entities;
}

/**
 * Extract a CylindricalSurface from a STEP CYLINDRICAL_SURFACE entity.
 */
export function stepToCylindricalSurface(
  entity: StepEntity,
  model: StepModel,
): OperationResult<CylindricalSurface> {
  if (entity.typeName !== 'CYLINDRICAL_SURFACE') {
    return failure(`Expected CYLINDRICAL_SURFACE, got ${entity.typeName}`);
  }

  const ax1Entity = resolveRef(entity.attributes[1], model);
  if (!ax1Entity) return failure('CYLINDRICAL_SURFACE: cannot resolve axis reference');

  const axisResult = stepToAxis(ax1Entity, model);
  if (!axisResult.success) {
    return failure(`CYLINDRICAL_SURFACE axis: ${axisResult.error}`);
  }

  const radius = extractReal(entity.attributes[2]);
  if (radius === null) return failure('CYLINDRICAL_SURFACE: missing radius');

  // Create ref direction perpendicular to axis
  const dir = axisResult.result!.direction;
  let refDir = vec3d(1, 0, 0);
  if (Math.abs(dir.x) > 0.9) {
    refDir = vec3d(0, 1, 0);
  }
  // Cross product to get perpendicular
  const crossed = vec3d(
    dir.y * refDir.z - dir.z * refDir.y,
    dir.z * refDir.x - dir.x * refDir.z,
    dir.x * refDir.y - dir.y * refDir.x,
  );
  refDir = normalize(crossed);

  return success({
    type: 'cylinder',
    axis: axisResult.result!,
    radius,
    refDirection: refDir,
  });
}

// ═══════════════════════════════════════════════════════
// EXTRUSION SURFACE ←→ STEP SURFACE_OF_LINEAR_EXTRUSION
// ═══════════════════════════════════════════════════════

/**
 * Create STEP entities for an ExtrusionSurface.
 *
 * STEP structure:
 * - Basis curve (LINE, CIRCLE, etc.)
 * - DIRECTION (extrusion direction)
 * - SURFACE_OF_LINEAR_EXTRUSION (curve + direction)
 */
export function extrusionSurfaceToStep(
  surface: ExtrusionSurface,
  builder: StepModelBuilder,
): StepEntity[] {
  const entities: StepEntity[] = [];

  // Create basis curve
  let curveEntities: StepEntity[];
  switch (surface.basisCurve.type) {
    case 'line3d':
      curveEntities = line3DToStep(surface.basisCurve, builder);
      break;
    case 'circle3d':
      curveEntities = circle3DToStep(surface.basisCurve, builder);
      break;
    case 'arc3d':
      // Arc needs TRIMMED_CURVE handling
      return failure('Arc extrusion STEP export not yet implemented') as any;
    default:
      return failure(`Unsupported curve type for STEP export`) as any;
  }
  entities.push(...curveEntities);
  const curveId = curveEntities[curveEntities.length - 1].id;

  // Create extrusion direction
  const dirId = builder.nextId();
  const dirEntity = vector3DToStep(surface.direction, dirId);
  builder.addEntity(dirEntity);
  entities.push(dirEntity);

  // Create SURFACE_OF_LINEAR_EXTRUSION
  const surfaceId = builder.nextId();
  const surfaceEntity: StepEntity = {
    id: surfaceId,
    typeName: 'SURFACE_OF_LINEAR_EXTRUSION',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: curveId },
      { type: 'ref', id: dirId },
    ],
  };
  builder.addEntity(surfaceEntity);
  entities.push(surfaceEntity);

  return entities;
}

/**
 * Extract an ExtrusionSurface from a STEP SURFACE_OF_LINEAR_EXTRUSION entity.
 */
export function stepToExtrusionSurface(
  entity: StepEntity,
  model: StepModel,
): OperationResult<ExtrusionSurface> {
  if (entity.typeName !== 'SURFACE_OF_LINEAR_EXTRUSION') {
    return failure(`Expected SURFACE_OF_LINEAR_EXTRUSION, got ${entity.typeName}`);
  }

  // Get basis curve
  const curveEntity = resolveRef(entity.attributes[1], model);
  if (!curveEntity) {
    return failure('SURFACE_OF_LINEAR_EXTRUSION: cannot resolve curve reference');
  }

  let curveResult: OperationResult<any>;
  if (curveEntity.typeName === 'LINE') {
    curveResult = stepToLine3D(curveEntity, model);
  } else if (curveEntity.typeName === 'CIRCLE') {
    curveResult = stepToCircle3D(curveEntity, model);
  } else {
    return failure(
      `SURFACE_OF_LINEAR_EXTRUSION: unsupported curve type ${curveEntity.typeName}`,
    );
  }

  if (!curveResult.success) {
    return failure(`SURFACE_OF_LINEAR_EXTRUSION curve: ${curveResult.error}`);
  }

  // Get extrusion direction
  const dirEntity = resolveRef(entity.attributes[2], model);
  if (!dirEntity) {
    return failure('SURFACE_OF_LINEAR_EXTRUSION: cannot resolve direction reference');
  }

  const dirResult = stepToVector3D(dirEntity);
  if (!dirResult.success) {
    return failure(`SURFACE_OF_LINEAR_EXTRUSION direction: ${dirResult.error}`);
  }

  return success({
    type: 'extrusion',
    basisCurve: curveResult.result!,
    direction: dirResult.result!,
  });
}
