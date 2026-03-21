# Background

Research notes and topic documentation for labrep.

---

## Purpose

This folder contains deep dives into the concepts, algorithms, and prior art relevant to building a BRep geometry library. Each document captures knowledge that informs our implementation.

## Document Index

| Document | Topic | Status |
|----------|-------|--------|
| [brep-fundamentals.md](./brep-fundamentals.md) | BRep topology, geometry, data structures | 🚧 Stub |
| [opencascade-architecture.md](./opencascade-architecture.md) | OCCT package structure, key classes | 🚧 Stub |
| [nurbs-mathematics.md](./nurbs-mathematics.md) | B-splines, NURBS curves and surfaces | 🚧 Stub |
| [surface-intersection.md](./surface-intersection.md) | SSI algorithms — the "dragon" | 🚧 Stub |
| [boolean-operations.md](./boolean-operations.md) | How booleans use SSI | 🚧 Stub |

## Document Structure

Every document follows this structure:

```markdown
# Topic Name

> One-line summary of why this matters to labrep.

## Table of Contents
[links to sections]

## Overview
[2-3 paragraphs introducing the topic]

## [Content Sections]
[Main content with ASCII diagrams, images]

## Relevance to labrep
[Detailed discussion of how this applies to our implementation]

## References
[Hyperlinks to external material]
```

## Images

All images are stored in `images/<topic-name>/`:

```
background/
├── images/
│   ├── brep-fundamentals/
│   ├── opencascade-architecture/
│   └── ...
├── brep-fundamentals.md
└── ...
```

Reference images in docs as:
```markdown
![Description](./images/brep-fundamentals/diagram.png)
```

## Adding a New Document

1. Create `<topic-name>.md` in this folder
2. Create `images/<topic-name>/` folder (even if empty initially)
3. Follow the document structure above
4. Add entry to this README's index table
5. Mark status as 🚧 Stub, 📝 Draft, or ✅ Complete
