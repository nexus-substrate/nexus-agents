# Contributing to Research Documentation

**Last Updated:** 2026-05-12 (ET)

This guide explains how to add new research papers, techniques, and sources to the nexus-agents research tracking system.

---

## ⚠️ Quality-First Workflow

**97% of papers in our registry are evidence_tier=low** (arXiv preprints without peer review, code, or baselines). Before implementing techniques from a paper, assess its evidence quality:

### Evidence Tiers

| Tier       | Criteria                                                       | Action                                                            |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| **High**   | Peer-reviewed + has code + has baselines, OR quality_score ≥ 7 | Implement with confidence                                         |
| **Medium** | Has code OR quality_score ≥ 4                                  | Implement with caution, verify claims                             |
| **Low**    | arXiv preprint, no code, no baselines                          | Research only — do NOT implement without independent verification |

### Quality Score (0-10, auto-computed)

| Signal         | Points | Source                                   |
| -------------- | ------ | ---------------------------------------- |
| Citation count | 0-3    | Semantic Scholar API                     |
| Venue tier     | 0-3    | NeurIPS/ICML/ICLR=3, workshop=1, arXiv=0 |
| Has code repo  | 0 or 2 | Papers With Code / manual                |
| Recency (<6mo) | 0-2    | Publication date                         |

### Red Flags (manual assessment)

- Paper only evaluated on one model or one dataset
- No comparison against established baselines
- Claims >50% improvement without ablation study
- Authors are from the company selling the product
- No code repository linked despite claiming reproducibility

---

## Reviewing Open-Source Repos

Not all research comes from papers. Many patterns come from GitHub repos. When reviewing a repo:

### 1. Document what it does (1-2 sentences)

### 2. Extract techniques/patterns applicable to nexus-agents

### 3. Assess quality signals

| Signal   | How to check                        |
| -------- | ----------------------------------- |
| Stars    | GitHub star count at time of review |
| Activity | Last commit within 3 months?        |
| Tests    | Does the repo have a test suite?    |
| Docs     | README + API docs?                  |
| Paper    | Is there an associated arXiv paper? |

### 4. Record verdict

| Verdict             | Meaning                                    |
| ------------------- | ------------------------------------------ |
| `adopted`           | Patterns implemented in nexus-agents       |
| `partially_adopted` | Some patterns implemented, others rejected |
| `rejected`          | Reviewed and decided not to adopt          |
| `monitoring`        | Interesting but not actionable yet         |

### 5. Add to sources.yaml

```yaml
repo-name:
  name: 'Human-readable name'
  type: open_source_repo
  url: 'https://github.com/org/repo'
  reviewed_date: 'YYYY-MM-DD'
  techniques_extracted:
    - pattern-name
  verdict: adopted | partially_adopted | rejected | monitoring
  verdict_notes: 'Why this verdict'
  quality_score: 0-10
  evidence_tier: high | medium | low
```

---

## ⚠️ MANDATORY: Check Registry Before Starting

**You MUST check the registry before starting any new research.** This is not optional guidance—it is a required protocol to prevent duplicate efforts.

### Required Checks

```bash
# 1. Check if paper already exists by arXiv ID
grep -i "arxiv_id.*XXXX.XXXXX" docs/research/registry/papers.yaml

# 2. Check if technique already exists
grep -i "technique-name" docs/research/registry/techniques.yaml

# 3. Check if technique is already implemented
grep -B 5 "technique-name" docs/research/registry/techniques.yaml | grep "status:"

# 4. Search topic files for related work
grep -ri "keyword" docs/research/topics/

# 5. Check for implementation overlap in source code
grep -ri "technique-keyword" packages/nexus-agents/src/
```

### If Found

- **Paper exists:** Read the existing entry, check if it needs updating
- **Technique exists:** Check its status (implemented/planned/not-started)
- **Already implemented:** Do NOT re-research; reference existing implementation
- **Related work found:** Document relationship in `alignments.yaml`

### If Not Found

Proceed with research and document findings per the sections below.

---

## Adding a New Paper

### 1. Add Entry to papers.yaml

Add your paper to `docs/research/registry/papers.yaml`:

```yaml
arxiv-XXXX.XXXXX:
  title: 'Paper Title'
  authors: ['Author 1', 'Author 2']
  source: arxiv # or: conference, journal, preprint
  arxiv_id: 'XXXX.XXXXX'
  url: 'https://arxiv.org/abs/XXXX.XXXXX'
  publication_date: '2025-MM'
  venue: null # or: "ICML 2025", "NeurIPS 2025", etc.

  # Categorization
  topics:
    - consensus # Pick from: consensus, routing, memory, code-generation, cli-tools, orchestration
  tags:
    - relevant-tag-1
    - relevant-tag-2

  # Research tracking
  reviewed_date: '2026-01-07'
  reviewed_in: 'topics/topic-name/README.md'
  summary: |
    Brief 2-3 sentence summary of the paper's contribution.

  key_findings:
    - 'Key finding 1'
    - 'Key finding 2'

  # Implementation relevance
  relevance: high # high, medium, low
  techniques_extracted:
    - technique-id-1
    - technique-id-2

  # GitHub integration
  related_issues: []
  implementation_status: not-started # not-started, planned, in-progress, implemented
```

### 2. Update Topic README

Add the paper to the appropriate topic README in `docs/research/topics/<topic>/README.md`:

1. Add to the "Key Papers" table
2. If extracting a technique, add to "Recommended Techniques" section
3. Update "Implementation Roadmap" if relevant

### 3. Extract Techniques (if applicable)

If the paper introduces a technique we might implement, add to `docs/research/registry/techniques.yaml`:

```yaml
technique-id:
  name: 'Technique Name'
  description: |
    Clear description of what this technique does.

  source_papers:
    - arxiv-XXXX.XXXXX

  topic: consensus # Single topic
  tags:
    - tag-1
    - tag-2

  metrics:
    key_metric: 'value'

  status: not-started # not-started, planned, in-progress, implemented, rejected
  priority: P2 # P1, P2, P3, P4, or null
  complexity: medium # low, medium, high

  integration_files:
    - 'packages/nexus-agents/src/path/to/file.ts'

  implementation_issue: null # GitHub issue number
  related_prs: []

  notes: |
    Implementation notes and considerations.

  dependencies: [] # Other techniques that must be done first

  decision_history: []
```

---

## Adding a Non-Paper Source

For product documentation, specifications, or blog posts, add to `docs/research/registry/sources.yaml`:

```yaml
source-id:
  name: 'Source Name'
  type: product_docs # product_docs, specification, research_blog, code_analysis
  url: 'https://...'
  vendor: 'Company Name'

  topics:
    - cli-tools
  tags:
    - tag-1

  reviewed_date: '2026-01-07'
  reviewed_in: 'topics/cli-tools/source-name.md'

  key_info:
    - 'Key information 1'
    - 'Key information 2'

  version_checked: '1.2.3' # Version/date when reviewed
```

---

## Priority Definitions

| Priority | Definition                                       | Examples                      |
| -------- | ------------------------------------------------ | ----------------------------- |
| **P1**   | High impact, direct fit for current architecture | Aegean consensus, IPR routing |
| **P2**   | Medium impact or requires moderate changes       | TOPSIS scoring, Mem0 memory   |
| **P3**   | Lower impact or requires significant changes     | BET compression, LatentMAS    |
| **P4**   | Infrastructure-level or long-term                | xKV cache, RL orchestrator    |

---

## Research Protocol v2

**Dogfooded 2026-01-09:** TRINITY + Reflexion + Consensus.

### Status Lifecycle (4 states)

```
candidate → reviewed → implemented
              ↓
           archived
```

| Status        | Description                              |
| ------------- | ---------------------------------------- |
| `candidate`   | Paper found, needs full review           |
| `reviewed`    | Full read complete, techniques extracted |
| `implemented` | At least one technique implemented       |
| `archived`    | Superseded or no longer relevant         |

### Integration with Self-Development

When the Self-Development workflow runs Phase 2 (RESEARCH):

1. Check `papers.yaml` first before external arXiv search
2. Reuse existing reviews for related papers
3. After implementation, update technique status

### Staleness Detection

Use git history instead of manual tracking:

```bash
# When was this file last updated?
git log -1 --format="%ar" -- docs/research/registry/papers.yaml

# Find papers not touched in 90+ days
git log --since="90 days ago" -- docs/research/registry/
```

### Negative Results Tracking

Document rejected approaches in `registry/negative-results.yaml`:

```yaml
technique-id:
  paper: arxiv-XXXX.XXXXX
  failure_mode: architecture_incompatible | metrics_not_reproduced | unacceptable_tradeoffs
  lessons_learned:
    - 'Key insight from failed implementation'
  reopen_conditions:
    - 'Condition that would make this worth revisiting'
```

This prevents re-researching already-rejected approaches.

---

## Topic Categories

| Topic             | Scope                                              |
| ----------------- | -------------------------------------------------- |
| `consensus`       | Multi-agent decision protocols, voting, agreement  |
| `routing`         | Task-to-model routing, cost optimization, cascades |
| `memory`          | Context compression, long-term memory, caching     |
| `code-generation` | Self-improvement, skill learning, feedback loops   |
| `cli-tools`       | External CLI integration (Claude, Gemini, Codex)   |
| `orchestration`   | Multi-agent coordination, role-based systems       |

---

## Regenerating the Index

After making changes to `papers.yaml` or `techniques.yaml`, regenerate `RESEARCH_INDEX.md`:

```bash
# Regenerate the research index
pnpm research:generate

# Check if index is up to date (useful in CI)
pnpm research:check

# Validate cross-references between papers and techniques
pnpm research:validate
```

The research index is auto-generated from the YAML registry files. Do not edit
`RESEARCH_INDEX.md` manually -- changes will be overwritten on the next generation.

---

## Quality Checklist

Before submitting research updates:

- [ ] Checked for duplicate papers/techniques
- [ ] Added to papers.yaml with all required fields
- [ ] Updated appropriate topic README
- [ ] Extracted techniques if applicable
- [ ] Set appropriate priority and status
- [ ] Linked to GitHub issues if implementation is planned
- [ ] Summary is concise (2-3 sentences)
- [ ] Key findings are specific and measurable

---

## Creating a GitHub Issue for Technique Implementation

When a P1/P2 technique is ready for implementation:

```bash
gh issue create \
  --title "feat: Implement [technique-name]" \
  --body "## Technique

**Name:** [From techniques.yaml]
**Registry ID:** [technique-id]
**Priority:** P1/P2

## Source Papers

- [Paper Title](arxiv-url)

## Expected Benefits

- Metric 1: X% improvement
- Metric 2: Y% reduction

## Integration Points

- \`path/to/file.ts\`

## Acceptance Criteria

- [ ] Technique implemented
- [ ] Tests added
- [ ] Documentation updated
- [ ] techniques.yaml status updated to \`implemented\`" \
  --label "enhancement,technique"
```

Then update `implementation_issue` in techniques.yaml with the issue number.

---

## Using MCP Research Tools

The research system is also accessible via MCP tools, enabling programmatic integration with Claude Desktop and other MCP clients.

### Available MCP Tools

| Tool                      | Description                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `research_query`          | Query registry for status, overlaps, stats, or search                                       |
| `research_add`            | Add a paper by arXiv ID with automatic metadata fetching                                    |
| `research_discover`       | Discover papers/repos from arXiv, GitHub, Semantic Scholar, Papers with Code, and lab feeds |
| `research_analyze`        | Analyze registry for gaps, trends, priorities, or coverage                                  |
| `research_catalog_review` | Review auto-cataloged references found during tool use                                      |

### MCP Usage Examples

**Query registry status:**

```json
{ "tool": "research_query", "arguments": { "action": "status" } }
```

**Add a paper:**

```json
{ "tool": "research_add", "arguments": { "arxivId": "2401.12345", "topic": "consensus" } }
```

**Discover from specific source:**

```json
{
  "tool": "research_discover",
  "arguments": {
    "topic": "multi-agent orchestration",
    "source": "semantic_scholar",
    "maxResults": 5
  }
}
```

**Analyze gaps:**

```json
{ "tool": "research_analyze", "arguments": { "action": "gaps" } }
```

### Research Workflows (MCP)

Research workflows run via the MCP tools listed above (`research_discover`,
`research_analyze`, `research_synthesize`, etc.) — there is no `nexus-agents
research` CLI subcommand. Examples:

- Discover → score → rank: invoke `research_discover` with `topic` + `quality_floor`.
- Auto-file high-quality findings as GitHub issues: chain `research_discover` →
  `research_catalog_review` (sets `action: 'accept'` per reference) → manual
  `gh issue create` once you've sanity-checked the accepted items.
- Prioritised technique backlog: `research_analyze` with `mode: 'gaps'` returns
  topics where coverage is thin against the implementation map.

---

## Questions?

- Check existing topic READMEs for examples
- Review papers.yaml for entry format
- Open an issue for process questions
