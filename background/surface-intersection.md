# Surface-Surface Intersection (SSI)

> The "dragon" of CAD kernels — getting this right is what makes boolean operations possible.

---

## Table of Contents

- [Overview](#overview)
- [Why SSI is the Dragon](#why-ssi-is-the-dragon)
- [Types of Intersections](#types-of-intersections)
- [Algorithms Overview](#algorithms-overview)
- [Marching Methods](#marching-methods)
- [Subdivision Methods](#subdivision-methods)
- [Handling Degeneracies](#handling-degeneracies)
- [Numerical Robustness](#numerical-robustness)
- [OCCT's Approach](#occts-approach)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

When two surfaces intersect, they meet along a curve (or curves, or points). Finding this intersection curve precisely is the core computational geometry problem in CAD.

**Everything depends on SSI:**
- Boolean operations (union, subtract, intersect)
- Filleting (blend surfaces intersect with faces)
- Trimming (cutting surfaces with planes)
- Collision detection

If your SSI is wrong, your booleans are wrong. If your SSI misses a branch, you'll have holes in your model.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SURFACE INTERSECTION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│       Surface A                     Surface B                   │
│         ┌───────┐                  ╱─────────╲                  │
│         │       │                 ╱           ╲                 │
│         │  ═════┤════════════════╬═════       │                 │
│         │       │ intersection   ╱             │                │
│         └───────┘ curve         ╱               ╲               │
│                                ╱                 ╲              │
│                               └───────────────────┘             │
│                                                                 │
│  The intersection is a curve in 3D space.                       │
│  This curve may branch, loop, or degenerate to a point.         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why SSI is the Dragon

### The Easy Cases Are Easy

Plane-plane intersection? Line along the intersection. Trivial.

Plane-sphere? Circle (or nothing, or tangent point). Closed-form solution.

### The Hard Cases Are Truly Hard

Two NURBS surfaces? The intersection curve:
- Has no closed-form solution
- May branch (multiple curves)
- May loop back on itself
- May degenerate to a point
- May have near-tangent regions (numerical instability)
- May cross itself
- May have cusps

```
┌─────────────────────────────────────────────────────────────────┐
│                INTERSECTION CURVE TYPES                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SIMPLE           BRANCHING         CLOSED LOOP                 │
│                                                                 │
│   ────────        ────┬────         ╭─────────╮                 │
│                       │             │         │                 │
│                      ╱ ╲            │         │                 │
│                     ╱   ╲           ╰─────────╯                 │
│                                                                 │
│  SELF-CROSSING    TANGENT REGION    DEGENERATE (point)          │
│                                                                 │
│      ╱╲           ════════════            ●                     │
│     ╱  ╲          (near-parallel)   (surfaces touch)            │
│    ╱    ╲                                                       │
│   ╱      ╲                                                      │
│                                                                 │
│  The algorithm must handle ALL of these.                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What Makes It Hard

1. **No closed form** — Must use iterative numerical methods
2. **Multiple solutions** — Must find ALL intersection curves
3. **Topology determination** — Must correctly connect curve segments
4. **Numerical precision** — Must work reliably near machine epsilon
5. **Performance** — Must be fast enough for interactive CAD
6. **Robustness** — Must never crash, even on pathological input

---

## Types of Intersections

### By Surface Types

| Surface A | Surface B | Intersection | Method |
|-----------|-----------|--------------|--------|
| Plane | Plane | Line or ∅ | Analytic |
| Plane | Cylinder | Line, ellipse, or ∅ | Analytic |
| Plane | Sphere | Circle or ∅ | Analytic |
| Cylinder | Cylinder | Curves (1-4) | Semi-analytic |
| Plane | NURBS | Curve | Marching |
| NURBS | NURBS | Curve(s) | Marching + subdivision |

### By Geometric Configuration

**Transverse Intersection**
- Surfaces cross cleanly
- Intersection curve is well-defined
- Numerical algorithms work well

**Tangent Intersection**
- Surfaces touch without crossing
- Intersection may be a curve, point, or region
- Numerically difficult (near-zero denominators)

**Coincident Region**
- Surfaces overlap (share a patch)
- No traditional "intersection curve"
- Must detect and handle specially

---

## Algorithms Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SSI ALGORITHM FAMILIES                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ANALYTIC                                                       │
│  ────────                                                       │
│  • For plane-plane, plane-quadric, etc.                         │
│  • Closed-form solution                                         │
│  • Fast and exact (within floating-point)                       │
│  • Limited to special cases                                     │
│                                                                 │
│  MARCHING                                                       │
│  ────────                                                       │
│  • Start from a point on the intersection                       │
│  • Step along the curve, solving for each point                 │
│  • Good for tracing individual curves                           │
│  • May miss separate branches                                   │
│                                                                 │
│  SUBDIVISION                                                    │
│  ───────────                                                    │
│  • Recursively subdivide parameter space                        │
│  • Check bounding boxes for potential intersection              │
│  • Good for finding all branches                                │
│  • Can be slow for large surfaces                               │
│                                                                 │
│  HYBRID                                                         │
│  ──────                                                         │
│  • Subdivision to find starting points                          │
│  • Marching to trace each curve                                 │
│  • Best of both worlds                                          │
│  • This is what production systems use                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Marching Methods

The core idea: start from a known intersection point and "walk" along the curve.

### Finding a Starting Point

Given surfaces S₁(u₁, v₁) and S₂(u₂, v₂), find parameters where:

```
S₁(u₁, v₁) = S₂(u₂, v₂)
```

This is a 4D root-finding problem (4 parameters: u₁, v₁, u₂, v₂).

**Methods:**
1. **Grid sampling** — Evaluate both surfaces on grids, find close points
2. **Subdivision** — Recursively refine parameter space
3. **Random sampling** — Monte Carlo starting points

### The Marching Step

Once on the curve, compute:
1. **Tangent direction** — Cross product of surface normals
2. **Step size** — Based on curvature and tolerance
3. **Next point** — Move along tangent, then refine

```
┌─────────────────────────────────────────────────────────────────┐
│                     MARCHING STEP                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Current point P is on intersection curve.                      │
│                                                                 │
│  1. Compute normals:                                            │
│     n₁ = ∂S₁/∂u × ∂S₁/∂v  (normal to surface 1)                 │
│     n₂ = ∂S₂/∂u × ∂S₂/∂v  (normal to surface 2)                 │
│                                                                 │
│  2. Tangent to intersection curve:                              │
│     t = n₁ × n₂   (cross product of normals)                    │
│     (normalize t)                                               │
│                                                                 │
│  3. Take predictor step:                                        │
│     P' = P + Δs · t   (Δs = step size)                          │
│                                                                 │
│  4. Correct back onto both surfaces:                            │
│     Solve for (u₁, v₁, u₂, v₂) such that                        │
│     S₁(u₁, v₁) = S₂(u₂, v₂) ≈ P'                                │
│     (Newton-Raphson)                                            │
│                                                                 │
│  5. New point: P_new = S₁(u₁, v₁)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Newton-Raphson Refinement

Given approximate point P, find exact parameters:

```
F(u₁, v₁, u₂, v₂) = S₁(u₁, v₁) - S₂(u₂, v₂) = 0

J = Jacobian of F

Δ = -J⁻¹ · F(current)

new parameters = old + Δ
```

Iterate until ||F|| < tolerance.

### Step Size Control

Too large: miss features, overshoot boundaries
Too small: slow, accumulates numerical error

**Adaptive step size:**
- Start with default Δs
- If Newton-Raphson converges quickly, increase step
- If slow or fails, decrease step
- Consider curvature (smaller steps in high-curvature regions)

---

## Subdivision Methods

When surfaces might have multiple intersection branches, subdivision finds them all.

### Bounding Box Test

```
┌─────────────────────────────────────────────────────────────────┐
│                   BOUNDING BOX CULLING                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│        Surface 1              Surface 2                         │
│       ┌─────────┐            ┌─────────┐                        │
│       │    ╱╲   │            │  ╱──╲   │                        │
│       │   ╱  ╲  │            │ ╱    ╲  │                        │
│       │  ╱    ╲ │            │╱      ╲ │                        │
│       │ ╱      ╲│            │        ╲│                        │
│       └─────────┘            └─────────┘                        │
│                                                                 │
│  If bounding boxes don't overlap → NO intersection (prune)      │
│  If boxes overlap → might intersect (subdivide further)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Recursive Subdivision

```
function findIntersections(patch1, patch2):
    box1 = boundingBox(patch1)
    box2 = boundingBox(patch2)
    
    if not overlap(box1, box2):
        return []
    
    if small enough(patch1, patch2):
        // Find intersection point in this small region
        return refineIntersection(patch1, patch2)
    
    // Subdivide both patches
    p1a, p1b = subdivide(patch1)
    p2a, p2b = subdivide(patch2)
    
    // Check all combinations
    return concat(
        findIntersections(p1a, p2a),
        findIntersections(p1a, p2b),
        findIntersections(p1b, p2a),
        findIntersections(p1b, p2b)
    )
```

### Connecting the Points

Subdivision gives you intersection **points**. You need to connect them into **curves**.

```
┌─────────────────────────────────────────────────────────────────┐
│                  CONNECTING INTERSECTION POINTS                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  After subdivision:              After connection:              │
│                                                                 │
│     ●   ●                          ●───●                        │
│                                   ╱                             │
│   ●       ●     ──────────►     ●       ●                       │
│                                          ╲                      │
│       ●   ●                          ●───●                      │
│                                                                 │
│  Use parameter-space proximity to determine connectivity.       │
│  March between points to verify they're on the same curve.      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Handling Degeneracies

### Tangent Surfaces

When surfaces are nearly parallel:
- n₁ × n₂ ≈ 0 (no clear tangent direction)
- Marching step direction is undefined
- Must detect and handle specially

**Detection:** ||n₁ × n₂|| < tolerance

**Handling:**
1. Switch to parameter-space stepping
2. Use higher-order tangent approximation
3. Report as a warning (may need user intervention)

### Branch Points

Where intersection curves meet:
- Marching might take wrong branch
- Must detect and try multiple directions

**Detection:** Curvature spike, multiple viable tangents

**Handling:**
1. Stop at branch point
2. Identify all branches
3. Trace each separately

### Self-Intersection

A surface intersecting itself:
- Same algorithm, but S₁ = S₂ with different parameters
- Must avoid finding trivial solution (same point on same surface)

---

## Numerical Robustness

### Tolerance Management

Multiple tolerances needed:
- **Spatial tolerance** — How close is "on the curve"?
- **Parameter tolerance** — When are parameters "equal"?
- **Angular tolerance** — When are directions "parallel"?
- **Step size bounds** — Min/max marching step

### Common Failure Modes

| Problem | Symptom | Solution |
|---------|---------|----------|
| Newton doesn't converge | Marching stalls | Reduce step, try different start |
| Missed branch | Hole in boolean result | More starting points |
| Wrong connectivity | Crossed curves | Better parameter-space analysis |
| Tangent region | Unstable curve | Detect and warn |
| Near-degenerate | Garbage output | Check validity, report |

### Validation

After computing intersection:
- Verify all points are on both surfaces (within tolerance)
- Check curve continuity
- Verify parameter monotonicity (no backtracking)
- Confirm curve endpoints are on surface boundaries

---

## OCCT's Approach

OCCT has extensive SSI code developed over decades.

### Key Classes

```
GeomInt_IntSS           — Main surface-surface intersection
IntPatch_ImpImpIntersection  — Analytic (implicit) surfaces
IntPatch_ImpPrmIntersection  — Implicit vs parametric
IntPatch_PrmPrmIntersection  — Parametric vs parametric
IntSurf_*               — Low-level intersection utilities
```

### Algorithm Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    OCCT SSI FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CLASSIFY SURFACES                                           │
│     • Is each surface analytic (plane, cylinder, etc.)?         │
│     • If both analytic, use special-case code                   │
│                                                                 │
│  2. FIND STARTING POINTS                                        │
│     • Sample both surfaces on grids                             │
│     • Find close points                                         │
│     • Refine to exact intersection                              │
│                                                                 │
│  3. TRACE CURVES                                                │
│     • From each starting point, march in both directions        │
│     • Stop at surface boundaries or degeneracies                │
│     • Use adaptive step size                                    │
│                                                                 │
│  4. CONNECT AND CLEAN                                           │
│     • Connect curve segments                                    │
│     • Remove duplicates                                         │
│     • Sort by parameter                                         │
│                                                                 │
│  5. OUTPUT                                                      │
│     • 3D curves (Geom_Curve)                                    │
│     • Parameter curves on each surface (Geom2d_Curve)           │
│     • Intersection type (point, curve, region)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### OCCT Source Files

| File | Purpose |
|------|---------|
| `src/GeomInt/GeomInt_IntSS.cxx` | High-level entry point |
| `src/IntPatch/IntPatch_*.cxx` | Core intersection algorithms |
| `src/IntSurf/IntSurf_*.cxx` | Utility functions |
| `src/Extrema/Extrema_*.cxx` | Point-to-surface, nearest points |

---

## Relevance to labrep

### Our Phased Approach

**Phase 1: Avoid SSI Entirely**
- Only use primitives (box, cylinder) that don't require SSI
- No booleans — just individual shapes
- Sufficient for learning BRep structure

**Phase 2: Analytic SSI**
- Plane-plane, plane-cylinder, plane-sphere
- Closed-form solutions
- Enables basic booleans with primitives

**Phase 3: General SSI**
- Marching method for parametric surfaces
- NURBS-NURBS intersection
- Full boolean capability

### What We Need to Implement

```typescript
// Phase 2 interface
interface AnalyticIntersection {
  intersectPlanePlane(p1: Plane, p2: Plane): Line | null;
  intersectPlaneCylinder(p: Plane, c: Cylinder): Curve | null;
  intersectPlaneSphere(p: Plane, s: Sphere): Circle | null;
}

// Phase 3 interface
interface GeneralIntersection {
  intersect(s1: Surface, s2: Surface): IntersectionResult;
}

interface IntersectionResult {
  curves: Curve3D[];
  points: Point3D[];  // Tangent touches
  status: 'success' | 'tangent_region' | 'failed';
}
```

### Key Decisions

1. **Tolerance strategy** — Start with single global tolerance, refine later
2. **Marching implementation** — Predictor-corrector with adaptive step
3. **Starting points** — Grid sampling + Newton refinement
4. **Degeneracy handling** — Detect and report, don't try to be heroic
5. **Testing** — Extensive test suite with known intersection curves

### OCCT Reference Files

Start with these when implementing:
- `src/IntAna/IntAna_*.cxx` — Analytic intersections
- `src/GeomInt/GeomInt_IntSS.cxx` — Overall structure
- `src/IntPatch/IntPatch_WLine.cxx` — Walking/marching

---

## References

### Books and Papers

- Barnhill, R.E. & Kersey, S.N. (1990). "A Marching Method for Parametric Surface/Surface Intersection" — Foundational paper
- Patrikalakis, N.M. (1993). "Surface-to-Surface Intersections" — IEEE CG&A survey
- Sederberg, T.W. (2012). *Computer Aided Geometric Design* — Chapter on intersection

### Online Resources

- [CGAL Surface Intersection](https://doc.cgal.org/latest/Surface_mesh_topology/index.html) — Alternative approach
- [A Survey of Surface-Surface Intersection](https://www.sciencedirect.com/science/article/pii/S0010448597000023) — Academic survey

### OCCT Documentation

- [OCCT Modeling Algorithms](https://dev.opencascade.org/doc/overview/html/occt_user_guides__modeling_algos.html)
- `library/opencascade/src/GeomInt/` — Main intersection code
- `library/opencascade/src/IntPatch/` — Patch intersection
- `library/opencascade/src/IntSurf/` — Surface utilities
