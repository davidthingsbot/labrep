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

🚧 **Not started** — Setting up structure.

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
