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
