# AGENTS.md — tools/

Instructions for AI agents creating project-wide tools.

---

## Purpose

Tools here support labrep development across all subprojects:
- Build automation
- Test runners
- Code generators
- Development utilities

**Not for:** Tools specific to OCCT reference code (those go in `library/tools/`).

## Tool Categories

### Build Tools
- Compile TypeScript
- Bundle for distribution
- Generate type declarations

### Test Tools
- Run test suites
- Coverage reports
- Benchmark comparisons

### Code Generation
- Generate boilerplate from templates
- Scaffold new modules
- Create test stubs

### Development Helpers
- Linting and formatting
- Dependency checks
- Documentation generation

## Guidelines

### Keep Tools Simple

Prefer small, composable tools over monolithic scripts:
```bash
# Good: focused tools
./tools/lint.sh
./tools/test.sh
./tools/build.sh

# Avoid: do-everything scripts
./tools/do-all-the-things.sh
```

### Use Standard Tooling

Leverage existing tools where possible:
- `vitest` for testing
- `eslint` + `prettier` for linting/formatting
- `tsc` for TypeScript compilation
- `esbuild` or `rollup` for bundling

### Exit Codes

Scripts should return proper exit codes:
- `0` — success
- `1` — failure
- Use `set -e` in bash scripts

### Documentation

Every tool needs at the top:
```bash
#!/usr/bin/env bash
# tool-name.sh — One-line description
#
# Usage: ./tools/tool-name.sh [options]
#
# Options:
#   --verbose    Show detailed output
#   --help       Show this help
```

Or for TypeScript:
```typescript
/**
 * tool-name.ts — One-line description
 * 
 * Usage: npx ts-node tools/tool-name.ts [options]
 */
```

## Naming Conventions

- Shell scripts: `kebab-case.sh`
- TypeScript: `kebab-case.ts`
- Use descriptive action verbs: `build-`, `test-`, `generate-`, `check-`

## Integration with package.json

Register commonly-used tools as npm scripts:
```json
{
  "scripts": {
    "build": "./tools/build.sh",
    "test": "./tools/test.sh",
    "lint": "./tools/lint.sh"
  }
}
```
