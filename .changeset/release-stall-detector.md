---
'nexus-agents': patch
---

Add a stuck-release detector (#4500).

`changesets/action`'s PR-creation call has 502'd four times out of five in a single day, with GitHub Status green throughout. When it does, the release run ends **red** — but a failed `release.yml` is not a required check, blocks nothing, and alerts no one, so merging continues and `main` accumulates changesets with no version PR. It went unnoticed for several merges.

A scheduled check (every 6h) now evaluates the durable condition — **unconsumed `.changeset/*.md` on `main` AND no open "Version Packages" PR** — and files or updates a single deduplicated tracking issue.

Three deliberate exclusions, all decided by a 3-voter panel:

- **Not a required PR check.** Merging to `main` is the only path that has ever recovered this state, so a merge-blocking detector would deadlock its own remedy.
- **No automatic re-dispatch.** Re-running the failed run has never recovered it, so an automatic retry against a flaking API would be a retry storm with no demonstrated payoff.
- **Keyed on repo state, not run outcome.** A release run can finish green and still produce no PR, which an outcome-keyed check would miss entirely.

The issue, not the run's colour, is the output that matters — a red scheduled run would reproduce the exact "reported but nobody consumes it" failure the detector exists to fix.

The predicate is a pure function in `scripts/check-release-stuck.ts` with unit tests over all four state quadrants; the workflow is a thin shell. Verified against the live stalled state: it correctly reports stalled with a real pending changeset and clears when a version PR is open.
