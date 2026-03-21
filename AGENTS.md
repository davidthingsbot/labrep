# AGENTS.md — labrep

Instructions for AI agents working on this project.

---

## Project Overview

**labrep** is an experimental BRep geometry library in TypeScript, built on-demand with AI assistance, using OpenCASCADE as a reference implementation.

## Core Principles

### 1. Test-Driven Development (TDD)

**This is non-negotiable.** In `generation/` and `app/`:

1. Write the test first
2. Run it — confirm it fails
3. Write the minimum code to pass
4. Refactor if needed
5. Repeat

Never write implementation code without a failing test.

### 2. OCCT as Reference, Not Copy

OpenCASCADE (in `library/opencascade/`) is our oracle:

- **Read it** to understand algorithms
- **Study it** when stuck on a problem
- **Reimplement** cleanly in TypeScript — do not port C++ directly
- **Cite it** in comments when an algorithm comes from OCCT

OCCT is LGPL. We can read and reimplement. We cannot copy-paste.

### 3. Document As You Go

When you learn something:

- Add it to the relevant `background/` doc
- If no doc exists, create one following the template
- Include ASCII diagrams, images where helpful
- Always explain relevance to labrep

### 4. Every Folder Has README.md + AGENTS.md

- `README.md` — for humans (what's here, how to use it)
- `AGENTS.md` — for agents (how to work here, standards, constraints)

---

## Folder-Specific Instructions

### background/

Research and topic documentation. See `background/AGENTS.md` for document structure requirements.

Key points:
- Every doc has: ToC, overview, relevance statement, detailed content, project relevance section, references
- Images go in `background/images/<topic-name>/`
- README.md is an index of all docs

### library/

Reference materials. Mostly read-only.

- `opencascade/` is a git submodule — don't modify
- `papers/` contains PDFs + summary markdown files
- `docs/` contains external documentation snapshots

When referencing OCCT code, cite the file path:
```typescript
// Algorithm from OCCT: src/IntCurveSurface/IntCurveSurface_Inter.cxx
```

### generation/

Our TypeScript implementation. See `generation/AGENTS.md` for coding standards.

Key points:
- TDD mandatory
- `src/` for source, `tests/` for tests
- Version attempts in subfolders if needed (v1/, v2/)
- Start simple, add complexity incrementally

### examples/

Working examples demonstrating features. See `examples/AGENTS.md`.

Each example:
- Self-contained
- Has its own README explaining what it demonstrates
- Imports from `generation/`

### app/

The viewer application. See `app/AGENTS.md`.

Stack: Next.js + Vite + React + Three.js

Components:
- Editor — code editing panel
- Viewer — Three.js 3D viewport
- LibraryBrowser — browse examples and library

---

## Code Style

TypeScript with:
- Strict mode
- ESLint + Prettier
- Meaningful names (no single-letter variables except loop indices)
- Comments explaining "why", not "what"
- JSDoc for public APIs

---

## Git Workflow

- Commit frequently with descriptive messages
- Push to `main` (no branches needed for now)
- Include [WIP] prefix for work-in-progress commits

---

## When Stuck

1. Check if there's a relevant `background/` doc
2. Look at how OCCT handles it (in `library/opencascade/`)
3. Search for academic papers on the algorithm
4. Document what you learn, even if you don't solve it yet
