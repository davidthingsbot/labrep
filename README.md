# labrep

> An experimental, on-demand BRep (Boundary Representation) geometry library built with AI assistance, using OpenCASCADE as a reference.

## What This Is

**labrep** is a research project exploring whether a modern BRep geometry kernel can be built incrementally — implementing features as needed, with AI assistance, while referencing OpenCASCADE's battle-tested implementation.

The goal is not to replace OpenCASCADE. The goal is to understand BRep deeply by building it piece by piece, in TypeScript, with modern tooling and clean architecture.

## Why

The open-source CAD landscape has a problem: OpenCASCADE is the only serious BRep kernel, but it's 3.6 million lines of C++ with decades of legacy. Alternatives either wrap OCCT or remain incomplete after years of effort.

We're testing a hypothesis: **AI can compress the timeline for building complex geometric software** by helping translate algorithms from reference implementations, iterate on failing tests, and explore the design space faster than traditional development.

## Structure

```
labrep/
├── background/      # Research notes, topic documentation
├── design/          # Architecture, API design, phase docs
├── library/         # Reference materials (OCCT submodule, papers, docs)
├── generation/      # Our TypeScript implementation (TDD)
├── examples/        # Usage examples
└── app/             # Viewer application (Next.js + React + Three.js)
```

| Folder | Purpose |
|--------|---------|
| `background/` | Deep dives into BRep concepts, algorithms, OCCT architecture |
| `design/` | Architecture decisions, API design, phase implementation docs |
| `library/` | OpenCASCADE source (submodule), academic papers, external docs |
| `generation/` | The actual TypeScript code we're building — tests first |
| `examples/` | Working examples demonstrating library features |
| `app/` | Interactive viewer with editor, 3D viewport, and library browser |

## Approach

1. **On-demand development** — Build what we need, when we need it
2. **OCCT as oracle** — When stuck, study how OCCT solves it, then reimplement cleanly
3. **Test-driven** — Write tests first, then implementation
4. **AI-assisted** — Use AI to read OCCT code, explain algorithms, iterate on solutions
5. **Document everything** — Background docs capture learnings for future reference

## Status

### Completed

| Phase | Name | Highlights |
|-------|------|------------|
| 1 | Math Foundation | Point2D/3D, Vector2D/3D, Transform3D, Axis, Plane, BoundingBox |
| 2 | 2D Curves | Line2D, Circle2D, Arc2D, Intersections, Wire2D |
| 3 | STL Import/Export | ASCII/binary writer + reader, round-trip tested |
| 4 | STEP Import/Export | Lexer, parser, writer, model builder, foundation converters |
| 5 | Sketch System | Sketch management, profile detection, region finding |
| 6 | 3D Geometry + Topology | Line3D, Circle3D, Arc3D, surfaces, full BRep topology, STEP converters |
| 7 | Constraint Solver | Geometric + dimensional constraints, Newton-Raphson solver, parametric design |
| 8 | Extrude + STEP | extrude, extrudeSymmetric, extrudeWithHoles, solid volume |
| 9 | Revolve + STEP | revolve, revolvePartial, revolution/spherical/conical/toroidal surfaces |
| 10 | Sketch on Face | getPlaneFromFace, sketch on any planar face |
| 11 | Boolean Operations + STEP | Union, subtract, intersect with exact volumes (planar solids) |
| 12 | Solid Tessellation | solidToMesh for all surface types, ear clipping, analytic normals |
| 13 | PCurve + Curved Booleans | Box−sphere, box−cylinder (through-hole), L-bracket−sphere with exact volumes |

### Upcoming

| Phase | Name |
|-------|------|
| 14 | Command Interface |
| 15 | Assemblies + STEP |
| 16 | External STEP Import |
| 17+ | Fillet/Chamfer, Mass Properties, Patterns, Mirror, Shell, Loft, Sweep, BSpline |

See [`design/README.md`](design/README.md) for full phase breakdown and design docs.

## Getting Started

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/davidthingsbot/labrep.git

# Or if already cloned
git submodule update --init --recursive
```

See individual folder READMEs for specific instructions.

## License

MIT
