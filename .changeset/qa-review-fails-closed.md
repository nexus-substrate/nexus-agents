---
'nexus-agents': patch
---

A QA review that fails or cannot be read no longer counts as a pass. The dev pipeline's QA stage used to record `pass` whenever the reviewer's reply lacked the words "reject" or "needs work", which included a failed expert call (empty reply after a budget skip, routing error, timeout or refusal) and any off-format answer. A task could therefore reach `done` without having been reviewed.

`pass` now requires a verdict line in the format the QA expert is prompted for: `PASS`, `NEEDS_WORK` or `REJECT` at the start of a line, optionally after markdown or a `Verdict:` label. "reject" inside prose, as in "no reason to reject", is no longer read as a verdict. When a reply states more than one verdict, the strictest one wins. A failed call or a reply with no readable verdict is recorded as `needs_work`. Its feedback says the review was unmeasured and why, and the outcome row carries a `qa-unmeasured:call-failed` or `qa-unmeasured:unreadable` signal. The QA loop is bounded, so a reviewer that keeps failing leaves the task `rejected` after the maximum iterations, with that feedback recorded.
