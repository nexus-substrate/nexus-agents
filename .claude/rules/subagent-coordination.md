# Subagent Coordination Hygiene

Auto-loaded when dispatching subagents (Agent tool, Task tool), and applies to every subagent response. Adapted from the `paperclipai/paperclip` task-workflow + heartbeat-protocol disciplines — the behavioral subset that translates to our synchronous subagent model.

## Non-Negotiable Rules

### 1. Explicit Terminal State

Every subagent response MUST end with exactly one of these status markers:

```
## Status: complete
Brief description of what was accomplished.
```

```
## Status: blocked — <specific-reason>
What was attempted, what blocked it, what input/action would unblock.
```

```
## Status: partial — cutoff at <X> of <Y>
Completed: [list]. Remaining: [list]. Reason for cutoff (context, output budget, timeout).
```

No silent trail-offs. A response that ends with "I'll look at this next…" or just stops mid-thought is a protocol violation.

### 2. Blockers Surface, Never Bury

When work can't proceed — missing file, ambiguous requirement, external dep down, credentials unavailable, contradictory instructions — name the blocker **in the same response** where it was hit. Do not:

- Guess past the blocker and keep going
- Return a "best-effort" result that silently omits the blocked portion
- Write "see above" without a concrete blocker line

The parent agent needs to know what changed between "scope as dispatched" and "scope actually completed." If a blocker is named, the parent can unblock and re-dispatch; if it's buried, the parent sees a wrong-but-plausible answer.

### 3. Output-Budget Cutoffs Are Explicit

When a subagent hits its output limit, token budget, or context ceiling mid-scan:

- Emit the partial result as-is
- Follow with a concrete cutoff line: `Cutoff at item 47 of 120; remaining: src/agents/**, src/cli/**, test/**`
- Do NOT compress the result into a single high-level summary that hides what was skipped

Compressed summaries that hide coverage gaps are the worst-case output: they look complete but silently miss scope. Always prefer "honestly partial" over "dishonestly whole."

## Polling and Waiting

When work needs to wait for an external signal (CI completion, deploy finish, long-running job, file appears), there are three correct patterns. A fourth pattern — chained sleep — is explicitly banned because the harness will block it.

### BANNED: chained sleep + check

```bash
# WRONG — the harness rejects this with a "use Monitor or run_in_background" error
sleep 30 && gh pr checks 1234
```

Why banned: the harness treats chained leading sleeps as a polling workaround. Don't try to defeat it by breaking the sleep into smaller pieces either — that pattern is also detected.

### PATTERN 1: fire-and-wait with background notification

Use when you kicked off the long-running command yourself and want to be notified when it finishes.

```
Bash(command: "pnpm test -- --run", run_in_background: true)
# Do other work; the harness notifies you when the background task completes.
```

Right for: build/test/deploy that you started, long agent spawns.

### PATTERN 2: poll-until-condition as one command

Use when you need to wait for a condition that some external process will eventually satisfy.

```bash
until gh pr checks 1234 | grep -q "^CI Success.*pass"; do sleep 2; done
```

This is a single command — not a chained one — so the harness allows it. The `sleep 2` inside the loop body is a body-level delay, not a leading sleep.

Right for: waiting on CI, waiting on a file to appear, waiting for a port to open.

### PATTERN 3: schedule-and-revisit with Monitor

Use when the wait is long (minutes+) and you don't want to keep a shell open.

Use the `Monitor` tool (see tool list when spawned) to stream events from a background process. For pure timer-based waits, use `ScheduleWakeup` with a reason describing what you're waiting for.

Right for: idle cycles in `/loop`, "come back in 20 minutes to check the deploy," polling that would otherwise burn cache windows.

### Discovery note

If you hit the harness block unexpectedly, it means you wrote a chained-sleep pattern. Switch to Pattern 1, 2, or 3 — don't retry the same approach with shorter sleeps.

## Security Constraint on Status Outputs

When surfacing a blocker per rule 2, redact secrets before writing the status:

- Never include the literal value of an env var, API key, token, or secret in a blocker description — reference by name only (`ANTHROPIC_API_KEY unset`, not `ANTHROPIC_API_KEY=sk-ant-…`)
- Sanitize raw error output: stack traces and subprocess stderr often contain paths, connection strings, or auth tokens
- For missing-file blockers, include the relative path but not absolute paths containing usernames or tokens (`/home/<user>/…` → `~/…`)
- When unsure whether a string contains a secret, describe the error category (`auth failed`, `connection refused`) rather than pasting the raw message

## Adoption

- No CI enforcement (yet). Rules apply by convention and are checked during review.
- The `## Status:` marker is mechanically grep-able; a future lint can enforce presence in subagent output if adoption drifts.

## Explicitly Out of Scope (from paperclip, not ported)

| Paperclip concept                       | Why not ported                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Org-chart / company hierarchy           | We're a tool/orchestrator, not a workforce platform                                                             |
| Atomic task checkout + 409-on-conflict  | We're synchronous — no concurrent contention on a single task                                                   |
| Per-agent monthly budgets               | Covered by `NEXUS_BILLING_MODE` + cost routing                                                                  |
| Goal-traced task ancestry schema        | Our workflows + task decomposition already carry intent; a DB-backed goal graph is infrastructure we don't need |
| Persistent heartbeat state across ticks | We're request/response, not cron-scheduled agents                                                               |
