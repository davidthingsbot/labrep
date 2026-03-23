# App

Interactive viewer application for labrep.

---

## Overview

A web application with:
- **Editor** — Monaco code editor showing example API usage
- **Viewer** — Three.js 3D viewport with orbit controls and billboard text labels
- **Library Browser** — Resizable bottom panel with three tabs:
  - **Examples** — 17 interactive examples covering all library functions
  - **API Reference** — Browsable documentation for all exports (filterable by module)
  - **OCCT Reference** — (coming soon)

## Stack

- **Next.js** — React framework
- **React** — UI components
- **Three.js** / **@react-three/fiber** / **@react-three/drei** — 3D rendering
- **Monaco Editor** — Code editing
- **Tailwind CSS** — Styling
- **Vitest** — Testing
- **TypeScript** — Type safety

## Design Principles

### Grayscale Interface

**All color comes from the 3D model. The interface is grayscale and muted.**

- UI elements use grays only: `gray-900` (background), `gray-800` (panels), `gray-700` (borders), `gray-400`/`gray-100` (text)
- No colored icons or emoji — use plain text labels
- Active/selected states use lighter grays, not accent colors
- The 3D viewport is the visual focus; chrome should recede

### Mobile-First Layout

- Portrait: Viewer on top, editor below
- Landscape/desktop: Side-by-side panels
- Safe area insets respected for mobile navigation bars
- Touch-friendly button sizes

### Minimalist Controls

- Toggle buttons use lowercase text labels: `play`, `pause`, `code`, `examples`
- No decorative elements
- Functionality over ornamentation

## Status

✅ **Viewer, examples, and API reference functional.**

- 29 examples covering math foundation, 2D curves, transforms, planes, bounding boxes, primitives, STL/STEP round-trip, 3D curves, topology, constraints, and extrude operations
- API reference with entries across 6 modules (core, geometry, io, mesh, primitives, sketch)
- Resizable bottom panel with drag handle
- Billboard text labels (always face camera)

## Getting Started

```bash
cd app
npm install
npm run dev     # Development server
npm run build   # Production build
npm run test    # Run tests
```

## Structure

```
app/
├── src/
│   ├── components/
│   │   ├── Editor/           # Monaco code editor panel
│   │   ├── Header/           # App header with toggles
│   │   ├── Layout/           # AppLayout (root composition)
│   │   ├── Viewer/           # Three.js viewport, SceneObjects, ExampleRenderer
│   │   └── LibraryBrowser/   # Tabs: Examples, API Reference, OCCT Reference
│   ├── data/                 # Static API reference data
│   ├── examples/             # 17 interactive example components + registry
│   ├── hooks/                # useAnimationLoop, useResizeHandle
│   ├── lib/                  # mesh-to-three conversion utility
│   └── app/                  # Next.js app router (layout, page, globals.css)
├── public/                   # Static assets
└── package.json
```

## Design Goals

1. **Similar to OpenSCAD** — Familiar workflow for CAD users
2. **Real-time preview** — See changes as you type
3. **Library integration** — Easy access to examples and docs
4. **Export** — STL and STEP I/O demonstrated in examples
