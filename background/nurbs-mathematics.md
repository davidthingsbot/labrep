# NURBS Mathematics

> The mathematical foundation for curves and surfaces in BRep — essential for anything beyond lines and planes.

---

## Table of Contents

- [Overview](#overview)
- [Why NURBS?](#why-nurbs)
- [Bernstein Polynomials and Bézier Curves](#bernstein-polynomials-and-bézier-curves)
- [B-Spline Basis Functions](#b-spline-basis-functions)
- [B-Spline Curves](#b-spline-curves)
- [NURBS Curves](#nurbs-curves)
- [NURBS Surfaces](#nurbs-surfaces)
- [Important Algorithms](#important-algorithms)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

NURBS (Non-Uniform Rational B-Splines) are the industry standard for representing freeform curves and surfaces in CAD. They can exactly represent:
- All conic sections (circles, ellipses, parabolas, hyperbolas)
- Complex freeform shapes (car bodies, airplane wings, consumer products)

Understanding NURBS math is essential for implementing anything beyond line segments and flat planes.

```
┌─────────────────────────────────────────────────────────────────┐
│                     NURBS CAPABILITIES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Lines, Planes ─────────► Trivial (not NURBS)                   │
│                                                                 │
│  Circles, Ellipses ────► NURBS can represent exactly            │
│                                                                 │
│  Cylinders, Cones ─────► NURBS surfaces (circular cross-section)│
│                                                                 │
│  Freeform Curves ──────► Arbitrary smooth curves                │
│                                                                 │
│  Freeform Surfaces ────► Car bodies, organic shapes, etc.       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why NURBS?

### Alternatives and Their Limitations

| Representation | Limitation |
|----------------|------------|
| Polylines/meshes | Approximations — not exact |
| Hermite curves | Can't represent circles |
| Bézier curves | Global — changing one point affects whole curve |
| B-Splines | Can't exactly represent circles |
| **NURBS** | Can do everything (but more complex) |

### NURBS Advantages

1. **Exact conics** — Circles, ellipses are exact, not approximations
2. **Local control** — Moving one control point affects only nearby region
3. **Smooth** — Configurable continuity (C0, C1, C2, ...)
4. **Industry standard** — STEP, IGES, all CAD systems use NURBS
5. **Efficient algorithms** — Well-studied, fast evaluation

---

## Bernstein Polynomials and Bézier Curves

Before NURBS, we need to understand Bézier curves — their simpler ancestor.

### Bernstein Basis

The Bernstein polynomials of degree n are:

```
       n!
B   = ────── t^i (1-t)^(n-i)
 i,n  i!(n-i)!
```

For degree 3 (cubic Bézier):

```
B₀,₃ = (1-t)³
B₁,₃ = 3t(1-t)²
B₂,₃ = 3t²(1-t)
B₃,₃ = t³
```

These sum to 1 for any t ∈ [0,1], and each is non-negative.

### Bézier Curve

A Bézier curve is defined by control points P₀, P₁, ..., Pₙ:

```
        n
C(t) = Σ Pᵢ · Bᵢ,ₙ(t)    for t ∈ [0,1]
       i=0
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUBIC BÉZIER CURVE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                P1                                               │
│               ╱ ╲                                               │
│              ╱   ╲                                              │
│             ╱     ╲                                             │
│            ╱       ╲                                            │
│           ╱    curve╲                                           │
│          ╱   ────────╲                                          │
│         ╱  ╱          ╲                                         │
│        P0─╱            ╲─P3                                     │
│            ╲          ╱                                         │
│             ╲        ╱                                          │
│              ╲      ╱                                           │
│               ╲    ╱                                            │
│                P2                                               │
│                                                                 │
│  The curve interpolates P0 and P3 (endpoints).                  │
│  P1 and P2 pull the curve toward them.                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Bézier Properties

- **Endpoint interpolation** — C(0) = P₀, C(1) = Pₙ
- **Convex hull** — Curve lies within convex hull of control points
- **Tangent** — C'(0) is parallel to P₁ - P₀
- **Global influence** — Moving any point affects entire curve

The "global influence" is a problem — editing one part changes everything.

---

## B-Spline Basis Functions

B-Splines fix the "global influence" problem using a **knot vector**.

### Knot Vector

A non-decreasing sequence of real numbers:

```
U = {u₀, u₁, u₂, ..., uₘ}    where uᵢ ≤ uᵢ₊₁
```

Example for a degree-3 curve with 4 control points:

```
U = {0, 0, 0, 0, 1, 1, 1, 1}
     ├──┴──┴──┘   └──┴──┴──┤
     multiplicity 4         multiplicity 4
```

The relationship: **m = n + p + 1**, where:
- m + 1 = number of knots
- n + 1 = number of control points
- p = degree

### Cox-de Boor Recursion

B-spline basis functions Nᵢ,ₚ(u) are defined recursively:

**Degree 0:**
```
           ⎧ 1  if uᵢ ≤ u < uᵢ₊₁
Nᵢ,₀(u) = ⎨
           ⎩ 0  otherwise
```

**Degree p > 0:**
```
           u - uᵢ                uᵢ₊ₚ₊₁ - u
Nᵢ,ₚ(u) = ───────── Nᵢ,ₚ₋₁(u) + ───────────── Nᵢ₊₁,ₚ₋₁(u)
          uᵢ₊ₚ - uᵢ              uᵢ₊ₚ₊₁ - uᵢ₊₁
```

(Define 0/0 = 0 when knots coincide.)

### Basis Function Properties

```
┌─────────────────────────────────────────────────────────────────┐
│                  B-SPLINE BASIS FUNCTIONS                       │
│                     (degree 2, uniform)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1 ┤      ╱╲          ╱╲          ╱╲          ╱╲                │
│    │     ╱  ╲        ╱  ╲        ╱  ╲        ╱  ╲               │
│    │    ╱    ╲      ╱    ╲      ╱    ╲      ╱    ╲              │
│    │   ╱      ╲    ╱      ╲    ╱      ╲    ╱      ╲             │
│    │  ╱        ╲  ╱        ╲  ╱        ╲  ╱        ╲            │
│  0 ┼─╱──────────╲╱──────────╲╱──────────╲╱──────────╲──────     │
│    0           1           2           3           4            │
│                                                                 │
│  N₀,₂    N₁,₂    N₂,₂    N₃,₂    N₄,₂                           │
│                                                                 │
│  Each basis function is non-zero only over a few knot spans.    │
│  This gives LOCAL CONTROL — key advantage over Bézier.          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## B-Spline Curves

A B-spline curve of degree p with control points P₀, ..., Pₙ and knot vector U:

```
        n
C(u) = Σ Pᵢ · Nᵢ,ₚ(u)
       i=0
```

### Example: Cubic B-Spline

Degree 3, 5 control points, knot vector:

```
U = {0, 0, 0, 0, 0.5, 1, 1, 1, 1}
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUBIC B-SPLINE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                 P1        P2                                    │
│                  ●────────●                                     │
│                 ╱          ╲                                    │
│                ╱    curve   ╲                                   │
│               ╱   ─────────  ╲                                  │
│              ╱   ╱          ╲ ╲                                 │
│             P0──╱            ╲─P4                               │
│              ●                 ●                                │
│                      ●                                          │
│                     P3                                          │
│                                                                 │
│  Moving P2 only affects the middle portion — LOCAL CONTROL.     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### B-Spline Properties

- **Local support** — Each basis function is non-zero over at most p+1 knot spans
- **Partition of unity** — Σ Nᵢ,ₚ(u) = 1 for u in valid range
- **Non-negative** — Nᵢ,ₚ(u) ≥ 0
- **Continuity** — C^(p-k) at a knot with multiplicity k
- **Convex hull** — Local convex hull property

---

## NURBS Curves

NURBS add **weights** to B-splines, enabling exact conic sections.

### Definition

```
        Σ wᵢ Pᵢ Nᵢ,ₚ(u)
C(u) = ─────────────────
         Σ wᵢ Nᵢ,ₚ(u)
```

Or equivalently:

```
        n
C(u) = Σ Pᵢ · Rᵢ,ₚ(u)
       i=0

              wᵢ Nᵢ,ₚ(u)
where Rᵢ,ₚ = ─────────────
              Σ wⱼ Nⱼ,ₚ(u)
```

### Why Weights?

Weights allow exact representation of circles:

```
┌─────────────────────────────────────────────────────────────────┐
│                   NURBS CIRCLE (90° ARC)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     P1 (w=√2/2)                                 │
│                       ●                                         │
│                      ╱│╲                                        │
│                     ╱ │ ╲                                       │
│                    ╱  │  ╲                                      │
│                   ╱   │   ╲   arc                               │
│                  ╱    │    ╲  ───                               │
│                 ╱     │     ╲                                   │
│                ╱      │      ╲                                  │
│               ●───────┼───────●                                 │
│              P0      center   P2                                │
│             (w=1)            (w=1)                              │
│                                                                 │
│  Degree 2, 3 control points, weights 1, √2/2, 1                 │
│  Knots: {0, 0, 0, 1, 1, 1}                                      │
│                                                                 │
│  Result: EXACT quarter circle.                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

A full circle needs multiple arcs (typically 4 quarter-circles or 3 thirds).

### NURBS = Rational

"Rational" means division by weighted sum. This is what enables conics:
- Circle: ratio of polynomials
- B-Spline: just polynomials (can't exactly represent circles)

---

## NURBS Surfaces

NURBS surfaces are tensor products of NURBS curves.

### Definition

Given:
- Control point grid: Pᵢ,ⱼ (n+1 × m+1 points)
- Weights: wᵢ,ⱼ
- Knot vectors: U (u-direction), V (v-direction)
- Degrees: p (u-direction), q (v-direction)

```
           Σᵢ Σⱼ wᵢ,ⱼ Pᵢ,ⱼ Nᵢ,ₚ(u) Nⱼ,ᵧ(v)
S(u,v) = ────────────────────────────────────
            Σᵢ Σⱼ wᵢ,ⱼ Nᵢ,ₚ(u) Nⱼ,ᵧ(v)
```

### Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                    NURBS SURFACE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│            v                                                    │
│            ↑                                                    │
│            │   ●────●────●────●                                 │
│            │  ╱    ╱    ╱    ╱│                                 │
│            │ ●────●────●────● │    Control point grid           │
│            │╱    ╱    ╱    ╱│ │    (4 × 4 = 16 points)          │
│            ●────●────●────● │ ●                                 │
│           ╱    ╱    ╱    ╱│ │╱                                  │
│          ●────●────●────● │ ●                                   │
│          │    │    │    │ │╱                                    │
│          └────┴────┴────┴─●───────→ u                           │
│                                                                 │
│  The surface is a smooth blend of the control points.           │
│  Local control: moving one point affects a local patch.         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Partial Derivatives

```
∂S     
── (u,v)  = tangent in u direction
∂u

∂S
── (u,v)  = tangent in v direction
∂v

       ∂S   ∂S
n(u,v) = ── × ──  = surface normal (unnormalized)
       ∂u   ∂v
```

---

## Important Algorithms

### Curve Evaluation (de Boor Algorithm)

Efficient evaluation of B-spline at parameter u:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DE BOOR ALGORITHM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: control points P, knot vector U, parameter u, degree p  │
│                                                                 │
│  1. Find knot span: k such that U[k] ≤ u < U[k+1]               │
│                                                                 │
│  2. Initialize: d[j] = P[j-p+k]  for j = 0..p                   │
│                                                                 │
│  3. For r = 1 to p:                                             │
│       For j = p down to r:                                      │
│                    u - U[j+k-p]                                 │
│         α[j,r] = ─────────────────                              │
│                  U[j+1+k-r] - U[j+k-p]                          │
│                                                                 │
│         d[j] = (1 - α) · d[j-1] + α · d[j]                      │
│                                                                 │
│  4. Return: d[p] = C(u)                                         │
│                                                                 │
│  This is O(p²) per evaluation.                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Knot Insertion

Insert a new knot without changing the curve shape:

- Adds one control point
- Useful for: subdivision, degree elevation, extracting Bézier segments

### Degree Elevation

Raise the degree of the curve while preserving shape:

- Adds control points
- Useful for: matching degrees of different curves

### Knot Refinement

Insert multiple knots at once — Oslo algorithm.

---

## Relevance to labrep

### When We Need NURBS

| Feature | Without NURBS | With NURBS |
|---------|---------------|------------|
| Lines, planes | Works | Not needed |
| Arcs, circles | Approximation only | Exact |
| Cylinders | Can't represent exactly | Exact |
| Fillets | Very limited | Full capability |
| Freeform | Not possible | Full capability |
| STEP import | Can't read NURBS entities | Full support |

### Implementation Priority

**Phase 1: Lines and Planes (no NURBS needed)**
- Implement linear curves and planar surfaces
- Sufficient for box, simple extrusions

**Phase 2: Analytic Conics**
- Implement circles/arcs using NURBS representation
- Enables cylinders, cones, spheres

**Phase 3: Full NURBS**
- General B-spline curves and surfaces
- Import/export of complex STEP files
- Freeform modeling

### What We Need to Implement

```typescript
// Core NURBS curve
interface NurbsCurve {
  degree: number;
  controlPoints: Point3D[];
  weights: number[];
  knots: number[];
  
  evaluate(u: number): Point3D;
  derivative(u: number, order: number): Vector3D;
  insertKnot(u: number): NurbsCurve;
}

// Core NURBS surface
interface NurbsSurface {
  degreeU: number;
  degreeV: number;
  controlPoints: Point3D[][];  // 2D grid
  weights: number[][];
  knotsU: number[];
  knotsV: number[];
  
  evaluate(u: number, v: number): Point3D;
  normal(u: number, v: number): Vector3D;
}
```

### OCCT Reference

| Algorithm | OCCT Class | File |
|-----------|------------|------|
| B-spline curve | Geom_BSplineCurve | src/Geom/Geom_BSplineCurve.cxx |
| B-spline surface | Geom_BSplineSurface | src/Geom/Geom_BSplineSurface.cxx |
| Curve evaluation | BSplCLib | src/BSplCLib/BSplCLib.cxx |
| Surface evaluation | BSplSLib | src/BSplSLib/BSplSLib.cxx |
| Knot insertion | BSplCLib::InsertKnot | src/BSplCLib/BSplCLib.cxx |

---

## References

### Books

- **The NURBS Book** (Piegl & Tiller, 1997) — The definitive reference
- **Curves and Surfaces for CAGD** (Farin, 2002) — Excellent introduction

### Online Resources

- [NURBS on Wikipedia](https://en.wikipedia.org/wiki/Non-uniform_rational_B-spline)
- [A Primer on Bézier Curves](https://pomax.github.io/bezierinfo/) — Interactive tutorial
- [B-Spline Basics](https://www.cs.utah.edu/~scherm/cs4600/bspline.pdf) — Lecture notes

### Academic Papers

- de Boor, C. (1972). "On calculating with B-splines" — Original de Boor algorithm
- Cox, M.G. (1972). "The numerical evaluation of B-splines" — Cox-de Boor recursion

### OCCT Source

- `library/opencascade/src/Geom/Geom_BSplineCurve.cxx`
- `library/opencascade/src/Geom/Geom_BSplineSurface.cxx`
- `library/opencascade/src/BSplCLib/BSplCLib.cxx` — Core algorithms
