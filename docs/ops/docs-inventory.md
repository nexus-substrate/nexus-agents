# Documentation Inventory

**Generated:** 2026-02-01
**Purpose:** Phase 1 inventory for Starlight site rebuild (Epic #615)

---

## Summary Statistics

| Category                                   | Count   | Status                |
| ------------------------------------------ | ------- | --------------------- |
| Canonical docs (`docs/`)                   | 99      | Source of truth       |
| Website docs (`website/src/content/docs/`) | 24      | Synced from canonical |
| Root-level docs                            | 8       | Entry points          |
| Agent rules (`.claude/rules/`)             | 6       | Auto-loaded           |
| **Total**                                  | **137** |                       |

---

## Sync System Status

| Metric                              | Status       |
| ----------------------------------- | ------------ |
| Mappings in sync-docs.ts            | 25           |
| Website files with canonical source | 24/24 (100%) |
| Drift detected                      | None         |
| Last sync check                     | 2026-02-01   |

---

## Documentation Tiers

### Tier 1: Essential (Always Current)

Root-level entry points that must be kept up-to-date:

| File                  | Purpose                        | Sync Status       |
| --------------------- | ------------------------------ | ----------------- |
| `CLAUDE.md`           | Agent instructions, governance | N/A (root)        |
| `README.md`           | Project overview               | Synced to website |
| `QUICK_START.md`      | 5-minute getting started       | Synced to website |
| `CONTRIBUTING.md`     | Contribution workflow          | Synced to website |
| `CODING_STANDARDS.md` | Code style, patterns           | N/A (internal)    |
| `ARCHITECTURE.md`     | Architecture summary           | N/A (internal)    |
| `SECURITY.md`         | Security policy                | N/A (internal)    |
| `CHANGELOG.md`        | Version history                | N/A (internal)    |

### Tier 2: Reference (Regularly Updated)

Hub documents for each major section:

| Hub          | Location                          | Website Mapping              |
| ------------ | --------------------------------- | ---------------------------- |
| Architecture | `docs/architecture/README.md`     | `architecture/overview.md`   |
| Development  | `docs/development/README.md`      | Not synced                   |
| Research     | `docs/research/RESEARCH_INDEX.md` | `research/research-index.md` |
| Interfaces   | `docs/interfaces/README.md`       | Not synced                   |
| Guides       | `docs/guides/` (no hub)           | Synced individually          |

### Tier 3: Detail (Reference as Needed)

| Section              | File Count | Synced to Website |
| -------------------- | ---------- | ----------------- |
| Architecture details | 18         | 7                 |
| Development guides   | 6          | 4                 |
| Research (all)       | 39         | 5                 |
| ADRs                 | 14         | 0                 |
| Interfaces           | 5          | 0                 |
| Proposals            | 8          | 0                 |
| Plans                | 5          | 0                 |
| Operational          | 4          | 0                 |

---

## Website Content Mapping

### Currently Synced (25 mappings)

| Canonical Source                           | Website Destination                   | Title Override        |
| ------------------------------------------ | ------------------------------------- | --------------------- |
| `docs/getting-started/INSTALLATION.md`     | `getting-started/installation.md`     | -                     |
| `docs/getting-started/CONFIGURATION.md`    | `getting-started/configuration.md`    | -                     |
| `docs/architecture/AGENT_SYSTEM.md`        | `architecture/agent-system.md`        | -                     |
| `docs/architecture/CONSENSUS_PROTOCOLS.md` | `architecture/consensus-protocols.md` | -                     |
| `docs/architecture/ROUTING_SYSTEM.md`      | `architecture/routing-system.md`      | -                     |
| `docs/architecture/MEMORY_SYSTEM.md`       | `architecture/memory-system.md`       | -                     |
| `docs/architecture/MCP_PROTOCOL.md`        | `architecture/mcp-protocol.md`        | -                     |
| `docs/architecture/SECURITY.md`            | `architecture/security.md`            | -                     |
| `docs/architecture/README.md`              | `architecture/overview.md`            | Architecture Overview |
| `docs/development/AGENT_DEVELOPMENT.md`    | `development/agent-development.md`    | -                     |
| `docs/development/TOOL_DEVELOPMENT.md`     | `development/tool-development.md`     | -                     |
| `docs/development/MEMORY_DEVELOPMENT.md`   | `development/memory-development.md`   | -                     |
| `CONTRIBUTING.md`                          | `development/contributing.md`         | -                     |
| `docs/guides/DEBUGGING_OBSERVABILITY.md`   | `guides/debugging-observability.md`   | -                     |
| `docs/guides/MCP_INTEGRATION.md`           | `guides/mcp-integration.md`           | -                     |
| `docs/guides/WORKFLOW_TEMPLATES.md`        | `guides/workflow-templates.md`        | -                     |
| `docs/ENTRYPOINTS.md`                      | `guides/cli-usage.md`                 | CLI Usage             |
| `docs/research/RESEARCH_INDEX.md`          | `research/research-index.md`          | -                     |
| `docs/research/CONTRIBUTING.md`            | `research/contributing.md`            | Contributing Research |
| `docs/research/topics/consensus/README.md` | `research/consensus.md`               | Consensus Research    |
| `docs/research/topics/routing/README.md`   | `research/routing.md`                 | Routing Research      |
| `docs/research/topics/memory/README.md`    | `research/memory.md`                  | Memory Research       |
| `QUICK_START.md`                           | `getting-started/quick-start.md`      | -                     |
| `README.md`                                | `getting-started/introduction.md`     | Introduction          |

### Not Synced to Website (Intentional)

| Category              | Reason                           |
| --------------------- | -------------------------------- |
| ADRs (14 files)       | Internal architectural decisions |
| Proposals (8 files)   | Internal design proposals        |
| Plans (5 files)       | Internal implementation plans    |
| Interfaces (5 files)  | Internal specifications          |
| Operational (4 files) | Internal operations              |
| Metrics (1 file)      | Internal metrics                 |
| Design docs (1 file)  | Internal design                  |
| Agent rules (6 files) | Auto-loaded by Claude            |

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

### Missing from Website

| Content                      | Priority | Action                  |
| ---------------------------- | -------- | ----------------------- |
| TROUBLESHOOTING.md           | High     | Add to sync-docs.ts     |
| Reference/capabilities index | High     | Create new (repo index) |
| Context budgets guide        | Medium   | Create new              |

### Missing from Canonical Docs

| Content                          | Priority | Action                 |
| -------------------------------- | -------- | ---------------------- |
| `docs/reference/capabilities.md` | High     | Create (deterministic) |
| `artifacts/repo-index.json`      | High     | Create (deterministic) |
| Skills-style index for LLMs      | Medium   | Create                 |

### Enforcement Gaps

| Gap                              | Priority | Action                |
| -------------------------------- | -------- | --------------------- |
| CI sync check                    | High     | Add to GitHub Actions |
| README freshness validator       | Medium   | Create script         |
| ARCHITECTURE freshness validator | Medium   | Create script         |

---

## Recommendations

### Immediate (Phase 2)

1. Add `docs/TROUBLESHOOTING.md` to sync-docs.ts
2. Create `docs/reference/capabilities.md` from CLI reality map
3. Create `artifacts/repo-index.json` generator script
4. Add CI job for `sync-docs.ts --check`

### Short-term (Phase 3)

5. Create skills-style index for LLM context loading
6. Add README/ARCHITECTURE freshness validation
7. Visual UI/UX audit of website

### Long-term

8. Consider syncing ADRs to website (read-only reference)
9. Auto-generate dependency graph diagram
10. Add search analytics to identify missing content

---

_This inventory is the Phase 1 deliverable for Epic #615._
