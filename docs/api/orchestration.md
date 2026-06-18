---
title: 'API: orchestration'
description: Generated API reference for orchestration.
tier: 2
---

# orchestration

## Classes

### GraphBuilder

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L48)

Fluent builder for graph-based workflows.

Usage:

```ts
const graph = new GraphBuilder()
  .addState('messages', { defaultValue: [], reducer: { type: 'append' } })
  .addNode('classify', classifyHandler)
  .addNode('respond', respondHandler)
  .addEdge(START, 'classify')
  .addConditionalEdge('classify', router, ['respond', 'escalate'])
  .addEdge('respond', END)
  .compile();
```

#### Constructors

##### Constructor

```ts
new GraphBuilder(): GraphBuilder;
```

###### Returns

[`GraphBuilder`](#graphbuilder)

#### Methods

##### addConditionalEdge()

```ts
addConditionalEdge(
   from,
   router,
   targets): this;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L105)

Adds a conditional edge with a routing function.
The router inspects state and returns the target node ID.
All possible targets must be declared for compile-time validation.

###### Parameters

###### from

`string`

###### router

(`state`) => `string`

###### targets

readonly `string`[]

###### Returns

`this`

##### addEdge()

```ts
addEdge(
   from,
   to,
   options?): this;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L90)

Adds a fixed edge between two nodes.

###### Parameters

###### from

`string`

###### to

`string`

###### options?

###### maxTraversals?

`number`

###### Returns

`this`

##### addNode()

```ts
addNode(
   id,
   handler,
   opts?): this;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L65)

Adds a node to the graph.
Supports optional precondition hooks (Issue #997) and verify hook (Issue #994).

###### Parameters

###### id

`string`

###### handler

[`NodeHandler`](#nodehandler)

###### opts?

###### preconditions?

readonly [`PreconditionConfig`](#preconditionconfig)[]

###### retries?

`number`

###### timeout?

`number`

###### verify?

[`NodeHook`](#nodehook)

###### Returns

`this`

##### addState()

```ts
addState<T>(name, schema): this;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L56)

Registers a state field with its default value and reducer.

###### Type Parameters

###### T

`T`

###### Parameters

###### name

`string`

###### schema

[`StateFieldSchema`](#statefieldschema)\<`T`\>

###### Returns

`this`

##### compile()

```ts
compile(): CompileResult;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L122)

Compiles the graph, validating all structural invariants.
Returns a CompileResult — either a validated CompiledGraph or a compile error.

###### Returns

[`CompileResult`](#compileresult)

---

### InMemoryCheckpointStore

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L37)

In-memory checkpoint store with bounded storage.
Checkpoints are evicted on a per-execution basis (oldest first)
when limits are exceeded.

#### Implements

- [`ICheckpointStore`](#icheckpointstore)

#### Constructors

##### Constructor

```ts
new InMemoryCheckpointStore(): InMemoryCheckpointStore;
```

###### Returns

[`InMemoryCheckpointStore`](#inmemorycheckpointstore)

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L101)

Clears all checkpoints.

###### Returns

`void`

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`clear`](#clear-3)

##### delete()

```ts
delete(id): boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L75)

Deletes a checkpoint by ID. Returns true if found and deleted.

###### Parameters

###### id

`string`

###### Returns

`boolean`

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`delete`](#delete-1)

##### deleteExecution()

```ts
deleteExecution(executionId): number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L88)

Deletes all checkpoints for a given execution ID.

###### Parameters

###### executionId

`string`

###### Returns

`number`

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`deleteExecution`](#deleteexecution-1)

##### latest()

```ts
latest(executionId): Checkpoint | undefined;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L58)

Loads the latest checkpoint for a given execution ID.

###### Parameters

###### executionId

`string`

###### Returns

[`Checkpoint`](#checkpoint) \| `undefined`

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`latest`](#latest-1)

##### list()

```ts
list(executionId): readonly CheckpointSummary[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L67)

Lists all checkpoint summaries for a given execution ID.

###### Parameters

###### executionId

`string`

###### Returns

readonly [`CheckpointSummary`](#checkpointsummary)[]

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`list`](#list-1)

##### load()

```ts
load(id): Checkpoint | undefined;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L54)

Loads a checkpoint by ID. Returns undefined if not found.

###### Parameters

###### id

`string`

###### Returns

[`Checkpoint`](#checkpoint) \| `undefined`

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`load`](#load-1)

##### save()

```ts
save(checkpoint): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L41)

Saves a checkpoint. Overwrites if ID already exists.

###### Parameters

###### checkpoint

[`Checkpoint`](#checkpoint)

###### Returns

`void`

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`save`](#save-1)

##### size()

```ts
size(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L97)

Returns total number of checkpoints across all executions.

###### Returns

`number`

###### Implementation of

[`ICheckpointStore`](#icheckpointstore).[`size`](#size-3)

---

### OrchestratorError

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L98)

Orchestrator error with context.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new OrchestratorError(
   message,
   code,
   options?): OrchestratorError;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L104)

###### Parameters

###### message

`string`

###### code

[`OrchestratorErrorCode`](#orchestratorerrorcode-1)

###### options?

###### cause?

`Error`

###### step?

`string`

###### Returns

[`OrchestratorError`](#orchestratorerror)

###### Overrides

```ts
Error.constructor;
```

#### Properties

##### cause

```ts
readonly cause: Error | undefined;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L102)

###### Overrides

```ts
Error.cause;
```

##### code

```ts
readonly code: OrchestratorErrorCode;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L100)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

```ts
Error.message;
```

##### name

```ts
readonly name: "OrchestratorError";
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L99)

###### Overrides

```ts
Error.name;
```

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

```ts
Error.stack;
```

##### step

```ts
readonly step: string | undefined;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L101)

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

```ts
Error.stackTraceLimit;
```

#### Methods

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

```ts
Error.captureStackTrace;
```

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

```ts
Error.prepareStackTrace;
```

---

### OrchestratorFactory

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L302)

Factory for creating IOrchestrator instances.

Provides a unified entry point for all orchestration strategies:

- workflow: Static template-based execution
- tech_lead: LLM-based task decomposition and orchestration (OrchestratorAdapter)
- puppeteer: Policy-based step execution (PuppeteerAdapter)

#### Example

```typescript
const factory = await createOrchestratorFactory();
const orchestrator = factory.create('workflow');

const result = await orchestrator.execute(
  { type: 'workflow', templatePath: './templates/code-review.yaml' },
  { url: 'https://github.com/...' }
);
```

#### Implements

- [`IOrchestratorFactory`](#iorchestratorfactory)

#### Constructors

##### Constructor

```ts
new OrchestratorFactory(config, workflowEngine?): OrchestratorFactory;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:307](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L307)

###### Parameters

###### config

[`OrchestratorFactoryConfig`](#orchestratorfactoryconfig)

###### workflowEngine?

[`IWorkflowEngine`](core.md#iworkflowengine)

###### Returns

[`OrchestratorFactory`](#orchestratorfactory)

#### Methods

##### create()

```ts
create(type, _config?): IOrchestrator;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:313](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L313)

Create an orchestrator instance.

###### Parameters

###### type

[`OrchestratorType`](#orchestratortype-1)

Orchestrator type

###### \_config?

`Record`\<`string`, `unknown`\>

###### Returns

[`IOrchestrator`](#iorchestrator)

New orchestrator instance

###### Implementation of

[`IOrchestratorFactory`](#iorchestratorfactory).[`create`](#create-1)

##### listTypes()

```ts
listTypes(): OrchestratorType[];
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L363)

List available orchestrator types.

###### Returns

[`OrchestratorType`](#orchestratortype-1)[]

###### Implementation of

[`IOrchestratorFactory`](#iorchestratorfactory).[`listTypes`](#listtypes-1)

---

### OutcomeStore

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L69)

Bounded, append-only, in-memory store for task outcomes.
Evicts oldest entries when capacity is exceeded.

#### Extended by

- [`PersistentOutcomeStore`](#persistentoutcomestore)

#### Constructors

##### Constructor

```ts
new OutcomeStore(config?): OutcomeStore;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L74)

###### Parameters

###### config?

[`OutcomeStoreConfig`](#outcomestoreconfig)

###### Returns

[`OutcomeStore`](#outcomestore)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L187)

Number of stored outcomes.

###### Returns

`number`

#### Methods

##### append()

```ts
append(outcome): void;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L85)

Append a new outcome. Auto-classifies failures missing failureCategory
(#1441) and resolves the outcome's `vendor` / `family` via the
ModelRegistry (#2548) so family-level retrieval can warm-start
siblings after a model retirement.

###### Parameters

###### outcome

###### baselineId?

`string` = `...`

Baseline this outcome forked from (#2697 / Epic F follow-up to #2665).
Set on outcomes recorded inside a fork-then-merge graph branch so
`query({ baselineId: 'B' })` returns every branch outcome forked
from baseline B — letting later analysis compare branches as a
cohort. Free-form string (caller-assigned); typically the parent
node's `executionId` or `taskId`.

###### category

\| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"` = `TaskCategorySchema`

###### cli

`"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"` = `OutcomeCliSchema`

###### durationMs

`number` = `...`

###### errorMessage?

`string` = `...`

###### failureCategory?

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"` = `...`

###### family?

`string` = `...`

Family resolved from `model` via ModelRegistry at write time (#2548).

###### id

`string` = `...`

###### model

`string` = `...`

###### qualitySignals?

`string`[] = `...`

###### requestId?

`string` = `...`

Request id correlating this outcome to its originating invocation (#3146).

###### retryCount?

`number` = `...`

Number of retry attempts before this outcome (#1785).

###### routingStage?

`string` = `...`

Routing stage that selected this CLI (#1785).

###### source

`"delegate"` \| `"consensus"` \| `"manual"` = `OutcomeSourceSchema`

###### success

`boolean` = `...`

###### timestamp

`string` = `...`

###### traceId?

`string` = `...`

Distributed trace id correlating this outcome across the pipeline (#3146).
Optional + backward-compatible: older JSONL records without it hydrate fine.

###### triageAction?

`string` = `...`

Triage action taken on the failure (#1506).

###### vendor?

`string` = `...`

Vendor resolved from `model` via ModelRegistry at write time (#2548).

###### voterRole?

`string` = `...`

Voter role for `source: 'consensus'` outcomes (#2662) — `architect`,
`security`, etc. Absent on non-consensus outcomes. Lets the
stratified outcome report break results down by voter role.

###### wasRetried?

`boolean` = `...`

Whether this outcome came from a triage-initiated retry (#1506).

###### Returns

`void`

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L192)

Remove all stored outcomes.

###### Returns

`void`

##### purgeSkippedWorkers()

```ts
purgeSkippedWorkers(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:241](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L241)

Purge false failures with zero execution time (#1528).
Removes non-success entries with durationMs=0 — these are either:

- Skipped workers (circuit breaker, role auto-disable)
- Test-generated entries (E2E eval artifacts)
- Pre-execution short-circuits (validation, initialization)
  Real model execution always takes >0ms.
  Returns count of purged entries.

###### Returns

`number`

##### query()

```ts
query(filter?): readonly {
  baselineId?: string;
  category:   | "planning"
     | "architecture"
     | "code_generation"
     | "code_review"
     | "research"
     | "security_review"
     | "documentation"
     | "testing"
     | "devops"
     | "exploration";
  cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
  durationMs: number;
  errorMessage?: string;
  failureCategory?:   | "unknown"
     | "timeout"
     | "parse"
     | "connection"
     | "execution"
     | "rate_limit"
     | "validation"
     | "authentication"
     | "crash"
     | "adapter_unavailable"
     | "generic";
  family?: string;
  id: string;
  model: string;
  qualitySignals?: string[];
  requestId?: string;
  retryCount?: number;
  routingStage?: string;
  source: "delegate" | "consensus" | "manual";
  success: boolean;
  timestamp: string;
  traceId?: string;
  triageAction?: string;
  vendor?: string;
  voterRole?: string;
  wasRetried?: boolean;
}[];
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L105)

Query outcomes with optional filters.

###### Parameters

###### filter?

###### baselineId?

`string` = `...`

Restrict to outcomes recorded against a specific baseline (#2697).

###### category?

\| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"` = `...`

###### cli?

`"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"` = `...`

###### excludeQualitySignals?

`string`[] = `...`

Exclude outcomes with any of these quality signals (#1680).

###### failureCategory?

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"` = `...`

###### limit?

`number` = `...`

###### since?

`string` = `...`

###### source?

`"delegate"` \| `"consensus"` \| `"manual"` = `...`

###### success?

`boolean` = `...`

###### Returns

readonly \{
`baselineId?`: `string`;
`category`: \| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"`;
`cli`: `"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`;
`durationMs`: `number`;
`errorMessage?`: `string`;
`failureCategory?`: \| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"`;
`family?`: `string`;
`id`: `string`;
`model`: `string`;
`qualitySignals?`: `string`[];
`requestId?`: `string`;
`retryCount?`: `number`;
`routingStage?`: `string`;
`source`: `"delegate"` \| `"consensus"` \| `"manual"`;
`success`: `boolean`;
`timestamp`: `string`;
`traceId?`: `string`;
`triageAction?`: `string`;
`vendor?`: `string`;
`voterRole?`: `string`;
`wasRetried?`: `boolean`;
\}[]

##### queryByModelWithFamilyFallback()

```ts
queryByModelWithFamilyFallback(modelId, options?): {
  family?: string;
  outcomes: readonly {
     baselineId?: string;
     category:   | "planning"
        | "architecture"
        | "code_generation"
        | "code_review"
        | "research"
        | "security_review"
        | "documentation"
        | "testing"
        | "devops"
        | "exploration";
     cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
     durationMs: number;
     errorMessage?: string;
     failureCategory?:   | "unknown"
        | "timeout"
        | "parse"
        | "connection"
        | "execution"
        | "rate_limit"
        | "validation"
        | "authentication"
        | "crash"
        | "adapter_unavailable"
        | "generic";
     family?: string;
     id: string;
     model: string;
     qualitySignals?: string[];
     requestId?: string;
     retryCount?: number;
     routingStage?: string;
     source: "delegate" | "consensus" | "manual";
     success: boolean;
     timestamp: string;
     traceId?: string;
     triageAction?: string;
     vendor?: string;
     voterRole?: string;
     wasRetried?: boolean;
  }[];
  scope: "literal" | "empty" | "family";
  vendor?: string;
};
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L130)

Query outcomes for a specific model with a family-level warm-start
fallback (#2548). When the literal `modelId` has fewer than
`threshold` samples in the store, broaden the result to the model's
`{vendor, family}` siblings — siblings within a family share enough
behavior profile that their outcomes are useful priors for cold
starts after a retirement.

Returns the outcomes and a `scope` flag so callers know whether
they're consuming literal-id data or family-broadened data.

###### Parameters

###### modelId

`string`

###### options?

###### extraFilter?

`Omit`\<\{
`baselineId?`: `string`;
`category?`: \| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"`;
`cli?`: `"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`;
`excludeQualitySignals?`: `string`[];
`failureCategory?`: \| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"`;
`limit?`: `number`;
`since?`: `string`;
`source?`: `"delegate"` \| `"consensus"` \| `"manual"`;
`success?`: `boolean`;
\}, `"limit"`\>

###### threshold?

`number`

###### Returns

```ts
{
  family?: string;
  outcomes: readonly {
     baselineId?: string;
     category:   | "planning"
        | "architecture"
        | "code_generation"
        | "code_review"
        | "research"
        | "security_review"
        | "documentation"
        | "testing"
        | "devops"
        | "exploration";
     cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
     durationMs: number;
     errorMessage?: string;
     failureCategory?:   | "unknown"
        | "timeout"
        | "parse"
        | "connection"
        | "execution"
        | "rate_limit"
        | "validation"
        | "authentication"
        | "crash"
        | "adapter_unavailable"
        | "generic";
     family?: string;
     id: string;
     model: string;
     qualitySignals?: string[];
     requestId?: string;
     retryCount?: number;
     routingStage?: string;
     source: "delegate" | "consensus" | "manual";
     success: boolean;
     timestamp: string;
     traceId?: string;
     triageAction?: string;
     vendor?: string;
     voterRole?: string;
     wasRetried?: boolean;
  }[];
  scope: "literal" | "empty" | "family";
  vendor?: string;
}
```

###### family?

```ts
readonly optional family?: string;
```

###### outcomes

```ts
readonly outcomes: readonly {
  baselineId?: string;
  category:   | "planning"
     | "architecture"
     | "code_generation"
     | "code_review"
     | "research"
     | "security_review"
     | "documentation"
     | "testing"
     | "devops"
     | "exploration";
  cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
  durationMs: number;
  errorMessage?: string;
  failureCategory?:   | "unknown"
     | "timeout"
     | "parse"
     | "connection"
     | "execution"
     | "rate_limit"
     | "validation"
     | "authentication"
     | "crash"
     | "adapter_unavailable"
     | "generic";
  family?: string;
  id: string;
  model: string;
  qualitySignals?: string[];
  requestId?: string;
  retryCount?: number;
  routingStage?: string;
  source: "delegate" | "consensus" | "manual";
  success: boolean;
  timestamp: string;
  traceId?: string;
  triageAction?: string;
  vendor?: string;
  voterRole?: string;
  wasRetried?: boolean;
}[];
```

###### scope

```ts
readonly scope: "literal" | "empty" | "family";
```

###### vendor?

```ts
readonly optional vendor?: string;
```

##### reclassifyAll()

```ts
reclassifyAll(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L203)

Backfill: reclassify all entries missing failureCategory (#1444).
Also reclassifies 'unknown' entries with no error message as 'execution'
(#1511) since 'unknown' with no diagnostic info is less useful than the
default 'execution' category.
Returns count of reclassified entries.

###### Returns

`number`

##### summarize()

```ts
summarize(filter?): PerformanceSummary;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L161)

Aggregate outcomes into a performance summary.

###### Parameters

###### filter?

###### baselineId?

`string` = `...`

Restrict to outcomes recorded against a specific baseline (#2697).

###### category?

\| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"` = `...`

###### cli?

`"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"` = `...`

###### excludeQualitySignals?

`string`[] = `...`

Exclude outcomes with any of these quality signals (#1680).

###### failureCategory?

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"` = `...`

###### limit?

`number` = `...`

###### since?

`string` = `...`

###### source?

`"delegate"` \| `"consensus"` \| `"manual"` = `...`

###### success?

`boolean` = `...`

###### Returns

[`PerformanceSummary`](#performancesummary)

---

### PersistentOutcomeStore

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts#L44)

OutcomeStore that persists entries to a JSONL file on disk.

- Construction: hydrates from existing JSONL file (Zod-validates each line)
- Append: calls super.append() then appendFileSync one JSON line
- Corruption: bad lines are skipped with a warning log

#### Extends

- [`OutcomeStore`](#outcomestore)

#### Constructors

##### Constructor

```ts
new PersistentOutcomeStore(config?, logger?): PersistentOutcomeStore;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts#L48)

###### Parameters

###### config?

[`PersistentOutcomeStoreConfig`](#persistentoutcomestoreconfig)

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`PersistentOutcomeStore`](#persistentoutcomestore)

###### Overrides

[`OutcomeStore`](#outcomestore).[`constructor`](#constructor-4)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L187)

Number of stored outcomes.

###### Returns

`number`

###### Inherited from

[`OutcomeStore`](#outcomestore).[`size`](#size-1)

#### Methods

##### append()

```ts
append(outcome): void;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts#L61)

Override append to persist each entry to disk.

###### Parameters

###### outcome

###### baselineId?

`string` = `...`

Baseline this outcome forked from (#2697 / Epic F follow-up to #2665).
Set on outcomes recorded inside a fork-then-merge graph branch so
`query({ baselineId: 'B' })` returns every branch outcome forked
from baseline B — letting later analysis compare branches as a
cohort. Free-form string (caller-assigned); typically the parent
node's `executionId` or `taskId`.

###### category

\| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"` = `TaskCategorySchema`

###### cli

`"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"` = `OutcomeCliSchema`

###### durationMs

`number` = `...`

###### errorMessage?

`string` = `...`

###### failureCategory?

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"` = `...`

###### family?

`string` = `...`

Family resolved from `model` via ModelRegistry at write time (#2548).

###### id

`string` = `...`

###### model

`string` = `...`

###### qualitySignals?

`string`[] = `...`

###### requestId?

`string` = `...`

Request id correlating this outcome to its originating invocation (#3146).

###### retryCount?

`number` = `...`

Number of retry attempts before this outcome (#1785).

###### routingStage?

`string` = `...`

Routing stage that selected this CLI (#1785).

###### source

`"delegate"` \| `"consensus"` \| `"manual"` = `OutcomeSourceSchema`

###### success

`boolean` = `...`

###### timestamp

`string` = `...`

###### traceId?

`string` = `...`

Distributed trace id correlating this outcome across the pipeline (#3146).
Optional + backward-compatible: older JSONL records without it hydrate fine.

###### triageAction?

`string` = `...`

Triage action taken on the failure (#1506).

###### vendor?

`string` = `...`

Vendor resolved from `model` via ModelRegistry at write time (#2548).

###### voterRole?

`string` = `...`

Voter role for `source: 'consensus'` outcomes (#2662) — `architect`,
`security`, etc. Absent on non-consensus outcomes. Lets the
stratified outcome report break results down by voter role.

###### wasRetried?

`boolean` = `...`

Whether this outcome came from a triage-initiated retry (#1506).

###### Returns

`void`

###### Overrides

[`OutcomeStore`](#outcomestore).[`append`](#append)

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L192)

Remove all stored outcomes.

###### Returns

`void`

###### Inherited from

[`OutcomeStore`](#outcomestore).[`clear`](#clear-1)

##### purgeSkippedWorkers()

```ts
purgeSkippedWorkers(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:241](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L241)

Purge false failures with zero execution time (#1528).
Removes non-success entries with durationMs=0 — these are either:

- Skipped workers (circuit breaker, role auto-disable)
- Test-generated entries (E2E eval artifacts)
- Pre-execution short-circuits (validation, initialization)
  Real model execution always takes >0ms.
  Returns count of purged entries.

###### Returns

`number`

###### Inherited from

[`OutcomeStore`](#outcomestore).[`purgeSkippedWorkers`](#purgeskippedworkers)

##### query()

```ts
query(filter?): readonly {
  baselineId?: string;
  category:   | "planning"
     | "architecture"
     | "code_generation"
     | "code_review"
     | "research"
     | "security_review"
     | "documentation"
     | "testing"
     | "devops"
     | "exploration";
  cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
  durationMs: number;
  errorMessage?: string;
  failureCategory?:   | "unknown"
     | "timeout"
     | "parse"
     | "connection"
     | "execution"
     | "rate_limit"
     | "validation"
     | "authentication"
     | "crash"
     | "adapter_unavailable"
     | "generic";
  family?: string;
  id: string;
  model: string;
  qualitySignals?: string[];
  requestId?: string;
  retryCount?: number;
  routingStage?: string;
  source: "delegate" | "consensus" | "manual";
  success: boolean;
  timestamp: string;
  traceId?: string;
  triageAction?: string;
  vendor?: string;
  voterRole?: string;
  wasRetried?: boolean;
}[];
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L105)

Query outcomes with optional filters.

###### Parameters

###### filter?

###### baselineId?

`string` = `...`

Restrict to outcomes recorded against a specific baseline (#2697).

###### category?

\| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"` = `...`

###### cli?

`"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"` = `...`

###### excludeQualitySignals?

`string`[] = `...`

Exclude outcomes with any of these quality signals (#1680).

###### failureCategory?

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"` = `...`

###### limit?

`number` = `...`

###### since?

`string` = `...`

###### source?

`"delegate"` \| `"consensus"` \| `"manual"` = `...`

###### success?

`boolean` = `...`

###### Returns

readonly \{
`baselineId?`: `string`;
`category`: \| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"`;
`cli`: `"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`;
`durationMs`: `number`;
`errorMessage?`: `string`;
`failureCategory?`: \| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"`;
`family?`: `string`;
`id`: `string`;
`model`: `string`;
`qualitySignals?`: `string`[];
`requestId?`: `string`;
`retryCount?`: `number`;
`routingStage?`: `string`;
`source`: `"delegate"` \| `"consensus"` \| `"manual"`;
`success`: `boolean`;
`timestamp`: `string`;
`traceId?`: `string`;
`triageAction?`: `string`;
`vendor?`: `string`;
`voterRole?`: `string`;
`wasRetried?`: `boolean`;
\}[]

###### Inherited from

[`OutcomeStore`](#outcomestore).[`query`](#query)

##### queryByModelWithFamilyFallback()

```ts
queryByModelWithFamilyFallback(modelId, options?): {
  family?: string;
  outcomes: readonly {
     baselineId?: string;
     category:   | "planning"
        | "architecture"
        | "code_generation"
        | "code_review"
        | "research"
        | "security_review"
        | "documentation"
        | "testing"
        | "devops"
        | "exploration";
     cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
     durationMs: number;
     errorMessage?: string;
     failureCategory?:   | "unknown"
        | "timeout"
        | "parse"
        | "connection"
        | "execution"
        | "rate_limit"
        | "validation"
        | "authentication"
        | "crash"
        | "adapter_unavailable"
        | "generic";
     family?: string;
     id: string;
     model: string;
     qualitySignals?: string[];
     requestId?: string;
     retryCount?: number;
     routingStage?: string;
     source: "delegate" | "consensus" | "manual";
     success: boolean;
     timestamp: string;
     traceId?: string;
     triageAction?: string;
     vendor?: string;
     voterRole?: string;
     wasRetried?: boolean;
  }[];
  scope: "literal" | "empty" | "family";
  vendor?: string;
};
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L130)

Query outcomes for a specific model with a family-level warm-start
fallback (#2548). When the literal `modelId` has fewer than
`threshold` samples in the store, broaden the result to the model's
`{vendor, family}` siblings — siblings within a family share enough
behavior profile that their outcomes are useful priors for cold
starts after a retirement.

Returns the outcomes and a `scope` flag so callers know whether
they're consuming literal-id data or family-broadened data.

###### Parameters

###### modelId

`string`

###### options?

###### extraFilter?

`Omit`\<\{
`baselineId?`: `string`;
`category?`: \| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"`;
`cli?`: `"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`;
`excludeQualitySignals?`: `string`[];
`failureCategory?`: \| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"`;
`limit?`: `number`;
`since?`: `string`;
`source?`: `"delegate"` \| `"consensus"` \| `"manual"`;
`success?`: `boolean`;
\}, `"limit"`\>

###### threshold?

`number`

###### Returns

```ts
{
  family?: string;
  outcomes: readonly {
     baselineId?: string;
     category:   | "planning"
        | "architecture"
        | "code_generation"
        | "code_review"
        | "research"
        | "security_review"
        | "documentation"
        | "testing"
        | "devops"
        | "exploration";
     cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
     durationMs: number;
     errorMessage?: string;
     failureCategory?:   | "unknown"
        | "timeout"
        | "parse"
        | "connection"
        | "execution"
        | "rate_limit"
        | "validation"
        | "authentication"
        | "crash"
        | "adapter_unavailable"
        | "generic";
     family?: string;
     id: string;
     model: string;
     qualitySignals?: string[];
     requestId?: string;
     retryCount?: number;
     routingStage?: string;
     source: "delegate" | "consensus" | "manual";
     success: boolean;
     timestamp: string;
     traceId?: string;
     triageAction?: string;
     vendor?: string;
     voterRole?: string;
     wasRetried?: boolean;
  }[];
  scope: "literal" | "empty" | "family";
  vendor?: string;
}
```

###### family?

```ts
readonly optional family?: string;
```

###### outcomes

```ts
readonly outcomes: readonly {
  baselineId?: string;
  category:   | "planning"
     | "architecture"
     | "code_generation"
     | "code_review"
     | "research"
     | "security_review"
     | "documentation"
     | "testing"
     | "devops"
     | "exploration";
  cli: "unknown" | "claude" | "gemini" | "codex" | "opencode";
  durationMs: number;
  errorMessage?: string;
  failureCategory?:   | "unknown"
     | "timeout"
     | "parse"
     | "connection"
     | "execution"
     | "rate_limit"
     | "validation"
     | "authentication"
     | "crash"
     | "adapter_unavailable"
     | "generic";
  family?: string;
  id: string;
  model: string;
  qualitySignals?: string[];
  requestId?: string;
  retryCount?: number;
  routingStage?: string;
  source: "delegate" | "consensus" | "manual";
  success: boolean;
  timestamp: string;
  traceId?: string;
  triageAction?: string;
  vendor?: string;
  voterRole?: string;
  wasRetried?: boolean;
}[];
```

###### scope

```ts
readonly scope: "literal" | "empty" | "family";
```

###### vendor?

```ts
readonly optional vendor?: string;
```

###### Inherited from

[`OutcomeStore`](#outcomestore).[`queryByModelWithFamilyFallback`](#querybymodelwithfamilyfallback)

##### reclassifyAll()

```ts
reclassifyAll(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L203)

Backfill: reclassify all entries missing failureCategory (#1444).
Also reclassifies 'unknown' entries with no error message as 'execution'
(#1511) since 'unknown' with no diagnostic info is less useful than the
default 'execution' category.
Returns count of reclassified entries.

###### Returns

`number`

###### Inherited from

[`OutcomeStore`](#outcomestore).[`reclassifyAll`](#reclassifyall)

##### summarize()

```ts
summarize(filter?): PerformanceSummary;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L161)

Aggregate outcomes into a performance summary.

###### Parameters

###### filter?

###### baselineId?

`string` = `...`

Restrict to outcomes recorded against a specific baseline (#2697).

###### category?

\| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"` = `...`

###### cli?

`"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"` = `...`

###### excludeQualitySignals?

`string`[] = `...`

Exclude outcomes with any of these quality signals (#1680).

###### failureCategory?

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"` = `...`

###### limit?

`number` = `...`

###### since?

`string` = `...`

###### source?

`"delegate"` \| `"consensus"` \| `"manual"` = `...`

###### success?

`boolean` = `...`

###### Returns

[`PerformanceSummary`](#performancesummary)

###### Inherited from

[`OutcomeStore`](#outcomestore).[`summarize`](#summarize)

---

### WorkflowOrchestratorAdapter

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L66)

Adapter that wraps IWorkflowEngine with IOrchestrator interface.

This adapter bridges the workflow-specific interface to the canonical
orchestrator interface, enabling workflow-based orchestration through
the unified IOrchestrator contract.

#### Implements

- [`IOrchestrator`](#iorchestrator)

#### Constructors

##### Constructor

```ts
new WorkflowOrchestratorAdapter(engine, logger?): WorkflowOrchestratorAdapter;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L75)

###### Parameters

###### engine

[`IWorkflowEngine`](core.md#iworkflowengine)

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`WorkflowOrchestratorAdapter`](#workfloworchestratoradapter)

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L67)

Unique orchestrator instance ID

###### Implementation of

[`IOrchestrator`](#iorchestrator).[`id`](#id-4)

##### type

```ts
readonly type: OrchestratorType = 'workflow';
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L68)

Orchestrator type

###### Implementation of

[`IOrchestrator`](#iorchestrator).[`type`](#type-2)

#### Methods

##### cancel()

```ts
cancel(executionId, reason?): Promise<Result<void, OrchestratorError>>;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L184)

Cancel a running execution.

###### Parameters

###### executionId

`string`

Execution ID to cancel

###### reason?

`string`

Optional cancellation reason

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OrchestratorError`](#orchestratorerror)\>\>

Result with void or OrchestratorError

###### Implementation of

[`IOrchestrator`](#iorchestrator).[`cancel`](#cancel-1)

##### execute()

```ts
execute(
   definition,
   inputs,
_options?): Promise<Result<OrchestratorResult, OrchestratorError>>;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L81)

Execute an orchestration.

###### Parameters

###### definition

[`OrchestratorDefinition`](#orchestratordefinition)

What to orchestrate (task, workflow, or policy)

###### inputs

`Record`\<`string`, `unknown`\>

Input values for the orchestration

###### \_options?

[`OrchestratorExecuteOptions`](#orchestratorexecuteoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`OrchestratorResult`](#orchestratorresult), [`OrchestratorError`](#orchestratorerror)\>\>

Result with OrchestratorResult or OrchestratorError

###### Implementation of

[`IOrchestrator`](#iorchestrator).[`execute`](#execute-1)

##### getHistory()

```ts
getHistory(limit?): OrchestratorResult[];
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L217)

Get execution history.
Optional - for orchestrators that track history.

###### Parameters

###### limit?

`number`

Maximum number of executions to return

###### Returns

[`OrchestratorResult`](#orchestratorresult)[]

Array of past execution results

###### Implementation of

[`IOrchestrator`](#iorchestrator).[`getHistory`](#gethistory-1)

##### getStatus()

```ts
getStatus(executionId): ExecutionStatus;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L180)

Get status of an execution.

###### Parameters

###### executionId

`string`

Execution ID to check

###### Returns

`ExecutionStatus`

Current execution status

###### Implementation of

[`IOrchestrator`](#iorchestrator).[`getStatus`](#getstatus-1)

## Interfaces

### AdaptiveThresholdResult

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L24)

Result of computing adaptive thresholds for a CLI+category pair.

#### Properties

##### baseline

```ts
readonly baseline: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L26)

Adjusted baseline success rate (default: 0.7).

##### coldStart

```ts
readonly coldStart: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L30)

Minimum samples before adjustment (always 10).

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L34)

Confidence in the result (0-1), based on sample size.

##### maxBonus

```ts
readonly maxBonus: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L28)

Adjusted max bonus cap (default: 10).

##### sampleCount

```ts
readonly sampleCount: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L36)

Number of outcomes used for computation.

##### trend

```ts
readonly trend: Trend;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L32)

Detected performance trend.

---

### Checkpoint

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L63)

A snapshot of graph execution state at a given step boundary.
Contains all information needed to resume execution.

#### Properties

##### completedResults

```ts
readonly completedResults: readonly NodeResult[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L77)

Results of all completed nodes so far.

##### createdAt

```ts
readonly createdAt: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L79)

ISO timestamp when checkpoint was created.

##### executionId

```ts
readonly executionId: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L67)

Execution ID this checkpoint belongs to.

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L65)

Unique checkpoint ID.

##### interrupt?

```ts
readonly optional interrupt?: CheckpointInterrupt;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L87)

If present, the checkpoint was created because a node returned an
Interrupt. The resume API uses this to know which node to re-run and
which interrupt id to match resume values against. (#1895)

##### metadata?

```ts
readonly optional metadata?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L81)

Optional metadata for debugging.

##### pendingNodeIds

```ts
readonly pendingNodeIds: readonly string[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L75)

IDs of nodes ready to run next.

##### schemaVersion

```ts
readonly schemaVersion: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L69)

Schema version for deserialization.

##### state

```ts
readonly state: Readonly<GraphState>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L73)

Full graph state at this point.

##### stepNumber

```ts
readonly stepNumber: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L71)

Step number when this checkpoint was taken.

---

### CheckpointSummary

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L93)

Summary of a checkpoint (for listing without full state).

#### Properties

##### completedNodeCount

```ts
readonly completedNodeCount: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L98)

##### createdAt

```ts
readonly createdAt: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L97)

##### executionId

```ts
readonly executionId: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L95)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L94)

##### pendingNodeCount

```ts
readonly pendingNodeCount: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L99)

##### stepNumber

```ts
readonly stepNumber: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L96)

---

### CompiledGraph

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L243)

Compiled graph definition — validated and ready for execution.
Immutable after compilation.

#### Properties

##### edges

```ts
readonly edges: readonly GraphEdge[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:245](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L245)

##### entryEdges

```ts
readonly entryEdges: readonly GraphEdge[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:247](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L247)

##### nodes

```ts
readonly nodes: ReadonlyMap<string, GraphNode>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L244)

##### stateSchema

```ts
readonly stateSchema: Readonly<StateSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:246](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L246)

---

### CompileOptions

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline-types.ts#L43)

Options for compiling a spec to a graph.

#### Properties

##### handlerFactory?

```ts
readonly optional handlerFactory?: NodeHandlerFactory;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline-types.ts#L45)

Factory for creating node handlers. Defaults to dry-run placeholders.

---

### ConsensusGateNodeOptions

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L70)

Options for [createConsensusGateNode](#createconsensusgatenode).

#### Properties

##### proposalFrom

```ts
readonly proposalFrom: (state) => ConsensusProposalInput;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L76)

Derive the proposal/context from graph state (no secrets/ambient state).

###### Parameters

###### state

`Readonly`\<[`GraphState`](#graphstate)\>

###### Returns

[`ConsensusProposalInput`](#consensusproposalinput)

##### verdictKey

```ts
readonly verdictKey: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L74)

Graph-state key the typed verdict is written under.

##### voter

```ts
readonly voter: ConsensusVoter;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L72)

The voter to run at this gate.

---

### ConsensusProposalInput

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L27)

What a consensus voter is asked to evaluate.

#### Properties

##### context?

```ts
readonly optional context?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L31)

Optional supporting context (e.g. research) the voter may weigh.

##### proposal

```ts
readonly proposal: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L29)

The proposal text under review (e.g. a plan).

---

### ConsensusVerdict

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L35)

The typed verdict a consensus round produces.

#### Properties

##### detail?

```ts
readonly optional detail?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L41)

Optional structured detail (approval %, the raw vote, …) for consumers.

##### feedback

```ts
readonly feedback: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L39)

Reviewer feedback (empty on a clean approval).

##### outcome

```ts
readonly outcome: "rejected" | "approved";
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L37)

Whether the proposal cleared the consensus bar.

---

### CriterionFailure

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L19)

A specific failure for one unmet criterion.

#### Properties

##### criterion

```ts
readonly criterion: string;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L21)

The unmet acceptance criterion

##### explanation

```ts
readonly explanation: string;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L25)

Human-readable explanation

##### type

```ts
readonly type: FailureType;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L23)

What type of failure occurred

---

### DecomposeError

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L77)

Error detail when decomposition fails.

#### Properties

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L78)

##### subtaskId?

```ts
readonly optional subtaskId?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L79)

---

### FailureAnalysis

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L43)

Complete failure analysis result.

#### Properties

##### failures

```ts
readonly failures: readonly CriterionFailure[];
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L49)

Individual criterion failures

##### passed

```ts
readonly passed: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L45)

Overall pass/fail

##### satisfaction

```ts
readonly satisfaction: number;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L47)

Satisfaction score from validation (0-1)

##### suggestions

```ts
readonly suggestions: readonly ImprovementSuggestion[];
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L51)

Suggested improvements

---

### FailureAnalysisError

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L57)

Error from failure analysis.

#### Properties

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L58)

---

### GraphExecuteOptions

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:312](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L312)

Options for graph execution.

#### Properties

##### checkpointStore?

```ts
readonly optional checkpointStore?: ICheckpointStore;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:327](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L327)

Optional checkpoint store for durable execution (Issue #837).

##### executionId?

```ts
readonly optional executionId?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:329](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L329)

Execution ID for checkpoint grouping. Required with checkpointStore.

##### maxSteps?

```ts
readonly optional maxSteps?: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:315](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L315)

##### onEvent?

```ts
readonly optional onEvent?: (event) => void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:331](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L331)

Event listener for streaming observation (Issue #838).

###### Parameters

###### event

[`GraphEvent`](#graphevent)

###### Returns

`void`

##### onNodeComplete?

```ts
readonly optional onNodeComplete?: (result) => void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:316](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L316)

###### Parameters

###### result

[`NodeResult`](#noderesult)

###### Returns

`void`

##### priorResults?

```ts
readonly optional priorResults?: ReadonlyMap<string, NodeResult>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:325](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L325)

Prior NodeResults to replay instead of re-executing (#3534, selective-retry).
A node with a `success` entry here is skipped — its result (including
`stateUpdates`) is reused so downstream nodes still see the correct state —
while nodes absent here, or present with a non-`success` status, are
re-executed. Lets `retryFailed` re-run only the failed/skipped nodes while
replaying the prior successes.

##### resumeValues?

```ts
readonly optional resumeValues?: Readonly<Record<string, unknown>>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:337](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L337)

Values supplied for HITL resume. Keyed by Interrupt id; passed to each
NodeHandler via its NodeContext on this run only. Empty when not
resuming. (#1895)

##### signal?

```ts
readonly optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:313](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L313)

##### timeout?

```ts
readonly optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L314)

---

### GraphExecutionResult

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:291](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L291)

Result of a full graph execution.

#### Properties

##### finalState

```ts
readonly finalState: Readonly<GraphState>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:292](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L292)

##### halted?

```ts
readonly optional halted?: {
  checkpointId: string;
  interruptId: string;
  nodeId: string;
  value: unknown;
};
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:301](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L301)

Set when execution paused on an Interrupt return. The checkpoint
referenced here can be passed to `resumeFromCheckpoint(...)` along with a
matching `{[interruptId]: resumeValue}` map. (#1895)

###### checkpointId

```ts
readonly checkpointId: string;
```

###### interruptId

```ts
readonly interruptId: string;
```

###### nodeId

```ts
readonly nodeId: string;
```

###### value

```ts
readonly value: unknown;
```

##### nodeResults

```ts
readonly nodeResults: readonly NodeResult[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L293)

##### stepsExecuted

```ts
readonly stepsExecuted: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:295](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L295)

##### totalDurationMs

```ts
readonly totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:294](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L294)

---

### GraphNode

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L200)

A node in the workflow graph.

#### Properties

##### handler

```ts
readonly handler: NodeHandler;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L202)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L201)

##### preconditions?

```ts
readonly optional preconditions?: readonly PreconditionConfig[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L206)

Precondition hooks run before node execution (Issue #997).

##### retries?

```ts
readonly optional retries?: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L204)

##### timeout?

```ts
readonly optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L203)

##### verify?

```ts
readonly optional verify?: NodeHook;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:208](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L208)

Post-step verification hook run after node execution (Issue #994).

---

### HookError

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L35)

Error type for hook failures — identifies which hook failed and why.

#### Properties

##### hookName

```ts
readonly hookName: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L36)

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L38)

##### nodeId

```ts
readonly nodeId: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L37)

---

### ICheckpointStore

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L110)

Abstract checkpoint store interface.
Implementations provide persistence (in-memory, JSON file, SQLite, etc.).

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L133)

Clears all checkpoints.

###### Returns

`void`

##### delete()

```ts
delete(id): boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L124)

Deletes a checkpoint by ID. Returns true if found and deleted.

###### Parameters

###### id

`string`

###### Returns

`boolean`

##### deleteExecution()

```ts
deleteExecution(executionId): number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L127)

Deletes all checkpoints for a given execution ID.

###### Parameters

###### executionId

`string`

###### Returns

`number`

##### latest()

```ts
latest(executionId): Checkpoint | undefined;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L118)

Loads the latest checkpoint for a given execution ID.

###### Parameters

###### executionId

`string`

###### Returns

[`Checkpoint`](#checkpoint) \| `undefined`

##### list()

```ts
list(executionId): readonly CheckpointSummary[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L121)

Lists all checkpoint summaries for a given execution ID.

###### Parameters

###### executionId

`string`

###### Returns

readonly [`CheckpointSummary`](#checkpointsummary)[]

##### load()

```ts
load(id): Checkpoint | undefined;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L115)

Loads a checkpoint by ID. Returns undefined if not found.

###### Parameters

###### id

`string`

###### Returns

[`Checkpoint`](#checkpoint) \| `undefined`

##### save()

```ts
save(checkpoint): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L112)

Saves a checkpoint. Overwrites if ID already exists.

###### Parameters

###### checkpoint

[`Checkpoint`](#checkpoint)

###### Returns

`void`

##### size()

```ts
size(): number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L130)

Returns total number of checkpoints across all executions.

###### Returns

`number`

---

### ImprovementSuggestion

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L31)

A suggested improvement to address failures.

#### Properties

##### action

```ts
readonly action: string;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L33)

What action to take

##### priority

```ts
readonly priority: 1 | 2 | 3;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L37)

Priority: 1 (highest) to 3 (lowest)

##### targetCriterion

```ts
readonly targetCriterion: string;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L35)

Which criterion this addresses

---

### IOrchestrator

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L149)

Unified orchestrator interface.

This interface provides a canonical path for all orchestration
in the system, regardless of the underlying strategy.

#### Example

```typescript
const orchestrator: IOrchestrator = factory.create('orchestrator');

const result = await orchestrator.execute({ type: 'task', task: myTask }, { timeout: 30000 });

if (result.ok) {
  console.log('Output:', result.value.output);
}
```

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L151)

Unique orchestrator instance ID

##### type

```ts
readonly type: OrchestratorType;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L154)

Orchestrator type

#### Methods

##### cancel()

```ts
cancel(executionId, reason?): Promise<Result<void, OrchestratorError>>;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L185)

Cancel a running execution.

###### Parameters

###### executionId

`string`

Execution ID to cancel

###### reason?

`string`

Optional cancellation reason

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OrchestratorError`](#orchestratorerror)\>\>

Result with void or OrchestratorError

##### execute()

```ts
execute(
   definition,
   inputs,
options?): Promise<Result<OrchestratorResult, OrchestratorError>>;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L164)

Execute an orchestration.

###### Parameters

###### definition

[`OrchestratorDefinition`](#orchestratordefinition)

What to orchestrate (task, workflow, or policy)

###### inputs

`Record`\<`string`, `unknown`\>

Input values for the orchestration

###### options?

[`OrchestratorExecuteOptions`](#orchestratorexecuteoptions)

Execution options (timeout, budget, callbacks)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`OrchestratorResult`](#orchestratorresult), [`OrchestratorError`](#orchestratorerror)\>\>

Result with OrchestratorResult or OrchestratorError

##### getHistory()?

```ts
optional getHistory(limit?): OrchestratorResult[];
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:218](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L218)

Get execution history.
Optional - for orchestrators that track history.

###### Parameters

###### limit?

`number`

Maximum number of executions to return

###### Returns

[`OrchestratorResult`](#orchestratorresult)[]

Array of past execution results

##### getStatus()

```ts
getStatus(executionId): ExecutionStatus;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L176)

Get status of an execution.

###### Parameters

###### executionId

`string`

Execution ID to check

###### Returns

`ExecutionStatus`

Current execution status

##### listAgents()?

```ts
optional listAgents(): {
  id: string;
  role: AgentRole;
}[];
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L209)

List registered agents.
Optional - not all orchestrators manage agent pools.

###### Returns

\{
`id`: `string`;
`role`: [`AgentRole`](core.md#agentrole);
\}[]

Array of registered agent IDs and roles

##### registerAgent()?

```ts
optional registerAgent(agent): void;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L193)

Register an agent with this orchestrator.
Optional - not all orchestrators manage agent pools.

###### Parameters

###### agent

[`IAgent`](core.md#iagent)

Agent to register

###### Returns

`void`

##### unregisterAgent()?

```ts
optional unregisterAgent(agentId): void;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L201)

Unregister an agent.
Optional - not all orchestrators manage agent pools.

###### Parameters

###### agentId

`string`

Agent ID to unregister

###### Returns

`void`

---

### IOrchestratorFactory

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:224](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L224)

Factory for creating orchestrators.

#### Methods

##### create()

```ts
create(type, config?): IOrchestrator;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:232](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L232)

Create an orchestrator instance.

###### Parameters

###### type

[`OrchestratorType`](#orchestratortype-1)

Orchestrator type

###### config?

`Record`\<`string`, `unknown`\>

Optional configuration

###### Returns

[`IOrchestrator`](#iorchestrator)

New orchestrator instance

##### listTypes()

```ts
listTypes(): OrchestratorType[];
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L237)

List available orchestrator types.

###### Returns

[`OrchestratorType`](#orchestratortype-1)[]

---

### IWorkflowRouter

Defined in: [packages/nexus-agents/src/orchestration/workflow-router.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router.ts#L85)

Public interface for the workflow router.

#### Methods

##### getMetrics()

```ts
getMetrics(pattern?): readonly PatternMetrics[];
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router.ts#L94)

Aggregates this instance's recorded outcomes, optionally filtered by pattern.

###### Parameters

###### pattern?

[`WorkflowPattern`](#workflowpattern)

###### Returns

readonly [`PatternMetrics`](#patternmetrics)[]

##### recordOutcome()

```ts
recordOutcome(outcome): void;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router.ts#L92)

Records an execution outcome into this router instance's buffer.
Observability only — `route()` never reads it back (#2824).

###### Parameters

###### outcome

[`PatternOutcome`](#patternoutcome)

###### Returns

`void`

##### route()

```ts
route(signals, options?): WorkflowRoutingDecision;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router.ts#L87)

Routes a task to the optimal workflow pattern.

###### Parameters

###### signals

[`TaskSignals`](#tasksignals)

###### options?

[`WorkflowRouterOptions`](#workflowrouteroptions)

###### Returns

[`WorkflowRoutingDecision`](#workflowroutingdecision)

---

### NodeHookContext

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L26)

Context passed to node hooks (preconditions and verification).
Provides read-only access to current execution state.

#### Properties

##### nodeId

```ts
readonly nodeId: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L27)

##### state

```ts
readonly state: Readonly<GraphState>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L28)

##### stepNumber

```ts
readonly stepNumber: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L29)

---

### NodeResult

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L253)

Result of a single node execution.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L256)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:258](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L258)

##### errorCategory?

```ts
readonly optional errorCategory?: "validation" | "internal" | "transient" | "permission" | "business";
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:263](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L263)

Coarse failure category for a `failed` result (#3534, selective-retry).
Classifies the failure so retry logic can gate on it; only set on failure.

##### gotoTarget?

```ts
readonly optional gotoTarget?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:285](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L285)

Set when the node returned a Command with `goto`. The executor uses this
to redirect the next runnable set instead of resolving outgoing edges.
Validated against the compiled graph; unknown targets are logged + ignored.
(#2425)

##### interrupt?

```ts
readonly optional interrupt?: Interrupt;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:278](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L278)

Set when the node returned an Interrupt envelope (#1895).

##### isRetryable?

```ts
readonly optional isRetryable?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:269](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L269)

Whether re-running this failed node is safe (derived from `errorCategory`;
only `transient` is retry-safe by default, #3534). Selective-retry uses
this to re-run transient failures and leave permanent ones alone.

##### nodeId

```ts
readonly nodeId: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L254)

##### policyBlocked?

```ts
readonly optional policyBlocked?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:276](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L276)

Set when the node failed because a policy gate denied the stage boundary
(#3177). A policy block is terminal and non-retryable: it halts the
pipeline even under `continueOnFailure` (unlike an ordinary failed node,
which continue-mode tolerates).

##### stateUpdates

```ts
readonly stateUpdates: Partial<GraphState>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:255](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L255)

##### status

```ts
readonly status: "failed" | "success" | "skipped" | "interrupted";
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L257)

---

### OrchestratorExecuteOptions

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L27)

Orchestrator execution options.

#### Properties

##### maxSteps?

```ts
optional maxSteps?: number;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L33)

Maximum number of steps/iterations

##### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L39)

Additional metadata passed to orchestrator

##### onProgress?

```ts
optional onProgress?: (status) => void;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L37)

Callback for progress updates

###### Parameters

###### status

`ExecutionStatus`

###### Returns

`void`

##### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L29)

Abort signal for cancellation

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L31)

Maximum execution time in ms

##### tokenBudget?

```ts
optional tokenBudget?: number;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L35)

Token budget for LLM calls

---

### OrchestratorFactoryConfig

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:259](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L259)

Configuration for OrchestratorFactory.
(Enhanced per ADR-0014 - Orchestrator Interface Unification)

#### Properties

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:261](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L261)

Logger instance

##### modelAdapter?

```ts
optional modelAdapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:263](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L263)

Model adapter for agent-based orchestrators

##### orchestratorAgent?

```ts
optional orchestratorAgent?: OrchestratorAgentLike;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L274)

Alias for techLead (preferred, Issue #759)

##### puppeteerOrchestrator?

```ts
optional puppeteerOrchestrator?: {
  execute: Promise<Result<unknown, unknown>>;
};
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:280](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L280)

Pre-created PuppeteerOrchestrator instance. Input stays `unknown`
because Puppeteer accepts arbitrary policy-shaped tasks, not the
core `Task` type that the regular agent path requires.

###### execute()

```ts
execute(task): Promise<Result<unknown, unknown>>;
```

###### Parameters

###### task

`unknown`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`unknown`, `unknown`\>\>

##### techLead?

```ts
optional techLead?: OrchestratorAgentLike;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L272)

Pre-created orchestrator agent instance for orchestrator adapter.
Narrowed from `(task: unknown)` to `OrchestratorAgentLike` so a real
`Orchestrator` instance can be passed without an `as unknown as` cast
(#2944). Task-input contract matches `OrchestratorAdapter.setOrchestrator`.

##### workflowConfig?

```ts
optional workflowConfig?: WorkflowEngineFactoryConfig;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:265](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L265)

Workflow engine config

---

### OrchestratorResult

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L78)

Result of orchestration execution.

#### Properties

##### agentsUsed

```ts
agentsUsed: string[];
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L92)

Agents involved

##### executionId

```ts
executionId: string;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L80)

Unique execution ID

##### orchestratorType

```ts
orchestratorType: OrchestratorType;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L82)

Orchestrator type that executed

##### output

```ts
output: unknown;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L86)

Final aggregated output

##### steps

```ts
steps: OrchestratorStep[];
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L84)

Steps executed

##### totalDurationMs

```ts
totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L88)

Total execution time in ms

##### totalTokensUsed

```ts
totalTokensUsed: number;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L90)

Total tokens consumed

---

### OrchestratorStep

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L54)

Step in an orchestration execution.

#### Properties

##### action

```ts
action: string;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L62)

Step action/description

##### agentId

```ts
agentId: string;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L58)

Agent that executed the step

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L66)

Duration in ms

##### error

```ts
error: string | undefined;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L72)

Error if failed

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L56)

Step identifier

##### output

```ts
output: unknown;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L64)

Step output

##### role

```ts
role: AgentRole;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L60)

Agent role

##### status

```ts
status: 'failed' | 'success' | 'skipped';
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L70)

Status

##### tokensUsed

```ts
tokensUsed: number;
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L68)

Tokens used in this step

---

### OutcomeStoreConfig

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L28)

#### Extended by

- [`PersistentOutcomeStoreConfig`](#persistentoutcomestoreconfig)

#### Properties

##### maxEntries?

```ts
readonly optional maxEntries?: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L29)

##### registry?

```ts
readonly optional registry?: ModelRegistry;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L36)

Registry used to resolve vendor/family from `outcome.model` at write
time (#2548). Defaults to the process singleton. Pass an explicit
registry for tests that want deterministic resolution without
touching global state.

---

### PatternMetrics

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L111)

Aggregated performance metrics for a pattern-task combination.

#### Properties

##### avgDurationMs

```ts
readonly avgDurationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L117)

##### pattern

```ts
readonly pattern: WorkflowPattern;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L112)

##### successCount

```ts
readonly successCount: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L115)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L116)

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L113)

##### totalExecutions

```ts
readonly totalExecutions: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L114)

---

### PatternOutcome

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L95)

Recorded outcome for pattern performance tracking.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L103)

Duration in milliseconds

##### pattern

```ts
readonly pattern: WorkflowPattern;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L97)

Pattern that was used

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L101)

Whether execution succeeded

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L99)

Task type from analyzer

##### timestamp

```ts
readonly timestamp: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L105)

Timestamp of recording

---

### PerformanceSummary

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L359)

Aggregated performance summary from recorded outcomes.

#### Properties

##### avgDurationMs

```ts
readonly avgDurationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L362)

##### byCategory

```ts
readonly byCategory: ReadonlyMap<string, GroupStats>;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:364](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L364)

##### byCli

```ts
readonly byCli: ReadonlyMap<string, GroupStats>;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L363)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L361)

##### totalTasks

```ts
readonly totalTasks: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:360](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L360)

---

### PersistentOutcomeStoreConfig

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts#L26)

#### Extends

- [`OutcomeStoreConfig`](#outcomestoreconfig)

#### Properties

##### dataDir?

```ts
readonly optional dataDir?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts#L30)

Override the data directory (useful for testing).

##### filePath?

```ts
readonly optional filePath?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store-persistence.ts#L28)

Override the file path (useful for testing).

##### maxEntries?

```ts
readonly optional maxEntries?: number;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L29)

###### Inherited from

[`OutcomeStoreConfig`](#outcomestoreconfig).[`maxEntries`](#maxentries)

##### registry?

```ts
readonly optional registry?: ModelRegistry;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L36)

Registry used to resolve vendor/family from `outcome.model` at write
time (#2548). Defaults to the process singleton. Pass an explicit
registry for tests that want deterministic resolution without
touching global state.

###### Inherited from

[`OutcomeStoreConfig`](#outcomestoreconfig).[`registry`](#registry)

---

### PipelineError

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline-types.ts#L22)

Error detail when the spec pipeline fails.

#### Properties

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline-types.ts#L23)

##### stage

```ts
readonly stage: PipelineStage;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline-types.ts#L24)

---

### PreconditionConfig

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L51)

Configuration for a precondition hook.
Preconditions run before node execution.
If a required precondition fails, the node is skipped.

#### Properties

##### hook

```ts
readonly hook: NodeHook;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L53)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L52)

##### required?

```ts
readonly optional required?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L55)

If true (default), failure prevents node execution.

---

### PreconditionOutcome

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L35)

Outcome of a single precondition hook.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L38)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L39)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L36)

##### passed

```ts
readonly passed: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L37)

---

### PreconditionResult

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L29)

Result of running all preconditions for a node.

#### Properties

##### passed

```ts
readonly passed: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L30)

##### results

```ts
readonly results: readonly PreconditionOutcome[];
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L31)

---

### RunGraphWithConsensusOptions

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L107)

Options for [runGraphWithConsensus](#rungraphwithconsensus).

#### Properties

##### initialState?

```ts
readonly optional initialState?: GraphState;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L120)

Initial graph state.

##### produce

```ts
readonly produce: NodeHandler;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L112)

Work node that produces the proposal — it must write the proposal text to
`proposalKey` (default `'proposal'`) in its returned state patch.

##### proposalKey?

```ts
readonly optional proposalKey?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L116)

State key the produce node writes the proposal to. Default `'proposal'`.

##### verdictKey?

```ts
readonly optional verdictKey?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L118)

State key the verdict is written to. Default `'consensusVerdict'`.

##### voter

```ts
readonly voter: ConsensusVoter;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L114)

The voter run at the gate.

---

### ScenarioError

Defined in: [packages/nexus-agents/src/orchestration/scenario-validator-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/scenario-validator-types.ts#L46)

Error detail when scenario validation fails.

#### Properties

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/orchestration/scenario-validator-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/scenario-validator-types.ts#L47)

---

### SpecExecutionError

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L22)

Error detail when spec execution fails.

#### Properties

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L23)

##### stage

```ts
readonly stage: ExecutionStage;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L24)

---

### SpecExecutionResult

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L36)

Result of executing a spec end-to-end.

#### Properties

##### dag

```ts
readonly dag: {
  edges: {
     from: string;
     to: string;
  }[];
  nodes: {
     capabilities: string[];
     complexity: "simple" | "complex" | "expert" | "moderate";
     dependsOn: string[];
     description: string;
     id: string;
     sourceRequirement?: string;
     type: "code" | "test" | "refactor" | "docs" | "config";
  }[];
  roots: string[];
  specTitle: string;
  totalComplexity: "simple" | "complex" | "expert" | "moderate";
};
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L38)

The decomposed task DAG

###### edges

```ts
edges: {
  from: string;
  to: string;
}
[];
```

Dependency edges (from must complete before to)

###### nodes

```ts
nodes: {
  capabilities: string[];
  complexity: "simple" | "complex" | "expert" | "moderate";
  dependsOn: string[];
  description: string;
  id: string;
  sourceRequirement?: string;
  type: "code" | "test" | "refactor" | "docs" | "config";
}[];
```

All subtask nodes

###### roots

```ts
roots: string[];
```

Subtask IDs that can execute in parallel (no dependencies)

###### specTitle

```ts
specTitle: string;
```

Source spec title for traceability

###### totalComplexity

```ts
totalComplexity: "simple" | "complex" | "expert" | "moderate" = ComplexityLevelSchema;
```

Total estimated complexity across all subtasks

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L44)

Total execution duration in milliseconds

##### outputs

```ts
readonly outputs: readonly string[];
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L40)

Raw execution outputs from graph nodes

##### validation

```ts
readonly validation: {
  allMet: boolean;
  criteria: {
     criterion: string;
     matchedResults: string[];
     met: boolean;
  }[];
  metCount: number;
  satisfaction: number;
  totalCriteria: number;
};
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L42)

Scenario validation against acceptance criteria

###### allMet

```ts
allMet: boolean;
```

Whether all criteria are met

###### criteria

```ts
criteria: {
  criterion: string;
  matchedResults: string[];
  met: boolean;
}[];
```

Per-criterion results

###### metCount

```ts
metCount: number;
```

Number of criteria met

###### satisfaction

```ts
satisfaction: number;
```

Satisfaction score from 0 (none met) to 1 (all met)

###### totalCriteria

```ts
totalCriteria: number;
```

Total acceptance criteria count

---

### SpecParseError

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L78)

Error detail when spec parsing fails.

#### Properties

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L79)

##### section?

```ts
readonly optional section?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L80)

---

### StateFieldSchema

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L74)

Schema entry for a single state field — name, default, and merge strategy.

#### Type Parameters

##### T

`T` = `unknown`

#### Properties

##### defaultValue

```ts
readonly defaultValue: T;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L75)

##### reducer

```ts
readonly reducer: StateReducer<T>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L76)

---

### TaskSignals

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L39)

Input signals for workflow routing decisions.
Combines explicit caller hints with SharedTaskAnalyzer output.

#### Properties

##### dependencyStructure?

```ts
readonly optional dependencyStructure?: DependencyStructure;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L47)

Dependency structure classification (optional hint)

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L41)

Natural language task description

##### forcePattern?

```ts
readonly optional forcePattern?: WorkflowPattern;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L57)

Force a specific pattern (escape hatch per DevEx feedback)

##### hasDependencies?

```ts
readonly optional hasDependencies?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L45)

Whether subtasks depend on each other (optional hint)

##### isNovel?

```ts
readonly optional isNovel?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L51)

Whether this task type has been seen before

##### qualityRequirement?

```ts
readonly optional qualityRequirement?: QualityRequirement;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L55)

Quality requirement level

##### requiresConsensus?

```ts
readonly optional requiresConsensus?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L49)

Whether multi-perspective consensus is needed

##### subtaskCount?

```ts
readonly optional subtaskCount?: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L43)

Estimated number of subtasks (optional hint)

##### timeConstraint?

```ts
readonly optional timeConstraint?: TimeConstraint;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L53)

Time urgency

---

### VerificationResult

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L43)

Result of running verification on a node.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L45)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L46)

##### passed

```ts
readonly passed: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L44)

---

### WorkflowAdapterConfig

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L54)

Configuration for WorkflowOrchestratorAdapter.

#### Extends

- [`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig)

#### Properties

##### budgetCircuitBreakerConfig?

```ts
optional budgetCircuitBreakerConfig?: Partial<{
  cooldownMs: number;
  criticalThreshold: number;
  hardStop: boolean;
  recoveryProbes: number;
  stepReserve: number;
  warningThreshold: number;
}>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L45)

Budget circuit breaker configuration

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`budgetCircuitBreakerConfig`](workflows.md#budgetcircuitbreakerconfig)

##### builtInTemplates?

```ts
optional builtInTemplates?: Map<string, WorkflowDefinition>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L65)

Pre-loaded built-in templates (if not provided, loads at creation time)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`builtInTemplates`](workflows.md#builtintemplates)

##### contextManagerConfig?

```ts
optional contextManagerConfig?: Omit<ContextManagerConfig, "budget">;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L41)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`contextManagerConfig`](workflows.md#contextmanagerconfig)

##### defaultBudget?

```ts
optional defaultBudget?: ContextBudget;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L42)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`defaultBudget`](workflows.md#defaultbudget)

##### defaultTimeoutMs?

```ts
optional defaultTimeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L38)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`defaultTimeoutMs`](workflows.md#defaulttimeoutms)

##### enableBudgetEnforcement?

```ts
optional enableBudgetEnforcement?: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L47)

Enable hard budget enforcement (default: false for backward compatibility)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`enableBudgetEnforcement`](workflows.md#enablebudgetenforcement)

##### expertFactory?

```ts
optional expertFactory?: WorkflowExpertFactory;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L69)

Optional expert factory for dependency injection (useful for testing)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`expertFactory`](workflows.md#expertfactory-1)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L56)

Custom logger

###### Overrides

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`logger`](workflows.md#logger-1)

##### maxConcurrency?

```ts
optional maxConcurrency?: number;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L39)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`maxConcurrency`](workflows.md#maxconcurrency-1)

##### modelAdapter?

```ts
optional modelAdapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L67)

Optional pre-configured model adapter for expert agents

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`modelAdapter`](workflows.md#modeladapter)

##### templatePaths?

```ts
optional templatePaths?: string[];
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L40)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`templatePaths`](workflows.md#templatepaths)

##### useMockExecutor?

```ts
optional useMockExecutor?: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L71)

Use mock executor instead of real StepExecutor (default: false when expertFactory provided)

###### Inherited from

[`WorkflowEngineFactoryConfig`](workflows.md#workflowenginefactoryconfig).[`useMockExecutor`](workflows.md#usemockexecutor)

---

### WorkflowRouterOptions

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L87)

Options for the workflow router.

#### Properties

##### dryRun?

```ts
readonly optional dryRun?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L89)

Dry run mode — return decision without executing (per DevEx feedback)

---

### WorkflowRoutingDecision

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L63)

Routing decision with explanation.

#### Properties

##### alternatives

```ts
readonly alternatives: readonly WorkflowPattern[];
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L73)

Alternative patterns that were considered

##### analysis

```ts
readonly analysis: TaskAnalysisResult;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L75)

Analysis result from SharedTaskAnalyzer

##### capabilityGaps?

```ts
readonly optional capabilityGaps?: CapabilityGapReport;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L81)

Capability gap report — what's available vs what's needed (Issue #906)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L69)

Confidence in the selection (0-1)

##### matchedRules

```ts
readonly matchedRules: readonly string[];
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L71)

Which rules matched during selection

##### needsClarification?

```ts
readonly optional needsClarification?: boolean;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L77)

Whether the task should be clarified before execution (Issue #904)

##### pattern

```ts
readonly pattern: WorkflowPattern;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L65)

Selected workflow pattern

##### reasoning

```ts
readonly reasoning: string;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L67)

Human-readable explanation of why this pattern was selected

##### suggestedQuestions?

```ts
readonly optional suggestedQuestions?: readonly string[];
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L79)

Suggested clarification questions when needsClarification is true

## Type Aliases

### CompileResult

```ts
type CompileResult = Result<CompiledGraph, GraphCompileError>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:477](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L477)

Result type for graph compilation.

---

### ComplexityLevel

```ts
type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L23)

---

### ConsensusVoter

```ts
type ConsensusVoter = (input) => Promise<ConsensusVerdict>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L45)

Injected voter: run a consensus round and return a verdict.

#### Parameters

##### input

[`ConsensusProposalInput`](#consensusproposalinput)

#### Returns

`Promise`\<[`ConsensusVerdict`](#consensusverdict)\>

---

### CriterionResult

```ts
type CriterionResult = z.infer<typeof CriterionResultSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/scenario-validator-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/scenario-validator-types.ts#L24)

---

### DagEdge

```ts
type DagEdge = z.infer<typeof DagEdgeSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L55)

---

### DependencyStructure

```ts
type DependencyStructure = 'linear' | 'dag' | 'independent' | 'unknown';
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L23)

Dependency structure classification for a task.

---

### ExecutionStage

```ts
type ExecutionStage = 'parse' | 'decompose' | 'compile' | 'execute' | 'validate';
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L17)

Which stage of execution failed.

---

### FailureType

```ts
type FailureType = 'missing_implementation' | 'partial_match' | 'no_output';
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer-types.ts:14](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer-types.ts#L14)

Type of failure detected for an unmet criterion.

---

### FileReference

```ts
type FileReference = z.infer<typeof FileReferenceSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L33)

---

### GraphCompileError

```ts
type GraphCompileError =
  | {
      nodeId: string;
      type: 'duplicate_node';
    }
  | {
      nodeId: string;
      referencedBy: string;
      type: 'missing_node';
    }
  | {
      path: readonly string[];
      type: 'cycle_detected';
    }
  | {
      message: string;
      type: 'no_entry';
    }
  | {
      nodeId: string;
      type: 'unreachable_node';
    }
  | {
      field: string;
      type: 'missing_reducer';
    };
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:448](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L448)

Error type for graph compilation failures.

---

### GraphEdge

```ts
type GraphEdge =
  | {
      from: string;
      maxTraversals?: number;
      to: string;
      type: 'fixed';
    }
  | {
      from: string;
      maxTraversals?: number;
      router: (state) => string;
      targets: readonly string[];
      type: 'conditional';
    };
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L220)

Edge types in the graph.

---

### GraphEvent

```ts
type GraphEvent =
  | {
      nodeId: string;
      stepNumber: number;
      timestamp: number;
      type: 'node_started';
    }
  | {
      durationMs: number;
      nodeId: string;
      resultKeys: readonly string[];
      stepNumber: number;
      timestamp: number;
      type: 'node_completed';
    }
  | {
      error: string;
      nodeId: string;
      stepNumber: number;
      timestamp: number;
      type: 'node_error';
    }
  | {
      stepNumber: number;
      timestamp: number;
      type: 'state_updated';
      updatedKeys: readonly string[];
    }
  | {
      nodesExecuted: number;
      stepNumber: number;
      timestamp: number;
      type: 'step_completed';
    }
  | {
      durationMs: number;
      timestamp: number;
      totalNodes: number;
      totalSteps: number;
      type: 'execution_complete';
    }
  | {
      hookName: string;
      hookPhase: 'precondition' | 'verify';
      nodeId: string;
      stepNumber: number;
      timestamp: number;
      type: 'hook_started';
    }
  | {
      durationMs: number;
      hookName: string;
      hookPhase: 'precondition' | 'verify';
      nodeId: string;
      stepNumber: number;
      timestamp: number;
      type: 'hook_completed';
    }
  | {
      error: string;
      hookName: string;
      hookPhase: 'precondition' | 'verify';
      nodeId: string;
      stepNumber: number;
      timestamp: number;
      type: 'hook_failed';
    }
  | ContextUnavailableEvent;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L345)

Discriminated union of graph lifecycle events for streaming observation.

---

### GraphState

```ts
type GraphState = Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L87)

Flattened state values at runtime (one value per field).

---

### IssueReference

```ts
type IssueReference = z.infer<typeof IssueReferenceSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L22)

---

### KnownSection

```ts
type KnownSection = (typeof KNOWN_SECTIONS)[number];
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L97)

---

### NodeHandler

```ts
type NodeHandler = (state, ctx?) => Promise<NodeReturn>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L195)

Handler function for a graph node. Receives current state and an optional
per-run context, returns either:

- `Partial<GraphState>` (legacy, common case) — merged via reducers
- `Command` — `update` portion is merged via reducers
- `Interrupt` — pauses the graph; emits checkpoint with interrupt metadata

The `ctx` parameter is optional — pre-#1895 handlers that take only `state`
remain valid (additive widening).

#### Parameters

##### state

`Readonly`\<[`GraphState`](#graphstate)\>

##### ctx?

`NodeContext`

#### Returns

`Promise`\<`NodeReturn`\>

---

### NodeHandlerFactory

```ts
type NodeHandlerFactory = (node) => NodeHandler;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline-types.ts#L38)

Factory that creates graph node handlers from subtask nodes.
Allows plugging in different execution strategies (dry-run, expert delegation, etc.).

(Source: Issue #857 — Pluggable node execution for AI Software Factory)

#### Parameters

##### node

[`SubtaskNode`](#subtasknode)

#### Returns

`NodeHandler`

---

### NodeHook

```ts
type NodeHook = (ctx) => Promise<Result<void, HookError>>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L44)

Hook function signature. Returns ok(void) on success, err(HookError) on failure.

#### Parameters

##### ctx

[`NodeHookContext`](#nodehookcontext)

#### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`HookError`](#hookerror)\>\>

---

### OrchestratorDefinition

```ts
type OrchestratorDefinition =
  | {
      task: Task;
      type: 'task';
    }
  | {
      templatePath: string;
      type: 'workflow';
    }
  | {
      initialState: Record<string, unknown>;
      policyId: string;
      type: 'policy';
    };
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L46)

Orchestrator definition - the input that defines what to orchestrate.
This is a discriminated union to support different orchestration styles.

---

### OrchestratorErrorCode

```ts
type OrchestratorErrorCode =
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'STEP_FAILED'
  | 'AGENT_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'INVALID_DEFINITION'
  | 'NO_AGENTS_AVAILABLE'
  | 'POLICY_VIOLATION';
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L119)

Error codes for orchestrator failures.

---

### OrchestratorType

```ts
type OrchestratorType = 'orchestrator' | 'puppeteer' | 'workflow' | 'custom';
```

Defined in: [packages/nexus-agents/src/core/types/orchestrator.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/orchestrator.ts#L22)

Orchestration strategy type.

---

### OutcomeFailureCategory

```ts
type OutcomeFailureCategory = z.infer<typeof OutcomeFailureCategorySchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L130)

Category of failure for failed outcomes (Issue #1025).

---

### OutcomeTaskRecord

```ts
type OutcomeTaskRecord = z.infer<typeof OutcomeTaskSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L121)

A single recorded task execution outcome.

---

### ParsedSpec

```ts
type ParsedSpec = z.infer<typeof ParsedSpecSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L73)

---

### PipelineStage

```ts
type PipelineStage = 'parse' | 'decompose' | 'compile';
```

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline-types.ts#L17)

Which stage of the pipeline failed.

---

### QualityRequirement

```ts
type QualityRequirement = 'best-effort' | 'high' | 'critical';
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L33)

Quality requirement level.

---

### ScenarioResult

```ts
type ScenarioResult = z.infer<typeof ScenarioResultSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/scenario-validator-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/scenario-validator-types.ts#L41)

---

### SpecExecutionOptions

```ts
type SpecExecutionOptions = CompileOptions;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor-types.ts#L31)

Options for spec execution.
(Source: Issue #857 — Pluggable node execution)

---

### StateReducer

```ts
type StateReducer<T> =
  | {
      type: 'overwrite';
    }
  | {
      type: 'append';
    }
  | {
      merge: (existing, incoming) => T;
      type: 'custom';
    };
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L66)

State reducer controls how values merge when multiple nodes write
to the same state field. Inspired by LangGraph's Annotated reducers.

#### Type Parameters

##### T

`T` = `unknown`

---

### StateSchema

```ts
type StateSchema = Record<string, StateFieldSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L82)

State schema defines all fields and their reducers.

---

### SubtaskNode

```ts
type SubtaskNode = z.infer<typeof SubtaskNodeSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L44)

---

### SubtaskType

```ts
type SubtaskType = z.infer<typeof SubtaskTypeSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L17)

---

### TaskDag

```ts
type TaskDag = z.infer<typeof TaskDagSchema>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L72)

---

### TimeConstraint

```ts
type TimeConstraint = 'urgent' | 'normal' | 'relaxed';
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L28)

Time constraint urgency level.

---

### Trend

```ts
type Trend = 'improving' | 'declining' | 'stable';
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L21)

Direction of performance change over time.

---

### WorkflowPattern

```ts
type WorkflowPattern = 'sequential' | 'wave' | 'graph' | 'consensus' | 'aflow' | 'puppeteer';
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router-types.ts#L18)

Orchestration patterns available in nexus-agents.
Each maps to a concrete execution module.

## Variables

### CHECKPOINT_SCHEMA_VERSION

```ts
const CHECKPOINT_SCHEMA_VERSION: 1 = 1;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-types.ts#L57)

Schema version for forward compatibility.

---

### ComplexityLevelSchema

```ts
const ComplexityLevelSchema: ZodEnum<{
  complex: 'complex';
  expert: 'expert';
  moderate: 'moderate';
  simple: 'simple';
}>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L22)

Complexity level for a subtask.

---

### CriterionResultSchema

```ts
const CriterionResultSchema: ZodObject<
  {
    criterion: ZodString;
    matchedResults: ZodArray<ZodString>;
    met: ZodBoolean;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/scenario-validator-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/scenario-validator-types.ts#L16)

Result of checking a single acceptance criterion.

---

### DagEdgeSchema

```ts
const DagEdgeSchema: ZodObject<
  {
    from: ZodString;
    to: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L49)

A directed edge in the dependency DAG.

---

### END

```ts
const END: '__END__';
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L215)

Special sentinel for the graph exit point.

---

### FileReferenceSchema

```ts
const FileReferenceSchema: ZodObject<
  {
    line: ZodOptional<ZodNumber>;
    path: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L27)

A reference to a file path extracted from spec text.

---

### IssueReferenceSchema

```ts
const IssueReferenceSchema: ZodObject<
  {
    number: ZodNumber;
    raw: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L16)

A reference to a GitHub issue or PR extracted from spec text.

---

### KNOWN_SECTIONS

```ts
const KNOWN_SECTIONS: readonly [
  'overview',
  'requirements',
  'acceptance criteria',
  'constraints',
  'goal',
  'description',
  'design',
  'dependencies',
];
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L86)

Known section headings that the parser recognizes.

---

### OutcomeFailureCategorySchema

```ts
const OutcomeFailureCategorySchema: ZodEnum<{
  adapter_unavailable: 'adapter_unavailable';
  authentication: 'authentication';
  connection: 'connection';
  crash: 'crash';
  execution: 'execution';
  generic: 'generic';
  parse: 'parse';
  rate_limit: 'rate_limit';
  timeout: 'timeout';
  unknown: 'unknown';
  validation: 'validation';
}>;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L28)

Failure category for failed task outcomes (Issue #1025).

---

### OutcomeTaskSchema

```ts
const OutcomeTaskSchema: ZodObject<
  {
    baselineId: ZodOptional<ZodString>;
    category: ZodEnum<{
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
    }>;
    cli: ZodUnion<
      readonly [
        ZodEnum<{
          claude: 'claude';
          codex: 'codex';
          gemini: 'gemini';
          opencode: 'opencode';
        }>,
        ZodLiteral<'unknown'>,
      ]
    >;
    durationMs: ZodNumber;
    errorMessage: ZodOptional<ZodString>;
    failureCategory: ZodOptional<
      ZodEnum<{
        adapter_unavailable: 'adapter_unavailable';
        authentication: 'authentication';
        connection: 'connection';
        crash: 'crash';
        execution: 'execution';
        generic: 'generic';
        parse: 'parse';
        rate_limit: 'rate_limit';
        timeout: 'timeout';
        unknown: 'unknown';
        validation: 'validation';
      }>
    >;
    family: ZodOptional<ZodString>;
    id: ZodString;
    model: ZodString;
    qualitySignals: ZodOptional<ZodArray<ZodString>>;
    requestId: ZodOptional<ZodString>;
    retryCount: ZodOptional<ZodNumber>;
    routingStage: ZodOptional<ZodString>;
    source: ZodEnum<{
      consensus: 'consensus';
      delegate: 'delegate';
      manual: 'manual';
    }>;
    success: ZodBoolean;
    timestamp: ZodString;
    traceId: ZodOptional<ZodString>;
    triageAction: ZodOptional<ZodString>;
    vendor: ZodOptional<ZodString>;
    voterRole: ZodOptional<ZodString>;
    wasRetried: ZodOptional<ZodBoolean>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L53)

Schema for a single recorded task outcome.

---

### ParsedSpecSchema

```ts
const ParsedSpecSchema: ZodObject<
  {
    acceptanceCriteria: ZodArray<ZodString>;
    constraints: ZodArray<ZodString>;
    fileReferences: ZodArray<
      ZodObject<
        {
          line: ZodOptional<ZodNumber>;
          path: ZodString;
        },
        $strip
      >
    >;
    issueReferences: ZodArray<
      ZodObject<
        {
          number: ZodNumber;
          raw: ZodString;
        },
        $strip
      >
    >;
    missingSections: ZodArray<ZodString>;
    overview: ZodString;
    rawMarkdown: ZodString;
    requirements: ZodArray<ZodString>;
    techStack: ZodOptional<
      ZodObject<
        {
          framework: ZodOptional<ZodString>;
          language: ZodOptional<ZodString>;
          packageManager: ZodOptional<ZodString>;
        },
        $strip
      >
    >;
    title: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser-types.ts#L51)

Parsed specification from a markdown document.

---

### ScenarioResultSchema

```ts
const ScenarioResultSchema: ZodObject<
  {
    allMet: ZodBoolean;
    criteria: ZodArray<
      ZodObject<
        {
          criterion: ZodString;
          matchedResults: ZodArray<ZodString>;
          met: ZodBoolean;
        },
        $strip
      >
    >;
    metCount: ZodNumber;
    satisfaction: ZodNumber;
    totalCriteria: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/scenario-validator-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/scenario-validator-types.ts#L29)

Overall scenario validation result.

---

### START

```ts
const START: '__START__';
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L212)

Special sentinel for the graph entry point.

---

### SubtaskNodeSchema

```ts
const SubtaskNodeSchema: ZodObject<
  {
    capabilities: ZodArray<ZodString>;
    complexity: ZodEnum<{
      complex: 'complex';
      expert: 'expert';
      moderate: 'moderate';
      simple: 'simple';
    }>;
    dependsOn: ZodArray<ZodString>;
    description: ZodString;
    id: ZodString;
    sourceRequirement: ZodOptional<ZodString>;
    type: ZodEnum<{
      code: 'code';
      config: 'config';
      docs: 'docs';
      refactor: 'refactor';
      test: 'test';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L28)

A single decomposed subtask node in the DAG.

---

### SubtaskTypeSchema

```ts
const SubtaskTypeSchema: ZodEnum<{
  code: 'code';
  config: 'config';
  docs: 'docs';
  refactor: 'refactor';
  test: 'test';
}>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L16)

The type of work a subtask represents.

---

### TaskDagSchema

```ts
const TaskDagSchema: ZodObject<
  {
    edges: ZodArray<
      ZodObject<
        {
          from: ZodString;
          to: ZodString;
        },
        $strip
      >
    >;
    nodes: ZodArray<
      ZodObject<
        {
          capabilities: ZodArray<ZodString>;
          complexity: ZodEnum<{
            complex: 'complex';
            expert: 'expert';
            moderate: 'moderate';
            simple: 'simple';
          }>;
          dependsOn: ZodArray<ZodString>;
          description: ZodString;
          id: ZodString;
          sourceRequirement: ZodOptional<ZodString>;
          type: ZodEnum<{
            code: 'code';
            config: 'config';
            docs: 'docs';
            refactor: 'refactor';
            test: 'test';
          }>;
        },
        $strip
      >
    >;
    roots: ZodArray<ZodString>;
    specTitle: ZodString;
    totalComplexity: ZodEnum<{
      complex: 'complex';
      expert: 'expert';
      moderate: 'moderate';
      simple: 'simple';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer-types.ts#L60)

The complete dependency DAG produced by decomposition.

## Functions

### analyzeFailures()

```ts
function analyzeFailures(executionResult): Result<FailureAnalysis, never>;
```

Defined in: [packages/nexus-agents/src/orchestration/failure-analyzer.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/failure-analyzer.ts#L25)

Analyzes execution results for failure patterns.

#### Parameters

##### executionResult

[`SpecExecutionResult`](#specexecutionresult)

#### Returns

[`Result`](core.md#result)\<[`FailureAnalysis`](#failureanalysis), `never`\>

---

### append()

```ts
function append<T>(defaultValue?): StateFieldSchema<T[]>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:320](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L320)

Creates an append reducer for array fields.

#### Type Parameters

##### T

`T`

#### Parameters

##### defaultValue?

`T`[] = `[]`

#### Returns

[`StateFieldSchema`](#statefieldschema)\<`T`[]\>

---

### categorizeOutcomeError()

```ts
function categorizeOutcomeError(
  error
):
  | 'unknown'
  | 'timeout'
  | 'parse'
  | 'connection'
  | 'execution'
  | 'rate_limit'
  | 'validation'
  | 'authentication'
  | 'crash'
  | 'adapter_unavailable'
  | 'generic';
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:334](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L334)

Classifies an error into an OutcomeFailureCategory for recording.

#### Parameters

##### error

`unknown`

#### Returns

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"`

---

### categorizeOutcomeErrorMessage()

```ts
function categorizeOutcomeErrorMessage(
  msg
):
  | 'unknown'
  | 'timeout'
  | 'parse'
  | 'connection'
  | 'execution'
  | 'rate_limit'
  | 'validation'
  | 'authentication'
  | 'crash'
  | 'adapter_unavailable'
  | 'generic';
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:347](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L347)

Classifies an error message string into an OutcomeFailureCategory.

#### Parameters

##### msg

`string`

#### Returns

\| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"`

---

### compileSpecToGraph()

```ts
function compileSpecToGraph(markdown, options?): Result<CompiledGraph, PipelineError>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline.ts#L44)

Compiles a markdown specification into an executable graph.

Pipeline: markdown → parseSpec → decomposeSpec → GraphBuilder → CompiledGraph

#### Parameters

##### markdown

`string`

Raw markdown specification text

##### options?

[`CompileOptions`](#compileoptions)

Optional compile options (handler factory, etc.)

#### Returns

[`Result`](core.md#result)\<[`CompiledGraph`](#compiledgraph), [`PipelineError`](#pipelineerror)\>

---

### computeAdaptiveThresholds()

```ts
function computeAdaptiveThresholds(store, cli, category): AdaptiveThresholdResult;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L63)

Computes adaptive thresholds for a CLI+category pair from outcome data.

Below cold start threshold: returns defaults with zero confidence.
Above threshold: adjusts baseline toward observed rate, scales max
bonus by confidence, and detects trend.

#### Parameters

##### store

[`OutcomeStore`](#outcomestore)

##### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

##### category

\| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"`

#### Returns

[`AdaptiveThresholdResult`](#adaptivethresholdresult)

---

### createCheckpoint()

```ts
function createCheckpoint(opts): Checkpoint;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L137)

Creates a checkpoint from the current execution state.

#### Parameters

##### opts

###### completedResults

readonly [`NodeResult`](#noderesult)[]

###### executionId

`string`

###### interrupt?

`CheckpointInterrupt`

Set when persisting an interrupt-flavored checkpoint (#1895).

###### metadata?

`Record`\<`string`, `unknown`\>

###### pendingNodeIds

readonly `string`[]

###### state

`Readonly`\<[`GraphState`](#graphstate)\>

###### stepNumber

`number`

#### Returns

[`Checkpoint`](#checkpoint)

---

### createCheckpointStore()

```ts
function createCheckpointStore(): ICheckpointStore;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/checkpoint-store.ts#L164)

Creates a new InMemoryCheckpointStore.

#### Returns

[`ICheckpointStore`](#icheckpointstore)

---

### createConsensusGateNode()

```ts
function createConsensusGateNode(options): NodeHandler;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L84)

Build a [NodeHandler](#nodehandler) that runs a consensus gate and writes the typed
verdict to `verdictKey` in graph state. Pair it with `addConditionalEdge` on
`state[verdictKey].outcome` to route approve → continue, reject → halt/revise.

#### Parameters

##### options

[`ConsensusGateNodeOptions`](#consensusgatenodeoptions)

#### Returns

[`NodeHandler`](#nodehandler)

---

### createDryRunHandler()

```ts
function createDryRunHandler(node): (state) => Promise<Partial<GraphState>>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-pipeline.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-pipeline.ts#L24)

Creates the default dry-run node handler for a subtask.
Returns a placeholder string describing the subtask.

#### Parameters

##### node

###### capabilities

`string`[] = `...`

Required capabilities for the executing agent

###### complexity

`"simple"` \| `"complex"` \| `"expert"` \| `"moderate"` = `ComplexityLevelSchema`

Estimated complexity

###### dependsOn

`string`[] = `...`

IDs of subtasks this depends on

###### description

`string` = `...`

Human-readable description of what this subtask does

###### id

`string` = `...`

Unique identifier for this subtask

###### sourceRequirement?

`string` = `...`

Source requirement text that generated this subtask

###### type

`"code"` \| `"test"` \| `"refactor"` \| `"docs"` \| `"config"` = `SubtaskTypeSchema`

The type of work

#### Returns

(`state`) => `Promise`\<`Partial`\<[`GraphState`](#graphstate)\>\>

---

### createOrchestratorFactory()

```ts
function createOrchestratorFactory(config?): Promise<IOrchestratorFactory>;
```

Defined in: [packages/nexus-agents/src/orchestration/orchestrator-factory.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/orchestrator-factory.ts#L388)

Creates an OrchestratorFactory with async initialization.

This is the recommended way to create an OrchestratorFactory as it
properly initializes all async dependencies like the WorkflowEngine.

#### Parameters

##### config?

[`OrchestratorFactoryConfig`](#orchestratorfactoryconfig)

Factory configuration

#### Returns

`Promise`\<[`IOrchestratorFactory`](#iorchestratorfactory)\>

Promise resolving to initialized OrchestratorFactory

#### Example

```typescript
const factory = await createOrchestratorFactory();
const types = factory.listTypes(); // ['workflow']

const orchestrator = factory.create('workflow');
const result = await orchestrator.execute(...);
```

---

### createStateComparisonVerifier()

```ts
function createStateComparisonVerifier(fields): (preState) => NodeHook;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L141)

Creates a state-comparison verification hook.
Checks that specified state fields changed after node execution.

#### Parameters

##### fields

readonly `string`[]

#### Returns

(`preState`) => [`NodeHook`](#nodehook)

---

### createStateGuard()

```ts
function createStateGuard(name, predicate, errorMessage): PreconditionConfig;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L169)

Creates a precondition that checks state field values.
Useful for enforcing invariants before node execution.

#### Parameters

##### name

`string`

##### predicate

(`state`) => `boolean`

##### errorMessage

`string`

#### Returns

[`PreconditionConfig`](#preconditionconfig)

---

### createWorkflowRouter()

```ts
function createWorkflowRouter(options?): IWorkflowRouter;
```

Defined in: [packages/nexus-agents/src/orchestration/workflow-router.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/workflow-router.ts#L63)

Creates a workflow pattern router.

Analyzes task characteristics and selects the optimal orchestration
pattern using a rule-based classification system.

Scope of `recordOutcome` / `getMetrics` (#2824): the recorded
`PatternOutcome`s live in a buffer owned by this router instance.
`route()` is a deterministic, rule-based classifier — it does NOT
consume recorded outcomes, so there is no per-instance learning to
"lose", and nothing to aggregate across processes. The pair is an
observability surface only. If cross-process pattern metrics are
ever needed, add a dedicated consumer that writes to a shared
`OutcomeStore` rather than widening this router's responsibility.

#### Parameters

##### options?

###### analyzer?

`ISharedTaskAnalyzer`

###### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`IWorkflowRouter`](#iworkflowrouter)

---

### customReducer()

```ts
function customReducer<T>(defaultValue, merge): StateFieldSchema<T>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:325](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L325)

Creates a custom reducer with a merge function.

#### Type Parameters

##### T

`T`

#### Parameters

##### defaultValue

`T`

##### merge

(`existing`, `incoming`) => `T`

#### Returns

[`StateFieldSchema`](#statefieldschema)\<`T`\>

---

### decomposeSpec()

```ts
function decomposeSpec(spec): Result<
  {
    edges: {
      from: string;
      to: string;
    }[];
    nodes: {
      capabilities: string[];
      complexity: 'simple' | 'complex' | 'expert' | 'moderate';
      dependsOn: string[];
      description: string;
      id: string;
      sourceRequirement?: string;
      type: 'code' | 'test' | 'refactor' | 'docs' | 'config';
    }[];
    roots: string[];
    specTitle: string;
    totalComplexity: 'simple' | 'complex' | 'expert' | 'moderate';
  },
  DecomposeError
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-decomposer.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-decomposer.ts#L43)

Decomposes a parsed spec into a dependency DAG of typed subtasks.

#### Parameters

##### spec

###### acceptanceCriteria

`string`[] = `...`

Acceptance criteria (checklist items)

###### constraints

`string`[] = `...`

Constraints or limitations

###### fileReferences

\{
`line?`: `number`;
`path`: `string`;
\}[] = `...`

File path references found in the spec

###### issueReferences

\{
`number`: `number`;
`raw`: `string`;
\}[] = `...`

Issue/PR references found in the spec

###### missingSections

`string`[] = `...`

Sections that were missing from the spec

###### overview

`string` = `...`

Overview/description text

###### rawMarkdown

`string` = `...`

Raw markdown source

###### requirements

`string`[] = `...`

List of requirements

###### techStack?

\{
`framework?`: `string`;
`language?`: `string`;
`packageManager?`: `string`;
\} = `...`

Inferred technology stack

###### techStack.framework?

`string` = `...`

Framework or library

###### techStack.language?

`string` = `...`

Programming language

###### techStack.packageManager?

`string` = `...`

Package manager

###### title

`string` = `...`

Spec title (from first H1 or H2 heading)

#### Returns

[`Result`](core.md#result)\<\{
`edges`: \{
`from`: `string`;
`to`: `string`;
\}[];
`nodes`: \{
`capabilities`: `string`[];
`complexity`: `"simple"` \| `"complex"` \| `"expert"` \| `"moderate"`;
`dependsOn`: `string`[];
`description`: `string`;
`id`: `string`;
`sourceRequirement?`: `string`;
`type`: `"code"` \| `"test"` \| `"refactor"` \| `"docs"` \| `"config"`;
\}[];
`roots`: `string`[];
`specTitle`: `string`;
`totalComplexity`: `"simple"` \| `"complex"` \| `"expert"` \| `"moderate"`;
\}, [`DecomposeError`](#decomposeerror)\>

---

### detectTrend()

```ts
function detectTrend(outcomes, windowSize?): Trend;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/adaptive-thresholds.ts#L108)

Detects performance trend by comparing recent vs historical success rates.

Splits outcomes into two windows of `windowSize` (default 25).
If fewer than 2 \* windowSize outcomes, uses half-split.

#### Parameters

##### outcomes

readonly \{
`baselineId?`: `string`;
`category`: \| `"planning"`
\| `"architecture"`
\| `"code_generation"`
\| `"code_review"`
\| `"research"`
\| `"security_review"`
\| `"documentation"`
\| `"testing"`
\| `"devops"`
\| `"exploration"`;
`cli`: `"unknown"` \| `"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`;
`durationMs`: `number`;
`errorMessage?`: `string`;
`failureCategory?`: \| `"unknown"`
\| `"timeout"`
\| `"parse"`
\| `"connection"`
\| `"execution"`
\| `"rate_limit"`
\| `"validation"`
\| `"authentication"`
\| `"crash"`
\| `"adapter_unavailable"`
\| `"generic"`;
`family?`: `string`;
`id`: `string`;
`model`: `string`;
`qualitySignals?`: `string`[];
`requestId?`: `string`;
`retryCount?`: `number`;
`routingStage?`: `string`;
`source`: `"delegate"` \| `"consensus"` \| `"manual"`;
`success`: `boolean`;
`timestamp`: `string`;
`traceId?`: `string`;
`triageAction?`: `string`;
`vendor?`: `string`;
`voterRole?`: `string`;
`wasRetried?`: `boolean`;
\}[]

##### windowSize?

`number` = `DEFAULT_WINDOW_SIZE`

#### Returns

[`Trend`](#trend-1)

---

### emitExecutionComplete()

```ts
function emitExecutionComplete(totalSteps, totalNodes, durationMs, options?): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-events.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-events.ts#L132)

Emits execution_complete event when graph execution finishes.

#### Parameters

##### totalSteps

`number`

##### totalNodes

`number`

##### durationMs

`number`

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`void`

---

### emitNodeResults()

```ts
function emitNodeResults(ctx, results, options?): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-events.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-events.ts#L41)

Emits node_completed or node_error events for each result.

#### Parameters

##### ctx

`StepContext`

##### results

readonly [`NodeResult`](#noderesult)[]

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`void`

---

### emitNodeStarted()

```ts
function emitNodeStarted(ctx, options?): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-events.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-events.ts#L31)

Emits node_started events for all nodes about to execute.

#### Parameters

##### ctx

`StepContext`

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`void`

---

### emitStateUpdated()

```ts
function emitStateUpdated(ctx, results, options?): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-events.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-events.ts#L73)

Emits state_updated event with deduplicated keys from successful results.

#### Parameters

##### ctx

`StepContext`

##### results

readonly [`NodeResult`](#noderesult)[]

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`void`

---

### emitStepCompleted()

```ts
function emitStepCompleted(ctx, nodesExecuted, options?): void;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-events.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-events.ts#L95)

Emits step_completed event after a super-step finishes.

#### Parameters

##### ctx

`StepContext`

##### nodesExecuted

`number`

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`void`

---

### executeGraph()

```ts
function executeGraph(graph, initialInputs, options?): Promise<Result<GraphExecutionResult, Error>>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-executor.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-executor.ts#L156)

Executes a compiled graph workflow.

Uses a super-step model: each step finds all runnable nodes,
executes them in parallel, merges state, then resolves edges
to find the next set of runnable nodes.

#### Parameters

##### graph

[`CompiledGraph`](#compiledgraph)

##### initialInputs

`Readonly`\<[`GraphState`](#graphstate)\>

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`GraphExecutionResult`](#graphexecutionresult), `Error`\>\>

---

### executeSpec()

```ts
function executeSpec(markdown, options?): Promise<Result<SpecExecutionResult, SpecExecutionError>>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-executor.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-executor.ts#L36)

Executes a markdown specification end-to-end.

#### Parameters

##### markdown

`string`

##### options?

[`CompileOptions`](#compileoptions)

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`SpecExecutionResult`](#specexecutionresult), [`SpecExecutionError`](#specexecutionerror)\>\>

---

### extractNonErrorMessage()

```ts
function extractNonErrorMessage(error): string | undefined;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:313](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts#L313)

Extracts a classifiable message string from a non-Error value.
Returns undefined if the value is truly unclassifiable (#1466).

#### Parameters

##### error

`unknown`

#### Returns

`string` \| `undefined`

---

### formatCompileError()

```ts
function formatCompileError(error): string;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-types.ts:457](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-types.ts#L457)

Format a compile error as a human-readable string.

#### Parameters

##### error

[`GraphCompileError`](#graphcompileerror)

#### Returns

`string`

---

### getOutcomeStore()

```ts
function getOutcomeStore(): OutcomeStore;
```

Defined in: [packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:276](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts#L276)

Get the shared OutcomeStore singleton.
Returns PersistentOutcomeStore when NEXUS_PERSIST_LEARNING=true
and the factory has been registered (import outcome-store-persistence first).

#### Returns

[`OutcomeStore`](#outcomestore)

---

### overwrite()

```ts
function overwrite<T>(defaultValue): StateFieldSchema<T>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-builder.ts:315](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-builder.ts#L315)

Creates an overwrite reducer (last write wins).

#### Type Parameters

##### T

`T`

#### Parameters

##### defaultValue

`T`

#### Returns

[`StateFieldSchema`](#statefieldschema)\<`T`\>

---

### parseSpec()

```ts
function parseSpec(markdown): Result<
  {
    acceptanceCriteria: string[];
    constraints: string[];
    fileReferences: {
      line?: number;
      path: string;
    }[];
    issueReferences: {
      number: number;
      raw: string;
    }[];
    missingSections: string[];
    overview: string;
    rawMarkdown: string;
    requirements: string[];
    techStack?: {
      framework?: string;
      language?: string;
      packageManager?: string;
    };
    title: string;
  },
  SpecParseError
>;
```

Defined in: [packages/nexus-agents/src/orchestration/spec-parser.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/spec-parser.ts#L36)

Parses a markdown specification into a typed ParsedSpec structure.

Extracts title, overview, requirements, acceptance criteria, constraints,
and references from a well-structured markdown document.

#### Parameters

##### markdown

`string`

#### Returns

[`Result`](core.md#result)\<\{
`acceptanceCriteria`: `string`[];
`constraints`: `string`[];
`fileReferences`: \{
`line?`: `number`;
`path`: `string`;
\}[];
`issueReferences`: \{
`number`: `number`;
`raw`: `string`;
\}[];
`missingSections`: `string`[];
`overview`: `string`;
`rawMarkdown`: `string`;
`requirements`: `string`[];
`techStack?`: \{
`framework?`: `string`;
`language?`: `string`;
`packageManager?`: `string`;
\};
`title`: `string`;
\}, [`SpecParseError`](#specparseerror)\>

---

### runConsensusGate()

```ts
function runConsensusGate(voter, input): Promise<ConsensusVerdict>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L53)

Run the consensus gate (the single shared implementation). On any voter
error/timeout this **fails CLOSED** to a `rejected` verdict — a gate must
never let unreviewed work through on an error. The voter receives only the
proposal/context (no secrets, no ambient state).

#### Parameters

##### voter

[`ConsensusVoter`](#consensusvoter)

##### input

[`ConsensusProposalInput`](#consensusproposalinput)

#### Returns

`Promise`\<[`ConsensusVerdict`](#consensusverdict)\>

---

### runGraphWithConsensus()

```ts
function runGraphWithConsensus(options): Promise<
  Result<
    {
      execution: GraphExecutionResult;
      verdict: ConsensusVerdict | undefined;
    },
    Error
  >
>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/consensus-node.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/consensus-node.ts#L131)

Convenience composition (#3267): run a single work node, then a consensus
gate over its output — `START → produce → consensus → END` — and return the
execution result plus the typed verdict. The `proposalKey`/`verdictKey` state
channels are declared automatically. For richer control flow (branch on the
verdict, loop on reject, multiple gates) use [createConsensusGateNode](#createconsensusgatenode)
with [GraphBuilder](#graphbuilder) + `addConditionalEdge` directly.

#### Parameters

##### options

[`RunGraphWithConsensusOptions`](#rungraphwithconsensusoptions)

#### Returns

`Promise`\<[`Result`](core.md#result)\<\{
`execution`: [`GraphExecutionResult`](#graphexecutionresult);
`verdict`: [`ConsensusVerdict`](#consensusverdict) \| `undefined`;
\}, `Error`\>\>

---

### runPreconditions()

```ts
function runPreconditions(node, state, stepNumber, options?): Promise<PreconditionResult>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L58)

Runs all precondition hooks for a node.
If any required precondition fails, returns passed=false.
Optional precondition failures are logged but don't block execution.

#### Parameters

##### node

[`GraphNode`](#graphnode)

##### state

`Readonly`\<[`GraphState`](#graphstate)\>

##### stepNumber

`number`

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`Promise`\<[`PreconditionResult`](#preconditionresult)\>

---

### runVerification()

```ts
function runVerification(node, state, stepNumber, options?): Promise<VerificationResult>;
```

Defined in: [packages/nexus-agents/src/orchestration/graph/graph-hooks.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/graph/graph-hooks.ts#L102)

Runs the post-step verification hook for a node.
Returns the verification result.

#### Parameters

##### node

[`GraphNode`](#graphnode)

##### state

`Readonly`\<[`GraphState`](#graphstate)\>

##### stepNumber

`number`

##### options?

[`GraphExecuteOptions`](#graphexecuteoptions)

#### Returns

`Promise`\<[`VerificationResult`](#verificationresult)\>

---

### validateScenario()

```ts
function validateScenario(
  spec,
  results
): Result<
  {
    allMet: boolean;
    criteria: {
      criterion: string;
      matchedResults: string[];
      met: boolean;
    }[];
    metCount: number;
    satisfaction: number;
    totalCriteria: number;
  },
  ScenarioError
>;
```

Defined in: [packages/nexus-agents/src/orchestration/scenario-validator.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/orchestration/scenario-validator.ts#L69)

Validates execution results against a spec's acceptance criteria.

#### Parameters

##### spec

###### acceptanceCriteria

`string`[] = `...`

Acceptance criteria (checklist items)

###### constraints

`string`[] = `...`

Constraints or limitations

###### fileReferences

\{
`line?`: `number`;
`path`: `string`;
\}[] = `...`

File path references found in the spec

###### issueReferences

\{
`number`: `number`;
`raw`: `string`;
\}[] = `...`

Issue/PR references found in the spec

###### missingSections

`string`[] = `...`

Sections that were missing from the spec

###### overview

`string` = `...`

Overview/description text

###### rawMarkdown

`string` = `...`

Raw markdown source

###### requirements

`string`[] = `...`

List of requirements

###### techStack?

\{
`framework?`: `string`;
`language?`: `string`;
`packageManager?`: `string`;
\} = `...`

Inferred technology stack

###### techStack.framework?

`string` = `...`

Framework or library

###### techStack.language?

`string` = `...`

Programming language

###### techStack.packageManager?

`string` = `...`

Package manager

###### title

`string` = `...`

Spec title (from first H1 or H2 heading)

##### results

readonly `string`[]

#### Returns

[`Result`](core.md#result)\<\{
`allMet`: `boolean`;
`criteria`: \{
`criterion`: `string`;
`matchedResults`: `string`[];
`met`: `boolean`;
\}[];
`metCount`: `number`;
`satisfaction`: `number`;
`totalCriteria`: `number`;
\}, [`ScenarioError`](#scenarioerror)\>
