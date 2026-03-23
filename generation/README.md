# Generation

Our TypeScript BRep implementation.

---

## Approach

**Test-Driven Development** — Every feature starts with a failing test.

**Incremental** — Build what we need, when we need it. Start simple.

**On-Demand** — When stuck, reference OCCT, understand the algorithm, reimplement cleanly.

**JSDoc on everything** — Every exported function, interface, type, and constant
must have a JSDoc comment with `@param` and `@returns` tags. This is mandatory,
not optional. It powers IDE tooltips and future API documentation.

## Structure

```
generation/
├── src/           # Source code
│   ├── core/      # Basic types (Point, Vector, Transform)
│   ├── geometry/  # Curves and surfaces
│   ├── topology/  # BRep data structures
│   └── operations/# Boolean ops, fillets, etc.
├── tests/         # Test files (mirror src/ structure)
└── package.json
```

## Status

✅ **Phase 1: Math Foundation** — Complete
- `src/core/`: Point2D/3D, Vector2D/3D, Transform3D, Axis, Plane, BoundingBox, Tolerance

✅ **Phase 2: 2D Curves** — Complete
- `src/geometry/`: Line2D, Circle2D, Arc2D, Intersections, Wire2D

✅ **Primitives** — Complete
- `src/primitives/`: makeBox, makeSphere, makeCylinder

✅ **Phase 3: STL I/O** — Complete
- `src/io/`: ASCII/binary STL writer, ASCII/binary STL reader, auto-detect, round-trip tested

✅ **Phase 4: STEP I/O Foundation** — Complete
- `src/io/`: STEP lexer, parser, writer, model builder, foundation converters (Point3D ↔ CARTESIAN_POINT, Vector3D ↔ DIRECTION, Axis ↔ AXIS1_PLACEMENT, Plane ↔ AXIS2_PLACEMENT_3D)

✅ **Phase 5: Sketch System** — Complete
- `src/sketch/`: Sketch management, Profile2D (area, containsPoint), region detection (planar graph cycle finding with T-junction splitting)

✅ **Phase 6: Basic 3D Geometry + STEP Topology** — Complete
- `src/geometry/`: Line3D, Circle3D, Arc3D
- `src/surfaces/`: PlaneSurface, CylindricalSurface, ExtrusionSurface
- `src/topology/`: Vertex, Edge, Wire, Face, Shell, Solid
- `src/io/`: STEP converters for 3D curves, surfaces, and topology

✅ **Phase 7: Constraint Solver** — Complete
- `src/constraints/`: Types, equations, Jacobian, Newton-Raphson solver, parameter expressions, analysis
- `src/sketch/`: Constrained sketch management

✅ **Phase 8: Extrude + STEP** — Complete
- `src/operations/`: extrude, extrudeSymmetric, extrudeWithHoles, solidVolume

**872 tests (869 passed, 3 skipped)**

## Getting Started

```bash
cd generation
npm install
npm test        # Run tests
npm run build   # Build library
```

## Development Workflow

1. **Write test** in `tests/` for the feature you want
2. **Run test** — confirm it fails
3. **Write code** in `src/` to make it pass
4. **Refactor** if needed
5. **Commit** with descriptive message

## Versioning

If we need to try a different approach:
- Create a `v2/` folder
- Keep `v1/` for reference
- Update this README to indicate which is active
