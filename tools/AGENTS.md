# AGENTS.md — tools/

Instructions for AI agents creating project-wide tools.

---

## Python Environment

**This directory uses `uv` for Python environment management.**

- `pyproject.toml` — declares dependencies
- `uv.lock` — pins exact versions (committed to git)
- `.python-version` — pins Python 3.12
- `.venv/` — local virtual environment (gitignored)

### Running Python tools and tests

```bash
cd tools/
uv run python check-ascii-boxes.py <file.md>    # run a tool
uv run python test_check_ascii_boxes.py -v       # run tests
```

`uv run` handles the venv automatically. If dependencies are missing, run `uv sync` first.

### Adding Python dependencies

1. Add to `[project.dependencies]` (runtime) or `[dependency-groups] dev` (dev-only) in `pyproject.toml`
2. Run `uv sync` to update `uv.lock`
3. Commit both `pyproject.toml` and `uv.lock`

### Installing uv (if not present)

```bash
# Ubuntu/Debian
sudo apt install -y pipx && pipx install uv

# macOS
brew install uv

# Or via pip (if system allows)
pip install uv
```

---

## Purpose

Tools here support labrep development across all subprojects:
- Build automation
- Test runners
- Code generators
- Development utilities

**Not for:** Tools specific to OCCT reference code (those go in `library/tools/`).

## Guidelines

### Keep Tools Simple

Prefer small, composable tools over monolithic scripts.

### Exit Codes

Scripts should return proper exit codes:
- `0` — success
- `1` — failure
- Use `set -e` in bash scripts

### Documentation

Every tool should document its purpose and usage at the top of the file.

### Naming Conventions

- Python: `kebab-case.py`
- Shell scripts: `kebab-case.sh`
- Tests: `test_<tool-name>.py`
- Use descriptive action verbs: `build-`, `test-`, `generate-`, `check-`
