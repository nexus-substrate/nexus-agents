---
title: 'API: consensus'
description: Generated API reference for consensus.
tier: 2
---

# consensus

## Classes

### ConsensusEngine

Defined in: [packages/nexus-agents/src/consensus/engine.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L127)

Consensus engine for multi-agent decision making.

#### Example

```typescript
const engine = new ConsensusEngine({ defaultTimeout: 30000 });
const proposalResult = await engine.propose({
  title: 'Use microservices architecture',
  description: 'Proposal to adopt microservices',
  algorithm: 'supermajority',
});
if (proposalResult.ok) {
  await engine.vote(proposalResult.value, 'agent-1', {
    decision: 'approve',
    confidence: 0.9,
    reasoning: 'Good for scalability',
  });
}
```

#### Implements

- [`IConsensusEngine`](#iconsensusengine)

#### Constructors

##### Constructor

```ts
new ConsensusEngine(config?, logger?): ConsensusEngine;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L140)

###### Parameters

###### config?

`Partial`\<[`ConsensusEngineConfig`](#consensusengineconfig)\>

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`ConsensusEngine`](#consensusengine)

#### Methods

##### clearCache()

```ts
clearCache(): void;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:678](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L678)

Clears the proposal content cache (for testing/reset).

###### Returns

`void`

##### close()

```ts
close(proposalId): Promise<Result<ConsensusResult, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L262)

###### Parameters

###### proposalId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ConsensusResult`](#consensusresult), [`ConsensusError`](#consensuserror)\>\>

###### Implementation of

[`IConsensusEngine`](#iconsensusengine).[`close`](#close-1)

##### getActiveProposalCount()

```ts
getActiveProposalCount(): number;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L311)

###### Returns

`number`

##### getAgentPerformance()

```ts
getAgentPerformance(agentId): AgentPerformance | undefined;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:307](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L307)

###### Parameters

###### agentId

`string`

###### Returns

[`AgentPerformance`](#agentperformance) \| `undefined`

##### getCacheSize()

```ts
getCacheSize(): number;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:671](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L671)

Gets the current cache size (for testing/monitoring).

###### Returns

`number`

##### getMetrics()

```ts
getMetrics(): ConsensusMetrics;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L266)

###### Returns

[`ConsensusMetrics`](#consensusmetrics)

###### Implementation of

[`IConsensusEngine`](#iconsensusengine).[`getMetrics`](#getmetrics-1)

##### getResult()

```ts
getResult(proposalId): Promise<Result<ConsensusResult, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:249](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L249)

###### Parameters

###### proposalId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ConsensusResult`](#consensusresult), [`ConsensusError`](#consensuserror)\>\>

###### Implementation of

[`IConsensusEngine`](#iconsensusengine).[`getResult`](#getresult-2)

##### propose()

```ts
propose(proposal): Promise<Result<string, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L157)

###### Parameters

###### proposal

###### algorithm

\| `"higher_order"`
\| `"simple_majority"`
\| `"supermajority"`
\| `"unanimous"`
\| `"proof_of_learning"`
\| `"opinion_wise"` = `ConsensusAlgorithmSchema`

###### createdAt?

`string` = `...`

###### description

`string` = `...`

###### id?

`string` = `...`

###### metadata?

`Record`\<`string`, `unknown`\> = `...`

###### requiredVoters?

`string`[] = `...`

###### timeout?

`number` = `...`

###### title

`string` = `...`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`string`, [`ConsensusError`](#consensuserror)\>\>

###### Implementation of

[`IConsensusEngine`](#iconsensusengine).[`propose`](#propose-1)

##### setVoterExpansionCallback()

```ts
setVoterExpansionCallback(callback): void;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L153)

Sets the callback for incremental quorum voter expansion (Issue #1408).
When ambiguous votes are detected, this callback requests additional voters.

###### Parameters

###### callback

`VoterExpansionCallback`

###### Returns

`void`

##### updateAgentPerformance()

```ts
updateAgentPerformance(agentId, wasCorrect): void;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:282](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L282)

###### Parameters

###### agentId

`string`

###### wasCorrect

`boolean`

###### Returns

`void`

##### vote()

```ts
vote(
   proposalId,
   agentId,
vote): Promise<Result<void, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L198)

###### Parameters

###### proposalId

`string`

###### agentId

`string`

###### vote

###### conditions?

`string`[] = `...`

###### confidence

`number` = `...`

###### decision

`"approve"` \| `"reject"` \| `"abstain"` = `VoteDecisionSchema`

###### findings?

\{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[] = `...`

Pre-verified PR-review findings (#2245 v4 follow-up). Optional;
populated only when the voter emits the structured top-level array.

###### reasoning

`string` = `...`

###### rejectionCategories?

(
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[] = `...`

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

###### timestamp?

`string` = `...`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ConsensusError`](#consensuserror)\>\>

###### Implementation of

[`IConsensusEngine`](#iconsensusengine).[`vote`](#vote-2)

---

### ConsensusError

Defined in: [packages/nexus-agents/src/consensus/engine.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L42)

Error class for consensus-related failures.

#### Extends

- [`AgentError`](core.md#agenterror)

#### Constructors

##### Constructor

```ts
new ConsensusError(message, context?): ConsensusError;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L43)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`ConsensusError`](#consensuserror)

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

### CorrelationTracker

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L55)

Correlation tracker implementation.
Records voting history and computes pairwise agent correlations.

Memory bounded: uses FIFO eviction when maxObservationsPerAgent or maxProposals limits reached.

#### Implements

- [`ICorrelationTracker`](#icorrelationtracker)

#### Constructors

##### Constructor

```ts
new CorrelationTracker(config?): CorrelationTracker;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L64)

###### Parameters

###### config?

`Partial`\<[`HigherOrderVotingConfig`](#higherordervotingconfig)\>

###### Returns

[`CorrelationTracker`](#correlationtracker)

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L231)

Clear all recorded data.

###### Returns

`void`

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`clear`](#clear-1)

##### computeCorrelationMatrix()

```ts
computeCorrelationMatrix(): CorrelationMatrix;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L124)

Compute the full correlation matrix for all tracked agents.

###### Returns

[`CorrelationMatrix`](#correlationmatrix)

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`computeCorrelationMatrix`](#computecorrelationmatrix-1)

##### getCorrelation()

```ts
getCorrelation(agentA, agentB): number | undefined;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L136)

Get correlation between two specific agents.
Returns undefined if insufficient data.

###### Parameters

###### agentA

`string`

###### agentB

`string`

###### Returns

`number` \| `undefined`

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`getCorrelation`](#getcorrelation-1)

##### getStats()

```ts
getStats(): CorrelationTrackerStats;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L199)

Get statistics about the correlation tracker.

###### Returns

[`CorrelationTrackerStats`](#correlationtrackerstats)

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`getStats`](#getstats-1)

##### hasSufficientData()

```ts
hasSufficientData(agentIds): boolean;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L172)

Check if there is sufficient correlation data for a set of agents.

###### Parameters

###### agentIds

readonly `string`[]

###### Returns

`boolean`

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`hasSufficientData`](#hassufficientdata-1)

##### identifyIndependentSubsets()

```ts
identifyIndependentSubsets(): readonly IndependentSubset[];
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L146)

Identify groups of agents that vote independently.

###### Returns

readonly [`IndependentSubset`](#independentsubset)[]

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`identifyIndependentSubsets`](#identifyindependentsubsets-1)

##### recordProposalVotes()

```ts
recordProposalVotes(
   proposalId,
   votes,
   outcome): void;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L86)

Record votes from multiple agents for the same proposal.

###### Parameters

###### proposalId

`string`

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### outcome

`"rejected"` \| `"approved"`

###### Returns

`void`

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`recordProposalVotes`](#recordproposalvotes-1)

##### recordVote()

```ts
recordVote(
   agentId,
   vote,
   outcome): void;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L72)

Record a vote and its outcome for correlation tracking.

###### Parameters

###### agentId

`string`

###### vote

###### conditions?

`string`[] = `...`

###### confidence

`number` = `...`

###### decision

`"approve"` \| `"reject"` \| `"abstain"` = `VoteDecisionSchema`

###### findings?

\{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[] = `...`

Pre-verified PR-review findings (#2245 v4 follow-up). Optional;
populated only when the voter emits the structured top-level array.

###### reasoning

`string` = `...`

###### rejectionCategories?

(
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[] = `...`

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

###### timestamp?

`string` = `...`

###### outcome

`"rejected"` \| `"approved"`

###### Returns

`void`

###### Implementation of

[`ICorrelationTracker`](#icorrelationtracker).[`recordVote`](#recordvote-1)

---

### HigherOrderVotingStrategy

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L262)

Higher-order voting strategy for integration with VotingStrategyFactory.
Wraps OWVoting to provide IVotingStrategy interface.

#### Extends

- [`OWVoting`](#owvoting)

#### Implements

- [`IVotingStrategy`](#ivotingstrategy)

#### Constructors

##### Constructor

```ts
new HigherOrderVotingStrategy(options?): HigherOrderVotingStrategy;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:263](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L263)

###### Parameters

###### options?

[`OWVotingOptions`](#owvotingoptions) = `{}`

###### Returns

[`HigherOrderVotingStrategy`](#higherordervotingstrategy)

###### Overrides

[`OWVoting`](#owvoting).[`constructor`](#constructor-5)

#### Properties

##### algorithm

```ts
readonly algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise";
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L58)

###### Implementation of

[`IVotingStrategy`](#ivotingstrategy).[`algorithm`](#algorithm-6)

###### Inherited from

[`OWVoting`](#owvoting).[`algorithm`](#algorithm-1)

#### Methods

##### aggregate()

```ts
aggregate(votes, tracker): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L182)

Full pipeline: estimate correlation, compute result.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### tracker

[`ICorrelationTracker`](#icorrelationtracker)

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

###### Inherited from

[`OWVoting`](#owvoting).[`aggregate`](#aggregate-1)

##### aggregateWithCorrelation()

```ts
aggregateWithCorrelation(votes, correlationMatrix): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L75)

Aggregate votes using Bayesian correlation-aware method.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### correlationMatrix

[`CorrelationMatrix`](#correlationmatrix)

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

###### Inherited from

[`OWVoting`](#owvoting).[`aggregateWithCorrelation`](#aggregatewithcorrelation-1)

##### calculateOutcome()

```ts
calculateOutcome(votes, _weights?): VotingOutcome;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L70)

IVotingStrategy implementation for integration with ConsensusEngine.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### \_weights?

`Map`\<`string`, `number`\>

###### Returns

[`VotingOutcome`](#votingoutcome)

###### Implementation of

[`IVotingStrategy`](#ivotingstrategy).[`calculateOutcome`](#calculateoutcome-6)

###### Inherited from

[`OWVoting`](#owvoting).[`calculateOutcome`](#calculateoutcome-1)

##### computeISP()

```ts
computeISP(votes, independentSubsets): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L135)

Compute result using Independent Subset Partition method.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### independentSubsets

readonly [`IndependentSubset`](#independentsubset)[]

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

###### Inherited from

[`OWVoting`](#owvoting).[`computeISP`](#computeisp-1)

##### estimateCorrelation()

```ts
estimateCorrelation(tracker): CorrelationMatrix;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L131)

Estimate correlation matrix from voting history.

###### Parameters

###### tracker

[`ICorrelationTracker`](#icorrelationtracker)

###### Returns

[`CorrelationMatrix`](#correlationmatrix)

###### Inherited from

[`OWVoting`](#owvoting).[`estimateCorrelation`](#estimatecorrelation-1)

##### getConfig()

```ts
getConfig(): HigherOrderVotingConfig;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L217)

Get the current configuration.

###### Returns

[`HigherOrderVotingConfig`](#higherordervotingconfig)

###### Inherited from

[`OWVoting`](#owvoting).[`getConfig`](#getconfig-1)

---

### NoAdapterError

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L229)

Error thrown when no adapter is available and simulation is disabled.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new NoAdapterError(message): NoAdapterError;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L230)

###### Parameters

###### message

`string`

###### Returns

[`NoAdapterError`](#noadaptererror)

###### Overrides

```ts
Error.constructor;
```

#### Properties

##### cause?

```ts
optional cause?: unknown;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es2022.error.d.ts:24

###### Inherited from

```ts
Error.cause;
```

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
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

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

### OWVoting

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L57)

Opinion-Wise higher-order voting implementation.
Uses Bayesian aggregation with correlation awareness.

#### Extended by

- [`HigherOrderVotingStrategy`](#higherordervotingstrategy)

#### Implements

- [`IHigherOrderVoting`](#ihigherordervoting)
- [`IVotingStrategy`](#ivotingstrategy)

#### Constructors

##### Constructor

```ts
new OWVoting(options?): OWVoting;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L61)

###### Parameters

###### options?

[`OWVotingOptions`](#owvotingoptions) = `{}`

###### Returns

[`OWVoting`](#owvoting)

#### Properties

##### algorithm

```ts
readonly algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise";
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L58)

###### Implementation of

[`IVotingStrategy`](#ivotingstrategy).[`algorithm`](#algorithm-6)

#### Methods

##### aggregate()

```ts
aggregate(votes, tracker): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L182)

Full pipeline: estimate correlation, compute result.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### tracker

[`ICorrelationTracker`](#icorrelationtracker)

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

###### Implementation of

[`IHigherOrderVoting`](#ihigherordervoting).[`aggregate`](#aggregate-2)

##### aggregateWithCorrelation()

```ts
aggregateWithCorrelation(votes, correlationMatrix): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L75)

Aggregate votes using Bayesian correlation-aware method.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### correlationMatrix

[`CorrelationMatrix`](#correlationmatrix)

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

###### Implementation of

[`IHigherOrderVoting`](#ihigherordervoting).[`aggregateWithCorrelation`](#aggregatewithcorrelation-2)

##### calculateOutcome()

```ts
calculateOutcome(votes, _weights?): VotingOutcome;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L70)

IVotingStrategy implementation for integration with ConsensusEngine.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### \_weights?

`Map`\<`string`, `number`\>

###### Returns

[`VotingOutcome`](#votingoutcome)

###### Implementation of

[`IVotingStrategy`](#ivotingstrategy).[`calculateOutcome`](#calculateoutcome-6)

##### computeISP()

```ts
computeISP(votes, independentSubsets): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L135)

Compute result using Independent Subset Partition method.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### independentSubsets

readonly [`IndependentSubset`](#independentsubset)[]

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

###### Implementation of

[`IHigherOrderVoting`](#ihigherordervoting).[`computeISP`](#computeisp-2)

##### estimateCorrelation()

```ts
estimateCorrelation(tracker): CorrelationMatrix;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L131)

Estimate correlation matrix from voting history.

###### Parameters

###### tracker

[`ICorrelationTracker`](#icorrelationtracker)

###### Returns

[`CorrelationMatrix`](#correlationmatrix)

###### Implementation of

[`IHigherOrderVoting`](#ihigherordervoting).[`estimateCorrelation`](#estimatecorrelation-2)

##### getConfig()

```ts
getConfig(): HigherOrderVotingConfig;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L217)

Get the current configuration.

###### Returns

[`HigherOrderVotingConfig`](#higherordervotingconfig)

###### Implementation of

[`IHigherOrderVoting`](#ihigherordervoting).[`getConfig`](#getconfig-2)

---

### ProofOfLearningStrategy

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L254)

Proof-of-learning weighted voting strategy.
Agents with better track records have more voting power.

#### Extends

- `BaseVotingStrategy`

#### Constructors

##### Constructor

```ts
new ProofOfLearningStrategy(): ProofOfLearningStrategy;
```

###### Returns

[`ProofOfLearningStrategy`](#proofoflearningstrategy)

###### Inherited from

```ts
BaseVotingStrategy.constructor;
```

#### Properties

##### algorithm

```ts
readonly algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise" = 'proof_of_learning';
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:255](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L255)

###### Overrides

```ts
BaseVotingStrategy.algorithm;
```

#### Methods

##### calculateOutcome()

```ts
calculateOutcome(votes, weights?): VotingOutcome;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L257)

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### weights?

`Map`\<`string`, `number`\>

###### Returns

[`VotingOutcome`](#votingoutcome)

###### Overrides

```ts
BaseVotingStrategy.calculateOutcome;
```

##### countVotes()

```ts
protected countVotes(votes): VoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L70)

Count votes by decision type.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`VoteCounts`](#votecounts-1)

###### Inherited from

```ts
BaseVotingStrategy.countVotes;
```

##### countWeightedVotes()

```ts
protected countWeightedVotes(votes, weights): WeightedVoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L95)

Calculate weighted vote counts using agent performance weights.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### weights

`Map`\<`string`, `number`\>

###### Returns

[`WeightedVoteCounts`](#weightedvotecounts)

###### Inherited from

```ts
BaseVotingStrategy.countWeightedVotes;
```

---

### SimpleMajorityStrategy

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L128)

Simple majority voting strategy (>50% approval).

#### Extends

- `BaseVotingStrategy`

#### Constructors

##### Constructor

```ts
new SimpleMajorityStrategy(): SimpleMajorityStrategy;
```

###### Returns

[`SimpleMajorityStrategy`](#simplemajoritystrategy)

###### Inherited from

```ts
BaseVotingStrategy.constructor;
```

#### Properties

##### algorithm

```ts
readonly algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise" = 'simple_majority';
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L129)

###### Overrides

```ts
BaseVotingStrategy.algorithm;
```

#### Methods

##### calculateOutcome()

```ts
calculateOutcome(votes): VotingOutcome;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L131)

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`VotingOutcome`](#votingoutcome)

###### Overrides

```ts
BaseVotingStrategy.calculateOutcome;
```

##### countVotes()

```ts
protected countVotes(votes): VoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L70)

Count votes by decision type.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`VoteCounts`](#votecounts-1)

###### Inherited from

```ts
BaseVotingStrategy.countVotes;
```

##### countWeightedVotes()

```ts
protected countWeightedVotes(votes, weights): WeightedVoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L95)

Calculate weighted vote counts using agent performance weights.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### weights

`Map`\<`string`, `number`\>

###### Returns

[`WeightedVoteCounts`](#weightedvotecounts)

###### Inherited from

```ts
BaseVotingStrategy.countWeightedVotes;
```

---

### SupermajorityStrategy

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L166)

Supermajority voting strategy (>=67% approval).

#### Extends

- `BaseVotingStrategy`

#### Constructors

##### Constructor

```ts
new SupermajorityStrategy(): SupermajorityStrategy;
```

###### Returns

[`SupermajorityStrategy`](#supermajoritystrategy)

###### Inherited from

```ts
BaseVotingStrategy.constructor;
```

#### Properties

##### algorithm

```ts
readonly algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise" = 'supermajority';
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L167)

###### Overrides

```ts
BaseVotingStrategy.algorithm;
```

#### Methods

##### calculateOutcome()

```ts
calculateOutcome(votes): VotingOutcome;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L169)

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`VotingOutcome`](#votingoutcome)

###### Overrides

```ts
BaseVotingStrategy.calculateOutcome;
```

##### countVotes()

```ts
protected countVotes(votes): VoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L70)

Count votes by decision type.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`VoteCounts`](#votecounts-1)

###### Inherited from

```ts
BaseVotingStrategy.countVotes;
```

##### countWeightedVotes()

```ts
protected countWeightedVotes(votes, weights): WeightedVoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L95)

Calculate weighted vote counts using agent performance weights.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### weights

`Map`\<`string`, `number`\>

###### Returns

[`WeightedVoteCounts`](#weightedvotecounts)

###### Inherited from

```ts
BaseVotingStrategy.countWeightedVotes;
```

---

### UnanimousStrategy

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L204)

Unanimous voting strategy (100% approval required).

#### Extends

- `BaseVotingStrategy`

#### Constructors

##### Constructor

```ts
new UnanimousStrategy(): UnanimousStrategy;
```

###### Returns

[`UnanimousStrategy`](#unanimousstrategy)

###### Inherited from

```ts
BaseVotingStrategy.constructor;
```

#### Properties

##### algorithm

```ts
readonly algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise" = 'unanimous';
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L205)

###### Overrides

```ts
BaseVotingStrategy.algorithm;
```

#### Methods

##### calculateOutcome()

```ts
calculateOutcome(votes): VotingOutcome;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L207)

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`VotingOutcome`](#votingoutcome)

###### Overrides

```ts
BaseVotingStrategy.calculateOutcome;
```

##### countVotes()

```ts
protected countVotes(votes): VoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L70)

Count votes by decision type.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`VoteCounts`](#votecounts-1)

###### Inherited from

```ts
BaseVotingStrategy.countVotes;
```

##### countWeightedVotes()

```ts
protected countWeightedVotes(votes, weights): WeightedVoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L95)

Calculate weighted vote counts using agent performance weights.

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### weights

`Map`\<`string`, `number`\>

###### Returns

[`WeightedVoteCounts`](#weightedvotecounts)

###### Inherited from

```ts
BaseVotingStrategy.countWeightedVotes;
```

---

### VotingProtocol

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L48)

Multi-round voting protocol for code review.

#### Implements

- [`IVotingProtocol`](#ivotingprotocol)

#### Constructors

##### Constructor

```ts
new VotingProtocol(customLogger?): VotingProtocol;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L52)

###### Parameters

###### customLogger?

[`ILogger`](core.md#ilogger)

###### Returns

[`VotingProtocol`](#votingprotocol)

#### Methods

##### createSession()

```ts
createSession(
   topic,
   committee,
   config?): VotingSession;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L59)

Create a new voting session with a committee.

###### Parameters

###### topic

`string`

###### committee

`string`[]

###### config?

`Partial`\<[`VotingProtocolConfig`](#votingprotocolconfig)\>

###### Returns

[`VotingSession`](#votingsession)

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`createSession`](#createsession-1)

##### detectSycophancy()

```ts
detectSycophancy(sessionId): SycophancyReport;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:334](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L334)

Detect sycophancy patterns.

###### Parameters

###### sessionId

`string`

###### Returns

[`SycophancyReport`](#sycophancyreport)

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`detectSycophancy`](#detectsycophancy-1)

##### getResult()

```ts
getResult(sessionId): Promise<VotingProtocolResult | null>;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L297)

Get the final result.

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingProtocolResult`](#votingprotocolresult) \| `null`\>

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`getResult`](#getresult-3)

##### getSession()

```ts
getSession(sessionId): VotingSession | undefined;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:342](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L342)

Get the current session state.

###### Parameters

###### sessionId

`string`

###### Returns

[`VotingSession`](#votingsession) \| `undefined`

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`getSession`](#getsession-1)

##### startAnalysisRound()

```ts
startAnalysisRound(sessionId): Promise<VotingRound>;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L98)

Start the analysis round (Round 1).

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingRound`](#votinground)\>

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`startAnalysisRound`](#startanalysisround-1)

##### startConsensusRound()

```ts
startConsensusRound(sessionId): Promise<VotingRound>;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L237)

Start the consensus round (Round 3).

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingRound`](#votinground)\>

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`startConsensusRound`](#startconsensusround-1)

##### startDeliberationRound()

```ts
startDeliberationRound(sessionId): Promise<VotingRound>;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L152)

Start the deliberation round (Round 2).

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingRound`](#votinground)\>

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`startDeliberationRound`](#startdeliberationround-1)

##### submitFinalVote()

```ts
submitFinalVote(
   sessionId,
   agentId,
vote): Promise<void>;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L262)

Submit final vote during consensus.

###### Parameters

###### sessionId

`string`

###### agentId

`string`

###### vote

###### conditions?

`string`[] = `...`

###### confidence

`number` = `...`

###### decision

`"approve"` \| `"reject"` \| `"abstain"` = `VoteDecisionSchema`

###### findings?

\{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[] = `...`

Pre-verified PR-review findings (#2245 v4 follow-up). Optional;
populated only when the voter emits the structured top-level array.

###### reasoning

`string` = `...`

###### rejectionCategories?

(
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[] = `...`

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

###### timestamp?

`string` = `...`

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`submitFinalVote`](#submitfinalvote-1)

##### submitFindings()

```ts
submitFindings(
   sessionId,
   agentId,
findings): Promise<void>;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L117)

Submit findings from an agent during analysis.

###### Parameters

###### sessionId

`string`

###### agentId

`string`

###### findings

\{
`agentId`: `string`;
`category`: \| `"security"`
\| `"documentation"`
\| `"design"`
\| `"performance"`
\| `"bug"`
\| `"other"`
\| `"style"`;
`confidence`: `number`;
`description`: `string`;
`location?`: `string`;
`severity`: `"critical"` \| `"minor"` \| `"major"` \| `"suggestion"`;
`suggestion?`: `string`;
`timestamp?`: `string`;
\}[]

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`submitFindings`](#submitfindings-1)

##### voteOnFinding()

```ts
voteOnFinding(sessionId, vote): Promise<void>;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L198)

Vote on findings during deliberation.

###### Parameters

###### sessionId

`string`

###### vote

###### agentId

`string` = `...`

###### agree

`boolean` = `...`

###### amendedSeverity?

`"critical"` \| `"minor"` \| `"major"` \| `"suggestion"` = `...`

###### findingId

`string` = `...`

###### reasoning?

`string` = `...`

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`IVotingProtocol`](#ivotingprotocol).[`voteOnFinding`](#voteonfinding-1)

---

### VotingStrategyFactory

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L311)

Factory for creating voting strategies.

#### Constructors

##### Constructor

```ts
new VotingStrategyFactory(): VotingStrategyFactory;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L314)

###### Returns

[`VotingStrategyFactory`](#votingstrategyfactory)

#### Methods

##### getAvailableAlgorithms()

```ts
getAvailableAlgorithms(): (
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise")[];
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:346](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L346)

Get all available algorithm types.

###### Returns

(
\| `"higher_order"`
\| `"simple_majority"`
\| `"supermajority"`
\| `"unanimous"`
\| `"proof_of_learning"`
\| `"opinion_wise"`)[]

##### getStrategy()

```ts
getStrategy(algorithm): IVotingStrategy;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:328](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L328)

Get a voting strategy by algorithm type.

###### Parameters

###### algorithm

\| `"higher_order"`
\| `"simple_majority"`
\| `"supermajority"`
\| `"unanimous"`
\| `"proof_of_learning"`
\| `"opinion_wise"`

###### Returns

[`IVotingStrategy`](#ivotingstrategy)

##### registerStrategy()

```ts
registerStrategy(strategy): void;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:339](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L339)

Register a custom voting strategy.

###### Parameters

###### strategy

[`IVotingStrategy`](#ivotingstrategy)

###### Returns

`void`

---

### WeightedVoting

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L52)

Weighted Byzantine voting implementation.
Implements CP-WBFT pattern for fault-tolerant multi-agent consensus.

#### Implements

- [`IWeightedVoting`](#iweightedvoting)

#### Constructors

##### Constructor

```ts
new WeightedVoting(options?): WeightedVoting;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L58)

###### Parameters

###### options?

[`WeightedVotingOptions`](#weightedvotingoptions) = `{}`

###### Returns

[`WeightedVoting`](#weightedvoting)

#### Methods

##### calculateWeight()

```ts
calculateWeight(agentId): number;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L68)

Calculate vote weight for an agent

###### Parameters

###### agentId

`string`

###### Returns

`number`

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`calculateWeight`](#calculateweight-1)

##### canVote()

```ts
canVote(agentId): boolean;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L185)

Check if agent can vote

###### Parameters

###### agentId

`string`

###### Returns

`boolean`

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`canVote`](#canvote-1)

##### flagByzantine()

```ts
flagByzantine(agentId, reason): void;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L152)

Flag agent for Byzantine behavior

###### Parameters

###### agentId

`string`

###### reason

`string`

###### Returns

`void`

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`flagByzantine`](#flagbyzantine-1)

##### getAgentRecord()

```ts
getAgentRecord(agentId): WeightedAgentRecord | undefined;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L146)

Get agent performance record

###### Parameters

###### agentId

`string`

###### Returns

[`WeightedAgentRecord`](#weightedagentrecord) \| `undefined`

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`getAgentRecord`](#getagentrecord-1)

##### getAllRecords()

```ts
getAllRecords(): readonly WeightedAgentRecord[];
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L181)

Get all agent records

###### Returns

readonly [`WeightedAgentRecord`](#weightedagentrecord)[]

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`getAllRecords`](#getallrecords-1)

##### recalibrateWeights()

```ts
recalibrateWeights(): void;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L191)

Recalibrate all weights based on global performance

###### Returns

`void`

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`recalibrateWeights`](#recalibrateweights-1)

##### registerAgent()

```ts
registerAgent(agentId): void;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L136)

Register a new agent

###### Parameters

###### agentId

`string`

###### Returns

`void`

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`registerAgent`](#registeragent-1)

##### updatePerformance()

```ts
updatePerformance(agentId, outcome): void;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L74)

Update agent performance based on task outcome

###### Parameters

###### agentId

`string`

###### outcome

`"unknown"` \| `"success"` \| `"failure"` \| `"partial"`

###### Returns

`void`

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`updatePerformance`](#updateperformance-1)

##### weightedConsensus()

```ts
weightedConsensus(votes): WeightedConsensusResult;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L109)

Run weighted consensus on votes

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`WeightedConsensusResult`](#weightedconsensusresult)

###### Implementation of

[`IWeightedVoting`](#iweightedvoting).[`weightedConsensus`](#weightedconsensus-1)

## Interfaces

### AgentPerformance

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L196)

Agent performance record for proof-of-learning.

#### Properties

##### agentId

```ts
agentId: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L197)

##### correctVotes

```ts
correctVotes: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L199)

##### lastUpdated

```ts
lastUpdated: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L201)

##### successRate

```ts
successRate: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L200)

##### totalVotes

```ts
totalVotes: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L198)

---

### AgentVoteResult

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L71)

Individual agent vote with metadata.

#### Properties

##### cli?

```ts
readonly optional cli?: string;
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L83)

CLI that executed this vote (for adaptive routing feedback).

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L104)

Error message if vote fell back to simulation or encountered an error

##### inputTokens?

```ts
readonly optional inputTokens?: number;
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L97)

Input tokens the adapter reported for this voter's LLM call, when known
(#3910). Propagated from `CompletionResponse.usage` so per-decision cost
aggregation resolves from `unmeasured` to MEASURED. Absent for
error/simulation votes that never reached a model, or for adapters that do
not report usage (CLI subscriptions) — those stay honestly `unmeasured`.

##### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L89)

Model id that executed this vote, when known (e.g. 'claude-sonnet'). Carried
so per-decision cost aggregation can attribute spend per model (#3855). Absent
for error/simulation votes that never reached a model.

##### outputTokens?

```ts
readonly optional outputTokens?: number;
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L102)

Output tokens the adapter reported for this voter's LLM call, when known
(#3910). See [AgentVoteResult.inputTokens](#inputtokens).

##### processingTimeMs

```ts
readonly processingTimeMs: number;
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L74)

##### role

```ts
readonly role: VoterRole;
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L72)

##### source

```ts
readonly source: "error" | "llm" | "simulation";
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L81)

Source of the vote:

- 'llm': Real LLM execution
- 'simulation': Fallback simulation (opt-in only)
- 'error': Error during execution (Issue #523)

##### vote

```ts
readonly vote: {
  conditions?: string[];
  confidence: number;
  decision: "approve" | "reject" | "abstain";
  findings?: {
     claim: string;
     gate: {
        named_assertion: string;
        reread_cited_line: "failed" | "skipped" | "passed";
        ruled_out_language_non_issue: "failed" | "skipped" | "passed";
        traced_call_path: "failed" | "skipped" | "passed";
     };
     location: string;
     severity: "critical" | "high" | "low" | "medium";
     summary: string;
  }[];
  reasoning: string;
  rejectionCategories?: (
     | "YAGNI"
     | "DRY_VIOLATION"
     | "OVER_ENGINEERING"
     | "SCOPE_CREEP"
     | "SECURITY_RISK"
     | "MISALIGNED"
    | "INSUFFICIENT_EVIDENCE")[];
  timestamp?: string;
};
```

Defined in: [packages/nexus-agents/src/cli/vote-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/vote-types.ts#L73)

###### conditions?

```ts
optional conditions?: string[];
```

###### confidence

```ts
confidence: number;
```

###### decision

```ts
decision: "approve" | "reject" | "abstain" = VoteDecisionSchema;
```

###### findings?

```ts
optional findings?: {
  claim: string;
  gate: {
     named_assertion: string;
     reread_cited_line: "failed" | "skipped" | "passed";
     ruled_out_language_non_issue: "failed" | "skipped" | "passed";
     traced_call_path: "failed" | "skipped" | "passed";
  };
  location: string;
  severity: "critical" | "high" | "low" | "medium";
  summary: string;
}[];
```

Pre-verified PR-review findings (#2245 v4 follow-up). Optional;
populated only when the voter emits the structured top-level array.

###### reasoning

```ts
reasoning: string;
```

###### rejectionCategories?

```ts
optional rejectionCategories?: (
  | "YAGNI"
  | "DRY_VIOLATION"
  | "OVER_ENGINEERING"
  | "SCOPE_CREEP"
  | "SECURITY_RISK"
  | "MISALIGNED"
  | "INSUFFICIENT_EVIDENCE")[];
```

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

###### timestamp?

```ts
optional timestamp?: string;
```

---

### CollectRealVotesOptions

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L217)

Options for collecting votes from multiple agents.

#### Extends

- `VoterAgentOptions`

#### Properties

##### adapter?

```ts
readonly optional adapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L113)

Model adapter to use (auto-selected if not provided)

###### Inherited from

```ts
VoterAgentOptions.adapter;
```

##### allowSimulation?

```ts
readonly optional allowSimulation?: boolean;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L119)

Whether to allow simulation fallback (default: false per Issue #280)

###### Inherited from

```ts
VoterAgentOptions.allowSimulation;
```

##### interAgentDelayMs?

```ts
readonly optional interAgentDelayMs?: number;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L121)

Delay between launching each agent vote to prevent rate limiting (default: 1000ms). Set to 0 to disable.

###### Inherited from

```ts
VoterAgentOptions.interAgentDelayMs;
```

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L111)

Logger instance

###### Inherited from

```ts
VoterAgentOptions.logger;
```

##### maxRetries?

```ts
readonly optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L117)

Maximum retries per vote (default: 2)

###### Inherited from

```ts
VoterAgentOptions.maxRetries;
```

##### proposal

```ts
readonly proposal: string;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L221)

Proposal text

##### roles

```ts
readonly roles: readonly VoterRole[];
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L219)

Voter roles to include

##### simulate?

```ts
readonly optional simulate?: boolean;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L223)

Use simulation mode (explicit opt-in only)

##### timeoutMs?

```ts
readonly optional timeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L115)

Timeout per vote in milliseconds (default: 120000, override via NEXUS_VOTE_TIMEOUT_MS)

###### Inherited from

```ts
VoterAgentOptions.timeoutMs;
```

---

### ConsensusEngineConfig

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L268)

Consensus engine configuration.

#### Properties

##### defaultTimeout

```ts
defaultTimeout: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:269](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L269)

##### enablePerformanceTracking

```ts
enablePerformanceTracking: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L272)

##### incrementalQuorum?

```ts
optional incrementalQuorum?: IncrementalQuorumConfig;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:278](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L278)

Incremental quorum configuration (Issue #1408)

##### maxActiveProposals

```ts
maxActiveProposals: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:271](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L271)

##### maxClosedProposals

```ts
maxClosedProposals: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L274)

Maximum number of closed proposals to retain. Oldest are evicted when exceeded. (Issue #549)

##### minVotersForQuorum

```ts
minVotersForQuorum: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:270](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L270)

##### proposalCache?

```ts
optional proposalCache?: ProposalCacheConfig;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:276](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L276)

Content-based proposal caching for determinism (Issue #589)

---

### ConsensusMetrics

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L359)

Consensus metrics for monitoring.

#### Properties

##### algorithmUsage

```ts
algorithmUsage: Record<ConsensusAlgorithm, number>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:366](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L366)

##### approvedProposals

```ts
approvedProposals: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L361)

##### averageDurationMs

```ts
averageDurationMs: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:364](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L364)

##### averageVotesPerProposal

```ts
averageVotesPerProposal: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L365)

##### rejectedProposals

```ts
rejectedProposals: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L362)

##### timedOutProposals

```ts
timedOutProposals: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L363)

##### totalProposals

```ts
totalProposals: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:360](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L360)

---

### ConsensusResult

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L150)

Result of a consensus decision.

#### Properties

##### approvalPercentage

```ts
approvalPercentage: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L157)

##### closedAt

```ts
closedAt: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L160)

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L161)

##### outcome

```ts
outcome: 'timeout' | 'closed' | 'rejected' | 'pending' | 'voting' | 'approved';
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L153)

##### proposal

```ts
proposal: {
  algorithm:   | "higher_order"
     | "simple_majority"
     | "supermajority"
     | "unanimous"
     | "proof_of_learning"
     | "opinion_wise";
  createdAt?: string;
  description: string;
  id?: string;
  metadata?: Record<string, unknown>;
  requiredVoters?: string[];
  timeout?: number;
  title: string;
};
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L152)

###### algorithm

```ts
algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise" = ConsensusAlgorithmSchema;
```

###### createdAt?

```ts
optional createdAt?: string;
```

###### description

```ts
description: string;
```

###### id?

```ts
optional id?: string;
```

###### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

###### requiredVoters?

```ts
optional requiredVoters?: string[];
```

###### timeout?

```ts
optional timeout?: number;
```

###### title

```ts
title: string;
```

##### proposalId

```ts
proposalId: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L151)

##### quorumReached

```ts
quorumReached: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L158)

##### startedAt

```ts
startedAt: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L159)

##### voteCounts

```ts
voteCounts: VoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L155)

##### votes

```ts
votes: Map<
  string,
  {
    conditions?: string[];
    confidence: number;
    decision: 'approve' | 'reject' | 'abstain';
    findings?: {
      claim: string;
      gate: {
        named_assertion: string;
        reread_cited_line: 'failed' | 'skipped' | 'passed';
        ruled_out_language_non_issue: 'failed' | 'skipped' | 'passed';
        traced_call_path: 'failed' | 'skipped' | 'passed';
      };
      location: string;
      severity: 'critical' | 'high' | 'low' | 'medium';
      summary: string;
    }[];
    reasoning: string;
    rejectionCategories?: (
      | 'YAGNI'
      | 'DRY_VIOLATION'
      | 'OVER_ENGINEERING'
      | 'SCOPE_CREEP'
      | 'SECURITY_RISK'
      | 'MISALIGNED'
      | 'INSUFFICIENT_EVIDENCE'
    )[];
    timestamp?: string;
  }
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L154)

##### weightedCounts?

```ts
optional weightedCounts?: WeightedVoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L156)

---

### ConsolidatedFinding

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L154)

A consolidated finding after deliberation.

#### Properties

##### agreementRatio

```ts
agreementRatio: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L162)

##### category

```ts
category:
  | "security"
  | "documentation"
  | "design"
  | "performance"
  | "bug"
  | "other"
  | "style";
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L156)

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L158)

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L155)

##### location?

```ts
optional location?: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L159)

##### originalFindings

```ts
originalFindings: {
  agentId: string;
  category:   | "security"
     | "documentation"
     | "design"
     | "performance"
     | "bug"
     | "other"
     | "style";
  confidence: number;
  description: string;
  location?: string;
  severity: "critical" | "minor" | "major" | "suggestion";
  suggestion?: string;
  timestamp?: string;
}[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L163)

###### agentId

```ts
agentId: string;
```

###### category

```ts
category:
  | "security"
  | "documentation"
  | "design"
  | "performance"
  | "bug"
  | "other"
  | "style";
```

###### confidence

```ts
confidence: number;
```

###### description

```ts
description: string;
```

###### location?

```ts
optional location?: string;
```

###### severity

```ts
severity: 'critical' | 'minor' | 'major' | 'suggestion';
```

###### suggestion?

```ts
optional suggestion?: string;
```

###### timestamp?

```ts
optional timestamp?: string;
```

##### severity

```ts
severity: 'critical' | 'minor' | 'major' | 'suggestion';
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L157)

##### suggestion?

```ts
optional suggestion?: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L160)

##### supportingAgents

```ts
supportingAgents: string[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L161)

---

### CorrelationTrackerStats

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:241](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L241)

Statistics about correlation tracking.

#### Properties

##### averageCorrelation

```ts
readonly averageCorrelation: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:249](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L249)

Average correlation across all pairs

##### independentSubsetCount

```ts
readonly independentSubsetCount: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:251](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L251)

Number of identified independent subsets

##### pairsWithSufficientData

```ts
readonly pairsWithSufficientData: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L253)

Pairs with sufficient data for correlation calculation

##### totalAgents

```ts
readonly totalAgents: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L243)

Total agents being tracked

##### totalObservations

```ts
readonly totalObservations: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:247](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L247)

Total voting observations recorded

##### trackedPairs

```ts
readonly trackedPairs: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:245](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L245)

Total agent pairs with correlation data

---

### HigherOrderVotingConfig

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L146)

Configuration for higher-order voting.

#### Properties

##### correlationMaxAgeMs

```ts
readonly correlationMaxAgeMs: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L152)

Maximum correlation age in milliseconds before recalculation (default: 24h)

##### correlationThreshold

```ts
readonly correlationThreshold: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L150)

Correlation threshold to consider agents correlated (default: 0.3)

##### fallbackToSimpleVoting

```ts
readonly fallbackToSimpleVoting: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L156)

Whether to fall back to simple voting when correlation data insufficient

##### independenceThreshold

```ts
readonly independenceThreshold: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L154)

Independence threshold for ISP grouping (default: 0.2)

##### maxObservationsPerAgent

```ts
readonly maxObservationsPerAgent: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L160)

Maximum observations to store per agent before FIFO eviction (default: 1000)

##### maxProposals

```ts
readonly maxProposals: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L162)

Maximum total proposals to track before evicting oldest (default: 5000)

##### maxTrackedPairs

```ts
readonly maxTrackedPairs: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L164)

Maximum pairwise history entries before LRU eviction (default: 100)

##### minObservationsForCorrelation

```ts
readonly minObservationsForCorrelation: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L148)

Minimum observations before using correlation data (default: 10)

##### observationDecayFactor

```ts
readonly observationDecayFactor: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L158)

Decay factor for old observations (0-1, default: 0.95)

---

### HigherOrderVotingResult

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L198)

Result of Bayesian aggregation with correlation awareness.

#### Properties

##### decision

```ts
readonly decision: "approve" | "reject" | "no_consensus";
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L200)

Final decision

##### downweightedAgents

```ts
readonly downweightedAgents: readonly string[];
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L216)

Agents whose votes were down-weighted due to correlation

##### effectiveVoteCount

```ts
readonly effectiveVoteCount: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L206)

Effective number of independent votes

##### improvementOverBaseline

```ts
readonly improvementOverBaseline: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L212)

Improvement over baseline majority voting (percentage points)

##### independentSubsets?

```ts
readonly optional independentSubsets?: readonly IndependentSubset[];
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L214)

Independent subsets used (if ISP method)

##### method

```ts
readonly method: "simple" | "ow" | "isp";
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:210](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L210)

Method used: 'ow' (opinion-wise), 'isp', or 'simple' (fallback)

##### posteriorApproval

```ts
readonly posteriorApproval: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L202)

Posterior probability of approval

##### posteriorRejection

```ts
readonly posteriorRejection: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L204)

Posterior probability of rejection

##### reasoning

```ts
readonly reasoning: string;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:218](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L218)

Reasoning for the decision

##### usedCorrelationData

```ts
readonly usedCorrelationData: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:208](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L208)

Whether correlation data was sufficient

---

### IConsensusEngine

Defined in: [packages/nexus-agents/src/consensus/engine.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L52)

Interface for the consensus engine.

#### Methods

##### close()

```ts
close(proposalId): Promise<Result<ConsensusResult, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L56)

###### Parameters

###### proposalId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ConsensusResult`](#consensusresult), [`ConsensusError`](#consensuserror)\>\>

##### getMetrics()

```ts
getMetrics(): ConsensusMetrics;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L57)

###### Returns

[`ConsensusMetrics`](#consensusmetrics)

##### getResult()

```ts
getResult(proposalId): Promise<Result<ConsensusResult, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L55)

###### Parameters

###### proposalId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ConsensusResult`](#consensusresult), [`ConsensusError`](#consensuserror)\>\>

##### propose()

```ts
propose(proposal): Promise<Result<string, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L53)

###### Parameters

###### proposal

###### algorithm

\| `"higher_order"`
\| `"simple_majority"`
\| `"supermajority"`
\| `"unanimous"`
\| `"proof_of_learning"`
\| `"opinion_wise"` = `ConsensusAlgorithmSchema`

###### createdAt?

`string` = `...`

###### description

`string` = `...`

###### id?

`string` = `...`

###### metadata?

`Record`\<`string`, `unknown`\> = `...`

###### requiredVoters?

`string`[] = `...`

###### timeout?

`number` = `...`

###### title

`string` = `...`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`string`, [`ConsensusError`](#consensuserror)\>\>

##### vote()

```ts
vote(
   proposalId,
   agentId,
vote): Promise<Result<void, ConsensusError>>;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L54)

###### Parameters

###### proposalId

`string`

###### agentId

`string`

###### vote

###### conditions?

`string`[] = `...`

###### confidence

`number` = `...`

###### decision

`"approve"` \| `"reject"` \| `"abstain"` = `VoteDecisionSchema`

###### findings?

\{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[] = `...`

Pre-verified PR-review findings (#2245 v4 follow-up). Optional;
populated only when the voter emits the structured top-level array.

###### reasoning

`string` = `...`

###### rejectionCategories?

(
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[] = `...`

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

###### timestamp?

`string` = `...`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ConsensusError`](#consensuserror)\>\>

---

### ICorrelationTracker

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L268)

Interface for correlation tracking between agents.

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:312](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L312)

Clear all recorded data.

###### Returns

`void`

##### computeCorrelationMatrix()

```ts
computeCorrelationMatrix(): CorrelationMatrix;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:286](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L286)

Compute the full correlation matrix for all tracked agents.

###### Returns

[`CorrelationMatrix`](#correlationmatrix)

##### getCorrelation()

```ts
getCorrelation(agentA, agentB): number | undefined;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:292](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L292)

Get correlation between two specific agents.
Returns undefined if insufficient data.

###### Parameters

###### agentA

`string`

###### agentB

`string`

###### Returns

`number` \| `undefined`

##### getStats()

```ts
getStats(): CorrelationTrackerStats;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:307](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L307)

Get statistics about the correlation tracker.

###### Returns

[`CorrelationTrackerStats`](#correlationtrackerstats)

##### hasSufficientData()

```ts
hasSufficientData(agentIds): boolean;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L302)

Check if there is sufficient correlation data for a set of agents.

###### Parameters

###### agentIds

readonly `string`[]

###### Returns

`boolean`

##### identifyIndependentSubsets()

```ts
identifyIndependentSubsets(): readonly IndependentSubset[];
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L297)

Identify groups of agents that vote independently.

###### Returns

readonly [`IndependentSubset`](#independentsubset)[]

##### recordProposalVotes()

```ts
recordProposalVotes(
   proposalId,
   votes,
   outcome): void;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L277)

Record votes from multiple agents for the same proposal.

###### Parameters

###### proposalId

`string`

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### outcome

`"rejected"` \| `"approved"`

###### Returns

`void`

##### recordVote()

```ts
recordVote(
   agentId,
   vote,
   outcome): void;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L272)

Record a vote and its outcome for correlation tracking.

###### Parameters

###### agentId

`string`

###### vote

###### conditions?

`string`[] = `...`

###### confidence

`number` = `...`

###### decision

`"approve"` \| `"reject"` \| `"abstain"` = `VoteDecisionSchema`

###### findings?

\{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[] = `...`

Pre-verified PR-review findings (#2245 v4 follow-up). Optional;
populated only when the voter emits the structured top-level array.

###### reasoning

`string` = `...`

###### rejectionCategories?

(
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[] = `...`

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

###### timestamp?

`string` = `...`

###### outcome

`"rejected"` \| `"approved"`

###### Returns

`void`

---

### IHigherOrderVoting

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L322)

Interface for Opinion-Wise higher-order voting.

#### Methods

##### aggregate()

```ts
aggregate(votes, tracker): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:347](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L347)

Full pipeline: estimate correlation, compute result.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### tracker

[`ICorrelationTracker`](#icorrelationtracker)

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

##### aggregateWithCorrelation()

```ts
aggregateWithCorrelation(votes, correlationMatrix): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:326](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L326)

Aggregate votes using Bayesian correlation-aware method.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### correlationMatrix

[`CorrelationMatrix`](#correlationmatrix)

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

##### computeISP()

```ts
computeISP(votes, independentSubsets): HigherOrderVotingResult;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:339](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L339)

Compute result using Independent Subset Partition method.

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### independentSubsets

readonly [`IndependentSubset`](#independentsubset)[]

###### Returns

[`HigherOrderVotingResult`](#higherordervotingresult)

##### estimateCorrelation()

```ts
estimateCorrelation(tracker): CorrelationMatrix;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:334](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L334)

Estimate correlation matrix from voting history.

###### Parameters

###### tracker

[`ICorrelationTracker`](#icorrelationtracker)

###### Returns

[`CorrelationMatrix`](#correlationmatrix)

##### getConfig()

```ts
getConfig(): HigherOrderVotingConfig;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:355](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L355)

Get the current configuration.

###### Returns

[`HigherOrderVotingConfig`](#higherordervotingconfig)

---

### IndependentSubset

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L63)

A subset of agents that vote independently of each other.
Used in ISP (Independent Subset Partition) method.

#### Properties

##### agentIds

```ts
readonly agentIds: readonly string[];
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L67)

Agent IDs in this independent subset

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L65)

Unique identifier for this subset

##### independenceScore

```ts
readonly independenceScore: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L69)

Average internal independence score (lower = more independent)

##### observationCount

```ts
readonly observationCount: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L71)

Number of observations supporting this grouping

---

### IVotingProtocol

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L182)

Interface for the multi-round voting protocol.
(Source: Issue #100, arXiv:2512.21352)

#### Methods

##### createSession()

```ts
createSession(
   topic,
   committee,
   config?): VotingSession;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L184)

Create a new voting session with a committee

###### Parameters

###### topic

`string`

###### committee

`string`[]

###### config?

`Partial`\<[`VotingProtocolConfig`](#votingprotocolconfig)\>

###### Returns

[`VotingSession`](#votingsession)

##### detectSycophancy()

```ts
detectSycophancy(sessionId): SycophancyReport;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L212)

Check for sycophancy in the current round

###### Parameters

###### sessionId

`string`

###### Returns

[`SycophancyReport`](#sycophancyreport)

##### getResult()

```ts
getResult(sessionId): Promise<VotingProtocolResult | null>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L209)

Get the final result (closes session if complete)

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingProtocolResult`](#votingprotocolresult) \| `null`\>

##### getSession()

```ts
getSession(sessionId): VotingSession | undefined;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L215)

Get the current session state

###### Parameters

###### sessionId

`string`

###### Returns

[`VotingSession`](#votingsession) \| `undefined`

##### startAnalysisRound()

```ts
startAnalysisRound(sessionId): Promise<VotingRound>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L191)

Start the analysis round (Round 1)

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingRound`](#votinground)\>

##### startConsensusRound()

```ts
startConsensusRound(sessionId): Promise<VotingRound>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L203)

Start the consensus round (Round 3)

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingRound`](#votinground)\>

##### startDeliberationRound()

```ts
startDeliberationRound(sessionId): Promise<VotingRound>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L197)

Start the deliberation round (Round 2)

###### Parameters

###### sessionId

`string`

###### Returns

`Promise`\<[`VotingRound`](#votinground)\>

##### submitFinalVote()

```ts
submitFinalVote(
   sessionId,
   agentId,
vote): Promise<void>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L206)

Submit final vote during consensus

###### Parameters

###### sessionId

`string`

###### agentId

`string`

###### vote

###### conditions?

`string`[] = `...`

###### confidence

`number` = `...`

###### decision

`"approve"` \| `"reject"` \| `"abstain"` = `VoteDecisionSchema`

###### findings?

\{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[] = `...`

Pre-verified PR-review findings (#2245 v4 follow-up). Optional;
populated only when the voter emits the structured top-level array.

###### reasoning

`string` = `...`

###### rejectionCategories?

(
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[] = `...`

Structured rejection categories for reject→refine→re-vote loops (Issue #1213).

###### timestamp?

`string` = `...`

###### Returns

`Promise`\<`void`\>

##### submitFindings()

```ts
submitFindings(
   sessionId,
   agentId,
findings): Promise<void>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L194)

Submit findings from an agent during analysis

###### Parameters

###### sessionId

`string`

###### agentId

`string`

###### findings

\{
`agentId`: `string`;
`category`: \| `"security"`
\| `"documentation"`
\| `"design"`
\| `"performance"`
\| `"bug"`
\| `"other"`
\| `"style"`;
`confidence`: `number`;
`description`: `string`;
`location?`: `string`;
`severity`: `"critical"` \| `"minor"` \| `"major"` \| `"suggestion"`;
`suggestion?`: `string`;
`timestamp?`: `string`;
\}[]

###### Returns

`Promise`\<`void`\>

##### voteOnFinding()

```ts
voteOnFinding(sessionId, vote): Promise<void>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L200)

Vote on findings during deliberation

###### Parameters

###### sessionId

`string`

###### vote

###### agentId

`string` = `...`

###### agree

`boolean` = `...`

###### amendedSeverity?

`"critical"` \| `"minor"` \| `"major"` \| `"suggestion"` = `...`

###### findingId

`string` = `...`

###### reasoning?

`string` = `...`

###### Returns

`Promise`\<`void`\>

---

### IVotingStrategy

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L21)

Interface for voting strategy implementations.

#### Properties

##### algorithm

```ts
readonly algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise";
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L22)

#### Methods

##### calculateOutcome()

```ts
calculateOutcome(votes, weights?): VotingOutcome;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L23)

###### Parameters

###### votes

`Map`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### weights?

`Map`\<`string`, `number`\>

###### Returns

[`VotingOutcome`](#votingoutcome)

---

### IWeightedVoting

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L115)

Interface for weighted Byzantine voting.
(Source: Issue #103, arXiv:2511.10400 - CP-WBFT)

#### Methods

##### calculateWeight()

```ts
calculateWeight(agentId): number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L117)

Calculate vote weight for an agent

###### Parameters

###### agentId

`string`

###### Returns

`number`

##### canVote()

```ts
canVote(agentId): boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L138)

Check if agent can vote

###### Parameters

###### agentId

`string`

###### Returns

`boolean`

##### flagByzantine()

```ts
flagByzantine(agentId, reason): void;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L132)

Flag agent for Byzantine behavior

###### Parameters

###### agentId

`string`

###### reason

`string`

###### Returns

`void`

##### getAgentRecord()

```ts
getAgentRecord(agentId): WeightedAgentRecord | undefined;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L129)

Get agent performance record

###### Parameters

###### agentId

`string`

###### Returns

[`WeightedAgentRecord`](#weightedagentrecord) \| `undefined`

##### getAllRecords()

```ts
getAllRecords(): readonly WeightedAgentRecord[];
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L135)

Get all agent records

###### Returns

readonly [`WeightedAgentRecord`](#weightedagentrecord)[]

##### recalibrateWeights()

```ts
recalibrateWeights(): void;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L141)

Recalibrate all weights based on global performance

###### Returns

`void`

##### registerAgent()

```ts
registerAgent(agentId): void;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L126)

Register a new agent

###### Parameters

###### agentId

`string`

###### Returns

`void`

##### updatePerformance()

```ts
updatePerformance(agentId, outcome): void;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L120)

Update agent performance based on task outcome

###### Parameters

###### agentId

`string`

###### outcome

`"unknown"` \| `"success"` \| `"failure"` \| `"partial"`

###### Returns

`void`

##### weightedConsensus()

```ts
weightedConsensus(votes): WeightedConsensusResult;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L123)

Run weighted consensus on votes

###### Parameters

###### votes

`ReadonlyMap`\<`string`, \{
`conditions?`: `string`[];
`confidence`: `number`;
`decision`: `"approve"` \| `"reject"` \| `"abstain"`;
`findings?`: \{
`claim`: `string`;
`gate`: \{
`named_assertion`: `string`;
`reread_cited_line`: `"failed"` \| `"skipped"` \| `"passed"`;
`ruled_out_language_non_issue`: `"failed"` \| `"skipped"` \| `"passed"`;
`traced_call_path`: `"failed"` \| `"skipped"` \| `"passed"`;
\};
`location`: `string`;
`severity`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`summary`: `string`;
\}[];
`reasoning`: `string`;
`rejectionCategories?`: (
\| `"YAGNI"`
\| `"DRY_VIOLATION"`
\| `"OVER_ENGINEERING"`
\| `"SCOPE_CREEP"`
\| `"SECURITY_RISK"`
\| `"MISALIGNED"`
\| `"INSUFFICIENT_EVIDENCE"`)[];
`timestamp?`: `string`;
\}\>

###### Returns

[`WeightedConsensusResult`](#weightedconsensusresult)

---

### OWVotingOptions

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L43)

Options for creating OWVoting instance.

#### Properties

##### algorithm?

```ts
readonly optional algorithm?:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise";
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L50)

Algorithm label this instance reports (#3168). Defaults to `simple_majority`
for backward compatibility; `HigherOrderVotingStrategy` sets `opinion_wise`.
Keeps the label consistent whether constructed directly or via a factory.

##### config?

```ts
readonly optional config?: Partial<HigherOrderVotingConfig>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L44)

---

### PairwiseVotingHistory

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L115)

Aggregated voting history for a pair of agents.

#### Properties

##### agreements

```ts
readonly agreements: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L121)

Number of times both agents agreed

##### correlation

```ts
readonly correlation: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L125)

Computed correlation coefficient

##### disagreements

```ts
readonly disagreements: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L123)

Number of times agents disagreed

##### jointObservations

```ts
readonly jointObservations: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L119)

Number of proposals where both agents voted

##### lastUpdated

```ts
readonly lastUpdated: Date;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L127)

Last update timestamp

##### pairKey

```ts
readonly pairKey: `${string}:${string}`;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L117)

Agent pair key

---

### ProposalState

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L338)

Internal proposal state managed by the engine.

#### Properties

##### expansionInFlight?

```ts
optional expansionInFlight?: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:353](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L353)

True while a quorum expansion is awaiting its callback for this
proposal. Concurrent `vote()` calls check this to avoid double-
expanding across the `await` gap (Issue #2861). Per-proposal so
independent proposals never block each other.

##### expansionRounds?

```ts
optional expansionRounds?: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:346](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L346)

Number of incremental quorum expansions applied (Issue #1408).

##### proposal

```ts
proposal: {
  algorithm:   | "higher_order"
     | "simple_majority"
     | "supermajority"
     | "unanimous"
     | "proof_of_learning"
     | "opinion_wise";
  createdAt?: string;
  description: string;
  id?: string;
  metadata?: Record<string, unknown>;
  requiredVoters?: string[];
  timeout?: number;
  title: string;
};
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:339](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L339)

###### algorithm

```ts
algorithm:
  | "higher_order"
  | "simple_majority"
  | "supermajority"
  | "unanimous"
  | "proof_of_learning"
  | "opinion_wise" = ConsensusAlgorithmSchema;
```

###### createdAt?

```ts
optional createdAt?: string;
```

###### description

```ts
description: string;
```

###### id?

```ts
optional id?: string;
```

###### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

###### requiredVoters?

```ts
optional requiredVoters?: string[];
```

###### timeout?

```ts
optional timeout?: number;
```

###### title

```ts
title: string;
```

##### startedAt

```ts
startedAt: Date;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L343)

##### status

```ts
status: 'timeout' | 'closed' | 'rejected' | 'pending' | 'voting' | 'approved';
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:340](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L340)

##### timeoutId?

```ts
optional timeoutId?: Timeout;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:344](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L344)

##### votes

```ts
votes: Map<
  string,
  {
    conditions?: string[];
    confidence: number;
    decision: 'approve' | 'reject' | 'abstain';
    findings?: {
      claim: string;
      gate: {
        named_assertion: string;
        reread_cited_line: 'failed' | 'skipped' | 'passed';
        ruled_out_language_non_issue: 'failed' | 'skipped' | 'passed';
        traced_call_path: 'failed' | 'skipped' | 'passed';
      };
      location: string;
      severity: 'critical' | 'high' | 'low' | 'medium';
      summary: string;
    }[];
    reasoning: string;
    rejectionCategories?: (
      | 'YAGNI'
      | 'DRY_VIOLATION'
      | 'OVER_ENGINEERING'
      | 'SCOPE_CREEP'
      | 'SECURITY_RISK'
      | 'MISALIGNED'
      | 'INSUFFICIENT_EVIDENCE'
    )[];
    timestamp?: string;
  }
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L341)

##### voteWeights

```ts
voteWeights: Map<string, number>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:342](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L342)

---

### RoundSummary

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L169)

Summary of a single round.

#### Properties

##### agreementScore

```ts
agreementScore: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L174)

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L175)

##### findingsCount

```ts
findingsCount: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L172)

##### phase

```ts
phase: 'consensus' | 'analysis' | 'deliberation';
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L171)

##### roundNumber

```ts
roundNumber: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L170)

##### votesCount

```ts
votesCount: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L173)

---

### SycophancyIndicator

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:232](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L232)

Individual sycophancy indicator.

#### Properties

##### agents

```ts
agents: string[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:236](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L236)

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:234](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L234)

##### severity

```ts
severity: 'high' | 'low' | 'medium';
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:235](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L235)

##### type

```ts
type:
  | "premature_consensus"
  | "opinion_convergence"
  | "confidence_inflation"
  | "echo_chamber";
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:233](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L233)

---

### SycophancyReport

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L221)

Report from sycophancy detection.

#### Properties

##### affectedAgents

```ts
affectedAgents: string[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L225)

##### confidenceScore

```ts
confidenceScore: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L223)

##### detected

```ts
detected: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:222](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L222)

##### indicators

```ts
indicators: SycophancyIndicator[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:224](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L224)

##### recommendation

```ts
recommendation: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:226](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L226)

---

### VoteCounts

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L130)

Vote counts summary.

#### Properties

##### abstain

```ts
abstain: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L133)

##### approve

```ts
approve: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L131)

##### reject

```ts
reject: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L132)

##### total

```ts
total: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L134)

---

### VotingObservation

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L88)

Record of a single voting observation for correlation tracking.

#### Properties

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L92)

Agent who cast the vote

##### alignedWithOutcome

```ts
readonly alignedWithOutcome: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L98)

Whether the vote aligned with the final outcome

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L96)

Confidence level (0-1)

##### decision

```ts
readonly decision: "approve" | "reject" | "abstain";
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L94)

The vote decision

##### proposalId

```ts
readonly proposalId: string;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L90)

Unique proposal ID

##### timestamp

```ts
readonly timestamp: Date;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L100)

Timestamp of the vote

---

### VotingOutcome

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L29)

Result of a voting strategy calculation.

#### Properties

##### approvalPercentage

```ts
approvalPercentage: number;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L31)

##### approved

```ts
approved: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L30)

##### reason

```ts
reason: string;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L34)

##### voteCounts

```ts
voteCounts: VoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L32)

##### weightedCounts?

```ts
optional weightedCounts?: WeightedVoteCounts;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L33)

---

### VotingProtocolConfig

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L86)

Configuration for the voting protocol.

#### Properties

##### agreementThreshold

```ts
agreementThreshold: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L94)

Minimum agreement threshold (default: 0.67)

##### committeeSize

```ts
committeeSize: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L88)

Number of agents in the committee (default: 3)

##### enableAntiSycophancy

```ts
enableAntiSycophancy: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L96)

Enable anti-sycophancy detection (default: true)

##### maxRounds

```ts
maxRounds: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L90)

Maximum rounds before forcing decision (default: 3)

##### roundTimeoutMs

```ts
roundTimeoutMs: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L92)

Timeout per round in milliseconds (default: multi-llm-panel guard, 900000)

##### sycophancyThreshold

```ts
sycophancyThreshold: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L98)

Similarity threshold for sycophancy detection (default: 0.8)

---

### VotingProtocolResult

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L139)

Final result of a voting protocol session.

#### Properties

##### agreementScore

```ts
agreementScore: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L145)

##### consolidatedFindings

```ts
consolidatedFindings: ConsolidatedFinding[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L143)

##### outcome

```ts
outcome: 'rejected' | 'approved' | 'needs_revision' | 'no_consensus';
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L142)

##### participatingAgents

```ts
participatingAgents: string[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L148)

##### roundSummaries

```ts
roundSummaries: RoundSummary[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L144)

##### sessionId

```ts
sessionId: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L140)

##### sycophancyDetected

```ts
sycophancyDetected: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L146)

##### topic

```ts
topic: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L141)

##### totalDurationMs

```ts
totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L147)

---

### VotingRound

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L71)

A single voting round in the protocol.

#### Properties

##### completedAt?

```ts
optional completedAt?: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L79)

##### finalVotes

```ts
finalVotes: Map<
  string,
  {
    conditions?: string[];
    confidence: number;
    decision: 'approve' | 'reject' | 'abstain';
    findings?: {
      claim: string;
      gate: {
        named_assertion: string;
        reread_cited_line: 'failed' | 'skipped' | 'passed';
        ruled_out_language_non_issue: 'failed' | 'skipped' | 'passed';
        traced_call_path: 'failed' | 'skipped' | 'passed';
      };
      location: string;
      severity: 'critical' | 'high' | 'low' | 'medium';
      summary: string;
    }[];
    reasoning: string;
    rejectionCategories?: (
      | 'YAGNI'
      | 'DRY_VIOLATION'
      | 'OVER_ENGINEERING'
      | 'SCOPE_CREEP'
      | 'SECURITY_RISK'
      | 'MISALIGNED'
      | 'INSUFFICIENT_EVIDENCE'
    )[];
    timestamp?: string;
  }
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L77)

##### findings

```ts
findings: Map<
  string,
  {
    agentId: string;
    category: 'security' | 'documentation' | 'design' | 'performance' | 'bug' | 'other' | 'style';
    confidence: number;
    description: string;
    location?: string;
    severity: 'critical' | 'minor' | 'major' | 'suggestion';
    suggestion?: string;
    timestamp?: string;
  }
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L75)

##### findingVotes

```ts
findingVotes: Map<
  string,
  {
    agentId: string;
    agree: boolean;
    amendedSeverity?: 'critical' | 'minor' | 'major' | 'suggestion';
    findingId: string;
    reasoning?: string;
  }[]
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L76)

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L72)

##### phase

```ts
phase: 'consensus' | 'analysis' | 'deliberation';
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L73)

##### roundNumber

```ts
roundNumber: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L80)

##### startedAt

```ts
startedAt: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L78)

##### status

```ts
status: 'aborted' | 'completed' | 'pending' | 'in_progress' | 'awaiting_votes';
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L74)

---

### VotingSession

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L123)

Session state for a voting protocol instance.

#### Properties

##### committee

```ts
committee: string[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L126)

##### completedAt?

```ts
optional completedAt?: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L132)

##### config

```ts
config: VotingProtocolConfig;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L129)

##### createdAt

```ts
createdAt: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L131)

##### currentRound

```ts
currentRound: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L128)

##### finalResult?

```ts
optional finalResult?: VotingProtocolResult;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L133)

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L124)

##### rounds

```ts
rounds: VotingRound[];
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L127)

##### status

```ts
status: 'aborted' | 'completed' | 'active';
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L130)

##### topic

```ts
topic: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L125)

---

### WeightedAgentRecord

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L24)

Extended agent performance with Byzantine detection.

#### Properties

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L25)

##### byzantineFlags

```ts
readonly byzantineFlags: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L33)

##### createdAt

```ts
readonly createdAt: Date;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L35)

##### failedTasks

```ts
readonly failedTasks: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L28)

##### lastActive

```ts
readonly lastActive: Date;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L34)

##### partialTasks

```ts
readonly partialTasks: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L29)

##### successfulTasks

```ts
readonly successfulTasks: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L27)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L30)

##### totalTasks

```ts
readonly totalTasks: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L26)

##### trustScore

```ts
readonly trustScore: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L32)

##### weight

```ts
readonly weight: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L31)

---

### WeightedConsensusResult

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L55)

Weighted consensus result.

#### Properties

##### byzantineDetected

```ts
readonly byzantineDetected: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L61)

##### decision

```ts
readonly decision: "approve" | "reject" | "no_consensus";
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L56)

##### participatingAgents

```ts
readonly participatingAgents: readonly string[];
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L62)

##### quorumReached

```ts
readonly quorumReached: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L60)

##### totalWeight

```ts
readonly totalWeight: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L59)

##### weightBreakdown

```ts
readonly weightBreakdown: ReadonlyMap<string, number>;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L63)

##### weightedApproval

```ts
readonly weightedApproval: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L57)

##### weightedRejection

```ts
readonly weightedRejection: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L58)

---

### WeightedVoteCounts

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L140)

Weighted vote counts for proof-of-learning.

#### Properties

##### abstain

```ts
abstain: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L143)

##### approve

```ts
approve: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L141)

##### reject

```ts
reject: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L142)

##### totalWeight

```ts
totalWeight: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L144)

---

### WeightedVotingConfig

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L69)

Configuration for weighted Byzantine voting.

#### Properties

##### byzantineFlagThreshold

```ts
readonly byzantineFlagThreshold: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L81)

Byzantine flag threshold for exclusion (default: 3)

##### initialWeight

```ts
readonly initialWeight: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L83)

Initial weight for new agents (default: 0.5)

##### maxByzantineFraction

```ts
readonly maxByzantineFraction: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L73)

Maximum Byzantine fault tolerance (default: 0.33)

##### minTrustScore

```ts
readonly minTrustScore: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L79)

Trust score required to vote (default: 0.3)

##### minWeight

```ts
readonly minWeight: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L71)

Minimum weight to participate in voting (default: 0.1)

##### quorumThreshold

```ts
readonly quorumThreshold: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L85)

Quorum threshold for valid consensus (default: 0.67)

##### weightDecayFactor

```ts
readonly weightDecayFactor: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L75)

Weight decay factor per failed task (default: 0.9)

##### weightRecoveryFactor

```ts
readonly weightRecoveryFactor: number;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L77)

Weight recovery factor per successful task (default: 1.05)

---

### WeightedVotingOptions

Defined in: [packages/nexus-agents/src/consensus/weighted-voting-helpers.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting-helpers.ts#L36)

Options for WeightedVoting constructor.

#### Properties

##### config?

```ts
optional config?: Partial<WeightedVotingConfig>;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting-helpers.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting-helpers.ts#L38)

Configuration for voting thresholds and weights.

##### emitEvents?

```ts
optional emitEvents?: boolean;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting-helpers.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting-helpers.ts#L42)

Whether to emit Byzantine detection events (default: true if eventBus provided).

##### eventBus?

```ts
optional eventBus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting-helpers.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting-helpers.ts#L40)

Optional event bus for Byzantine detection events (Issue #218).

## Type Aliases

### AgentFinding

```ts
type AgentFinding = z.infer<typeof AgentFindingSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L54)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### AgentPairKey

```ts
type AgentPairKey = `${string}:${string}`;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L25)

Pair of agent IDs for correlation tracking.
Stored as "agentA:agentB" where agentA < agentB lexicographically.

---

### ConsensusAlgorithm

```ts
type ConsensusAlgorithm = z.infer<typeof ConsensusAlgorithmSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L27)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### CorrelationCoefficient

```ts
type CorrelationCoefficient = z.infer<typeof CorrelationCoefficientSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L52)

---

### CorrelationMatrix

```ts
type CorrelationMatrix = Map<AgentPairKey, CorrelationCoefficient>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L57)

Correlation matrix storing pairwise correlations between agents.

---

### FindingVote

```ts
type FindingVote = z.infer<typeof FindingVoteSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L66)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### Proposal

```ts
type Proposal = z.infer<typeof ProposalSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L120)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### ProposalId

```ts
type ProposalId = string;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L125)

Unique identifier for a proposal.

---

### ProposalStatus

```ts
type ProposalStatus = z.infer<typeof ProposalStatusSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L46)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### RejectionCategory

```ts
type RejectionCategory = z.infer<typeof RejectionCategorySchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L61)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### Vote

```ts
type Vote = z.infer<typeof VoteSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L105)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### VotingRoundPhase

```ts
type VotingRoundPhase = z.infer<typeof VotingRoundPhaseSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L27)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

---

### VotingRoundStatus

```ts
type VotingRoundStatus = z.infer<typeof VotingRoundStatusSchema>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L39)

Consensus exports - Voting protocols, consensus engine, and strategies
Split from index.ts for file size compliance (Issue #285)
Added to public API per Issue #351

NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
These are intentionally omitted to avoid duplicate export errors.

## Variables

### AgentFindingSchema

```ts
const AgentFindingSchema: ZodObject<
  {
    agentId: ZodString;
    category: ZodEnum<{
      bug: 'bug';
      design: 'design';
      documentation: 'documentation';
      other: 'other';
      performance: 'performance';
      security: 'security';
      style: 'style';
    }>;
    confidence: ZodNumber;
    description: ZodString;
    location: ZodOptional<ZodString>;
    severity: ZodEnum<{
      critical: 'critical';
      major: 'major';
      minor: 'minor';
      suggestion: 'suggestion';
    }>;
    suggestion: ZodOptional<ZodString>;
    timestamp: ZodOptional<ZodISODateTime>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L44)

A finding submitted by an agent during analysis.

---

### AgentPerformanceSchema

```ts
const AgentPerformanceSchema: ZodObject<
  {
    agentId: ZodString;
    correctVotes: ZodNumber;
    lastUpdated: ZodISODateTime;
    successRate: ZodNumber;
    totalVotes: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L207)

Agent performance schema.

---

### ConsensusAlgorithmSchema

```ts
const ConsensusAlgorithmSchema: ZodEnum<{
  higher_order: 'higher_order';
  opinion_wise: 'opinion_wise';
  proof_of_learning: 'proof_of_learning';
  simple_majority: 'simple_majority';
  supermajority: 'supermajority';
  unanimous: 'unanimous';
}>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L19)

Consensus algorithm types.

- simple_majority: >50% of votes required
- supermajority: >=67% of votes required
- unanimous: 100% approval required
- proof_of_learning: weighted voting based on agent performance
- opinion_wise: higher-order voting with correlation awareness (Issue #333)
- higher_order: alias for opinion_wise (Issue #514)

---

### ConsensusEngineConfigSchema

```ts
const ConsensusEngineConfigSchema: ZodObject<
  {
    defaultTimeout: ZodDefault<ZodNumber>;
    enablePerformanceTracking: ZodDefault<ZodBoolean>;
    maxActiveProposals: ZodDefault<ZodNumber>;
    maxClosedProposals: ZodDefault<ZodNumber>;
    minVotersForQuorum: ZodDefault<ZodNumber>;
    proposalCache: ZodOptional<
      ZodObject<
        {
          enabled: ZodDefault<ZodBoolean>;
          maxEntries: ZodDefault<ZodNumber>;
          ttlMs: ZodDefault<ZodNumber>;
        },
        $strip
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L293)

Consensus engine configuration schema.

---

### ConsensusMetricsSchema

```ts
const ConsensusMetricsSchema: ZodObject<
  {
    algorithmUsage: ZodRecord<
      ZodEnum<{
        higher_order: 'higher_order';
        opinion_wise: 'opinion_wise';
        proof_of_learning: 'proof_of_learning';
        simple_majority: 'simple_majority';
        supermajority: 'supermajority';
        unanimous: 'unanimous';
      }>,
      ZodNumber
    >;
    approvedProposals: ZodNumber;
    averageDurationMs: ZodNumber;
    averageVotesPerProposal: ZodNumber;
    rejectedProposals: ZodNumber;
    timedOutProposals: ZodNumber;
    totalProposals: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L372)

Consensus metrics schema.

---

### ConsensusResultSchema

```ts
const ConsensusResultSchema: ZodObject<{
  approvalPercentage: ZodNumber;
  closedAt: ZodISODateTime;
  durationMs: ZodNumber;
  outcome: ZodEnum<{
     approved: "approved";
     closed: "closed";
     pending: "pending";
     rejected: "rejected";
     timeout: "timeout";
     voting: "voting";
  }>;
  proposal: ZodObject<{
     algorithm: ZodEnum<{
        higher_order: "higher_order";
        opinion_wise: "opinion_wise";
        proof_of_learning: "proof_of_learning";
        simple_majority: "simple_majority";
        supermajority: "supermajority";
        unanimous: "unanimous";
     }>;
     createdAt: ZodOptional<ZodISODateTime>;
     description: ZodString;
     id: ZodOptional<ZodString>;
     metadata: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
     requiredVoters: ZodOptional<ZodArray<ZodString>>;
     timeout: ZodOptional<ZodNumber>;
     title: ZodString;
  }, $strip>;
  proposalId: ZodString;
  quorumReached: ZodBoolean;
  startedAt: ZodISODateTime;
  voteCounts: ZodObject<{
     abstain: ZodNumber;
     approve: ZodNumber;
     reject: ZodNumber;
     total: ZodNumber;
  }, $strip>;
  votes: ZodMap<ZodString, ZodObject<{
     conditions: ZodOptional<ZodArray<ZodString>>;
     confidence: ZodNumber;
     decision: ZodEnum<{
        abstain: "abstain";
        approve: "approve";
        reject: "reject";
     }>;
     findings: ZodOptional<ZodArray<ZodObject<{
        claim: ZodString;
        gate: ZodObject<{
           named_assertion: ...;
           reread_cited_line: ...;
           ruled_out_language_non_issue: ...;
           traced_call_path: ...;
        }, $strip>;
        location: ZodString;
        severity: ZodDefault<ZodEnum<...>>;
        summary: ZodString;
     }, $strip>>>;
     reasoning: ZodString;
     rejectionCategories: ZodOptional<ZodArray<ZodEnum<{
        DRY_VIOLATION: "DRY_VIOLATION";
        INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
        MISALIGNED: "MISALIGNED";
        OVER_ENGINEERING: "OVER_ENGINEERING";
        SCOPE_CREEP: "SCOPE_CREEP";
        SECURITY_RISK: "SECURITY_RISK";
        YAGNI: "YAGNI";
     }>>>;
     timestamp: ZodOptional<ZodISODateTime>;
  }, $strip>>;
  weightedCounts: ZodOptional<ZodObject<{
     abstain: ZodNumber;
     approve: ZodNumber;
     reject: ZodNumber;
     totalWeight: ZodNumber;
  }, $strip>>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L167)

Consensus result schema for validation.

---

### CorrelationCoefficientSchema

```ts
const CorrelationCoefficientSchema: ZodNumber;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L51)

Correlation coefficient between two agents' voting patterns.
Range: -1 (perfectly anti-correlated) to +1 (perfectly correlated).
0 indicates independence.

---

### CorrelationTrackerStatsSchema

```ts
const CorrelationTrackerStatsSchema: ZodObject<
  {
    averageCorrelation: ZodNumber;
    independentSubsetCount: ZodNumber;
    pairsWithSufficientData: ZodNumber;
    totalAgents: ZodNumber;
    totalObservations: ZodNumber;
    trackedPairs: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L256)

---

### DEFAULT_CONSENSUS_CONFIG

```ts
const DEFAULT_CONSENSUS_CONFIG: ConsensusEngineConfig;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:305](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L305)

Default configuration values.

---

### DEFAULT_HIGHER_ORDER_CONFIG

```ts
const DEFAULT_HIGHER_ORDER_CONFIG: HigherOrderVotingConfig;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L179)

---

### DEFAULT_VOTING_PROTOCOL_CONFIG

```ts
const DEFAULT_VOTING_PROTOCOL_CONFIG: VotingProtocolConfig;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L110)

---

### DEFAULT_WEIGHTED_VOTING_CONFIG

```ts
const DEFAULT_WEIGHTED_VOTING_CONFIG: WeightedVotingConfig;
```

Defined in: [packages/nexus-agents/src/consensus/types-weighted-voting.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-weighted-voting.ts#L99)

---

### FindingVoteSchema

```ts
const FindingVoteSchema: ZodObject<
  {
    agentId: ZodString;
    agree: ZodBoolean;
    amendedSeverity: ZodOptional<
      ZodEnum<{
        critical: 'critical';
        major: 'major';
        minor: 'minor';
        suggestion: 'suggestion';
      }>
    >;
    findingId: ZodString;
    reasoning: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L59)

Finding vote during deliberation.

---

### HigherOrderVotingConfigSchema

```ts
const HigherOrderVotingConfigSchema: ZodObject<
  {
    correlationMaxAgeMs: ZodDefault<ZodNumber>;
    correlationThreshold: ZodDefault<ZodNumber>;
    fallbackToSimpleVoting: ZodDefault<ZodBoolean>;
    independenceThreshold: ZodDefault<ZodNumber>;
    maxObservationsPerAgent: ZodDefault<ZodNumber>;
    maxProposals: ZodDefault<ZodNumber>;
    maxTrackedPairs: ZodDefault<ZodNumber>;
    minObservationsForCorrelation: ZodDefault<ZodNumber>;
    observationDecayFactor: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L167)

---

### HigherOrderVotingResultSchema

```ts
const HigherOrderVotingResultSchema: ZodObject<
  {
    decision: ZodEnum<{
      approve: 'approve';
      no_consensus: 'no_consensus';
      reject: 'reject';
    }>;
    downweightedAgents: ZodArray<ZodString>;
    effectiveVoteCount: ZodNumber;
    improvementOverBaseline: ZodNumber;
    independentSubsets: ZodOptional<
      ZodArray<
        ZodObject<
          {
            agentIds: ZodArray<ZodString>;
            id: ZodString;
            independenceScore: ZodNumber;
            observationCount: ZodNumber;
          },
          $strip
        >
      >
    >;
    method: ZodEnum<{
      isp: 'isp';
      ow: 'ow';
      simple: 'simple';
    }>;
    posteriorApproval: ZodNumber;
    posteriorRejection: ZodNumber;
    reasoning: ZodString;
    usedCorrelationData: ZodBoolean;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L221)

---

### IndependentSubsetSchema

```ts
const IndependentSubsetSchema: ZodObject<
  {
    agentIds: ZodArray<ZodString>;
    id: ZodString;
    independenceScore: ZodNumber;
    observationCount: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L74)

---

### PairwiseVotingHistorySchema

```ts
const PairwiseVotingHistorySchema: ZodObject<
  {
    agreements: ZodNumber;
    correlation: ZodNumber;
    disagreements: ZodNumber;
    jointObservations: ZodNumber;
    lastUpdated: ZodDate;
    pairKey: ZodType<
      `${string}:${string}`,
      unknown,
      $ZodTypeInternals<`${string}:${string}`, unknown>
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L130)

---

### ProposalSchema

```ts
const ProposalSchema: ZodObject<
  {
    algorithm: ZodEnum<{
      higher_order: 'higher_order';
      opinion_wise: 'opinion_wise';
      proof_of_learning: 'proof_of_learning';
      simple_majority: 'simple_majority';
      supermajority: 'supermajority';
      unanimous: 'unanimous';
    }>;
    createdAt: ZodOptional<ZodISODateTime>;
    description: ZodString;
    id: ZodOptional<ZodString>;
    metadata: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    requiredVoters: ZodOptional<ZodArray<ZodString>>;
    timeout: ZodOptional<ZodNumber>;
    title: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L110)

A proposal submitted for consensus.

---

### ProposalStatusSchema

```ts
const ProposalStatusSchema: ZodEnum<{
  approved: 'approved';
  closed: 'closed';
  pending: 'pending';
  rejected: 'rejected';
  timeout: 'timeout';
  voting: 'voting';
}>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L38)

Proposal status in the lifecycle.

---

### REJECTION_CATEGORIES

```ts
const REJECTION_CATEGORIES: (
  | 'YAGNI'
  | 'DRY_VIOLATION'
  | 'OVER_ENGINEERING'
  | 'SCOPE_CREEP'
  | 'SECURITY_RISK'
  | 'MISALIGNED'
  | 'INSUFFICIENT_EVIDENCE'
)[] = RejectionCategorySchema.options;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L66)

All valid rejection category values, for runtime reference.

---

### RejectionCategorySchema

```ts
const RejectionCategorySchema: ZodEnum<{
  DRY_VIOLATION: 'DRY_VIOLATION';
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE';
  MISALIGNED: 'MISALIGNED';
  OVER_ENGINEERING: 'OVER_ENGINEERING';
  SCOPE_CREEP: 'SCOPE_CREEP';
  SECURITY_RISK: 'SECURITY_RISK';
  YAGNI: 'YAGNI';
}>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L52)

Structured rejection feedback categories (Issue #1213).
Enables reject→refine→re-vote feedback loops by classifying rejection reasons.

---

### VoteSchema

```ts
const VoteSchema: ZodObject<{
  conditions: ZodOptional<ZodArray<ZodString>>;
  confidence: ZodNumber;
  decision: ZodEnum<{
     abstain: "abstain";
     approve: "approve";
     reject: "reject";
  }>;
  findings: ZodOptional<ZodArray<ZodObject<{
     claim: ZodString;
     gate: ZodObject<{
        named_assertion: ZodDefault<ZodString>;
        reread_cited_line: ZodDefault<ZodEnum<{
           failed: ...;
           passed: ...;
           skipped: ...;
        }>>;
        ruled_out_language_non_issue: ZodDefault<ZodEnum<{
           failed: ...;
           passed: ...;
           skipped: ...;
        }>>;
        traced_call_path: ZodDefault<ZodEnum<{
           failed: ...;
           passed: ...;
           skipped: ...;
        }>>;
     }, $strip>;
     location: ZodString;
     severity: ZodDefault<ZodEnum<{
        critical: "critical";
        high: "high";
        low: "low";
        medium: "medium";
     }>>;
     summary: ZodString;
  }, $strip>>>;
  reasoning: ZodString;
  rejectionCategories: ZodOptional<ZodArray<ZodEnum<{
     DRY_VIOLATION: "DRY_VIOLATION";
     INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE";
     MISALIGNED: "MISALIGNED";
     OVER_ENGINEERING: "OVER_ENGINEERING";
     SCOPE_CREEP: "SCOPE_CREEP";
     SECURITY_RISK: "SECURITY_RISK";
     YAGNI: "YAGNI";
  }>>>;
  timestamp: ZodOptional<ZodISODateTime>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L90)

A vote cast by an agent.

---

### VOTING_THRESHOLDS

```ts
const VOTING_THRESHOLDS: Record<ConsensusAlgorithm, number>;
```

Defined in: [packages/nexus-agents/src/consensus/types-core.ts:326](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-core.ts#L326)

Voting thresholds for each algorithm.

---

### VotingObservationSchema

```ts
const VotingObservationSchema: ZodObject<
  {
    agentId: ZodString;
    alignedWithOutcome: ZodBoolean;
    confidence: ZodNumber;
    decision: ZodEnum<{
      abstain: 'abstain';
      approve: 'approve';
      reject: 'reject';
    }>;
    proposalId: ZodString;
    timestamp: ZodDate;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L103)

---

### VotingProtocolConfigSchema

```ts
const VotingProtocolConfigSchema: ZodObject<
  {
    agreementThreshold: ZodDefault<ZodNumber>;
    committeeSize: ZodDefault<ZodNumber>;
    enableAntiSycophancy: ZodDefault<ZodBoolean>;
    maxRounds: ZodDefault<ZodNumber>;
    roundTimeoutMs: ZodDefault<ZodNumber>;
    sycophancyThreshold: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L101)

---

### VotingRoundPhaseSchema

```ts
const VotingRoundPhaseSchema: ZodEnum<{
  analysis: 'analysis';
  consensus: 'consensus';
  deliberation: 'deliberation';
}>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L26)

Voting round phases.

- analysis: Independent analysis (Round 1)
- deliberation: Share findings and discuss (Round 2)
- consensus: Final vote on recommendations (Round 3)

---

### VotingRoundStatusSchema

```ts
const VotingRoundStatusSchema: ZodEnum<{
  aborted: 'aborted';
  awaiting_votes: 'awaiting_votes';
  completed: 'completed';
  in_progress: 'in_progress';
  pending: 'pending';
}>;
```

Defined in: [packages/nexus-agents/src/consensus/types-voting-protocol.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/types-voting-protocol.ts#L32)

Voting round status.

## Functions

### buildFinalResult()

```ts
function buildFinalResult(state, proposalId, outcome, config): ConsensusResult;
```

Defined in: [packages/nexus-agents/src/consensus/result-builder.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/result-builder.ts#L45)

Build a final result for a closed proposal.

#### Parameters

##### state

[`ProposalState`](#proposalstate)

##### proposalId

`string`

##### outcome

[`VotingOutcome`](#votingoutcome)

##### config

[`ConsensusEngineConfig`](#consensusengineconfig)

#### Returns

[`ConsensusResult`](#consensusresult)

---

### buildPendingResult()

```ts
function buildPendingResult(state, proposalId, outcome, config): ConsensusResult;
```

Defined in: [packages/nexus-agents/src/consensus/result-builder.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/result-builder.ts#L20)

Build a pending result for an active proposal.

#### Parameters

##### state

[`ProposalState`](#proposalstate)

##### proposalId

`string`

##### outcome

[`VotingOutcome`](#votingoutcome)

##### config

[`ConsensusEngineConfig`](#consensusengineconfig)

#### Returns

[`ConsensusResult`](#consensusresult)

---

### buildTimeoutResult()

```ts
function buildTimeoutResult(state, proposalId, outcome, config): ConsensusResult;
```

Defined in: [packages/nexus-agents/src/consensus/result-builder.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/result-builder.ts#L73)

Build a timeout result for an expired proposal.

#### Parameters

##### state

[`ProposalState`](#proposalstate)

##### proposalId

`string`

##### outcome

[`VotingOutcome`](#votingoutcome)

##### config

[`ConsensusEngineConfig`](#consensusengineconfig)

#### Returns

[`ConsensusResult`](#consensusresult)

---

### calculateVoteWeight()

```ts
function calculateVoteWeight(performance): number;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:298](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L298)

Calculate vote weight for an agent based on their performance history.
Weight ranges from 0.5 (no history) to 1.0 (perfect track record).

#### Parameters

##### performance

[`AgentPerformance`](#agentperformance) \| `undefined`

#### Returns

`number`

---

### collectRealVotes()

```ts
function collectRealVotes(options): Promise<readonly AgentVoteResult[]>;
```

Defined in: [packages/nexus-agents/src/cli/voter-agents.ts:399](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli/voter-agents.ts#L399)

Collects votes from multiple voter agents.

Per Issue #280: No automatic simulation fallback. If no adapter is
available and simulation is not explicitly enabled, throws NoAdapterError.
Per Issue #845: Uses diverse CLIs when multiple are available.

#### Parameters

##### options

[`CollectRealVotesOptions`](#collectrealvotesoptions)

#### Returns

`Promise`\<readonly [`AgentVoteResult`](#agentvoteresult)[]\>

---

### createAgentPairKey()

```ts
function createAgentPairKey(agentA, agentB): `${string}:${string}`;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L31)

Creates a canonical agent pair key for correlation lookup.
Orders agents lexicographically to ensure consistent keys.

#### Parameters

##### agentA

`string`

##### agentB

`string`

#### Returns

`` `${string}:${string}` ``

---

### createConsensusEngine()

```ts
function createConsensusEngine(config?, logger?): ConsensusEngine;
```

Defined in: [packages/nexus-agents/src/consensus/engine.ts:695](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/engine.ts#L695)

Create a consensus engine with the given configuration.

#### Parameters

##### config?

`Partial`\<[`ConsensusEngineConfig`](#consensusengineconfig)\>

##### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`ConsensusEngine`](#consensusengine)

#### Example

```typescript
const engine = createConsensusEngine({
  defaultTimeout: 60000,
  maxActiveProposals: 10,
});
```

---

### createCorrelationTracker()

```ts
function createCorrelationTracker(config?): ICorrelationTracker;
```

Defined in: [packages/nexus-agents/src/consensus/correlation-tracker.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/correlation-tracker.ts#L385)

Creates a new correlation tracker instance.

#### Parameters

##### config?

`Partial`\<[`HigherOrderVotingConfig`](#higherordervotingconfig)\>

#### Returns

[`ICorrelationTracker`](#icorrelationtracker)

---

### createHigherOrderVotingStrategy()

```ts
function createHigherOrderVotingStrategy(options?): HigherOrderVotingStrategy;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:271](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L271)

Creates a higher-order voting strategy for use with ConsensusEngine.

#### Parameters

##### options?

[`OWVotingOptions`](#owvotingoptions)

#### Returns

[`HigherOrderVotingStrategy`](#higherordervotingstrategy)

---

### createOWVoting()

```ts
function createOWVoting(options?): IHigherOrderVoting;
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-voting.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-voting.ts#L254)

Creates a new OWVoting instance.

#### Parameters

##### options?

[`OWVotingOptions`](#owvotingoptions)

#### Returns

[`IHigherOrderVoting`](#ihigherordervoting)

---

### createStrategyFactory()

```ts
function createStrategyFactory(): VotingStrategyFactory;
```

Defined in: [packages/nexus-agents/src/consensus/strategies.ts:354](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/strategies.ts#L354)

Creates a voting strategy factory with default strategies.

#### Returns

[`VotingStrategyFactory`](#votingstrategyfactory)

---

### createVotingProtocol()

```ts
function createVotingProtocol(customLogger?): VotingProtocol;
```

Defined in: [packages/nexus-agents/src/consensus/voting-protocol.ts:398](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/voting-protocol.ts#L398)

Create a voting protocol instance.

#### Parameters

##### customLogger?

[`ILogger`](core.md#ilogger)

#### Returns

[`VotingProtocol`](#votingprotocol)

---

### createWeightedVoting()

```ts
function createWeightedVoting(options?): IWeightedVoting;
```

Defined in: [packages/nexus-agents/src/consensus/weighted-voting.ts:360](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/weighted-voting.ts#L360)

Create a weighted voting instance.

#### Parameters

##### options?

[`WeightedVotingOptions`](#weightedvotingoptions)

#### Returns

[`IWeightedVoting`](#iweightedvoting)

---

### determineFinalStatus()

```ts
function determineFinalStatus(
  quorumReached,
  approved
): 'timeout' | 'closed' | 'rejected' | 'pending' | 'voting' | 'approved';
```

Defined in: [packages/nexus-agents/src/consensus/result-builder.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/result-builder.ts#L98)

Determine final status based on quorum and approval.

#### Parameters

##### quorumReached

`boolean`

##### approved

`boolean`

#### Returns

`"timeout"` \| `"closed"` \| `"rejected"` \| `"pending"` \| `"voting"` \| `"approved"`

---

### generateProposalId()

```ts
function generateProposalId(): string;
```

Defined in: [packages/nexus-agents/src/consensus/helpers.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/helpers.ts#L13)

Generate a unique proposal ID.

#### Returns

`string`

---

### parseAgentPairKey()

```ts
function parseAgentPairKey(key): [string, string];
```

Defined in: [packages/nexus-agents/src/consensus/higher-order-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/consensus/higher-order-types.ts#L38)

Extracts agent IDs from a pair key.

#### Parameters

##### key

`` `${string}:${string}` ``

#### Returns

\[`string`, `string`\]
