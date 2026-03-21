# AGENTS.md — examples/

Instructions for AI agents creating examples.

---

## Purpose

Examples demonstrate labrep features in isolation. They serve as:
- Documentation by example
- Integration tests
- Starting points for users

## Example Structure

Every example folder must have:

1. **README.md** — Explains what the example demonstrates
2. **index.ts** — The example code (runnable)
3. **expected output** — What the user should see (console output, image, etc.)

## README Template

```markdown
# Example Name

> One-line description of what this demonstrates.

## What You'll Learn

- Concept 1
- Concept 2

## Code

See [index.ts](./index.ts).

## Expected Output

[Description or screenshot of expected result]

## Prerequisites

- labrep generation/ built
- (any other requirements)
```

## Code Style

Examples should be:
- **Self-contained** — No hidden dependencies
- **Commented** — Explain what each step does
- **Minimal** — Focus on one concept
- **Runnable** — `npx ts-node index.ts` should work

```typescript
// index.ts
import { BRepVertex, BRepEdge } from '../../generation/src';

// Create two vertices
const v1 = new BRepVertex(0, 0, 0);
const v2 = new BRepVertex(10, 0, 0);

// Connect them with an edge
const edge = new BRepEdge(v1, v2);

console.log('Created edge:', edge);
console.log('Length:', edge.length());
```

## Numbering

Use numbered prefixes for order:
- `01-primitives/`
- `02-edges-and-wires/`
- `03-faces/`
- ...

This gives users a natural progression.
