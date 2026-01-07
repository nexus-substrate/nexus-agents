# Research Tracking System Proposal

**Version:** 1.0.0
**Date:** 2026-01-07 (ET)
**Status:** Draft for Agent Consensus Vote
**Author:** Architecture Agent

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Proposed Solution](#2-proposed-solution)
3. [Directory Structure](#3-directory-structure)
4. [File Formats and Schemas](#4-file-formats-and-schemas)
5. [Master Index Design](#5-master-index-design)
6. [Technique Registry](#6-technique-registry)
7. [Duplicate Prevention System](#7-duplicate-prevention-system)
8. [GitHub Integration](#8-github-integration)
9. [Query Interface](#9-query-interface)
10. [Migration Plan](#10-migration-plan)
11. [Maintenance Procedures](#11-maintenance-procedures)
12. [Trade-offs and Alternatives](#12-trade-offs-and-alternatives)

---

## 1. Problem Statement

### Current State Analysis

The nexus-agents project has accumulated 8 research documents in `/docs/research/`:

| Document                             | Topics Covered                   | Papers Referenced       | Implementation Status |
| ------------------------------------ | -------------------------------- | ----------------------- | --------------------- |
| `claude-code-research.md`            | CLI integration, MCP, models     | 0 papers, product docs  | Informational         |
| `claude-flow-analysis.md`            | Consensus, memory, orchestration | 0 papers, code analysis | Pattern reference     |
| `cli-integration-architecture.md`    | Transport, parsing, versioning   | 0 papers, product docs  | Active development    |
| `gemini-cli-research.md`             | CLI integration, MCP, models     | 0 papers, product docs  | Informational         |
| `multi-agent-coordination.md`        | Routing, consensus, hybrid arch  | 11 arXiv papers         | Roadmap planned       |
| `multi-agent-improvements-2025.md`   | Routing, consensus, memory       | 15 arXiv papers         | Priority matrix       |
| `openai-codex-cli-research.md`       | CLI integration, MCP, models     | 0 papers, product docs  | Informational         |
| `self-improvement-feedback-loops.md` | Self-refine, skills, feedback    | 17 arXiv papers         | Phased roadmap        |

### Identified Problems

1. **No Unified Index**: Finding whether a paper has been reviewed requires searching all files
2. **Duplicate Research Risk**: Multiple agents may research the same paper independently
3. **Implementation Status Unclear**: No tracking of which techniques are implemented vs. planned
4. **Topic Fragmentation**: Related techniques scattered across multiple documents
5. **GitHub Disconnect**: No link between research findings and implementation issues
6. **Query Difficulty**: No structured way to ask "What research exists on X?"

### Requirements

1. **R1**: Quick lookup to check if a paper/technique has been researched
2. **R2**: Clear categorization by topic domain
3. **R3**: Track implementation status (not-started, planned, in-progress, implemented)
4. **R4**: Link research to GitHub issues for implementation tracking
5. **R5**: Support both academic papers and product documentation research
6. **R6**: Enable agents to query before starting new research
7. **R7**: Minimize maintenance overhead

---

## 2. Proposed Solution

### Core Concepts

```
                    +------------------+
                    | RESEARCH_INDEX.md|  <-- Master index (auto-generated)
                    +------------------+
                            |
        +-------------------+-------------------+
        |                   |                   |
+---------------+   +---------------+   +---------------+
| topics/       |   | papers/       |   | techniques/   |
| consensus.md  |   | arxiv-2501.md |   | REGISTRY.yaml |
| routing.md    |   | arxiv-2502.md |   +---------------+
| memory.md     |   +---------------+
| cli-tools.md  |
+---------------+
```

**Design Principles:**

1. **Single Source of Truth**: YAML registry for structured data, Markdown for narrative
2. **Separation of Concerns**: Topics (domain knowledge) vs. Techniques (implementations)
3. **Incremental Adoption**: Works alongside existing docs during migration
4. **Agent-Friendly**: Query patterns documented for agent use

---

## 3. Directory Structure

```
docs/research/
|-- RESEARCH_INDEX.md           # Auto-generated master index
|-- CONTRIBUTING.md             # How to add new research
|
|-- topics/                     # Domain-organized research summaries
|   |-- consensus/
|   |   |-- README.md           # Topic overview and key findings
|   |   |-- voting-protocols.md # Specific sub-topic
|   |   `-- byzantine-fault.md
|   |
|   |-- routing/
|   |   |-- README.md
|   |   |-- capability-matching.md
|   |   `-- cost-optimization.md
|   |
|   |-- memory/
|   |   |-- README.md
|   |   |-- context-compression.md
|   |   `-- long-term-memory.md
|   |
|   |-- code-generation/
|   |   |-- README.md
|   |   |-- self-improvement.md
|   |   `-- test-generation.md
|   |
|   |-- cli-tools/
|   |   |-- README.md           # Cross-CLI patterns
|   |   |-- claude-cli.md
|   |   |-- gemini-cli.md
|   |   `-- codex-cli.md
|   |
|   `-- orchestration/
|       |-- README.md
|       |-- multi-agent.md
|       `-- task-distribution.md
|
|-- papers/                     # Individual paper summaries (optional detail)
|   |-- arxiv-2501.06322.md     # If deep dive needed
|   `-- arxiv-2504.19413.md
|
|-- registry/
|   |-- papers.yaml             # All papers with metadata
|   |-- techniques.yaml         # All techniques with status
|   `-- sources.yaml            # Product docs and other sources
|
`-- _legacy/                    # Moved existing docs during migration
    |-- claude-code-research.md
    |-- multi-agent-coordination.md
    `-- ...
```

---

## 4. File Formats and Schemas

### 4.1 Papers Registry (`registry/papers.yaml`)

```yaml
# registry/papers.yaml
# Schema version for future migrations
schema_version: '1.0'

papers:
  # Key format: source-identifier (e.g., arxiv-2501.06322)
  arxiv-2501.06322:
    title: 'Multi-Agent Collaboration Mechanisms: A Survey of LLMs'
    authors: ['Author 1', 'Author 2']
    source: arxiv
    arxiv_id: '2501.06322'
    url: 'https://arxiv.org/abs/2501.06322'
    publication_date: 2025-01
    venue: null # arxiv preprint

    # Categorization
    topics:
      - consensus
      - orchestration
    tags:
      - multi-agent
      - collaboration
      - survey

    # Research tracking
    reviewed_date: 2026-01-06
    reviewed_in: 'topics/consensus/README.md'
    summary: |
      Taxonomy of collaboration types (cooperation, competition, coopetition)
      and coordination strategies for LLM multi-agent systems.

    # Key findings for quick reference
    key_findings:
      - 'Three coordination strategies: rule-based, role-based, model-based'
      - 'Recommend hybrid rule+model coordination'

    # Implementation relevance
    relevance: high # high, medium, low
    techniques_extracted:
      - rule-based-coordination
      - role-based-protocols

    # GitHub integration
    related_issues: []
    implementation_status: not-started # not-started, planned, in-progress, implemented

  arxiv-2504.19413:
    title: 'Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory'
    authors: ['Mem0 Team']
    source: arxiv
    arxiv_id: '2504.19413'
    url: 'https://arxiv.org/abs/2504.19413'
    publication_date: 2025-04
    venue: null

    topics:
      - memory
    tags:
      - long-term-memory
      - graph-memory
      - production

    reviewed_date: 2026-01-06
    reviewed_in: 'topics/memory/long-term-memory.md'
    summary: |
      Scalable memory architecture achieving 91% latency reduction
      and 90% token savings.

    key_findings:
      - '91% lower p95 latency vs full-context'
      - '90% token cost savings'
      - 'Graph-based variant: +2% performance'

    relevance: high
    techniques_extracted:
      - mem0-memory-architecture
      - graph-based-memory

    related_issues:
      - 101 # Memory architecture issue
    implementation_status: planned
```

### 4.2 Techniques Registry (`registry/techniques.yaml`)

```yaml
# registry/techniques.yaml
schema_version: '1.0'

techniques:
  # Key: technique identifier (kebab-case)
  aegean-consensus:
    name: 'Aegean Consensus Protocol'
    description: |
      Formal consensus protocol for stochastic reasoning with
      incremental quorum detection.

    # Source tracking
    source_papers:
      - arxiv-2512.20184

    # Categorization
    topic: consensus
    tags:
      - formal-verification
      - quorum
      - streaming

    # Performance claims (from papers)
    metrics:
      latency_reduction: '1.2x-20x'
      token_reduction: '4.4x'
      quality_impact: 'within 2.5% of baseline'

    # Implementation tracking
    status: planned # not-started, planned, in-progress, implemented, rejected
    priority: P1 # P1, P2, P3, P4
    complexity: medium # low, medium, high

    # Integration points
    integration_files:
      - 'packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts'

    # GitHub tracking
    implementation_issue: 100
    related_prs: []

    # Implementation notes
    notes: |
      Direct replacement for current heuristic consensus.
      Implement early termination when quorum reached.

    # Prerequisites
    dependencies: []

    # Decision audit trail
    decision_history:
      - date: 2026-01-06
        decision: 'Added to roadmap Phase 1'
        rationale: 'High impact, direct replacement for existing module'

  topsis-routing:
    name: 'TOPSIS Multi-Criteria Routing'
    description: |
      Multi-criteria decision algorithm for Pareto-optimal
      model selection (performance vs cost).

    source_papers:
      - arxiv-2509.07571 # MoMA paper

    topic: routing
    tags:
      - cost-optimization
      - multi-criteria

    metrics:
      cost_reduction: '31.46%'

    status: planned
    priority: P2
    complexity: medium

    integration_files:
      - 'packages/nexus-agents/src/agents/experts/expert-selector.ts'

    implementation_issue: null # Needs issue creation
    related_prs: []

    notes: |
      Requires adding cost/latency to ExpertDefinition first.

    dependencies:
      - expert-cost-modeling # Another technique that must be done first

  # Rejected technique example
  latent-space-sharing:
    name: 'LatentMAS Latent Space Collaboration'
    description: |
      Direct collaboration through hidden state sharing between agents.

    source_papers:
      - arxiv-2511.20639

    topic: orchestration
    tags:
      - inter-agent-communication
      - embedding

    metrics:
      accuracy_improvement: 'up to 14.6%'
      token_reduction: '70.8%-83.7%'

    status: rejected
    priority: null
    complexity: high

    integration_files: []
    implementation_issue: null
    related_prs: []

    notes: |
      Requires same-model deployment for embedding compatibility.
      Not applicable to hybrid CLI architecture.

    dependencies: []

    decision_history:
      - date: 2026-01-07
        decision: 'Rejected for current architecture'
        rationale: 'Requires same-model agents; hybrid CLI arch uses different models'
```

### 4.3 Sources Registry (`registry/sources.yaml`)

```yaml
# registry/sources.yaml
# For product documentation and non-paper sources
schema_version: '1.0'

sources:
  claude-code-docs:
    name: 'Claude Code Documentation'
    type: product_docs
    url: 'https://code.claude.com/docs'
    vendor: Anthropic

    topics:
      - cli-tools
    tags:
      - claude
      - mcp
      - cli

    reviewed_date: 2026-01-04
    reviewed_in: 'topics/cli-tools/claude-cli.md'

    key_info:
      - 'Models: Opus 4.5, Sonnet 4.5, Haiku 4.5'
      - 'Full MCP client support'
      - 'Session resume via --continue/--resume'

    version_checked: '2.0.76' # Version when reviewed

  mcp-protocol-spec:
    name: 'MCP Protocol Specification'
    type: specification
    url: 'https://modelcontextprotocol.io'
    vendor: Anthropic

    topics:
      - cli-tools
      - orchestration
    tags:
      - protocol
      - mcp
      - standard

    reviewed_date: 2026-01-04
    reviewed_in: 'topics/cli-tools/README.md'

    key_info:
      - 'Version 2025-11-25'
      - 'Transports: stdio, HTTP, SSE'
      - 'Tool, Resource, Prompt support'

    version_checked: '2025-11-25'
```

### 4.4 Topic README Template

```markdown
# [Topic Name]

**Last Updated:** YYYY-MM-DD (ET)
**Status:** Active Research

---

## Overview

[2-3 sentence description of this research topic and why it matters for nexus-agents]

## Key Papers

| Paper        | Key Contribution | Priority | Status  |
| ------------ | ---------------- | -------- | ------- |
| [Title](url) | One-line summary | P1       | planned |

## Recommended Techniques

### High Priority (P1)

#### [Technique Name]

- **Source:** [Paper Name](url)
- **Key Metrics:** X% improvement in Y
- **Integration Point:** `path/to/file.ts`
- **GitHub Issue:** #NNN

[2-3 sentences on what this technique does and why we should implement it]

### Medium Priority (P2)

...

## Implementation Roadmap

1. **Phase 1 (vX.Y.0):** [Technique 1], [Technique 2]
2. **Phase 2 (vX.Y+1.0):** [Technique 3]

## Related Topics

- [Other Topic](../other-topic/README.md)

## References

- Paper citations
- Documentation links
```

---

## 5. Master Index Design

### Auto-Generated Index (`RESEARCH_INDEX.md`)

The master index is generated from YAML registries to ensure consistency.

```markdown
# Nexus-Agents Research Index

**Auto-generated:** 2026-01-07 14:30 ET
**Total Papers:** 43 | **Techniques:** 27 | **Topics:** 6

---

## Quick Stats

| Status      | Papers | Techniques |
| ----------- | ------ | ---------- |
| Implemented | 2      | 3          |
| In Progress | 5      | 4          |
| Planned     | 20     | 12         |
| Not Started | 16     | 8          |

## Topics

| Topic                                               | Papers | Techniques | Latest Update |
| --------------------------------------------------- | ------ | ---------- | ------------- |
| [Consensus](topics/consensus/README.md)             | 8      | 5          | 2026-01-06    |
| [Routing](topics/routing/README.md)                 | 12     | 7          | 2026-01-06    |
| [Memory](topics/memory/README.md)                   | 6      | 4          | 2026-01-06    |
| [Code Generation](topics/code-generation/README.md) | 9      | 6          | 2026-01-06    |
| [CLI Tools](topics/cli-tools/README.md)             | 3      | 2          | 2026-01-04    |
| [Orchestration](topics/orchestration/README.md)     | 5      | 3          | 2026-01-04    |

## Papers by Priority

### High Priority (P1)

| Paper                                                | Topic     | Techniques             | Status  | Issue |
| ---------------------------------------------------- | --------- | ---------------------- | ------- | ----- |
| [Aegean Consensus](https://arxiv.org/abs/2512.20184) | consensus | aegean-consensus       | planned | #100  |
| [IPR Routing](https://arxiv.org/abs/2509.06274)      | routing   | ipr-quality-estimators | planned | #102  |

### Medium Priority (P2)

...

## Recently Added

| Date       | Paper | Topic   |
| ---------- | ----- | ------- |
| 2026-01-06 | SATER | routing |
| 2026-01-06 | MIRIX | memory  |

## Alphabetical Paper Index

- [Aegean](https://arxiv.org/abs/2512.20184) - consensus
- [BET](https://arxiv.org/abs/2511.23271) - memory
- [CP-WBFT](https://arxiv.org/abs/2511.10400) - consensus
  ...

## Search Tags

`#consensus` `#routing` `#memory` `#cost-optimization` `#multi-agent`
`#self-improvement` `#context-compression` `#graph-memory` `#byzantine`
```

### Index Generation Script

```typescript
// scripts/generate-research-index.ts
import * as yaml from 'yaml';
import * as fs from 'fs/promises';

interface Paper {
  /* from schema */
}
interface Technique {
  /* from schema */
}

async function generateIndex(): Promise<void> {
  const papers = yaml.parse(await fs.readFile('docs/research/registry/papers.yaml', 'utf-8'));
  const techniques = yaml.parse(
    await fs.readFile('docs/research/registry/techniques.yaml', 'utf-8')
  );

  const stats = calculateStats(papers, techniques);
  const topicSummaries = generateTopicSummaries(papers, techniques);
  const priorityLists = generatePriorityLists(papers, techniques);
  const recentlyAdded = getRecentlyAdded(papers);
  const alphabeticalIndex = generateAlphabeticalIndex(papers);
  const searchTags = extractAllTags(papers, techniques);

  const markdown = renderMarkdown({
    generatedAt: new Date().toISOString(),
    stats,
    topicSummaries,
    priorityLists,
    recentlyAdded,
    alphabeticalIndex,
    searchTags,
  });

  await fs.writeFile('docs/research/RESEARCH_INDEX.md', markdown);
}
```

---

## 6. Technique Registry

### Status Lifecycle

```
                 +-------------+
                 | not-started |
                 +------+------+
                        |
          +-------------+-------------+
          |                           |
          v                           v
   +------+------+             +------+------+
   |   planned   |             |  rejected   |
   +------+------+             +-------------+
          |
          v
   +------+------+
   | in-progress |
   +------+------+
          |
          v
   +------+------+
   | implemented |
   +-------------+
```

### Priority Definitions

| Priority | Definition                                       | Examples                        |
| -------- | ------------------------------------------------ | ------------------------------- |
| **P1**   | High impact, direct fit for current architecture | Aegean consensus, IPR routing   |
| **P2**   | Medium impact or requires moderate changes       | TOPSIS scoring, cascade routing |
| **P3**   | Lower impact or requires significant changes     | BET compression, LatentMAS      |
| **P4**   | Infrastructure-level or long-term                | xKV cache, RL orchestrator      |

### Complexity Definitions

| Complexity | Effort    | Integration Risk                  |
| ---------- | --------- | --------------------------------- |
| **low**    | 1-2 days  | Drop-in replacement               |
| **medium** | 3-7 days  | New module or significant changes |
| **high**   | 2-4 weeks | Architectural changes required    |

---

## 7. Duplicate Prevention System

### Query Before Research

Before starting new research, agents should:

1. **Check Papers Registry:**

   ```bash
   grep -i "paper-title-or-arxiv-id" docs/research/registry/papers.yaml
   ```

2. **Check Techniques Registry:**

   ```bash
   grep -i "technique-name" docs/research/registry/techniques.yaml
   ```

3. **Search Topic Files:**
   ```bash
   grep -ri "keyword" docs/research/topics/
   ```

### Agent Query Protocol

```markdown
## Before Researching a New Paper

1. Check if arxiv ID exists:
   - Open `docs/research/registry/papers.yaml`
   - Search for the arxiv ID (e.g., "2501.06322")

2. If not found, check by title keywords:
   - Search for key title words in papers.yaml

3. If still not found, proceed with research and add entry

## Before Proposing a New Technique

1. Check if technique exists:
   - Open `docs/research/registry/techniques.yaml`
   - Search for technique name or similar terms

2. Check for related techniques:
   - Look at the topic section for related work

3. If implementing existing technique, update status instead of creating new
```

### Duplicate Detection Script

```typescript
// scripts/check-duplicate.ts
// Run: pnpm check-research "arxiv:2501.06322" or "technique:aegean-consensus"

async function checkDuplicate(query: string): Promise<DuplicateResult> {
  const [type, value] = query.split(':');

  if (type === 'arxiv') {
    return checkPaperDuplicate(value);
  } else if (type === 'technique') {
    return checkTechniqueDuplicate(value);
  } else {
    return searchAll(value);
  }
}

interface DuplicateResult {
  found: boolean;
  matches: Array<{
    type: 'paper' | 'technique' | 'source';
    id: string;
    location: string;
    summary: string;
  }>;
  suggestions: string[];
}
```

---

## 8. GitHub Integration

### Issue Labels

| Label                | Purpose                  |
| -------------------- | ------------------------ |
| `research`           | Research task            |
| `research:routing`   | Routing research         |
| `research:consensus` | Consensus research       |
| `research:memory`    | Memory research          |
| `technique`          | Technique implementation |
| `technique:P1`       | High priority technique  |

### Issue Templates

```markdown
## <!-- .github/ISSUE_TEMPLATE/technique-implementation.md -->

name: Technique Implementation
about: Implement a researched technique
labels: technique

---

## Technique

**Name:** [From techniques.yaml]
**Registry ID:** [technique-id]
**Priority:** P1/P2/P3/P4

## Source Papers

- [Paper Title](arxiv-url)

## Expected Benefits

- Metric 1: X% improvement
- Metric 2: Y% reduction

## Implementation Plan

1. Step 1
2. Step 2

## Integration Points

- `path/to/file.ts`

## Acceptance Criteria

- [ ] Technique implemented
- [ ] Tests added
- [ ] Documentation updated
- [ ] techniques.yaml status updated to `implemented`
```

### Bidirectional Linking

**In techniques.yaml:**

```yaml
implementation_issue: 123
related_prs: [456, 789]
```

**In GitHub Issue:**

```markdown
## Research Reference

- **Registry:** `docs/research/registry/techniques.yaml#aegean-consensus`
- **Topic:** [Consensus](docs/research/topics/consensus/README.md)
- **Papers:** [Aegean](https://arxiv.org/abs/2512.20184)
```

### Automation Hooks

```yaml
# .github/workflows/research-sync.yml
name: Research Sync

on:
  push:
    paths:
      - 'docs/research/registry/*.yaml'

jobs:
  regenerate-index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm generate-research-index
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/research/RESEARCH_INDEX.md
          git commit -m "chore: regenerate research index" || exit 0
          git push
```

---

## 9. Query Interface

### Common Queries

**Find all P1 techniques:**

```bash
grep -A 20 "priority: P1" docs/research/registry/techniques.yaml
```

**Find papers on a topic:**

```bash
grep -B 5 "topics:" docs/research/registry/papers.yaml | grep -A 5 "consensus"
```

**Find implemented techniques:**

```bash
grep -B 10 "status: implemented" docs/research/registry/techniques.yaml
```

### Query Script

```typescript
// scripts/query-research.ts
// Usage: pnpm query-research --topic consensus --status planned

interface QueryOptions {
  topic?: string;
  status?: string;
  priority?: string;
  tag?: string;
  keyword?: string;
}

async function queryResearch(options: QueryOptions): Promise<void> {
  const papers = await loadPapers();
  const techniques = await loadTechniques();

  const filteredPapers = papers.filter((p) => {
    if (options.topic && !p.topics.includes(options.topic)) return false;
    if (options.status && p.implementation_status !== options.status) return false;
    if (options.tag && !p.tags.includes(options.tag)) return false;
    if (options.keyword && !matchesKeyword(p, options.keyword)) return false;
    return true;
  });

  console.log(formatResults(filteredPapers, techniques));
}
```

### Agent Query Prompt

```markdown
## Querying Research Before New Work

Before starting research on topic X, run:

1. "Is there existing research on [topic]?"
   - Check RESEARCH_INDEX.md Topics section
   - Read topic README if exists

2. "Has paper [arxiv-id] been reviewed?"
   - Search papers.yaml for the ID

3. "What techniques exist for [capability]?"
   - Search techniques.yaml by topic/tags
   - Check integration_files for implementation status

4. "What's the implementation status of [technique]?"
   - Look up technique in techniques.yaml
   - Check related GitHub issue if linked
```

---

## 10. Migration Plan

### Phase 1: Setup (Day 1)

1. Create directory structure
2. Create registry YAML files with schema
3. Create CONTRIBUTING.md
4. Create index generation script

### Phase 2: Migrate Existing Content (Days 2-3)

1. Parse existing research docs
2. Extract paper references to papers.yaml
3. Extract techniques to techniques.yaml
4. Create topic READMEs from existing content
5. Move legacy files to `_legacy/`

### Phase 3: Link and Verify (Day 4)

1. Link techniques to existing GitHub issues
2. Generate initial RESEARCH_INDEX.md
3. Verify all links work
4. Update CLAUDE.md with research query instructions

### Migration Script

```typescript
// scripts/migrate-research.ts

interface LegacyDoc {
  path: string;
  title: string;
  papers: ExtractedPaper[];
  techniques: ExtractedTechnique[];
}

async function migrateResearch(): Promise<void> {
  const legacyDocs = await findLegacyDocs();

  for (const doc of legacyDocs) {
    const parsed = await parseLegacyDoc(doc);

    // Extract papers
    for (const paper of parsed.papers) {
      await addToPapersRegistry(paper);
    }

    // Extract techniques
    for (const technique of parsed.techniques) {
      await addToTechniquesRegistry(technique);
    }

    // Create topic files
    await createTopicFiles(parsed);
  }

  // Move legacy files
  await moveLegacyFiles(legacyDocs);

  // Generate index
  await generateIndex();
}
```

---

## 11. Maintenance Procedures

### Adding New Research

1. **Add paper to registry:**

   ```yaml
   # papers.yaml
   arxiv-XXXX.XXXXX:
     title: '...'
     # ... fill all fields
   ```

2. **Add techniques if applicable:**

   ```yaml
   # techniques.yaml
   new-technique:
     name: '...'
     source_papers:
       - arxiv-XXXX.XXXXX
     # ... fill all fields
   ```

3. **Update or create topic file:**
   - Add paper to topic README
   - Add technique to appropriate section

4. **Regenerate index:**

   ```bash
   pnpm generate-research-index
   ```

5. **Create implementation issue if P1/P2:**
   - Use technique implementation template
   - Link issue number in techniques.yaml

### Updating Implementation Status

1. When starting implementation:

   ```yaml
   status: in-progress
   implementation_issue: NNN
   ```

2. When completing implementation:

   ```yaml
   status: implemented
   related_prs: [NNN]
   ```

3. Regenerate index

### Periodic Review

**Monthly:**

- Review planned techniques for priority changes
- Update version_checked for product docs
- Archive stale research (>1 year, not-started)

**Quarterly:**

- Full index audit
- Remove broken links
- Update roadmap alignment

---

## 12. Trade-offs and Alternatives

### Chosen Approach: YAML Registry + Markdown Topics

**Pros:**

- Structured data for queries and automation
- Human-readable Markdown for narrative
- Version control friendly
- No external database needed
- Works with existing tooling

**Cons:**

- Manual synchronization between YAML and Markdown
- Index regeneration needed after changes
- YAML schema changes require migration

### Alternative 1: Pure Markdown with Frontmatter

```markdown
---
arxiv_id: '2501.06322'
topics: [consensus]
status: planned
---

# Paper Title

Content...
```

**Why Not Chosen:**

- Harder to query across files
- No single source of truth for metadata
- More duplication

### Alternative 2: SQLite Database

**Why Not Chosen:**

- Harder to review in PRs
- Requires additional tooling
- Overkill for current scale (~100 papers)

### Alternative 3: JSON Registry

**Why Not Chosen:**

- Less human-readable than YAML
- Harder to add comments
- No significant advantages for this use case

---

## Appendix A: Full YAML Schemas

### Papers Schema

```yaml
# JSON Schema for papers.yaml entries
type: object
required:
  - title
  - source
  - url
  - topics
  - reviewed_date
  - reviewed_in
  - summary
  - relevance
  - implementation_status
properties:
  title:
    type: string
  authors:
    type: array
    items:
      type: string
  source:
    type: string
    enum: [arxiv, conference, journal, preprint]
  arxiv_id:
    type: string
    pattern: "^\\d{4}\\.\\d{4,5}(v\\d+)?$"
  url:
    type: string
    format: uri
  publication_date:
    type: string
    pattern: "^\\d{4}(-\\d{2})?$"
  venue:
    type: string
    nullable: true
  topics:
    type: array
    items:
      type: string
      enum: [consensus, routing, memory, code-generation, cli-tools, orchestration]
  tags:
    type: array
    items:
      type: string
  reviewed_date:
    type: string
    format: date
  reviewed_in:
    type: string
  summary:
    type: string
  key_findings:
    type: array
    items:
      type: string
  relevance:
    type: string
    enum: [high, medium, low]
  techniques_extracted:
    type: array
    items:
      type: string
  related_issues:
    type: array
    items:
      type: integer
  implementation_status:
    type: string
    enum: [not-started, planned, in-progress, implemented]
```

### Techniques Schema

```yaml
# JSON Schema for techniques.yaml entries
type: object
required:
  - name
  - description
  - source_papers
  - topic
  - status
properties:
  name:
    type: string
  description:
    type: string
  source_papers:
    type: array
    items:
      type: string
  topic:
    type: string
    enum: [consensus, routing, memory, code-generation, cli-tools, orchestration]
  tags:
    type: array
    items:
      type: string
  metrics:
    type: object
    additionalProperties:
      type: string
  status:
    type: string
    enum: [not-started, planned, in-progress, implemented, rejected]
  priority:
    type: string
    enum: [P1, P2, P3, P4]
    nullable: true
  complexity:
    type: string
    enum: [low, medium, high]
  integration_files:
    type: array
    items:
      type: string
  implementation_issue:
    type: integer
    nullable: true
  related_prs:
    type: array
    items:
      type: integer
  notes:
    type: string
  dependencies:
    type: array
    items:
      type: string
  decision_history:
    type: array
    items:
      type: object
      properties:
        date:
          type: string
          format: date
        decision:
          type: string
        rationale:
          type: string
```

---

## Appendix B: Voting Ballot

### Agent Votes Required

| Agent Role | Vote Weight | Focus Area                        |
| ---------- | ----------- | --------------------------------- |
| Architect  | 1.5         | Overall structure                 |
| Security   | 1.0         | Access patterns, data exposure    |
| DevEx      | 1.0         | Usability, maintenance burden     |
| AI/ML      | 1.0         | Query patterns, agent integration |
| PM         | 0.5         | Roadmap alignment                 |

### Voting Criteria

1. **Does this solve the stated problems?** (R1-R7)
2. **Is the maintenance burden acceptable?**
3. **Does it integrate well with existing workflows?**
4. **Are there security concerns?**
5. **Is the migration path reasonable?**

### Decision Thresholds

- **Approval:** Supermajority (>=4/5 weighted votes)
- **With Amendments:** Majority (>50% weighted votes) + amendment acceptance
- **Rejection:** <50% weighted votes

---

**Document Status:** Ready for Agent Consensus Vote
**Proposed By:** Architecture Agent
**Review Deadline:** 2026-01-08 (ET)
