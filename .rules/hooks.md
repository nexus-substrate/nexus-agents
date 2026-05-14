---
paths: ['packages/**/cli/hooks/**/*.ts', 'packages/**/mcp/**/*.ts']
description: When to reach for a post-tool hook vs a voter rule vs a prompt rule — and the tool-output consistency contract
---

# Hooks & Output Consistency

Issue #2653 (Epic B) asked for a PostToolUse normalization layer to coerce
heterogeneous MCP tool outputs into a consistent shape. **Codebase research
refuted the premise**: memory backends already return uniform `Date` objects,
no two tools use conflicting status taxonomies, and no tool uses a pagination
envelope. There is no current heterogeneity to normalize. So #2653 is
delivered as the _preventive_ kernel — this layering guide plus a
consistency lint — not a runtime normalization layer that would only mask
future drift instead of fixing it at source.

## Layering — hook vs voter rule vs prompt rule

When tool output (or behaviour) needs to change before it reaches a
consumer, pick the narrowest layer that fits:

| Layer                    | Use when                                                                                                   | Where                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Tool output contract** | The output shape itself is wrong/inconsistent. Fix it at the source tool.                                  | the tool's `outputSchema` + handler    |
| **PostToolUse hook**     | The shape is fine but a _cross-cutting_ transform must run after every tool (metrics, logging, redaction). | `src/cli/hooks/handlers/post-tool.ts`  |
| **Voter rule**           | The concern is how a voter _interprets_ output — calibration, weighting, what counts as a signal.          | `.rules/governance.md`, voter prompts  |
| **Prompt rule**          | The concern is how an expert/agent is _instructed_ — framing, format expectations.                         | `agents/*-expert.md`, skill `SKILL.md` |

Default to the **tool output contract**. A runtime normalization hook is the
last resort — it hides inconsistency rather than removing it, and every
consumer then has to trust the hook ran.

## Output consistency contract (enforced)

`check:tool-output-consistency` (`scripts/check-tool-output-consistency.ts`,
wired into `governance:check`) is a _preventive_ lint over
`src/mcp/tools/*.ts`. It fails when a new tool diverges from the shapes the
codebase already converged on:

- **Timestamps** — a timestamp-named field (`*At`, `*Date`, `timestamp`,
  `*Time`) must NOT be typed as a bare `z.number()` / `: number`. Use an
  ISO-8601 `z.string()` or a `Date`. Rationale: a voter once compared an
  epoch-ms number to an ISO date as if they were the same type.

Recommended (not gated) for new collection-returning tools: the
`{ items: [...], count: number }` envelope, matching `memory_query` /
`research_discover`. A hard gate isn't imposed because the existing tools
use three near-equivalent shapes (`{items,count}`, `{results,count}`,
`{events,totalEvents}`) and forcing one would be churn, not value.

## When a runtime normalization layer WOULD be justified

The reframe holds only because nexus-agents controls all 38 of its own
tools. If `src/mcp/gateway/` ever proxies **untrusted external MCP servers**
whose outputs flow into voter context, those outputs are genuinely
heterogeneous and out of our control — that is the real trigger to build a
runtime normalization boundary at the gateway. Until then, the contract +
lint above are sufficient. Revisit this file if the gateway's scope changes.
