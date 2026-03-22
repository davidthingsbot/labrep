# Attempts to Recreate OpenCASCADE

> A survey of projects attempting to build alternatives to OpenCASCADE — from traditional multi-year efforts to recent AI-driven experiments.

---

## Table of Contents

- [Overview](#overview)
- [Why People Try](#why-people-try)
- [The Challenge](#the-challenge)
- [Traditional Attempts](#traditional-attempts)
  - [Truck (ricosjp)](#truck-ricosjp)
  - [Fornjot](#fornjot)
  - [SolveSpace](#solvespace)
- [AI-Driven Attempts](#ai-driven-attempts)
  - [vcad (Cam Pedersen)](#vcad-cam-pedersen)
- [Related Projects](#related-projects)
  - [CADmium (Discontinued)](#cadmium-discontinued)
  - [SDF-Based Alternatives](#sdf-based-alternatives)
  - [Bindings and Wrappers](#bindings-and-wrappers)
- [Comparison Matrix](#comparison-matrix)
- [Lessons Learned](#lessons-learned)
- [Relevance to labrep](#relevance-to-labrep)
- [References](#references)

---

## Overview

OpenCASCADE (OCCT) is the only serious open-source BRep geometry kernel. It's used by FreeCAD, CadQuery, Build123d, and countless other projects. But it's also 3.6 million lines of legacy C++ with documentation issues and a steep learning curve.

Many have tried to build alternatives. Most have failed or stalled. This document surveys those attempts — what they achieved, where they struggled, and what we can learn from them.

```
┌─────────────────────────────────────────────────────────────────┐
│              THE OCCT REPLACEMENT LANDSCAPE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PRODUCTION READY                                               │
│  ────────────────                                               │
│  • OpenCASCADE ────────── 30+ years, 3.6M lines, the standard   │
│                                                                 │
│  MOST MATURE ALTERNATIVE                                        │
│  ───────────────────────                                        │
│  • Truck ─────────────── 4+ years, Rust, NURBS + booleans       │
│                                                                 │
│  EXPERIMENTAL / EARLY STAGE                                     │
│  ──────────────────────────                                     │
│  • Fornjot ───────────── 4+ years, Rust, lines/circles only     │
│  • vcad ──────────────── Months old, AI-built, unverified       │
│                                                                 │
│  DISCONTINUED / PIVOTED                                         │
│  ──────────────────────                                         │
│  • CADmium ───────────── Used Truck, team dissolved             │
│                                                                 │
│  DIFFERENT APPROACH (NOT BREP)                                  │
│  ─────────────────────────────                                  │
│  • libfive ───────────── SDF-based, not true BRep               │
│  • ImplicitCAD ───────── SDF + CSG, Haskell                     │
│  • SolveSpace ────────── Own kernel, NURBS but limited          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why People Try

### The Problems with OpenCASCADE

| Problem | Impact |
|---------|--------|
| **Legacy codebase** | 30+ years of C++, pre-modern patterns |
| **Custom memory management** | Handle system instead of standard smart pointers |
| **Poor documentation** | Many classes undocumented, examples sparse |
| **Build complexity** | Large dependency, complex CMake, WASM is painful |
| **API inconsistency** | Mixed naming conventions, non-obvious patterns |
| **Boolean instability** | Can fail on valid geometry |
| **License concerns** | LGPL with exceptions — some worry about linking |

### What People Want

1. **Modern language** — Rust, TypeScript, modern C++
2. **Clean API** — Consistent, well-documented, idiomatic
3. **WASM support** — Browser-native CAD
4. **Smaller footprint** — Not 3.6 million lines
5. **Better booleans** — Robust, predictable operations

---

## The Challenge

Building a BRep kernel is extraordinarily difficult. This table shows why most attempts fail or stall:

```
┌─────────────────────────────────────────────────────────────────┐
│              WHY BREP KERNELS ARE HARD                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EASY (weeks)                                                   │
│  ─────────────                                                  │
│  • Point, vector, matrix math                                   │
│  • Line segments, planes                                        │
│  • Box primitive                                                │
│  • Basic topology (vertex, edge, face)                          │
│  • Mesh tessellation                                            │
│                                                                 │
│  MEDIUM (months)                                                │
│  ──────────────                                                 │
│  • Circles, arcs, cylinders                                     │
│  • Extrude, revolve operations                                  │
│  • Plane-plane intersection                                     │
│  • Simple booleans (box-box)                                    │
│                                                                 │
│  HARD (years)                                                   │
│  ────────────                                                   │
│  • NURBS curves and surfaces                                    │
│  • General surface-surface intersection                         │
│  • Robust booleans on arbitrary geometry                        │
│  • Filleting (rolling ball algorithm)                           │
│  • STEP import/export                                           │
│  • Edge cases, degeneracies, tolerancing                        │
│                                                                 │
│  This is why OCCT took decades and is millions of lines.        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Traditional Attempts

### Truck (ricosjp)

**The most mature open-source alternative to OCCT.**

| Attribute | Value |
|-----------|-------|
| **Language** | Rust |
| **Started** | ~2020 |
| **Organization** | RICOS Co. Ltd (Japan) |
| **License** | MIT/Apache-2.0 |
| **Repository** | https://github.com/ricosjp/truck |
| **Status** | Active development |

**What it has:**
- Full NURBS curves and surfaces
- Half-edge topology
- Boolean operations (union, intersection, NOT)
- STEP import/export
- Tessellation to mesh
- WebGPU rendering
- WASM compilation
- JavaScript bindings

**What it's missing:**
- Fillets and chamfers
- Offset surfaces
- Lofted/swept surfaces
- Some edge cases in booleans
- Production-hardened robustness

**Architecture:**

```
truck/
├── truck-base        — Points, vectors, transforms
├── truck-geotrait    — Geometry traits (curves, surfaces)
├── truck-geometry    — NURBS implementation
├── truck-topology    — Half-edge topology
├── truck-modeling    — High-level modeling operations
├── truck-polymesh    — Mesh representation
├── truck-meshalgo    — Tessellation algorithms
├── truck-rendimpl    — WebGPU rendering
├── truck-stepio      — STEP file I/O
└── truck-js          — JavaScript/WASM bindings
```

**Why it matters:** Truck proves that a modern BRep kernel in Rust is achievable. It's small enough to understand (~50K lines vs OCCT's 3.6M), actively maintained by a real company, and has made steady progress over 4+ years.

**Hacker News commentary (2023):**
> "Based on the docs, you've only implemented some very basic topological operations. The hard part is going to be implementing the rest: boolean operations, offset surfaces, lofted surfaces, blended surfaces..."

Since then, Truck has added boolean operations, but fillets and advanced operations remain TODO.

---

### Fornjot

**A solo developer's attempt at a Rust BRep kernel.**

| Attribute | Value |
|-----------|-------|
| **Language** | Rust |
| **Started** | ~2021 |
| **Developer** | Hanno Braun (solo) |
| **License** | MIT/Apache-2.0 |
| **Repository** | https://github.com/hannobraun/fornjot |
| **Status** | Slow, steady progress |

**Current capabilities (as of 2024):**
- Lines and circles only (no NURBS yet)
- Basic topology
- Sweep/extrude along straight lines
- Very limited geometry

**What's planned but not done:**
- NURBS curves and surfaces
- General boolean operations
- Anything beyond basic shapes

**The developer's own assessment:**
> "The project started as an attempt to create a code-first CAD application, and I had to realize that even that is unrealistic, on top of a custom kernel."

**Why it's notable:** Fornjot demonstrates how hard this problem is. After 4+ years of dedicated solo work, it still only supports lines and circles. This isn't a criticism — it's an illustration of the problem's scope.

---

### SolveSpace

**A complete CAD application with its own constraint-based kernel.**

| Attribute | Value |
|-----------|-------|
| **Language** | C++ |
| **Started** | 2008 |
| **Creator** | Jonathan Westhues |
| **License** | GPL-3.0 |
| **Repository** | https://github.com/solvespace/solvespace |
| **Status** | Stable, maintained |

**What it is:**
- Full parametric CAD application (not just a kernel)
- NURBS-based geometry
- Built-in constraint solver
- 2D sketch + 3D modeling
- ~80K lines of C++

**Limitations:**
- Booleans are basic
- Limited freeform modeling
- Not designed as a library (it's an application)
- Single developer's vision (elegant but specific)

**Why it matters:** SolveSpace proves one person can build a functional CAD system. But it's a complete application, not a reusable kernel. You can learn from it, but you can't easily extract just the geometry engine.

---

## AI-Driven Attempts

### vcad (Cam Pedersen)

**A BRep kernel built with AI (Claude) assistance in approximately 12 hours.**

| Attribute | Value |
|-----------|-------|
| **Language** | Rust |
| **Started** | December 2025 |
| **Developer** | Cam Pedersen (ecto) |
| **AI Used** | Claude (Anthropic) |
| **License** | MIT |
| **Repository** | https://github.com/ecto/vcad |
| **Status** | Experimental, rapidly evolving |

**The Story:**

Cam Pedersen released vcad, a mesh-based CAD tool using Manifold for CSG. Hacker News commenters criticized it for not being "real" BRep CAD. In response, he built a BRep kernel overnight, working with Claude.

**From his blog post:**
> "By midnight: BRep kernel. By this morning, manifold was gone. Ripped out. Deleted. The dependency that sparked all those comments? Gone."

**The result (12 crates):**

```
vcad-kernel-math      → vectors, transforms, tolerances
vcad-kernel-topo      → half-edge: vertices, edges, faces, shells, solids
vcad-kernel-geom      → lines, planes, cylinders, NURBS surfaces
vcad-kernel-primitives→ box, sphere, cylinder, cone, torus
vcad-kernel-tessellate→ triangulation for export
vcad-kernel-booleans  → surface-surface intersection, face classification
vcad-kernel-nurbs     → spline curves and surfaces
vcad-kernel-fillet    → rolling ball algorithm
vcad-kernel-sketch    → extrude, revolve, profiles
vcad-kernel-constraints→ geometric + dimensional solver
vcad-kernel-shell     → shell, pattern, draft operations
vcad-kernel-wasm      → browser runtime
```

**Claims (unverified):**
- Full BRep topology (half-edge)
- NURBS curves and surfaces
- Boolean operations
- Filleting via rolling ball
- Constraint solver
- WASM support

**Why this is significant:**

1. **Speed**: What traditionally takes years was done in hours
2. **AI-assisted**: Claude handled algorithm implementation
3. **Modern stack**: Rust, WASM-native, clean architecture
4. **Provocative**: Challenges assumptions about development timelines

**Caveats:**

| Concern | Status |
|---------|--------|
| Robustness tested? | Unknown |
| Edge cases handled? | Unknown |
| Production-ready? | Almost certainly not |
| Algorithms correct? | Unverified |
| Performance? | Early optimization work done |

**Later optimization (from blog):**
> "The full optimization work happened across a few sessions, all with Claude. Transform fusion, FxHash, WASM profiling setup, the BilinearSurface insight, a tessellation caching fix in the boolean pipeline."

**What this means for labrep:** vcad demonstrates that AI can dramatically accelerate BRep kernel development. But it also raises questions about correctness and robustness that only time and testing will answer.

---

## Related Projects

### CADmium (Discontinued)

**An attempt to build a full CAD application using Truck.**

| Attribute | Value |
|-----------|-------|
| **Created by** | Matt Ferraro |
| **Stack** | Svelte + Three.js + Truck (Rust/WASM) |
| **Status** | Discontinued (2024) |
| **Blog post** | mattferraro.dev/posts/cadmium |

**What they tried:**
- Browser-based parametric CAD
- Using Truck as the geometry kernel
- Local-first architecture
- Modern web tech stack

**Why it failed:**
- Team couldn't sustain the effort
- Truck wasn't complete enough for their needs
- The scope was too large for a small team

**Lessons from the writeup:**

The CADmium blog post is excellent reading. It covers:
- What a CAD application needs (2D solver, BRep kernel, history tracker, UI, file format)
- Why OCCT is "the Pontiac Aztek of BRep kernels"
- Why Truck is "the Rivian R3" (promising, modern, not finished)
- The case for local-first browser-based CAD

**Quote:**
> "All popular b-rep kernels are old and written in C++. If you consult the official build instructions for OpenCascade, you see this screenshot... which looks like it was taken on Windows 2000?"

---

### SDF-Based Alternatives

These aren't BRep kernels, but they're worth mentioning as alternative approaches.

**libfive**

| Attribute | Value |
|-----------|-------|
| **Approach** | Signed Distance Functions |
| **Language** | C++ with Scheme scripting |
| **Creator** | Matt Keeter |
| **Strength** | Fast boolean ops, elegant math |
| **Weakness** | Not exact geometry, no STEP export |

SDF represents shapes as functions f(x,y,z) where f<0 is inside. Booleans become trivial: union is min(f1, f2), intersection is max(f1, f2).

**ImplicitCAD**

| Attribute | Value |
|-----------|-------|
| **Approach** | SDF + CSG |
| **Language** | Haskell |
| **Strength** | Elegant functional design |
| **Weakness** | Niche language, not exact geometry |

**Why SDF isn't BRep:**
- No exact curves or surfaces
- Can't do edge-based operations (fillets)
- Can't export to STEP/IGES
- Manufacturing workflows require BRep

---

### Bindings and Wrappers

These don't replace OCCT — they make it more usable.

**opencascade-rs**
- Rust bindings to OCCT via cxx.rs
- Lets you use OCCT from Rust
- Still depends on full OCCT build

**pythonOCC**
- Python bindings via SWIG
- Used by CadQuery and Build123d
- Most popular way to use OCCT from Python

**CadQuery / Build123d**
- High-level Python APIs on top of OCCT
- Much nicer than raw OCCT
- But still OCCT underneath

---

## Comparison Matrix

```
┌──────────────┬─────────┬───────────┬──────────┬──────────┬───────────┐
│ Project      │ Years   │ Language  │ NURBS    │ Booleans │ Status    │
├──────────────┼─────────┼───────────┼──────────┼──────────┼───────────┤
│ OpenCASCADE  │ 30+     │ C++       │ ✓        │ ✓        │ Production│
│ Truck        │ 4+      │ Rust      │ ✓        │ ✓        │ Active    │
│ Fornjot      │ 4+      │ Rust      │ ✗        │ Partial  │ Slow      │
│ vcad         │ <1      │ Rust      │ Claimed  │ Claimed  │ Unproven  │
│ SolveSpace   │ 15+     │ C++       │ ✓        │ Limited  │ Stable    │
│ libfive      │ 7+      │ C++       │ N/A      │ ✓ (SDF)  │ Stable    │
└──────────────┴─────────┴───────────┴──────────┴──────────┴───────────┘

┌──────────────┬──────────┬──────────┬──────────┬───────────────────────┐
│ Project      │ Fillets  │ STEP I/O │ WASM     │ AI-Assisted?          │
├──────────────┼──────────┼──────────┼──────────┼───────────────────────┤
│ OpenCASCADE  │ ✓        │ ✓        │ Painful  │ ✗                     │
│ Truck        │ ✗        │ ✓        │ ✓        │ ✗                     │
│ Fornjot      │ ✗        │ ✗        │ ✓        │ ✗                     │
│ vcad         │ Claimed  │ ✗        │ ✓        │ ✓ (Claude)            │
│ SolveSpace   │ Limited  │ ✗        │ ✓        │ ✗                     │
│ libfive      │ N/A      │ ✗        │ ?        │ ✗                     │
└──────────────┴──────────┴──────────┴──────────┴───────────────────────┘
```

---

## Lessons Learned

### From Traditional Efforts

1. **It takes years** — Truck (4+ years) still lacks fillets. Fornjot (4+ years) lacks NURBS. This is genuinely hard.

2. **Corporate backing helps** — Truck (RICOS Co.) has made more progress than solo efforts like Fornjot.

3. **Scope is the enemy** — CADmium tried to build kernel + app + solver. Too much for a small team.

4. **NURBS is a gate** — Without NURBS, you can't represent circles exactly. Without circles, no cylinders. Without cylinders, you're limited to boxes.

5. **Booleans are the dragon** — Everyone can build primitives. Booleans are where projects stall.

### From AI-Driven Efforts

1. **AI can compress timelines** — vcad's 12-hour kernel challenges assumptions about development speed.

2. **Unverified claims are common** — vcad claims fillets, but are they robust? Unknown.

3. **AI knows the algorithms** — LLMs have ingested computational geometry literature. They can implement known algorithms quickly.

4. **Testing is still manual** — AI can write code, but validating correctness requires extensive testing.

5. **Iteration is key** — vcad's later optimization sessions show AI-assisted development is iterative, not one-shot.

### What Works

| Approach | Evidence |
|----------|----------|
| Rust for new kernels | Truck, Fornjot, vcad all use Rust |
| WASM as a target | Every modern kernel targets browsers |
| AI for algorithm implementation | vcad's speed demonstrates feasibility |
| Small, focused scope | SolveSpace succeeds by being opinionated |

---

## Relevance to labrep

### What We Can Learn

**From Truck:**
- Modular crate structure works well
- NURBS implementation is achievable
- Boolean operations are hard but possible
- STEP I/O is valuable for interop

**From Fornjot:**
- Start with simple geometry (lines, circles)
- Focus on correctness over features
- This is a multi-year endeavor

**From vcad:**
- AI can dramatically accelerate development
- Reference existing implementations (OCCT)
- Build incrementally, claim only what's tested
- WASM-first is achievable

**From CADmium:**
- Don't try to build everything at once
- A kernel alone is hard enough
- Have clear scope boundaries

### Our Approach

labrep combines insights from all of these:

1. **Rust (via TypeScript)** — Modern language, WASM-friendly
2. **AI-assisted** — Use Claude/GPT to accelerate algorithm implementation
3. **OCCT as reference** — Read OCCT code, reimplement cleanly
4. **On-demand** — Build what we need, when we need it
5. **TDD** — Extensive testing to ensure correctness
6. **Realistic timeline** — Expect this to take significant time

### Specific Takeaways

| From | Lesson | Application |
|------|--------|-------------|
| Truck | Modular architecture | Separate packages for math, topology, geometry |
| Fornjot | Lines before NURBS | Start with linear geometry, add curves later |
| vcad | AI can implement algorithms | Use AI to translate OCCT algorithms to TypeScript |
| CADmium | Scope management | Focus on kernel, not full CAD app |
| SolveSpace | One person can build a lot | Stay focused, make progress daily |

---

## References

### Projects

- **Truck**: https://github.com/ricosjp/truck
- **Fornjot**: https://github.com/hannobraun/fornjot
- **vcad**: https://github.com/ecto/vcad
- **SolveSpace**: https://github.com/solvespace/solvespace
- **libfive**: https://github.com/libfive/libfive
- **ImplicitCAD**: https://github.com/Haskell-Things/ImplicitCAD
- **opencascade-rs**: https://github.com/bschwind/opencascade-rs

### Blog Posts

- **CADmium**: https://mattferraro.dev/posts/cadmium
- **vcad BRep Kernel**: https://campedersen.com/brep-kernel
- **vcad Overview**: https://campedersen.com/vcad

### Discussions

- **Truck on Hacker News**: https://news.ycombinator.com/item?id=35071317
- **CADmium on Hackaday**: https://hackaday.com/2024/05/23/cadmium-moves-cad-to-the-browser/
- **Fornjot v0.49.0 on Reddit**: https://www.reddit.com/r/rust/comments/1bk71a6/

### OpenCASCADE

- **Official site**: https://www.opencascade.com
- **GitHub**: https://github.com/Open-Cascade-SAS/OCCT
- **Documentation**: https://dev.opencascade.org/doc/overview/html/
