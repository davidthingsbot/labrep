import { point3d } from '../core';
import { Vertex, makeVertex } from '../topology/vertex';
import { Edge, makeEdge, makeEdgeFromCurve, Curve3D } from '../topology/edge';
import { Wire, OrientedEdge, orientEdge, makeWire } from '../topology/wire';
import { Face, Surface, makeFace } from '../topology/face';
import { Shell, makeShell, shellIsClosed } from '../topology/shell';
import { Solid, makeSolid } from '../topology/solid';
import { PlaneSurface, makePlaneSurface } from '../surfaces';
import { OperationResult, success, failure } from '../mesh/mesh';
import { type StepEntity, type StepModel } from './step-model';
import { type StepModelBuilder } from './step-model-builder';
import { point3DToStep, stepToPoint3D, planeToStep, stepToPlane } from './step-converters';
import { line3DToStep, stepToLine3D, circle3DToStep, arc3DToStep } from './step-converters-3d';
import {
  planeSurfaceToStep,
  cylindricalSurfaceToStep,
  extrusionSurfaceToStep,
} from './step-converters-surfaces';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function resolveRef(val: any, model: StepModel): StepEntity | null {
  if (val?.type !== 'ref') return null;
  return model.entities.get(val.id) ?? null;
}

// ═══════════════════════════════════════════════════════
// VERTEX ←→ VERTEX_POINT
// ═══════════════════════════════════════════════════════

export function vertexToStep(vertex: Vertex, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  // Point
  const ptId = builder.nextId();
  const ptEntity = point3DToStep(vertex.point, ptId);
  builder.addEntity(ptEntity);
  entities.push(ptEntity);

  // Vertex
  const vertexId = builder.nextId();
  const vertexEntity: StepEntity = {
    id: vertexId,
    typeName: 'VERTEX_POINT',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: ptId },
    ],
  };
  builder.addEntity(vertexEntity);
  entities.push(vertexEntity);

  return entities;
}

export function stepToVertex(entity: StepEntity, model: StepModel): OperationResult<Vertex> {
  if (entity.typeName !== 'VERTEX_POINT') {
    return failure(`Expected VERTEX_POINT, got ${entity.typeName}`);
  }

  const ptEntity = resolveRef(entity.attributes[1], model);
  if (!ptEntity) return failure('VERTEX_POINT: cannot resolve point reference');
  
  const ptResult = stepToPoint3D(ptEntity);
  if (!ptResult.success) return failure(`VERTEX_POINT: ${ptResult.error}`);

  return success(makeVertex(ptResult.result!));
}

// ═══════════════════════════════════════════════════════
// EDGE ←→ EDGE_CURVE
// ═══════════════════════════════════════════════════════

export function edgeToStep(edge: Edge, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  // Start vertex
  const startEntities = vertexToStep(edge.startVertex, builder);
  entities.push(...startEntities);
  const startVertexId = startEntities[startEntities.length - 1].id;

  // End vertex (might be same as start for closed curves)
  let endVertexId: number;
  if (edge.startVertex === edge.endVertex) {
    endVertexId = startVertexId;
  } else {
    const endEntities = vertexToStep(edge.endVertex, builder);
    entities.push(...endEntities);
    endVertexId = endEntities[endEntities.length - 1].id;
  }

  // Curve
  let curveEntities: StepEntity[];
  switch (edge.curve.type) {
    case 'line3d':
      curveEntities = line3DToStep(edge.curve, builder);
      break;
    case 'circle3d':
      curveEntities = circle3DToStep(edge.curve, builder);
      break;
    case 'arc3d':
      curveEntities = arc3DToStep(edge.curve, builder);
      break;
  }
  entities.push(...curveEntities);
  const curveId = curveEntities[curveEntities.length - 1].id;

  // Edge curve
  const edgeId = builder.nextId();
  const edgeEntity: StepEntity = {
    id: edgeId,
    typeName: 'EDGE_CURVE',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: startVertexId },
      { type: 'ref', id: endVertexId },
      { type: 'ref', id: curveId },
      { type: 'enum', value: 'T' }, // same_sense
    ],
  };
  builder.addEntity(edgeEntity);
  entities.push(edgeEntity);

  return entities;
}

export function stepToEdge(entity: StepEntity, model: StepModel): OperationResult<Edge> {
  if (entity.typeName !== 'EDGE_CURVE') {
    return failure(`Expected EDGE_CURVE, got ${entity.typeName}`);
  }

  // Get vertices
  const startEntity = resolveRef(entity.attributes[1], model);
  const endEntity = resolveRef(entity.attributes[2], model);
  if (!startEntity || !endEntity) {
    return failure('EDGE_CURVE: cannot resolve vertex references');
  }

  const startResult = stepToVertex(startEntity, model);
  const endResult = stepToVertex(endEntity, model);
  if (!startResult.success || !endResult.success) {
    return failure('EDGE_CURVE: invalid vertices');
  }

  // Get curve
  const curveEntity = resolveRef(entity.attributes[3], model);
  if (!curveEntity) return failure('EDGE_CURVE: cannot resolve curve reference');

  let curveResult: OperationResult<Curve3D>;
  if (curveEntity.typeName === 'LINE') {
    curveResult = stepToLine3D(curveEntity, model);
  } else {
    return failure(`EDGE_CURVE: unsupported curve type ${curveEntity.typeName}`);
  }

  if (!curveResult.success) return failure(`EDGE_CURVE curve: ${curveResult.error}`);

  return makeEdge(curveResult.result!, startResult.result!, endResult.result!);
}

// ═══════════════════════════════════════════════════════
// WIRE ←→ EDGE_LOOP
// ═══════════════════════════════════════════════════════

export function wireToStep(wire: Wire, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];
  const orientedEdgeIds: number[] = [];

  for (const oe of wire.edges) {
    // Create edge
    const edgeEntities = edgeToStep(oe.edge, builder);
    entities.push(...edgeEntities);
    const edgeCurveId = edgeEntities[edgeEntities.length - 1].id;

    // Create oriented edge
    const oeId = builder.nextId();
    const oeEntity: StepEntity = {
      id: oeId,
      typeName: 'ORIENTED_EDGE',
      attributes: [
        { type: 'string', value: '' },
        { type: 'derived' }, // edge_start
        { type: 'derived' }, // edge_end
        { type: 'ref', id: edgeCurveId },
        { type: 'enum', value: oe.forward ? 'T' : 'F' },
      ],
    };
    builder.addEntity(oeEntity);
    entities.push(oeEntity);
    orientedEdgeIds.push(oeId);
  }

  // Edge loop
  const loopId = builder.nextId();
  const loopEntity: StepEntity = {
    id: loopId,
    typeName: 'EDGE_LOOP',
    attributes: [
      { type: 'string', value: '' },
      { type: 'list', values: orientedEdgeIds.map(id => ({ type: 'ref', id })) },
    ],
  };
  builder.addEntity(loopEntity);
  entities.push(loopEntity);

  return entities;
}

// ═══════════════════════════════════════════════════════
// FACE ←→ ADVANCED_FACE
// ═══════════════════════════════════════════════════════

export function faceToStep(face: Face, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  // Surface
  let surfaceId: number;
  let surfaceEntities: StepEntity[];

  switch (face.surface.type) {
    case 'plane':
      surfaceEntities = planeSurfaceToStep(face.surface, builder);
      break;
    case 'cylinder':
      surfaceEntities = cylindricalSurfaceToStep(face.surface, builder);
      break;
    case 'extrusion':
      surfaceEntities = extrusionSurfaceToStep(face.surface, builder);
      break;
    default:
      return failure(`Unsupported surface type for STEP export`) as any;
  }

  entities.push(...surfaceEntities);
  surfaceId = surfaceEntities[surfaceEntities.length - 1].id;

  // Outer wire as face bound
  const outerWireEntities = wireToStep(face.outerWire, builder);
  entities.push(...outerWireEntities);
  const outerLoopId = outerWireEntities[outerWireEntities.length - 1].id;

  const outerBoundId = builder.nextId();
  const outerBoundEntity: StepEntity = {
    id: outerBoundId,
    typeName: 'FACE_OUTER_BOUND',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: outerLoopId },
      { type: 'enum', value: 'T' },
    ],
  };
  builder.addEntity(outerBoundEntity);
  entities.push(outerBoundEntity);

  const boundIds = [outerBoundId];

  // Inner wires as face bounds
  for (const innerWire of face.innerWires) {
    const innerWireEntities = wireToStep(innerWire, builder);
    entities.push(...innerWireEntities);
    const innerLoopId = innerWireEntities[innerWireEntities.length - 1].id;

    const innerBoundId = builder.nextId();
    const innerBoundEntity: StepEntity = {
      id: innerBoundId,
      typeName: 'FACE_BOUND',
      attributes: [
        { type: 'string', value: '' },
        { type: 'ref', id: innerLoopId },
        { type: 'enum', value: 'F' }, // holes have opposite orientation
      ],
    };
    builder.addEntity(innerBoundEntity);
    entities.push(innerBoundEntity);
    boundIds.push(innerBoundId);
  }

  // Advanced face
  const faceId = builder.nextId();
  const faceEntity: StepEntity = {
    id: faceId,
    typeName: 'ADVANCED_FACE',
    attributes: [
      { type: 'string', value: '' },
      { type: 'list', values: boundIds.map(id => ({ type: 'ref', id })) },
      { type: 'ref', id: surfaceId },
      { type: 'enum', value: 'T' },
    ],
  };
  builder.addEntity(faceEntity);
  entities.push(faceEntity);

  return entities;
}

// ═══════════════════════════════════════════════════════
// SHELL ←→ CLOSED_SHELL / OPEN_SHELL
// ═══════════════════════════════════════════════════════

export function shellToStep(shell: Shell, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];
  const faceIds: number[] = [];

  for (const face of shell.faces) {
    const faceEntities = faceToStep(face, builder);
    entities.push(...faceEntities);
    faceIds.push(faceEntities[faceEntities.length - 1].id);
  }

  const shellId = builder.nextId();
  const shellEntity: StepEntity = {
    id: shellId,
    typeName: shellIsClosed(shell) ? 'CLOSED_SHELL' : 'OPEN_SHELL',
    attributes: [
      { type: 'string', value: '' },
      { type: 'list', values: faceIds.map(id => ({ type: 'ref', id })) },
    ],
  };
  builder.addEntity(shellEntity);
  entities.push(shellEntity);

  return entities;
}

// ═══════════════════════════════════════════════════════
// SOLID ←→ MANIFOLD_SOLID_BREP
// ═══════════════════════════════════════════════════════

export function solidToStep(solid: Solid, builder: StepModelBuilder): StepEntity[] {
  const entities: StepEntity[] = [];

  // Outer shell
  const outerShellEntities = shellToStep(solid.outerShell, builder);
  entities.push(...outerShellEntities);
  const outerShellId = outerShellEntities[outerShellEntities.length - 1].id;

  // Solid
  const solidId = builder.nextId();
  const solidEntity: StepEntity = {
    id: solidId,
    typeName: 'MANIFOLD_SOLID_BREP',
    attributes: [
      { type: 'string', value: '' },
      { type: 'ref', id: outerShellId },
    ],
  };
  builder.addEntity(solidEntity);
  entities.push(solidEntity);

  // Note: Inner shells (voids) would need BREP_WITH_VOIDS, not implemented yet

  return entities;
}
