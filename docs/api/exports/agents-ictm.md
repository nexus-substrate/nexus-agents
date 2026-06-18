---
title: 'API: exports/agents-ictm'
description: Generated API reference for exports/agents-ictm.
tier: 2
---

# exports/agents-ictm

nexus-agents - ICTM Module Exports

AOrchestra ICTM (Instructions, Context, Tools, Model) pattern
for dynamic sub-agent creation.

Split from agents.ts to stay under the 400-line limit.

## See

Issue #756

## Interfaces

### ContextFilter

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L29)

Context filter configuration.
Controls what information flows to a sub-agent to prevent
long-horizon degradation (AOrchestra Section 3.2).

#### Properties

##### includeHistory

```ts
includeHistory: boolean;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L35)

Whether to include conversation history

##### maxTokens

```ts
maxTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L31)

Maximum token budget for curated context

##### pruneStrategy

```ts
pruneStrategy: ContextPruneStrategy;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L37)

Strategy for pruning excess context

##### relevanceThreshold

```ts
relevanceThreshold: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L33)

Minimum relevance score (0-1) to include context items

---

### CuratedContextItem

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L142)

A context item that can be filtered and ranked.

#### Properties

##### content

```ts
content: string;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L146)

Text content

##### id

```ts
id: string;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L144)

Unique item identifier

##### relevance

```ts
relevance: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L152)

Relevance score (0-1) assigned during curation

##### source

```ts
source: 'knowledge' | 'result' | 'task' | 'history';
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L154)

Source category

##### timestamp

```ts
timestamp: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L150)

Timestamp (ms since epoch) for recency scoring

##### tokenCount

```ts
tokenCount: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L148)

Estimated token count

---

### CurationResult

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L131)

Curated context result.

#### Properties

##### filteredCount

```ts
filteredCount: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L137)

Number of items filtered out

##### items

```ts
items: CuratedContextItem[];
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L133)

Selected context items, ordered by score (descending)

##### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L135)

Total tokens used

##### trimmedCount

```ts
trimmedCount: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L139)

Number of items trimmed for token budget

---

### ICTMConfig

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L101)

ICTM configuration tuple.

Each sub-agent receives a unique ICTM config tailored to its subtask,
enabling dynamic specialization instead of static expert roles.

#### Example

```typescript
const config: ICTMConfig = {
  instructions: 'Analyze the authentication module for SQL injection vulnerabilities.',
  context: {
    maxTokens: 8000,
    relevanceThreshold: 0.7,
    includeHistory: false,
    pruneStrategy: 'importance',
  },
  tools: { capabilities: ['code_review', 'research'], restrictions: ['code_generation'] },
  model: { temperature: 0.1, reasoning: 'extended' },
};
```

#### Properties

##### context

```ts
context: ContextFilter;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L105)

Context curation filter

##### instructions

```ts
instructions: string;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L103)

Task-specific instructions (extends the base system prompt)

##### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L111)

Optional metadata for tracking/extensions

##### model

```ts
model: ModelSelection;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L109)

Model configuration

##### tools

```ts
tools: ToolSet;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L107)

Selected tool capabilities

---

### ICTMInferenceResult

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L121)

Result of ICTM inference — the inferred config plus reasoning.

#### Properties

##### confidence

```ts
confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L132)

Confidence in the inference (0-1)

##### config

```ts
config: ICTMConfig;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L123)

Inferred ICTM configuration

##### reasoning

```ts
reasoning: {
  context: string;
  instructions: string;
  model: string;
  tools: string;
}
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L125)

Reasoning for each ICTM component

###### context

```ts
context: string;
```

###### instructions

```ts
instructions: string;
```

###### model

```ts
model: string;
```

###### tools

```ts
tools: string;
```

---

### ModelSelection

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L68)

Model selection for a sub-agent.
Enables per-subtask model optimization (performance-cost tradeoff).

#### Properties

##### maxTokens?

```ts
optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L76)

Maximum response tokens

##### modelId?

```ts
optional modelId?: string;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L72)

Specific model ID

##### provider?

```ts
optional provider?: string;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L70)

Provider ID (e.g., 'anthropic', 'openai')

##### reasoning?

```ts
optional reasoning?: ReasoningDepth;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L78)

Reasoning depth hint

##### temperature?

```ts
optional temperature?: number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L74)

Generation temperature (0-2)

---

### ToolSet

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L48)

Tool set configuration for a sub-agent.
Restricts capabilities to only what the subtask needs.

#### Properties

##### capabilities

```ts
capabilities: string[];
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L50)

Allowed capabilities (from AgentCapability values)

##### restrictions?

```ts
optional restrictions?: string[];
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L52)

Explicit tool restrictions — tool names to exclude

## Type Aliases

### ContextPruneStrategy

```ts
type ContextPruneStrategy = 'recency' | 'importance' | 'hybrid';
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L22)

Context pruning strategy for sub-agent context curation.

---

### ReasoningDepth

```ts
type ReasoningDepth = 'minimal' | 'standard' | 'extended';
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L62)

Reasoning depth hint for model selection.

## Variables

### ContextFilterSchema

```ts
const ContextFilterSchema: ZodObject<
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
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L163)

---

### ContextPruneStrategySchema

```ts
const ContextPruneStrategySchema: ZodEnum<{
  hybrid: 'hybrid';
  importance: 'importance';
  recency: 'recency';
}>;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L161)

---

### ICTMConfigSchema

```ts
const ICTMConfigSchema: ZodObject<
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
>;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L185)

---

### ICTMInferenceResultSchema

```ts
const ICTMInferenceResultSchema: ZodObject<
  {
    confidence: ZodNumber;
    config: ZodObject<
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
    >;
    reasoning: ZodObject<
      {
        context: ZodString;
        instructions: ZodString;
        model: ZodString;
        tools: ZodString;
      },
      $strip
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L193)

---

### ModelSelectionSchema

```ts
const ModelSelectionSchema: ZodObject<
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
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L177)

---

### ReasoningDepthSchema

```ts
const ReasoningDepthSchema: ZodEnum<{
  extended: 'extended';
  minimal: 'minimal';
  standard: 'standard';
}>;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L175)

---

### ToolSetSchema

```ts
const ToolSetSchema: ZodObject<
  {
    capabilities: ZodArray<ZodString>;
    restrictions: ZodOptional<ZodArray<ZodString>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-types.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-types.ts#L170)

## Functions

### createContextItem()

```ts
function createContextItem(id, content, source, relevance, timestamp?): CuratedContextItem;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L196)

Create a context item from raw text.

#### Parameters

##### id

`string`

##### content

`string`

##### source

`"knowledge"` \| `"result"` \| `"task"` \| `"history"`

##### relevance

`number`

##### timestamp?

`number`

#### Returns

[`CuratedContextItem`](#curatedcontextitem)

---

### curateContext()

```ts
function curateContext(items, filter, nowMs?): CurationResult;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L152)

Curate context items according to a context filter.

Pipeline: filter by history → filter by relevance → rank by strategy → trim to budget.

#### Parameters

##### items

readonly [`CuratedContextItem`](#curatedcontextitem)[]

All available context items

##### filter

[`ContextFilter`](#contextfilter)

Context filter configuration from ICTM config

##### nowMs?

`number`

Current timestamp in ms (defaults to Date.now())

#### Returns

[`CurationResult`](#curationresult)

Curated result with selected items and stats

---

### estimateTokens()

```ts
function estimateTokens(text): number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L189)

Estimate token count for a text string.
Uses a simple char/4 heuristic (same as preference-router-extractor).

#### Parameters

##### text

`string`

#### Returns

`number`

---

### getRecommendedRole()

```ts
function getRecommendedRole(taskType): string;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-factory.ts:278](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-factory.ts#L278)

Get the recommended expert role for a task type.
Falls back to 'code_expert' for unknown types.

#### Parameters

##### taskType

`string`

#### Returns

`string`

---

### ictmToExpertConfig()

```ts
function ictmToExpertConfig(ictm, subtaskId): ExpertConfig;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-factory.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-factory.ts#L62)

Convert an ICTM config to an ExpertConfig for the existing expert factory.

This bridges the ICTM pattern to the existing expert creation pipeline,
enabling backward compatibility with all existing expert infrastructure.

#### Parameters

##### ictm

[`ICTMConfig`](#ictmconfig)

##### subtaskId

`string`

#### Returns

[`ExpertConfig`](../agents.md#expertconfig-2)

---

### inferICTM()

```ts
function inferICTM(subtask, analysis): ICTMInferenceResult;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-factory.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-factory.ts#L242)

Infer an optimal ICTM configuration from a subtask and its parent task analysis.

This is the core intelligence of the ICTM pattern — it analyzes the subtask
to determine the best instructions, context filter, tools, and model config.

#### Parameters

##### subtask

[`SubTask`](../agents.md#subtask)

The subtask to create a sub-agent for

##### analysis

[`TaskAnalysis`](../agents.md#taskanalysis)

Analysis of the parent task

#### Returns

[`ICTMInferenceResult`](#ictminferenceresult)

ICTMInferenceResult with config and reasoning

---

### scoreByHybrid()

```ts
function scoreByHybrid(item, nowMs): number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L46)

Score an item using hybrid strategy (weighted average of recency + importance).

#### Parameters

##### item

[`CuratedContextItem`](#curatedcontextitem)

##### nowMs

`number`

#### Returns

`number`

---

### scoreByImportance()

```ts
function scoreByImportance(item): number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L39)

Score an item by importance (uses pre-assigned relevance).

#### Parameters

##### item

[`CuratedContextItem`](#curatedcontextitem)

#### Returns

`number`

---

### scoreByRecency()

```ts
function scoreByRecency(item, nowMs): number;
```

Defined in: [packages/nexus-agents/src/agents/ictm/context-curator.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/context-curator.ts#L31)

Score an item by recency using exponential decay.
More recent items score higher.

#### Parameters

##### item

[`CuratedContextItem`](#curatedcontextitem)

##### nowMs

`number`

#### Returns

`number`

---

### validateICTM()

```ts
function validateICTM(config): ICTMConfig | null;
```

Defined in: [packages/nexus-agents/src/agents/ictm/ictm-factory.ts:269](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/ictm/ictm-factory.ts#L269)

Validate an ICTM config using Zod schema.
Returns the validated config or null on failure.

#### Parameters

##### config

`unknown`

#### Returns

[`ICTMConfig`](#ictmconfig) \| `null`
