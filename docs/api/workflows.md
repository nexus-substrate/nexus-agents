---
title: 'API: workflows'
description: Generated API reference for workflows.
tier: 2
---

# workflows

## Classes

### AgentStepExecutor

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L101)

Executor for individual workflow steps.

#### Constructors

##### Constructor

```ts
new AgentStepExecutor(deps): AgentStepExecutor;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L104)

###### Parameters

###### deps

[`StepExecutorDeps`](#stepexecutordeps)

###### Returns

[`AgentStepExecutor`](#agentstepexecutor)

#### Methods

##### execute()

```ts
execute(
   step,
   context,
options?): Promise<Result<StepResult, WorkflowError>>;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L108)

###### Parameters

###### step

[`WorkflowStep`](core.md#workflowstep)

###### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

###### options?

[`StepExecutionOptions`](#stepexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`StepResult`](core.md#stepresult), [`WorkflowError`](core.md#workflowerror)\>\>

---

### DependencyGraph

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L26)

Dependency graph for workflow steps.

#### Constructors

##### Constructor

```ts
new DependencyGraph(): DependencyGraph;
```

###### Returns

[`DependencyGraph`](#dependencygraph)

#### Methods

##### addStep()

```ts
addStep(step): void;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L33)

Adds a step to the graph.

###### Parameters

###### step

[`WorkflowStep`](core.md#workflowstep)

The workflow step to add

###### Returns

`void`

##### buildReverseLinks()

```ts
buildReverseLinks(): void;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L45)

Builds the reverse dependency links (dependents).

###### Returns

`void`

##### detectCycles()

```ts
detectCycles(): Result<string[], ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L157)

Detects circular dependencies using Kahn's algorithm.

###### Returns

[`Result`](core.md#result)\<`string`[], [`ParseError`](core.md#parseerror)\>

Result with topologically sorted step IDs or ParseError for cycles

##### getExecutionOrder()

```ts
getExecutionOrder(): Result<string[], ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L242)

Gets the execution order (topologically sorted step IDs).

###### Returns

[`Result`](core.md#result)\<`string`[], [`ParseError`](core.md#parseerror)\>

Result with sorted step IDs or ParseError

##### getNode()

```ts
getNode(id): GraphNode | undefined;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L66)

Gets a node by step ID.

###### Parameters

###### id

`string`

###### Returns

`GraphNode` \| `undefined`

##### getStepIds()

```ts
getStepIds(): string[];
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L59)

Gets all step IDs in the graph.

###### Returns

`string`[]

##### validateReferences()

```ts
validateReferences(): Result<void, ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L74)

Validates that all dependency references exist.

###### Returns

[`Result`](core.md#result)\<`void`, [`ParseError`](core.md#parseerror)\>

Result with void or ParseError containing missing references

##### validateUniqueIds()

```ts
static validateUniqueIds(steps): Result<void, ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L100)

Validates that all step IDs are unique.

###### Parameters

###### steps

[`WorkflowStep`](core.md#workflowstep)[]

Array of workflow steps

###### Returns

[`Result`](core.md#result)\<`void`, [`ParseError`](core.md#parseerror)\>

Result with void or ParseError for duplicates

---

### ExpertFactoryAdapter

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L45)

Wrapper to adapt ExpertFactory to IExpertFactory interface.

#### Implements

- [`WorkflowExpertFactory`](#workflowexpertfactory)

#### Constructors

##### Constructor

```ts
new ExpertFactoryAdapter(factory): ExpertFactoryAdapter;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L48)

###### Parameters

###### factory

###### create

(`config`, `options?`) => [`Result`](core.md#result)\<[`Expert`](agents.md#expert), [`FactoryError`](agents.md#factoryerror)\> = `createExpert`

###### createAllBuiltIn

(`options?`) => [`Result`](core.md#result)\<[`Expert`](agents.md#expert)[], [`FactoryError`](agents.md#factoryerror)\> = `createAllBuiltInExperts`

###### createBuiltIn

(`type`, `options?`) => [`Result`](core.md#result)\<[`Expert`](agents.md#expert), [`FactoryError`](agents.md#factoryerror)\> = `createBuiltInExpert`

###### createFromICTM

(`ictm`, `subtaskId`, `options?`) => [`Result`](core.md#result)\<[`Expert`](agents.md#expert), [`FactoryError`](agents.md#factoryerror)\>

###### createMany

(`configs`, `options?`) => [`Result`](core.md#result)\<[`Expert`](agents.md#expert)[], [`FactoryError`](agents.md#factoryerror)\> = `createManyExperts`

###### getBuiltInConfig

(`type`) => [`Result`](core.md#result)\<[`ExpertConfig`](agents.md#expertconfig-2), [`FactoryError`](agents.md#factoryerror)\> = `getBuiltInExpertConfig`

###### validate

(`config`) => [`Result`](core.md#result)\<[`ExpertConfig`](agents.md#expertconfig-2), [`FactoryError`](agents.md#factoryerror)\> = `validateExpertConfigStrict`

###### Returns

[`ExpertFactoryAdapter`](#expertfactoryadapter)

#### Methods

##### createForRole()

```ts
createForRole(role): Result<Expert, Error>;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L52)

###### Parameters

###### role

[`AgentRole`](core.md#agentrole)

###### Returns

[`Result`](core.md#result)\<[`Expert`](agents.md#expert), `Error`\>

###### Implementation of

[`WorkflowExpertFactory`](#workflowexpertfactory).[`createForRole`](#createforrole-1)

---

### TaskQueue

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L27)

A task queue that limits concurrent execution.

#### Type Parameters

##### T

`T`

The return type of tasks in this queue

#### Constructors

##### Constructor

```ts
new TaskQueue<T>(concurrency?): TaskQueue<T>;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L39)

Creates a new TaskQueue.

###### Parameters

###### concurrency?

`number` = `5`

Maximum number of concurrent tasks (default: 5)

###### Returns

[`TaskQueue`](#taskqueue)\<`T`\>

#### Methods

##### add()

```ts
add(task): Promise<T>;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L54)

Adds a task to the queue for execution.

###### Parameters

###### task

`Task`\<`T`\>

The async task to execute

###### Returns

`Promise`\<`T`\>

Promise that resolves with the task result

###### Throws

Error if the queue has been cancelled

##### cancel()

```ts
cancel(): void;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L69)

Cancels all pending and running tasks.
Running tasks receive an abort signal.

###### Returns

`void`

##### getAbortSignal()

```ts
getAbortSignal(): AbortSignal;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L105)

Returns the abort signal for external use.

###### Returns

`AbortSignal`

##### getQueuedCount()

```ts
getQueuedCount(): number;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L98)

Returns the number of tasks waiting in the queue.

###### Returns

`number`

##### getRunningCount()

```ts
getRunningCount(): number;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L91)

Returns the number of currently running tasks.

###### Returns

`number`

##### isCancelled()

```ts
isCancelled(): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L84)

Returns whether the queue has been cancelled.

###### Returns

`boolean`

---

### TemplateRegistry

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L33)

Template registry implementation.
Manages both built-in and custom workflow templates.

#### Implements

- [`ITemplateRegistry`](#itemplateregistry)

#### Constructors

##### Constructor

```ts
new TemplateRegistry(): TemplateRegistry;
```

###### Returns

[`TemplateRegistry`](#templateregistry)

#### Accessors

##### isEmpty

###### Get Signature

```ts
get isEmpty(): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:312](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L312)

Check if the registry is empty.
IRegistry interface method.

###### Returns

`boolean`

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:304](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L304)

Get the number of registered templates.
IRegistry interface method.

###### Returns

`number`

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L322)

Clear all templates (built-in and custom).
IRegistry interface method.

WARNING: This removes built-in templates. Use clearCustom() to only clear custom templates.

###### Returns

`void`

##### clearCustom()

```ts
clearCustom(): void;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:227](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L227)

Clear all custom templates (keeps built-in).

###### Returns

`void`

##### get()

```ts
get(id): Result<TemplateMetadata, TemplateRegistryError>;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L253)

Get template metadata by ID.
IRegistry interface method.

###### Parameters

###### id

`string`

Template ID to retrieve

###### Returns

[`Result`](core.md#result)\<[`TemplateMetadata`](#templatemetadata), `TemplateRegistryError`\>

Result with TemplateMetadata or TemplateRegistryError

##### getAll()

```ts
getAll(): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L82)

Get all registered templates.

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`getAll`](#getall-1)

##### getAllIds()

```ts
getAllIds(): string[];
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:285](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L285)

Get all registered template IDs.
IRegistry interface method.

###### Returns

`string`[]

Array of all registered template IDs

##### getBuiltIn()

```ts
getBuiltIn(): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L75)

Get all built-in templates.

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`getBuiltIn`](#getbuiltin-1)

##### getByCategory()

```ts
getByCategory(category): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L220)

Get templates by category.

###### Parameters

###### category

[`TemplateCategory`](#templatecategory)

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`getByCategory`](#getbycategory-1)

##### getById()

```ts
getById(id): WorkflowDefinition | undefined;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L89)

Get a workflow definition by ID.

###### Parameters

###### id

`string`

###### Returns

[`WorkflowDefinition`](core.md#workflowdefinition) \| `undefined`

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`getById`](#getbyid-1)

##### getStats()

```ts
getStats(): IRegistryStats & {
  builtIn: number;
  custom: number;
};
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:332](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L332)

Get registry statistics.
IRegistry interface method with domain-specific extensions.

###### Returns

`IRegistryStats` & \{
`builtIn`: `number`;
`custom`: `number`;
\}

##### has()

```ts
has(id): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:275](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L275)

Check if a template is registered.
IRegistry interface method.

###### Parameters

###### id

`string`

Template ID to check

###### Returns

`boolean`

True if template is registered

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L44)

Initialize the registry with built-in templates.
Called automatically on first access if not already initialized.
Uses promise coalescing to prevent duplicate init from concurrent calls.

###### Returns

`Promise`\<`void`\>

##### loadFromDirectory()

```ts
loadFromDirectory(directoryPath): Promise<number>;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L164)

Load templates from a directory.

###### Parameters

###### directoryPath

`string`

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`loadFromDirectory`](#loadfromdirectory-1)

##### query()

```ts
query(predicate): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:296](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L296)

Query templates with predicate function.
IRegistry interface method.

###### Parameters

###### predicate

(`item`) => `boolean`

Function to test each template

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

Array of matching templates

##### register()

```ts
register(workflow, partialMetadata?): void;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L96)

Register a custom workflow template.

###### Parameters

###### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

###### partialMetadata?

`Partial`\<[`TemplateMetadata`](#templatemetadata)\>

###### Returns

`void`

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`register`](#register-1)

##### search()

```ts
search(query): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L202)

Search templates by keyword.

###### Parameters

###### query

`string`

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`search`](#search-1)

##### unregister()

```ts
unregister(id): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L145)

Unregister a custom template.

###### Parameters

###### id

`string`

###### Returns

`boolean`

###### Implementation of

[`ITemplateRegistry`](#itemplateregistry).[`unregister`](#unregister-1)

## Interfaces

### CreateExecutionContextOptions

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L42)

Options for creating an execution context.

#### Properties

##### executionId?

```ts
optional executionId?: string;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L48)

Optional custom execution ID (auto-generated if not provided)

##### inputs

```ts
inputs: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L46)

Workflow inputs

##### workflowId

```ts
workflowId: string;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L44)

Workflow definition ID

---

### ExecutionContext

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L30)

Context passed to step executor.

#### Properties

##### executionId

```ts
executionId: string;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L32)

Workflow execution ID

##### inputs

```ts
inputs: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L36)

Workflow inputs

##### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L38)

Abort signal for cancellation

##### stepResults

```ts
stepResults: Map<string, StepResult>;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L34)

Results from previous steps

---

### ExecutionPhase

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L15)

A phase of steps that can be executed concurrently.

#### Properties

##### phaseIndex

```ts
phaseIndex: number;
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L19)

Phase index (0-based)

##### steps

```ts
steps: WorkflowStep[];
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L17)

Steps that can run in parallel within this phase

---

### ITemplateRegistry

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L37)

Template registry interface.

#### Methods

##### getAll()

```ts
getAll(): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L48)

Get all registered templates (built-in + custom).

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

Array of all template metadata

##### getBuiltIn()

```ts
getBuiltIn(): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L42)

Get all built-in templates.

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

Array of built-in template metadata

##### getByCategory()

```ts
getByCategory(category): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L90)

Get templates by category.

###### Parameters

###### category

[`TemplateCategory`](#templatecategory)

Category to filter by

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

Templates in the category

##### getById()

```ts
getById(id): WorkflowDefinition | undefined;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L55)

Get a workflow definition by template ID.

###### Parameters

###### id

`string`

Template name/ID

###### Returns

[`WorkflowDefinition`](core.md#workflowdefinition) \| `undefined`

WorkflowDefinition or undefined if not found

##### loadFromDirectory()

```ts
loadFromDirectory(directoryPath): Promise<number>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L76)

Load templates from a directory.

###### Parameters

###### directoryPath

`string`

Path to directory containing YAML templates

###### Returns

`Promise`\<`number`\>

Number of templates loaded

##### register()

```ts
register(workflow, metadata?): void;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L62)

Register a custom workflow template.

###### Parameters

###### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

Workflow definition to register

###### metadata?

`Partial`\<[`TemplateMetadata`](#templatemetadata)\>

Optional additional metadata

###### Returns

`void`

##### search()

```ts
search(query): TemplateMetadata[];
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L83)

Search templates by keyword.

###### Parameters

###### query

`string`

Search query

###### Returns

[`TemplateMetadata`](#templatemetadata)[]

Matching template metadata

##### unregister()

```ts
unregister(id): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L69)

Unregister a custom template by ID.

###### Parameters

###### id

`string`

Template ID to unregister

###### Returns

`boolean`

True if template was removed

---

### ParallelOptions

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L18)

Options for parallel execution.

#### Properties

##### failFast?

```ts
optional failFast?: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L22)

Stop on first error (default: true)

##### maxConcurrency?

```ts
optional maxConcurrency?: number;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L20)

Maximum concurrent steps (default: 5)

##### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L24)

Overall timeout in milliseconds

---

### ParsedExpression

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L16)

Parsed expression structure.

#### Properties

##### original

```ts
original: string;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L18)

Original expression string

##### path

```ts
path: string[];
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L22)

Path segments after the type

##### type

```ts
type: ExpressionType;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L20)

Expression type (inputs, steps, variables)

---

### ParsedTemplate

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L29)

Result of parsing a template file.

#### Properties

##### definition

```ts
definition: WorkflowDefinition;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L30)

##### metadata

```ts
metadata: TemplateMetadata;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L31)

---

### ResolveResult

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L28)

Result of expression resolution.

#### Properties

##### error?

```ts
optional error?: string;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L34)

Error message if failed

##### success

```ts
success: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L30)

Whether resolution succeeded

##### value?

```ts
optional value?: unknown;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L32)

Resolved value if successful

---

### StepExecutionOptions

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L92)

Options for step execution.

#### Properties

##### retries?

```ts
optional retries?: number;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L94)

##### retryDelayMs?

```ts
optional retryDelayMs?: number;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L95)

##### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L93)

---

### StepExecutorDeps

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L81)

Dependencies for the step executor.

#### Properties

##### expertFactory

```ts
expertFactory: WorkflowExpertFactory;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L82)

##### logger?

```ts
optional logger?: {
  debug: (message, data?) => void;
  error: (message, data?) => void;
  info: (message, data?) => void;
  warn: (message, data?) => void;
};
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L83)

###### debug

```ts
debug: (message, data?) => void;
```

###### Parameters

###### message

`string`

###### data?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

###### error

```ts
error: (message, data?) => void;
```

###### Parameters

###### message

`string`

###### data?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

###### info

```ts
info: (message, data?) => void;
```

###### Parameters

###### message

`string`

###### data?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

###### warn

```ts
warn: (message, data?) => void;
```

###### Parameters

###### message

`string`

###### data?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

---

### TemplateMetadata

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L19)

Extended template metadata for registry.
Implements IRegistryItem for unified registry API (ADR-0012).

#### Extends

- [`WorkflowTemplate`](core.md#workflowtemplate)

#### Properties

##### author?

```ts
optional author?: string;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L29)

Template author

##### builtIn

```ts
builtIn: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L27)

Whether this is a built-in template

##### category

```ts
category: TemplateCategory;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L23)

Template category

###### Overrides

[`WorkflowTemplate`](core.md#workflowtemplate).[`category`](core.md#category)

##### description?

```ts
optional description?: string;
```

Defined in: [packages/nexus-agents/src/core/types/workflow.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/workflow.ts#L143)

Description

###### Inherited from

[`WorkflowTemplate`](core.md#workflowtemplate).[`description`](core.md#description-4)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L21)

Unique identifier (alias for name, required by IRegistryItem)

##### keywords

```ts
keywords: string[];
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L25)

Keywords for search

##### name

```ts
name: string;
```

Defined in: [packages/nexus-agents/src/core/types/workflow.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/workflow.ts#L139)

Template name

###### Inherited from

[`WorkflowTemplate`](core.md#workflowtemplate).[`name`](core.md#name-14)

##### path

```ts
path: string;
```

Defined in: [packages/nexus-agents/src/core/types/workflow.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/workflow.ts#L145)

File path

###### Inherited from

[`WorkflowTemplate`](core.md#workflowtemplate).[`path`](core.md#path)

##### updatedAt?

```ts
optional updatedAt?: string;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L31)

Last updated timestamp

##### version

```ts
version: string;
```

Defined in: [packages/nexus-agents/src/core/types/workflow.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/workflow.ts#L141)

Version

###### Inherited from

[`WorkflowTemplate`](core.md#workflowtemplate).[`version`](core.md#version-1)

---

### ValidationIssue

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L177)

Validation result with detailed error information.

#### Properties

##### code

```ts
code: string;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L183)

Error code from Zod

##### message

```ts
message: string;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L181)

Error message

##### path

```ts
path: PropertyKey[];
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L179)

Path to the problematic field

---

### WorkflowEngineFactoryConfig

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L63)

Configuration for the workflow engine factory.

#### Extends

- `WorkflowEngineConfig`

#### Extended by

- [`WorkflowAdapterConfig`](orchestration.md#workflowadapterconfig)

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

```ts
WorkflowEngineConfig.budgetCircuitBreakerConfig;
```

##### builtInTemplates?

```ts
optional builtInTemplates?: Map<string, WorkflowDefinition>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L65)

Pre-loaded built-in templates (if not provided, loads at creation time)

##### contextManagerConfig?

```ts
optional contextManagerConfig?: Omit<ContextManagerConfig, "budget">;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L41)

###### Inherited from

```ts
WorkflowEngineConfig.contextManagerConfig;
```

##### defaultBudget?

```ts
optional defaultBudget?: ContextBudget;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L42)

###### Inherited from

```ts
WorkflowEngineConfig.defaultBudget;
```

##### defaultTimeoutMs?

```ts
optional defaultTimeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L38)

###### Inherited from

```ts
WorkflowEngineConfig.defaultTimeoutMs;
```

##### enableBudgetEnforcement?

```ts
optional enableBudgetEnforcement?: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L47)

Enable hard budget enforcement (default: false for backward compatibility)

###### Inherited from

```ts
WorkflowEngineConfig.enableBudgetEnforcement;
```

##### expertFactory?

```ts
optional expertFactory?: WorkflowExpertFactory;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L69)

Optional expert factory for dependency injection (useful for testing)

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L43)

###### Inherited from

```ts
WorkflowEngineConfig.logger;
```

##### maxConcurrency?

```ts
optional maxConcurrency?: number;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L39)

###### Inherited from

```ts
WorkflowEngineConfig.maxConcurrency;
```

##### modelAdapter?

```ts
optional modelAdapter?: IModelAdapter;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L67)

Optional pre-configured model adapter for expert agents

##### templatePaths?

```ts
optional templatePaths?: string[];
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-helpers.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-helpers.ts#L40)

###### Inherited from

```ts
WorkflowEngineConfig.templatePaths;
```

##### useMockExecutor?

```ts
optional useMockExecutor?: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L71)

Use mock executor instead of real StepExecutor (default: false when expertFactory provided)

---

### WorkflowExecutionContext

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L17)

Full execution context for a running workflow.
Tracks step results, variables, and provides input resolution.
This is the comprehensive context used by the step executor.

#### Properties

##### cancelled

```ts
cancelled: boolean;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L31)

Whether execution has been cancelled

##### executionId

```ts
readonly executionId: string;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L21)

Unique execution instance ID

##### inputs

```ts
readonly inputs: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L23)

Initial workflow inputs

##### startedAt

```ts
readonly startedAt: Date;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L29)

Execution start time

##### stepResults

```ts
readonly stepResults: Map<string, StepResult>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L25)

Results from completed steps (stepId -> result)

##### variables

```ts
readonly variables: Map<string, unknown>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L27)

Runtime variables set during execution

##### workflowId

```ts
readonly workflowId: string;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L19)

Workflow definition ID

---

### WorkflowExecutionPlan

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L25)

Execution plan with ordered phases.

#### Properties

##### maxParallelism

```ts
maxParallelism: number;
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L31)

Maximum parallelism (max steps in any phase)

##### phases

```ts
phases: ExecutionPhase[];
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L27)

Ordered phases of execution

##### totalSteps

```ts
totalSteps: number;
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L29)

Total number of steps

---

### WorkflowExpertFactory

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L38)

Interface for expert factory dependency.

#### Methods

##### createForRole()

```ts
createForRole(role): Result<Expert, Error>;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L39)

###### Parameters

###### role

[`AgentRole`](core.md#agentrole)

###### Returns

[`Result`](core.md#result)\<[`Expert`](agents.md#expert), `Error`\>

## Type Aliases

### AgentRoleType

```ts
type AgentRoleType = z.infer<typeof StrictAgentRoleSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L63)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

---

### ExpressionType

```ts
type ExpressionType = 'inputs' | 'steps' | 'variables';
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver-types.ts:11](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver-types.ts#L11)

Types of expression references.

---

### InputDefinitionInput

```ts
type InputDefinitionInput = z.input<typeof StrictInputDefinitionSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L46)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

---

### InputDefinitionOutput

```ts
type InputDefinitionOutput = z.output<typeof StrictInputDefinitionSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L47)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

---

### InputType

```ts
type InputType = z.infer<typeof InputTypeSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L19)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

---

### StepExecutor

```ts
type StepExecutor = (step, context) => Promise<StepResult>;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L44)

Function signature for step execution.

#### Parameters

##### step

[`WorkflowStep`](core.md#workflowstep)

##### context

[`ExecutionContext`](#executioncontext)

#### Returns

`Promise`\<[`StepResult`](core.md#stepresult)\>

---

### TemplateCategory

```ts
type TemplateCategory = 'development' | 'review' | 'documentation' | 'testing' | 'custom';
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L13)

Template category for organization.

---

### WorkflowDefinitionInput

```ts
type WorkflowDefinitionInput = z.input<typeof StrictWorkflowDefinitionSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L171)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

---

### WorkflowDefinitionOutput

```ts
type WorkflowDefinitionOutput = z.output<typeof StrictWorkflowDefinitionSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L172)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

---

### WorkflowStepInput

```ts
type WorkflowStepInput = z.input<typeof StrictWorkflowStepSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L129)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

---

### WorkflowStepOutput

```ts
type WorkflowStepOutput = z.output<typeof StrictWorkflowStepSchema>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L130)

Workflows exports - Workflow engine with parallel execution
Split from index.ts for file size compliance (Issue #285)

## Variables

### AgentRoleSchema

```ts
const AgentRoleSchema: ZodEnum<{
  architecture_expert: 'architecture_expert';
  code_expert: 'code_expert';
  custom: 'custom';
  devops_expert: 'devops_expert';
  documentation_expert: 'documentation_expert';
  infrastructure_expert: 'infrastructure_expert';
  orchestrator: 'orchestrator';
  research_expert: 'research_expert';
  security_expert: 'security_expert';
  testing_expert: 'testing_expert';
  thinker: 'thinker';
  verifier: 'verifier';
  worker: 'worker';
}>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L112)

Agent role schema.
Must match AgentRole type in core/types/agent.ts.

---

### BUILT_IN_TEMPLATES

```ts
const BUILT_IN_TEMPLATES: readonly [
  'code-review',
  'docs-audit',
  'feature-implementation',
  'bug-fix',
  'documentation-update',
  'infrastructure-audit',
  'refactoring',
  'research-review',
  'security-audit',
  'standards-review',
  'test-generation',
];
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L211)

Built-in template names.

---

### InputDefinitionSchema

```ts
const InputDefinitionSchema: ZodObject<
  {
    default: ZodOptional<ZodUnknown>;
    description: ZodOptional<ZodString>;
    name: ZodString;
    required: ZodDefault<ZodOptional<ZodBoolean>>;
    type: ZodEnum<{
      array: 'array';
      boolean: 'boolean';
      number: 'number';
      object: 'object';
      string: 'string';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L100)

Input definition schema.

---

### InputTypeSchema

```ts
const InputTypeSchema: ZodEnum<{
  array: 'array';
  boolean: 'boolean';
  number: 'number';
  object: 'object';
  string: 'string';
}>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L17)

Input types supported in workflow definitions.

---

### StrictAgentRoleSchema

```ts
const StrictAgentRoleSchema: ZodEnum<{
  architecture_expert: 'architecture_expert';
  code_expert: 'code_expert';
  custom: 'custom';
  documentation_expert: 'documentation_expert';
  infrastructure_expert: 'infrastructure_expert';
  orchestrator: 'orchestrator';
  security_expert: 'security_expert';
  testing_expert: 'testing_expert';
}>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L52)

Agent roles that can execute workflow steps.

---

### StrictInputDefinitionSchema

```ts
const StrictInputDefinitionSchema: ZodObject<
  {
    default: ZodOptional<ZodUnknown>;
    description: ZodOptional<ZodString>;
    name: ZodString;
    required: ZodDefault<ZodBoolean>;
    type: ZodEnum<{
      array: 'array';
      boolean: 'boolean';
      number: 'number';
      object: 'object';
      string: 'string';
    }>;
  },
  $strict
>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L25)

Schema for workflow input definitions.
Inputs are parameters that must be provided when executing a workflow.

---

### StrictWorkflowDefinitionSchema

```ts
const StrictWorkflowDefinitionSchema: ZodObject<
  {
    defaultBudget: ZodOptional<
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
    description: ZodOptional<ZodString>;
    inputs: ZodDefault<
      ZodArray<
        ZodObject<
          {
            default: ZodOptional<ZodUnknown>;
            description: ZodOptional<ZodString>;
            name: ZodString;
            required: ZodDefault<ZodBoolean>;
            type: ZodEnum<{
              array: 'array';
              boolean: 'boolean';
              number: 'number';
              object: 'object';
              string: 'string';
            }>;
          },
          $strict
        >
      >
    >;
    name: ZodString;
    steps: ZodArray<
      ZodObject<
        {
          action: ZodString;
          agent: ZodEnum<{
            architecture_expert: 'architecture_expert';
            code_expert: 'code_expert';
            custom: 'custom';
            documentation_expert: 'documentation_expert';
            infrastructure_expert: 'infrastructure_expert';
            orchestrator: 'orchestrator';
            security_expert: 'security_expert';
            testing_expert: 'testing_expert';
          }>;
          condition: ZodOptional<ZodString>;
          contextBudget: ZodOptional<
            ZodObject<
              {
                active: ZodOptional<ZodNumber>;
                reserved: ZodOptional<ZodNumber>;
                system: ZodOptional<ZodNumber>;
                task: ZodOptional<ZodNumber>;
              },
              $strip
            >
          >;
          dependsOn: ZodOptional<ZodArray<ZodString>>;
          id: ZodString;
          inputs: ZodDefault<ZodRecord<ZodString, ZodUnknown>>;
          parallel: ZodOptional<ZodBoolean>;
          retries: ZodOptional<ZodNumber>;
          timeout: ZodOptional<ZodNumber>;
        },
        $strict
      >
    >;
    timeout: ZodOptional<ZodNumber>;
    version: ZodString;
  },
  $strict
>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L147)

Schema for a complete workflow definition.
This is the top-level structure of a workflow template file.

---

### StrictWorkflowStepSchema

```ts
const StrictWorkflowStepSchema: ZodObject<
  {
    action: ZodString;
    agent: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      custom: 'custom';
      documentation_expert: 'documentation_expert';
      infrastructure_expert: 'infrastructure_expert';
      orchestrator: 'orchestrator';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
    }>;
    condition: ZodOptional<ZodString>;
    contextBudget: ZodOptional<
      ZodObject<
        {
          active: ZodOptional<ZodNumber>;
          reserved: ZodOptional<ZodNumber>;
          system: ZodOptional<ZodNumber>;
          task: ZodOptional<ZodNumber>;
        },
        $strip
      >
    >;
    dependsOn: ZodOptional<ZodArray<ZodString>>;
    id: ZodString;
    inputs: ZodDefault<ZodRecord<ZodString, ZodUnknown>>;
    parallel: ZodOptional<ZodBoolean>;
    retries: ZodOptional<ZodNumber>;
    timeout: ZodOptional<ZodNumber>;
  },
  $strict
>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-types.ts#L98)

Schema for a single workflow step.
Steps are the atomic units of work in a workflow.

---

### TEMPLATE_CATEGORIES

```ts
const TEMPLATE_CATEGORIES: Record<BuiltInTemplateName, TemplateCategory>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L230)

Category mapping for built-in templates.

---

### TEMPLATE_KEYWORDS

```ts
const TEMPLATE_KEYWORDS: Record<BuiltInTemplateName, string[]>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:247](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L247)

Keywords for built-in templates.

---

### TemplateCategorySchema

```ts
const TemplateCategorySchema: ZodEnum<{
  custom: 'custom';
  development: 'development';
  documentation: 'documentation';
  review: 'review';
  testing: 'testing';
}>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L185)

Template category schema.

---

### TemplateMetadataSchema

```ts
const TemplateMetadataSchema: ZodObject<
  {
    author: ZodOptional<ZodString>;
    builtIn: ZodDefault<ZodBoolean>;
    category: ZodEnum<{
      custom: 'custom';
      development: 'development';
      documentation: 'documentation';
      review: 'review';
      testing: 'testing';
    }>;
    description: ZodOptional<ZodString>;
    keywords: ZodDefault<ZodArray<ZodString>>;
    name: ZodString;
    path: ZodString;
    updatedAt: ZodOptional<ZodString>;
    version: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L196)

Template metadata schema.

---

### WorkflowDefinitionSchema

```ts
const WorkflowDefinitionSchema: ZodPipe<
  ZodObject<
    {
      description: ZodOptional<ZodString>;
      inputs: ZodDefault<
        ZodArray<
          ZodObject<
            {
              default: ZodOptional<ZodUnknown>;
              description: ZodOptional<ZodString>;
              name: ZodString;
              required: ZodDefault<ZodOptional<ZodBoolean>>;
              type: ZodEnum<{
                array: 'array';
                boolean: 'boolean';
                number: 'number';
                object: 'object';
                string: 'string';
              }>;
            },
            $strip
          >
        >
      >;
      name: ZodString;
      steps: ZodArray<
        ZodObject<
          {
            action: ZodString;
            agent: ZodEnum<{
              architecture_expert: 'architecture_expert';
              code_expert: 'code_expert';
              custom: 'custom';
              devops_expert: 'devops_expert';
              documentation_expert: 'documentation_expert';
              infrastructure_expert: 'infrastructure_expert';
              orchestrator: 'orchestrator';
              research_expert: 'research_expert';
              security_expert: 'security_expert';
              testing_expert: 'testing_expert';
              thinker: 'thinker';
              verifier: 'verifier';
              worker: 'worker';
            }>;
            condition: ZodOptional<ZodString>;
            dependsOn: ZodOptional<ZodArray<ZodString>>;
            description: ZodOptional<ZodString>;
            id: ZodString;
            inputs: ZodDefault<ZodRecord<ZodString, ZodUnknown>>;
            parallel: ZodDefault<ZodOptional<ZodBoolean>>;
            retries: ZodOptional<ZodNumber>;
            timeout: ZodOptional<ZodNumber>;
          },
          $strip
        >
      >;
      timeout: ZodOptional<ZodNumber>;
      version: ZodString;
    },
    $strip
  >,
  ZodTransform<
    {
      description: string | undefined;
      inputs: {
        default: unknown;
        description: string | undefined;
        name: string;
        required: boolean;
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      }[];
      name: string;
      steps: {
        action: string;
        agent:
          | 'custom'
          | 'orchestrator'
          | 'code_expert'
          | 'architecture_expert'
          | 'security_expert'
          | 'documentation_expert'
          | 'testing_expert'
          | 'devops_expert'
          | 'research_expert'
          | 'infrastructure_expert'
          | 'thinker'
          | 'worker'
          | 'verifier';
        condition: string | undefined;
        dependsOn: string[] | undefined;
        id: string;
        inputs: Record<string, unknown>;
        parallel: boolean;
        retries: number | undefined;
        timeout: number | undefined;
      }[];
      timeout: number | undefined;
      version: string;
    },
    {
      description?: string;
      inputs: {
        default?: unknown;
        description?: string;
        name: string;
        required: boolean;
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      }[];
      name: string;
      steps: {
        action: string;
        agent:
          | 'custom'
          | 'orchestrator'
          | 'code_expert'
          | 'architecture_expert'
          | 'security_expert'
          | 'documentation_expert'
          | 'testing_expert'
          | 'devops_expert'
          | 'research_expert'
          | 'infrastructure_expert'
          | 'thinker'
          | 'worker'
          | 'verifier';
        condition?: string;
        dependsOn?: string[];
        description?: string;
        id: string;
        inputs: Record<string, unknown>;
        parallel: boolean;
        retries?: number;
        timeout?: number;
      }[];
      timeout?: number;
      version: string;
    }
  >
>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L148)

Workflow definition schema for YAML parsing.
Validates and transforms YAML content into WorkflowDefinition.

---

### WorkflowInputsSchema

```ts
const WorkflowInputsSchema: ZodRecord<ZodString, ZodUnknown>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L37)

Schema for validating workflow inputs.

---

### WorkflowStepSchema

```ts
const WorkflowStepSchema: ZodObject<
  {
    action: ZodString;
    agent: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      custom: 'custom';
      devops_expert: 'devops_expert';
      documentation_expert: 'documentation_expert';
      infrastructure_expert: 'infrastructure_expert';
      orchestrator: 'orchestrator';
      research_expert: 'research_expert';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
      thinker: 'thinker';
      verifier: 'verifier';
      worker: 'worker';
    }>;
    condition: ZodOptional<ZodString>;
    dependsOn: ZodOptional<ZodArray<ZodString>>;
    description: ZodOptional<ZodString>;
    id: ZodString;
    inputs: ZodDefault<ZodRecord<ZodString, ZodUnknown>>;
    parallel: ZodDefault<ZodOptional<ZodBoolean>>;
    retries: ZodOptional<ZodNumber>;
    timeout: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/workflows/template-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-types.ts#L131)

Workflow step schema.

## Functions

### areStepsCompleted()

```ts
function areStepsCompleted(context, stepIds): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L161)

Checks if all specified steps are completed.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

##### stepIds

`string`[]

Array of step identifiers to check

#### Returns

`boolean`

True if all specified steps are completed

---

### buildDependencyGraph()

```ts
function buildDependencyGraph(workflow): DependencyGraph;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:252](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L252)

Builds a dependency graph from a workflow definition.

#### Parameters

##### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

The workflow definition

#### Returns

[`DependencyGraph`](#dependencygraph)

The constructed dependency graph

---

### cancelExecution()

```ts
function cancelExecution(context): void;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L180)

Marks the execution as cancelled.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

#### Returns

`void`

---

### clearTemplateCache()

```ts
function clearTemplateCache(): void;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:550](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L550)

Clears the cached built-in templates.
Primarily for testing purposes.

#### Returns

`void`

---

### containsExpressions()

```ts
function containsExpressions(value): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L93)

Checks if a value contains expression patterns.

#### Parameters

##### value

`unknown`

Value to check

#### Returns

`boolean`

True if value contains expressions

---

### createAgentStepExecutor()

```ts
function createAgentStepExecutor(deps): AgentStepExecutor;
```

Defined in: [packages/nexus-agents/src/workflows/step-executor.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/step-executor.ts#L363)

Creates a new StepExecutor instance.

#### Parameters

##### deps

[`StepExecutorDeps`](#stepexecutordeps)

#### Returns

[`AgentStepExecutor`](#agentstepexecutor)

---

### createExecutionContext()

```ts
function createExecutionContext(options): WorkflowExecutionContext;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L66)

Creates a new execution context for a workflow run.

#### Parameters

##### options

[`CreateExecutionContextOptions`](#createexecutioncontextoptions)

Context creation options

#### Returns

[`WorkflowExecutionContext`](#workflowexecutioncontext)

A new WorkflowExecutionContext instance

---

### createExecutionPlan()

```ts
function createExecutionPlan(workflow): Result<WorkflowExecutionPlan, WorkflowError>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L225)

Creates an execution plan from a workflow definition.
Groups steps into phases based on dependencies for parallel execution.

#### Parameters

##### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

Workflow definition to analyze

#### Returns

[`Result`](core.md#result)\<[`WorkflowExecutionPlan`](#workflowexecutionplan), [`WorkflowError`](core.md#workflowerror)\>

Result with ExecutionPlan or WorkflowError

---

### createInitializedWorkflowEngine()

```ts
function createInitializedWorkflowEngine(config?): Promise<IWorkflowEngine>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:577](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L577)

Creates and initializes a WorkflowEngine with built-in templates loaded.
This is the recommended way to create a production workflow engine.

Note: Requires modelAdapter, expertFactory, or useMockExecutor: true to be specified.
Without these, WorkflowExecutionUnavailableError will be thrown.
(Source: Issue #507 - Fail-safe workflow execution)

#### Parameters

##### config?

[`WorkflowEngineFactoryConfig`](#workflowenginefactoryconfig)

Engine configuration

#### Returns

`Promise`\<[`IWorkflowEngine`](core.md#iworkflowengine)\>

Promise resolving to WorkflowEngine instance

---

### createIsolatedRegistry()

```ts
function createIsolatedRegistry(): TemplateRegistry;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:381](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L381)

Create a new isolated template registry instance.
Useful for testing or isolated contexts.

#### Returns

[`TemplateRegistry`](#templateregistry)

New template registry instance

---

### createProductionWorkflowEngine()

```ts
function createProductionWorkflowEngine(config?): Promise<IWorkflowEngine>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:687](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L687)

Creates and initializes a WorkflowEngine with auto-detected model adapter.

This is the most complete factory function - it:

1. Loads built-in templates
2. Auto-detects the best available model adapter (CLI or API)
3. Creates the workflow engine with real step execution

Falls back gracefully to mock execution if no adapter is available.

#### Parameters

##### config?

[`WorkflowEngineFactoryConfig`](#workflowenginefactoryconfig)

Engine configuration

#### Returns

`Promise`\<[`IWorkflowEngine`](core.md#iworkflowengine)\>

Promise resolving to WorkflowEngine instance

#### Example

```typescript
// Create production-ready workflow engine
const engine = await createProductionWorkflowEngine();

// Execute a workflow with real agent experts
const result = await engine.execute(workflow, inputs);
```

---

### createRealWorkflowEngine()

```ts
function createRealWorkflowEngine(config?): IWorkflowEngine;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:561](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L561)

Creates a WorkflowEngine with real dependencies.

#### Parameters

##### config?

[`WorkflowEngineFactoryConfig`](#workflowenginefactoryconfig)

Engine configuration

#### Returns

[`IWorkflowEngine`](core.md#iworkflowengine)

WorkflowEngine instance

---

### createTaskQueue()

```ts
function createTaskQueue<T>(concurrency?): TaskQueue<T>;
```

Defined in: [packages/nexus-agents/src/workflows/task-queue.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/task-queue.ts#L147)

Creates a task queue with the specified concurrency.

#### Type Parameters

##### T

`T`

#### Parameters

##### concurrency?

`number` = `5`

Maximum number of concurrent tasks

#### Returns

[`TaskQueue`](#taskqueue)\<`T`\>

A new TaskQueue instance

---

### createTemplateRegistry()

```ts
function createTemplateRegistry(): ITemplateRegistry;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:371](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L371)

Create or get the template registry instance.

#### Returns

[`ITemplateRegistry`](#itemplateregistry)

Template registry instance

---

### createWorkflowEngineDeps()

```ts
function createWorkflowEngineDeps(config?): WorkflowEngineDeps;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:512](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L512)

Creates WorkflowEngineDeps with real implementations.

When expertFactory is provided in config, the workflow engine will use the real
StepExecutor to execute steps with agent experts. Otherwise, uses a mock executor.

#### Parameters

##### config?

[`WorkflowEngineFactoryConfig`](#workflowenginefactoryconfig)

Factory configuration

#### Returns

`WorkflowEngineDeps`

WorkflowEngineDeps instance

---

### createWorkflowEngineDepsAsync()

```ts
function createWorkflowEngineDepsAsync(config?): Promise<WorkflowEngineDeps>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:636](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L636)

Creates WorkflowEngineDeps asynchronously with auto-detected model adapter.

This function attempts to auto-detect an available model adapter (CLI or API)
and configures the workflow engine to use the real StepExecutor with ExpertFactory.
Use this when you want production-ready workflow execution with real agent experts.

#### Parameters

##### config?

[`WorkflowEngineFactoryConfig`](#workflowenginefactoryconfig)

Factory configuration (modelAdapter will be auto-detected if not provided)

#### Returns

`Promise`\<`WorkflowEngineDeps`\>

Promise resolving to WorkflowEngineDeps

#### Example

```typescript
// Auto-detect adapter and create deps with real execution
const deps = await createWorkflowEngineDepsAsync();
const engine = new WorkflowEngine(deps);

// Or with custom config
const deps = await createWorkflowEngineDepsAsync({
  logger: customLogger,
  useMockExecutor: false,
});
```

---

### executeParallel()

```ts
function executeParallel(
  steps,
  context,
  stepExecutor,
  options?
): Promise<Result<StepResult[], WorkflowError>>;
```

Defined in: [packages/nexus-agents/src/workflows/parallel-executor.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/parallel-executor.ts#L206)

Executes steps in parallel with concurrency limiting.

#### Parameters

##### steps

[`WorkflowStep`](core.md#workflowstep)[]

##### context

[`ExecutionContext`](#executioncontext)

##### stepExecutor

[`StepExecutor`](#stepexecutor)

##### options?

[`ParallelOptions`](#paralleloptions)

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`StepResult`](core.md#stepresult)[], [`WorkflowError`](core.md#workflowerror)\>\>

---

### extractExpressions()

```ts
function extractExpressions(input): ParsedExpression[];
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L221)

Extracts all expression references from a value.
Useful for determining step dependencies.

#### Parameters

##### input

`unknown`

Value containing potential expressions

#### Returns

[`ParsedExpression`](#parsedexpression)[]

Array of parsed expressions

---

### getBuiltInTemplates()

```ts
function getBuiltInTemplates(): Promise<Map<string, WorkflowDefinition>>;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:279](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L279)

Load all built-in templates.

#### Returns

`Promise`\<`Map`\<`string`, [`WorkflowDefinition`](core.md#workflowdefinition)\>\>

Map of template name to WorkflowDefinition

---

### getBuiltInTemplatesPath()

```ts
function getBuiltInTemplatesPath(): string;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L63)

Get the directory containing built-in templates.

Handles both development (unbundled) and production (bundled) scenarios:

- Development: import.meta.url points to src/workflows/template-loader.ts
- Production: import.meta.url points to dist/index.js or dist/cli.js

#### Returns

`string`

Path to templates directory

---

### getBuiltInTemplatesWithMetadata()

```ts
function getBuiltInTemplatesWithMetadata(): Promise<ParsedTemplate[]>;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:296](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L296)

Load built-in templates with full metadata.

#### Returns

`Promise`\<[`ParsedTemplate`](#parsedtemplate)[]\>

Array of parsed templates with metadata

---

### getCompletedSteps()

```ts
function getCompletedSteps(context): string[];
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L139)

Gets all completed step IDs.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

#### Returns

`string`[]

Array of completed step IDs

---

### getExecutionDuration()

```ts
function getExecutionDuration(context): number;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L171)

Gets the execution duration in milliseconds.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

#### Returns

`number`

Duration in milliseconds

---

### getExecutionOrder()

```ts
function getExecutionOrder(plan): string[];
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:296](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L296)

Gets the execution order of steps as a flat array.
Steps in the same phase are grouped together.

#### Parameters

##### plan

[`WorkflowExecutionPlan`](#workflowexecutionplan)

Execution plan

#### Returns

`string`[]

Ordered array of step IDs

---

### getReferencedSteps()

```ts
function getReferencedSteps(input): string[];
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:259](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L259)

Gets all step IDs referenced in expressions within a value.

#### Parameters

##### input

`unknown`

Value containing potential expressions

#### Returns

`string`[]

Array of referenced step IDs

---

### getStepResult()

```ts
function getStepResult(context, stepId): StepResult | undefined;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L104)

Retrieves a step result from the execution context.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

##### stepId

`string`

The step identifier

#### Returns

[`StepResult`](core.md#stepresult) \| `undefined`

The step result or undefined if not found

---

### getTopologicalOrder()

```ts
function getTopologicalOrder(workflow): Result<string[], ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:306](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L306)

Gets the topologically sorted execution order for a workflow.
Used for parsing validation (returns ParseError).
For execution planning, use createExecutionPlan from execution-planner.

#### Parameters

##### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

The workflow definition

#### Returns

[`Result`](core.md#result)\<`string`[], [`ParseError`](core.md#parseerror)\>

Result with sorted step IDs or ParseError

---

### getVariable()

```ts
function getVariable(context, name): unknown;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L129)

Gets a variable from the execution context.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

##### name

`string`

Variable name

#### Returns

`unknown`

The variable value or undefined

---

### initializeBuiltInTemplates()

```ts
function initializeBuiltInTemplates(): Promise<Map<string, WorkflowDefinition>>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-engine-factory.ts:537](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-engine-factory.ts#L537)

Initializes and caches built-in templates.
Call this at startup before creating workflow engines.

#### Returns

`Promise`\<`Map`\<`string`, [`WorkflowDefinition`](core.md#workflowdefinition)\>\>

Promise that resolves when templates are loaded

---

### isCancelled()

```ts
function isCancelled(context): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L190)

Checks if the execution has been cancelled.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

#### Returns

`boolean`

True if cancelled

---

### isStepCompleted()

```ts
function isStepCompleted(context, stepId): boolean;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L150)

Checks if a step has been completed.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

##### stepId

`string`

The step identifier

#### Returns

`boolean`

True if step is completed

---

### loadTemplateFile()

```ts
function loadTemplateFile(
  filePath,
  allowedRoot?
): Promise<Result<ParsedTemplate, SecurityError | ParseError>>;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L163)

Load a template from a file path.

#### Parameters

##### filePath

`string`

Path to the YAML template file

##### allowedRoot?

`string`

Optional root directory for path validation (skipped if undefined)

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`ParsedTemplate`](#parsedtemplate),
\| [`SecurityError`](core.md#securityerror)
\| [`ParseError`](core.md#parseerror)\>\>

Result with ParsedTemplate or ParseError/SecurityError

---

### loadTemplatesFromDirectory()

```ts
function loadTemplatesFromDirectory(directoryPath): Promise<{
  errors: (SecurityError | ParseError)[];
  templates: ParsedTemplate[];
}>;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L225)

Load all templates from a directory.
Validates each file path to prevent path traversal attacks.

#### Parameters

##### directoryPath

`string`

Path to directory containing YAML templates

#### Returns

`Promise`\<\{
`errors`: (
\| [`SecurityError`](core.md#securityerror)
\| [`ParseError`](core.md#parseerror))[];
`templates`: [`ParsedTemplate`](#parsedtemplate)[];
\}\>

Array of successfully loaded templates and any errors

---

### loadWorkflowFile()

```ts
function loadWorkflowFile(
  filePath,
  allowedRoot?
): Promise<Result<WorkflowDefinition, SecurityError | ParseError>>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-parser.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-parser.ts#L223)

Loads and parses a workflow definition from a file.

#### Parameters

##### filePath

`string`

Path to the workflow file

##### allowedRoot?

`string` = `...`

Root directory for path validation (defaults to process.cwd())

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`WorkflowDefinition`](core.md#workflowdefinition),
\| [`SecurityError`](core.md#securityerror)
\| [`ParseError`](core.md#parseerror)\>\>

Result with WorkflowDefinition or ParseError/SecurityError

---

### parseExpression()

```ts
function parseExpression(expression): ParsedExpression | null;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L46)

Parses an expression string into its components.

#### Parameters

##### expression

`string`

The expression content (without ${{ }})

#### Returns

[`ParsedExpression`](#parsedexpression) \| `null`

Parsed expression or null if invalid

---

### parseTemplateContent()

```ts
function parseTemplateContent(content, filePath): Result<WorkflowDefinition, ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/template-loader.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-loader.ts#L138)

Parse a YAML template string into a WorkflowDefinition.

#### Parameters

##### content

`string`

YAML content to parse

##### filePath

`string`

Path to the file (for error messages)

#### Returns

[`Result`](core.md#result)\<[`WorkflowDefinition`](core.md#workflowdefinition), [`ParseError`](core.md#parseerror)\>

Result with WorkflowDefinition or ParseError

---

### parseWorkflowJson()

```ts
function parseWorkflowJson(content): Result<WorkflowDefinition, ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-parser.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-parser.ts#L124)

Parses a JSON string into a WorkflowDefinition.

#### Parameters

##### content

`string`

JSON string content

#### Returns

[`Result`](core.md#result)\<[`WorkflowDefinition`](core.md#workflowdefinition), [`ParseError`](core.md#parseerror)\>

Result with WorkflowDefinition or ParseError

---

### parseWorkflowYaml()

```ts
function parseWorkflowYaml(content): Result<WorkflowDefinition, ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-parser.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-parser.ts#L90)

Parses a YAML string into a WorkflowDefinition.

#### Parameters

##### content

`string`

YAML string content

#### Returns

[`Result`](core.md#result)\<[`WorkflowDefinition`](core.md#workflowdefinition), [`ParseError`](core.md#parseerror)\>

Result with WorkflowDefinition or ParseError

---

### resetRegistry()

```ts
function resetRegistry(): void;
```

Defined in: [packages/nexus-agents/src/workflows/template-registry.ts:389](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/template-registry.ts#L389)

Reset the global registry instance.
Primarily for testing purposes.

#### Returns

`void`

---

### resolveExpression()

```ts
function resolveExpression(parsed, context): ResolveResult;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L73)

Resolves a single parsed expression against the context.

#### Parameters

##### parsed

[`ParsedExpression`](#parsedexpression)

Parsed expression

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

Execution context

#### Returns

[`ResolveResult`](#resolveresult)

Resolve result

---

### resolveInput()

```ts
function resolveInput(input, context): unknown;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L153)

Recursively resolves expressions in a value.

Handles strings, arrays, and objects. Primitives other than strings
are returned unchanged.

#### Parameters

##### input

`unknown`

Value containing potential expressions

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

Execution context

#### Returns

`unknown`

Resolved value

#### Throws

ValidationError if resolution fails

---

### resolveStringExpressions()

```ts
function resolveStringExpressions(value, context): unknown;
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L109)

Resolves all expressions in a string value.

If the entire string is a single expression, returns the resolved value.
If the string contains multiple expressions or mixed content, returns a string
with all expressions replaced by their resolved values.

#### Parameters

##### value

`string`

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

#### Returns

`unknown`

---

### setVariable()

```ts
function setVariable(context, name, value): void;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L118)

Sets a variable in the execution context.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

##### name

`string`

Variable name

##### value

`unknown`

Variable value

#### Returns

`void`

---

### snapshotContext()

```ts
function snapshotContext(context): Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L201)

Creates a snapshot of the current context state.
Useful for debugging and logging.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

#### Returns

`Record`\<`string`, `unknown`\>

A plain object snapshot

---

### storeStepResult()

```ts
function storeStepResult(context, stepId, result): void;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L89)

Stores a step result in the execution context.

#### Parameters

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

The execution context

##### stepId

`string`

The step identifier

##### result

[`StepResult`](core.md#stepresult)

The step result to store

#### Returns

`void`

---

### validateDependencyGraph()

```ts
function validateDependencyGraph(workflow): Result<void, ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/dependency-graph.ts:273](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/dependency-graph.ts#L273)

Validates the dependency graph of a workflow.
Checks for:

- Duplicate step IDs
- Missing step references
- Circular dependencies

#### Parameters

##### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

The workflow definition to validate

#### Returns

[`Result`](core.md#result)\<`void`, [`ParseError`](core.md#parseerror)\>

Result with void or ParseError

---

### validateExpressions()

```ts
function validateExpressions(input, context): string[];
```

Defined in: [packages/nexus-agents/src/workflows/expression-resolver.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/expression-resolver.ts#L188)

Validates that all expressions in a value can be resolved.
Does not actually resolve them, just checks validity.

#### Parameters

##### input

`unknown`

Value containing potential expressions

##### context

[`WorkflowExecutionContext`](#workflowexecutioncontext)

Execution context

#### Returns

`string`[]

Array of validation errors (empty if all valid)

---

### validateRequiredInputs()

```ts
function validateRequiredInputs(inputs, required): ValidationError | null;
```

Defined in: [packages/nexus-agents/src/workflows/execution-context.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-context.ts#L231)

Validates that required inputs are present.

#### Parameters

##### inputs

`Record`\<`string`, `unknown`\>

The inputs to validate

##### required

`string`[]

Array of required input names

#### Returns

[`ValidationError`](core.md#validationerror) \| `null`

Validation error or null if valid

---

### validateWorkflow()

```ts
function validateWorkflow(workflow): Result<void, ParseError>;
```

Defined in: [packages/nexus-agents/src/workflows/workflow-parser.ts:273](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/workflow-parser.ts#L273)

Validates a WorkflowDefinition object.
Useful for validating programmatically created workflows.

#### Parameters

##### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

WorkflowDefinition to validate

#### Returns

[`Result`](core.md#result)\<`void`, [`ParseError`](core.md#parseerror)\>

Result with void or ParseError

---

### validateWorkflowDependencies()

```ts
function validateWorkflowDependencies(workflow): Result<void, WorkflowError>;
```

Defined in: [packages/nexus-agents/src/workflows/execution-planner.ts:279](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/workflows/execution-planner.ts#L279)

Validates a workflow definition without creating a full plan.

#### Parameters

##### workflow

[`WorkflowDefinition`](core.md#workflowdefinition)

Workflow definition to validate

#### Returns

[`Result`](core.md#result)\<`void`, [`WorkflowError`](core.md#workflowerror)\>

Result with void or WorkflowError
