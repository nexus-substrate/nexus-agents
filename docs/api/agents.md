---
title: 'API: agents'
description: Generated API reference for agents.
tier: 2
---

# agents

## Classes

### AgenticAdapter

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L97)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Implements

- [`IAgenticAdapter`](#iagenticadapter)

#### Constructors

##### Constructor

```ts
new AgenticAdapter(modelAdapter, options?): AgenticAdapter;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L120)

###### Parameters

###### modelAdapter

[`IModelAdapter`](core.md#imodeladapter)

###### options?

[`AgenticAdapterOptions`](#agenticadapteroptions) = `{}`

###### Returns

[`AgenticAdapter`](#agenticadapter)

#### Properties

##### adapterStrategy

```ts
adapterStrategy: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L110)

Adapter strategy stamp — composed from the resolved model
identity, NOT the IModelAdapter's providerId. For a custom OpenAI
gateway fronting Claude, this reads `native:anthropic` even though
`IModelAdapter.providerId === 'openai'`.

Initialised eagerly from the modelId parse (sync); upgraded after
the first `runAgent` if the probe contributes a higher-confidence
vendor signal.

###### Implementation of

[`IAgenticAdapter`](#iagenticadapter).[`adapterStrategy`](#adapterstrategy-2)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L99)

###### Implementation of

[`IAgenticAdapter`](#iagenticadapter).[`modelId`](#modelid-2)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L98)

###### Implementation of

[`IAgenticAdapter`](#iagenticadapter).[`providerId`](#providerid-2)

#### Methods

##### getProfile()

```ts
getProfile(): ModelEntry;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L152)

Read-only accessor for the resolved profile. Mostly used in tests

- observability surfaces; production callers shouldn't need this.

###### Returns

[`ModelEntry`](config.md#modelentry)

##### getResolvedIdentity()

```ts
getResolvedIdentity(): ResolvedModelIdentity;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L161)

Read-only accessor for the resolved identity. After the first
`runAgent` call (if a probe ran), this may differ from what the
sync constructor stored — useful for audit logs.

###### Returns

`ResolvedModelIdentity`

##### runAgent()

```ts
runAgent(args): Promise<Result<AgentRunResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:228](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L228)

###### Parameters

###### args

[`RunAgentArgs`](#runagentargs)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentRunResult`](#agentrunresult), `AgentError`\>\>

###### Implementation of

[`IAgenticAdapter`](#iagenticadapter).[`runAgent`](#runagent-1)

---

### AgentStateMachine

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L42)

Agent State Machine.

Manages agent lifecycle states with validation, event callbacks,
and error recovery mechanisms.

#### Constructors

##### Constructor

```ts
new AgentStateMachine(options?): AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L53)

###### Parameters

###### options?

[`StateMachineOptions`](#statemachineoptions-1) = `{}`

###### Returns

[`AgentStateMachine`](#agentstatemachine)

#### Accessors

##### errors

###### Get Signature

```ts
get errors(): number;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L77)

Gets the current error count.

###### Returns

`number`

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L63)

Gets the current state.

###### Returns

[`AgentState`](core.md#agentstate)

##### transitionHistory

###### Get Signature

```ts
get transitionHistory(): readonly StateTransition[];
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L70)

Gets the transition history.

###### Returns

readonly [`StateTransition`](#statetransition)[]

#### Methods

##### canTransition()

```ts
canTransition(event): boolean;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L84)

Checks if a transition is valid from the current state.

###### Parameters

###### event

[`StateTransitionEvent`](#statetransitionevent-1)

###### Returns

`boolean`

##### forceError()

```ts
forceError(context?): void;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L146)

Forces a transition to the error state.
Use for unrecoverable errors that should bypass normal transition rules.

###### Parameters

###### context?

`Record`\<`string`, `unknown`\>

Optional context data about the error

###### Returns

`void`

##### getNextState()

```ts
getNextState(event): AgentState | undefined;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L92)

Gets the next state for an event, if valid.

###### Parameters

###### event

[`StateTransitionEvent`](#statetransitionevent-1)

###### Returns

[`AgentState`](core.md#agentstate) \| `undefined`

##### getValidEvents()

```ts
getValidEvents(): StateTransitionEvent[];
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L100)

Gets all valid events from the current state.

###### Returns

[`StateTransitionEvent`](#statetransitionevent-1)[]

##### hasError()

```ts
hasError(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L250)

Checks if the agent is in an error state.

###### Returns

`boolean`

##### isAvailable()

```ts
isAvailable(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:236](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L236)

Checks if the agent is in a state where it can accept new tasks.

###### Returns

`boolean`

##### isWorking()

```ts
isWorking(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L243)

Checks if the agent is currently working.

###### Returns

`boolean`

##### onStateChange()

```ts
onStateChange(callback): () => void;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:213](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L213)

Subscribes to state change events.

###### Parameters

###### callback

[`StateChangeCallback`](#statechangecallback)

Callback to invoke on state changes

###### Returns

Unsubscribe function

() => `void`

##### onTransitionError()

```ts
onTransitionError(callback): () => void;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:226](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L226)

Subscribes to transition error events.

###### Parameters

###### callback

[`TransitionErrorCallback`](#transitionerrorcallback)

Callback to invoke on transition errors

###### Returns

Unsubscribe function

() => `void`

##### recover()

```ts
recover(context?): Result<AgentState, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L161)

Attempts recovery from the error state.

###### Parameters

###### context?

`Record`\<`string`, `unknown`\>

Optional context data about the recovery

###### Returns

[`Result`](core.md#result)\<[`AgentState`](core.md#agentstate), [`AgentError`](core.md#agenterror)\>

Result with the new state or an AgentError if recovery failed

##### reset()

```ts
reset(clearHistory?): void;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L199)

Resets the state machine to its initial state.

###### Parameters

###### clearHistory?

`boolean` = `false`

Whether to clear the transition history

###### Returns

`void`

##### resetErrorCount()

```ts
resetErrorCount(): void;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L190)

Resets the error count. Call after successful task completion.

###### Returns

`void`

##### transition()

```ts
transition(event, context?): Result<AgentState, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L112)

Attempts a state transition.

###### Parameters

###### event

[`StateTransitionEvent`](#statetransitionevent-1)

The event triggering the transition

###### context?

`Record`\<`string`, `unknown`\>

Optional context data for the transition

###### Returns

[`Result`](core.md#result)\<[`AgentState`](core.md#agentstate), [`AgentError`](core.md#agenterror)\>

Result with the new state or an AgentError

---

### ArchitectureExpert

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L75)

ArchitectureExpert - Expert agent for architecture-related tasks.

#### Extends

- [`BaseAgent`](#abstract-baseagent)

#### Constructors

##### Constructor

```ts
new ArchitectureExpert(options?): ArchitectureExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L78)

###### Parameters

###### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`ArchitectureExpertOptions`](#architectureexpertoptions);
\} = `{}`

###### Returns

[`ArchitectureExpert`](#architectureexpert)

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`constructor`](#constructor-3)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`adapter`](#adapter-1)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`budgetTracker`](#budgettracker-1)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`capabilities`](#capabilities-1)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`config`](#config-1)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`emitMessageEvents`](#emitmessageevents-1)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`eventBus`](#eventbus-1)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`history`](#history-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`id`](#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`logger`](#logger-1)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`maxTokens`](#maxtokens-1)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`role`](#role-1)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`sharedState`](#sharedstate-1)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`stateMachine`](#statemachine-1)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`systemPrompt`](#systemprompt-1)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`temperature`](#temperature-1)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`state`](#state-2)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addContextItem`](#addcontextitem-1)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addToHistory`](#addtohistory-1)

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L106)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`buildPrompt`](#buildprompt-1)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`cleanup`](#cleanup-1)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`clearHistory`](#clearhistory-1)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`complete`](#complete-1)

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`execute`](#execute-1)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L88)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`executeTask`](#executetask-1)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`findResolutionForError`](#findresolutionforerror-1)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`flushMemory`](#flushmemory-1)

##### getExpertOptions()

```ts
getExpertOptions(): Readonly<ArchitectureExpertOptions>;
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L122)

###### Returns

`Readonly`\<[`ArchitectureExpertOptions`](#architectureexpertoptions)\>

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getHistory`](#gethistory-1)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getMemoryState`](#getmemorystate-1)

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getPruningMetrics`](#getpruningmetrics-1)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getRelevantMemories`](#getrelevantmemories-1)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTaskLearnings`](#gettasklearnings-1)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-1)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`handleMessage`](#handlemessage-1)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`hasCapability`](#hascapability-1)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`initialize`](#initialize-1)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isContextPruningEnabled`](#iscontextpruningenabled-1)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isMemoryEnabled`](#ismemoryenabled-1)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordLearning`](#recordlearning-1)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordPattern`](#recordpattern-1)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordResolution`](#recordresolution-1)

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`transformError`](#transformerror-1)

---

### `abstract` BaseAgent

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L93)

Abstract base class for all agents. Subclasses must implement executeTask and buildPrompt.

#### Extended by

- [`SimpleAgent`](#simpleagent)
- [`Orchestrator`](#orchestrator)
- [`CodeExpert`](#codeexpert)
- [`SecurityExpert`](#securityexpert)
- [`ArchitectureExpert`](#architectureexpert)
- [`TestingExpert`](#testingexpert)
- [`DocumentationExpert`](#documentationexpert)

#### Implements

- [`IAgent`](core.md#iagent)

#### Constructors

##### Constructor

```ts
new BaseAgent(options): BaseAgent;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L130)

###### Parameters

###### options

[`BaseAgentOptions`](#baseagentoptions)

###### Returns

[`BaseAgent`](#abstract-baseagent)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Implementation of

[`IAgent`](core.md#iagent).[`capabilities`](core.md#capabilities)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Implementation of

[`IAgent`](core.md#iagent).[`id`](core.md#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Implementation of

[`IAgent`](core.md#iagent).[`role`](core.md#role)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Implementation of

[`IAgent`](core.md#iagent).[`state`](core.md#state)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

##### buildPrompt()

```ts
abstract protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:298](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L298)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`IAgent`](core.md#iagent).[`cleanup`](core.md#cleanup)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Implementation of

[`IAgent`](core.md#iagent).[`execute`](core.md#execute)

##### executeTask()

```ts
abstract protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L297)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Implementation of

[`IAgent`](core.md#iagent).[`handleMessage`](core.md#handlemessage)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Implementation of

[`IAgent`](core.md#iagent).[`initialize`](core.md#initialize)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

---

### CodeExpert

Defined in: [packages/nexus-agents/src/agents/experts/code-expert.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert.ts#L40)

CodeExpert - Expert agent for code-related tasks.

Specialized in:

- Code generation from specifications
- Code refactoring and cleanup
- Performance optimization
- Bug detection and debugging

#### Extends

- [`BaseAgent`](#abstract-baseagent)

#### Constructors

##### Constructor

```ts
new CodeExpert(options?): CodeExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert.ts#L43)

###### Parameters

###### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`CodeExpertOptions`](#codeexpertoptions);
\} = `{}`

###### Returns

[`CodeExpert`](#codeexpert)

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`constructor`](#constructor-3)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`adapter`](#adapter-1)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`budgetTracker`](#budgettracker-1)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`capabilities`](#capabilities-1)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`config`](#config-1)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`emitMessageEvents`](#emitmessageevents-1)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`eventBus`](#eventbus-1)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`history`](#history-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`id`](#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`logger`](#logger-1)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`maxTokens`](#maxtokens-1)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`role`](#role-1)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`sharedState`](#sharedstate-1)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`stateMachine`](#statemachine-1)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`systemPrompt`](#systemprompt-1)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`temperature`](#temperature-1)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`state`](#state-2)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addContextItem`](#addcontextitem-1)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addToHistory`](#addtohistory-1)

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert.ts#L76)

Build prompt messages for the task.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`buildPrompt`](#buildprompt-1)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`cleanup`](#cleanup-1)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`clearHistory`](#clearhistory-1)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`complete`](#complete-1)

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`execute`](#execute-1)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert.ts#L54)

Execute a code-related task.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`executeTask`](#executetask-1)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`findResolutionForError`](#findresolutionforerror-1)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`flushMemory`](#flushmemory-1)

##### getExpertOptions()

```ts
getExpertOptions(): Readonly<CodeExpertOptions>;
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert.ts#L95)

Get the expert options.

###### Returns

`Readonly`\<[`CodeExpertOptions`](#codeexpertoptions)\>

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getHistory`](#gethistory-1)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getMemoryState`](#getmemorystate-1)

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getPruningMetrics`](#getpruningmetrics-1)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getRelevantMemories`](#getrelevantmemories-1)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTaskLearnings`](#gettasklearnings-1)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-1)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`handleMessage`](#handlemessage-1)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`hasCapability`](#hascapability-1)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`initialize`](#initialize-1)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isContextPruningEnabled`](#iscontextpruningenabled-1)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isMemoryEnabled`](#ismemoryenabled-1)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordLearning`](#recordlearning-1)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordPattern`](#recordpattern-1)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordResolution`](#recordresolution-1)

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`transformError`](#transformerror-1)

---

### CollaborationSession

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L47)

Manages a collaboration session between multiple experts.

#### Constructors

##### Constructor

```ts
new CollaborationSession(options?): CollaborationSession;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L57)

###### Parameters

###### options?

[`CollaborationSessionOptions`](#collaborationsessionoptions) = `{}`

###### Returns

[`CollaborationSession`](#collaborationsession)

#### Methods

##### addEventListener()

```ts
addEventListener(listener): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L345)

###### Parameters

###### listener

(`event`) => `void`

###### Returns

`void`

##### cancel()

```ts
cancel(reason): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L335)

###### Parameters

###### reason

`string`

###### Returns

`void`

##### finalize()

```ts
finalize(): Result<CollaborationResult, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:284](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L284)

Finalizes the session and returns aggregated result.

###### Returns

[`Result`](core.md#result)\<[`CollaborationResult`](#collaborationresult), [`AgentError`](core.md#agenterror)\>

##### getSessionId()

```ts
getSessionId(): string | null;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:245](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L245)

###### Returns

`string` \| `null`

##### getStatus()

```ts
getStatus(): SessionState | null;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L242)

###### Returns

[`SessionState`](#sessionstate) \| `null`

##### getTaskAssignments()

```ts
getTaskAssignments(): TaskAssignmentMessage[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L277)

Gets task assignments for experts based on pattern.

###### Returns

[`TaskAssignmentMessage`](#taskassignmentmessage)[]

##### markExpertFailed()

```ts
markExpertFailed(expertId, _error): Result<void, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L250)

Marks an expert as failed.

###### Parameters

###### expertId

`string`

###### \_error

`string`

###### Returns

[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>

##### removeEventListener()

```ts
removeEventListener(listener): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:356](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L356)

###### Parameters

###### listener

(`event`) => `void`

###### Returns

`void`

##### requestReview()

```ts
requestReview(
   fromExpert,
   toExpert,
artifact): Result<void, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L148)

Requests a review from one expert to another.

###### Parameters

###### fromExpert

`string`

###### toExpert

`string`

###### artifact

`unknown`

###### Returns

[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>

##### start()

```ts
start(config): Result<string, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L66)

Starts a new collaboration session.

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### Returns

[`Result`](core.md#result)\<`string`, [`AgentError`](core.md#agenterror)\>

##### submitResult()

```ts
submitResult(expertId, result): Result<void, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L116)

Submits a result from an expert.

###### Parameters

###### expertId

`string`

###### result

[`TaskResult`](core.md#taskresult)

###### Returns

[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>

##### submitReview()

```ts
submitReview(
   reviewerId,
   requesterId,
   approved,
feedback): Result<void, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L169)

Submits a review response.

###### Parameters

###### reviewerId

`string`

###### requesterId

`string`

###### approved

`boolean`

###### feedback

`string`

###### Returns

[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>

##### vote()

```ts
vote(
   expertId,
   decision,
reasoning): Result<void, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L199)

Submits a vote for consensus protocol.

###### Parameters

###### expertId

`string`

###### decision

`"approve"` \| `"reject"` \| `"abstain"`

###### reasoning

`string`

###### Returns

[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>

---

### ConsensusProtocol

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L22)

Consensus collaboration protocol.

#### Implements

- [`ICollaborationProtocol`](#icollaborationprotocol)

#### Constructors

##### Constructor

```ts
new ConsensusProtocol(options?): ConsensusProtocol;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L29)

###### Parameters

###### options?

[`ProtocolOptions`](#protocoloptions) = `{}`

###### Returns

[`ConsensusProtocol`](#consensusprotocol)

#### Properties

##### cancelled

```ts
protected cancelled: boolean = false;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L26)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L24)

##### options

```ts
protected readonly options: ProtocolOptions;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L27)

##### pattern

```ts
readonly pattern: "consensus";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L23)

###### Implementation of

[`ICollaborationProtocol`](#icollaborationprotocol).[`pattern`](#pattern-8)

##### session

```ts
protected session: CollaborationSession | null = null;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L25)

#### Methods

##### cancel()

```ts
cancel(reason): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L34)

###### Parameters

###### reason

`string`

###### Returns

`void`

###### Implementation of

[`ICollaborationProtocol`](#icollaborationprotocol).[`cancel`](#cancel-6)

##### execute()

```ts
execute(config, agents): Promise<Result<CollaborationResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts#L40)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CollaborationResult`](#collaborationresult), [`AgentError`](core.md#agenterror)\>\>

###### Implementation of

[`ICollaborationProtocol`](#icollaborationprotocol).[`execute`](#execute-16)

---

### ContextManager

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L58)

Manages context window for agents with token budget enforcement.

#### Constructors

##### Constructor

```ts
new ContextManager(config): ContextManager;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L71)

###### Parameters

###### config

[`ContextManagerConfig`](#contextmanagerconfig)

###### Returns

[`ContextManager`](#contextmanager)

#### Methods

##### add()

```ts
add(item): Promise<Result<ContextItem, ValidationError>>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L90)

Add an item to the context. Returns Result with the added item or error.

###### Parameters

###### item

`Omit`\<[`ContextItem`](#contextitem), `"tokenCount"` \| `"addedAt"`\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ContextItem`](#contextitem), [`ValidationError`](core.md#validationerror)\>\>

##### buildMessages()

```ts
buildMessages(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:247](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L247)

Build messages array from context items for model requests.

###### Returns

[`Message`](core.md#message-11)[]

##### canAdd()

```ts
canAdd(content, category): Promise<boolean>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L221)

Check if an item with the given content can be added to a category.

###### Parameters

###### content

`string`

###### category

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`boolean`\>

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:280](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L280)

Clear all items from the context.

###### Returns

`void`

##### clearCategory()

```ts
clearCategory(category): number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:288](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L288)

Clear items from a specific category. Returns number of items removed.

###### Parameters

###### category

`"system"` \| `"task"` \| `"active"`

###### Returns

`number`

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:308](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L308)

Count tokens in text using adapter or fallback estimation.

###### Parameters

###### text

`string`

###### Returns

`Promise`\<`number`\>

##### get()

```ts
get(id): ContextItem | undefined;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L216)

Get an item by ID.

###### Parameters

###### id

`string`

###### Returns

[`ContextItem`](#contextitem) \| `undefined`

##### getAllItems()

```ts
getAllItems(): ContextItem[];
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L242)

Get all items sorted by priority (desc) then addedAt (asc).

###### Returns

[`ContextItem`](#contextitem)[]

##### getByCategory()

```ts
getByCategory(category): ContextItem[];
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L237)

Get all items in a category, sorted by priority (desc) then addedAt (asc).

###### Parameters

###### category

`"system"` \| `"task"` \| `"active"`

###### Returns

[`ContextItem`](#contextitem)[]

##### getRemainingTokens()

```ts
getRemainingTokens(category): number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L267)

Get remaining tokens available in a category.

###### Parameters

###### category

`"system"` \| `"task"` \| `"active"`

###### Returns

`number`

##### getStats()

```ts
getStats(): ContextStats;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L257)

Get current context statistics.

###### Returns

[`ContextStats`](#contextstats)

##### getSystemPrompt()

```ts
getSystemPrompt(): string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:252](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L252)

Get the system prompt from system category items.

###### Returns

`string` \| `undefined`

##### getTotalRemainingTokens()

```ts
getTotalRemainingTokens(): number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L274)

Get total remaining tokens across all categories.

###### Returns

`number`

##### remove()

```ts
remove(id): boolean;
```

Defined in: [packages/nexus-agents/src/agents/context-manager.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager.ts#L200)

Remove an item from the context. Returns true if removed, false if not found.

###### Parameters

###### id

`string`

###### Returns

`boolean`

---

### ContextPruner

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L96)

Handles context pruning with multiple strategies.

#### Constructors

##### Constructor

```ts
new ContextPruner(config): ContextPruner;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L105)

###### Parameters

###### config

[`ContextPrunerConfig`](#contextprunerconfig)

###### Returns

[`ContextPruner`](#contextpruner)

#### Methods

##### estimateFreeableTokens()

```ts
estimateFreeableTokens(categories): number;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L193)

Estimate tokens that can be freed from specified categories.

###### Parameters

###### categories

(`"system"` \| `"task"` \| `"active"`)[]

###### Returns

`number`

##### getPruneCandidates()

```ts
getPruneCandidates(categories): ContextItem[];
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L184)

Get candidates for pruning from specified categories.

###### Parameters

###### categories

(`"system"` \| `"task"` \| `"active"`)[]

###### Returns

[`ContextItem`](#contextitem)[]

##### prune()

```ts
prune(options?): Promise<Result<PruneResult, ValidationError>>;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L132)

Prune context to free tokens or reach target capacity.

###### Parameters

###### options?

[`PruneOptions`](#pruneoptions) = `{}`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`PruneResult`](#pruneresult), [`ValidationError`](core.md#validationerror)\>\>

##### pruneCategory()

```ts
pruneCategory(category, targetTokens): Promise<Result<PruneResult, ValidationError>>;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L176)

Prune items from a specific category.

###### Parameters

###### category

`"system"` \| `"task"` \| `"active"`

###### targetTokens

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`PruneResult`](#pruneresult), [`ValidationError`](core.md#validationerror)\>\>

##### shouldPrune()

```ts
shouldPrune(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L127)

Check if pruning should be triggered based on usage threshold.

###### Returns

`boolean`

---

### DocumentationExpert

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L52)

DocumentationExpert - Expert agent for documentation-related tasks.

#### Extends

- [`BaseAgent`](#abstract-baseagent)

#### Constructors

##### Constructor

```ts
new DocumentationExpert(options?): DocumentationExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L55)

###### Parameters

###### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`DocumentationExpertOptions`](#documentationexpertoptions);
\} = `{}`

###### Returns

[`DocumentationExpert`](#documentationexpert)

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`constructor`](#constructor-3)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`adapter`](#adapter-1)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`budgetTracker`](#budgettracker-1)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`capabilities`](#capabilities-1)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`config`](#config-1)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`emitMessageEvents`](#emitmessageevents-1)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`eventBus`](#eventbus-1)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`history`](#history-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`id`](#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`logger`](#logger-1)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`maxTokens`](#maxtokens-1)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`role`](#role-1)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`sharedState`](#sharedstate-1)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`stateMachine`](#statemachine-1)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`systemPrompt`](#systemprompt-1)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`temperature`](#temperature-1)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`state`](#state-2)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addContextItem`](#addcontextitem-1)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addToHistory`](#addtohistory-1)

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L83)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`buildPrompt`](#buildprompt-1)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`cleanup`](#cleanup-1)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`clearHistory`](#clearhistory-1)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`complete`](#complete-1)

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`execute`](#execute-1)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L65)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`executeTask`](#executetask-1)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`findResolutionForError`](#findresolutionforerror-1)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`flushMemory`](#flushmemory-1)

##### getExpertOptions()

```ts
getExpertOptions(): Readonly<DocumentationExpertOptions>;
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L99)

###### Returns

`Readonly`\<[`DocumentationExpertOptions`](#documentationexpertoptions)\>

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getHistory`](#gethistory-1)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getMemoryState`](#getmemorystate-1)

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getPruningMetrics`](#getpruningmetrics-1)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getRelevantMemories`](#getrelevantmemories-1)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTaskLearnings`](#gettasklearnings-1)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-1)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`handleMessage`](#handlemessage-1)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`hasCapability`](#hascapability-1)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`initialize`](#initialize-1)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isContextPruningEnabled`](#iscontextpruningenabled-1)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isMemoryEnabled`](#ismemoryenabled-1)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordLearning`](#recordlearning-1)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordPattern`](#recordpattern-1)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordResolution`](#recordresolution-1)

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`transformError`](#transformerror-1)

---

### Expert

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L61)

Expert agent extending SimpleAgent with configuration-based setup.

#### Extends

- [`SimpleAgent`](#simpleagent)

#### Constructors

##### Constructor

```ts
new Expert(options, config): Expert;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L64)

###### Parameters

###### options

[`BaseAgentOptions`](#baseagentoptions)

###### config

[`ExpertConfig`](#expertconfig-2)

###### Returns

[`Expert`](#expert)

###### Overrides

[`SimpleAgent`](#simpleagent).[`constructor`](#constructor-21)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`adapter`](#adapter-7)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`budgetTracker`](#budgettracker-7)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`SimpleAgent`](#simpleagent).[`capabilities`](#capabilities-7)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`config`](#config-7)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`emitMessageEvents`](#emitmessageevents-7)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`eventBus`](#eventbus-7)

##### expertConfig

```ts
readonly expertConfig: ExpertConfig;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L62)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`history`](#history-7)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`SimpleAgent`](#simpleagent).[`id`](#id-7)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`logger`](#logger-11)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`maxTokens`](#maxtokens-7)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`SimpleAgent`](#simpleagent).[`role`](#role-7)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`sharedState`](#sharedstate-7)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`stateMachine`](#statemachine-7)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`systemPrompt`](#systemprompt-7)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`temperature`](#temperature-7)

#### Accessors

##### metadata

###### Get Signature

```ts
get metadata(): Record<string, unknown> | undefined;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L79)

Get the expert's metadata.

###### Returns

`Record`\<`string`, `unknown`\> \| `undefined`

##### name

###### Get Signature

```ts
get name(): string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L72)

Get the expert's name.

###### Returns

`string`

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`SimpleAgent`](#simpleagent).[`state`](#state-8)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SimpleAgent`](#simpleagent).[`addContextItem`](#addcontextitem-7)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`addToHistory`](#addtohistory-7)

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/simple-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/simple-agent.ts#L103)

Build prompt messages from a task.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`SimpleAgent`](#simpleagent).[`buildPrompt`](#buildprompt-7)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SimpleAgent`](#simpleagent).[`cleanup`](#cleanup-7)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`clearHistory`](#clearhistory-7)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`SimpleAgent`](#simpleagent).[`complete`](#complete-7)

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`SimpleAgent`](#simpleagent).[`execute`](#execute-12)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/simple-agent.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/simple-agent.ts#L21)

Execute a task by sending it to the model.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`SimpleAgent`](#simpleagent).[`executeTask`](#executetask-7)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`findResolutionForError`](#findresolutionforerror-7)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`SimpleAgent`](#simpleagent).[`flushMemory`](#flushmemory-7)

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`SimpleAgent`](#simpleagent).[`getHistory`](#gethistory-7)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`getMemoryState`](#getmemorystate-7)

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`SimpleAgent`](#simpleagent).[`getPruningMetrics`](#getpruningmetrics-7)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`SimpleAgent`](#simpleagent).[`getRelevantMemories`](#getrelevantmemories-7)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`SimpleAgent`](#simpleagent).[`getTaskLearnings`](#gettasklearnings-7)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`SimpleAgent`](#simpleagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-7)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`handleMessage`](#handlemessage-7)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`hasCapability`](#hascapability-7)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`SimpleAgent`](#simpleagent).[`initialize`](#initialize-7)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`isContextPruningEnabled`](#iscontextpruningenabled-7)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`isMemoryEnabled`](#ismemoryenabled-7)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`recordLearning`](#recordlearning-7)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`recordPattern`](#recordpattern-7)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`SimpleAgent`](#simpleagent).[`recordResolution`](#recordresolution-7)

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`SimpleAgent`](#simpleagent).[`transformError`](#transformerror-7)

---

### ExpertRegistry

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L68)

Singleton registry for managing expert agents.

Provides thread-safe registration and lookup of experts.
Supports querying by ID, role, and capabilities.

Implements IRegistry<Expert, RegistryError> for unified registry API.

#### Implements

- `IRegistry`\<[`Expert`](#expert), [`RegistryError`](#registryerror)\>

#### Accessors

##### isEmpty

###### Get Signature

```ts
get isEmpty(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:319](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L319)

Check if the registry is empty.

###### Returns

`boolean`

###### Implementation of

```ts
IRegistry.isEmpty;
```

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:312](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L312)

Get the number of registered experts.

###### Returns

`number`

###### Implementation of

```ts
IRegistry.size;
```

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:326](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L326)

Clear all registered experts.

###### Returns

`void`

###### Implementation of

```ts
IRegistry.clear;
```

##### findBestMatch()

```ts
findBestMatch(requiredCapabilities): Result<Expert, RegistryError>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L363)

Find the best expert for a set of required capabilities.

Returns the expert that matches the most capabilities.

###### Parameters

###### requiredCapabilities

[`AgentCapability`](core.md#agentcapability)[]

Capabilities needed

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert), [`RegistryError`](#registryerror)\>

Result with best Expert or RegistryError if none found

##### get()

```ts
get(id): Result<Expert, RegistryError>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L163)

Get an expert by ID.

###### Parameters

###### id

`string`

Expert ID to retrieve

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert), [`RegistryError`](#registryerror)\>

Result with Expert or RegistryError

###### Implementation of

```ts
IRegistry.get;
```

##### getAll()

```ts
getAll(): Expert[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L274)

Get all registered experts.
IRegistry interface method.

###### Returns

[`Expert`](#expert)[]

Array of all registered experts

###### Implementation of

```ts
IRegistry.getAll;
```

##### getAllIds()

```ts
getAllIds(): string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:284](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L284)

Get all registered expert IDs.
IRegistry interface method.

###### Returns

`string`[]

Array of all registered expert IDs

###### Implementation of

```ts
IRegistry.getAllIds;
```

##### getByCapability()

```ts
getByCapability(capability): Expert[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L198)

Get experts by capability.

Returns all experts that have the specified capability.

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

Capability to search for

###### Returns

[`Expert`](#expert)[]

Array of matching experts

##### getByRole()

```ts
getByRole(role): Expert[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:210](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L210)

Get experts by role.

###### Parameters

###### role

`string`

Role to search for

###### Returns

[`Expert`](#expert)[]

Array of matching experts

##### getStats()

```ts
getStats(): RegistryStats;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:334](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L334)

Get statistics about the registry.
Returns IRegistryStats-compatible stats with domain-specific extensions.

###### Returns

[`RegistryStats`](#registrystats)

###### Implementation of

```ts
IRegistry.getStats;
```

##### has()

```ts
has(id): boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L186)

Check if an expert is registered.

###### Parameters

###### id

`string`

Expert ID to check

###### Returns

`boolean`

True if expert is registered

###### Implementation of

```ts
IRegistry.has;
```

##### query()

```ts
query(predicate): Expert[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:260](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L260)

Query experts with predicate function.
IRegistry interface method.

###### Parameters

###### predicate

(`item`) => `boolean`

Function to test each expert

###### Returns

[`Expert`](#expert)[]

Array of matching experts

###### Implementation of

```ts
IRegistry.query;
```

##### queryWithOptions()

```ts
queryWithOptions(options): Expert[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L221)

Query experts with multiple criteria.
Domain-specific query with structured options.

###### Parameters

###### options

[`QueryOptions`](#queryoptions)

Query options

###### Returns

[`Expert`](#expert)[]

Array of matching experts

##### register()

```ts
register(expert, options?): Result<void, RegistryError>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L101)

Register an expert in the registry.

###### Parameters

###### expert

[`Expert`](#expert)

Expert to register

###### options?

[`ExpertRegisterOptions`](#expertregisteroptions)

Registration options

###### Returns

[`Result`](core.md#result)\<`void`, [`RegistryError`](#registryerror)\>

Result with void or RegistryError

###### Implementation of

```ts
IRegistry.register;
```

##### registerMany()

```ts
registerMany(experts, options?): Result<void, RegistryError>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L126)

Register multiple experts.

###### Parameters

###### experts

[`Expert`](#expert)[]

Experts to register

###### options?

[`ExpertRegisterOptions`](#expertregisteroptions)

Registration options

###### Returns

[`Result`](core.md#result)\<`void`, [`RegistryError`](#registryerror)\>

Result with void or first RegistryError

##### search()

```ts
search(searchTerm): Expert[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L297)

Search experts by text query.
IRegistry interface method.

Searches expert ID, name, role, and capabilities.

###### Parameters

###### searchTerm

`string`

Search term to match

###### Returns

[`Expert`](#expert)[]

Array of matching experts

###### Implementation of

```ts
IRegistry.search;
```

##### unregister()

```ts
unregister(id): Result<Expert, RegistryError>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L142)

Unregister an expert by ID.

###### Parameters

###### id

`string`

Expert ID to unregister

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert), [`RegistryError`](#registryerror)\>

Result with the removed Expert or RegistryError

###### Implementation of

```ts
IRegistry.unregister;
```

##### getInstance()

```ts
static getInstance(): ExpertRegistry;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L79)

Get the singleton instance.

###### Returns

[`ExpertRegistry`](#expertregistry)

##### resetInstance()

```ts
static resetInstance(): void;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L87)

Reset the singleton instance (for testing).

###### Returns

`void`

---

### FactoryError

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L32)

Error specific to factory operations.

#### Extends

- [`AgentError`](core.md#agenterror)

#### Constructors

##### Constructor

```ts
new FactoryError(message, options?): FactoryError;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L33)

###### Parameters

###### message

`string`

###### options?

###### cause?

`Error`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`FactoryError`](#factoryerror)

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

### Orchestrator

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L192)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Extends

- [`BaseAgent`](#abstract-baseagent)

#### Constructors

##### Constructor

```ts
new Orchestrator(options?): Orchestrator;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L198)

###### Parameters

###### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & `OrchestratorExtendedOptions` & \{
`techLeadOptions?`: [`OrchestratorOptions`](#orchestratoroptions);
\} = `{}`

###### Returns

[`Orchestrator`](#orchestrator)

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`constructor`](#constructor-3)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`adapter`](#adapter-1)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`budgetTracker`](#budgettracker-1)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`capabilities`](#capabilities-1)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`config`](#config-1)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`emitMessageEvents`](#emitmessageevents-1)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`eventBus`](#eventbus-1)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`history`](#history-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`id`](#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`logger`](#logger-1)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`maxTokens`](#maxtokens-1)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`role`](#role-1)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`sharedState`](#sharedstate-1)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`stateMachine`](#statemachine-1)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`systemPrompt`](#systemprompt-1)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`temperature`](#temperature-1)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`state`](#state-2)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addContextItem`](#addcontextitem-1)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addToHistory`](#addtohistory-1)

##### analyzeTask()

```ts
analyzeTask(task): Promise<Result<TaskAnalysis, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:287](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L287)

Analyze a task to understand its complexity and requirements.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskAnalysis`](#taskanalysis), [`AgentError`](core.md#agenterror)\>\>

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:282](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L282)

Build prompt messages for task execution.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`buildPrompt`](#buildprompt-1)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`cleanup`](#cleanup-1)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`clearHistory`](#clearhistory-1)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`complete`](#complete-1)

##### decomposeTask()

```ts
decomposeTask(task, analysis): Promise<Result<SubTask[], AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:318](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L318)

Decompose a task into subtasks.

###### Parameters

###### task

[`Task`](core.md#task)

###### analysis

[`TaskAnalysis`](#taskanalysis)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`SubTask`](#subtask)[], [`AgentError`](core.md#agenterror)\>\>

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`execute`](#execute-1)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L240)

Execute a task by analyzing, decomposing (if needed), and coordinating.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`executeTask`](#executetask-1)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`findResolutionForError`](#findresolutionforerror-1)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`flushMemory`](#flushmemory-1)

##### getCollaborationHelper()

```ts
getCollaborationHelper(): OrchestratorCollaborationHelper;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:474](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L474)

Get the collaboration helper for external use.

###### Returns

`OrchestratorCollaborationHelper`

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getHistory`](#gethistory-1)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getMemoryState`](#getmemorystate-1)

##### getOptions()

```ts
getOptions(): Readonly<Required<OrchestratorOptions>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:479](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L479)

Get the Orchestrator options.

###### Returns

`Readonly`\<`Required`\<[`OrchestratorOptions`](#orchestratoroptions)\>\>

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getPruningMetrics`](#getpruningmetrics-1)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getRelevantMemories`](#getrelevantmemories-1)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTaskLearnings`](#gettasklearnings-1)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-1)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`handleMessage`](#handlemessage-1)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`hasCapability`](#hascapability-1)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`initialize`](#initialize-1)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isContextPruningEnabled`](#iscontextpruningenabled-1)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isMemoryEnabled`](#ismemoryenabled-1)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordLearning`](#recordlearning-1)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordPattern`](#recordpattern-1)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordResolution`](#recordresolution-1)

##### selectExperts()

```ts
selectExperts(subtasks): ExpertAssignment[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L363)

Select appropriate expert agents for each subtask.

###### Parameters

###### subtasks

[`SubTask`](#subtask)[]

###### Returns

[`ExpertAssignment`](#expertassignment)[]

##### setExpertAgents()

```ts
setExpertAgents(agents): void;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L231)

Set expert agents for collaboration (Issue #488).
Call this to provide agents that can participate in collaborative synthesis.

###### Parameters

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

`void`

##### synthesizeResults()

```ts
synthesizeResults(results, originalTask?): Promise<Result<SynthesizedResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L376)

Synthesize results from multiple experts into a cohesive output.

Uses collaboration protocols for complex multi-expert synthesis (Issue #488)
when enough experts and task complexity warrant it.

###### Parameters

###### results

[`TaskResult`](core.md#taskresult)[]

Results to synthesize

###### originalTask?

[`Task`](core.md#task)

Optional original task for context in collaborative synthesis

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`SynthesizedResult`](#synthesizedresult), [`AgentError`](core.md#agenterror)\>\>

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`transformError`](#transformerror-1)

---

### ParallelProtocol

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L209)

Parallel collaboration protocol.

#### Extends

- `BaseProtocol`

#### Constructors

##### Constructor

```ts
new ParallelProtocol(options?): ParallelProtocol;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L42)

###### Parameters

###### options?

[`ProtocolOptions`](#protocoloptions) = `{}`

###### Returns

[`ParallelProtocol`](#parallelprotocol)

###### Inherited from

```ts
BaseProtocol.constructor;
```

#### Properties

##### cancelled

```ts
protected cancelled: boolean = false;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L40)

###### Inherited from

```ts
BaseProtocol.cancelled;
```

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L38)

###### Inherited from

```ts
BaseProtocol.logger;
```

##### options

```ts
protected readonly options: ProtocolOptions = {};
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L42)

###### Inherited from

```ts
BaseProtocol.options;
```

##### pattern

```ts
readonly pattern: "parallel";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:210](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L210)

###### Overrides

```ts
BaseProtocol.pattern;
```

##### session

```ts
protected session: CollaborationSession | null = null;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L39)

###### Inherited from

```ts
BaseProtocol.session;
```

#### Methods

##### cancel()

```ts
cancel(reason): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L51)

###### Parameters

###### reason

`string`

###### Returns

`void`

###### Inherited from

```ts
BaseProtocol.cancel;
```

##### createSession()

```ts
protected createSession(): CollaborationSession;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L57)

###### Returns

[`CollaborationSession`](#collaborationsession)

###### Inherited from

```ts
BaseProtocol.createSession;
```

##### execute()

```ts
execute(config, agents): Promise<Result<CollaborationResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L212)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CollaborationResult`](#collaborationresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

```ts
BaseProtocol.execute;
```

##### executeAgentTask()

```ts
protected executeAgentTask(
   agent,
   task,
previousResults?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L62)

###### Parameters

###### agent

[`IAgent`](core.md#iagent)

###### task

[`Task`](core.md#task)

###### previousResults?

[`TaskResult`](core.md#taskresult)[]

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

```ts
BaseProtocol.executeAgentTask;
```

##### validateAgents()

```ts
protected validateAgents(config, agents): Result<void, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L85)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>

###### Inherited from

```ts
BaseProtocol.validateAgents;
```

---

### ProtocolFactory

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L264)

Factory for creating collaboration protocols.

#### Constructors

##### Constructor

```ts
new ProtocolFactory(options?): ProtocolFactory;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L267)

###### Parameters

###### options?

[`ProtocolOptions`](#protocoloptions) = `{}`

###### Returns

[`ProtocolFactory`](#protocolfactory)

#### Methods

##### create()

```ts
create(pattern): ICollaborationProtocol;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:271](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L271)

###### Parameters

###### pattern

[`CollaborationPattern`](#collaborationpattern)

###### Returns

[`ICollaborationProtocol`](#icollaborationprotocol)

##### execute()

```ts
execute(config, agents): Promise<Result<CollaborationResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L300)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CollaborationResult`](#collaborationresult), [`AgentError`](core.md#agenterror)\>\>

---

### RegistryError

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L18)

Error specific to registry operations.

#### Extends

- [`AgentError`](core.md#agenterror)

#### Constructors

##### Constructor

```ts
new RegistryError(message, options?): RegistryError;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L19)

###### Parameters

###### message

`string`

###### options?

###### cause?

`Error`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`RegistryError`](#registryerror)

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

### ResultAggregator

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L55)

Aggregates results from multiple experts.

#### Constructors

##### Constructor

```ts
new ResultAggregator(options?): ResultAggregator;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L61)

###### Parameters

###### options?

[`AggregatorOptions`](#aggregatoroptions) = `{}`

###### Returns

[`ResultAggregator`](#resultaggregator)

#### Methods

##### aggregate()

```ts
aggregate(input): Result<AggregatedResult, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L71)

Aggregates expert results into a final result.

###### Parameters

###### input

[`AggregatorInput`](#aggregatorinput)

###### Returns

[`Result`](core.md#result)\<[`AggregatedResult`](#aggregatedresult), [`AgentError`](core.md#agenterror)\>

---

### ReviewProtocol

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L22)

Review collaboration protocol.

#### Implements

- [`ICollaborationProtocol`](#icollaborationprotocol)

#### Constructors

##### Constructor

```ts
new ReviewProtocol(options?): ReviewProtocol;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L29)

###### Parameters

###### options?

[`ProtocolOptions`](#protocoloptions) = `{}`

###### Returns

[`ReviewProtocol`](#reviewprotocol)

#### Properties

##### cancelled

```ts
protected cancelled: boolean = false;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L26)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L24)

##### options

```ts
protected readonly options: ProtocolOptions;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L27)

##### pattern

```ts
readonly pattern: "review";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L23)

###### Implementation of

[`ICollaborationProtocol`](#icollaborationprotocol).[`pattern`](#pattern-8)

##### session

```ts
protected session: CollaborationSession | null = null;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L25)

#### Methods

##### cancel()

```ts
cancel(reason): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L34)

###### Parameters

###### reason

`string`

###### Returns

`void`

###### Implementation of

[`ICollaborationProtocol`](#icollaborationprotocol).[`cancel`](#cancel-6)

##### execute()

```ts
execute(config, agents): Promise<Result<CollaborationResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/review-protocol.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/review-protocol.ts#L40)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CollaborationResult`](#collaborationresult), [`AgentError`](core.md#agenterror)\>\>

###### Implementation of

[`ICollaborationProtocol`](#icollaborationprotocol).[`execute`](#execute-16)

---

### SecurityExpert

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L65)

SecurityExpert - Expert agent for security-related tasks.

#### Extends

- [`BaseAgent`](#abstract-baseagent)

#### Constructors

##### Constructor

```ts
new SecurityExpert(options?): SecurityExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L68)

###### Parameters

###### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`SecurityExpertOptions`](#securityexpertoptions);
\} = `{}`

###### Returns

[`SecurityExpert`](#securityexpert)

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`constructor`](#constructor-3)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`adapter`](#adapter-1)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`budgetTracker`](#budgettracker-1)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`capabilities`](#capabilities-1)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`config`](#config-1)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`emitMessageEvents`](#emitmessageevents-1)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`eventBus`](#eventbus-1)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`history`](#history-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`id`](#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`logger`](#logger-1)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`maxTokens`](#maxtokens-1)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`role`](#role-1)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`sharedState`](#sharedstate-1)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`stateMachine`](#statemachine-1)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`systemPrompt`](#systemprompt-1)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`temperature`](#temperature-1)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`state`](#state-2)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addContextItem`](#addcontextitem-1)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addToHistory`](#addtohistory-1)

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L92)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`buildPrompt`](#buildprompt-1)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`cleanup`](#cleanup-1)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`clearHistory`](#clearhistory-1)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`complete`](#complete-1)

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`execute`](#execute-1)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L76)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`executeTask`](#executetask-1)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`findResolutionForError`](#findresolutionforerror-1)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`flushMemory`](#flushmemory-1)

##### getExpertOptions()

```ts
getExpertOptions(): Readonly<SecurityExpertOptions>;
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L108)

###### Returns

`Readonly`\<[`SecurityExpertOptions`](#securityexpertoptions)\>

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getHistory`](#gethistory-1)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getMemoryState`](#getmemorystate-1)

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getPruningMetrics`](#getpruningmetrics-1)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getRelevantMemories`](#getrelevantmemories-1)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTaskLearnings`](#gettasklearnings-1)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-1)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`handleMessage`](#handlemessage-1)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`hasCapability`](#hascapability-1)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`initialize`](#initialize-1)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isContextPruningEnabled`](#iscontextpruningenabled-1)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isMemoryEnabled`](#ismemoryenabled-1)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordLearning`](#recordlearning-1)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordPattern`](#recordpattern-1)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordResolution`](#recordresolution-1)

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`transformError`](#transformerror-1)

---

### SelectionError

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector.ts#L58)

Error thrown when expert selection fails.

#### Extends

- [`NexusError`](core.md#nexuserror)

#### Constructors

##### Constructor

```ts
new SelectionError(message, options?): SelectionError;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector.ts#L59)

###### Parameters

###### message

`string`

###### options?

###### cause?

`Error`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`SelectionError`](#selectionerror)

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

### SequentialProtocol

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L105)

Sequential collaboration protocol.

#### Extends

- `BaseProtocol`

#### Constructors

##### Constructor

```ts
new SequentialProtocol(options?): SequentialProtocol;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L42)

###### Parameters

###### options?

[`ProtocolOptions`](#protocoloptions) = `{}`

###### Returns

[`SequentialProtocol`](#sequentialprotocol)

###### Inherited from

```ts
BaseProtocol.constructor;
```

#### Properties

##### cancelled

```ts
protected cancelled: boolean = false;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L40)

###### Inherited from

```ts
BaseProtocol.cancelled;
```

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L38)

###### Inherited from

```ts
BaseProtocol.logger;
```

##### options

```ts
protected readonly options: ProtocolOptions = {};
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L42)

###### Inherited from

```ts
BaseProtocol.options;
```

##### pattern

```ts
readonly pattern: "sequential";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L106)

###### Overrides

```ts
BaseProtocol.pattern;
```

##### session

```ts
protected session: CollaborationSession | null = null;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L39)

###### Inherited from

```ts
BaseProtocol.session;
```

#### Methods

##### cancel()

```ts
cancel(reason): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L51)

###### Parameters

###### reason

`string`

###### Returns

`void`

###### Inherited from

```ts
BaseProtocol.cancel;
```

##### createSession()

```ts
protected createSession(): CollaborationSession;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L57)

###### Returns

[`CollaborationSession`](#collaborationsession)

###### Inherited from

```ts
BaseProtocol.createSession;
```

##### execute()

```ts
execute(config, agents): Promise<Result<CollaborationResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L108)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CollaborationResult`](#collaborationresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

```ts
BaseProtocol.execute;
```

##### executeAgentTask()

```ts
protected executeAgentTask(
   agent,
   task,
previousResults?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L62)

###### Parameters

###### agent

[`IAgent`](core.md#iagent)

###### task

[`Task`](core.md#task)

###### previousResults?

[`TaskResult`](core.md#taskresult)[]

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

```ts
BaseProtocol.executeAgentTask;
```

##### validateAgents()

```ts
protected validateAgents(config, agents): Result<void, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L85)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>

###### Inherited from

```ts
BaseProtocol.validateAgents;
```

---

### SimpleAgent

Defined in: [packages/nexus-agents/src/agents/simple-agent.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/simple-agent.ts#L17)

Simple concrete agent implementation for testing and basic use cases.

This agent processes tasks by sending them directly to the model adapter
and returning the response.

#### Extends

- [`BaseAgent`](#abstract-baseagent)

#### Extended by

- [`Expert`](#expert)

#### Constructors

##### Constructor

```ts
new SimpleAgent(options): SimpleAgent;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L130)

###### Parameters

###### options

[`BaseAgentOptions`](#baseagentoptions)

###### Returns

[`SimpleAgent`](#simpleagent)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`constructor`](#constructor-3)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`adapter`](#adapter-1)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`budgetTracker`](#budgettracker-1)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`capabilities`](#capabilities-1)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`config`](#config-1)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`emitMessageEvents`](#emitmessageevents-1)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`eventBus`](#eventbus-1)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`history`](#history-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`id`](#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`logger`](#logger-1)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`maxTokens`](#maxtokens-1)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`role`](#role-1)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`sharedState`](#sharedstate-1)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`stateMachine`](#statemachine-1)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`systemPrompt`](#systemprompt-1)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`temperature`](#temperature-1)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`state`](#state-2)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addContextItem`](#addcontextitem-1)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addToHistory`](#addtohistory-1)

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/simple-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/simple-agent.ts#L103)

Build prompt messages from a task.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`buildPrompt`](#buildprompt-1)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`cleanup`](#cleanup-1)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`clearHistory`](#clearhistory-1)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`complete`](#complete-1)

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`execute`](#execute-1)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/simple-agent.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/simple-agent.ts#L21)

Execute a task by sending it to the model.

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`executeTask`](#executetask-1)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`findResolutionForError`](#findresolutionforerror-1)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`flushMemory`](#flushmemory-1)

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getHistory`](#gethistory-1)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getMemoryState`](#getmemorystate-1)

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getPruningMetrics`](#getpruningmetrics-1)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getRelevantMemories`](#getrelevantmemories-1)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTaskLearnings`](#gettasklearnings-1)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-1)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`handleMessage`](#handlemessage-1)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`hasCapability`](#hascapability-1)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`initialize`](#initialize-1)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isContextPruningEnabled`](#iscontextpruningenabled-1)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isMemoryEnabled`](#ismemoryenabled-1)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordLearning`](#recordlearning-1)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordPattern`](#recordpattern-1)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordResolution`](#recordresolution-1)

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`transformError`](#transformerror-1)

---

### TestingExpert

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L60)

TestingExpert - Expert agent for testing-related tasks.

#### Extends

- [`BaseAgent`](#abstract-baseagent)

#### Constructors

##### Constructor

```ts
new TestingExpert(options?): TestingExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L63)

###### Parameters

###### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`TestingExpertOptions`](#testingexpertoptions);
\} = `{}`

###### Returns

[`TestingExpert`](#testingexpert)

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`constructor`](#constructor-3)

#### Properties

##### adapter

```ts
protected adapter: IModelAdapter | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L99)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`adapter`](#adapter-1)

##### budgetTracker

```ts
protected readonly budgetTracker: ITokenBudgetTracker;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L98)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`budgetTracker`](#budgettracker-1)

##### capabilities

```ts
readonly capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L96)

Agent capabilities

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`capabilities`](#capabilities-1)

##### config

```ts
protected config: AgentConfig | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L101)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`config`](#config-1)

##### emitMessageEvents

```ts
protected readonly emitMessageEvents: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L108)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`emitMessageEvents`](#emitmessageevents-1)

##### eventBus

```ts
protected readonly eventBus: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L107)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`eventBus`](#eventbus-1)

##### history

```ts
protected history: Message[] = [];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L103)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`history`](#history-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L94)

Unique agent identifier

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`id`](#id-1)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L100)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`logger`](#logger-1)

##### maxTokens

```ts
protected readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L106)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`maxTokens`](#maxtokens-1)

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L95)

Agent role

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`role`](#role-1)

##### sharedState

```ts
protected sharedState: Record<string, unknown> = {};
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L102)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`sharedState`](#sharedstate-1)

##### stateMachine

```ts
protected readonly stateMachine: AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L97)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`stateMachine`](#statemachine-1)

##### systemPrompt

```ts
protected readonly systemPrompt: string | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L104)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`systemPrompt`](#systemprompt-1)

##### temperature

```ts
protected readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L105)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`temperature`](#temperature-1)

#### Accessors

##### state

###### Get Signature

```ts
get state(): AgentState;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L177)

Current state

###### Returns

[`AgentState`](core.md#agentstate)

Current state

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`state`](#state-2)

#### Methods

##### addContextItem()

```ts
protected addContextItem(
   content,
   priority?,
category?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:345](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L345)

###### Parameters

###### content

`string`

###### priority?

`20` \| `60` \| `80` \| `100` \| `40`

###### category?

`"system"` \| `"task"` \| `"active"`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addContextItem`](#addcontextitem-1)

##### addToHistory()

```ts
protected addToHistory(message): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L332)

###### Parameters

###### message

[`Message`](core.md#message-11)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`addToHistory`](#addtohistory-1)

##### buildPrompt()

```ts
protected buildPrompt(task): Message[];
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L89)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

[`Message`](core.md#message-11)[]

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`buildPrompt`](#buildprompt-1)

##### cleanup()

```ts
cleanup(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L277)

Cleanup agent resources.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`cleanup`](#cleanup-1)

##### clearHistory()

```ts
protected clearHistory(): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:338](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L338)

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`clearHistory`](#clearhistory-1)

##### complete()

```ts
protected complete(request): Promise<Result<CompletionResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L304)

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`AgentError`](core.md#agenterror)\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`complete`](#complete-1)

##### execute()

```ts
execute(task, options?): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L219)

Execute a task.

###### Parameters

###### task

[`Task`](core.md#task)

Task to execute

###### options?

Optional execution options (#3016/#3040).
`signal` cancels the in-flight model call when the caller's deadline
wins a race; without it, the SDK keeps running to its own 10-minute
timeout after the caller has already discarded the result.

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

Result with TaskResult or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`execute`](#execute-1)

##### executeTask()

```ts
protected executeTask(task): Promise<Result<TaskResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L71)

###### Parameters

###### task

[`Task`](core.md#task)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TaskResult`](core.md#taskresult), [`AgentError`](core.md#agenterror)\>\>

###### Overrides

[`BaseAgent`](#abstract-baseagent).[`executeTask`](#executetask-1)

##### findResolutionForError()

```ts
protected findResolutionForError(errorMessage): ErrorResolution | undefined;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L394)

###### Parameters

###### errorMessage

`string`

###### Returns

`ErrorResolution` \| `undefined`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`findResolutionForError`](#findresolutionforerror-1)

##### flushMemory()

```ts
flushMemory(): Promise<Result<void, AgentMemoryError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L372)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, `AgentMemoryError`\>\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`flushMemory`](#flushmemory-1)

##### getExpertOptions()

```ts
getExpertOptions(): Readonly<TestingExpertOptions>;
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L105)

###### Returns

`Readonly`\<[`TestingExpertOptions`](#testingexpertoptions)\>

##### getHistory()

```ts
protected getHistory(): Message[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L335)

###### Returns

[`Message`](core.md#message-11)[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getHistory`](#gethistory-1)

##### getMemoryState()

```ts
getMemoryState(): Readonly<AgentMemoryState> | null;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L365)

###### Returns

`Readonly`\<`AgentMemoryState`\> \| `null`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getMemoryState`](#getmemorystate-1)

##### getPruningMetrics()

```ts
getPruningMetrics(): Readonly<ContextPruningMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:341](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L341)

###### Returns

`Readonly`\<`ContextPruningMetrics`\>

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getPruningMetrics`](#getpruningmetrics-1)

##### getRelevantMemories()

```ts
getRelevantMemories(): readonly TypedMemoryEntry<MemoryType>[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L368)

###### Returns

readonly `TypedMemoryEntry`\<`MemoryType`\>[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getRelevantMemories`](#getrelevantmemories-1)

##### getTaskLearnings()

```ts
protected getTaskLearnings(taskType): readonly TaskLearning[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:397](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L397)

###### Parameters

###### taskType

`string`

###### Returns

readonly `TaskLearning`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTaskLearnings`](#gettasklearnings-1)

##### getTopExecutionPatterns()

```ts
protected getTopExecutionPatterns(limit?): readonly ExecutionPattern[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:400](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L400)

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly `ExecutionPattern`[]

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`getTopExecutionPatterns`](#gettopexecutionpatterns-1)

##### handleMessage()

```ts
handleMessage(msg): Promise<Result<AgentResponse, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L262)

Handle an inter-agent message and return a response.

**Delivery semantics (#3222).** This is a _direct, awaited request/response_
call: the caller invokes it and holds the returned promise. It is NOT a
queued or broadcast channel — that is the collaboration event bus
(`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
own semantics. For this method specifically:

- **Ordering** is the caller's responsibility. Sequential `await`s are
  handled in call order; concurrent calls carry no cross-message ordering
  guarantee.
- **Delivery** is exactly the method invocation — there is **no automatic
  retry or redelivery**. A returned `err(...)` is the caller's signal to
  decide whether to retry; the agent does not re-queue the message.
- **Errors** surface as `Result.err`, not as a throw for expected
  conditions; the caller branches on the `Result`.

###### Parameters

###### msg

[`AgentMessage`](core.md#agentmessage)

Message to handle

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentResponse`](core.md#agentresponse), [`AgentError`](core.md#agenterror)\>\>

Result with AgentResponse, or AgentError on failure (not retried)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`handleMessage`](#handlemessage-1)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L293)

###### Parameters

###### capability

[`AgentCapability`](core.md#agentcapability)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`hasCapability`](#hascapability-1)

##### initialize()

```ts
initialize(ctx): Promise<Result<void, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L206)

Initialize the agent with context.

###### Parameters

###### ctx

`AgentContext`

Agent context

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`AgentError`](core.md#agenterror)\>\>

Result with void or AgentError

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`initialize`](#initialize-1)

##### isContextPruningEnabled()

```ts
isContextPruningEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L359)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isContextPruningEnabled`](#iscontextpruningenabled-1)

##### isMemoryEnabled()

```ts
isMemoryEnabled(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L362)

###### Returns

`boolean`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`isMemoryEnabled`](#ismemoryenabled-1)

##### recordLearning()

```ts
protected recordLearning(learning): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L385)

###### Parameters

###### learning

`Omit`\<`TaskLearning`, `"id"` \| `"learnedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordLearning`](#recordlearning-1)

##### recordPattern()

```ts
protected recordPattern(p): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L388)

###### Parameters

###### p

`Omit`\<`ExecutionPattern`, `"id"` \| `"lastSeen"` \| `"occurrences"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordPattern`](#recordpattern-1)

##### recordResolution()

```ts
protected recordResolution(r): void;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L391)

###### Parameters

###### r

`Omit`\<`ErrorResolution`, `"resolvedAt"`\>

###### Returns

`void`

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`recordResolution`](#recordresolution-1)

##### transformError()

```ts
protected transformError(error, taskId): AgentError;
```

Defined in: [packages/nexus-agents/src/agents/base-agent.ts:300](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent.ts#L300)

###### Parameters

###### error

`unknown`

###### taskId

`string`

###### Returns

[`AgentError`](core.md#agenterror)

###### Inherited from

[`BaseAgent`](#abstract-baseagent).[`transformError`](#transformerror-1)

---

### TrinityCoordinator

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts#L60)

Coordinates Thinker, Worker, and Verifier roles for task execution.

#### Constructors

##### Constructor

```ts
new TrinityCoordinator(options?): TrinityCoordinator;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts#L67)

###### Parameters

###### options?

[`TrinityConfig`](#trinityconfig) \| `TrinityCoordinatorOptions`

###### Returns

[`TrinityCoordinator`](#trinitycoordinator)

#### Methods

##### cancel()

```ts
cancel(reason): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts#L86)

###### Parameters

###### reason

`string`

###### Returns

`void`

##### execute()

```ts
execute(options): Promise<Result<TrinityResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts#L91)

###### Parameters

###### options

[`TrinityExecuteOptions`](#trinityexecuteoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TrinityResult`](#trinityresult), [`AgentError`](core.md#agenterror)\>\>

---

### WaveScheduler

Defined in: [packages/nexus-agents/src/agents/wave-scheduler.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler.ts#L60)

Wave scheduler for bounded parallel task execution.

Executes tasks in waves respecting concurrency limits, dependency order,
output budgets, and token budgets. Each wave waits for all tasks to
complete before the next wave launches.

#### Example

```typescript
const scheduler = createWaveScheduler({ maxConcurrency: 3 });
const result = await scheduler.execute(tasks, async (task) => {
  return await runAgent(task.input);
});
console.log(`Completed in ${result.waves.length} waves`);
```

#### Constructors

##### Constructor

```ts
new WaveScheduler(config?, logger?): WaveScheduler;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler.ts#L64)

###### Parameters

###### config?

`Partial`\<[`WaveSchedulerConfig`](#waveschedulerconfig)\> = `{}`

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`WaveScheduler`](#wavescheduler)

#### Methods

##### buildWaves()

```ts
buildWaves<T>(tasks): WaveTask<T>[][];
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler.ts#L116)

Build waves from tasks respecting dependency ordering.

Tasks with no unresolved dependencies go in the earliest possible wave.
Within each wave, tasks are further split into sub-waves of maxConcurrency size.

###### Type Parameters

###### T

`T`

###### Parameters

###### tasks

readonly [`WaveTask`](#wavetask)\<`T`\>[]

###### Returns

[`WaveTask`](#wavetask)\<`T`\>[][]

##### execute()

```ts
execute<T>(tasks, executor): Promise<WaveExecutionResult>;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler.ts#L72)

Execute tasks in waves respecting dependencies and concurrency limits.

###### Type Parameters

###### T

`T`

###### Parameters

###### tasks

readonly [`WaveTask`](#wavetask)\<`T`\>[]

###### executor

[`WaveTaskExecutor`](#wavetaskexecutor)\<`T`\>

###### Returns

`Promise`\<[`WaveExecutionResult`](#waveexecutionresult)\>

##### getConfig()

```ts
getConfig(): Readonly<WaveSchedulerConfig>;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler.ts#L157)

Get the scheduler configuration.

###### Returns

`Readonly`\<[`WaveSchedulerConfig`](#waveschedulerconfig)\>

## Interfaces

### ActivationOptions

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L190)

Options for sparse activation selection.

#### Properties

##### ensureTreeCoverage

```ts
readonly ensureTreeCoverage: boolean;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L198)

Ensure at least one node per active tree

##### maxActive

```ts
readonly maxActive: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L192)

Maximum nodes to activate

##### minScore

```ts
readonly minScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L196)

Minimum score to consider for activation

##### strategy

```ts
readonly strategy: ActivationStrategy;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L194)

Strategy for selection

---

### AgenticAdapterOptions

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L61)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Properties

##### forceProfile?

```ts
readonly optional forceProfile?: ModelEntry;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L86)

Force a specific behaviour profile, bypassing identity-driven
lookup entirely. Reserved for tests + diagnostic runs; in
production prefer `modelHints` so identity stays auditable.

##### maxConcurrent?

```ts
readonly optional maxConcurrent?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L67)

Maximum number of concurrent model API calls across all in-flight
`runAgent()` calls. Default unlimited. Set this when the upstream
provider rate-limits aggressively.

##### modelHints?

```ts
readonly optional modelHints?: ModelHints;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L74)

Per-model identity overrides — gateway-renamed models, custom
deployments, or anything the modelId-string parser can't classify.
Each field is optional; provided fields force, others fall through
to probe / parse.

##### registry?

```ts
readonly optional registry?: ModelRegistry;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L92)

Override the registry used for `getEntry` lookups. Defaults to
the lazy global registry. Tests and multi-tenant deployments
inject their own.

##### skipProbe?

```ts
readonly optional skipProbe?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/agentic/agentic-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/agentic-adapter.ts#L80)

Skip the `IModelAdapter.listModels()` probe at first `runAgent`.
Useful when the gateway doesn't expose `/v1/models` or when
deterministic startup matters more than identity fidelity.

---

### AgenticToolCall

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L23)

Tool call emitted by the model.

Mirrors the Anthropic Messages API `tool_use` ContentBlock shape;
the wrapper translates whatever the underlying provider produces
into this canonical form so harnesses don't care which provider
they're talking to.

#### Properties

##### arguments

```ts
readonly arguments: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L29)

Arguments — already JSON-parsed; provider-side is responsible for parsing.

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L25)

Unique id for this tool call, threaded back through `tool_use_id`.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L27)

Tool name (must match a `ToolDefinition.name` from the input).

---

### AgenticToolResult

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L41)

Result of a tool call, returned by the harness's `onToolCall`.

`content` is whatever string representation of the result the model
should see next turn. Convention: stringify objects, prefer one-line
for primitives. `isError` tells the model the call failed (Anthropic
surfaces this as `is_error: true` in the next turn's `tool_result`
block; other providers handle similarly).

#### Properties

##### content

```ts
readonly content: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L42)

##### isError?

```ts
readonly optional isError?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L43)

---

### AgentRunResult

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L81)

Final result of a successful `runAgent` call.

`stopReason: 'agent-stopped' | 'turn-budget' | 'tool-error' | 'cancelled'`
is reported via the result, NOT via `Result.err` — partial-progress
runs are gradable, and the harness inspects `turns` to decide.

#### Properties

##### adapterStrategy

```ts
readonly adapterStrategy: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L104)

Strategy used to drive the loop. `native:<providerId>` when the
underlying adapter is a known provider whose tool-use API is being
threaded through; `wrapper` for unknown providers / custom adapters
where the loop relies only on the IModelAdapter contract surface.

Eval harnesses record this so cross-provider runs are auditable.

##### finalContent

```ts
readonly finalContent: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L110)

The model's final assistant content (the response after the last
tool result, when the model emits no further tool call). Empty
string when the loop ended on `turn-budget` or `cancelled`.

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L95)

Model-id stamp from the underlying `IModelAdapter`.

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L93)

Provider-id stamp from the underlying `IModelAdapter` — operators
read this when comparing eval results across providers, since
tool-use fidelity is provider-dependent.

##### stopReason

```ts
readonly stopReason: AgentStopReason;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L83)

##### totalInputTokens?

```ts
readonly optional totalInputTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L86)

Aggregated token usage across all turns (sum of per-turn inputs/outputs).

##### totalOutputTokens?

```ts
readonly optional totalOutputTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L87)

##### turns

```ts
readonly turns: readonly AgentTurn[];
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L84)

##### turnsUsed

```ts
readonly turnsUsed: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L82)

---

### AgentTurn

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L50)

One turn of the agent loop — model emits a tool call, harness
resolves it, harness records the trace.

#### Properties

##### inputTokens?

```ts
readonly optional inputTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L59)

Provider-reported input tokens for this turn's API call (when available).

##### modelLatencyMs

```ts
readonly modelLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L55)

Wall-clock time spent in the model API call that produced the tool call.

##### outputTokens?

```ts
readonly optional outputTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L61)

Provider-reported output tokens for this turn's API call (when available).

##### toolCall

```ts
readonly toolCall: AgenticToolCall;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L52)

##### toolLatencyMs

```ts
readonly toolLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L57)

Wall-clock time spent waiting for `onToolCall` to resolve.

##### toolResult

```ts
readonly toolResult: AgenticToolResult;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L53)

##### turnIndex

```ts
readonly turnIndex: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L51)

---

### AggregatedResult

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:228](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L228)

Aggregated result from multiple experts.

#### Properties

##### conflicts

```ts
conflicts: ResultConflict[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:232](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L232)

##### metadata

```ts
metadata: AggregationMetadata;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:233](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L233)

##### output

```ts
output: unknown;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L229)

##### qualityScore

```ts
qualityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L231)

##### strategy

```ts
strategy: 'consensus' | 'merge' | 'select_best' | 'sequential_chain';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L230)

---

### AggregationMetadata

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:251](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L251)

Metadata about the aggregation process.

#### Properties

##### aggregatedAt

```ts
aggregatedAt: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L256)

##### averageConfidence

```ts
averageConfidence: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L254)

##### conflictCount

```ts
conflictCount: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L253)

##### resultCount

```ts
resultCount: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:252](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L252)

##### totalTokensUsed

```ts
totalTokensUsed: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:255](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L255)

---

### AggregatorInput

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L48)

Input for aggregation.

#### Properties

##### pattern

```ts
pattern: CollaborationPattern;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L49)

##### results

```ts
results: ExpertResult[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L50)

##### reviews?

```ts
optional reviews?: ReviewResponseMessage[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L52)

##### votes?

```ts
optional votes?: VoteMessage[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L51)

---

### AggregatorOptions

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L45)

Options for result aggregation.

#### Properties

##### conflictResolver?

```ts
optional conflictResolver?: ConflictResolver;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L47)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L46)

##### minQualityScore?

```ts
optional minQualityScore?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L49)

##### qualityScorer?

```ts
optional qualityScorer?: QualityScorer;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L48)

---

### ApiDocumentation

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L37)

API documentation structure.

#### Properties

##### endpoints

```ts
endpoints: ApiEndpoint[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L39)

API endpoints or functions

##### types

```ts
types: ApiType[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L41)

Data types

---

### ApiEndpoint

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L47)

API endpoint documentation.

#### Properties

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L51)

Description

##### example?

```ts
optional example?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L62)

Example usage

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L49)

Endpoint name

##### parameters

```ts
parameters: {
  description: string;
  name: string;
  required: boolean;
  type: string;
}
[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L53)

Parameters

###### description

```ts
description: string;
```

###### name

```ts
name: string;
```

###### required

```ts
required: boolean;
```

###### type

```ts
type: string;
```

##### returns

```ts
returns: {
  description: string;
  type: string;
}
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L60)

Return type

###### description

```ts
description: string;
```

###### type

```ts
type: string;
```

---

### ApiType

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L68)

API type documentation.

#### Properties

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L72)

Description

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L70)

Type name

##### properties

```ts
properties: {
  description: string;
  name: string;
  optional: boolean;
  type: string;
}
[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L74)

Properties

###### description

```ts
description: string;
```

###### name

```ts
name: string;
```

###### optional

```ts
optional: boolean;
```

###### type

```ts
type: string;
```

---

### ArchitectureAnalysisResult

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L105)

Architecture analysis result from ArchitectureExpert.

#### Extends

- [`ExpertOutput`](#expertoutput)

#### Properties

##### analysisType

```ts
analysisType: 'design' | 'review' | 'pattern_selection';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L107)

Analysis type

##### components?

```ts
optional components?: SystemComponent[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L113)

System components

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L42)

Confidence score (0-1)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`confidence`](#confidence-6)

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L34)

Primary result content

###### Inherited from

[`ExpertOutput`](#expertoutput).[`content`](#content-7)

##### decisions?

```ts
optional decisions?: ArchitectureDecision[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L111)

Design decisions

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L44)

Model used for this expert's execution (Issue #817)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`modelUsed`](#modelused-3)

##### patterns?

```ts
optional patterns?: ArchitecturePattern[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L109)

Identified patterns

##### recommendations?

```ts
optional recommendations?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L38)

Recommendations or suggestions

###### Inherited from

[`ExpertOutput`](#expertoutput).[`recommendations`](#recommendations-3)

##### structuredData?

```ts
optional structuredData?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L36)

Structured data if applicable

###### Inherited from

[`ExpertOutput`](#expertoutput).[`structuredData`](#structureddata-3)

##### warnings?

```ts
optional warnings?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L40)

Warnings or issues found

###### Inherited from

[`ExpertOutput`](#expertoutput).[`warnings`](#warnings-3)

---

### ArchitectureDecision

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L133)

Architecture decision record.

#### Properties

##### consequences

```ts
consequences: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L143)

Consequences

##### context

```ts
context: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L139)

Context

##### decision

```ts
decision: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L141)

Decision made

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L135)

Decision ID

##### status

```ts
status: 'superseded' | 'deprecated' | 'accepted' | 'proposed';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L145)

Status

##### title

```ts
title: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L137)

Decision title

---

### ArchitectureExpertOptions

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L38)

Configuration options for ArchitectureExpert.

#### Extends

- [`ExpertOptions`](#expertoptions)

#### Properties

##### additionalCapabilities?

```ts
optional additionalCapabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L26)

Custom capability extensions

###### Inherited from

[`ExpertOptions`](#expertoptions).[`additionalCapabilities`](#additionalcapabilities-4)

##### enableHeuristics?

```ts
optional enableHeuristics?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L24)

Enable domain-specific heuristics

###### Inherited from

[`ExpertOptions`](#expertoptions).[`enableHeuristics`](#enableheuristics-3)

##### generateADRs?

```ts
optional generateADRs?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L42)

Generate ADRs automatically

##### includeC4Suggestions?

```ts
optional includeC4Suggestions?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L44)

Include C4 diagram suggestions

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L22)

Maximum tokens for responses

###### Inherited from

[`ExpertOptions`](#expertoptions).[`maxTokens`](#maxtokens-14)

##### preferredStyles?

```ts
optional preferredStyles?: ArchitectureStyle[];
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L40)

Preferred architecture styles

##### qualityPriorities?

```ts
optional qualityPriorities?: QualityAttribute[];
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L46)

Quality attributes to prioritize

##### systemPromptOverride?

```ts
optional systemPromptOverride?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L18)

Custom system prompt override

###### Inherited from

[`ExpertOptions`](#expertoptions).[`systemPromptOverride`](#systempromptoverride-3)

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L20)

Temperature for completions (domain-specific default if not set)

###### Inherited from

[`ExpertOptions`](#expertoptions).[`temperature`](#temperature-13)

---

### ArchitecturePattern

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L119)

Architecture pattern identification.

#### Properties

##### applicability

```ts
applicability: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L125)

Applicability score (0-1)

##### category

```ts
category: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L123)

Pattern category

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L121)

Pattern name

##### tradeoffs

```ts
tradeoffs: {
  cons: string[];
  pros: string[];
};
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L127)

Trade-offs

###### cons

```ts
cons: string[];
```

###### pros

```ts
pros: string[];
```

---

### BaseAgentOptions

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L17)

Options for creating a BaseAgent.

#### Properties

##### adapter?

```ts
optional adapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L25)

Model adapter for LLM interactions

##### capabilities

```ts
capabilities: readonly AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L23)

Agent capabilities

##### contextPruning?

```ts
optional contextPruning?: ContextPrunerAgentConfig;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L43)

Configuration for automatic context pruning (Issue #306)

##### emitMessageEvents?

```ts
optional emitMessageEvents?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L37)

Whether to emit events for message handling (default: true)

##### eventBus?

```ts
optional eventBus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L35)

Event bus for message observability (uses global bus if not provided)

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L19)

Unique agent identifier

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L27)

Custom logger instance

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L33)

Maximum tokens for responses

##### memory?

```ts
optional memory?: AgentMemoryConfig;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L45)

Configuration for memory backend integration (Issue #348)

##### role

```ts
role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L21)

Agent role

##### stateMachineOptions?

```ts
optional stateMachineOptions?: StateMachineOptions;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L39)

State machine options for validated state transitions

##### systemPrompt?

```ts
optional systemPrompt?: string;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L29)

System prompt for the agent

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L31)

Default temperature for completions

##### tokenBudget?

```ts
optional tokenBudget?: TokenBudgetConfig;
```

Defined in: [packages/nexus-agents/src/agents/base-agent-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/base-agent-types.ts#L41)

Token budget configuration for EMA-based tracking (Issue #304)

---

### BestSolution

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L55)

The best solution found by the forest.

#### Properties

##### combinedScore

```ts
readonly combinedScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L67)

Combined score

##### conclusionNode

```ts
readonly conclusionNode: ReasoningNode;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L61)

Solution node

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L63)

Overall confidence

##### path

```ts
readonly path: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L59)

Path to the solution

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L65)

Overall quality score

##### treeId

```ts
readonly treeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L57)

Tree that produced the solution

---

### CodeAnalysisResult

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L33)

Code analysis result from CodeExpert.

#### Extends

- [`ExpertOutput`](#expertoutput)

#### Properties

##### affectedFiles?

```ts
optional affectedFiles?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L37)

Files affected

##### codeChanges?

```ts
optional codeChanges?: CodeChange[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L39)

Code changes or suggestions

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L42)

Confidence score (0-1)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`confidence`](#confidence-6)

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L34)

Primary result content

###### Inherited from

[`ExpertOutput`](#expertoutput).[`content`](#content-7)

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L44)

Model used for this expert's execution (Issue #817)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`modelUsed`](#modelused-3)

##### operationType

```ts
operationType: 'debugging' | 'optimization' | 'refactoring' | 'generation';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L35)

Type of code operation performed

##### recommendations?

```ts
optional recommendations?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L38)

Recommendations or suggestions

###### Inherited from

[`ExpertOutput`](#expertoutput).[`recommendations`](#recommendations-3)

##### structuredData?

```ts
optional structuredData?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L36)

Structured data if applicable

###### Inherited from

[`ExpertOutput`](#expertoutput).[`structuredData`](#structureddata-3)

##### warnings?

```ts
optional warnings?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L40)

Warnings or issues found

###### Inherited from

[`ExpertOutput`](#expertoutput).[`warnings`](#warnings-3)

---

### CodeChange

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L45)

Represents a single code change.

#### Properties

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L55)

Description of change

##### file

```ts
file: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L47)

File path

##### lineRange?

```ts
optional lineRange?: {
  end: number;
  start: number;
};
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L49)

Line number or range

###### end

```ts
end: number;
```

###### start

```ts
start: number;
```

##### modified

```ts
modified: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L53)

Modified code

##### original?

```ts
optional original?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L51)

Original code

---

### CodeExpertOptions

Defined in: [packages/nexus-agents/src/agents/experts/code-expert-helpers.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert-helpers.ts#L15)

Configuration options for CodeExpert.

#### Extends

- [`ExpertOptions`](#expertoptions)

#### Properties

##### additionalCapabilities?

```ts
optional additionalCapabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L26)

Custom capability extensions

###### Inherited from

[`ExpertOptions`](#expertoptions).[`additionalCapabilities`](#additionalcapabilities-4)

##### codeStyle?

```ts
optional codeStyle?: "mixed" | "functional" | "object-oriented";
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert-helpers.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert-helpers.ts#L19)

Preferred code style (if applicable)

##### enableHeuristics?

```ts
optional enableHeuristics?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L24)

Enable domain-specific heuristics

###### Inherited from

[`ExpertOptions`](#expertoptions).[`enableHeuristics`](#enableheuristics-3)

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L22)

Maximum tokens for responses

###### Inherited from

[`ExpertOptions`](#expertoptions).[`maxTokens`](#maxtokens-14)

##### strictTypes?

```ts
optional strictTypes?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert-helpers.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert-helpers.ts#L17)

Enable strict type checking recommendations

##### systemPromptOverride?

```ts
optional systemPromptOverride?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L18)

Custom system prompt override

###### Inherited from

[`ExpertOptions`](#expertoptions).[`systemPromptOverride`](#systempromptoverride-3)

##### targetLanguage?

```ts
optional targetLanguage?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert-helpers.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert-helpers.ts#L21)

Target language for code generation

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L20)

Temperature for completions (domain-specific default if not set)

###### Inherited from

[`ExpertOptions`](#expertoptions).[`temperature`](#temperature-13)

---

### CollaborationConfig

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L67)

Configuration for a collaboration session.

#### Properties

##### experts

```ts
experts: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L70)

##### maxRetries?

```ts
optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L75)

##### minVotes?

```ts
optional minVotes?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L73)

##### pattern

```ts
pattern: CollaborationPattern;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L69)

##### requireUnanimous?

```ts
optional requireUnanimous?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L74)

##### sessionId

```ts
sessionId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L68)

##### task

```ts
task: Task;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L71)

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L72)

---

### CollaborationResult

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L202)

Final collaboration result.

#### Properties

##### aggregatedResult

```ts
aggregatedResult: AggregatedResult;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L205)

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L207)

##### error?

```ts
optional error?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L209)

##### expertResults

```ts
expertResults: ExpertResultSummary[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L206)

##### pattern

```ts
pattern: CollaborationPattern;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L204)

##### sessionId

```ts
sessionId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L203)

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:208](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L208)

---

### CollaborationSessionOptions

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts#L19)

Options for creating a CollaborationSession.

#### Properties

##### eventBus?

```ts
optional eventBus?: IEventBus;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts#L25)

Optional event bus for cross-session event publishing

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts#L20)

##### onMessage?

```ts
optional onMessage?: (message) => void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts#L22)

###### Parameters

###### message

[`CollaborationMessage`](#collaborationmessage)

###### Returns

`void`

##### onStatusChange?

```ts
optional onStatusChange?: (status) => void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts#L21)

###### Parameters

###### status

[`SessionStatus`](#sessionstatus)

###### Returns

`void`

##### roleResolver?

```ts
optional roleResolver?: (expertId) => AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts#L23)

###### Parameters

###### expertId

`string`

###### Returns

[`AgentRole`](core.md#agentrole)

---

### ComplianceStatus

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L93)

Compliance check status.

#### Properties

##### findings

```ts
findings: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L99)

Specific findings

##### framework

```ts
framework: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L95)

Compliance framework

##### status

```ts
status: 'partial' | 'compliant' | 'non-compliant';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L97)

Overall status

---

### Conflict

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L160)

Conflict between results.

#### Properties

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L166)

Description of the conflict

##### resolution

```ts
resolution: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L168)

How the conflict was resolved

##### subtaskId1

```ts
subtaskId1: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L162)

First subtask ID

##### subtaskId2

```ts
subtaskId2: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L164)

Second subtask ID

---

### ContextBudget

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L32)

Budget allocation for context categories.
Based on PROJECT_PLAN.md recommendations.

#### Properties

##### active

```ts
active: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L38)

Active working content (default: 50%)

##### reserved

```ts
reserved: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L40)

Reserved for response generation (default: 15%)

##### system

```ts
system: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L34)

System instructions and project context (default: 15%)

##### task

```ts
task: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L36)

Current task description and requirements (default: 20%)

---

### ContextItem

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L70)

A piece of content in the context with its metadata.

#### Properties

##### addedAt

```ts
addedAt: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L82)

When this item was added

##### category

```ts
category: 'system' | 'task' | 'active';
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L78)

Budget category this item belongs to

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L74)

The content (message, text, etc.)

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L72)

Unique identifier for this item

##### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L84)

Optional metadata

##### priority

```ts
priority: ContentPriority;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L76)

Priority level for retention

##### tokenCount

```ts
tokenCount: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L80)

Token count for this item

---

### ContextManagerConfig

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L95)

Configuration for ContextManager.

#### Properties

##### adapter?

```ts
optional adapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L101)

Model adapter for token counting

##### budget?

```ts
optional budget?: ContextBudget;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L99)

Budget allocation (defaults to DEFAULT_BUDGET)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L103)

Custom logger

##### maxTokens

```ts
maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L97)

Maximum context window size in tokens

##### warningThreshold?

```ts
optional warningThreshold?: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L105)

Warning threshold (0-1) - warn when this % of budget is used

---

### ContextPrunerConfig

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L54)

Configuration for ContextPruner.

#### Properties

##### adapter?

```ts
optional adapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L56)

##### autoTriggerThreshold?

```ts
optional autoTriggerThreshold?: number;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L61)

##### contextManager

```ts
contextManager: ContextManager;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L55)

##### defaultStrategy?

```ts
optional defaultStrategy?: PruningStrategy;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L58)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L57)

##### minItemsPerCategory?

```ts
optional minItemsPerCategory?: number;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L59)

##### protectedPriority?

```ts
optional protectedPriority?: ContentPriority;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L60)

---

### ContextStats

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L120)

Statistics about context usage.

#### Properties

##### availableTokens

```ts
availableTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L128)

Available tokens (total - reserved)

##### categoryTokens

```ts
categoryTokens: Record<ContextItemCategory, number>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L124)

Tokens used per category

##### isOverBudget

```ts
isOverBudget: boolean;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L130)

Whether any category is over budget

##### itemCounts

```ts
itemCounts: Record<ContextItemCategory, number>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L126)

Number of items per category

##### overBudgetCategories

```ts
overBudgetCategories: ("system" | "task" | "active")[];
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L132)

Categories that are over budget

##### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L122)

Total tokens currently used

##### usagePercentage

```ts
usagePercentage: number;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L134)

Percentage of total capacity used

---

### CoverageMetrics

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L195)

Code coverage metrics.

#### Properties

##### branch

```ts
branch: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L199)

Branch coverage percentage

##### function

```ts
function: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L201)

Function coverage percentage

##### line

```ts
line: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L197)

Line coverage percentage

##### statement

```ts
statement: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L203)

Statement coverage percentage

##### uncoveredAreas?

```ts
optional uncoveredAreas?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L205)

Uncovered areas

---

### CreateExpertOptions

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L43)

Options for creating an expert.
(Source: Issue #476 - Wire context pruning to ExpertFactory)

#### Properties

##### adapter?

```ts
optional adapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L45)

Model adapter to use

##### additionalCapabilities?

```ts
optional additionalCapabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L49)

Additional capabilities to add

##### contextPruning?

```ts
optional contextPruning?: ContextPrunerAgentConfig;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L55)

Context pruning configuration (Issue #476).
Enables automatic memory management for long-running conversations.
Since Issue #479, context pruning is enabled by default.

##### modelOverrides?

```ts
optional modelOverrides?: Partial<ModelPreference>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L47)

Override model preferences from config

---

### CreateForestInput

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L167)

Input for creating a new forest.

#### Properties

##### config?

```ts
readonly optional config?: Partial<ForestConfig>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L171)

Initial configuration

##### initialHypotheses?

```ts
readonly optional initialHypotheses?: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L173)

Initial tree hypotheses to explore

##### problem

```ts
readonly problem: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L169)

Problem to solve

---

### CreateNodeInput

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L181)

Input for creating a new reasoning node.

#### Properties

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L191)

Initial confidence (0-1)

##### content

```ts
readonly content: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L189)

Content of the reasoning step

##### metadata?

```ts
readonly optional metadata?: Partial<ReasoningNodeMetadata>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L193)

Optional metadata

##### parentId

```ts
readonly parentId: string | null;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L183)

Parent node ID (null for root)

##### stepType

```ts
readonly stepType: ReasoningStepType;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L187)

Type of reasoning step

##### treeId

```ts
readonly treeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L185)

Tree ID this node belongs to

---

### CreateTreeInput

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L221)

Input for creating a new reasoning tree.

#### Properties

##### explorationPriority?

```ts
readonly optional explorationPriority?: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:227](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L227)

Initial exploration priority

##### forestId

```ts
readonly forestId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L223)

Forest ID this tree belongs to

##### hypothesis

```ts
readonly hypothesis: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L225)

Tree hypothesis or approach

---

### CrossTreeInfo

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L107)

Information shared across trees for cross-pollination.

#### Properties

##### failurePatterns

```ts
readonly failurePatterns: readonly FailurePattern[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L113)

Patterns that have been proven ineffective

##### sharedConclusions

```ts
readonly sharedConclusions: readonly SharedConclusion[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L109)

High-confidence conclusions found in other trees

##### sharedInsights

```ts
readonly sharedInsights: readonly SharedInsight[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L111)

Useful intermediate results from other trees

---

### DocumentationExpertOptions

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L36)

Configuration options for DocumentationExpert.

#### Extends

- [`ExpertOptions`](#expertoptions)

#### Properties

##### additionalCapabilities?

```ts
optional additionalCapabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L26)

Custom capability extensions

###### Inherited from

[`ExpertOptions`](#expertoptions).[`additionalCapabilities`](#additionalcapabilities-4)

##### audienceLevel?

```ts
optional audienceLevel?: "advanced" | "beginner" | "intermediate";
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L42)

Target audience level

##### enableHeuristics?

```ts
optional enableHeuristics?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L24)

Enable domain-specific heuristics

###### Inherited from

[`ExpertOptions`](#expertoptions).[`enableHeuristics`](#enableheuristics-3)

##### format?

```ts
optional format?: "markdown" | "jsdoc" | "tsdoc" | "rst";
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L38)

Documentation format

##### generateTOC?

```ts
optional generateTOC?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L44)

Generate table of contents

##### includeBadges?

```ts
optional includeBadges?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L46)

Include badges in README

##### includeExamples?

```ts
optional includeExamples?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L40)

Include code examples

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L22)

Maximum tokens for responses

###### Inherited from

[`ExpertOptions`](#expertoptions).[`maxTokens`](#maxtokens-14)

##### systemPromptOverride?

```ts
optional systemPromptOverride?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L18)

Custom system prompt override

###### Inherited from

[`ExpertOptions`](#expertoptions).[`systemPromptOverride`](#systempromptoverride-3)

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L20)

Temperature for completions (domain-specific default if not set)

###### Inherited from

[`ExpertOptions`](#expertoptions).[`temperature`](#temperature-13)

---

### DocumentationResult

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L13)

Documentation result from DocumentationExpert.

#### Extends

- [`ExpertOutput`](#expertoutput)

#### Properties

##### apiDocs?

```ts
optional apiDocs?: ApiDocumentation;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L19)

API documentation

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L42)

Confidence score (0-1)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`confidence`](#confidence-6)

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L34)

Primary result content

###### Inherited from

[`ExpertOutput`](#expertoutput).[`content`](#content-7)

##### documentationType

```ts
documentationType: 'readme' | 'api' | 'guide' | 'reference';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L15)

Documentation type

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L44)

Model used for this expert's execution (Issue #817)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`modelUsed`](#modelused-3)

##### recommendations?

```ts
optional recommendations?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L38)

Recommendations or suggestions

###### Inherited from

[`ExpertOutput`](#expertoutput).[`recommendations`](#recommendations-3)

##### sections?

```ts
optional sections?: DocumentationSection[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L17)

Generated documentation sections

##### structuredData?

```ts
optional structuredData?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L36)

Structured data if applicable

###### Inherited from

[`ExpertOutput`](#expertoutput).[`structuredData`](#structureddata-3)

##### warnings?

```ts
optional warnings?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L40)

Warnings or issues found

###### Inherited from

[`ExpertOutput`](#expertoutput).[`warnings`](#warnings-3)

---

### DocumentationSection

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L25)

Documentation section.

#### Properties

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L29)

Section content

##### subsections?

```ts
optional subsections?: DocumentationSection[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L31)

Subsections

##### title

```ts
title: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-documentation-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-documentation-types.ts#L27)

Section title

---

### ExecutionPlan

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L130)

Execution plan output structure.

The ExecutionPlan represents the Orchestrator's analysis and decomposition
of a task. It can optionally be converted to a WorkflowDefinition for
replayable, static execution via the WorkflowEngine.

ExecutionPlan extends ExecutionPlanData (the pure data) with the
asWorkflowDefinition conversion method.

#### See

ARCHITECTURE.md for the separation of concerns between Orchestrator and WorkflowEngine

#### Extends

- `ExecutionPlanData`

#### Properties

##### analysis

```ts
analysis: TaskAnalysis;
```

Defined in: [packages/nexus-agents/src/agents/plan-converter.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/plan-converter.ts#L27)

Analysis of the task complexity and requirements

###### Inherited from

```ts
ExecutionPlanData.analysis;
```

##### assignments

```ts
assignments: ExpertAssignment[];
```

Defined in: [packages/nexus-agents/src/agents/plan-converter.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/plan-converter.ts#L31)

Expert role assignments for each subtask

###### Inherited from

```ts
ExecutionPlanData.assignments;
```

##### estimatedDuration

```ts
estimatedDuration: number;
```

Defined in: [packages/nexus-agents/src/agents/plan-converter.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/plan-converter.ts#L35)

Estimated total duration in milliseconds

###### Inherited from

```ts
ExecutionPlanData.estimatedDuration;
```

##### parallelGroups

```ts
parallelGroups: string[][];
```

Defined in: [packages/nexus-agents/src/agents/plan-converter.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/plan-converter.ts#L33)

Groups of subtask IDs that can execute in parallel

###### Inherited from

```ts
ExecutionPlanData.parallelGroups;
```

##### subtasks

```ts
subtasks: SubTask[];
```

Defined in: [packages/nexus-agents/src/agents/plan-converter.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/plan-converter.ts#L29)

Decomposed subtasks (empty if task didn't need decomposition)

###### Inherited from

```ts
ExecutionPlanData.subtasks;
```

##### taskId

```ts
taskId: string;
```

Defined in: [packages/nexus-agents/src/agents/plan-converter.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/plan-converter.ts#L25)

The original task ID this plan was created for

###### Inherited from

```ts
ExecutionPlanData.taskId;
```

#### Methods

##### asWorkflowDefinition()

```ts
asWorkflowDefinition(options?): WorkflowDefinition;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L151)

Convert this execution plan to a reusable WorkflowDefinition.

This "crystallizes" the dynamic plan into a static, replayable workflow
that can be executed by WorkflowEngine.

###### Parameters

###### options?

`PlanConversionOptions`

Optional conversion configuration

###### Returns

[`WorkflowDefinition`](core.md#workflowdefinition)

A valid WorkflowDefinition

###### Example

```typescript
const result = await techLead.execute(task);
const plan = result.value.output as ExecutionPlan;
const workflow = plan.asWorkflowDefinition({
  name: 'my-workflow',
  version: '1.0.0',
});
await workflowEngine.execute(workflow, inputs);
```

---

### ExpertAssignment

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L96)

Expert assignment for a subtask.

#### Properties

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L104)

Confidence in the assignment (0-1)

##### expertRole

```ts
expertRole: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L100)

Assigned expert role

##### ictmConfig?

```ts
optional ictmConfig?: ICTMConfig;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L106)

ICTM configuration for dynamic sub-agent creation (Issue #756)

##### selectionReason

```ts
selectionReason: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L102)

Reason for selection

##### subtaskId

```ts
subtaskId: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L98)

Subtask ID

---

### ExpertConfig

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L46)

Configuration for creating a dynamic expert agent.

#### Properties

##### capabilities

```ts
capabilities: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L56)

List of capabilities this expert has

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L48)

Unique identifier for this expert

##### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L62)

Optional metadata for extensions

##### modelPreference?

```ts
optional modelPreference?: ModelPreference;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L58)

Optional model preferences

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L50)

Human-readable name

##### role

```ts
role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L52)

Role classification

##### systemPrompt

```ts
systemPrompt: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L54)

System prompt defining the expert's behavior

##### toolRestrictions?

```ts
optional toolRestrictions?: {
  allowedTools?: string[];
  deniedTools?: string[];
};
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L60)

Optional tool restrictions (allowlist/denylist per role)

###### allowedTools?

```ts
optional allowedTools?: string[];
```

Tools the expert is allowed to use (allowlist — exclusive).

###### deniedTools?

```ts
optional deniedTools?: string[];
```

Tools the expert is NOT allowed to use (denylist — additive).

---

### ExpertDefinition

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L38)

Definition of an expert's capabilities and metadata.

#### Properties

##### available

```ts
available: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L56)

Whether the expert is currently available

##### capabilities

```ts
capabilities: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L48)

Core capabilities

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L46)

Description of expert's specialty

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L40)

Unique expert identifier

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L44)

Human-readable name

##### primaryDomain

```ts
primaryDomain: ExpertTaskDomain;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L50)

Primary domain of expertise

##### role

```ts
role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L42)

Expert role type

##### secondaryDomains

```ts
secondaryDomains: ExpertTaskDomain[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L52)

Additional domains the expert can handle

##### weight

```ts
weight: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L54)

Base weight for scoring (0-1)

---

### ExpertMatch

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L85)

Match result for a single expert.

#### Properties

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L87)

Expert identifier

##### matchedCapabilities

```ts
matchedCapabilities: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L91)

Capabilities that matched the task

##### reasoning

```ts
reasoning: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L93)

Human-readable reasoning for the match

##### score

```ts
score: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L89)

Match score (0-1)

##### scoreBreakdown

```ts
scoreBreakdown: ScoreBreakdown;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L95)

Breakdown of score components

---

### ExpertOptions

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L16)

Expert-specific configuration options.

#### Extended by

- [`CodeExpertOptions`](#codeexpertoptions)
- [`SecurityExpertOptions`](#securityexpertoptions)
- [`ArchitectureExpertOptions`](#architectureexpertoptions)
- [`TestingExpertOptions`](#testingexpertoptions)
- [`DocumentationExpertOptions`](#documentationexpertoptions)

#### Properties

##### additionalCapabilities?

```ts
optional additionalCapabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L26)

Custom capability extensions

##### enableHeuristics?

```ts
optional enableHeuristics?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L24)

Enable domain-specific heuristics

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L22)

Maximum tokens for responses

##### systemPromptOverride?

```ts
optional systemPromptOverride?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L18)

Custom system prompt override

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L20)

Temperature for completions (domain-specific default if not set)

---

### ExpertOutput

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L32)

Output format for expert task results.

#### Extended by

- [`CodeAnalysisResult`](#codeanalysisresult)
- [`SecurityAnalysisResult`](#securityanalysisresult)
- [`ArchitectureAnalysisResult`](#architectureanalysisresult)
- [`TestingAnalysisResult`](#testinganalysisresult)
- [`DocumentationResult`](#documentationresult)

#### Properties

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L42)

Confidence score (0-1)

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L34)

Primary result content

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L44)

Model used for this expert's execution (Issue #817)

##### recommendations?

```ts
optional recommendations?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L38)

Recommendations or suggestions

##### structuredData?

```ts
optional structuredData?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L36)

Structured data if applicable

##### warnings?

```ts
optional warnings?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L40)

Warnings or issues found

---

### ExpertParticipation

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L81)

Expert participation record in a session.

#### Properties

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L82)

##### joinedAt

```ts
joinedAt: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L84)

##### retryCount

```ts
retryCount: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L87)

##### role

```ts
role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L83)

##### status

```ts
status: 'failed' | 'working' | 'pending' | 'submitted' | 'reviewing' | 'voted';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L85)

##### submittedAt?

```ts
optional submittedAt?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L86)

---

### ExpertRegisterOptions

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L28)

Options for registering an expert.

#### Properties

##### replace?

```ts
optional replace?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L30)

Whether to replace if expert with same ID exists

---

### ExpertResult

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L24)

Expert result with metadata.

#### Properties

##### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L27)

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L25)

##### order?

```ts
optional order?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L28)

##### result

```ts
result: TaskResult;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L26)

---

### ExpertResultSummary

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L215)

Summary of an expert's contribution.

#### Properties

##### contributionScore

```ts
contributionScore: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L219)

##### error?

```ts
optional error?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:222](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L222)

##### executionTimeMs

```ts
executionTimeMs: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L220)

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L216)

##### result?

```ts
optional result?: TaskResult;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:218](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L218)

##### role

```ts
role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L217)

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L221)

---

### ExplorationEvent

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L124)

An event in the exploration history for debugging/analysis.

#### Properties

##### details

```ts
readonly details: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L134)

Additional details

##### eventType

```ts
readonly eventType: ExplorationEventType;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L128)

Event type

##### nodeId?

```ts
readonly optional nodeId?: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L132)

Node ID involved

##### timestamp

```ts
readonly timestamp: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L126)

Timestamp

##### treeId?

```ts
readonly optional treeId?: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L130)

Tree ID involved

---

### FailurePattern

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L86)

A pattern that has been identified as ineffective.

#### Properties

##### avgFailureScore

```ts
readonly avgFailureScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L92)

Average quality score when this pattern appeared

##### occurrences

```ts
readonly occurrences: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L90)

Number of times this pattern failed

##### pattern

```ts
readonly pattern: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L88)

Pattern description

---

### FeedbackMessage

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L153)

General feedback message.

#### Properties

##### category?

```ts
optional category?: "improvement" | "concern" | "praise" | "question";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L158)

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L155)

##### feedback

```ts
feedback: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L157)

##### targetExpertId?

```ts
optional targetExpertId?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L156)

##### type

```ts
type: 'feedback';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L154)

---

### Forest

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L136)

A forest of reasoning trees with sparse activation.
Coordinates multiple parallel reasoning approaches.

#### Properties

##### activationBudget

```ts
readonly activationBudget: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L154)

Maximum number of active nodes (sparse activation budget)

##### activeTreeIds

```ts
readonly activeTreeIds: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L156)

Currently active tree IDs

##### bestPaths

```ts
readonly bestPaths: readonly PathScore[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L147)

Best paths across all trees

##### createdAt

```ts
readonly createdAt: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L159)

Creation timestamp

##### crossTreeInfo

```ts
readonly crossTreeInfo: CrossTreeInfo;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L149)

Cross-tree shared information

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L138)

Unique forest identifier

##### problem

```ts
readonly problem: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L140)

Problem being solved

##### state

```ts
readonly state: ForestState;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L145)

Current state of the forest

##### statistics

```ts
readonly statistics: ForestStatistics;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L151)

Forest-wide statistics

##### trees

```ts
readonly trees: ReadonlyMap<string, ReasoningTree>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L142)

All trees in the forest (id -> tree)

##### updatedAt

```ts
readonly updatedAt: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L161)

Last update timestamp

---

### ForestConfig

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L69)

Configuration for Forest-of-Thought reasoning.

#### Properties

##### activationBudget

```ts
readonly activationBudget: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L77)

Total activation budget (max active nodes across forest)

##### activationStrategy

```ts
readonly activationStrategy: ActivationStrategy;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L82)

Strategy for node activation

##### confidenceThreshold

```ts
readonly confidenceThreshold: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L93)

Confidence threshold for accepting conclusions

##### crossTreeStrategy

```ts
readonly crossTreeStrategy: CrossTreeStrategy;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L86)

Strategy for cross-tree information sharing

##### earlyTerminationThreshold

```ts
readonly earlyTerminationThreshold: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L95)

Score threshold for early termination

##### enableCrossTreeSharing

```ts
readonly enableCrossTreeSharing: boolean;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L111)

Enable cross-tree information sharing

##### enableEarlyTermination

```ts
readonly enableEarlyTermination: boolean;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L109)

Enable early termination when good solution found

##### enableParallelExploration

```ts
readonly enableParallelExploration: boolean;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L105)

Enable parallel tree exploration

##### explorationConstant

```ts
readonly explorationConstant: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L84)

UCB exploration constant (for ucb strategy)

##### maxDepth

```ts
readonly maxDepth: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L73)

Maximum depth per tree

##### maxExplorationTimeMs

```ts
readonly maxExplorationTimeMs: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L98)

Maximum exploration time in ms

##### maxNodesPerTree

```ts
readonly maxNodesPerTree: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L75)

Maximum nodes per tree

##### maxTokensPerTree

```ts
readonly maxTokensPerTree: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L102)

Maximum tokens per tree

##### maxTrees

```ts
readonly maxTrees: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L71)

Maximum number of trees in the forest

##### minScoreThreshold

```ts
readonly minScoreThreshold: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L91)

Minimum score threshold for keeping nodes

##### nodeTimeoutMs

```ts
readonly nodeTimeoutMs: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L100)

Timeout per node evaluation in ms

##### parallelThreads

```ts
readonly parallelThreads: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L107)

Number of parallel exploration threads

##### pruningStrategy

```ts
readonly pruningStrategy: ForestPruningStrategy;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L88)

Strategy for pruning low-quality branches

##### seed

```ts
readonly seed: number | null;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L116)

Random seed for reproducibility (null for random)

##### sparsityRatio

```ts
readonly sparsityRatio: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L79)

Percentage of nodes to keep active (0-1)

##### temperature

```ts
readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L114)

Temperature for node generation (creativity vs determinism)

---

### ForestResult

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L155)

Result of Forest-of-Thought reasoning.

#### Properties

##### bestSolution

```ts
readonly bestSolution: BestSolution | null;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L162)

Best solution found

##### conclusions

```ts
readonly conclusions: readonly ReasoningNode[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L166)

All conclusions reached across trees

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L176)

Total duration in ms

##### explorationHistory?

```ts
readonly optional explorationHistory?: readonly ExplorationEvent[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L181)

Exploration history for analysis

##### finalState

```ts
readonly finalState: ForestState;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L169)

Final state of the forest

##### forestId

```ts
readonly forestId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L157)

Forest ID

##### problem

```ts
readonly problem: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L159)

Original problem

##### statistics

```ts
readonly statistics: ForestStatistics;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L173)

Final statistics

##### terminationReason

```ts
readonly terminationReason: TerminationReason;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L171)

Reason for termination

##### topPaths

```ts
readonly topPaths: readonly PathScore[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L164)

All high-quality paths found

##### totalTokensUsed

```ts
readonly totalTokensUsed: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L178)

Total tokens used

---

### ForestStatistics

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L48)

Statistics about forest exploration.

#### Properties

##### activationRatio

```ts
readonly activationRatio: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L68)

Activation ratio (active nodes / total nodes)

##### activeTrees

```ts
readonly activeTrees: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L52)

Number of active trees

##### avgTreeScore

```ts
readonly avgTreeScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L62)

Average tree score

##### bestPathScore

```ts
readonly bestPathScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L60)

Best path score found

##### maxDepth

```ts
readonly maxDepth: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L58)

Maximum depth across all trees

##### totalActiveNodes

```ts
readonly totalActiveNodes: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L56)

Total active nodes across all trees

##### totalExplorationTimeMs

```ts
readonly totalExplorationTimeMs: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L66)

Total exploration time in ms

##### totalNodes

```ts
readonly totalNodes: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L54)

Total nodes across all trees

##### totalTokensUsed

```ts
readonly totalTokensUsed: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L64)

Total tokens used

##### totalTrees

```ts
readonly totalTrees: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L50)

Total number of trees

---

### GeneratedTest

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L179)

Generated test case.

#### Properties

##### code

```ts
code: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L185)

Test code

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L181)

Test name

##### scenarios

```ts
scenarios: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L189)

Test scenarios covered

##### target

```ts
target: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L187)

Target function/component

##### type

```ts
type: 'e2e' | 'integration' | 'unit';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L183)

Test type

---

### IAgenticAdapter

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L164)

The agentic-adapter contract. Single method; all the variability
lives in `RunAgentArgs`.

#### Properties

##### adapterStrategy

```ts
readonly adapterStrategy: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L167)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L166)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L165)

#### Methods

##### runAgent()

```ts
runAgent(args): Promise<Result<AgentRunResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L168)

###### Parameters

###### args

[`RunAgentArgs`](#runagentargs)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`AgentRunResult`](#agentrunresult), `AgentError`\>\>

---

### ICollaborationProtocol

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L266)

Base interface for collaboration protocols.

NOTE: This interface is defined here (not in collaboration-protocol.ts) to avoid
circular dependencies. Protocol implementations import this interface, and
collaboration-protocol.ts imports the implementations.

#### Properties

##### pattern

```ts
readonly pattern: CollaborationPattern;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L267)

#### Methods

##### cancel()

```ts
cancel(reason): void;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L272)

###### Parameters

###### reason

`string`

###### Returns

`void`

##### execute()

```ts
execute(config, agents): Promise<Result<CollaborationResult, AgentError>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L268)

###### Parameters

###### config

[`CollaborationConfig`](#collaborationconfig)

###### agents

`Map`\<`string`, [`IAgent`](core.md#iagent)\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CollaborationResult`](#collaborationresult), [`AgentError`](core.md#agenterror)\>\>

---

### ModelPreference

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L32)

Model preference configuration for an expert.

#### Properties

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L40)

Maximum tokens for responses

##### modelId?

```ts
optional modelId?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L36)

Specific model ID

##### provider?

```ts
optional provider?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L34)

Provider ID (e.g., 'anthropic', 'openai')

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L38)

Temperature for generation (0.0 - 2.0)

---

### OrchestratorOptions

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L178)

Options for the Orchestrator agent (coordination, decomposition, delegation).

#### Remarks

Renamed from TechLeadOptions in Issue #759.
The old name is retained as a deprecated type alias.

#### Properties

##### decompositionThreshold?

```ts
optional decompositionThreshold?: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L182)

Minimum complexity to trigger decomposition

##### enableParallelHints?

```ts
optional enableParallelHints?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L184)

Enable parallel execution hints

##### expertWeights?

```ts
optional expertWeights?: Partial<Record<AgentRole, number>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L186)

Custom expert selection weights

##### maxSubtasks?

```ts
optional maxSubtasks?: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L180)

Maximum number of subtasks to create

---

### PathScore

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L67)

A scored path through a reasoning tree from root to a target node.

#### Properties

##### breakdown

```ts
readonly breakdown: PathScoreBreakdown;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L77)

Detailed score breakdown

##### length

```ts
readonly length: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L81)

Path length (number of nodes)

##### path

```ts
readonly path: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L71)

Ordered node IDs from root to target

##### reachesConclusion

```ts
readonly reachesConclusion: boolean;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L79)

Whether this path reaches a conclusion

##### score

```ts
readonly score: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L75)

Overall path score (0-1)

##### targetNodeId

```ts
readonly targetNodeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L73)

Target node (usually a conclusion)

##### treeId

```ts
readonly treeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L69)

Tree this path belongs to

---

### PathScoreBreakdown

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L40)

Scoring breakdown for a reasoning path.

#### Properties

##### coherenceScore

```ts
readonly coherenceScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L46)

Coherence score (logical consistency between steps)

##### conclusionBonus

```ts
readonly conclusionBonus: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L50)

Bonus for reaching conclusion

##### confidenceScore

```ts
readonly confidenceScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L42)

Average confidence across path nodes

##### depthFactor

```ts
readonly depthFactor: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L48)

Depth penalty or bonus based on path length

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L44)

Average quality across path nodes

---

### PathScoringOptions

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L100)

Options for scoring a path.

#### Properties

##### coherenceWeight

```ts
readonly coherenceWeight: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L106)

Weight for coherence in scoring

##### conclusionBonus

```ts
readonly conclusionBonus: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L110)

Bonus for reaching conclusion

##### confidenceWeight

```ts
readonly confidenceWeight: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L102)

Weight for confidence in scoring

##### depthPenalty

```ts
readonly depthPenalty: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L108)

Penalty per depth level

##### qualityWeight

```ts
readonly qualityWeight: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L104)

Weight for quality in scoring

---

### ProtocolOptions

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:282](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L282)

Options for protocol execution.

NOTE: sessionOptions uses a generic Record type to avoid circular dependency
with collaboration-session.ts. The actual type is CollaborationSessionOptions
which is defined in collaboration-session.ts.

#### Properties

##### continueOnFailure?

```ts
optional continueOnFailure?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:287](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L287)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:283](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L283)

##### sequentialDelay?

```ts
optional sequentialDelay?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:286](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L286)

##### sessionOptions?

```ts
optional sessionOptions?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:285](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L285)

Session options - accepts CollaborationSessionOptions from collaboration-session.ts

---

### PruneOptions

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L82)

Options for a pruning operation.

#### Properties

##### categories?

```ts
optional categories?: ("system" | "task" | "active")[];
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L85)

##### hierarchicalOptions?

```ts
optional hierarchicalOptions?: Partial<HierarchicalOptions>;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L88)

##### semanticOptions?

```ts
optional semanticOptions?: Partial<SemanticOptions>;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L89)

##### slidingWindowOptions?

```ts
optional slidingWindowOptions?: Partial<SlidingWindowOptions>;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L87)

##### strategy?

```ts
optional strategy?: PruningStrategy;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L84)

##### summarizationPrompt?

```ts
optional summarizationPrompt?: string;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L86)

##### targetTokens?

```ts
optional targetTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L83)

---

### PruneResult

Defined in: [packages/nexus-agents/src/agents/pruning-strategies-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/pruning-strategies-types.ts#L240)

Result of a pruning operation.

#### Properties

##### removedItems

```ts
removedItems: ContextItem[];
```

Defined in: [packages/nexus-agents/src/agents/pruning-strategies-types.ts:241](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/pruning-strategies-types.ts#L241)

##### summarizedItems

```ts
summarizedItems: ContextItem[];
```

Defined in: [packages/nexus-agents/src/agents/pruning-strategies-types.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/pruning-strategies-types.ts#L242)

##### summaryItem?

```ts
optional summaryItem?: ContextItem;
```

Defined in: [packages/nexus-agents/src/agents/pruning-strategies-types.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/pruning-strategies-types.ts#L243)

##### targetReached

```ts
targetReached: boolean;
```

Defined in: [packages/nexus-agents/src/agents/pruning-strategies-types.ts:245](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/pruning-strategies-types.ts#L245)

##### tokensFreed

```ts
tokensFreed: number;
```

Defined in: [packages/nexus-agents/src/agents/pruning-strategies-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/pruning-strategies-types.ts#L244)

---

### QueryOptions

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L36)

Query options for finding experts.

#### Properties

##### anyCapability?

```ts
optional anyCapability?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L42)

Filter by capability (expert must have at least one)

##### capabilities?

```ts
optional capabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L40)

Filter by capability (expert must have all specified)

##### limit?

```ts
optional limit?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L44)

Maximum number of results

##### role?

```ts
optional role?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L38)

Filter by role

---

### ReasoningNode

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L117)

A single reasoning step in a reasoning tree.
Represents an atomic unit of thought with content, scoring, and metadata.

#### Properties

##### activationScore

```ts
readonly activationScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L141)

Activation score determining priority (higher = more likely to activate)

##### children

```ts
readonly children: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L125)

Child node IDs

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L144)

Confidence in this reasoning step (0-1)

##### content

```ts
readonly content: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L132)

The reasoning content/thought at this step

##### createdAt

```ts
readonly createdAt: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L151)

Creation timestamp

##### depth

```ts
readonly depth: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L127)

Depth in the tree (0 for root)

##### estimatedValue

```ts
readonly estimatedValue: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L148)

Estimated value for path selection (like MCTS value)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L119)

Unique node identifier

##### isActive

```ts
readonly isActive: boolean;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L139)

Whether this node is currently activated (for sparse activation)

##### metadata

```ts
readonly metadata: ReasoningNodeMetadata;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L134)

Optional structured data associated with this step

##### parentId

```ts
readonly parentId: string | null;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L123)

Parent node ID (null for root nodes)

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L146)

Quality score from evaluation (0-1)

##### state

```ts
readonly state: NodeState;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L137)

Current state of this node

##### stepType

```ts
readonly stepType: ReasoningStepType;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L130)

Type of reasoning step

##### treeId

```ts
readonly treeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L121)

ID of the tree this node belongs to

##### updatedAt

```ts
readonly updatedAt: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L153)

Last update timestamp

---

### ReasoningNodeMetadata

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L89)

Metadata associated with a reasoning node.

#### Properties

##### crossReferences?

```ts
readonly optional crossReferences?: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L97)

References to other nodes that informed this reasoning

##### custom?

```ts
readonly optional custom?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L99)

Custom key-value pairs for extensibility

##### generationTimeMs?

```ts
readonly optional generationTimeMs?: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L95)

Time taken to generate this node in ms

##### source?

```ts
readonly optional source?: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L91)

Source of this reasoning (model, tool, etc.)

##### tokensUsed?

```ts
readonly optional tokensUsed?: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L93)

Tokens used to generate this node

---

### ReasoningTree

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L172)

A reasoning tree containing nodes organized hierarchically.
Each tree explores one approach to solving the problem.

#### Properties

##### bestPaths

```ts
readonly bestPaths: readonly PathScore[];
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L192)

Best path(s) found in this tree

##### createdAt

```ts
readonly createdAt: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L197)

Creation timestamp

##### explorationPriority

```ts
readonly explorationPriority: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L187)

Priority for exploration (higher = explore first)

##### forestId

```ts
readonly forestId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L176)

ID of the forest this tree belongs to

##### hypothesis

```ts
readonly hypothesis: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L190)

Tree hypothesis or approach description

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L174)

Unique tree identifier

##### nodes

```ts
readonly nodes: ReadonlyMap<string, ReasoningNode>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L180)

All nodes in this tree (id -> node)

##### overallScore

```ts
readonly overallScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L185)

Overall tree score for ranking (0-1)

##### rootId

```ts
readonly rootId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L178)

Root node ID

##### state

```ts
readonly state: TreeState;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L183)

Current state of the tree

##### statistics

```ts
readonly statistics: TreeStatistics;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L194)

Tree statistics

##### updatedAt

```ts
readonly updatedAt: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L199)

Last update timestamp

---

### RegistryStats

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L51)

Statistics about the registry.
Extends IRegistryStats for interface compatibility (ADR-0012).

#### Extends

- `IRegistryStats`

#### Indexable

```ts
[key: string]: unknown
```

Additional stats specific to the registry type

#### Properties

##### byCapability

```ts
byCapability: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L57)

Count by capability

##### byRole

```ts
byRole: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L55)

Count by role

##### total

```ts
total: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L53)

Total number of registered experts (IRegistryStats alias)

###### Overrides

```ts
IRegistryStats.total;
```

---

### ResultConflict

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:239](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L239)

Conflict between expert results.

#### Properties

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L243)

##### expert1Id

```ts
expert1Id: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L240)

##### expert2Id

```ts
expert2Id: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:241](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L241)

##### field

```ts
field: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L242)

##### resolution

```ts
resolution: 'merged' | 'expert1' | 'expert2' | 'unresolved';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L244)

##### resolutionReason?

```ts
optional resolutionReason?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:245](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L245)

---

### ResultSubmissionMessage

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L117)

Result submission from an expert.

#### Properties

##### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L121)

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L119)

##### notes?

```ts
optional notes?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L122)

##### result

```ts
result: TaskResult;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L120)

##### type

```ts
type: 'result_submission';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L118)

---

### ResultSummary

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L146)

Summary of a single result.

#### Properties

##### contributions

```ts
contributions: string[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L154)

Key contributions to final output

##### quality

```ts
quality: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L152)

Quality of this result (0-1)

##### subtaskId

```ts
subtaskId: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L148)

Subtask ID

##### summary

```ts
summary: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L150)

Brief summary of the output

---

### ReviewRequestMessage

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L128)

Review request from one expert to another.

#### Properties

##### artifact

```ts
artifact: unknown;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L132)

##### criteria?

```ts
optional criteria?: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L133)

##### deadline?

```ts
optional deadline?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L134)

##### fromExpert

```ts
fromExpert: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L130)

##### toExpert

```ts
toExpert: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L131)

##### type

```ts
type: 'review_request';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L129)

---

### ReviewResponseMessage

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L140)

Review response from a reviewer.

#### Properties

##### approved

```ts
approved: boolean;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L144)

##### feedback

```ts
feedback: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L145)

##### requesterId

```ts
requesterId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L143)

##### reviewerId

```ts
reviewerId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L142)

##### severity?

```ts
optional severity?: "none" | "critical" | "minor" | "major";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L147)

##### suggestions?

```ts
optional suggestions?: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L146)

##### type

```ts
type: 'review_response';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L141)

---

### RunAgentArgs

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L141)

Arguments to `runAgent`.

`onToolCall` is the harness's tool-router; the adapter awaits its
`Promise<ToolResult>` so synchronous and async harness execution
both work. Per-tool timeouts are the harness's responsibility (the
adapter doesn't impose one — see #2529 design notes).

`onTurn` (optional) fires once after each turn completes, giving
operators incremental progress visibility.

`signal` (optional) propagates external cancellation as
`stopReason: 'cancelled'`.

#### Properties

##### maxTokens?

```ts
readonly optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L157)

Per-turn maxTokens passed through to `IModelAdapter.complete`.

##### onToolCall

```ts
readonly onToolCall: (call) => Promise<AgenticToolResult>;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L151)

###### Parameters

###### call

[`AgenticToolCall`](#agentictoolcall)

###### Returns

`Promise`\<[`AgenticToolResult`](#agentictoolresult)\>

##### onTurn?

```ts
readonly optional onTurn?: (turn) => void;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L152)

###### Parameters

###### turn

[`AgentTurn`](#agentturn)

###### Returns

`void`

##### signal?

```ts
readonly optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L153)

##### systemPrompt

```ts
readonly systemPrompt: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L142)

##### temperature?

```ts
readonly optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L155)

Sampling temperature passed through to `IModelAdapter.complete`.

##### tools

```ts
readonly tools: readonly ToolDefinition[];
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L144)

##### turnBudget?

```ts
readonly optional turnBudget?: number;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L150)

Maximum agent turns. When omitted, the adapter uses the resolved
model's `profile.maxRecommendedTurnBudget` (claude-opus = 20,
o-reasoning = 25, claude-haiku / gemini-flash = 8, defaults to 10).

##### userPrompt

```ts
readonly userPrompt: string;
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L143)

---

### ScoreBreakdown

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L71)

Breakdown of how the match score was calculated.

#### Properties

##### capabilityScore

```ts
capabilityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L73)

Score from capability matching (0-1)

##### domainScore

```ts
domainScore: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L75)

Score from domain alignment (0-1)

##### finalScore

```ts
finalScore: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L79)

Combined final score (0-1)

##### weightScore

```ts
weightScore: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L77)

Score from weight adjustment (0-1)

---

### SecurityAnalysisResult

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L61)

Security analysis result from SecurityExpert.

#### Extends

- [`ExpertOutput`](#expertoutput)

#### Properties

##### compliance?

```ts
optional compliance?: ComplianceStatus;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L67)

Compliance status

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L42)

Confidence score (0-1)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`confidence`](#confidence-6)

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L34)

Primary result content

###### Inherited from

[`ExpertOutput`](#expertoutput).[`content`](#content-7)

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L44)

Model used for this expert's execution (Issue #817)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`modelUsed`](#modelused-3)

##### recommendations?

```ts
optional recommendations?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L38)

Recommendations or suggestions

###### Inherited from

[`ExpertOutput`](#expertoutput).[`recommendations`](#recommendations-3)

##### securityScore

```ts
securityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L65)

Security score (0-100)

##### structuredData?

```ts
optional structuredData?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L36)

Structured data if applicable

###### Inherited from

[`ExpertOutput`](#expertoutput).[`structuredData`](#structureddata-3)

##### vulnerabilities

```ts
vulnerabilities: Vulnerability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L63)

Vulnerabilities found

##### warnings?

```ts
optional warnings?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L40)

Warnings or issues found

###### Inherited from

[`ExpertOutput`](#expertoutput).[`warnings`](#warnings-3)

---

### SecurityExpertOptions

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L39)

Configuration options for SecurityExpert.

#### Extends

- [`ExpertOptions`](#expertoptions)

#### Properties

##### additionalCapabilities?

```ts
optional additionalCapabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L26)

Custom capability extensions

###### Inherited from

[`ExpertOptions`](#expertoptions).[`additionalCapabilities`](#additionalcapabilities-4)

##### complianceFrameworks?

```ts
optional complianceFrameworks?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L41)

Compliance frameworks to check

##### enableCweMapping?

```ts
optional enableCweMapping?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L45)

Enable detailed CWE mappings

##### enableHeuristics?

```ts
optional enableHeuristics?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L24)

Enable domain-specific heuristics

###### Inherited from

[`ExpertOptions`](#expertoptions).[`enableHeuristics`](#enableheuristics-3)

##### focusAreas?

```ts
optional focusAreas?: SecurityFocusArea[];
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L47)

Security focus areas

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L22)

Maximum tokens for responses

###### Inherited from

[`ExpertOptions`](#expertoptions).[`maxTokens`](#maxtokens-14)

##### minSeverity?

```ts
optional minSeverity?: "info" | "critical" | "high" | "low" | "medium";
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L43)

Minimum severity to report

##### systemPromptOverride?

```ts
optional systemPromptOverride?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L18)

Custom system prompt override

###### Inherited from

[`ExpertOptions`](#expertoptions).[`systemPromptOverride`](#systempromptoverride-3)

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L20)

Temperature for completions (domain-specific default if not set)

###### Inherited from

[`ExpertOptions`](#expertoptions).[`temperature`](#temperature-13)

---

### SelectionExpertRegistry

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L60)

Registry of available experts.

#### Methods

##### getAll()

```ts
getAll(): ExpertDefinition[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L61)

###### Returns

[`ExpertDefinition`](#expertdefinition)[]

##### getAvailable()

```ts
getAvailable(): ExpertDefinition[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L65)

###### Returns

[`ExpertDefinition`](#expertdefinition)[]

##### getByDomain()

```ts
getByDomain(domain): ExpertDefinition[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L64)

###### Parameters

###### domain

`ExpertTaskDomain`

###### Returns

[`ExpertDefinition`](#expertdefinition)[]

##### getById()

```ts
getById(id): ExpertDefinition | undefined;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L62)

###### Parameters

###### id

`string`

###### Returns

[`ExpertDefinition`](#expertdefinition) \| `undefined`

##### getByRole()

```ts
getByRole(role): ExpertDefinition[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L63)

###### Parameters

###### role

[`AgentRole`](core.md#agentrole)

###### Returns

[`ExpertDefinition`](#expertdefinition)[]

---

### SelectionOptions

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L108)

Options for expert selection.

#### Properties

##### capabilityWeights?

```ts
optional capabilityWeights?: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L111)

##### excludeExperts?

```ts
optional excludeExperts?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L113)

##### forceCollaboration?

```ts
optional forceCollaboration?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L114)

##### maxAlternatives?

```ts
optional maxAlternatives?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L110)

##### minScore?

```ts
optional minScore?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L109)

##### preferredDomains?

```ts
optional preferredDomains?: ExpertTaskDomain[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L112)

---

### SelectionResult

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L99)

Result of expert selection.

#### Properties

##### alternatives

```ts
alternatives: ExpertMatch[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L101)

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L104)

##### primary

```ts
primary: ExpertMatch;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L100)

##### requiresCollaboration

```ts
requiresCollaboration: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L102)

##### suggestedPattern?

```ts
optional suggestedPattern?: ExpertCollaborationPatternType;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L103)

---

### SessionState

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L186)

Aggregated session status.

#### Properties

##### completedAt?

```ts
optional completedAt?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L194)

##### config

```ts
config: CollaborationConfig;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L187)

##### error?

```ts
optional error?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L195)

##### messageLog

```ts
messageLog: CollaborationMessage[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L196)

##### participants

```ts
participants: ExpertParticipation[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L189)

##### results

```ts
results: Map<string, TaskResult>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L190)

##### reviews

```ts
reviews: ReviewResponseMessage[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L191)

##### startedAt

```ts
startedAt: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L193)

##### status

```ts
status: SessionStatus;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L188)

##### votes

```ts
votes: VoteMessage[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L192)

---

### SharedConclusion

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L35)

A conclusion shared across trees for cross-pollination.

#### Properties

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L43)

Confidence in this conclusion

##### content

```ts
readonly content: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L41)

The conclusion content

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L45)

Quality score

##### sourceNodeId

```ts
readonly sourceNodeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L39)

Source node ID

##### sourceTreeId

```ts
readonly sourceTreeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L37)

Source tree ID

---

### SharedInsight

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L62)

An insight shared across trees.

#### Properties

##### content

```ts
readonly content: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L68)

The insight content

##### relevance

```ts
readonly relevance: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L70)

Relevance score for current exploration

##### sourceNodeId

```ts
readonly sourceNodeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L66)

Source node ID

##### sourceTreeId

```ts
readonly sourceTreeId: string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L64)

Source tree ID

---

### StateMachineOptions

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L57)

State machine options.

#### Properties

##### initialState?

```ts
optional initialState?: AgentState;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L59)

Initial state (defaults to 'idle')

##### maxErrorCount?

```ts
optional maxErrorCount?: number;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L61)

Maximum error count before permanent error state

##### maxHistorySize?

```ts
optional maxHistorySize?: number;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L65)

Maximum history entries to keep

##### trackHistory?

```ts
optional trackHistory?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L63)

Enable transition history tracking

---

### StateTransition

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L27)

State transition metadata.

#### Properties

##### context?

```ts
optional context?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L37)

Optional context data

##### event

```ts
event: StateTransitionEvent;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L33)

Event that triggered the transition

##### from

```ts
from: AgentState;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L29)

Previous state

##### timestamp

```ts
timestamp: string;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L35)

Timestamp of the transition

##### to

```ts
to: AgentState;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L31)

New state

---

### StatusUpdateMessage

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L175)

Status update message.

#### Properties

##### estimatedTimeRemaining?

```ts
optional estimatedTimeRemaining?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L180)

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L177)

##### progress?

```ts
optional progress?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L179)

##### status

```ts
status: 'failed' | 'working' | 'pending' | 'submitted' | 'reviewing' | 'voted';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L178)

##### type

```ts
type: 'status_update';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L176)

---

### SubTask

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L26)

A subtask broken down from the main task.

#### Properties

##### assignedRole?

```ts
optional assignedRole?: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L42)

Assigned expert role (if any)

##### complexity

```ts
complexity: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L44)

Estimated complexity (1-10)

##### dependencies

```ts
dependencies: string[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L36)

Dependencies on other subtasks (by ID)

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L32)

Description of what needs to be done

##### expectedOutput

```ts
expectedOutput: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L34)

Expected output format or type

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L28)

Unique subtask identifier

##### parentTaskId

```ts
parentTaskId: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L30)

Parent task ID

##### priority

```ts
priority: SubtaskPriority;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L38)

Priority level

##### requiredCapabilities

```ts
requiredCapabilities: string[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L46)

Required capabilities for this subtask

##### status

```ts
status: SubtaskStatus;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L40)

Current status

---

### SynthesizedResult

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L126)

Synthesis of multiple task results.

#### Properties

##### collaborationMetadata?

```ts
optional collaborationMetadata?: CollaborationMetadata;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L140)

Collaboration metadata if collaborative synthesis was used (Issue #488)

##### combinedOutput

```ts
combinedOutput: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L128)

Combined output from all results

##### conflicts

```ts
conflicts: Conflict[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L134)

Any conflicts detected between results

##### qualityScore

```ts
qualityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L136)

Overall quality assessment

##### recommendations

```ts
recommendations: string[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L138)

Recommendations for follow-up

##### resultSummaries

```ts
resultSummaries: ResultSummary[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L132)

Individual result summaries

##### summary

```ts
summary: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L130)

Summary of the synthesis process

---

### SystemComponent

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L151)

System component in architecture.

#### Properties

##### dependencies

```ts
dependencies: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L159)

Dependencies

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L153)

Component name

##### responsibilities

```ts
responsibilities: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L157)

Responsibilities

##### type

```ts
type: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L155)

Component type

---

### TaskAnalysis

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L52)

Result of task analysis.

#### Properties

##### approach

```ts
approach: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L66)

Recommended approach

##### commitment?

```ts
optional commitment?: TaskCommitment;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L75)

Commit-before-generate block (#1827).
Forces the orchestrator to commit to a direction before dispatching workers,
countering LLM mode-collapse toward safe defaults. Optional for backward
compatibility with older analysis outputs.

##### complexity

```ts
complexity: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L56)

Overall complexity score (1-10)

##### estimatedEffort

```ts
estimatedEffort: number;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L68)

Estimated total effort in relative units

##### needsDecomposition

```ts
needsDecomposition: boolean;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L64)

Whether task needs decomposition

##### requirements

```ts
requirements: string[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L60)

Key requirements extracted from the task

##### risks

```ts
risks: string[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L62)

Identified risks or challenges

##### taskId

```ts
taskId: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L54)

Task ID being analyzed

##### taskType

```ts
taskType: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L58)

Type of task (code, architecture, documentation, etc.)

---

### TaskAssignmentMessage

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L105)

Task assignment message sent to an expert.

#### Properties

##### deadline?

```ts
optional deadline?: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L111)

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L107)

##### previousResults?

```ts
optional previousResults?: TaskResult[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L110)

##### sequencePosition?

```ts
optional sequencePosition?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L109)

##### task

```ts
task: Task;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L108)

##### type

```ts
type: 'task_assignment';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L106)

---

### TaskCommitment

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L82)

Orchestrator's directional commitment, emitted before decomposition (#1827).
Modeled after the `frontend-design` plugin's Design Thinking pre-phase.

#### Properties

##### approach

```ts
approach: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L86)

The non-obvious choice being made.

##### constraints

```ts
constraints: string[];
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L90)

Hard limits: deadlines, scope boundaries, invariants.

##### differentiation

```ts
differentiation: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L88)

What would make the output worse if solved by default patterns.

##### purpose

```ts
purpose: string;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L84)

What this task is fundamentally about (one sentence).

---

### TestingAnalysisResult

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L165)

Testing analysis result from TestingExpert.

#### Extends

- [`ExpertOutput`](#expertoutput)

#### Properties

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L42)

Confidence score (0-1)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`confidence`](#confidence-6)

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L34)

Primary result content

###### Inherited from

[`ExpertOutput`](#expertoutput).[`content`](#content-7)

##### coverage?

```ts
optional coverage?: CoverageMetrics;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L171)

Coverage metrics

##### modelUsed?

```ts
optional modelUsed?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L44)

Model used for this expert's execution (Issue #817)

###### Inherited from

[`ExpertOutput`](#expertoutput).[`modelUsed`](#modelused-3)

##### operationType

```ts
operationType: 'generation' | 'coverage_analysis' | 'quality_assessment';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L167)

Operation type

##### quality?

```ts
optional quality?: TestQuality;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L173)

Test quality assessment

##### recommendations?

```ts
optional recommendations?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L38)

Recommendations or suggestions

###### Inherited from

[`ExpertOutput`](#expertoutput).[`recommendations`](#recommendations-3)

##### structuredData?

```ts
optional structuredData?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L36)

Structured data if applicable

###### Inherited from

[`ExpertOutput`](#expertoutput).[`structuredData`](#structureddata-3)

##### tests?

```ts
optional tests?: GeneratedTest[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L169)

Generated tests

##### warnings?

```ts
optional warnings?: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L40)

Warnings or issues found

###### Inherited from

[`ExpertOutput`](#expertoutput).[`warnings`](#warnings-3)

---

### TestingExpertOptions

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L44)

Configuration options for TestingExpert.

#### Extends

- [`ExpertOptions`](#expertoptions)

#### Properties

##### additionalCapabilities?

```ts
optional additionalCapabilities?: AgentCapability[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L26)

Custom capability extensions

###### Inherited from

[`ExpertOptions`](#expertoptions).[`additionalCapabilities`](#additionalcapabilities-4)

##### enableHeuristics?

```ts
optional enableHeuristics?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L24)

Enable domain-specific heuristics

###### Inherited from

[`ExpertOptions`](#expertoptions).[`enableHeuristics`](#enableheuristics-3)

##### framework?

```ts
optional framework?: "vitest" | "jest" | "playwright" | "mocha" | "cypress";
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L46)

Preferred testing framework

##### generateFactories?

```ts
optional generateFactories?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L54)

Generate test data factories

##### includeMocking?

```ts
optional includeMocking?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L50)

Include mocking strategies

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L22)

Maximum tokens for responses

###### Inherited from

[`ExpertOptions`](#expertoptions).[`maxTokens`](#maxtokens-14)

##### systemPromptOverride?

```ts
optional systemPromptOverride?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L18)

Custom system prompt override

###### Inherited from

[`ExpertOptions`](#expertoptions).[`systemPromptOverride`](#systempromptoverride-3)

##### targetCoverage?

```ts
optional targetCoverage?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L48)

Target coverage percentage

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-base-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-base-types.ts#L20)

Temperature for completions (domain-specific default if not set)

###### Inherited from

[`ExpertOptions`](#expertoptions).[`temperature`](#temperature-13)

##### testStyle?

```ts
optional testStyle?: "tdd" | "bdd" | "behavioral";
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L52)

Test style preference

---

### TestQuality

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L211)

Test quality assessment.

#### Properties

##### assertionQuality

```ts
assertionQuality: 'good' | 'fair' | 'poor';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L217)

Assertion quality

##### isolation

```ts
isolation: 'good' | 'fair' | 'poor';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L215)

Test isolation

##### issues

```ts
issues: string[];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L219)

Issues found

##### score

```ts
score: number;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:213](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L213)

Overall score (0-100)

---

### ThinkerOutput

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L119)

Thinker's analysis output.

#### Properties

##### approach

```ts
readonly approach: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L123)

Execution approach/plan

##### considerations

```ts
readonly considerations: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L125)

Considerations and edge cases

##### problemAnalysis

```ts
readonly problemAnalysis: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L121)

Problem analysis

##### successCriteria

```ts
readonly successCriteria: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L127)

Success criteria

---

### TreeStatistics

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L131)

Statistics for a reasoning tree.

#### Properties

##### activeNodes

```ts
readonly activeNodes: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L135)

Number of currently active nodes

##### avgBranchingFactor

```ts
readonly avgBranchingFactor: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L147)

Average branching factor

##### avgConfidence

```ts
readonly avgConfidence: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L141)

Average node confidence

##### avgQualityScore

```ts
readonly avgQualityScore: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L139)

Average node quality score

##### conclusionCount

```ts
readonly conclusionCount: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L143)

Number of conclusion nodes

##### maxDepth

```ts
readonly maxDepth: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L137)

Maximum depth reached

##### totalNodes

```ts
readonly totalNodes: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L133)

Total number of nodes in the tree

##### totalTokensUsed

```ts
readonly totalTokensUsed: number;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L145)

Total tokens used across all nodes

---

### TrinityConfig

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L161)

Configuration for TRINITY coordinator.

#### Properties

##### includeHistory?

```ts
readonly optional includeHistory?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L167)

Whether to include detailed phase history

##### maxIterations?

```ts
readonly optional maxIterations?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L163)

Maximum verification iterations before giving up

##### roleConfigs?

```ts
readonly optional roleConfigs?: Partial<Record<TrinityRole, Partial<TrinityRoleConfig>>>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L169)

Custom role configurations

##### timeoutMs?

```ts
readonly optional timeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L165)

Timeout for entire coordination in ms

---

### TrinityExecuteOptions

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L244)

Options for executing TRINITY coordination.

#### Properties

##### agent

```ts
readonly agent: IAgent;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:246](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L246)

##### task

```ts
readonly task: Task;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:245](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L245)

---

### TrinityPhaseResult

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L105)

Result from a single TRINITY phase.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L113)

Duration in milliseconds

##### output

```ts
readonly output: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L111)

Output from the phase

##### phase

```ts
readonly phase: TrinityPhase;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L107)

Which phase produced this result

##### role

```ts
readonly role: TrinityRole;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L109)

Role that executed this phase

##### tokensUsed

```ts
readonly tokensUsed: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L115)

Tokens used

---

### TrinityResult

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L185)

Result of TRINITY coordination.

#### Properties

##### finalOutput

```ts
readonly finalOutput: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L189)

Final output after all phases

##### history

```ts
readonly history: TrinityPhaseResult[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L201)

Phase execution history

##### iterations

```ts
readonly iterations: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L197)

Number of think-work-verify iterations

##### stopReason

```ts
readonly stopReason: "error" | "timeout" | "max_iterations" | "verified";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L203)

Stop reason

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L187)

Whether coordination succeeded

##### thinkerOutput

```ts
readonly thinkerOutput: ThinkerOutput;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L191)

Thinker's analysis

##### totalDurationMs

```ts
readonly totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L199)

Total duration in milliseconds

##### verifierOutput

```ts
readonly verifierOutput: VerifierOutput;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L195)

Verifier's final assessment

##### workerOutput

```ts
readonly workerOutput: WorkerOutput;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L193)

Worker's implementation

---

### TrinityRoleConfig

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L23)

Configuration for a TRINITY role.

#### Properties

##### maxTokens

```ts
readonly maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L31)

Maximum tokens for response

##### role

```ts
readonly role: TrinityRole;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L25)

Role identifier

##### systemPrompt

```ts
readonly systemPrompt: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L27)

System prompt for this role

##### temperature

```ts
readonly temperature: number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L29)

Temperature for completions

---

### VerifierOutput

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L143)

Verifier's evaluation output.

#### Properties

##### correctnessCheck

```ts
readonly correctnessCheck: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L147)

Correctness assessment

##### issuesFound

```ts
readonly issuesFound: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L151)

Issues found

##### qualityCheck

```ts
readonly qualityCheck: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L149)

Quality assessment

##### recommendations

```ts
readonly recommendations: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L153)

Recommendations

##### verdict

```ts
readonly verdict: "pass" | "fail";
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L145)

Pass or fail verdict

---

### VoteMessage

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L164)

Vote message for consensus protocol.

#### Properties

##### conditions?

```ts
optional conditions?: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L169)

##### decision

```ts
decision: VoteDecision;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L167)

##### expertId

```ts
expertId: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L166)

##### reasoning

```ts
reasoning: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L168)

##### type

```ts
type: 'vote';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L165)

---

### Vulnerability

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L73)

Represents a security vulnerability.

#### Properties

##### cweId?

```ts
optional cweId?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L87)

CWE reference if applicable

##### description

```ts
description: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L81)

Description of the vulnerability

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L75)

Unique vulnerability ID

##### location?

```ts
optional location?: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L83)

Affected location

##### remediation

```ts
remediation: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L85)

Remediation steps

##### severity

```ts
severity: 'info' | 'critical' | 'high' | 'low' | 'medium';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L77)

Severity level

##### type

```ts
type: string;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L79)

Vulnerability type (OWASP category)

---

### WaveExecutionResult

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L107)

Final result of the full wave execution.

#### Properties

##### aborted

```ts
readonly aborted: boolean;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L117)

Whether execution was aborted early (budget exceeded or failure).

##### abortReason?

```ts
readonly optional abortReason?: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L119)

Reason for abort, if aborted.

##### allResults

```ts
readonly allResults: readonly WaveTaskResult[];
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L111)

All task results flat.

##### totalDurationMs

```ts
readonly totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L115)

Total duration in ms.

##### totalTokensUsed

```ts
readonly totalTokensUsed: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L113)

Total estimated tokens consumed across all waves.

##### waves

```ts
readonly waves: readonly WaveResult[];
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L109)

Results organized by wave.

---

### WaveResult

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L93)

Result of executing a single wave.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L101)

Total duration of this wave in ms.

##### results

```ts
readonly results: readonly WaveTaskResult[];
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L97)

Results of all tasks in this wave.

##### totalTokens

```ts
readonly totalTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L99)

Total estimated tokens consumed by this wave.

##### waveIndex

```ts
readonly waveIndex: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L95)

The wave index (0-based).

---

### WaveSchedulerConfig

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L19)

Configuration for the wave scheduler.

#### Properties

##### abortOnFailure

```ts
readonly abortOnFailure: boolean;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L27)

Whether to abort remaining waves on first task failure. Default: false.

##### maxConcurrency

```ts
readonly maxConcurrency: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L21)

Maximum number of tasks to execute concurrently in one wave. Default: 4.

##### maxOutputChars

```ts
readonly maxOutputChars: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L23)

Maximum output length (chars) per task result. Default: 2000.

##### maxTotalTokens

```ts
readonly maxTotalTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L25)

Maximum total token budget across all waves. 0 = unlimited. Default: 0.

##### onWaveComplete?

```ts
readonly optional onWaveComplete?: (waveIndex, results, cumulativeTokens) => Promise<void>;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L31)

Optional callback invoked after each wave completes. Used for checkpointing.

###### Parameters

###### waveIndex

`number`

###### results

readonly [`WaveTaskResult`](#wavetaskresult)[]

###### cumulativeTokens

`number`

###### Returns

`Promise`\<`void`\>

##### taskTimeoutMs

```ts
readonly taskTimeoutMs: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L29)

Timeout per individual task in ms. Default: 60000.

---

### WaveTask

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L57)

A task to be executed in a wave.

#### Type Parameters

##### T

`T` = `unknown`

#### Properties

##### dependencies

```ts
readonly dependencies: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L65)

IDs of tasks that must complete before this one can start.

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L61)

Human-readable description of what this task does.

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L59)

Unique identifier for this task.

##### input

```ts
readonly input: T;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L63)

The input data for this task.

---

### WaveTaskResult

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L71)

Result of a single task execution.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L85)

Duration of this task in ms.

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L87)

Error message if task failed.

##### estimatedTokens

```ts
readonly estimatedTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L83)

Estimated tokens consumed by this task.

##### originalLength

```ts
readonly originalLength: number;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L81)

Original output length before truncation.

##### output

```ts
readonly output: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L77)

The output text (truncated to maxOutputChars).

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L75)

Whether the task completed successfully.

##### taskId

```ts
readonly taskId: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L73)

Task ID this result belongs to.

##### truncated

```ts
readonly truncated: boolean;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L79)

Whether the output was truncated.

---

### WorkChunk

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L129)

A chunk of work produced by auto-chunking.

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L131)

Unique ID for this chunk.

##### items

```ts
readonly items: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L135)

Items in this chunk (e.g., file paths).

##### scope

```ts
readonly scope: string;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L133)

Scope description (e.g., directory path).

---

### WorkerOutput

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L131)

Worker's implementation output.

#### Properties

##### deviations

```ts
readonly deviations: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L137)

Deviations from plan

##### implementation

```ts
readonly implementation: string;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L133)

The actual implementation/content

##### questions

```ts
readonly questions: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L139)

Questions or blockers

##### stepsCompleted

```ts
readonly stepsCompleted: string[];
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L135)

Steps completed

## Type Aliases

### ActivationStrategy

```ts
type ActivationStrategy = 'ucb' | 'greedy' | 'diverse' | 'adaptive';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L25)

Strategy for selecting which nodes to activate.

- `ucb`: Upper Confidence Bound (exploration/exploitation balance)
- `greedy`: Always activate highest-scoring nodes
- `diverse`: Prioritize diversity across trees
- `adaptive`: Dynamically adjust based on progress

---

### AgentStopReason

```ts
type AgentStopReason = 'agent-stopped' | 'turn-budget' | 'tool-error' | 'cancelled';
```

Defined in: [packages/nexus-agents/src/agents/agentic/types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/types.ts#L72)

Why the agent loop stopped.

- `agent-stopped`: model emitted no further tool calls — natural end
- `turn-budget`: hit `turnBudget` before the model finished
- `tool-error`: `onToolCall` threw; harness's responsibility to grade
- `cancelled`: external `AbortSignal` fired

---

### AggregationStrategy

```ts
type AggregationStrategy = 'merge' | 'select_best' | 'consensus' | 'sequential_chain';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L19)

Aggregation strategy types.

---

### ArchitectureStyle

```ts
type ArchitectureStyle =
  | 'layered'
  | 'microservices'
  | 'event_driven'
  | 'hexagonal'
  | 'clean'
  | 'cqrs'
  | 'ddd';
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L52)

Architecture style options.

---

### BuiltInExpertType

```ts
type BuiltInExpertType =
  | 'code'
  | 'architecture'
  | 'security'
  | 'documentation'
  | 'testing'
  | 'devops'
  | 'research'
  | 'pm'
  | 'ux'
  | 'infrastructure'
  | 'qa'
  | 'data-visualization';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L68)

Built-in expert type identifiers.

---

### CollaborationMessage

```ts
type CollaborationMessage =
  | TaskAssignmentMessage
  | ResultSubmissionMessage
  | ReviewRequestMessage
  | ReviewResponseMessage
  | FeedbackMessage
  | VoteMessage
  | StatusUpdateMessage;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L93)

Collaboration message types for inter-expert communication.

---

### CollaborationPattern

```ts
type CollaborationPattern =
  | 'sequential'
  | 'parallel'
  | 'review'
  | 'consensus'
  | 'reflexion'
  | 'aegean'
  | 'self-refine'
  | 'self-debug';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L36)

Collaboration pattern types.

- sequential: Experts work in order, passing results forward
- parallel: Experts work simultaneously on the same task
- review: One expert reviews another's work
- consensus: Voting-based decision making
- reflexion: Multi-agent reflexion with persona-based critics (arxiv:2512.20845)
- aegean: Byzantine-fault-tolerant consensus (arxiv:2512.20184)
- self-refine: Iterative refinement with self-feedback (arxiv:2303.17651)
- self-debug: Automatic error detection and repair (arxiv:2304.05128)

---

### ConflictResolver

```ts
type ConflictResolver = (conflict, result1, result2) => 'expert1' | 'expert2' | 'merged';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L34)

Conflict resolver function type.

#### Parameters

##### conflict

[`ResultConflict`](#resultconflict)

##### result1

[`ExpertResult`](#expertresult)

##### result2

[`ExpertResult`](#expertresult)

#### Returns

`"expert1"` \| `"expert2"` \| `"merged"`

---

### ContentPriority

```ts
type ContentPriority = (typeof ContentPriority)[keyof typeof ContentPriority];
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L13)

Priority levels for context content.
Higher priority content is retained longer during pruning.

---

### CrossTreeStrategy

```ts
type CrossTreeStrategy = 'none' | 'conclusions' | 'insights' | 'full';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L40)

Strategy for sharing information across trees.

- `none`: No cross-tree sharing
- `conclusions`: Share only conclusions
- `insights`: Share conclusions and intermediate insights
- `full`: Share all relevant information

---

### ExpertCollaborationPatternType

```ts
type ExpertCollaborationPatternType =
  (typeof ExpertCollaborationPattern)[keyof typeof ExpertCollaborationPattern];
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L28)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

---

### ExpertDomain

```ts
type ExpertDomain = 'code' | 'security' | 'architecture' | 'testing' | 'documentation';
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L28)

Expert domain categories.

---

### ExplorationEventType

```ts
type ExplorationEventType =
  | 'tree_created'
  | 'node_created'
  | 'node_activated'
  | 'node_deactivated'
  | 'node_completed'
  | 'node_pruned'
  | 'path_scored'
  | 'cross_tree_share'
  | 'conclusion_reached'
  | 'tree_completed'
  | 'forest_converging'
  | 'forest_completed';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L89)

Types of exploration events.

---

### ForestId

```ts
type ForestId = string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L30)

Unique identifier for a forest (collection of trees).

---

### ForestPruningStrategy

```ts
type ForestPruningStrategy = 'none' | 'score' | 'depth' | 'combined';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L55)

Strategy for pruning low-quality branches.

- `none`: No pruning
- `score`: Prune nodes below score threshold
- `depth`: Prune based on depth limits
- `combined`: Use both score and depth criteria

---

### ForestState

```ts
type ForestState = 'initializing' | 'exploring' | 'converging' | 'completed' | 'timeout';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L28)

State of a forest of reasoning trees.

- `initializing`: Forest is being set up
- `exploring`: Actively exploring trees
- `converging`: Trees are converging on solution(s)
- `completed`: Forest has finished exploration
- `timeout`: Exploration ended due to timeout

---

### NodeId

```ts
type NodeId = string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L20)

Unique identifier for a reasoning node.

---

### NodeState

```ts
type NodeState = 'pending' | 'active' | 'completed' | 'pruned' | 'error';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L45)

State of a reasoning node in its lifecycle.

- `pending`: Node created but not yet processed
- `active`: Node currently being explored/evaluated
- `completed`: Node exploration finished successfully
- `pruned`: Node was pruned due to low score or depth limit
- `error`: Node exploration failed with an error

---

### PruningStrategy

```ts
type PruningStrategy = (typeof PruningStrategy)[keyof typeof PruningStrategy];
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L41)

Strategy for pruning context when budget is exceeded.

---

### QualityAttribute

```ts
type QualityAttribute =
  | 'performance'
  | 'scalability'
  | 'maintainability'
  | 'security'
  | 'reliability'
  | 'testability';
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L64)

Quality attributes for architecture decisions.

---

### QualityScorer

```ts
type QualityScorer = (results, aggregatedOutput) => number;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/aggregator-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/aggregator-types.ts#L43)

Quality scorer function type.

#### Parameters

##### results

[`ExpertResult`](#expertresult)[]

##### aggregatedOutput

`unknown`

#### Returns

`number`

---

### ReasoningStepType

```ts
type ReasoningStepType =
  | 'hypothesis'
  | 'inference'
  | 'decomposition'
  | 'synthesis'
  | 'verification'
  | 'conclusion';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L62)

Type of reasoning step represented by a node.

- `hypothesis`: Initial hypothesis or assumption
- `inference`: Logical deduction from parent node(s)
- `decomposition`: Breaking down a complex problem
- `synthesis`: Combining multiple reasoning paths
- `verification`: Validating a previous step
- `conclusion`: Final answer or decision

---

### SecurityFocusArea

```ts
type SecurityFocusArea =
  | 'authentication'
  | 'authorization'
  | 'input_validation'
  | 'cryptography'
  | 'injection'
  | 'secrets'
  | 'dependencies';
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L53)

Security focus areas for targeted analysis.

---

### SessionEvent

```ts
type SessionEvent =
  | {
      status: SessionStatus;
      type: 'status_change';
    }
  | {
      expertId: string;
      type: 'expert_joined';
    }
  | {
      expertId: string;
      result: TaskResult;
      type: 'result_submitted';
    }
  | {
      approved: boolean;
      reviewerId: string;
      type: 'review_completed';
    }
  | {
      decision: string;
      expertId: string;
      type: 'vote_received';
    }
  | {
      expertId?: string;
      type: 'timeout';
    }
  | {
      error: Error;
      type: 'error';
    };
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session-helpers.ts#L29)

Session event types for callbacks.

---

### SessionStatus

```ts
type SessionStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_review'
  | 'voting'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'timed_out';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L49)

Session status during collaboration lifecycle.

---

### StateChangeCallback

```ts
type StateChangeCallback = (transition) => void;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L43)

Callback for state change events.

#### Parameters

##### transition

[`StateTransition`](#statetransition)

#### Returns

`void`

---

### StateTransitionEvent

```ts
type StateTransitionEvent =
  | 'task_assigned'
  | 'plan_completed'
  | 'needs_input'
  | 'task_completed'
  | 'failure'
  | 'input_received'
  | 'recovered';
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L15)

State transition event types.

---

### SubtaskPriority

```ts
type SubtaskPriority = 'critical' | 'high' | 'medium' | 'low';
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L16)

Subtask priority levels.

---

### SubtaskStatus

```ts
type SubtaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L21)

Subtask status.

---

### TerminationReason

```ts
type TerminationReason =
  | 'solution_found'
  | 'convergence'
  | 'max_time'
  | 'max_tokens'
  | 'max_depth'
  | 'no_progress'
  | 'error';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L26)

Termination reason for forest exploration.

---

### TransitionErrorCallback

```ts
type TransitionErrorCallback = (currentState, attemptedEvent, error) => void;
```

Defined in: [packages/nexus-agents/src/agents/state-machine-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine-types.ts#L48)

Error callback for invalid transitions.

#### Parameters

##### currentState

[`AgentState`](core.md#agentstate)

##### attemptedEvent

[`StateTransitionEvent`](#statetransitionevent-1)

##### error

[`AgentError`](core.md#agenterror)

#### Returns

`void`

---

### TreeId

```ts
type TreeId = string;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L25)

Unique identifier for a reasoning tree.

---

### TreeState

```ts
type TreeState = 'growing' | 'paused' | 'completed' | 'abandoned';
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L26)

State of a reasoning tree.

- `growing`: Tree is actively being explored
- `paused`: Tree exploration temporarily paused
- `completed`: Tree has reached conclusion(s)
- `abandoned`: Tree was abandoned (low quality or pruned)

---

### TrinityPhase

```ts
type TrinityPhase = 'thinking' | 'working' | 'verifying' | 'complete';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L102)

Phase of TRINITY coordination.

---

### TrinityRole

```ts
type TrinityRole = 'thinker' | 'worker' | 'verifier';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L20)

TRINITY-specific roles.

---

### VoteDecision

```ts
type VoteDecision = 'approve' | 'reject' | 'abstain';
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-types.ts#L62)

Vote decision options for consensus protocol.

---

### WaveTaskExecutor

```ts
type WaveTaskExecutor<T> = (task) => Promise<string>;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L142)

Executor function that processes a single WaveTask.
Returns the output string (which will be truncated by the scheduler).

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### task

[`WaveTask`](#wavetask)\<`T`\>

#### Returns

`Promise`\<`string`\>

## Variables

### ActivationStrategySchema

```ts
const ActivationStrategySchema: ZodEnum<{
  adaptive: 'adaptive';
  diverse: 'diverse';
  greedy: 'greedy';
  ucb: 'ucb';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L30)

Schema for ActivationStrategy validation.

---

### AgentMessageSchema

```ts
const AgentMessageSchema: ZodObject<
  {
    from: ZodString;
    id: ZodString;
    payload: ZodUnknown;
    timestamp: ZodString;
    to: ZodString;
    type: ZodEnum<{
      feedback: 'feedback';
      query: 'query';
      result: 'result';
      status: 'status';
      task: 'task';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/agent-schemas.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agent-schemas.ts#L54)

Zod schema for validating AgentMessage objects.

---

### BaseAgentOptionsSchema

```ts
const BaseAgentOptionsSchema: ZodObject<
  {
    capabilities: ZodArray<
      ZodEnum<{
        code_generation: 'code_generation';
        code_review: 'code_review';
        collaboration: 'collaboration';
        delegation: 'delegation';
        research: 'research';
        task_execution: 'task_execution';
        tool_use: 'tool_use';
      }>
    >;
    contextPruning: ZodOptional<
      ZodObject<
        {
          enabled: ZodOptional<ZodBoolean>;
          maxTokens: ZodOptional<ZodNumber>;
          reserveTokens: ZodOptional<ZodNumber>;
          strategy: ZodOptional<
            ZodEnum<{
              hierarchical: 'hierarchical';
              lowest_priority: 'lowest_priority';
              oldest_first: 'oldest_first';
              priority_weighted_age: 'priority_weighted_age';
              semantic: 'semantic';
              sliding_window: 'sliding_window';
              summarize: 'summarize';
            }>
          >;
          triggerThreshold: ZodOptional<ZodNumber>;
        },
        $strip
      >
    >;
    id: ZodString;
    maxTokens: ZodOptional<ZodNumber>;
    role: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      custom: 'custom';
      data_visualization_expert: 'data_visualization_expert';
      devops_expert: 'devops_expert';
      documentation_expert: 'documentation_expert';
      infrastructure_expert: 'infrastructure_expert';
      orchestrator: 'orchestrator';
      pm_expert: 'pm_expert';
      qa_expert: 'qa_expert';
      research_expert: 'research_expert';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
      thinker: 'thinker';
      ux_expert: 'ux_expert';
      verifier: 'verifier';
      worker: 'worker';
    }>;
    systemPrompt: ZodOptional<ZodString>;
    temperature: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/agent-schemas.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agent-schemas.ts#L93)

Zod schema for validating BaseAgentOptions.

---

### BestSolutionSchema

```ts
const BestSolutionSchema: ZodObject<
  {
    combinedScore: ZodNumber;
    conclusionNode: ZodObject<
      {
        activationScore: ZodNumber;
        children: ZodArray<ZodString>;
        confidence: ZodNumber;
        content: ZodString;
        createdAt: ZodNumber;
        depth: ZodNumber;
        estimatedValue: ZodNumber;
        id: ZodString;
        isActive: ZodBoolean;
        metadata: ZodObject<
          {
            crossReferences: ZodOptional<ZodArray<ZodString>>;
            custom: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
            generationTimeMs: ZodOptional<ZodNumber>;
            source: ZodOptional<ZodString>;
            tokensUsed: ZodOptional<ZodNumber>;
          },
          $strip
        >;
        parentId: ZodNullable<ZodString>;
        qualityScore: ZodNumber;
        state: ZodEnum<{
          active: 'active';
          completed: 'completed';
          error: 'error';
          pending: 'pending';
          pruned: 'pruned';
        }>;
        stepType: ZodEnum<{
          conclusion: 'conclusion';
          decomposition: 'decomposition';
          hypothesis: 'hypothesis';
          inference: 'inference';
          synthesis: 'synthesis';
          verification: 'verification';
        }>;
        treeId: ZodString;
        updatedAt: ZodNumber;
      },
      $strip
    >;
    confidence: ZodNumber;
    path: ZodArray<ZodString>;
    qualityScore: ZodNumber;
    treeId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L73)

Schema for BestSolution validation.

---

### BUILT_IN_EXPERTS

```ts
const BUILT_IN_EXPERTS: Readonly<Record<BuiltInExpertType, ExpertConfig>>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L182)

Built-in expert configurations.
These provide sensible defaults for common expert types.

---

### BuiltInExpertTypeSchema

```ts
const BuiltInExpertTypeSchema: ZodEnum<{
  architecture: "architecture";
  code: "code";
  data-visualization: "data-visualization";
  devops: "devops";
  documentation: "documentation";
  infrastructure: "infrastructure";
  pm: "pm";
  qa: "qa";
  research: "research";
  security: "security";
  testing: "testing";
  ux: "ux";
}>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L163)

Zod schema for BuiltInExpertType.

MUST stay in lockstep with the `BuiltInExpertType` type union above.
Tested by `BuiltInExpertTypeSchema accepts every literal in BuiltInExpertType`
in expert-config.test.ts to prevent drift (#2338).

---

### CodeChangeSchema

```ts
const CodeChangeSchema: ZodObject<
  {
    description: ZodString;
    file: ZodString;
    lineRange: ZodOptional<
      ZodObject<
        {
          end: ZodNumber;
          start: ZodNumber;
        },
        $strip
      >
    >;
    modified: ZodString;
    original: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:280](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L280)

Code change schema.

---

### CollaborationConfigSchema

```ts
const CollaborationConfigSchema: ZodObject<{
  experts: ZodArray<ZodString>;
  maxRetries: ZodOptional<ZodNumber>;
  minVotes: ZodOptional<ZodNumber>;
  pattern: ZodEnum<{
     aegean: "aegean";
     consensus: "consensus";
     parallel: "parallel";
     reflexion: "reflexion";
     review: "review";
     self-debug: "self-debug";
     self-refine: "self-refine";
     sequential: "sequential";
  }>;
  requireUnanimous: ZodOptional<ZodBoolean>;
  sessionId: ZodString;
  task: ZodObject<{
     constraints: ZodOptional<ZodObject<{
        allowedTools: ZodOptional<ZodArray<ZodString>>;
        maxDuration: ZodOptional<ZodNumber>;
        maxTokens: ZodOptional<ZodNumber>;
        outputFormat: ZodOptional<ZodEnum<{
           json: "json";
           markdown: "markdown";
           text: "text";
        }>>;
     }, $strip>>;
     context: ZodRecord<ZodString, ZodUnknown>;
     description: ZodString;
     id: ZodString;
     priority: ZodOptional<ZodNumber>;
  }, $strip>;
  timeout: ZodOptional<ZodNumber>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L45)

Zod schema for CollaborationConfig.

---

### CollaborationPatternSchema

```ts
const CollaborationPatternSchema: ZodEnum<{
  aegean: "aegean";
  consensus: "consensus";
  parallel: "parallel";
  reflexion: "reflexion";
  review: "review";
  self-debug: "self-debug";
  self-refine: "self-refine";
  sequential: "sequential";
}>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:12](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L12)

Zod schema for CollaborationPattern.

---

### ContentPriority

```ts
const ContentPriority: {
  ACTIVE: 60;
  EPHEMERAL: 20;
  HISTORY: 40;
  SYSTEM: 100;
  TASK: 80;
};
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L13)

Priority levels for context content.
Higher priority content is retained longer during pruning.

#### Type Declaration

##### ACTIVE

```ts
readonly ACTIVE: 60 = 60;
```

Active working content (recent code, research)

##### EPHEMERAL

```ts
readonly EPHEMERAL: 20 = 20;
```

Ephemeral content (debug logs, temp data)

##### HISTORY

```ts
readonly HISTORY: 40 = 40;
```

Historical context (older messages, results)

##### SYSTEM

```ts
readonly SYSTEM: 100 = 100;
```

System instructions - highest priority, never pruned

##### TASK

```ts
readonly TASK: 80 = 80;
```

Current task description and requirements

---

### ContextBudgetSchema

```ts
const ContextBudgetSchema: ZodObject<
  {
    active: ZodNumber;
    reserved: ZodNumber;
    system: ZodNumber;
    task: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L56)

Zod schema for ContextBudget validation.

---

### ContextManagerConfigSchema

```ts
const ContextManagerConfigSchema: ZodObject<
  {
    budget: ZodOptional<
      ZodObject<
        {
          active: ZodNumber;
          reserved: ZodNumber;
          system: ZodNumber;
          task: ZodNumber;
        },
        $strip
      >
    >;
    maxTokens: ZodNumber;
    warningThreshold: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L111)

Schema for ContextManagerConfig validation.

---

### ContextPrunerConfigSchema

```ts
const ContextPrunerConfigSchema: ZodObject<
  {
    autoTriggerThreshold: ZodOptional<ZodNumber>;
    defaultStrategy: ZodOptional<
      ZodEnum<{
        hierarchical: 'hierarchical';
        lowest_priority: 'lowest_priority';
        oldest_first: 'oldest_first';
        priority_weighted_age: 'priority_weighted_age';
        semantic: 'semantic';
        sliding_window: 'sliding_window';
        summarize: 'summarize';
      }>
    >;
    minItemsPerCategory: ZodOptional<ZodNumber>;
    protectedPriority: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L64)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

---

### CoverageMetricsSchema

```ts
const CoverageMetricsSchema: ZodObject<
  {
    branch: ZodNumber;
    function: ZodNumber;
    line: ZodNumber;
    statement: ZodNumber;
    uncoveredAreas: ZodOptional<ZodArray<ZodString>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:307](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L307)

Coverage metrics schema.

---

### CrossTreeInfoSchema

```ts
const CrossTreeInfoSchema: ZodObject<
  {
    failurePatterns: ZodArray<
      ZodObject<
        {
          avgFailureScore: ZodNumber;
          occurrences: ZodNumber;
          pattern: ZodString;
        },
        $strip
      >
    >;
    sharedConclusions: ZodArray<
      ZodObject<
        {
          confidence: ZodNumber;
          content: ZodString;
          qualityScore: ZodNumber;
          sourceNodeId: ZodString;
          sourceTreeId: ZodString;
        },
        $strip
      >
    >;
    sharedInsights: ZodArray<
      ZodObject<
        {
          content: ZodString;
          relevance: ZodNumber;
          sourceNodeId: ZodString;
          sourceTreeId: ZodString;
        },
        $strip
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L119)

Schema for CrossTreeInfo validation.

---

### CrossTreeStrategySchema

```ts
const CrossTreeStrategySchema: ZodEnum<{
  conclusions: 'conclusions';
  full: 'full';
  insights: 'insights';
  none: 'none';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L45)

Schema for CrossTreeStrategy validation.

---

### DEFAULT_ACTIVATION_OPTIONS

```ts
const DEFAULT_ACTIVATION_OPTIONS: ActivationOptions;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L204)

Default activation options.

---

### DEFAULT_BUDGET

```ts
const DEFAULT_BUDGET: ContextBudget;
```

Defined in: [packages/nexus-agents/src/agents/context-manager-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-manager-types.ts#L46)

Default budget allocation percentages.

---

### DEFAULT_FOREST_CONFIG

```ts
const DEFAULT_FOREST_CONFIG: ForestConfig;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L154)

Default Forest-of-Thought configuration.

---

### DEFAULT_MAX_RETRIES

```ts
const DEFAULT_MAX_RETRIES: 2 = 2;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L130)

Default retry counts.

---

### DEFAULT_PATH_SCORING_OPTIONS

```ts
const DEFAULT_PATH_SCORING_OPTIONS: PathScoringOptions;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L116)

Default path scoring options.

---

### DEFAULT_TIMEOUTS

```ts
const DEFAULT_TIMEOUTS: {
  aegean: number;
  consensus: number;
  parallel: number;
  reflexion: number;
  review: number;
  self-debug: number;
  self-refine: number;
  sequential: number;
};
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L116)

Default collaboration timeouts.

#### Type Declaration

##### aegean

```ts
readonly aegean: number;
```

##### consensus

```ts
readonly consensus: number;
```

##### parallel

```ts
readonly parallel: number;
```

##### reflexion

```ts
readonly reflexion: number;
```

##### review

```ts
readonly review: number;
```

##### self-debug

```ts
readonly self-debug: number;
```

##### self-refine

```ts
readonly self-refine: number;
```

##### sequential

```ts
readonly sequential: number;
```

---

### DEFAULT_TRINITY_CONFIG

```ts
const DEFAULT_TRINITY_CONFIG: Required<TrinityConfig>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L173)

Default TRINITY configuration.

---

### DEFAULT_WAVE_CONFIG

```ts
const DEFAULT_WAVE_CONFIG: WaveSchedulerConfig;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler-types.ts#L42)

Default wave scheduler configuration.
Matches CLAUDE.md guidelines: waves of 3-4, 2000 char output budget.

---

### EXPERT_CAPABILITIES

```ts
const EXPERT_CAPABILITIES: Readonly<Record<AgentRole, readonly string[]>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:354](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L354)

Expert role capabilities mapping.
Maps each expert role to their core capabilities.

---

### EXPERT_DEFAULT_CAPABILITIES

```ts
const EXPERT_DEFAULT_CAPABILITIES: Record<AgentRole, readonly AgentCapability[]>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:329](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L329)

Default capabilities for each expert role.

---

### EXPERT_DEFAULT_TEMPERATURES

```ts
const EXPERT_DEFAULT_TEMPERATURES: Record<ExpertDomain, number>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:318](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L318)

Default temperatures for each expert domain.

---

### EXPERT_TYPE_TO_ROLE

```ts
const EXPERT_TYPE_TO_ROLE: Readonly<Record<BuiltInExpertType, AgentRole>>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:576](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L576)

Maps built-in expert types to their AgentRole.

---

### ExpertAssignmentSchema

```ts
const ExpertAssignmentSchema: ZodObject<
  {
    confidence: ZodNumber;
    expertRole: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      custom: 'custom';
      devops_expert: 'devops_expert';
      documentation_expert: 'documentation_expert';
      infrastructure_expert: 'infrastructure_expert';
      orchestrator: 'orchestrator';
      pm_expert: 'pm_expert';
      research_expert: 'research_expert';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
      ux_expert: 'ux_expert';
    }>;
    ictmConfig: ZodOptional<
      ZodObject<
        {
          context: ZodObject<
            {
              includeHistory: ZodBoolean;
              maxTokens: ZodNumber;
              pruneStrategy: ZodEnum<{
                hybrid: 'hybrid';
                importance: 'importance';
                recency: 'recency';
              }>;
              relevanceThreshold: ZodNumber;
            },
            $strip
          >;
          instructions: ZodString;
          metadata: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
          model: ZodObject<
            {
              maxTokens: ZodOptional<ZodNumber>;
              modelId: ZodOptional<ZodString>;
              provider: ZodOptional<ZodString>;
              reasoning: ZodOptional<
                ZodEnum<{
                  extended: 'extended';
                  minimal: 'minimal';
                  standard: 'standard';
                }>
              >;
              temperature: ZodOptional<ZodNumber>;
            },
            $strip
          >;
          tools: ZodObject<
            {
              capabilities: ZodArray<ZodString>;
              restrictions: ZodOptional<ZodArray<ZodString>>;
            },
            $strip
          >;
        },
        $strip
      >
    >;
    selectionReason: ZodString;
    subtaskId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:276](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L276)

Zod schema for ExpertAssignment.

---

### ExpertCollaborationPattern

```ts
const ExpertCollaborationPattern: {
  PAIR: 'pair';
  PARALLEL: 'parallel';
  REVIEW_CHAIN: 'review_chain';
  SEQUENTIAL: 'sequential';
};
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L21)

Collaboration patterns for multi-expert tasks.

#### Type Declaration

##### PAIR

```ts
readonly PAIR: "pair" = 'pair';
```

##### PARALLEL

```ts
readonly PARALLEL: "parallel" = 'parallel';
```

##### REVIEW_CHAIN

```ts
readonly REVIEW_CHAIN: "review_chain" = 'review_chain';
```

##### SEQUENTIAL

```ts
readonly SEQUENTIAL: "sequential" = 'sequential';
```

---

### ExpertConfigSchema

```ts
const ExpertConfigSchema: ZodObject<
  {
    capabilities: ZodArray<
      ZodEnum<{
        code_generation: 'code_generation';
        code_review: 'code_review';
        collaboration: 'collaboration';
        delegation: 'delegation';
        research: 'research';
        task_execution: 'task_execution';
        tool_use: 'tool_use';
      }>
    >;
    id: ZodString;
    metadata: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    modelPreference: ZodOptional<
      ZodObject<
        {
          maxTokens: ZodOptional<ZodNumber>;
          modelId: ZodOptional<ZodString>;
          provider: ZodOptional<ZodString>;
          temperature: ZodOptional<ZodNumber>;
        },
        $strip
      >
    >;
    name: ZodString;
    role: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      custom: 'custom';
      data_visualization_expert: 'data_visualization_expert';
      devops_expert: 'devops_expert';
      documentation_expert: 'documentation_expert';
      infrastructure_expert: 'infrastructure_expert';
      orchestrator: 'orchestrator';
      pm_expert: 'pm_expert';
      qa_expert: 'qa_expert';
      research_expert: 'research_expert';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
      ux_expert: 'ux_expert';
    }>;
    systemPrompt: ZodString;
    toolRestrictions: ZodOptional<
      ZodObject<
        {
          allowedTools: ZodOptional<ZodArray<ZodString>>;
          deniedTools: ZodOptional<ZodArray<ZodString>>;
        },
        $strip
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L145)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

---

### ExpertDomainSchema

```ts
const ExpertDomainSchema: ZodEnum<{
  architecture: 'architecture';
  code: 'code';
  documentation: 'documentation';
  security: 'security';
  testing: 'testing';
}>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L229)

Expert domain schema.

---

### ExpertFactory

```ts
const ExpertFactory: {
  create: (config, options?) => Result<Expert, FactoryError>;
  createAllBuiltIn: (options?) => Result<Expert[], FactoryError>;
  createBuiltIn: (type, options?) => Result<Expert, FactoryError>;
  createFromICTM: (ictm, subtaskId, options?) => Result<Expert, FactoryError>;
  createMany: (configs, options?) => Result<Expert[], FactoryError>;
  getBuiltInConfig: (type) => Result<ExpertConfig, FactoryError>;
  validate: (config) => Result<ExpertConfig, FactoryError>;
};
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-factory.ts:434](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-factory.ts#L434)

Factory namespace for creating expert agents.
Provides static methods for backward compatibility.

#### Type Declaration

##### create

```ts
readonly create: (config, options?) => Result<Expert, FactoryError> = createExpert;
```

Create an expert agent from a configuration object.

###### Parameters

###### config

[`ExpertConfig`](#expertconfig-2)

Expert configuration

###### options?

[`CreateExpertOptions`](#createexpertoptions)

Creation options including adapter

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert), [`FactoryError`](#factoryerror)\>

Result with Expert or FactoryError

###### Example

```typescript
const config: ExpertConfig = {
  id: 'my-expert',
  name: 'My Expert',
  role: 'code_expert',
  capabilities: ['task_execution'],
  systemPrompt: 'You are a code review expert.',
};
const result = createExpert(config, { adapter: myAdapter });
if (result.ok) {
  const expert = result.value;
}
```

##### createAllBuiltIn

```ts
readonly createAllBuiltIn: (options?) => Result<Expert[], FactoryError> = createAllBuiltInExperts;
```

Create all built-in experts.

###### Parameters

###### options?

[`CreateExpertOptions`](#createexpertoptions)

Creation options applied to all experts

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert)[], [`FactoryError`](#factoryerror)\>

Result with array of all built-in Experts

##### createBuiltIn

```ts
readonly createBuiltIn: (type, options?) => Result<Expert, FactoryError> = createBuiltInExpert;
```

Create a built-in expert by type.

Built-in types include: 'code', 'architecture', 'security',
'documentation', and 'testing'.

###### Parameters

###### type

[`BuiltInExpertType`](#builtinexperttype)

Built-in expert type

###### options?

[`CreateExpertOptions`](#createexpertoptions)

Creation options including adapter

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert), [`FactoryError`](#factoryerror)\>

Result with Expert or FactoryError

###### Example

```typescript
const result = createBuiltInExpert('security', { adapter: myAdapter });
if (result.ok) {
  const securityExpert = result.value;
}
```

##### createFromICTM

```ts
createFromICTM: (ictm, subtaskId, options?) => Result<Expert, FactoryError>;
```

Create an expert agent from an ICTM configuration (Issue #756).

Bridges the ICTM pattern to the existing expert factory by converting
the ICTM config to an ExpertConfig and delegating to createExpert().

###### Parameters

###### ictm

[`ICTMConfig`](exports/agents-ictm.md#ictmconfig)

ICTM configuration with instructions, context, tools, model

###### subtaskId

`string`

Subtask identifier used for naming

###### options?

[`CreateExpertOptions`](#createexpertoptions)

Creation options including adapter

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert), [`FactoryError`](#factoryerror)\>

Result with Expert or FactoryError

##### createMany

```ts
readonly createMany: (configs, options?) => Result<Expert[], FactoryError> = createManyExperts;
```

Create multiple experts from configurations.

###### Parameters

###### configs

[`ExpertConfig`](#expertconfig-2)[]

Array of expert configurations

###### options?

[`CreateExpertOptions`](#createexpertoptions)

Creation options applied to all experts

###### Returns

[`Result`](core.md#result)\<[`Expert`](#expert)[], [`FactoryError`](#factoryerror)\>

Result with array of Experts or first FactoryError

##### getBuiltInConfig

```ts
readonly getBuiltInConfig: (type) => Result<ExpertConfig, FactoryError> = getBuiltInExpertConfig;
```

Get the configuration for a built-in expert type.

###### Parameters

###### type

[`BuiltInExpertType`](#builtinexperttype)

Built-in expert type

###### Returns

[`Result`](core.md#result)\<[`ExpertConfig`](#expertconfig-2), [`FactoryError`](#factoryerror)\>

Result with config or FactoryError if type invalid

##### validate

```ts
readonly validate: (config) => Result<ExpertConfig, FactoryError> = validateExpertConfigStrict;
```

Validate a configuration without creating an expert.

###### Parameters

###### config

`unknown`

Configuration to validate

###### Returns

[`Result`](core.md#result)\<[`ExpertConfig`](#expertconfig-2), [`FactoryError`](#factoryerror)\>

Result with validated config or FactoryError

---

### ExpertMatchSchema

```ts
const ExpertMatchSchema: ZodObject<
  {
    expertId: ZodString;
    matchedCapabilities: ZodArray<ZodString>;
    reasoning: ZodString;
    score: ZodNumber;
    scoreBreakdown: ZodObject<
      {
        capabilityScore: ZodNumber;
        domainScore: ZodNumber;
        finalScore: ZodNumber;
        weightScore: ZodNumber;
      },
      $strip
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L128)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

---

### ExpertOptionsSchema

```ts
const ExpertOptionsSchema: ZodObject<
  {
    additionalCapabilities: ZodOptional<ZodArray<ZodString>>;
    enableHeuristics: ZodOptional<ZodBoolean>;
    maxTokens: ZodOptional<ZodNumber>;
    systemPromptOverride: ZodOptional<ZodString>;
    temperature: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L240)

Expert options schema.

---

### ExpertOutputSchema

```ts
const ExpertOutputSchema: ZodObject<
  {
    confidence: ZodNumber;
    content: ZodString;
    recommendations: ZodOptional<ZodArray<ZodString>>;
    structuredData: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    warnings: ZodOptional<ZodArray<ZodString>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:251](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L251)

Expert output schema.

---

### ExpertParticipationSchema

```ts
const ExpertParticipationSchema: ZodObject<
  {
    expertId: ZodString;
    joinedAt: ZodISODateTime;
    retryCount: ZodNumber;
    role: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      custom: 'custom';
      documentation_expert: 'documentation_expert';
      orchestrator: 'orchestrator';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
    }>;
    status: ZodEnum<{
      failed: 'failed';
      pending: 'pending';
      reviewing: 'reviewing';
      submitted: 'submitted';
      voted: 'voted';
      working: 'working';
    }>;
    submittedAt: ZodOptional<ZodISODateTime>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L72)

Zod schema for ExpertParticipation.

---

### ExplorationEventSchema

```ts
const ExplorationEventSchema: ZodObject<
  {
    details: ZodRecord<ZodString, ZodUnknown>;
    eventType: ZodEnum<{
      conclusion_reached: 'conclusion_reached';
      cross_tree_share: 'cross_tree_share';
      forest_completed: 'forest_completed';
      forest_converging: 'forest_converging';
      node_activated: 'node_activated';
      node_completed: 'node_completed';
      node_created: 'node_created';
      node_deactivated: 'node_deactivated';
      node_pruned: 'node_pruned';
      path_scored: 'path_scored';
      tree_completed: 'tree_completed';
      tree_created: 'tree_created';
    }>;
    nodeId: ZodOptional<ZodString>;
    timestamp: ZodNumber;
    treeId: ZodOptional<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L140)

Schema for ExplorationEvent validation.

---

### ExplorationEventTypeSchema

```ts
const ExplorationEventTypeSchema: ZodEnum<{
  conclusion_reached: 'conclusion_reached';
  cross_tree_share: 'cross_tree_share';
  forest_completed: 'forest_completed';
  forest_converging: 'forest_converging';
  node_activated: 'node_activated';
  node_completed: 'node_completed';
  node_created: 'node_created';
  node_deactivated: 'node_deactivated';
  node_pruned: 'node_pruned';
  path_scored: 'path_scored';
  tree_completed: 'tree_completed';
  tree_created: 'tree_created';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L106)

Schema for ExplorationEventType validation.

---

### FailurePatternSchema

```ts
const FailurePatternSchema: ZodObject<
  {
    avgFailureScore: ZodNumber;
    occurrences: ZodNumber;
    pattern: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L98)

Schema for FailurePattern validation.

---

### ForestConfigSchema

```ts
const ForestConfigSchema: ZodObject<
  {
    activationBudget: ZodDefault<ZodNumber>;
    activationStrategy: ZodDefault<
      ZodEnum<{
        adaptive: 'adaptive';
        diverse: 'diverse';
        greedy: 'greedy';
        ucb: 'ucb';
      }>
    >;
    confidenceThreshold: ZodDefault<ZodNumber>;
    crossTreeStrategy: ZodDefault<
      ZodEnum<{
        conclusions: 'conclusions';
        full: 'full';
        insights: 'insights';
        none: 'none';
      }>
    >;
    earlyTerminationThreshold: ZodDefault<ZodNumber>;
    enableCrossTreeSharing: ZodDefault<ZodBoolean>;
    enableEarlyTermination: ZodDefault<ZodBoolean>;
    enableParallelExploration: ZodDefault<ZodBoolean>;
    explorationConstant: ZodDefault<ZodNumber>;
    maxDepth: ZodDefault<ZodNumber>;
    maxExplorationTimeMs: ZodDefault<ZodNumber>;
    maxNodesPerTree: ZodDefault<ZodNumber>;
    maxTokensPerTree: ZodDefault<ZodNumber>;
    maxTrees: ZodDefault<ZodNumber>;
    minScoreThreshold: ZodDefault<ZodNumber>;
    nodeTimeoutMs: ZodDefault<ZodNumber>;
    parallelThreads: ZodDefault<ZodNumber>;
    pruningStrategy: ZodDefault<
      ZodEnum<{
        combined: 'combined';
        depth: 'depth';
        none: 'none';
        score: 'score';
      }>
    >;
    seed: ZodDefault<ZodNullable<ZodNumber>>;
    sparsityRatio: ZodDefault<ZodNumber>;
    temperature: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L122)

Schema for ForestConfig validation.

---

### ForestPruningStrategySchema

```ts
const ForestPruningStrategySchema: ZodEnum<{
  combined: 'combined';
  depth: 'depth';
  none: 'none';
  score: 'score';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-config-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-config-types.ts#L60)

Schema for ForestPruningStrategy validation.

---

### ForestResultSchema

```ts
const ForestResultSchema: ZodObject<{
  bestSolution: ZodNullable<ZodObject<{
     combinedScore: ZodNumber;
     conclusionNode: ZodObject<{
        activationScore: ZodNumber;
        children: ZodArray<ZodString>;
        confidence: ZodNumber;
        content: ZodString;
        createdAt: ZodNumber;
        depth: ZodNumber;
        estimatedValue: ZodNumber;
        id: ZodString;
        isActive: ZodBoolean;
        metadata: ZodObject<{
           crossReferences: ZodOptional<ZodArray<...>>;
           custom: ZodOptional<ZodRecord<..., ...>>;
           generationTimeMs: ZodOptional<ZodNumber>;
           source: ZodOptional<ZodString>;
           tokensUsed: ZodOptional<ZodNumber>;
        }, $strip>;
        parentId: ZodNullable<ZodString>;
        qualityScore: ZodNumber;
        state: ZodEnum<{
           active: "active";
           completed: "completed";
           error: "error";
           pending: "pending";
           pruned: "pruned";
        }>;
        stepType: ZodEnum<{
           conclusion: "conclusion";
           decomposition: "decomposition";
           hypothesis: "hypothesis";
           inference: "inference";
           synthesis: "synthesis";
           verification: "verification";
        }>;
        treeId: ZodString;
        updatedAt: ZodNumber;
     }, $strip>;
     confidence: ZodNumber;
     path: ZodArray<ZodString>;
     qualityScore: ZodNumber;
     treeId: ZodString;
  }, $strip>>;
  durationMs: ZodNumber;
  explorationHistory: ZodOptional<ZodArray<ZodObject<{
     details: ZodRecord<ZodString, ZodUnknown>;
     eventType: ZodEnum<{
        conclusion_reached: "conclusion_reached";
        cross_tree_share: "cross_tree_share";
        forest_completed: "forest_completed";
        forest_converging: "forest_converging";
        node_activated: "node_activated";
        node_completed: "node_completed";
        node_created: "node_created";
        node_deactivated: "node_deactivated";
        node_pruned: "node_pruned";
        path_scored: "path_scored";
        tree_completed: "tree_completed";
        tree_created: "tree_created";
     }>;
     nodeId: ZodOptional<ZodString>;
     timestamp: ZodNumber;
     treeId: ZodOptional<ZodString>;
  }, $strip>>>;
  finalState: ZodEnum<{
     completed: "completed";
     converging: "converging";
     exploring: "exploring";
     initializing: "initializing";
     timeout: "timeout";
  }>;
  forestId: ZodString;
  problem: ZodString;
  statistics: ZodObject<{
     activationRatio: ZodNumber;
     activeTrees: ZodNumber;
     avgTreeScore: ZodNumber;
     bestPathScore: ZodNumber;
     maxDepth: ZodNumber;
     totalActiveNodes: ZodNumber;
     totalExplorationTimeMs: ZodNumber;
     totalNodes: ZodNumber;
     totalTokensUsed: ZodNumber;
     totalTrees: ZodNumber;
  }, $strip>;
  terminationReason: ZodEnum<{
     convergence: "convergence";
     error: "error";
     max_depth: "max_depth";
     max_time: "max_time";
     max_tokens: "max_tokens";
     no_progress: "no_progress";
     solution_found: "solution_found";
  }>;
  topPaths: ZodArray<ZodObject<{
     breakdown: ZodObject<{
        coherenceScore: ZodNumber;
        conclusionBonus: ZodNumber;
        confidenceScore: ZodNumber;
        depthFactor: ZodNumber;
        qualityScore: ZodNumber;
     }, $strip>;
     length: ZodNumber;
     path: ZodArray<ZodString>;
     reachesConclusion: ZodBoolean;
     score: ZodNumber;
     targetNodeId: ZodString;
     treeId: ZodString;
  }, $strip>>;
  totalTokensUsed: ZodNumber;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L187)

Schema for ForestResult validation (partial).

---

### ForestStateSchema

```ts
const ForestStateSchema: ZodEnum<{
  completed: 'completed';
  converging: 'converging';
  exploring: 'exploring';
  initializing: 'initializing';
  timeout: 'timeout';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L33)

Schema for ForestState validation.

---

### ForestStatisticsSchema

```ts
const ForestStatisticsSchema: ZodObject<
  {
    activationRatio: ZodNumber;
    activeTrees: ZodNumber;
    avgTreeScore: ZodNumber;
    bestPathScore: ZodNumber;
    maxDepth: ZodNumber;
    totalActiveNodes: ZodNumber;
    totalExplorationTimeMs: ZodNumber;
    totalNodes: ZodNumber;
    totalTokensUsed: ZodNumber;
    totalTrees: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-state-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-state-types.ts#L74)

Schema for ForestStatistics validation.

---

### GeneratedTestSchema

```ts
const GeneratedTestSchema: ZodObject<
  {
    code: ZodString;
    name: ZodString;
    scenarios: ZodArray<ZodString>;
    target: ZodString;
    type: ZodEnum<{
      e2e: 'e2e';
      integration: 'integration';
      unit: 'unit';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:296](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L296)

Generated test schema.

---

### MIN_EXPERTS_FOR_PATTERN

```ts
const MIN_EXPERTS_FOR_PATTERN: {
  aegean: 3;
  consensus: 3;
  parallel: 2;
  reflexion: 1;
  review: 2;
  self-debug: 1;
  self-refine: 1;
  sequential: 1;
};
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L135)

Minimum number of experts for each pattern.

#### Type Declaration

##### aegean

```ts
readonly aegean: 3 = 3;
```

##### consensus

```ts
readonly consensus: 3 = 3;
```

##### parallel

```ts
readonly parallel: 2 = 2;
```

##### reflexion

```ts
readonly reflexion: 1 = 1;
```

##### review

```ts
readonly review: 2 = 2;
```

##### self-debug

```ts
readonly self-debug: 1 = 1;
```

##### self-refine

```ts
readonly self-refine: 1 = 1;
```

##### sequential

```ts
readonly sequential: 1 = 1;
```

---

### ModelPreferenceSchema

```ts
const ModelPreferenceSchema: ZodObject<
  {
    maxTokens: ZodOptional<ZodNumber>;
    modelId: ZodOptional<ZodString>;
    provider: ZodOptional<ZodString>;
    temperature: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L85)

Zod schema for ModelPreference.

---

### NodeStateSchema

```ts
const NodeStateSchema: ZodEnum<{
  active: 'active';
  completed: 'completed';
  error: 'error';
  pending: 'pending';
  pruned: 'pruned';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L50)

Schema for NodeState validation.

---

### OrchestratorOptionsSchema

```ts
const OrchestratorOptionsSchema: ZodObject<
  {
    decompositionThreshold: ZodOptional<ZodNumber>;
    enableParallelHints: ZodOptional<ZodBoolean>;
    expertWeights: ZodOptional<ZodRecord<ZodString, ZodNumber>>;
    maxSubtasks: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L343)

Zod schema for OrchestratorOptions.

---

### PathScoreBreakdownSchema

```ts
const PathScoreBreakdownSchema: ZodObject<
  {
    coherenceScore: ZodNumber;
    conclusionBonus: ZodNumber;
    confidenceScore: ZodNumber;
    depthFactor: ZodNumber;
    qualityScore: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L56)

Schema for PathScoreBreakdown validation.

---

### PathScoreSchema

```ts
const PathScoreSchema: ZodObject<
  {
    breakdown: ZodObject<
      {
        coherenceScore: ZodNumber;
        conclusionBonus: ZodNumber;
        confidenceScore: ZodNumber;
        depthFactor: ZodNumber;
        qualityScore: ZodNumber;
      },
      $strip
    >;
    length: ZodNumber;
    path: ZodArray<ZodString>;
    reachesConclusion: ZodBoolean;
    score: ZodNumber;
    targetNodeId: ZodString;
    treeId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L87)

Schema for PathScore validation.

---

### PruningStrategy

```ts
const PruningStrategy: {
  HIERARCHICAL: 'hierarchical';
  LOWEST_PRIORITY: 'lowest_priority';
  OLDEST_FIRST: 'oldest_first';
  PRIORITY_WEIGHTED_AGE: 'priority_weighted_age';
  SEMANTIC: 'semantic';
  SLIDING_WINDOW: 'sliding_window';
  SUMMARIZE: 'summarize';
};
```

Defined in: [packages/nexus-agents/src/agents/context-pruner.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/context-pruner.ts#L41)

Strategy for pruning context when budget is exceeded.

#### Type Declaration

##### HIERARCHICAL

```ts
readonly HIERARCHICAL: "hierarchical" = 'hierarchical';
```

##### LOWEST_PRIORITY

```ts
readonly LOWEST_PRIORITY: "lowest_priority" = 'lowest_priority';
```

##### OLDEST_FIRST

```ts
readonly OLDEST_FIRST: "oldest_first" = 'oldest_first';
```

##### PRIORITY_WEIGHTED_AGE

```ts
readonly PRIORITY_WEIGHTED_AGE: "priority_weighted_age" = 'priority_weighted_age';
```

##### SEMANTIC

```ts
readonly SEMANTIC: "semantic" = 'semantic';
```

##### SLIDING_WINDOW

```ts
readonly SLIDING_WINDOW: "sliding_window" = 'sliding_window';
```

##### SUMMARIZE

```ts
readonly SUMMARIZE: "summarize" = 'summarize';
```

---

### ReasoningNodeMetadataSchema

```ts
const ReasoningNodeMetadataSchema: ZodObject<
  {
    crossReferences: ZodOptional<ZodArray<ZodString>>;
    custom: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    generationTimeMs: ZodOptional<ZodNumber>;
    source: ZodOptional<ZodString>;
    tokensUsed: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L105)

Schema for ReasoningNodeMetadata validation.

---

### ReasoningNodeSchema

```ts
const ReasoningNodeSchema: ZodObject<
  {
    activationScore: ZodNumber;
    children: ZodArray<ZodString>;
    confidence: ZodNumber;
    content: ZodString;
    createdAt: ZodNumber;
    depth: ZodNumber;
    estimatedValue: ZodNumber;
    id: ZodString;
    isActive: ZodBoolean;
    metadata: ZodObject<
      {
        crossReferences: ZodOptional<ZodArray<ZodString>>;
        custom: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
        generationTimeMs: ZodOptional<ZodNumber>;
        source: ZodOptional<ZodString>;
        tokensUsed: ZodOptional<ZodNumber>;
      },
      $strip
    >;
    parentId: ZodNullable<ZodString>;
    qualityScore: ZodNumber;
    state: ZodEnum<{
      active: 'active';
      completed: 'completed';
      error: 'error';
      pending: 'pending';
      pruned: 'pruned';
    }>;
    stepType: ZodEnum<{
      conclusion: 'conclusion';
      decomposition: 'decomposition';
      hypothesis: 'hypothesis';
      inference: 'inference';
      synthesis: 'synthesis';
      verification: 'verification';
    }>;
    treeId: ZodString;
    updatedAt: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L159)

Schema for ReasoningNode validation.

---

### ReasoningStepTypeSchema

```ts
const ReasoningStepTypeSchema: ZodEnum<{
  conclusion: 'conclusion';
  decomposition: 'decomposition';
  hypothesis: 'hypothesis';
  inference: 'inference';
  synthesis: 'synthesis';
  verification: 'verification';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-node-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-node-types.ts#L73)

Schema for ReasoningStepType validation.

---

### ReasoningTreeSchema

```ts
const ReasoningTreeSchema: ZodObject<
  {
    createdAt: ZodNumber;
    explorationPriority: ZodNumber;
    forestId: ZodString;
    hypothesis: ZodString;
    id: ZodString;
    overallScore: ZodNumber;
    rootId: ZodString;
    state: ZodEnum<{
      abandoned: 'abandoned';
      completed: 'completed';
      growing: 'growing';
      paused: 'paused';
    }>;
    statistics: ZodObject<
      {
        activeNodes: ZodNumber;
        avgBranchingFactor: ZodNumber;
        avgConfidence: ZodNumber;
        avgQualityScore: ZodNumber;
        conclusionCount: ZodNumber;
        maxDepth: ZodNumber;
        totalNodes: ZodNumber;
        totalTokensUsed: ZodNumber;
      },
      $strip
    >;
    updatedAt: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L205)

Schema for ReasoningTree validation (partial, excludes Map for JSON).

---

### ReviewResponseMessageSchema

```ts
const ReviewResponseMessageSchema: ZodObject<
  {
    approved: ZodBoolean;
    feedback: ZodString;
    requesterId: ZodString;
    reviewerId: ZodString;
    severity: ZodOptional<
      ZodEnum<{
        critical: 'critical';
        major: 'major';
        minor: 'minor';
        none: 'none';
      }>
    >;
    suggestions: ZodOptional<ZodArray<ZodString>>;
    type: ZodLiteral<'review_response'>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L103)

Zod schema for ReviewResponseMessage.

---

### ScoreBreakdownSchema

```ts
const ScoreBreakdownSchema: ZodObject<
  {
    capabilityScore: ZodNumber;
    domainScore: ZodNumber;
    finalScore: ZodNumber;
    weightScore: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L121)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

---

### SelectionOptionsSchema

```ts
const SelectionOptionsSchema: ZodObject<
  {
    capabilityWeights: ZodOptional<ZodRecord<ZodString, ZodNumber>>;
    excludeExperts: ZodOptional<ZodArray<ZodString>>;
    forceCollaboration: ZodOptional<ZodBoolean>;
    maxAlternatives: ZodOptional<ZodNumber>;
    minScore: ZodOptional<ZodNumber>;
    preferredDomains: ZodOptional<
      ZodArray<
        ZodEnum<{
          architecture: 'architecture';
          code: 'code';
          documentation: 'documentation';
          general: 'general';
          security: 'security';
          testing: 'testing';
        }>
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L144)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

---

### SelectionResultSchema

```ts
const SelectionResultSchema: ZodObject<
  {
    alternatives: ZodArray<
      ZodObject<
        {
          expertId: ZodString;
          matchedCapabilities: ZodArray<ZodString>;
          reasoning: ZodString;
          score: ZodNumber;
          scoreBreakdown: ZodObject<
            {
              capabilityScore: ZodNumber;
              domainScore: ZodNumber;
              finalScore: ZodNumber;
              weightScore: ZodNumber;
            },
            $strip
          >;
        },
        $strip
      >
    >;
    confidence: ZodNumber;
    primary: ZodObject<
      {
        expertId: ZodString;
        matchedCapabilities: ZodArray<ZodString>;
        reasoning: ZodString;
        score: ZodNumber;
        scoreBreakdown: ZodObject<
          {
            capabilityScore: ZodNumber;
            domainScore: ZodNumber;
            finalScore: ZodNumber;
            weightScore: ZodNumber;
          },
          $strip
        >;
      },
      $strip
    >;
    requiresCollaboration: ZodBoolean;
    suggestedPattern: ZodOptional<
      ZodEnum<{
        pair: 'pair';
        parallel: 'parallel';
        review_chain: 'review_chain';
        sequential: 'sequential';
      }>
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector-types.ts#L136)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

---

### SessionStatusSchema

```ts
const SessionStatusSchema: ZodEnum<{
  awaiting_review: 'awaiting_review';
  completed: 'completed';
  failed: 'failed';
  finalizing: 'finalizing';
  in_progress: 'in_progress';
  pending: 'pending';
  timed_out: 'timed_out';
  voting: 'voting';
}>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L26)

Zod schema for SessionStatus.

---

### SharedConclusionSchema

```ts
const SharedConclusionSchema: ZodObject<
  {
    confidence: ZodNumber;
    content: ZodString;
    qualityScore: ZodNumber;
    sourceNodeId: ZodString;
    sourceTreeId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L51)

Schema for SharedConclusion validation.

---

### SharedInsightSchema

```ts
const SharedInsightSchema: ZodObject<
  {
    content: ZodString;
    relevance: ZodNumber;
    sourceNodeId: ZodString;
    sourceTreeId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-types.ts#L76)

Schema for SharedInsight validation.

---

### SubtaskPrioritySchema

```ts
const SubtaskPrioritySchema: ZodEnum<{
  critical: 'critical';
  high: 'high';
  low: 'low';
  medium: 'medium';
}>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L192)

Zod schema for SubtaskPriority.

---

### SubTaskSchema

```ts
const SubTaskSchema: ZodObject<
  {
    assignedRole: ZodOptional<
      ZodEnum<{
        architecture_expert: 'architecture_expert';
        code_expert: 'code_expert';
        custom: 'custom';
        devops_expert: 'devops_expert';
        documentation_expert: 'documentation_expert';
        infrastructure_expert: 'infrastructure_expert';
        orchestrator: 'orchestrator';
        pm_expert: 'pm_expert';
        research_expert: 'research_expert';
        security_expert: 'security_expert';
        testing_expert: 'testing_expert';
        ux_expert: 'ux_expert';
      }>
    >;
    complexity: ZodNumber;
    dependencies: ZodArray<ZodString>;
    description: ZodString;
    expectedOutput: ZodString;
    id: ZodString;
    parentTaskId: ZodString;
    priority: ZodEnum<{
      critical: 'critical';
      high: 'high';
      low: 'low';
      medium: 'medium';
    }>;
    requiredCapabilities: ZodArray<ZodString>;
    status: ZodEnum<{
      assigned: 'assigned';
      completed: 'completed';
      failed: 'failed';
      in_progress: 'in_progress';
      pending: 'pending';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:208](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L208)

Zod schema for SubTask.

---

### SubtaskStatusSchema

```ts
const SubtaskStatusSchema: ZodEnum<{
  assigned: 'assigned';
  completed: 'completed';
  failed: 'failed';
  in_progress: 'in_progress';
  pending: 'pending';
}>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L197)

Zod schema for SubtaskStatus.

---

### SynthesizedResultSchema

```ts
const SynthesizedResultSchema: ZodObject<
  {
    collaborationMetadata: ZodOptional<
      ZodObject<
        {
          agreementLevel: ZodNumber;
          participantCount: ZodNumber;
          pattern: ZodString;
          sessionId: ZodString;
        },
        $strip
      >
    >;
    combinedOutput: ZodString;
    conflicts: ZodArray<
      ZodObject<
        {
          description: ZodString;
          resolution: ZodString;
          subtaskId1: ZodString;
          subtaskId2: ZodString;
        },
        $strip
      >
    >;
    qualityScore: ZodNumber;
    recommendations: ZodArray<ZodString>;
    resultSummaries: ZodArray<
      ZodObject<
        {
          contributions: ZodArray<ZodString>;
          quality: ZodNumber;
          subtaskId: ZodString;
          summary: ZodString;
        },
        $strip
      >
    >;
    summary: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:330](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L330)

Zod schema for SynthesizedResult.

---

### TASK_TYPE_EXPERTS

```ts
const TASK_TYPE_EXPERTS: Readonly<Record<string, AgentRole>>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:379](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L379)

Task type to expert role mapping.
Maps common task types to their primary expert roles.

---

### TaskAnalysisSchema

```ts
const TaskAnalysisSchema: ZodObject<
  {
    approach: ZodString;
    commitment: ZodOptional<
      ZodObject<
        {
          approach: ZodString;
          constraints: ZodArray<ZodString>;
          differentiation: ZodString;
          purpose: ZodString;
        },
        $strip
      >
    >;
    complexity: ZodPipe<
      ZodUnion<readonly [ZodNumber, ZodString]>,
      ZodTransform<number, string | number>
    >;
    estimatedEffort: ZodPipe<
      ZodUnion<readonly [ZodNumber, ZodString]>,
      ZodTransform<number, string | number>
    >;
    needsDecomposition: ZodPipe<
      ZodUnion<readonly [ZodBoolean, ZodString]>,
      ZodTransform<boolean, string | boolean>
    >;
    requirements: ZodArray<ZodString>;
    risks: ZodArray<ZodString>;
    taskId: ZodString;
    taskType: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead-types.ts#L244)

Zod schema for TaskAnalysis.
Uses coercion and transforms for numeric fields because LLMs
may return numbers as strings or descriptive words (Issue #663).

---

### TaskSchema

```ts
const TaskSchema: ZodObject<
  {
    constraints: ZodOptional<
      ZodObject<
        {
          maxDuration: ZodOptional<ZodNumber>;
          maxTokens: ZodOptional<ZodNumber>;
        },
        $strip
      >
    >;
    context: ZodObject<
      {
        files: ZodOptional<ZodArray<ZodString>>;
        history: ZodOptional<
          ZodArray<
            ZodObject<
              {
                content: ZodString;
                role: ZodEnum<{
                  assistant: 'assistant';
                  system: 'system';
                  user: 'user';
                }>;
                timestamp: ZodString;
              },
              $strip
            >
          >
        >;
        metadata: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
        workingDirectory: ZodOptional<ZodString>;
      },
      $strip
    >;
    description: ZodString;
    id: ZodString;
    priority: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/agent-schemas.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agent-schemas.ts#L13)

Zod schema for validating Task objects.

---

### TerminationReasonSchema

```ts
const TerminationReasonSchema: ZodEnum<{
  convergence: 'convergence';
  error: 'error';
  max_depth: 'max_depth';
  max_time: 'max_time';
  max_tokens: 'max_tokens';
  no_progress: 'no_progress';
  solution_found: 'solution_found';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-result-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-result-types.ts#L38)

Schema for TerminationReason validation.

---

### TreeStateSchema

```ts
const TreeStateSchema: ZodEnum<{
  abandoned: 'abandoned';
  completed: 'completed';
  growing: 'growing';
  paused: 'paused';
}>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L31)

Schema for TreeState validation.

---

### TreeStatisticsSchema

```ts
const TreeStatisticsSchema: ZodObject<
  {
    activeNodes: ZodNumber;
    avgBranchingFactor: ZodNumber;
    avgConfidence: ZodNumber;
    avgQualityScore: ZodNumber;
    conclusionCount: ZodNumber;
    maxDepth: ZodNumber;
    totalNodes: ZodNumber;
    totalTokensUsed: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/reasoning/forest-tree-types.ts#L153)

Schema for TreeStatistics validation.

---

### TRINITY_ROLE_MAX_TOKENS

```ts
const TRINITY_ROLE_MAX_TOKENS: Record<TrinityRole, number>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L91)

Default max tokens for TRINITY roles.

---

### TRINITY_ROLE_PROMPTS

```ts
const TRINITY_ROLE_PROMPTS: Record<TrinityRole, string>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L35)

Default prompts for each TRINITY role.

---

### TRINITY_ROLE_TEMPERATURES

```ts
const TRINITY_ROLE_TEMPERATURES: Record<TrinityRole, number>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L84)

Default temperatures for TRINITY roles.

---

### TrinityConfigSchema

```ts
const TrinityConfigSchema: ZodObject<
  {
    includeHistory: ZodOptional<ZodBoolean>;
    maxIterations: ZodOptional<ZodNumber>;
    roleConfigs: ZodOptional<
      ZodRecord<
        ZodEnum<{
          thinker: 'thinker';
          verifier: 'verifier';
          worker: 'worker';
        }>,
        ZodObject<
          {
            maxTokens: ZodOptional<ZodNumber>;
            systemPrompt: ZodOptional<ZodString>;
            temperature: ZodOptional<ZodNumber>;
          },
          $strip
        >
      >
    >;
    timeoutMs: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L220)

Schema for TrinityConfig.

---

### TrinityPhaseSchema

```ts
const TrinityPhaseSchema: ZodEnum<{
  complete: 'complete';
  thinking: 'thinking';
  verifying: 'verifying';
  working: 'working';
}>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L214)

Schema for TRINITY phase.

---

### TrinityRoleSchema

```ts
const TrinityRoleSchema: ZodEnum<{
  thinker: 'thinker';
  verifier: 'verifier';
  worker: 'worker';
}>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L211)

Schema for TRINITY role.

---

### TrinityStopReasonSchema

```ts
const TrinityStopReasonSchema: ZodEnum<{
  error: 'error';
  max_iterations: 'max_iterations';
  timeout: 'timeout';
  verified: 'verified';
}>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L237)

Schema for stop reason.

---

### VerifierVerdictSchema

```ts
const VerifierVerdictSchema: ZodEnum<{
  fail: 'fail';
  pass: 'pass';
}>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-types.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-types.ts#L217)

Schema for verifier verdict.

---

### VoteDecisionSchema

```ts
const VoteDecisionSchema: ZodEnum<{
  abstain: 'abstain';
  approve: 'approve';
  reject: 'reject';
}>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L40)

Zod schema for VoteDecision.

---

### VoteMessageSchema

```ts
const VoteMessageSchema: ZodObject<
  {
    conditions: ZodOptional<ZodArray<ZodString>>;
    decision: ZodEnum<{
      abstain: 'abstain';
      approve: 'approve';
      reject: 'reject';
    }>;
    expertId: ZodString;
    reasoning: ZodString;
    type: ZodLiteral<'vote'>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-schemas.ts#L92)

Zod schema for VoteMessage.

---

### VulnerabilitySchema

```ts
const VulnerabilitySchema: ZodObject<
  {
    cweId: ZodOptional<ZodString>;
    description: ZodString;
    id: ZodString;
    location: ZodOptional<ZodString>;
    remediation: ZodString;
    severity: ZodEnum<{
      critical: 'critical';
      high: 'high';
      info: 'info';
      low: 'low';
      medium: 'medium';
    }>;
    type: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L267)

Vulnerability schema.

---

### VulnerabilitySeveritySchema

```ts
const VulnerabilitySeveritySchema: ZodEnum<{
  critical: 'critical';
  high: 'high';
  info: 'info';
  low: 'low';
  medium: 'medium';
}>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-types.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-types.ts#L262)

Vulnerability severity schema.

## Functions

### aggregateResults()

```ts
function aggregateResults(input, options?): Result<AggregatedResult, AgentError>;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L201)

Convenience function to aggregate results.

#### Parameters

##### input

[`AggregatorInput`](#aggregatorinput)

##### options?

[`AggregatorOptions`](#aggregatoroptions)

#### Returns

[`Result`](core.md#result)\<[`AggregatedResult`](#aggregatedresult), [`AgentError`](core.md#agenterror)\>

---

### chunkByDirectory()

```ts
function chunkByDirectory(files, basePath): WorkChunk[];
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler.ts#L362)

Partition a list of file paths into directory-scoped chunks.
Each chunk corresponds to a top-level directory within the base path.

#### Parameters

##### files

readonly `string`[]

Array of file paths

##### basePath

`string`

Base path prefix to strip for grouping

#### Returns

[`WorkChunk`](#workchunk)[]

Array of work chunks grouped by top-level directory

---

### createAgenticAdapter()

```ts
function createAgenticAdapter(modelAdapter, options?): IAgenticAdapter;
```

Defined in: [packages/nexus-agents/src/agents/agentic/factory.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/agentic/factory.ts#L25)

Build an `IAgenticAdapter` for the supplied model adapter.

Stamps `adapterStrategy` based on the model's `providerId` so
downstream eval results record which path they exercised. Future
provider-specialised concretes will set their own strategy.

#### Parameters

##### modelAdapter

[`IModelAdapter`](core.md#imodeladapter)

##### options?

[`AgenticAdapterOptions`](#agenticadapteroptions) = `{}`

#### Returns

[`IAgenticAdapter`](#iagenticadapter)

---

### createArchitectureExpert()

```ts
function createArchitectureExpert(options?): ArchitectureExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/architecture-expert.ts:255](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/architecture-expert.ts#L255)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Parameters

##### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`ArchitectureExpertOptions`](#architectureexpertoptions);
\}

#### Returns

[`ArchitectureExpert`](#architectureexpert)

---

### createCodeExpert()

```ts
function createCodeExpert(options?): CodeExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/code-expert.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/code-expert.ts#L221)

Creates a new CodeExpert agent with the given options.

#### Parameters

##### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`CodeExpertOptions`](#codeexpertoptions);
\}

#### Returns

[`CodeExpert`](#codeexpert)

---

### createCollaborationSession()

```ts
function createCollaborationSession(options?): CollaborationSession;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-session.ts:429](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-session.ts#L429)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Parameters

##### options?

[`CollaborationSessionOptions`](#collaborationsessionoptions)

#### Returns

[`CollaborationSession`](#collaborationsession)

---

### createDefaultRegistry()

```ts
function createDefaultRegistry(): SelectionExpertRegistry;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector.ts#L114)

Creates a default expert registry with built-in experts.

#### Returns

[`SelectionExpertRegistry`](#selectionexpertregistry)

---

### createDocumentationExpert()

```ts
function createDocumentationExpert(options?): DocumentationExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/documentation-expert.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/documentation-expert.ts#L311)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Parameters

##### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`DocumentationExpertOptions`](#documentationexpertoptions);
\}

#### Returns

[`DocumentationExpert`](#documentationexpert)

---

### createOrchestrator()

```ts
function createOrchestrator(options?): Orchestrator;
```

Defined in: [packages/nexus-agents/src/agents/tech-lead.ts:553](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/tech-lead.ts#L553)

Creates a new Orchestrator agent with the given options.
This is the preferred factory function for creating coordination agents.

#### Parameters

##### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`orchestratorOptions?`: [`OrchestratorOptions`](#orchestratoroptions);
\}

Agent configuration options

#### Returns

[`Orchestrator`](#orchestrator)

Orchestrator agent instance

#### Example

```typescript
const orchestrator = createOrchestrator({
  orchestratorOptions: { maxSubtasks: 5 },
});
const result = await orchestrator.execute(task);
```

---

### createProtocolFactory()

```ts
function createProtocolFactory(options?): ProtocolFactory;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts:312](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/collaboration-protocol.ts#L312)

Creates a protocol factory.

#### Parameters

##### options?

[`ProtocolOptions`](#protocoloptions)

#### Returns

[`ProtocolFactory`](#protocolfactory)

---

### createResultAggregator()

```ts
function createResultAggregator(options?): ResultAggregator;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/result-aggregator.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/result-aggregator.ts#L194)

Creates a result aggregator.

#### Parameters

##### options?

[`AggregatorOptions`](#aggregatoroptions)

#### Returns

[`ResultAggregator`](#resultaggregator)

---

### createSecurityExpert()

```ts
function createSecurityExpert(options?): SecurityExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/security-expert.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/security-expert.ts#L242)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Parameters

##### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`SecurityExpertOptions`](#securityexpertoptions);
\}

#### Returns

[`SecurityExpert`](#securityexpert)

---

### createStateMachine()

```ts
function createStateMachine(options?): AgentStateMachine;
```

Defined in: [packages/nexus-agents/src/agents/state-machine.ts:333](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/state-machine.ts#L333)

Creates a new agent state machine.

#### Parameters

##### options?

[`StateMachineOptions`](#statemachineoptions-1)

State machine options

#### Returns

[`AgentStateMachine`](#agentstatemachine)

A new AgentStateMachine instance

---

### createTestingExpert()

```ts
function createTestingExpert(options?): TestingExpert;
```

Defined in: [packages/nexus-agents/src/agents/experts/testing-expert.ts:347](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/testing-expert.ts#L347)

Agents exports - Agent framework, Orchestrator, Experts
Split from index.ts for file size compliance (Issue #285)

#### Parameters

##### options?

`Partial`\<[`BaseAgentOptions`](#baseagentoptions)\> & \{
`expertOptions?`: [`TestingExpertOptions`](#testingexpertoptions);
\}

#### Returns

[`TestingExpert`](#testingexpert)

---

### createTrinityCoordinator()

```ts
function createTrinityCoordinator(config?): TrinityCoordinator;
```

Defined in: [packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts:398](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts#L398)

Creates a TRINITY coordinator instance.

#### Parameters

##### config?

[`TrinityConfig`](#trinityconfig)

#### Returns

[`TrinityCoordinator`](#trinitycoordinator)

---

### createWaveScheduler()

```ts
function createWaveScheduler(config?, logger?): WaveScheduler;
```

Defined in: [packages/nexus-agents/src/agents/wave-scheduler.ts:394](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/wave-scheduler.ts#L394)

Create a new WaveScheduler instance with the given configuration.

#### Parameters

##### config?

`Partial`\<[`WaveSchedulerConfig`](#waveschedulerconfig)\> = `{}`

##### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`WaveScheduler`](#wavescheduler)

---

### getExpertRegistry()

```ts
function getExpertRegistry(): ExpertRegistry;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-registry.ts:402](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-registry.ts#L402)

Get the global expert registry instance.

#### Returns

[`ExpertRegistry`](#expertregistry)

---

### quickSelect()

```ts
function quickSelect(task, options?): Result<SelectionResult, SelectionError>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector.ts:404](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector.ts#L404)

Quick selection using default registry.
Convenience function for simple use cases.
Uses a cached registry for performance optimization.

#### Parameters

##### task

[`Task`](core.md#task)

##### options?

[`SelectionOptions`](#selectionoptions)

#### Returns

[`Result`](core.md#result)\<[`SelectionResult`](#selectionresult), [`SelectionError`](#selectionerror)\>

---

### safeValidateExpertConfig()

```ts
function safeValidateExpertConfig(config):
  | {
      data: ExpertConfig;
      success: true;
    }
  | {
      error: ZodError;
      success: false;
    };
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:605](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L605)

Safely validates an expert configuration.

#### Parameters

##### config

`unknown`

Configuration to validate

#### Returns

\| \{
`data`: [`ExpertConfig`](#expertconfig-2);
`success`: `true`;
\}
\| \{
`error`: `ZodError`;
`success`: `false`;
\}

Safe parse result with success/error

---

### selectExperts()

```ts
function selectExperts(task, registry, options?): Result<SelectionResult, SelectionError>;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-selector.ts:370](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-selector.ts#L370)

Selects the best experts for a task.

#### Parameters

##### task

[`Task`](core.md#task)

The task to select experts for

##### registry

[`SelectionExpertRegistry`](#selectionexpertregistry)

Registry of available experts

##### options?

[`SelectionOptions`](#selectionoptions)

Optional selection configuration

#### Returns

[`Result`](core.md#result)\<[`SelectionResult`](#selectionresult), [`SelectionError`](#selectionerror)\>

---

### validateExpertConfig()

```ts
function validateExpertConfig(config): ExpertConfig;
```

Defined in: [packages/nexus-agents/src/agents/experts/expert-config.ts:596](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/experts/expert-config.ts#L596)

Validates an expert configuration.

#### Parameters

##### config

`unknown`

Configuration to validate

#### Returns

[`ExpertConfig`](#expertconfig-2)

Parsed config or throws on validation error
