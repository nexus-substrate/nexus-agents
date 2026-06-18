---
title: 'API: exports/pipeline'
description: Generated API reference for exports/pipeline.
tier: 2
---

# exports/pipeline

Pipeline module exports — V2 Pipeline OS types and adapters.

## Classes

### ArtifactStore

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L139)

In-memory artifact store with bounded capacity.

When the store exceeds maxArtifacts, the oldest artifacts are evicted
(FIFO — insertion order, never reordered on `get()`). Content size is
validated on put().

This is a bounded in-memory working cache, NOT the durable audit
substrate (#2867): once `maxArtifacts` is reached, old artifacts and
their provenance are dropped. For tamper-evident, retained audit
history use the on-disk Merkle audit log via the `verify_audit_chain`
MCP tool.

#### Implements

- [`IArtifactStore`](#iartifactstore)

#### Constructors

##### Constructor

```ts
new ArtifactStore(options?): ArtifactStore;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L145)

###### Parameters

###### options?

[`ArtifactStoreOptions`](#artifactstoreoptions)

###### Returns

[`ArtifactStore`](#artifactstore)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L150)

###### Returns

`number`

###### Implementation of

[`IArtifactStore`](#iartifactstore).[`size`](#size-1)

#### Methods

##### get()

```ts
get(ref): Artifact | undefined;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L172)

###### Parameters

###### ref

###### id

`string` = `...`

###### type

\| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"` = `...`

###### Returns

[`Artifact`](#artifact) \| `undefined`

###### Implementation of

[`IArtifactStore`](#iartifactstore).[`get`](#get-1)

##### provenance()

```ts
provenance(ref): readonly ProvenanceEntry[];
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L196)

Returns the full provenance chain for an artifact — the artifact
itself plus every ancestor transitively reachable via `inputRefs`
(#2867). Iterative DFS; the `visited` set makes it safe against
cycles and diamond/multi-parent DAGs (each artifact appears once).

Entries are in reachability (start-node-first DFS) order, not
topological order. An ancestor that has been FIFO-evicted from the
store is silently skipped — the chain truncates there rather than
throwing. A missing root returns `[]`.

###### Parameters

###### ref

###### id

`string` = `...`

###### type

\| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"` = `...`

###### Returns

readonly [`ProvenanceEntry`](#provenanceentry)[]

###### Implementation of

[`IArtifactStore`](#iartifactstore).[`provenance`](#provenance-1)

##### put()

```ts
put(artifact): {
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
};
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L154)

###### Parameters

###### artifact

[`Artifact`](#artifact)

###### Returns

```ts
{
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
}
```

###### id

```ts
id: string;
```

###### type

```ts
type:
  | "code"
  | "plan"
  | "test"
  | "review"
  | "vote"
  | "analysis"
  | "spec"
  | "report";
```

###### Implementation of

[`IArtifactStore`](#iartifactstore).[`put`](#put-1)

##### query()

```ts
query(filter): readonly {
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
}[];
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L176)

###### Parameters

###### filter

[`ArtifactFilter`](#artifactfilter)

###### Returns

readonly \{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[]

###### Implementation of

[`IArtifactStore`](#iartifactstore).[`query`](#query-2)

---

### EventBus

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L53)

In-memory event bus with bounded circular buffer.

Events are stored in a circular buffer. When the buffer is full,
the oldest events are evicted. Subscribers receive events that
match their filter. Handler errors are caught and logged.

#### Implements

- [`IEventBus`](#ieventbus)

#### Constructors

##### Constructor

```ts
new EventBus(options?): EventBus;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L58)

###### Parameters

###### options?

[`EventBusOptions`](#eventbusoptions)

###### Returns

[`EventBus`](#eventbus)

#### Accessors

##### bufferSize

###### Get Signature

```ts
get bufferSize(): number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L68)

Current buffer size.

###### Returns

`number`

Current buffer size.

###### Implementation of

[`IEventBus`](#ieventbus).[`bufferSize`](#buffersize-1)

##### subscriptionCount

###### Get Signature

```ts
get subscriptionCount(): number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L73)

Number of active subscriptions (for observability/testing).

###### Returns

`number`

##### totalEmitted

###### Get Signature

```ts
get totalEmitted(): number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L64)

Total events emitted (including evicted).

###### Returns

`number`

Total events emitted (including evicted).

###### Implementation of

[`IEventBus`](#ieventbus).[`totalEmitted`](#totalemitted-1)

#### Methods

##### emit()

```ts
emit(event): void;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L77)

Emit an event. Handlers must not throw.

###### Parameters

###### event

[`PipelineEvent`](#pipelineevent)

###### Returns

`void`

###### Implementation of

[`IEventBus`](#ieventbus).[`emit`](#emit-1)

##### query()

```ts
query(filter, limit?): readonly PipelineEvent[];
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L92)

Query recent events (bounded buffer).

###### Parameters

###### filter

[`EventFilter`](#eventfilter)

###### limit?

`number`

###### Returns

readonly [`PipelineEvent`](#pipelineevent)[]

###### Implementation of

[`IEventBus`](#ieventbus).[`query`](#query-3)

##### subscribe()

```ts
subscribe(filter, handler): Unsubscribe;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L83)

Subscribe to events matching filter. Returns unsubscribe function.

###### Parameters

###### filter

[`EventFilter`](#eventfilter)

###### handler

[`EventHandler`](#eventhandler)

###### Returns

[`Unsubscribe`](#unsubscribe)

###### Implementation of

[`IEventBus`](#ieventbus).[`subscribe`](#subscribe-1)

---

### PipelineRunner

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L116)

Compiles PlanContracts and executes them as graphs.

#### Constructors

##### Constructor

```ts
new PipelineRunner(): PipelineRunner;
```

###### Returns

[`PipelineRunner`](#pipelinerunner)

#### Methods

##### compile()

```ts
compile(plan, options?): CompileResult;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L118)

Compiles a PlanContract into a CompiledPipeline.

###### Parameters

###### plan

###### approvalRequired

`boolean` = `...`

###### estimatedCost

\{
`estimatedCostUsd`: `number`;
`modelCalls`: `number`;
`totalTokensIn`: `number`;
`totalTokensOut`: `number`;
\} = `CostEstimateSchema`

###### estimatedCost.estimatedCostUsd

`number` = `...`

###### estimatedCost.modelCalls

`number` = `...`

###### estimatedCost.totalTokensIn

`number` = `...`

###### estimatedCost.totalTokensOut

`number` = `...`

###### maxIterations

`number` = `...`

###### policyGates

\{
`afterStage`: `string`;
`beforeStage`: `string`;
`id`: `string`;
`onFail`: `"warn"` \| `"block"` \| `"escalate"`;
`rules`: `string`[];
\}[] = `...`

###### stages

\{
`config`: `Record`\<`string`, `unknown`\>;
`dependencies`: `string`[];
`id`: `string`;
`inputArtifacts`: `string`[];
`maxRetries?`: `number`;
`outputArtifacts`: `string`[];
`pluginId`: `string`;
`preferredCli?`: `string`;
`timeoutMs?`: `number`;
`type`: `"analyze"` \| `"validate"` \| `"aggregate"` \| `"execute"` \| `"route"` \| `"gate"`;
\}[] = `...`

###### taskId

`string` = `...`

###### timeoutMs

`number` = `...`

###### options?

[`PlanCompileOptions`](#plancompileoptions)

###### Returns

`CompileResult`

##### execute()

```ts
execute(
   pipeline,
   task,
options?): Promise<ExecuteResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L141)

Executes a compiled pipeline.

###### Parameters

###### pipeline

[`CompiledPipeline`](#compiledpipeline)

###### task

###### analysis

\{
`ambiguityScore`: `number`;
`complexity`: `string`;
`taskType`: `string`;
\} = `TaskAnalysisSummarySchema`

###### analysis.ambiguityScore

`number` = `...`

###### analysis.complexity

`string` = `...`

###### analysis.taskType

`string` = `...`

###### artifacts

\{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[] = `...`

###### capabilityGaps

\{
`allSatisfied`: `boolean`;
`available`: \{
`experts`: `string`[];
`tools`: `string`[];
\};
`gaps`: `unknown`[];
\} = `CapabilityGapSummarySchema`

###### capabilityGaps.allSatisfied

`boolean` = `...`

###### capabilityGaps.available

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `...`

###### capabilityGaps.available.experts

`string`[] = `...`

###### capabilityGaps.available.tools

`string`[] = `...`

###### capabilityGaps.gaps

`unknown`[] = `...`

###### completedAt?

`number` = `...`

###### constraints

\{
`quality?`: `string`;
`scope`: `string`[];
`time?`: `string`;
\} = `TaskConstraintsSummarySchema`

###### constraints.quality?

`string` = `...`

###### constraints.scope

`string`[] = `...`

###### constraints.time?

`string` = `...`

###### createdAt

`number` = `...`

###### description

`string` = `...`

###### error?

`string` = `...`

###### id

`string` = `...`

###### metadata

`Record`\<`string`, `unknown`\> = `...`

###### parentId?

`string` = `...`

###### requiredCapabilities

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `RequiredCapabilitiesSummarySchema`

###### requiredCapabilities.experts

`string`[] = `...`

###### requiredCapabilities.tools

`string`[] = `...`

###### status

\| `"failed"`
\| `"planning"`
\| `"done"`
\| `"approved"`
\| `"executing"`
\| `"intake"`
\| `"clarifying"`
\| `"validating"` = `...`

###### updatedAt

`number` = `...`

###### options?

[`PipelineExecuteOptions`](#pipelineexecuteoptions)

###### Returns

`Promise`\<`ExecuteResult`\>

##### retryFailed()

```ts
retryFailed(
   pipeline,
   previousResult,
   task,
options?): Promise<ExecuteResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L190)

Retries a previous run's failures **selectively** (#3534): prior successful
nodes are replayed (not re-executed) via `priorResults`, so only the failed
nodes and their dependents run again.

Gated on retryability: retries only when at least one _failed_ node is
`isRetryable` (transient). If every failure is permanent
(validation/permission/business/internal) it returns `previousResult`
unchanged rather than looping on errors that won't clear.

Back-compat: a `previousResult` without `nodeResults` (e.g. an older caller)
falls back to the prior whole-pipeline retry gated on `stepResults`.

NOTE: non-retryable failures that coexist with a retryable one still re-run
(and re-fail) under `continueOnFailure`; pinning them as terminal is a
future refinement.

###### Parameters

###### pipeline

[`CompiledPipeline`](#compiledpipeline)

###### previousResult

[`PipelineResult`](#pipelineresult)

###### task

###### analysis

\{
`ambiguityScore`: `number`;
`complexity`: `string`;
`taskType`: `string`;
\} = `TaskAnalysisSummarySchema`

###### analysis.ambiguityScore

`number` = `...`

###### analysis.complexity

`string` = `...`

###### analysis.taskType

`string` = `...`

###### artifacts

\{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[] = `...`

###### capabilityGaps

\{
`allSatisfied`: `boolean`;
`available`: \{
`experts`: `string`[];
`tools`: `string`[];
\};
`gaps`: `unknown`[];
\} = `CapabilityGapSummarySchema`

###### capabilityGaps.allSatisfied

`boolean` = `...`

###### capabilityGaps.available

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `...`

###### capabilityGaps.available.experts

`string`[] = `...`

###### capabilityGaps.available.tools

`string`[] = `...`

###### capabilityGaps.gaps

`unknown`[] = `...`

###### completedAt?

`number` = `...`

###### constraints

\{
`quality?`: `string`;
`scope`: `string`[];
`time?`: `string`;
\} = `TaskConstraintsSummarySchema`

###### constraints.quality?

`string` = `...`

###### constraints.scope

`string`[] = `...`

###### constraints.time?

`string` = `...`

###### createdAt

`number` = `...`

###### description

`string` = `...`

###### error?

`string` = `...`

###### id

`string` = `...`

###### metadata

`Record`\<`string`, `unknown`\> = `...`

###### parentId?

`string` = `...`

###### requiredCapabilities

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `RequiredCapabilitiesSummarySchema`

###### requiredCapabilities.experts

`string`[] = `...`

###### requiredCapabilities.tools

`string`[] = `...`

###### status

\| `"failed"`
\| `"planning"`
\| `"done"`
\| `"approved"`
\| `"executing"`
\| `"intake"`
\| `"clarifying"`
\| `"validating"` = `...`

###### updatedAt

`number` = `...`

###### options?

[`PipelineExecuteOptions`](#pipelineexecuteoptions)

###### Returns

`Promise`\<`ExecuteResult`\>

---

### PluginRegistry

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L45)

In-memory plugin registry with experimental gating.

Plugins are registered during startup. After freeze(),
no further registrations are accepted.

#### Implements

- [`IPluginRegistry`](#ipluginregistry)

#### Constructors

##### Constructor

```ts
new PluginRegistry(options?): PluginRegistry;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L50)

###### Parameters

###### options?

[`PluginRegistryOptions`](#pluginregistryoptions)

###### Returns

[`PluginRegistry`](#pluginregistry)

#### Accessors

##### frozen

###### Get Signature

```ts
get frozen(): boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L54)

Whether the registry is frozen.

###### Returns

`boolean`

Whether the registry is frozen.

###### Implementation of

[`IPluginRegistry`](#ipluginregistry).[`frozen`](#frozen-1)

#### Methods

##### freeze()

```ts
freeze(): void;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L105)

Freeze the registry — no further registrations allowed.

###### Returns

`void`

###### Implementation of

[`IPluginRegistry`](#ipluginregistry).[`freeze`](#freeze-1)

##### isEnabled()

```ts
isEnabled(pluginId): boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L101)

Check if a plugin is registered and enabled.

###### Parameters

###### pluginId

`string`

###### Returns

`boolean`

###### Implementation of

[`IPluginRegistry`](#ipluginregistry).[`isEnabled`](#isenabled-1)

##### listEnabled()

```ts
listEnabled(): readonly {
  description: string;
  experimental: boolean;
  id: string;
  requiredCapabilities: string[];
  stages: ("analyze" | "validate" | "aggregate" | "execute" | "route" | "gate")[];
  trustLevel: "external" | "standard" | "experimental" | "core";
  version: string;
}[];
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L97)

List all enabled plugins with their manifests.

###### Returns

readonly \{
`description`: `string`;
`experimental`: `boolean`;
`id`: `string`;
`requiredCapabilities`: `string`[];
`stages`: (`"analyze"` \| `"validate"` \| `"aggregate"` \| `"execute"` \| `"route"` \| `"gate"`)[];
`trustLevel`: `"external"` \| `"standard"` \| `"experimental"` \| `"core"`;
`version`: `string`;
\}[]

###### Implementation of

[`IPluginRegistry`](#ipluginregistry).[`listEnabled`](#listenabled-1)

##### register()

```ts
register(plugin): Result<void, RegistrationError>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L58)

Register a plugin. Validates manifest and config.
Returns error if plugin ID conflicts or capabilities missing.

###### Parameters

###### plugin

[`PipelinePlugin`](#pipelineplugin)

###### Returns

[`Result`](../core.md#result)\<`void`, [`RegistrationError`](#registrationerror)\>

###### Implementation of

[`IPluginRegistry`](#ipluginregistry).[`register`](#register-1)

##### resolve()

```ts
resolve(pluginId): PipelinePlugin | undefined;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L93)

Resolve a plugin by ID. Returns undefined if not registered or disabled.

###### Parameters

###### pluginId

`string`

###### Returns

[`PipelinePlugin`](#pipelineplugin) \| `undefined`

###### Implementation of

[`IPluginRegistry`](#ipluginregistry).[`resolve`](#resolve-1)

---

### PolicyEngine

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L88)

In-memory policy engine with priority-ordered rule evaluation.

Rules are evaluated in descending priority order.
First blocking rule short-circuits evaluation.

#### Implements

- [`IPolicyEngine`](#ipolicyengine)

#### Constructors

##### Constructor

```ts
new PolicyEngine(): PolicyEngine;
```

###### Returns

[`PolicyEngine`](#policyengine)

#### Methods

##### evaluate()

```ts
evaluate(gate, context): PolicyDecision;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L98)

###### Parameters

###### gate

###### afterStage

`string` = `...`

###### beforeStage

`string` = `...`

###### id

`string` = `...`

###### onFail

`"warn"` \| `"block"` \| `"escalate"` = `...`

###### rules

`string`[] = `...`

###### context

[`PolicyContext`](#policycontext)

###### Returns

[`PolicyDecision`](#policydecision)

###### Implementation of

[`IPolicyEngine`](#ipolicyengine).[`evaluate`](#evaluate-1)

##### listRules()

```ts
listRules(): readonly PolicyRule[];
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L116)

###### Returns

readonly [`PolicyRule`](#policyrule)[]

###### Implementation of

[`IPolicyEngine`](#ipolicyengine).[`listRules`](#listrules-1)

##### registerRule()

```ts
registerRule(rule): void;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L91)

###### Parameters

###### rule

[`PolicyRule`](#policyrule)

###### Returns

`void`

###### Implementation of

[`IPolicyEngine`](#ipolicyengine).[`registerRule`](#registerrule-1)

## Interfaces

### AdaptiveOrchestratorOptions

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L30)

Options for the adaptive orchestrator.

#### Extends

- [`GraphPipelineOptions`](#graphpipelineoptions)

#### Properties

##### dryRun?

```ts
readonly optional dryRun?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L29)

When true, stop after the dryRunStopAfter stage.

###### Inherited from

[`GraphPipelineOptions`](#graphpipelineoptions).[`dryRun`](#dryrun-2)

##### maxSteps?

```ts
readonly optional maxSteps?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L31)

Maximum graph execution steps (default: 20).

###### Inherited from

[`GraphPipelineOptions`](#graphpipelineoptions).[`maxSteps`](#maxsteps-1)

##### stages

```ts
readonly stages: StageRegistry;
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L34)

Stage registry to use. If omitted, stages must be provided per-template.

##### templateId?

```ts
readonly optional templateId?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L32)

Force a specific template (skip auto-detection).

---

### AdaptiveOrchestratorResult

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L38)

Result of adaptive orchestration — extends GraphPipelineResult with metadata.

#### Extends

- [`GraphPipelineResult`](#graphpipelineresult)

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L39)

###### Inherited from

[`GraphPipelineResult`](#graphpipelineresult).[`durationMs`](#durationms-2)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L41)

###### Inherited from

[`GraphPipelineResult`](#graphpipelineresult).[`error`](#error-2)

##### finalState

```ts
readonly finalState: Readonly<Record<string, unknown>>;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L40)

###### Inherited from

[`GraphPipelineResult`](#graphpipelineresult).[`finalState`](#finalstate-1)

##### selectionMethod

```ts
readonly selectionMethod: "explicit" | "auto-detected";
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L40)

How the template was selected.

##### stepsExecuted

```ts
readonly stepsExecuted: number;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L38)

###### Inherited from

[`GraphPipelineResult`](#graphpipelineresult).[`stepsExecuted`](#stepsexecuted-1)

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L36)

###### Inherited from

[`GraphPipelineResult`](#graphpipelineresult).[`success`](#success-2)

##### taskClassification

```ts
readonly taskClassification: TaskClassification;
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L42)

Task classification used for selection.

##### templateId

```ts
readonly templateId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L37)

###### Inherited from

[`GraphPipelineResult`](#graphpipelineresult).[`templateId`](#templateid-2)

---

### AgentExecutorConfig

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L121)

Configuration for the agent executor.

#### Properties

##### budget?

```ts
readonly optional budget?: AgentBudgetConfig;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L144)

Opt-in per-run token budget (#3395). When set, expert calls are metered
through a BudgetGuard: once cumulative usage crosses the ceiling,
further expert calls short-circuit to a failure result (stopping spend)
rather than aborting mid-pipeline. Absent → no enforcement (default).

##### issueNumber?

```ts
readonly optional issueNumber?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L136)

##### quickMode?

```ts
readonly optional quickMode?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L134)

Use 3 agents instead of 6 for faster voting (default: false).

##### repo?

```ts
readonly optional repo?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L137)

##### scanTarget?

```ts
readonly optional scanTarget?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L122)

##### simulateVotes?

```ts
readonly optional simulateVotes?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L123)

##### tracker?

```ts
readonly optional tracker?: ITaskTracker;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L135)

##### votingStrategy?

```ts
readonly optional votingStrategy?:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise";
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L125)

Voting strategy for consensus stages (default: higher_order).

---

### Artifact

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L24)

Full artifact with content and metadata.

#### Properties

##### content

```ts
readonly content: unknown;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L27)

##### createdAt

```ts
readonly createdAt: number;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L30)

##### createdBy

```ts
readonly createdBy: string;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L29)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L25)

##### inputRefs

```ts
readonly inputRefs: readonly {
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
}[];
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L31)

##### metadata

```ts
readonly metadata: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L28)

##### type

```ts
readonly type:
  | "code"
  | "plan"
  | "test"
  | "review"
  | "vote"
  | "analysis"
  | "spec"
  | "report";
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L26)

---

### ArtifactFilter

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L35)

Filter for querying artifacts.

#### Properties

##### createdBy?

```ts
readonly optional createdBy?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L37)

##### type?

```ts
readonly optional type?:
  | "code"
  | "plan"
  | "test"
  | "review"
  | "vote"
  | "analysis"
  | "spec"
  | "report";
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L36)

---

### ArtifactStoreOptions

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L117)

Options for ArtifactStore behavior.

#### Properties

##### maxArtifacts?

```ts
readonly optional maxArtifacts?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L118)

##### maxContentSize?

```ts
readonly optional maxContentSize?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L119)

---

### CompiledPipeline

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L35)

Compiled pipeline ready for execution.

#### Properties

##### graph

```ts
readonly graph: CompiledGraph;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L36)

##### plan

```ts
readonly plan: {
  approvalRequired: boolean;
  estimatedCost: {
     estimatedCostUsd: number;
     modelCalls: number;
     totalTokensIn: number;
     totalTokensOut: number;
  };
  maxIterations: number;
  policyGates: {
     afterStage: string;
     beforeStage: string;
     id: string;
     onFail: "warn" | "block" | "escalate";
     rules: string[];
  }[];
  stages: {
     config: Record<string, unknown>;
     dependencies: string[];
     id: string;
     inputArtifacts: string[];
     maxRetries?: number;
     outputArtifacts: string[];
     pluginId: string;
     preferredCli?: string;
     timeoutMs?: number;
     type: "analyze" | "validate" | "aggregate" | "execute" | "route" | "gate";
  }[];
  taskId: string;
  timeoutMs: number;
};
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L37)

###### approvalRequired

```ts
approvalRequired: boolean;
```

###### estimatedCost

```ts
estimatedCost: {
  estimatedCostUsd: number;
  modelCalls: number;
  totalTokensIn: number;
  totalTokensOut: number;
} = CostEstimateSchema;
```

###### estimatedCost.estimatedCostUsd

```ts
estimatedCostUsd: number;
```

###### estimatedCost.modelCalls

```ts
modelCalls: number;
```

###### estimatedCost.totalTokensIn

```ts
totalTokensIn: number;
```

###### estimatedCost.totalTokensOut

```ts
totalTokensOut: number;
```

###### maxIterations

```ts
maxIterations: number;
```

###### policyGates

```ts
policyGates: {
  afterStage: string;
  beforeStage: string;
  id: string;
  onFail: "warn" | "block" | "escalate";
  rules: string[];
}[];
```

###### stages

```ts
stages: {
  config: Record<string, unknown>;
  dependencies: string[];
  id: string;
  inputArtifacts: string[];
  maxRetries?: number;
  outputArtifacts: string[];
  pluginId: string;
  preferredCli?: string;
  timeoutMs?: number;
  type: "analyze" | "validate" | "aggregate" | "execute" | "route" | "gate";
}[];
```

###### taskId

```ts
taskId: string;
```

###### timeoutMs

```ts
timeoutMs: number;
```

---

### CorePluginRegistrationResult

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L93)

Result of core plugin registration.

#### Properties

##### errors

```ts
readonly errors: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L96)

##### failed

```ts
readonly failed: number;
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L95)

##### registered

```ts
readonly registered: number;
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L94)

---

### DelegateInputLike

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L109)

Minimal input shape matching DelegateInput. Avoids circular mcp/tools import.

#### Properties

##### billing_mode?

```ts
readonly optional billing_mode?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L113)

##### model_hint?

```ts
readonly optional model_hint?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L112)

##### preferred_capability?

```ts
readonly optional preferred_capability?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L111)

##### task

```ts
readonly task: string;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L110)

---

### DevPipelineOptions

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L202)

Options for pipeline execution.

#### Properties

##### auditLogger?

```ts
readonly optional auditLogger?: IAuditLogger;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:260](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L260)

Durable, hash-chained audit logger (#3710). When supplied (the MCP server
threads its single startup `auditLogger`), the consensus→execute policy gate
ALSO persists each `policy.evaluated` decision to the immutable store —
carrying mode/ruleIds/stageType — so warn-mode soak evidence survives process
exit and feeds the tune/readiness loop. MUST be the server's single instance,
not a competing FileAuditStorage (shared hash chain). When undefined (pure-CLI
path), behavior is unchanged — the in-memory bus emit is the only sink.

##### beliefMemory?

```ts
readonly optional beliefMemory?: IHindsightBeliefMemory;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L221)

Optional BeliefMemory for hindsight updates after plan outcomes (#1720).

##### dryRun?

```ts
readonly optional dryRun?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L206)

When true, stop after plan+vote and return partial result (#1717).

##### mode?

```ts
readonly optional mode?: PipelineMode;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L212)

Pipeline mode (#1704):

- 'autonomous' (default): full pipeline runs internally
- 'harness': stops after decompose, returns tasks for external implementation

##### qualityGate?

```ts
readonly optional qualityGate?: QualityGateMode;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L219)

Local pre-ship quality-gate mode (#3356). Default 'off' so the pipeline
never wedges repos that lack standard build/test scripts. See
QualityGateMode. Requires `stages.qualityGate` to be supplied;
if the stage is absent the gate is skipped regardless of mode.

##### researchOverride?

```ts
readonly optional researchOverride?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:238](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L238)

Pre-seeded research text (#3643). When set, the RESEARCH stage uses this
instead of calling `stages.research()` — so the IMPLEMENT phase can run the
pipeline plan-only (from the typed RemediationPlan) with NO fresh untrusted
read, while [untrustedInputGuard](#untrustedinputguard) still fail-closes any code path that
forgets to seed it.

##### sessionId?

```ts
readonly optional sessionId?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L204)

Session ID for checkpoint/resume. Omit for no persistence.

##### trustTier?

```ts
readonly optional trustTier?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L250)

Content-provenance trust tier ('1'–'4') threaded into the consensus→execute
policy snapshot (#3712). Trust here is about the PROVENANCE of the content
that reached this run (the goal/research), not the caller's identity. The MCP
`run_dev_pipeline` handler and the `run` entry point thread the caller's real
`RequestContext.trustTier`; the auto-remediation IMPLEMENT path may pass `'1'`
only because #3643's typed RemediationPlan + CapabilityLedger confine
untrusted input upstream. **When undefined the seam behaves as before
(#3704): the engine defaults the missing tier to untrusted (4), fail-closed.**
Absence anywhere = untrusted; never infer a trusted tier from missing context.

##### untrustedInputGuard?

```ts
readonly optional untrustedInputGuard?: () => void;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L230)

Fail-closed guard invoked at the RESEARCH stage — the untrusted-read
chokepoint (#3643). The auto-remediation enforce path (#3618) wires this to
`CapabilityLedger.assertCapability('untrusted-input')`, so running the
untrusted research stage inside the write+secrets IMPLEMENT phase throws
(Rule-of-Two). Not called when [researchOverride](#researchoverride) is set (no untrusted
read happens). Default: undefined (no guard — normal pipeline behavior).

###### Returns

`void`

---

### DevPipelineResult

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L132)

Overall pipeline result.

#### Properties

##### completed

```ts
readonly completed: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L133)

##### plan

```ts
readonly plan: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L134)

##### qaIterations

```ts
readonly qaIterations: number;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L137)

##### securityPassed

```ts
readonly securityPassed: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L138)

##### tasks

```ts
readonly tasks: readonly PipelineTask[];
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L135)

##### voteIterations

```ts
readonly voteIterations: number;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L136)

---

### DevPipelineStages

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L146)

Pluggable stage implementations — inject real or mock agents.

#### Methods

##### decompose()

```ts
decompose(plan): Promise<PipelineTask[]>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L163)

PM decomposes approved plan into tasks.

###### Parameters

###### plan

`string`

###### Returns

`Promise`\<[`PipelineTask`](#pipelinetask)[]\>

##### implement()

```ts
implement(task): Promise<string>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L165)

Code expert implements a task. Returns the work product.

###### Parameters

###### task

[`PipelineTask`](#pipelinetask)

###### Returns

`Promise`\<`string`\>

##### plan()

```ts
plan(
   task,
   research,
priorFeedback?): Promise<string>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L154)

Architect creates a plan from research + task.

###### Parameters

###### task

`string`

###### research

`string`

###### priorFeedback?

`string`

###### Returns

`Promise`\<`string`\>

##### qaReview()

```ts
qaReview(task, implementation): Promise<QaReviewResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L167)

QA expert reviews implementation.

###### Parameters

###### task

[`PipelineTask`](#pipelinetask)

###### implementation

`string`

###### Returns

`Promise`\<[`QaReviewResult`](#qareviewresult)\>

##### qualityGate()?

```ts
optional qualityGate(): Promise<{
  feedback: string;
  passed: boolean;
}>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L175)

Local QA quality gate (typecheck/lint/tests/build) run before ship (#3356).
Optional: pipelines that don't supply it simply skip the gate. Returns
`passed` plus actionable `feedback` from the underlying `runQualityGate`
engine. Whether a red gate fails the phase is governed by the
`qualityGate` mode in [DevPipelineOptions](#devpipelineoptions), not this method.

###### Returns

`Promise`\<\{
`feedback`: `string`;
`passed`: `boolean`;
\}\>

##### research()

```ts
research(task): Promise<ResearchContext>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L152)

Research expert gathers context for the task. Returns the full
ResearchContext (#3234 seam 0): `.text` feeds plan/vote as before,
`.metadata` is attached to decomposed tasks for routing-experience enrichment.

###### Parameters

###### task

`string`

###### Returns

`Promise`\<`ResearchContext`\>

##### securityScan()

```ts
securityScan(): Promise<{
  feedback: string;
  passed: boolean;
}>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L177)

Security scan. Returns true if passed.

###### Returns

`Promise`\<\{
`feedback`: `string`;
`passed`: `boolean`;
\}\>

##### vote()

```ts
vote(plan, research): Promise<VoteResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L161)

Consensus vote on the plan. Returns approval + feedback. `research` is the
research-stage context, surfaced to voters so they can weigh research
maturity (#3258) — appended to the proposal as informational, untrusted
text (never as instructions).

###### Parameters

###### plan

`string`

###### research

`string`

###### Returns

`Promise`\<[`VoteResult`](#voteresult)\>

---

### EventBusBridgeOptions

Defined in: [packages/nexus-agents/src/pipeline/event-bus-bridge.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus-bridge.ts#L23)

Options for the EventBus bridge.

#### Properties

##### source

```ts
readonly source: IEventBus;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus-bridge.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus-bridge.ts#L25)

V2 pipeline EventBus to subscribe to.

##### topicPrefix?

```ts
readonly optional topicPrefix?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus-bridge.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus-bridge.ts#L27)

Optional topic prefix for forwarded events. Defaults to 'pipeline'.

---

### EventBusOptions

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L29)

Options for EventBus behavior.

#### Properties

##### maxBufferSize?

```ts
readonly optional maxBufferSize?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus.ts#L30)

---

### EventFilter

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:279](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L279)

Filter for subscribing to or querying events.

#### Properties

##### executionId?

```ts
readonly optional executionId?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:282](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L282)

##### since?

```ts
readonly optional since?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:283](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L283)

##### taskId?

```ts
readonly optional taskId?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:281](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L281)

##### type?

```ts
readonly optional type?:
  | "task.created"
  | "task.status_changed"
  | "task.completed"
  | "task.failed"
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.checkpoint"
  | "stage.started"
  | "stage.completed"
  | "stage.failed"
  | "stage.retrying"
  | "policy.evaluated"
  | "artifact.created"
  | "model.called"
  | "routing.decision"
  | "tool.invoked"
  | "tool.completed"
  | "wave.started"
  | "wave.completed"
  | "signal.fitness_declined"
  | "signal.swarm_unhealthy"
  | "signal.vote_rejected"
  | readonly (
  | "task.created"
  | "task.status_changed"
  | "task.completed"
  | "task.failed"
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.checkpoint"
  | "stage.started"
  | "stage.completed"
  | "stage.failed"
  | "stage.retrying"
  | "policy.evaluated"
  | "artifact.created"
  | "model.called"
  | "routing.decision"
  | "tool.invoked"
  | "tool.completed"
  | "wave.started"
  | "wave.completed"
  | "signal.fitness_declined"
  | "signal.swarm_unhealthy"
  | "signal.vote_rejected")[];
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:280](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L280)

---

### ExpertBridgeResult

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L37)

Result of an expert execution.

#### Properties

##### cli?

```ts
readonly optional cli?: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L50)

CLI that actually executed the task, resolved from the underlying
`CliResponse.model` via `getCliForModelId`. Undefined when the bridge
failed before dispatch (no adapters / circuit-open / rate-limit cap).
Callers writing to OutcomeStore should use this rather than hardcoding
a cli — see #2823 (#1154 regression).

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L41)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L42)

##### expertType

```ts
readonly expertType: BuiltInExpertType;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L40)

##### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L65)

Concrete model id the underlying adapter reported (`CliResponse.model`),
when present (#3387). Distinct from [cli](#cli) (the slot): one CLI can run
several models. Undefined when the adapter didn't report a model or the
bridge failed before dispatch. Required to emit a `model.called` event.

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L38)

##### text

```ts
readonly text: string;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L39)

##### tokensIn?

```ts
readonly optional tokensIn?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L72)

Input/output token split from the adapter's `CliResponse.usage` (#3387),
when reported. Best-effort like [tokensUsed](#tokensused); both undefined together
when no usage was available. `tokensIn + tokensOut` reconciles with
`tokensUsed` (single source of truth — both derive from the same record).

##### tokensOut?

```ts
readonly optional tokensOut?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L73)

##### tokensUsed?

```ts
readonly optional tokensUsed?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L58)

Total tokens (input + output) the underlying CLI/adapter reported for this
call, when available (#3396). Best-effort: `CliResponse.usage` is optional
— CLI-subprocess paths whose `extractUsage` returns null leave this
undefined. Consumers (budget enforcement #3395, model.called attribution
#3387, routing-experience metrics) must tolerate `undefined`.

---

### GraphPipelineOptions

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L27)

Options for graph-based pipeline execution.

#### Extended by

- [`AdaptiveOrchestratorOptions`](#adaptiveorchestratoroptions)

#### Properties

##### dryRun?

```ts
readonly optional dryRun?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L29)

When true, stop after the dryRunStopAfter stage.

##### maxSteps?

```ts
readonly optional maxSteps?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L31)

Maximum graph execution steps (default: 20).

---

### GraphPipelineResult

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L35)

Result of a graph-based pipeline execution.

#### Extended by

- [`AdaptiveOrchestratorResult`](#adaptiveorchestratorresult)

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L39)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L41)

##### finalState

```ts
readonly finalState: Readonly<Record<string, unknown>>;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L40)

##### stepsExecuted

```ts
readonly stepsExecuted: number;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L38)

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L36)

##### templateId

```ts
readonly templateId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L37)

---

### IArtifactStore

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L108)

Artifact store interface.

#### Properties

##### size

```ts
readonly size: number;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L113)

#### Methods

##### get()

```ts
get(ref): Artifact | undefined;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L110)

###### Parameters

###### ref

###### id

`string` = `...`

###### type

\| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"` = `...`

###### Returns

[`Artifact`](#artifact) \| `undefined`

##### provenance()

```ts
provenance(ref): readonly ProvenanceEntry[];
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L112)

###### Parameters

###### ref

###### id

`string` = `...`

###### type

\| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"` = `...`

###### Returns

readonly [`ProvenanceEntry`](#provenanceentry)[]

##### put()

```ts
put(artifact): {
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
};
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L109)

###### Parameters

###### artifact

[`Artifact`](#artifact)

###### Returns

```ts
{
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
}
```

###### id

```ts
id: string;
```

###### type

```ts
type:
  | "code"
  | "plan"
  | "test"
  | "review"
  | "vote"
  | "analysis"
  | "spec"
  | "report";
```

##### query()

```ts
query(filter): readonly {
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
}[];
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L111)

###### Parameters

###### filter

[`ArtifactFilter`](#artifactfilter)

###### Returns

readonly \{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[]

---

### IEventBus

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:296](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L296)

Event bus interface — fire-and-forget event emission
with typed subscriptions and bounded query.

#### Properties

##### bufferSize

```ts
readonly bufferSize: number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:310](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L310)

Current buffer size.

##### totalEmitted

```ts
readonly totalEmitted: number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:307](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L307)

Total events emitted (including evicted).

#### Methods

##### emit()

```ts
emit(event): void;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:298](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L298)

Emit an event. Handlers must not throw.

###### Parameters

###### event

[`PipelineEvent`](#pipelineevent)

###### Returns

`void`

##### query()

```ts
query(filter, limit?): readonly PipelineEvent[];
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L304)

Query recent events (bounded buffer).

###### Parameters

###### filter

[`EventFilter`](#eventfilter)

###### limit?

`number`

###### Returns

readonly [`PipelineEvent`](#pipelineevent)[]

##### subscribe()

```ts
subscribe(filter, handler): Unsubscribe;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:301](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L301)

Subscribe to events matching filter. Returns unsubscribe function.

###### Parameters

###### filter

[`EventFilter`](#eventfilter)

###### handler

[`EventHandler`](#eventhandler)

###### Returns

[`Unsubscribe`](#unsubscribe)

---

### IPipelineStage

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L47)

A pipeline stage that can be compiled into a graph node.

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L49)

Unique stage identifier (used as graph node ID).

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L51)

Human-readable stage name.

#### Methods

##### execute()

```ts
execute(context): Promise<StageOutput>;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L53)

Execute the stage.

###### Parameters

###### context

[`PipelineContext`](#pipelinecontext)

###### Returns

`Promise`\<[`StageOutput`](#stageoutput)\>

---

### IPluginRegistry

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L141)

Plugin registry — manages plugin lifecycle and resolution.

Registry is frozen after startup — no runtime registration.

#### Properties

##### frozen

```ts
readonly frozen: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L161)

Whether the registry is frozen.

#### Methods

##### freeze()

```ts
freeze(): void;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L158)

Freeze the registry — no further registrations allowed.

###### Returns

`void`

##### isEnabled()

```ts
isEnabled(pluginId): boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L155)

Check if a plugin is registered and enabled.

###### Parameters

###### pluginId

`string`

###### Returns

`boolean`

##### listEnabled()

```ts
listEnabled(): readonly {
  description: string;
  experimental: boolean;
  id: string;
  requiredCapabilities: string[];
  stages: ("analyze" | "validate" | "aggregate" | "execute" | "route" | "gate")[];
  trustLevel: "external" | "standard" | "experimental" | "core";
  version: string;
}[];
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L152)

List all enabled plugins with their manifests.

###### Returns

readonly \{
`description`: `string`;
`experimental`: `boolean`;
`id`: `string`;
`requiredCapabilities`: `string`[];
`stages`: (`"analyze"` \| `"validate"` \| `"aggregate"` \| `"execute"` \| `"route"` \| `"gate"`)[];
`trustLevel`: `"external"` \| `"standard"` \| `"experimental"` \| `"core"`;
`version`: `string`;
\}[]

##### register()

```ts
register(plugin): Result<void, RegistrationError>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L146)

Register a plugin. Validates manifest and config.
Returns error if plugin ID conflicts or capabilities missing.

###### Parameters

###### plugin

[`PipelinePlugin`](#pipelineplugin)

###### Returns

[`Result`](../core.md#result)\<`void`, [`RegistrationError`](#registrationerror)\>

##### resolve()

```ts
resolve(pluginId): PipelinePlugin | undefined;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L149)

Resolve a plugin by ID. Returns undefined if not registered or disabled.

###### Parameters

###### pluginId

`string`

###### Returns

[`PipelinePlugin`](#pipelineplugin) \| `undefined`

---

### IPolicyEngine

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L72)

Policy engine interface.

#### Methods

##### evaluate()

```ts
evaluate(gate, context): PolicyDecision;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L73)

###### Parameters

###### gate

###### afterStage

`string` = `...`

###### beforeStage

`string` = `...`

###### id

`string` = `...`

###### onFail

`"warn"` \| `"block"` \| `"escalate"` = `...`

###### rules

`string`[] = `...`

###### context

[`PolicyContext`](#policycontext)

###### Returns

[`PolicyDecision`](#policydecision)

##### listRules()

```ts
listRules(): readonly PolicyRule[];
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L75)

###### Returns

readonly [`PolicyRule`](#policyrule)[]

##### registerRule()

```ts
registerRule(rule): void;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L74)

###### Parameters

###### rule

[`PolicyRule`](#policyrule)

###### Returns

`void`

---

### IterativeConsensusConfig

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L23)

Configuration for an iterative consensus vote.

#### Properties

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L35)

Logger instance.

##### maxIterations?

```ts
readonly optional maxIterations?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L25)

Maximum plan→vote iterations (default: 3).

##### maxProposalLength?

```ts
readonly optional maxProposalLength?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L33)

Max proposal length sent to voters (default: 4000).

##### pipelinePrefix?

```ts
readonly optional pipelinePrefix?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L37)

Pipeline prefix for observability events.

##### quickMode?

```ts
readonly optional quickMode?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L29)

Use quick mode (3 agents instead of 6).

##### simulateVotes?

```ts
readonly optional simulateVotes?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L27)

Use simulated votes (for testing).

##### strategy?

```ts
readonly optional strategy?: VotingStrategy;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L31)

Voting strategy (default: 'higher_order').

---

### IterativeConsensusResult

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L41)

Result of the iterative consensus process.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L44)

##### iterations

```ts
readonly iterations: number;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L43)

##### vote

```ts
readonly vote: VoteResult;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L42)

---

### OrchestrateInputLike

Defined in: [packages/nexus-agents/src/pipeline/v2-orchestrate.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-orchestrate.ts#L29)

Minimal shape of orchestrate input (avoids circular import).

#### Properties

##### context?

```ts
readonly optional context?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-orchestrate.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-orchestrate.ts#L31)

##### maxIterations?

```ts
readonly optional maxIterations?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-orchestrate.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-orchestrate.ts#L32)

##### task

```ts
readonly task: string;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-orchestrate.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-orchestrate.ts#L30)

---

### PipelineBridgeResult

Defined in: [packages/nexus-agents/src/pipeline/event-bus-bridge.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus-bridge.ts#L35)

Result of bridge initialization.

#### Properties

##### dispose

```ts
readonly dispose: Unsubscribe;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus-bridge.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus-bridge.ts#L39)

Unsubscribe from the V2 bus (cleanup).

##### forwarded

```ts
readonly forwarded: () => number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus-bridge.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus-bridge.ts#L37)

Number of events forwarded so far.

###### Returns

`number`

---

### PipelineCheckpointState

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L54)

Partial pipeline state loaded from checkpoints.

#### Properties

##### implementedTasks?

```ts
readonly optional implementedTasks?: readonly PipelineTask[];
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L62)

##### lastCompletedStage?

```ts
readonly optional lastCompletedStage?: CheckpointPipelineStage;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L64)

##### plan?

```ts
readonly optional plan?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L56)

##### research?

```ts
readonly optional research?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L55)

##### securityPassed?

```ts
readonly optional securityPassed?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L63)

##### tasks?

```ts
readonly optional tasks?: readonly PipelineTask[];
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L61)

##### voteCaveats?

```ts
readonly optional voteCaveats?: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L60)

##### voteConditional?

```ts
readonly optional voteConditional?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L58)

##### voteConditions?

```ts
readonly optional voteConditions?: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L59)

##### voteIterations?

```ts
readonly optional voteIterations?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L57)

---

### PipelineContext

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L15)

Read-only pipeline context passed to every stage.

#### Properties

##### executionId

```ts
readonly executionId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L17)

Unique pipeline execution ID.

##### state

```ts
readonly state: Readonly<Record<string, unknown>>;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L29)

Accumulated state from prior stages. The only cross-stage handoff
channel — `sharedMemory` (the #1764 SharedMemoryStore) was removed
in #2937 after being write-only since introduction. If you need
structured cross-stage data, add a well-known key to
`PIPELINE_STATE_KEYS` and write/read through `state`.

##### task

```ts
readonly task: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L19)

The original task/prompt that started the pipeline.

##### templateId

```ts
readonly templateId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L21)

Pipeline template being executed.

---

### PipelineDeps

Defined in: [packages/nexus-agents/src/pipeline/pipeline-deps.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-deps.ts#L29)

Injectable pipeline dependencies. Every field is optional; an unset field
falls back to its documented process-global default at resolve time.

#### Properties

##### pluginRegistry?

```ts
readonly optional pluginRegistry?: IPluginRegistry;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-deps.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-deps.ts#L34)

Plugin registry for resolving stage handlers. Defaults to the global
pipeline registry (`getPipelinePluginRegistry()`) when unset.

---

### PipelineExecuteOptions

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L77)

Pipeline execution options.

#### Properties

##### continueOnFailure?

```ts
readonly optional continueOnFailure?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L83)

When true, continue executing independent steps after a failure.

##### eventBus?

```ts
readonly optional eventBus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L90)

EventBus for trace persistence. When provided, creates a TraceWriter.

##### maxSteps?

```ts
readonly optional maxSteps?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L79)

##### onStageComplete?

```ts
readonly optional onStageComplete?: (stageId) => void;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L81)

###### Parameters

###### stageId

`string`

###### Returns

`void`

##### priorResults?

```ts
readonly optional priorResults?: ReadonlyMap<string, NodeResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L88)

Prior NodeResults to replay (#3534) — succeeded nodes are reused instead of
re-executed. Set by `retryFailed` so a retry re-runs only the failed nodes.

##### runsDir?

```ts
readonly optional runsDir?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L96)

Override base directory for trace output. Default: `getDefaultRunsDir()`,
i.e. `nexusDataPath('runs')` — per-repo aware. NOT `getNexusDataDir()/runs`,
which bypassed per-repo routing (#2889).

##### signal?

```ts
readonly optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L78)

##### timeout?

```ts
readonly optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L80)

---

### PipelineGraphResult

Defined in: [packages/nexus-agents/src/pipeline/pipeline-graph.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-graph.ts#L24)

Result of compiling a pipeline template into a graph.

#### Properties

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-graph.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-graph.ts#L27)

##### graph?

```ts
readonly optional graph?: CompiledGraph;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-graph.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-graph.ts#L26)

##### ok

```ts
readonly ok: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-graph.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-graph.ts#L25)

---

### PipelineMetrics

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L117)

Metrics from V2 pipeline execution.

#### Properties

##### compiled

```ts
readonly compiled: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L118)

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L121)

##### executed

```ts
readonly executed: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L119)

##### policyBlocked?

```ts
readonly optional policyBlocked?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L122)

##### policyViolations?

```ts
readonly optional policyViolations?: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L123)

##### stepsExecuted

```ts
readonly stepsExecuted: number;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L120)

---

### PipelinePlugin

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L86)

Plugin interface — every stage implementation must conform.

Plugins are the ONLY way stage logic runs.
They communicate via ArtifactStore and EventBus (injected via context).

#### Properties

##### manifest

```ts
readonly manifest: {
  description: string;
  experimental: boolean;
  id: string;
  requiredCapabilities: string[];
  stages: ("analyze" | "validate" | "aggregate" | "execute" | "route" | "gate")[];
  trustLevel: "external" | "standard" | "experimental" | "core";
  version: string;
};
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L88)

Manifest declaring this plugin's identity and capabilities.

###### description

```ts
description: string;
```

###### experimental

```ts
experimental: boolean;
```

###### id

```ts
id: string;
```

###### requiredCapabilities

```ts
requiredCapabilities: string[];
```

###### stages

```ts
stages: ("analyze" | "validate" | "aggregate" | "execute" | "route" | "gate")[];
```

###### trustLevel

```ts
trustLevel: 'external' | 'standard' | 'experimental' | 'core';
```

###### version

```ts
version: string;
```

#### Methods

##### execute()

```ts
execute(stage, context): Promise<{
  error?: string;
  metadata: Record<string, unknown>;
  outputArtifacts: {
     id: string;
     type:   | "code"
        | "plan"
        | "test"
        | "review"
        | "vote"
        | "analysis"
        | "spec"
        | "report";
  }[];
  success: boolean;
}>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L96)

Execute a pipeline stage.

###### Parameters

###### stage

The stage specification from the PlanContract

###### config

`Record`\<`string`, `unknown`\> = `...`

###### dependencies

`string`[] = `...`

###### id

`string` = `...`

###### inputArtifacts

`string`[] = `...`

###### maxRetries?

`number` = `...`

###### outputArtifacts

`string`[] = `...`

###### pluginId

`string` = `...`

###### preferredCli?

`string` = `...`

###### timeoutMs?

`number` = `...`

###### type

`"analyze"` \| `"validate"` \| `"aggregate"` \| `"execute"` \| `"route"` \| `"gate"` = `...`

###### context

[`StageContext`](#stagecontext)

Runtime context with abort signal and task

###### Returns

`Promise`\<\{
`error?`: `string`;
`metadata`: `Record`\<`string`, `unknown`\>;
`outputArtifacts`: \{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[];
`success`: `boolean`;
\}\>

Stage result with output artifacts

##### onLoad()?

```ts
optional onLoad(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L105)

Optional lifecycle hook — called when plugin is loaded.

###### Returns

`Promise`\<`void`\>

##### onUnload()?

```ts
optional onUnload(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L108)

Optional lifecycle hook — called when plugin is unloaded.

###### Returns

`Promise`\<`void`\>

##### validateConfig()

```ts
validateConfig(config): Result<void, PluginValidationError>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L102)

Validate plugin configuration at registration time.
Called once when the plugin is registered, not per-execution.

###### Parameters

###### config

`unknown`

###### Returns

[`Result`](../core.md#result)\<`void`, [`PluginValidationError`](#pluginvalidationerror)\>

---

### PipelinePolicyViolation

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L59)

A single policy violation.

#### Properties

##### escalateTo?

```ts
readonly optional escalateTo?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L62)

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L61)

##### ruleId

```ts
readonly ruleId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L60)

---

### PipelineResult

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L41)

Pipeline execution result.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L44)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L45)

##### nodeResults?

```ts
readonly optional nodeResults?: readonly NodeResult[];
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L53)

Raw per-node results from the run (#3534). Retained so `retryFailed` can
replay prior successes and re-run only the failed nodes; carries the
`isRetryable` signal used to gate the retry.

##### stepResults?

```ts
readonly optional stepResults?: readonly StepOutcome[];
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L47)

Per-step breakdown when continueOnFailure is enabled.

##### stepsExecuted

```ts
readonly stepsExecuted: number;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L43)

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-runner.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-runner.ts#L42)

---

### PipelineTask

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L65)

A task decomposed by the PM, potentially with conditional approval requirements.

#### Properties

##### assignedTo

```ts
readonly assignedTo: PipelineRole;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L69)

##### caveats?

```ts
readonly optional caveats?: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L77)

Caveats/warnings associated with the task (from conditional_go vote).

##### conditions?

```ts
readonly optional conditions?: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L75)

Conditions required for task completion (from conditional_go vote).

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L68)

##### feedback?

```ts
readonly optional feedback?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L71)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L66)

##### implementation?

```ts
readonly optional implementation?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L73)

Implementation text from the code expert (surfaced for harness use).

##### researchMaturity?

```ts
readonly optional researchMaturity?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L83)

#3234: deterministic research-maturity `[0,1]` of the run that produced this
task, attached after decompose. RECORDED on the routing outcome and measured
(the gated live-routing use is #3815). Absent → treated as no-research (0).

##### status

```ts
readonly status: "rejected" | "done" | "pending" | "review" | "in_progress";
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L70)

##### title

```ts
readonly title: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L67)

---

### PipelineTemplate

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L71)

A declarative pipeline template defining stages and their connections.

#### Properties

##### dryRunStopAfter?

```ts
readonly optional dryRunStopAfter?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L81)

Stage IDs that can be skipped via dryRun.

##### edges?

```ts
readonly optional edges?: readonly PipelineEdge[];
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L79)

Edge overrides (for non-linear flows like vote→plan feedback loops).

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L73)

Unique template identifier.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L75)

Human-readable name.

##### stages

```ts
readonly stages: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L77)

Ordered stage IDs (for simple linear pipelines).

---

### PlanCompileOptions

Defined in: [packages/nexus-agents/src/pipeline/plan-compiler.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plan-compiler.ts#L27)

Options for plan compilation.

#### Properties

##### pluginRegistry?

```ts
readonly optional pluginRegistry?: IPluginRegistry;
```

Defined in: [packages/nexus-agents/src/pipeline/plan-compiler.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plan-compiler.ts#L30)

Plugin registry for resolving stage handlers. When provided, stages with
a registered pluginId will use the plugin's execute() method.

##### policyEnforcement?

```ts
readonly optional policyEnforcement?: GatePolicyEnforcement;
```

Defined in: [packages/nexus-agents/src/pipeline/plan-compiler.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plan-compiler.ts#L37)

Policy enforcement for gate nodes (#3177). When provided, each policy gate
node evaluates `evaluatePipelinePolicy` at runtime — denying (in BLOCK
mode) by throwing `PolicyBlockedError`, which halts the pipeline. When
absent, gate nodes remain no-op passes (back-compat).

---

### PluginRegistryOptions

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L28)

Options for controlling plugin registry behavior.

#### Properties

##### experimentalAllow?

```ts
readonly optional experimentalAllow?: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L32)

Explicit allowlist of experimental plugin IDs.

##### experimentalEnabled?

```ts
readonly optional experimentalEnabled?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-registry.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-registry.ts#L30)

Allow experimental plugins to be registered.

---

### PluginValidationError

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L116)

Validation error from plugin config validation.

#### Properties

##### field?

```ts
readonly optional field?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L118)

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L117)

---

### PolicyContext

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L57)

Context provided to policy rules for evaluation.

#### Properties

##### pipelineState

```ts
readonly pipelineState: PipelineStateSnapshot;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L61)

##### stageId

```ts
readonly stageId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L59)

##### stageType

```ts
readonly stageType: string;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L60)

##### taskId

```ts
readonly taskId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L58)

---

### PolicyEvalResult

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L52)

Result of a policy evaluation at a stage boundary.

#### Properties

##### allowed

```ts
readonly allowed: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L53)

##### mode

```ts
readonly mode: PipelinePolicyMode;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L55)

##### violations

```ts
readonly violations: readonly PipelinePolicyViolation[];
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L54)

---

### PolicyEvaluatorOptions

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L36)

Options for PolicyEvaluator.

#### Properties

##### auditTrail?

```ts
readonly optional auditTrail?: AuditTrail;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L48)

Optional DURABLE audit trail (#3710). When present, each violation is ALSO
appended to the hash-chained store (dual-emit) carrying mode/ruleIds/
stageType — so soak(warn)-vs-enforce(block) evidence survives process exit
for the tune/readiness loop. The in-memory `eventBus` emit is unchanged
(back-compat). When absent, behavior is byte-identical to before.

##### engine

```ts
readonly engine: IPolicyEngine;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L38)

Only `listRules()` is consumed, so the interface — not the class — suffices.

##### eventBus?

```ts
readonly optional eventBus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L39)

##### mode?

```ts
readonly optional mode?: PipelinePolicyMode;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L40)

---

### PolicyRule

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L65)

A policy rule with priority-ordered evaluation.

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L66)

##### priority

```ts
readonly priority: number;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L67)

#### Methods

##### evaluate()

```ts
evaluate(context): PolicyDecision;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L68)

###### Parameters

###### context

[`PolicyContext`](#policycontext)

###### Returns

[`PolicyDecision`](#policydecision)

---

### ProvenanceEntry

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L41)

Provenance entry for artifact traceability.

#### Properties

##### artifactId

```ts
readonly artifactId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L42)

##### inputArtifacts

```ts
readonly inputArtifacts: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L45)

##### plugin

```ts
readonly plugin: string;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L43)

##### timestamp

```ts
readonly timestamp: number;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L44)

---

### QaReviewResult

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L125)

QA review result.

#### Properties

##### feedback

```ts
readonly feedback: string;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L127)

##### issues

```ts
readonly issues: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L128)

##### verdict

```ts
readonly verdict: "reject" | "pass" | "needs_work";
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L126)

---

### ResearchTriggerConfig

Defined in: [packages/nexus-agents/src/pipeline/research-trigger.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/research-trigger.ts#L23)

Configuration for research trigger behavior.

#### Properties

##### existingTaskIds?

```ts
readonly optional existingTaskIds?: ReadonlySet<string>;
```

Defined in: [packages/nexus-agents/src/pipeline/research-trigger.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/research-trigger.ts#L31)

Known task IDs to skip (dedup).

##### maxTriggers?

```ts
readonly optional maxTriggers?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/research-trigger.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/research-trigger.ts#L27)

Max tasks per invocation. Default: 3

##### qualityThreshold?

```ts
readonly optional qualityThreshold?: number;
```

Defined in: [packages/nexus-agents/src/pipeline/research-trigger.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/research-trigger.ts#L25)

Minimum quality score to trigger (0-10). Default: 7

##### topic?

```ts
readonly optional topic?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/research-trigger.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/research-trigger.ts#L29)

Topic filter for research_discover.

---

### ResolvedPipelineDeps

Defined in: [packages/nexus-agents/src/pipeline/pipeline-deps.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-deps.ts#L38)

Fully-resolved pipeline dependencies — every field concrete.

#### Properties

##### pluginRegistry

```ts
readonly pluginRegistry: IPluginRegistry;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-deps.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-deps.ts#L39)

---

### StageCompletedOptions

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L26)

Options for emitting a stage completed event.

#### Properties

##### bus?

```ts
readonly optional bus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L27)

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L30)

##### executionId

```ts
readonly executionId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L28)

##### stageId

```ts
readonly stageId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L29)

##### success?

```ts
readonly optional success?: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L31)

---

### StageContext

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L71)

Runtime context passed to plugins during stage execution.
Plugins communicate only via artifacts and events.

#### Properties

##### config

```ts
readonly config: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L77)

Stage configuration from the plan.

##### signal

```ts
readonly signal: AbortSignal;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L73)

Abort signal for cancellation.

##### task

```ts
readonly task: Readonly<TaskContract>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L75)

Task contract for reference (read-only).

---

### StageFailedOptions

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L35)

Options for emitting a stage failed event.

#### Properties

##### bus?

```ts
readonly optional bus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L36)

##### error

```ts
readonly error: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L39)

##### executionId

```ts
readonly executionId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L37)

##### stageId

```ts
readonly stageId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L38)

---

### StageOutput

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L33)

Result of executing a single pipeline stage.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L39)

Duration in milliseconds.

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L43)

Error message if failed.

##### stateKey

```ts
readonly stateKey: string;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L35)

The key to store this stage's output under in pipeline state.

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L41)

Whether the stage succeeded.

##### value

```ts
readonly value: unknown;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L37)

The output value (stored in GraphState).

---

### StageStartedOptions

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L18)

Options for emitting a stage started event.

#### Properties

##### bus?

```ts
readonly optional bus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L19)

##### executionId

```ts
readonly executionId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L20)

##### pluginId?

```ts
readonly optional pluginId?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L22)

##### stageId

```ts
readonly stageId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L21)

---

### TaskClassification

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L46)

Classification of a task for template routing.

#### Properties

##### complexity

```ts
readonly complexity: "simple" | "complex" | "moderate";
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L48)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L49)

##### keywords

```ts
readonly keywords: readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L50)

##### pipelineType

```ts
readonly pipelineType: PipelineType;
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L47)

---

### ToolCompletedEvent

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L216)

#### Extends

- `BaseEvent`

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L220)

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:222](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L222)

##### invocationId

```ts
readonly invocationId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L219)

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L221)

##### timestamp

```ts
readonly timestamp: number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L54)

###### Inherited from

```ts
BaseEvent.timestamp;
```

##### toolName

```ts
readonly toolName: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:218](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L218)

##### type

```ts
readonly type: "tool.completed";
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L217)

---

### ToolInvokedEvent

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:210](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L210)

MCP tool lifecycle events (Issue #1186).

#### Extends

- `BaseEvent`

#### Properties

##### invocationId

```ts
readonly invocationId: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:213](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L213)

##### timestamp

```ts
readonly timestamp: number;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L54)

###### Inherited from

```ts
BaseEvent.timestamp;
```

##### toolName

```ts
readonly toolName: string;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L212)

##### type

```ts
readonly type: "tool.invoked";
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L211)

---

### V2Config

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L19)

Resolved V2 configuration.

#### Properties

##### aorchestraEnabled

```ts
readonly aorchestraEnabled: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L29)

Whether AOrchestra dynamic agent planning is enabled (Issue #935).

##### delegateEnabled

```ts
readonly delegateEnabled: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L23)

Whether delegate_to_model uses V2 pipeline.

##### dispatchEnabled

```ts
readonly dispatchEnabled: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L31)

Whether AOrchestra worker dispatch is enabled (Issue #1321).

##### mode

```ts
readonly mode: V2Mode;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L21)

Overall V2 mode.

##### orchestrateEnabled

```ts
readonly orchestrateEnabled: boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L25)

Whether orchestrate uses V2 pipeline.

##### policyMode

```ts
readonly policyMode: "warn" | "off" | "block";
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L27)

Policy enforcement mode.

## Type Aliases

### ArtifactRef

```ts
type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L173)

---

### ArtifactType

```ts
type ArtifactType = (typeof ARTIFACT_TYPES)[number];
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L60)

---

### CheckpointPipelineStage

```ts
type CheckpointPipelineStage =
  | 'research'
  | 'plan'
  | 'vote'
  | 'decompose'
  | 'implement'
  | 'security';
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L27)

Stages that can be checkpointed.

---

### CostEstimate

```ts
type CostEstimate = z.infer<typeof CostEstimateSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L172)

---

### EventHandler

```ts
type EventHandler = (event) => void;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:287](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L287)

Event handler callback.

#### Parameters

##### event

[`PipelineEvent`](#pipelineevent)

#### Returns

`void`

---

### PipelineEdge

```ts
type PipelineEdge =
  | {
      from: string;
      to: string;
      type: 'fixed';
    }
  | {
      from: string;
      routerKey: string;
      targets: readonly string[];
      type: 'conditional';
    };
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L61)

Edge definition in a pipeline template.

---

### PipelineEvent

```ts
type PipelineEvent =
  | TaskCreatedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | PipelineStartedEvent
  | PipelineCompletedEvent
  | PipelineCheckpointEvent
  | StageStartedEvent
  | StageCompletedEvent
  | StageFailedEvent
  | StageRetryingEvent
  | PolicyEvaluatedEvent
  | ArtifactCreatedEvent
  | ModelCalledEvent
  | RoutingDecisionEvent
  | ToolInvokedEvent
  | ToolCompletedEvent
  | WaveStartedEvent
  | WaveCompletedEvent
  | FitnessDeclinedSignalEvent
  | SwarmUnhealthySignalEvent
  | VoteRejectedSignalEvent;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L250)

Discriminated union of all pipeline events.

---

### PipelineEventType

```ts
type PipelineEventType = (typeof PIPELINE_EVENT_TYPES)[number];
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L46)

---

### PipelineMode

```ts
type PipelineMode = 'autonomous' | 'harness';
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L189)

Pipeline execution mode.

---

### PipelinePolicyMode

```ts
type PipelinePolicyMode = 'off' | 'warn' | 'block';
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L33)

Policy enforcement mode.

---

### PipelineRole

```ts
type PipelineRole = 'researcher' | 'architect' | 'pm' | 'coder' | 'qa' | 'security';
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L62)

Agent roles used in the pipeline.

---

### PipelineStageData

```ts
type PipelineStageData =
  | {
      text: string;
      type: 'research';
    }
  | {
      iterations: number;
      text: string;
      type: 'plan';
    }
  | {
      approved: boolean;
      caveats?: readonly string[];
      conditional: boolean;
      conditions?: readonly string[];
      iterations: number;
      type: 'vote';
    }
  | {
      tasks: readonly PipelineTask[];
      type: 'decompose';
    }
  | {
      tasks: readonly PipelineTask[];
      type: 'implement';
    }
  | {
      passed: boolean;
      type: 'security';
    };
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L38)

Discriminated union of stage data.

---

### PipelineType

```ts
type PipelineType = 'dev' | 'research' | 'audit' | 'greenfield' | 'general';
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L54)

Pipeline type derived from task analysis.

---

### PlanContract

```ts
type PlanContract = z.infer<typeof PlanContractSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L169)

---

### PluginManifest

```ts
type PluginManifest = z.infer<typeof PluginManifestSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L62)

Plugin manifest declaring identity and capabilities.

---

### PluginTrustLevel

```ts
type PluginTrustLevel = (typeof PLUGIN_TRUST_LEVELS)[number];
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L32)

---

### PolicyDecision

```ts
type PolicyDecision =
  | {
      allow: true;
    }
  | {
      allow: false;
      escalateTo?: string;
      reason: string;
    };
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L21)

Decision returned by a policy rule evaluation.

---

### PolicyGateSpec

```ts
type PolicyGateSpec = z.infer<typeof PolicyGateSpecSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L171)

---

### RegistrationError

```ts
type RegistrationError =
  | {
      pluginId: string;
      type: 'duplicate_id';
    }
  | {
      message: string;
      type: 'invalid_manifest';
    }
  | {
      capability: string;
      type: 'missing_capability';
    }
  | {
      message: string;
      type: 'validation_failed';
    }
  | {
      type: 'registry_frozen';
    };
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L122)

Registration error when adding a plugin to the registry.

---

### StageRegistry

```ts
type StageRegistry = ReadonlyMap<string, IPipelineStage>;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-graph.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-graph.ts#L31)

Map of stage ID → stage implementation.

---

### StageResult

```ts
type StageResult = z.infer<typeof StageResultSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L65)

Result of a plugin stage execution.

---

### StageSpec

```ts
type StageSpec = z.infer<typeof StageSpecSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L170)

---

### StageType

```ts
type StageType = (typeof STAGE_TYPES)[number];
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L59)

---

### TaskContract

```ts
type TaskContract = z.infer<typeof TaskContractSchema>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L168)

---

### TaskStatus

```ts
type TaskStatus = (typeof TASK_STATUSES)[number];
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L58)

---

### Unsubscribe

```ts
type Unsubscribe = () => void;
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:290](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L290)

Unsubscribe function returned by subscribe.

#### Returns

`void`

---

### V2Mode

```ts
type V2Mode = 'off' | 'partial' | 'full';
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L16)

V2 umbrella mode.

---

### VoteResult

```ts
type VoteResult =
  | {
      approvalPercentage: number;
      kind: 'approved';
    }
  | {
      approvalPercentage: number;
      feedback: string;
      kind: 'rejected';
    }
  | {
      approvalPercentage: number;
      caveats: readonly string[];
      conditions: readonly string[];
      kind: 'conditional_go';
    };
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L87)

Vote result from consensus — discriminated union with conditional approval support.

## Variables

### ARTIFACT_TYPES

```ts
const ARTIFACT_TYPES: readonly [
  'code',
  'review',
  'plan',
  'test',
  'report',
  'vote',
  'spec',
  'analysis',
];
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L40)

All valid artifact types.

---

### ArtifactRefSchema

```ts
const ArtifactRefSchema: ZodObject<
  {
    id: ZodString;
    type: ZodEnum<{
      analysis: 'analysis';
      code: 'code';
      plan: 'plan';
      report: 'report';
      review: 'review';
      spec: 'spec';
      test: 'test';
      vote: 'vote';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L99)

Reference to an artifact by ID and type.

---

### AUDIT_PIPELINE_TEMPLATE

```ts
const AUDIT_PIPELINE_TEMPLATE: PipelineTemplate;
```

Defined in: [packages/nexus-agents/src/pipeline/templates.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/templates.ts#L29)

Security audit pipeline: analyze → scan → report.

---

### BUILT_IN_RULES

```ts
const BUILT_IN_RULES: readonly PolicyRule[];
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L188)

All built-in policy rules.

---

### CORE_PLUGINS

```ts
const CORE_PLUGINS: readonly PipelinePlugin[];
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L82)

All core plugins in registration order.

---

### CostEstimateSchema

```ts
const CostEstimateSchema: ZodObject<
  {
    estimatedCostUsd: ZodNumber;
    modelCalls: ZodNumber;
    totalTokensIn: ZodNumber;
    totalTokensOut: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L146)

Cost estimate for a pipeline execution plan.

---

### DEV_PIPELINE_TEMPLATE

```ts
const DEV_PIPELINE_TEMPLATE: PipelineTemplate;
```

Defined in: [packages/nexus-agents/src/pipeline/templates.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/templates.ts#L17)

Development pipeline: research → plan → vote → decompose → implement → qa → security.

---

### GENERAL_PIPELINE_TEMPLATE

```ts
const GENERAL_PIPELINE_TEMPLATE: PipelineTemplate;
```

Defined in: [packages/nexus-agents/src/pipeline/templates.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/templates.ts#L65)

General-purpose pipeline for tasks that don't match a specific template.
Includes security gate (fail-safe: unclassified tasks must not bypass security).

---

### PIPELINE_EVENT_TYPES

```ts
const PIPELINE_EVENT_TYPES: readonly [
  'task.created',
  'task.status_changed',
  'task.completed',
  'task.failed',
  'pipeline.started',
  'pipeline.completed',
  'pipeline.checkpoint',
  'stage.started',
  'stage.completed',
  'stage.failed',
  'stage.retrying',
  'policy.evaluated',
  'artifact.created',
  'model.called',
  'routing.decision',
  'tool.invoked',
  'tool.completed',
  'wave.started',
  'wave.completed',
  'signal.fitness_declined',
  'signal.swarm_unhealthy',
  'signal.vote_rejected',
];
```

Defined in: [packages/nexus-agents/src/pipeline/event-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-types.ts#L16)

All valid pipeline event types.

---

### PIPELINE_STATE_KEYS

```ts
const PIPELINE_STATE_KEYS: {
  COMPLETED: 'completed';
  FINDINGS: 'findings';
  IMPLEMENTATIONS: 'implementations';
  PARSED_SPEC: 'parsedSpec';
  PLAN: 'plan';
  QA_ITERATIONS: 'qaIterations';
  RESEARCH: 'research';
  SCAFFOLD_OUTPUT: 'scaffoldOutput';
  SECURITY_PASSED: 'securityPassed';
  TASK: 'task';
  TASKS: 'tasks';
  VOTE_FEEDBACK: 'voteFeedback';
  VOTE_ITERATIONS: 'voteIterations';
  VOTE_RESULT: 'voteResult';
};
```

Defined in: [packages/nexus-agents/src/pipeline/stage-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-types.ts#L89)

Standard state keys used across pipeline templates.

#### Type Declaration

##### COMPLETED

```ts
readonly COMPLETED: "completed" = 'completed';
```

##### FINDINGS

```ts
readonly FINDINGS: "findings" = 'findings';
```

##### IMPLEMENTATIONS

```ts
readonly IMPLEMENTATIONS: "implementations" = 'implementations';
```

##### PARSED_SPEC

```ts
readonly PARSED_SPEC: "parsedSpec" = 'parsedSpec';
```

##### PLAN

```ts
readonly PLAN: "plan" = 'plan';
```

##### QA_ITERATIONS

```ts
readonly QA_ITERATIONS: "qaIterations" = 'qaIterations';
```

##### RESEARCH

```ts
readonly RESEARCH: "research" = 'research';
```

##### SCAFFOLD_OUTPUT

```ts
readonly SCAFFOLD_OUTPUT: "scaffoldOutput" = 'scaffoldOutput';
```

##### SECURITY_PASSED

```ts
readonly SECURITY_PASSED: "securityPassed" = 'securityPassed';
```

##### TASK

```ts
readonly TASK: "task" = 'task';
```

##### TASKS

```ts
readonly TASKS: "tasks" = 'tasks';
```

##### VOTE_FEEDBACK

```ts
readonly VOTE_FEEDBACK: "voteFeedback" = 'voteFeedback';
```

##### VOTE_ITERATIONS

```ts
readonly VOTE_ITERATIONS: "voteIterations" = 'voteIterations';
```

##### VOTE_RESULT

```ts
readonly VOTE_RESULT: "voteResult" = 'voteResult';
```

---

### PIPELINE_TEMPLATES

```ts
const PIPELINE_TEMPLATES: ReadonlyMap<string, PipelineTemplate>;
```

Defined in: [packages/nexus-agents/src/pipeline/templates.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/templates.ts#L77)

All available pipeline templates.

---

### PlanContractSchema

```ts
const PlanContractSchema: ZodObject<
  {
    approvalRequired: ZodBoolean;
    estimatedCost: ZodObject<
      {
        estimatedCostUsd: ZodNumber;
        modelCalls: ZodNumber;
        totalTokensIn: ZodNumber;
        totalTokensOut: ZodNumber;
      },
      $strip
    >;
    maxIterations: ZodNumber;
    policyGates: ZodArray<
      ZodObject<
        {
          afterStage: ZodString;
          beforeStage: ZodString;
          id: ZodString;
          onFail: ZodEnum<{
            block: 'block';
            escalate: 'escalate';
            warn: 'warn';
          }>;
          rules: ZodArray<ZodString>;
        },
        $strip
      >
    >;
    stages: ZodArray<
      ZodObject<
        {
          config: ZodRecord<ZodString, ZodUnknown>;
          dependencies: ZodArray<ZodString>;
          id: ZodString;
          inputArtifacts: ZodArray<ZodString>;
          maxRetries: ZodOptional<ZodNumber>;
          outputArtifacts: ZodArray<ZodString>;
          pluginId: ZodString;
          preferredCli: ZodOptional<ZodString>;
          timeoutMs: ZodOptional<ZodNumber>;
          type: ZodEnum<{
            aggregate: 'aggregate';
            analyze: 'analyze';
            execute: 'execute';
            gate: 'gate';
            route: 'route';
            validate: 'validate';
          }>;
        },
        $strip
      >
    >;
    taskId: ZodString;
    timeoutMs: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L154)

Execution plan contract.

---

### PLUGIN_TRUST_LEVELS

```ts
const PLUGIN_TRUST_LEVELS: readonly ['core', 'standard', 'experimental', 'external'];
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L21)

All valid plugin trust levels.

---

### PluginManifestSchema

```ts
const PluginManifestSchema: ZodObject<
  {
    description: ZodString;
    experimental: ZodBoolean;
    id: ZodString;
    requiredCapabilities: ZodArray<ZodString>;
    stages: ZodArray<
      ZodEnum<{
        aggregate: 'aggregate';
        analyze: 'analyze';
        execute: 'execute';
        gate: 'gate';
        route: 'route';
        validate: 'validate';
      }>
    >;
    trustLevel: ZodEnum<{
      core: 'core';
      experimental: 'experimental';
      external: 'external';
      standard: 'standard';
    }>;
    version: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L39)

Schema for plugin manifests.

---

### PolicyGateSpecSchema

```ts
const PolicyGateSpecSchema: ZodObject<
  {
    afterStage: ZodString;
    beforeStage: ZodString;
    id: ZodString;
    onFail: ZodEnum<{
      block: 'block';
      escalate: 'escalate';
      warn: 'warn';
    }>;
    rules: ZodArray<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L137)

Policy gate inserted between pipeline stages.

---

### STAGE_TYPES

```ts
const STAGE_TYPES: readonly ['analyze', 'route', 'execute', 'validate', 'aggregate', 'gate'];
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L30)

All valid pipeline stage types.

---

### StageResultSchema

```ts
const StageResultSchema: ZodObject<
  {
    error: ZodOptional<ZodString>;
    metadata: ZodRecord<ZodString, ZodUnknown>;
    outputArtifacts: ZodArray<
      ZodObject<
        {
          id: ZodString;
          type: ZodEnum<{
            analysis: 'analysis';
            code: 'code';
            plan: 'plan';
            report: 'report';
            review: 'review';
            spec: 'spec';
            test: 'test';
            vote: 'vote';
          }>;
        },
        $strip
      >
    >;
    success: ZodBoolean;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/plugin-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plugin-types.ts#L50)

Schema for stage execution results.

---

### StageSpecSchema

```ts
const StageSpecSchema: ZodObject<
  {
    config: ZodRecord<ZodString, ZodUnknown>;
    dependencies: ZodArray<ZodString>;
    id: ZodString;
    inputArtifacts: ZodArray<ZodString>;
    maxRetries: ZodOptional<ZodNumber>;
    outputArtifacts: ZodArray<ZodString>;
    pluginId: ZodString;
    preferredCli: ZodOptional<ZodString>;
    timeoutMs: ZodOptional<ZodNumber>;
    type: ZodEnum<{
      aggregate: 'aggregate';
      analyze: 'analyze';
      execute: 'execute';
      gate: 'gate';
      route: 'route';
      validate: 'validate';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L123)

Pipeline stage specification.

---

### TASK_STATUSES

```ts
const TASK_STATUSES: readonly [
  'intake',
  'clarifying',
  'planning',
  'approved',
  'executing',
  'validating',
  'done',
  'failed',
];
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L18)

All valid task lifecycle statuses.

---

### TaskContractSchema

```ts
const TaskContractSchema: ZodObject<
  {
    analysis: ZodObject<
      {
        ambiguityScore: ZodNumber;
        complexity: ZodString;
        taskType: ZodString;
      },
      $strip
    >;
    artifacts: ZodArray<
      ZodObject<
        {
          id: ZodString;
          type: ZodEnum<{
            analysis: 'analysis';
            code: 'code';
            plan: 'plan';
            report: 'report';
            review: 'review';
            spec: 'spec';
            test: 'test';
            vote: 'vote';
          }>;
        },
        $strip
      >
    >;
    capabilityGaps: ZodObject<
      {
        allSatisfied: ZodBoolean;
        available: ZodObject<
          {
            experts: ZodArray<ZodString>;
            tools: ZodArray<ZodString>;
          },
          $strip
        >;
        gaps: ZodArray<ZodUnknown>;
      },
      $strip
    >;
    completedAt: ZodOptional<ZodNumber>;
    constraints: ZodObject<
      {
        quality: ZodOptional<ZodString>;
        scope: ZodArray<ZodString>;
        time: ZodOptional<ZodString>;
      },
      $strip
    >;
    createdAt: ZodNumber;
    description: ZodString;
    error: ZodOptional<ZodString>;
    id: ZodString;
    metadata: ZodRecord<ZodString, ZodUnknown>;
    parentId: ZodOptional<ZodString>;
    requiredCapabilities: ZodObject<
      {
        experts: ZodArray<ZodString>;
        tools: ZodArray<ZodString>;
      },
      $strip
    >;
    status: ZodEnum<{
      approved: 'approved';
      clarifying: 'clarifying';
      done: 'done';
      executing: 'executing';
      failed: 'failed';
      intake: 'intake';
      planning: 'planning';
      validating: 'validating';
    }>;
    updatedAt: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-contract.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-contract.ts#L105)

Unified task lifecycle contract.

## Functions

### checkForResearchTriggers()

```ts
function checkForResearchTriggers(config?): Promise<PipelineTask[]>;
```

Defined in: [packages/nexus-agents/src/pipeline/research-trigger.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/research-trigger.ts#L145)

Check for research discoveries and convert high-quality ones to pipeline tasks.

Calls research_discover via expert-bridge, filters by quality threshold,
deduplicates against known tasks, and rate-limits output.

Returns empty array when expert-bridge is unavailable (graceful degradation).

#### Parameters

##### config?

[`ResearchTriggerConfig`](#researchtriggerconfig) = `{}`

#### Returns

`Promise`\<[`PipelineTask`](#pipelinetask)[]\>

---

### checkPipelinePolicy()

```ts
function checkPipelinePolicy(task, stageType): PolicyEvalResult;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L205)

Evaluates pipeline policy before execution.
Builds PolicyContext from TaskContract metadata and stage type.
Uses the default PolicyEngine with 5 built-in rules.

#### Parameters

##### task

###### analysis

\{
`ambiguityScore`: `number`;
`complexity`: `string`;
`taskType`: `string`;
\} = `TaskAnalysisSummarySchema`

###### analysis.ambiguityScore

`number` = `...`

###### analysis.complexity

`string` = `...`

###### analysis.taskType

`string` = `...`

###### artifacts

\{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[] = `...`

###### capabilityGaps

\{
`allSatisfied`: `boolean`;
`available`: \{
`experts`: `string`[];
`tools`: `string`[];
\};
`gaps`: `unknown`[];
\} = `CapabilityGapSummarySchema`

###### capabilityGaps.allSatisfied

`boolean` = `...`

###### capabilityGaps.available

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `...`

###### capabilityGaps.available.experts

`string`[] = `...`

###### capabilityGaps.available.tools

`string`[] = `...`

###### capabilityGaps.gaps

`unknown`[] = `...`

###### completedAt?

`number` = `...`

###### constraints

\{
`quality?`: `string`;
`scope`: `string`[];
`time?`: `string`;
\} = `TaskConstraintsSummarySchema`

###### constraints.quality?

`string` = `...`

###### constraints.scope

`string`[] = `...`

###### constraints.time?

`string` = `...`

###### createdAt

`number` = `...`

###### description

`string` = `...`

###### error?

`string` = `...`

###### id

`string` = `...`

###### metadata

`Record`\<`string`, `unknown`\> = `...`

###### parentId?

`string` = `...`

###### requiredCapabilities

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `RequiredCapabilitiesSummarySchema`

###### requiredCapabilities.experts

`string`[] = `...`

###### requiredCapabilities.tools

`string`[] = `...`

###### status

\| `"failed"`
\| `"planning"`
\| `"done"`
\| `"approved"`
\| `"executing"`
\| `"intake"`
\| `"clarifying"`
\| `"validating"` = `...`

###### updatedAt

`number` = `...`

##### stageType

`string`

#### Returns

[`PolicyEvalResult`](#policyevalresult)

---

### checkpointToResult()

```ts
function checkpointToResult(state): Partial<DevPipelineResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:292](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L292)

Build a DevPipelineResult from checkpoint state (for resume scenarios).

#### Parameters

##### state

[`PipelineCheckpointState`](#pipelinecheckpointstate)

#### Returns

`Partial`\<[`DevPipelineResult`](#devpipelineresult)\>

---

### classifyTask()

```ts
function classifyTask(task): TaskClassification;
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L145)

Classify a task for pipeline routing.

#### Parameters

##### task

`string`

#### Returns

[`TaskClassification`](#taskclassification-1)

---

### cleanupCheckpoint()

```ts
function cleanupCheckpoint(sessionId, customDir?): boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:280](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L280)

Delete checkpoint file on successful completion.

#### Parameters

##### sessionId

`string`

##### customDir?

`string`

#### Returns

`boolean`

---

### compilePipelineGraph()

```ts
function compilePipelineGraph(template, stages): PipelineGraphResult;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-graph.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-graph.ts#L44)

Compile a pipeline template + stages into an executable graph.

Each IPipelineStage is wrapped as a GraphBuilder node handler.
Linear edges are auto-generated from template.stages order.
Custom edges override the linear flow for feedback loops.

#### Parameters

##### template

[`PipelineTemplate`](#pipelinetemplate)

##### stages

[`StageRegistry`](#stageregistry)

#### Returns

[`PipelineGraphResult`](#pipelinegraphresult)

---

### compilePlan()

```ts
function compilePlan(plan, options?): CompileResult;
```

Defined in: [packages/nexus-agents/src/pipeline/plan-compiler.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/plan-compiler.ts#L53)

Compiles a PlanContract into a CompiledGraph.

- Each stage becomes a node with a handler (plugin-backed or placeholder)
- Dependencies become fixed edges
- Policy gates become gate nodes between stages
- Stages with no dependencies get edges from START
- Stages with no dependents get edges to END

#### Parameters

##### plan

###### approvalRequired

`boolean` = `...`

###### estimatedCost

\{
`estimatedCostUsd`: `number`;
`modelCalls`: `number`;
`totalTokensIn`: `number`;
`totalTokensOut`: `number`;
\} = `CostEstimateSchema`

###### estimatedCost.estimatedCostUsd

`number` = `...`

###### estimatedCost.modelCalls

`number` = `...`

###### estimatedCost.totalTokensIn

`number` = `...`

###### estimatedCost.totalTokensOut

`number` = `...`

###### maxIterations

`number` = `...`

###### policyGates

\{
`afterStage`: `string`;
`beforeStage`: `string`;
`id`: `string`;
`onFail`: `"warn"` \| `"block"` \| `"escalate"`;
`rules`: `string`[];
\}[] = `...`

###### stages

\{
`config`: `Record`\<`string`, `unknown`\>;
`dependencies`: `string`[];
`id`: `string`;
`inputArtifacts`: `string`[];
`maxRetries?`: `number`;
`outputArtifacts`: `string`[];
`pluginId`: `string`;
`preferredCli?`: `string`;
`timeoutMs?`: `number`;
`type`: `"analyze"` \| `"validate"` \| `"aggregate"` \| `"execute"` \| `"route"` \| `"gate"`;
\}[] = `...`

###### taskId

`string` = `...`

###### timeoutMs

`number` = `...`

##### options?

[`PlanCompileOptions`](#plancompileoptions)

#### Returns

`CompileResult`

---

### createAgentStages()

```ts
function createAgentStages(config?): DevPipelineStages;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:443](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L443)

#### Parameters

##### config?

[`AgentExecutorConfig`](#agentexecutorconfig) = `{}`

#### Returns

[`DevPipelineStages`](#devpipelinestages)

---

### createCorePluginRegistry()

```ts
function createCorePluginRegistry(): PluginRegistry;
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L128)

Creates a PluginRegistry with core plugins pre-registered and frozen.
Convenience function for server startup.

#### Returns

[`PluginRegistry`](#pluginregistry)

---

### createDefaultPolicyEngine()

```ts
function createDefaultPolicyEngine(): PolicyEngine;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-engine.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-engine.ts#L193)

Creates a PolicyEngine with all built-in rules registered.

#### Returns

[`PolicyEngine`](#policyengine)

---

### createDelegatePipeline()

```ts
function createDelegatePipeline(task): DelegatePipelineResult;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L76)

Creates a compiled V2 pipeline for delegate_to_model from a TaskContract.

The pipeline has a single 'route' stage guarded by an entry policy gate.
Routing logic lives in the stage handler (placeholder here, real handler
injected by the MCP tool).

Activation (#3703): the compile call now supplies a **default-WARN**
`policyEnforcement` bundle, so the entry gate evaluates real policy at the
stage boundary in production. WARN mode never throws and never blocks — it
only logs + emits `policy.evaluated` events on a violation, generating the
autonomy-soak evidence #3653 needs. This is scoped to v2-delegate's own
compile call: the shared `compilePlan` default (no enforcement) is
unchanged, so every other `compilePlan` caller is unaffected.

#### Parameters

##### task

###### analysis

\{
`ambiguityScore`: `number`;
`complexity`: `string`;
`taskType`: `string`;
\} = `TaskAnalysisSummarySchema`

###### analysis.ambiguityScore

`number` = `...`

###### analysis.complexity

`string` = `...`

###### analysis.taskType

`string` = `...`

###### artifacts

\{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[] = `...`

###### capabilityGaps

\{
`allSatisfied`: `boolean`;
`available`: \{
`experts`: `string`[];
`tools`: `string`[];
\};
`gaps`: `unknown`[];
\} = `CapabilityGapSummarySchema`

###### capabilityGaps.allSatisfied

`boolean` = `...`

###### capabilityGaps.available

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `...`

###### capabilityGaps.available.experts

`string`[] = `...`

###### capabilityGaps.available.tools

`string`[] = `...`

###### capabilityGaps.gaps

`unknown`[] = `...`

###### completedAt?

`number` = `...`

###### constraints

\{
`quality?`: `string`;
`scope`: `string`[];
`time?`: `string`;
\} = `TaskConstraintsSummarySchema`

###### constraints.quality?

`string` = `...`

###### constraints.scope

`string`[] = `...`

###### constraints.time?

`string` = `...`

###### createdAt

`number` = `...`

###### description

`string` = `...`

###### error?

`string` = `...`

###### id

`string` = `...`

###### metadata

`Record`\<`string`, `unknown`\> = `...`

###### parentId?

`string` = `...`

###### requiredCapabilities

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `RequiredCapabilitiesSummarySchema`

###### requiredCapabilities.experts

`string`[] = `...`

###### requiredCapabilities.tools

`string`[] = `...`

###### status

\| `"failed"`
\| `"planning"`
\| `"done"`
\| `"approved"`
\| `"executing"`
\| `"intake"`
\| `"clarifying"`
\| `"validating"` = `...`

###### updatedAt

`number` = `...`

#### Returns

`DelegatePipelineResult`

---

### createDevStageRegistry()

```ts
function createDevStageRegistry(stages): Map<string, IPipelineStage>;
```

Defined in: [packages/nexus-agents/src/pipeline/stage-wrappers.ts:320](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/stage-wrappers.ts#L320)

Create a complete stage registry for the dev pipeline template.

#### Parameters

##### stages

[`DevPipelineStages`](#devpipelinestages)

#### Returns

`Map`\<`string`, [`IPipelineStage`](#ipipelinestage)\>

---

### createEventBusBridge()

```ts
function createEventBusBridge(options): PipelineBridgeResult;
```

Defined in: [packages/nexus-agents/src/pipeline/event-bus-bridge.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/event-bus-bridge.ts#L85)

Creates a bridge that forwards V2 pipeline events to the V1 agent EventBus.

Each V2 event is converted to a V1 DomainEvent with:

- topic: `{prefix}.{v2EventType}` (e.g. `pipeline.task.created`)
- payload: all V2 event fields except type/timestamp
- correlationId: executionId or taskId from V2 event

The bridge is fire-and-forget: forwarding errors are logged, not thrown.

#### Parameters

##### options

[`EventBusBridgeOptions`](#eventbusbridgeoptions)

#### Returns

[`PipelineBridgeResult`](#pipelinebridgeresult)

---

### createFeedbackSubscriber()

```ts
function createFeedbackSubscriber(bus, store): Unsubscribe;
```

Defined in: [packages/nexus-agents/src/pipeline/feedback-subscriber.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/feedback-subscriber.ts#L45)

Creates a subscriber that bridges EventBus events to OutcomeStore.

Listens for `stage.failed` events and records them as failed TaskOutcome
entries in the OutcomeStore.

Returns an Unsubscribe handle for callers that manage their own
subscription lifecycle (e.g. tests). For the server-wide singleton
subscription, use `startFeedbackSubscriber` / `shutdownFeedbackSubscriber`.

#### Parameters

##### bus

[`IEventBus`](#ieventbus)

##### store

[`OutcomeStore`](../orchestration.md#outcomestore)

#### Returns

[`Unsubscribe`](#unsubscribe)

Unsubscribe function to stop the bridge.

---

### delegateInputToTaskContract()

```ts
function delegateInputToTaskContract(
  input,
  opts?
): {
  analysis: {
    ambiguityScore: number;
    complexity: string;
    taskType: string;
  };
  artifacts: {
    id: string;
    type: 'code' | 'plan' | 'test' | 'review' | 'vote' | 'analysis' | 'spec' | 'report';
  }[];
  capabilityGaps: {
    allSatisfied: boolean;
    available: {
      experts: string[];
      tools: string[];
    };
    gaps: unknown[];
  };
  completedAt?: number;
  constraints: {
    quality?: string;
    scope: string[];
    time?: string;
  };
  createdAt: number;
  description: string;
  error?: string;
  id: string;
  metadata: Record<string, unknown>;
  parentId?: string;
  requiredCapabilities: {
    experts: string[];
    tools: string[];
  };
  status:
    | 'failed'
    | 'planning'
    | 'done'
    | 'approved'
    | 'executing'
    | 'intake'
    | 'clarifying'
    | 'validating';
  updatedAt: number;
};
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L136)

Converts delegate_to_model input into a V2 TaskContract.
Input fields are preserved in metadata for downstream pipeline stages.

#### Parameters

##### input

[`DelegateInputLike`](#delegateinputlike)

##### opts?

`DelegateContractOpts` = `{}`

#### Returns

```ts
{
  analysis: {
     ambiguityScore: number;
     complexity: string;
     taskType: string;
  };
  artifacts: {
     id: string;
     type:   | "code"
        | "plan"
        | "test"
        | "review"
        | "vote"
        | "analysis"
        | "spec"
        | "report";
  }[];
  capabilityGaps: {
     allSatisfied: boolean;
     available: {
        experts: string[];
        tools: string[];
     };
     gaps: unknown[];
  };
  completedAt?: number;
  constraints: {
     quality?: string;
     scope: string[];
     time?: string;
  };
  createdAt: number;
  description: string;
  error?: string;
  id: string;
  metadata: Record<string, unknown>;
  parentId?: string;
  requiredCapabilities: {
     experts: string[];
     tools: string[];
  };
  status:   | "failed"
     | "planning"
     | "done"
     | "approved"
     | "executing"
     | "intake"
     | "clarifying"
     | "validating";
  updatedAt: number;
}
```

##### analysis

```ts
analysis: {
  ambiguityScore: number;
  complexity: string;
  taskType: string;
} = TaskAnalysisSummarySchema;
```

###### analysis.ambiguityScore

```ts
ambiguityScore: number;
```

###### analysis.complexity

```ts
complexity: string;
```

###### analysis.taskType

```ts
taskType: string;
```

##### artifacts

```ts
artifacts: {
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
}[];
```

##### capabilityGaps

```ts
capabilityGaps: {
  allSatisfied: boolean;
  available: {
     experts: string[];
     tools: string[];
  };
  gaps: unknown[];
} = CapabilityGapSummarySchema;
```

###### capabilityGaps.allSatisfied

```ts
allSatisfied: boolean;
```

###### capabilityGaps.available

```ts
available: {
  experts: string[];
  tools: string[];
};
```

###### capabilityGaps.available.experts

```ts
experts: string[];
```

###### capabilityGaps.available.tools

```ts
tools: string[];
```

###### capabilityGaps.gaps

```ts
gaps: unknown[];
```

##### completedAt?

```ts
optional completedAt?: number;
```

##### constraints

```ts
constraints: {
  quality?: string;
  scope: string[];
  time?: string;
} = TaskConstraintsSummarySchema;
```

###### constraints.quality?

```ts
optional quality?: string;
```

###### constraints.scope

```ts
scope: string[];
```

###### constraints.time?

```ts
optional time?: string;
```

##### createdAt

```ts
createdAt: number;
```

##### description

```ts
description: string;
```

##### error?

```ts
optional error?: string;
```

##### id

```ts
id: string;
```

##### metadata

```ts
metadata: Record<string, unknown>;
```

##### parentId?

```ts
optional parentId?: string;
```

##### requiredCapabilities

```ts
requiredCapabilities: {
  experts: string[];
  tools: string[];
} = RequiredCapabilitiesSummarySchema;
```

###### requiredCapabilities.experts

```ts
experts: string[];
```

###### requiredCapabilities.tools

```ts
tools: string[];
```

##### status

```ts
status:
  | "failed"
  | "planning"
  | "done"
  | "approved"
  | "executing"
  | "intake"
  | "clarifying"
  | "validating";
```

##### updatedAt

```ts
updatedAt: number;
```

---

### emitPipelineStageEvent()

```ts
function emitPipelineStageEvent(prefix, stage, status, details?): void;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L138)

Convenience wrapper matching agent-executor's original signature.
Emits stage events using the global event bus with a prefixed executionId.

#### Parameters

##### prefix

`string`

##### stage

`string`

##### status

`"failed"` \| `"completed"` \| `"started"`

##### details?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

---

### emitStageCompleted()

```ts
function emitStageCompleted(options): void;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L84)

Emit a stage.completed event.

#### Parameters

##### options

[`StageCompletedOptions`](#stagecompletedoptions)

#### Returns

`void`

---

### emitStageFailed()

```ts
function emitStageFailed(options): void;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L98)

Emit a stage.failed event.

#### Parameters

##### options

[`StageFailedOptions`](#stagefailedoptions)

#### Returns

`void`

---

### emitStageStarted()

```ts
function emitStageStarted(options): void;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-observability.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-observability.ts#L71)

Emit a stage.started event.

#### Parameters

##### options

[`StageStartedOptions`](#stagestartedoptions)

#### Returns

`void`

---

### evaluatePipelinePolicy()

```ts
function evaluatePipelinePolicy(options, context): PolicyEvalResult;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L203)

Evaluates all registered policy rules for a stage boundary.

In WARN mode, violations are logged and emitted but execution continues.
In BLOCK mode, violations halt the pipeline.
In OFF mode, evaluation is skipped entirely.

#### Parameters

##### options

[`PolicyEvaluatorOptions`](#policyevaluatoroptions)

##### context

[`PolicyContext`](#policycontext)

#### Returns

[`PolicyEvalResult`](#policyevalresult)

---

### executeDelegatePipeline()

```ts
function executeDelegatePipeline(task): Promise<PipelineMetrics>;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-delegate.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-delegate.ts#L169)

Compiles and executes a V2 pipeline for the given TaskContract.
Evaluates policy before execution — block mode halts the pipeline.
Returns metrics for observability — never throws.

#### Parameters

##### task

###### analysis

\{
`ambiguityScore`: `number`;
`complexity`: `string`;
`taskType`: `string`;
\} = `TaskAnalysisSummarySchema`

###### analysis.ambiguityScore

`number` = `...`

###### analysis.complexity

`string` = `...`

###### analysis.taskType

`string` = `...`

###### artifacts

\{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[] = `...`

###### capabilityGaps

\{
`allSatisfied`: `boolean`;
`available`: \{
`experts`: `string`[];
`tools`: `string`[];
\};
`gaps`: `unknown`[];
\} = `CapabilityGapSummarySchema`

###### capabilityGaps.allSatisfied

`boolean` = `...`

###### capabilityGaps.available

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `...`

###### capabilityGaps.available.experts

`string`[] = `...`

###### capabilityGaps.available.tools

`string`[] = `...`

###### capabilityGaps.gaps

`unknown`[] = `...`

###### completedAt?

`number` = `...`

###### constraints

\{
`quality?`: `string`;
`scope`: `string`[];
`time?`: `string`;
\} = `TaskConstraintsSummarySchema`

###### constraints.quality?

`string` = `...`

###### constraints.scope

`string`[] = `...`

###### constraints.time?

`string` = `...`

###### createdAt

`number` = `...`

###### description

`string` = `...`

###### error?

`string` = `...`

###### id

`string` = `...`

###### metadata

`Record`\<`string`, `unknown`\> = `...`

###### parentId?

`string` = `...`

###### requiredCapabilities

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `RequiredCapabilitiesSummarySchema`

###### requiredCapabilities.experts

`string`[] = `...`

###### requiredCapabilities.tools

`string`[] = `...`

###### status

\| `"failed"`
\| `"planning"`
\| `"done"`
\| `"approved"`
\| `"executing"`
\| `"intake"`
\| `"clarifying"`
\| `"validating"` = `...`

###### updatedAt

`number` = `...`

#### Returns

`Promise`\<[`PipelineMetrics`](#pipelinemetrics)\>

---

### executeExpert()

```ts
function executeExpert(expertType, prompt): Promise<ExpertBridgeResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/expert-bridge.ts:364](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/expert-bridge.ts#L364)

#### Parameters

##### expertType

[`BuiltInExpertType`](../agents.md#builtinexperttype)

##### prompt

`string`

#### Returns

`Promise`\<[`ExpertBridgeResult`](#expertbridgeresult)\>

---

### executeOrchestratePipeline()

```ts
function executeOrchestratePipeline(task): Promise<PipelineMetrics>;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-orchestrate.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-orchestrate.ts#L71)

Executes the V2 orchestrate pipeline and returns metrics.

#### Parameters

##### task

###### analysis

\{
`ambiguityScore`: `number`;
`complexity`: `string`;
`taskType`: `string`;
\} = `TaskAnalysisSummarySchema`

###### analysis.ambiguityScore

`number` = `...`

###### analysis.complexity

`string` = `...`

###### analysis.taskType

`string` = `...`

###### artifacts

\{
`id`: `string`;
`type`: \| `"code"`
\| `"plan"`
\| `"test"`
\| `"review"`
\| `"vote"`
\| `"analysis"`
\| `"spec"`
\| `"report"`;
\}[] = `...`

###### capabilityGaps

\{
`allSatisfied`: `boolean`;
`available`: \{
`experts`: `string`[];
`tools`: `string`[];
\};
`gaps`: `unknown`[];
\} = `CapabilityGapSummarySchema`

###### capabilityGaps.allSatisfied

`boolean` = `...`

###### capabilityGaps.available

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `...`

###### capabilityGaps.available.experts

`string`[] = `...`

###### capabilityGaps.available.tools

`string`[] = `...`

###### capabilityGaps.gaps

`unknown`[] = `...`

###### completedAt?

`number` = `...`

###### constraints

\{
`quality?`: `string`;
`scope`: `string`[];
`time?`: `string`;
\} = `TaskConstraintsSummarySchema`

###### constraints.quality?

`string` = `...`

###### constraints.scope

`string`[] = `...`

###### constraints.time?

`string` = `...`

###### createdAt

`number` = `...`

###### description

`string` = `...`

###### error?

`string` = `...`

###### id

`string` = `...`

###### metadata

`Record`\<`string`, `unknown`\> = `...`

###### parentId?

`string` = `...`

###### requiredCapabilities

\{
`experts`: `string`[];
`tools`: `string`[];
\} = `RequiredCapabilitiesSummarySchema`

###### requiredCapabilities.experts

`string`[] = `...`

###### requiredCapabilities.tools

`string`[] = `...`

###### status

\| `"failed"`
\| `"planning"`
\| `"done"`
\| `"approved"`
\| `"executing"`
\| `"intake"`
\| `"clarifying"`
\| `"validating"` = `...`

###### updatedAt

`number` = `...`

#### Returns

`Promise`\<[`PipelineMetrics`](#pipelinemetrics)\>

---

### extractStateValue()

```ts
function extractStateValue(state, key): unknown;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L170)

Extract a value from the final pipeline state.

#### Parameters

##### state

`Readonly`\<`Record`\<`string`, `unknown`\>\>

##### key

`string`

#### Returns

`unknown`

---

### flushPipelineMemory()

```ts
function flushPipelineMemory(): void;
```

Defined in: [packages/nexus-agents/src/pipeline/agent-executor.ts:283](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/agent-executor.ts#L283)

Flush pipeline memory session.

#### Returns

`void`

---

### getPipelineArtifactStore()

```ts
function getPipelineArtifactStore(): IArtifactStore;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L309)

Returns the global ArtifactStore (created lazily on first call).

#### Returns

[`IArtifactStore`](#iartifactstore)

---

### getPipelinePluginRegistry()

```ts
function getPipelinePluginRegistry(): PluginRegistry;
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L141)

Returns the global PluginRegistry (created lazily on first call).

#### Returns

[`PluginRegistry`](#pluginregistry)

---

### getPolicyMode()

```ts
function getPolicyMode(): PipelinePolicyMode;
```

Defined in: [packages/nexus-agents/src/pipeline/policy-evaluator.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/policy-evaluator.ts#L192)

Reads policy mode from V2 config (umbrella + individual override).
Default: `block` in full mode, `warn` in partial, `off` when V2 is off.

#### Returns

[`PipelinePolicyMode`](#pipelinepolicymode)

---

### getTemplate()

```ts
function getTemplate(id): PipelineTemplate | undefined;
```

Defined in: [packages/nexus-agents/src/pipeline/templates.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/templates.ts#L93)

Get a pipeline template by ID.

#### Parameters

##### id

`string`

#### Returns

[`PipelineTemplate`](#pipelinetemplate) \| `undefined`

---

### listTemplateIds()

```ts
function listTemplateIds(): readonly string[];
```

Defined in: [packages/nexus-agents/src/pipeline/templates.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/templates.ts#L98)

List all available template IDs.

#### Returns

readonly `string`[]

---

### loadCheckpointState()

```ts
function loadCheckpointState(sessionId, customDir?): PipelineCheckpointState | null;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L125)

Load checkpoint state for a session. Returns null if no checkpoints exist.

#### Parameters

##### sessionId

`string`

##### customDir?

`string`

#### Returns

[`PipelineCheckpointState`](#pipelinecheckpointstate) \| `null`

---

### orchestrateInputToTaskContract()

```ts
function orchestrateInputToTaskContract(
  input,
  opts?
): {
  analysis: {
    ambiguityScore: number;
    complexity: string;
    taskType: string;
  };
  artifacts: {
    id: string;
    type: 'code' | 'plan' | 'test' | 'review' | 'vote' | 'analysis' | 'spec' | 'report';
  }[];
  capabilityGaps: {
    allSatisfied: boolean;
    available: {
      experts: string[];
      tools: string[];
    };
    gaps: unknown[];
  };
  completedAt?: number;
  constraints: {
    quality?: string;
    scope: string[];
    time?: string;
  };
  createdAt: number;
  description: string;
  error?: string;
  id: string;
  metadata: Record<string, unknown>;
  parentId?: string;
  requiredCapabilities: {
    experts: string[];
    tools: string[];
  };
  status:
    | 'failed'
    | 'planning'
    | 'done'
    | 'approved'
    | 'executing'
    | 'intake'
    | 'clarifying'
    | 'validating';
  updatedAt: number;
};
```

Defined in: [packages/nexus-agents/src/pipeline/v2-orchestrate.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-orchestrate.ts#L46)

Converts orchestrate input to a TaskContract.

#### Parameters

##### input

[`OrchestrateInputLike`](#orchestrateinputlike)

##### opts?

`OrchestrateContractOpts` = `{}`

#### Returns

```ts
{
  analysis: {
     ambiguityScore: number;
     complexity: string;
     taskType: string;
  };
  artifacts: {
     id: string;
     type:   | "code"
        | "plan"
        | "test"
        | "review"
        | "vote"
        | "analysis"
        | "spec"
        | "report";
  }[];
  capabilityGaps: {
     allSatisfied: boolean;
     available: {
        experts: string[];
        tools: string[];
     };
     gaps: unknown[];
  };
  completedAt?: number;
  constraints: {
     quality?: string;
     scope: string[];
     time?: string;
  };
  createdAt: number;
  description: string;
  error?: string;
  id: string;
  metadata: Record<string, unknown>;
  parentId?: string;
  requiredCapabilities: {
     experts: string[];
     tools: string[];
  };
  status:   | "failed"
     | "planning"
     | "done"
     | "approved"
     | "executing"
     | "intake"
     | "clarifying"
     | "validating";
  updatedAt: number;
}
```

##### analysis

```ts
analysis: {
  ambiguityScore: number;
  complexity: string;
  taskType: string;
} = TaskAnalysisSummarySchema;
```

###### analysis.ambiguityScore

```ts
ambiguityScore: number;
```

###### analysis.complexity

```ts
complexity: string;
```

###### analysis.taskType

```ts
taskType: string;
```

##### artifacts

```ts
artifacts: {
  id: string;
  type:   | "code"
     | "plan"
     | "test"
     | "review"
     | "vote"
     | "analysis"
     | "spec"
     | "report";
}[];
```

##### capabilityGaps

```ts
capabilityGaps: {
  allSatisfied: boolean;
  available: {
     experts: string[];
     tools: string[];
  };
  gaps: unknown[];
} = CapabilityGapSummarySchema;
```

###### capabilityGaps.allSatisfied

```ts
allSatisfied: boolean;
```

###### capabilityGaps.available

```ts
available: {
  experts: string[];
  tools: string[];
};
```

###### capabilityGaps.available.experts

```ts
experts: string[];
```

###### capabilityGaps.available.tools

```ts
tools: string[];
```

###### capabilityGaps.gaps

```ts
gaps: unknown[];
```

##### completedAt?

```ts
optional completedAt?: number;
```

##### constraints

```ts
constraints: {
  quality?: string;
  scope: string[];
  time?: string;
} = TaskConstraintsSummarySchema;
```

###### constraints.quality?

```ts
optional quality?: string;
```

###### constraints.scope

```ts
scope: string[];
```

###### constraints.time?

```ts
optional time?: string;
```

##### createdAt

```ts
createdAt: number;
```

##### description

```ts
description: string;
```

##### error?

```ts
optional error?: string;
```

##### id

```ts
id: string;
```

##### metadata

```ts
metadata: Record<string, unknown>;
```

##### parentId?

```ts
optional parentId?: string;
```

##### requiredCapabilities

```ts
requiredCapabilities: {
  experts: string[];
  tools: string[];
} = RequiredCapabilitiesSummarySchema;
```

###### requiredCapabilities.experts

```ts
experts: string[];
```

###### requiredCapabilities.tools

```ts
tools: string[];
```

##### status

```ts
status:
  | "failed"
  | "planning"
  | "done"
  | "approved"
  | "executing"
  | "intake"
  | "clarifying"
  | "validating";
```

##### updatedAt

```ts
updatedAt: number;
```

---

### registerCorePlugins()

```ts
function registerCorePlugins(registry?): CorePluginRegistrationResult;
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L103)

Registers all core plugins into a PluginRegistry and freezes it.
Returns registration summary. Never throws.

#### Parameters

##### registry?

[`PluginRegistry`](#pluginregistry)

#### Returns

[`CorePluginRegistrationResult`](#corepluginregistrationresult)

---

### resetPipelineArtifactStore()

```ts
function resetPipelineArtifactStore(): void;
```

Defined in: [packages/nexus-agents/src/pipeline/artifact-store.ts:315](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/artifact-store.ts#L315)

Resets the global ArtifactStore (for testing).

#### Returns

`void`

---

### resetPipelinePluginRegistry()

```ts
function resetPipelinePluginRegistry(): void;
```

Defined in: [packages/nexus-agents/src/pipeline/core-plugins.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/core-plugins.ts#L147)

Resets the global PluginRegistry (for testing).

#### Returns

`void`

---

### resolvePipelineDeps()

```ts
function resolvePipelineDeps(deps?): ResolvedPipelineDeps;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-deps.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-deps.ts#L48)

Resolves a [PipelineDeps](#pipelinedeps) bundle, filling any unset field from its
documented global default. An injected field is returned untouched; an omitted
field returns the process-global default. The only side effect is the lazy,
idempotent creation of the global registry inside `getPipelinePluginRegistry()`.

#### Parameters

##### deps?

[`PipelineDeps`](#pipelinedeps)

#### Returns

[`ResolvedPipelineDeps`](#resolvedpipelinedeps)

---

### resolveV2Config()

```ts
function resolveV2Config(): V2Config;
```

Defined in: [packages/nexus-agents/src/pipeline/v2-config.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/v2-config.ts#L73)

Resolves the full V2 configuration from environment variables.

Priority: individual flag > umbrella flag > defaults.

| NEXUS_V2_MODE  | delegate | orchestrate | policy |
| -------------- | -------- | ----------- | ------ |
| full (default) | true     | true        | block  |
| partial        | true     | false       | warn   |
| off            | false    | false       | off    |

#### Returns

[`V2Config`](#v2config)

---

### runAdaptiveOrchestrator()

```ts
function runAdaptiveOrchestrator(task, options): Promise<AdaptiveOrchestratorResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/adaptive-orchestrator.ts#L309)

Run the adaptive orchestrator — classify task, select template, execute.

This is the single entry point for all pipeline execution.

#### Parameters

##### task

`string`

##### options

[`AdaptiveOrchestratorOptions`](#adaptiveorchestratoroptions)

#### Returns

`Promise`\<[`AdaptiveOrchestratorResult`](#adaptiveorchestratorresult)\>

---

### runDevPipeline()

```ts
function runDevPipeline(task, stages, options?): Promise<DevPipelineResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/dev-pipeline.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/dev-pipeline.ts#L274)

Execute the full multi-agent development pipeline.

When `sessionId` is provided, each stage checkpoints to disk. On crash,
re-running with the same sessionId resumes from the last completed stage.

#### Parameters

##### task

`string`

High-level task description

##### stages

[`DevPipelineStages`](#devpipelinestages)

Pluggable stage implementations

##### options?

[`DevPipelineOptions`](#devpipelineoptions)

Pipeline options (sessionId for checkpoint/resume)

#### Returns

`Promise`\<[`DevPipelineResult`](#devpipelineresult)\>

Pipeline result with all outputs

---

### runGraphPipeline()

```ts
function runGraphPipeline(task, template, stages, options?): Promise<GraphPipelineResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/graph-pipeline-runner.ts#L60)

Run a pipeline using graph-based execution.

Compiles the template + stages into a graph, then executes via
the graph executor (super-step BSP model).

#### Parameters

##### task

`string`

##### template

[`PipelineTemplate`](#pipelinetemplate)

##### stages

[`StageRegistry`](#stageregistry)

##### options?

[`GraphPipelineOptions`](#graphpipelineoptions)

#### Returns

`Promise`\<[`GraphPipelineResult`](#graphpipelineresult)\>

---

### runIterativeConsensus()

```ts
function runIterativeConsensus(initialPlan, revisePlan, config?): Promise<IterativeConsensusResult>;
```

Defined in: [packages/nexus-agents/src/pipeline/iterative-consensus.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/iterative-consensus.ts#L95)

#### Parameters

##### initialPlan

`string`

##### revisePlan

(`plan`, `feedback`) => `Promise`\<`string`\>

##### config?

[`IterativeConsensusConfig`](#iterativeconsensusconfig)

#### Returns

`Promise`\<[`IterativeConsensusResult`](#iterativeconsensusresult)\>

---

### saveStageCheckpoint()

```ts
function saveStageCheckpoint(sessionId, stage, data, customDir?): boolean;
```

Defined in: [packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/pipeline-checkpoint.ts#L91)

Append a stage checkpoint to disk.

#### Parameters

##### sessionId

`string`

##### stage

[`CheckpointPipelineStage`](#checkpointpipelinestage)

##### data

[`PipelineStageData`](#pipelinestagedata)

##### customDir?

`string`

#### Returns

`boolean`
