---
title: E2E Validation — 2026-08-25
description: Periodic real-usage validation of the nexus-agents loops after a day of releases (#4488 cadence).
tier: 3
keywords: [validation, e2e, dogfooding, consensus, audit, release]
---

# E2E Validation — 2026-08-25 — nexus-agents 4.14.1 (a4c84c976f)

**Trigger:** ≥3 behaviour-affecting fixes since the last run (2026-08-23). 67 commits
landed on `main` today across releases 4.3.5 → 4.14.1.

**Adapters live:** Claude, Codex, Opencode (voter transport: CLI subprocess).
18 of 18 models available.

## The headline finding is about the harness, not the code

The globally-installed `nexus-agents` — which backs **both** the CLI and the MCP
server — was at **4.3.1** while npm and the repo were at **4.14.1**. Installed
02:03 today, **eleven minor versions behind**.

Every MCP tool call made during the day therefore executed 4.3.1, not the code
being merged. That does not invalidate the decisions those calls produced (the
voter panels reason from proposal text, and each proposal's premises were verified
by reading source), but it does mean **no MCP call from today can be cited as
evidence that today's fixes work**.

Updated to 4.14.1 mid-run. The already-spawned MCP server process stays on the old
build until restarted, so the families below were driven through the **CLI**, which
forks fresh.

This is exactly what #4767 tracks; it now has a measured instance.

## Results

| #   | Family        | Verdict   | Evidence                                                      |
| --- | ------------- | --------- | ------------------------------------------------------------- |
| 1   | Research      | `BLOCKED` | MCP-only surface; this session's server is the stale process  |
| 2   | Consensus     | `PASS`    | Live `vote --quick`: 3/3 voters returned, 100% approve, 255s  |
| 3   | Planning/exec | `BLOCKED` | Same MCP-process constraint                                   |
| 4   | Pipelines     | `BLOCKED` | Same                                                          |
| 5   | Memory        | `PARTIAL` | Data dirs resolve and are writable; no live write driven      |
| 6   | Audit/health  | `PASS`    | 67 vote records, sequence contiguous, 0 `previousHash` breaks |
| 7   | Repo/analysis | `PASS`    | `doctor` clean on 4.14.1; both scratch roots measured         |

**Result: 3 PASS / 0 FAIL / 3 BLOCKED / 1 PARTIAL.** Coverage 4/7 families —
a partial run, labelled as such.

## Consensus detail (family 2)

```
✓ Software Architect: APPROVE (82%)
✓ Security Engineer:  APPROVE (95%)
✓ Scope Steward:      APPROVE (90%)
Approval: 100.0%   Threshold: simple_majority   Completed in 255643ms
```

All three voters returned — no dead voter, no OAuth race. One `codex` voter hit
`MCP error -32001: Request timed out` on attempt 2, was recorded to the circuit
breaker as a `timeout`, retried and succeeded. **Retry resilience worked as
designed**, and the failure was attributed rather than swallowed.

Latency is worth noting: **255s for a 3-voter quick vote**. Not a defect, but it
prices the cost of routing routine decisions through a panel.

## Audit detail (family 6)

The 14 votes recorded today chain cleanly:

- 67 records, `sequence` contiguous from 0 with no gaps
- 0 `previousHash` breaks across the whole file
- All 14 of today's `consensus_vote` calls persisted, matching their reported
  `voteRecordPersisted: true`

**A false alarm worth recording:** an initial check reported "0 records from today"
and looked like a persistence failure. The check was wrong — the field is
`recordedAt`, not `timestamp`. Verified before reporting, which is the point of
capturing actual output rather than a verdict.

## Issue filed

- **#4904** — `warmStart`'s skip warning cannot distinguish a deliberate non-arm
  (`unknown`, always skipped by design, 210 records) from a regressed one, which is
  precisely the case #4400 added the warning for. Found in the vote's logs, not by
  reading code.

## What a fuller run needs

Families 1, 3 and 4 are MCP-only and could not be exercised against 4.14.1 from
inside a session whose MCP server was spawned at 4.3.1. A future run should either
start from a fresh session after confirming the global install matches the repo, or
drive those families through a directly-spawned `--mode=server` process.
