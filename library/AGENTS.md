# AGENTS.md — library/

Instructions for AI agents using reference materials.

---

## Purpose

This folder contains reference materials. It's primarily **read-only** — you reference it, you don't modify it (except for adding papers/docs).

## Using OpenCASCADE

### Finding Relevant Code

When implementing a feature, find the corresponding OCCT code:

```bash
# Example: find boolean union implementation
grep -r "BRepAlgoAPI_Fuse" library/opencascade/src/
```

### Reading OCCT Code

OCCT conventions:
- `.hxx` — header files (declarations)
- `.cxx` — implementation files
- Class names use CamelCase: `BRepBuilderAPI_MakeVertex`
- Handle types: `Handle(Geom_Curve)` is a smart pointer to `Geom_Curve`

### Citing OCCT

When your implementation is based on OCCT, cite it:

```typescript
/**
 * Computes the intersection of two surfaces.
 * 
 * Algorithm based on OCCT's GeomInt_IntSS.
 * See: library/opencascade/src/GeomInt/GeomInt_IntSS.cxx
 */
```

### What NOT to Do

- ❌ Copy-paste C++ code and "translate" to TypeScript
- ❌ Modify anything in `opencascade/` (it's a submodule)
- ❌ Hotlink to OCCT code in documentation (use local paths)

Instead:
- ✅ Understand the algorithm from the code
- ✅ Reimplement cleanly in TypeScript
- ✅ Cite the source file in comments

## Adding Papers

When you find a useful paper:

1. Download the PDF to `papers/`
2. Create a summary markdown file with the same name
3. Include: citation, abstract, key takeaways, relevance to labrep

Example:
```
papers/
├── smith-2022-ssi-algorithms.pdf
└── smith-2022-ssi-algorithms.md
```

## Adding Docs

For external documentation that might disappear:

1. Save a local copy to `docs/`
2. Note the source URL and date retrieved
3. Keep the original formatting if possible
