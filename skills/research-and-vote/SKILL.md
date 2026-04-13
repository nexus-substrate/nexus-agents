---
name: research-and-vote
description: |
  Research a topic using multiple sources and conduct multi-agent voting.
  Use when making architectural decisions, choosing dependencies, or
  designing APIs. Triggers on "research", "decide", "vote on", "consensus".
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, Task
context: fork
---

# Research and Vote Skill

<!-- CANONICAL SOURCES:
  - docs/architecture/CONSENSUS_PROTOCOLS.md
  - docs/research/CONTRIBUTING.md
  - CLAUDE.md Consensus Voting Protocol
-->

**Full documentation:**

- [CONSENSUS_PROTOCOLS.md](../../../docs/architecture/CONSENSUS_PROTOCOLS.md)
- [Research CONTRIBUTING.md](../../../docs/research/CONTRIBUTING.md)

## Process

### Phase 1: Research

1. Check research registry first: `grep -ri "keyword" docs/research/`
2. Gather primary sources (official docs, specs, RFCs)
3. Document findings with source links

### Phase 2: Proposal

Create proposal with:

- Problem statement
- Proposed solution
- Alternatives considered
- Trade-offs

### Phase 3: Voting

**Voting Agents:** Architect, Security, DevEx, AI/ML, PM

**Thresholds:**
| Decision Type | Threshold |
| ------------------ | ------------- |
| Reversible changes | Majority |
| Architecture | Supermajority |
| Security-critical | Unanimous |

See [CONSENSUS_PROTOCOLS.md](../../../docs/architecture/CONSENSUS_PROTOCOLS.md) for protocol selection matrix.

### Phase 4: Documentation

Record decision in GitHub issue with voting record.

## Output Format

```markdown
# Decision Record: [Topic]

## Status: [Approved/Rejected]

## Voting Record

| Agent | Vote | Reasoning |
| ----- | ---- | --------- |
```
