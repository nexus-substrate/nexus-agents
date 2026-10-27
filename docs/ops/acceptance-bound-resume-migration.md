---
title: Migrate acceptance-bound pipeline resumes
description: Recover from a checkpoint evidence block and manage retained pipeline context.
diataxis: how-to
audience: user
tier: 2
keywords: [pipeline, checkpoint, resume, migration, acceptance]
related_files:
  - packages/nexus-agents/src/pipeline/dev-pipeline-checkpoint.ts
  - packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts
  - packages/nexus-agents/src/mcp/tools/dev-pipeline-tool.ts
---

# Migrate acceptance-bound pipeline resumes

**Status:** Canonical

For operators already using `run_dev_pipeline` with a `sessionId`, the next major release requires built-in, host-bound resumes to verify their approval evidence. Use this guide when an older or incomplete checkpoint stops your run. The same rule applies to the library's `runDevPipeline` and `runDevPipelineForGoal` entrypoints. [Implementation](../../packages/nexus-agents/src/pipeline/dev-pipeline-checkpoint.ts).

Before retrying, correct invalid input explicitly. Acceptance capture rejects invalid UTF-8, lone UTF-16 surrogates, NUL characters, empty input, and input above the 256 KiB artifact limit. It does not replace malformed bytes or silently clip oversized input. Correct the encoding or reduce the source; do not expect a new session ID to make the same invalid input acceptable. The combined acceptance-and-plan vote artifact must also fit its artifact and assigned-model budgets. [Input validation](../../packages/nexus-agents/src/pipeline/acceptance-context.ts), [vote preflight](../../packages/nexus-agents/src/pipeline/agent-executor-vote.ts).

## Start a fresh session after an evidence block

1. Read `checkpoint.status` in the result. `blocked` or `unavailable` includes a static `reason`, `recovery: "new-session"`, and the actual `sessionId` when supplied. The MCP error text asks you to start a new run with a new `sessionId`. `verified` means a saved approval was checked against the current acceptance input and canonical ledger; it does not mean a new vote ran. `fresh` identifies a bound run without a resumed approval; `unmeasured` identifies the custom/unbound compatibility path. [Result and message projection](../../packages/nexus-agents/src/mcp/tools/dev-pipeline-output.ts).

2. Distinguish a preflight block from a write failure. Invalid, unreadable, mismatched, or incomplete existing evidence stops before research, recall, stage execution, checkpoint append, or workspace creation. Those paths leave the checkpoint unchanged. `checkpoint-write-failed` means persistence failed; stage callbacks may already have run, and a failed append can leave a partial file. There is no automatic repair, rollback, or in-place conversion. A missing checkpoint file starts a fresh run; an existing empty file blocks. [Preflight and writer](../../packages/nexus-agents/src/pipeline/dev-pipeline-checkpoint.ts), [regression tests](../../packages/nexus-agents/src/pipeline/agent-executor-vote-recording.test.ts).

3. Keep the intended task or `planFile`, but use a new, previously unused ID:

   ```diff
    {
      "task": "Implement the validated acceptance requirements",
   -  "sessionId": "feature-run-previous",
   +  "sessionId": "feature-run-fresh-unique",
      "dispatch": "async"
    }
   ```

   Inspect earlier workspace changes first: a fresh execution may redo work. Alternatively, omit `sessionId` to avoid the old checkpoint. Async dispatch generates a fresh job ID in that case; the generated ID is not a durable checkpoint-resume guarantee. [Dispatch tests](../../packages/nexus-agents/src/mcp/tools/dev-pipeline-tool.test.ts).

4. For non-dry-run async calls, poll the returned ID with `get_job_result`. Reusing an indexed ID can return an existing job's replay response or an input-collision response, without starting execution. Changing `dryRun` or task input while keeping that ID is not a migration. [Async dispatch contract](../../packages/nexus-agents/src/mcp/tools/dev-pipeline-tool.ts).

Do not select custom stages to bypass an evidence block. Custom/unbound stage compatibility remains unmeasured; recognized bound data without current host authority still blocks. Existing stage callback arguments are unchanged. Adaptive graph `run_pipeline` does not consume these development-pipeline checkpoints and exposes no checkpoint qualification status. Its acceptance observations are separate. [Entrypoint tests](../../packages/nexus-agents/src/mcp/tools/pipeline-tool.test.ts).

When resuming verified task definitions, expect fresh implementation callbacks and a fresh security check. Stored implementation text is historical context, not proof that files exist in a new workspace. A checkpoint that already contains a terminal security result requires a new session. Acceptance observations measure host request construction and invocation; router delivery and provider attention remain unmeasured. [Execution-history tests](../../packages/nexus-agents/src/pipeline/agent-executor-vote-recording.test.ts), [observation contract](../../packages/nexus-agents/src/pipeline/acceptance-binding.ts).

## Manage retained context

Before retaining a checkpoint, account for its informational suffix: the exact bounded text sent alongside the approved proposal, including its presence or absence. It can include recalled hindsight or registry text and may be sensitive. The checkpoint does not separately serialize the raw acceptance baseline or the entire assembled enrichment. Existing saved research, plans, and tasks can also contain sensitive text. [Checkpoint schema](../../packages/nexus-agents/src/pipeline/pipeline-checkpoint-binding.ts).

The suffix permits at most 1,000 UTF-16 code units and 3,000 UTF-8 content bytes. Its versioned JSON object, including escaping and metadata, must fit 6,400 bytes, excluding the outer checkpoint record and proposal framing. Reconstruction preserves exact text, including trailing whitespace at the cutoff; a saved hash or approval boolean alone is insufficient. [Canonical suffix formatter and validator](../../packages/nexus-agents/src/pipeline/plan-vote-proposal.ts).

Locate `pipeline-<sessionId>.jsonl` in the effective checkpoint directory. Normal repository routing uses `<repo>/.nexus-agents/checkpoints`; data-directory overrides or library custom directories can change it. Bound reads and writes require a regular file owned by the current user with mode exactly `0600` on supported POSIX systems. An existing unsafe file is rejected, not chmodded or repaired. Windows and other platforms without measurable owner/mode evidence report unavailable. [Storage implementation](../../packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts).

After the session stops, remove its exact checkpoint if no longer needed:

```sh
rm -- /absolute/configured/checkpoints/pipeline-feature-run-previous.jsonl
```

Verify removal and account separately for backups or copied evidence. The normal security-pass path attempts cleanup, but deletion can fail. Dry runs, task handoffs, failed runs, and abandoned sessions can remain indefinitely; there is no guaranteed retention deadline. Deletion does not erase the canonical vote ledger or async idempotency record. Keep using the new session ID, and omit suffix text from issue reports and diagnostics. [Cleanup callsite](../../packages/nexus-agents/src/pipeline/dev-pipeline.ts).
