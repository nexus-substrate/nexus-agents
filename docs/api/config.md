---
title: 'API: config'
description: Generated API reference for config.
tier: 2
---

# config

## Classes

### AvailabilityCache

Defined in: [packages/nexus-agents/src/config/model-availability.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L59)

Bounded TTL cache for model availability probe results.
Thread-safe for single-threaded Node.js; no locks needed.

#### Constructors

##### Constructor

```ts
new AvailabilityCache(config?): AvailabilityCache;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L64)

###### Parameters

###### config?

[`AvailabilityCacheConfig`](#availabilitycacheconfig) = `{}`

###### Returns

[`AvailabilityCache`](#availabilitycache)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L124)

Number of cached entries.

###### Returns

`number`

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L129)

Clear all cached entries.

###### Returns

`void`

##### entries()

```ts
entries(): readonly ProbeResult[];
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L119)

Get all cached entries (for diagnostics).

###### Returns

readonly [`ProbeResult`](#proberesult)[]

##### get()

```ts
get(modelId): ProbeResult | undefined;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L70)

Get a cached probe result, or undefined if expired/missing.

###### Parameters

###### modelId

\| `"claude-opus"`
\| `"claude-sonnet"`
\| `"claude-haiku"`
\| `"gemini-3-pro"`
\| `"gemini-pro"`
\| `"gemini-3-flash"`
\| `"gemini-flash"`
\| `"codex-5.3"`
\| `"codex-5.2"`
\| `"codex-5.1-mini"`
\| `"opencode-default"`
\| `"opencode-custom-opus"`
\| `"opencode-custom-sonnet"`
\| `"openrouter-nemotron-super"`
\| `"openrouter-qwen-coder"`

###### Returns

[`ProbeResult`](#proberesult) \| `undefined`

##### isKnownUnavailable()

```ts
isKnownUnavailable(modelId): boolean;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L113)

Check if a model is known-unavailable (cached and not expired).

###### Parameters

###### modelId

\| `"claude-opus"`
\| `"claude-sonnet"`
\| `"claude-haiku"`
\| `"gemini-3-pro"`
\| `"gemini-pro"`
\| `"gemini-3-flash"`
\| `"gemini-flash"`
\| `"codex-5.3"`
\| `"codex-5.2"`
\| `"codex-5.1-mini"`
\| `"opencode-default"`
\| `"opencode-custom-opus"`
\| `"opencode-custom-sonnet"`
\| `"openrouter-nemotron-super"`
\| `"openrouter-qwen-coder"`

###### Returns

`boolean`

##### markAvailable()

```ts
markAvailable(modelId, latencyMs): void;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L103)

Mark a model as available.

###### Parameters

###### modelId

\| `"claude-opus"`
\| `"claude-sonnet"`
\| `"claude-haiku"`
\| `"gemini-3-pro"`
\| `"gemini-pro"`
\| `"gemini-3-flash"`
\| `"gemini-flash"`
\| `"codex-5.3"`
\| `"codex-5.2"`
\| `"codex-5.1-mini"`
\| `"opencode-default"`
\| `"opencode-custom-opus"`
\| `"opencode-custom-sonnet"`
\| `"openrouter-nemotron-super"`
\| `"openrouter-qwen-coder"`

###### latencyMs

`number`

###### Returns

`void`

##### markUnavailable()

```ts
markUnavailable(modelId, error): void;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L92)

Mark a model as unavailable without a full probe.

###### Parameters

###### modelId

\| `"claude-opus"`
\| `"claude-sonnet"`
\| `"claude-haiku"`
\| `"gemini-3-pro"`
\| `"gemini-pro"`
\| `"gemini-3-flash"`
\| `"gemini-flash"`
\| `"codex-5.3"`
\| `"codex-5.2"`
\| `"codex-5.1-mini"`
\| `"opencode-default"`
\| `"opencode-custom-opus"`
\| `"opencode-custom-sonnet"`
\| `"openrouter-nemotron-super"`
\| `"openrouter-qwen-coder"`

###### error

`string`

###### Returns

`void`

##### set()

```ts
set(result): void;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L81)

Store a probe result, evicting oldest if at capacity.

###### Parameters

###### result

[`ProbeResult`](#proberesult)

###### Returns

`void`

---

### AvailableModelsCache

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L79)

#### Constructors

##### Constructor

```ts
new AvailableModelsCache(options): AvailableModelsCache;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L86)

###### Parameters

###### options

[`AvailableModelsCacheOptions`](#availablemodelscacheoptions)

###### Returns

[`AvailableModelsCache`](#availablemodelscache)

#### Methods

##### addSource()

```ts
addSource(source): void;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L103)

Register a source after construction. Used by adapter factories that
wire themselves into the default cache lazily as they're built.
Duplicate names are ignored (first registration wins, on the
assumption that the same factory might run twice in a test session).

###### Parameters

###### source

[`AvailableModelsSource`](#availablemodelssource)

###### Returns

`void`

##### byProvider()

```ts
byProvider(sourceName): Promise<readonly AvailableModel[]>;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L134)

Models reported by one named source (subset of getAll).

###### Parameters

###### sourceName

`string`

###### Returns

`Promise`\<readonly [`AvailableModel`](#availablemodel)[]\>

##### getAll()

```ts
getAll(): Promise<readonly AvailableModel[]>;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L123)

Returns the union of every source's available models. Stale-while-
revalidate: serve fresh-or-stale immediately, refresh stale entries
in the background. First call (no cache yet) blocks on every source.

###### Returns

`Promise`\<readonly [`AvailableModel`](#availablemodel)[]\>

##### has()

```ts
has(modelId): Promise<boolean>;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L140)

True iff some source currently reports the given model id.

###### Parameters

###### modelId

`string`

###### Returns

`Promise`\<`boolean`\>

##### refresh()

```ts
refresh(): Promise<readonly AvailableModel[]>;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L146)

Force a synchronous refresh of every source — used after a 404.

###### Returns

`Promise`\<readonly [`AvailableModel`](#availablemodel)[]\>

##### removeSource()

```ts
removeSource(name): void;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L113)

Remove a previously-registered source. Used by tests + by factories
that want to drop a probe when an adapter is being disposed.

###### Parameters

###### name

`string`

###### Returns

`void`

---

### ModelRegistry

Defined in: [packages/nexus-agents/src/config/model-registry.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L175)

The unified model-metadata registry. Construct once, share across
the process. `getEntry(modelId)` always returns something.

#### Constructors

##### Constructor

```ts
new ModelRegistry(options?): ModelRegistry;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L179)

###### Parameters

###### options?

[`ModelRegistryOptions`](#modelregistryoptions) = `{}`

###### Returns

[`ModelRegistry`](#modelregistry)

#### Methods

##### allEntries()

```ts
allEntries(): readonly ModelEntry[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L230)

All loaded entries across every tier (generated + models.dev + in-tree +
manifest), deduped by id (later sources overwrite earlier). This is NOT
filtered to authoritative entries — `models-dev`/`generated` are
catalog-breadth tiers; use `hasAuthoritative()` to tell them apart.

###### Returns

readonly [`ModelEntry`](#modelentry)[]

##### getEntry()

```ts
getEntry(modelId, hints?): ModelEntry;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L199)

Resolve a model id to its full metadata entry. Always returns —
unknown models get a derived entry with sensible defaults.

###### Parameters

###### modelId

`string`

###### hints?

`ModelHints`

###### Returns

[`ModelEntry`](#modelentry)

##### hasAuthoritative()

```ts
hasAuthoritative(modelId): boolean;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L220)

Has the registry got an authoritative entry for this id?
Consumers use this to distinguish "we know X" from "we guessed."

###### Parameters

###### modelId

`string`

###### Returns

`boolean`

##### toMap()

```ts
toMap(): ReadonlyMap<string, ModelEntry>;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:235](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L235)

Snapshot of canonical id → entry mapping.

###### Returns

`ReadonlyMap`\<`string`, [`ModelEntry`](#modelentry)\>

## Interfaces

### AvailabilityCacheConfig

Defined in: [packages/nexus-agents/src/config/model-availability.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L32)

Configuration for the availability cache.

#### Properties

##### maxEntries?

```ts
readonly optional maxEntries?: number;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L36)

Maximum entries in the cache. Default: 50.

##### ttlMs?

```ts
readonly optional ttlMs?: number;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L34)

Time-to-live in ms for probe results. Default: 60_000 (1 min).

---

### AvailableModel

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L56)

One row in the cache: model id + which source first reported it.

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L57)

##### provider?

```ts
readonly optional provider?: string;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L60)

`provider/` prefix when the source uses one; otherwise the providerHint.

##### source

```ts
readonly source: string;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L58)

---

### AvailableModelsCacheOptions

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L63)

#### Properties

##### now?

```ts
readonly optional now?: () => number;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L70)

Override `Date.now` for tests.

###### Returns

`number`

##### sources

```ts
readonly sources: readonly AvailableModelsSource[];
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L64)

##### staleTtlMs?

```ts
readonly optional staleTtlMs?: number;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L68)

Beyond this, callers block on the next refresh. Defaults to 25 minutes.

##### ttlMs?

```ts
readonly optional ttlMs?: number;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L66)

Freshness TTL (ms). Defaults to 5 minutes.

---

### AvailableModelsSource

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L42)

One adapter (CLI or API) that can be asked what models it currently has.
Exists so this cache doesn't have to know about IModelAdapter vs
ICliAdapter — both can adapt themselves to this minimal surface.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L44)

Stable, human-readable identifier — e.g. `claude`, `gateway-openrouter`.

##### providerHint?

```ts
readonly optional providerHint?: string;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L50)

Optional vendor-family hint — `anthropic` / `openai` / `google` / etc.
Used to pre-tag entries when the source's own model ids don't carry
a `provider/` prefix (Anthropic API, Google API).

#### Methods

##### listModels()

```ts
listModels(): Promise<readonly {
  id: string;
}[]>;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L52)

Probe the underlying surface for currently available models.

###### Returns

`Promise`\<readonly \{
`id`: `string`;
\}[]\>

---

### EnvValidationResult

Defined in: [packages/nexus-agents/src/config/env-schema.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L186)

Result of validating NEXUS\_\* environment variables.

#### Properties

##### invalidVars

```ts
readonly invalidVars: readonly InvalidVar[];
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L188)

##### unknownVars

```ts
readonly unknownVars: readonly UnknownVar[];
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L187)

---

### FallbackEntry

Defined in: [packages/nexus-agents/src/config/model-availability.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L43)

Fallback chain entry with model and reason for fallback.

#### Properties

##### modelId

```ts
readonly modelId:
  | "claude-opus"
  | "claude-sonnet"
  | "claude-haiku"
  | "gemini-3-pro"
  | "gemini-pro"
  | "gemini-3-flash"
  | "gemini-flash"
  | "codex-5.3"
  | "codex-5.2"
  | "codex-5.1-mini"
  | "opencode-default"
  | "opencode-custom-opus"
  | "opencode-custom-sonnet"
  | "openrouter-nemotron-super"
  | "openrouter-qwen-coder";
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L44)

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L45)

---

### InvalidVar

Defined in: [packages/nexus-agents/src/config/env-schema.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L179)

An invalid NEXUS\_\* env var with error message.

#### Properties

##### error

```ts
readonly error: string;
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L182)

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L180)

##### value

```ts
readonly value: string;
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L181)

---

### ModelEntry

Defined in: [packages/nexus-agents/src/config/model-registry.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L93)

One model's full metadata. Combines what was previously split
across `ModelCapability` (capability/pricing/quality) and
`ModelBehaviorProfile` (runtime behaviour toggles).

All capability + pricing + quality fields are optional because
derived entries (vendor known but no authoritative data) won't
have them. Routing consumers must handle absence gracefully.

Behaviour fields always have values (defaulted from vendor/family
profile if no exact entry exists).

#### Properties

##### aliases?

```ts
readonly optional aliases?: readonly string[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L102)

Alternate strings that should resolve to this entry. Operators
extend via the manifest (PR 4) when a gateway exposes a renamed
version of a known model.

##### cliAlias?

```ts
readonly optional cliAlias?: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L127)

Short alias the CLI accepts (e.g. 'opus' for claude).

##### cliModelName?

```ts
readonly optional cliModelName?: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L129)

Vendor model id the CLI passes upstream (e.g. 'claude-opus-4-6').

##### cliName?

```ts
readonly optional cliName?: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L125)

Which CLI tool this model belongs to (e.g. 'claude', 'gemini').

##### contextWindow?

```ts
readonly optional contextWindow?: number;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L113)

##### displayName?

```ts
readonly optional displayName?: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L110)

Human-readable display name for UI / logs.

##### family

```ts
readonly family: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L106)

Family inside a vendor — `claude-opus`, `gpt-4o`, `llama-3`.

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L96)

Canonical id, e.g. `claude-opus-4-1`, `gpt-5.4`, `meta/llama-3-70b`.

##### inputModalities?

```ts
readonly optional inputModalities?: readonly ("code" | "text" | "image" | "audio" | "video" | "pdf")[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L115)

##### maxOutputTokens?

```ts
readonly optional maxOutputTokens?: number;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L114)

##### maxRecommendedTurnBudget

```ts
readonly maxRecommendedTurnBudget: number;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L135)

##### notes?

```ts
readonly optional notes?: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L121)

##### outputModalities?

```ts
readonly optional outputModalities?: readonly (
  | "code"
  | "text"
  | "image_png"
  | "image_jpeg"
  | "audio_pcm"
  | "audio_wav"
  | "audio_mp3"
  | "video_mp4"
  | "svg"
  | "structured_json")[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L116)

##### parallelToolCalls

```ts
readonly parallelToolCalls: boolean;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L132)

##### pricing?

```ts
readonly optional pricing?: {
  inputPer1M: number;
  outputPer1M: number;
};
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L119)

###### inputPer1M

```ts
inputPer1M: number;
```

###### outputPer1M

```ts
outputPer1M: number;
```

##### profileId

```ts
readonly profileId: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L138)

##### promptCaching

```ts
readonly promptCaching: PromptCachingMode;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L133)

##### qualityScores?

```ts
readonly optional qualityScores?: {
  codeGeneration: number;
  cost: number;
  reasoning: number;
  speed: number;
};
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L120)

###### codeGeneration

```ts
codeGeneration: number;
```

###### cost

```ts
cost: number;
```

###### reasoning

```ts
reasoning: number;
```

###### speed

```ts
speed: number;
```

##### quirks

```ts
readonly quirks: readonly string[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L137)

##### source

```ts
readonly source: EntrySource;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L141)

##### specialFeatures?

```ts
readonly optional specialFeatures?: readonly (
  | "extended_thinking"
  | "deep_research"
  | "streaming"
  | "grounding"
  | "citations"
  | "image_editing"
  | "voice_cloning"
  | "live_api"
  | "context_caching")[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L118)

##### strictJson

```ts
readonly strictJson: boolean;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L136)

##### toolCapabilities?

```ts
readonly optional toolCapabilities?: readonly (
  | "mcp"
  | "function_calling"
  | "computer_use"
  | "code_execution_sandbox"
  | "web_search"
  | "file_operations"
  | "structured_output"
  | "apply_patch")[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L117)

##### toolDefinitionFormat

```ts
readonly toolDefinitionFormat: ToolDefinitionFormat;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L134)

##### vendor

```ts
readonly vendor: ModelVendor;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L104)

Coarse vendor bucket — drives behaviour-profile fallback chains.

##### verifiedAt?

```ts
readonly optional verifiedAt?: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L143)

ISO date when this entry was last validated against the upstream.

##### version?

```ts
readonly optional version?: string;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L108)

Version string (best-effort; `4-1`, `2024-08-06`, etc).

---

### ModelRegistryOptions

Defined in: [packages/nexus-agents/src/config/model-registry.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L155)

#### Properties

##### generatedEntries?

```ts
readonly optional generatedEntries?: readonly ModelEntry[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L168)

Broad generated-catalog (LiteLLM) breadth entries. LOWEST priority —
overwritten by every other tier; provides long-tail coverage so unknown
models resolve to real catalog data instead of a bare derived default
(#3293, preserving the legacy CapabilityDiscovery T2 breadth).

##### inTreeEntries?

```ts
readonly optional inTreeEntries?: readonly ModelEntry[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L157)

Authoritative in-tree entries. Highest priority.

##### manifestEntries?

```ts
readonly optional manifestEntries?: readonly ModelEntry[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L161)

Operator manifest entries. Higher priority than in-tree.

##### modelsDevEntries?

```ts
readonly optional modelsDevEntries?: readonly ModelEntry[];
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L159)

models.dev snapshot entries. Lower priority than in-tree.

---

### ProbeResult

Defined in: [packages/nexus-agents/src/config/model-availability.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L23)

Status of a model probe.

#### Properties

##### available

```ts
readonly available: boolean;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L25)

##### checkedAt

```ts
readonly checkedAt: number;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L27)

##### error?

```ts
readonly optional error?: string;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L28)

##### latencyMs

```ts
readonly latencyMs: number;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L26)

##### modelId

```ts
readonly modelId:
  | "claude-opus"
  | "claude-sonnet"
  | "claude-haiku"
  | "gemini-3-pro"
  | "gemini-pro"
  | "gemini-3-flash"
  | "gemini-flash"
  | "codex-5.3"
  | "codex-5.2"
  | "codex-5.1-mini"
  | "opencode-default"
  | "opencode-custom-opus"
  | "opencode-custom-sonnet"
  | "openrouter-nemotron-super"
  | "openrouter-qwen-coder";
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L24)

---

### UnknownVar

Defined in: [packages/nexus-agents/src/config/env-schema.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L173)

An unknown NEXUS\_\* env var with optional typo suggestion.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L174)

##### suggestion

```ts
readonly suggestion: string | null;
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L175)

## Type Aliases

### AppConfig

```ts
type AppConfig = z.infer<typeof AppConfigSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas.ts#L149)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### ConfigExpertConfig

```ts
type ConfigExpertConfig = z.infer<typeof ConfigExpertConfigSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-expert.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-expert.ts#L130)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### ConfigExpertDefinition

```ts
type ConfigExpertDefinition = z.infer<typeof ConfigExpertDefinitionSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-expert.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-expert.ts#L109)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### EntrySource

```ts
type EntrySource = 'in-tree' | 'models-dev' | 'manifest' | 'derived' | 'generated';
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L79)

Where this entry came from. Higher-priority sources override lower
ones field-by-field; `derived` is always the fallback floor.

---

### LoggingConfig

```ts
type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L20)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### ModelConfig

```ts
type ModelConfig = z.infer<typeof ModelConfigSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L54)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### ModelTiers

```ts
type ModelTiers = z.infer<typeof ModelTiersSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L43)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### ProbeFn

```ts
type ProbeFn = (modelId) => Promise<ProbeResult>;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L40)

A function that probes whether a model is reachable.

#### Parameters

##### modelId

`ModelId`

#### Returns

`Promise`\<[`ProbeResult`](#proberesult)\>

---

### PromptCachingMode

```ts
type PromptCachingMode = 'none' | 'ephemeral' | 'aggressive';
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L69)

Prompt-caching opt-in level. `'ephemeral'` adds Anthropic-style
`cache_control` markers; other providers ignore the field.

---

### ProviderConfig

```ts
type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L32)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### SecurityConfig

```ts
type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-security.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-security.ts#L165)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

---

### ToolDefinitionFormat

```ts
type ToolDefinitionFormat = 'openai' | 'anthropic' | 'gemini';
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L63)

Tool-definition format the model expects in `CompletionRequest.tools`.
Each `IModelAdapter` translates from the canonical `ToolDefinition`
shape to the provider's native form, so this field is informational
for routing/scoring, not request-side.

---

### WorkflowConfig

```ts
type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L65)

Config exports - Configuration schemas
Split from index.ts for file size compliance (Issue #285)

## Variables

### AppConfigSchema

```ts
const AppConfigSchema: ZodObject<{
  experts: ZodOptional<ZodObject<{
     builtin: ZodDefault<ZodBoolean>;
     custom: ZodOptional<ZodRecord<ZodString, ZodObject<{
        available: ZodDefault<ZodBoolean>;
        capabilities: ZodDefault<ZodArray<...>>;
        description: ZodOptional<ZodString>;
        domain: ZodDefault<ZodEnum<...>>;
        secondaryDomains: ZodOptional<ZodArray<...>>;
        systemPrompt: ZodString;
        temperature: ZodDefault<ZodNumber>;
        tier: ZodDefault<ZodEnum<...>>;
        tools: ZodOptional<ZodArray<...>>;
        weight: ZodDefault<ZodNumber>;
     }, $strip>>>;
  }, $strip>>;
  gateway: ZodOptional<ZodObject<{
     enabled: ZodDefault<ZodBoolean>;
     tierOverrides: ZodOptional<ZodRecord<ZodString, ZodEnum<{
        ANALYZED: "ANALYZED";
        DIRECT: "DIRECT";
        ORCHESTRATED: "ORCHESTRATED";
     }>>>;
     upstreamServers: ZodOptional<ZodArray<ZodObject<{
        args: ZodDefault<ZodArray<...>>;
        command: ZodEnum<{
           docker: ...;
           node: ...;
           npx: ...;
           python: ...;
           python3: ...;
           uvx: ...;
        }>;
        env: ZodOptional<ZodRecord<..., ...>>;
        lazy: ZodDefault<ZodBoolean>;
        name: ZodString;
        timeoutMs: ZodDefault<ZodNumber>;
     }, $strip>>>;
  }, $strip>>;
  logging: ZodOptional<ZodObject<{
     destination: ZodDefault<ZodEnum<{
        file: "file";
        stderr: "stderr";
        stdout: "stdout";
     }>>;
     filePath: ZodOptional<ZodString>;
     format: ZodDefault<ZodEnum<{
        json: "json";
        pretty: "pretty";
     }>>;
     level: ZodDefault<ZodEnum<{
        debug: "debug";
        error: "error";
        info: "info";
        warn: "warn";
     }>>;
  }, $strip>>;
  models: ZodObject<{
     default: ZodString;
     providers: ZodOptional<ZodRecord<ZodString, ZodObject<{
        apiKey: ZodOptional<ZodString>;
        baseUrl: ZodOptional<ZodURL>;
        maxRetries: ZodDefault<ZodNumber>;
        timeout: ZodDefault<ZodNumber>;
     }, $strip>>>;
     tiers: ZodObject<{
        balanced: ZodArray<ZodString>;
        fast: ZodArray<ZodString>;
        powerful: ZodArray<ZodString>;
     }, $strip>;
  }, $strip>;
  observability: ZodOptional<ZodObject<{
     eventBus: ZodOptional<ZodObject<{
        enabled: ZodDefault<ZodBoolean>;
        logging: ZodDefault<ZodObject<{
           frequentEventLevel: ...;
           importantEventLevel: ...;
        }, $strip>>;
        maxHistorySize: ZodDefault<ZodNumber>;
        subscriptions: ZodDefault<ZodObject<{
           agent: ...;
           byzantine: ...;
           consensus: ...;
           message: ...;
           protocol: ...;
           session: ...;
        }, $strip>>;
     }, $strip>>;
     swarmObserverMaxEvents: ZodDefault<ZodNumber>;
  }, $strip>>;
  routing: ZodOptional<ZodObject<{
     budget: ZodOptional<ZodObject<{
        maxCostUsd: ZodOptional<ZodNumber>;
        maxLatencyMs: ZodOptional<ZodNumber>;
        maxTokens: ZodOptional<ZodNumber>;
     }, $strip>>;
     latencyScoreWeight: ZodDefault<ZodNumber>;
     latencyTracker: ZodOptional<ZodObject<{
        decayFactor: ZodDefault<ZodNumber>;
        maxSampleAgeMs: ZodDefault<ZodNumber>;
        percentiles: ZodDefault<ZodArray<ZodNumber>>;
        windowSize: ZodDefault<ZodNumber>;
     }, $strip>>;
     linucb: ZodOptional<ZodObject<{
        alpha: ZodDefault<ZodNumber>;
        maxDecisionTimeMs: ZodDefault<ZodNumber>;
     }, $strip>>;
     preference: ZodOptional<ZodObject<{
        minDataPoints: ZodDefault<ZodNumber>;
     }, $strip>>;
     routingMemory: ZodOptional<ZodObject<{
        actionCacheMaxAgeMs: ZodDefault<ZodNumber>;
        confidenceThreshold: ZodDefault<ZodNumber>;
        minObservations: ZodDefault<ZodNumber>;
        successRateThreshold: ZodDefault<ZodNumber>;
     }, $strip>>;
     stages: ZodOptional<ZodObject<{
        budgetFilter: ZodDefault<ZodBoolean>;
        capabilityMatch: ZodDefault<ZodBoolean>;
        confidenceCascade: ZodDefault<ZodBoolean>;
        latencyTracking: ZodDefault<ZodBoolean>;
        linucbSelection: ZodDefault<ZodBoolean>;
        preferenceRouting: ZodDefault<ZodBoolean>;
        qualityConstraint: ZodDefault<ZodBoolean>;
        resourceStrategy: ZodDefault<ZodBoolean>;
        routingMemory: ZodDefault<ZodBoolean>;
        strategyDistillation: ZodDefault<ZodBoolean>;
        topsisRanking: ZodDefault<ZodBoolean>;
        zeroRouter: ZodDefault<ZodBoolean>;
     }, $strip>>;
     topsis: ZodOptional<ZodObject<{
        criteria: ZodOptional<ZodArray<ZodObject<..., ...>>>;
        maxCostPerRequest: ZodOptional<ZodNumber>;
        maxLatencyMs: ZodOptional<ZodNumber>;
        minQualityThreshold: ZodDefault<ZodNumber>;
        verbose: ZodDefault<ZodBoolean>;
     }, $strip>>;
     zeroRouter: ZodOptional<ZodObject<{
        difficultyToTier: ZodOptional<ZodRecord<ZodEnum<...>, ZodEnum<...>>>;
        enableCalibration: ZodDefault<ZodBoolean>;
        maxCalibrationOutcomes: ZodDefault<ZodNumber>;
        minCalibrationOutcomes: ZodDefault<ZodNumber>;
        thresholds: ZodOptional<ZodObject<{
           easyUpperBound: ...;
           hardLowerBound: ...;
        }, $strip>>;
        tierToClis: ZodOptional<ZodRecord<ZodEnum<...>, ZodArray<...>>>;
        verbose: ZodDefault<ZodBoolean>;
        weights: ZodOptional<ZodObject<{
           context_length: ...;
           creativity: ...;
           knowledge: ...;
           precision: ...;
           reasoning: ...;
        }, $strip>>;
     }, $strip>>;
  }, $strip>>;
  security: ZodOptional<ZodObject<{
     allowedPaths: ZodDefault<ZodArray<ZodString>>;
     audit: ZodOptional<ZodObject<{
        enabled: ZodDefault<ZodBoolean>;
        enableHashChain: ZodDefault<ZodBoolean>;
        logDir: ZodOptional<ZodString>;
        maxFiles: ZodDefault<ZodNumber>;
        maxFileSizeBytes: ZodDefault<ZodNumber>;
        minSeverity: ZodDefault<ZodEnum<{
           critical: ...;
           info: ...;
           warning: ...;
        }>>;
     }, $strip>>;
     auth: ZodOptional<ZodObject<{
        enabled: ZodDefault<ZodBoolean>;
        method: ZodDefault<ZodEnum<{
           oauth2: ...;
           token: ...;
        }>>;
        tokenFile: ZodOptional<ZodString>;
        tokenHeader: ZodDefault<ZodString>;
     }, $strip>>;
     blockedPatterns: ZodDefault<ZodArray<ZodString>>;
     policy: ZodOptional<ZodObject<{
        defaultMode: ZodDefault<ZodEnum<{
           read-only: ...;
           read-write: ...;
        }>>;
        policyMode: ZodDefault<ZodEnum<{
           enforce: ...;
           warn: ...;
        }>>;
     }, $strip>>;
     rateLimit: ZodDefault<ZodObject<{
        enabled: ZodDefault<ZodBoolean>;
        perTool: ZodOptional<ZodRecord<ZodString, ZodObject<..., ...>>>;
        requestsPerMinute: ZodDefault<ZodNumber>;
     }, $strip>>;
     sandbox: ZodOptional<ZodObject<{
        dockerImage: ZodOptional<ZodString>;
        fallbackToPolicy: ZodDefault<ZodBoolean>;
        mode: ZodDefault<ZodEnum<{
           container: ...;
           none: ...;
           policy: ...;
        }>>;
        networkEnabled: ZodDefault<ZodBoolean>;
     }, $strip>>;
     secretsFile: ZodOptional<ZodString>;
     timeout: ZodOptional<ZodObject<{
        defaultTimeoutMs: ZodDefault<ZodNumber>;
        enableLogging: ZodDefault<ZodBoolean>;
        maxTimeoutMs: ZodDefault<ZodNumber>;
        perToolTimeout: ZodOptional<ZodRecord<ZodString, ZodNumber>>;
        uriValidation: ZodDefault<ZodBoolean>;
     }, $strip>>;
     toolAllowlist: ZodOptional<ZodArray<ZodString>>;
  }, $strip>>;
  sica: ZodOptional<ZodObject<{
     autoSelectBest: ZodDefault<ZodBoolean>;
     enabled: ZodDefault<ZodBoolean>;
     enableObservability: ZodDefault<ZodBoolean>;
     improvementCooldownMs: ZodDefault<ZodNumber>;
     improvementThreshold: ZodDefault<ZodNumber>;
     maxActiveVersions: ZodDefault<ZodNumber>;
     minExecutionsForImprovement: ZodDefault<ZodNumber>;
  }, $strip>>;
  skills: ZodOptional<ZodObject<{
     enabled: ZodDefault<ZodBoolean>;
     enablePruning: ZodDefault<ZodBoolean>;
     executionsBeforeEvaluation: ZodDefault<ZodNumber>;
     externalPacks: ZodOptional<ZodArray<ZodObject<{
        enabled: ZodDefault<ZodBoolean>;
        name: ZodString;
        source: ZodString;
     }, $strip>>>;
     maxHistoryPerSkill: ZodDefault<ZodNumber>;
     maxSkills: ZodDefault<ZodNumber>;
     minSuccessRateForRetention: ZodDefault<ZodNumber>;
     trackExecutionHistory: ZodDefault<ZodBoolean>;
  }, $strip>>;
  workflows: ZodOptional<ZodObject<{
     maxParallel: ZodDefault<ZodNumber>;
     templatesDir: ZodDefault<ZodString>;
     timeout: ZodDefault<ZodNumber>;
  }, $strip>>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/config/schemas.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas.ts#L131)

Complete application configuration schema.

---

### ConfigExpertConfigSchema

```ts
const ConfigExpertConfigSchema: ZodObject<
  {
    builtin: ZodDefault<ZodBoolean>;
    custom: ZodOptional<
      ZodRecord<
        ZodString,
        ZodObject<
          {
            available: ZodDefault<ZodBoolean>;
            capabilities: ZodDefault<ZodArray<ZodString>>;
            description: ZodOptional<ZodString>;
            domain: ZodDefault<
              ZodEnum<{
                architecture: 'architecture';
                code: 'code';
                documentation: 'documentation';
                general: 'general';
                security: 'security';
                testing: 'testing';
              }>
            >;
            secondaryDomains: ZodOptional<
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
            systemPrompt: ZodString;
            temperature: ZodDefault<ZodNumber>;
            tier: ZodDefault<
              ZodEnum<{
                balanced: 'balanced';
                fast: 'fast';
                powerful: 'powerful';
              }>
            >;
            tools: ZodOptional<ZodArray<ZodString>>;
            weight: ZodDefault<ZodNumber>;
          },
          $strip
        >
      >
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/config/schemas-expert.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-expert.ts#L114)

Expert configuration schema.

---

### ConfigExpertDefinitionSchema

```ts
const ConfigExpertDefinitionSchema: ZodObject<
  {
    prompt: ZodString;
    temperature: ZodDefault<ZodNumber>;
    tier: ZodDefault<
      ZodEnum<{
        balanced: 'balanced';
        fast: 'fast';
        powerful: 'powerful';
      }>
    >;
    tools: ZodOptional<ZodArray<ZodString>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/config/schemas-expert.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-expert.ts#L102)

Legacy expert definition schema (for backwards compatibility).
Use CustomExpertDefinitionSchema for new implementations.

---

### DEFAULT_ENTRY

```ts
const DEFAULT_ENTRY: Omit<ModelEntry, 'id' | 'vendor' | 'family' | 'profileId' | 'source'>;
```

Defined in: [packages/nexus-agents/src/config/model-derivation.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-derivation.ts#L21)

Universal fallback. Used when nothing more specific matches —
unknown vendor + family + no probe data. Safe defaults.

---

### defaultConfig

```ts
const defaultConfig: Partial<AppConfig>;
```

Defined in: [packages/nexus-agents/src/config/schemas.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas.ts#L154)

Default configuration values.

---

### LoggingConfigSchema

```ts
const LoggingConfigSchema: ZodObject<
  {
    destination: ZodDefault<
      ZodEnum<{
        file: 'file';
        stderr: 'stderr';
        stdout: 'stdout';
      }>
    >;
    filePath: ZodOptional<ZodString>;
    format: ZodDefault<
      ZodEnum<{
        json: 'json';
        pretty: 'pretty';
      }>
    >;
    level: ZodDefault<
      ZodEnum<{
        debug: 'debug';
        error: 'error';
        info: 'info';
        warn: 'warn';
      }>
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:12](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L12)

Logging configuration schema.

---

### ModelConfigSchema

```ts
const ModelConfigSchema: ZodObject<
  {
    default: ZodString;
    providers: ZodOptional<
      ZodRecord<
        ZodString,
        ZodObject<
          {
            apiKey: ZodOptional<ZodString>;
            baseUrl: ZodOptional<ZodURL>;
            maxRetries: ZodDefault<ZodNumber>;
            timeout: ZodDefault<ZodNumber>;
          },
          $strip
        >
      >
    >;
    tiers: ZodObject<
      {
        balanced: ZodArray<ZodString>;
        fast: ZodArray<ZodString>;
        powerful: ZodArray<ZodString>;
      },
      $strip
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L48)

Model configuration schema.

---

### ModelTiersSchema

```ts
const ModelTiersSchema: ZodObject<
  {
    balanced: ZodArray<ZodString>;
    fast: ZodArray<ZodString>;
    powerful: ZodArray<ZodString>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L37)

Model tier configuration.

---

### ProviderConfigSchema

```ts
const ProviderConfigSchema: ZodObject<
  {
    apiKey: ZodOptional<ZodString>;
    baseUrl: ZodOptional<ZodURL>;
    maxRetries: ZodDefault<ZodNumber>;
    timeout: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L25)

Provider configuration schema.

---

### SecurityConfigSchema

```ts
const SecurityConfigSchema: ZodObject<{
  allowedPaths: ZodDefault<ZodArray<ZodString>>;
  audit: ZodOptional<ZodObject<{
     enabled: ZodDefault<ZodBoolean>;
     enableHashChain: ZodDefault<ZodBoolean>;
     logDir: ZodOptional<ZodString>;
     maxFiles: ZodDefault<ZodNumber>;
     maxFileSizeBytes: ZodDefault<ZodNumber>;
     minSeverity: ZodDefault<ZodEnum<{
        critical: "critical";
        info: "info";
        warning: "warning";
     }>>;
  }, $strip>>;
  auth: ZodOptional<ZodObject<{
     enabled: ZodDefault<ZodBoolean>;
     method: ZodDefault<ZodEnum<{
        oauth2: "oauth2";
        token: "token";
     }>>;
     tokenFile: ZodOptional<ZodString>;
     tokenHeader: ZodDefault<ZodString>;
  }, $strip>>;
  blockedPatterns: ZodDefault<ZodArray<ZodString>>;
  policy: ZodOptional<ZodObject<{
     defaultMode: ZodDefault<ZodEnum<{
        read-only: "read-only";
        read-write: "read-write";
     }>>;
     policyMode: ZodDefault<ZodEnum<{
        enforce: "enforce";
        warn: "warn";
     }>>;
  }, $strip>>;
  rateLimit: ZodDefault<ZodObject<{
     enabled: ZodDefault<ZodBoolean>;
     perTool: ZodOptional<ZodRecord<ZodString, ZodObject<{
        capacity: ZodDefault<ZodNumber>;
        refillIntervalMs: ZodDefault<ZodNumber>;
        refillRate: ZodDefault<ZodNumber>;
     }, $strip>>>;
     requestsPerMinute: ZodDefault<ZodNumber>;
  }, $strip>>;
  sandbox: ZodOptional<ZodObject<{
     dockerImage: ZodOptional<ZodString>;
     fallbackToPolicy: ZodDefault<ZodBoolean>;
     mode: ZodDefault<ZodEnum<{
        container: "container";
        none: "none";
        policy: "policy";
     }>>;
     networkEnabled: ZodDefault<ZodBoolean>;
  }, $strip>>;
  secretsFile: ZodOptional<ZodString>;
  timeout: ZodOptional<ZodObject<{
     defaultTimeoutMs: ZodDefault<ZodNumber>;
     enableLogging: ZodDefault<ZodBoolean>;
     maxTimeoutMs: ZodDefault<ZodNumber>;
     perToolTimeout: ZodOptional<ZodRecord<ZodString, ZodNumber>>;
     uriValidation: ZodDefault<ZodBoolean>;
  }, $strip>>;
  toolAllowlist: ZodOptional<ZodArray<ZodString>>;
}, $strip>;
```

Defined in: [packages/nexus-agents/src/config/schemas-security.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-security.ts#L110)

Security configuration schema.

---

### WorkflowConfigSchema

```ts
const WorkflowConfigSchema: ZodObject<
  {
    maxParallel: ZodDefault<ZodNumber>;
    templatesDir: ZodDefault<ZodString>;
    timeout: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/config/schemas-core.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/schemas-core.ts#L59)

Workflow configuration schema.

## Functions

### deriveEntry()

```ts
function deriveEntry(modelId, identity): ModelEntry;
```

Defined in: [packages/nexus-agents/src/config/model-derivation.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-derivation.ts#L125)

Build an entry from vendor + family + quirks when no authoritative
row matches. Source stamped `'derived'`; capability fields left
undefined (derived entries don't have measured pricing/quality data).

#### Parameters

##### modelId

`string`

##### identity

`ResolvedModelIdentity`

#### Returns

[`ModelEntry`](#modelentry)

---

### filterAvailableModels()

```ts
function filterAvailableModels(
  modelIds,
  cache
): {
  available: string[];
  removed: string[];
};
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L243)

Filters out known-unavailable models from a set of model IDs.
Returns the filtered set, or null if no models were removed.
Used by scoreAllModels() to skip unavailable models.

#### Parameters

##### modelIds

readonly `string`[]

##### cache

[`AvailabilityCache`](#availabilitycache)

#### Returns

```ts
{
  available: string[];
  removed: string[];
}
```

##### available

```ts
available: string[];
```

##### removed

```ts
removed: string[];
```

---

### getAvailabilityCache()

```ts
function getAvailabilityCache(): AvailabilityCache;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:224](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L224)

Get the shared availability cache (lazy-init).

#### Returns

[`AvailabilityCache`](#availabilitycache)

---

### getCliForModelId()

```ts
function getCliForModelId(modelId): 'claude' | 'gemini' | 'codex' | 'opencode' | undefined;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L177)

Get the CLI name for a model ID.

#### Parameters

##### modelId

\| `"claude-opus"`
\| `"claude-sonnet"`
\| `"claude-haiku"`
\| `"gemini-3-pro"`
\| `"gemini-pro"`
\| `"gemini-3-flash"`
\| `"gemini-flash"`
\| `"codex-5.3"`
\| `"codex-5.2"`
\| `"codex-5.1-mini"`
\| `"opencode-default"`
\| `"opencode-custom-opus"`
\| `"opencode-custom-sonnet"`
\| `"openrouter-nemotron-super"`
\| `"openrouter-qwen-coder"`

#### Returns

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"` \| `undefined`

---

### getDefaultAvailableModelsCache()

```ts
function getDefaultAvailableModelsCache(): AvailableModelsCache;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L242)

Get (or lazily construct) the process-default cache. Starts with no
sources — adapter factories register themselves via `addSource` on
construction. Until at least one source is added, the cache returns
empty snapshots and `withModelNotFoundFallback` degrades to surfacing
the original error (safe).

#### Returns

[`AvailableModelsCache`](#availablemodelscache)

---

### getDefaultRegistry()

```ts
function getDefaultRegistry(): ModelRegistry;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:318](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L318)

Lazy global registry. Most consumers should accept a `ModelRegistry`
via dependency injection instead, but this is the convenient default
for migration from the existing module-level constants.

The first call constructs the registry and loads the operator
manifest overlay (#2547 4a) from `$NEXUS_MODELS_OVERLAY_PATH` or
`$NEXUS_DATA_DIR/models-manifest.yaml`. Missing / malformed manifests
never throw — rejections are logged at warn level and dropped.

#### Returns

[`ModelRegistry`](#modelregistry)

---

### getFallbackChain()

```ts
function getFallbackChain(
  cli
): readonly (
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'gemini-3-pro'
  | 'gemini-pro'
  | 'gemini-3-flash'
  | 'gemini-flash'
  | 'codex-5.3'
  | 'codex-5.2'
  | 'codex-5.1-mini'
  | 'opencode-default'
  | 'opencode-custom-opus'
  | 'opencode-custom-sonnet'
  | 'openrouter-nemotron-super'
  | 'openrouter-qwen-coder'
)[];
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L170)

Get the fallback chain for a CLI tool.

#### Parameters

##### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

#### Returns

readonly (
\| `"claude-opus"`
\| `"claude-sonnet"`
\| `"claude-haiku"`
\| `"gemini-3-pro"`
\| `"gemini-pro"`
\| `"gemini-3-flash"`
\| `"gemini-flash"`
\| `"codex-5.3"`
\| `"codex-5.2"`
\| `"codex-5.1-mini"`
\| `"opencode-default"`
\| `"opencode-custom-opus"`
\| `"opencode-custom-sonnet"`
\| `"openrouter-nemotron-super"`
\| `"openrouter-qwen-coder"`)[]

---

### getKnownNexusVarNames()

```ts
function getKnownNexusVarNames(): readonly string[];
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L277)

Returns all known NEXUS\_\* variable names from the schema.

#### Returns

readonly `string`[]

---

### resetAvailabilityCache()

```ts
function resetAvailabilityCache(): void;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L230)

Reset the global cache (for testing).

#### Returns

`void`

---

### resolveFallback()

```ts
function resolveFallback(modelId, cache): FallbackEntry | null;
```

Defined in: [packages/nexus-agents/src/config/model-availability.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-availability.ts#L150)

Resolves a fallback chain for a given model.
Returns the first available model in the chain, skipping known-unavailable ones.

#### Parameters

##### modelId

\| `"claude-opus"`
\| `"claude-sonnet"`
\| `"claude-haiku"`
\| `"gemini-3-pro"`
\| `"gemini-pro"`
\| `"gemini-3-flash"`
\| `"gemini-flash"`
\| `"codex-5.3"`
\| `"codex-5.2"`
\| `"codex-5.1-mini"`
\| `"opencode-default"`
\| `"opencode-custom-opus"`
\| `"opencode-custom-sonnet"`
\| `"openrouter-nemotron-super"`
\| `"openrouter-qwen-coder"`

##### cache

[`AvailabilityCache`](#availabilitycache)

#### Returns

[`FallbackEntry`](#fallbackentry) \| `null`

---

### setDefaultAvailableModelsCache()

```ts
function setDefaultAvailableModelsCache(cache): void;
```

Defined in: [packages/nexus-agents/src/config/available-models-cache.ts:251](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/available-models-cache.ts#L251)

Override the default cache. Useful for tests and for operators that
want a pre-populated cache wired at startup.

#### Parameters

##### cache

[`AvailableModelsCache`](#availablemodelscache) \| `null`

#### Returns

`void`

---

### setDefaultRegistry()

```ts
function setDefaultRegistry(registry): void;
```

Defined in: [packages/nexus-agents/src/config/model-registry.ts:355](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/model-registry.ts#L355)

Replace the global registry. Reserved for tests + bootstrap.

#### Parameters

##### registry

[`ModelRegistry`](#modelregistry) \| `undefined`

#### Returns

`void`

---

### validateNexusEnv()

```ts
function validateNexusEnv(logger?): EnvValidationResult;
```

Defined in: [packages/nexus-agents/src/config/env-schema.ts:249](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/env-schema.ts#L249)

Validates all NEXUS\_\* environment variables.

- Detects unknown vars (potential typos) with Levenshtein suggestions
- Detects invalid values for known vars
- Warn-only: never throws, never blocks startup

#### Parameters

##### logger?

[`ILogger`](core.md#ilogger)

Optional logger for direct warning output

#### Returns

[`EnvValidationResult`](#envvalidationresult)

Validation result with unknown and invalid var lists
