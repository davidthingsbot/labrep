# Design

Architecture and design documentation for labrep.

---

## Purpose

This folder contains design documents that describe how labrep should be built — the architecture, APIs, data structures, and design decisions before implementation.

Unlike `background/` (which covers external knowledge), `design/` is about **our specific choices** for labrep.

## Document Index

| Document | Topic | Status |
|----------|-------|--------|
| (none yet) | | |

## Relationship to Other Folders

```
background/  → What we learned (BRep theory, OCCT structure, algorithms)
design/      → How we'll build it (architecture, APIs, decisions)
generation/  → The actual code (implements the design)
```

## Adding a Design Document

1. Create `<topic>.md` in this folder
2. Include: problem statement, alternatives considered, decision, rationale
3. Use diagrams (ASCII or images in `images/<topic>/`)
4. Update this README's index
