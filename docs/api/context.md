---
title: 'API: context'
description: Generated API reference for context.
tier: 2
---

# context

## Classes

### TokenCounter

Defined in: [packages/nexus-agents/src/context/token-counter.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L86)

Universal token counter supporting multiple providers.

Provides accurate token counting via provider APIs (Anthropic, Gemini)
or local tiktoken (OpenAI), with fallback to character-based estimation.

#### Example

```typescript
const counter = new TokenCounter({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  googleApiKey: process.env.GOOGLE_AI_API_KEY,
});

// Count via Anthropic API
const result = await counter.countAnthropic(messages, 'claude-sonnet-4');

// Count via local tiktoken
const openaiResult = counter.countOpenAI('Hello world', 'gpt-4o');

// Offline estimation
const estimate = counter.estimate('Some text');
```

#### Implements

- [`ITokenCounter`](#itokencounter)

#### Constructors

##### Constructor

```ts
new TokenCounter(config?): TokenCounter;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L100)

Creates a new TokenCounter instance.

###### Parameters

###### config?

[`TokenCounterConfig`](#tokencounterconfig) = `{}`

Token counter configuration

###### Returns

[`TokenCounter`](#tokencounter)

#### Methods

##### clearCache()

```ts
clearCache(): void;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:289](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L289)

Clear the token count cache.

###### Returns

`void`

###### Implementation of

[`ITokenCounter`](#itokencounter).[`clearCache`](#clearcache-1)

##### countAnthropic()

```ts
countAnthropic(messages, model): Promise<Result<TokenCountResult, TokenCountError>>;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L119)

Count tokens for Anthropic/Claude models via API.

###### Parameters

###### messages

[`Message`](core.md#message-11)[]

###### model

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TokenCountResult`](#tokencountresult), [`TokenCountError`](#tokencounterror)\>\>

###### Implementation of

[`ITokenCounter`](#itokencounter).[`countAnthropic`](#countanthropic-1)

##### countGemini()

```ts
countGemini(content, model): Promise<Result<TokenCountResult, TokenCountError>>;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L178)

Count tokens for Gemini models via API.

###### Parameters

###### content

`string`

###### model

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TokenCountResult`](#tokencountresult), [`TokenCountError`](#tokencounterror)\>\>

###### Implementation of

[`ITokenCounter`](#itokencounter).[`countGemini`](#countgemini-1)

##### countOpenAI()

```ts
countOpenAI(text, model?): Result<TokenCountResult, TokenCountError>;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:228](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L228)

Count tokens for OpenAI models using local tiktoken.

###### Parameters

###### text

`string`

###### model?

`string` = `DEFAULT_TIKTOKEN_MODEL`

###### Returns

[`Result`](core.md#result)\<[`TokenCountResult`](#tokencountresult), [`TokenCountError`](#tokencounterror)\>

###### Implementation of

[`ITokenCounter`](#itokencounter).[`countOpenAI`](#countopenai-1)

##### dispose()

```ts
dispose(): void;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:368](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L368)

Frees resources (tiktoken encoder).
Call this when done with the counter.

###### Returns

`void`

##### estimate()

```ts
estimate(text): number;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L268)

Estimate tokens offline using character-based heuristic.
Uses ~4 characters per token as a general approximation.

###### Parameters

###### text

`string`

###### Returns

`number`

###### Implementation of

[`ITokenCounter`](#itokencounter).[`estimate`](#estimate-1)

##### estimateForProvider()

```ts
estimateForProvider(text, provider): number;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:278](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L278)

Estimate tokens for a specific provider.

###### Parameters

###### text

`string`

###### provider

[`TokenCounterProvider`](#tokencounterprovider)

###### Returns

`number`

##### getCacheStats()

```ts
getCacheStats(): {
  maxSize: number;
  size: number;
  ttlMs: number;
};
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:296](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L296)

Get current cache statistics.

###### Returns

```ts
{
  maxSize: number;
  size: number;
  ttlMs: number;
}
```

###### maxSize

```ts
maxSize: number;
```

###### size

```ts
size: number;
```

###### ttlMs

```ts
ttlMs: number;
```

###### Implementation of

[`ITokenCounter`](#itokencounter).[`getCacheStats`](#getcachestats-1)

---

### TokenCountError

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L34)

Error specific to token counting operations.

#### Extends

- [`NexusError`](core.md#nexuserror)

#### Constructors

##### Constructor

```ts
new TokenCountError(message, options?): TokenCountError;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L35)

###### Parameters

###### message

`string`

###### options?

###### cause?

`Error`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`TokenCountError`](#tokencounterror)

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

## Interfaces

### ITokenCounter

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L94)

Interface for token counting operations.

#### Methods

##### clearCache()

```ts
clearCache(): void;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L132)

Clear the token count cache.

###### Returns

`void`

##### countAnthropic()

```ts
countAnthropic(messages, model): Promise<Result<TokenCountResult, TokenCountError>>;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L101)

Count tokens for Anthropic/Claude models via API.

###### Parameters

###### messages

[`Message`](core.md#message-11)[]

Messages to count tokens for

###### model

`string`

Model identifier (e.g., 'claude-sonnet-4')

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TokenCountResult`](#tokencountresult), [`TokenCountError`](#tokencounterror)\>\>

Promise with token count result

##### countGemini()

```ts
countGemini(content, model): Promise<Result<TokenCountResult, TokenCountError>>;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L112)

Count tokens for Gemini models via API.

###### Parameters

###### content

`string`

Text content to count tokens for

###### model

`string`

Model identifier (e.g., 'gemini-2.0-flash')

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`TokenCountResult`](#tokencountresult), [`TokenCountError`](#tokencounterror)\>\>

Promise with token count result

##### countOpenAI()

```ts
countOpenAI(text, model?): Result<TokenCountResult, TokenCountError>;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L120)

Count tokens for OpenAI models using local tiktoken.

###### Parameters

###### text

`string`

Text to count tokens for

###### model?

`string`

Model identifier (default: 'gpt-4o')

###### Returns

[`Result`](core.md#result)\<[`TokenCountResult`](#tokencountresult), [`TokenCountError`](#tokencounterror)\>

Token count result (synchronous, local)

##### estimate()

```ts
estimate(text): number;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L127)

Estimate tokens offline using character-based heuristic.

###### Parameters

###### text

`string`

Text to estimate tokens for

###### Returns

`number`

Estimated token count

##### getCacheStats()

```ts
getCacheStats(): {
  maxSize: number;
  size: number;
  ttlMs: number;
};
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L137)

Get current cache statistics.

###### Returns

```ts
{
  maxSize: number;
  size: number;
  ttlMs: number;
}
```

###### maxSize

```ts
maxSize: number;
```

###### size

```ts
size: number;
```

###### ttlMs

```ts
ttlMs: number;
```

---

### TokenCounterConfig

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L48)

Configuration for the token counter.

#### Properties

##### anthropicApiKey?

```ts
optional anthropicApiKey?: string;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L50)

Anthropic API key (optional, required for Anthropic counting)

##### cacheTtlMs?

```ts
optional cacheTtlMs?: number;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L56)

Cache TTL in milliseconds (default: 5 minutes)

##### googleApiKey?

```ts
optional googleApiKey?: string;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L52)

Google API key (optional, required for Gemini counting)

##### maxCacheSize?

```ts
optional maxCacheSize?: number;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L54)

Maximum cache entries (default: 1000)

---

### TokenCountResult

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L66)

Token counting result with metadata.

#### Properties

##### cached

```ts
cached: boolean;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L70)

Whether the result was from cache

##### count

```ts
count: number;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L68)

Number of tokens

##### model?

```ts
optional model?: string;
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L74)

Model used (if applicable)

##### provider

```ts
provider: TokenCounterProvider | 'estimate';
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L72)

Provider used for counting

## Type Aliases

### TokenCounterProvider

```ts
type TokenCounterProvider = (typeof TokenCounterProvider)[keyof typeof TokenCounterProvider];
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L19)

Supported model families for token counting.

## Variables

### TokenCounterProvider

```ts
const TokenCounterProvider: {
  ANTHROPIC: 'anthropic';
  GEMINI: 'gemini';
  OPENAI: 'openai';
};
```

Defined in: [packages/nexus-agents/src/context/token-counter-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter-types.ts#L19)

Supported model families for token counting.

#### Type Declaration

##### ANTHROPIC

```ts
readonly ANTHROPIC: "anthropic" = 'anthropic';
```

##### GEMINI

```ts
readonly GEMINI: "gemini" = 'gemini';
```

##### OPENAI

```ts
readonly OPENAI: "openai" = 'openai';
```

## Functions

### createTokenCounter()

```ts
function createTokenCounter(config?): TokenCounter;
```

Defined in: [packages/nexus-agents/src/context/token-counter.ts:392](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/token-counter.ts#L392)

Creates a TokenCounter instance with the specified configuration.

#### Parameters

##### config?

[`TokenCounterConfig`](#tokencounterconfig) = `{}`

Token counter configuration

#### Returns

[`TokenCounter`](#tokencounter)

Configured TokenCounter instance

#### Example

```typescript
const counter = createTokenCounter({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  googleApiKey: process.env.GOOGLE_AI_API_KEY,
});
```
