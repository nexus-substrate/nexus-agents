---
'nexus-agents': patch
---

chore(ci): raise install-bound gate timeouts from 5 to 10 minutes (#5396)

Eleven gate jobs carried `timeout-minutes: 5` while spending almost the whole
budget in `setup-node`, leaving seconds for the check itself.

Measured, not assumed — `Model String Drift Check` runs one script:

```
$ time pnpm --silent check:model-drift
✓ No new model-version drift detected. 1443 file(s) scanned
real  0m17.308s
```

17 seconds of work in a 5-minute budget, and it still timed out — roughly 4m40s
went to dependency install. The same job passes on `main` in 2m59s. Three
distinct jobs blew the budget in a single session (`Changeset Presence`,
`Model String Drift Check`, `Governor-path ratification gate`), two of them at
an identical **5m16s** — a 5-minute cap plus teardown.

10 is not an arbitrary bump: it is already the house default (30 jobs use it
against 19 at five), and it still catches a genuinely hung check.

## The reason this was worth fixing rather than retrying

A timed-out job surfaces as **`CANCELLED`**, which is indistinguishable from a
supersede-by-newer-run. The natural response is to re-run, and that is the wrong
one — I re-ran three times before checking durations.

It matters most where it happened worst. `Governor-path ratification gate` timed
out on a PR that genuinely _was_ governor-path. For that cycle the check
deciding whether governance files need ratification did not run, its absence
looked like scheduling noise, and the PR's rollup showed no ratification
objection. The gate did not fail open, but its verdict was unavailable and
looked benign — for a human spot-check, close to the same thing.

## Scope

Raised in `ci.yml` (4), `docs-check.yml` (4), `parameter-drift.yml`,
`pricing-drift.yml`, `system-review.yml`.

**Deliberately excluded:** the two jobs in `.github/workflows/governor-review.yml`,
which is itself a governor-owned path (`CODEOWNERS:45`) — a gate an agent can
quietly weaken is not a gate. Those need their own ratified change, tracked on
#5396. That leaves the most consequential instance unfixed for now, which is the
correct trade rather than an oversight.

Not addressed here: distinguishing timeout from cancel in the summary. That is
the more durable fix and needs its own design — GitHub reports both identically,
so it would mean deriving it from job duration in the aggregate step.

## Addendum — `Consolidation E2E`, raised 8 → 20

Found while merging: PR #5397 failed with `CI Success` red and **no failing
step**. Two jobs were killed, and both were at their cap, not superseded:

```
Consolidation E2E   started 04:14:56  killed 04:23:08   8m12s  (cap  8)
Changeset Presence  started 04:20:24  killed 04:25:40   5m16s  (cap  5)
```

The 8m12s is the interesting one, because it nearly fooled me the other way:
`8m12s > 5m` looked like proof that _this_ job had not hit a 5-minute cap, and
therefore that the whole run had been superseded by a newer push — which would
have meant the fix here was irrelevant and #5397 just needed a re-run. Checking
the actual cap rather than assuming the uniform 5 is what settled it.

`Consolidation E2E` does not fit the profile the rest of this changeset
describes. It is not `setup-node` plus a seconds-long check; it runs a full
`pnpm build` and then two `docker compose` container runs. So it gets 20 rather
than the house-default 10 — 10 would have left two minutes of headroom on a job
that had just exhausted its budget, which is the same bug with a larger number.
These caps are runaway-guards, not SLAs.
