---
title: 'Your first run'
description: 'Install nexus-agents, connect it to your coding agent, ask the run tool for a routing decision, execute it as a live vote, and verify the audit chain.'
diataxis: tutorial
audience: user
order: 1
tier: 1
keywords: [getting-started, tutorial, run, first-run, mcp, verify_audit_chain]
related_files:
  [./TOUR.md, ./FIRST_TASK.md, ../guides/REGISTER_MCP_SERVER.md, ../architecture/VOTE_RESULTS.md]
---

# Your first run

In this tutorial you connect nexus-agents to the coding agent you already use
and give it one goal through the `run` tool. You will see `run` decide how to
handle the goal, then carry it out as a live consensus vote, then check the
audit log.

You need:

- Node.js 24 and npm.
- Claude Code or Codex CLI, installed and signed in. nexus-agents seats its
  voters on these two CLIs.

The vote in step 6 makes real model calls through your CLI subscription.

## 1. Install nexus-agents

```bash
npm install -g nexus-agents
nexus-agents --version
```

You should see:

```text
nexus-agents v11.1.3
```

A newer version number is fine.

## 2. Check that a voter CLI is ready

```bash
nexus-agents doctor
```

Find the `Checking CLI installations...` section. You should see a `✓` block
for Claude or Codex with `Auth: CLI auth`:

```text
✓ Claude CLI
  Version: 2.1.292 (supported)
  Auth: CLI auth
…
✓ Codex CLI
  Version: 0.160.0 (supported)
  Auth: CLI auth
```

Further down you should see:

```text
✓ MCP Server mode: Ready
```

If neither Claude nor Codex shows `✓`, sign in to one of them (run `claude` or
`codex login`) and run `doctor` again. Lines for other CLIs, and a final
`Summary: N issue(s) found`, do not stop this tutorial.

## 3. Connect nexus-agents to your agent

Change to the root of a project you work in, then run:

```bash
nexus-agents setup
```

`setup` registers nexus-agents as an MCP server with every supported coding
CLI it finds, and prints what it configured. Look for the line that names
Claude Code or Codex. It also writes `.nexus-agents/nexus-agents.yaml` in the
project, which turns on the audit log you will check in step 7.

Start your coding agent again from the same project directory so that it
starts the server with that configuration.

## 4. Ask `run` for a routing decision

In your coding agent, type:

> Call the nexus-agents `run` tool with the goal "Should we use SQLite over
> JSON files for the outcome store?" and `requiresConsensus: true`. Do not set
> `execute`.

Without `execute`, `run` only decides; it calls no model. You should see a
result like this one:

```json
{
  "strategy": "consensus",
  "reasoning": "pattern \"consensus\" → consensus (manifest consensus; Task requires multi-perspective consensus voting)",
  "confidence": 0.9,
  "alternatives": [],
  "needsShaping": false,
  "recommendedTool": "consensus_vote",
  "decisionId": "a0f2bf09-2c36-4de9-a50c-7e34c5ac6371",
  "note": "Routing decision only (read-only). Invoke the recommendedTool to execute, or re-run with execute: true for inline execution. …"
}
```

Read three fields:

- `strategy` is how nexus-agents will handle the goal: here, a consensus vote.
- `recommendedTool` is the tool that strategy uses.
- `confidence` is how sure the router is of that choice.

Your `decisionId` will differ.

If your agent says it has no `run` tool, the server is not registered. Follow
[Register the MCP server manually](../guides/REGISTER_MCP_SERVER.md), restart
the agent, and repeat this step.

## 5. Run it for real

Now ask:

> Call the nexus-agents `run` tool again with the same goal,
> `requiresConsensus: true` and `execute: true`.

This time the full seven-voter panel deliberates through your signed-in CLI,
so the call takes longer than step 4.

## 6. Read the vote

The result now contains the vote. Look for:

- `decision`: `approved`, `rejected` or `no_quorum`.
- Each voter's role, decision, confidence and rationale.
- The vote counts and the approval percentage.
- A `voteRecord` with `persisted: true`, which means the vote was written to
  the vote ledger.

Any of the three decisions means the run worked. `no_quorum` means too few
voters answered; [What a vote result means](../architecture/VOTE_RESULTS.md)
explains each outcome.

## 7. Verify the audit chain

Run `doctor` again and find the `audit` line under `Data directory layout`. It
gives the audit directory for this repository, for example:

```text
✓ audit  /home/you/project/.nexus-agents/audit
```

Ask your agent:

> Call the nexus-agents `verify_audit_chain` tool with `logDir` set to
> `.nexus-agents/audit`.

Use the path from your `doctor` output if it differs. The result has an
`eventCount` and a `verification` object. You should see:

- `eventCount` greater than 0: the server recorded your tool calls.
- `"ok": true` inside `verification`: every event links to the one before it.
- `"tamperedCount": 0`: no recorded event was altered.

If `verification` contains `"notVerified": "empty"` and `eventCount` is 0, the
directory holds no events and nothing was checked. That happens when the server
did not load the project's configuration: check that you ran `setup` and
started your agent from the same project directory.

## What you did

You installed nexus-agents, connected it to your agent, saw `run` choose a
strategy for a goal without spending anything, ran that strategy as a live
vote, and checked the audit log.

## Next

- [What a vote result means](../architecture/VOTE_RESULTS.md)
- [Compose your first pipeline](./COMPOSE_YOUR_FIRST_PIPELINE.md)
- [Which CLIs and keys do I need?](../reference/cli-and-key-requirements.md)
