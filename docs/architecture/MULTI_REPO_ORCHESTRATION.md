# Multi-Repo Orchestration Architecture

**Status:** Research (Phase 1)
**Issue:** [#1076](https://github.com/nexus-substrate/nexus-agents/issues/1076)
**ADR:** [0015](../adr/0015-multi-repo-orchestration.md)

## Problem

Complex DevSecOps workflows span multiple repositories with inter-repo dependencies. Example: infrastructure repo must deploy before a scanning pipeline repo can target it, and artifacts (URLs, configs) from one repo become inputs to tasks in another.

Currently, cross-repo coordination is manual — the parent agent tracks state across repos and passes context between independent orchestrations. This is fragile, loses artifact provenance, and provides no observability across the full workflow.

## Current Architecture Gaps

| Component     | Current Model                | Gap                                           |
| ------------- | ---------------------------- | --------------------------------------------- |
| TaskContract  | Single task, no repo scope   | Cannot express "run in repo X"                |
| ArtifactStore | Flat namespace (id-based)    | No repo partitioning or cross-repo references |
| EventBus      | Filter by taskId/executionId | No repo-scoped event routing                  |
| GraphBuilder  | DAG with node handlers       | No repo context threading                     |
| AOrchestra    | Single-task team planning    | No repo-aware expert selection                |
| repo_analyze  | Single repo at a time        | No batch analysis or registry                 |

## Proposed Design: Additive Multi-Repo Extension

All changes are additive and backwards-compatible. Single-repo workflows are unaffected.

### 1. TaskContract Extension

Add optional `repos` to task constraints:

```typescript
// In TaskConstraintsSummarySchema
repos?: readonly RepoRef[];

interface RepoRef {
  id: string;           // "owner/repo" format
  branch?: string;      // default: main
  role: 'primary' | 'dependency' | 'target';
}
```

Single-repo tasks omit `repos` — behavior unchanged. Multi-repo tasks declare all repos upfront.

### 2. RepoContext Threading

Introduce a `RepoContext` that flows through the execution pipeline:

```typescript
interface RepoContext {
  readonly repos: readonly RepoAnalysis[];
  readonly primaryRepo: string;
  readonly artifactNamespace: string; // scoping key for artifact store
}

interface RepoAnalysis {
  readonly id: string; // "owner/repo"
  readonly language: string;
  readonly framework?: string;
  readonly ciProvider?: string;
  readonly hasTests: boolean;
  readonly securityTooling: string[];
}
```

This is populated by batch `repo_analyze` calls before pipeline execution begins.

### 3. Artifact Store Partitioning

Add optional `repoId` to artifacts for cross-repo provenance:

```typescript
interface Artifact {
  // existing fields...
  repoId?: string; // which repo produced this artifact
}

interface ArtifactFilter {
  // existing fields...
  repoId?: string; // filter by source repo
}
```

Cross-repo artifact passing: Task in repo B can reference artifacts from repo A by specifying `inputArtifacts` with repo-qualified IDs (`repoA:artifact-id`).

### 4. EventBus Scoping

Add optional `repoId` to pipeline events for routing:

```typescript
interface BaseEvent {
  readonly timestamp: number;
  readonly repoId?: string; // optional repo scope
}

interface EventFilter {
  // existing fields...
  readonly repoId?: string;
}
```

Subscribers can filter events by repo or receive all events across repos.

### 5. Graph Workflow Extension

Add repo context to graph node execution:

```typescript
interface GraphNodeContext {
  repoId?: string;
  branch?: string;
  workingDir?: string;
}
```

Multi-repo workflows are graphs where nodes have different `repoId` values. Cross-repo edges express dependencies (repo A deploy must complete before repo B scan starts).

### 6. AOrchestra Enhancement

Repo-aware team composition:

```typescript
interface AgentPlanInput {
  // existing fields...
  repoContext?: RepoContext;
}
```

The planner can:

- Select `infrastructure_expert` if repos contain Terraform/BOSH manifests
- Select `security_expert` if cross-repo dependencies introduce trust boundaries
- Add `multi_repo_coordinator` role for orchestrating cross-repo execution

## Implementation Phases

### Phase 1: Research (this document) -- CURRENT

- [x] Document current gaps
- [x] Propose minimal extension design
- [x] ADR for chosen approach

### Phase 2: MVP

- Add `RepoRef` to TaskContract constraints
- Add `repoId` to Artifact metadata + filter
- Batch `repo_analyze` preprocessing
- Cross-repo artifact reference resolution

### Phase 3: Full

- Graph workflow support for multi-repo DAGs
- EventBus repo-scoped routing
- AOrchestra repo-aware team selection
- MCP tool for multi-repo orchestration

## Design Principles

1. **Additive only** — No breaking changes to existing APIs
2. **Optional repo scope** — All repo fields are optional; single-repo is the default
3. **Explicit over implicit** — Repos are declared upfront, not inferred
4. **Provenance tracking** — Every artifact knows which repo produced it
5. **Security by default** — Per-repo token scoping prevents accidental cross-repo access

## Security Considerations

- **Token scoping:** Each repo should have its own auth token; cross-repo access requires explicit configuration
- **Trust boundaries:** Artifacts crossing repo boundaries should be validated
- **Least privilege:** Graph nodes only receive tokens for their assigned repo
- **Audit trail:** All cross-repo artifact transfers logged to EventBus

## References

- Issue: [#1076](https://github.com/nexus-substrate/nexus-agents/issues/1076)
- ADR: [0015-multi-repo-orchestration](../adr/0015-multi-repo-orchestration.md)
- Related: `repo_analyze` MCP tool, `repo_security_plan` MCP tool
