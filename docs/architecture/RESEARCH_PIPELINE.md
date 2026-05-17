# Research-to-Project Pipeline

**Status:** Canonical
**Issue:** [#1822](https://github.com/nexus-substrate/nexus-agents/issues/1822) (supersedes closed [#1731](https://github.com/nexus-substrate/nexus-agents/pull/1731))
**Module:** `packages/nexus-agents/src/pipeline/research-pipeline.ts`
**Plugin id:** `nexus:research-pipeline` (registered via `core-plugins.ts`)

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
