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

## No Deferred Work. No Ignored Failures. No "Later".

**NEVER leave broken things for later. There is no "later".**

When the work is hard — and it will be hard — you will feel the urge to skip something, stub it out, or leave a TODO. **This is exactly the moment you must not do that.** The hard parts are the whole point. Deferring them means the problem compounds and the next attempt inherits a broken foundation.

These patterns are **strictly forbidden**:

- "Implement later" / "TODO: fix this" / "Decided to defer"
- Skipping or `.skip()`-ing a failing test instead of fixing the code
- Stubbing a function to return `null` and moving on
- Loose test tolerances that paper over wrong answers (e.g., ±13% "close enough")
- Silently swallowing errors (e.g., producing an invalid result instead of failing)
- Comments like "approximate — may have ~30% error"
- Scaffolding without implementation ("the structure is in place for future work")

If a test fails, **fix the code until it passes**. If code produces wrong results, **fix the algorithm**. If you can't fix it right now, **say so and stop** — do not hide the problem behind a loose assertion or a TODO comment. Every workaround becomes permanent. Every ignored failure trains the next agent to accept broken output.

## OCCT Is Your Primary Reference. Use It.

**OpenCASCADE (OCCT) has correct, battle-tested solutions to every problem you will face.** Do not invent your own approach when OCCT already solves it. This is not optional guidance — it is a hard requirement.

Before implementing **anything**:

1. **Read the OCCT source** in `library/opencascade/`. Find the class or algorithm that corresponds to what you're building. Read it. Understand the data structures, the edge cases it handles, and the design decisions it makes.
2. **Map OCCT's design to our code.** If OCCT's lower-level objects have methods or fields that our corresponding types lack, **add them first**. Do not build higher-level features on top of incomplete foundations. If `BRep_TEdge` stores a list of PCurves and our `Edge` doesn't, fix that before proceeding.
3. **Search the web** for blog posts, papers, and open-source implementations. Surface-surface intersection, boolean operations, and tessellation are well-studied — leverage existing knowledge.
4. **Read `background/`** for curated notes on algorithms, formats, and architecture.

**Do not diverge from OCCT's approach without an explicit, documented reason.** "I felt like doing it differently" is not a reason. OCCT's design reflects decades of production use and edge-case discovery. When you deviate, you lose that accumulated knowledge and will rediscover the same problems the hard way.

You are not inventing computational geometry from scratch. You are implementing known algorithms in TypeScript, guided by production-quality reference implementations.

## Test Quality: Rigorous, Detailed, Adversarial

Tests must be **aggressive**, not ceremonial. **Invest serious effort in testing.** A thorough test suite is the single most valuable thing you can produce — it catches bugs early, prevents regressions, and gives confidence that the implementation actually works. Skimping on tests to "move faster" always costs more time in the end.

### What to test

- **Test edge cases and known trouble spots**, not just the happy path. For geometry: tangent configurations, degenerate inputs, near-tolerance values, axis-aligned and non-axis-aligned cases.
- **Use tight tolerances.** If the expected answer is 92, assert `toBeCloseTo(92, 1)` — not `toBeGreaterThan(75)`. Compute the expected answer analytically wherever possible.
- **Test topology, not just volume.** Check shell closure, face counts, edge counts, normal consistency — not just that a number looks roughly right.
- **Vary inputs.** If all tests use the same two axis-aligned boxes, they prove nothing about the general case. Test different offsets, orientations, containment, touching, and non-overlapping configurations.
- **Test the invariants.** For booleans: V(A) + V(B) = V(union) + V(intersect). For tessellation: triangle area sums to face area. These catch bugs that individual tests miss.

### What "detailed" means

Don't just test that a function returns *something*. Test that it returns the *right thing*:

- If a boolean produces a solid, verify its **exact volume**, **face count**, **shell closure**, and that **every face normal points outward**.
- If an intersection returns a curve, verify its **center**, **radius**, **start/end points**, and **orientation**.
- If a trimmed face is produced, verify its **boundary edges form a closed loop**, the **surface type is preserved**, and **points inside the trim are on the surface**.

### What "adversarial" means

Write the tests that you hope will pass but suspect might not:

- Tangent sphere just kissing a face
- Cylinder axis parallel to a box edge (degenerate intersection)
- Subtraction that leaves a paper-thin wall
- Two solids sharing an exact face (coplanar)
- Near-zero-volume intersection slivers

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

1. **Read the OCCT source first** — `library/opencascade/` has the answer. Find the equivalent class, read the `.cxx` implementation, understand the algorithm.
2. Check `background/` for curated notes on the topic.
3. Search the web for papers, blog posts, and other implementations.
4. Document what you learn (even if incomplete).
5. Ask for help if truly blocked — but only after you have read the OCCT source.

## Commit Messages

```
feat(topology): add BRepVertex class

- Basic vertex with point and tolerance
- Tests for construction and accessors
- Based on OCCT TopoDS_Vertex
```

Prefixes: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`
