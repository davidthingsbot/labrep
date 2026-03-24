import { describe, it, expect } from 'vitest';
import { point3d, vec3d, plane, axis, Z_AXIS_3D } from '../../src/core';
import {
  makeSphericalSurface,
  makeConicalSurface,
  makeToroidalSurface,
  makeRevolutionSurface,
} from '../../src/surfaces';
import { makeLine3D } from '../../src/geometry/line3d';
import { makeCircle3D } from '../../src/geometry/circle3d';
import { makeEdgeFromCurve } from '../../src/topology/edge';
import { makeWireFromEdges, makeWire, orientEdge } from '../../src/topology/wire';
import { revolve, revolvePartial } from '../../src/operations/revolve';
import { solidToStep } from '../../src/io/step-converters-topology';
import { createStepModelBuilder, type StepModelBuilder } from '../../src/io/step-model-builder';
import { writeStep } from '../../src/io/step-writer';
import { parseStep } from '../../src/io/step-parser';
import {
  sphericalSurfaceToStep,
  stepToSphericalSurface,
  conicalSurfaceToStep,
  stepToConicalSurface,
  toroidalSurfaceToStep,
  stepToToroidalSurface,
  revolutionSurfaceToStep,
  stepToRevolutionSurface,
} from '../../src/io/step-converters-surfaces';

function buildModel(builder: StepModelBuilder) {
  return builder.build();
}

describe('STEP Revolve Surface Converters', () => {
  describe('SphericalSurface round-trip', () => {
    it('writes and reads a sphere', () => {
      const sphere = makeSphericalSurface(point3d(1, 2, 3), 5).result!;
      const builder = createStepModelBuilder();
      const entities = sphericalSurfaceToStep(sphere, builder);
      expect(entities.length).toBeGreaterThan(0);

      const model = buildModel(builder);
      const lastEntity = entities[entities.length - 1];
      expect(lastEntity.typeName).toBe('SPHERICAL_SURFACE');

      const result = stepToSphericalSurface(lastEntity, model);
      expect(result.success).toBe(true);
      expect(result.result!.type).toBe('sphere');
      expect(result.result!.radius).toBeCloseTo(5, 10);
    });
  });

  describe('ConicalSurface round-trip', () => {
    it('writes and reads a cone', () => {
      const cone = makeConicalSurface(Z_AXIS_3D, 2, Math.PI / 6).result!;
      const builder = createStepModelBuilder();
      const entities = conicalSurfaceToStep(cone, builder);
      expect(entities.length).toBeGreaterThan(0);

      const model = buildModel(builder);
      const lastEntity = entities[entities.length - 1];
      expect(lastEntity.typeName).toBe('CONICAL_SURFACE');

      const result = stepToConicalSurface(lastEntity, model);
      expect(result.success).toBe(true);
      expect(result.result!.type).toBe('cone');
      expect(result.result!.radius).toBeCloseTo(2, 10);
      expect(result.result!.semiAngle).toBeCloseTo(Math.PI / 6, 10);
    });
  });

  describe('ToroidalSurface round-trip', () => {
    it('writes and reads a torus', () => {
      const torus = makeToroidalSurface(Z_AXIS_3D, 5, 1).result!;
      const builder = createStepModelBuilder();
      const entities = toroidalSurfaceToStep(torus, builder);
      expect(entities.length).toBeGreaterThan(0);

      const model = buildModel(builder);
      const lastEntity = entities[entities.length - 1];
      expect(lastEntity.typeName).toBe('TOROIDAL_SURFACE');

      const result = stepToToroidalSurface(lastEntity, model);
      expect(result.success).toBe(true);
      expect(result.result!.type).toBe('torus');
      expect(result.result!.majorRadius).toBeCloseTo(5, 10);
      expect(result.result!.minorRadius).toBeCloseTo(1, 10);
    });
  });

  describe('RevolutionSurface round-trip', () => {
    it('writes and reads a revolution surface from a line', () => {
      const line = makeLine3D(point3d(3, 0, 0), point3d(3, 0, 5)).result!;
      const revSurf = makeRevolutionSurface(line, Z_AXIS_3D).result!;
      const builder = createStepModelBuilder();
      const entities = revolutionSurfaceToStep(revSurf, builder);
      expect(entities.length).toBeGreaterThan(0);

      const model = buildModel(builder);
      const lastEntity = entities[entities.length - 1];
      expect(lastEntity.typeName).toBe('SURFACE_OF_REVOLUTION');

      const result = stepToRevolutionSurface(lastEntity, model);
      expect(result.success).toBe(true);
      expect(result.result!.type).toBe('revolution');
    });
  });

  // ═══════════════════════════════════════════════════════
  // FULL SOLID ROUND-TRIP TESTS
  // ═══════════════════════════════════════════════════════

  describe('Revolved solid STEP round-trip', () => {
    it('writes and parses a revolved cylinder solid', () => {
      // Create a cylinder by revolving a rectangle
      const r = 3, h = 5;
      const p1 = point3d(0, 0, 0), p2 = point3d(r, 0, 0);
      const p3 = point3d(r, 0, h), p4 = point3d(0, 0, h);
      const edges = [
        makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
        makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
        makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
        makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
      ];
      const wire = makeWireFromEdges(edges).result!;
      const revolveResult = revolve(wire, Z_AXIS_3D, 2 * Math.PI);
      expect(revolveResult.success).toBe(true);

      // Write to STEP
      const builder = createStepModelBuilder();
      const stepEntities = solidToStep(revolveResult.result!.solid, builder);
      expect(stepEntities.length).toBeGreaterThan(0);

      const model = buildModel(builder);
      const stepText = writeStep(model);

      // Verify STEP text is non-empty and contains expected entity types
      expect(stepText.length).toBeGreaterThan(100);
      expect(stepText).toContain('MANIFOLD_SOLID_BREP');
      expect(stepText).toContain('CLOSED_SHELL');
      expect(stepText).toContain('ADVANCED_FACE');

      // Parse back
      const parseResult = parseStep(stepText);
      expect(parseResult.success).toBe(true);

      // Verify the parsed model has the right entities
      const parsedModel = parseResult.result!;
      let hasSolid = false;
      for (const [, entity] of parsedModel.entities) {
        if (entity.typeName === 'MANIFOLD_SOLID_BREP') hasSolid = true;
      }
      expect(hasSolid).toBe(true);
    });

    it('writes and parses a revolved ring solid (offset rectangle)', () => {
      // Ring: revolve an offset rectangle (produces torus-like shape with planar/cylindrical faces)
      const x0 = 3, w = 2, h = 1;
      const q1 = point3d(x0, 0, 0), q2 = point3d(x0 + w, 0, 0);
      const q3 = point3d(x0 + w, 0, h), q4 = point3d(x0, 0, h);
      const ringEdges = [
        makeEdgeFromCurve(makeLine3D(q1, q2).result!).result!,
        makeEdgeFromCurve(makeLine3D(q2, q3).result!).result!,
        makeEdgeFromCurve(makeLine3D(q3, q4).result!).result!,
        makeEdgeFromCurve(makeLine3D(q4, q1).result!).result!,
      ];
      const ringWire = makeWireFromEdges(ringEdges).result!;
      const revolveResult = revolve(ringWire, Z_AXIS_3D, 2 * Math.PI);
      expect(revolveResult.success).toBe(true);

      const builder = createStepModelBuilder();
      const stepEntities = solidToStep(revolveResult.result!.solid, builder);
      const model = buildModel(builder);
      const stepText = writeStep(model);

      expect(stepText).toContain('MANIFOLD_SOLID_BREP');
      expect(stepText).toContain('CYLINDRICAL_SURFACE');

      const parseResult = parseStep(stepText);
      expect(parseResult.success).toBe(true);
    });

    it('writes and parses a partial revolve solid', () => {
      const r = 3, h = 5;
      const p1 = point3d(0, 0, 0), p2 = point3d(r, 0, 0);
      const p3 = point3d(r, 0, h), p4 = point3d(0, 0, h);
      const edges = [
        makeEdgeFromCurve(makeLine3D(p1, p2).result!).result!,
        makeEdgeFromCurve(makeLine3D(p2, p3).result!).result!,
        makeEdgeFromCurve(makeLine3D(p3, p4).result!).result!,
        makeEdgeFromCurve(makeLine3D(p4, p1).result!).result!,
      ];
      const wire = makeWireFromEdges(edges).result!;
      const revolveResult = revolvePartial(wire, Z_AXIS_3D, 0, Math.PI / 2);
      expect(revolveResult.success).toBe(true);

      const builder = createStepModelBuilder();
      const stepEntities = solidToStep(revolveResult.result!.solid, builder);
      const model = buildModel(builder);
      const stepText = writeStep(model);

      expect(stepText).toContain('MANIFOLD_SOLID_BREP');
      expect(stepText).toContain('CYLINDRICAL_SURFACE');

      const parseResult = parseStep(stepText);
      expect(parseResult.success).toBe(true);
    });
  });
});
