---
'nexus-agents': minor
---

feat(core): human console notifications for step boundaries (#1930)

Adds a typed step event bus and stderr console renderer so operators see a
scannable trail of what nexus-agents is doing when invoked via CLI or
pipeline. JSON logs remain the source of truth; the renderer is a peer
subscriber to the same `stepBus`.

- New `core/step-events` vocabulary: `step.started | step.completed | step.failed`
  with stable fields (stepId, parentStepId, kind, durationMs, errorCategory,
  summary).
- New `core/with-step` wrapper propagates parent step IDs via AsyncLocalStorage,
  so nested steps display correctly indented without threading context.
- New `core/console-renderer` subscribes to the bus and writes to stderr only;
  glyph mode when TTY, ASCII otherwise; honors `NO_COLOR`.
- `core/step-logger-bridge` emits the same events as structured JSON logs for
  backward compatibility.
- `bootstrapStepNotifications({ mode })` wires both subscribers. Defaults:
  `cli` and `mcp-http` on, `mcp-stdio` off (protects JSON-RPC frames).
  Override with `NEXUS_CONSOLE=0|1`. Bootstrap is idempotent.
- First canonical migration: `pipeline/dev-pipeline.ts` research,
  security-scan, decompose, plan, and vote stages now emit step events with
  useful summaries (e.g., `83% approved`, `12 tasks`).

No behavior change to existing JSON logs or MCP frames.
