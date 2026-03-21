# Boolean Operations

> Union, subtract, intersect — combining shapes is what makes CAD useful, and it depends on SSI.

---

## Table of Contents

- [Overview](#overview)
- [How Booleans Work](#how-booleans-work)
- [OCCT's Boolean Pipeline](#occts-boolean-pipeline)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

🚧 **Stub** — This document needs to be expanded.

Boolean operations (union, subtract, intersect) combine two solids into one. They're the primary way CAD users build complex shapes from simple primitives.

---

## How Booleans Work

TODO: Explain the pipeline:
1. Find all surface-surface intersections
2. Split faces along intersection curves
3. Classify faces as inside/outside/on
4. Stitch surviving faces into new solid

---

## OCCT's Boolean Pipeline

TODO: BRepAlgoAPI classes, BOPAlgo internals.

---

## Relevance to labrep

TODO: When to implement booleans, dependencies on SSI.

---

## References

- OCCT BRepAlgoAPI: `library/opencascade/src/BRepAlgoAPI/`
- OCCT BOPAlgo: `library/opencascade/src/BOPAlgo/`
- [Boolean Operations in CAD](https://en.wikipedia.org/wiki/Constructive_solid_geometry)
