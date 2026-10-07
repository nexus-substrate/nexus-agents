---
title: 'Add nexus-agents review gates to your CI'
description: 'Fail a GitHub Actions job when a nexus-agents voter panel does not approve a pull request diff.'
diataxis: how-to
audience: user
order: 20
prerequisites:
  - 'A provider API key stored as a repository secret, for example `ANTHROPIC_API_KEY`. A CI runner usually has no signed-in coding CLI, so the vote runs every seat through the key.'
  - 'A diff of at most 256 KiB. `--artifact-file` refuses larger files.'
tier: 2
keywords: [ci, github-actions, review, gate, vote, pull-request]
related_files:
  [../architecture/VOTE_RESULTS.md, ../reference/cli-and-key-requirements.md, ./PR_REVIEW_LOCAL.md]
---

# Add nexus-agents review gates to your CI

This guide adds a GitHub Actions job that asks a nexus-agents voter panel to
review a pull request's diff and fails the job unless the panel approves.

## Choose the command

The gate is `nexus-agents vote`, because its exit code carries the verdict:

| Result                   | Exit code                           |
| ------------------------ | ----------------------------------- |
| `approved`               | 0                                   |
| `rejected`               | 1                                   |
| `no_quorum`              | 1, or 2 with `--on-no-quorum exit2` |
| no model route available | 1                                   |

Two other surfaces look like gates but are not suitable on their own:

- `nexus-agents review <owner/repo#N>` posts a review to the pull request. It
  exits 0 on any completed review, including one that requests changes, so it
  cannot fail a job on the verdict.
- The `pr_review` and `run_quality_gate` MCP tools need an MCP client. There is
  no CLI command that wraps them. Use them from an agent session; see
  [Local pr_review](./PR_REVIEW_LOCAL.md).

## Add the workflow

Create `.github/workflows/nexus-review-gate.yml`:

```yaml
name: nexus-agents review gate

on:
  pull_request:

permissions:
  contents: read

jobs:
  review-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install nexus-agents
        run: npm install -g nexus-agents

      - name: Write the diff
        env:
          BASE_REF: ${{ github.base_ref }}
        run: git diff "origin/${BASE_REF}...HEAD" > pr.diff

      - name: Panel review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          nexus-agents vote --quick \
            --strategy supermajority \
            --error-policy absolute_quorum \
            --on-no-quorum exit2 \
            --artifact-file pr.diff \
            --proposal "Approve merging pull request #${PR_NUMBER} (${PR_TITLE}) as shown in the attached diff."
```

What the choices do:

- `--quick` seats three voters (architect, security, scope steward). Drop it
  for the seven-voter panel.
- `--strategy supermajority` sets the bar to two thirds of the voters who
  answered. Use the strategy to set the bar; `--threshold` is ignored when a
  strategy is given.
- `--error-policy absolute_quorum` turns any failed seat into `no_quorum`, so
  the job cannot pass on a partial panel.
- `--on-no-quorum exit2` gives an incomplete panel its own exit code, so you can
  tell "rejected" from "could not decide" in the job log. Use
  `--on-no-quorum retry` to re-run once instead.
- `--artifact-file` puts the diff text into every voter's prompt, with its
  SHA-256 digest. Without it the voters see only the proposal sentence.
- The pull request title is passed through `env` rather than written into the
  script, so a crafted title cannot inject shell commands.

[What a vote result means](../architecture/VOTE_RESULTS.md) explains the
strategies and error policies.

## Keep the job's permissions read-only

The diff is text written by the pull request's author, and the job holds an
API key. Keep `permissions: contents: read` and give the job no token that can
write to the repository. Pull requests from forks do not receive repository
secrets on the `pull_request` event, so on a fork the vote finds no model route
and exits 1.

## Make it required

In the repository's branch protection or ruleset, add the `review-gate` job as
a required status check.

## Check the result

Open the job log. The vote prints each voter's decision, the tally, and a
`Result:` line. Exit code 0 means the panel approved; the log shows which voter
rejected or errored otherwise.

## Related

- [What a vote result means](../architecture/VOTE_RESULTS.md)
- [Which CLIs and keys do I need?](../reference/cli-and-key-requirements.md) — why a CI runner needs a provider key
- [CLI reference](../reference/cli.md)
- [Local pr_review](./PR_REVIEW_LOCAL.md)
