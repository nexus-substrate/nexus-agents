---
'nexus-agents': patch
---

Match governance keywords on word boundaries, not raw substrings (#4518).

`governance-enforcer.ts` classified a task's domain with `SECURITY_KEYWORDS.some(kw => lower.includes(kw))`. With `'auth'` in the list as an unbounded substring, **"author" matched**. Two live reproductions from an e2e run:

- A CHANGELOG formatting task — _"list the pull request author name"_ — escalated to `domain: security, votingThreshold: supermajority`.
- A TypeDoc diagnosis escalated because the task text named the file `security.ts`.

This is the governance path, so the cost is not just noise: the recorded `promotionReason` asserted security keywords in work with no security dimension, meaning an auditor reading why a task required supermajority read a false justification. And if most escalations are "author" collisions, the domain signal stops being worth reading — which is when a genuine one slips through.

**The trap in fixing it.** A naive `\bauth\b` does not match "authentication" or "authorization", so real security work would stop escalating — a false negative on the governor path, strictly worse than the over-matching. Both are handled: bare `auth` on a word boundary catches "auth flow" without catching "author", and the longer forms are enumerated explicitly. Precision in the data rather than cleverness in the matcher.

Three matching modes, because the lists always mixed three intents: stems (`vulnerabilit`, `cve-`) anchored at word start; regex entries compiled as regex; everything else on word boundaries. That revives `'refactor.*system'`, which was **dead** — a regex sitting in a list documented as substring-matched could only ever match the literal text `refactor.*system`.

Filenames and paths are stripped before matching, so naming `security.ts` no longer classifies a task as security work.

**One call site deliberately keeps substring matching.** `isSecuritySignal` in the remediation shadow has the opposite risk profile, stated in its own docstring: a false negative auto-remediates a security issue _without human review_. Broad matching is the fail-safe direction there, so it stays — and the divergence is documented in place rather than quietly unified.
