---
'nexus-agents': minor
---

carry read coverage on the audit-chain verdict itself

`verify_audit_chain` reported `skippedLines` and `unreadableFiles` as sibling
fields of its response, but `ChainVerification` — the object a caller reads to
decide whether tamper-evidence holds — was unchanged. A log two lines of which
were never parsed still produced a clean, complete-looking verdict.

`ChainVerification` now carries an optional `coverage: { skipped,
unreadableFiles }`, attached by the tool, which is the only party that knows
what the loader dropped. `withCoverage` is how a caller states it.

Three deliberate boundaries. Absent coverage means UNKNOWN, not complete —
`verifyChain` receives only events and cannot know, so defaulting to zero would
manufacture the assurance the field exists to stop manufacturing. `skipped: 0`
is therefore a positive claim of full coverage rather than an omission.
`notVerified` keeps its meaning of "nothing was verified"; a partial read
checked real links and is a different axis, so it is not overloaded. And a
failing verdict is returned untouched, since it already names a specific event
index that coverage does not qualify.

Resolves the #4805 fork by a 7-voter `higher_order` panel: Option A, 4-1 among
approvers, `unattributedApprovals: 0`.
