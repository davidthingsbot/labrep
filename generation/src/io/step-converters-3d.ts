import { point3d, vec3d, normalize, Plane, plane } from '../core';
import { Line3D, makeLine3D, Circle3D, makeCircle3D, Arc3D, makeArc3D } from '../geometry';
import { OperationResult, success, failure } from '../mesh/mesh';
import { type StepEntity, type StepModel } from './step-model';
import { type StepModelBuilder } from './step-model-builder';
import { point3DToStep, vector3DToStep, planeToStep, stepToPoint3D, stepToVector3D, stepToPlane } from './step-converters';

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
// LINE3D ←→ LINE
// ═══════════════════════════════════════════════════════

/**
 * Create STEP entities for a Line3D.
 * 
 * STEP structure:
 * - CARTESIAN_POINT (origin)
 * - DIRECTION (direction)
 * - VECTOR (direction + magnitude)
 * - LINE (point + vector)
 */
export function line3DToStep(line: Line3D, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  // Origin point
  const ptId = builder.nextId();
  const ptEntity = point3DToStep(line.origin, ptId);
  builder.addEntity(ptEntity);
  entities.push(ptEntity);

  // Direction
  const dirId = builder.nextId();
  const dirEntity = vector3DToStep(line.direction, dirId);
  builder.addEntity(dirEntity);
  entities.push(dirEntity);

  // Vector (direction + magnitude)
  const vecId = builder.nextId();
  const vecEntity: StepEntity = {
    id: vecId,
    typeName: 'VECTOR',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: dirId },
      { type: 'real', value: line.segmentLength },
    ],
  };
  builder.addEntity(vecEntity);
  entities.push(vecEntity);

  // Line
  const lineId = builder.nextId();
  const lineEntity: StepEntity = {
    id: lineId,
    typeName: 'LINE',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: ptId },
      { type: 'ref', id: vecId },
    ],
  };
  builder.addEntity(lineEntity);
  entities.push(lineEntity);

  return entities;
}

/**
 * Extract a Line3D from a LINE entity.
 */
export function stepToLine3D(entity: StepEntity, model: StepModel): OperationResult<Line3D> {
  if (entity.typeName !== 'LINE') {
    return failure(`Expected LINE, got ${entity.typeName}`);
  }

  // Get origin point
  const pointEntity = resolveRef(entity.attributes[1], model);
  if (!pointEntity) return failure('LINE: cannot resolve point reference');
  const pointResult = stepToPoint3D(pointEntity);
  if (!pointResult.success) return failure(`LINE point: ${pointResult.error}`);

  // Get vector
  const vectorEntity = resolveRef(entity.attributes[2], model);
  if (!vectorEntity || vectorEntity.typeName !== 'VECTOR') {
    return failure('LINE: cannot resolve vector reference');
  }

  // Get direction from vector
  const dirEntity = resolveRef(vectorEntity.attributes[1], model);
  if (!dirEntity) return failure('VECTOR: cannot resolve direction reference');
  const dirResult = stepToVector3D(dirEntity);
  if (!dirResult.success) return failure(`VECTOR direction: ${dirResult.error}`);

  // Get magnitude from vector
  const magnitude = extractReal(vectorEntity.attributes[2]);
  if (magnitude === null) return failure('VECTOR: missing magnitude');

  // Construct end point
  const origin = pointResult.result!;
  const dir = dirResult.result!;
  const endPoint = point3d(
    origin.x + dir.x * magnitude,
    origin.y + dir.y * magnitude,
    origin.z + dir.z * magnitude,
  );

  return makeLine3D(origin, endPoint);
}

// ═══════════════════════════════════════════════════════
// CIRCLE3D ←→ CIRCLE
// ═══════════════════════════════════════════════════════

/**
 * Create STEP entities for a Circle3D.
 * 
 * STEP structure:
 * - AXIS2_PLACEMENT_3D (plane)
 * - CIRCLE (placement + radius)
 */
export function circle3DToStep(circle: Circle3D, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  // Plane as AXIS2_PLACEMENT_3D
  const planeEntities = planeToStep(circle.plane, builder);
  entities.push(...planeEntities);
  const ax2Id = planeEntities[planeEntities.length - 1].id;

  // Circle
  const circleId = builder.nextId();
  const circleEntity: StepEntity = {
    id: circleId,
    typeName: 'CIRCLE',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: ax2Id },
      { type: 'real', value: circle.radius },
    ],
  };
  builder.addEntity(circleEntity);
  entities.push(circleEntity);

  return entities;
}

/**
 * Extract a Circle3D from a CIRCLE entity.
 */
export function stepToCircle3D(entity: StepEntity, model: StepModel): OperationResult<Circle3D> {
  if (entity.typeName !== 'CIRCLE') {
    return failure(`Expected CIRCLE, got ${entity.typeName}`);
  }

  // Get placement
  const ax2Entity = resolveRef(entity.attributes[1], model);
  if (!ax2Entity) return failure('CIRCLE: cannot resolve placement reference');
  const planeResult = stepToPlane(ax2Entity, model);
  if (!planeResult.success) return failure(`CIRCLE placement: ${planeResult.error}`);

  // Get radius
  const radius = extractReal(entity.attributes[2]);
  if (radius === null) return failure('CIRCLE: missing radius');

  return makeCircle3D(planeResult.result!, radius);
}

// ═══════════════════════════════════════════════════════
// ARC3D ←→ TRIMMED_CURVE
// ═══════════════════════════════════════════════════════

/**
 * Create STEP entities for an Arc3D.
 * 
 * STEP structure:
 * - CIRCLE (base curve)
 * - TRIMMED_CURVE (circle + parameter bounds)
 */
export function arc3DToStep(arc: Arc3D, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  // Create the underlying circle
  const circleForArc: Circle3D = {
    type: 'circle3d',
    plane: arc.plane,
    radius: arc.radius,
    startParam: 0,
    endParam: 2 * Math.PI,
    isClosed: true,
    startPoint: arc.startPoint, // Not quite right but doesn't matter for STEP
    endPoint: arc.startPoint,
  };

  const circleEntities = circle3DToStep(circleForArc, builder);
  entities.push(...circleEntities);
  const circleId = circleEntities[circleEntities.length - 1].id;

  // Start and end points for trim
  const startPtId = builder.nextId();
  const startPtEntity = point3DToStep(arc.startPoint, startPtId);
  builder.addEntity(startPtEntity);
  entities.push(startPtEntity);

  const endPtId = builder.nextId();
  const endPtEntity = point3DToStep(arc.endPoint, endPtId);
  builder.addEntity(endPtEntity);
  entities.push(endPtEntity);

  // Trimmed curve
  const trimmedId = builder.nextId();
  const trimmedEntity: StepEntity = {
    id: trimmedId,
    typeName: 'TRIMMED_CURVE',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: circleId },
      { type: 'list', values: [{ type: 'ref', id: startPtId }] }, // trim 1
      { type: 'list', values: [{ type: 'ref', id: endPtId }] },   // trim 2
      { type: 'enum', value: 'T' }, // sense agreement
      { type: 'enum', value: 'CARTESIAN' }, // master representation
    ],
  };
  builder.addEntity(trimmedEntity);
  entities.push(trimmedEntity);

  return entities;
}

/**
 * Extract an Arc3D from a TRIMMED_CURVE entity.
 */
export function stepToArc3D(entity: StepEntity, model: StepModel): OperationResult<Arc3D> {
  if (entity.typeName !== 'TRIMMED_CURVE') {
    return failure(`Expected TRIMMED_CURVE, got ${entity.typeName}`);
  }

  // Get base curve (should be CIRCLE)
  const baseEntity = resolveRef(entity.attributes[1], model);
  if (!baseEntity || baseEntity.typeName !== 'CIRCLE') {
    return failure('TRIMMED_CURVE: base curve must be CIRCLE for Arc3D');
  }

  const circleResult = stepToCircle3D(baseEntity, model);
  if (!circleResult.success) return failure(`TRIMMED_CURVE base: ${circleResult.error}`);
  const circle = circleResult.result!;

  // Get trim points
  const trim1List = entity.attributes[2];
  const trim2List = entity.attributes[3];

  if (trim1List?.type !== 'list' || trim1List.values.length === 0) {
    return failure('TRIMMED_CURVE: missing trim1');
  }
  if (trim2List?.type !== 'list' || trim2List.values.length === 0) {
    return failure('TRIMMED_CURVE: missing trim2');
  }

  const startPtEntity = resolveRef(trim1List.values[0], model);
  const endPtEntity = resolveRef(trim2List.values[0], model);

  if (!startPtEntity || !endPtEntity) {
    return failure('TRIMMED_CURVE: cannot resolve trim point references');
  }

  const startPtResult = stepToPoint3D(startPtEntity);
  const endPtResult = stepToPoint3D(endPtEntity);

  if (!startPtResult.success || !endPtResult.success) {
    return failure('TRIMMED_CURVE: invalid trim points');
  }

  // Compute angles from points
  const p = circle.plane;
  const startPt = startPtResult.result!;
  const endPt = endPtResult.result!;

  // Project points onto plane coordinate system to get angles
  const yAxis = normalize({
    x: p.normal.y * p.xAxis.z - p.normal.z * p.xAxis.y,
    y: p.normal.z * p.xAxis.x - p.normal.x * p.xAxis.z,
    z: p.normal.x * p.xAxis.y - p.normal.y * p.xAxis.x,
  });

  function angleOf(pt: { x: number; y: number; z: number }): number {
    const dx = pt.x - p.origin.x;
    const dy = pt.y - p.origin.y;
    const dz = pt.z - p.origin.z;
    const u = dx * p.xAxis.x + dy * p.xAxis.y + dz * p.xAxis.z;
    const v = dx * yAxis.x + dy * yAxis.y + dz * yAxis.z;
    return Math.atan2(v, u);
  }

  const startAngle = angleOf(startPt);
  const endAngle = angleOf(endPt);

  return makeArc3D(circle.plane, circle.radius, startAngle, endAngle);
}
