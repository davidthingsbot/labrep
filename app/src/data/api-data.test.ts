import { describe, it, expect } from 'vitest';
import { apiEntries, getEntriesByModule, API_MODULES } from './api-data';

describe('api-data', () => {
  it('has entries', () => {
    expect(apiEntries.length).toBeGreaterThan(0);
  });

  it('all entries have required fields', () => {
    for (const entry of apiEntries) {
      expect(entry.name).toBeDefined();
      expect(entry.name.length).toBeGreaterThan(0);
      expect(['function', 'interface', 'constant', 'type']).toContain(entry.kind);
      expect(API_MODULES).toContain(entry.module);
      expect(entry.description).toBeDefined();
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('entry names are unique', () => {
    const names = apiEntries.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every module has at least one entry', () => {
    for (const mod of API_MODULES) {
      const entries = getEntriesByModule(mod);
      expect(entries.length).toBeGreaterThan(0);
    }
  });

  it('functions have signatures', () => {
    const fns = apiEntries.filter((e) => e.kind === 'function');
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) {
      expect(fn.signature).toBeDefined();
      expect(fn.signature!.length).toBeGreaterThan(0);
    }
  });

  it('interfaces have properties', () => {
    const ifaces = apiEntries.filter((e) => e.kind === 'interface');
    expect(ifaces.length).toBeGreaterThan(0);
    for (const iface of ifaces) {
      expect(iface.properties).toBeDefined();
      expect(iface.properties!.length).toBeGreaterThan(0);
    }
  });

  it('contains key core exports', () => {
    const names = apiEntries.map((e) => e.name);
    const expected = [
      'Point3D', 'point3d', 'ORIGIN', 'distance',
      'Vector3D', 'vec3d', 'normalize', 'cross',
      'Transform3D', 'identity', 'translation',
      'Axis', 'Plane', 'BoundingBox3D',
      'Point2D', 'Vector2D', 'TOLERANCE',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('contains key geometry exports', () => {
    const names = apiEntries.map((e) => e.name);
    const expected = [
      'Line2D', 'makeLine2D', 'evaluateLine2D',
      'Circle2D', 'makeCircle2D',
      'Arc2D', 'makeArc2D',
      'Wire2D', 'makeWire2D',
      'Intersection2D', 'intersectLine2DLine2D',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('contains key mesh and primitives exports', () => {
    const names = apiEntries.map((e) => e.name);
    const expected = ['Mesh', 'OperationResult', 'makeBox', 'makeSphere', 'makeCylinder'];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('getEntriesByModule filters correctly', () => {
    const core = getEntriesByModule('core');
    expect(core.every((e) => e.module === 'core')).toBe(true);

    const geo = getEntriesByModule('geometry');
    expect(geo.every((e) => e.module === 'geometry')).toBe(true);
  });
});
