# App Examples & Animation System — Design Document

## Overview

The viewer app needs a selectable example system and a continuous animation loop that examples can use for motion.

## Purpose

1. **Example Selection** — Each feature group gets its own example, selectable from the UI
2. **Animation Loop** — A continuous 10-second rotation (0 to 2π) that examples can use for looping animations

This mirrors the hypergraph demo app pattern: fine-grained, isolated examples that demonstrate specific functionality.

---

## Design

### Example Registry

Each example is a React component with metadata:

```typescript
interface Example {
  id: string;           // e.g., "primitives-box"
  name: string;         // e.g., "Box Primitive"
  description: string;  // e.g., "Unit box centered at origin"
  component: React.ComponentType<ExampleProps>;
}

interface ExampleProps {
  /** Animation angle in radians, 0 to 2π, loops every 10 seconds */
  animationAngle: number;
}
```

Examples are registered in a central registry:

```typescript
// src/examples/registry.ts
export const examples: Example[] = [
  { id: 'points', name: 'Points', description: 'Point3D visualization', component: PointsExample },
  { id: 'vectors', name: 'Vectors', description: 'Vector3D with direction arrows', component: VectorsExample },
  { id: 'lines', name: 'Lines', description: 'Line segments and edges', component: LinesExample },
  { id: 'primitives-box', name: 'Box', description: 'Box primitive', component: BoxExample },
  { id: 'primitives-sphere', name: 'Sphere', description: 'Sphere primitive', component: SphereExample },
  { id: 'primitives-cylinder', name: 'Cylinder', description: 'Cylinder primitive', component: CylinderExample },
];
```

### Animation Loop

The animation system provides a continuously updating angle:

```typescript
// src/hooks/useAnimationLoop.ts
export function useAnimationLoop(durationMs: number = 10000): number {
  // Returns angle from 0 to 2π, completing one cycle per durationMs
}
```

**Implementation:**
- Uses `useFrame` from @react-three/fiber for 60fps updates
- Calculates angle as: `(elapsedTime % (durationMs / 1000)) / (durationMs / 1000) * 2 * Math.PI`
- Loops seamlessly at 2π → 0

**Usage in examples:**
```typescript
function BoxExample({ animationAngle }: ExampleProps) {
  return (
    <mesh rotation={[0, animationAngle, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="steelblue" />
    </mesh>
  );
}
```

### UI Integration

**Example Selector** — In LibraryBrowser "Examples" tab:
- List of example names as clickable buttons
- Active example highlighted
- Clicking switches the Viewer to that example

**State Flow:**
```
LibraryBrowser → (selectedExampleId) → AppLayout → Viewer → ExampleRenderer
```

### Component Structure

```
src/
├── examples/
│   ├── registry.ts           # Example registry
│   ├── types.ts              # ExampleProps, Example interface
│   ├── PointsExample.tsx
│   ├── VectorsExample.tsx
│   ├── LinesExample.tsx
│   ├── BoxExample.tsx
│   ├── SphereExample.tsx
│   └── CylinderExample.tsx
├── hooks/
│   └── useAnimationLoop.ts   # Animation angle hook
├── components/
│   ├── Viewer/
│   │   ├── ExampleRenderer.tsx  # Renders selected example with animation
│   │   └── ...
│   └── LibraryBrowser/
│       └── ExampleSelector.tsx  # Example list UI
```

---

## Breaking Up DemoScene

Current DemoScene has 4 groups. Split into:

| Example ID | Name | Content |
|------------|------|---------|
| `points` | Points | ORIGIN, P1, P2, P3 with labels |
| `vectors` | Vectors | X, Y, Z axes + (1,1,1) vector |
| `lines` | Lines | Triangle edges + diagonal |
| `primitives-box` | Box | Box primitive |
| `primitives-sphere` | Sphere | Sphere primitive |
| `primitives-cylinder` | Cylinder | Cylinder primitive |
| `primitives-all` | All Primitives | Box + Sphere + Cylinder together |

Each example receives `animationAngle` and can choose whether to use it.

---

## Animation Examples

How examples might use the animation:

| Example | Animation Use |
|---------|---------------|
| Points | Subtle pulsing size |
| Vectors | Arrow rotation around Z |
| Lines | Color cycling or length pulsing |
| Box | Y-axis rotation |
| Sphere | Gentle wobble |
| Cylinder | Spinning on its axis |

Animation is optional — examples can ignore `animationAngle` for static display.

---

## Testing Approach

### Unit Tests

**useAnimationLoop hook:**
| Test | Description |
|------|-------------|
| `returns_zero_at_start` | Initial angle is 0 |
| `returns_2pi_at_end_of_cycle` | Angle approaches 2π at end of 10s |
| `loops_back_to_zero` | After 10s, angle resets to 0 |
| `respects_custom_duration` | Different durations work correctly |

**Example registry:**
| Test | Description |
|------|-------------|
| `exports_all_examples` | Registry contains expected examples |
| `examples_have_required_fields` | Each example has id, name, description, component |
| `example_ids_are_unique` | No duplicate IDs |

**ExampleRenderer:**
| Test | Description |
|------|-------------|
| `renders_selected_example` | Given ID, renders correct component |
| `passes_animation_angle` | animationAngle prop passed to example |
| `handles_unknown_id` | Graceful fallback for invalid ID |

**ExampleSelector:**
| Test | Description |
|------|-------------|
| `lists_all_examples` | All registered examples appear |
| `highlights_active_example` | Selected example visually distinct |
| `calls_onSelect_on_click` | Clicking example triggers callback |

### Integration Tests

| Test | Description |
|------|-------------|
| `example_selection_changes_viewer` | Clicking example in browser updates viewer |
| `animation_runs_continuously` | Angle updates over time in running app |

---

## Future Extensions

- **Animation controls** — Play/pause/speed controls
- **Per-example animation duration** — Some examples might want faster/slower loops
- **Animation presets** — Rotation, pulse, orbit, etc.
- **Example categories** — Group examples by topic in the selector
