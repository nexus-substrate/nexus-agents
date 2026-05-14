---
paths: ['packages/**/mcp/**/*.ts']
description: MCP tool prerequisite gates — world-state preconditions enforced at call time
---

# MCP Tool Prerequisite Gates

Some MCP tools must not run unless a **world-state precondition** holds.
Issue #2652 (Epic B) moves that from "documented in a skill" to mechanically
enforced at the wrapper layer.

## The model — predicate, not session-ordering

A prerequisite is a **predicate over observable world state**, evaluated on
every invocation by `withPrerequisite()` (`src/mcp/middleware/tool-prerequisites.ts`):

- ✅ "is the `gh` CLI installed?", "is `NEXUS_DATA_DIR` writable?" — world state, checkable at call time.
- ❌ "tool A must have been called before tool B" — **not** a prerequisite. MCP
  `tools/call` invocations are independent; a session-ordering gate is satisfied
  by an LLM calling the prior tool pointlessly without making the precondition
  true. If a requirement can only be expressed as "call X first," it is the
  tool's own internal responsibility, not a gate.

A blocked tool returns a structured error envelope (`.rules/mcp.md`) with
`errorCategory: 'permission'` and a `detail` carrying the failed prerequisite
name + a remediation hint — so the caller knows how to recover.

Fail-closed: a predicate that throws blocks the tool.

## Prerequisite graph

| Tool                 | Prerequisite        | Rationale                                                                                                        |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `improvement_review` | `gh-cli-available`  | its `fileIssues` mode shells out to `gh` to file candidate issues; without it the write path fails mid-operation |
| `memory_write`       | `data-dir-writable` | persists entries under `NEXUS_DATA_DIR` — an unwritable data dir fails the write confusingly mid-operation       |
| `registry_import`    | `data-dir-writable` | persists a draft registry entry under `NEXUS_DATA_DIR` when not in `dryRun` mode                                 |

## Not gated — and why

Untrusted-input handling (e.g. `issue_triage`'s trust-tier classification, the
Rule of Two) is **internal-handler logic** per `.rules/untrusted-input.md`, not
a call-time world-state predicate — it cannot be a prerequisite gate. Tools
whose only "precondition" is adapter/CLI availability are covered by the
resilient-adapter circuit breaker and per-voter fallback, not a pre-gate.

The full list of deliberately-ungated non-read-only tools (with reasons) lives
in `NO_PREREQUISITE` in `src/mcp/middleware/tool-prerequisites.ts`.

## CI enforcement

`check:tool-prerequisites` (in `scripts/inject-governance.ts`) fails if any
non-read-only MCP tool is absent from **both** `TOOL_PREREQUISITES` and
`NO_PREREQUISITE` — so a newly added sensitive tool cannot ship ungated by
omission. Adding a tool means making a deliberate call: declare a prerequisite,
or list it in `NO_PREREQUISITE` with a reason.
