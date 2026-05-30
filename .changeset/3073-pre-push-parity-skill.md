---
'nexus-agents': patch
---

**feat(skills):** add `pre-push-parity` skill (#3073).

Agents kept discovering CI-only checks one failure at a time — push, wait ~3 min, parse logs, fix, repeat — for gates not in the local quality gate (the #3073 incident: `ruff format --check` and a `gitleaks` false-positive). CI is a strict superset of any local gate; this skill runs that superset locally first.

The skill (1) enumerates the repo's CI checks from `.github/workflows/`, (2) runs the locally-runnable subset in CI's order via a fail-fast one-shot (typecheck, lint, test, build, changeset presence, producer/consumer #3024, model-drift, commitlint, clean-tree, gitleaks), (3) names the checks that _can't_ run locally (CodeQL, Scorecard, Semgrep, Socket, docker consolidation) as residual risk, and (4) prompts writing a `ci-vs-local-gate-*` memory the first time in a repo so the delta isn't rediscovered. Includes the gitleaks test-fixture hygiene tip.

Brings the registered skill count to 32 (index + governance docs regenerated).
