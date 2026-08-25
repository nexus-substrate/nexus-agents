# Documentation Operations Specification

**Version:** 1.1.0
**Created:** 2026-02-01
**Updated:** 2026-04-19
**Status:** Canonical
**Governance:** This document defines the canonical DocOps pipeline. Changes require Documentation Management skill update.

---

## Overview

This specification defines the **single canonical documentation pipeline** for nexus-agents. All documentation work MUST follow this pipeline.

---

## Canonical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CANONICAL SOURCES                             │
│  docs/         Root (README.md, CLAUDE.md, etc.)                │
│  docs/README.md (human-readable canonical index)                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GENERATION LAYER                              │
│  generate-repo-index.ts → Capabilities (docs/reference/)         │
│  inject-governance.ts → CLAUDE.md tool index                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VALIDATION LAYER                              │
│  docs-check.yml (9 CI jobs)                                     │
│  - typedoc-check: API docs drift                                │
│  - repo-index: Capabilities freshness                           │
│  - link-check: URL validation                                   │
│  - docs-coverage: PR documentation updates                      │
│  - secrets-scan: Secrets in generated docs                      │
│  - docops-skill-sync: Pipeline → Skill sync                     │
│  - canonical-index: All docs indexed                            │
│  - markdown-lint: Markdown style consistency                    │
│  - spell-check: Documentation spelling (warning)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Canonical Source Locations

### Primary Index

| File             | Purpose                        | Maintenance |
| ---------------- | ------------------------------ | ----------- |
| `docs/README.md` | Human-readable canonical index | Manual      |

**Rule:** All documentation MUST be indexed in `docs/README.md` to be valid.

### Canonical Documentation

| Location                | Content              |
| ----------------------- | -------------------- |
| `docs/architecture/`    | System design        |
| `docs/development/`     | Contributor guides   |
| `docs/research/`        | Research tracking    |
| `docs/guides/`          | How-to guides        |
| `docs/getting-started/` | Installation, config |
| Root level              | README, QUICK_START  |

### Internal-Only Documentation

| Location           | Content                       | Reason              |
| ------------------ | ----------------------------- | ------------------- |
| `docs/adr/`        | Architecture Decision Records | Internal decisions  |
| `docs/interfaces/` | Interface specifications      | Internal reference  |
| `docs/ops/`        | Operations documentation      | Internal operations |

---

## Generation Scripts

### generate-docs.ts (Removed in #1619)

> **Note:** `generate-docs.ts` and the `docs/llms.txt` / `docs/llms-full.txt` outputs were removed
> in PR #1619. The `llms-txt-check` CI job was also removed at that time.

### generate-repo-index.ts (Source → Capabilities)

```bash
# Usage
npx tsx scripts/generate-repo-index.ts       # Generate index
npx tsx scripts/generate-repo-index.ts --check # CI validation
```

**Outputs:**

- `artifacts/repo-index.json` - Machine-readable
- `docs/reference/capabilities.md` - Human-readable

### inject-governance.ts (MCP Tools → CLAUDE.md)

```bash
# Usage
npx tsx scripts/inject-governance.ts inject  # Update CLAUDE.md
npx tsx scripts/inject-governance.ts check   # CI validation
```

**Injected sections:**

- `<!-- GOVERNANCE:TOOL_INDEX:START/END -->` - MCP tool table
- `<!-- GOVERNANCE:VERSION:START/END -->` - Governance version

---

## CI Validation Jobs

### docs-check.yml (9 Jobs)

| Job                 | Purpose                    | Blocking     | Trigger  |
| ------------------- | -------------------------- | ------------ | -------- |
| `typedoc-check`     | API docs drift detection   | Yes          | Push, PR |
| `repo-index`        | Capabilities freshness     | Yes          | Push, PR |
| `link-check`        | URL validation             | Yes          | Push, PR |
| `docs-coverage`     | PR documentation updates   | No (warning) | PR only  |
| `secrets-scan`      | Secrets in generated docs  | Yes          | Push, PR |
| `docops-skill-sync` | Pipeline → Skill sync      | Yes          | PR only  |
| `canonical-index`   | All docs in README.md      | Yes          | Push, PR |
| `markdown-lint`     | Markdown style consistency | Yes          | Push, PR |
| `spell-check`       | Documentation spelling     | No (warning) | Push, PR |

### link-check.yml (Standalone)

- **Trigger:** Weekly (Sunday midnight UTC), manual
- **Scope:** All markdown files

---

## Enforcement Rules

### Rule 1: Canonical Index Required

All documentation MUST be indexed in `docs/README.md`.

**Enforcement:** Manual review + PR checklist

### Rule 2: No Parallel Indexes

`docs/README.md` is the ONLY permitted documentation index.

**Enforcement:** Fitness audit dimension `canonicalPaths`

### Rule 3: Generated Files Must Match Source

- `docs/reference/capabilities.md` must match source code

**Enforcement:** CI `--check` modes

### Rule 4: DocOps Changes Require Skill Update

Changes to ANY of these files require updating the Documentation Management skill:

- `scripts/generate-repo-index.ts`
- `scripts/inject-governance.ts`
- `.github/workflows/docs-check.yml`
- `docs/ops/docops-spec.md`

**Enforcement:** CI gate (see docops-manifest.json)

---

## Manifest (For CI Enforcement)

The following files constitute the DocOps pipeline. Changes to these files trigger the DocOps skill update gate:

```json
{
  "version": "1.0.0",
  "pipeline_files": [
    "scripts/generate-repo-index.ts",
    "scripts/inject-governance.ts",
    ".github/workflows/docs-check.yml",
    ".github/workflows/link-check.yml",
    "docs/ops/docops-spec.md"
  ],
  "skill_file": "skills/documentation-management/SKILL.md",
  "checksum_location": "docs/ops/docops-manifest.json"
}
```

---

## Quick Reference

### "I want to update documentation content"

1. Edit canonical source in `docs/` or root
2. Commit and push

### "I want to add a new document"

1. Create file in appropriate `docs/` directory
2. Add entry to `docs/README.md` (required)
3. Run `npx tsx scripts/generate-repo-index.ts` if capabilities changed
4. Commit and push

### "I want to change the doc pipeline"

1. Make changes to pipeline scripts/config
2. Update this spec (`docs/ops/docops-spec.md`)
3. Update the Documentation Management skill
4. Update `docs/ops/docops-manifest.json` if file list changed
5. Commit and push

### "I want to verify the pipeline is healthy"

```bash
# Run all checks locally
npx tsx scripts/generate-repo-index.ts --check
npx tsx scripts/inject-governance.ts check
```

---

## Related Documents

- **Documentation Management Skill:** `skills/documentation-management/SKILL.md`
- **Documentation Index:** `docs/README.md`
- **Inventory:** `docs/ops/docs-inventory.md`
