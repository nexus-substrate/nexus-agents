# Research Tracking System - Proposal Summary

**For Agent Consensus Vote**
**Date:** 2026-01-07 (ET)

---

## One-Paragraph Summary

This proposal introduces a structured research tracking system consisting of YAML registries (`papers.yaml`, `techniques.yaml`, `sources.yaml`) for machine-queryable metadata, topic-organized Markdown files for human-readable summaries, and an auto-generated master index. The system enables duplicate prevention through structured queries, tracks implementation status from research to deployment, links to GitHub issues, and provides agents with clear protocols for checking existing research before starting new work.

---

## Key Decisions Requiring Vote

### Decision 1: Directory Structure

**Proposal:** Organize research into `topics/` (domain summaries), `registry/` (YAML metadata), and `papers/` (optional deep dives).

**Alternative:** Keep flat structure with all docs in `/docs/research/`.

**Trade-off:** More structure enables better queries but requires migration and maintenance.

### Decision 2: YAML vs Pure Markdown

**Proposal:** Use YAML for structured data (papers, techniques) + Markdown for narrative.

**Alternative:** Pure Markdown with frontmatter for everything.

**Trade-off:** YAML enables automation and queries but requires synchronization with Markdown.

### Decision 3: Auto-Generated Index

**Proposal:** Generate `RESEARCH_INDEX.md` from YAML registries via script.

**Alternative:** Manually maintained index.

**Trade-off:** Auto-generation ensures consistency but requires running script after changes.

### Decision 4: Implementation Status in Registry

**Proposal:** Track technique status (not-started/planned/in-progress/implemented/rejected) in `techniques.yaml`.

**Alternative:** Track only in GitHub issues.

**Trade-off:** Registry provides single source of truth but requires manual updates.

### Decision 5: Migration Strategy

**Proposal:** Move existing docs to `_legacy/`, extract content to new structure, maintain backward compatibility via redirects/links.

**Alternative:** In-place refactoring of existing docs.

**Trade-off:** Clean migration but requires one-time effort.

---

## What This Solves

| Problem                       | Solution                              |
| ----------------------------- | ------------------------------------- |
| No unified index              | Auto-generated `RESEARCH_INDEX.md`    |
| Duplicate research risk       | Query protocol + `papers.yaml` lookup |
| Unclear implementation status | `techniques.yaml` with status field   |
| Topic fragmentation           | Topic-organized directories           |
| GitHub disconnect             | Bidirectional issue linking           |
| Query difficulty              | Structured YAML + query scripts       |

---

## Maintenance Impact

| Activity          | Frequency          | Effort    |
| ----------------- | ------------------ | --------- |
| Add new paper     | Per research       | 5-10 min  |
| Add new technique | Per discovery      | 5-10 min  |
| Update status     | Per milestone      | 2 min     |
| Regenerate index  | After YAML changes | Automated |
| Periodic review   | Monthly            | 30 min    |

---

## Files to Create

1. `docs/research/RESEARCH_INDEX.md` - Auto-generated master index
2. `docs/research/CONTRIBUTING.md` - How to add research
3. `docs/research/registry/papers.yaml` - Paper metadata
4. `docs/research/registry/techniques.yaml` - Technique tracking
5. `docs/research/registry/sources.yaml` - Product docs tracking
6. `docs/research/topics/*/README.md` - Topic summaries
7. `scripts/generate-research-index.ts` - Index generator

---

## Estimated Implementation Effort

| Phase        | Duration   | Description                        |
| ------------ | ---------- | ---------------------------------- |
| Setup        | 1 day      | Create structure, schemas, scripts |
| Migration    | 2 days     | Extract from 8 existing docs       |
| Verification | 1 day      | Link issues, test queries          |
| **Total**    | **4 days** |                                    |

---

## Voting Recommendation

**Recommend: APPROVE**

This proposal directly addresses the six identified problems with reasonable maintenance overhead. The YAML+Markdown approach balances structure with readability. Migration can be done incrementally without blocking other work.

---

## How to Vote

Each agent should review the research tracking proposal and vote:

- **APPROVE**: Accept proposal as-is
- **APPROVE WITH AMENDMENTS**: Accept with specific changes
- **DISSENT**: Reject with rationale
- **ABSTAIN**: No opinion

Include reasoning for your vote.

---

**Full Proposal:** _(RESEARCH_TRACKING_PROPOSAL.md — archived after implementation)_
