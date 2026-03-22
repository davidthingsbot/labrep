# AGENTS.md — design/

Instructions for AI agents working on labrep design and implementation.

---

## Design Overview

Read `README.md` in this folder for the complete design:
- **Data types** (8 tiers from Point2D to Assembly)
- **Functions** per data type
- **Exclusions** (what we're NOT building)
- **Phases** (11 phases from math to assemblies)
- **TDD approach**

---

## Implementation Consequences

### Phase-Based Development

**Agents must follow the phase order.** Each phase builds on the previous:

```
Phase 1 → Phase 2 → Phase 3 → ... → Phase 11
  ▲         ▲         ▲
  │         │         │
  └─────────┴─────────┴── Cannot skip ahead
```

**Before starting any phase:**
1. Confirm previous phase is complete (all tests pass)
2. Verify required data types exist
3. Understand dependencies on prior work

### TDD Is Mandatory

**For every function you implement:**

1. **Write test first** in `generation/tests/<module>/`
2. **Run test** — must fail (red)
3. **Write implementation** in `generation/src/<module>/`
4. **Run test** — must pass (green)
5. **Refactor** if needed
6. **Commit**

**No exceptions.** If you find yourself writing implementation without a failing test, stop and write the test first.

### File Organization

```
generation/
├── src/
│   ├── core/           # Phase 1: Point, Vector, Transform
│   │   ├── point.ts
│   │   ├── vector.ts
│   │   ├── transform.ts
│   │   └── index.ts
│   ├── geometry/       # Phase 2, 4: Curves, Surfaces
│   │   ├── curve2d.ts
│   │   ├── line2d.ts
│   │   ├── arc2d.ts
│   │   └── ...
│   ├── sketch/         # Phase 3, 10: Sketch system
│   │   ├── sketch.ts
│   │   ├── profile.ts
│   │   └── constraint.ts
│   ├── topology/       # Phase 4, 5: BRep structures
│   │   ├── vertex.ts
│   │   ├── edge.ts
│   │   ├── face.ts
│   │   └── solid.ts
│   ├── operations/     # Phase 5, 8, 9: Operations
│   │   ├── extrude.ts
│   │   ├── revolve.ts
│   │   └── boolean.ts
│   ├── io/             # Phase 6: File I/O
│   │   ├── step-reader.ts
│   │   └── step-writer.ts
│   └── assembly/       # Phase 11: Assemblies
│       ├── part.ts
│       ├── assembly.ts
│       └── joint.ts
└── tests/
    └── (mirrors src/ structure)
```

### Naming Conventions

```typescript
// Files: kebab-case
line-2d.ts
arc-2d.ts
step-reader.ts

// Interfaces/Types: PascalCase
interface Point2D { }
interface Vector3D { }
type ConstraintType = ...

// Functions: camelCase
function addVectors(v1: Vector2D, v2: Vector2D): Vector2D
function evaluateCurve(curve: Curve2D, t: number): Point2D

// Constants: UPPER_SNAKE_CASE
const DEFAULT_TOLERANCE = 1e-7;
const TWO_PI = Math.PI * 2;
```

### Type Safety

- **No `any` types** unless absolutely unavoidable (comment why)
- **Explicit return types** on all public functions
- **Interface over class** where practical (prefer composition)
- **Readonly where possible** (immutable by default)

```typescript
// Good
interface Point2D {
  readonly x: number;
  readonly y: number;
}

function addVector(p: Point2D, v: Vector2D): Point2D {
  return { x: p.x + v.x, y: p.y + v.y };
}

// Bad
class Point2D {
  public x: number;
  public y: number;
}
```

### Error Handling

Use `OperationResult<T>` for operations that can fail:

```typescript
interface OperationResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  warnings?: string[];
}

// Usage
function extrude(profile: Profile2D, ...): OperationResult<Solid> {
  if (!profile.outer.isClosed) {
    return { success: false, error: 'Profile must be closed' };
  }
  // ... implementation
  return { success: true, result: solid };
}
```

### Numerical Tolerance

**Always use tolerance for floating-point comparisons:**

```typescript
const TOLERANCE = 1e-7;

function pointsEqual(p1: Point2D, p2: Point2D): boolean {
  return distance(p1, p2) < TOLERANCE;
}

// Never:
function pointsEqual(p1: Point2D, p2: Point2D): boolean {
  return p1.x === p2.x && p1.y === p2.y;  // X Never exact compare floats
}
```

---

## OCCT Reference Pattern

When implementing algorithms, reference OCCT:

```typescript
/**
 * Computes the intersection of two 2D line segments.
 * 
 * Based on OCCT's IntAna2d_AnaIntersection.
 * See: library/opencascade/src/IntAna2d/IntAna2d_AnaIntersection.cxx
 * 
 * We simplified by assuming infinite lines then checking bounds,
 * rather than OCCT's direct bounded approach.
 */
function intersectLines(l1: Line2D, l2: Line2D): Point2D[] {
  // Implementation
}
```

**DO:**
- Read OCCT to understand algorithms
- Cite the source file in comments
- Reimplement cleanly in TypeScript

**DON'T:**
- Copy-paste C++ code
- Translate OCCT idioms directly (Handles, etc.)
- Use OCCT naming conventions in our code

---

## What We're NOT Building (Exclusions)

Per the design, these are **explicitly out of scope**:

| Excluded | Why |
|----------|-----|
| NURBS freeform surfaces | Complexity — use analytic surfaces |
| Fillets/chamfers | Can add later, not core workflow |
| Loft/sweep with guides | Advanced, not Phase 1-11 |
| Sheet metal | Domain-specific |
| FEA integration | Out of scope |
| Rendering/materials | Out of scope |

**If asked to implement an excluded feature:** Decline politely, note it's out of scope per `design/README.md`, and suggest focusing on the current phase.

---

## Test Quality Requirements

### Every Test Must Have:

1. **Clear description** — what behavior is being tested
2. **Known inputs** — concrete values, not random
3. **Expected output** — specific, verifiable
4. **Edge cases** — at least one per function

### Example Test Structure:

```typescript
describe('Module: Function', () => {
  describe('normal cases', () => {
    it('does X when given Y', () => {
      // Arrange
      const input = ...;
      const expected = ...;
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expected);
    });
  });
  
  describe('edge cases', () => {
    it('handles zero vector', () => { ... });
    it('handles coincident points', () => { ... });
  });
  
  describe('error cases', () => {
    it('returns error for invalid input', () => { ... });
  });
});
```

---

## Commit Messages

```
feat(core): add Vector3D cross product

- Implement cross() function
- Add tests for orthogonal, parallel, and arbitrary vectors
- Handles zero vector case

Refs: Phase 1

---

test(geometry): add Line2D intersection tests

- Test cases for intersecting, parallel, coincident lines
- Prepare for implementation

---

fix(topology): correct face normal orientation

- Normals were pointing inward for some faces
- Added validation in Face constructor
```

Prefixes: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`

---

## When Stuck

1. **Check design/** — Is the approach documented?
2. **Check background/** — Is the concept explained?
3. **Check OCCT** — How does OpenCASCADE do it?
4. **Write a failing test** — Clarify what you're trying to achieve
5. **Ask** — If truly blocked, document the blocker

---

## Phase Checklist Template

Before declaring a phase complete:

```
Phase N: [Name]
─────────────────────────────
[ ] All data types implemented
[ ] All functions implemented
[ ] All tests written and passing
[ ] No `any` types (or justified)
[ ] Code reviewed for clarity
[ ] Index exports updated
[ ] README.md phase status updated
[ ] Committed with appropriate message
```
