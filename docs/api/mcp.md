---
title: 'API: mcp'
description: Generated API reference for mcp.
tier: 2
---

# mcp

## MCP

### registerCancelJobTool()

```ts
function registerCancelJobTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L127)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerConsensusVoteTool()

```ts
function registerConsensusVoteTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote.ts:930](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote.ts#L930)

Registers the consensus_vote tool with the MCP server.
Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).

#### Parameters

##### server

`McpServer`

##### deps

[`ConsensusVoteDeps`](#consensusvotedeps)

#### Returns

`void`

---

### registerCreateExpertTool()

```ts
function registerCreateExpertTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L297)

Registers the create_expert tool with the MCP server.

Uses createSecureHandler for standardized security middleware (Issue #531).
Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`CreateExpertDeps`](#createexpertdeps)

Tool dependencies

#### Returns

`void`

---

### registerDelegateToModelTool()

```ts
function registerDelegateToModelTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model.ts:289](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model.ts#L289)

Registers the delegate_to_model tool with the MCP server.

Uses createSecureHandler for standardized security middleware (Issue #531).
Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`DelegateDeps`](#delegatedeps)

Dependencies

#### Returns

`void`

---

### registerExecuteExpertTool()

```ts
function registerExecuteExpertTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:854](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L854)

Registers the execute_expert tool with the MCP server.

Uses MCP Tasks primitive (SEP-1686) via registerToolTask for async execution.
taskSupport: 'optional' preserves sync fallback for clients without task support.

Uses createSecureHandler for standardized security middleware (Issue #531).
Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`ExecuteExpertDeps`](#executeexpertdeps)

Tool dependencies

#### Returns

`void`

---

### registerExecuteSpecTool()

```ts
function registerExecuteSpecTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts#L171)

Registers the execute_spec tool with an MCP server.

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerExtractSymbolsTool()

```ts
function registerExtractSymbolsTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/extract-symbols-tool.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/extract-symbols-tool.ts#L137)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerGetJobResultTool()

```ts
function registerGetJobResultTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L84)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerImprovementReviewTool()

```ts
function registerImprovementReviewTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:870](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L870)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerIssueTriageTool()

```ts
function registerIssueTriageTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L162)

Registers the issue_triage tool with the MCP server.
Uses createSecureHandler for rate limiting and input sanitization.

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerListExpertsTool()

```ts
function registerListExpertsTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L181)

Registers the list_experts tool with the MCP server.

Uses createSecureHandler for standardized security middleware (Issue #531).
Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerListJobsTool()

```ts
function registerListJobsTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L110)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerListWorkflowsTool()

```ts
function registerListWorkflowsTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L163)

Registers the list_workflows tool with the MCP server.

Uses createSecureHandler for standardized security middleware (Issue #531).
Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`ListWorkflowsDeps`](#listworkflowsdeps)

Tool dependencies

#### Returns

`void`

---

### registerMemoryQueryTool()

```ts
function registerMemoryQueryTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L209)

Registers the memory_query tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerMemoryStatsTool()

```ts
function registerMemoryStatsTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:252](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L252)

Registers the memory_stats tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerMemoryWriteTool()

```ts
function registerMemoryWriteTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:282](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L282)

Registers the memory_write tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerOrchestrateTool()

```ts
function registerOrchestrateTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate.ts:1422](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate.ts#L1422)

Registers the orchestrate tool with the MCP server.
Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).

#### Parameters

##### server

`McpServer`

##### deps

[`OrchestrateDeps`](#orchestratedeps)

#### Returns

`void`

---

### registerPrReviewTool()

```ts
function registerPrReviewTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:428](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L428)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerQueryTraceTool()

```ts
function registerQueryTraceTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/query-trace-tool.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/query-trace-tool.ts#L223)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerRegistryImportTool()

```ts
function registerRegistryImportTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/registry-import-tool.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/registry-import-tool.ts#L63)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerRepoAnalyzeTool()

```ts
function registerRepoAnalyzeTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-tool.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-tool.ts#L60)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerRepoSecurityPlanTool()

```ts
function registerRepoSecurityPlanTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-tool.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-tool.ts#L59)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerResearchAddSourceTool()

```ts
function registerResearchAddSourceTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:292](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L292)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerResearchAddTool()

```ts
function registerResearchAddTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L205)

Registers the research_add tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerResearchAnalyzeTool()

```ts
function registerResearchAnalyzeTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:420](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L420)

Registers the research_analyze tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerResearchCatalogReviewTool()

```ts
function registerResearchCatalogReviewTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-catalog-review.ts:269](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-catalog-review.ts#L269)

Registers the research_catalog_review tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerResearchDiscoverTool()

```ts
function registerResearchDiscoverTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:617](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L617)

Registers the research_discover tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerResearchQueryTool()

```ts
function registerResearchQueryTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:226](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L226)

Registers the research_query tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerResearchSynthesizeTool()

```ts
function registerResearchSynthesizeTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-synthesize.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-synthesize.ts#L97)

Registers the research_synthesize tool with the MCP server.

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

Tool dependencies

#### Returns

`void`

---

### registerRunGraphWorkflowTool()

```ts
function registerRunGraphWorkflowTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L309)

Registers the run_graph_workflow tool with an MCP server.

#### Parameters

##### server

`McpServer`

##### deps

[`RunGraphWorkflowDeps`](#rungraphworkflowdeps)

#### Returns

`void`

---

### registerRunWorkflowTool()

```ts
function registerRunWorkflowTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow.ts:417](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow.ts#L417)

Register the run_workflow tool with an MCP server.

Uses createSecureHandler for standardized security middleware (Issue #531).
Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).

#### Parameters

##### server

`McpServer`

MCP server instance

##### deps

[`RunWorkflowDeps`](#runworkflowdeps)

Tool dependencies

#### Returns

`void`

---

### registerSearchCodebaseTool()

```ts
function registerSearchCodebaseTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/search-codebase-tool.ts:239](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/search-codebase-tool.ts#L239)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

---

### registerWeatherReportTool()

```ts
function registerWeatherReportTool(server, deps): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/weather-report-tool.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/weather-report-tool.ts#L97)

#### Parameters

##### server

`McpServer`

##### deps

[`BaseMcpToolDeps`](#basemcptooldeps)

#### Returns

`void`

## Other

### McpRateLimiter

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L66)

Token bucket rate limiter implementation.

The token bucket algorithm allows for bursting up to the capacity,
while maintaining a steady-state rate equal to the refill rate.

#### Example

```typescript
const limiter = new RateLimiter({
  capacity: 100,
  refillRate: 10,
  refillIntervalMs: 1000,
});

if (limiter.tryAcquire()) {
  // Proceed with operation
} else {
  // Rate limited, reject or queue
}
```

#### Constructors

##### Constructor

```ts
new McpRateLimiter(config): McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L75)

###### Parameters

###### config

[`McpRateLimiterConfig`](#mcpratelimiterconfig)

###### Returns

[`McpRateLimiter`](#mcpratelimiter)

#### Methods

##### getState()

```ts
getState(): RateLimiterState;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L144)

Gets the current state of the rate limiter.

###### Returns

[`RateLimiterState`](#ratelimiterstate)

The current rate limiter state

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L161)

Resets the rate limiter to full capacity.
Useful for testing or after configuration changes.

###### Returns

`void`

##### tryAcquire()

```ts
tryAcquire(count?): boolean;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L120)

Attempts to acquire a token.

###### Parameters

###### count?

`number` = `1`

Number of tokens to acquire (default: 1)

###### Returns

`boolean`

True if tokens were acquired, false if rate limited

---

### OrchestrationError

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L201)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Extends

- [`AgentError`](core.md#agenterror)

#### Constructors

##### Constructor

```ts
new OrchestrationError(message, options?): OrchestrationError;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L202)

###### Parameters

###### message

`string`

###### options?

###### cause?

`Error`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`OrchestrationError`](#orchestrationerror)

###### Overrides

[`AgentError`](core.md#agenterror).[`constructor`](core.md#constructor)

#### Properties

##### cause

```ts
readonly cause: Error | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L94)

###### Inherited from

[`AgentError`](core.md#agenterror).[`cause`](core.md#cause)

##### code

```ts
readonly code: ErrorCode;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L92)

###### Inherited from

[`AgentError`](core.md#agenterror).[`code`](core.md#code)

##### context

```ts
readonly context: Record<string, unknown> | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L93)

###### Inherited from

[`AgentError`](core.md#agenterror).[`context`](core.md#context)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

[`AgentError`](core.md#agenterror).[`message`](core.md#message)

##### name

```ts
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

[`AgentError`](core.md#agenterror).[`name`](core.md#name)

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`AgentError`](core.md#agenterror).[`stack`](core.md#stack)

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:67

The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

###### Inherited from

[`AgentError`](core.md#agenterror).[`stackTraceLimit`](core.md#stacktracelimit)

#### Methods

##### toJSON()

```ts
toJSON(): SerializedError;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L110)

Serializes the error to a JSON-safe object.

###### Returns

[`SerializedError`](core.md#serializederror)

###### Inherited from

[`AgentError`](core.md#agenterror).[`toJSON`](core.md#tojson)

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`AgentError`](core.md#agenterror).[`captureStackTrace`](core.md#capturestacktrace)

##### prepareStackTrace()

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:55

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

[`AgentError`](core.md#agenterror).[`prepareStackTrace`](core.md#preparestacktrace)

---

### OrchestrationUnavailableError

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L209)

Error when orchestration is unavailable (no model adapter). Issue #554.

#### Extends

- [`AgentError`](core.md#agenterror)

#### Constructors

##### Constructor

```ts
new OrchestrationUnavailableError(message, options?): OrchestrationUnavailableError;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:210](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L210)

###### Parameters

###### message

`string`

###### options?

###### cause?

`Error`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`OrchestrationUnavailableError`](#orchestrationunavailableerror)

###### Overrides

[`AgentError`](core.md#agenterror).[`constructor`](core.md#constructor)

#### Properties

##### cause

```ts
readonly cause: Error | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L94)

###### Inherited from

[`AgentError`](core.md#agenterror).[`cause`](core.md#cause)

##### code

```ts
readonly code: ErrorCode;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L92)

###### Inherited from

[`AgentError`](core.md#agenterror).[`code`](core.md#code)

##### context

```ts
readonly context: Record<string, unknown> | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L93)

###### Inherited from

[`AgentError`](core.md#agenterror).[`context`](core.md#context)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

[`AgentError`](core.md#agenterror).[`message`](core.md#message)

##### name

```ts
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

[`AgentError`](core.md#agenterror).[`name`](core.md#name)

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`AgentError`](core.md#agenterror).[`stack`](core.md#stack)

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:67

The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

###### Inherited from

[`AgentError`](core.md#agenterror).[`stackTraceLimit`](core.md#stacktracelimit)

#### Methods

##### toJSON()

```ts
toJSON(): SerializedError;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L110)

Serializes the error to a JSON-safe object.

###### Returns

[`SerializedError`](core.md#serializederror)

###### Inherited from

[`AgentError`](core.md#agenterror).[`toJSON`](core.md#tojson)

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`AgentError`](core.md#agenterror).[`captureStackTrace`](core.md#capturestacktrace)

##### prepareStackTrace()

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:55

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

[`AgentError`](core.md#agenterror).[`prepareStackTrace`](core.md#preparestacktrace)

---

### PolicyError

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L104)

Policy error for authorization failures.

#### Extends

- [`SecurityError`](core.md#securityerror)

#### Constructors

##### Constructor

```ts
new PolicyError(message, decision): PolicyError;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L107)

###### Parameters

###### message

`string`

###### decision

[`FirewallPolicyDecision`](#firewallpolicydecision)

###### Returns

[`PolicyError`](#policyerror)

###### Overrides

[`SecurityError`](core.md#securityerror).[`constructor`](core.md#constructor-6)

#### Properties

##### cause

```ts
readonly cause: Error | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L94)

###### Inherited from

[`SecurityError`](core.md#securityerror).[`cause`](core.md#cause-6)

##### code

```ts
readonly code: ErrorCode;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L92)

###### Inherited from

[`SecurityError`](core.md#securityerror).[`code`](core.md#code-5)

##### context

```ts
readonly context: Record<string, unknown> | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L93)

###### Inherited from

[`SecurityError`](core.md#securityerror).[`context`](core.md#context-5)

##### decision

```ts
readonly decision: FirewallPolicyDecision;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L105)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

[`SecurityError`](core.md#securityerror).[`message`](core.md#message-6)

##### name

```ts
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

[`SecurityError`](core.md#securityerror).[`name`](core.md#name-6)

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SecurityError`](core.md#securityerror).[`stack`](core.md#stack-6)

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:67

The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

###### Inherited from

[`SecurityError`](core.md#securityerror).[`stackTraceLimit`](core.md#stacktracelimit-6)

#### Methods

##### toJSON()

```ts
toJSON(): SerializedError;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L110)

Serializes the error to a JSON-safe object.

###### Returns

[`SerializedError`](core.md#serializederror)

###### Inherited from

[`SecurityError`](core.md#securityerror).[`toJSON`](core.md#tojson-5)

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`SecurityError`](core.md#securityerror).[`captureStackTrace`](core.md#capturestacktrace-6)

##### prepareStackTrace()

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:55

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

[`SecurityError`](core.md#securityerror).[`prepareStackTrace`](core.md#preparestacktrace-6)

---

### PolicyFirewall

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L59)

Policy firewall that evaluates rules to authorize or deny operations.

Rules are evaluated in order. The first rule that denies the operation
stops evaluation and returns the denial. If all rules pass, the operation
is allowed.

#### Example

```typescript
const firewall = new PolicyFirewall({ mode: 'enforce' });

// Add rules
firewall.addRule(denyMutationsWithoutModeRule);
firewall.addRule(safePathsRule);

// Evaluate
const decision = firewall.evaluate({
  toolName: 'write_file',
  args: { path: '/etc/passwd' },
  mode: 'read-only',
});

if (!decision.allowed) {
  console.error(`Denied: ${decision.reason}`);
}
```

#### Implements

- [`IPolicyFirewall`](#ipolicyfirewall)

#### Constructors

##### Constructor

```ts
new PolicyFirewall(config?): PolicyFirewall;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L64)

###### Parameters

###### config?

[`PolicyFirewallConfig`](#policyfirewallconfig)

###### Returns

[`PolicyFirewall`](#policyfirewall)

#### Methods

##### addRule()

```ts
addRule(rule): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L161)

Adds a policy rule to the firewall.

###### Parameters

###### rule

[`FirewallPolicyRule`](#firewallpolicyrule)

The rule to add

###### Returns

`void`

###### Implementation of

[`IPolicyFirewall`](#ipolicyfirewall).[`addRule`](#addrule-1)

##### evaluate()

```ts
evaluate(ctx): FirewallPolicyDecision;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L90)

Evaluates all policy rules against the given context.

Rules are evaluated in order. The first rule that denies stops
evaluation and returns the denial decision.

###### Parameters

###### ctx

[`FirewallPolicyContext`](#firewallpolicycontext)

The policy context to evaluate

###### Returns

[`FirewallPolicyDecision`](#firewallpolicydecision)

The policy decision

###### Implementation of

[`IPolicyFirewall`](#ipolicyfirewall).[`evaluate`](#evaluate-1)

##### getMode()

```ts
getMode(): PolicyMode;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L214)

Gets the current policy enforcement mode.

###### Returns

[`PolicyMode`](#policymode)

The current mode

###### Implementation of

[`IPolicyFirewall`](#ipolicyfirewall).[`getMode`](#getmode-1)

##### getRules()

```ts
getRules(): readonly FirewallPolicyRule[];
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L194)

Gets all registered policy rules.

###### Returns

readonly [`FirewallPolicyRule`](#firewallpolicyrule)[]

A readonly array of policy rules

###### Implementation of

[`IPolicyFirewall`](#ipolicyfirewall).[`getRules`](#getrules-1)

##### removeRule()

```ts
removeRule(name): boolean;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L179)

Removes a policy rule by name.

###### Parameters

###### name

`string`

The name of the rule to remove

###### Returns

`boolean`

True if the rule was found and removed

###### Implementation of

[`IPolicyFirewall`](#ipolicyfirewall).[`removeRule`](#removerule-1)

##### setMode()

```ts
setMode(mode): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L203)

Sets the policy enforcement mode.

###### Parameters

###### mode

[`PolicyMode`](#policymode)

The new enforcement mode

###### Returns

`void`

###### Implementation of

[`IPolicyFirewall`](#ipolicyfirewall).[`setMode`](#setmode-1)

---

### AgentVoteSummary

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L229)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:232](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L232)

##### decision

```ts
decision: 'approve' | 'reject' | 'abstain';
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L231)

##### error

```ts
error: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:236](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L236)

True when this vote was generated from an error (Issue #815).

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:238](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L238)

Model used for this agent's vote (Issue #817).

##### reasoning

```ts
reasoning: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:233](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L233)

##### rejectionCategories?

```ts
optional rejectionCategories?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L240)

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

##### role

```ts
role: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L230)

##### simulated

```ts
simulated: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:234](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L234)

---

### BaseMcpToolDeps

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L31)

Common dependency interface shared by all MCP tool handlers.

Tool-specific deps interfaces should extend this base.
(Source: Issue #1439 — DRY extraction of 25 duplicated Deps interfaces)

#### Extended by

- [`CreateExpertDeps`](#createexpertdeps)
- [`ExecuteExpertDeps`](#executeexpertdeps)
- [`ConsensusVoteDeps`](#consensusvotedeps)
- [`RunWorkflowDeps`](#runworkflowdeps)
- [`OrchestrateDeps`](#orchestratedeps)
- [`DelegateDeps`](#delegatedeps)
- [`ListWorkflowsDeps`](#listworkflowsdeps)
- [`RunGraphWorkflowDeps`](#rungraphworkflowdeps)

#### Properties

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

---

### CancelJobResponse

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L61)

Outcome envelope. `status` discriminates the four cases.

#### Properties

##### jobId

```ts
readonly jobId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L62)

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L68)

Human-readable explanation matching the outcome.

##### outcome

```ts
readonly outcome: "cancelled" | "already_complete" | "already_cancelled" | "unknown_job";
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L64)

Outcome category — see module docstring.

##### status?

```ts
readonly optional status?: "failed" | "cancelled" | "pending" | "complete";
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L66)

The terminal status now on disk (after this call). Absent for `unknown_job`.

---

### CapabilityProfile

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L31)

Model capability profile for routing decisions.

#### Properties

##### codeGeneration

```ts
readonly codeGeneration: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L37)

Code generation quality (0-10)

##### contextWindow

```ts
readonly contextWindow: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L35)

Maximum context window in tokens

##### cost

```ts
readonly cost: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L41)

Cost efficiency (0-10, higher = cheaper)

##### reasoning

```ts
readonly reasoning: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L33)

Complex reasoning ability (0-10)

##### speed

```ts
readonly speed: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L39)

Response latency score (0-10, higher = faster)

---

### ConflictWarning

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L53)

A conflict or redundancy warning.

#### Properties

##### recommendation

```ts
readonly recommendation: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L56)

##### scanners

```ts
readonly scanners: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L54)

##### type

```ts
readonly type: "superseded" | "redundant";
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L55)

---

### ConsensusVoteDeps

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote.ts#L130)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### notifier?

```ts
optional notifier?: IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote.ts#L132)

MCP notifier for client-visible logging (Issue #974)

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

---

### ConsensusVoteResponse

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L257)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### approvalPercentage

```ts
approvalPercentage: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L262)

##### costSummary?

```ts
optional costSummary?: DecisionCostSummary;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:287](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L287)

Per-decision cost rollup (#3855): per-voter / per-model token + USD totals
for this governed decision. Rides the existing response — no new MCP tool.
Totals are a floor when `costSummary.unmeasuredVoters > 0` (voters whose
adapter reported no usage are counted as unmeasured, not a measured $0).

##### decision

```ts
decision: VoteDecisionStatus;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:261](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L261)

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:265](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L265)

##### higherOrderMetadata?

```ts
optional higherOrderMetadata?: HigherOrderMetadata;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L267)

##### panelWarning?

```ts
optional panelWarning?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:280](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L280)

Set when the panel was DEGRADED (#3587): some voters errored, so the
decision rests on fewer than the requested number of voters. Surfaces a
silently-shrunk panel so the result isn't read as a full-strength consensus.
Absent when every requested voter returned a real vote.

##### policyReason?

```ts
optional policyReason?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:273](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L273)

Set when an error policy short-circuited the vote (#2630/#3124). Explains a
`rejected` decision that may coexist with a high `approvalPercentage` — e.g.
`fail_closed: 1 voter(s) errored`. Absent on normally-tallied votes.

##### proposal

```ts
proposal: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:258](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L258)

##### simulateVotes

```ts
simulateVotes: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L266)

##### strategy

```ts
strategy: VotingStrategy;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:260](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L260)

##### threshold?

```ts
optional threshold?: "supermajority" | "unanimous" | "majority";
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:259](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L259)

##### voteCounts

```ts
voteCounts: {
  abstain: number;
  approve: number;
  error: number;
  reject: number;
}
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:263](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L263)

###### abstain

```ts
abstain: number;
```

###### approve

```ts
approve: number;
```

###### error

```ts
error: number;
```

###### reject

```ts
reject: number;
```

##### votes

```ts
votes: AgentVoteSummary[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L264)

---

### CoverageAnalysis

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L60)

Coverage analysis by category.

#### Properties

##### category

```ts
readonly category: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L61)

##### covered

```ts
readonly covered: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L62)

##### scanners

```ts
readonly scanners: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L63)

---

### CreateExpertDeps

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L84)

Dependencies for create_expert tool.

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### cliCache?

```ts
optional cliCache?: ICliDetectionCache;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L90)

Optional CLI detection cache for checking available CLIs (Issue #747)

##### expertFactory

```ts
expertFactory: McpExpertFactory;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L86)

Expert factory for creating experts

##### expertRegistry

```ts
expertRegistry: Map<string, Expert>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L88)

Registry to track created experts

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### modelAdapter?

```ts
optional modelAdapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L92)

Model adapter for expert execution (Issue #808)

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

---

### CreateExpertResponse

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L98)

Response from create_expert tool.

#### Properties

##### capabilities

```ts
capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L104)

List of capabilities

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L100)

Unique expert ID

##### role

```ts
role: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L102)

Expert role

##### status

```ts
status: 'ready';
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L106)

Expert status

---

### DelegateDeps

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L123)

Dependencies for the delegate_to_model tool.

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### feedbackIntegration?

```ts
optional feedbackIntegration?: IFeedbackIntegration;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L127)

Optional FeedbackIntegration for closed-loop learning (Issue #167)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### notifier?

```ts
optional notifier?: IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L129)

MCP notifier for client-visible logging (Issue #974)

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### router?

```ts
optional router?: ICompositeRouter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L125)

Optional CompositeRouter for intelligent routing (Issue #169)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

---

### DryRunResult

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L110)

Dry run validation result.

#### Properties

##### inputsMissing

```ts
inputsMissing: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L116)

##### inputsProvided

```ts
inputsProvided: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L114)

##### inputsRequired

```ts
inputsRequired: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L115)

##### stepCount

```ts
stepCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L113)

##### valid

```ts
valid: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L111)

##### validationErrors

```ts
validationErrors: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L117)

##### workflowName

```ts
workflowName: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L112)

---

### EventBusBridgeResult

Defined in: [packages/nexus-agents/src/mcp/eventbus-bridge.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/eventbus-bridge.ts#L65)

Result of bridge initialization.

#### Properties

##### cleanup

```ts
readonly cleanup: () => void;
```

Defined in: [packages/nexus-agents/src/mcp/eventbus-bridge.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/eventbus-bridge.ts#L71)

Cleanup function to call on shutdown

###### Returns

`void`

##### initialized

```ts
readonly initialized: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/eventbus-bridge.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/eventbus-bridge.ts#L67)

Whether the bridge was initialized

##### subscriptionCount

```ts
readonly subscriptionCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/eventbus-bridge.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/eventbus-bridge.ts#L69)

Number of active subscriptions

---

### ExecuteExpertDeps

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L118)

Dependencies for execute_expert tool.

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### cliCache?

```ts
optional cliCache?: ICliDetectionCache;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L122)

Optional CLI detection cache for checking available CLIs (Issue #747)

##### expertRegistry

```ts
expertRegistry: Map<string, Expert>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L120)

Registry of created experts (shared with create_expert)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### notifier?

```ts
optional notifier?: IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L124)

MCP notifier for client-visible logging (Issue #974)

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

---

### ExecuteExpertResponse

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L130)

Response from execute_expert tool.

#### Properties

##### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L152)

The expert's self-reported confidence in `[0, 1]` (#3766). Present only when
the expert emitted an ExpertOutput-shaped analysis carrying a numeric
confidence; absent for plain-string outputs. Consumers can route/weight on it.

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L138)

Execution duration in milliseconds

##### error?

```ts
optional error?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L144)

Error message if status is 'error'

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L132)

Expert ID that executed the task

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L146)

Model used for execution (Issue #817)

##### output

```ts
output: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L136)

Task execution output

##### role

```ts
role: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L134)

Expert role

##### status

```ts
status: 'error' | 'success';
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L142)

Status of execution

##### tokensUsed

```ts
tokensUsed: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L140)

Token usage from the model

---

### ExpertInfo

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L51)

Expert information returned by list_experts tool.

#### Properties

##### capabilities

```ts
capabilities: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L59)

List of capabilities

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L57)

Expert description

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L55)

Human-readable name

##### role

```ts
role: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L53)

Role identifier for create_expert

---

### FirewallArtifact

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L21)

Artifact type for policy context.
Artifacts are resources that can be referenced in policy decisions.

#### Type Parameters

##### T

`T` = `unknown`

#### Properties

##### createdAt

```ts
readonly createdAt: Date;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L25)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L22)

##### type

```ts
readonly type: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L23)

##### value

```ts
readonly value: T;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L24)

---

### FirewallPolicyContext

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L55)

Context provided to policy rules for evaluation.

#### Properties

##### allowedPaths?

```ts
readonly optional allowedPaths?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L61)

##### args

```ts
readonly args: unknown;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L57)

##### artifacts?

```ts
readonly optional artifacts?: Map<string, FirewallArtifact<unknown>>;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L59)

##### mode

```ts
readonly mode: ExecutionMode;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L58)

##### toolName

```ts
readonly toolName: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L56)

##### workflowId?

```ts
readonly optional workflowId?: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L60)

---

### FirewallPolicyDecision

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L45)

Result of a policy evaluation.

#### Properties

##### allowed

```ts
readonly allowed: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L46)

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L47)

##### requiredArtifact?

```ts
readonly optional requiredArtifact?: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L48)

##### ruleName?

```ts
readonly optional ruleName?: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L49)

---

### FirewallPolicyRule

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L67)

A single policy rule that can approve or deny operations.

#### Properties

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L69)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L68)

#### Methods

##### check()

```ts
check(ctx): FirewallPolicyDecision;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L70)

###### Parameters

###### ctx

[`FirewallPolicyContext`](#firewallpolicycontext)

###### Returns

[`FirewallPolicyDecision`](#firewallpolicydecision)

---

### GetJobResultResponse

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L43)

Response envelope. `found: false` means the jobId is unknown (or the
sidecar file is unreadable / future-schema). `found: true` carries
the full record — caller branches on `record.status`.

#### Properties

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L47)

##### found

```ts
readonly found: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L45)

##### jobId

```ts
readonly jobId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L44)

##### record?

```ts
readonly optional record?: {
  completedAt?: string;
  createdAt: string;
  error?: string;
  jobId: string;
  result?: unknown;
  status: "failed" | "cancelled" | "pending" | "complete";
  toolName: string;
  v: 1;
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L46)

###### completedAt?

```ts
optional completedAt?: string;
```

Set when the job leaves `pending` — either via `complete` or `failed` or `cancelled`.

###### createdAt

```ts
createdAt: string;
```

###### error?

```ts
optional error?: string;
```

Failure message when `status === 'failed'`. Cannot be paired with
`result` — the discriminator is `status`.

###### jobId

```ts
jobId: string;
```

###### result?

```ts
optional result?: unknown;
```

Structured payload the synchronous mode would have returned. Present
only when `status === 'complete'`. Shape is tool-specific — readers
cast to the tool's known output type after status check.

###### status

```ts
status: "failed" | "cancelled" | "pending" | "complete" = JobStatusSchema;
```

###### toolName

```ts
toolName: string;
```

Tool that was invoked (e.g. `orchestrate`).

###### v

```ts
v: 1;
```

Format version. Currently `1` — bump if the shape changes.

---

### GraphWorkflowInfo

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L40)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L42)

##### hasConditionalEdges

```ts
readonly hasConditionalEdges: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L45)

##### inputFields

```ts
readonly inputFields: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L43)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L41)

##### nodeCount

```ts
readonly nodeCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L44)

---

### IMcpNotifier

Defined in: [packages/nexus-agents/src/mcp/mcp-notifier.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/mcp-notifier.ts#L30)

MCP notifier for sending structured log events to clients.

#### Methods

##### debug()

```ts
debug(logger, data): void;
```

Defined in: [packages/nexus-agents/src/mcp/mcp-notifier.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/mcp-notifier.ts#L34)

Send debug-level notification (detailed execution steps)

###### Parameters

###### logger

`string`

###### data

`Record`\<`string`, `unknown`\>

###### Returns

`void`

##### info()

```ts
info(logger, data): void;
```

Defined in: [packages/nexus-agents/src/mcp/mcp-notifier.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/mcp-notifier.ts#L32)

Send info-level notification (key orchestration events)

###### Parameters

###### logger

`string`

###### data

`Record`\<`string`, `unknown`\>

###### Returns

`void`

##### warn()

```ts
warn(logger, data): void;
```

Defined in: [packages/nexus-agents/src/mcp/mcp-notifier.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/mcp-notifier.ts#L36)

Send warning-level notification

###### Parameters

###### logger

`string`

###### data

`Record`\<`string`, `unknown`\>

###### Returns

`void`

---

### ImprovementReviewResponse

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L129)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### issuesFiled

```ts
readonly issuesFiled: readonly {
  issueUrl: string;
  signalKey: string;
}[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L139)

##### issuesSkipped

```ts
readonly issuesSkipped: readonly {
  reason: string;
  signalKey: string;
}[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L140)

##### remediationTasks

```ts
readonly remediationTasks: readonly PipelineTask[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L138)

Remediation tasks derived from [signals](#signals) (#3540 capability-loop
increment 1) — SUGGEST-ONLY: structured tasks for a reviewer to consider
routing through the dev-pipeline. Nothing here is executed or auto-invoked.

##### signals

```ts
readonly signals: readonly ImprovementSignal[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L132)

##### totalOutcomes

```ts
readonly totalOutcomes: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L131)

##### window

```ts
readonly window: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L130)

---

### IPolicyFirewall

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L76)

Interface for the policy firewall.

#### Methods

##### addRule()

```ts
addRule(rule): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L78)

###### Parameters

###### rule

[`FirewallPolicyRule`](#firewallpolicyrule)

###### Returns

`void`

##### evaluate()

```ts
evaluate(ctx): FirewallPolicyDecision;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L77)

###### Parameters

###### ctx

[`FirewallPolicyContext`](#firewallpolicycontext)

###### Returns

[`FirewallPolicyDecision`](#firewallpolicydecision)

##### getMode()

```ts
getMode(): PolicyMode;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L82)

###### Returns

[`PolicyMode`](#policymode)

##### getRules()

```ts
getRules(): readonly FirewallPolicyRule[];
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L80)

###### Returns

readonly [`FirewallPolicyRule`](#firewallpolicyrule)[]

##### removeRule()

```ts
removeRule(name): boolean;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L79)

###### Parameters

###### name

`string`

###### Returns

`boolean`

##### setMode()

```ts
setMode(mode): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L81)

###### Parameters

###### mode

[`PolicyMode`](#policymode)

###### Returns

`void`

---

### IssueTriageResponse

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L58)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### category

```ts
readonly category: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L61)

##### categoryConfidence

```ts
readonly categoryConfidence: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L62)

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L76)

##### issueNumber

```ts
readonly issueNumber: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L59)

##### proposedActions

```ts
readonly proposedActions: readonly {
  corroborated: boolean;
  description: string;
  policyApproved: boolean;
  type: string;
}[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L70)

##### repository

```ts
readonly repository: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L60)

##### trustAssessment

```ts
readonly trustAssessment: {
  isSuspicious: boolean;
  reputationScore?: number;
  suspiciousSignals: readonly string[];
  trustTier: string;
  userRole: string;
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L63)

###### isSuspicious

```ts
readonly isSuspicious: boolean;
```

###### reputationScore?

```ts
readonly optional reputationScore?: number;
```

###### suspiciousSignals

```ts
readonly suspiciousSignals: readonly string[];
```

###### trustTier

```ts
readonly trustTier: string;
```

###### userRole

```ts
readonly userRole: string;
```

---

### LanguageMatrixEntry

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L36)

Language matrix: category → scanner names.

#### Properties

##### container?

```ts
readonly optional container?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L40)

##### dast?

```ts
readonly optional dast?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L42)

##### iac?

```ts
readonly optional iac?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L41)

##### sast?

```ts
readonly optional sast?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L37)

##### sca?

```ts
readonly optional sca?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L38)

##### secrets?

```ts
readonly optional secrets?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L39)

---

### ListExpertsResponse

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L65)

Response from list_experts tool.

#### Properties

##### count

```ts
count: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L69)

Total count

##### experts

```ts
experts: ExpertInfo[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L67)

List of available experts

---

### ListJobsResponse

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L70)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### count

```ts
readonly count: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L71)

##### jobs

```ts
readonly jobs: readonly JobSummary[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L73)

##### truncated

```ts
readonly truncated: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L72)

---

### ListWorkflowsDeps

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L48)

Dependencies for list_workflows tool.

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

##### workflowEngine

```ts
workflowEngine: IWorkflowEngine;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L50)

Workflow engine for listing templates

---

### ListWorkflowsResponse

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L70)

Response from list_workflows tool.

#### Properties

##### categories?

```ts
optional categories?: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L76)

Categories found (for filtering hints)

##### count

```ts
count: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L74)

Total count

##### workflows

```ts
workflows: WorkflowInfo[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L72)

List of available workflows

---

### McpExpertFactory

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L74)

Expert factory interface for dependency injection.

#### Methods

##### createBuiltIn()

```ts
createBuiltIn(type, options?):
  | {
  ok: true;
  value: Expert;
}
  | {
  error: Error;
  ok: false;
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L75)

###### Parameters

###### type

[`BuiltInExpertType`](agents.md#builtinexperttype)

###### options?

###### modelOverrides?

\{
`modelId?`: `string`;
\}

###### modelOverrides.modelId?

`string`

###### Returns

\| \{
`ok`: `true`;
`value`: [`Expert`](agents.md#expert);
\}
\| \{
`error`: `Error`;
`ok`: `false`;
\}

---

### McpLogContext

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L13)

MCP-specific log context fields.

#### Extends

- [`LogContext`](core.md#logcontext)

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

##### durationMs?

```ts
optional durationMs?: number;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L19)

Duration of the operation in milliseconds

##### errorCode?

```ts
optional errorCode?: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L23)

Error code if operation failed

##### requestId?

```ts
optional requestId?: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L17)

Request ID for tracing

##### success?

```ts
optional success?: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L21)

Whether the operation succeeded

##### tool?

```ts
optional tool?: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L15)

The tool being executed

---

### McpRateLimiterConfig

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L15)

Configuration for the token bucket rate limiter.

#### Properties

##### capacity

```ts
readonly capacity: number;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L17)

Maximum number of tokens in the bucket

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L23)

Optional logger instance

##### name?

```ts
readonly optional name?: string;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L25)

Optional identifier for logging

##### refillIntervalMs?

```ts
readonly optional refillIntervalMs?: number;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L21)

Interval in milliseconds between token refills (default: 1000ms)

##### refillRate

```ts
readonly refillRate: number;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L19)

Number of tokens added per interval

---

### MemoryQueryResponse

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L73)

Response from memory_query tool.

#### Properties

##### count

```ts
count: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L81)

Total results returned

##### expandedQuery?

```ts
optional expandedQuery?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L77)

LLM-expanded query when reflective memory rewrites it (Issue #1397 Gap 1).

##### query

```ts
query: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L75)

Query that was executed

##### results

```ts
results: readonly UnifiedMemoryResult[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L79)

Results from memory search

##### source

```ts
source: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L83)

Source filter applied

---

### MemoryStatsResponse

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L101)

Response from memory_stats tool.

#### Properties

##### backends

```ts
backends: BackendStatus;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L103)

Backend availability status

##### belief

```ts
belief: BeliefStats;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L107)

Belief memory stats

##### collectedAt

```ts
collectedAt: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L120)

Timestamp of stats collection

##### decay

```ts
decay: Record<string, unknown> | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L113)

Decay stats (if available and requested)

##### mobimem

```ts
mobimem: Record<string, unknown> | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L111)

MobiMem stats (if available)

##### registry

```ts
registry: readonly RegistryDomainStats[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L118)

Per-domain stats from the unified MemoryRegistry (Phase 5 of #2766).
One entry per attached backend; empty when no backend has registered.

##### session

```ts
session: SessionStats;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L105)

Session memory stats

##### typed

```ts
typed: Record<string, unknown> | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L109)

Typed memory stats (if available)

---

### MemoryWriteResponse

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L69)

Response from memory_write tool.

#### Properties

##### backend

```ts
backend: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L73)

Target backend

##### deduplicated?

```ts
optional deduplicated?: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L77)

Whether write was skipped due to identical content already existing (#1455)

##### error?

```ts
optional error?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L79)

Error message if write failed

##### key

```ts
key: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L75)

Key/subject written

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L71)

Whether the write succeeded

---

### OrchestrateDeps

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L170)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### modelAdapter?

```ts
optional modelAdapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L174)

Model adapter for fallback orchestration path (Issue #827)

##### notifier?

```ts
optional notifier?: IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L176)

MCP notifier for client-visible logging (Issue #974)

##### orchestrator?

```ts
optional orchestrator?: IOrchestrator;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L172)

Pre-configured orchestrator instance (unified interface).

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

---

### PolicyFirewallConfig

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L88)

Configuration for the policy firewall.

#### Properties

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L92)

Logger instance

##### mode?

```ts
readonly optional mode?: PolicyMode;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L90)

Enforcement mode (default: 'enforce')

##### rules?

```ts
readonly optional rules?: readonly FirewallPolicyRule[];
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L94)

Initial rules to register

---

### PromptDefinition

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L27)

Declarative definition of an MCP prompt template.

- `argsSchema`: Zod shape passed to `server.registerPrompt`
- `buildMessages`: produces the message array from validated args

#### Properties

##### argsSchema

```ts
readonly argsSchema: Record<string, z.ZodType>;
```

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L30)

##### buildMessages

```ts
readonly buildMessages: (args) => readonly PromptMessage[];
```

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L31)

###### Parameters

###### args

`Record`\<`string`, `string` \| `undefined`\>

###### Returns

readonly [`PromptMessage`](#promptmessage)[]

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L29)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L28)

---

### PromptMessage

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L16)

A single message in a prompt template.

#### Properties

##### content

```ts
readonly content: {
  text: string;
  type: "text";
};
```

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L18)

###### text

```ts
readonly text: string;
```

###### type

```ts
readonly type: "text";
```

##### role

```ts
readonly role: "user" | "assistant";
```

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L17)

---

### PromptRegistrationResult

Defined in: [packages/nexus-agents/src/mcp/prompts/index.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/index.ts#L27)

Result of prompt registration.

#### Properties

##### prompts

```ts
readonly prompts: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/prompts/index.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/index.ts#L29)

Names of registered prompts

---

### PrReviewResponse

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L154)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### abstainCount

```ts
readonly abstainCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L162)

##### approveCount

```ts
readonly approveCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L160)

##### costSummary?

```ts
readonly optional costSummary?: DecisionCostSummary;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L172)

Per-decision cost rollup (#3855): per-voter / per-model token + USD totals
for this governed review. Rides the existing response — no new MCP tool.
Totals are a floor when `costSummary.unmeasuredVoters > 0` (voters whose
adapter reported no usage are counted as unmeasured, not a measured $0).

##### errorCount

```ts
readonly errorCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L163)

##### requestChangesCount

```ts
readonly requestChangesCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L161)

##### reviews

```ts
readonly reviews: readonly PrReviewVote[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L164)

##### summary

```ts
readonly summary: PrReviewDecision;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L155)

##### totalDurationMs

```ts
readonly totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L165)

##### verified

```ts
readonly verified: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L159)

True when the request_changes / approve outcome was driven by
verified findings or unanimous approval; false when the outcome
is a soft signal (majority dissent without verified findings).

---

### PrReviewVote

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L125)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### cli?

```ts
readonly optional cli?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L138)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L128)

##### decision

```ts
readonly decision: PrReviewDecision;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L127)

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L140)

##### findings

```ts
readonly findings: readonly Finding[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L136)

Structured findings parsed from the voter's reasoning per #2225 +
#2233 Child 3. Each Finding has a verification gate output and a
derived `verified` boolean. Only verified findings can trigger
request_changes — see aggregatePrDecisions.

##### processingTimeMs

```ts
readonly processingTimeMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L139)

##### reasoning

```ts
readonly reasoning: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L131)

Free-form reasoning from the voter — full text including the
findings YAML block (which is also parsed into `findings` below).

##### role

```ts
readonly role: VoterRole;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L126)

##### source

```ts
readonly source: "error" | "llm" | "simulation";
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L137)

---

### RateLimiterState

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L31)

Current state of the rate limiter.

#### Properties

##### capacity

```ts
readonly capacity: number;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L35)

Capacity of the bucket

##### nextTokenMs

```ts
readonly nextTokenMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L37)

Time until next token is available (0 if tokens available)

##### tokens

```ts
readonly tokens: number;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L33)

Current number of available tokens

---

### RegistryRelationship

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L30)

A relationship edge between scanners.

#### Properties

##### target

```ts
readonly target: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L31)

##### type

```ts
readonly type: "supersedes" | "uses" | "bundles" | "competes-with";
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L32)

---

### RegistryScanner

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L20)

A scanner entry from the registry manifest.

#### Properties

##### categories

```ts
readonly categories: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L23)

##### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L22)

##### license

```ts
readonly license: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L24)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L21)

##### pricingModel

```ts
readonly pricingModel: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L25)

##### relationships?

```ts
readonly optional relationships?: readonly RegistryRelationship[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L26)

---

### RepoAnalysis

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L41)

Structured analysis of a GitHub repository.

#### Properties

##### ciProvider

```ts
readonly ciProvider: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L51)

CI provider (e.g., "github-actions", "concourse", "jenkins").

##### defaultBranch

```ts
readonly defaultBranch: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L67)

Default branch name.

##### description

```ts
readonly description: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L65)

Repository description.

##### framework

```ts
readonly framework: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L47)

Detected framework (e.g., "express", "react", "spring-boot").

##### gaps

```ts
readonly gaps: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L73)

Identified gaps or missing best practices.

##### hasDockerfile

```ts
readonly hasDockerfile: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L55)

Whether the repo has a Dockerfile.

##### hasHelmCharts

```ts
readonly hasHelmCharts: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L57)

Whether the repo has Helm charts.

##### hasMakefile

```ts
readonly hasMakefile: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L59)

Whether the repo has a Makefile.

##### hasTests

```ts
readonly hasTests: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L61)

Whether the repo has tests.

##### language

```ts
readonly language: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L45)

Primary programming language.

##### license

```ts
readonly license: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L63)

License type (e.g., "MIT", "Apache-2.0").

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L43)

Repository name with owner (e.g., "owner/repo").

##### packageManager

```ts
readonly packageManager: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L49)

Package manager (e.g., "npm", "pip", "maven", "cargo").

##### securityTooling

```ts
readonly securityTooling: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L53)

Security tooling detected in the repo.

##### stars

```ts
readonly stars: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L69)

Star count.

##### topLevelEntries

```ts
readonly topLevelEntries: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L71)

Top-level directory listing.

---

### RepoSecurityPlan

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L67)

Complete security scanning plan for a repository.

#### Properties

##### ciProvider

```ts
readonly ciProvider: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L71)

##### conflicts

```ts
readonly conflicts: readonly ConflictWarning[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L74)

##### coverage

```ts
readonly coverage: readonly CoverageAnalysis[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L75)

##### existingTooling

```ts
readonly existingTooling: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L72)

##### framework

```ts
readonly framework: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L70)

##### gapsSummary

```ts
readonly gapsSummary: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L76)

##### language

```ts
readonly language: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L69)

##### recommendations

```ts
readonly recommendations: readonly ScannerRecommendation[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L73)

##### repo

```ts
readonly repo: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L68)

---

### ResearchAddResponse

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L72)

Response from research_add tool.

#### Properties

##### dryRun

```ts
dryRun: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L82)

Whether this was a dry run

##### errorCategory?

```ts
optional errorCategory?: "validation" | "internal" | "transient" | "permission" | "business";
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L88)

Error category when `success` is false (#2649). `business` for a
dedup hit (paper already in registry); absent otherwise — the MCP
handler treats absent as `internal`.

##### message

```ts
message: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L80)

Human-readable message

##### paperId

```ts
paperId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L76)

Paper ID

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L74)

Whether the operation succeeded

##### title

```ts
title: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L78)

Paper title (empty on failure)

---

### ResearchAddSourceResponse

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L85)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### dryRun

```ts
dryRun: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L92)

##### errorCategory?

```ts
optional errorCategory?: "validation" | "internal" | "transient" | "permission" | "business";
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L98)

Error category when `success` is false (#2649). `business` for a
dedup hit (source already in registry), `internal` for a write
failure; absent otherwise.

##### evidence_tier

```ts
evidence_tier: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L90)

##### message

```ts
message: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L91)

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L88)

##### quality_score

```ts
quality_score: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L89)

##### sourceId

```ts
sourceId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L87)

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L86)

---

### ResearchAnalyzeResponse

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L67)

Response from research_analyze tool.

#### Properties

##### analysis

```ts
analysis: unknown;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L73)

Analysis results

##### focus

```ts
focus: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L69)

Analysis focus that was performed

##### recommendations

```ts
recommendations: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L75)

Recommendations based on analysis

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L71)

Whether the analysis succeeded

---

### ResearchDiscoverResponse

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L174)

Response from research_discover tool.

#### Properties

##### alreadyInRegistry

```ts
alreadyInRegistry: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L186)

Items already in registry (filtered out)

##### failedSources

```ts
failedSources: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L180)

Sources that failed during discovery

##### filteredByRelevance

```ts
filteredByRelevance: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L190)

Items filtered out by relevance threshold

##### items

```ts
items: DiscoveredItem[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L182)

Discovered items

##### newItems

```ts
newItems: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L188)

New items not yet in registry

##### sourcesQueried

```ts
sourcesQueried: string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L178)

Sources queried

##### topic

```ts
topic: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L176)

Topic that was searched

##### totalFound

```ts
totalFound: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L184)

Total items found (before filtering)

---

### ResearchQueryResponse

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L79)

Response from research_query tool.

#### Properties

##### action

```ts
action: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L81)

Action that was performed

##### data

```ts
data: unknown;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L85)

Query results

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L83)

Whether the query succeeded

---

### RunGraphWorkflowDeps

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L86)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### notifier?

```ts
readonly optional notifier?: IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L88)

MCP notifier for client-visible logging (Issue #974)

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

---

### RunGraphWorkflowResponse

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L91)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Properties

##### checkpointCount

```ts
readonly checkpointCount: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L99)

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L97)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L100)

##### events

```ts
readonly events: readonly GraphEventSummary[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L98)

##### finalState

```ts
readonly finalState: Readonly<GraphState>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L94)

##### nodesExecuted

```ts
readonly nodesExecuted: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L96)

##### status

```ts
readonly status: "failed" | "completed";
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L93)

##### stepsExecuted

```ts
readonly stepsExecuted: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L95)

##### workflow

```ts
readonly workflow: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L92)

---

### RunWorkflowDeps

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L127)

Dependencies required by the run_workflow tool.

#### Extends

- [`BaseMcpToolDeps`](#basemcptooldeps)

#### Properties

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L33)

Optional logger

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`logger`](#logger)

##### notifier?

```ts
optional notifier?: IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L130)

MCP notifier for client-visible logging (Issue #974)

##### rateLimiter

```ts
rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L35)

Rate limiter for throttling tool calls (required)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`rateLimiter`](#ratelimiter)

##### security?

```ts
optional security?: {
  allowedPaths: string[];
  audit?: {
     enabled: boolean;
     enableHashChain: boolean;
     logDir?: string;
     maxFiles: number;
     maxFileSizeBytes: number;
     minSeverity: "info" | "warning" | "critical";
  };
  auth?: {
     enabled: boolean;
     method: "token" | "oauth2";
     tokenFile?: string;
     tokenHeader: string;
  };
  blockedPatterns: string[];
  policy?: {
     defaultMode: "read-only" | "read-write";
     policyMode: "warn" | "enforce";
  };
  rateLimit: {
     enabled: boolean;
     perTool?: Record<string, {
        capacity: number;
        refillIntervalMs: number;
        refillRate: number;
     }>;
     requestsPerMinute: number;
  };
  sandbox?: {
     dockerImage?: string;
     fallbackToPolicy: boolean;
     mode: "policy" | "none" | "container";
     networkEnabled: boolean;
  };
  secretsFile?: string;
  timeout?: {
     defaultTimeoutMs: number;
     enableLogging: boolean;
     maxTimeoutMs: number;
     perToolTimeout?: Record<string, number>;
     uriValidation: boolean;
  };
  toolAllowlist?: string[];
};
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L37)

Security configuration (includes timeout settings)

###### allowedPaths

```ts
allowedPaths: string[];
```

###### audit?

```ts
optional audit?: {
  enabled: boolean;
  enableHashChain: boolean;
  logDir?: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  minSeverity: "info" | "warning" | "critical";
};
```

Audit logging configuration (Issue #740 Phase 2)

###### audit.enabled

```ts
enabled: boolean;
```

Enable audit logging (default: true)

###### audit.enableHashChain

```ts
enableHashChain: boolean;
```

Enable tamper-evident hash chain (default: true)

###### audit.logDir?

```ts
optional logDir?: string;
```

Log directory (default: ~/.nexus-agents/audit)

###### audit.maxFiles

```ts
maxFiles: number;
```

Maximum number of log files to retain (default: 10)

###### audit.maxFileSizeBytes

```ts
maxFileSizeBytes: number;
```

Maximum log file size in bytes (default: 10MB)

###### audit.minSeverity

```ts
minSeverity: 'info' | 'warning' | 'critical';
```

Minimum severity to log (default: 'info')

###### auth?

```ts
optional auth?: {
  enabled: boolean;
  method: "token" | "oauth2";
  tokenFile?: string;
  tokenHeader: string;
};
```

Authentication configuration (Issue #739)

###### auth.enabled

```ts
enabled: boolean;
```

Enable authentication for network-exposed transports (default: true)

###### auth.method

```ts
method: 'token' | 'oauth2';
```

Authentication method (default: 'token')

###### auth.tokenFile?

```ts
optional tokenFile?: string;
```

Token file path (default: ~/.nexus-agents/auth/server-token)

###### auth.tokenHeader

```ts
tokenHeader: string;
```

Header name for bearer token (default: 'Authorization')

###### blockedPatterns

```ts
blockedPatterns: string[];
```

###### policy?

```ts
optional policy?: {
  defaultMode: "read-only" | "read-write";
  policyMode: "warn" | "enforce";
};
```

Policy firewall configuration

###### policy.defaultMode

```ts
defaultMode: 'read-only' | 'read-write';
```

Default execution mode for tool operations (default: 'read-only')

###### policy.policyMode

```ts
policyMode: 'warn' | 'enforce';
```

Policy enforcement mode (default: 'enforce')

###### rateLimit

```ts
rateLimit: {
  enabled: boolean;
  perTool?: Record<string, {
     capacity: number;
     refillIntervalMs: number;
     refillRate: number;
  }>;
  requestsPerMinute: number;
};
```

###### rateLimit.enabled

```ts
enabled: boolean;
```

###### rateLimit.perTool?

```ts
optional perTool?: Record<string, {
  capacity: number;
  refillIntervalMs: number;
  refillRate: number;
}>;
```

Per-tool rate limits (Issue #274 Phase 2)

###### rateLimit.requestsPerMinute

```ts
requestsPerMinute: number;
```

###### sandbox?

```ts
optional sandbox?: {
  dockerImage?: string;
  fallbackToPolicy: boolean;
  mode: "policy" | "none" | "container";
  networkEnabled: boolean;
};
```

Sandbox execution configuration (Issue #175)

###### sandbox.dockerImage?

```ts
optional dockerImage?: string;
```

Docker image to use in container mode (default: 'node:22-alpine')

###### sandbox.fallbackToPolicy

```ts
fallbackToPolicy: boolean;
```

Fall back to policy mode if container mode unavailable (default: true)

###### sandbox.mode

```ts
mode: 'policy' | 'none' | 'container';
```

Sandbox execution mode (default: 'policy')

###### sandbox.networkEnabled

```ts
networkEnabled: boolean;
```

Enable network access in container mode (default: false)

###### secretsFile?

```ts
optional secretsFile?: string;
```

###### timeout?

```ts
optional timeout?: {
  defaultTimeoutMs: number;
  enableLogging: boolean;
  maxTimeoutMs: number;
  perToolTimeout?: Record<string, number>;
  uriValidation: boolean;
};
```

Timeout configuration (Issue #271, CVE-2026-0621)

###### timeout.defaultTimeoutMs

```ts
defaultTimeoutMs: number;
```

Default timeout in milliseconds (default: 30000)

###### timeout.enableLogging

```ts
enableLogging: boolean;
```

Whether to log timeout events (default: true)

###### timeout.maxTimeoutMs

```ts
maxTimeoutMs: number;
```

Maximum timeout in milliseconds (default: 300000)

###### timeout.perToolTimeout?

```ts
optional perToolTimeout?: Record<string, number>;
```

Per-tool timeout overrides in milliseconds (Issue #657)

###### timeout.uriValidation

```ts
uriValidation: boolean;
```

Enable URI validation to prevent ReDoS (default: true)

###### toolAllowlist?

```ts
optional toolAllowlist?: string[];
```

Tool allowlist — when set, only listed tools are registered (Issue #740)

###### Inherited from

[`BaseMcpToolDeps`](#basemcptooldeps).[`security`](#security)

##### workflowEngine

```ts
workflowEngine: IWorkflowEngine;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L128)

---

### ScannerData

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L51)

Resolved scanner data for plan building.

#### Properties

##### languageMap

```ts
readonly languageMap: Readonly<Record<string, LanguageMapping>>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L53)

##### scanners

```ts
readonly scanners: readonly ScannerEntry[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L52)

##### source

```ts
readonly source: "fallback" | "registry";
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L54)

---

### ScannerEntry

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L34)

Internal scanner entry used by plan builder.

#### Properties

##### categories

```ts
readonly categories: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L37)

##### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L36)

##### license

```ts
readonly license: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L38)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L35)

##### pricingModel

```ts
readonly pricingModel: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L39)

##### supersedes?

```ts
readonly optional supersedes?: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L40)

---

### ScannerRecommendation

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L41)

A single scanner recommendation with rationale.

#### Properties

##### category

```ts
readonly category: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L44)

##### ciSnippet

```ts
readonly ciSnippet: string | null;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L49)

##### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L43)

##### license

```ts
readonly license: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L45)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L42)

##### pricingModel

```ts
readonly pricingModel: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L46)

##### priority

```ts
readonly priority: "optional" | "critical" | "recommended";
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L48)

##### rationale

```ts
readonly rationale: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L47)

---

### ScannerRegistryManifest

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L46)

The full registry manifest shape.

#### Properties

##### generatedAt

```ts
readonly generatedAt: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L48)

##### languageMatrix

```ts
readonly languageMatrix: Readonly<Record<string, LanguageMatrixEntry>>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L50)

##### scanners

```ts
readonly scanners: readonly RegistryScanner[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L49)

##### version

```ts
readonly version: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L47)

---

### ServerConfig

Defined in: [packages/nexus-agents/src/mcp/server.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L30)

Server configuration options.

#### Properties

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L36)

Logger instance

##### name?

```ts
readonly optional name?: string;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L32)

Server name (default: "nexus-agents")

##### version?

```ts
readonly optional version?: string;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L34)

Server version (default: package version)

---

### ServerError

Defined in: [packages/nexus-agents/src/mcp/server.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L52)

Error type for server operations.

#### Properties

##### cause?

```ts
optional cause?: Error;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L55)

##### code

```ts
code:
  | "SERVER_CREATION_FAILED"
  | "SERVER_START_FAILED"
  | "SERVER_STOP_FAILED";
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L53)

##### message

```ts
message: string;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L54)

---

### ServerInstance

Defined in: [packages/nexus-agents/src/mcp/server.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L42)

Server creation result containing the server and logger.

#### Properties

##### logger

```ts
readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L46)

The logger instance for this server

##### server

```ts
readonly server: McpServer;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L44)

The MCP server instance

---

### StepResultSummary

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L100)

Simplified step result for tool output.

#### Properties

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L103)

##### error?

```ts
optional error?: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L104)

##### status

```ts
status: 'failed' | 'success' | 'skipped';
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L102)

##### stepId

```ts
stepId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L101)

---

### TaskRequirements

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L135)

Analyzes task to determine requirements.

#### Properties

##### estimatedTokens

```ts
estimatedTokens: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L136)

##### isCostSensitive

```ts
isCostSensitive: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L141)

##### needsAudioOutput

```ts
needsAudioOutput: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L145)

Whether the task requires audio output (Issue #685)

##### needsCodeGen

```ts
needsCodeGen: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L140)

##### needsExploration

```ts
needsExploration: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L149)

Whether the task is exploration/research (benefits from large context) (Issue #807)

##### needsImageGen

```ts
needsImageGen: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L143)

Whether the task requires image generation output (Issue #685)

##### needsLargeContext

```ts
needsLargeContext: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L138)

##### needsMcp

```ts
needsMcp: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L147)

Whether the task requires MCP tool support (Issue #685)

##### needsReasoning

```ts
needsReasoning: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L137)

##### needsSpeed

```ts
needsSpeed: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L139)

---

### TextContent

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L47)

MCP tool content types.

#### Properties

##### text

```ts
text: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L49)

##### type

```ts
type: 'text';
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L48)

---

### ToolRegistrationOptions

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:542](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L542)

Options for tool registration.

#### Properties

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:544](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L544)

Logger instance for tool operations

##### rateLimiter?

```ts
readonly optional rateLimiter?: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:546](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L546)

Rate limiter for tool calls

---

### ToolRegistrationResult

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:552](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L552)

Result of tool registration.

#### Properties

##### logger

```ts
readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:556](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L556)

Logger used for tool operations

##### rateLimiter

```ts
readonly rateLimiter: McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:558](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L558)

Rate limiter used for tool calls

##### tools

```ts
readonly tools: readonly string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:554](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L554)

Names of registered tools

---

### ToolResult

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L58)

MCP tool result.

Uses mutable properties for compatibility with secure-handler
sanitization (which rewrites `text` in-place).

#### Properties

##### \_meta?

```ts
optional _meta?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L68)

Out-of-band metadata, never validated against `outputSchema`. The
structured error envelope (#2649) is carried here under
`ERROR_ENVELOPE_META_KEY`.

##### content

```ts
content: TextContent[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L59)

##### isError?

```ts
optional isError?: boolean;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L60)

##### structuredContent?

```ts
optional structuredContent?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L62)

Structured output for SDK outputSchema validation (Issue #1117)

---

### WorkflowInfo

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L56)

Workflow information returned by list_workflows tool.

#### Properties

##### category

```ts
category: string | undefined;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L64)

Workflow category

##### description

```ts
description: string | undefined;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L62)

Workflow description

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L58)

Template name for run_workflow

##### version

```ts
version: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L60)

Version string

---

### WorkflowToolResult

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L88)

Workflow execution result returned by the tool.

#### Properties

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L94)

##### executionId

```ts
executionId: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L89)

##### output

```ts
output: unknown;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L93)

##### status

```ts
status: 'failed' | 'completed';
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L91)

##### stepResults

```ts
stepResults: StepResultSummary[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L92)

##### workflowName

```ts
workflowName: string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L90)

---

### CancelJobDeps

```ts
type CancelJobDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L71)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### CancelJobInput

```ts
type CancelJobInput = z.infer<typeof CancelJobInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L58)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ConsensusVoteInput

```ts
type ConsensusVoteInput = z.infer<typeof ConsensusVoteInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L223)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### CreateExpertInput

```ts
type CreateExpertInput = z.infer<typeof CreateExpertInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L69)

Type for validated create expert input.

---

### DelegateInput

```ts
type DelegateInput = z.infer<typeof DelegateInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L79)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### DelegateOutput

```ts
type DelegateOutput = z.infer<typeof DelegateOutputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L118)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ExecuteExpertInput

```ts
type ExecuteExpertInput = z.infer<typeof ExecuteExpertInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L113)

Type for validated execute expert input.

---

### ExecuteSpecDeps

```ts
type ExecuteSpecDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts#L68)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ExecuteSpecInput

```ts
type ExecuteSpecInput = z.infer<typeof ExecuteSpecInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts#L66)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ExecutionMode

```ts
type ExecutionMode = 'read-only' | 'read-write';
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L33)

Execution mode for tool operations.

- 'read-only': Only read operations allowed (default)
- 'read-write': Both read and write operations allowed

---

### ExtractSymbolsDeps

```ts
type ExtractSymbolsDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/extract-symbols-tool.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/extract-symbols-tool.ts#L48)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### GetJobResultDeps

```ts
type GetJobResultDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L50)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### GetJobResultInput

```ts
type GetJobResultInput = z.infer<typeof GetJobResultInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L36)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ImprovementReviewDeps

```ts
type ImprovementReviewDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:823](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L823)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ImprovementReviewInput

```ts
type ImprovementReviewInput = z.infer<typeof ImprovementReviewInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L97)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### IssueTriageDeps

```ts
type IssueTriageDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L56)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### IssueTriageInput

```ts
type IssueTriageInput = z.infer<typeof IssueTriageInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L54)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ListExpertsDeps

```ts
type ListExpertsDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L46)

Dependencies for list_experts tool.

---

### ListExpertsInput

```ts
type ListExpertsInput = z.infer<typeof ListExpertsInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L41)

Type for validated list experts input.

---

### ListJobsDeps

```ts
type ListJobsDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L76)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ListJobsInput

```ts
type ListJobsInput = z.infer<typeof ListJobsInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L68)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ListWorkflowsInput

```ts
type ListWorkflowsInput = z.infer<typeof ListWorkflowsInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L43)

Type for validated list workflows input.

---

### McpLogLevel

```ts
type McpLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';
```

Defined in: [packages/nexus-agents/src/mcp/mcp-notifier.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/mcp-notifier.ts#L25)

Logging levels for MCP notifications (RFC 5424 syslog).

---

### MemoryQueryInput

```ts
type MemoryQueryInput = z.infer<typeof MemoryQueryInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L63)

Type for validated memory query input.

---

### MemoryWriteInput

```ts
type MemoryWriteInput = z.infer<typeof MemoryWriteInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L59)

Type for validated memory write input.

---

### OrchestrateInput

```ts
type OrchestrateInput = z.infer<typeof OrchestrateInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L74)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### OrchestrateOutput

```ts
type OrchestrateOutput = z.infer<typeof OrchestrateOutputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L122)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### PolicyConfig

```ts
type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L134)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### PolicyMode

```ts
type PolicyMode = 'enforce' | 'warn';
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L40)

Policy enforcement mode.

- 'enforce': Block denied operations
- 'warn': Log denials but allow execution (for migration)

---

### PreferredCapability

```ts
type PreferredCapability = 'reasoning' | 'context' | 'speed' | 'code';
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L26)

Preferred capability for task routing.

---

### PrReviewDecision

```ts
type PrReviewDecision = 'approve' | 'request_changes' | 'abstain';
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L123)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### PrReviewDeps

```ts
type PrReviewDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L175)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### PrReviewInput

```ts
type PrReviewInput = z.infer<typeof PrReviewInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L121)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### QueryTraceInput

```ts
type QueryTraceInput = z.infer<typeof QueryTraceInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/query-trace-tool.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/query-trace-tool.ts#L46)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RegistryImportInput

```ts
type RegistryImportInput = z.infer<typeof RegistryImportInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/registry-import-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/registry-import-types.ts#L28)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RepoAnalyzeDeps

```ts
type RepoAnalyzeDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-tool.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-tool.ts#L32)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RepoAnalyzeInput

```ts
type RepoAnalyzeInput = z.infer<typeof RepoAnalyzeInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L34)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RepoSecurityPlanDeps

```ts
type RepoSecurityPlanDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-tool.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-tool.ts#L31)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RepoSecurityPlanInput

```ts
type RepoSecurityPlanInput = z.infer<typeof RepoSecurityPlanInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L34)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ResearchAddDeps

```ts
type ResearchAddDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L63)

Dependencies for research_add tool.

---

### ResearchAddInput

```ts
type ResearchAddInput = z.infer<typeof ResearchAddInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L54)

Type for validated research add input.

---

### ResearchAddSourceDeps

```ts
type ResearchAddSourceDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L79)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ResearchAddSourceInput

```ts
type ResearchAddSourceInput = z.infer<typeof ResearchAddSourceInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L78)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ResearchAnalyzeDeps

```ts
type ResearchAnalyzeDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L58)

Dependencies for research_analyze tool.

---

### ResearchAnalyzeInput

```ts
type ResearchAnalyzeInput = z.infer<typeof ResearchAnalyzeInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L49)

Type for validated research analyze input.

---

### ResearchCatalogReviewDeps

```ts
type ResearchCatalogReviewDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-catalog-review.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-catalog-review.ts#L67)

Dependencies for research_catalog_review tool.

---

### ResearchDiscoverDeps

```ts
type ResearchDiscoverDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L165)

Dependencies for research_discover tool.

---

### ResearchDiscoverInput

```ts
type ResearchDiscoverInput = z.infer<typeof ResearchDiscoverInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L156)

Type for validated research discover input.

---

### ResearchQueryDeps

```ts
type ResearchQueryDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L70)

Dependencies for research_query tool.

---

### ResearchQueryInput

```ts
type ResearchQueryInput = z.infer<typeof ResearchQueryInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L61)

Type for validated research query input.

---

### ResearchSynthesizeDeps

```ts
type ResearchSynthesizeDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-synthesize.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-synthesize.ts#L48)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ResearchSynthesizeInput

```ts
type ResearchSynthesizeInput = z.infer<typeof ResearchSynthesizeInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-synthesize.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-synthesize.ts#L42)

Type for validated research synthesize input.

---

### RunGraphWorkflowInput

```ts
type RunGraphWorkflowInput = z.infer<typeof RunGraphWorkflowInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L84)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RunWorkflowInput

```ts
type RunWorkflowInput = z.infer<typeof RunWorkflowInputSchema>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L79)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### SearchCodebaseDeps

```ts
type SearchCodebaseDeps = BaseMcpToolDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/search-codebase-tool.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/search-codebase-tool.ts#L46)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### VoteDecisionStatus

```ts
type VoteDecisionStatus = 'approved' | 'rejected' | 'pending' | 'timeout' | 'no_quorum';
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L243)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### CancelJobInputSchema

```ts
const CancelJobInputSchema: ZodObject<
  {
    jobId: ZodString;
    reason: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/cancel-job-tool.ts#L46)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ConsensusVoteInputSchema

```ts
const ConsensusVoteInputSchema: ZodObject<
  {
    errorPolicy: ZodOptional<
      ZodEnum<{
        count_as_abstain: 'count_as_abstain';
        fail_closed: 'fail_closed';
        reduce_denominator: 'reduce_denominator';
      }>
    >;
    idempotencyKey: ZodOptional<ZodString>;
    mode: ZodOptional<
      ZodEnum<{
        async: 'async';
        sync: 'sync';
      }>
    >;
    proposal: ZodString;
    quickMode: ZodDefault<ZodOptional<ZodBoolean>>;
    simulateVotes: ZodDefault<ZodOptional<ZodBoolean>>;
    strategy: ZodOptional<
      ZodEnum<{
        higher_order: 'higher_order';
        opinion_wise: 'opinion_wise';
        proof_of_learning: 'proof_of_learning';
        simple_majority: 'simple_majority';
        supermajority: 'supermajority';
        unanimous: 'unanimous';
      }>
    >;
    threshold: ZodOptional<
      ZodEnum<{
        majority: 'majority';
        supermajority: 'supermajority';
        unanimous: 'unanimous';
      }>
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/consensus-vote-types.ts#L161)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### CreateExpertInputSchema

```ts
const CreateExpertInputSchema: ZodObject<
  {
    modelPreference: ZodOptional<ZodString>;
    role: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      data_visualization_expert: 'data_visualization_expert';
      devops_expert: 'devops_expert';
      documentation_expert: 'documentation_expert';
      infrastructure_expert: 'infrastructure_expert';
      pm_expert: 'pm_expert';
      research_expert: 'research_expert';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
      ux_expert: 'ux_expert';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L43)

Input schema for create_expert tool.

---

### DelegateInputSchema

```ts
const DelegateInputSchema: ZodObject<
  {
    billing_mode: ZodOptional<
      ZodEnum<{
        api: 'api';
        plan: 'plan';
      }>
    >;
    model_hint: ZodOptional<ZodString>;
    preferred_capability: ZodOptional<
      ZodEnum<{
        code: 'code';
        context: 'context';
        reasoning: 'reasoning';
        speed: 'speed';
      }>
    >;
    task: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L56)

Input schema for the delegate_to_model tool.

---

### DelegateOutputSchema

```ts
const DelegateOutputSchema: ZodObject<
  {
    alternatives: ZodArray<
      ZodObject<
        {
          model: ZodString;
          score: ZodNumber;
          tradeoff: ZodString;
        },
        $strip
      >
    >;
    capabilities: ZodObject<
      {
        codeGeneration: ZodNumber;
        contextWindow: ZodNumber;
        cost: ZodNumber;
        reasoning: ZodNumber;
        speed: ZodNumber;
      },
      $strip
    >;
    estimated_tokens: ZodNumber;
    governance: ZodOptional<
      ZodObject<
        {
          domain: ZodString;
          promotionReason: ZodString;
          votingThreshold: ZodString;
        },
        $strip
      >
    >;
    reasoning: ZodString;
    recommended_model: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L84)

Output schema for the delegate_to_model tool response.

---

### denyMutationsWithoutModeRule

```ts
const denyMutationsWithoutModeRule: FirewallPolicyRule;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-rules.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-rules.ts#L76)

Policy rule that denies mutation operations when mode is 'read-only'.

This ensures that write operations are only allowed when explicitly
enabled via the 'read-write' mode.

---

### ExecuteExpertInputSchema

```ts
const ExecuteExpertInputSchema: ZodObject<
  {
    context: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    expertId: ZodString;
    previousExpertSummary: ZodOptional<ZodString>;
    task: ZodString;
    timeoutMs: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-expert.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-expert.ts#L87)

Input schema for execute_expert tool.

---

### ExecuteSpecInputSchema

```ts
const ExecuteSpecInputSchema: ZodObject<
  {
    dispatch: ZodDefault<
      ZodEnum<{
        async: 'async';
        sync: 'sync';
      }>
    >;
    dryRun: ZodDefault<ZodOptional<ZodBoolean>>;
    spec: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/execute-spec-tool.ts#L47)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ExtractSymbolsInputSchema

```ts
const ExtractSymbolsInputSchema: ZodObject<
  {
    filePath: ZodString;
    mode: ZodOptional<
      ZodEnum<{
        full: 'full';
        index: 'index';
      }>
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/extract-symbols-tool.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/extract-symbols-tool.ts#L30)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### FALLBACK_SCANNER_DATA

```ts
const FALLBACK_SCANNER_DATA: ScannerData;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-fallback.ts:310](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-fallback.ts#L310)

Embedded scanner data snapshot used when live registry is unavailable.

---

### GetJobResultInputSchema

```ts
const GetJobResultInputSchema: ZodObject<
  {
    jobId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/get-job-result-tool.ts#L33)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ImprovementReviewInputSchema

```ts
const ImprovementReviewInputSchema: ZodObject<
  {
    fileIssues: ZodDefault<ZodOptional<ZodBoolean>>;
    fitnessFloor: ZodDefault<ZodOptional<ZodNumber>>;
    lookbackDays: ZodDefault<ZodOptional<ZodNumber>>;
    minSampleSize: ZodDefault<ZodOptional<ZodNumber>>;
    selfEvalReportPath: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/improvement-review.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/improvement-review.ts#L54)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### IssueTriageInputSchema

```ts
const IssueTriageInputSchema: ZodObject<
  {
    dryRun: ZodDefault<ZodOptional<ZodBoolean>>;
    issueUrl: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/issue-triage-tool.ts#L41)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ListExpertsInputSchema

```ts
const ListExpertsInputSchema: ZodObject<
  {
    format: ZodDefault<
      ZodOptional<
        ZodEnum<{
          full: 'full';
          names: 'names';
        }>
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-experts.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-experts.ts#L30)

Input schema for list_experts tool.
Currently no parameters required (lists all experts).

---

### ListJobsInputSchema

```ts
const ListJobsInputSchema: ZodObject<
  {
    limit: ZodOptional<ZodNumber>;
    status: ZodOptional<
      ZodEnum<{
        cancelled: 'cancelled';
        complete: 'complete';
        failed: 'failed';
        pending: 'pending';
      }>
    >;
    toolName: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-jobs-tool.ts#L42)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ListWorkflowsInputSchema

```ts
const ListWorkflowsInputSchema: ZodObject<
  {
    category: ZodOptional<ZodString>;
    format: ZodDefault<
      ZodOptional<
        ZodEnum<{
          full: 'full';
          names: 'names';
        }>
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/list-workflows.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/list-workflows.ts#L31)

Input schema for list_workflows tool.

---

### MAX_DIFF_LENGTH

```ts
const MAX_DIFF_LENGTH: 50000 = 50_000;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L64)

Hard cap on diff size sent to voters. Diffs above this are truncated with
an explicit notice — the tool stays useful for typical PRs without blowing
the context budget.

---

### MemoryQueryInputSchema

```ts
const MemoryQueryInputSchema: ZodObject<
  {
    limit: ZodDefault<ZodOptional<ZodNumber>>;
    query: ZodString;
    source: ZodDefault<
      ZodOptional<
        ZodEnum<{
          adaptive: 'adaptive';
          agentic: 'agentic';
          all: 'all';
          belief: 'belief';
          session: 'session';
          typed: 'typed';
        }>
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-query.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-query.ts#L43)

Input schema for memory_query tool.

---

### MemoryStatsInputSchema

```ts
const MemoryStatsInputSchema: ZodObject<
  {
    includeDecay: ZodDefault<ZodOptional<ZodBoolean>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-stats.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-stats.ts#L35)

Input schema for memory_stats tool.

---

### MemoryWriteInputSchema

```ts
const MemoryWriteInputSchema: ZodObject<
  {
    backend: ZodEnum<{
      adaptive: 'adaptive';
      agentic: 'agentic';
      belief: 'belief';
      session: 'session';
      typed: 'typed';
    }>;
    confidence: ZodDefault<
      ZodOptional<
        ZodEnum<{
          high: 'high';
          low: 'low';
          medium: 'medium';
        }>
      >
    >;
    content: ZodString;
    key: ZodString;
    metadata: ZodOptional<ZodRecord<ZodString, ZodString>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/memory-write.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/memory-write.ts#L36)

Input schema for memory_write tool.

---

### MODEL_CAPABILITIES

```ts
const MODEL_CAPABILITIES: Record<string, CapabilityProfile>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-types.ts#L51)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### NOOP_NOTIFIER

```ts
const NOOP_NOTIFIER: IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/mcp-notifier.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/mcp-notifier.ts#L82)

No-op notifier for when MCP server is not available.

---

### OrchestrateInputSchema

```ts
const OrchestrateInputSchema: ZodObject<
  {
    context: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    idempotencyKey: ZodOptional<ZodString>;
    maxIterations: ZodDefault<ZodOptional<ZodNumber>>;
    mode: ZodOptional<
      ZodEnum<{
        async: 'async';
        sync: 'sync';
      }>
    >;
    task: ZodString;
    timeout: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L23)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### OrchestrateOutputSchema

```ts
const OrchestrateOutputSchema: ZodObject<
  {
    analysis: ZodObject<
      {
        approach: ZodString;
        complexity: ZodNumber;
        estimatedEffort: ZodNumber;
        needsDecomposition: ZodBoolean;
        requirements: ZodArray<ZodString>;
        risks: ZodArray<ZodString>;
        taskId: ZodString;
        taskType: ZodString;
      },
      $strip
    >;
    metadata: ZodObject<
      {
        durationMs: ZodNumber;
        expertsUsed: ZodArray<ZodString>;
        timeoutReason: ZodOptional<ZodString>;
        tokensUsed: ZodNumber;
      },
      $strip
    >;
    result: ZodUnknown;
    routing: ZodOptional<
      ZodObject<
        {
          confidence: ZodNumber;
          orchestratorType: ZodString;
          pattern: ZodString;
          reasoning: ZodString;
        },
        $strip
      >
    >;
    stepsCompleted: ZodNumber;
    taskId: ZodString;
    workerDispatchStatus: ZodOptional<
      ZodEnum<{
        failed: 'failed';
        partial: 'partial';
        success: 'success';
      }>
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/orchestrate-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/orchestrate-types.ts#L76)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### PolicyConfigSchema

```ts
const PolicyConfigSchema: ZodObject<{
  allowedPaths: ZodDefault<ZodArray<ZodString>>;
  defaultMode: ZodDefault<ZodEnum<{
     read-only: "read-only";
     read-write: "read-write";
  }>>;
  policyMode: ZodDefault<ZodEnum<{
     enforce: "enforce";
     warn: "warn";
  }>>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-types.ts#L128)

Schema for policy configuration.

---

### PR_REVIEW_ROLES

```ts
const PR_REVIEW_ROLES: readonly VoterRole[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L53)

Voter panel for PR review. PM and AI/ML excluded — they're proposal-level
roles, not code-level. The 5 here are the ones with concrete claims about
code (#2233).

---

### PROMPT_DEFINITIONS

```ts
const PROMPT_DEFINITIONS: readonly PromptDefinition[];
```

Defined in: [packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/prompt-definitions.ts#L155)

All registered MCP prompt templates.

Each entry provides a Zod args schema for validation and a message builder.

---

### PrReviewInputSchema

```ts
const PrReviewInputSchema: ZodObject<
  {
    baseRef: ZodOptional<ZodString>;
    dispatch: ZodDefault<
      ZodEnum<{
        async: 'async';
        sync: 'sync';
      }>
    >;
    headRef: ZodOptional<ZodString>;
    prDescription: ZodOptional<ZodString>;
    prDiff: ZodString;
    prTitle: ZodString;
    repoContext: ZodOptional<ZodString>;
    simulate: ZodDefault<ZodBoolean>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L83)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### QueryTraceInputSchema

```ts
const QueryTraceInputSchema: ZodObject<
  {
    eventType: ZodOptional<ZodString>;
    limit: ZodOptional<ZodNumber>;
    runId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/query-trace-tool.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/query-trace-tool.ts#L30)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RegistryImportInputSchema

```ts
const RegistryImportInputSchema: ZodObject<
  {
    dryRun: ZodDefault<ZodOptional<ZodBoolean>>;
    modelId: ZodString;
    provider: ZodEnum<{
      anthropic: 'anthropic';
      google: 'google';
      openai: 'openai';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/registry-import-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/registry-import-types.ts#L17)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RepoAnalyzeInputSchema

```ts
const RepoAnalyzeInputSchema: ZodObject<
  {
    depth: ZodDefault<
      ZodOptional<
        ZodEnum<{
          deep: 'deep';
          shallow: 'shallow';
        }>
      >
    >;
    repo: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze-types.ts#L16)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RepoSecurityPlanInputSchema

```ts
const RepoSecurityPlanInputSchema: ZodObject<
  {
    categories: ZodOptional<ZodArray<ZodString>>;
    maxScanners: ZodDefault<ZodOptional<ZodNumber>>;
    repo: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan-types.ts#L16)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ResearchAddInputSchema

```ts
const ResearchAddInputSchema: ZodObject<
  {
    arxivId: ZodString;
    dryRun: ZodDefault<ZodOptional<ZodBoolean>>;
    priority: ZodOptional<
      ZodEnum<{
        P1: 'P1';
        P2: 'P2';
        P3: 'P3';
        P4: 'P4';
      }>
    >;
    topic: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add.ts#L37)

Input schema for research_add tool.

---

### ResearchAddSourceInputSchema

```ts
const ResearchAddSourceInputSchema: ZodObject<
  {
    dryRun: ZodDefault<ZodOptional<ZodBoolean>>;
    name: ZodString;
    quality_signals: ZodOptional<
      ZodObject<
        {
          has_docs: ZodOptional<ZodBoolean>;
          has_paper: ZodOptional<ZodBoolean>;
          has_tests: ZodOptional<ZodBoolean>;
          language: ZodOptional<ZodString>;
          stars_at_review: ZodOptional<ZodNumber>;
        },
        $strip
      >
    >;
    tags: ZodOptional<ZodArray<ZodString>>;
    techniques_extracted: ZodOptional<ZodArray<ZodString>>;
    topics: ZodOptional<ZodArray<ZodString>>;
    type: ZodEnum<{
      code_analysis: 'code_analysis';
      open_source_repo: 'open_source_repo';
      product_docs: 'product_docs';
      research_blog: 'research_blog';
      specification: 'specification';
    }>;
    url: ZodString;
    vendor: ZodOptional<ZodString>;
    verdict: ZodOptional<
      ZodEnum<{
        adopted: 'adopted';
        monitoring: 'monitoring';
        partially_adopted: 'partially_adopted';
        planned: 'planned';
        rejected: 'rejected';
      }>
    >;
    verdict_notes: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-add-source.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-add-source.ts#L51)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### ResearchAnalyzeInputSchema

```ts
const ResearchAnalyzeInputSchema: ZodObject<
  {
    focus: ZodEnum<{
      coverage: 'coverage';
      gaps: 'gaps';
      priorities: 'priorities';
      stale: 'stale';
      trends: 'trends';
    }>;
    topic: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-analyze.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-analyze.ts#L37)

Input schema for research_analyze tool.

---

### ResearchCatalogReviewInputSchema

```ts
const ResearchCatalogReviewInputSchema: ZodObject<
  {
    action: ZodEnum<{
      approve: 'approve';
      dismiss: 'dismiss';
      flush: 'flush';
      list: 'list';
    }>;
    createIssue: ZodDefault<ZodOptional<ZodBoolean>>;
    identifier: ZodOptional<ZodString>;
    topic: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-catalog-review.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-catalog-review.ts#L37)

Input schema for research_catalog_review tool.

---

### ResearchDiscoverInputSchema

```ts
const ResearchDiscoverInputSchema: ZodObject<
  {
    maxResults: ZodDefault<ZodOptional<ZodNumber>>;
    relevanceThreshold: ZodDefault<ZodOptional<ZodNumber>>;
    sinceDate: ZodOptional<ZodString>;
    source: ZodDefault<
      ZodOptional<
        ZodEnum<{
          all: 'all';
          arxiv: 'arxiv';
          deepmind: 'deepmind';
          github: 'github';
          google_ai: 'google_ai';
          meta_fair: 'meta_fair';
          microsoft: 'microsoft';
          openalex: 'openalex';
          papers_with_code: 'papers_with_code';
          semantic_scholar: 'semantic_scholar';
        }>
      >
    >;
    topic: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-discover.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-discover.ts#L107)

Input schema for research_discover tool.

---

### ResearchQueryInputSchema

```ts
const ResearchQueryInputSchema: ZodObject<{
  action: ZodEnum<{
     overlap: "overlap";
     search: "search";
     stats: "stats";
     status: "status";
  }>;
  query: ZodOptional<ZodString>;
  status: ZodDefault<ZodOptional<ZodEnum<{
     all: "all";
     implemented: "implemented";
     not-started: "not-started";
     planned: "planned";
     rejected: "rejected";
  }>>>;
  techniqueId: ZodOptional<ZodString>;
  threshold: ZodDefault<ZodOptional<ZodNumber>>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-query.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-query.ts#L36)

Input schema for research_query tool.

---

### ResearchSynthesizeInputSchema

```ts
const ResearchSynthesizeInputSchema: ZodObject<
  {
    topic: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/research-synthesize.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/research-synthesize.ts#L35)

Input schema for research_synthesize tool.

---

### RunGraphWorkflowInputSchema

```ts
const RunGraphWorkflowInputSchema: ZodObject<
  {
    dispatch: ZodDefault<
      ZodOptional<
        ZodEnum<{
          async: 'async';
          sync: 'sync';
        }>
      >
    >;
    enableAuditTrail: ZodDefault<ZodOptional<ZodBoolean>>;
    enableCheckpointing: ZodDefault<ZodOptional<ZodBoolean>>;
    inputs: ZodDefault<ZodOptional<ZodRecord<ZodString, ZodUnknown>>>;
    workflow: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow.ts#L51)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### RunWorkflowInputSchema

```ts
const RunWorkflowInputSchema: ZodObject<
  {
    dryRun: ZodDefault<ZodOptional<ZodBoolean>>;
    idempotencyKey: ZodOptional<ZodString>;
    inputs: ZodRecord<ZodString, ZodUnknown>;
    mode: ZodOptional<
      ZodEnum<{
        async: 'async';
        sync: 'sync';
      }>
    >;
    template: ZodString;
    timeoutMs: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-workflow-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-workflow-types.ts#L21)

Input schema for the run_workflow tool.

---

### safePathsRule

```ts
const safePathsRule: FirewallPolicyRule;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy-rules.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy-rules.ts#L104)

Policy rule that validates paths against allowed roots.

Prevents path traversal attacks by ensuring all file operations
target paths within configured allowed directories.

---

### SearchCodebaseInputSchema

```ts
const SearchCodebaseInputSchema: ZodObject<
  {
    directory: ZodOptional<ZodString>;
    limit: ZodOptional<ZodNumber>;
    mode: ZodOptional<
      ZodEnum<{
        list: 'list';
        search: 'search';
        summary: 'summary';
      }>
    >;
    query: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/search-codebase-tool.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/search-codebase-tool.ts#L30)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### WeatherReportInputSchema

```ts
const WeatherReportInputSchema: ZodObject<
  {
    category: ZodOptional<
      ZodEnum<{
        architecture: 'architecture';
        code_generation: 'code_generation';
        code_review: 'code_review';
        devops: 'devops';
        documentation: 'documentation';
        exploration: 'exploration';
        planning: 'planning';
        research: 'research';
        security_review: 'security_review';
        testing: 'testing';
      }>
    >;
    cli: ZodOptional<
      ZodEnum<{
        claude: 'claude';
        codex: 'codex';
        gemini: 'gemini';
        opencode: 'opencode';
      }>
    >;
    includeAdaptive: ZodDefault<ZodOptional<ZodBoolean>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/weather-report-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/weather-report-types.ts#L22)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

---

### aggregatePrDecisions()

```ts
function aggregatePrDecisions(reviews): PrReviewAggregate;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L217)

Aggregates per-voter decisions into a single summary outcome with a
verified/unverified tag (#2250 Child 7).

Tiers, in order:

1. **Verified blocker** (`request_changes`, verified=true) — at least
   one non-error voter declared `request_changes` AND has at least one
   VERIFIED finding (all 4 gate checks passed with substantive
   named_assertion). This is the #2225 verification gate.
2. **Soft blocker** (`request_changes`, verified=false) — ≥3 of 5
   non-error voters voted `request_changes`, but none produced a
   verified finding. The retest in #2241 showed voters reliably
   flag diff-readable bugs at this rate even without producing the
   YAML structure (#2245 covers why). Tagged unverified so reviewers
   apply the verification gate themselves.
3. **Approve** (verified=true) — all non-error voters approve.
4. **Abstain** (verified=true) — anything else; conservative default.

Why no "AND has any finding" guard on the soft path: the empirical
data in `pr-review-experiment-results-v2.md` showed voters voting
request_changes but emitting 0 findings (verified or otherwise).
Adding the finding requirement would zero this path out and reproduce
the baseline behavior.

#### Parameters

##### reviews

readonly [`PrReviewVote`](#prreviewvote)[]

#### Returns

`PrReviewAggregate`

---

### analyzeDelegateTask()

```ts
function analyzeDelegateTask(task): TaskRequirements;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-helpers.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-helpers.ts#L56)

Analyzes a task string to determine requirements.

#### Parameters

##### task

`string`

#### Returns

[`TaskRequirements`](#taskrequirements)

---

### analyzeGitHubRepo()

```ts
function analyzeGitHubRepo(input): Promise<RepoAnalysis>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze.ts:531](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze.ts#L531)

Fetch repo data from GitHub and produce analysis.

#### Parameters

##### input

###### depth

`"deep"` \| `"shallow"` = `...`

Analysis depth: shallow (tree + README) or deep (full analysis).

###### repo

`string` = `...`

GitHub repository in "owner/name" format or full URL.

#### Returns

`Promise`\<[`RepoAnalysis`](#repoanalysis)\>

---

### analyzeRepo()

```ts
function analyzeRepo(metadata, topLevelEntries, workflowEntries?): RepoAnalysis;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze.ts:308](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze.ts#L308)

Analyze a GitHub repository given its metadata and file tree.

#### Parameters

##### metadata

`GhRepoMetadata`

##### topLevelEntries

readonly `string`[]

##### workflowEntries?

readonly `string`[]

#### Returns

[`RepoAnalysis`](#repoanalysis)

---

### buildPlanFromAnalysis()

```ts
function buildPlanFromAnalysis(analysis, input, data?): RepoSecurityPlan;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:450](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L450)

Pure function: build plan from analysis + scanner data (testable).

#### Parameters

##### analysis

[`RepoAnalysis`](#repoanalysis)

##### input

`BuildPlanOptions`

##### data?

[`ScannerData`](#scannerdata)

#### Returns

[`RepoSecurityPlan`](#reposecurityplan)

---

### buildPrReviewProposal()

```ts
function buildPrReviewProposal(input): string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L250)

Builds the proposal text passed to voters. The voters are designed for
yes/no proposals — by framing the diff as "should this PR be merged?" we
get usable output without needing new system prompts (Child 3 will add
those).

#### Parameters

##### input

`Pick`\<[`PrReviewInput`](#prreviewinput),
\| `"prTitle"`
\| `"prDescription"`
\| `"prDiff"`
\| `"repoContext"`
\| `"baseRef"`
\| `"headRef"`\>

#### Returns

`string`

---

### clearRegistryCache()

```ts
function clearRegistryCache(): void;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L106)

Clear the cache and inflight state (for testing).

#### Returns

`void`

---

### closeServer()

```ts
function closeServer(server, logger?): Promise<Result<void, ServerError>>;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L230)

Gracefully closes the server connection.

#### Parameters

##### server

`McpServer`

The MCP server to close

##### logger?

[`ILogger`](core.md#ilogger)

Optional logger

#### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ServerError`](#servererror)\>\>

Result indicating success or failure

---

### connectTransport()

```ts
function connectTransport(server, transport, logger?): Promise<Result<void, ServerError>>;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L144)

Connects the server to a transport.

#### Parameters

##### server

`McpServer`

The MCP server instance

##### transport

`Transport`

The transport to connect to

##### logger?

[`ILogger`](core.md#ilogger)

Logger for the operation

#### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ServerError`](#servererror)\>\>

Result indicating success or failure

---

### createDefaultDeps()

```ts
function createDefaultDeps(rateLimiter, logger?): CreateExpertDeps;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:350](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L350)

Creates default dependencies for the create_expert tool.

#### Parameters

##### rateLimiter

[`McpRateLimiter`](#mcpratelimiter)

Rate limiter for throttling tool calls (required)

##### logger?

[`ILogger`](core.md#ilogger)

Optional logger instance

#### Returns

[`CreateExpertDeps`](#createexpertdeps)

CreateExpertDeps with default factory and empty registry

---

### createDefaultPolicyFirewall()

```ts
function createDefaultPolicyFirewall(config?): PolicyFirewall;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L253)

Creates a policy firewall with default rules.

Default rules included:

- deny-mutations-without-mode
- safe-paths

#### Parameters

##### config?

[`PolicyFirewallConfig`](#policyfirewallconfig)

Optional configuration

#### Returns

[`PolicyFirewall`](#policyfirewall)

A configured PolicyFirewall instance

---

### createDefaultRateLimiter()

```ts
function createDefaultRateLimiter(name?, logger?): McpRateLimiter;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/rate-limiter.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/rate-limiter.ts#L179)

Creates a rate limiter with default settings suitable for MCP tools.

Default configuration:

- Capacity: 100 tokens
- Refill rate: 10 tokens per second

#### Parameters

##### name?

`string`

Optional name for the rate limiter

##### logger?

[`ILogger`](core.md#ilogger)

Optional logger instance

#### Returns

[`McpRateLimiter`](#mcpratelimiter)

A configured RateLimiter instance

---

### createMcpLogger()

```ts
function createMcpLogger(baseContext?): ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L38)

Creates a logger with MCP-specific context.

#### Parameters

##### baseContext?

[`McpLogContext`](#mcplogcontext)

Base context to include in all log entries

#### Returns

[`ILogger`](core.md#ilogger)

An ILogger instance with MCP context

#### Example

```typescript
const logger = createMcpLogger({ requestId: 'req-123' });
logger.info('Processing request', { tool: 'orchestrate' });
```

---

### createMcpNotifier()

```ts
function createMcpNotifier(server): IMcpNotifier;
```

Defined in: [packages/nexus-agents/src/mcp/mcp-notifier.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/mcp-notifier.ts#L47)

Creates an MCP notifier that sends logging notifications to connected clients.

Notifications are fire-and-forget — failures are logged but never
propagate to callers. This ensures observability never breaks tool execution.

#### Parameters

##### server

`McpServer`

#### Returns

[`IMcpNotifier`](#imcpnotifier)

---

### createPolicyContext()

```ts
function createPolicyContext(toolName, args, options?): FirewallPolicyContext;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:294](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L294)

Creates a policy context from tool invocation parameters.

#### Parameters

##### toolName

`string`

Name of the tool being invoked

##### args

`unknown`

Tool arguments

##### options?

Additional context options

###### allowedPaths?

readonly `string`[]

###### artifacts?

`Map`\<`string`, [`FirewallArtifact`](#firewallartifact)\<`unknown`\>\>

###### mode?

[`ExecutionMode`](#executionmode)

###### workflowId?

`string`

#### Returns

[`FirewallPolicyContext`](#firewallpolicycontext)

A PolicyContext object

---

### createServer()

```ts
function createServer(config?): Result<ServerInstance, ServerError>;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L90)

Creates a new MCP server instance.

#### Parameters

##### config?

[`ServerConfig`](#serverconfig)

Optional server configuration

#### Returns

[`Result`](core.md#result)\<[`ServerInstance`](#serverinstance), [`ServerError`](#servererror)\>

Result containing the server instance or an error

#### Example

```typescript
const result = createServer({ name: 'my-server' });
if (result.ok) {
  const { server, logger } = result.value;
  // Register tools on server
}
```

---

### createTimer()

```ts
function createTimer(): {
  elapsed: () => number;
};
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L144)

Creates a timing utility for measuring operation duration.

#### Returns

```ts
{
  elapsed: () => number;
}
```

An object with start time and elapsed() method

##### elapsed

```ts
elapsed: () => number;
```

###### Returns

`number`

#### Example

```typescript
const timer = createTimer();
// ... perform operation
const durationMs = timer.elapsed();
```

---

### createToolLogger()

```ts
function createToolLogger(parentLogger, toolName, requestId?): ILogger;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L53)

Creates a child logger for a specific tool execution.

#### Parameters

##### parentLogger

[`ILogger`](core.md#ilogger)

The parent logger instance

##### toolName

`string`

Name of the tool being executed

##### requestId?

`string`

Optional request ID for tracing

#### Returns

[`ILogger`](core.md#ilogger)

A child logger with tool context

---

### createValidator()

```ts
function createValidator<T>(schema): (args) => Result<T, ValidationError>;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/validation.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/validation.ts#L83)

Creates a validation function bound to a specific schema.

Useful for reusing the same schema across multiple tools.

#### Type Parameters

##### T

`T`

The expected type after validation

#### Parameters

##### schema

`ZodType`\<`T`\>

The Zod schema to bind

#### Returns

A validation function for the schema

(`args`) => [`Result`](core.md#result)\<`T`, [`ValidationError`](core.md#validationerror)\>

#### Example

```typescript
const validateTask = createValidator(TaskSchema);

// Later in tool handlers:
const result = validateTask(args);
```

---

### evaluatePolicy()

```ts
function evaluatePolicy(firewall, ctx): Result<void, PolicyError>;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/policy.ts:273](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/policy.ts#L273)

Evaluates a policy context and returns a Result.

This is a convenience function that wraps the firewall evaluation
in a Result type for easier error handling.

#### Parameters

##### firewall

[`IPolicyFirewall`](#ipolicyfirewall)

The policy firewall to use

##### ctx

[`FirewallPolicyContext`](#firewallpolicycontext)

The policy context to evaluate

#### Returns

[`Result`](core.md#result)\<`void`, [`PolicyError`](#policyerror)\>

Result containing void on success or PolicyError on denial

---

### generateSecurityPlan()

```ts
function generateSecurityPlan(input): Promise<RepoSecurityPlan>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L397)

Generate a security scanning plan for a repository (fetches live data).

#### Parameters

##### input

###### categories?

`string`[] = `...`

Filter to specific scanner categories.

###### maxScanners

`number` = `...`

Maximum number of scanners to recommend.

###### repo

`string` = `...`

GitHub repository in "owner/name" format or full URL.

#### Returns

`Promise`\<[`RepoSecurityPlan`](#reposecurityplan)\>

---

### generateWeatherReport()

```ts
function generateWeatherReport(input, config?, deps?): WeatherReportResponse;
```

Defined in: [packages/nexus-agents/src/mcp/tools/weather-report.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/weather-report.ts#L112)

Generates the weather report from current outcome data.

#### Parameters

##### input

`WeatherReportOptions`

##### config?

`Partial`\<\{
`coldStartThreshold`: `number`;
`explorationRate`: `number`;
`maxBonusAdjustment`: `number`;
`outcomeLookbackMs`: `number`;
\}\>

##### deps?

`WeatherReportDeps`

#### Returns

`WeatherReportResponse`

---

### getAvailableRoles()

```ts
function getAvailableRoles(): string[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L362)

Gets the list of available expert roles.

#### Returns

`string`[]

---

### getCapabilitiesForRole()

```ts
function getCapabilitiesForRole(role): readonly AgentCapability[] | undefined;
```

Defined in: [packages/nexus-agents/src/mcp/tools/create-expert.ts:369](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/create-expert.ts#L369)

Gets capabilities for a given expert role.

#### Parameters

##### role

`string`

#### Returns

readonly [`AgentCapability`](core.md#agentcapability)[] \| `undefined`

---

### getEventBusStats()

```ts
function getEventBusStats(): {
  activeSubscriptions: number;
  errorCount: number;
  eventsEmitted: number;
  historySize: number;
};
```

Defined in: [packages/nexus-agents/src/mcp/eventbus-bridge.ts:291](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/eventbus-bridge.ts#L291)

Gets EventBus statistics for observability reporting.

#### Returns

```ts
{
  activeSubscriptions: number;
  errorCount: number;
  eventsEmitted: number;
  historySize: number;
}
```

##### activeSubscriptions

```ts
activeSubscriptions: number;
```

##### errorCount

```ts
errorCount: number;
```

##### eventsEmitted

```ts
eventsEmitted: number;
```

##### historySize

```ts
historySize: number;
```

---

### getGraphRegistry()

```ts
function getGraphRegistry(): ReadonlyMap<string, GraphFactory>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L91)

Registry of all predefined graph workflows (built-in + multi-CLI + security setup).

#### Returns

`ReadonlyMap`\<`string`, `GraphFactory`\>

---

### getGraphWorkflowList()

```ts
function getGraphWorkflowList(): readonly GraphWorkflowInfo[];
```

Defined in: [packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/run-graph-workflow-templates.ts#L82)

Returns metadata about all available graph workflows (built-in + multi-CLI + security setup).

#### Returns

readonly [`GraphWorkflowInfo`](#graphworkflowinfo)[]

---

### getRegistryManifest()

```ts
function getRegistryManifest(): Promise<ScannerRegistryManifest | null>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts:224](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/scanner-registry-fetcher.ts#L224)

Get the scanner registry, fetching from GitHub if cache is stale.
Returns null if no cached data and fetch fails.

#### Returns

`Promise`\<[`ScannerRegistryManifest`](#scannerregistrymanifest) \| `null`\>

---

### initializeEventBusBridge()

```ts
function initializeEventBusBridge(observer, logger, config?): EventBusBridgeResult;
```

Defined in: [packages/nexus-agents/src/mcp/eventbus-bridge.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/eventbus-bridge.ts#L161)

Initializes the EventBus bridge with SwarmObserver integration.

Subscribes to configured event patterns and:

1. Logs events at appropriate levels (debug for frequent, info for important)
2. Records interactions to SwarmObserver for graph-based analysis
3. Tracks event statistics for observability

#### Parameters

##### observer

[`InteractionSwarmObserver`](observability.md#interactionswarmobserver)

SwarmObserver instance for interaction tracking

##### logger

[`ILogger`](core.md#ilogger)

Logger instance for event logging

##### config?

`Partial`\<\{
`enabled`: `boolean`;
`logging`: \{
`frequentEventLevel`: `"debug"` \| `"info"`;
`importantEventLevel`: `"debug"` \| `"info"`;
\};
`maxHistorySize`: `number`;
`subscriptions`: \{
`agent`: `boolean`;
`byzantine`: `boolean`;
`consensus`: `boolean`;
`message`: `boolean`;
`protocol`: `boolean`;
`session`: `boolean`;
\};
\}\>

Optional EventBus configuration

#### Returns

[`EventBusBridgeResult`](#eventbusbridgeresult)

Bridge result with cleanup function

---

### isZodError()

```ts
function isZodError(error): error is ZodError<unknown>;
```

Defined in: [packages/nexus-agents/src/core/zod-helpers.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/zod-helpers.ts#L97)

Type guard to check if a value is a Zod error.

#### Parameters

##### error

`unknown`

The value to check

#### Returns

`error is ZodError<unknown>`

True if the value is a ZodError

#### Example

```typescript
if (isZodError(error)) {
  console.error(formatZodError(error));
}
```

---

### logToolError()

```ts
function logToolError(logger, toolName, error, durationMs): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L118)

Logs a failed tool execution.

#### Parameters

##### logger

[`ILogger`](core.md#ilogger)

The logger to use

##### toolName

`string`

Name of the tool

##### error

`Error`

The error that occurred

##### durationMs

`number`

Duration of the execution in milliseconds

#### Returns

`void`

---

### logToolStart()

```ts
function logToolStart(logger, toolName, args?): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L76)

Logs the start of a tool execution.

#### Parameters

##### logger

[`ILogger`](core.md#ilogger)

The logger to use

##### toolName

`string`

Name of the tool

##### args?

`Record`\<`string`, `unknown`\>

Tool arguments (sanitized for logging)

#### Returns

`void`

---

### logToolSuccess()

```ts
function logToolSuccess(logger, toolName, durationMs, resultInfo?): void;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L96)

Logs the successful completion of a tool execution.

#### Parameters

##### logger

[`ILogger`](core.md#ilogger)

The logger to use

##### toolName

`string`

Name of the tool

##### durationMs

`number`

Duration of the execution in milliseconds

##### resultInfo?

`Record`\<`string`, `unknown`\>

Optional information about the result

#### Returns

`void`

---

### mapVoteDecisionToPrDecision()

```ts
function mapVoteDecisionToPrDecision(voteDecision): PrReviewDecision;
```

Defined in: [packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/pr-review-tool.ts#L182)

Maps a voter's approve/reject/abstain to PR review semantics.

#### Parameters

##### voteDecision

`"approve"` \| `"reject"` \| `"abstain"`

#### Returns

[`PrReviewDecision`](#prreviewdecision)

---

### normalizeRepoId()

```ts
function normalizeRepoId(input): string;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-analyze.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-analyze.ts#L37)

Normalize "owner/repo" from either "owner/repo" or full GitHub URL.

#### Parameters

##### input

`string`

#### Returns

`string`

---

### registerExpertsResource()

```ts
function registerExpertsResource(server, logger): void;
```

Defined in: [packages/nexus-agents/src/mcp/resources/experts-resource.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/resources/experts-resource.ts#L65)

Registers the `nexus://experts` resource with the MCP server.

Exposes the list of available expert roles (10 built-in experts)
with their names, descriptions, and capabilities as a read-only
JSON resource.

#### Parameters

##### server

`McpServer`

MCP server instance

##### logger

[`ILogger`](core.md#ilogger)

Logger for registration events

#### Returns

`void`

---

### registerModelsResource()

```ts
function registerModelsResource(server, logger): void;
```

Defined in: [packages/nexus-agents/src/mcp/resources/models-resource.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/resources/models-resource.ts#L64)

Registers the `nexus://models` resource with the MCP server.

Exposes the full model capabilities matrix (13 models) as a
read-only JSON resource. Data is sourced from the canonical
model registry (via `getInTreeCapabilitiesMatrix()` — backed by
the ModelRegistry's in-tree entries, #2546 slice C3).

#### Parameters

##### server

`McpServer`

MCP server instance

##### logger

[`ILogger`](core.md#ilogger)

Logger for registration events

#### Returns

`void`

---

### registerPrompts()

```ts
function registerPrompts(server, logger): PromptRegistrationResult;
```

Defined in: [packages/nexus-agents/src/mcp/prompts/index.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/prompts/index.ts#L42)

Registers all prompt templates on the MCP server.

Iterates `PROMPT_DEFINITIONS` and calls `server.registerPrompt()` for each.
The SDK handles argument validation via the Zod schemas defined in each prompt.

#### Parameters

##### server

`McpServer`

The MCP server instance

##### logger

[`ILogger`](core.md#ilogger)

Logger for registration events

#### Returns

[`PromptRegistrationResult`](#promptregistrationresult)

The list of registered prompt names

---

### registerResearchResource()

```ts
function registerResearchResource(server, logger): void;
```

Defined in: [packages/nexus-agents/src/mcp/resources/research-resource.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/resources/research-resource.ts#L79)

Registers the `nexus://research/papers` resource with the MCP server.

Exposes the research registry (papers, techniques, stats) as a
read-only JSON resource. Gracefully returns an empty result when
the registry YAML files are not present.

#### Parameters

##### server

`McpServer`

MCP server instance

##### logger

[`ILogger`](core.md#ilogger)

Logger for registration events

#### Returns

`void`

---

### registerResources()

```ts
function registerResources(server, logger?): void;
```

Defined in: [packages/nexus-agents/src/mcp/resources/index.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/resources/index.ts#L38)

Registers all MCP resources with the server.

Currently registers 4 resources:

- `nexus://models` - AI model capabilities matrix (static)
- `nexus://available-models` - live discovered model set per transport (#3406)
- `nexus://research/papers` - Research paper registry
- `nexus://experts` - Available expert agent roles

#### Parameters

##### server

`McpServer`

MCP server instance

##### logger?

[`ILogger`](core.md#ilogger)

Optional logger (creates default if not provided)

#### Returns

`void`

---

### registerTools()

```ts
function registerTools(server, options?): ToolRegistrationResult;
```

Defined in: [packages/nexus-agents/src/mcp/tools/index.ts:609](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/index.ts#L609)

MCP exports - MCP server implementation
Split from index.ts for file size compliance (Issue #285)
Updated Issue #538: Added missing tool registration exports

#### Parameters

##### server

`McpServer`

##### options?

[`ToolRegistrationOptions`](#toolregistrationoptions)

#### Returns

[`ToolRegistrationResult`](#toolregistrationresult)

---

### resolveScannerData()

```ts
function resolveScannerData(): Promise<ScannerData>;
```

Defined in: [packages/nexus-agents/src/mcp/tools/repo-security-plan.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/repo-security-plan.ts#L120)

Resolve scanner data: fetch from registry, fall back to embedded.

#### Returns

`Promise`\<[`ScannerData`](#scannerdata)\>

---

### selectModel()

```ts
function selectModel(input, requirements, billingMode?): SelectionResult;
```

Defined in: [packages/nexus-agents/src/mcp/tools/delegate-to-model-helpers.ts:344](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/delegate-to-model-helpers.ts#L344)

Selects the optimal model for a task.

#### Parameters

##### input

###### billing_mode?

`"plan"` \| `"api"` = `...`

###### model_hint?

`string` = `...`

###### preferred_capability?

`"code"` \| `"context"` \| `"reasoning"` \| `"speed"` = `...`

###### task

`string` = `...`

##### requirements

[`TaskRequirements`](#taskrequirements)

##### billingMode?

`BillingMode` = `'api'`

#### Returns

`SelectionResult`

---

### startStdioServer()

```ts
function startStdioServer(config?): Promise<Result<ServerInstance, ServerError>>;
```

Defined in: [packages/nexus-agents/src/mcp/server.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/server.ts#L187)

Starts the MCP server with stdio transport.

This is the main entry point for running the server as a standalone process.
The server will communicate over stdin/stdout using the MCP protocol.

#### Parameters

##### config?

[`ServerConfig`](#serverconfig)

Optional server configuration

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`ServerInstance`](#serverinstance), [`ServerError`](#servererror)\>\>

Result indicating success or failure

#### Example

```typescript
const result = await startStdioServer();
if (!result.ok) {
  console.error('Failed to start server:', result.error.message);
  process.exit(1);
}
```

---

### toolError()

```ts
function toolError(message): ToolResult;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L167)

Creates an error tool result.

Back-compat alias for toolStructuredError — maps to the
conservative `internal` / non-retryable envelope. New code should call
`toolStructuredError` directly with the correct category; this alias
exists so the ~64 legacy call sites keep working during the #2649
migration sweep.

#### Parameters

##### message

`string`

The error message

#### Returns

[`ToolResult`](#toolresult)

A ToolResult with isError set to true and an `internal` envelope

---

### toolSuccess()

```ts
function toolSuccess(text): ToolResult;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L86)

Creates a successful tool result.

#### Parameters

##### text

`string`

The result text

#### Returns

[`ToolResult`](#toolresult)

A ToolResult with the text content

#### Example

```typescript
return toolSuccess(JSON.stringify({ status: 'ok', data: result }));
```

---

### toolSuccessStructured()

```ts
function toolSuccessStructured(data): ToolResult;
```

Defined in: [packages/nexus-agents/src/mcp/tools/tool-result.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/tools/tool-result.ts#L106)

Creates a successful tool result with structured content for outputSchema validation.

When a tool is registered with outputSchema, the SDK validates structuredContent
against the schema. This helper returns both text (for display) and structured data.

#### Parameters

##### data

`Record`\<`string`, `unknown`\>

The structured result data (must match the tool's outputSchema)

#### Returns

[`ToolResult`](#toolresult)

A ToolResult with both text content and structuredContent

#### Example

```typescript
return toolSuccessStructured({ experts: [...], count: 10 });
```

---

### validateToolInput()

```ts
function validateToolInput<T>(schema, args): Result<T, ValidationError>;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/validation.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/validation.ts#L45)

Validates tool input against a Zod schema.

This function should be called at the start of every tool handler
to validate incoming arguments before processing.

#### Type Parameters

##### T

`T`

The expected type after validation

#### Parameters

##### schema

`ZodType`\<`T`\>

The Zod schema to validate against

##### args

`unknown`

The unknown input to validate

#### Returns

[`Result`](core.md#result)\<`T`, [`ValidationError`](core.md#validationerror)\>

Result containing validated data or a ValidationError

#### Example

```typescript
const InputSchema = z.object({
  task: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

server.tool('my_tool', InputSchema.shape, async (args) => {
  const result = validateToolInput(InputSchema, args);
  if (!result.ok) {
    return toolStructuredError({ errorCategory: 'validation', message: result.error.message });
  }
  const { task, context } = result.value;
  // Process validated input...
});
```

---

### withLogging()

```ts
function withLogging<TArgs, TResult>(toolName, handler, logger): (args) => Promise<TResult>;
```

Defined in: [packages/nexus-agents/src/mcp/middleware/logging.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/mcp/middleware/logging.ts#L170)

Higher-order function that wraps a tool handler with logging.

#### Type Parameters

##### TArgs

`TArgs`

Tool argument type

##### TResult

`TResult`

Tool result type

#### Parameters

##### toolName

`string`

Name of the tool

##### handler

(`args`) => `Promise`\<`TResult`\>

The tool handler function

##### logger

[`ILogger`](core.md#ilogger)

The logger to use

#### Returns

A wrapped handler with automatic logging

(`args`) => `Promise`\<`TResult`\>

#### Example

```typescript
const wrappedHandler = withLogging(
  'my_tool',
  async (args) => { ... },
  logger
);
```
