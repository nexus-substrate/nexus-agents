---
'nexus-agents': patch
---

A zero-check gate reports `skip`, and a security scan that could not run no longer reads as a finding.

Both found by an adversarial review of the change that introduced the tri-state verdict.

**`aggregateResults([])` returned `'pass'`.** The condition was `pass === 0 && skip > 0 ? 'skip' : 'pass'`, which requires at least one skip — so an _empty_ check list fell through to `pass`. A gate that ran nothing at all reported success: the same cannot-fail defect the tri-state was added to remove, one step further out. No caller passes an empty list today, but the aggregator should not depend on that. Now ordered `fail > 0 → fail`, `pass > 0 → pass`, otherwise `skip`, which covers the empty case by construction rather than by luck.

The existing test asserting `expect(result.verdict).toBe('pass')` for an empty list was **encoding the defect**, and now states the corrected contract with the reason.

**The security stage printed `BLOCKED: …` for a scan that never ran.** `checkSecurityScan` returns `skip` when the scanner itself errored — most commonly because semgrep is not installed — and that rendered identically to a discovered vulnerability. It now says the scan did not run, names the remedy, and points at advisory mode for anyone who wants to proceed without security evidence. The sibling quality-gate stage already made this distinction; the security stage was the asymmetric one.
