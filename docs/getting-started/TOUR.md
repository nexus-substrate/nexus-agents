---
title: 'Try nexus-agents with the tour'
description: 'Walk through four nexus-agents tools with the built-in tour. No API keys, no authenticated CLI and no model calls.'
diataxis: tutorial
audience: user
order: 2
tier: 1
keywords: [tour, getting-started, tutorial, onboarding, no-api-keys]
related_files: [./YOUR_FIRST_RUN.md, ./FIRST_TASK.md, ./INSTALLATION.md]
---

# Try nexus-agents with the tour

In this tutorial you install nexus-agents and step through its built-in tour.
By the end you will have seen what four of its tools return: task routing, a
consensus vote, research synthesis and audit-chain verification.

The tour prints stored example output. It makes no model calls, so you need no
API keys and no authenticated coding CLI. Everything it shows is labelled
`representative output`; your own runs will differ.

You need Node.js 24 and npm.

## 1. Install nexus-agents

```bash
npm install -g nexus-agents
nexus-agents --version
```

You should see the installed version on the last line:

```text
nexus-agents v11.1.3
```

Your version number may be newer. If the shell says `command not found`, npm's
global `bin` directory is not on your `PATH`; see
[Installation](./INSTALLATION.md#permission-errors-on-linuxmacos).

## 2. Start the tour

```bash
nexus-agents tour
```

You should see the tour banner and the first step:

```text
═══ nexus-agents tour ═══
…
─── Step 1/5: Welcome ───
```

After each step the tour waits with:

```text
Press Enter to continue (Ctrl-C to exit) ...
```

Press Enter to move on.

## 3. Read the routing step

Step 2 shows the `orchestrate` tool. Look at the block between
`--- representative output ---` and `--- end output ---`:

```text
Task: "implement a /healthz endpoint with structured logging"
  Classifier:    task_type=implementation  complexity=4/10
  Router picked: claude-sonnet           (capability=code_generation, score=0.91)
  Pattern:       graph                    (2 sequential subtasks detected)
…
```

Notice the three decisions it records: what kind of task this is, which model
was picked, and which execution pattern was chosen.

## 4. Read the vote step

Step 3 shows a three-voter consensus vote:

```text
Proposal: "Adopt Bun as the dev-time test runner alongside Vitest"
  Software Architect   APPROVE  (conf 0.82)  Keeps deps slim; vitest API parity
  Security Engineer    REJECT   (conf 0.74)  New supply-chain surface, unproven
  Scope Steward        REJECT   (conf 0.71)  Two runners = sprawl; pick one
  Result: 1/3 approve (33%)  ->  REJECTED  (simple_majority, threshold 50%)
```

Each voter gives a decision, a confidence and a one-line reason. The result
line names the bar the tally was measured against. One approval out of three
is below the 50% bar, so the proposal is rejected.

## 5. Finish the tour

Keep pressing Enter through step 4 (research synthesis) and step 5 (audit-chain
verification). The tour ends with:

```text
═══ Tour complete ═══
Next steps:
  nexus-agents doctor              -- check your install
  nexus-agents setup               -- configure MCP + .rules + data dirs
  nexus-agents --help --all        -- see every command
```

To print the whole tour again without the pauses, run:

```bash
nexus-agents tour --non-interactive
```

## What you did

You installed nexus-agents and read example output from routing, voting,
research and audit verification, without spending any model quota.

## Next

- [Your first run](./YOUR_FIRST_RUN.md) does the same things for real: it
  connects nexus-agents to your editor's agent and runs a live vote.
- [What a vote result means](../architecture/VOTE_RESULTS.md) explains the
  tally and the bars.
