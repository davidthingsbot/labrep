# OpenCASCADE Architecture

> Understanding OCCT's structure so we can reference it effectively when building labrep.

---

## Table of Contents

- [Overview](#overview)
- [Module Organization](#module-organization)
- [Key Packages](#key-packages)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

🚧 **Stub** — This document needs to be expanded.

OpenCASCADE Technology (OCCT) is a 3.6 million line C++ codebase organized into modules, toolkits, and packages. Understanding its structure is essential for using it as a reference.

---

## Module Organization

TODO: Explain OCCT's seven modules and their purposes.

---

## Key Packages

TODO: Detail the packages most relevant to labrep:

- `gp` — Basic geometric primitives
- `Geom` / `Geom2d` — Curves and surfaces
- `TopoDS` — Abstract topology
- `BRep` — Concrete BRep representation
- `BRepBuilderAPI` — High-level shape creation
- `BRepAlgoAPI` — Boolean operations

---

## Relevance to labrep

TODO: How to navigate OCCT source, what to look at for specific problems.

---

## References

- [OCCT Documentation](https://dev.opencascade.org/doc/overview/html/)
- [OCCT GitHub](https://github.com/Open-Cascade-SAS/OCCT)
- OCCT source: `library/opencascade/`
