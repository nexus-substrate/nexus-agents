---
title: 'API: agents-skills'
description: Generated API reference for agents-skills.
tier: 2
---

# agents-skills

## Classes

### SkillComposer

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L54)

Composes skills to solve complex tasks.

#### Constructors

##### Constructor

```ts
new SkillComposer(
   library,
   config?,
   logger?): SkillComposer;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L59)

###### Parameters

###### library

[`SkillLibrary`](#skilllibrary)

###### config?

`Partial`\<[`SkillComposerConfig`](#skillcomposerconfig)\> = `{}`

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`SkillComposer`](#skillcomposer)

#### Methods

##### compose()

```ts
compose(request): SkillComposition | null;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L68)

Creates a composition plan for a task.

###### Parameters

###### request

[`SkillCompositionRequest`](#skillcompositionrequest)

###### Returns

[`SkillComposition`](#skillcomposition) \| `null`

##### getConfig()

```ts
getConfig(): SkillComposerConfig;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L136)

Gets the current configuration.

###### Returns

[`SkillComposerConfig`](#skillcomposerconfig)

##### validateComposition()

```ts
validateComposition(composition): CompositionValidation;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L98)

Validates that a composition is executable.

###### Parameters

###### composition

[`SkillComposition`](#skillcomposition)

###### Returns

[`CompositionValidation`](#compositionvalidation)

---

### SkillDependencyGraph

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L67)

Skill dependency graph implementation using adjacency list.
Supports topological sorting, cycle detection, and version constraints.

#### Implements

- [`ISkillDependencyGraph`](#iskilldependencygraph)

#### Constructors

##### Constructor

```ts
new SkillDependencyGraph(): SkillDependencyGraph;
```

###### Returns

[`SkillDependencyGraph`](#skilldependencygraph)

#### Methods

##### addDependency()

```ts
addDependency(dependency): Result<void, DependencyError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L88)

Adds a dependency edge between two skills.

###### Parameters

###### dependency

[`SkillDependency`](#skilldependency)

###### Returns

[`Result`](core.md#result)\<`void`, [`DependencyError`](#dependencyerror)\>

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`addDependency`](#adddependency-1)

##### addSkill()

```ts
addSkill(skillId, version?): void;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L75)

Adds a skill node to the graph.

###### Parameters

###### skillId

`string`

###### version?

`number` = `1`

###### Returns

`void`

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`addSkill`](#addskill-2)

##### getDependencies()

```ts
getDependencies(skillId): readonly SkillDependency[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L151)

Gets all dependencies for a skill.

###### Parameters

###### skillId

`string`

###### Returns

readonly [`SkillDependency`](#skilldependency)[]

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`getDependencies`](#getdependencies-1)

##### getDependents()

```ts
getDependents(skillId): readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L157)

Gets all skills that depend on a given skill.

###### Parameters

###### skillId

`string`

###### Returns

readonly `string`[]

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`getDependents`](#getdependents-1)

##### getExecutionOrder()

```ts
getExecutionOrder(skillIds): Result<readonly string[], DependencyError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L163)

Gets execution order for given skills using Kahn's algorithm.

###### Parameters

###### skillIds

readonly `string`[]

###### Returns

[`Result`](core.md#result)\<readonly `string`[], [`DependencyError`](#dependencyerror)\>

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`getExecutionOrder`](#getexecutionorder-1)

##### getSkillCount()

```ts
getSkillCount(): number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L229)

Gets the number of skills in the graph.

###### Returns

`number`

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`getSkillCount`](#getskillcount-1)

##### hasCircularDependency()

```ts
hasCircularDependency(skillId): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L178)

Checks if a skill has a circular dependency.

###### Parameters

###### skillId

`string`

###### Returns

`boolean`

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`hasCircularDependency`](#hascirculardependency-1)

##### hasSkill()

```ts
hasSkill(skillId): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:234](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L234)

Checks if a skill exists in the graph.

###### Parameters

###### skillId

`string`

###### Returns

`boolean`

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`hasSkill`](#hasskill-1)

##### removeDependency()

```ts
removeDependency(skillId, dependsOn): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L134)

Removes a dependency edge between two skills.

###### Parameters

###### skillId

`string`

###### dependsOn

`string`

###### Returns

`boolean`

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`removeDependency`](#removedependency-1)

##### validateGraph()

```ts
validateGraph(): Result<void, DependencyError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L186)

Validates the entire graph for consistency.

###### Returns

[`Result`](core.md#result)\<`void`, [`DependencyError`](#dependencyerror)\>

###### Implementation of

[`ISkillDependencyGraph`](#iskilldependencygraph).[`validateGraph`](#validategraph-1)

---

### SkillLibrary

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L43)

Voyager-style skill library for storing and retrieving executable skills.

#### Constructors

##### Constructor

```ts
new SkillLibrary(config?, logger?): SkillLibrary;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L48)

###### Parameters

###### config?

`Partial`\<[`SkillLibraryConfig`](#skilllibraryconfig)\> = `{}`

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`SkillLibrary`](#skilllibrary)

#### Methods

##### addSkill()

```ts
addSkill(options): Skill;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L61)

Adds a new skill to the library.

###### Parameters

###### options

[`CreateSkillOptions`](#createskilloptions)

###### Returns

[`Skill`](#skill)

##### findRelevantSkills()

```ts
findRelevantSkills(taskDescription, limit?): readonly SkillWithMetrics[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L205)

Finds skills relevant to a task description.

###### Parameters

###### taskDescription

`string`

###### limit?

`number` = `5`

###### Returns

readonly [`SkillWithMetrics`](#skillwithmetrics)[]

##### getConfig()

```ts
getConfig(): SkillLibraryConfig;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L262)

Gets the current configuration.

###### Returns

[`SkillLibraryConfig`](#skilllibraryconfig)

##### getMostUsedSkills()

```ts
getMostUsedSkills(limit?): readonly SkillWithMetrics[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L198)

Gets the most frequently used skills.

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly [`SkillWithMetrics`](#skillwithmetrics)[]

##### getSkill()

```ts
getSkill(skillId): SkillWithMetrics | undefined;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L105)

Retrieves a skill by ID.

###### Parameters

###### skillId

`string`

###### Returns

[`SkillWithMetrics`](#skillwithmetrics) \| `undefined`

##### getSkillByName()

```ts
getSkillByName(name): SkillWithMetrics | undefined;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L116)

Retrieves a skill by name.

###### Parameters

###### name

`string`

###### Returns

[`SkillWithMetrics`](#skillwithmetrics) \| `undefined`

##### getSkillsByCategory()

```ts
getSkillsByCategory(category): readonly SkillWithMetrics[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L188)

Gets all skills in a category.

###### Parameters

###### category

`string`

###### Returns

readonly [`SkillWithMetrics`](#skillwithmetrics)[]

##### getStatistics()

```ts
getStatistics(): LibraryStatistics;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L254)

Gets library statistics.

###### Returns

[`LibraryStatistics`](#librarystatistics)

##### getTopPerformingSkills()

```ts
getTopPerformingSkills(limit?): readonly SkillWithMetrics[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L193)

Gets the most successful skills.

###### Parameters

###### limit?

`number` = `10`

###### Returns

readonly [`SkillWithMetrics`](#skillwithmetrics)[]

##### recordExecution()

```ts
recordExecution(
   skillId,
   status,
   input,
   output?,
   errorMessage?): void;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L148)

Records a skill execution (legacy signature).

###### Parameters

###### skillId

`string`

###### status

[`SkillExecutionStatus`](#skillexecutionstatus-1)

###### input

`Record`\<`string`, `unknown`\>

###### output?

`string`

###### errorMessage?

`string`

###### Returns

`void`

##### recordExecutionWithOptions()

```ts
recordExecutionWithOptions(options): void;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L167)

Records a skill execution with options object.

###### Parameters

###### options

[`RecordExecutionOptions`](#recordexecutionoptions)

###### Returns

`void`

##### removeSkill()

```ts
removeSkill(skillId): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:235](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L235)

Removes a skill from the library.

###### Parameters

###### skillId

`string`

###### Returns

`boolean`

##### searchSkills()

```ts
searchSkills(query): SkillSearchResult;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L128)

Searches for skills matching a query.

###### Parameters

###### query

[`SkillQuery`](#skillquery)

###### Returns

[`SkillSearchResult`](#skillsearchresult)

##### updateSkill()

```ts
updateSkill(skillId, updates): Skill | undefined;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L214)

Updates an existing skill.

###### Parameters

###### skillId

`string`

###### updates

`Partial`\<[`CreateSkillOptions`](#createskilloptions)\>

###### Returns

[`Skill`](#skill) \| `undefined`

---

### SkillLoader

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader.ts#L75)

Deterministic skill loader implementation.

Key guarantees:

- Same role + same library state = same skill set (deterministic)
- Skills are sorted by ID before filtering for determinism
- Execution order follows dependency graph (topological sort)
- RBAC enforcement prevents unauthorized skill access

#### Implements

- [`ISkillLoader`](#iskillloader)

#### Constructors

##### Constructor

```ts
new SkillLoader(
   library,
   config?,
   logger?): SkillLoader;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader.ts#L81)

###### Parameters

###### library

[`SkillLibrary`](#skilllibrary)

###### config?

`Partial`\<[`SkillLoaderConfig`](#skillloaderconfig)\>

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`SkillLoader`](#skillloader)

#### Methods

##### getAvailableSkills()

```ts
getAvailableSkills(role): readonly Skill[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader.ts:281](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader.ts#L281)

Gets all skills available to a role without limits.

###### Parameters

###### role

[`AgentRole`](core.md#agentrole)

###### Returns

readonly [`Skill`](#skill)[]

###### Implementation of

[`ISkillLoader`](#iskillloader).[`getAvailableSkills`](#getavailableskills-1)

##### loadForAgent()

```ts
loadForAgent(agentId, role): Result<LoadedSkillSet, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader.ts#L97)

Loads skills for an agent based on their role.
Deterministic: same role + same library = same skills.

###### Parameters

###### agentId

`string`

###### role

[`AgentRole`](core.md#agentrole)

###### Returns

[`Result`](core.md#result)\<[`LoadedSkillSet`](#loadedskillset), [`SkillLoaderError`](#skillloadererror)\>

###### Implementation of

[`ISkillLoader`](#iskillloader).[`loadForAgent`](#loadforagent-1)

##### loadForTask()

```ts
loadForTask(
   agentId,
   role,
taskDescription): Result<LoadedSkillSet, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader.ts#L215)

Loads skills for a task, potentially including task-relevant skills.

###### Parameters

###### agentId

`string`

###### role

[`AgentRole`](core.md#agentrole)

###### taskDescription

`string`

###### Returns

[`Result`](core.md#result)\<[`LoadedSkillSet`](#loadedskillset), [`SkillLoaderError`](#skillloadererror)\>

###### Implementation of

[`ISkillLoader`](#iskillloader).[`loadForTask`](#loadfortask-1)

##### validateLoadedSet()

```ts
validateLoadedSet(set): Result<void, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader.ts#L297)

Validates a loaded skill set for consistency.

###### Parameters

###### set

[`LoadedSkillSet`](#loadedskillset)

###### Returns

[`Result`](core.md#result)\<`void`, [`SkillLoaderError`](#skillloadererror)\>

###### Implementation of

[`ISkillLoader`](#iskillloader).[`validateLoadedSet`](#validateloadedset-1)

## Interfaces

### CompositionStep

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L254)

A single step in a skill composition.

#### Properties

##### inputBinding

```ts
readonly inputBinding: Record<string, InputBinding>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L262)

How to bind input (from context or previous step)

##### purpose

```ts
readonly purpose: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L264)

Description of what this step achieves

##### skillId

```ts
readonly skillId: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:258](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L258)

Skill to execute

##### skillName

```ts
readonly skillName: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:260](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L260)

Skill name (for readability)

##### stepNumber

```ts
readonly stepNumber: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L256)

Step number (1-indexed)

---

### CompositionValidation

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L361)

Result of validating a composition.

#### Properties

##### errors

```ts
readonly errors: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L365)

Validation errors

##### valid

```ts
readonly valid: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L363)

Whether the composition is valid

##### warnings

```ts
readonly warnings: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:367](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L367)

Warnings (not blocking)

---

### CreateSkillOptions

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L200)

Options for creating a new skill.

#### Properties

##### category

```ts
readonly category: SkillCategory;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L206)

Category

##### code

```ts
readonly code: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:210](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L210)

The executable code

##### complexity

```ts
readonly complexity: SkillComplexity;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:208](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L208)

Complexity level

##### dependencies?

```ts
readonly optional dependencies?: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L216)

Dependencies on other skills

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L204)

Detailed description

##### examples?

```ts
readonly optional examples?: readonly SkillExample[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L220)

Usage examples

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L202)

Human-readable name

##### outputType

```ts
readonly outputType: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L214)

Output type description

##### parameters

```ts
readonly parameters: readonly SkillParameter[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L212)

Input parameters

##### tags?

```ts
readonly optional tags?: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:218](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L218)

Search tags

---

### DependencyError

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L52)

Dependency error with code and context.

#### Properties

##### code

```ts
readonly code: DependencyErrorCode;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L53)

##### context?

```ts
readonly optional context?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L55)

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L54)

---

### InputBinding

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:270](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L270)

Input binding for a composition step.

#### Properties

##### key

```ts
readonly key: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L274)

Key in context or step number

##### source

```ts
readonly source: "literal" | "context" | "previous-step";
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L272)

Source of the input value

##### value?

```ts
readonly optional value?: unknown;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:276](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L276)

Literal value (if source is 'literal')

---

### ISkillDependencyGraph

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L65)

Interface for skill dependency graph operations.

#### Methods

##### addDependency()

```ts
addDependency(dependency): Result<void, DependencyError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L69)

Adds a dependency edge between skills

###### Parameters

###### dependency

[`SkillDependency`](#skilldependency)

###### Returns

[`Result`](core.md#result)\<`void`, [`DependencyError`](#dependencyerror)\>

##### addSkill()

```ts
addSkill(skillId, version?): void;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L67)

Adds a skill node to the graph

###### Parameters

###### skillId

`string`

###### version?

`number`

###### Returns

`void`

##### getDependencies()

```ts
getDependencies(skillId): readonly SkillDependency[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L73)

Gets all dependencies for a skill

###### Parameters

###### skillId

`string`

###### Returns

readonly [`SkillDependency`](#skilldependency)[]

##### getDependents()

```ts
getDependents(skillId): readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L75)

Gets all skills that depend on a given skill

###### Parameters

###### skillId

`string`

###### Returns

readonly `string`[]

##### getExecutionOrder()

```ts
getExecutionOrder(skillIds): Result<readonly string[], DependencyError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L77)

Gets execution order using topological sort

###### Parameters

###### skillIds

readonly `string`[]

###### Returns

[`Result`](core.md#result)\<readonly `string`[], [`DependencyError`](#dependencyerror)\>

##### getSkillCount()

```ts
getSkillCount(): number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L83)

Gets the number of skills in the graph

###### Returns

`number`

##### hasCircularDependency()

```ts
hasCircularDependency(skillId): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L79)

Checks if adding a dependency would create a cycle

###### Parameters

###### skillId

`string`

###### Returns

`boolean`

##### hasSkill()

```ts
hasSkill(skillId): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L85)

Checks if a skill exists in the graph

###### Parameters

###### skillId

`string`

###### Returns

`boolean`

##### removeDependency()

```ts
removeDependency(skillId, dependsOn): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L71)

Removes a dependency edge

###### Parameters

###### skillId

`string`

###### dependsOn

`string`

###### Returns

`boolean`

##### validateGraph()

```ts
validateGraph(): Result<void, DependencyError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L81)

Validates the entire graph for consistency

###### Returns

[`Result`](core.md#result)\<`void`, [`DependencyError`](#dependencyerror)\>

---

### ISkillLoader

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L117)

Interface for the skill loader.

#### Methods

##### getAvailableSkills()

```ts
getAvailableSkills(role): readonly Skill[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L153)

Gets all skills available to a specific role.
Does not apply per-agent limits or task filtering.

###### Parameters

###### role

[`AgentRole`](core.md#agentrole)

Role to get available skills for

###### Returns

readonly [`Skill`](#skill)[]

Array of skills available to the role

##### loadForAgent()

```ts
loadForAgent(agentId, role): Result<LoadedSkillSet, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L126)

Loads skills for an agent based on their role.
Returns skills in dependency-aware execution order.

###### Parameters

###### agentId

`string`

Unique identifier of the agent

###### role

[`AgentRole`](core.md#agentrole)

Role of the agent

###### Returns

[`Result`](core.md#result)\<[`LoadedSkillSet`](#loadedskillset), [`SkillLoaderError`](#skillloadererror)\>

Result with LoadedSkillSet or SkillLoaderError

##### loadForTask()

```ts
loadForTask(
   agentId,
   role,
taskDescription): Result<LoadedSkillSet, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L140)

Loads skills for a specific task based on role and task description.
May include additional task-relevant skills beyond role defaults.

###### Parameters

###### agentId

`string`

Unique identifier of the agent

###### role

[`AgentRole`](core.md#agentrole)

Role of the agent

###### taskDescription

`string`

Description of the task to execute

###### Returns

[`Result`](core.md#result)\<[`LoadedSkillSet`](#loadedskillset), [`SkillLoaderError`](#skillloadererror)\>

Result with LoadedSkillSet or SkillLoaderError

##### validateLoadedSet()

```ts
validateLoadedSet(set): Result<void, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L161)

Validates a loaded skill set for consistency.

###### Parameters

###### set

[`LoadedSkillSet`](#loadedskillset)

The loaded skill set to validate

###### Returns

[`Result`](core.md#result)\<`void`, [`SkillLoaderError`](#skillloadererror)\>

Result with void on success or SkillLoaderError on failure

---

### LibraryStatistics

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:360](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L360)

Library statistics.

#### Properties

##### overallSuccessRate

```ts
readonly overallSuccessRate: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L363)

##### skillsByCategory

```ts
readonly skillsByCategory: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:364](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L364)

##### skillsByComplexity

```ts
readonly skillsByComplexity: Partial<Record<SkillComplexity, number>>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:365](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L365)

##### totalExecutions

```ts
readonly totalExecutions: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L362)

##### totalSkills

```ts
readonly totalSkills: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L361)

---

### LoadedSkillSet

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L71)

Represents a loaded set of skills for an agent.
Includes execution order based on dependencies.

#### Properties

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L73)

ID of the agent this skill set was loaded for

##### agentRole

```ts
readonly agentRole: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L75)

Role of the agent

##### executionOrder

```ts
readonly executionOrder: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L79)

Execution order (skill IDs) based on dependency graph

##### loadedAt

```ts
readonly loadedAt: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L83)

When the skill set was loaded

##### missingRequired

```ts
readonly missingRequired: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L81)

Required skills that could not be loaded

##### skills

```ts
readonly skills: readonly Skill[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L77)

Skills that were successfully loaded

---

### RecordExecutionOptions

Defined in: [packages/nexus-agents/src/agents/skills/skill-helpers.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-helpers.ts#L25)

Options for recording an execution.

#### Properties

##### context?

```ts
readonly optional context?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-helpers.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-helpers.ts#L31)

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-helpers.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-helpers.ts#L30)

##### input

```ts
readonly input: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-helpers.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-helpers.ts#L28)

##### output?

```ts
readonly optional output?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-helpers.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-helpers.ts#L29)

##### skillId

```ts
readonly skillId: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-helpers.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-helpers.ts#L26)

##### status

```ts
readonly status: SkillExecutionStatus;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-helpers.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-helpers.ts#L27)

---

### RoleSkillMapping

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L24)

Maps an agent role to its required and optional skill categories.
Defines which skills should be loaded for agents of a specific role.

#### Properties

##### maxSkills?

```ts
readonly optional maxSkills?: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L32)

Maximum number of skills to load for this role (overrides default)

##### optionalCategories?

```ts
readonly optional optionalCategories?: readonly SkillCategory[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L30)

Categories that may be loaded if available

##### requiredCategories

```ts
readonly requiredCategories: readonly SkillCategory[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L28)

Categories that must be loaded for this role

##### role

```ts
readonly role: AgentRole;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L26)

The agent role this mapping applies to

---

### Skill

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L52)

A single skill in the library.

#### Extended by

- [`SkillWithMetrics`](#skillwithmetrics)

#### Properties

##### capabilities?

```ts
readonly optional capabilities?: SkillCapabilities;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L82)

Security capabilities (optional, for controlled execution)

##### category

```ts
readonly category: SkillCategory;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L60)

Category for organization

##### code

```ts
readonly code: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L64)

The executable code (function body)

##### complexity

```ts
readonly complexity: SkillComplexity;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L62)

Complexity level

##### createdAt

```ts
readonly createdAt: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L76)

When the skill was created

##### dependencies

```ts
readonly dependencies: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L70)

Skills this depends on (for composition)

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L58)

Detailed description of what the skill does

##### examples

```ts
readonly examples: readonly SkillExample[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L74)

Usage example(s)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L54)

Unique identifier

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L56)

Human-readable name

##### outputType

```ts
readonly outputType: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L68)

Expected output type description

##### parameters

```ts
readonly parameters: readonly SkillParameter[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L66)

Input parameter definitions

##### provenance?

```ts
readonly optional provenance?: SkillProvenance;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L86)

Provenance tracking (optional, for audit trail)

##### rbac?

```ts
readonly optional rbac?: SkillRBAC;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L84)

Role-based access control (optional, for permission enforcement)

##### tags

```ts
readonly tags: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L72)

Keywords for search/retrieval

##### updatedAt

```ts
readonly updatedAt: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L78)

When the skill was last modified

##### version

```ts
readonly version: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L80)

Version number for tracking changes

---

### SkillAttestation

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L151)

Records the authorization of a skill execution.

#### Properties

##### authorizationMethod

```ts
readonly authorizationMethod: AuthorizationMethod;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L163)

How authorization was determined

##### authorized

```ts
readonly authorized: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L161)

Whether execution was authorized

##### executorId

```ts
readonly executorId: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L155)

ID of the agent executing the skill

##### inputHash

```ts
readonly inputHash: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L159)

SHA-256 hash of the input parameters

##### skillId

```ts
readonly skillId: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L153)

ID of the skill being executed

##### timestamp

```ts
readonly timestamp: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L157)

When the attestation was created

---

### SkillCapabilities

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L64)

Skill capabilities define what a skill can do and its execution constraints.

#### Properties

##### maxExecutionTime

```ts
readonly maxExecutionTime: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L68)

Maximum execution time in milliseconds

##### permissions

```ts
readonly permissions: readonly SkillPermission[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L66)

Permissions granted to the skill

##### sandboxed

```ts
readonly sandboxed: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L70)

Whether the skill runs in a sandboxed environment

---

### SkillComposerConfig

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L27)

Configuration for skill composition.

#### Properties

##### complexityMatchWeight

```ts
readonly complexityMatchWeight: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L37)

Weight for complexity match in scoring

##### maxCandidateSkills

```ts
readonly maxCandidateSkills: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L29)

Maximum skills to consider for composition

##### maxCompositionSteps

```ts
readonly maxCompositionSteps: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L31)

Maximum steps in a composition

##### minConfidence

```ts
readonly minConfidence: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L33)

Minimum confidence threshold for compositions

##### successRateWeight

```ts
readonly successRateWeight: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L35)

Weight for skill success rate in scoring

---

### SkillComposition

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L240)

A composed skill plan.

#### Properties

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:248](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L248)

Confidence in this composition (0-1)

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L244)

Overall description

##### estimatedComplexity

```ts
readonly estimatedComplexity: SkillComplexity;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:246](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L246)

Estimated complexity

##### steps

```ts
readonly steps: readonly CompositionStep[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L242)

Skills to execute in order

---

### SkillCompositionRequest

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:226](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L226)

Skill composition request.

#### Properties

##### context?

```ts
readonly optional context?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L230)

Available context

##### maxComplexity?

```ts
readonly optional maxComplexity?: SkillComplexity;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:232](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L232)

Preferred complexity limit

##### maxSkillCount?

```ts
readonly optional maxSkillCount?: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:234](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L234)

Maximum number of skills to compose

##### taskDescription

```ts
readonly taskDescription: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:228](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L228)

Task description to solve

---

### SkillDependency

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L28)

Represents a dependency edge between two skills.

#### Properties

##### dependsOn

```ts
readonly dependsOn: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L32)

ID of the skill being depended upon

##### minVersion?

```ts
readonly optional minVersion?: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L36)

Minimum version of the dependency required (optional)

##### skillId

```ts
readonly skillId: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L30)

ID of the skill that has the dependency

##### type

```ts
readonly type: SkillDependencyType;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L34)

Type of dependency relationship

---

### SkillExample

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L108)

Example usage of a skill.

#### Properties

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L110)

Description of what this example demonstrates

##### expectedOutput

```ts
readonly expectedOutput: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L114)

Expected output

##### input

```ts
readonly input: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L112)

Input values

---

### SkillExecution

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L120)

Record of a skill execution.

#### Properties

##### context?

```ts
readonly optional context?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L136)

Context in which the skill was used

##### endTime

```ts
readonly endTime: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L126)

When the execution ended

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L134)

Error message (if failed)

##### input

```ts
readonly input: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L130)

Input provided

##### output?

```ts
readonly optional output?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L132)

Output produced (if successful)

##### skillId

```ts
readonly skillId: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L122)

ID of the skill executed

##### startTime

```ts
readonly startTime: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L124)

When the execution started

##### status

```ts
readonly status: SkillExecutionStatus;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L128)

Execution status

---

### SkillLibraryConfig

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:305](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L305)

Configuration for the skill library.

#### Properties

##### enablePruning

```ts
readonly enablePruning: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:313](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L313)

Enable automatic skill pruning

##### executionsBeforeEvaluation

```ts
readonly executionsBeforeEvaluation: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L311)

Number of executions before evaluating retention

##### maxHistoryPerSkill

```ts
readonly maxHistoryPerSkill: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:317](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L317)

Maximum execution history entries per skill

##### maxSkills

```ts
readonly maxSkills: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:307](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L307)

Maximum skills to store

##### minSuccessesForPromotion

```ts
readonly minSuccessesForPromotion: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:324](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L324)

Minimum successful executions before promoting the skill as a
belief into the shared substrate (Phase 6 of #2792). Default 5.
Skills below this threshold are still tracked locally; promotion
only fires once the signal stabilizes.

##### minSuccessRateForRetention

```ts
readonly minSuccessRateForRetention: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L309)

Minimum success rate to keep skill (0-1)

##### skillPromoter?

```ts
readonly optional skillPromoter?: SkillPromoter;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:330](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L330)

Optional promotion bridge to the shared belief store. When set,
SkillLibrary fires the callback whenever a skill crosses the
`minSuccessesForPromotion` threshold. Default: undefined (no-op).

##### trackExecutionHistory

```ts
readonly trackExecutionHistory: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:315](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L315)

Whether to track detailed execution history

---

### SkillLoaderConfig

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L50)

Configuration for the skill loader.

#### Properties

##### defaultMaxSkills

```ts
readonly defaultMaxSkills: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L54)

Default maximum skills per agent if not specified in mapping

##### enforceDependencies

```ts
readonly enforceDependencies: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L58)

Whether to enforce dependency ordering

##### enforceRBAC

```ts
readonly enforceRBAC: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L56)

Whether to enforce RBAC checks during loading

##### fallbackBehavior

```ts
readonly fallbackBehavior: FallbackBehavior;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L60)

Behavior when required skills are missing

##### mappings

```ts
readonly mappings: readonly RoleSkillMapping[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L52)

Role-to-skill category mappings

---

### SkillLoaderError

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L104)

Skill loader error with code and context.

#### Properties

##### code

```ts
readonly code: SkillLoaderErrorCode;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L105)

##### context?

```ts
readonly optional context?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L107)

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L106)

---

### SkillMetrics

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L142)

Skill performance metrics.

#### Properties

##### avgExecutionTimeMs

```ts
readonly avgExecutionTimeMs: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L148)

Average execution time in milliseconds

##### executionCount

```ts
readonly executionCount: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L144)

Total number of executions

##### lastExecutedAt?

```ts
readonly optional lastExecutedAt?: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L152)

Last execution time

##### successCount

```ts
readonly successCount: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L146)

Number of successful executions

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L150)

Success rate (0-1)

---

### SkillParameter

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L92)

Parameter definition for a skill.

#### Properties

##### defaultValue?

```ts
readonly optional defaultValue?: unknown;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L102)

Default value if not required

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L98)

Parameter description

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L94)

Parameter name

##### required

```ts
readonly required: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L100)

Whether the parameter is required

##### type

```ts
readonly type: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L96)

Type description

---

### SkillProvenance

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L124)

Tracks the origin and modification history of a skill.

#### Properties

##### createdAt

```ts
readonly createdAt: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L128)

When the skill was created

##### createdBy

```ts
readonly createdBy: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L126)

Identifier of who created the skill

##### modifiedAt?

```ts
readonly optional modifiedAt?: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L132)

When the skill was last modified

##### modifiedBy?

```ts
readonly optional modifiedBy?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L130)

Identifier of who last modified the skill

##### signature?

```ts
readonly optional signature?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L136)

Cryptographic signature for verification

##### version

```ts
readonly version: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L134)

Version number (increments on modification)

---

### SkillQuery

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L166)

Query options for skill retrieval.

#### Properties

##### category?

```ts
readonly optional category?: SkillCategory;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L170)

Filter by category

##### complexity?

```ts
readonly optional complexity?: SkillComplexity;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L172)

Filter by complexity

##### limit?

```ts
readonly optional limit?: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L178)

Maximum number of results

##### minSuccessRate?

```ts
readonly optional minSuccessRate?: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L176)

Minimum success rate

##### search?

```ts
readonly optional search?: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L168)

Search in name and description

##### sortBy?

```ts
readonly optional sortBy?: "name" | "createdAt" | "successRate" | "executionCount";
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L180)

Sort by field

##### sortOrder?

```ts
readonly optional sortOrder?: "asc" | "desc";
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L182)

Sort direction

##### tags?

```ts
readonly optional tags?: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L174)

Filter by tags (any match)

---

### SkillRBAC

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L89)

Role-based access control for skill execution.

#### Properties

##### allowedRoles

```ts
readonly allowedRoles: readonly AgentRole[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L91)

Roles that are allowed to execute this skill

##### deniedRoles?

```ts
readonly optional deniedRoles?: readonly AgentRole[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L93)

Roles that are explicitly denied (takes precedence over allowed)

##### requiresAttestation

```ts
readonly requiresAttestation: boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L95)

Whether execution requires attestation even for allowed roles

---

### SkillSearchResult

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L188)

Result of a skill search.

#### Properties

##### query

```ts
readonly query: SkillQuery;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L194)

Query that produced this result

##### skills

```ts
readonly skills: readonly SkillWithMetrics[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L190)

Matching skills with metrics

##### totalCount

```ts
readonly totalCount: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L192)

Total number of matches (before limit)

---

### SkillSecurityError

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L185)

Security error with code and context.

#### Properties

##### code

```ts
readonly code: SecurityErrorCode;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L186)

##### context?

```ts
readonly optional context?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L188)

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L187)

---

### SkillStore

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:371](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L371)

In-memory skill storage structure.

#### Properties

##### executions

```ts
executions: Map<string, SkillExecution[]>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:373](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L373)

##### metrics

```ts
metrics: Map<string, SkillMetrics>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:374](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L374)

##### skills

```ts
skills: Map<string, Skill>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:372](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L372)

---

### SkillWithMetrics

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L158)

A skill with its execution metrics.

#### Extends

- [`Skill`](#skill)

#### Properties

##### capabilities?

```ts
readonly optional capabilities?: SkillCapabilities;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L82)

Security capabilities (optional, for controlled execution)

###### Inherited from

[`Skill`](#skill).[`capabilities`](#capabilities)

##### category

```ts
readonly category: SkillCategory;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L60)

Category for organization

###### Inherited from

[`Skill`](#skill).[`category`](#category-1)

##### code

```ts
readonly code: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L64)

The executable code (function body)

###### Inherited from

[`Skill`](#skill).[`code`](#code-2)

##### complexity

```ts
readonly complexity: SkillComplexity;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L62)

Complexity level

###### Inherited from

[`Skill`](#skill).[`complexity`](#complexity-1)

##### createdAt

```ts
readonly createdAt: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L76)

When the skill was created

###### Inherited from

[`Skill`](#skill).[`createdAt`](#createdat)

##### dependencies

```ts
readonly dependencies: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L70)

Skills this depends on (for composition)

###### Inherited from

[`Skill`](#skill).[`dependencies`](#dependencies-1)

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L58)

Detailed description of what the skill does

###### Inherited from

[`Skill`](#skill).[`description`](#description-1)

##### examples

```ts
readonly examples: readonly SkillExample[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L74)

Usage example(s)

###### Inherited from

[`Skill`](#skill).[`examples`](#examples-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L54)

Unique identifier

###### Inherited from

[`Skill`](#skill).[`id`](#id)

##### metrics

```ts
readonly metrics: SkillMetrics;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L160)

Execution metrics

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L56)

Human-readable name

###### Inherited from

[`Skill`](#skill).[`name`](#name-1)

##### outputType

```ts
readonly outputType: string;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L68)

Expected output type description

###### Inherited from

[`Skill`](#skill).[`outputType`](#outputtype-1)

##### parameters

```ts
readonly parameters: readonly SkillParameter[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L66)

Input parameter definitions

###### Inherited from

[`Skill`](#skill).[`parameters`](#parameters-1)

##### provenance?

```ts
readonly optional provenance?: SkillProvenance;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L86)

Provenance tracking (optional, for audit trail)

###### Inherited from

[`Skill`](#skill).[`provenance`](#provenance)

##### rbac?

```ts
readonly optional rbac?: SkillRBAC;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L84)

Role-based access control (optional, for permission enforcement)

###### Inherited from

[`Skill`](#skill).[`rbac`](#rbac)

##### tags

```ts
readonly tags: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L72)

Keywords for search/retrieval

###### Inherited from

[`Skill`](#skill).[`tags`](#tags-1)

##### updatedAt

```ts
readonly updatedAt: Date;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L78)

When the skill was last modified

###### Inherited from

[`Skill`](#skill).[`updatedAt`](#updatedat)

##### version

```ts
readonly version: number;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L80)

Version number for tracking changes

###### Inherited from

[`Skill`](#skill).[`version`](#version)

## Type Aliases

### AuthorizationMethod

```ts
type AuthorizationMethod = 'role' | 'explicit' | 'inherited';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L146)

Method used to authorize skill execution.

---

### DependencyErrorCode

```ts
type DependencyErrorCode =
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_DEPENDENCY'
  | 'VERSION_MISMATCH'
  | 'SELF_DEPENDENCY'
  | 'SKILL_NOT_FOUND';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L42)

Error codes for dependency-related failures.

---

### FallbackBehavior

```ts
type FallbackBehavior = 'error' | 'partial' | 'empty';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L41)

Configuration for fallback behavior when skills cannot be loaded.

- error: Fail the load operation with an error
- partial: Load whatever skills are available
- empty: Return an empty skill set

---

### SecurityErrorCode

```ts
type SecurityErrorCode =
  | 'PERMISSION_DENIED'
  | 'ROLE_NOT_ALLOWED'
  | 'ATTESTATION_REQUIRED'
  | 'INVALID_PROVENANCE'
  | 'SIGNATURE_MISMATCH'
  | 'EXECUTION_TIMEOUT'
  | 'SANDBOX_VIOLATION';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L173)

Error codes for security-related failures.

---

### SkillCategory

```ts
type SkillCategory =
  | 'file-operations'
  | 'code-generation'
  | 'code-analysis'
  | 'testing'
  | 'documentation'
  | 'refactoring'
  | 'debugging'
  | 'deployment'
  | 'general'
  | 'coding-standards'
  | 'security'
  | 'database'
  | 'cloud-native'
  | 'devops'
  | 'api'
  | 'frontend'
  | 'observability'
  | 'compliance';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L29)

Skill categories for organization.

Extended in Epic #643 to support standards absorption categories.

---

### SkillComplexity

```ts
type SkillComplexity = 'primitive' | 'simple' | 'moderate' | 'complex' | 'composite';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L17)

Skill complexity levels.

---

### SkillDependencyType

```ts
type SkillDependencyType = 'required' | 'optional' | 'recommended';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L23)

Type of dependency relationship between skills.

- required: Skill cannot execute without dependency
- optional: Skill can execute without, but benefits from dependency
- recommended: Soft dependency, suggestion only

---

### SkillExecutionStatus

```ts
type SkillExecutionStatus = 'success' | 'failure' | 'timeout' | 'error';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L22)

Skill execution status.

---

### SkillLoaderErrorCode

```ts
type SkillLoaderErrorCode =
  | 'ROLE_NOT_MAPPED'
  | 'REQUIRED_CATEGORY_MISSING'
  | 'RBAC_DENIED'
  | 'DEPENDENCY_ERROR'
  | 'VALIDATION_ERROR'
  | 'EMPTY_RESULT';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L93)

Error codes for skill loader failures.

---

### SkillPermission

```ts
type SkillPermission = 'read' | 'write' | 'execute' | 'network' | 'filesystem' | 'spawn';
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L22)

Available skill permissions.
Each permission grants specific capabilities to a skill.

## Variables

### AuthorizationMethodSchema

```ts
const AuthorizationMethodSchema: ZodEnum<{
  explicit: 'explicit';
  inherited: 'inherited';
  role: 'role';
}>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L114)

Zod schema for AuthorizationMethod.

---

### COMPLEXITY_ORDER

```ts
const COMPLEXITY_ORDER: Record<SkillComplexity, number>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:349](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L349)

Complexity ordering for comparisons.

---

### DEFAULT_COMPOSER_CONFIG

```ts
const DEFAULT_COMPOSER_CONFIG: SkillComposerConfig;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L43)

Default composer configuration.

---

### DEFAULT_EXECUTION_TIME_MS

```ts
const DEFAULT_EXECUTION_TIME_MS: 30000 = 30_000;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L55)

Default execution time limit in milliseconds.

---

### DEFAULT_PERMISSIONS

```ts
const DEFAULT_PERMISSIONS: readonly SkillPermission[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L45)

Default permissions for new skills (minimal, read-only).

---

### DEFAULT_RBAC

```ts
const DEFAULT_RBAC: SkillRBAC;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L101)

Default RBAC allowing all roles without attestation requirement.

---

### DEFAULT_ROLE_MAPPINGS

```ts
const DEFAULT_ROLE_MAPPINGS: readonly RoleSkillMapping[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:278](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L278)

Default role-to-skill category mappings.
Maps expert roles to their appropriate skill categories.

---

### DEFAULT_SKILL_LIBRARY_CONFIG

```ts
const DEFAULT_SKILL_LIBRARY_CONFIG: SkillLibraryConfig;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-types.ts:336](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-types.ts#L336)

Default skill library configuration.

---

### DEFAULT_SKILL_LOADER_CONFIG

```ts
const DEFAULT_SKILL_LOADER_CONFIG: SkillLoaderConfig;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L361)

Default skill loader configuration.

---

### DependencyErrorCodeSchema

```ts
const DependencyErrorCodeSchema: ZodEnum<{
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY';
  MISSING_DEPENDENCY: 'MISSING_DEPENDENCY';
  SELF_DEPENDENCY: 'SELF_DEPENDENCY';
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND';
  VERSION_MISMATCH: 'VERSION_MISMATCH';
}>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L110)

Zod schema for DependencyErrorCode.

---

### DependencyErrorSchema

```ts
const DependencyErrorSchema: ZodObject<
  {
    code: ZodEnum<{
      CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY';
      MISSING_DEPENDENCY: 'MISSING_DEPENDENCY';
      SELF_DEPENDENCY: 'SELF_DEPENDENCY';
      SKILL_NOT_FOUND: 'SKILL_NOT_FOUND';
      VERSION_MISMATCH: 'VERSION_MISMATCH';
    }>;
    context: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    message: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L121)

Zod schema for DependencyError.

---

### LoadedSkillSetSchema

```ts
const LoadedSkillSetSchema: ZodObject<
  {
    agentId: ZodString;
    agentRole: ZodEnum<{
      architecture_expert: 'architecture_expert';
      code_expert: 'code_expert';
      custom: 'custom';
      devops_expert: 'devops_expert';
      documentation_expert: 'documentation_expert';
      orchestrator: 'orchestrator';
      security_expert: 'security_expert';
      testing_expert: 'testing_expert';
      thinker: 'thinker';
      verifier: 'verifier';
      worker: 'worker';
    }>;
    executionOrder: ZodReadonly<ZodArray<ZodString>>;
    loadedAt: ZodDate;
    missingRequired: ZodReadonly<ZodArray<ZodString>>;
    skills: ZodReadonly<ZodArray<ZodAny>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L240)

Zod schema for LoadedSkillSet.

---

### MAX_EXECUTION_TIME_MS

```ts
const MAX_EXECUTION_TIME_MS: 300000 = 300_000;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L50)

Maximum execution time in milliseconds.

---

### SecurityErrorCodeSchema

```ts
const SecurityErrorCodeSchema: ZodEnum<{
  ATTESTATION_REQUIRED: 'ATTESTATION_REQUIRED';
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT';
  INVALID_PROVENANCE: 'INVALID_PROVENANCE';
  PERMISSION_DENIED: 'PERMISSION_DENIED';
  ROLE_NOT_ALLOWED: 'ROLE_NOT_ALLOWED';
  SANDBOX_VIOLATION: 'SANDBOX_VIOLATION';
  SIGNATURE_MISMATCH: 'SIGNATURE_MISMATCH';
}>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L139)

Zod schema for SecurityErrorCode.

---

### SKILL_DEFAULT_CAPABILITIES

```ts
const SKILL_DEFAULT_CAPABILITIES: SkillCapabilities;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L76)

Default capabilities for new skills.

---

### SKILL_PERMISSIONS

```ts
const SKILL_PERMISSIONS: readonly SkillPermission[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-types.ts#L33)

All valid skill permissions as a readonly array.

---

### SkillAgentRoleSchema

```ts
const SkillAgentRoleSchema: ZodEnum<{
  architecture_expert: 'architecture_expert';
  code_expert: 'code_expert';
  custom: 'custom';
  documentation_expert: 'documentation_expert';
  infrastructure_expert: 'infrastructure_expert';
  orchestrator: 'orchestrator';
  security_expert: 'security_expert';
  testing_expert: 'testing_expert';
  thinker: 'thinker';
  verifier: 'verifier';
  worker: 'worker';
}>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L33)

Zod schema for AgentRole (mirrors core/types/agent.ts).

---

### SkillAttestationSchema

```ts
const SkillAttestationSchema: ZodObject<
  {
    authorizationMethod: ZodEnum<{
      explicit: 'explicit';
      inherited: 'inherited';
      role: 'role';
    }>;
    authorized: ZodBoolean;
    executorId: ZodString;
    inputHash: ZodString;
    skillId: ZodString;
    timestamp: ZodDate;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L119)

Zod schema for SkillAttestation.

---

### SkillCapabilitiesSchema

```ts
const SkillCapabilitiesSchema: ZodObject<
  {
    maxExecutionTime: ZodNumber;
    permissions: ZodReadonly<
      ZodArray<
        ZodEnum<{
          execute: 'execute';
          filesystem: 'filesystem';
          network: 'network';
          read: 'read';
          spawn: 'spawn';
          write: 'write';
        }>
      >
    >;
    sandboxed: ZodBoolean;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L54)

Zod schema for SkillCapabilities.

---

### SkillDependencySchema

```ts
const SkillDependencySchema: ZodObject<
  {
    dependsOn: ZodString;
    minVersion: ZodOptional<ZodNumber>;
    skillId: ZodString;
    type: ZodEnum<{
      optional: 'optional';
      recommended: 'recommended';
      required: 'required';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L100)

Zod schema for SkillDependency.

---

### SkillDependencyTypeSchema

```ts
const SkillDependencyTypeSchema: ZodEnum<{
  optional: 'optional';
  recommended: 'recommended';
  required: 'required';
}>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-types.ts#L95)

Zod schema for SkillDependencyType.

---

### SkillLoaderConfigSchema

```ts
const SkillLoaderConfigSchema: ZodObject<{
  defaultMaxSkills: ZodDefault<ZodNumber>;
  enforceDependencies: ZodDefault<ZodBoolean>;
  enforceRBAC: ZodDefault<ZodBoolean>;
  fallbackBehavior: ZodDefault<ZodEnum<{
     empty: "empty";
     error: "error";
     partial: "partial";
  }>>;
  mappings: ZodReadonly<ZodArray<ZodObject<{
     maxSkills: ZodOptional<ZodNumber>;
     optionalCategories: ZodOptional<ZodReadonly<ZodArray<ZodEnum<{
        api: ...;
        cloud-native: ...;
        code-analysis: ...;
        code-generation: ...;
        coding-standards: ...;
        compliance: ...;
        database: ...;
        debugging: ...;
        deployment: ...;
        devops: ...;
        documentation: ...;
        file-operations: ...;
        frontend: ...;
        general: ...;
        observability: ...;
        refactoring: ...;
        security: ...;
        testing: ...;
     }>>>>;
     requiredCategories: ZodReadonly<ZodArray<ZodEnum<{
        api: "api";
        cloud-native: "cloud-native";
        code-analysis: "code-analysis";
        code-generation: "code-generation";
        coding-standards: "coding-standards";
        compliance: "compliance";
        database: "database";
        debugging: "debugging";
        deployment: "deployment";
        devops: "devops";
        documentation: "documentation";
        file-operations: "file-operations";
        frontend: "frontend";
        general: "general";
        observability: "observability";
        refactoring: "refactoring";
        security: "security";
        testing: "testing";
     }>>>;
     role: ZodEnum<{
        architecture_expert: "architecture_expert";
        code_expert: "code_expert";
        custom: "custom";
        devops_expert: "devops_expert";
        documentation_expert: "documentation_expert";
        orchestrator: "orchestrator";
        security_expert: "security_expert";
        testing_expert: "testing_expert";
        thinker: "thinker";
        verifier: "verifier";
        worker: "worker";
     }>;
  }, $strip>>>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L229)

Zod schema for SkillLoaderConfig.

---

### SkillLoaderErrorSchema

```ts
const SkillLoaderErrorSchema: ZodObject<
  {
    code: ZodEnum<{
      DEPENDENCY_ERROR: 'DEPENDENCY_ERROR';
      EMPTY_RESULT: 'EMPTY_RESULT';
      RBAC_DENIED: 'RBAC_DENIED';
      REQUIRED_CATEGORY_MISSING: 'REQUIRED_CATEGORY_MISSING';
      ROLE_NOT_MAPPED: 'ROLE_NOT_MAPPED';
      VALIDATION_ERROR: 'VALIDATION_ERROR';
    }>;
    context: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    message: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-types.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-types.ts#L264)

Zod schema for SkillLoaderError.

---

### SkillPermissionSchema

```ts
const SkillPermissionSchema: ZodEnum<{
  execute: 'execute';
  filesystem: 'filesystem';
  network: 'network';
  read: 'read';
  spawn: 'spawn';
  write: 'write';
}>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L21)

Zod schema for SkillPermission.

---

### SkillProvenanceSchema

```ts
const SkillProvenanceSchema: ZodObject<
  {
    createdAt: ZodDate;
    createdBy: ZodString;
    modifiedAt: ZodOptional<ZodDate>;
    modifiedBy: ZodOptional<ZodString>;
    signature: ZodOptional<ZodString>;
    version: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L98)

Zod schema for SkillProvenance.

---

### SkillRBACSchema

```ts
const SkillRBACSchema: ZodObject<
  {
    allowedRoles: ZodReadonly<
      ZodArray<
        ZodEnum<{
          architecture_expert: 'architecture_expert';
          code_expert: 'code_expert';
          custom: 'custom';
          documentation_expert: 'documentation_expert';
          infrastructure_expert: 'infrastructure_expert';
          orchestrator: 'orchestrator';
          security_expert: 'security_expert';
          testing_expert: 'testing_expert';
          thinker: 'thinker';
          verifier: 'verifier';
          worker: 'worker';
        }>
      >
    >;
    deniedRoles: ZodOptional<
      ZodReadonly<
        ZodArray<
          ZodEnum<{
            architecture_expert: 'architecture_expert';
            code_expert: 'code_expert';
            custom: 'custom';
            documentation_expert: 'documentation_expert';
            infrastructure_expert: 'infrastructure_expert';
            orchestrator: 'orchestrator';
            security_expert: 'security_expert';
            testing_expert: 'testing_expert';
            thinker: 'thinker';
            verifier: 'verifier';
            worker: 'worker';
          }>
        >
      >
    >;
    requiresAttestation: ZodBoolean;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L77)

Zod schema for SkillRBAC.

---

### SkillSecurityErrorSchema

```ts
const SkillSecurityErrorSchema: ZodObject<
  {
    code: ZodEnum<{
      ATTESTATION_REQUIRED: 'ATTESTATION_REQUIRED';
      EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT';
      INVALID_PROVENANCE: 'INVALID_PROVENANCE';
      PERMISSION_DENIED: 'PERMISSION_DENIED';
      ROLE_NOT_ALLOWED: 'ROLE_NOT_ALLOWED';
      SANDBOX_VIOLATION: 'SANDBOX_VIOLATION';
      SIGNATURE_MISMATCH: 'SIGNATURE_MISMATCH';
    }>;
    context: ZodOptional<ZodRecord<ZodString, ZodUnknown>>;
    message: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security-schemas.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security-schemas.ts#L152)

Zod schema for SkillSecurityError.

## Functions

### buildSkillDependencyGraph()

```ts
function buildSkillDependencyGraph(skills): ISkillDependencyGraph;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L309)

Builds a dependency graph from an array of skills.

#### Parameters

##### skills

readonly [`Skill`](#skill)[]

#### Returns

[`ISkillDependencyGraph`](#iskilldependencygraph)

---

### canExecuteSkill()

```ts
function canExecuteSkill(agentRole, rbac): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L86)

Checks if an agent role can execute a skill based on RBAC rules.

#### Parameters

##### agentRole

[`AgentRole`](core.md#agentrole)

The role of the agent attempting execution

##### rbac

[`SkillRBAC`](#skillrbac-1)

The skill's RBAC configuration

#### Returns

`boolean`

True if the role is allowed to execute the skill

---

### checkPermissionBoundary()

```ts
function checkPermissionBoundary(capabilities, requestedPermissions): boolean;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L202)

Checks if requested permissions are within the skill's permission boundary.

#### Parameters

##### capabilities

[`SkillCapabilities`](#skillcapabilities-1)

The skill's capability configuration

##### requestedPermissions

readonly [`SkillPermission`](#skillpermission)[]

Permissions being requested for an operation

#### Returns

`boolean`

True if all requested permissions are allowed

---

### createAttestation()

```ts
function createAttestation(skillId, executorId, input, authorized, method): SkillAttestation;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L123)

Creates an attestation record for a skill execution.

#### Parameters

##### skillId

`string`

ID of the skill being executed

##### executorId

`string`

ID of the agent executing the skill

##### input

`unknown`

Input parameters for the skill

##### authorized

`boolean`

Whether execution is authorized

##### method

[`AuthorizationMethod`](#authorizationmethod-1)

How authorization was determined

#### Returns

[`SkillAttestation`](#skillattestation)

A new SkillAttestation record

---

### createDependencyError()

```ts
function createDependencyError(code, message, context?): DependencyError;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-helpers.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-helpers.ts#L38)

Creates a dependency error with the given code and message.

#### Parameters

##### code

[`DependencyErrorCode`](#dependencyerrorcode-1)

The error code

##### message

`string`

Human-readable error message

##### context?

`Record`\<`string`, `unknown`\>

Additional context for debugging

#### Returns

[`DependencyError`](#dependencyerror)

A DependencyError

---

### createSecurityError()

```ts
function createSecurityError(code, message, context?): SkillSecurityError;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:222](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L222)

Creates a security error with the given code and message.

#### Parameters

##### code

[`SecurityErrorCode`](#securityerrorcode)

The error code

##### message

`string`

Human-readable error message

##### context?

`Record`\<`string`, `unknown`\>

Additional context for debugging

#### Returns

[`SkillSecurityError`](#skillsecurityerror)

A SkillSecurityError

---

### createSkillComposer()

```ts
function createSkillComposer(library, config?, logger?): SkillComposer;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-composer.ts:373](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-composer.ts#L373)

Creates a skill composer.

#### Parameters

##### library

[`SkillLibrary`](#skilllibrary)

##### config?

`Partial`\<[`SkillComposerConfig`](#skillcomposerconfig)\>

##### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`SkillComposer`](#skillcomposer)

---

### createSkillDependencyGraph()

```ts
function createSkillDependencyGraph(): ISkillDependencyGraph;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts:330](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph.ts#L330)

Creates an empty skill dependency graph.

#### Returns

[`ISkillDependencyGraph`](#iskilldependencygraph)

---

### createSkillLibrary()

```ts
function createSkillLibrary(config?, logger?): SkillLibrary;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-library.ts:433](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-library.ts#L433)

Creates a skill library with optional configuration.

#### Parameters

##### config?

`Partial`\<[`SkillLibraryConfig`](#skilllibraryconfig)\>

##### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`SkillLibrary`](#skilllibrary)

---

### createSkillLoader()

```ts
function createSkillLoader(library, config?, logger?): ISkillLoader;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader.ts:396](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader.ts#L396)

Creates a skill loader with the given library and configuration.

#### Parameters

##### library

[`SkillLibrary`](#skilllibrary)

##### config?

`Partial`\<[`SkillLoaderConfig`](#skillloaderconfig)\>

##### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`ISkillLoader`](#iskillloader)

---

### findMissingDependencies()

```ts
function findMissingDependencies(graph, skillIds, available): readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-helpers.ts:239](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-helpers.ts#L239)

Finds missing dependencies for a set of skills.

#### Parameters

##### graph

[`ISkillDependencyGraph`](#iskilldependencygraph)

The dependency graph

##### skillIds

readonly `string`[]

Skills to check

##### available

`ReadonlySet`\<`string`\>

Set of available skill IDs

#### Returns

readonly `string`[]

Array of missing required dependency IDs

---

### getSkillSetForTask()

```ts
function getSkillSetForTask(agent, task, loader): Result<LoadedSkillSet, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-integration.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-integration.ts#L98)

Gets the full loaded skill set for a task execution.

Unlike `getSkillsForTask`, this returns the complete `LoadedSkillSet`
including execution order and missing required information.

#### Parameters

##### agent

[`IAgent`](core.md#iagent)

The agent that will execute the task

##### task

[`Task`](core.md#task)

The task to get skills for

##### loader

[`ISkillLoader`](#iskillloader)

The skill loader to use

#### Returns

[`Result`](core.md#result)\<[`LoadedSkillSet`](#loadedskillset), [`SkillLoaderError`](#skillloadererror)\>

Result with LoadedSkillSet or SkillLoaderError on failure

---

### getSkillsForTask()

```ts
function getSkillsForTask(agent, task, loader): Result<readonly Skill[], SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-integration.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-integration.ts#L77)

Gets skills appropriate for a task execution.

Loads skills based on the agent's role and the task description,
potentially including additional task-relevant skills beyond
the agent's default role-based skills.

#### Parameters

##### agent

[`IAgent`](core.md#iagent)

The agent that will execute the task

##### task

[`Task`](core.md#task)

The task to get skills for

##### loader

[`ISkillLoader`](#iskillloader)

The skill loader to use

#### Returns

[`Result`](core.md#result)\<readonly [`Skill`](#skill)[], [`SkillLoaderError`](#skillloadererror)\>

Result with readonly array of skills or SkillLoaderError on failure

#### Example

```typescript
const agent = createAgent({ id: 'agent-1', role: 'code_expert' });
const task = { id: 'task-1', description: 'Refactor the user service' };
const loader = createSkillLoader(library);

const result = getSkillsForTask(agent, task, loader);
if (result.ok) {
  console.log(`Loaded ${result.value.length} skills for task`);
}
```

---

### initializeAgentSkills()

```ts
function initializeAgentSkills(agent, loader): Result<void, SkillLoaderError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-loader-integration.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-loader-integration.ts#L40)

Initializes skills for an agent during agent setup.

Loads the appropriate skills for the agent's role and validates
the loaded skill set for consistency. This should be called during
agent initialization to ensure skills are ready for task execution.

#### Parameters

##### agent

[`IAgent`](core.md#iagent)

The agent to initialize skills for

##### loader

[`ISkillLoader`](#iskillloader)

The skill loader to use

#### Returns

[`Result`](core.md#result)\<`void`, [`SkillLoaderError`](#skillloadererror)\>

Result with void on success or SkillLoaderError on failure

#### Example

```typescript
const agent = createAgent({ id: 'agent-1', role: 'code_expert' });
const loader = createSkillLoader(library);

const result = initializeAgentSkills(agent, loader);
if (!result.ok) {
  console.error('Failed to initialize skills:', result.error);
}
```

---

### resolveWithFallbacks()

```ts
function resolveWithFallbacks(
  graph,
  skillIds,
  available
): Result<readonly string[], DependencyError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-dependency-graph-helpers.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-dependency-graph-helpers.ts#L193)

Resolves skill dependencies with fallbacks for missing optional dependencies.

#### Parameters

##### graph

[`ISkillDependencyGraph`](#iskilldependencygraph)

The dependency graph

##### skillIds

readonly `string`[]

Skills to resolve

##### available

`ReadonlySet`\<`string`\>

Set of available skill IDs

#### Returns

[`Result`](core.md#result)\<readonly `string`[], [`DependencyError`](#dependencyerror)\>

Result with resolved skill IDs or error

---

### validateSkillCapabilities()

```ts
function validateSkillCapabilities(capabilities): Result<void, SkillSecurityError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:241](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L241)

Validates capabilities against security constraints.

#### Parameters

##### capabilities

[`SkillCapabilities`](#skillcapabilities-1)

The capabilities to validate

#### Returns

[`Result`](core.md#result)\<`void`, [`SkillSecurityError`](#skillsecurityerror)\>

Result indicating success or validation error

---

### validateSkillExecution()

```ts
function validateSkillExecution(
  agentRole,
  capabilities,
  rbac,
  requestedPermissions
): Result<void, SkillSecurityError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:318](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L318)

Performs comprehensive security validation for skill execution.

#### Parameters

##### agentRole

[`AgentRole`](core.md#agentrole)

The role of the agent attempting execution

##### capabilities

[`SkillCapabilities`](#skillcapabilities-1)

The skill's capabilities

##### rbac

[`SkillRBAC`](#skillrbac-1)

The skill's RBAC configuration

##### requestedPermissions

readonly [`SkillPermission`](#skillpermission)[]

Permissions needed for the operation

#### Returns

[`Result`](core.md#result)\<`void`, [`SkillSecurityError`](#skillsecurityerror)\>

Result indicating success or the first validation error

---

### validateSkillProvenance()

```ts
function validateSkillProvenance(provenance): Result<void, SkillSecurityError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L150)

Validates skill provenance for integrity.

#### Parameters

##### provenance

[`SkillProvenance`](#skillprovenance-1)

The provenance to validate

#### Returns

[`Result`](core.md#result)\<`void`, [`SkillSecurityError`](#skillsecurityerror)\>

Result indicating success or validation error

---

### validateSkillRBAC()

```ts
function validateSkillRBAC(rbac): Result<void, SkillSecurityError>;
```

Defined in: [packages/nexus-agents/src/agents/skills/skill-security.ts:279](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/skills/skill-security.ts#L279)

Validates RBAC configuration.

#### Parameters

##### rbac

[`SkillRBAC`](#skillrbac-1)

The RBAC configuration to validate

#### Returns

[`Result`](core.md#result)\<`void`, [`SkillSecurityError`](#skillsecurityerror)\>

Result indicating success or validation error
