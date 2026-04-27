---
title: Local pr_review (subscription auth)
description: Run multi-voter PR review on your local machine using your Claude/Codex/Gemini CLI subscription auth — instead of CI with API keys
tier: 2
keywords: [pr-review, local, subscription, auth, claude-pro]
---

# Local pr_review (subscription auth)

For nexus-agents users on Anthropic's subscription plan (Claude Pro/Max), the GitHub Actions workflow at `.github/workflows/pr-review.yml` is **dormant by default**. Running multi-voter review in CI requires a metered API key (`ANTHROPIC_API_KEY`), and using a subscription account's credentials in automated CI violates the subscription ToS.

The validated path for subscription users is `scripts/pr-review-local.ts` — runs on your machine, voters route through your local Claude CLI (which uses your subscription auth interactively), and posts the comment back via `gh`.

## Prerequisites

- Claude CLI installed and authenticated (or Codex / Gemini / OpenCode CLI)
- `gh` CLI authenticated against the repo
- Node 22.x

## One-shot

Review a single PR by number:

```bash
npx tsx scripts/pr-review-local.ts 2257
```

What it does:

1. Fetches the PR diff via `gh api`
2. Runs the 5 voter pipeline (`architect`, `security`, `devex`, `catfish`, `scope_steward`) — each voter uses your local CLI subscription auth
3. Aggregates with the 4-tier rule (verified blocker / soft blocker / approve / abstain)
4. Posts a single review comment via `gh pr comment`
5. Adds the `pr-reviewed` label so a subsequent `--watch` run skips it

Cost: ~5 voter calls = ~5 messages of subscription quota at typical PR size, ~2 minutes wall-clock.

### Dry run

Pass `--no-post` to print results without commenting on the PR:

```bash
npx tsx scripts/pr-review-local.ts 2257 --no-post
```

## Watch mode

Poll open PRs every N seconds, review any without the `pr-reviewed` label:

```bash
npx tsx scripts/pr-review-local.ts --watch
npx tsx scripts/pr-review-local.ts --watch --interval 600   # 10-min poll
npx tsx scripts/pr-review-local.ts --watch --include-drafts
```

Skip rules in watch mode:

- Skips PRs already labeled `pr-reviewed`
- Skips PRs labeled `skip-pr-review` (matches the workflow's opt-out)
- Skips draft PRs unless `--include-drafts`

Stop with `Ctrl+C`.

## Aggregate decision tiers

Same as the CI workflow (per #2251 + #2254):

- ❌ **Verified blocker** — ≥1 voter has ≥1 verified finding (4-point gate passed with substantive `named_assertion`). Strict block.
- ⚠️ **Soft blocker** — ≥3 of 5 non-error voters voted `request_changes` but no verified findings. Reviewers apply the gate themselves.
- ✅ **Approve** — all non-error voters approved.
- ➖ **Abstain** — anything else (mixed, all-errors, etc).

## Empirical validation

The v5 retest (see [`pr-review-experiment-results-v5.md`](../research/pr-review-experiment-results-v5.md)) hit:

- 100% bug-catch on diff-readable bugs
- 0% strict false positives (the "false positives" were real findings the dataset mislabeled)
- 26 verified findings across 10 PRs
- Caught a real bug in #2235 that no human reviewer noticed (devex flagged `GITHUB_API_KEY` instead of `GITHUB_TOKEN`)

## Running as a long-lived watcher

To make `--watch` survive logouts and restarts, wrap it in a systemd user service:

```ini
# ~/.config/systemd/user/pr-review-watch.service
[Unit]
Description=nexus-agents pr_review local watcher
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/william/git/nexus-agents
ExecStart=/usr/bin/npx tsx scripts/pr-review-local.ts --watch --interval 600
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now pr-review-watch.service
journalctl --user -u pr-review-watch -f
```

## Re-enabling the GitHub Actions workflow

If you later get a metered API key and want the workflow to fire on every PR (the original Child 6 design), edit `.github/workflows/pr-review.yml`:

- Change `if: contains(github.event.pull_request.labels.*.name, 'pr-review-ci')` to `if: ${{ !contains(github.event.pull_request.labels.*.name, 'skip-pr-review') }}`
- Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY` / `OPENROUTER_API_KEY`) in repo Actions secrets

The workflow's precheck step will reject runs without a configured key with an actionable error.

## Refs

- [`pr-review-experiment-results-v5.md`](../research/pr-review-experiment-results-v5.md) — empirical validation
- #2233 (epic, closed)
- #2256 (Child 6 — original CI promotion, now dormant)
- #2258 (the API-key issue that motivated the local mode)
