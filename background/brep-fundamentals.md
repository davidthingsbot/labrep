# BRep Fundamentals

> The foundational data structures and concepts for boundary representation — the core of what labrep implements.

---

## Table of Contents

- [Overview](#overview)
- [What is BRep?](#what-is-brep)
- [Topology vs Geometry](#topology-vs-geometry)
- [The Topological Hierarchy](#the-topological-hierarchy)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

🚧 **Stub** — This document needs to be expanded.

Boundary Representation (BRep) is the standard way professional CAD systems represent 3D solid models. Instead of storing a solid as a volumetric description, BRep stores only the boundary — the surfaces, edges, and vertices that enclose the solid.

This document covers the fundamental concepts needed to understand and implement a BRep system.

---

## What is BRep?

TODO: Explain BRep concept, contrast with CSG and mesh.

---

## Topology vs Geometry

TODO: Explain the separation of topology (structure) and geometry (math).

---

## The Topological Hierarchy

TODO: Vertex → Edge → Wire → Face → Shell → Solid → Compound

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOPOLOGY HIERARCHY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Compound ─────► contains multiple Solids                       │
│      │                                                          │
│      ▼                                                          │
│  Solid ────────► closed volume bounded by Shells                │
│      │                                                          │
│      ▼                                                          │
│  Shell ────────► connected set of Faces                         │
│      │                                                          │
│      ▼                                                          │
│  Face ─────────► bounded surface, trimmed by Wires              │
│      │                                                          │
│      ▼                                                          │
│  Wire ─────────► connected sequence of Edges                    │
│      │                                                          │
│      ▼                                                          │
│  Edge ─────────► bounded curve between Vertices                 │
│      │                                                          │
│      ▼                                                          │
│  Vertex ───────► point in space                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Relevance to labrep

TODO: How these concepts map to our TypeScript implementation.

---

## References

- [Wikipedia: Boundary Representation](https://en.wikipedia.org/wiki/Boundary_representation)
- OCCT TopoDS package: `library/opencascade/src/TopoDS/`
- OCCT BRep package: `library/opencascade/src/BRep/`
