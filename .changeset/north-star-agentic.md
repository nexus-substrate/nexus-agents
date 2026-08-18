---
'nexus-agents': patch
---

Adopt a full-automation north star in AGENTS.md, with audit-trail fidelity as its enabling condition (#3829).

The target is an engine that runs the lifecycle end to end without a human in the loop and is _more_ trustworthy for it — the mechanism being depth of independent scrutiny no human reviewer could sustain at volume: fan-out QA/security/vestigial subagents that read the actual artifact, `consensus_vote` panels on every real fork, adversarial verification that tries to refute rather than confirm, and mutation checks that prove a test fails for the reason it claims. Human gates are reserved for the genuinely irreversible or exceptionally high-risk.

The premise that makes this safe — everything is logged and a human can review it later — only holds if the logs mean what they say, so the amendment states audit-trail fidelity as load-bearing infrastructure rather than exhaust. A record that _misreports_ is worse than a missing one: it launders unreviewed work as reviewed, and it is exactly the artifact a human spot-check trusts. Four invariants follow (instruments must represent disagreement/absence/partial coverage; a check that cannot fail by construction is not a check; a review must consume the artifact and declare partial coverage honestly; provenance travels with evidence), and a fidelity defect in governance instrumentation is a p1 correctness bug on the governor path.

One gate stays human for a reason unrelated to blast radius: the governor must not be able to weaken its own governor. Governance-substrate changes require owner ratification and are never auto-merged, as `CODEOWNERS` already encodes.

Grounded in four verified instrumentation defects found this session — #4447 (a rot detector reporting `Stale: 0` against 28 stale issues), #4451 (a prose summary accepted as a diff, persisting `verified: true`), #4452 (6-1 and 5-2 vote splits recorded as unanimous), #4459 (records without provenance). CLAUDE.md's body regenerates from AGENTS.md.
