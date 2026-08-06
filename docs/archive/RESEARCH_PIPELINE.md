# Research-to-Project Pipeline (removed)

**Status:** Archived — the subsystem this document describes no longer exists.
**Removed in:** [#3492](https://github.com/nexus-substrate/nexus-agents/issues/3492) (PR [#3590](https://github.com/nexus-substrate/nexus-agents/pull/3590), commit `fa9d7cbcc6`), on a 5/0 `consensus_vote` to REMOVE.
**Originally:** [#1822](https://github.com/nexus-substrate/nexus-agents/issues/1822) (superseded closed [#1731](https://github.com/nexus-substrate/nexus-agents/pull/1731))

> **Do not use this document as a guide.** `packages/nexus-agents/src/pipeline/research-pipeline.ts`, the
> `runResearchPipeline` export, and the `nexus:research-pipeline` plugin id were all deleted. Everything below is
> retained only as a historical record of what the subsystem was intended to do.

## What replaced it

The `research` pipeline template was retired first, in [#3488](https://github.com/nexus-substrate/nexus-agents/issues/3488): its `investigate` and `synthesize` stages had no stage implementation and the stage order was incoherent, so the template could never actually run. Research-classified tasks now fall back to the `general` / `dev` templates ([#3489](https://github.com/nexus-substrate/nexus-agents/issues/3489)), which already cover research → plan → vote.

The complete-but-unwired `runResearchPipeline` subsystem ([#1711](https://github.com/nexus-substrate/nexus-agents/issues/1711)) was then removed as dead lineage — it had zero runtime call sites once its only consumer was retired. The capability is served today by:

- **AdaptiveOrchestrator templates** — see `packages/nexus-agents/src/pipeline/templates.ts` (the removal rationale is recorded in a comment at the `research` entry).
- **The MetaOrchestrator `research` strategy**, which routes to `run_pipeline`.
- **The `research_discover` / `research_synthesize` MCP tools** for the discovery and synthesis halves.

See [ENTRYPOINTS.md](../ENTRYPOINTS.md) for the current research surface.

---

## Historical record

Everything below described the removed implementation as of 2026-04.

## Purpose

Multi-stage runner for **external research and greenfield feasibility studies**. Unlike `dev-pipeline` (self-improvement loops), this pipeline produces outward-facing deliverables: executive memos, security reports, MVP scopes, architecture recommendations, and risk registers.

## Stages

```
Decompose → Investigate (parallel waves) → Synthesize → Vote → Scaffold
                                             ↑                ↓
                                             └── conditional_go feedback loop
```

| Stage         | Canonical type | Purpose                                                                       |
| ------------- | -------------- | ----------------------------------------------------------------------------- |
| `decompose`   | `analyze`      | Break prompt into bounded research tracks (LLM-assisted + heuristic fallback) |
| `investigate` | `execute`      | Parallel per-track investigation, wave size `maxParallelTracks` (default 4)   |
| `synthesize`  | `aggregate`    | Merge findings; surface contradictions; accept prior feedback on iteration    |
| `vote`        | `validate`     | Consensus go/no-go/conditional_go via `ConsensusProtocol`                     |
| `scaffold`    | `execute`      | On go, emit structured deliverables                                           |

## Integration points

- **PluginRegistry** (`core-plugins.ts`): registered alongside `task-analyzer`, `model-router`, `cli-executor`. Manifest declares the four canonical stage types it exercises.
- **Checkpoints** (`pipeline-checkpoint.ts`): resumable per-stage; optional `sessionId` enables save/resume.
- **Vote types** (`dev-pipeline.ts`): reuses `VoteResult` + `isApproved` / `getVoteFeedback` helpers so cascade semantics match the dev pipeline.

## Options

```typescript
interface ResearchPipelineOptions {
  sessionId?: string; // checkpoint persistence
  dryRun?: boolean; // stop after vote, skip scaffold
  maxVoteIterations?: number; // default 3
  maxParallelTracks?: number; // default 4
}
```

## Invocation

```typescript
import { runResearchPipeline } from 'nexus-agents/pipeline';

const result = await runResearchPipeline(prompt, stages, {
  maxVoteIterations: 3,
  maxParallelTracks: 4,
});
```

`stages` is injectable — tests use mocks; production wires the LLM-assisted executors from `research-agent-executor.ts`.

## Deliverable types

`executive_memo` · `security_report` · `mvp_scope` · `architecture_rec` · `risk_register`

## Tests

`research-pipeline.test.ts` covers: happy path, dry-run, conditional_go approval, iteration feedback, wave execution, empty decompose, plugin manifest validity.
