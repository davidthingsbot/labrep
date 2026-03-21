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
├── library/         # Reference materials (OCCT submodule, papers, docs)
├── generation/      # Our TypeScript implementation (TDD)
├── examples/        # Usage examples
└── app/             # Viewer application (Next.js + React + Three.js)
```

| Folder | Purpose |
|--------|---------|
| `background/` | Deep dives into BRep concepts, algorithms, OCCT architecture |
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

🚧 **Early exploration** — Setting up structure, writing initial background docs.

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
