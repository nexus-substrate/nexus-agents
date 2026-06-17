---
title: 'Tool Removal / Consolidation Runbook'
description: End-to-end procedure for acting on a tool-fitness deprecation or consolidation candidate — surfaced as a suggest-tier signal, validated by a human, ratified via the authority-ladder consensus path, audited, and reversible. Removal is NEVER autonomous.
tier: 2
keywords:
  [
    tool,
    removal,
    consolidation,
    deprecation,
    fitness,
    runbook,
    governance,
    ratification,
    consensus,
    authority,
    ladder,
    suggest,
    audit,
    epic-f,
  ]
---

# Tool Removal / Consolidation Runbook

**Status:** Active
**Epic:** Epic F — Tool fitness ledger + suggest-tier pruning pipeline
([#3850](https://github.com/nexus-substrate/nexus-agents/issues/3850)),
this runbook [#3853](https://github.com/nexus-substrate/nexus-agents/issues/3853)
**Grounded in:** [ADR-0017: Authority Ladder](../adr/0017-authority-ladder.md)
§"Anti-Degenerate-Loop Guarantees" · [Loop Promotion Criteria](./loop-promotion-criteria.md)

> ## EPIC F INVARIANT — removal is NEVER autonomous
>
> No code path may remove or merge a tool registration on its own. The
> tool-fitness pipeline is **suggest-tier only**: it produces *candidates for a
> human to consider*, never an instruction to prune. A deprecation or
> consolidation signal is **advisory input to a human, never an actuator**.
> Every actual removal or consolidation is a **governed change** that must travel
> the authority-ladder ratification path (`consensus_vote`, `higher_order`) plus
> CODEOWNERS review, and lands an audit event — exactly the discipline ADR-0017
> applies to a tier transition. The signal alone never triggers anything.

This runbook is the procedure for acting on a tool-fitness candidate, from the
moment a signal is surfaced to the moment a tool is (or, just as often, is **not**)
removed. It mirrors the never-autonomous, evidence-gated posture of the authority
ladder: a removal is treated like a tier transition — earned, ratified, audited,
and reversible.

---

## Why this is gated the way it is

The system carries 46 MCP tools (`tool-manifest.ts`; the README count is tracked
by the claims registry — see below), which is near the ceiling of reliable agent
tool-selection. Trimming dead weight is genuinely useful. But a tool registration
is a **capability**, and removing a capability is exactly the class of action the
authority ladder forbids a loop from taking on its own:

> **Never-autonomous removal.** Capability removal is never autonomous. Epic F's
> tool pruning routes every removal through **this** ADR's ratification path — a
> removal is treated like a tier transition and requires a recorded
> `consensus_vote`. No loop can unilaterally remove a capability (its own or
> another's).
> — [ADR-0017](../adr/0017-authority-ladder.md) §"Anti-Degenerate-Loop Guarantees"

So the fitness pipeline stops at **filing a candidate**. Everything past that point
is a human decision under governance.

---

## Stage 0 — How a candidate is surfaced

A candidate originates from the `tool-fitness` `SignalCategory` in
`improvement_review`
([#3852](https://github.com/nexus-substrate/nexus-agents/issues/3852)), the named
consumer of the tool-fitness ledger
([#3851](https://github.com/nexus-substrate/nexus-agents/issues/3851)). The consumer
reads per-tool fitness stats — invocation count, success/failure correlation,
last-used timestamp, per-workspace breakdown — and emits two kinds of candidate:

| Candidate kind          | Heuristic (the honest, ledger-only threshold)                                                              | Severity cap |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| **Deprecation (usage)** | invocation count `≤ LOW_USAGE_MAX_INVOCATIONS` (2) — barely selected against the selection ceiling         | `info`       |
| **Deprecation (rate)**  | success rate `≤ POOR_SUCCESS_RATE_MAX` (0.5) over `≥ FITNESS_MIN_SAMPLE` (10) samples, NOT workspace-local | `warning`    |
| **Consolidation**       | within a shared name-prefix family, used `≤ CONSOLIDATION_USAGE_FRACTION` (0.1) of the busiest sibling     | `info`       |

These signals are **suggest-tier by construction**:

- Severity is capped at `warning` and can **never** be `critical` — the
  `assertNeverAutonomousRemoval` runtime guard
  (`improvement-review-tool-fitness.ts`) throws if a future edit tries to emit a
  removal-grade signal, so the priority classifier cannot escalate a fitness
  signal toward an auto-remediation tier.
- `improvement_review` keeps `fileIssues=false` by default with a rate cap of 5
  (`improvement-review.ts`). A candidate becomes a filed issue only with an
  explicit human opt-in, and even then it is a rate-capped *issue to review*, not
  an action.
- The strings are deliberately worded as **CANDIDATE … for human review, NOT an
  automatic removal**.

### KNOWN heuristic limitations (read before trusting a signal)

These are the Contrarian's signal-quality concerns from the
[#3900](https://github.com/nexus-substrate/nexus-agents/issues/3900) ratification,
tracked as follow-up
[#3902](https://github.com/nexus-substrate/nexus-agents/issues/3902). They are
tolerable **only because** the tier is suggest and a human reviews every candidate.
Treat a raw signal as a *prompt to investigate*, not a verdict:

1. **Shared name-prefix ≠ substitutable.** A consolidation candidate is grouped by
   prefix family (e.g. `research_*`). But `git_commit` vs `git_init`, or `db_read`
   vs `db_drop_table`, share a prefix and are **orthogonal**, not substitutable.
   Flagging a rare sibling for consolidation into a busy one is frequently wrong.
   Until #3902 lands a real capability/overlap signal, treat prefix-family as a
   **weak hint** and confirm actual functional overlap by hand.
2. **Break-glass / rare-but-critical tools are NOT deprecation candidates.** The
   `≤ 2 invocations` rule will flag rollback, recovery, and emergency-admin tools
   precisely *because* they are low-usage **by design**. A tool that exists for the
   rare critical moment is not dead weight. Until #3902 adds a never-deprecate tag
   / criticality weighting, the reviewer MUST manually exempt break-glass tools.
3. **Workspace-localized vs global signals.** The ledger is homedir-global. The
   consumer already suppresses a reliability flag when a tool is healthy in any
   *other* workspace (defeating context-poisoning — a one-workspace misconfiguration must
   not globally mis-flag a healthy tool). The residual is that a genuinely useful
   *localized* "failing here" warning may be discarded. A global deprecation signal
   therefore means "unhealthy across workspaces", and the **absence** of one does
   not mean a tool is healthy in *your* workspace.

> The LinUCB exploration floor (ADR-0017 §"Anti-Degenerate-Loop Guarantees";
> `linucb-bandit.ts`) guarantees a low-usage tool still accrues exploration traffic
> and cannot death-spiral. A low usage count is a question, not a sentence.

---

## Stage 1 — Human review / validation (before anything is even proposed)

A surfaced candidate is the *input* to this stage, not a green light. Before a
removal or consolidation is so much as proposed, the reviewer validates the signal
against the known limitations above. Do all of the following and record the
findings on the candidate issue:

1. **Verify real usage.** Confirm the low invocation count against the live ledger
   (`getToolFitnessLedger().statFor(tool)`) and the tool manifest. Is the tool
   genuinely unused, or just used outside the ledger's window / by a surface that
   doesn't record fitness events?
2. **Check break-glass / criticality status.** Is this a rollback, recovery,
   emergency-admin, or other rare-but-critical capability? If so, it is **low-usage
   by design** — close the candidate as "not a deprecation candidate" (limitation
   2). Do not proceed.
3. **Confirm cross-workspace health.** For a reliability candidate, pull the
   per-workspace breakdown (`statForInWorkspace`). If the tool is healthy in other
   workspaces, the failure is local — file/route a workspace-scoped fix, do **not**
   propose global removal (limitation 3).
4. **For a consolidation candidate, prove substitutability.** Confirm the flagged
   tool and its proposed sibling actually overlap in capability — not merely in
   name prefix (limitation 1). If they are orthogonal, close the candidate.
5. **Check downstream dependents.** Grep the harness, skills, workflow templates,
   and docs for callers of the tool name. A consolidation requires an **old→new
   tool mapping** for harness users; a removal requires confirming there are no
   live dependents (or a documented migration).

If any of 1–5 disqualifies the candidate, **close it with the reason recorded**.
This negative outcome is the common, healthy case — the heuristics are deliberately
broad and most candidates should not become removals.

---

## Stage 2 — The ratification path (a removal is a governed change)

If and only if Stage 1 validates the candidate does a removal/consolidation become
a *proposal*. It is then a governed change with the same discipline ADR-0017 applies
to a tier transition. **The signal does not trigger this stage; a human opens it.**

1. **File a dedicated removal/consolidation issue** (separate from the candidate
   signal issue) stating: the tool, the Stage-1 validation evidence, whether this is
   a removal or a consolidation, and — for consolidation — the explicit **old→new
   tool guidance** for harness users.
2. **Deprecation window first.** Land a change that makes the tool **warn** on use
   (deprecation notice pointing at the successor / removal issue) before removing
   it. This gives live callers a transition window; it is itself a reviewed PR, not
   a removal.
3. **Ratify via `consensus_vote`.** Hold a `higher_order` ratification
   `consensus_vote` on the removal/consolidation, mirroring the authority-ladder
   promotion gate. Record it in
   [`governance/ratification-votes.yaml`](../../governance/ratification-votes.yaml).
   A removal is **invalid without a recorded, approved, subject-matching vote** —
   exactly as a promotion audit event is invalid without a linked ratification vote.
4. **CODEOWNERS review on the removal PR.** The PR that drops the tool registration
   goes through normal CODEOWNERS review (the Epic B governor / review path). Two
   independent gates must agree: the ratification vote AND code review. Neither the
   fitness signal nor the vote alone merges anything.
5. **Removal PR through the governor path.** The actual registration removal lands
   as a reviewed, ratified PR — never as an automated edit.

> At no point does a loop perform the removal. The pipeline's authority ends at
> Stage 0 (file a candidate). Stages 1–2 are human-driven and gated by consensus +
> CODEOWNERS. This is the machine-checkable expression of "zero autonomous removals
> possible by construction".

---

## Stage 3 — Audit, claims registry, and decision record

1. **Tier-transition / removal audit event.** Record the removal as an audit event
   (kind analogous to a `demotion`/transition) carrying the tool id, the
   ratification-vote ref, and the evidence link — the audit log is the source of
   truth, the same as for ladder transitions.
2. **Update the claims registry.** A removal changes the tool count (the 46/47-count
   claim). Update the claims-registry entry in the **same** PR so `claims:check`
   stays honest (it keeps the README/manifest counts in lockstep). A removal PR that
   does not update the count fails the gate.
3. **Record the decision on the issue.** Close the removal issue with: the vote ref,
   the audit-event ref, the merged PR, and (for consolidation) the published old→new
   mapping. A closed candidate that did **not** become a removal records the
   disqualifying reason (Stage 1) — these negative records are how the heuristics
   get refined (#3902).

---

## Stage 4 — Rollback / safety

A removal is reversible, and the deprecation window is the first line of defense:

- **During the deprecation window**, reverting is just dropping the warning change —
  no registration was removed yet.
- **After removal**, rollback is re-registering the tool via the inverse PR (the
  manifest entry and registration are restored), again through CODEOWNERS review and
  with a claims-registry count update. Re-introducing a previously removed capability
  is itself a governed change.
- **Safety asymmetry.** As with the ladder, it must always be easier to keep/restore
  a capability than to remove one. When in doubt, the candidate stays open and the
  tool stays registered. The exploration floor ensures a kept-but-rarely-used tool
  keeps accruing evidence rather than silently dying.

---

## Quick reference — the end-to-end path

```text
ledger event (per invocation)
   └─ improvement_review tool-fitness SignalCategory  [SUGGEST TIER — caps at `warning`]
        └─ candidate signal (rate-capped, fileIssues=false by default)   ← pipeline authority ENDS here
             └─ HUMAN: Stage 1 validation (usage / break-glass / cross-workspace / overlap / dependents)
                  ├─ disqualified → close with reason  (common, healthy outcome)
                  └─ validated → dedicated removal/consolidation issue
                       └─ deprecation window (tool WARNS)
                            └─ consensus_vote (higher_order) RATIFICATION  +  CODEOWNERS review
                                 └─ removal PR via governor path
                                      └─ audit event  +  claims-registry count update  +  decision record
                                           └─ (rollback = inverse PR, same gates)
```

The signal is advisory input to a human at every step. It is **never** an actuator.

## References

- [ADR-0017: Authority Ladder](../adr/0017-authority-ladder.md) — never-autonomous
  removal; ratification-linked, audited transitions; exploration floor
- [Loop Promotion Criteria](./loop-promotion-criteria.md) — the
  evidence-gated, `consensus_vote`-ratified discipline this runbook mirrors
- Epic: [#3850](https://github.com/nexus-substrate/nexus-agents/issues/3850) — tool
  fitness ledger + suggest-tier pruning pipeline (never autonomous removal)
- Ledger (data layer): [#3851](https://github.com/nexus-substrate/nexus-agents/issues/3851)
  — `governance/tool-fitness-ledger.ts`
- Signal consumer: [#3852](https://github.com/nexus-substrate/nexus-agents/issues/3852)
  — `tool-fitness` SignalCategory, `mcp/tools/improvement-review-tool-fitness.ts`
- Heuristic-refinement follow-up: [#3902](https://github.com/nexus-substrate/nexus-agents/issues/3902)
  — shared-prefix ≠ substitutable, break-glass exemption, workspace-localized signals
- Ratification ledger: [`governance/ratification-votes.yaml`](../../governance/ratification-votes.yaml)
