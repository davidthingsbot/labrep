# AGENTS.md — generation/

Instructions for AI agents writing the labrep library.

---

## The Prime Directive

**TEST FIRST. ALWAYS.**

```
1. Write failing test
2. Run test (confirm failure)
3. Write minimal code to pass
4. Refactor
5. Repeat
```

No exceptions. No "I'll add tests later." The test comes first.

## No Deferred Work. No Ignored Failures.

**NEVER leave broken things for later.** These patterns are strictly forbidden:

- "Implement later" / "TODO: fix this" / "Decided to defer"
- Skipping or `.skip()`-ing a failing test instead of fixing the code
- Loose test tolerances that paper over wrong answers (e.g., ±13% "close enough")
- Silently swallowing errors (e.g., producing an invalid result instead of failing)
- Comments like "approximate — may have ~30% error"

If a test fails, **fix the code until it passes**. If code produces wrong results, **fix the algorithm**. If you can't fix it right now, **say so and stop** — do not hide the problem behind a loose assertion or a TODO comment. Every workaround becomes permanent. Every ignored failure trains the next agent to accept broken output.

## Research Before Implementing

**Do not "first principles" everything.** Before writing complex geometric algorithms:

1. **Read the OCCT source** in `library/opencascade/`. It solves these problems to a very high level. Understand the approach before writing your own version.
2. **Search the web** for blog posts, papers, and open-source implementations. Surface-surface intersection, boolean operations, and tessellation are well-studied — leverage existing knowledge.
3. **Read `background/`** for curated notes on algorithms, formats, and architecture.

You are not inventing computational geometry from scratch. You are implementing known algorithms in TypeScript, guided by production-quality reference implementations.

## Test Quality: No False Positives

Tests must be **aggressive**, not ceremonial:

- **Test edge cases and known trouble spots**, not just the happy path. For geometry: tangent configurations, degenerate inputs, near-tolerance values, axis-aligned and non-axis-aligned cases.
- **Use tight tolerances.** If the expected answer is 92, assert `toBeCloseTo(92, 1)` — not `toBeGreaterThan(75)`.
- **Test topology, not just volume.** Check shell closure, face counts, normal consistency — not just that a number looks roughly right.
- **Vary inputs.** If all tests use the same two axis-aligned boxes, they prove nothing about the general case. Test different offsets, orientations, containment, touching, and non-overlapping configurations.
- **Test the invariants.** For booleans: V(A) + V(B) = V(union) + V(intersect). For tessellation: triangle area sums to face area. These catch bugs that individual tests miss.

A test suite that passes on broken code is worse than no tests — it gives false confidence.

## Code Standards

### TypeScript

- Strict mode enabled
- No `any` types (except when truly unavoidable, with comment explaining why)
- Meaningful variable names

### JSDoc — Mandatory

**Every exported function, interface, type, and constant MUST have a JSDoc comment.**
No exceptions. This is how we generate API documentation and provide IDE tooltips.

```typescript
/**
 * Compute the Euclidean distance between two points.
 *
 * @param a - First point
 * @param b - Second point
 * @returns The distance between a and b, always >= 0
 */
export function distance(a: Point3D, b: Point3D): number {

/**
 * A point in 3D Euclidean space.
 *
 * Immutable — all operations return new points.
 */
export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Default tolerance for floating-point comparisons. */
export const TOLERANCE = 1e-7;
```

Rules:
- First line: brief description of what it does (not how)
- `@param` for every parameter
- `@returns` describing the return value
- Note edge cases, tolerances, or coordinate conventions where relevant
- For interfaces: describe what the type represents and any invariants

### Naming

```typescript
// Classes: PascalCase
class BRepVertex { }

// Functions/methods: camelCase
function computeIntersection() { }

// Constants: UPPER_SNAKE_CASE
const DEFAULT_TOLERANCE = 1e-7;

// Files: kebab-case
// brep-vertex.ts, compute-intersection.ts
```

### File Structure

```typescript
// brep-vertex.ts

/**
 * A vertex in BRep topology — a point in space.
 */
export class BRepVertex {
  // ... implementation
}
```

Tests mirror source:
```
src/topology/brep-vertex.ts
tests/topology/brep-vertex.test.ts
```

## OCCT Reference Pattern

When implementing based on OCCT:

```typescript
/**
 * Creates an edge from two vertices and a curve.
 * 
 * Based on OCCT's BRep_Builder::MakeEdge.
 * See: library/opencascade/src/BRep/BRep_Builder.cxx
 * 
 * Key differences from OCCT:
 * - We use explicit curve bounds instead of computing from vertices
 * - No handle system — direct object ownership
 */
export function makeEdge(
  v1: BRepVertex,
  v2: BRepVertex,
  curve: Curve3D,
  t1: number,
  t2: number
): BRepEdge {
  // Implementation
}
```

## Test Standards

### Test File Structure

```typescript
// brep-vertex.test.ts
import { describe, it, expect } from 'vitest';
import { BRepVertex } from '../src/topology/brep-vertex';

describe('BRepVertex', () => {
  describe('constructor', () => {
    it('creates a vertex at the given point', () => {
      const v = new BRepVertex(1, 2, 3);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });
  });
  
  describe('tolerance', () => {
    it('has a default tolerance', () => {
      const v = new BRepVertex(0, 0, 0);
      expect(v.tolerance).toBeGreaterThan(0);
    });
  });
});
```

### What to Test

- Happy path
- Edge cases
- Error conditions
- Numerical precision (use `toBeCloseTo` for floats)

## Dependencies

Keep dependencies minimal:
- `vitest` for testing
- `typescript` for types
- Avoid heavy math libraries initially — implement what we need

## When Stuck

1. Check `background/` for relevant documentation
2. Look at OCCT implementation in `library/opencascade/`
3. Search for academic papers on the algorithm
4. Document what you learn (even if incomplete)
5. Ask for help if truly blocked

## Commit Messages

```
feat(topology): add BRepVertex class

- Basic vertex with point and tolerance
- Tests for construction and accessors
- Based on OCCT TopoDS_Vertex
```

Prefixes: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`
