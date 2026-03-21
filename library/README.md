# Library

Reference materials for labrep development.

---

## Contents

| Folder | Contents |
|--------|----------|
| `opencascade/` | OpenCASCADE source code (git submodule) |
| `papers/` | Academic papers on BRep, NURBS, SSI, etc. |
| `docs/` | External documentation snapshots |

## OpenCASCADE Submodule

The `opencascade/` folder is a git submodule pointing to the official OCCT repository.

### Setup

```bash
# If you cloned without --recurse-submodules
git submodule update --init --recursive
```

### Navigating OCCT

Key directories in `opencascade/src/`:

| Package | Purpose |
|---------|---------|
| `gp/` | Basic geometric primitives (points, vectors, transforms) |
| `Geom/` | 3D curves and surfaces |
| `Geom2d/` | 2D curves |
| `TopoDS/` | Abstract topology data structures |
| `BRep/` | BRep-specific topology with geometry |
| `BRepBuilderAPI/` | High-level shape construction |
| `BRepAlgoAPI/` | Boolean operations |
| `BRepFilletAPI/` | Filleting operations |
| `IntSurf/` | Surface intersection |

### Searching OCCT

```bash
# Find where something is implemented
grep -r "YourClassName" library/opencascade/src/

# Find header files
find library/opencascade/src -name "*.hxx" | xargs grep "SomeType"
```

## Papers

Academic papers go in `papers/`. For each PDF, create a markdown summary:

```
papers/
├── README.md
├── nurbs-book-summary.md
├── ssi-survey-2022.pdf
└── ssi-survey-2022.md
```

## Docs

External documentation that we want to preserve locally goes in `docs/`.
