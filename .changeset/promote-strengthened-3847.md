---
'nexus-agents': patch
---

feat(eval): promote 3 buggy + 6 long-tenure clean cases into the trusted pr_review sample (n=10→19) (#3847)

Strengthened promotion into the TRUSTED `pr_review` eval set
(`testing/datasets/pr-review-sample.json`). Nine REAL merged PRs from
`nexus-substrate/nexus-agents` are added via OUTCOME-MINING. Supersedes the held
#3936 attempt: the 3 buggy cases are reused verbatim, but the 6 clean cases are
RE-SOURCED from older long-tenure PRs (the #3936 clean cases were rejected — their
~1-week no-corrective-PR window carried too high a false-clean risk).

**Buggy (3, reused verbatim)** — each `customDiff` carries the real ORIGINAL code
hunk the corrective PR later changed:

- **#3915** (medium) — silently-swallowed audit/cost persist failures.
  Corrective: **#3918**.
- **#3893** (high) — promotion gate only checked `ratificationVoteRef` non-empty,
  never that it RESOLVED to a real approved vote. Corrective: **#3895**.
- **#3873** (high) — `claims:check` gate never READ the subject docs it claimed
  to verify. Corrective: **#3884**.

**Clean (6, long-tenure)** — merged 2026-04-25..2026-04-30, each clean only because
NO corrective/revert PR has touched its changed source file in the >6-week window
since merge:

- **#2286** — Magentic-One Task/Progress Ledger (orchestration).
- **#2288** — confirm_risky access-policy tier (security).
- **#2289** — verify_audit_chain tool (mcp / audit).
- **#2298** — supply_chain_tradeoff_panel (mcp).
- **#2306** — init --portable command (cli).
- **#2251** — soft-block aggregation tier (pr_review).

All 10 prior v5 cases are preserved unchanged. The dataset schema gains the
`outcome-mined` provenance source; the validator/test stays green (n=19, class
balance buggy=10 / clean=8 / borderline=1).
