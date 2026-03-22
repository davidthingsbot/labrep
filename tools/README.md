# Tools

Project-wide tools and utilities for labrep development.

---

## Purpose

This folder contains tools that apply across the entire labrep project:
- Build and test automation
- Code generation utilities
- Development helpers
- CI/CD scripts

For tools specific to working with OpenCASCADE reference code, see `library/tools/`.

## Tool Index

| Tool | Purpose | Status |
|------|---------|--------|
| (none yet) | | |

## Usage

Tools should be runnable from the repository root:

```bash
# TypeScript tools
npx ts-node tools/<tool-name>.ts [args]

# Shell scripts
./tools/<tool-name>.sh [args]

# npm scripts (if registered in package.json)
npm run <tool-name>
```

## Adding a Tool

1. Create the tool in this folder
2. Add executable permission if shell script: `chmod +x tools/<name>.sh`
3. Update this README's tool index
4. Document usage and examples in the tool itself
