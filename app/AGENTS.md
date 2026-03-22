# AGENTS.md — app/

Instructions for AI agents building the viewer application.

---

## The Prime Directive

**TEST FIRST. ALWAYS.**

Same as `generation/` — write tests before implementation.

## Stack Details

### Next.js + Vite

We use Next.js with Vite for fast development:

```bash
npm create next-app@latest . -- --typescript --tailwind --app
```

### Three.js Integration

Use `@react-three/fiber` for React integration:

```typescript
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

function Viewer() {
  return (
    <Canvas>
      <OrbitControls />
      <ambientLight />
      <mesh>
        <boxGeometry />
        <meshStandardMaterial />
      </mesh>
    </Canvas>
  );
}
```

### Editor

Use Monaco Editor (VS Code's editor):

```typescript
import Editor from '@monaco-editor/react';

function CodeEditor({ value, onChange }) {
  return (
    <Editor
      language="typescript"
      value={value}
      onChange={onChange}
    />
  );
}
```

## Component Structure

Each major component gets its own folder:

```
components/
├── Editor/
│   ├── Editor.tsx
│   ├── Editor.test.tsx
│   ├── useEditor.ts        # Hook for editor state
│   └── index.ts            # Re-export
├── Viewer/
│   ├── Viewer.tsx
│   ├── Viewer.test.tsx
│   ├── useViewer.ts
│   └── index.ts
└── LibraryBrowser/
    ├── LibraryBrowser.tsx
    ├── LibraryBrowser.test.tsx
    └── index.ts
```

## Testing

Use Vitest + React Testing Library:

```typescript
import { render, screen } from '@testing-library/react';
import { Editor } from './Editor';

describe('Editor', () => {
  it('renders the code editor', () => {
    render(<Editor value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
```

## Example Coverage Principle

**Every exported function should be demonstrated in at least one example.**

Examples are not just object showcases — they should show functions in action. When building or updating examples:

1. **Audit the API surface** — Check which exported functions from `generation/` are not yet visualized
2. **Group related functions** — It's fine to demonstrate multiple functions in one example (e.g., `tangentCircle2D` and `intersectLine2DCircle2D` can both appear in the Circle2D example)
3. **Show inputs and outputs visually** — If a function takes a curve and returns a point, show both the curve and the resulting point
4. **Use animation to show variation** — Animate parameters to show how outputs change (e.g., tangent vector rotating as parameter sweeps around a circle)
5. **Update the code snippet** — The editor code should reference all demonstrated functions so users can see the API usage

---

## Integration with labrep

The app imports from `generation/`:

```typescript
import { BRepSolid, primitives } from '../../generation/src';

const box = primitives.makeBox(10, 20, 30);
```

## Layout

The main layout is a split view:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]  labrep viewer                      [Settings] [Export] │
├───────────────────────────────┬─────────────────────────────────┤
│                               │                                 │
│                               │                                 │
│         Editor                │          Viewer                 │
│    (Monaco Editor)            │       (Three.js)                │
│                               │                                 │
│                               │                                 │
├───────────────────────────────┴─────────────────────────────────┤
│  Library Browser (collapsible)                                  │
│  [Examples] [API Reference] [OCCT Reference]                    │
└─────────────────────────────────────────────────────────────────┘
```

## Styling

Use Tailwind CSS for styling:

```tsx
<div className="flex h-screen">
  <div className="w-1/2 border-r">
    <Editor />
  </div>
  <div className="w-1/2">
    <Viewer />
  </div>
</div>
```
