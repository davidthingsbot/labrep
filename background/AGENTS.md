# AGENTS.md — background/

Instructions for AI agents writing documentation in this folder.

---

## Purpose

This folder contains research documentation. Your job is to capture knowledge about BRep concepts, algorithms, and OCCT architecture in a way that helps future development.

## Document Requirements

### Required Sections

Every document MUST have:

1. **Title + One-liner** — `# Topic` followed by `> Why this matters to labrep`

2. **Table of Contents** — Clickable links to all sections

3. **Overview** — 2-3 paragraphs introducing the topic for someone unfamiliar

4. **Content Sections** — The meat of the document

5. **Relevance to labrep** — Detailed discussion of:
   - How this topic applies to our implementation
   - What we should build based on this knowledge
   - Tradeoffs and decisions to make
   - Specific OCCT classes/files to reference

6. **References** — Hyperlinks to:
   - Official documentation
   - Academic papers
   - Blog posts and tutorials
   - Relevant OCCT source files

### Formatting

- **ASCII diagrams** — Use box-drawing characters for diagrams:
  ```
  ┌─────────┐     ┌─────────┐
  │  Input  │────►│ Output  │
  └─────────┘     └─────────┘
  ```

- **Images** — Save to `images/<topic-name>/` and reference as:
  ```markdown
  ![Description](./images/topic-name/image.png)
  ```

- **Code blocks** — Use fenced blocks with language tags:
  ```typescript
  // TypeScript example
  ```
  ```cpp
  // OCCT C++ reference
  ```

- **Tables** — Use markdown tables for comparisons

### Quality Checklist

Before considering a document complete:

- [ ] Title + one-liner present
- [ ] Table of contents with working links
- [ ] Overview explains topic to newcomers
- [ ] At least one ASCII diagram
- [ ] Relevance to labrep section is substantive (not perfunctory)
- [ ] References section has real links
- [ ] Added to README.md index
- [ ] Images folder created (even if empty)

## Content Guidelines

### Be Concrete

❌ "BRep is important for CAD"
✅ "BRep stores a cube as 6 faces, 12 edges, 8 vertices, with each face knowing its bounding edges and surface equation"

### Show Don't Tell

Include:
- Specific data structure definitions
- Algorithm pseudocode
- Example inputs and outputs
- OCCT class names and file paths

### Cite OCCT Specifically

When referencing OCCT:
```markdown
OCCT implements this in `BRepAlgoAPI_Fuse` 
(see `library/opencascade/src/BRepAlgoAPI/BRepAlgoAPI_Fuse.cxx`).
```

### Acknowledge Complexity

Don't gloss over hard parts. If something is difficult (like SSI), explain why and what makes it hard.

## Updating the Index

After creating or significantly updating a document, update `README.md`:

1. Add/update the entry in the Document Index table
2. Set appropriate status: 🚧 Stub, 📝 Draft, ✅ Complete

## Images from the Internet

When adding images from external sources:

1. Download the image (don't hotlink)
2. Save to `images/<topic-name>/`
3. Note the source URL in the References section
4. Use descriptive filenames: `topology-hierarchy.png` not `image1.png`
