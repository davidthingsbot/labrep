# 01 — Primitives

Basic primitive mesh generation using the labrep library.

## What it demonstrates

- `makeBox(width, height, depth)` — axis-aligned box centered at origin
- `makeSphere(radius, options?)` — UV sphere with configurable segments/rings
- `makeCylinder(radius, height, options?)` — Y-axis aligned cylinder with caps
- `OperationResult<Mesh>` — success/failure pattern with error messages

## Run

```bash
npx tsx examples/01-primitives/index.ts
```

## View in browser

The app viewer at `http://localhost:3000` renders `makeBox(1,1,1)` by default.
Start the dev server with `cd app && npm run dev`.
