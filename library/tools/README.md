# Library Tools

Tools for working with reference code in the library.

---

## Purpose

This folder contains scripts and utilities for:
- Navigating the OpenCASCADE source code
- Extracting algorithm implementations
- Analyzing class hierarchies and dependencies
- Generating documentation from OCCT code

## Tool Index

| Tool | Purpose | Status |
|------|---------|--------|
| (none yet) | | |

## Usage

Tools should be runnable from the repository root:

```bash
# Example pattern
npx ts-node library/tools/<tool-name>.ts [args]
```

Or if shell scripts:

```bash
./library/tools/<tool-name>.sh [args]
```

## Adding a Tool

1. Create the tool in this folder
2. Add a brief description at the top of the file
3. Update this README's tool index
4. Document usage and examples
