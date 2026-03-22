# App

Interactive viewer application for labrep.

---

## Overview

A web application with:
- **Editor** — Code editing panel for writing BRep definitions
- **Viewer** — Three.js 3D viewport for visualizing results
- **Library Browser** — Browse examples and library reference

## Stack

- **Next.js** — React framework
- **Vite** — Build tool (via Next.js)
- **React** — UI components
- **Three.js** — 3D rendering
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

🚧 **In development** — Core viewer and examples working.

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
│   │   ├── Editor/           # Code editor panel
│   │   ├── Viewer/           # Three.js 3D viewport
│   │   └── LibraryBrowser/   # Browse examples/library
│   ├── hooks/                # React hooks
│   ├── lib/                  # Utilities, labrep integration
│   └── pages/                # Next.js pages
├── tests/                    # Component tests
├── public/                   # Static assets
└── package.json
```

## Design Goals

1. **Similar to OpenSCAD** — Familiar workflow for CAD users
2. **Real-time preview** — See changes as you type
3. **Library integration** — Easy access to examples and docs
4. **Export** — STL, STEP (when supported)
