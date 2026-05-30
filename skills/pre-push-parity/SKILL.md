---
name: pre-push-parity
description: |
  Run the CI gates locally before pushing, so failures surface in seconds
  instead of one CI cycle at a time. Enumerates the checks in
  .github/workflows/, runs the locally-runnable subset in CI's order, and
  pins the local-vs-CI delta as a memory the first time you work in a repo.
  Use before `git push` / opening a PR, or when CI just failed on something
  your local gate missed.
  Triggers on "pre-push", "before push", "ci parity", "will ci pass",
  "local gate", "prepush", "pre-push check".
allowed-tools: Read, Bash, Grep, Glob
---

# Pre-Push Parity Skill

<!--
  CANONICAL SOURCES:
  - .github/workflows/ci.yml (the gate list this mirrors)
  - Motivating incident: #3073 (agents rediscover CI-only checks one failure at a time)
-->

## Why

CI runs a **strict superset** of any local quality gate. When the local gate
(`pnpm test`, a `make verify`, etc.) is green but CI is red, the agent burns a
full ~3-minute cycle per discovery — push, wait, parse logs, fix, push — for a
check it could have run locally in seconds. On a multi-PR session that's hours.
The fix is to run the superset locally **before** `git push`.

Real failures that motivated this (#3073): `ruff format --check` (local gate
only ran `ruff check`) and a `gitleaks` false-positive on a `*-Key-N` test
fixture — neither was in the local gate, both cost CI cycles.

## Principle

> Whatever CI can fail you on, run it locally first. For the checks you _can't_
> run locally (SaaS / GitHub-native), know they exist and that they're the
> residual risk — don't be surprised by them.

## Step 1 — Enumerate the repo's CI checks (do this first time in a repo)

```bash
# Job names + the commands each step runs:
grep -rEn 'name:|run:' .github/workflows/*.yml | grep -iv 'uses:'
```

Compare that list to your local gate. Anything CI runs that you don't is a
parity gap. **Write a memory** pinning the delta so the next session starts
informed (don't rediscover it):

> `ci-vs-local-gate-<repo>` — CI runs these checks the local gate doesn't: X, Y, Z.
> Run them via `<commands>` before push. Z (CodeQL/Scorecard/Socket) can't run
> locally — residual risk.

## Step 2 — Run the locally-runnable gates (nexus-agents)

In CI's order, fastest-feedback-first. Stop at the first failure, fix, restart.

| CI gate                    | Local command                                                   |
| -------------------------- | --------------------------------------------------------------- |
| Type Check                 | `pnpm typecheck`                                                |
| Lint                       | `pnpm lint`                                                     |
| Test                       | `pnpm test` (CI uses `pnpm test:coverage`)                      |
| Build                      | `pnpm build`                                                    |
| Changeset Presence         | `npx tsx scripts/check-changeset.ts origin/main`                |
| Producer/Consumer (#3024)  | `npx tsx scripts/check-new-unused-exports.ts origin/main`       |
| Model String Drift         | `pnpm check:model-drift`                                        |
| Commit Messages            | `npx commitlint --from origin/main --to HEAD`                   |
| Working-tree clean (#2872) | `git status --porcelain` (must be empty)                        |
| Secret scan                | `gitleaks detect --no-banner` (runs in the pre-commit hook too) |

One-shot (mirrors CI, fails fast):

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build \
  && npx tsx scripts/check-changeset.ts origin/main \
  && npx tsx scripts/check-new-unused-exports.ts origin/main \
  && pnpm check:model-drift \
  && npx commitlint --from origin/main --to HEAD \
  && test -z "$(git status --porcelain)" && echo "PARITY OK"
```

> The pre-commit hook already runs `gitleaks` + lint-staged `eslint --fix` +
> `prettier`, so a successful commit covers formatting/secrets. This skill adds
> the gates the hook does **not** cover (typecheck, full test, build, changeset,
> unused-exports, model-drift, commitlint, clean-tree).

## Step 3 — Checks you can NOT run locally (residual risk)

These are GitHub-native or third-party SaaS — note them, don't be surprised:

- **CodeQL** (`codeql.yml`), **OpenSSF Scorecard** (`scorecard.yml`),
  **Semgrep** (`semgrep.yml`), **Socket Security** — security scanners.
- **Consolidation E2E** (`docker compose ...`) — needs Docker; run it locally
  only if you touched the data-dir / consolidation path.
- **Link Check**, **Documentation Gate / DocOps Skill Sync** — run
  `pnpm link-check` and `pnpm governance:check` if you touched docs/skills.

## Step 4 — gitleaks fixture hygiene

The `generic-api-key` rule false-positives on test fixtures containing the
literal word `key` with entropy (e.g. `Idempotency-Key-1`). When the test
doesn't need the literal word, use a neutral fixture (`dash-shaped-value-7`).
If a real fixture must trip it, add a scoped `.gitleaksignore` entry — never a
blanket disable.

## Done when

- The Step-2 one-shot prints `PARITY OK`, **or** every failure it surfaced is
  fixed and re-run green.
- For a first-time repo: a `ci-vs-local-gate-*` memory records the delta.
- You've consciously accepted the Step-3 residual (can't-run-locally) checks.
