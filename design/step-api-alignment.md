# Design: STEP/API Alignment

> Ensuring our internal API maps cleanly to STEP file format — avoiding import/export impedance mismatch.

---

## Problem

STEP (ISO 10303) is the universal exchange format for CAD. If our internal data structures don't map cleanly to STEP entities, we face:

1. **Lossy import** — Can't represent what STEP contains
2. **Lossy export** — Our data doesn't fit STEP's model
3. **Complex conversion** — Translation layer with edge cases
4. **Maintenance burden** — Two parallel representations to maintain

**Goal:** Design our API so import/export is a direct mapping, not a translation.

---

## STEP Entity → labrep Type Mapping

### Foundation Types

| STEP Entity | STEP Attributes | labrep Type | labrep Fields |
|-------------|-----------------|-------------|---------------|
| `CARTESIAN_POINT` | `(name, coords)` | `Point3D` | `x, y, z` |
| `DIRECTION` | `(name, ratios)` | `Vector3D` | `x, y, z` (normalized) |
| `VECTOR` | `(name, direction, magnitude)` | `Vector3D` | `x, y, z` (scaled) |

**Notes:**
- STEP `DIRECTION` is always unit length; we normalize on import
- STEP `VECTOR` is direction + magnitude; we multiply out

### Coordinate Systems

| STEP Entity | STEP Attributes | labrep Type | labrep Fields |
|-------------|-----------------|-------------|---------------|
| `AXIS1_PLACEMENT` | `(name, location, axis)` | `Axis` | `origin, direction` |
| `AXIS2_PLACEMENT_3D` | `(name, location, axis, ref_direction)` | `Plane` | `origin, normal, xAxis` |

**Design decision:** Our `Plane` stores `origin`, `normal`, and `xAxis`. The yAxis is computed (cross product). This matches STEP's `AXIS2_PLACEMENT_3D`.

### Curves

| STEP Entity | labrep Type | Notes |
|-------------|-------------|-------|
| `LINE` | `Line3D` | origin + direction |
| `CIRCLE` | `Circle3D` | plane + radius |
| `ELLIPSE` | `Ellipse3D` | plane + major/minor radii |
| `B_SPLINE_CURVE` | (future) | NURBS |
| `TRIMMED_CURVE` | `TrimmedCurve` | curve + parameter bounds |

**Design decision:** Curves are unbounded by default. Edges reference curves with parameter bounds.

### Surfaces

| STEP Entity | labrep Type | Notes |
|-------------|-------------|-------|
| `PLANE` | `PlaneSurface` | references a `Plane` |
| `CYLINDRICAL_SURFACE` | `CylindricalSurface` | axis + radius |
| `CONICAL_SURFACE` | `ConicalSurface` | axis + angle |
| `SPHERICAL_SURFACE` | `SphericalSurface` | center + radius |
| `TOROIDAL_SURFACE` | `ToroidalSurface` | axis + major/minor radii |
| `B_SPLINE_SURFACE` | (future) | NURBS |

**Design decision:** Surfaces are unbounded. Faces reference surfaces with trim boundaries (wire loops).

### Topology

| STEP Entity | labrep Type | Key Correspondence |
|-------------|-------------|-------------------|
| `VERTEX_POINT` | `Vertex` | wraps `Point3D` |
| `EDGE_CURVE` | `Edge` | vertices + curve + parameter range |
| `ORIENTED_EDGE` | `OrientedEdge` | edge + direction boolean |
| `EDGE_LOOP` | `Loop` | ordered list of oriented edges |
| `FACE_BOUND` | (part of `Face`) | outer/inner loop designation |
| `ADVANCED_FACE` | `Face` | surface + loops + orientation |
| `CLOSED_SHELL` | `Shell` | closed set of faces |
| `OPEN_SHELL` | `Shell` | open set of faces |
| `MANIFOLD_SOLID_BREP` | `Solid` | outer shell (+ inner voids) |

---

## Proposed Type Definitions

Based on STEP alignment:

```typescript
// ═══════════════════════════════════════════════════════════════
// GEOMETRY (unbounded mathematical entities)
// ═══════════════════════════════════════════════════════════════

interface Curve3D {
  evaluate(t: number): Point3D;
  derivative(t: number): Vector3D;
}

interface Line3D extends Curve3D {
  origin: Point3D;
  direction: Vector3D;
}

interface Circle3D extends Curve3D {
  plane: Plane;      // Center is plane.origin
  radius: number;
}

interface Surface {
  evaluate(u: number, v: number): Point3D;
  normal(u: number, v: number): Vector3D;
}

interface PlaneSurface extends Surface {
  plane: Plane;
}

interface CylindricalSurface extends Surface {
  axis: Axis;
  radius: number;
}

// ═══════════════════════════════════════════════════════════════
// TOPOLOGY (bounded, connected entities)
// ═══════════════════════════════════════════════════════════════

interface Vertex {
  point: Point3D;
  tolerance: number;
}

interface Edge {
  curve: Curve3D;
  startVertex: Vertex;
  endVertex: Vertex;
  startParam: number;    // Curve parameter at start
  endParam: number;      // Curve parameter at end
  tolerance: number;
}

interface OrientedEdge {
  edge: Edge;
  forward: boolean;      // Same direction as edge curve?
}

interface Loop {
  edges: OrientedEdge[]; // Ordered, connected sequence
}

interface Face {
  surface: Surface;
  outerLoop: Loop;       // Outer boundary
  innerLoops: Loop[];    // Holes
  forward: boolean;      // Surface normal matches face normal?
  tolerance: number;
}

interface Shell {
  faces: Face[];
  closed: boolean;
}

interface Solid {
  outerShell: Shell;
  voids: Shell[];        // Inner cavities (for BREP_WITH_VOIDS)
}
```

---

## Import Pseudocode

```typescript
function importStep(content: string): Solid[] {
  // 1. Parse STEP text into entity map
  const entities: Map<number, StepEntity> = parseStepText(content);
  
  // 2. Build geometry bottom-up
  const points = new Map<number, Point3D>();
  const directions = new Map<number, Vector3D>();
  const vertices = new Map<number, Vertex>();
  const curves = new Map<number, Curve3D>();
  const surfaces = new Map<number, Surface>();
  const edges = new Map<number, Edge>();
  const loops = new Map<number, Loop>();
  const faces = new Map<number, Face>();
  const shells = new Map<number, Shell>();
  const solids: Solid[] = [];

  // 3. Process in dependency order
  for (const [id, entity] of entities) {
    switch (entity.type) {
      case 'CARTESIAN_POINT':
        points.set(id, new Point3D(
          entity.coords[0],
          entity.coords[1],
          entity.coords[2]
        ));
        break;
        
      case 'DIRECTION':
        directions.set(id, Vector3D.normalize({
          x: entity.ratios[0],
          y: entity.ratios[1],
          z: entity.ratios[2]
        }));
        break;
        
      case 'VERTEX_POINT':
        vertices.set(id, {
          point: points.get(entity.pointRef)!,
          tolerance: DEFAULT_TOLERANCE
        });
        break;
        
      case 'LINE':
        curves.set(id, {
          type: 'line',
          origin: points.get(entity.pointRef)!,
          direction: directions.get(entity.dirRef)!
        });
        break;
        
      case 'EDGE_CURVE':
        edges.set(id, {
          curve: curves.get(entity.curveRef)!,
          startVertex: vertices.get(entity.startRef)!,
          endVertex: vertices.get(entity.endRef)!,
          startParam: 0,  // Computed from vertex positions
          endParam: 1,
          tolerance: DEFAULT_TOLERANCE
        });
        break;
        
      // ... continue for loops, faces, shells, solids
    }
  }
  
  return solids;
}
```

---

## Export Pseudocode

```typescript
function exportStep(solid: Solid): string {
  let nextId = 1;
  const entities: string[] = [];
  const idMap = new Map<object, number>();
  
  // Helper to get or create entity ID
  function getId(obj: object): number {
    if (!idMap.has(obj)) {
      idMap.set(obj, nextId++);
    }
    return idMap.get(obj)!;
  }
  
  // 1. Collect all unique entities
  const allVertices = collectVertices(solid);
  const allEdges = collectEdges(solid);
  const allFaces = solid.outerShell.faces;
  
  // 2. Write points
  for (const vertex of allVertices) {
    const pointId = getId(vertex.point);
    entities.push(
      `#${pointId} = CARTESIAN_POINT('', (${vertex.point.x}, ${vertex.point.y}, ${vertex.point.z}));`
    );
    
    const vertexId = getId(vertex);
    entities.push(
      `#${vertexId} = VERTEX_POINT('', #${pointId});`
    );
  }
  
  // 3. Write curves and edges
  for (const edge of allEdges) {
    const curveId = writeCurve(edge.curve);
    const edgeId = getId(edge);
    entities.push(
      `#${edgeId} = EDGE_CURVE('', #${getId(edge.startVertex)}, #${getId(edge.endVertex)}, #${curveId}, .T.);`
    );
  }
  
  // 4. Write surfaces, faces, shell, solid
  // ...
  
  // 5. Format complete file
  return formatStepFile(entities);
}
```

---

## Design Decisions

### Decision 1: Geometry Separate from Topology

**Choice:** Keep them separate, like STEP does.

**Rationale:**
- `VERTEX_POINT` wraps `CARTESIAN_POINT`
- `EDGE_CURVE` references a curve and two vertices
- `ADVANCED_FACE` references a surface and boundary loops

**Implication:** Our `Vertex` contains a `Point3D`, not *is* a `Point3D`.

### Decision 2: Curves and Surfaces are Unbounded

**Choice:** Curves and surfaces extend infinitely. Edges and faces provide bounds.

**Rationale:**
- STEP `LINE` is infinite; `EDGE_CURVE` adds bounds via parameter range
- STEP `PLANE` is infinite; `ADVANCED_FACE` adds bounds via edge loops
- Allows sharing: same line used by multiple edges

**Implication:** `Edge` has `startParam` and `endParam` fields.

### Decision 3: Orientation is Explicit

**Choice:** Store orientation as a boolean flag, not by swapping data.

**Rationale:**
- STEP `ORIENTED_EDGE` has `.T.` (forward) or `.F.` (reversed)
- STEP `ADVANCED_FACE` has orientation relative to surface normal
- Avoids duplicating edges/surfaces

**Implication:** `OrientedEdge` wraps `Edge` with `forward: boolean`.

### Decision 4: Shell is Explicit

**Choice:** `Shell` is a distinct type, not just "the faces of a solid".

**Rationale:**
- STEP has `CLOSED_SHELL` and `OPEN_SHELL`
- `MANIFOLD_SOLID_BREP` references a shell
- Allows representing open surfaces (not just solids)

**Implication:** `Solid` contains `outerShell: Shell`, not `faces: Face[]`.

### Decision 5: Tolerance per Entity

**Choice:** Vertices, edges, and faces each have their own tolerance.

**Rationale:**
- STEP stores tolerances at each level
- Imported models have varying precision
- Operations can degrade precision locally

**Implication:** All topology types have a `tolerance: number` field.

---

## Validation Checklist

When adding a new type, verify:

- [ ] Does it map to a STEP entity?
- [ ] Are the fields equivalent to STEP attributes?
- [ ] Can we import from STEP without data loss?
- [ ] Can we export to STEP without data loss?
- [ ] Is the mapping documented in this file?

---

## Consequences

### For Implementation

- Topology types (`Vertex`, `Edge`, `Face`, `Shell`, `Solid`) are distinct from geometry types (`Point3D`, `Curve3D`, `Surface`)
- Orientation is a wrapper, not an intrinsic property
- Parameter ranges live on edges, not curves
- Boundary loops live on faces, not surfaces

### For API Design

```typescript
// Good: matches STEP structure
const vertex = { point: myPoint, tolerance: 1e-7 };
const edge = { curve: myLine, startVertex: v1, endVertex: v2, startParam: 0, endParam: 10 };

// Bad: conflates geometry and topology
const edge = { start: [0,0,0], end: [10,0,0] };  // Where's the curve? The vertices?
```

### For Testing

- Import a STEP file → export it → compare (round-trip test)
- Create geometry via API → export → import → compare
- Test each entity type individually

---

## References

- `background/step-format.md` — STEP file format details
- `background/brep-fundamentals.md` — BRep concepts
- `design/README.md` — Overall type definitions (update to match this)
