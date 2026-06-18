---
title: 'API: learning'
description: Generated API reference for learning.
tier: 2
---

# learning

## Classes

### AbTestTracker

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L33)

A/B Test Tracker implementation.
Provides experiment management with deterministic variant assignment.

#### Implements

- [`IAbTestTracker`](#iabtesttracker)

#### Constructors

##### Constructor

```ts
new AbTestTracker(): AbTestTracker;
```

###### Returns

[`AbTestTracker`](#abtesttracker)

#### Methods

##### assignVariant()

```ts
assignVariant(experimentId, traceId): ExperimentVariant | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L122)

Assign a variant for a given trace ID (deterministic assignment).
Uses consistent hashing to ensure same trace ID always gets same variant.

###### Parameters

###### experimentId

`string`

###### traceId

`string`

###### Returns

[`ExperimentVariant`](#experimentvariant) \| `null`

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`assignVariant`](#assignvariant-1)

##### completeExperiment()

```ts
completeExperiment(experimentId): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L102)

Complete an experiment.

###### Parameters

###### experimentId

`string`

###### Returns

`void`

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`completeExperiment`](#completeexperiment-1)

##### createExperiment()

```ts
createExperiment(definition): ExperimentDefinition;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L40)

Create a new experiment.

###### Parameters

###### definition

`Omit`\<[`ExperimentDefinition`](#experimentdefinition), `"status"` \| `"startedAt"` \| `"endedAt"`\>

###### Returns

[`ExperimentDefinition`](#experimentdefinition)

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`createExperiment`](#createexperiment-1)

##### exportData()

```ts
exportData(): ExperimentExport;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L220)

Export all experiment data.

###### Returns

[`ExperimentExport`](#experimentexport)

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`exportData`](#exportdata-1)

##### getExperiment()

```ts
getExperiment(experimentId): ExperimentDefinition | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:213](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L213)

Get experiment by ID.

###### Parameters

###### experimentId

`string`

###### Returns

[`ExperimentDefinition`](#experimentdefinition) \| `null`

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`getExperiment`](#getexperiment-1)

##### getSummary()

```ts
getSummary(experimentId): ExperimentSummary | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L167)

Get experiment summary with statistics.

###### Parameters

###### experimentId

`string`

###### Returns

[`ExperimentSummary`](#experimentsummary) \| `null`

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`getSummary`](#getsummary-1)

##### listExperiments()

```ts
listExperiments(filter?): readonly ExperimentDefinition[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L192)

List all experiments.

###### Parameters

###### filter?

###### status?

[`ExperimentStatus`](#experimentstatus)

###### tags?

readonly `string`[]

###### Returns

readonly [`ExperimentDefinition`](#experimentdefinition)[]

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`listExperiments`](#listexperiments-1)

##### pauseExperiment()

```ts
pauseExperiment(experimentId): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L84)

Pause a running experiment.

###### Parameters

###### experimentId

`string`

###### Returns

`void`

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`pauseExperiment`](#pauseexperiment-1)

##### recordOutcome()

```ts
recordOutcome(outcome): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L147)

Record an outcome for an experiment.

###### Parameters

###### outcome

[`ExperimentOutcome`](#experimentoutcome)

###### Returns

`void`

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`recordOutcome`](#recordoutcome-3)

##### startExperiment()

```ts
startExperiment(experimentId): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L65)

Start an experiment (sets status to running).

###### Parameters

###### experimentId

`string`

###### Returns

`void`

###### Implementation of

[`IAbTestTracker`](#iabtesttracker).[`startExperiment`](#startexperiment-1)

---

### FeedbackIntegration

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L163)

Learning exports - Closed-loop feedback and routing improvement
Split from index.ts for file size compliance (Issue #285)

#### Implements

- [`IFeedbackIntegration`](#ifeedbackintegration)

#### Constructors

##### Constructor

```ts
new FeedbackIntegration(config?, collector?): FeedbackIntegration;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L180)

###### Parameters

###### config?

`Partial`\<[`FeedbackIntegrationConfig`](#feedbackintegrationconfig)\>

###### collector?

[`OutcomeFeedbackCollector`](#outcomefeedbackcollector)

###### Returns

[`FeedbackIntegration`](#feedbackintegration)

#### Methods

##### evictStaleEntries()

```ts
evictStaleEntries(): number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:395](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L395)

Evicts stale entries from decisionMap that exceed the configured TTL.
Called on every recordRoutingDecision (throttled) and on reset.

###### Returns

`number`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`evictStaleEntries`](#evictstaleentries-1)

##### getDecisionMapSize()

```ts
getDecisionMapSize(): number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:430](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L430)

Gets the current size of the decision map (for testing/monitoring).

###### Returns

`number`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`getDecisionMapSize`](#getdecisionmapsize-1)

##### getEvictedEntryCount()

```ts
getEvictedEntryCount(): number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:423](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L423)

Gets the total number of evicted entries since creation or last reset.

###### Returns

`number`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`getEvictedEntryCount`](#getevictedentrycount-1)

##### getStats()

```ts
getStats(): FeedbackLoopStats;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:370](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L370)

Get feedback statistics

###### Returns

[`FeedbackLoopStats`](#feedbackloopstats)

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`getStats`](#getstats-4)

##### onOutcomeProcessed()

```ts
onOutcomeProcessed(callback): () => void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:374](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L374)

Subscribe to outcome processed events

###### Parameters

###### callback

[`OutcomeProcessedCallback`](#outcomeprocessedcallback)

###### Returns

() => `void`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`onOutcomeProcessed`](#onoutcomeprocessed-2)

##### recordOutcome()

```ts
recordOutcome(params): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:284](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L284)

Record a generic task outcome

###### Parameters

###### params

[`RecordOutcomeParams`](#recordoutcomeparams)

###### Returns

`void`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`recordOutcome`](#recordoutcome-4)

##### recordRoutingDecision()

```ts
recordRoutingDecision(decision, traceId?): string;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L199)

Record a routing decision from CompositeRouter

###### Parameters

###### decision

[`CompositeRoutingDecision`](cli-adapters.md#compositeroutingdecision)

###### traceId?

`string`

###### Returns

`string`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`recordRoutingDecision`](#recordroutingdecision-2)

##### recordStepOutcome()

```ts
recordStepOutcome(
   routingDecisionId,
   stepResult,
   durationMs,
   tokenUsage): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L266)

Record a step outcome from workflow execution

###### Parameters

###### routingDecisionId

`string`

###### stepResult

[`StepResult`](core.md#stepresult)

###### durationMs

`number`

###### tokenUsage

`number`

###### Returns

`void`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`recordStepOutcome`](#recordstepoutcome-1)

##### registerCompositeRouter()

```ts
registerCompositeRouter(router): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:378](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L378)

Register CompositeRouter for bi-directional feedback

###### Parameters

###### router

[`ICompositeRouter`](cli-adapters.md#icompositerouter)

###### Returns

`void`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`registerCompositeRouter`](#registercompositerouter-1)

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:383](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L383)

Reset all collected data

###### Returns

`void`

###### Implementation of

[`IFeedbackIntegration`](#ifeedbackintegration).[`reset`](#reset-2)

---

### OutcomeFeedbackCollector

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L44)

Outcome feedback collector implementation.

#### Implements

- [`IOutcomeFeedback`](#ioutcomefeedback)

#### Constructors

##### Constructor

```ts
new OutcomeFeedbackCollector(config?): OutcomeFeedbackCollector;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L55)

###### Parameters

###### config?

`Partial`\<[`FeedbackCollectorConfig`](#feedbackcollectorconfig)\>

###### Returns

[`OutcomeFeedbackCollector`](#outcomefeedbackcollector)

#### Methods

##### clearExpiredDecisions()

```ts
clearExpiredDecisions(): number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:218](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L218)

Clear expired pending decisions.

###### Returns

`number`

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`clearExpiredDecisions`](#clearexpireddecisions-1)

##### computeReward()

```ts
computeReward(outcome): ComputedReward;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L156)

Compute reward from an outcome.

###### Parameters

###### outcome

[`TaskOutcome`](#taskoutcome)

###### Returns

[`ComputedReward`](#computedreward)

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`computeReward`](#computereward-1)

##### getPendingDecisions()

```ts
getPendingDecisions(): readonly FeedbackRoutingDecision[];
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L214)

Get pending decisions (waiting for outcomes).

###### Returns

readonly [`FeedbackRoutingDecision`](#feedbackroutingdecision)[]

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`getPendingDecisions`](#getpendingdecisions-1)

##### getStats()

```ts
getStats(): FeedbackLoopStats;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L196)

Get feedback loop statistics.

###### Returns

[`FeedbackLoopStats`](#feedbackloopstats)

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`getStats`](#getstats-5)

##### onOutcomeProcessed()

```ts
onOutcomeProcessed(callback): () => void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L86)

Subscribe to outcome processed events.

###### Parameters

###### callback

[`OutcomeProcessedCallback`](#outcomeprocessedcallback)

###### Returns

() => `void`

##### processOutcome()

```ts
processOutcome(traceId, partialOutcome): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L140)

Process outcome for a trace ID (finds matching decision and computes reward).

###### Parameters

###### traceId

`string`

###### partialOutcome

`Omit`\<[`TaskOutcome`](#taskoutcome), `"routingDecisionId"`\>

###### Returns

`void`

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`processOutcome`](#processoutcome-1)

##### recordOutcome()

```ts
recordOutcome(outcome): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L119)

Record an outcome for a routing decision.

###### Parameters

###### outcome

[`TaskOutcome`](#taskoutcome)

###### Returns

`void`

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`recordOutcome`](#recordoutcome-5)

##### recordRoutingDecision()

```ts
recordRoutingDecision(decision): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L93)

Record a routing decision for tracking.

###### Parameters

###### decision

[`FeedbackRoutingDecision`](#feedbackroutingdecision)

###### Returns

`void`

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`recordRoutingDecision`](#recordroutingdecision-3)

##### registerLinUCBBandit()

```ts
registerLinUCBBandit(bandit): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L70)

Register LinUCB bandit for direct feedback.

###### Parameters

###### bandit

`LinUCBBandit`

###### Returns

`void`

##### registerPreferenceRouter()

```ts
registerPreferenceRouter(router): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L78)

Register PreferenceRouter for direct feedback.

###### Parameters

###### router

[`PreferenceRouter`](cli-adapters.md#preferencerouter)

###### Returns

`void`

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L250)

Reset all state.

###### Returns

`void`

###### Implementation of

[`IOutcomeFeedback`](#ioutcomefeedback).[`reset`](#reset-3)

---

### OutcomeStorageError

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L29)

Error class for outcome storage operations.

#### Extends

- [`NexusError`](core.md#nexuserror)

#### Constructors

##### Constructor

```ts
new OutcomeStorageError(message, options?): OutcomeStorageError;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L30)

###### Parameters

###### message

`string`

###### options?

`Partial`\<`Omit`\<\{
`cause?`: `Error`;
`code`: [`ErrorCode`](core.md#errorcode);
`context?`: `Record`\<`string`, `unknown`\>;
\}, `"code"`\>\>

###### Returns

[`OutcomeStorageError`](#outcomestorageerror)

###### Overrides

[`NexusError`](core.md#nexuserror).[`constructor`](core.md#constructor-3)

#### Properties

##### cause

```ts
readonly cause: Error | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L94)

###### Inherited from

[`NexusError`](core.md#nexuserror).[`cause`](core.md#cause-3)

##### code

```ts
readonly code: ErrorCode;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L92)

###### Inherited from

[`NexusError`](core.md#nexuserror).[`code`](core.md#code-3)

##### context

```ts
readonly context: Record<string, unknown> | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L93)

###### Inherited from

[`NexusError`](core.md#nexuserror).[`context`](core.md#context-3)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

[`NexusError`](core.md#nexuserror).[`message`](core.md#message-3)

##### name

```ts
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

[`NexusError`](core.md#nexuserror).[`name`](core.md#name-3)

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`NexusError`](core.md#nexuserror).[`stack`](core.md#stack-3)

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

[`NexusError`](core.md#nexuserror).[`stackTraceLimit`](core.md#stacktracelimit-3)

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

[`NexusError`](core.md#nexuserror).[`toJSON`](core.md#tojson-3)

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

[`NexusError`](core.md#nexuserror).[`captureStackTrace`](core.md#capturestacktrace-3)

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

[`NexusError`](core.md#nexuserror).[`prepareStackTrace`](core.md#preparestacktrace-3)

---

### PersistentStrategyDistiller

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L74)

StrategyDistiller that persists distilled rules to a JSON file.

- Construction: hydrates from rules.json via Zod validation
- distill(): calls super.distill() then atomically saves snapshot
- Corruption: warn + start fresh (no partial loads)

#### Extends

- [`StrategyDistiller`](#strategydistiller)

#### Constructors

##### Constructor

```ts
new PersistentStrategyDistiller(
   outcomeStore,
   persistConfig?,
   logger?,
   distillerConfig?): PersistentStrategyDistiller;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L78)

###### Parameters

###### outcomeStore

[`OutcomeStore`](orchestration.md#outcomestore)

###### persistConfig?

[`PersistentDistillerConfig`](#persistentdistillerconfig)

###### logger?

[`ILogger`](core.md#ilogger)

###### distillerConfig?

`Partial`\<[`DistillerConfig`](#distillerconfig)\>

###### Returns

[`PersistentStrategyDistiller`](#persistentstrategydistiller)

###### Overrides

[`StrategyDistiller`](#strategydistiller).[`constructor`](#constructor-6)

#### Methods

##### distill()

```ts
distill(): void;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L94)

Override distill to persist rules after each run.

###### Returns

`void`

###### Overrides

[`StrategyDistiller`](#strategydistiller).[`distill`](#distill-1)

##### getRules()

```ts
getRules(status?): readonly DistilledRule[];
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:233](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L233)

Get rules filtered by status.

###### Parameters

###### status?

[`RuleStatus`](#rulestatus)

###### Returns

readonly [`DistilledRule`](#distilledrule)[]

###### Inherited from

[`StrategyDistiller`](#strategydistiller).[`getRules`](#getrules-1)

##### getStats()

```ts
getStats(): DistillerStats;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L240)

Get distiller statistics.

###### Returns

[`DistillerStats`](#distillerstats)

###### Inherited from

[`StrategyDistiller`](#strategydistiller).[`getStats`](#getstats-3)

##### loadRules()

```ts
protected loadRules(rules): void;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:291](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L291)

Load pre-existing rules (e.g., from disk). Used by PersistentStrategyDistiller.

###### Parameters

###### rules

readonly [`DistilledRule`](#distilledrule)[]

###### Returns

`void`

###### Inherited from

[`StrategyDistiller`](#strategydistiller).[`loadRules`](#loadrules-1)

##### onOutcome()

```ts
onOutcome(): void;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L193)

Called for each processed outcome. Triggers distillation at threshold.

###### Returns

`void`

###### Inherited from

[`StrategyDistiller`](#strategydistiller).[`onOutcome`](#onoutcome-1)

##### promote()

```ts
promote(routingMemory): number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L262)

Promote high-confidence rules to RoutingMemory.
Rules must be active, non-tainted, with sufficient observations and confidence.

###### Parameters

###### routingMemory

`IRoutingMemory`

###### Returns

`number`

###### Inherited from

[`StrategyDistiller`](#strategydistiller).[`promote`](#promote-1)

---

### SQLiteOutcomeStorage

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L69)

SQLite-based outcome storage implementation.

#### Implements

- [`IOutcomeStorage`](#ioutcomestorage)

#### Constructors

##### Constructor

```ts
new SQLiteOutcomeStorage(config): SQLiteOutcomeStorage;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L76)

###### Parameters

###### config

[`OutcomeStorageConfig`](#outcomestorageconfig)

###### Returns

[`SQLiteOutcomeStorage`](#sqliteoutcomestorage)

#### Methods

##### close()

```ts
close(): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:355](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L355)

Close the database connection.

###### Returns

`void`

##### getCounts()

```ts
getCounts(): Promise<Result<{
  decisions: number;
  outcomes: number;
  rewards: number;
}, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:333](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L333)

Get total record counts.

###### Returns

`Promise`\<[`Result`](core.md#result)\<\{
`decisions`: `number`;
`outcomes`: `number`;
`rewards`: `number`;
\}, [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`getCounts`](#getcounts-1)

##### getDecision()

```ts
getDecision(id): Promise<Result<StoredRoutingDecision | null, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L244)

Get routing decision by ID.

###### Parameters

###### id

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredRoutingDecision`](#storedroutingdecision) \| `null`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`getDecision`](#getdecision-1)

##### getDecisionsByRequestId()

```ts
getDecisionsByRequestId(requestId): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:296](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L296)

Get decisions by request ID (for audit trail integration).

###### Parameters

###### requestId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredRoutingDecision`](#storedroutingdecision)[], [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`getDecisionsByRequestId`](#getdecisionsbyrequestid-1)

##### getModelStats()

```ts
getModelStats(): Promise<Result<StoredModelStats[], OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:270](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L270)

Get aggregated statistics per model.

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredModelStats`](#storedmodelstats)[], [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`getModelStats`](#getmodelstats-1)

##### getOutcome()

```ts
getOutcome(decisionId): Promise<Result<StoredTaskOutcome | null, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L257)

Get outcome for a routing decision.

###### Parameters

###### decisionId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredTaskOutcome`](#storedtaskoutcome) \| `null`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`getOutcome`](#getoutcome-1)

##### getRecentDecisions()

```ts
getRecentDecisions(model, limit): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:281](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L281)

Get recent decisions for a model.

###### Parameters

###### model

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### limit

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredRoutingDecision`](#storedroutingdecision)[], [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`getRecentDecisions`](#getrecentdecisions-1)

##### initialize()

```ts
initialize(): Promise<Result<void, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L100)

Initialize the storage backend.

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### initializeWithDatabase()

```ts
initializeWithDatabase(database): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L92)

Initialize with an existing database instance (for testing).

###### Parameters

###### database

[`ISQLiteDatabase`](#isqlitedatabase)

###### Returns

`void`

##### prune()

```ts
prune(olderThan): Promise<Result<number, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:310](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L310)

Prune old records.

###### Parameters

###### olderThan

`Date`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`number`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`prune`](#prune-1)

##### storeDecision()

```ts
storeDecision(decision): Promise<Result<void, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L157)

Store a routing decision.

###### Parameters

###### decision

[`StoredRoutingDecision`](#storedroutingdecision)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`storeDecision`](#storedecision-1)

##### storeOutcome()

```ts
storeOutcome(outcome): Promise<Result<void, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L186)

Store a task outcome.

###### Parameters

###### outcome

[`StoredTaskOutcome`](#storedtaskoutcome)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`storeOutcome`](#storeoutcome-1)

##### storeReward()

```ts
storeReward(reward): Promise<Result<void, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L215)

Store a computed reward.

###### Parameters

###### reward

[`StoredReward`](#storedreward)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

###### Implementation of

[`IOutcomeStorage`](#ioutcomestorage).[`storeReward`](#storereward-1)

---

### StrategyDistiller

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L178)

Distills outcome patterns into routing rules.

Subscribe to OutcomeFeedbackCollector.onOutcomeProcessed() and call
onOutcome() for each processed outcome. Distillation triggers
automatically every `triggerThreshold` outcomes.

#### Extended by

- [`PersistentStrategyDistiller`](#persistentstrategydistiller)

#### Constructors

##### Constructor

```ts
new StrategyDistiller(
   outcomeStore,
   logger?,
   config?): StrategyDistiller;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L186)

###### Parameters

###### outcomeStore

[`OutcomeStore`](orchestration.md#outcomestore)

###### logger?

[`ILogger`](core.md#ilogger)

###### config?

`Partial`\<[`DistillerConfig`](#distillerconfig)\>

###### Returns

[`StrategyDistiller`](#strategydistiller)

#### Methods

##### distill()

```ts
distill(): void;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L202)

Run distillation on current OutcomeStore data.

###### Returns

`void`

##### getRules()

```ts
getRules(status?): readonly DistilledRule[];
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:233](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L233)

Get rules filtered by status.

###### Parameters

###### status?

[`RuleStatus`](#rulestatus)

###### Returns

readonly [`DistilledRule`](#distilledrule)[]

##### getStats()

```ts
getStats(): DistillerStats;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L240)

Get distiller statistics.

###### Returns

[`DistillerStats`](#distillerstats)

##### loadRules()

```ts
protected loadRules(rules): void;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:291](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L291)

Load pre-existing rules (e.g., from disk). Used by PersistentStrategyDistiller.

###### Parameters

###### rules

readonly [`DistilledRule`](#distilledrule)[]

###### Returns

`void`

##### onOutcome()

```ts
onOutcome(): void;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L193)

Called for each processed outcome. Triggers distillation at threshold.

###### Returns

`void`

##### promote()

```ts
promote(routingMemory): number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L262)

Promote high-confidence rules to RoutingMemory.
Rules must be active, non-tainted, with sufficient observations and confidence.

###### Parameters

###### routingMemory

`IRoutingMemory`

###### Returns

`number`

## Interfaces

### ComparisonResult

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L32)

Result of a two-sample comparison test.

#### Properties

##### alpha

```ts
readonly alpha: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L38)

Alpha level used for significance

##### difference

```ts
readonly difference: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L40)

Difference in success rates (group1 - group2)

##### differenceCI

```ts
readonly differenceCI: ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L42)

Confidence interval for the difference

##### effectSize

```ts
readonly effectSize: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L44)

Effect size (Cohen's h for proportions)

##### n1

```ts
readonly n1: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L46)

Sample sizes

##### n2

```ts
readonly n2: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L47)

##### pValue

```ts
readonly pValue: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L34)

P-value from the test

##### significant

```ts
readonly significant: boolean;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L36)

Whether result is significant at alpha level

---

### ComputedReward

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L155)

Computed reward for bandit update.

#### Properties

##### components

```ts
readonly components: {
  baseReward: number;
  efficiencyBonus: number;
  qualityBonus: number;
  retryPenalty: number;
  speedBonus: number;
};
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L159)

Components that contributed to the reward

###### baseReward

```ts
readonly baseReward: number;
```

###### efficiencyBonus

```ts
readonly efficiencyBonus: number;
```

###### qualityBonus

```ts
readonly qualityBonus: number;
```

###### retryPenalty

```ts
readonly retryPenalty: number;
```

###### speedBonus

```ts
readonly speedBonus: number;
```

##### explanation

```ts
readonly explanation: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L167)

Explanation of reward computation

##### reward

```ts
readonly reward: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L157)

The reward value (0-1)

---

### ConfidenceInterval

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:14](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L14)

Confidence interval result with bounds and metadata.

#### Properties

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L22)

Confidence level (e.g., 0.95 for 95% CI)

##### estimate

```ts
readonly estimate: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L20)

Point estimate (center of interval)

##### lower

```ts
readonly lower: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L16)

Lower bound of the interval

##### n

```ts
readonly n: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L24)

Sample size used

##### standardError

```ts
readonly standardError: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L26)

Standard error

##### upper

```ts
readonly upper: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L18)

Upper bound of the interval

---

### DistilledRule

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L30)

A distilled routing rule extracted from outcome patterns.

Rules are fingerprinted by `patternType:cli:category` to prevent
duplicates and cap total rules at a bounded maximum.

#### Properties

##### action

```ts
readonly action: StrategyAction;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L40)

What routing action to take

##### category

```ts
readonly category: string;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L38)

Task category this rule applies to

##### cli

```ts
readonly cli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L36)

Which CLI this rule applies to

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L42)

Confidence 0-1, computed via sigmoid(observations, center=30)

##### createdAt

```ts
readonly createdAt: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L50)

Epoch ms when rule was first created

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L32)

Fingerprint: `${patternType}:${cli}:${category}`

##### metric

```ts
readonly metric: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L46)

The metric value (failure rate, success rate, or p90/median ratio)

##### observationCount

```ts
readonly observationCount: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L44)

Number of observations that informed this rule

##### patternType

```ts
readonly patternType: PatternType;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L34)

What kind of pattern triggered this rule

##### status

```ts
readonly status: RuleStatus;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L48)

Current lifecycle status

##### tainted

```ts
readonly tainted: boolean;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L54)

Security: tainted rules never promote to RoutingMemory

##### updatedAt

```ts
readonly updatedAt: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L52)

Epoch ms when rule was last updated

---

### DistillerConfig

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L58)

Configuration for the strategy distiller.

#### Properties

##### failureRateThreshold

```ts
readonly failureRateThreshold: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L68)

Failure rate above which a failure pattern is detected (default: 0.6)

##### latencyRatioThreshold

```ts
readonly latencyRatioThreshold: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L72)

p90/median ratio above which a latency spike is detected (default: 2.0)

##### maxRules

```ts
readonly maxRules: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L74)

Maximum number of rules to store (default: 90)

##### minObservationsForActive

```ts
readonly minObservationsForActive: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L64)

Minimum observations before activating a rule (default: 5)

##### minObservationsForDraft

```ts
readonly minObservationsForDraft: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L62)

Minimum observations before creating a draft rule (default: 3)

##### promotionConfidence

```ts
readonly promotionConfidence: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L66)

Confidence threshold for promotion to RoutingMemory (default: 0.7)

##### ruleExpiryMs

```ts
readonly ruleExpiryMs: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L76)

Rule expiry time in ms (default: 24h)

##### successRateThreshold

```ts
readonly successRateThreshold: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L70)

Success rate above which a success pattern is detected (default: 0.8)

##### triggerThreshold

```ts
readonly triggerThreshold: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L60)

Distill every N outcomes (default: 50)

---

### DistillerStats

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L93)

Statistics returned by StrategyDistiller.getStats().

#### Properties

##### lastDistillAt

```ts
readonly lastDistillAt: number | undefined;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L99)

Epoch ms of last distillation run

##### outcomesSinceLastDistill

```ts
readonly outcomesSinceLastDistill: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L101)

Number of outcomes processed since last distillation

##### ruleCountByStatus

```ts
readonly ruleCountByStatus: Readonly<Record<RuleStatus, number>>;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L95)

Number of rules in each status

##### totalRules

```ts
readonly totalRules: number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L97)

Total number of rules

---

### DistributionStats

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L53)

Descriptive statistics for a distribution.

#### Properties

##### max

```ts
readonly max: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L59)

##### mean

```ts
readonly mean: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L54)

##### median

```ts
readonly median: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L55)

##### min

```ts
readonly min: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L58)

##### n

```ts
readonly n: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L60)

##### percentiles

```ts
readonly percentiles: {
  p25: number;
  p5: number;
  p50: number;
  p75: number;
  p95: number;
};
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L62)

Percentiles: p5, p25, p50, p75, p95

###### p25

```ts
readonly p25: number;
```

###### p5

```ts
readonly p5: number;
```

###### p50

```ts
readonly p50: number;
```

###### p75

```ts
readonly p75: number;
```

###### p95

```ts
readonly p95: number;
```

##### stdDev

```ts
readonly stdDev: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L56)

##### variance

```ts
readonly variance: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L57)

---

### ExperimentDefinition

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L37)

Experiment definition.

#### Properties

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L43)

Description of the experiment's hypothesis

##### endedAt

```ts
readonly endedAt: string | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L51)

End timestamp (ISO 8601)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L39)

Unique experiment identifier

##### minimumDetectableEffect

```ts
readonly minimumDetectableEffect: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L57)

Minimum detectable effect size

##### minSampleSize

```ts
readonly minSampleSize: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L53)

Minimum sample size per variant

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L41)

Human-readable name

##### primaryMetric

```ts
readonly primaryMetric: "successRate" | "avgReward" | "avgLatency";
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L55)

Primary metric to optimize

##### startedAt

```ts
readonly startedAt: string | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L49)

Start timestamp (ISO 8601)

##### status

```ts
readonly status: ExperimentStatus;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L45)

Current status

##### tags

```ts
readonly tags: readonly string[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L59)

Tags for categorization

##### variants

```ts
readonly variants: readonly ExperimentVariant[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L47)

Experiment variants

---

### ExperimentExport

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L187)

Export format for experiment data.

#### Properties

##### experiments

```ts
readonly experiments: readonly ExperimentDefinition[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L191)

All experiments

##### exportedAt

```ts
readonly exportedAt: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L189)

Export timestamp

##### outcomes

```ts
readonly outcomes: readonly ExperimentOutcome[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L193)

All outcomes

##### summaries

```ts
readonly summaries: readonly ExperimentSummary[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L195)

Summaries for completed experiments

---

### ExperimentOutcome

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L65)

Recorded outcome for an experiment.

#### Properties

##### experimentId

```ts
readonly experimentId: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L67)

Experiment ID

##### latencyMs

```ts
readonly latencyMs: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L77)

Latency in milliseconds

##### metadata?

```ts
readonly optional metadata?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L81)

Additional metadata

##### reward

```ts
readonly reward: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L75)

Reward value

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L73)

Whether the task succeeded

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L79)

Timestamp (ISO 8601)

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L71)

Routing decision trace ID

##### variantId

```ts
readonly variantId: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L69)

Assigned variant ID

---

### ExperimentResult

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L121)

A/B test experiment result.

#### Properties

##### comparison

```ts
readonly comparison: ComparisonResult;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L129)

Comparison between groups

##### control

```ts
readonly control: VariantResultSummary;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L125)

Control group statistics

##### experimentId

```ts
readonly experimentId: string;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L123)

Experiment identifier

##### hasMinimumSampleSize

```ts
readonly hasMinimumSampleSize: boolean;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L133)

Whether experiment has enough data for valid conclusions

##### recommendedSampleSize

```ts
readonly recommendedSampleSize: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L135)

Minimum recommended sample size per group

##### relativeImprovement

```ts
readonly relativeImprovement: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L131)

Relative improvement (treatment vs control)

##### treatment

```ts
readonly treatment: VariantResultSummary;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L127)

Treatment group statistics

---

### ExperimentSummary

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L111)

Experiment summary with all variants and comparison.

#### Properties

##### experiment

```ts
readonly experiment: ExperimentDefinition;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L113)

Experiment definition

##### hasMinimumSampleSize

```ts
readonly hasMinimumSampleSize: boolean;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L119)

Whether experiment has reached minimum sample size

##### recommendation

```ts
readonly recommendation: "continue" | "stop_winner" | "stop_inconclusive";
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L121)

Recommended action based on results

##### result

```ts
readonly result: ExperimentResult | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L117)

Statistical comparison result

##### variantStats

```ts
readonly variantStats: readonly VariantStats[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L115)

Statistics per variant

---

### ExperimentVariant

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L21)

Experiment variant configuration.

#### Properties

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L27)

Description of what this variant does

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L23)

Variant identifier

##### isControl

```ts
readonly isControl: boolean;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L31)

Whether this is the control variant

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L25)

Human-readable name

##### trafficPercent

```ts
readonly trafficPercent: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L29)

Traffic allocation percentage (0-100)

---

### FeedbackCollectorConfig

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L195)

Configuration for the feedback collector.

#### Properties

##### efficiencyWeight

```ts
readonly efficiencyWeight: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L207)

Weight for efficiency in reward computation

##### enableAutoReward

```ts
readonly enableAutoReward: boolean;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L201)

Enable automatic reward computation

##### maxHistorySize

```ts
readonly maxHistorySize: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L215)

Maximum history entries (outcomes + decisions) to retain

##### maxPendingDecisions

```ts
readonly maxPendingDecisions: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L197)

Maximum pending decisions to track

##### pendingTimeoutMs

```ts
readonly pendingTimeoutMs: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L199)

Timeout for pending decisions (ms)

##### qualityWeight

```ts
readonly qualityWeight: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L203)

Weight for quality in reward computation

##### retryPenalty

```ts
readonly retryPenalty: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L209)

Penalty per retry in reward computation

##### speedWeight

```ts
readonly speedWeight: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L205)

Weight for speed in reward computation

##### targetDurationMs

```ts
readonly targetDurationMs: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L211)

Target duration for speed bonus (ms)

##### targetTokenUsage

```ts
readonly targetTokenUsage: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:213](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L213)

Target token usage for efficiency bonus

---

### FeedbackIntegrationConfig

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L53)

Configuration for feedback integration.

#### Properties

##### decisionTtlMs?

```ts
readonly optional decisionTtlMs?: number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L61)

TTL for decision entries in milliseconds (default: 3600000 = 1 hour)

##### enableAutoFeedback

```ts
readonly enableAutoFeedback: boolean;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L55)

Enable automatic feedback to routers (default: true)

##### enablePersistence?

```ts
readonly optional enablePersistence?: boolean;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L69)

Enable persistent storage via SQLite (default: false).
Requires outcomeStorage to be provided.
(Source: Issue #560 - Wire SQLiteOutcomeStorage to feedback loop)

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L63)

Logger instance

##### outcomeStorage?

```ts
readonly optional outcomeStorage?: IOutcomeStorage;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L75)

SQLite outcome storage instance for cross-session learning.
Only used when enablePersistence is true.
(Source: Issue #560 - Wire SQLiteOutcomeStorage to feedback loop)

##### partialQualityThreshold

```ts
readonly partialQualityThreshold: number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L59)

Quality score threshold for partial success (default: 0.4)

##### successQualityThreshold

```ts
readonly successQualityThreshold: number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L57)

Quality score threshold for success (default: 0.7)

---

### FeedbackLoopStats

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L173)

Feedback loop statistics.

#### Properties

##### avgQualityScore

```ts
readonly avgQualityScore: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L183)

Average quality score

##### avgReward

```ts
readonly avgReward: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L185)

Average reward computed

##### decisionsByRouter

```ts
readonly decisionsByRouter: Record<RouterType, number>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L187)

Decisions by router type

##### lastUpdatedAt

```ts
readonly lastUpdatedAt: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L189)

Last update timestamp

##### outcomesByClass

```ts
readonly outcomesByClass: Record<OutcomeClass, number>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L181)

Outcomes by classification

##### pendingOutcomes

```ts
readonly pendingOutcomes: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L179)

Decisions pending outcome

##### totalDecisions

```ts
readonly totalDecisions: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L175)

Total routing decisions recorded

##### totalOutcomes

```ts
readonly totalOutcomes: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L177)

Total outcomes recorded

---

### FeedbackRoutingDecision

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L62)

Recorded routing decision for feedback tracking.

#### Properties

##### armIndex?

```ts
readonly optional armIndex?: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L76)

Arm index for LinUCB bandit

##### banditContext?

```ts
readonly optional banditContext?: BanditContext;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L78)

Bandit context (for LinUCB decisions)

##### confidence?

```ts
readonly optional confidence?: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L84)

Confidence score

##### domain?

```ts
readonly optional domain?: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L88)

Task domain classification

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L64)

Unique decision ID

##### query

```ts
readonly query: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L68)

Original query/task that was routed

##### queryFeatures?

```ts
readonly optional queryFeatures?: QueryFeatures;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L80)

Query features (for preference routing)

##### routerType

```ts
readonly routerType: RouterType;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L70)

Type of router used

##### selectedModel

```ts
readonly selectedModel: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L72)

Selected model/adapter name

##### selectedTier?

```ts
readonly optional selectedTier?: "strong" | "weak";
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L74)

Selected model tier (strong/weak for preference routing)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L66)

Timestamp of decision

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L86)

Trace ID to correlate with SwarmObserver events

##### ucbScore?

```ts
readonly optional ucbScore?: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L82)

UCB score (for LinUCB)

---

### IAbTestTracker

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L127)

A/B test tracker interface.

#### Methods

##### assignVariant()

```ts
assignVariant(experimentId, traceId): ExperimentVariant | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L153)

Assign a variant for a given trace ID (deterministic assignment).

###### Parameters

###### experimentId

`string`

###### traceId

`string`

###### Returns

[`ExperimentVariant`](#experimentvariant) \| `null`

##### completeExperiment()

```ts
completeExperiment(experimentId): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L148)

Complete an experiment.

###### Parameters

###### experimentId

`string`

###### Returns

`void`

##### createExperiment()

```ts
createExperiment(definition): ExperimentDefinition;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L131)

Create a new experiment.

###### Parameters

###### definition

`Omit`\<[`ExperimentDefinition`](#experimentdefinition), `"status"` \| `"startedAt"` \| `"endedAt"`\>

###### Returns

[`ExperimentDefinition`](#experimentdefinition)

##### exportData()

```ts
exportData(): ExperimentExport;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L181)

Export all experiment data.

###### Returns

[`ExperimentExport`](#experimentexport)

##### getExperiment()

```ts
getExperiment(experimentId): ExperimentDefinition | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L176)

Get experiment by ID.

###### Parameters

###### experimentId

`string`

###### Returns

[`ExperimentDefinition`](#experimentdefinition) \| `null`

##### getSummary()

```ts
getSummary(experimentId): ExperimentSummary | null;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L163)

Get experiment summary with statistics.

###### Parameters

###### experimentId

`string`

###### Returns

[`ExperimentSummary`](#experimentsummary) \| `null`

##### listExperiments()

```ts
listExperiments(filter?): readonly ExperimentDefinition[];
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L168)

List all experiments.

###### Parameters

###### filter?

###### status?

[`ExperimentStatus`](#experimentstatus)

###### tags?

readonly `string`[]

###### Returns

readonly [`ExperimentDefinition`](#experimentdefinition)[]

##### pauseExperiment()

```ts
pauseExperiment(experimentId): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L143)

Pause a running experiment.

###### Parameters

###### experimentId

`string`

###### Returns

`void`

##### recordOutcome()

```ts
recordOutcome(outcome): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L158)

Record an outcome for an experiment.

###### Parameters

###### outcome

[`ExperimentOutcome`](#experimentoutcome)

###### Returns

`void`

##### startExperiment()

```ts
startExperiment(experimentId): void;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L138)

Start an experiment (sets status to running).

###### Parameters

###### experimentId

`string`

###### Returns

`void`

---

### IFeedbackIntegration

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L98)

Interface for feedback integration.

#### Methods

##### evictStaleEntries()

```ts
evictStaleEntries(): number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L126)

Evict stale entries from decision map that exceed TTL

###### Returns

`number`

##### getDecisionMapSize()

```ts
getDecisionMapSize(): number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L132)

Get current size of decision map

###### Returns

`number`

##### getEvictedEntryCount()

```ts
getEvictedEntryCount(): number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L129)

Get total count of evicted entries since creation or last reset

###### Returns

`number`

##### getStats()

```ts
getStats(): FeedbackLoopStats;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L114)

Get feedback statistics

###### Returns

[`FeedbackLoopStats`](#feedbackloopstats)

##### onOutcomeProcessed()

```ts
onOutcomeProcessed(callback): () => void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L117)

Subscribe to outcome processed events

###### Parameters

###### callback

[`OutcomeProcessedCallback`](#outcomeprocessedcallback)

###### Returns

() => `void`

##### recordOutcome()

```ts
recordOutcome(params): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L111)

Record a generic task outcome

###### Parameters

###### params

[`RecordOutcomeParams`](#recordoutcomeparams)

###### Returns

`void`

##### recordRoutingDecision()

```ts
recordRoutingDecision(decision, traceId?): string;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L100)

Record a routing decision from CompositeRouter

###### Parameters

###### decision

[`CompositeRoutingDecision`](cli-adapters.md#compositeroutingdecision)

###### traceId?

`string`

###### Returns

`string`

##### recordStepOutcome()

```ts
recordStepOutcome(
   routingDecisionId,
   stepResult,
   durationMs,
   tokenUsage): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L103)

Record a step outcome from workflow execution

###### Parameters

###### routingDecisionId

`string`

###### stepResult

[`StepResult`](core.md#stepresult)

###### durationMs

`number`

###### tokenUsage

`number`

###### Returns

`void`

##### registerCompositeRouter()

```ts
registerCompositeRouter(router): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L120)

Register CompositeRouter for bi-directional feedback

###### Parameters

###### router

[`ICompositeRouter`](cli-adapters.md#icompositerouter)

###### Returns

`void`

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L123)

Reset all collected data

###### Returns

`void`

---

### IOutcomeFeedback

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L253)

Interface for outcome feedback collector.

#### Methods

##### clearExpiredDecisions()

```ts
clearExpiredDecisions(): number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:287](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L287)

Clear expired pending decisions.

###### Returns

`number`

##### computeReward()

```ts
computeReward(outcome): ComputedReward;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L272)

Compute reward from an outcome.

###### Parameters

###### outcome

[`TaskOutcome`](#taskoutcome)

###### Returns

[`ComputedReward`](#computedreward)

##### getPendingDecisions()

```ts
getPendingDecisions(): readonly FeedbackRoutingDecision[];
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:282](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L282)

Get pending decisions (waiting for outcomes).

###### Returns

readonly [`FeedbackRoutingDecision`](#feedbackroutingdecision)[]

##### getStats()

```ts
getStats(): FeedbackLoopStats;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L277)

Get feedback loop statistics.

###### Returns

[`FeedbackLoopStats`](#feedbackloopstats)

##### processOutcome()

```ts
processOutcome(traceId, outcome): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L267)

Process outcome for a trace ID (finds matching decision and computes reward).

###### Parameters

###### traceId

`string`

###### outcome

`Omit`\<[`TaskOutcome`](#taskoutcome), `"routingDecisionId"`\>

###### Returns

`void`

##### recordOutcome()

```ts
recordOutcome(outcome): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L262)

Record an outcome for a routing decision.

###### Parameters

###### outcome

[`TaskOutcome`](#taskoutcome)

###### Returns

`void`

##### recordRoutingDecision()

```ts
recordRoutingDecision(decision): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L257)

Record a routing decision for tracking.

###### Parameters

###### decision

[`FeedbackRoutingDecision`](#feedbackroutingdecision)

###### Returns

`void`

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:292](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L292)

Reset all state.

###### Returns

`void`

---

### IOutcomeStorage

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L170)

Interface for outcome storage implementations.

#### Methods

##### getCounts()

```ts
getCounts(): Promise<Result<{
  decisions: number;
  outcomes: number;
  rewards: number;
}, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:226](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L226)

Get total record counts.

###### Returns

`Promise`\<[`Result`](core.md#result)\<\{
`decisions`: `number`;
`outcomes`: `number`;
`rewards`: `number`;
\}, [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### getDecision()

```ts
getDecision(id): Promise<Result<StoredRoutingDecision | null, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L189)

Get routing decision by ID.

###### Parameters

###### id

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredRoutingDecision`](#storedroutingdecision) \| `null`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### getDecisionsByRequestId()

```ts
getDecisionsByRequestId(requestId): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L214)

Get decisions by request ID (for audit trail integration).

###### Parameters

###### requestId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredRoutingDecision`](#storedroutingdecision)[], [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### getModelStats()

```ts
getModelStats(): Promise<Result<StoredModelStats[], OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L201)

Get aggregated statistics per model.

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredModelStats`](#storedmodelstats)[], [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### getOutcome()

```ts
getOutcome(routingDecisionId): Promise<Result<StoredTaskOutcome | null, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L194)

Get outcome for a routing decision.

###### Parameters

###### routingDecisionId

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredTaskOutcome`](#storedtaskoutcome) \| `null`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### getRecentDecisions()

```ts
getRecentDecisions(model, limit): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L206)

Get recent decisions for a model.

###### Parameters

###### model

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### limit

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StoredRoutingDecision`](#storedroutingdecision)[], [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### prune()

```ts
prune(olderThan): Promise<Result<number, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L221)

Prune old records.

###### Parameters

###### olderThan

`Date`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`number`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### storeDecision()

```ts
storeDecision(decision): Promise<Result<void, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L174)

Store a routing decision.

###### Parameters

###### decision

[`StoredRoutingDecision`](#storedroutingdecision)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### storeOutcome()

```ts
storeOutcome(outcome): Promise<Result<void, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L179)

Store a task outcome.

###### Parameters

###### outcome

[`StoredTaskOutcome`](#storedtaskoutcome)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

##### storeReward()

```ts
storeReward(reward): Promise<Result<void, OutcomeStorageError>>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L184)

Store a computed reward.

###### Parameters

###### reward

[`StoredReward`](#storedreward)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`OutcomeStorageError`](#outcomestorageerror)\>\>

---

### ISQLiteDatabase

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L55)

Minimal interface for better-sqlite3 Database.
Compatible with the better-sqlite3 package API.

#### Methods

##### close()

```ts
close(): void;
```

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L69)

Close the database connection.

###### Returns

`void`

##### exec()

```ts
exec(sql): void;
```

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L59)

Execute raw SQL statements (typically for DDL or multiple statements).

###### Parameters

###### sql

`string`

###### Returns

`void`

##### prepare()

```ts
prepare<T>(sql): ISQLiteStatement<T>;
```

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L64)

Prepare a parameterized statement for execution.

###### Type Parameters

###### T

`T` = `unknown`

###### Parameters

###### sql

`string`

###### Returns

[`ISQLiteStatement`](#isqlitestatement)\<`T`\>

---

### ISQLiteStatement

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L18)

Minimal interface for better-sqlite3 Statement.
Compatible with the better-sqlite3 package API.

#### Type Parameters

##### T

`T` = `unknown`

#### Methods

##### all()

```ts
all(...params): T[];
```

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L34)

Get all rows matching the statement.

###### Parameters

###### params

...`unknown`[]

###### Returns

`T`[]

##### get()

```ts
get(...params): T | undefined;
```

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L29)

Get a single row matching the statement.
Returns undefined if no match.

###### Parameters

###### params

...`unknown`[]

###### Returns

`T` \| `undefined`

##### run()

```ts
run(...params): ISQLiteRunResult;
```

Defined in: [packages/nexus-agents/src/core/types/database-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/database-types.ts#L23)

Execute the statement with the given parameters.
Returns information about changes made.

###### Parameters

###### params

...`unknown`[]

###### Returns

`ISQLiteRunResult`

---

### OutcomeStorageConfig

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:238](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L238)

Configuration for SQLite outcome storage.

#### Properties

##### autoPruneInterval?

```ts
optional autoPruneInterval?: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:246](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L246)

Auto-prune interval in ms (default: 3600000 = 1 hour)

##### dbPath

```ts
dbPath: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L240)

Path to SQLite database file

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L242)

Optional logger instance

##### maxRecords?

```ts
optional maxRecords?: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L244)

Maximum records to retain (default: 100000)

---

### PerformanceMatrixEntry

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L141)

Model performance matrix entry (model × task type).

#### Properties

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L147)

##### avgReward

```ts
readonly avgReward: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L146)

##### model

```ts
readonly model: string;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L142)

##### n

```ts
readonly n: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L144)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L145)

##### successRateCI

```ts
readonly successRateCI: ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L148)

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L143)

---

### PersistentDistillerConfig

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L56)

Learning exports - Closed-loop feedback and routing improvement
Split from index.ts for file size compliance (Issue #285)

#### Properties

##### dataDir?

```ts
readonly optional dataDir?: string;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L60)

Override the data directory (useful for testing).

##### filePath?

```ts
readonly optional filePath?: string;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L58)

Override the file path (useful for testing).

---

### QualitySignals

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L29)

Quality signals extracted from task execution.

#### Properties

##### coherenceScore?

```ts
readonly optional coherenceScore?: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L43)

Response coherence score (0-1)

##### completionRatio

```ts
readonly completionRatio: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L39)

Task completion percentage (0-1)

##### lintErrors?

```ts
readonly optional lintErrors?: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L33)

Number of lint errors (for code tasks)

##### retryCount

```ts
readonly retryCount: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L37)

Number of retries required

##### testsPass?

```ts
readonly optional testsPass?: boolean;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L31)

Whether code tests passed (for code tasks)

##### userApproved?

```ts
readonly optional userApproved?: boolean;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L35)

Explicit user approval/rejection

##### validStructure?

```ts
readonly optional validStructure?: boolean;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L41)

Whether output was valid JSON/structured (for structured output tasks)

---

### RecordOutcomeParams

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L27)

Parameters for recording an outcome.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L35)

Execution duration in milliseconds

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L43)

Error message for failed outcomes (sanitized before persistence)

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L33)

Quality score (0-1)

##### retryCount?

```ts
readonly optional retryCount?: number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L39)

Number of retries (default: 0)

##### routingDecisionId

```ts
readonly routingDecisionId: string;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L29)

Routing decision ID

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L31)

Whether the task succeeded

##### tokenUsage

```ts
readonly tokenUsage: number;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L37)

Token usage

##### traceId?

```ts
readonly optional traceId?: string;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L41)

Trace ID for correlation

---

### RegretAnalysis

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L74)

Regret analysis result comparing actual vs optimal decisions.

#### Properties

##### avgRegret

```ts
readonly avgRegret: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L78)

Average regret per decision

##### cumulativeRegret

```ts
readonly cumulativeRegret: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L76)

Total cumulative regret

##### optimalRate

```ts
readonly optimalRate: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L84)

Percentage of optimal decisions

##### regretPerModel

```ts
readonly regretPerModel: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L86)

Regret per model (how much worse each model performed vs best)

##### suboptimalDecisions

```ts
readonly suboptimalDecisions: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L82)

Number of suboptimal decisions

##### totalDecisions

```ts
readonly totalDecisions: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L80)

Number of decisions analyzed

---

### StatisticalOptions

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L154)

Options for statistical calculations.

#### Properties

##### alpha?

```ts
readonly optional alpha?: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L158)

Alpha level for significance testing (default: 0.05)

##### confidence?

```ts
readonly optional confidence?: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L156)

Confidence level for intervals (default: 0.95)

##### minSampleSize?

```ts
readonly optional minSampleSize?: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L160)

Minimum sample size for valid inference (default: 30)

##### useContinuityCorrection?

```ts
readonly optional useContinuityCorrection?: boolean;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L162)

Use continuity correction for proportions (default: true)

---

### StoredModelStats

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L92)

Aggregated model statistics from stored data.

#### Properties

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L98)

##### avgQualityScore

```ts
readonly avgQualityScore: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L97)

##### avgReward

```ts
readonly avgReward: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L96)

##### model

```ts
readonly model: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L93)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L99)

##### totalDecisions

```ts
readonly totalDecisions: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L94)

##### totalOutcomes

```ts
readonly totalOutcomes: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L95)

---

### StoredReward

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L78)

Stored computed reward record.

#### Properties

##### baseReward

```ts
readonly baseReward: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L82)

##### efficiencyBonus

```ts
readonly efficiencyBonus: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L85)

##### qualityBonus

```ts
readonly qualityBonus: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L83)

##### retryPenalty

```ts
readonly retryPenalty: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L86)

##### reward

```ts
readonly reward: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L81)

##### routingDecisionId

```ts
readonly routingDecisionId: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L79)

##### speedBonus

```ts
readonly speedBonus: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L84)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L80)

---

### StoredRoutingDecision

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L48)

Stored routing decision record.

#### Properties

##### alternativeModels

```ts
readonly alternativeModels: readonly ("claude" | "gemini" | "codex" | "opencode")[];
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L54)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L55)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L49)

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L56)

##### requestId?

```ts
readonly optional requestId?: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L58)

##### routerType

```ts
readonly routerType: RouterType;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L52)

##### selectedModel

```ts
readonly selectedModel: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L53)

##### taskProfile

```ts
readonly taskProfile: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L57)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L51)

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L50)

---

### StoredTaskOutcome

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L64)

Stored task outcome record.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L70)

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L72)

##### outcomeClass

```ts
readonly outcomeClass: OutcomeClass;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L67)

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L69)

##### routingDecisionId

```ts
readonly routingDecisionId: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L65)

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L68)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L66)

##### tokenUsage

```ts
readonly tokenUsage: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L71)

---

### TaskOutcome

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L113)

Task outcome for a routing decision.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L125)

Execution duration in milliseconds

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L129)

Error message if failed

##### outcomeClass

```ts
readonly outcomeClass: OutcomeClass;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L119)

Outcome classification

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L123)

Quality score (0-1)

##### qualitySignals

```ts
readonly qualitySignals: QualitySignals;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L131)

Extracted quality signals

##### routingDecisionId

```ts
readonly routingDecisionId: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L115)

Reference to the routing decision

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L121)

Overall success indicator

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L117)

Timestamp of outcome

##### tokenUsage

```ts
readonly tokenUsage: number;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L127)

Token usage

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L133)

Trace ID for correlation

---

### VariantStats

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L87)

Variant statistics.

#### Properties

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L101)

Average latency in ms

##### avgReward

```ts
readonly avgReward: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L99)

Average reward

##### n

```ts
readonly n: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L93)

Number of observations

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L91)

Variant name

##### successes

```ts
readonly successes: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L95)

Success count

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L97)

Success rate

##### sumLatencyMs

```ts
readonly sumLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L105)

Sum of latencies (for incremental computation)

##### sumReward

```ts
readonly sumReward: number;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L103)

Sum of rewards (for incremental computation)

##### variantId

```ts
readonly variantId: string;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L89)

Variant ID

---

### WinLossAnalysis

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L92)

Win/loss analysis comparing routing choices.

#### Properties

##### losses

```ts
readonly losses: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L98)

Number of times this model lost (not best outcome)

##### model

```ts
readonly model: string;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L94)

Model name

##### ties

```ts
readonly ties: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L100)

Number of ties

##### winRate

```ts
readonly winRate: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L102)

Win rate

##### winRateCI

```ts
readonly winRateCI: ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L104)

Confidence interval for win rate

##### wins

```ts
readonly wins: number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L96)

Number of times this model won (best outcome)

## Type Aliases

### ExperimentStatus

```ts
type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';
```

Defined in: [packages/nexus-agents/src/learning/ab-test-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-types.ts#L16)

Experiment status states.

---

### OutcomeClass

```ts
type OutcomeClass = 'success' | 'partial' | 'failure' | 'timeout' | 'error';
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L24)

Task outcome classification.

---

### OutcomeProcessedCallback

```ts
type OutcomeProcessedCallback = (decision, outcome, reward) => void;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:298](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L298)

Callback for when an outcome is processed.

#### Parameters

##### decision

[`FeedbackRoutingDecision`](#feedbackroutingdecision)

##### outcome

[`TaskOutcome`](#taskoutcome)

##### reward

[`ComputedReward`](#computedreward)

#### Returns

`void`

---

### PatternType

```ts
type PatternType = 'failure-rate' | 'success-rate' | 'latency-spike';
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L19)

The type of pattern detected from outcomes.

---

### RouterType

```ts
type RouterType = 'linucb' | 'preference' | 'quality' | 'cascade' | 'topsis';
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L19)

Router type that made the routing decision.

---

### RulesSnapshot

```ts
type RulesSnapshot = z.infer<typeof RulesSnapshotSchema>;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L50)

Learning exports - Closed-loop feedback and routing improvement
Split from index.ts for file size compliance (Issue #285)

---

### RuleStatus

```ts
type RuleStatus = 'draft' | 'active' | 'promoted' | 'expired';
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L16)

Status lifecycle for a distilled rule.

---

### StrategyAction

```ts
type StrategyAction = 'penalize' | 'boost' | 'avoid';
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L22)

Action to take when a rule matches a routing candidate.

## Variables

### DEFAULT_DISTILLER_CONFIG

```ts
const DEFAULT_DISTILLER_CONFIG: DistillerConfig;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-types.ts#L80)

Default distiller configuration.

---

### DEFAULT_FEEDBACK_COLLECTOR_CONFIG

```ts
const DEFAULT_FEEDBACK_COLLECTOR_CONFIG: FeedbackCollectorConfig;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L221)

Default feedback collector configuration.

---

### DEFAULT_FEEDBACK_INTEGRATION_CONFIG

```ts
const DEFAULT_FEEDBACK_INTEGRATION_CONFIG: FeedbackIntegrationConfig;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration-types.ts#L84)

Default configuration.

---

### DEFAULT_OUTCOME_STORAGE_CONFIG

```ts
const DEFAULT_OUTCOME_STORAGE_CONFIG: {
  autoPruneInterval: 3600000;
  maxRecords: 100000;
};
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:261](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L261)

Default configuration values.

#### Type Declaration

##### autoPruneInterval

```ts
readonly autoPruneInterval: 3600000 = 3600000;
```

##### maxRecords

```ts
readonly maxRecords: 100000 = 100000;
```

---

### DEFAULT_STATISTICAL_OPTIONS

```ts
const DEFAULT_STATISTICAL_OPTIONS: Required<StatisticalOptions>;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats-types.ts#L168)

Default statistical options.

---

### FeedbackCollectorConfigSchema

```ts
const FeedbackCollectorConfigSchema: ZodObject<
  {
    efficiencyWeight: ZodDefault<ZodNumber>;
    enableAutoReward: ZodDefault<ZodBoolean>;
    maxHistorySize: ZodDefault<ZodNumber>;
    maxPendingDecisions: ZodDefault<ZodNumber>;
    pendingTimeoutMs: ZodDefault<ZodNumber>;
    qualityWeight: ZodDefault<ZodNumber>;
    retryPenalty: ZodDefault<ZodNumber>;
    speedWeight: ZodDefault<ZodNumber>;
    targetDurationMs: ZodDefault<ZodNumber>;
    targetTokenUsage: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L237)

Zod schema for feedback collector configuration.

---

### FeedbackRoutingDecisionSchema

```ts
const FeedbackRoutingDecisionSchema: ZodObject<
  {
    armIndex: ZodOptional<ZodNumber>;
    banditContext: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    confidence: ZodOptional<ZodNumber>;
    domain: ZodOptional<ZodString>;
    id: ZodUUID;
    query: ZodString;
    queryFeatures: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    routerType: ZodEnum<{
      cascade: 'cascade';
      linucb: 'linucb';
      preference: 'preference';
      quality: 'quality';
      topsis: 'topsis';
    }>;
    selectedModel: ZodString;
    selectedTier: ZodOptional<
      ZodEnum<{
        strong: 'strong';
        weak: 'weak';
      }>
    >;
    timestamp: ZodISODateTime;
    traceId: ZodString;
    ucbScore: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L94)

Zod schema for routing decision.

---

### OutcomeStorageConfigSchema

```ts
const OutcomeStorageConfigSchema: ZodObject<
  {
    autoPruneInterval: ZodOptional<ZodNumber>;
    dbPath: ZodString;
    maxRecords: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage-types.ts:252](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage-types.ts#L252)

Zod schema for OutcomeStorageConfig validation.

---

### QualitySignalsSchema

```ts
const QualitySignalsSchema: ZodObject<
  {
    coherenceScore: ZodOptional<ZodNumber>;
    completionRatio: ZodDefault<ZodNumber>;
    lintErrors: ZodOptional<ZodNumber>;
    retryCount: ZodDefault<ZodNumber>;
    testsPass: ZodOptional<ZodBoolean>;
    userApproved: ZodOptional<ZodBoolean>;
    validStructure: ZodOptional<ZodBoolean>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L49)

Zod schema for quality signals.

---

### RulesSnapshotSchema

```ts
const RulesSnapshotSchema: ZodObject<{
  rules: ZodArray<ZodObject<{
     action: ZodEnum<{
        avoid: "avoid";
        boost: "boost";
        penalize: "penalize";
     }>;
     category: ZodString;
     cli: ZodEnum<{
        claude: "claude";
        codex: "codex";
        gemini: "gemini";
        opencode: "opencode";
     }>;
     confidence: ZodNumber;
     createdAt: ZodNumber;
     id: ZodString;
     metric: ZodNumber;
     observationCount: ZodNumber;
     patternType: ZodEnum<{
        failure-rate: "failure-rate";
        latency-spike: "latency-spike";
        success-rate: "success-rate";
     }>;
     status: ZodEnum<{
        active: "active";
        draft: "draft";
        expired: "expired";
        promoted: "promoted";
     }>;
     tainted: ZodBoolean;
     updatedAt: ZodNumber;
  }, $strip>>;
  savedAt: ZodString;
  version: ZodLiteral<1>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller-persistence.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller-persistence.ts#L44)

Versioned snapshot schema for atomic saves.

---

### TaskOutcomeSchema

```ts
const TaskOutcomeSchema: ZodObject<
  {
    durationMs: ZodNumber;
    errorMessage: ZodOptional<ZodString>;
    outcomeClass: ZodEnum<{
      error: 'error';
      failure: 'failure';
      partial: 'partial';
      success: 'success';
      timeout: 'timeout';
    }>;
    qualityScore: ZodNumber;
    qualitySignals: ZodObject<
      {
        coherenceScore: ZodOptional<ZodNumber>;
        completionRatio: ZodDefault<ZodNumber>;
        lintErrors: ZodOptional<ZodNumber>;
        retryCount: ZodDefault<ZodNumber>;
        testsPass: ZodOptional<ZodBoolean>;
        userApproved: ZodOptional<ZodBoolean>;
        validStructure: ZodOptional<ZodBoolean>;
      },
      $strip
    >;
    routingDecisionId: ZodUUID;
    success: ZodBoolean;
    timestamp: ZodISODateTime;
    tokenUsage: ZodNumber;
    traceId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-types.ts#L139)

Zod schema for task outcome.

## Functions

### calculateDistributionStats()

```ts
function calculateDistributionStats(values): DistributionStats;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats.ts#L159)

Calculate descriptive statistics for a distribution.

#### Parameters

##### values

readonly `number`[]

#### Returns

[`DistributionStats`](#distributionstats)

---

### calculateMinSampleSize()

```ts
function calculateMinSampleSize(baselineRate, minimumDetectableEffect, options?): number;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats.ts:330](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats.ts#L330)

Calculate minimum sample size for detecting a difference in proportions.
Uses formula for two-proportion z-test power analysis.

#### Parameters

##### baselineRate

`number`

##### minimumDetectableEffect

`number`

##### options?

###### alpha?

`number`

###### power?

`number`

#### Returns

`number`

---

### calculateRegret()

```ts
function calculateRegret(decisions): RegretAnalysis;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats.ts#L214)

Calculate regret analysis comparing actual decisions vs oracle (best possible).

#### Parameters

##### decisions

readonly \{
`actualReward`: `number`;
`chosenModel`: `string`;
`rewards`: `Record`\<`string`, `number`\>;
\}[]

#### Returns

[`RegretAnalysis`](#regretanalysis)

---

### calculateWinLoss()

```ts
function calculateWinLoss(model, decisions, options?): WinLossAnalysis;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats.ts#L274)

Calculate win/loss analysis for a model.

#### Parameters

##### model

`string`

##### decisions

readonly \{
`actualReward`: `number`;
`chosenModel`: `string`;
`rewards`: `Record`\<`string`, `number`\>;
\}[]

##### options?

[`StatisticalOptions`](#statisticaloptions) = `{}`

#### Returns

[`WinLossAnalysis`](#winlossanalysis)

---

### compareProportions()

```ts
function compareProportions(successes1, total1, successes2, total2, options?): ComparisonResult;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats.ts#L114)

Compare two proportions using two-proportion z-test.

#### Parameters

##### successes1

`number`

##### total1

`number`

##### successes2

`number`

##### total2

`number`

##### options?

[`StatisticalOptions`](#statisticaloptions) = `{}`

#### Returns

[`ComparisonResult`](#comparisonresult)

---

### computeOutcomeReward()

```ts
function computeOutcomeReward(collector, outcome): ComputedReward;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:526](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L526)

Helper to compute reward from outcome.

#### Parameters

##### collector

[`IOutcomeFeedback`](#ioutcomefeedback)

##### outcome

[`TaskOutcome`](#taskoutcome)

#### Returns

[`ComputedReward`](#computedreward)

---

### createAbTestTracker()

```ts
function createAbTestTracker(): IAbTestTracker;
```

Defined in: [packages/nexus-agents/src/learning/ab-test-tracker.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/ab-test-tracker.ts#L397)

Create a default A/B test tracker instance.

#### Returns

[`IAbTestTracker`](#iabtesttracker)

---

### createFeedbackIntegration()

```ts
function createFeedbackIntegration(config?, collector?): IFeedbackIntegration;
```

Defined in: [packages/nexus-agents/src/learning/feedback-integration.ts:516](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/feedback-integration.ts#L516)

Creates a FeedbackIntegration instance.

#### Parameters

##### config?

`Partial`\<[`FeedbackIntegrationConfig`](#feedbackintegrationconfig)\>

##### collector?

[`OutcomeFeedbackCollector`](#outcomefeedbackcollector)

#### Returns

[`IFeedbackIntegration`](#ifeedbackintegration)

---

### createOutcomeFeedbackCollector()

```ts
function createOutcomeFeedbackCollector(config?): OutcomeFeedbackCollector;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback.ts:344](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback.ts#L344)

Create an OutcomeFeedbackCollector instance.

#### Parameters

##### config?

`Partial`\<[`FeedbackCollectorConfig`](#feedbackcollectorconfig)\>

#### Returns

[`OutcomeFeedbackCollector`](#outcomefeedbackcollector)

---

### createOutcomeStorage()

```ts
function createOutcomeStorage(config): SQLiteOutcomeStorage;
```

Defined in: [packages/nexus-agents/src/learning/outcome-storage.ts:366](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-storage.ts#L366)

Create an SQLite outcome storage instance.

#### Parameters

##### config

[`OutcomeStorageConfig`](#outcomestorageconfig)

#### Returns

[`SQLiteOutcomeStorage`](#sqliteoutcomestorage)

---

### createRoutingDecision()

```ts
function createRoutingDecision(params): FeedbackRoutingDecision;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-helpers.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-helpers.ts#L100)

Create a routing decision record.

#### Parameters

##### params

`Omit`\<[`FeedbackRoutingDecision`](#feedbackroutingdecision), `"id"` \| `"timestamp"`\>

#### Returns

[`FeedbackRoutingDecision`](#feedbackroutingdecision)

---

### createStrategyDistiller()

```ts
function createStrategyDistiller(outcomeStore, logger?, config?): StrategyDistiller;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L388)

Factory function for creating StrategyDistiller.

#### Parameters

##### outcomeStore

[`OutcomeStore`](orchestration.md#outcomestore)

##### logger?

[`ILogger`](core.md#ilogger)

##### config?

`Partial`\<[`DistillerConfig`](#distillerconfig)\>

#### Returns

[`StrategyDistiller`](#strategydistiller)

---

### createTaskOutcome()

```ts
function createTaskOutcome(params): TaskOutcome;
```

Defined in: [packages/nexus-agents/src/learning/outcome-feedback-helpers.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/outcome-feedback-helpers.ts#L113)

Create a task outcome record.

#### Parameters

##### params

`Omit`\<[`TaskOutcome`](#taskoutcome), `"timestamp"`\>

#### Returns

[`TaskOutcome`](#taskoutcome)

---

### detectFailurePatterns()

```ts
function detectFailurePatterns(groups, threshold): DetectedPattern[];
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L93)

Detect groups with failure rate above threshold.

#### Parameters

##### groups

readonly `OutcomeGroup`[]

##### threshold

`number`

#### Returns

`DetectedPattern`[]

---

### detectLatencyPatterns()

```ts
function detectLatencyPatterns(groups, threshold): DetectedPattern[];
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L139)

Detect groups with latency spike (p90/median > threshold).

#### Parameters

##### groups

readonly `OutcomeGroup`[]

##### threshold

`number`

#### Returns

`DetectedPattern`[]

---

### detectSuccessPatterns()

```ts
function detectSuccessPatterns(groups, threshold): DetectedPattern[];
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L116)

Detect groups with success rate above threshold.

#### Parameters

##### groups

readonly `OutcomeGroup`[]

##### threshold

`number`

#### Returns

`DetectedPattern`[]

---

### meanConfidenceInterval()

```ts
function meanConfidenceInterval(values, options?): ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats.ts#L76)

Calculate confidence interval for a mean.

#### Parameters

##### values

readonly `number`[]

##### options?

[`StatisticalOptions`](#statisticaloptions) = `{}`

#### Returns

[`ConfidenceInterval`](#confidenceinterval)

---

### proportionConfidenceInterval()

```ts
function proportionConfidenceInterval(successes, total, options?): ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/learning/validation-stats.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/validation-stats.ts#L31)

Calculate confidence interval for a proportion (success rate).
Uses Wilson score interval for better coverage at extreme proportions.

#### Parameters

##### successes

`number`

##### total

`number`

##### options?

[`StatisticalOptions`](#statisticaloptions) = `{}`

#### Returns

[`ConfidenceInterval`](#confidenceinterval)

---

### sigmoidConfidence()

```ts
function sigmoidConfidence(observations, center?): number;
```

Defined in: [packages/nexus-agents/src/learning/strategy-distiller.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/learning/strategy-distiller.ts#L36)

Sigmoid confidence: 1 / (1 + exp(-(n - center) / 5))

#### Parameters

##### observations

`number`

##### center?

`number` = `30`

#### Returns

`number`
