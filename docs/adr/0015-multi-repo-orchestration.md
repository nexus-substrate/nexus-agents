# ADR-0015: Multi-Repo Orchestration Design

## Status

Proposed

## Context

Complex DevSecOps workflows span multiple repositories. Infrastructure repos deploy before scanning repos target them. Artifacts (URLs, configs) flow between repos. Currently, cross-repo coordination is manual — the parent agent tracks state and passes context between independent orchestrations, losing artifact provenance and observability.

Issue [#1076](https://github.com/nexus-substrate/nexus-agents/issues/1076) tracks the need for first-class multi-repo support.

## Options Considered

### Option A: Additive Extension (Chosen)

Add optional `repoId`/`repos` fields to existing types (TaskContract, Artifact, EventFilter). All changes backwards-compatible. Single-repo workflows unchanged.

- Pros: No breaking changes. Incremental adoption. Existing tests unaffected. Clean migration path.
- Cons: Optional fields add complexity to type signatures. Cross-repo queries slightly less ergonomic than dedicated APIs.

### Option B: Separate Multi-Repo Layer

Build a `MultiRepoPipelineRunner` that wraps `PipelineRunner`, managing repo-scoped sub-pipelines with a coordinator.

- Pros: Clean separation of concerns. Single-repo code untouched.
- Cons: Duplicates execution logic. Two code paths to maintain. Artifact sharing between layers requires bridging. Violates DRY and anti-sprawl policy.

### Option C: Repo-as-Task Decomposition

Treat each repo's work as a sub-task of a parent orchestration. Use existing `parentId` hierarchy for repo scoping.

- Pros: No new types needed. Uses existing orchestration primitives.
- Cons: Conflates task hierarchy with repo topology. Artifacts can't reference their source repo. No explicit cross-repo dependency edges. Breaks down for tasks that span multiple repos simultaneously.

## Decision

**Option A: Additive Extension.** This aligns with the anti-sprawl policy (ONE canonical implementation path), YAGNI (minimal additions), and backwards compatibility requirements.

Key design choices:

1. **Optional `repos` in TaskContract constraints** — declares repo scope upfront
2. **Optional `repoId` on Artifact** — tracks provenance
3. **Optional `repoId` on EventFilter** — enables repo-scoped subscriptions
4. **RepoContext threading** — flows through graph node execution
5. **Batch repo_analyze** — pre-analyzes repos before pipeline execution

## Consequences

### Positive

- Zero breaking changes to existing APIs
- Single-repo workflows completely unaffected (no performance or complexity cost)
- Artifact provenance tracking across repos
- EventBus can route events per-repo for scoped observability
- Natural extension of existing graph workflows for cross-repo DAGs
- Security model follows least-privilege (per-repo tokens)

### Negative

- Optional fields on core types add conceptual surface area
- Cross-repo artifact resolution requires qualified IDs (`repoA:artifact-id`)
- Full implementation spans multiple modules (pipeline, graph, AOrchestra)

## Migration Steps

1. Phase 1 (Research): Architecture document + this ADR (complete)
2. Phase 2 (MVP): Add `RepoRef` to TaskContract, `repoId` to Artifact, batch `repo_analyze`
3. Phase 3 (Full): Graph workflow multi-repo DAGs, EventBus scoping, AOrchestra repo-aware planning

## References

- Issue: [#1076](https://github.com/nexus-substrate/nexus-agents/issues/1076)
- Architecture doc: [MULTI_REPO_ORCHESTRATION.md](../architecture/MULTI_REPO_ORCHESTRATION.md)
- Consensus vote: 6-0 approval (PM, Architect, AI/ML, Security, DevEx, Contrarian)
