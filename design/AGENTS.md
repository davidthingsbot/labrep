# AGENTS.md — design/

Instructions for AI agents writing design documents.

---

## Purpose

Design documents describe **how we'll build labrep** — architecture decisions, API design, data structure choices. These inform implementation in `generation/`.

## When to Write a Design Doc

Before implementing something significant:
- New data structure (e.g., half-edge topology)
- New API surface (e.g., primitive construction)
- Architectural decision (e.g., immutable vs mutable)
- Non-obvious choice that needs rationale

## Document Structure

```markdown
# Design: [Topic]

> One-line summary of what this document decides.

## Problem

What problem are we solving? What are the requirements?

## Alternatives Considered

### Option A: [Name]
- Description
- Pros
- Cons

### Option B: [Name]
- Description
- Pros
- Cons

## Decision

Which option we chose and why.

## Consequences

What this decision means for:
- Implementation complexity
- Performance
- Future flexibility
- Testing

## References

- Links to background docs
- Links to OCCT source
- External resources
```

## Guidelines

### Be Concrete

Show actual TypeScript interfaces, not just prose:

```typescript
// Proposed API
interface Vertex {
  point: Point3D;
  tolerance: number;
}
```

### Consider Alternatives

Don't just propose one solution. Show you considered options:
- What OCCT does
- What Truck does
- What's idiomatic in TypeScript
- Simpler alternatives

### Justify Decisions

"We chose X because..." should appear in every design doc.

### Keep It Short

Design docs should be 1-3 pages. If longer, split into multiple docs.

## Images

Store in `images/<topic>/`:

```
design/
├── images/
│   └── half-edge-topology/
│       └── diagram.png
├── half-edge-topology.md
└── ...
```

Reference as:
```markdown
![Half-edge structure](./images/half-edge-topology/diagram.png)
```

## Updating Designs

Designs can evolve. If implementation reveals problems:
1. Update the design doc
2. Note what changed and why
3. Implementation follows updated design
