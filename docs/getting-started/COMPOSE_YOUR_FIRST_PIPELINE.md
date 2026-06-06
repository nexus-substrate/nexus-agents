---
title: 'Compose Your First Pipeline'
description: A hands-on newcomer walkthrough chaining MCP tools — research → vote → build — toward a concrete goal
tier: 2
keywords: [getting-started, tutorial, mcp, pipeline, compose, research, consensus, dev-pipeline]
---

# Compose Your First Pipeline

**~15 minutes, hands-on.** [FIRST_TASK.md](./FIRST_TASK.md) gets you a single working tool in 5 minutes. This guide is the next step: **chaining several MCP tools into one decision-to-implementation flow**, and — the part newcomers miss — **how the output of one tool becomes the input to the next**.

> Prerequisites: nexus-agents wired into your editor as an MCP server (see [FIRST_TASK.md §4](./FIRST_TASK.md)) so the 46 MCP tools are available to your agent. You drive each step in natural language; your agent calls the tool. The JSON blocks below show what it calls under the hood so you can see the data flow.
>
> New to the words "pipeline", "consensus loop", "dev pipeline"? Read the [Pipeline Terminology table](../README.md#pipeline-terminology) first — this guide uses them precisely.

## The goal

We'll take one concrete, decision-shaped goal end to end:

> **"Should we add rate limiting to the public API — and if so, build it?"**

That single sentence has two halves a pipeline handles well: a **decision** (is this worth doing, and how?) and an **implementation** (do it). We'll chain four tools:

```
research_discover ──▶ research_synthesize ──▶ consensus_vote ──▶ run_dev_pipeline
   (gather prior art)    (cluster findings)     (decide approach)   (build it)
```

Each arrow is a hand-off: you carry a piece of one tool's output into the next tool's input. Nothing is magic — it's just copy-the-relevant-bit-forward.

---

## Step 1 — Gather prior art with `research_discover`

Before deciding, gather evidence. Ask your agent:

> "Use research_discover to find recent work on API rate-limiting algorithms."

Under the hood:

```json
{
  "tool": "research_discover",
  "topic": "API rate limiting algorithms",
  "source": "all",
  "maxResults": 8
}
```

**Expected output** — a list of discovered papers/repos with titles, sources, and relevance scores, e.g.:

```
8 results for "API rate limiting algorithms":
- Token bucket vs. sliding window for distributed rate limiting (relevance 0.91)
- Generic cell-rate algorithm (GCRA) implementations (relevance 0.84)
- ...
```

**The hand-off:** skim the titles and note the 2–3 approaches that recur — here, _token-bucket_, _sliding-window_, _GCRA_. Those candidate approaches are what the next steps reason about.

---

## Step 2 — Condense with `research_synthesize` (optional but useful)

`research_discover` gives you a list; `research_synthesize` clusters what's already in the research registry into themes so you weigh maturity rather than raw hits.

> "Synthesize the research registry for the rate-limiting topic."

```json
{ "tool": "research_synthesize", "topic": "rate limiting" }
```

**Expected output** — topic clusters with common themes, key insights, and implementation opportunities. Read the cluster summary for the trade-off framing (e.g. "token-bucket is simplest and burst-friendly; sliding-window is more accurate but heavier"). **The hand-off:** that one-line trade-off becomes the heart of the proposal you vote on next.

> If the registry is empty for your topic, skip to Step 3 with the candidates from Step 1 — synthesis just sharpens the framing.

---

## Step 3 — Decide with `consensus_vote`

Now turn the evidence into a concrete proposal and put it to the multi-agent panel. **Write the proposal yourself** from Steps 1–2 — this is the key hand-off, evidence → decision:

> "Run a consensus_vote on this proposal: 'Add rate limiting to the public API using a token-bucket limiter (simplest, burst-tolerant) with per-route configurable limits; defer the heavier sliding-window approach unless accuracy complaints appear. Prior art: token-bucket and GCRA are the common, battle-tested choices.'"

```json
{
  "tool": "consensus_vote",
  "proposal": "Add rate limiting to the public API using a token-bucket limiter (simplest, burst-tolerant) with per-route configurable limits; defer sliding-window unless accuracy issues appear.",
  "strategy": "simple_majority"
}
```

**Expected output** — a decision plus per-role reasoning:

```
decision: approved   approvalPercentage: 86
votes:
  - Software Architect (approve): clean boundary, token-bucket is the right default
  - Security Engineer (approve): bounds request floods; no new untrusted surface
  - Scope Steward (approve): reuses a well-understood pattern, no over-engineering
  ...
```

**Read the verdict, not just the number.** If it's `rejected`, the per-role feedback tells you _why_ — revise the proposal and re-vote. If `approved`, carry the **approved proposal text** forward as the task to build.

> Voting strategies: `simple_majority` (default) for routine calls; `supermajority` or `higher_order` for architecture/security-weighty decisions. Add `"quickMode": true` for a faster 3-agent panel.

---

## Step 4 — Build it with `run_dev_pipeline`

Hand the approved proposal to the development pipeline. **Always `dryRun` first** — it stops after plan + vote so you can review the plan before any code is written:

> "Run run_dev_pipeline in dryRun mode for: implement a token-bucket rate limiter on the public API with per-route configurable limits."

```json
{
  "tool": "run_dev_pipeline",
  "task": "Implement a token-bucket rate limiter on the public API with per-route configurable limits. Requests over the limit return HTTP 429.",
  "dryRun": true,
  "maxVoteIterations": 3
}
```

**Expected output (dry run)** — the pipeline runs research → plan → **vote** and stops, returning the approved plan, the vote outcome, and the decomposed tasks — but no implementation. Read the plan. If it's sound:

> "Run it for real this time" — i.e. the same call with `"dryRun": false`.

The full pipeline then decomposes the plan, implements each task, runs QA review (looping up to `maxQaIterations`), and gates on a security review before reporting completion. `maxVoteIterations` (default 3) bounds how many plan→vote rounds it will attempt before proceeding with the best plan.

---

## What you just composed

| Hand-off              | You carried forward                               |
| --------------------- | ------------------------------------------------- |
| discover → synthesize | the recurring candidate approaches                |
| synthesize → vote     | the one-line trade-off, written into the proposal |
| vote → dev-pipeline   | the **approved** proposal text, as the build task |
| dry run → real run    | your sign-off on the plan before code is written  |

That's the whole pattern: **each tool produces a small, human-readable artifact; you (or your agent) carry the relevant bit into the next tool.** No special wiring — the composition is the hand-offs.

## Where to go next

| To…                                                            | Go to                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Build a **custom** pipeline in code (not just chain MCP tools) | [COMPOSITION_PATTERNS.md](../guides/COMPOSITION_PATTERNS.md) |
| Understand which entry point to use when                       | [Pipeline Terminology](../README.md#pipeline-terminology)    |
| See every tool's parameters                                    | [ENTRYPOINTS.md](../ENTRYPOINTS.md)                          |
| Save a chain as a reusable YAML workflow                       | [WORKFLOW_TEMPLATES.md](../guides/WORKFLOW_TEMPLATES.md)     |
