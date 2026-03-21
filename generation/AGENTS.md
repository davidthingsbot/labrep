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

## Code Standards

### TypeScript

- Strict mode enabled
- No `any` types (except when truly unavoidable, with comment explaining why)
- Meaningful variable names
- JSDoc comments for all public APIs

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
