import { Point3D, point3d } from '../core/point3d';
import { Vector3D, vec3d, normalize } from '../core/vector3d';
import { Axis, axis } from '../core/axis';
import { Plane, plane } from '../core/plane';
import { OperationResult, success, failure } from '../mesh/mesh';
import { type StepEntity, type StepValue, type StepModel } from './step-model';
import { type StepModelBuilder } from './step-model-builder';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Extract a list of numbers from a StepValue list attribute. */
function extractNumberList(val: StepValue): number[] | null {
  if (val.type !== 'list') return null;
  const nums: number[] = [];
  for (const v of val.values) {
    if (v.type === 'real') nums.push(v.value);
    else if (v.type === 'integer') nums.push(v.value);
    else return null;
  }
  return nums;
}

/** Resolve an entity reference in a StepModel. */
function resolveRef(val: StepValue, model: StepModel): StepEntity | null {
  if (val.type !== 'ref') return null;
  return model.entities.get(val.id) ?? null;
}

// ═══════════════════════════════════════════════════════
// POINT3D ←→ CARTESIAN_POINT
// ═══════════════════════════════════════════════════════

/**
 * Extract a Point3D from a CARTESIAN_POINT entity.
 *
 * @param entity - A STEP entity with typeName 'CARTESIAN_POINT'
 * @returns Point3D or failure
 */
export function stepToPoint3D(entity: StepEntity): OperationResult<Point3D> {
  if (entity.typeName !== 'CARTESIAN_POINT') {
    return failure(`Expected CARTESIAN_POINT, got ${entity.typeName}`);
  }
  const coords = extractNumberList(entity.attributes[1]);
  if (!coords || coords.length < 3) {
    return failure('CARTESIAN_POINT missing coordinate list');
  }
  return success(point3d(coords[0], coords[1], coords[2]));
}

/**
 * Create a CARTESIAN_POINT entity from a Point3D.
 *
 * @param p - The point
 * @param id - Entity ID to assign
 * @returns A StepEntity
 */
export function point3DToStep(p: Point3D, id: number): StepEntity {
  return {
    id,
    typeName: 'CARTESIAN_POINT',
    attributes: [
      { type: 'string', value: '' },
      { type: 'list', values: [
        { type: 'real', value: p.x },
        { type: 'real', value: p.y },
        { type: 'real', value: p.z },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════
// VECTOR3D ←→ DIRECTION
// ═══════════════════════════════════════════════════════

/**
 * Extract a Vector3D from a DIRECTION entity.
 * The result is normalized (STEP directions are unit vectors).
 *
 * @param entity - A STEP entity with typeName 'DIRECTION'
 * @returns Vector3D or failure
 */
export function stepToVector3D(entity: StepEntity): OperationResult<Vector3D> {
  if (entity.typeName !== 'DIRECTION') {
    return failure(`Expected DIRECTION, got ${entity.typeName}`);
  }
  const coords = extractNumberList(entity.attributes[1]);
  if (!coords || coords.length < 3) {
    return failure('DIRECTION missing component list');
  }
  return success(normalize(vec3d(coords[0], coords[1], coords[2])));
}

/**
 * Create a DIRECTION entity from a Vector3D.
 * The vector is normalized before writing.
 *
 * @param v - The vector (will be normalized)
 * @param id - Entity ID to assign
 * @returns A StepEntity
 */
export function vector3DToStep(v: Vector3D, id: number): StepEntity {
  const n = normalize(v);
  return {
    id,
    typeName: 'DIRECTION',
    attributes: [
      { type: 'string', value: '' },
      { type: 'list', values: [
        { type: 'real', value: n.x },
        { type: 'real', value: n.y },
        { type: 'real', value: n.z },
      ]},
    ],
  };
}

// ═══════════════════════════════════════════════════════
// AXIS ←→ AXIS1_PLACEMENT
// ═══════════════════════════════════════════════════════

/**
 * Extract an Axis from an AXIS1_PLACEMENT entity.
 *
 * @param entity - A STEP entity with typeName 'AXIS1_PLACEMENT'
 * @param model - The full model (to resolve references)
 * @returns Axis or failure
 */
export function stepToAxis(entity: StepEntity, model: StepModel): OperationResult<Axis> {
  if (entity.typeName !== 'AXIS1_PLACEMENT') {
    return failure(`Expected AXIS1_PLACEMENT, got ${entity.typeName}`);
  }

  const pointEntity = resolveRef(entity.attributes[1], model);
  if (!pointEntity) return failure('AXIS1_PLACEMENT: cannot resolve origin reference');
  const originResult = stepToPoint3D(pointEntity);
  if (!originResult.success) return failure(`AXIS1_PLACEMENT origin: ${originResult.error}`);

  const dirEntity = resolveRef(entity.attributes[2], model);
  if (!dirEntity) return failure('AXIS1_PLACEMENT: cannot resolve direction reference');
  const dirResult = stepToVector3D(dirEntity);
  if (!dirResult.success) return failure(`AXIS1_PLACEMENT direction: ${dirResult.error}`);

  return success(axis(originResult.result!, dirResult.result!));
}

/**
 * Create STEP entities for an Axis (AXIS1_PLACEMENT + CARTESIAN_POINT + DIRECTION).
 *
 * @param ax - The axis
 * @param builder - Model builder for ID allocation
 * @returns Array of created entities
 */
export function axisToStep(ax: Axis, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  const ptId = builder.nextId();
  const ptEntity = point3DToStep(ax.origin, ptId);
  builder.addEntity(ptEntity);
  entities.push(ptEntity);

  const dirId = builder.nextId();
  const dirEntity = vector3DToStep(ax.direction, dirId);
  builder.addEntity(dirEntity);
  entities.push(dirEntity);

  const axId = builder.nextId();
  const axEntity: StepEntity = {
    id: axId,
    typeName: 'AXIS1_PLACEMENT',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: ptId },
      { type: 'ref', id: dirId },
    ],
  };
  builder.addEntity(axEntity);
  entities.push(axEntity);

  return entities;
}

// ═══════════════════════════════════════════════════════
// PLANE ←→ AXIS2_PLACEMENT_3D
// ═══════════════════════════════════════════════════════

/**
 * Extract a Plane from an AXIS2_PLACEMENT_3D entity.
 *
 * @param entity - A STEP entity with typeName 'AXIS2_PLACEMENT_3D'
 * @param model - The full model (to resolve references)
 * @returns Plane or failure
 */
export function stepToPlane(entity: StepEntity, model: StepModel): OperationResult<Plane> {
  if (entity.typeName !== 'AXIS2_PLACEMENT_3D') {
    return failure(`Expected AXIS2_PLACEMENT_3D, got ${entity.typeName}`);
  }

  const pointEntity = resolveRef(entity.attributes[1], model);
  if (!pointEntity) return failure('AXIS2_PLACEMENT_3D: cannot resolve origin reference');
  const originResult = stepToPoint3D(pointEntity);
  if (!originResult.success) return failure(`AXIS2_PLACEMENT_3D origin: ${originResult.error}`);

  const normalEntity = resolveRef(entity.attributes[2], model);
  if (!normalEntity) return failure('AXIS2_PLACEMENT_3D: cannot resolve normal reference');
  const normalResult = stepToVector3D(normalEntity);
  if (!normalResult.success) return failure(`AXIS2_PLACEMENT_3D normal: ${normalResult.error}`);

  const xAxisEntity = resolveRef(entity.attributes[3], model);
  if (!xAxisEntity) return failure('AXIS2_PLACEMENT_3D: cannot resolve xAxis reference');
  const xAxisResult = stepToVector3D(xAxisEntity);
  if (!xAxisResult.success) return failure(`AXIS2_PLACEMENT_3D xAxis: ${xAxisResult.error}`);

  return success(plane(originResult.result!, normalResult.result!, xAxisResult.result!));
}

/**
 * Create STEP entities for a Plane (AXIS2_PLACEMENT_3D + CARTESIAN_POINT + 2 DIRECTIONs).
 *
 * @param pl - The plane
 * @param builder - Model builder for ID allocation
 * @returns Array of created entities
 */
export function planeToStep(pl: Plane, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  const ptId = builder.nextId();
  const ptEntity = point3DToStep(pl.origin, ptId);
  builder.addEntity(ptEntity);
  entities.push(ptEntity);

  const normalId = builder.nextId();
  const normalEntity = vector3DToStep(pl.normal, normalId);
  builder.addEntity(normalEntity);
  entities.push(normalEntity);

  const xAxisId = builder.nextId();
  const xAxisEntity = vector3DToStep(pl.xAxis, xAxisId);
  builder.addEntity(xAxisEntity);
  entities.push(xAxisEntity);

  const ax2Id = builder.nextId();
  const ax2Entity: StepEntity = {
    id: ax2Id,
    typeName: 'AXIS2_PLACEMENT_3D',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: ptId },
      { type: 'ref', id: normalId },
      { type: 'ref', id: xAxisId },
    ],
  };
  builder.addEntity(ax2Entity);
  entities.push(ax2Entity);

  return entities;
}

// ═══════════════════════════════════════════════════════
// EXTRACTION
// ═══════════════════════════════════════════════════════

/**
 * Extract all foundation-type objects from a parsed STEP model.
 *
 * @param model - A parsed StepModel
 * @returns Maps of extracted Point3D, Vector3D, Axis, and Plane objects keyed by entity ID
 */
export function extractFoundationTypes(model: StepModel): {
  points: Map<number, Point3D>;
  directions: Map<number, Vector3D>;
  axes: Map<number, Axis>;
  planes: Map<number, Plane>;
} {
  const points = new Map<number, Point3D>();
  const directions = new Map<number, Vector3D>();
  const axes = new Map<number, Axis>();
  const planes = new Map<number, Plane>();

  for (const [id, entity] of Array.from(model.entities)) {
    switch (entity.typeName) {
      case 'CARTESIAN_POINT': {
        const r = stepToPoint3D(entity);
        if (r.success) points.set(id, r.result!);
        break;
      }
      case 'DIRECTION': {
        const r = stepToVector3D(entity);
        if (r.success) directions.set(id, r.result!);
        break;
      }
      case 'AXIS1_PLACEMENT': {
        const r = stepToAxis(entity, model);
        if (r.success) axes.set(id, r.result!);
        break;
      }
      case 'AXIS2_PLACEMENT_3D': {
        const r = stepToPlane(entity, model);
        if (r.success) planes.set(id, r.result!);
        break;
      }
    }
  }

  return { points, directions, axes, planes };
}
