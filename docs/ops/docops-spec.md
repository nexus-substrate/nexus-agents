# Documentation Operations Specification

**Version:** 1.0.0
**Created:** 2026-02-01
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
│  docs/INDEX.yaml (machine-parseable index)                      │
│  docs/README.md (human-readable canonical index)                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GENERATION LAYER                              │
│  sync-docs.ts → Website content (website/src/content/docs/)     │
│  generate-docs.ts → LLM context (docs/llms.txt, llms-full.txt)  │
│  generate-repo-index.ts → Capabilities (docs/reference/)         │
│  inject-governance.ts → CLAUDE.md tool index                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VALIDATION LAYER                              │
│  docs-check.yml (10 CI jobs)                                    │
│  - typedoc-check: API docs drift                                │
│  - llms-txt-check: Generated context freshness                  │
│  - website-sync: Canonical → Website sync                       │
│  - repo-index: Capabilities freshness                           │
│  - link-check: URL validation                                   │
│  - docs-coverage: PR documentation updates                      │
│  - secrets-scan: Secrets in generated docs                      │
│  - docops-skill-sync: Pipeline → Skill sync                     │
│  - canonical-index: All docs indexed                            │
│  - markdown-lint: Markdown style consistency                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT LAYER                              │
│  deploy-docs.yml → GitHub Pages (Astro/Starlight)               │
│  Site: https://williamzujkowski.github.io/nexus-agents/         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Canonical Source Locations

### Primary Index

| File              | Purpose                        | Maintenance |
| ----------------- | ------------------------------ | ----------- |
| `docs/README.md`  | Human-readable canonical index | Manual      |
| `docs/INDEX.yaml` | Machine-parseable index        | Manual      |

**Rule:** All documentation MUST be indexed in `docs/README.md` to be valid.

### Canonical Documentation

| Location                | Content                           | Synced to Website |
| ----------------------- | --------------------------------- | ----------------- |
| `docs/architecture/`    | System design                     | Yes (7 files)     |
| `docs/development/`     | Contributor guides                | Yes (4 files)     |
| `docs/research/`        | Research tracking                 | Yes (5 files)     |
| `docs/guides/`          | How-to guides                     | Yes (3 files)     |
| `docs/getting-started/` | Installation, config              | Yes (2 files)     |
| Root level              | README, QUICK_START, CONTRIBUTING | Yes (3 files)     |

### Internal-Only Documentation

| Location           | Content                       | Reason              |
| ------------------ | ----------------------------- | ------------------- |
| `docs/adr/`        | Architecture Decision Records | Internal decisions  |
| `docs/proposals/`  | Design proposals              | Internal planning   |
| `docs/plans/`      | Implementation plans          | Internal planning   |
| `docs/interfaces/` | Interface specifications      | Internal reference  |
| `docs/ops/`        | Operations documentation      | Internal operations |

---

## Generation Scripts

### sync-docs.ts (Canonical → Website)

```bash
# Usage
npx tsx scripts/sync-docs.ts           # Sync all docs
npx tsx scripts/sync-docs.ts --dry-run # Preview changes
npx tsx scripts/sync-docs.ts --check   # CI validation (fails if out of sync)
npx tsx scripts/sync-docs.ts --verbose # Detailed output
```

**Mappings:** 25 canonical files → website content

**Transformation:**

1. Extract title from H1 heading
2. Extract description from first paragraph
3. Remove frontmatter and metadata lines
4. Fix relative links for website context
5. Generate Starlight-compatible YAML frontmatter

### generate-docs.ts (INDEX.yaml → LLM Context)

```bash
# Usage
npx tsx scripts/generate-docs.ts       # Generate llms.txt and llms-full.txt
npx tsx scripts/generate-docs.ts --check # CI validation
```

**Outputs:**

- `docs/llms.txt` - Condensed (~400 tokens)
- `docs/llms-full.txt` - Comprehensive (~1200 tokens)

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

### docs-check.yml (10 Jobs)

| Job                 | Purpose                    | Blocking     | Trigger  |
| ------------------- | -------------------------- | ------------ | -------- |
| `typedoc-check`     | API docs drift detection   | Yes          | Push, PR |
| `llms-txt-check`    | LLM context freshness      | Yes          | Push, PR |
| `website-sync`      | Canonical → Website sync   | Yes          | Push, PR |
| `repo-index`        | Capabilities freshness     | Yes          | Push, PR |
| `link-check`        | URL validation             | Yes          | Push, PR |
| `docs-coverage`     | PR documentation updates   | No (warning) | PR only  |
| `secrets-scan`      | Secrets in generated docs  | Yes          | Push, PR |
| `docops-skill-sync` | Pipeline → Skill sync      | Yes          | PR only  |
| `canonical-index`   | All docs in README.md      | Yes          | Push, PR |
| `markdown-lint`     | Markdown style consistency | Yes          | Push, PR |

### link-check.yml (Standalone)

- **Trigger:** Weekly (Sunday midnight UTC), manual
- **Scope:** All markdown files + website

---

## Website Configuration

### Astro/Starlight

- **Config:** `website/astro.config.mjs`
- **Content:** `website/src/content/docs/`
- **Base URL:** `/nexus-agents`
- **Site:** `https://williamzujkowski.github.io/nexus-agents/`

### Sidebar Navigation

Defined in `website/astro.config.mjs`:

- Getting Started (4 items)
- Architecture (7 items)
- Guides (5 items)
- Development (4 items)
- Research (5 items)
- API Reference (autogenerated)

---

## Enforcement Rules

### Rule 1: Canonical Index Required

All documentation MUST be indexed in `docs/README.md`.

**Enforcement:** Manual review + PR checklist

### Rule 2: No Parallel Indexes

`docs/README.md` is the ONLY permitted documentation index.

**Enforcement:** Fitness audit dimension `canonicalPaths`

### Rule 3: Generated Files Must Match Source

- `docs/llms.txt` must match `docs/INDEX.yaml`
- Website content must match canonical docs
- `docs/reference/capabilities.md` must match source code

**Enforcement:** CI `--check` modes

### Rule 4: DocOps Changes Require Skill Update

Changes to ANY of these files require updating the Documentation Management skill:

- `scripts/sync-docs.ts`
- `scripts/generate-docs.ts`
- `scripts/generate-repo-index.ts`
- `scripts/inject-governance.ts`
- `.github/workflows/docs-check.yml`
- `.github/workflows/deploy-docs.yml`
- `website/astro.config.mjs`
- `docs/ops/docops-spec.md`

**Enforcement:** CI gate (see docops-manifest.json)

---

## Manifest (For CI Enforcement)

The following files constitute the DocOps pipeline. Changes to these files trigger the DocOps skill update gate:

```json
{
  "version": "1.0.0",
  "pipeline_files": [
    "scripts/sync-docs.ts",
    "scripts/generate-docs.ts",
    "scripts/generate-docs-full.ts",
    "scripts/generate-repo-index.ts",
    "scripts/inject-governance.ts",
    ".github/workflows/docs-check.yml",
    ".github/workflows/deploy-docs.yml",
    ".github/workflows/link-check.yml",
    "website/astro.config.mjs",
    "docs/ops/docops-spec.md"
  ],
  "skill_file": ".claude/skills/documentation-management.md",
  "checksum_location": "docs/ops/docops-manifest.json"
}
```

---

## Quick Reference

### "I want to update documentation content"

1. Edit canonical source in `docs/` or root
2. Run `npx tsx scripts/sync-docs.ts` to sync to website
3. Run `npx tsx scripts/generate-docs.ts` if INDEX.yaml changed
4. Commit and push

### "I want to add a new document"

1. Create file in appropriate `docs/` directory
2. Add entry to `docs/README.md` (required)
3. If public-facing, add mapping to `scripts/sync-docs.ts`
4. Update `docs/INDEX.yaml` if it should appear in LLM context
5. Run generation scripts
6. Commit and push

### "I want to change the doc pipeline"

1. Make changes to pipeline scripts/config
2. Update this spec (`docs/ops/docops-spec.md`)
3. Update the Documentation Management skill
4. Update `docs/ops/docops-manifest.json` if file list changed
5. Commit and push

### "I want to verify the pipeline is healthy"

```bash
# Run all checks locally
npx tsx scripts/sync-docs.ts --check
npx tsx scripts/generate-docs.ts --check
npx tsx scripts/generate-repo-index.ts --check
npx tsx scripts/inject-governance.ts check
cd website && npm run build && cd ..
```

---

## Related Documents

- **Documentation Management Skill:** `.claude/skills/documentation-management.md`
- **Documentation Index:** `docs/README.md`
- **Machine Index:** `docs/INDEX.yaml`
- **Inventory:** `docs/ops/docs-inventory.md`
- **Website Config:** `website/astro.config.mjs`
