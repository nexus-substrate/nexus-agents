# 02 — System Goals & Non-Goals

---

## Primary Persona

**Alex, a senior developer using Claude Code** who wants to leverage multiple AI models for tasks too complex or important for a single model: architecture decisions, security reviews, large refactors, multi-file implementations.

Alex does NOT want to:

- Configure agent swarms manually
- Understand internal routing algorithms
- Debug multi-agent coordination failures
- Wait for experimental research protocols to finish

Alex DOES want to:

- Describe what they need in natural language
- Get clarification questions when the request is ambiguous
- See a proposed plan before execution begins
- Watch progress and intervene if needed
- Get a validated result with provenance

## Goals

### G1: One Way to Do Each Thing

Every orchestration concern has exactly ONE implementation path. No parallel implementations. No "enhanced_v2" modules. The pipeline runner is the only execution primitive.

### G2: Deterministic Pipeline Execution

Given the same inputs and model responses, the system produces the same outputs. No hidden state, no race conditions in routing, no nondeterministic agent selection. Graph execution with compile-time validation guarantees structural correctness.

### G3: Structural Plugin Isolation

Experimental features are behind manifest-declared plugins. Plugins cannot import other plugins. They communicate via ArtifactStore and EventBus. Default state is OFF. This is not a runtime flag check — it's structural: unloaded plugins cannot be called.

### G4: Policy Gates With Teeth

Governance decisions are enforced, not observed. High-risk operations require approval. Trust tiers are enforced at stage boundaries. Bounded iteration prevents runaway loops.

### G5: Closed Feedback Loop

Task outcomes feed back into routing decisions within the same server session. The bandit algorithm learns from real execution results, not static quality scores alone.

### G6: Observable Execution

Every stage transition emits a typed event. Every artifact has provenance. A developer can reconstruct the full execution trace of any task.

### G7: Incremental Migration

Every V2 phase is additive. Existing MCP tools continue to work. No big-bang rewrite. Wrapping before replacing.

## Non-Goals

### NG1: ML/RL-Based Routing

V2 stays rule-based with bandit exploration. No neural routers, no learned embeddings, no training pipelines. If the bandit + outcome feedback isn't enough, that's V3.

### NG2: Merging Adapter Transports

API adapters (HTTP) and CLI adapters (subprocess) stay separate. Unifying them under one interface is desirable but not a V2 deliverable. The CompositeRouter continues to operate on CLI adapters only.

### NG3: Distributed Execution

No mesh mode, no multi-node coordination, no distributed state. Single-process server. If horizontal scaling is needed, that's V3.

### NG4: Custom Language or DSL

No YAML workflow DSL beyond what exists. No visual graph editor. Pipeline configuration uses TypeScript types and Zod schemas.

### NG5: Backward Compatibility for Internal APIs

Internal module interfaces (not MCP tools) may change. Export barrels may be restructured. Only MCP tool schemas and CLI command interfaces are stable.

### NG6: Production Deployment

V2 is developer-local tooling. No Kubernetes, no cloud deployment, no multi-tenant. `nexus-agents` runs as a local MCP server in the developer's terminal.
