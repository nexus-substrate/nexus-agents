---
name: documentation-management
description: |
  Operating manual for documentation work in nexus-agents.
  Use when updating docs, adding new docs, changing doc pipeline, or troubleshooting doc issues.
  Triggers on "update docs", "add documentation", "doc pipeline".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Documentation Management Skill

<!-- CANONICAL SOURCE: docs/ops/docops-spec.md -->
<!-- DOCOPS MANIFEST CHECKSUM: [auto-updated by CI] -->
<!-- PIPELINE NOTE: generate-repo-index.ts outputs MD060-compliant tables (2026-02-03) -->
<!-- PIPELINE NOTE: inject-governance.ts table formatting normalized; generate-docs.ts + generate-docs-full.ts removed in #1619 (llms.txt outputs deprecated) -->
<!-- PIPELINE NOTE: docs-check.yml docs-coverage job set continue-on-error:true for non-blocking (2026-02-03) -->
<!-- PIPELINE NOTE: docs-check.yml docs-coverage handles empty CHANGED_SRC to avoid GITHUB_OUTPUT format errors (2026-02-04) -->
<!-- PIPELINE NOTE: inject-governance.ts extended with ancillary-count injection for AGENTS.md, .claude-plugin/*.json, PLUGIN_INSTALL.md (#1837, 2026-04-12) -->
<!-- PIPELINE NOTE: inject-governance.ts syncs plugin.json version + validates category/license/keywords (#1839, 2026-04-12) -->
<!-- PIPELINE NOTE: link-check.yml + verify-review.yml bumped actions/github-script v8 → v9 (ESM-only @actions/github; our scripts use injected `github`/`core` so unaffected) (#1848, 2026-04-15) -->
<!-- PIPELINE NOTE: website removed (2026-02-22) — sync-docs.ts, check-frontmatter.ts, deploy-docs.yml deleted -->
<!-- PIPELINE NOTE: generate-repo-index.ts extractMCPTools() switched from register regex to tools array parsing (2026-04-10) -->
<!-- PIPELINE NOTE: docops-spec.md tagged with "last validated 2026-04-19" banner per #2004 audit; no functional pipeline change -->
<!-- PIPELINE NOTE: outdated-docs banner pattern documented for use when content drift exists but no immediate refresh is scheduled (2026-04-19) -->
<!-- PIPELINE NOTE: docops-spec.md skill file reference updated from `.claude/skills/documentation-management.md` to `skills/documentation-management/SKILL.md` (#2014, 2026-04-19) -->
<!-- PIPELINE NOTE: TypeDoc Verification CI job (docs-check.yml) downgraded from blocking failure to warning annotation (#2027, 2026-04-19) — drift was creating merge-round-trip noise without providing actionable signal -->
<!-- PIPELINE NOTE: link-check.yml bumped actions/cache v5.0.4 → v5.0.5 (patch-level bump; no behavioral change) (#2087, 2026-04-20) -->
<!-- PIPELINE NOTE: docs-check.yml link-check job removed; it invoked markdown-link-check with `|| true` so all failures were swallowed. lychee in link-check.yml is now the single canonical link-validation path (#2101, 2026-04-21) -->
<!-- PIPELINE NOTE: docs-check.yml docs-content-drift job extended with MCP_TOOL_COUNT cross-check — fails CI when site-data.ts MCP_TOOL_COUNT, server.json tools[], server.json description prose, or README.md prose disagree with the authoritative count in src/mcp/tools/index.ts registerTools() (#2107, 2026-04-22) -->
<!-- PIPELINE NOTE: .claude/rules/ moved to .rules/ for harness neutrality (#2121, 2026-04-22). setup-rules.ts now writes to .rules/nexus-agents.md; detectProjectInfo accepts both paths during migration. CLAUDE.md pointers updated. -->
<!-- PIPELINE NOTE: generate-repo-index.ts now imports cli-command-catalog.ts as single source of truth for CLI commands (#2156, 2026-04-22). Adds drift check warning when dispatch-table entries disagree with the catalog, in either direction. No output-format change. -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS map filled in for query_task_state, run_dev_pipeline, run_pipeline (#2231, 2026-04-26) — those three tools were previously rendering as "{name} tool" placeholders in the CLAUDE.md auto-generated tool table. buildAncillaryProbes() also split into per-target helpers (buildAgentsMdProbes, buildMarketplaceProbes, buildPluginInstallProbes) to clear a max-lines-per-function lint violation; no behavior change. -->

**Full specification:** [docops-spec.md](../../docs/ops/docops-spec.md)

---

## Fast Path: Common Tasks

### Update Documentation Content

```bash
# 1. Edit canonical source
edit docs/architecture/MEMORY_SYSTEM.md  # or relevant file

# 2. Verify docs are indexed
npx tsx scripts/check-docs-indexed.ts
```

### Add New Document

1. Create file in appropriate `docs/` directory
2. **REQUIRED:** Add YAML frontmatter (`title`, `description`, `tier`, `keywords`, `related_files`)
3. **REQUIRED:** Add entry to `docs/README.md`
4. Commit and push

### Change Doc Pipeline

1. Edit pipeline script/config
2. **REQUIRED:** Update `docs/ops/docops-spec.md`
3. **REQUIRED:** Update this skill (`.claude/skills/documentation-management.md`)
4. Run all checks (see Verification below)
5. Commit and push

### Verify Pipeline Health

```bash
npx tsx scripts/check-docs-indexed.ts
npx tsx scripts/generate-repo-index.ts --check
npx tsx scripts/inject-governance.ts check
```

---

## Core Concepts

### Canonical Sources

| Source            | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `docs/README.md`  | Human-readable index (SINGLE SOURCE OF TRUTH) |
| `docs/INDEX.yaml` | Machine-parseable index                       |
| `docs/**/*.md`    | Canonical documentation                       |
| Root `*.md`       | Project entry points                          |

### Generated Outputs

| Output                           | Generated By               | From                  |
| -------------------------------- | -------------------------- | --------------------- |
| `docs/interfaces/agent.md`       | `generate-docs-content.ts` | `core/types/agent.ts` |
| `docs/design/components.md`      | `generate-docs-content.ts` | `src/` module scan    |
| `docs/ops/docs-inventory.md`     | `generate-docs-content.ts` | ADR + MCP tool scan   |
| `docs/reference/capabilities.md` | `generate-repo-index.ts`   | Source code           |
| CLAUDE.md tool index             | `inject-governance.ts`     | MCP tool files        |

### Tier System

- **Tier 1 (Essential):** README, CLAUDE.md, QUICK_START, TROUBLESHOOTING
- **Tier 2 (Reference):** Hub documents (architecture/README.md, etc.)
- **Tier 3 (Detail):** Deep-dive documents, ADRs, proposals

---

## Pipeline Scripts

### generate-docs-content.ts

Auto-generates documentation sections that are derivable from source code:
the `AgentRole` interface, a module inventory, and the ADR / MCP tool counts.
Prevents drift by reading directly from the source of truth.

```bash
npx tsx scripts/generate-docs-content.ts       # Generate all
npx tsx scripts/generate-docs-content.ts --check # CI validation
```

### generate-repo-index.ts

Generates capability index from source code. MCP tools are discovered by parsing
the canonical `tools: [...]` return array in `mcp/tools/index.ts`.

```bash
npx tsx scripts/generate-repo-index.ts       # Generate index
npx tsx scripts/generate-repo-index.ts --check # CI validation
```

### inject-governance.ts

Injects MCP tool table into CLAUDE.md. Tool descriptions are defined in the
`TOOL_DESCRIPTIONS` map — add an entry there when registering a new MCP tool.

```bash
npx tsx scripts/inject-governance.ts inject  # Update CLAUDE.md
npx tsx scripts/inject-governance.ts check   # CI validation
```

---

## CI Validation

### docs-check.yml jobs

<!-- Count + job list intentionally not hardcoded here. See #1837 for
     the work to inject counts programmatically. Authoritative source:
     `.github/workflows/docs-check.yml` — grep for `^  [a-z-]+:` under
     `jobs:` for the current list. -->

The pipeline runs a family of jobs covering: TypeDoc freshness, `capabilities.md` regeneration, link validation, docs coverage, secrets scanning, DocOps skill sync, canonical-index enforcement, markdown lint, spell check, skills/index.yaml freshness, agents/index.yaml + gap-coverage check, and governance drift. Blocking-vs-warning status is declared per job in the workflow file.

---

## Enforcement Rules

### Rule 1: Canonical Index Required

All documentation MUST be indexed in `docs/README.md`.

### Rule 2: No Parallel Indexes

`docs/README.md` is the ONLY permitted documentation index.

### Rule 3: Generated Files Must Match Source

CI fails if generated files drift from canonical sources.

### Rule 4: DocOps Changes Require Skill Update

Changes to pipeline files require updating this skill and `docs/ops/docops-spec.md`.

**Pipeline files:**

- `scripts/generate-docs-content.ts`
- `scripts/generate-repo-index.ts`
- `scripts/inject-governance.ts`
- `.github/workflows/docs-check.yml`

---

## Troubleshooting

### "docs-content check failed"

```bash
npx tsx scripts/generate-docs-content.ts
git add docs/interfaces/agent.md docs/design/components.md docs/ops/docs-inventory.md
git commit -m "docs: regenerate source-derived docs"
```

### "Link check failed"

1. Run `npx lychee . --config lychee.toml` to identify broken links
2. Fix links in canonical source

### "CI keeps failing on docs"

```bash
# Run full validation suite locally
pnpm lint
pnpm typecheck
npx tsx scripts/generate-docs-content.ts --check
npx tsx scripts/generate-repo-index.ts --check
npx tsx scripts/inject-governance.ts check
```

---

## Quality Checklist

Before committing documentation changes:

- [ ] File indexed in `docs/README.md`
- [ ] `npx tsx scripts/generate-docs-content.ts --check` passes (if types/module structure changed)
- [ ] `npx tsx scripts/generate-repo-index.ts --check` passes (if MCP tools added/renamed)
- [ ] Links work: `npx lychee . --config lychee.toml`
- [ ] No secrets in content

---

## Periodic Drift Audit

Adapted from `paperclipai/paperclip` doc-maintenance skill. Triggers: weekly cadence, post-release, after a major merge, or on explicit request ("audit docs", "doc drift").

### Targets

User-facing docs that get stale fastest as the codebase moves:

- `README.md` — features table, quickstart, prerequisites
- `docs/README.md` — canonical doc index
- `docs/getting-started/INSTALLATION.md` — install commands, Node/pnpm versions
- `docs/getting-started/CONFIGURATION.md` — env var table, config schema
- `CLAUDE.md` — Canonical Paths table, MCP Tools table (auto-generated, but check the _non_-auto sections)

### Cursor Pattern (incremental review)

Store the last-reviewed commit SHA in `.doc-review-cursor` (gitignored — it's local audit state, not project state). On each audit run:

```bash
LAST_SHA=$(cat .doc-review-cursor 2>/dev/null || echo "HEAD~200")
git log "$LAST_SHA"..HEAD --oneline --no-merges > /tmp/audit-window.log
```

After committing the audit fixes:

```bash
git rev-parse HEAD > .doc-review-cursor
```

Without the cursor, every audit re-reads the whole history → audits get skipped. With it, audits stay incremental and cheap.

### Commit Classification

From the audit window, only these commit prefixes warrant a doc check:

| Prefix                                     | Action                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| `feat:` / `feat(...)`:                     | Check feature tables, README highlights, capability docs |
| `fix:` containing `breaking` / API-removal | Check API reference, migration notes                     |
| New top-level `src/` directory             | Check architecture overview, canonical paths             |
| `chore(deps):` major bumps                 | Check prerequisites + compat tables                      |

Ignore: `refactor`, `test`, `chore(ci)`, `docs`, `style` — they don't shift user-facing surface.

### What to Look For

Run the audit through this lens:

| Drift class             | Signal                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **False negative**      | Shipped capability missing from feature/MCP tool/expert tables. Resolved design questions still marked TBD. Removed adapters/skills still listed. |
| **False positive**      | "Coming soon" / "planned" features that have shipped. Cancelled items still on roadmap. Capability claims that contradict current implementation. |
| **Quickstart breakage** | `npx`/`pnpm` commands that don't work. Prerequisites pinning unsupported versions. Clone URL drift. Required env vars unmentioned.                |
| **Feature-table drift** | `## MCP Tools Reference` count mismatch. Adapter "Works with" table missing recently-added CLI. Skill index missing a new skill.                  |

For our auto-generated tables (CLAUDE.md MCP tools, `capabilities.md`, `docs/interfaces/agent.md`), drift is a generation-script bug, not a doc edit — file an issue against the script instead of editing the rendered output.

### Audit-PR Discipline

- Branch: `docs/audit-$(date +%Y%m%d)`
- Commit message lists fixes + the source PR/commit that triggered each
- **Factual fixes only** — do NOT bundle style refactors, link-checker autofixes, or formatting passes. Style/refactor PRs are separate; mixing them defeats the audit's signal-to-noise.
- If a doc needs _more_ than drift fixes (e.g., a section is structurally wrong), open a follow-up issue rather than expanding the audit PR

### Out of Scope

- Auto-generated tables (handled by `scripts/inject-governance.ts`, `scripts/generate-docs-content.ts`, `scripts/generate-repo-index.ts`, etc.) — see Pipeline section above
- Style/voice/markdown formatting — orthogonal, separate PRs
- Adding new docs — separate workflow; this audit only fixes drift in existing docs

---

## Related Documents

- **DocOps Spec:** [docs/ops/docops-spec.md](../../docs/ops/docops-spec.md)
- **Documentation Index:** [docs/README.md](../../docs/README.md)
- **Inventory:** [docs/ops/docs-inventory.md](../../docs/ops/docs-inventory.md)
