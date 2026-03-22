# AGENTS.md — library/tools/

Instructions for AI agents creating tools to work with library code.

---

## Purpose

Tools here help us work with the OpenCASCADE reference code:
- Find relevant source files for an algorithm
- Extract and understand implementations
- Map class hierarchies
- Generate summaries for background docs

## Tool Guidelines

### Keep Tools Focused

Each tool should do one thing well:
- `find-class.sh` — locate a class definition
- `extract-method.ts` — pull out a specific method
- `map-inheritance.ts` — show class hierarchy

Don't build monolithic "do everything" tools.

### Output Formats

Prefer structured output:
- JSON for programmatic use
- Markdown for documentation
- Plain text for simple queries

### OCCT Navigation Patterns

The OCCT source is organized as:
```
library/opencascade/src/
├── FoundationClasses/
│   ├── TKernel/       # Core utilities
│   └── TKMath/        # Math (gp, Bnd, etc.)
├── ModelingData/
│   ├── TKG2d/         # 2D geometry
│   ├── TKG3d/         # 3D geometry (Geom)
│   └── TKBRep/        # Topology (TopoDS, BRep)
├── ModelingAlgorithms/
│   ├── TKGeomAlgo/    # Geometry algorithms
│   ├── TKTopAlgo/     # Topology algorithms
│   └── TKBO/          # Boolean operations
└── ...
```

### Common Search Patterns

**Find a class:**
```bash
find library/opencascade/src -name "ClassName.hxx"
```

**Find implementations:**
```bash
grep -r "MethodName" library/opencascade/src --include="*.cxx"
```

**Count lines in a package:**
```bash
wc -l library/opencascade/src/*/TKPackage/PackageName/*.cxx
```

### Tool Naming

- Shell scripts: `kebab-case.sh`
- TypeScript: `kebab-case.ts`
- Prefix with action: `find-`, `extract-`, `map-`, `summarize-`

### Documentation

Every tool needs:
1. One-line description at top
2. Usage example
3. Sample output

```typescript
/**
 * find-class.ts — Locate an OCCT class definition
 * 
 * Usage: npx ts-node library/tools/find-class.ts <ClassName>
 * 
 * Example:
 *   npx ts-node library/tools/find-class.ts BRep_TVertex
 *   # Output: library/opencascade/src/ModelingData/TKBRep/BRep/BRep_TVertex.hxx
 */
```

## What NOT to Build

- Tools that modify OCCT source (it's a submodule, read-only)
- Complex parsers (C++ is hard to parse; keep it simple)
- Anything that duplicates `grep` or `find` without adding value
