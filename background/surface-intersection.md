# Surface-Surface Intersection (SSI)

> The "dragon" of CAD kernels — getting this right is what makes boolean operations possible.

---

## Table of Contents

- [Overview](#overview)
- [Why SSI is Hard](#why-ssi-is-hard)
- [Algorithms](#algorithms)
- [OCCT's Approach](#occts-approach)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

🚧 **Stub** — This document needs to be expanded.

When two surfaces intersect, they meet along a curve (or curves). Finding this intersection curve precisely is the core challenge of CAD kernels. Everything from boolean operations to filleting depends on robust SSI.

---

## Why SSI is Hard

TODO: Explain the challenges:
- Curves can branch, loop, degenerate
- Numerical tolerances and robustness
- Performance for complex surfaces
- Edge cases (tangent surfaces, near-misses)

---

## Algorithms

TODO: Cover main approaches:
- Marching methods
- Subdivision methods
- Algebraic methods
- Newton-Raphson refinement

---

## OCCT's Approach

TODO: How OCCT implements SSI, key classes to study.

---

## Relevance to labrep

TODO: This is the dragon we must eventually slay. Phased approach.

---

## References

- OCCT IntSurf package: `library/opencascade/src/IntSurf/`
- OCCT GeomInt package: `library/opencascade/src/GeomInt/`
- [Surface Intersection Survey Paper](https://www.sciencedirect.com/science/article/pii/S0010448597000023)
