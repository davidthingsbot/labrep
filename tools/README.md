# Tools

Project-wide tools and utilities for labrep development.

---

## Python Environment Setup

Tools use **uv** for Python environment management. This gives us reproducible,
portable environments that work the same everywhere.

### Prerequisites

Install `uv` (one time):

```bash
# Option 1: via pipx (recommended on Ubuntu/Debian)
sudo apt install -y pipx
pipx install uv

# Option 2: via pip (if your system allows it)
pip install uv

# Option 3: via Homebrew (macOS)
brew install uv
```

### First-time setup

From the `tools/` directory:

```bash
cd tools/
uv sync          # creates .venv, installs all dependencies
```

That's it. The `.python-version` file pins Python 3.12, `pyproject.toml`
declares dependencies, and `uv.lock` pins exact versions for reproducibility.

### Running tools and tests

```bash
# Run a Python tool
uv run python check-ascii-boxes.py <file.md>

# Run tests
uv run python test_check_ascii_boxes.py -v
```

`uv run` automatically uses the project's virtual environment. If the venv
doesn't exist yet, `uv run` will create it and install dependencies first.

---

## Purpose

This folder contains tools that apply across the entire labrep project:
- Build and test automation
- Code generation utilities
- Development helpers
- CI/CD scripts

For tools specific to working with OpenCASCADE reference code, see `library/tools/`.

## Tool Index

| Tool | Purpose |
|------|---------|
| `check-ascii-boxes.py` | Check ASCII box-drawing alignment in markdown files |
| `test_check_ascii_boxes.py` | Test suite for the box checker (97 tests) |

## Adding a Tool

1. Create the tool in this folder
2. Add any new Python dependencies to `pyproject.toml` and run `uv sync`
3. Update this README's tool index
4. Document usage and examples in the tool itself
