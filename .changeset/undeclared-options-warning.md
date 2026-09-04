---
'nexus-agents': minor
---

feat(consensus): warn when a proposal names alternatives but declares no `options` (#5360)

#4452 established the failure and #4472 built the fix, but **nothing detected
when a caller should have used it**, so the failure stayed reachable by
forgetting — and it recurred on a real architecture vote: positions were 3–3, the
record says `APPROVED 83.3%`. Every voter returned `approve` because they were
approving the _act of deciding_, not a side.

The schema told callers they "MUST declare them in `options`", and
`applyOptionGate` early-returns when they are absent. A MUST enforced by nothing
is the check-that-cannot-fail shape this repo treats as p1 on the governor path.

## What ships

A bounded prose heuristic at the tool boundary, surfaced on `panelWarning` — a
**warning, not a refusal**, because the false-positive cost is unmeasured and
refusing a governance vote on an unmeasured heuristic trades one failure for a
worse one.

The warning carries a second, sharper signal: when every non-errored voter
returned `approve` on a proposal that enumerates a fork, that is the observed
signature of this defect. Unlike a reasoning-variance detector it needs nothing
the persisted record drops (#5339).

The schema wording now says **"declare"** rather than **"MUST"**, and states that
the enforcement is a warning. Per the panel, the wording and the enforcement move
together: it is tightened back only in the same change that promotes the warning
to a refusal (#5422).

## Chosen by panel, at a bar worth naming precisely

`higher_order`, 7 live voters, `options` declared: **D 4, A 2**, leading share
0.667, one reject. A and D are the same implementation — all six approvers wanted
the heuristic-as-warning. The 4–2 was only about the schema wording.

`higher_order` evaluates at a **0.5 bar**, so `thresholdMet: true` means
majority. 4 of 6 approvers is 66.7%, and 4 of the full panel is 57% — neither
clears the 5/7 supermajority this repo asks of governance changes. Recorded on
the issue rather than letting "approved" stand in for "ratified at the right
bar", since that conflation is the same class of misreport this change is about.

The dissent is not weak: softening a MUST is the wrong direction for a governor
path, and ratchets here historically move one way. The adopted safeguard is the
tighten-back binding above, tracked in #5422.

## Measured against the real corpus, not just fixtures

Run over `.nexus-agents/governance/vote-records.jsonl`: 151 records, **99 already
declare options** (the mechanism is well-adopted; the gap is forgetting), 52 do
not, **2 flag** — one true positive, one false positive that references a past
decision's "Option C". Precision 0.5 on n=2: far below any promotion bar, and
exactly why this ships as a warning.

That exercise also caught two things fixtures would not have:

- My first pattern was **uppercase-only** (`OPTION A`), and my own fixture used
  uppercase — so it agreed with itself while missing the real proposal, which
  used `Option A`. The pattern now matches both capitalised forms and still not
  lowercase `option a`, which occurs in ordinary prose.
- The persisted `proposal` is **truncated to 500 chars** (148 of 151 records are
  exactly 503), so the retrospective measurement the panel proposed is not
  possible over the ledger; it has to be taken live at the boundary. Noted in
  #5422. The truncation itself is **not** a defect — `proposalHash` covers the
  full text and the preview ends in an ellipsis.

## Verification

Four mutations, run separately: detector never flags (5 tests fail), an empty
`options` array read as declared (1), the all-approved signal always attached
(2), and `buildResponse` never surfacing it (1) — the last is the seam, and the
detector's own unit tests stay green under it.

The warning is **appended** to `panelWarning`, not assigned: that field already
had two writers, and a third that clobbered would silently drop whichever fired
first.

`src/mcp`: 4387 tests passing. `tsc` and `eslint` clean.
