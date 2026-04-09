# Development Pipeline Skill

Use this skill when the user asks to build a feature, fix a bug, or implement a plan using the multi-agent development pipeline.

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
  simulateVotes: false,                      // true = simulated votes (no real CLIs)
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
- Use `simulateVotes: true` to test without real CLI adapters
- Provide `repo` to get GitHub issue tracking of every pipeline stage
- The pipeline uses CompositeRouter for intelligent CLI selection (weather-aware, LinUCB)
- Each expert gets its system prompt (research, architecture, PM, code, QA)
- Vote feedback propagates back to the plan stage for iterative refinement
- Memory integration: prior learnings seed research, QA outcomes write back to SessionMemory
- Outcome store + weather report + trend detection inform the plan stage
