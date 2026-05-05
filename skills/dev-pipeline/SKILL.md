---
name: dev-pipeline
description: |
  Multi-agent development pipeline (Orchestrator + workers + consensus vote).
  Use when the user asks to "build a feature", "fix a bug with the pipeline", or "run the dev pipeline".
  Triggers on "dev pipeline", "multi-agent pipeline", "run pipeline".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
---

# Development Pipeline Skill

<!--
  CANONICAL SOURCES:
  - docs/architecture/CONSENSUS_PROTOCOLS.md
  - .rules/subagent-coordination.md (auto-loaded for fan-out)
  - skills/references/orchestration-patterns.md (multi-agent coordination, fan-out, retry, deadline propagation)
  - skills/context-engineering (for parent-context preservation discipline)
-->

Use this skill when the user asks to build a feature, fix a bug, or implement a plan using the multi-agent development pipeline.

## Spec-driven phasing (gated workflow)

The `run_dev_pipeline` MCP tool implements a 4-phase gated workflow. **Do not advance to the next phase until the current one is validated.**

```text
SPECIFY ──→ PLAN ──→ TASKS ──→ IMPLEMENT
   │          │        │          │
   ▼          ▼        ▼          ▼
 vote()     vote()   vote()     vote() (per task)
```

### Phase 1 — Specify

Before producing the spec, **surface assumptions explicitly**:

```text
ASSUMPTIONS I'M MAKING:
1. This runs in the existing nexus-agents MCP server (not a new process)
2. New CLI flag goes through the existing dispatch table (cli-command-catalog.ts)
3. Storage uses the existing FileAuditStorage path (not a new backend)
4. Output schema follows the Result<T, E> pattern per CLAUDE.md
→ Correct me now or I'll proceed with these.
```

The spec's purpose is to surface misunderstandings _before_ code gets written. Silent assumptions are the most dangerous form of misunderstanding.

### Phase 2 — Plan

Convert the spec into a sequenced plan: which files change, in what order, with what tests. Each step references the canonical path (per CLAUDE.md "Canonical Paths") so future readers can navigate.

### Phase 3 — Tasks

Break the plan into atomic tasks suitable for fan-out. Each task has:

- A clear acceptance criterion (the test that asserts success)
- A bounded output (no "list all", per `.rules/subagent-coordination.md`)
- A scope (one directory or one canonical path, not "the codebase")

### Phase 4 — Implement

Dispatch tasks per the orchestration-patterns reference (waves of 3-4, output budgets, status lines). Parent context summarizes each subagent result to 2-3 bullets — never inline raw outputs (see `context-engineering` skill).

## When to Use

- User says "use the pipeline to build X"
- User says "run the dev pipeline"
- User provides a plan file or spec and wants multi-agent execution
- Complex tasks that benefit from research→plan→vote→implement→QA flow

## How to Use

Call the `run_dev_pipeline` MCP tool:

```
run_dev_pipeline({
  task: "Build a health check endpoint",     // Direct instructions
  // OR
  planFile: "/path/to/plan.md",              // Read from file

  repo: "owner/repo",                        // Track progress on GitHub issues
  trackerBackend: "github",                  // or "gitlab" or "json"
  mode: "autonomous",                         // "harness" = stop after decompose, return tasks
  dryRun: false,                             // true = stop after plan+vote
  simulateVotes: false,                      // TESTS ONLY — random output, never use for real decisions
  sessionId: "my-session-id",                // Enable checkpoint/resume (crash recovery)
  maxVoteIterations: 3,                      // plan→vote loop limit
  maxQaIterations: 3,                        // QA review loop limit
  scanTarget: "/path/to/repo",              // security scan directory
})
```

## Pipeline Flow

```
RESEARCH → research expert gathers context
PLAN → architecture expert creates plan
VOTE → consensus vote (higher_order Bayesian strategy)
  ↳ rejected? feedback → replan → revote (up to 3x)
PM DECOMPOSE → PM expert splits into tasks
PARALLEL IMPLEMENT → code experts work tasks concurrently
QA REVIEW → QA expert reviews each task
  ↳ needs_work? feedback → re-implement (up to 3x)
SECURITY SCAN → SARIF/Semgrep blocks on critical/high
SHIP ✓
```

## Output Format

The tool returns structured JSON:

```json
{
  "completed": true,
  "securityPassed": true,
  "voteIterations": 2,
  "qaIterations": 3,
  "plan": "...",
  "tasks": [
    {
      "id": "task-1",
      "title": "Add endpoint",
      "status": "done",
      "implementation": "export function health() { ... }",
      "feedback": null
    }
  ]
}
```

## After Pipeline Completes

**Autonomous mode** (default): Implementations are in each task's `implementation` field.

1. Read the `implementation` text from each task
2. Use your own tools (Read/Edit/Write) to apply the implementations
3. Run tests to verify
4. Commit and push

**Harness mode** (`mode: "harness"`): Pipeline returns decomposed tasks — YOU implement them.

1. Pipeline runs research→plan→vote→decompose and returns the task list
2. Each task has `id`, `title`, `description`, `assignedTo` — but no implementation
3. Use your own tools (Read/Edit/Write/Bash) to implement each task
4. Run tests, iterate, commit

## Tips

- Use `dryRun: true` first to review the plan before committing to implementation
- Use `sessionId` to enable crash recovery — pipeline resumes from last completed stage
- `simulateVotes: true` is for unit tests only — its votes are random and must not be used as a fallback when adapters are missing. If no adapter is available, configure one rather than simulating.
- Provide `repo` to get GitHub issue tracking of every pipeline stage
- The pipeline uses CompositeRouter for intelligent CLI selection (weather-aware, LinUCB)
- Each expert gets its system prompt (research, architecture, PM, code, QA)
- Vote feedback propagates back to the plan stage for iterative refinement
- Memory integration: prior learnings seed research, QA outcomes write back to SessionMemory
- Outcome store + weather report + trend detection inform the plan stage

## Anti-rationalization — Dev pipeline

| Excuse                                               | Counter                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| "Skip the spec, just code"                           | The spec catches assumption mismatches before they cost a rewrite. Even a 5-line spec is better than zero.                            |
| "Skip the vote, I know what's right"                 | The vote isn't agreement-seeking; it's blind-spot detection. Cheap, fast, valuable.                                                   |
| "We don't need consensus for routine work"           | Correct — use `quickMode` and `simple_majority` for routine. Skip the vote entirely only for trivial fixes.                           |
| "Just dispatch a giant subagent for the whole thing" | Wave-of-3-4 with bounded outputs (`.rules/subagent-coordination.md`). Giant subagents return giant outputs that flood parent context. |
| "I'll inline the subagent results into my context"   | Summarize to 2-3 bullets per result; re-read the file if details needed. Inlining destroys parent context budget.                     |

## Red flags

- Pipeline run with `simulateVotes: true` for a non-test path
- Subagent prompt > 500 words
- Output budget unstated in subagent prompt
- More than 4 agents in a single wave without explicit reason
- Parent context inlining raw subagent results
- Phase advanced without the gate vote completing

## Verification checklist

- [ ] Each phase gate (SPECIFY / PLAN / TASKS / IMPLEMENT) recorded its vote
- [ ] Subagent prompts under 500 words; output budget stated; status line required
- [ ] Wave size ≤ 4 parallel agents; next wave waits for current to finish
- [ ] Parent summarized each result to 2-3 bullets before continuing
- [ ] Final implementation passes `pnpm lint && pnpm typecheck && pnpm test`
- [ ] Discoveries from subagents re-verified by parent before filing (4-point gate per CLAUDE.md)
