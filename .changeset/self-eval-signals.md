---
'nexus-agents': minor
---

feat(observability): surface self-eval findings as improvement_review signals (#3224)

Closes the gap where self-evaluation produced recommendations that never drove
any action. `improvement_review` gains an opt-in `selfEvalReportPath` input: when
set, it reads a `self-eval --json` report and converts **high-confidence,
unanimous** `deprecate`/`refactor` findings (confidence ≥ 0.8, no dissent) into
`tech-debt` signals that flow through the SAME deduped + rate-limited GitHub-issue
path as the other detectors. This is the safe, non-behavioral path: it surfaces a
human decision point (a candidate issue), never an automatic routing change.
Fail-soft — an absent/unreadable/malformed report yields no signals (logged), and
absent input leaves behavior unchanged.
