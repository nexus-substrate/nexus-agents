# Documentation Site Migration Plan

**Status:** DRAFT - Pending Swarm Vote
**Epic:** #615
**Date:** 2026-02-01

---

## Executive Summary

This plan enhances the existing Starlight documentation site by:

1. Adding deterministic repository indexing
2. Implementing structural docs freshness enforcement
3. Creating LLM context efficiency layers
4. Addressing any UI/UX issues

**Key Principle:** The website is a renderer, not a source of truth. All content derives from canonical documentation in `docs/`.

---

## Information Architecture

### Current Sidebar Structure (Preserved)

```
Getting Started
├── Introduction      (← README.md)
├── Quick Start       (← QUICK_START.md)
├── Installation      (← docs/getting-started/INSTALLATION.md)
└── Configuration     (← docs/getting-started/CONFIGURATION.md)

Architecture
├── Overview          (← docs/architecture/README.md)
├── Agent System      (← docs/architecture/AGENT_SYSTEM.md)
├── Memory System     (← docs/architecture/MEMORY_SYSTEM.md)
├── Routing System    (← docs/architecture/ROUTING_SYSTEM.md)
├── Consensus         (← docs/architecture/CONSENSUS_PROTOCOLS.md)
├── MCP Protocol      (← docs/architecture/MCP_PROTOCOL.md)
└── Security          (← docs/architecture/SECURITY.md)

Development
├── Agent Dev         (← docs/development/AGENT_DEVELOPMENT.md)
├── Tool Dev          (← docs/development/TOOL_DEVELOPMENT.md)
├── Memory Dev        (← docs/development/MEMORY_DEVELOPMENT.md)
└── Contributing      (← CONTRIBUTING.md)

Guides
├── CLI Usage         (← docs/ENTRYPOINTS.md)
├── MCP Integration   (← docs/guides/MCP_INTEGRATION.md)
├── Workflows         (← docs/guides/WORKFLOW_TEMPLATES.md)
├── Debugging         (← docs/guides/DEBUGGING_OBSERVABILITY.md)
└── Troubleshooting   (← docs/TROUBLESHOOTING.md) [NEW]

Reference [NEW SECTION]
├── Capabilities      (← docs/reference/capabilities.md) [NEW]
└── CLI Commands      (← generated from repo-index.json)

Research
├── Index             (← docs/research/RESEARCH_INDEX.md)
├── Contributing      (← docs/research/CONTRIBUTING.md)
├── Consensus         (← docs/research/topics/consensus/README.md)
├── Routing           (← docs/research/topics/routing/README.md)
└── Memory            (← docs/research/topics/memory/README.md)
```

### New Content to Create

1. **`docs/reference/capabilities.md`** - Human-readable capabilities index
2. **`docs/TROUBLESHOOTING.md`** - Already exists, add to sync
3. **`artifacts/repo-index.json`** - Machine-readable repo map

---

## Content Sourcing Rules

### Rule 1: Canonical Source

All website content MUST have a canonical source in one of:

- Root-level markdown (README.md, CONTRIBUTING.md, etc.)
- `docs/` directory structure

### Rule 2: No Site-Only Content

The `website/src/content/docs/` directory MUST NOT contain:

- Original content not in canonical docs
- Modified versions of canonical content
- "Enhanced" or "website-specific" variants

### Rule 3: Transformation Only

`sync-docs.ts` may only:

- Extract title from H1
- Extract description from first paragraph
- Fix relative links for website context
- Generate Starlight frontmatter

It MUST NOT:

- Add content not in source
- Remove content from source
- Modify meaning or structure

---

## Theming Approach

### Use Default Starlight Theme

Per user direction, we use the default Astro/Starlight theme with minimal customization.

**Existing customizations to preserve:**

- `website/src/styles/custom.css` - Current custom styles
- `website/astro.config.mjs` - Current Starlight configuration

**Constraints:**

- Prefer Starlight-native patterns over custom CSS
- Document any CSS overrides with comments explaining why
- Keep customizations to absolute minimum

---

## Minimal Site Scaffolding

### Preserved Components

| Component        | Location                             | Purpose              |
| ---------------- | ------------------------------------ | -------------------- |
| Astro config     | `website/astro.config.mjs`           | Site configuration   |
| Starlight config | (in astro.config.mjs)                | Sidebar, theme, nav  |
| Custom styles    | `website/src/styles/custom.css`      | Minor styling tweaks |
| Landing page     | `website/src/content/docs/index.mdx` | Custom landing       |

### Removed/Migrated

| Item              | Action   | Reason               |
| ----------------- | -------- | -------------------- |
| Site-only content | Migrated | Already done in #613 |
| Duplicate content | Removed  | No duplicates found  |

---

## Drift Prevention & Enforcement

### Automated Checks

1. **sync-docs.ts --check** (CI)
   - Fails if website content differs from canonical
   - Run on every PR

2. **repo-index-generator.ts --check** (CI)
   - Fails if repo-index.json is outdated
   - Run on every PR

3. **docs-freshness.ts --check** (CI)
   - Validates README.md required sections
   - Validates ARCHITECTURE.md required sections
   - Run on every PR

### Manual Checks

- Visual UI/UX review before releases
- Content accuracy sampling quarterly

---

## Repository Index Generator

### Output Artifacts

**`artifacts/repo-index.json`**

```json
{
  "version": "1.0.0",
  "generated": "2026-02-01T00:00:00Z",
  "cli": {
    "commands": [
      {
        "name": "orchestrate",
        "type": "async",
        "description": "Task orchestration with experts",
        "file": "src/cli/orchestrate-command.ts",
        "subcommands": []
      }
    ]
  },
  "mcp": {
    "tools": [
      {
        "name": "orchestrate",
        "description": "Orchestrate a task",
        "file": "src/mcp/tools/orchestrate.ts",
        "inputSchema": "OrchestrateInputSchema"
      }
    ]
  },
  "workflows": [
    {
      "name": "code-review",
      "file": "src/workflows/templates/code-review.yaml"
    }
  ]
}
```

**`docs/reference/capabilities.md`**

- Human-readable version of repo-index.json
- Auto-generated, do not edit manually
- Includes evidence links to source files

### Generation Script

`scripts/generate-repo-index.ts`

- Parses CLI command registration
- Parses MCP tool registration
- Parses workflow templates
- Deterministic output (sorted, consistent formatting)

---

## LLM Context Efficiency

### Skills-Style Index

Create `docs/skills-index.md`:

```markdown
# Skills Index

Quick navigation for common tasks.

## Add a Feature

- Start: docs/development/README.md
- Patterns: docs/CODING_STANDARDS.md
- PR process: CONTRIBUTING.md

## Add an MCP Tool

- Guide: docs/development/TOOL_DEVELOPMENT.md
- Examples: src/mcp/tools/

## Add a CLI Command

- Guide: docs/development/CLI_DELEGATION_GUIDE.md
- Examples: src/cli/

## Debug an Issue

- Guide: docs/guides/DEBUGGING_OBSERVABILITY.md
- Troubleshooting: docs/TROUBLESHOOTING.md
```

### Context Loading Strategy

| Task Type    | Load First         | Then Load              |
| ------------ | ------------------ | ---------------------- |
| Feature work | skills-index.md    | Relevant guide         |
| Bug fix      | TROUBLESHOOTING.md | Relevant code          |
| Architecture | ARCHITECTURE.md    | architecture/README.md |
| Release      | CHANGELOG.md       | docs/development/      |

---

## Implementation Phases

### Phase 2a: CI Enforcement (PR #1)

- Add `sync-docs.ts --check` to GitHub Actions
- Estimated: 30 min

### Phase 2b: Repo Index Generator (PR #2)

- Create `scripts/generate-repo-index.ts`
- Create `artifacts/repo-index.json`
- Create `docs/reference/capabilities.md`
- Add to CI
- Estimated: 2 hours

### Phase 2c: Docs Freshness (PR #3)

- Create `scripts/validate-docs-freshness.ts`
- Define required sections for README.md
- Define required sections for ARCHITECTURE.md
- Add to CI
- Estimated: 1 hour

### Phase 2d: Troubleshooting Sync (PR #4)

- Add TROUBLESHOOTING.md to sync-docs.ts
- Estimated: 15 min

### Phase 2e: Skills Index (PR #5)

- Create `docs/skills-index.md`
- Estimated: 30 min

### Phase 3: UI/UX Audit (Issues)

- Visual review with Chrome
- Create issues for any problems found
- Fix issues

---

## Risks & Mitigations

| Risk                             | Mitigation                           |
| -------------------------------- | ------------------------------------ |
| Sync script breaks website build | CI runs `pnpm build` after sync      |
| Repo index becomes stale         | CI fails if outdated                 |
| Freshness checks too strict      | Start with minimal required sections |
| Over-engineering                 | Keep scripts simple, single-purpose  |

---

## Decision Points for Vote

1. **Sidebar structure** - Preserve current or reorganize?
2. **Reference section** - Add to website sidebar?
3. **Skills index** - Separate file or section in INDEX.yaml?
4. **Freshness strictness** - Minimal or comprehensive validation?

---

## Acceptance Criteria

- [ ] `sync-docs.ts --check` in CI
- [ ] `generate-repo-index.ts` creates deterministic output
- [ ] `validate-docs-freshness.ts` validates required sections
- [ ] TROUBLESHOOTING.md synced to website
- [ ] Skills index created
- [ ] No visual UI/UX issues

---

_This plan requires swarm vote approval before execution._
