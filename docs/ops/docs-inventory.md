# Documentation Inventory

**Generated:** 2026-02-01
**Updated:** 2026-02-22
**Purpose:** Documentation inventory for nexus-agents

---

## Summary Statistics

| Category                       | Count   | Status          |
| ------------------------------ | ------- | --------------- |
| Canonical docs (`docs/`)       | 99      | Source of truth |
| Root-level docs                | 8       | Entry points    |
| Agent rules (`.claude/rules/`) | 6       | Auto-loaded     |
| **Total**                      | **113** |                 |

---

## Documentation Tiers

### Tier 1: Essential (Always Current)

Root-level entry points that must be kept up-to-date:

| File                  | Purpose                        |
| --------------------- | ------------------------------ |
| `CLAUDE.md`           | Agent instructions, governance |
| `README.md`           | Project overview               |
| `QUICK_START.md`      | 5-minute getting started       |
| `CONTRIBUTING.md`     | Contribution workflow          |
| `CODING_STANDARDS.md` | Code style, patterns           |
| `ARCHITECTURE.md`     | Architecture summary           |
| `SECURITY.md`         | Security policy                |
| `CHANGELOG.md`        | Version history                |

### Tier 2: Reference (Regularly Updated)

Hub documents for each major section:

| Hub          | Location                          |
| ------------ | --------------------------------- |
| Architecture | `docs/architecture/README.md`     |
| Development  | `docs/development/README.md`      |
| Research     | `docs/research/RESEARCH_INDEX.md` |
| Interfaces   | `docs/interfaces/README.md`       |
| Guides       | `docs/guides/` (no hub)           |

### Tier 3: Detail (Reference as Needed)

| Section              | File Count |
| -------------------- | ---------- |
| Architecture details | 18         |
| Development guides   | 6          |
| Research (all)       | 39         |
| ADRs                 | 14         |
| Interfaces           | 5          |
| Proposals            | 8          |
| Plans                | 5          |
| Operational          | 4          |

---

## CLI Reality (Verified from Source)

### Commands (24 total)

| Command            | Type  | Status      | Documentation       |
| ------------------ | ----- | ----------- | ------------------- |
| `hello`            | sync  | Implemented | docs/ENTRYPOINTS.md |
| `demo`             | async | Implemented | docs/ENTRYPOINTS.md |
| `verify`           | async | Implemented | docs/ENTRYPOINTS.md |
| `doctor`           | async | Implemented | docs/ENTRYPOINTS.md |
| `setup`            | async | Implemented | docs/ENTRYPOINTS.md |
| `config`           | async | Implemented | docs/ENTRYPOINTS.md |
| `expert`           | sync  | Implemented | docs/ENTRYPOINTS.md |
| `workflow`         | async | Implemented | docs/ENTRYPOINTS.md |
| `routing-audit`    | sync  | Implemented | docs/ENTRYPOINTS.md |
| `orchestrate`      | async | Implemented | docs/ENTRYPOINTS.md |
| `vote`             | async | Implemented | docs/ENTRYPOINTS.md |
| `review`           | async | Implemented | docs/ENTRYPOINTS.md |
| `fitness-audit`    | sync  | Implemented | docs/ENTRYPOINTS.md |
| `server`           | async | Implemented | docs/ENTRYPOINTS.md |
| `index`            | async | Implemented | docs/ENTRYPOINTS.md |
| `research`         | async | Implemented | docs/ENTRYPOINTS.md |
| `swe-bench`        | async | Implemented | docs/ENTRYPOINTS.md |
| `hooks`            | async | Implemented | docs/ENTRYPOINTS.md |
| `sprint`           | async | Implemented | docs/ENTRYPOINTS.md |
| `session`          | async | Implemented | docs/ENTRYPOINTS.md |
| `evaluate`         | async | Implemented | docs/ENTRYPOINTS.md |
| `system-review`    | sync  | Implemented | docs/ENTRYPOINTS.md |
| `validation`       | sync  | Implemented | docs/ENTRYPOINTS.md |
| `learning-metrics` | sync  | Implemented | docs/ENTRYPOINTS.md |

### MCP Tools (8 total)

| Tool                | Status      | Documentation                  |
| ------------------- | ----------- | ------------------------------ |
| `orchestrate`       | Implemented | docs/guides/MCP_INTEGRATION.md |
| `create_expert`     | Implemented | docs/guides/MCP_INTEGRATION.md |
| `execute_expert`    | Implemented | docs/guides/MCP_INTEGRATION.md |
| `run_workflow`      | Implemented | docs/guides/MCP_INTEGRATION.md |
| `delegate_to_model` | Implemented | docs/guides/MCP_INTEGRATION.md |
| `list_experts`      | Implemented | docs/guides/MCP_INTEGRATION.md |
| `list_workflows`    | Implemented | docs/guides/MCP_INTEGRATION.md |
| `consensus_vote`    | Implemented | docs/guides/MCP_INTEGRATION.md |

### Workflow Templates (7 built-in)

| Template                 | Location                                              |
| ------------------------ | ----------------------------------------------------- |
| `bug-fix`                | `src/workflows/templates/bug-fix.yaml`                |
| `code-review`            | `src/workflows/templates/code-review.yaml`            |
| `documentation-update`   | `src/workflows/templates/documentation-update.yaml`   |
| `feature-implementation` | `src/workflows/templates/feature-implementation.yaml` |
| `refactoring`            | `src/workflows/templates/refactoring.yaml`            |
| `security-audit`         | `src/workflows/templates/security-audit.yaml`         |
| `test-generation`        | `src/workflows/templates/test-generation.yaml`        |

---

## Gaps Identified

### Completed

| Gap                          | Status | Implementation                        |
| ---------------------------- | ------ | ------------------------------------- |
| Reference/capabilities index | Done   | `docs/reference/capabilities.md`      |
| `artifacts/repo-index.json`  | Done   | `scripts/generate-repo-index.ts`      |
| LLMs.txt files               | Done   | `docs/llms.txt`, `docs/llms-full.txt` |

### Remaining Gaps

| Gap                              | Priority | Issue | Action                        |
| -------------------------------- | -------- | ----- | ----------------------------- |
| README freshness validator       | Medium   | #634  | Create script                 |
| ARCHITECTURE freshness validator | Medium   | #634  | Create script                 |
| INDEX.yaml → README.md generator | Medium   | #630  | Deterministic generation      |
| Cross-reference validation       | Medium   | #632  | Validate code symbols in docs |

---

_This inventory is the Phase 1 deliverable for Epic #615._
