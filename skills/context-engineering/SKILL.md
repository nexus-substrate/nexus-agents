---
name: context-engineering
description: |
  Curate what the agent sees, when, and how it's structured. Apply when
  starting a session, when output quality drifts, when fanning out
  subagents, or when configuring rules files. Triggers on
  "context engineering", "rules file", "agent context",
  "subagent fan-out", "context budget".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Context Engineering Skill

<!--
  CANONICAL SOURCES:
  - CLAUDE.md "Context Budget" + "Subagent Context Management"
  - CLAUDE.md "auto memory" + the persistent memory system at
    ~/.claude/projects/.../memory/
  - .rules/subagent-coordination.md (auto-loaded for subagent fan-out)
  Adapted from addyosmani/agent-skills (MIT, © 2025 Addy Osmani).
-->

## When to apply

- Starting a new session — load the right rules + memory + recent state
- Output quality is drifting (wrong patterns, hallucinated APIs, ignoring conventions)
- Fanning out work to subagents — every prompt has a context budget
- Setting up a new project for AI-assisted development
- Switching between unrelated parts of the codebase (start fresh, don't drag old context)

## The context hierarchy (most → least persistent)

```
1. Rules files            CLAUDE.md, AGENTS.md, .rules/*.md
2. Memory                 ~/.claude/projects/.../memory/MEMORY.md + topic files
3. Spec / architecture    docs/architecture/*.md, ADRs (loaded per feature)
4. Relevant source        source files for the task (loaded per task)
5. Live state             error output, test results (loaded per iteration)
6. Conversation           accumulates, compacts automatically
```

Higher levels persist across sessions; lower levels are transient. Engineer the higher levels well — they pay for themselves on every future session.

### Level 1 — rules files

Project-wide, always loaded. nexus-agents canonical:

- `CLAUDE.md` — prime directive, type-safety policy, anti-sprawl, autonomous-loop rules, tooling commands
- `AGENTS.md` — per-skill routing keywords for non-Claude tools
- `.rules/*.md` — auto-loaded per-topic rules (`typescript.md`, `git.md`, `subagent-coordination.md`, `untrusted-input.md`, etc.)

Edits here have repo-wide leverage. Treat with care: these are the single biggest input to every future session.

### Level 2 — memory

Per-user, cross-session. `~/.claude/projects/-home-william-git-nexus-agents/memory/`:

- `MEMORY.md` — index, always loaded. Keep entries to one line < 200 chars.
- `<topic>.md` — detail loaded on relevance.
- See `CLAUDE.md` "auto memory" for what to save (user/feedback/project/reference) and what NOT to save (anything derivable from `git log` or current files).

Memory is a **point-in-time observation**, not live state. Verify against current code before asserting facts from a stale memory.

### Level 3 — specs and architecture

Load **the relevant section**, not the entire 5000-word spec. ADR-shaped docs in `docs/adr/` are short by design — load freely. Architecture docs in `docs/architecture/` are larger — load only what applies.

### Level 4 — relevant source

Before editing a file, read it. Before introducing a pattern, find an existing example via `Grep`. nexus-agents canonical paths are tabulated in `CLAUDE.md` ("Canonical Paths") — start there for module discovery.

### Level 5 — live state

Test output, lint errors, CI logs, current `git status`. Capture once, summarize, don't keep re-fetching.

### Level 6 — conversation

Auto-compacts as it grows. Per `CLAUDE.md` "Context management": when working with tool results, write down important info in your response — the original tool result may be cleared later.

## Subagent fan-out (the high-stakes case)

Per `CLAUDE.md` "Subagent Context Management" + `.rules/subagent-coordination.md`:

- **Wave size**: max 3-4 parallel agents per wave. Wait for the wave to finish before starting the next.
- **Output budget per agent**: state in the prompt — "Return a prioritized summary of top-N findings. Reference files by path. Max 2000 characters." Never "list all" or "return everything."
- **Scope bounding**: prefer directory-level partitions ("scan `src/consensus/`") over codebase-wide sweeps. For whole-repo tasks, partition by top-level dir, one agent per partition.
- **Prompt size**: under 500 words. If you need more, the task is too big — split it.
- **Status protocol**: every subagent response ends with `## Status: complete | blocked — <reason> | partial — cutoff at X of Y`. Blockers surface in the same response, not silently.
- **Discovery reporting**: prompt subagents to add a `## Discoveries` section for bugs found outside their scope. Parent agent **re-verifies** before filing (the 4-point gate in `CLAUDE.md` "Discovered Issues").

## Confusion management

When context conflicts or a requirement is ambiguous, **don't silently pick**. Surface it:

```text
CONFUSION:
- The CLAUDE.md prime directive says "correctness > simplicity > performance"
- The performance-optimization skill says we should optimize hot paths
- This change adds 40 LOC of micro-optimization to a path with no perf evidence

Options:
A) Apply the optimization — defends a future hot path
B) Skip the optimization — no current evidence of slowness
C) Add a perf benchmark first to gather evidence

→ Which approach do you want?
```

When a requirement is missing, **don't invent** it. Ask. The human's job is to define requirements; the agent's job is to implement them.

## The inline planning pattern

For multi-step tasks, emit a lightweight plan **before** executing:

```text
PLAN:
1. Add Zod schema for task creation — title required, description optional
2. Wire schema into POST /api/tasks route handler
3. Add test for the validation error response
→ Executing unless you redirect.
```

A 30-second plan catches wrong directions before you've built on them. Saves 30 minutes of rework.

## Anti-rationalization — Context

| Excuse                                         | Counter                                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "The agent should figure out the conventions"  | It can't read your mind. Write the rules file. 10 minutes upfront saves hours of correction.       |
| "I'll correct it when it goes wrong"           | Prevention is cheaper than correction. Drift compounds across iterations.                          |
| "More context is always better"                | Performance degrades with non-relevant context. Aim for ~2,000 lines of FOCUSED context per task.  |
| "The context window is huge, I'll use it all"  | Window size ≠ attention budget. Focused context outperforms large context.                         |
| "I'll just have one giant subagent do it all"  | One 50k-token subagent return == catastrophic context flood. Wave of 3-4 with bounded outputs.     |
| "I'll let the subagent decide what's relevant" | The subagent can't see your goal. State the question, the scope, and the output budget explicitly. |

## Anti-patterns

| Anti-pattern           | Symptom                                                 | Fix                                                                   |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| **Context starvation** | Agent invents APIs, ignores conventions                 | Load rules + relevant source before each task                         |
| **Context flooding**   | Agent loses focus with > 5k lines of irrelevant context | Include only what's relevant; aim < 2k focused lines per task         |
| **Stale context**      | Agent references deleted code or old patterns           | Start fresh session when switching unrelated tasks                    |
| **Missing examples**   | Agent invents new style instead of following yours      | Include one example of the canonical pattern                          |
| **Implicit knowledge** | Agent doesn't know project-specific rules               | Write it down. "Tribal knowledge" doesn't survive a session boundary. |
| **Silent confusion**   | Agent guesses when it should ask                        | Surface ambiguity using the Confusion-management pattern              |
| **Subagent flood**     | Wave of 6+ parallel agents → parent context exhausted   | Wave-of-3-4 max. Summarize each result to 2-3 bullets in parent.      |

## Red flags

- New session started with no rules-file load, no memory check
- Subagent prompt over 500 words
- Subagent output bound stated as "all", "everything", or absent
- Parent agent inlining full subagent results into its own context
- Agent referencing imports/types that don't exist in the codebase
- Memory recall used as ground truth without re-verifying against current files
- More than 3-4 subagents launched in parallel without an explicit wave plan

## Verification checklist

- [ ] Rules files (`CLAUDE.md`, `AGENTS.md`, relevant `.rules/*.md`) loaded at session start
- [ ] Memory `MEMORY.md` index reviewed for relevant prior context
- [ ] Subagent prompts include scope, output budget, and status-line requirement
- [ ] Subagent results summarized to 2-3 bullets in the parent context (not inlined)
- [ ] Confusion surfaced explicitly when requirements conflict or are missing — not silently chosen
- [ ] Multi-step tasks announced with a lightweight plan before execution
- [ ] Stale memory entries flagged or refreshed; not used as live state
- [ ] No subagent wave exceeds 3-4 parallel agents without explicit reason
