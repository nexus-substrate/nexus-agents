---
'nexus-agents': patch
---

Retire five human-in-the-loop gates that were slowing reversible decisions without buying safety (#4463).

`.rules/autonomous.md` hard stops: dropped "waiting on an external system" (poll with backoff and take other work), "CI failure needing a design decision" (route to `consensus_vote` with review subagents), and "repeated failures" (three attempts means change strategy, not summon a human). Added the gates the audit found genuinely load-bearing but unstated: secret/credential handling and Rule-of-Two convergence, governance self-modification, and publishing/spending.

`AGENTS.md` error protocol no longer waits for confirmation after a reversible failure — diagnose, act, verify, and change approach after the second failed attempt rather than repeating it.

`skills/browser-testing-with-devtools`: URL navigation moves from a confirmation prompt to a fail-closed allowlist (auto-allow user-supplied, localhost, same-origin; reject private IPs, non-HTTP(S) schemes, credentialed URLs, cross-origin redirects), and page mutations are classified rather than blanket-confirmed — reversible test actions proceed, while destructive, publishing, spending, or production-account actions still stop.

`skills/docs-rewrite`: the Phase-3 approval pause is replaced by the diff as the review surface, with two binding constraints retained — the rewrite must not change technical meaning, and must not exceed the agreed plan.
