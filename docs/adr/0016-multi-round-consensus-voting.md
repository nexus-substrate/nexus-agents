# ADR 0016: Multi-Round Consensus Voting

**Status:** Accepted
**Date:** 2026-02-26
**Context:** Agent-sandbox retrospective (#1211)

## Decision

Multi-round consensus voting (reject → refine proposal → re-vote) produces better outcomes than single-pass voting. The nexus-agents consensus engine should support structured rejection feedback to enable this pattern.

## Context

During the agent-sandbox v3.0.0 feature implementation, a consensus vote on 8 proposed improvements was rejected 4-2:

- **PM voter** caught a DRY violation: extracting a helper function for only 2 instances violates "two is a coincidence, three is a pattern"
- **Contrarian (catfish) voter** caught over-engineering: Makefile-to-sandbox mapping tests added complexity without proportional value

The proposal was scoped down based on this feedback, removing the DRY extraction and mapping tests. The refined proposal was re-submitted and passed 3-0 unanimously.

### Key Observation

The rejection was not a failure — it was the system working correctly. The voters identified real problems that the proposer missed. The multi-round pattern (reject → understand why → refine → re-vote) produced a significantly better outcome than either:

1. Accepting the original proposal (would have shipped unnecessary complexity)
2. Abandoning the proposal entirely (would have lost the valid improvements)

### Supporting Research

The catfish agent role is based on arXiv:2505.21503, which demonstrates that agreement bias in multi-agent voting leads to poor decisions. The multi-round pattern extends this: structured disagreement not only prevents bad decisions, but actively improves proposals through iterative refinement.

## Implementation

Two features added to the consensus engine (Issues #1212, #1213):

### 1. Structured Rejection Categories (#1213)

When voters reject, they classify their reasons using predefined categories:

- `YAGNI` — Not needed right now
- `DRY_VIOLATION` — Duplicates existing functionality
- `OVER_ENGINEERING` — More complex than the problem warrants
- `SCOPE_CREEP` — Exceeds stated objective
- `SECURITY_RISK` — Introduces security concerns
- `MISALIGNED` — Doesn't align with project goals
- `INSUFFICIENT_EVIDENCE` — Lacks supporting data

Categories enable automated proposal refinement: YAGNI → remove speculative features, OVER_ENGINEERING → simplify approach, SCOPE_CREEP → narrow scope.

### 2. Workflow-Test Evaluation Criteria (#1212)

All voter prompts now include three assessment dimensions:

- **Testability:** Can changes be verified with automated tests?
- **Workflow integration:** Does this fit existing CI/build/test pipelines?
- **Incremental verifiability:** Can progress be measured at each step?

These dimensions help voters catch proposals that sound good but are impractical to verify — which is the class of problem that was caught manually in the agent-sandbox session.

## Consequences

### Positive

- Rejection reasons are structured and actionable, not free-text prose
- Proposers know exactly what to change before re-submitting
- Rejection analytics can track which categories trigger most rejections
- Workflow-test assessment catches impractical proposals early

### Negative

- Slightly longer voter prompts (workflow-test section adds ~100 tokens per voter)
- rejectionCategories field is optional — LLMs may not always include it
- Multi-round voting requires manual re-submission (no automated retry loop yet)

### Future Work

- Automated proposal refinement based on rejection categories
- Consensus engine tracks multi-round history (proposal → rejection → refinement → re-vote)
- Rejection category analytics in weather_report dashboard
