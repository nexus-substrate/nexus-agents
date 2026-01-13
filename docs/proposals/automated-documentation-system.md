# Automated Documentation System (ADS) Proposal

**Version:** 1.2 (Security + AI/ML Amendments)
**Date:** 2026-01-13 (ET)
**Status:** ✅ APPROVED - UNANIMOUS CONSENSUS
**Author:** Research + Design Agents
**Round 1:** 4/5 APPROVE (80%) - Security DISSENT addressed
**Round 2:** 4/5 APPROVE (80%) - AI/ML DISSENT addressed
**Round 3:** 5/5 APPROVE (100%) - UNANIMOUS CONSENSUS

---

## Problem Statement

Documentation drift is a persistent problem:

1. **ENTRYPOINTS.md** contains CLI commands, MCP tools, REST endpoints - all manually maintained
2. **RESEARCH_INDEX.md** claims to be "generated from YAML registries" but is manually updated
3. **Interface docs** (`docs/interfaces/`) can drift from actual TypeScript interfaces
4. **TypeDoc is configured but never runs** - 1,067 JSDoc annotations go unused
5. **Link validation** doesn't exist - broken links discovered manually
6. **Example code** in docs can become outdated and non-functional

**Goal:** Create a deterministic, automated system where documentation is generated from code or validated against code, with CI enforcement.

---

## Design Principles

1. **Code is Truth** - Source code is the single source of truth
2. **Generate, Don't Duplicate** - Auto-generate docs from code where possible
3. **Validate, Don't Trust** - CI must verify docs match code
4. **Fail Early** - Drift should fail CI, not reach production
5. **Developer-Friendly** - Easy to update, easy to understand errors
6. **Incremental** - Can be implemented in phases without breaking existing workflows

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Source Code (Ground Truth)                       │
├─────────────────────────────────────────────────────────────────────┤
│  src/cli/*.ts    │  src/mcp/tools/*  │  src/api/routes/*  │  *.ts  │
│  CLI Commands    │  MCP Tool Schemas │  REST Endpoints    │  Types │
└────────┬─────────┴────────┬──────────┴─────────┬──────────┴────┬───┘
         │                  │                    │               │
         ▼                  ▼                    ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Extraction Layer (nexus-agents index)            │
├─────────────────────────────────────────────────────────────────────┤
│  extract-cli.ts  │  extract-mcp.ts  │  extract-rest.ts  │  typedoc │
│  → cli.yaml      │  → mcp.yaml      │  → rest.yaml      │  → api/  │
└────────┬─────────┴────────┬──────────┴─────────┬──────────┴────┬───┘
         │                  │                    │               │
         └──────────────────┼────────────────────┘               │
                           ▼                                     │
┌─────────────────────────────────────────────────────────────────────┐
│                    Generation Layer                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ENTRYPOINTS.md (generated sections)  │  docs/api/ (TypeDoc)        │
│  RESEARCH_INDEX.md (from registry)    │  Interface docs             │
└────────┬─────────────────────────────────────────────┬──────────────┘
         │                                             │
         ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Validation Layer (CI)                             │
├─────────────────────────────────────────────────────────────────────┤
│  Drift Detection  │  Link Validation  │  Freshness Check  │  Tests │
│  (generated=committed) │  (markdown-link-check)  │  (system-review) │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### Component 1: Entrypoint Extraction

**Purpose:** Extract CLI commands, MCP tools, and REST endpoints from source code.

**Implementation:**

```typescript
// scripts/extract-entrypoints.ts
interface EntrypointManifest {
  generated_at: string;
  version: string;
  cli_commands: CliCommandSpec[];
  mcp_tools: McpToolSpec[];
  rest_endpoints: RestEndpointSpec[];
}

interface CliCommandSpec {
  name: string;
  subcommands: string[];
  description: string;
  options: OptionSpec[];
  source_file: string;
  source_line: number;
}
```

**Source Locations:**
| Type | Source File | Extraction Method |
|------|-------------|-------------------|
| CLI Commands | `src/cli-commands.ts` | AST parsing of switch statement |
| MCP Tools | `src/mcp/tools/index.ts` | AST parsing of tool definitions |
| REST Endpoints | `src/api/routes/*.ts` | AST parsing of route handlers |

**Output:** `docs/.generated/entrypoints.yaml`

**CLI Integration:**

```bash
nexus-agents index entrypoints generate  # Generate manifest
nexus-agents index entrypoints check     # Verify docs match manifest
nexus-agents index entrypoints update    # Update ENTRYPOINTS.md sections
```

### Component 2: Research Index Generator

**Purpose:** Generate RESEARCH_INDEX.md from YAML registry files.

**Implementation:**

```typescript
// scripts/generate-research-index.ts
interface ResearchStats {
  total_papers: number;
  total_techniques: number;
  by_status: Record<TechniqueStatus, number>;
  by_topic: Record<string, { papers: number; techniques: number }>;
}
```

**Source Files:**

- `docs/research/registry/papers.yaml`
- `docs/research/registry/techniques.yaml`
- `docs/research/registry/sources.yaml`

**Output:** `docs/research/RESEARCH_INDEX.md` (regenerated)

**CLI Integration:**

```bash
nexus-agents research refresh  # Regenerate RESEARCH_INDEX.md
nexus-agents research check    # Verify counts match registry
```

### Component 3: TypeDoc API Generation

**Purpose:** Generate API reference documentation from TypeScript source.

**Configuration:** Already exists at `packages/nexus-agents/typedoc.json`

**Output:** `docs/api/` directory

**CI Integration:**

```yaml
# .github/workflows/docs-check.yml
- name: Generate TypeDoc
  run: pnpm docs

- name: Check TypeDoc committed
  run: git diff --exit-code docs/api/
```

### Component 4: Link Validation

**Purpose:** Detect broken internal and external links in markdown files.

**Tool:** `markdown-link-check`

**Configuration:**

```json
// .markdown-link-check.json
{
  "ignorePatterns": [{ "pattern": "^http://localhost" }],
  "timeout": "10s",
  "retryOn429": true,
  "aliveStatusCodes": [200, 206]
}
```

**CLI Integration:**

```bash
nexus-agents index links check  # Check all markdown links
```

### Component 5: Drift Detection CI

**Purpose:** Block PRs that introduce documentation drift.

**Implementation:**

```yaml
# .github/workflows/docs-check.yml (enhanced)
docs-drift:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Extract entrypoints
      run: pnpm exec ts-node scripts/extract-entrypoints.ts

    - name: Check entrypoints match
      run: |
        diff docs/.generated/entrypoints.yaml docs/.committed/entrypoints.yaml
        if [ $? -ne 0 ]; then
          echo "::error::Entrypoint documentation is out of sync with code"
          echo "Run 'nexus-agents index entrypoints update' to fix"
          exit 1
        fi

    - name: Regenerate research index
      run: pnpm exec ts-node scripts/generate-research-index.ts

    - name: Check research index
      run: |
        git diff --exit-code docs/research/RESEARCH_INDEX.md
        if [ $? -ne 0 ]; then
          echo "::error::RESEARCH_INDEX.md is out of sync with registry"
          echo "Run 'nexus-agents research refresh' to fix"
          exit 1
        fi
```

### Component 6: Documentation Freshness Dashboard

**Purpose:** Surface stale documentation proactively.

**Implementation:**

```typescript
// Enhance existing system-review.ts
interface DocFreshnessReport {
  file: string;
  last_modified: string;
  days_since_update: number;
  dependent_source_files: string[];
  source_changed_since: boolean; // NEW: Did source change but not docs?
  status: 'current' | 'stale' | 'drift';
}
```

**CLI Integration:**

```bash
nexus-agents index freshness  # Show documentation freshness report
```

---

## File Structure Changes

```
nexus-agents/
├── docs/
│   ├── .generated/              # NEW: Generated artifacts
│   │   ├── entrypoints.yaml     # Extracted from source
│   │   └── research-stats.json  # Computed from registry
│   ├── api/                     # NEW: TypeDoc output
│   │   └── index.html
│   └── research/
│       └── RESEARCH_INDEX.md    # Now truly generated
├── scripts/
│   ├── extract-entrypoints.ts   # NEW: Entrypoint extractor
│   └── generate-research-index.ts # NEW: Research index generator
├── packages/nexus-agents/src/
│   ├── indexer/                 # EXISTING: Codebase indexer
│   │   └── (add entrypoint extraction)
│   └── cli/
│       └── index-command.ts     # EXISTING: Add new subcommands
└── .github/workflows/
    └── docs-check.yml           # ENHANCED: Drift detection
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)

| Task                                | Effort | Impact          |
| ----------------------------------- | ------ | --------------- |
| Run TypeDoc, commit output          | 1h     | API docs exist  |
| Add TypeDoc to CI                   | 1h     | Stays current   |
| Add link validation to CI           | 2h     | No broken links |
| Create `docs/.generated/` structure | 1h     | Foundation      |

**Deliverables:**

- `docs/api/` generated and committed
- Link validation in CI
- `.markdown-link-check.json` configuration

### Phase 2: Entrypoint Extraction (Days 3-5)

| Task                        | Effort | Impact              |
| --------------------------- | ------ | ------------------- |
| Create extraction script    | 4h     | Core capability     |
| Extract CLI commands        | 2h     | CLI docs automated  |
| Extract MCP tools           | 2h     | MCP docs automated  |
| Extract REST endpoints      | 2h     | REST docs automated |
| Add `index entrypoints` CLI | 2h     | Developer tooling   |
| Add drift detection CI      | 2h     | Enforcement         |

**Deliverables:**

- `scripts/extract-entrypoints.ts`
- `docs/.generated/entrypoints.yaml`
- `nexus-agents index entrypoints` command
- CI drift detection for entrypoints

### Phase 3: Research Automation (Days 6-7)

| Task                            | Effort | Impact            |
| ------------------------------- | ------ | ----------------- |
| Create research index generator | 3h     | Index automated   |
| Add `research refresh` command  | 1h     | Developer tooling |
| Add CI verification             | 1h     | Enforcement       |
| Update RESEARCH_INDEX.md format | 1h     | Cleaner output    |

**Deliverables:**

- `scripts/generate-research-index.ts`
- `nexus-agents research refresh` command
- CI verification for research index

### Phase 4: Freshness Dashboard (Days 8-9)

| Task                            | Effort | Impact            |
| ------------------------------- | ------ | ----------------- |
| Enhance system-review freshness | 2h     | Better visibility |
| Add source-dependency tracking  | 3h     | Detect drift      |
| Create freshness CLI command    | 2h     | On-demand check   |
| Add freshness to PR checks      | 2h     | Proactive alerts  |

**Deliverables:**

- `nexus-agents index freshness` command
- Enhanced system-review with source tracking
- PR comments for freshness warnings

---

## Success Metrics

| Metric                     | Current      | Target        | Measurement        |
| -------------------------- | ------------ | ------------- | ------------------ |
| TypeDoc coverage           | 0%           | 100%          | `docs/api/` exists |
| Entrypoint drift detection | None         | 100%          | CI blocks drift    |
| Research index accuracy    | Manual       | Auto-verified | CI checks match    |
| Broken links               | Unknown      | 0             | Link checker in CI |
| Documentation freshness    | 7-day manual | Source-aware  | Automatic alerts   |
| Manual doc updates/week    | 5+           | 1-2           | Issue tracking     |

---

## Risk Mitigation

| Risk                                      | Mitigation                                       |
| ----------------------------------------- | ------------------------------------------------ |
| Extraction scripts break on code changes  | Comprehensive tests, CI validation               |
| TypeDoc output too large                  | Configure `excludePrivate`, limit to public API  |
| Link validation too slow                  | Cache external links, run on schedule            |
| Developers skip CI                        | Branch protection requires passing checks        |
| Generated docs conflict with manual edits | Clear `<!-- GENERATED -->` markers               |
| Sensitive data in generated docs          | Sanitization filter before commit (see Security) |
| Escape hatch abuse                        | Audit logging and rate limiting (see Security)   |

---

## Security Considerations

_Added in v1.1 per Security agent review_

### Sensitive Data Sanitization

_Amended in v1.2 per AI/ML agent review - two-tier approach_

Generated documentation requires **two-tier sanitization** to balance security with AI agent usability:

#### Tier 1: Value-Only Filtering (Internal Manifests)

For machine-readable artifacts (`entrypoints.yaml`, `research-stats.json`), filter **actual secret values** only:

```typescript
// scripts/sanitize-generated.ts - Tier 1 (internal manifests)
const VALUE_PATTERNS = [
  /sk-[a-zA-Z0-9]{48}/, // OpenAI API key format
  /sk-ant-[a-zA-Z0-9-]{95}/, // Anthropic API key format
  /ghp_[a-zA-Z0-9]{36}/, // GitHub PAT format
  /glpat-[a-zA-Z0-9-]{20}/, // GitLab PAT format
  /Bearer [a-zA-Z0-9-_.]+/, // Bearer tokens
  /[a-f0-9]{32,}/, // Hex strings (potential secrets)
  /localhost:\d+/, // Local URLs
  /192\.168\.\d+\.\d+/, // Private IPs
  /10\.\d+\.\d+\.\d+/, // Private IPs
];
```

**Benefit:** Preserves semantic content like "API key configuration" while filtering actual key values.

#### Tier 2: Context Filtering (User-Facing Docs)

For user-facing documentation (TypeDoc HTML, README sections), apply broader filtering:

```typescript
// scripts/sanitize-generated.ts - Tier 2 (user-facing docs)
const CONTEXT_PATTERNS = [
  ...VALUE_PATTERNS,
  /internal-only|do-not-share/i, // Internal markers
  /TODO:.*secret|TODO:.*key/i, // Sensitive TODOs
  /@internal/, // JSDoc internal markers
];
```

**Implementation:**

```typescript
type SanitizationTier = 'internal-manifest' | 'user-facing';

function sanitize(content: string, tier: SanitizationTier): string {
  const patterns = tier === 'internal-manifest' ? VALUE_PATTERNS : CONTEXT_PATTERNS;
  let sanitized = content;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(new RegExp(pattern, 'g'), '[REDACTED]');
  }
  return sanitized;
}
```

**File-to-Tier Mapping:**
| File | Tier | Rationale |
|------|------|-----------|
| `docs/.generated/entrypoints.yaml` | internal-manifest | AI agents consume |
| `docs/.generated/research-stats.json` | internal-manifest | AI agents consume |
| `docs/api/**/*.html` | user-facing | Public docs |
| `README.md` generated sections | user-facing | Public docs |

### Escape Hatch Audit Logging

All escape hatch usage must be logged for traceability:

```yaml
# .github/workflows/docs-check.yml (audit section)
- name: Audit escape hatch usage
  if: contains(github.event.head_commit.message, '[skip-docs]')
  run: |
    echo "::warning::Escape hatch [skip-docs] used by ${{ github.actor }}"
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') | [skip-docs] | ${{ github.actor }} | ${{ github.sha }}" >> docs/.audit/escape-hatch.log
    git add docs/.audit/escape-hatch.log
    git commit --allow-empty -m "audit: log [skip-docs] usage"
```

### Escape Hatch Rate Limiting

To prevent abuse, `[skip-docs]` is limited to **2 uses per author per 7-day rolling window**.

```yaml
# .github/workflows/docs-check.yml (rate limit check)
- name: Check escape hatch rate limit
  if: contains(github.event.head_commit.message, '[skip-docs]')
  run: |
    AUTHOR="${{ github.actor }}"
    COUNT=$(grep -c "| $AUTHOR |" docs/.audit/escape-hatch.log 2>/dev/null | \
            xargs -I{} awk 'BEGIN{print {}}' || echo 0)
    RECENT=$(grep "| $AUTHOR |" docs/.audit/escape-hatch.log 2>/dev/null | \
             tail -7 | wc -l)
    if [ "$RECENT" -ge 2 ]; then
      echo "::error::Rate limit exceeded. $AUTHOR has used [skip-docs] $RECENT times in the last 7 days (limit: 2)"
      exit 1
    fi
```

### `--force` Flag Documentation

The `--force` flag is reserved for CI-breaking emergencies. Usage must be documented:

| Flag                   | Purpose                      | Requires                      |
| ---------------------- | ---------------------------- | ----------------------------- |
| `--force`              | Override validation warnings | Commit message explaining why |
| `--force --skip-audit` | Override without logging     | Not allowed in CI             |

**SECURITY.md addendum** required for this proposal documenting `--force` usage policy.

---

## Escape Hatches

**⚠️ All escape hatch usage is audit-logged and rate-limited.**

1. **`[skip-docs]` in commit message** - Bypass docs CI for urgent fixes
   - Rate limited: 2 uses per author per 7 days
   - Logged to `docs/.audit/escape-hatch.log`
   - Requires justification in commit message body
2. **`<!-- MANUAL -->` sections** - Protect hand-written content in generated files
   - No rate limit (content-specific, not bypass)
3. **`--force` flag** - Override validation warnings
   - Must include justification in commit message
   - Cannot bypass sanitization checks
4. **Allowlist** - Exclude files from freshness tracking
   - Configured in `.docsrc.yaml`, reviewed in PRs

---

## Open Questions for Swarm Review

1. **TypeDoc hosting:** GitHub Pages or in-repo? (Recommendation: in-repo for simplicity)
2. **Link validation scope:** Internal only or external too? (Recommendation: both, cached)
3. **Blocking vs Warning:** Should drift block PRs or just warn? (Recommendation: block after grace period)
4. **ENTRYPOINTS.md format:** Fully generated or hybrid? (Recommendation: hybrid with `<!-- GENERATED -->` sections)

---

## References

- Research Report: Documentation Management Analysis (2026-01-13)
- Existing: `docs/ENTRYPOINTS.md` (current canonical reference)
- Existing: `.github/workflows/docs-check.yml` (current presence checking)
- Existing: `packages/nexus-agents/typedoc.json` (TypeDoc configuration)
- Issue #240: Codebase Index Feature (related implementation)

---

_Proposal Version 1.2 - Round 3 Voting_

## Voting History

### Round 1 (v1.0)

| Agent     | Vote    | Confidence | Notes                                |
| --------- | ------- | ---------- | ------------------------------------ |
| Architect | APPROVE | 85%        | Sound architecture, phased approach  |
| Security  | DISSENT | 78%        | Escape hatch audit/rate limit needed |
| DevEx     | APPROVE | 88%        | Excellent developer workflow         |
| AI/ML     | APPROVE | 85%        | Machine-readable formats             |
| PM        | APPROVE | 85%        | Strong ROI, realistic timeline       |

**Result:** 4/5 APPROVE (80%) - Security concerns require iteration.

### Round 2 (v1.1)

| Agent     | Vote    | Confidence | Notes                                  |
| --------- | ------- | ---------- | -------------------------------------- |
| Architect | APPROVE | 92%        | Security is architecturally sound      |
| Security  | APPROVE | 89%        | All concerns addressed                 |
| DevEx     | APPROVE | 92%        | Escape hatches reasonable              |
| AI/ML     | DISSENT | 72%        | Sanitization too aggressive for AI use |
| PM        | APPROVE | 88%        | Security overhead acceptable           |

**Result:** 4/5 APPROVE (80%) - AI/ML concern about keyword sanitization requires iteration.
