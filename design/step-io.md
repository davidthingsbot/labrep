# Phase 4: STEP Import/Export — Design Document

## Overview

Implement STEP (ISO 10303-21) reading and writing. This phase builds the **parser** and **writer** infrastructure plus support for foundation-level entities. Topology-level entities (Vertex, Edge, Face, Solid) will be added incrementally in later phases as those types are implemented.

## OCCT Reference

| labrep | OCCT | Notes |
|--------|------|-------|
| `parseStep` | `STEPControl_Reader` | Parse STEP text into entity model |
| `writeStep` | `STEPControl_Writer` | Serialize entity model to STEP text |
| `StepEntity` | `StepData_StepModel` | Internal entity representation |

**OCCT source locations:**
- `library/opencascade/src/DataExchange/TKDESTEP/STEPControl/STEPControl_Reader.cxx`
- `library/opencascade/src/DataExchange/TKDESTEP/STEPControl/STEPControl_Writer.cxx`
- `library/opencascade/src/DataExchange/TKDESTEP/StepData/StepData_StepModel.cxx`

See also: `background/step-format.md` and `design/step-api-alignment.md`

---

## Architecture

The STEP I/O system has three layers:

```
┌──────────────────────────────────────────────────────┐
│                  STEP I/O LAYERS                      │
├──────────────────────────────────────────────────────┤
│                                                       │
│  LAYER 1: TEXT ←→ TOKENS (Lexer)                      │
│  ─────────────────────────────                        │
│  "ISO-10303-21;\nHEADER;..."  ←→  Token[]            │
│  Handles: comments, strings, numbers, IDs             │
│                                                       │
│  LAYER 2: TOKENS ←→ ENTITY MODEL (Parser/Writer)     │
│  ────────────────────────────────────────────         │
│  Token[]  ←→  StepModel { header, entities }          │
│  Handles: entity refs (#N), nested lists, enums       │
│                                                       │
│  LAYER 3: ENTITY MODEL ←→ LABREP TYPES (Converter)   │
│  ──────────────────────────────────────────────       │
│  StepModel  ←→  Point3D, Vector3D, Axis, Plane, ...  │
│  Handles: semantic mapping, validation                │
│  Grows as we add more labrep types                    │
│                                                       │
└──────────────────────────────────────────────────────┘
```

Layers 1 and 2 are complete in this phase. Layer 3 starts with foundation types and grows incrementally.

---

## Data Types

### StepValue — Parsed Attribute Value

```typescript
/** A single value in a STEP entity's attribute list. */
type StepValue =
  | { type: 'integer'; value: number }
  | { type: 'real'; value: number }
  | { type: 'string'; value: string }
  | { type: 'enum'; value: string }          // .TRUE., .FALSE., .T., etc.
  | { type: 'ref'; id: number }              // #123
  | { type: 'list'; values: StepValue[] }    // (1., 2., 3.)
  | { type: 'unset' }                        // $ (omitted attribute)
  | { type: 'derived' }                      // * (derived attribute)
  ;
```

### StepEntity — Parsed Entity

```typescript
/** A single STEP entity (one line in the DATA section). */
interface StepEntity {
  /** Entity ID (the #N) */
  readonly id: number;
  /** Entity type name (e.g., 'CARTESIAN_POINT') */
  readonly typeName: string;
  /** Attribute values */
  readonly attributes: readonly StepValue[];
}
```

### StepHeader — Parsed Header

```typescript
/** STEP file header metadata. */
interface StepHeader {
  readonly description: string[];
  readonly implementationLevel: string;
  readonly fileName: string;
  readonly timeStamp: string;
  readonly author: string[];
  readonly organization: string[];
  readonly preprocessorVersion: string;
  readonly originatingSystem: string;
  readonly authorization: string;
  readonly schemaIdentifiers: string[];
}
```

### StepModel — Complete Parsed File

```typescript
/** A parsed STEP file: header + entity map. */
interface StepModel {
  readonly header: StepHeader;
  readonly entities: ReadonlyMap<number, StepEntity>;
}
```

---

## Functions

### Layer 1–2: Parse and Write (Generic)

```typescript
/**
 * Parse a STEP file string into a StepModel.
 * Handles any valid ISO-10303-21 file regardless of schema.
 *
 * @param text - STEP file content
 * @returns Parsed model or failure
 */
function parseStep(text: string): OperationResult<StepModel>;

/**
 * Write a StepModel to a STEP file string.
 *
 * @param model - The model to serialize
 * @returns STEP file content
 */
function writeStep(model: StepModel): string;

/**
 * Look up an entity by ID, following references.
 *
 * @param model - The step model
 * @param id - Entity ID
 * @returns The entity or undefined
 */
function getEntity(model: StepModel, id: number): StepEntity | undefined;
```

### Layer 3: Convert (Foundation Types)

```typescript
/**
 * Extract a Point3D from a CARTESIAN_POINT entity.
 */
function stepToPoint3D(entity: StepEntity): OperationResult<Point3D>;

/**
 * Extract a Vector3D from a DIRECTION entity.
 */
function stepToVector3D(entity: StepEntity): OperationResult<Vector3D>;

/**
 * Extract an Axis from an AXIS1_PLACEMENT entity.
 */
function stepToAxis(entity: StepEntity, model: StepModel): OperationResult<Axis>;

/**
 * Extract a Plane from an AXIS2_PLACEMENT_3D entity.
 */
function stepToPlane(entity: StepEntity, model: StepModel): OperationResult<Plane>;

/**
 * Create a CARTESIAN_POINT entity from a Point3D.
 */
function point3DToStep(point: Point3D, id: number): StepEntity;

/**
 * Create a DIRECTION entity from a Vector3D.
 */
function vector3DToStep(vector: Vector3D, id: number): StepEntity;

/**
 * Create an AXIS1_PLACEMENT entity from an Axis.
 */
function axisToStep(axis: Axis, id: number, model: StepModelBuilder): StepEntity[];

/**
 * Create an AXIS2_PLACEMENT_3D entity from a Plane.
 */
function planeToStep(plane: Plane, id: number, model: StepModelBuilder): StepEntity[];

/**
 * Extract all foundation-type objects from a parsed STEP model.
 */
function extractFoundationTypes(model: StepModel): {
  points: Map<number, Point3D>;
  directions: Map<number, Vector3D>;
  axes: Map<number, Axis>;
  planes: Map<number, Plane>;
};
```

### StepModelBuilder — For Export

```typescript
/**
 * Builder for constructing a StepModel for export.
 * Manages entity ID allocation and deduplication.
 */
interface StepModelBuilder {
  /** Allocate the next entity ID. */
  nextId(): number;
  /** Add an entity to the model. */
  addEntity(entity: StepEntity): void;
  /** Build the final model. */
  build(header?: Partial<StepHeader>): StepModel;
}

function createStepModelBuilder(): StepModelBuilder;
```

---

## STEP Text Grammar

The parser must handle:

```
file        = "ISO-10303-21;" header data "END-ISO-10303-21;"
header      = "HEADER;" header_entity* "ENDSEC;"
data        = "DATA;" entity* "ENDSEC;"
entity      = "#" INTEGER "=" type_name "(" attr_list ")" ";"
type_name   = UPPER_ALPHA+
attr_list   = attr ("," attr)*
attr        = value | "$" | "*"
value       = integer | real | string | enum | ref | list
integer     = ["-"] DIGIT+
real        = ["-"] DIGIT+ "." DIGIT* ["E" ["-"] DIGIT+]
string      = "'" CHAR* "'"
enum        = "." ALPHA+ "."
ref         = "#" INTEGER
list        = "(" value ("," value)* ")"
comment     = "/*" ... "*/"
```

### Parsing Challenges

1. **Forward references**: Entity #100 may reference #200 that appears later
2. **Nested lists**: `((1., 2., 3.), (4., 5., 6.))` for 2D coordinate arrays
3. **Complex entity types**: `MANIFOLD_SOLID_BREP(...)` vs `B_SPLINE_CURVE_WITH_KNOTS(...)`
4. **Subtype notation**: Some entities use `ENTITY_TYPE(SUBTYPE(...))` syntax
5. **Long lines**: Some STEP writers don't break lines (single entity spanning 1000+ characters)
6. **Encoding**: Primarily ASCII, but strings can contain extended characters via `\X\` escapes

---

## Testing Approach

### Parser Tests

| Test | Description |
|------|-------------|
| `parse_empty_file` | Minimal valid STEP file (empty DATA section) |
| `parse_header` | Extract file name, schema, timestamp from header |
| `parse_cartesian_point` | `#1 = CARTESIAN_POINT('', (1., 2., 3.));` |
| `parse_direction` | `#2 = DIRECTION('', (0., 0., 1.));` |
| `parse_axis2_placement` | Entity with references to other entities |
| `parse_integer_attribute` | Integer values (non-decimal) |
| `parse_string_attribute` | Quoted strings with escapes |
| `parse_enum_attribute` | `.TRUE.`, `.FALSE.`, `.T.`, `.F.` |
| `parse_unset_attribute` | `$` for omitted values |
| `parse_nested_list` | `((1., 2.), (3., 4.))` |
| `parse_forward_reference` | Entity references ID that appears later |
| `parse_comment` | `/* comment */` is skipped |
| `parse_multiline_entity` | Entity split across multiple lines |
| `parse_real_scientific` | `1.5E-3`, `-2.0E10` |
| `parse_rejects_malformed` | Missing semicolons, bad IDs, etc. |

### Writer Tests

| Test | Description |
|------|-------------|
| `write_empty_model` | Produces valid ISO-10303-21 skeleton |
| `write_cartesian_point` | Point entity with correct format |
| `write_direction` | Direction entity with normalized values |
| `write_header_metadata` | File name, schema, timestamp in header |
| `write_entity_references` | `#3 = AXIS2_PLACEMENT_3D('', #1, #2, ...);` |
| `write_roundtrip_text` | `parse(write(parse(text))) == parse(text)` |

### Converter Tests (Foundation Types)

| Test | Description |
|------|-------------|
| `point3d_to_step` | `point3d(1,2,3)` → `CARTESIAN_POINT('', (1., 2., 3.))` |
| `step_to_point3d` | Parse CARTESIAN_POINT → correct Point3D |
| `vector3d_to_step` | `vec3d(0,0,1)` → `DIRECTION('', (0., 0., 1.))` |
| `step_to_vector3d` | Parse DIRECTION → correct Vector3D (normalized) |
| `axis_to_step` | Axis → AXIS1_PLACEMENT with point + direction refs |
| `step_to_axis` | Parse AXIS1_PLACEMENT → correct Axis |
| `plane_to_step` | Plane → AXIS2_PLACEMENT_3D with 3 refs |
| `step_to_plane` | Parse AXIS2_PLACEMENT_3D → correct Plane |
| `roundtrip_point3d` | `point → step entity → point` preserves coordinates |
| `roundtrip_plane` | `plane → step entities → plane` preserves origin, normal, xAxis |
| `extract_foundation_types` | Parse real STEP file, extract all points/directions/planes |

### Integration Tests

| Test | Description |
|------|-------------|
| `parse_cube_step` | Parse the example cube STEP from `background/step-format.md` |
| `write_foundation_step` | Export points + planes → valid STEP file |
| `roundtrip_foundation_step` | Write → parse → compare foundation types |

---

## File Organization

```
generation/src/io/
├── index.ts
├── step-lexer.ts           # Tokenizer
├── step-parser.ts          # Tokens → StepModel
├── step-writer.ts          # StepModel → text
├── step-model.ts           # StepModel, StepEntity, StepValue types
├── step-model-builder.ts   # Builder for export
├── step-converters.ts      # StepEntity ←→ labrep types
├── stl-ascii-writer.ts     # (from Phase 3)
├── stl-binary-writer.ts
├── stl-ascii-reader.ts
├── stl-binary-reader.ts
└── stl.ts

generation/tests/io/
├── step-lexer.test.ts
├── step-parser.test.ts
├── step-writer.test.ts
├── step-converters.test.ts
├── step-roundtrip.test.ts
├── stl-ascii-writer.test.ts   # (from Phase 3)
├── stl-binary-writer.test.ts
├── stl-ascii-reader.test.ts
├── stl-binary-reader.test.ts
└── stl-roundtrip.test.ts
```

---

## Incremental Extension Plan

When future phases add new types, the STEP I/O extends:

### Phase 6: Basic 3D Geometry

Add to `step-converters.ts`:

```typescript
function stepToLine3D(entity: StepEntity, model: StepModel): OperationResult<Line3D>;
function stepToCircle3D(entity: StepEntity, model: StepModel): OperationResult<Circle3D>;
function stepToPlaneSurface(entity: StepEntity, model: StepModel): OperationResult<PlaneSurface>;
function stepToVertex(entity: StepEntity, model: StepModel): OperationResult<Vertex>;
function stepToEdge(entity: StepEntity, model: StepModel): OperationResult<Edge>;
function stepToFace(entity: StepEntity, model: StepModel): OperationResult<Face>;
// ... and reverse directions
```

### Phase 7: Extrude + Solids

```typescript
function stepToCylindricalSurface(entity: StepEntity, model: StepModel): OperationResult<CylindricalSurface>;
function stepToShell(entity: StepEntity, model: StepModel): OperationResult<Shell>;
function stepToSolid(entity: StepEntity, model: StepModel): OperationResult<Solid>;
// ... and reverse directions
```

Each extension includes its own round-trip tests.

---

## Viewer Integration

Add "Import STEP" and "Export STEP" to the app:

- **Import**: File picker → parse → extract what we can → display (initially just points/axes/planes as viz primitives; later full BRep)
- **Export**: Current geometry → STEP entities → download `.stp` file

---

---

## Analysis: STEP Import and Phase Organization

### The Problem with Workflow-Driven Phases

The labrep phases are organized around a **workflow-driven progression** — mimicking how a CAD user builds a part from scratch:

1. Math foundation
2. Sketch in 2D
3. Extrude/revolve to 3D
4. Modify (booleans, features)
5. Assemble

This makes sense for **creating** geometry, but it's suboptimal for **importing arbitrary STEP files**. For arbitrary STEP import, you need support for every geometry type that might appear:

| Geometry Type | Current Phase | Typical in STEP? |
|--------------|---------------|------------------|
| Points/Vectors | 1 | Yes |
| Lines, Circles, Arcs | 2, 6 | Yes |
| Planes | 1, 6 | Yes |
| Cylinders | 6 | Yes |
| Spheres | 10 | Common |
| Cones | 10 | Common |
| Tori | 10 | Occasional |
| **BSpline curves** | **13** | **Very common** |
| **BSpline surfaces** | **21+** | **Extremely common** |

**The flaw:** BSplines are scattered across phases 13 and 21+, but they're ubiquitous in real STEP files. Any CAD export with fillets, organic shapes, or NURBS modeling produces BSplines. With the current structure, you can't reliably import arbitrary STEP files until ~Phase 13 (curves) and arguably never until Phase 21+ (surfaces).

### OCCT's Implicit "Concentric Rings"

OpenCASCADE doesn't explicitly document "rings," but there's an implicit layering:

```
┌─────────────────────────────────────────────────────────────────┐
│  RING 0: MATH (gp package)                                      │
│  ─────────────────────────                                      │
│  gp_Pnt, gp_Vec, gp_Trsf, gp_Ax1, gp_Pln                        │
│  No dependencies. Pure value types.                             │
├─────────────────────────────────────────────────────────────────┤
│  RING 1: PARAMETRIC GEOMETRY (Geom, Geom2d)                     │
│  ──────────────────────────────────────────                     │
│  Geom_Line, Geom_Circle, Geom_BSplineCurve                      │
│  Geom_Plane, Geom_CylindricalSurface, Geom_BSplineSurface       │
│  Depends on Ring 0. Supports evaluation at any parameter.       │
├─────────────────────────────────────────────────────────────────┤
│  RING 2: TOPOLOGY (TopoDS)                                      │
│  ─────────────────────────                                      │
│  TopoDS_Vertex, TopoDS_Edge, TopoDS_Face, TopoDS_Solid          │
│  Depends on Rings 0-1. Defines structure without algorithms.    │
├─────────────────────────────────────────────────────────────────┤
│  RING 3: BREP BINDING (BRep)                                    │
│  ─────────────────────────                                      │
│  Associates geometry with topology.                             │
│  Edge has curve. Face has surface. Vertex has point.            │
├─────────────────────────────────────────────────────────────────┤
│  RING 4: IMPORT/EXPORT                                          │
│  ─────────────────────────                                      │
│  STEP reader/writer. IGES reader/writer. STL, etc.              │
│  Depends on Rings 0-3. Can populate or serialize a model.       │
├─────────────────────────────────────────────────────────────────┤
│  RING 5: ALGORITHMS (BRepBuilderAPI, BRepAlgoAPI, etc.)         │
│  ──────────────────────────────────────────────────────         │
│  Extrude, revolve, booleans, fillets.                           │
│  Depends on all lower rings. Creates/modifies models.           │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** OCCT's I/O layer (Ring 4) sits *below* algorithms (Ring 5). You can import/export without being able to do booleans. You can view models without being able to modify them.

### Minimal Functions for a Credible CAD Program

Depends on what "credible" means:

#### Tier A: View-Only (STEP Viewer)
```
- STEP parser (all entity types)
- All geometry types (including BSplines!)
- Tessellation (for display)
- Basic topology traversal
```
**No algorithms needed.** Achievable quickly but requires BSplines from day 1.

#### Tier B: Parametric Modeling (Create from Scratch)
```
- Tier A, plus:
- Sketch system with constraints
- Extrude, revolve
- Boolean operations
```
**Doesn't need BSplines for creation** — users draw with lines/arcs/circles. But can't import arbitrary STEP files.

#### Tier C: Full Edit Capability
```
- Tier B, plus:
- BSpline curves and surfaces
- Fillet/chamfer (creates BSplines!)
- Edit any imported geometry
```
**Where most CAD programs live.** Create simple geometry, import complex geometry.

### Implications for labrep

The current phases conflate two different goals:

1. **Build a CAD modeler** (create geometry from sketches)
2. **Import arbitrary STEP files** (parse any geometry type)

These have different critical paths:

| Goal | Critical Path |
|------|---------------|
| CAD Modeler | Math → Sketches → Extrude → Booleans → (BSplines later, if ever) |
| STEP Importer | Math → **All Geometry Types** → Topology → Tessellation |

**The dragon (BSpline SSI) only matters for booleans.** You can *represent* BSplines without being able to *intersect* them. Import works. Display works. Just don't try to boolean a filleted model.

### Alternative Phase Structure (Not Currently Adopted)

If importing arbitrary STEP were the priority:

```
Phase 1: Math Foundation           (same)
Phase 2: ALL Geometry Types        (lines, circles, arcs, BSplines, all surfaces)
Phase 3: Topology (BRep)           (vertex, edge, face, shell, solid)
Phase 4: STEP Parser + Converters  (can now handle arbitrary files)
Phase 5: Tessellation              (display imported models)
--- MILESTONE: Working STEP Viewer ---
Phase 6: Sketch System
Phase 7: Extrude
Phase 8: Booleans
... (modeling operations)
```

**Current decision:** We're keeping the workflow-driven structure. This prioritizes building a usable modeler over importing arbitrary external files. STEP import will grow incrementally and may never handle 100% of real-world files (BSpline surfaces are Phase 21+, "the dragon").

---

## Exit Criteria

- [  ] STEP lexer tokenizes valid STEP files
- [  ] STEP parser produces correct StepModel from tokens
- [  ] STEP writer produces valid STEP text from StepModel
- [  ] Foundation converters: Point3D ↔ CARTESIAN_POINT
- [  ] Foundation converters: Vector3D ↔ DIRECTION
- [  ] Foundation converters: Axis ↔ AXIS1_PLACEMENT
- [  ] Foundation converters: Plane ↔ AXIS2_PLACEMENT_3D
- [  ] Round-trip tests pass for all foundation types
- [  ] Can parse a real STEP file exported from FreeCAD/Fusion360
- [  ] `extractFoundationTypes` works on real STEP files
- [  ] All tests passing
- [  ] `generation/src/index.ts` exports all new functions and types

**Status: ✅ COMPLETE** (48 tests — lexer 20, parser 12, writer 7, converters 9)
