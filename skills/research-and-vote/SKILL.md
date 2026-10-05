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
  - skills/references/orchestration-patterns.md (consensus, fan-out, retry policies)
-->

**Full documentation:**

- [CONSENSUS_PROTOCOLS.md](../../docs/architecture/CONSENSUS_PROTOCOLS.md)
- [Research CONTRIBUTING.md](../../docs/research/CONTRIBUTING.md)

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

**Voting Agents (full 7-seat panel):** Architect, Security, DevEx, AI/ML, PM,
Catfish, Scope Steward

**Thresholds:**

| Decision Type        | Threshold                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Reversible changes   | Majority                                                                                        |
| Architecture         | Supermajority                                                                                   |
| Security-critical    | Supermajority                                                                                   |
| Breaking API changes | Supermajority (≥5 of 7 on a full panel) AND no unresolved concrete-defect dissent from any seat |

See [CONSENSUS_PROTOCOLS.md](../../docs/architecture/CONSENSUS_PROTOCOLS.md) for protocol selection matrix.
For breaking API changes, pass `strategy: 'supermajority'` and
`errorPolicy: 'absolute_quorum'`; verify full-panel coverage and record dissent
and resolution in the vote ledger record plus the PR comment. Concrete-defect
dissent and resolution are defined in [`.rules/governance.md`](../../.rules/governance.md).

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

## Anti-rationalization — Research and vote

| Excuse                              | Counter                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| "I already know the answer"         | Then write up the alternatives anyway. The vote isn't to discover the answer; it's to surface what you missed.                              |
| "Skip the research, just vote"      | A vote without research surfaces opinion, not informed judgment. Cite primary sources.                                                      |
| "Simulated votes are fine for this" | Per CLAUDE.md and memory: simulated votes are random. Never use for real decisions.                                                         |
| "Review would be too slow"          | Breaking API changes require ≥5 of 7 on a full panel AND no unresolved concrete-defect dissent from any seat. Match the bar to the trigger. |
| "We can revisit if it's wrong"      | Some decisions are expensive to reverse (data shape, public API, dep choice). Apply higher threshold accordingly.                           |

## Red flags

- Proposal lists no alternatives or only "do X / do nothing"
- Voter reasoning is one sentence ("approve") with no specific cite
- `simulateVotes: true` for anything other than unit tests
- Vote happens before research is done
- Decision recorded but no GitHub issue or commit links the vote

## Verification checklist

- [ ] Research cites primary sources (official docs, RFCs, papers — not blog posts only)
- [ ] At least 2 alternatives considered with why-rejected reasoning
- [ ] `consensus_vote` ran with real CLIs (`simulateVotes: false`)
- [ ] Threshold matches decision type (majority / supermajority / unanimous)
- [ ] Breaking API vote has ≥5 approvals on a full 7-seat panel; every concrete-defect dissent is resolved or explained as inapplicable in the vote ledger record plus the PR comment
- [ ] Decision Record posted as a GitHub issue or comment with voter cites
- [ ] Voter reasoning includes confidence and specific cites — no rubber-stamps
