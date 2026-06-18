---
title: 'API: adapters'
description: Generated API reference for adapters.
tier: 2
---

# adapters

## Classes

### AdapterFactory

Defined in: [packages/nexus-agents/src/adapters/factory.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L79)

Factory for creating and managing model adapters.

Implements the registry pattern to allow dynamic registration of adapter
creators for different model providers. This enables a plugin-style
architecture where new providers can be added without modifying core code.

#### Example

```typescript
const factory = new AdapterFactory();

// Register a provider
factory.register('anthropic', (config) => new ClaudeAdapter(config));

// Create an adapter
const result = factory.create({
  providerId: 'anthropic',
  modelId: 'claude-sonnet-4',
});

if (result.ok) {
  const adapter = result.value;
  // Use adapter...
}
```

#### Constructors

##### Constructor

```ts
new AdapterFactory(): AdapterFactory;
```

###### Returns

[`AdapterFactory`](#adapterfactory)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L272)

Returns the number of registered providers.

###### Returns

`number`

Count of registered providers

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:280](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L280)

Clears all registered providers.
Useful for testing or resetting the factory state.

###### Returns

`void`

##### create()

```ts
create(config): Result<IModelAdapter, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L172)

Creates an adapter instance for the specified configuration.

Validates the configuration against the schema, looks up the provider
in the registry, and invokes the creator function to produce an adapter.

###### Parameters

###### config

Adapter configuration specifying provider and settings

###### apiKey?

`string` = `...`

API key for authentication (optional, may come from environment)

###### baseUrl?

`string` = `...`

Base URL for the API (optional, uses provider default)

###### maxRetries?

`number` = `...`

Maximum number of retries for failed requests

###### modelId

`string` = `...`

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### providerId

`string` = `...`

Provider identifier (e.g., 'anthropic', 'openai')

###### timeout?

`number` = `...`

Request timeout in milliseconds

###### Returns

[`Result`](core.md#result)\<[`IModelAdapter`](core.md#imodeladapter), [`ConfigError`](core.md#configerror)\>

Result containing the adapter or a ConfigError

###### Example

```typescript
const result = factory.create({
  providerId: 'anthropic',
  modelId: 'claude-sonnet-4',
  timeout: 30000,
  maxRetries: 3,
});

if (result.ok) {
  const response = await result.value.complete(request);
} else {
  console.error('Failed to create adapter:', result.error.message);
}
```

##### hasProvider()

```ts
hasProvider(providerId): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L254)

Checks if a provider is registered.

###### Parameters

###### providerId

`string`

The provider ID to check

###### Returns

`boolean`

True if the provider is registered

##### listProviders()

```ts
listProviders(): string[];
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:263](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L263)

Returns a list of all registered provider IDs.

###### Returns

`string`[]

Array of provider identifiers

##### register()

```ts
register(
   providerId,
   creator,
options?): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L101)

Registers an adapter creator for a provider.

###### Parameters

###### providerId

`string`

Unique identifier for the provider (e.g., 'anthropic')

###### creator

[`AdapterCreator`](#adaptercreator)

Factory function that creates adapters for this provider

###### options?

[`AdapterRegisterOptions`](#adapterregisteroptions) = `{}`

Registration options

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

Result indicating success or failure

###### Example

```typescript
const result = factory.register('anthropic', (config) => new ClaudeAdapter(config));
if (!result.ok) {
  console.error('Registration failed:', result.error.message);
}
```

##### unregister()

```ts
unregister(providerId): Result<boolean, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L134)

Unregisters an adapter creator for a provider.

###### Parameters

###### providerId

`string`

The provider ID to unregister

###### Returns

[`Result`](core.md#result)\<`boolean`, [`ConfigError`](core.md#configerror)\>

Result indicating whether the provider was removed

---

### AdapterModelError

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L64)

Extended ModelError that supports specific error codes.

While ModelError from core uses MODEL_ERROR by default, this subclass
allows adapters to specify more granular error codes like
MODEL_RATE_LIMITED, MODEL_TIMEOUT, etc.

Extends ModelError so `instanceof ModelError` checks pass naturally
without requiring `as unknown as ModelError` casts.

#### Extends

- [`ModelError`](core.md#modelerror)

#### Constructors

##### Constructor

```ts
new AdapterModelError(message, options): AdapterModelError;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L65)

###### Parameters

###### message

`string`

###### options

[`NexusErrorOptions`](core.md#nexuserroroptions)

###### Returns

[`AdapterModelError`](#adaptermodelerror)

###### Overrides

[`ModelError`](core.md#modelerror).[`constructor`](core.md#constructor-2)

#### Properties

##### cause

```ts
readonly cause: Error | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L94)

###### Inherited from

[`ModelError`](core.md#modelerror).[`cause`](core.md#cause-2)

##### code

```ts
readonly code: ErrorCode;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L92)

###### Inherited from

[`ModelError`](core.md#modelerror).[`code`](core.md#code-2)

##### context

```ts
readonly context: Record<string, unknown> | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L93)

###### Inherited from

[`ModelError`](core.md#modelerror).[`context`](core.md#context-2)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

[`ModelError`](core.md#modelerror).[`message`](core.md#message-2)

##### name

```ts
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

[`ModelError`](core.md#modelerror).[`name`](core.md#name-2)

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`ModelError`](core.md#modelerror).[`stack`](core.md#stack-2)

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

[`ModelError`](core.md#modelerror).[`stackTraceLimit`](core.md#stacktracelimit-2)

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

[`ModelError`](core.md#modelerror).[`toJSON`](core.md#tojson-2)

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

[`ModelError`](core.md#modelerror).[`captureStackTrace`](core.md#capturestacktrace-2)

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

[`ModelError`](core.md#modelerror).[`prepareStackTrace`](core.md#preparestacktrace-2)

---

### AdapterRateLimiter

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L72)

Token bucket rate limiter for controlling request rates.

The token bucket algorithm works as follows:

1. A bucket holds tokens up to a maximum capacity
2. Tokens are added at a fixed rate (refillRate per second)
3. Each request consumes one or more tokens
4. If insufficient tokens, the request is rejected or waits

#### Example

```typescript
const limiter = new RateLimiter({
  capacity: 100, // Max 100 tokens
  refillRate: 10, // 10 tokens per second
});

if (limiter.tryAcquire()) {
  // Proceed with operation
} else {
  // Rate limited
}

// Or wait for tokens
await limiter.waitForTokens();
```

#### Constructors

##### Constructor

```ts
new AdapterRateLimiter(config): AdapterRateLimiter;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L85)

Creates a new RateLimiter instance.

###### Parameters

###### config

[`AdapterRateLimiterConfig`](#adapterratelimiterconfig)

Configuration options

###### Returns

[`AdapterRateLimiter`](#adapterratelimiter)

###### Throws

If configuration is invalid

#### Methods

##### acquire()

```ts
acquire(tokens?): Result<void, RateLimitExceeded>;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L177)

Attempts to acquire tokens and returns a Result with detailed information.

###### Parameters

###### tokens?

`number` = `1`

Number of tokens to acquire (default: 1)

###### Returns

[`Result`](core.md#result)\<`void`, [`RateLimitExceeded`](#ratelimitexceeded)\>

Result containing void on success, or RateLimitExceeded on failure

###### Example

```typescript
const result = limiter.acquire(5);
if (!result.ok) {
  console.log(`Retry after ${result.error.retryAfterMs}ms`);
}
```

##### getAvailableTokens()

```ts
getAvailableTokens(): number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:260](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L260)

Returns the number of whole tokens available.

###### Returns

`number`

Integer number of available tokens

##### getCapacity()

```ts
getCapacity(): number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:276](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L276)

Returns the bucket's maximum capacity.

###### Returns

`number`

##### getRefillRate()

```ts
getRefillRate(): number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:283](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L283)

Returns the refill rate in tokens per second.

###### Returns

`number`

##### getRemainingTokens()

```ts
getRemainingTokens(): number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L250)

Returns the current number of available tokens.
Performs a refill before returning the count.

###### Returns

`number`

Number of available tokens (may be fractional)

##### getTimeUntilAvailable()

```ts
getTimeUntilAvailable(tokens?): number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L293)

Calculates the time in milliseconds until the specified tokens are available.

###### Parameters

###### tokens?

`number` = `1`

Number of tokens needed (default: 1)

###### Returns

`number`

Time in milliseconds until tokens are available, 0 if already available

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L268)

Resets the rate limiter to its initial state.
The bucket is refilled to capacity.

###### Returns

`void`

##### tryAcquire()

```ts
tryAcquire(tokens?): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L145)

Attempts to acquire the specified number of tokens.

###### Parameters

###### tokens?

`number` = `1`

Number of tokens to acquire (default: 1)

###### Returns

`boolean`

true if tokens were acquired, false if rate limited

###### Example

```typescript
if (limiter.tryAcquire(5)) {
  // Acquired 5 tokens
}
```

##### waitForTokens()

```ts
waitForTokens(tokens?): Promise<void>;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L221)

Waits until the specified number of tokens are available, then acquires them.

###### Parameters

###### tokens?

`number` = `1`

Number of tokens to acquire (default: 1)

###### Returns

`Promise`\<`void`\>

Promise that resolves when tokens are acquired

###### Throws

If tokens exceed capacity (would wait forever)

###### Example

```typescript
await limiter.waitForTokens(10);
// 10 tokens acquired
```

---

### `abstract` BaseAdapter

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L148)

Abstract base class for model adapters.

Provides default implementations for common adapter functionality while
leaving the core API interaction methods abstract for provider-specific
implementations.

#### Example

```typescript
class ClaudeAdapter extends BaseAdapter {
  constructor(config: ClaudeAdapterConfig) {
    super({
      providerId: 'anthropic',
      modelId: config.modelId,
      capabilities: [ModelCapability.COMPLETION, ModelCapability.STREAMING],
      apiKey: config.apiKey,
    });
  }

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    this.logRequest(request);
    // Provider-specific implementation...
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    this.logRequest(request);
    // Provider-specific streaming implementation...
  }
}
```

#### Extended by

- [`ClaudeAdapter`](#claudeadapter)
- [`OpenAIAdapter`](#openaiadapter)
- [`OllamaAdapter`](#ollamaadapter)
- [`GeminiAdapter`](#geminiadapter)
- [`SdkAdapter`](#sdkadapter)

#### Implements

- [`IModelAdapter`](core.md#imodeladapter)

#### Constructors

##### Constructor

```ts
new BaseAdapter(config): BaseAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L164)

Creates a new BaseAdapter instance.

###### Parameters

###### config

[`BaseAdapterConfig`](#baseadapterconfig-1)

Adapter configuration

###### Returns

[`BaseAdapter`](#abstract-baseadapter)

#### Properties

##### capabilities

```ts
readonly capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L151)

Capabilities this model supports

###### Implementation of

[`IModelAdapter`](core.md#imodeladapter).[`capabilities`](core.md#capabilities-1)

##### config

```ts
protected readonly config: BaseAdapterConfig;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L157)

Configuration for the adapter

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L154)

Logger for request/response logging

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L150)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### Implementation of

[`IModelAdapter`](core.md#imodeladapter).[`modelId`](core.md#modelid)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L149)

Provider identifier (e.g., 'anthropic', 'openai')

###### Implementation of

[`IModelAdapter`](core.md#imodeladapter).[`providerId`](core.md#providerid)

#### Methods

##### complete()

```ts
abstract complete(request): Promise<Result<CompletionResponse, ModelError>>;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L184)

Send a completion request to the model.
Must be implemented by concrete adapter classes.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`ModelError`](core.md#modelerror)\>\>

Result with response or ModelError

###### Implementation of

[`IModelAdapter`](core.md#imodeladapter).[`complete`](core.md#complete)

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L204)

Count tokens in text using the unified TokenEstimator.

This provides a reasonable estimate for most use cases.
Concrete adapters may override this with provider-specific tokenizers.

###### Parameters

###### text

`string`

Text to count tokens for

###### Returns

`Promise`\<`number`\>

Approximate token count

###### Implementation of

[`IModelAdapter`](core.md#imodeladapter).[`countTokens`](core.md#counttokens)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L256)

Check if this adapter supports a specific capability.

###### Parameters

###### capability

[`ModelCapability`](core.md#modelcapability)

The capability to check for

###### Returns

`boolean`

True if the capability is supported

##### logRequest()

```ts
protected logRequest(request): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L266)

Log details about an outgoing request.
Sanitizes sensitive information before logging.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request to log

###### Returns

`void`

##### logResponse()

```ts
protected logResponse(response): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:288](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L288)

Log details about a received response.

###### Parameters

###### response

[`CompletionResponse`](core.md#completionresponse)

The completion response to log

###### Returns

`void`

##### stream()

```ts
abstract stream(request): AsyncIterable<StreamChunk>;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L193)

Stream a completion request from the model.
Must be implemented by concrete adapter classes.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`AsyncIterable`\<[`StreamChunk`](core.md#streamchunk)\>

###### Yields

StreamChunk objects as they arrive

###### Implementation of

[`IModelAdapter`](core.md#imodeladapter).[`stream`](core.md#stream)

##### transformError()

```ts
protected transformError(error): ModelError;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L311)

Transform a provider-specific error into a standardized ModelError.

Maps common error patterns to appropriate error codes:

- Rate limiting (429, quota exceeded)
- Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
- Authentication (401, 403)
- Model unavailable (503, 502)

###### Parameters

###### error

`unknown`

The original error from the provider

###### Returns

[`ModelError`](core.md#modelerror)

A standardized ModelError

##### validateConfig()

```ts
validateConfig(): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L216)

Validate adapter configuration.

Checks that required configuration fields are present and valid.
Concrete adapters may override to add provider-specific validation.

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

Ok if valid, ConfigError if invalid

###### Implementation of

[`IModelAdapter`](core.md#imodeladapter).[`validateConfig`](core.md#validateconfig)

---

### ClaudeAdapter

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L74)

Claude/Anthropic model adapter.

Provides a unified interface for interacting with Anthropic's Claude models.
Supports completion, streaming, tool use, and vision capabilities.

#### Example

```typescript
const adapter = new ClaudeAdapter({
  modelId: 'claude-sonnet-4',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await adapter.complete({
  messages: [{ role: 'user', content: 'Hello!' }],
  maxTokens: 1024,
});

if (result.ok) {
  console.log(result.value.content);
}
```

#### Extends

- [`BaseAdapter`](#abstract-baseadapter)

#### Constructors

##### Constructor

```ts
new ClaudeAdapter(config): ClaudeAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L84)

Creates a new ClaudeAdapter instance.

###### Parameters

###### config

[`ClaudeAdapterConfig`](#claudeadapterconfig-1)

Claude adapter configuration

###### Returns

[`ClaudeAdapter`](#claudeadapter)

###### Throws

If API key is missing

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`constructor`](#constructor-3)

#### Properties

##### capabilities

```ts
readonly capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L151)

Capabilities this model supports

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`capabilities`](#capabilities)

##### config

```ts
protected readonly config: BaseAdapterConfig;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L157)

Configuration for the adapter

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`config`](#config)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L154)

Logger for request/response logging

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logger`](#logger)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L150)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`modelId`](#modelid)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L149)

Provider identifier (e.g., 'anthropic', 'openai')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`providerId`](#providerid)

#### Methods

##### complete()

```ts
complete(request): Promise<Result<CompletionResponse, ModelError>>;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L145)

Send a completion request to Claude.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`ModelError`](core.md#modelerror)\>\>

Result with response or ModelError

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`complete`](#complete)

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L186)

Count tokens in text using Claude-specific estimation.

Claude uses a custom tokenizer. This provides a more accurate estimate
than the base adapter's generic calculation.

###### Parameters

###### text

`string`

Text to count tokens for

###### Returns

`Promise`\<`number`\>

Approximate token count

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`countTokens`](#counttokens)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L256)

Check if this adapter supports a specific capability.

###### Parameters

###### capability

[`ModelCapability`](core.md#modelcapability)

The capability to check for

###### Returns

`boolean`

True if the capability is supported

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`hasCapability`](#hascapability)

##### listModels()

```ts
listModels(): Promise<readonly ModelMetadata[]>;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:383](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L383)

(#2540) List models the Anthropic API currently exposes.
Wraps `client.models.list()`. Cached for 5 min, in-flight promise
shared across concurrent callers, throws on non-2xx so the
harness-side identity resolver knows to fall back.

###### Returns

`Promise`\<readonly `ModelMetadata`[]\>

##### logRequest()

```ts
protected logRequest(request): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L266)

Log details about an outgoing request.
Sanitizes sensitive information before logging.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logRequest`](#logrequest)

##### logResponse()

```ts
protected logResponse(response): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:288](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L288)

Log details about a received response.

###### Parameters

###### response

[`CompletionResponse`](core.md#completionresponse)

The completion response to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logResponse`](#logresponse)

##### stream()

```ts
stream(request): AsyncIterable<StreamChunk>;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L163)

Stream a completion request from Claude.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`AsyncIterable`\<[`StreamChunk`](core.md#streamchunk)\>

###### Yields

StreamChunk objects as they arrive

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`stream`](#stream)

##### transformError()

```ts
protected transformError(error): ModelError;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L311)

Transform a provider-specific error into a standardized ModelError.

Maps common error patterns to appropriate error codes:

- Rate limiting (429, quota exceeded)
- Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
- Authentication (401, 403)
- Model unavailable (503, 502)

###### Parameters

###### error

`unknown`

The original error from the provider

###### Returns

[`ModelError`](core.md#modelerror)

A standardized ModelError

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`transformError`](#transformerror)

##### validateConfig()

```ts
validateConfig(): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L126)

Validates adapter configuration.
Extends base validation with Claude-specific checks.

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`validateConfig`](#validateconfig)

---

### GeminiAdapter

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L97)

Gemini/Google AI model adapter.

Provides a unified interface for interacting with Google's Gemini models.
Supports completion, streaming, tool use, and vision capabilities.

#### Example

```typescript
const adapter = new GeminiAdapter({
  modelId: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const result = await adapter.complete({
  messages: [{ role: 'user', content: 'Hello!' }],
  maxTokens: 1024,
});

if (result.ok) {
  console.log(result.value.content);
}
```

#### Extends

- [`BaseAdapter`](#abstract-baseadapter)

#### Constructors

##### Constructor

```ts
new GeminiAdapter(config): GeminiAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L107)

Creates a new GeminiAdapter instance.

###### Parameters

###### config

[`GeminiAdapterConfig`](#geminiadapterconfig-1)

Gemini adapter configuration

###### Returns

[`GeminiAdapter`](#geminiadapter)

###### Throws

If API key is missing

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`constructor`](#constructor-3)

#### Properties

##### capabilities

```ts
readonly capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L151)

Capabilities this model supports

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`capabilities`](#capabilities)

##### config

```ts
protected readonly config: BaseAdapterConfig;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L157)

Configuration for the adapter

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`config`](#config)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L154)

Logger for request/response logging

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logger`](#logger)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L150)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`modelId`](#modelid)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L149)

Provider identifier (e.g., 'anthropic', 'openai')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`providerId`](#providerid)

#### Methods

##### complete()

```ts
complete(request): Promise<Result<CompletionResponse, ModelError>>;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L160)

Send a completion request to Gemini.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`ModelError`](core.md#modelerror)\>\>

Result with response or ModelError

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`complete`](#complete)

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L198)

Count tokens in text using Gemini-specific estimation.

###### Parameters

###### text

`string`

Text to count tokens for

###### Returns

`Promise`\<`number`\>

Approximate token count

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`countTokens`](#counttokens)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L256)

Check if this adapter supports a specific capability.

###### Parameters

###### capability

[`ModelCapability`](core.md#modelcapability)

The capability to check for

###### Returns

`boolean`

True if the capability is supported

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`hasCapability`](#hascapability)

##### listModels()

```ts
listModels(): Promise<readonly ModelMetadata[]>;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:380](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L380)

(#2540) List Gemini models exposed by the configured API key.
Wraps `client.models.list()` (returns a Pager). 5-min cache,
concurrent-caller promise sharing.

###### Returns

`Promise`\<readonly `ModelMetadata`[]\>

##### logRequest()

```ts
protected logRequest(request): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L266)

Log details about an outgoing request.
Sanitizes sensitive information before logging.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logRequest`](#logrequest)

##### logResponse()

```ts
protected logResponse(response): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:288](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L288)

Log details about a received response.

###### Parameters

###### response

[`CompletionResponse`](core.md#completionresponse)

The completion response to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logResponse`](#logresponse)

##### stream()

```ts
stream(request): AsyncIterable<StreamChunk>;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L178)

Stream a completion request from Gemini.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`AsyncIterable`\<[`StreamChunk`](core.md#streamchunk)\>

###### Yields

StreamChunk objects as they arrive

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`stream`](#stream)

##### transformError()

```ts
protected transformError(error): ModelError;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L311)

Transform a provider-specific error into a standardized ModelError.

Maps common error patterns to appropriate error codes:

- Rate limiting (429, quota exceeded)
- Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
- Authentication (401, 403)
- Model unavailable (503, 502)

###### Parameters

###### error

`unknown`

The original error from the provider

###### Returns

[`ModelError`](core.md#modelerror)

A standardized ModelError

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`transformError`](#transformerror)

##### validateConfig()

```ts
validateConfig(): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L141)

Validates adapter configuration.
Extends base validation with Gemini-specific checks.

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`validateConfig`](#validateconfig)

---

### OllamaAdapter

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L152)

Ollama model adapter for local model inference.

#### Extends

- [`BaseAdapter`](#abstract-baseadapter)

#### Constructors

##### Constructor

```ts
new OllamaAdapter(config): OllamaAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L155)

###### Parameters

###### config

[`OllamaAdapterConfig`](#ollamaadapterconfig-1)

###### Returns

[`OllamaAdapter`](#ollamaadapter)

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`constructor`](#constructor-3)

#### Properties

##### capabilities

```ts
readonly capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L151)

Capabilities this model supports

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`capabilities`](#capabilities)

##### config

```ts
protected readonly config: BaseAdapterConfig;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L157)

Configuration for the adapter

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`config`](#config)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L154)

Logger for request/response logging

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logger`](#logger)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L150)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`modelId`](#modelid)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L149)

Provider identifier (e.g., 'anthropic', 'openai')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`providerId`](#providerid)

#### Methods

##### complete()

```ts
complete(request): Promise<Result<CompletionResponse, ModelError>>;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L180)

Send a completion request to the model.
Must be implemented by concrete adapter classes.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`ModelError`](core.md#modelerror)\>\>

Result with response or ModelError

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`complete`](#complete)

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L211)

Count tokens in text using the unified TokenEstimator.

This provides a reasonable estimate for most use cases.
Concrete adapters may override this with provider-specific tokenizers.

###### Parameters

###### text

`string`

Text to count tokens for

###### Returns

`Promise`\<`number`\>

Approximate token count

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`countTokens`](#counttokens)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L256)

Check if this adapter supports a specific capability.

###### Parameters

###### capability

[`ModelCapability`](core.md#modelcapability)

The capability to check for

###### Returns

`boolean`

True if the capability is supported

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`hasCapability`](#hascapability)

##### logRequest()

```ts
protected logRequest(request): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L266)

Log details about an outgoing request.
Sanitizes sensitive information before logging.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logRequest`](#logrequest)

##### logResponse()

```ts
protected logResponse(response): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:288](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L288)

Log details about a received response.

###### Parameters

###### response

[`CompletionResponse`](core.md#completionresponse)

The completion response to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logResponse`](#logresponse)

##### stream()

```ts
stream(request): AsyncIterable<StreamChunk>;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L202)

Stream a completion request from the model.
Must be implemented by concrete adapter classes.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`AsyncIterable`\<[`StreamChunk`](core.md#streamchunk)\>

###### Yields

StreamChunk objects as they arrive

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`stream`](#stream)

##### transformError()

```ts
protected transformError(error): ModelError;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L311)

Transform a provider-specific error into a standardized ModelError.

Maps common error patterns to appropriate error codes:

- Rate limiting (429, quota exceeded)
- Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
- Authentication (401, 403)
- Model unavailable (503, 502)

###### Parameters

###### error

`unknown`

The original error from the provider

###### Returns

[`ModelError`](core.md#modelerror)

A standardized ModelError

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`transformError`](#transformerror)

##### validateConfig()

```ts
validateConfig(): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L169)

Validate adapter configuration.

Checks that required configuration fields are present and valid.
Concrete adapters may override to add provider-specific validation.

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

Ok if valid, ConfigError if invalid

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`validateConfig`](#validateconfig)

---

### OpenAIAdapter

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L71)

OpenAI model adapter.

Provides a unified interface for interacting with OpenAI's GPT models.
Supports completion, streaming, tool use, and vision capabilities.

#### Example

```typescript
const adapter = new OpenAIAdapter({
  modelId: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY,
});

const result = await adapter.complete({
  messages: [{ role: 'user', content: 'Hello!' }],
  maxTokens: 1024,
});

if (result.ok) {
  console.log(result.value.content);
}
```

#### Extends

- [`BaseAdapter`](#abstract-baseadapter)

#### Constructors

##### Constructor

```ts
new OpenAIAdapter(config): OpenAIAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L81)

Creates a new OpenAIAdapter instance.

###### Parameters

###### config

[`OpenAIAdapterConfig`](#openaiadapterconfig-1)

OpenAI adapter configuration

###### Returns

[`OpenAIAdapter`](#openaiadapter)

###### Throws

If API key is missing

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`constructor`](#constructor-3)

#### Properties

##### capabilities

```ts
readonly capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L151)

Capabilities this model supports

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`capabilities`](#capabilities)

##### config

```ts
protected readonly config: BaseAdapterConfig;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L157)

Configuration for the adapter

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`config`](#config)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L154)

Logger for request/response logging

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logger`](#logger)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L150)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`modelId`](#modelid)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L149)

Provider identifier (e.g., 'anthropic', 'openai')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`providerId`](#providerid)

#### Methods

##### complete()

```ts
complete(request): Promise<Result<CompletionResponse, ModelError>>;
```

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L158)

Send a completion request to OpenAI.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`ModelError`](core.md#modelerror)\>\>

Result with response or ModelError

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`complete`](#complete)

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L196)

Count tokens in text using OpenAI-specific estimation.

###### Parameters

###### text

`string`

Text to count tokens for

###### Returns

`Promise`\<`number`\>

Approximate token count

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`countTokens`](#counttokens)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L256)

Check if this adapter supports a specific capability.

###### Parameters

###### capability

[`ModelCapability`](core.md#modelcapability)

The capability to check for

###### Returns

`boolean`

True if the capability is supported

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`hasCapability`](#hascapability)

##### listModels()

```ts
listModels(): Promise<readonly ModelMetadata[]>;
```

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:389](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L389)

(#2529) List models served by this OpenAI-compatible endpoint.

Wraps `GET /v1/models`. Result is cached for `LIST_MODELS_TTL_MS`
so identity resolution doesn't round-trip on every adapter.
Concurrent callers share the in-flight promise.

Throws on non-2xx so the harness-side identity resolver knows to
fall back to modelId parsing — silent empty-list returns would be
indistinguishable from "this gateway has no models", which a
misconfigured endpoint shouldn't be allowed to claim.

###### Returns

`Promise`\<readonly `ModelMetadata`[]\>

##### logRequest()

```ts
protected logRequest(request): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L266)

Log details about an outgoing request.
Sanitizes sensitive information before logging.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logRequest`](#logrequest)

##### logResponse()

```ts
protected logResponse(response): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:288](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L288)

Log details about a received response.

###### Parameters

###### response

[`CompletionResponse`](core.md#completionresponse)

The completion response to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logResponse`](#logresponse)

##### stream()

```ts
stream(request): AsyncIterable<StreamChunk>;
```

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L176)

Stream a completion request from OpenAI.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`AsyncIterable`\<[`StreamChunk`](core.md#streamchunk)\>

###### Yields

StreamChunk objects as they arrive

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`stream`](#stream)

##### transformError()

```ts
protected transformError(error): ModelError;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L311)

Transform a provider-specific error into a standardized ModelError.

Maps common error patterns to appropriate error codes:

- Rate limiting (429, quota exceeded)
- Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
- Authentication (401, 403)
- Model unavailable (503, 502)

###### Parameters

###### error

`unknown`

The original error from the provider

###### Returns

[`ModelError`](core.md#modelerror)

A standardized ModelError

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`transformError`](#transformerror)

##### validateConfig()

```ts
validateConfig(): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L139)

Validates adapter configuration.
Extends base validation with OpenAI-specific checks.

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`validateConfig`](#validateconfig)

---

### RetryExhaustedError

Defined in: [packages/nexus-agents/src/adapters/retry.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L79)

Error thrown when all retry attempts are exhausted.

#### Extends

- [`NexusError`](core.md#nexuserror)

#### Constructors

##### Constructor

```ts
new RetryExhaustedError(attempts, lastError): RetryExhaustedError;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L85)

###### Parameters

###### attempts

`number`

###### lastError

`unknown`

###### Returns

[`RetryExhaustedError`](#retryexhaustederror)

###### Overrides

[`NexusError`](core.md#nexuserror).[`constructor`](core.md#constructor-3)

#### Properties

##### attempts

```ts
readonly attempts: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L81)

Number of attempts made

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

##### lastError

```ts
readonly lastError: unknown;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L83)

The last error encountered

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

### SdkAdapter

Defined in: [packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts:234](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts#L234)

AI SDK adapter implementing IModelAdapter.

Uses Vercel AI SDK (npm: ai) for model interaction instead of
CLI subprocess spawning. Supports any provider that has an
`@ai-sdk/*` package.

#### Extends

- [`BaseAdapter`](#abstract-baseadapter)

#### Constructors

##### Constructor

```ts
new SdkAdapter(config, logger?): SdkAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts#L250)

###### Parameters

###### config

[`SdkAdapterConfig`](#sdkadapterconfig-1)

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`SdkAdapter`](#sdkadapter)

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`constructor`](#constructor-3)

#### Properties

##### capabilities

```ts
readonly capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L151)

Capabilities this model supports

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`capabilities`](#capabilities)

##### config

```ts
protected readonly config: BaseAdapterConfig;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L157)

Configuration for the adapter

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`config`](#config)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L154)

Logger for request/response logging

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logger`](#logger)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L150)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`modelId`](#modelid)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L149)

Provider identifier (e.g., 'anthropic', 'openai')

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`providerId`](#providerid)

#### Methods

##### complete()

```ts
complete(request): Promise<Result<CompletionResponse, ModelError>>;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts:468](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts#L468)

Send a completion request to the model.
Must be implemented by concrete adapter classes.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`ModelError`](core.md#modelerror)\>\>

Result with response or ModelError

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`complete`](#complete)

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L204)

Count tokens in text using the unified TokenEstimator.

This provides a reasonable estimate for most use cases.
Concrete adapters may override this with provider-specific tokenizers.

###### Parameters

###### text

`string`

Text to count tokens for

###### Returns

`Promise`\<`number`\>

Approximate token count

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`countTokens`](#counttokens)

##### hasCapability()

```ts
hasCapability(capability): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L256)

Check if this adapter supports a specific capability.

###### Parameters

###### capability

[`ModelCapability`](core.md#modelcapability)

The capability to check for

###### Returns

`boolean`

True if the capability is supported

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`hasCapability`](#hascapability)

##### logRequest()

```ts
protected logRequest(request): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L266)

Log details about an outgoing request.
Sanitizes sensitive information before logging.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logRequest`](#logrequest)

##### logResponse()

```ts
protected logResponse(response): void;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:288](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L288)

Log details about a received response.

###### Parameters

###### response

[`CompletionResponse`](core.md#completionresponse)

The completion response to log

###### Returns

`void`

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`logResponse`](#logresponse)

##### stream()

```ts
stream(request): AsyncIterable<StreamChunk>;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts:499](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/sdk-adapter.ts#L499)

Stream a completion request from the model.
Must be implemented by concrete adapter classes.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`AsyncIterable`\<[`StreamChunk`](core.md#streamchunk)\>

###### Yields

StreamChunk objects as they arrive

###### Overrides

[`BaseAdapter`](#abstract-baseadapter).[`stream`](#stream)

##### transformError()

```ts
protected transformError(error): ModelError;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:311](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L311)

Transform a provider-specific error into a standardized ModelError.

Maps common error patterns to appropriate error codes:

- Rate limiting (429, quota exceeded)
- Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
- Authentication (401, 403)
- Model unavailable (503, 502)

###### Parameters

###### error

`unknown`

The original error from the provider

###### Returns

[`ModelError`](core.md#modelerror)

A standardized ModelError

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`transformError`](#transformerror)

##### validateConfig()

```ts
validateConfig(): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L216)

Validate adapter configuration.

Checks that required configuration fields are present and valid.
Concrete adapters may override to add provider-specific validation.

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

Ok if valid, ConfigError if invalid

###### Inherited from

[`BaseAdapter`](#abstract-baseadapter).[`validateConfig`](#validateconfig)

---

### StreamCancelledError

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L24)

Error thrown when a stream is cancelled.

#### Extends

- [`NexusError`](core.md#nexuserror)

#### Constructors

##### Constructor

```ts
new StreamCancelledError(reason?): StreamCancelledError;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L25)

###### Parameters

###### reason?

`string`

###### Returns

[`StreamCancelledError`](#streamcancellederror)

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

### StreamController

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L50)

Controller for managing stream lifecycle.
Provides push/complete/error methods and cancellation support.

#### Type Parameters

##### T

`T`

#### Constructors

##### Constructor

```ts
new StreamController<T>(options?): StreamController<T>;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L67)

Creates a new StreamController.

###### Parameters

###### options?

[`CreateStreamOptions`](#createstreamoptions) = `{}`

Stream creation options

###### Returns

[`StreamController`](#streamcontroller)\<`T`\>

#### Accessors

##### bufferSize

###### Get Signature

```ts
get bufferSize(): number;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L96)

Current buffer size.

###### Returns

`number`

##### isActive

###### Get Signature

```ts
get isActive(): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L89)

Whether the stream is still active (can receive chunks).

###### Returns

`boolean`

##### state

###### Get Signature

```ts
get state(): StreamState;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L82)

Current state of the stream.

###### Returns

[`StreamState`](#streamstate)

#### Methods

##### cancel()

```ts
cancel(reason?): void;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L167)

Cancel the stream.

###### Parameters

###### reason?

`string`

Optional reason for cancellation

###### Returns

`void`

##### complete()

```ts
complete(): void;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L138)

Complete the stream successfully.

###### Returns

`void`

##### error()

```ts
error(error): void;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L152)

Complete the stream with an error.

###### Parameters

###### error

`Error`

The error that occurred

###### Returns

`void`

##### getIterable()

```ts
getIterable(): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L181)

Get the AsyncIterable for consuming the stream.

###### Returns

`AsyncIterable`\<`T`\>

##### push()

```ts
push(chunk): Result<void, StreamError>;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L105)

Push a chunk to the stream.

###### Parameters

###### chunk

`T`

The chunk to push

###### Returns

[`Result`](core.md#result)\<`void`, [`StreamError`](#streamerror)\>

Result indicating success or backpressure

---

### StreamError

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:14](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L14)

Error thrown when a stream operation fails.

#### Extends

- [`NexusError`](core.md#nexuserror)

#### Constructors

##### Constructor

```ts
new StreamError(message, options?): StreamError;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L15)

###### Parameters

###### message

`string`

###### options?

###### cause?

`Error`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`StreamError`](#streamerror)

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

### UnifiedAdapterRegistry

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L123)

Adapters exports - Model adapters (Claude, OpenAI, Gemini, Ollama)
Split from index.ts for file size compliance (Issue #285)

#### Constructors

##### Constructor

```ts
new UnifiedAdapterRegistry(config?): UnifiedAdapterRegistry;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L135)

###### Parameters

###### config?

[`UnifiedRegistryConfig`](#unifiedregistryconfig)

###### Returns

[`UnifiedAdapterRegistry`](#unifiedadapterregistry)

#### Methods

##### dispose()

```ts
dispose(): void;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:318](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L318)

Dispose all cached adapters.

###### Returns

`void`

##### getAdapter()

```ts
getAdapter(category): IResilientAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L177)

Get adapter for a task category. Routing is re-resolved on every read
(#3185) so a post-startup overlay/registry update propagates without a
restart. Falls back to default adapter if category unknown.

###### Parameters

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
\| `"exploration"`

###### Returns

`IResilientAdapter`

##### getAdapterForCli()

```ts
getAdapterForCli(cli): IResilientAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L206)

Get adapter pinned to a specific CLI.
Creates and caches one IResilientAdapter per CLI.

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`IResilientAdapter`

##### getAdapterForModel()

```ts
getAdapterForModel(modelPreference): IResilientAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L231)

Get adapter for a model preference string (e.g., "claude-opus-4-6").
Resolves the model to its CLI via the canonical registry.
Falls back to default adapter if model not recognized.

###### Parameters

###### modelPreference

`string`

###### Returns

`IResilientAdapter`

##### getAdapterForRole()

```ts
getAdapterForRole(role): IResilientAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L267)

Get adapter for an expert role (e.g., "code_expert").
Uses ROLE_TO_TASK_CATEGORY mapping → task specialization → CLI.

###### Parameters

###### role

`string`

###### Returns

`IResilientAdapter`

##### getAdapterForTask()

```ts
getAdapterForTask(taskDescription): IResilientAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L190)

Get adapter for a free-text task description.
Detects category from keywords, falls back to default.

###### Parameters

###### taskDescription

`string`

###### Returns

`IResilientAdapter`

##### getDefault()

```ts
getDefault(): IResilientAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:276](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L276)

Get the default adapter (no CLI preference — auto-detection priority).

###### Returns

`IResilientAdapter`

##### getLogger()

```ts
getLogger(): ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L168)

Logger used by this registry. Exposed so singleton helpers can warn.

###### Returns

[`ILogger`](core.md#ilogger)

##### getRouting()

```ts
getRouting(category): TaskRoutingEntry | undefined;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L309)

Resolve the routing for a specific category.

Computed on every read (#3185) rather than cached at construction, so a
post-startup model-registry / overlay update (e.g. a default-model change
surfaced via `getDefaultModelForCli`) propagates to routing decisions
without a process restart. The matrix is ~10 categories — the per-read
resolution cost is negligible.

###### Parameters

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
\| `"exploration"`

###### Returns

[`TaskRoutingEntry`](#taskroutingentry) \| `undefined`

##### getSnapshot()

```ts
getSnapshot(): RegistrySnapshot;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:292](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L292)

Get snapshot of registry state for observability/debugging. Routing is
re-resolved on read (#3185) so the snapshot reflects the live registry.

###### Returns

[`RegistrySnapshot`](#registrysnapshot)

## Interfaces

### AdapterRateLimiterConfig

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L17)

Configuration options for the RateLimiter.

#### Properties

##### capacity

```ts
readonly capacity: number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L22)

Maximum number of tokens the bucket can hold.
This is also the initial token count.

##### refillInterval?

```ts
readonly optional refillInterval?: number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L33)

Interval in milliseconds for automatic refill checks.
Only used when waiting for tokens. Default: 100ms.

##### refillRate

```ts
readonly refillRate: number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L27)

Number of tokens added to the bucket per second.

---

### AdapterRegisterOptions

Defined in: [packages/nexus-agents/src/adapters/factory.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L48)

Options for registering an adapter provider.

#### Properties

##### allowOverwrite?

```ts
optional allowOverwrite?: boolean;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L50)

Whether to allow overwriting an existing provider

---

### BaseAdapterConfig

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L35)

Configuration options for BaseAdapter.

#### Properties

##### apiKey?

```ts
optional apiKey?: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L45)

API key for authentication (optional, may come from environment)

##### baseUrl?

```ts
optional baseUrl?: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L47)

Base URL for the API (optional, uses provider default)

##### capabilities

```ts
capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L41)

Capabilities this model supports

##### logger?

```ts
optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L43)

Optional custom logger

##### maxRetries?

```ts
optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L51)

Maximum number of retries for failed requests

##### modelId

```ts
modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L39)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

##### providerId

```ts
providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L37)

Provider identifier (e.g., 'anthropic', 'openai')

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/adapters/base-adapter.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/base-adapter.ts#L49)

Request timeout in milliseconds

---

### ClaudeAdapterConfig

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L41)

Configuration specific to ClaudeAdapter.

#### Properties

##### apiKey

```ts
apiKey: string;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L45)

API key for Anthropic API (required)

##### baseUrl?

```ts
optional baseUrl?: string;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L47)

Base URL for API (optional, defaults to Anthropic's API)

##### maxRetries?

```ts
optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L51)

Maximum retries for failed requests (optional)

##### modelId

```ts
modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L43)

Model ID (e.g., 'claude-sonnet-4' or full model identifier)

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L49)

Request timeout in milliseconds (optional)

---

### CreateStreamOptions

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L39)

Options for creating a stream.

#### Properties

##### maxBufferSize?

```ts
optional maxBufferSize?: number;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L43)

Maximum buffer size for backpressure (default: 100)

##### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L41)

AbortSignal for cancellation support

---

### GeminiAdapterConfig

Defined in: [packages/nexus-agents/src/adapters/gemini-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-types.ts#L47)

Configuration specific to GeminiAdapter.

#### Properties

##### apiKey

```ts
apiKey: string;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-types.ts#L51)

API key for Google AI API (required)

##### maxRetries?

```ts
optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-types.ts#L55)

Maximum retries for failed requests (optional)

##### modelId

```ts
modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-types.ts#L49)

Model ID (e.g., 'gemini-2.5-flash' or full model identifier)

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-types.ts#L53)

Request timeout in milliseconds (optional)

---

### ModelNotFoundFallbackOptions

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L46)

Adapters exports - Model adapters (Claude, OpenAI, Gemini, Ollama)
Split from index.ts for file size compliance (Issue #285)

#### Properties

##### adapterFactory?

```ts
readonly optional adapterFactory?: (modelId) => IModelAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L62)

Optional adapter factory used to build a new IModelAdapter for the
fallback model id. When provided, the wrapper retries through the
factory's adapter. When omitted, the wrapper logs + emits a
`MODEL_NOT_FOUND` error enriched with the suggested fallback id —
the caller (orchestrator / router) is responsible for re-routing.

###### Parameters

###### modelId

`string`

###### Returns

[`IModelAdapter`](core.md#imodeladapter)

##### cache?

```ts
readonly optional cache?: AvailableModelsCache;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L52)

Process-local cache of routable models. Refreshed on a 404. Defaults
to `getDefaultAvailableModelsCache()` — passing one explicitly is the
right move for tests and for multi-cache topologies.

##### onRetirement?

```ts
readonly optional onRetirement?: (info) => void;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L68)

Optional callback invoked when a retirement is detected. Use for
telemetry / sticky-state updates. Failures in the callback are
swallowed — the user's call is what matters.

###### Parameters

###### info

[`RetirementInfo`](#retirementinfo)

###### Returns

`void`

##### registry?

```ts
readonly optional registry?: ModelRegistry;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L54)

Registry used to resolve vendor/family from a model id. Defaults to global.

---

### OllamaAdapterConfig

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L61)

Configuration specific to OllamaAdapter.

#### Properties

##### baseUrl?

```ts
optional baseUrl?: string;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L63)

##### headers?

```ts
optional headers?: Record<string, string>;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L66)

##### maxRetries?

```ts
optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L65)

##### modelId

```ts
modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L62)

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L64)

---

### OpenAIAdapterConfig

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L64)

Configuration specific to OpenAIAdapter.

#### Properties

##### apiKey

```ts
apiKey: string;
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L68)

API key for OpenAI API (required)

##### baseUrl?

```ts
optional baseUrl?: string;
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L70)

Base URL for API (optional, defaults to OpenAI's API)

##### maxRetries?

```ts
optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L74)

Maximum retries for failed requests (optional)

##### modelId

```ts
modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L66)

Model ID (e.g., 'gpt-4o' or full model identifier)

##### organization?

```ts
optional organization?: string;
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L76)

Organization ID (optional)

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L72)

Request timeout in milliseconds (optional)

---

### RateLimitExceeded

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L39)

Error returned when rate limit is exceeded.

#### Properties

##### available

```ts
readonly available: number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L42)

##### requested

```ts
readonly requested: number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L41)

##### retryAfterMs

```ts
readonly retryAfterMs: number;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L43)

##### type

```ts
readonly type: "rate_limit_exceeded";
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L40)

---

### RegistrySnapshot

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L79)

Snapshot of registry state for observability.

#### Properties

##### availableModels

```ts
readonly availableModels: number;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L82)

##### cachedAdapters

```ts
readonly cachedAdapters: readonly ("claude" | "gemini" | "codex" | "opencode")[];
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L81)

##### taskRouting

```ts
readonly taskRouting: readonly TaskRoutingEntry[];
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L80)

---

### ResilientLike

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:358](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L358)

Minimal shape of `IResilientAdapter` — duplicated here as a local
type so that `model-not-found-fallback.ts` doesn't acquire a circular
import with `adapters/resilient-adapter-types.ts`. The shape matches
the resilient adapter's extension methods over `IModelAdapter`.

#### Extends

- [`IModelAdapter`](core.md#imodeladapter)

#### Properties

##### capabilities

```ts
readonly capabilities: readonly ModelCapability[];
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L171)

Capabilities this model supports

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`capabilities`](core.md#capabilities-1)

##### modelId

```ts
readonly modelId: string;
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L168)

Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`modelId`](core.md#modelid)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L165)

Provider identifier (e.g., 'anthropic', 'openai')

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`providerId`](core.md#providerid)

#### Methods

##### complete()

```ts
complete(request): Promise<Result<CompletionResponse, ModelError>>;
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L178)

Send a completion request.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompletionResponse`](core.md#completionresponse), [`ModelError`](core.md#modelerror)\>\>

Result with response or ModelError

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`complete`](core.md#complete)

##### countTokens()

```ts
countTokens(text): Promise<number>;
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L192)

Count tokens in text.

###### Parameters

###### text

`string`

Text to count tokens for

###### Returns

`Promise`\<`number`\>

Approximate token count

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`countTokens`](core.md#counttokens)

##### dispose()

```ts
dispose(): void;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:363](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L363)

###### Returns

`void`

##### getHealth()

```ts
getHealth(): unknown;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:359](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L359)

###### Returns

`unknown`

##### listModels()?

```ts
optional listModels(): Promise<readonly ModelMetadata[]>;
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L217)

(Optional, #2529) List models served by this adapter's endpoint.

Implemented by adapters facing OpenAI-compatible endpoints (the
upstream OpenAI API, OpenRouter, vLLM, custom gateways, etc.) —
usually wraps `GET /v1/models`. Result is the harness-side identity
resolver's most-trusted signal for "what model is actually being
served behind this adapter."

Subprocess-CLI adapters (claude / codex / gemini / opencode) leave
this undefined; identity for those falls back to `modelId` parse.

Implementations should cache the result for ~5 minutes — operators
shouldn't pay round-trip latency on every resolve. Failures
(network error, endpoint unsupported, auth missing) should throw
so the caller can fall back; do NOT silently return an empty list.

###### Returns

`Promise`\<readonly `ModelMetadata`[]\>

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`listModels`](core.md#listmodels)

##### onFailover()

```ts
onFailover(cb): () => void;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:362](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L362)

###### Parameters

###### cb

(`info`) => `void`

###### Returns

() => `void`

##### refresh()

```ts
refresh(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:360](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L360)

###### Returns

`Promise`\<`void`\>

##### setPreferredCli()

```ts
setPreferredCli(cli): void;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L361)

###### Parameters

###### cli

`unknown`

###### Returns

`void`

##### stream()

```ts
stream(request): AsyncIterable<StreamChunk>;
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L185)

Stream a completion request.

###### Parameters

###### request

[`CompletionRequest`](core.md#completionrequest)

The completion request

###### Returns

`AsyncIterable`\<[`StreamChunk`](core.md#streamchunk)\>

###### Yields

StreamChunk objects as they arrive

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`stream`](core.md#stream)

##### validateConfig()

```ts
validateConfig(): Result<void, ConfigError>;
```

Defined in: [packages/nexus-agents/src/core/types/model.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/types/model.ts#L198)

Validate adapter configuration.

###### Returns

[`Result`](core.md#result)\<`void`, [`ConfigError`](core.md#configerror)\>

Ok if valid, ConfigError if invalid

###### Inherited from

[`IModelAdapter`](core.md#imodeladapter).[`validateConfig`](core.md#validateconfig)

---

### RetirementInfo

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L71)

Adapters exports - Model adapters (Claude, OpenAI, Gemini, Ollama)
Split from index.ts for file size compliance (Issue #285)

#### Properties

##### errorMessage

```ts
readonly errorMessage: string;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L75)

##### fallbackModelId

```ts
readonly fallbackModelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L73)

##### providerId

```ts
readonly providerId: string;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L74)

##### retiredModelId

```ts
readonly retiredModelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L72)

---

### RetryAttemptInfo

Defined in: [packages/nexus-agents/src/adapters/retry.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L65)

Information about a retry attempt for logging/debugging.

#### Properties

##### attempt

```ts
readonly attempt: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L67)

Current attempt number (1-based)

##### delayMs

```ts
readonly delayMs: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L71)

Delay before next retry in milliseconds

##### error

```ts
readonly error: unknown;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L73)

The error that triggered the retry

##### maxAttempts

```ts
readonly maxAttempts: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L69)

Maximum attempts allowed

---

### RetryConfig

Defined in: [packages/nexus-agents/src/adapters/retry.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L40)

Configuration for retry behavior.

#### Properties

##### baseDelayMs

```ts
readonly baseDelayMs: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L44)

Base delay in milliseconds between retries. Default: 1000

##### jitterFactor

```ts
readonly jitterFactor: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L48)

Jitter factor (0-1) to randomize delay. Default: 0.1 (10%)

##### maxDelayMs

```ts
readonly maxDelayMs: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L46)

Maximum delay in milliseconds between retries. Default: 30000

##### maxRetries

```ts
readonly maxRetries: number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L42)

Maximum number of retry attempts. Default: 3

---

### SdkAdapterConfig

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L22)

Configuration for creating an AI SDK adapter.

#### Properties

##### apiKey?

```ts
optional apiKey?: string;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L28)

API key (falls back to environment variable)

##### baseUrl?

```ts
optional baseUrl?: string;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L34)

Base URL for OpenAI-compatible gateways. Required when
`providerId === 'custom-openai'`, ignored otherwise. Falls back to
the `NEXUS_CUSTOM_API_BASE_URL` environment variable.

##### maxRetries?

```ts
optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L38)

Maximum retries on transient failures

##### modelId

```ts
modelId: string;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L26)

Model to use (e.g., 'claude-sonnet-4-6', 'gpt-4o')

##### providerId

```ts
providerId: SdkProviderId;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L24)

Provider identifier

##### timeout?

```ts
optional timeout?: number;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L36)

Request timeout in milliseconds

---

### TaskRoutingEntry

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L71)

Summary of the pre-computed task routing table.

#### Properties

##### category

```ts
readonly category:
  | "planning"
  | "architecture"
  | "code_generation"
  | "code_review"
  | "research"
  | "security_review"
  | "documentation"
  | "testing"
  | "devops"
  | "exploration";
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L72)

##### primaryCli

```ts
readonly primaryCli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L73)

##### primaryModel

```ts
readonly primaryModel: string;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L75)

##### secondaryCli

```ts
readonly secondaryCli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L74)

---

### UnifiedRegistryConfig

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L43)

Configuration for the unified registry.

#### Properties

##### defaultCliTimeoutMs?

```ts
readonly optional defaultCliTimeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L47)

Default CLI timeout for subprocess calls (ms)

##### enableMissingModelFallback?

```ts
readonly optional enableMissingModelFallback?: boolean;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L61)

Auto-wrap every constructed adapter with `withModelNotFoundFallback`
(#2549). When enabled, the registry routes `complete()` through the
fallback path so a `MODEL_NOT_FOUND` error (typically from a vendor
404 / "model deprecated" message) refreshes the AvailableModelsCache
and retries through the closest same-family alternative.

Defaults to `false` — operators opt in by wiring up an
`AvailableModelsCache` via `setDefaultAvailableModelsCache()` and
setting this flag. Safe-on-empty: if no cache is provided or the
cache has no sources, the wrap is transparent (no retry happens,
original error surfaces).

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L45)

Logger instance

##### missingModelFallbackOptions?

```ts
readonly optional missingModelFallbackOptions?: ModelNotFoundFallbackOptions;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L67)

Optional override for the fallback decorator. When omitted, the
decorator uses `getDefaultAvailableModelsCache()` and
`getDefaultRegistry()`.

---

### WithRetryOptions

Defined in: [packages/nexus-agents/src/adapters/retry.ts:291](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L291)

Options for withRetry function.

#### Properties

##### config?

```ts
readonly optional config?: Partial<RetryConfig>;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L293)

Retry configuration. Defaults to DEFAULT_RETRY_CONFIG.

##### isRetryable?

```ts
readonly optional isRetryable?: (error) => boolean;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:295](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L295)

Custom predicate to determine if an error is retryable. Defaults to isRetryableError.

###### Parameters

###### error

`unknown`

###### Returns

`boolean`

##### onRetry?

```ts
readonly optional onRetry?: (info) => void;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L297)

Callback invoked before each retry attempt. Useful for logging.

###### Parameters

###### info

[`RetryAttemptInfo`](#retryattemptinfo)

###### Returns

`void`

## Type Aliases

### AdapterConfig

```ts
type AdapterConfig = z.infer<typeof AdapterConfigSchema>;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L34)

Adapter configuration type inferred from schema.

---

### AdapterCreator

```ts
type AdapterCreator = (config) => IModelAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L43)

Factory function type for creating adapters.
Each provider registers a creator function that produces adapters.

#### Parameters

##### config

[`AdapterConfig`](#adapterconfig)

The validated adapter configuration

#### Returns

[`IModelAdapter`](core.md#imodeladapter)

A configured model adapter instance

---

### SdkProviderId

```ts
type SdkProviderId = 'anthropic' | 'openai' | 'google' | 'custom-openai';
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L17)

Supported AI SDK provider identifiers.

`custom-openai` is for OpenAI-compatible gateways (multi-vendor proxies,
self-hosted LLM servers, corporate model gateways) — uses the same
@ai-sdk/openai package but with a configurable `baseURL`.

---

### StreamState

```ts
type StreamState = 'idle' | 'streaming' | 'paused' | 'cancelled' | 'completed' | 'error';
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L34)

State of a stream controller.

## Variables

### AdapterConfigSchema

```ts
const AdapterConfigSchema: ZodObject<
  {
    apiKey: ZodOptional<ZodString>;
    baseUrl: ZodOptional<ZodURL>;
    maxRetries: ZodOptional<ZodNumber>;
    modelId: ZodString;
    providerId: ZodString;
    timeout: ZodOptional<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/adapters/factory.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/factory.ts#L16)

Zod schema for adapter configuration.
Validates configuration before creating adapters.

---

### CLAUDE_MODEL_ALIASES

```ts
const CLAUDE_MODEL_ALIASES: Record<string, string>;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L30)

Legacy version-suffix aliases mapped to the current registry cliModelName.

Values come from `CLAUDE_MODELS` so they stay in sync with the canonical
registry. Add legacy entries here, never the version strings themselves.

---

### CLAUDE_MODELS

```ts
const CLAUDE_MODELS: {
  HAIKU_4: string;
  OPUS_4: string;
  SONNET_4: string;
};
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter-types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter-types.ts#L18)

Supported Claude model identifiers.

Derived from `config/in-tree-data.ts` via `getCliModelName()` (which reads
the ModelRegistry — see `config/model-registry.ts`). Do not hardcode
model-version strings here; update the registry.

#### Type Declaration

##### HAIKU_4

```ts
readonly HAIKU_4: string;
```

##### OPUS_4

```ts
readonly OPUS_4: string;
```

##### SONNET_4

```ts
readonly SONNET_4: string;
```

---

### DEFAULT_COLLECT_STREAM_MAX_CHUNKS

```ts
const DEFAULT_COLLECT_STREAM_MAX_CHUNKS: 100000 = 100_000;
```

Defined in: [packages/nexus-agents/src/adapters/streaming.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming.ts#L32)

Default cap on collected chunks — prevents unbounded memory growth when
callers forget to pass `maxChunks`. Callers that genuinely need no cap
must opt in explicitly with `{ maxChunks: Infinity }`. (#1913 Class F)

---

### DEFAULT_RETRY_CONFIG

```ts
const DEFAULT_RETRY_CONFIG: Readonly<RetryConfig>;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L55)

Default retry configuration.
Derived from canonical source: config/defaults.ts RETRY_DEFAULTS

---

### GEMINI_MODEL_ALIASES

```ts
const GEMINI_MODEL_ALIASES: Record<string, string>;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-types.ts#L38)

Legacy aliases for Gemini models not in the canonical registry.

2.5 / 3.x aliases are NOT in this map — they resolve via the canonical
registry (cliModelName / cliAlias / aliases[]). See `resolveModelId`.
Only generations Google has deprecated upstream live here, kept for
backward compat with users who hardcoded these strings.

---

### GEMINI_MODELS

```ts
const GEMINI_MODELS: {
  FLASH_1_5: 'gemini-1.5-flash';
  FLASH_2_0: 'gemini-2.0-flash';
  FLASH_2_5: string;
  PRO_1_5: 'gemini-1.5-pro';
  PRO_2_5: string;
};
```

Defined in: [packages/nexus-agents/src/adapters/gemini-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-types.ts#L21)

Supported Gemini model identifiers.

Current models (2.5+ and 3.x) derive from `config/in-tree-data.ts`
(single source of truth — #2200 Child 2). Legacy 1.5 / 2.0 strings remain
as constants for backward compat with external consumers; they are not in
the canonical registry because Google deprecated those generations
upstream in 2025.

#### Type Declaration

##### FLASH_1_5

```ts
readonly FLASH_1_5: "gemini-1.5-flash" = 'gemini-1.5-flash';
```

##### FLASH_2_0

```ts
readonly FLASH_2_0: "gemini-2.0-flash" = 'gemini-2.0-flash';
```

##### FLASH_2_5

```ts
readonly FLASH_2_5: string;
```

##### PRO_1_5

```ts
readonly PRO_1_5: "gemini-1.5-pro" = 'gemini-1.5-pro';
```

##### PRO_2_5

```ts
readonly PRO_2_5: string;
```

---

### OLLAMA_MODELS

```ts
const OLLAMA_MODELS: {
  CODELLAMA: 'codellama';
  CODELLAMA_34B: 'codellama:34b';
  DEEPSEEK_CODER: 'deepseek-coder';
  GEMMA2: 'gemma2';
  LLAMA3_1_8B: 'llama3.1:8b';
  LLAMA3_2_3B: 'llama3.2:3b';
  LLAMA3_70B: 'llama3:70b';
  LLAMA3_8B: 'llama3:8b';
  MISTRAL: 'mistral';
  MISTRAL_NEMO: 'mistral-nemo';
  PHI3: 'phi3';
  QWEN2_5_CODER: 'qwen2.5-coder';
};
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L42)

Popular Ollama model identifiers.

#### Type Declaration

##### CODELLAMA

```ts
readonly CODELLAMA: "codellama" = 'codellama';
```

##### CODELLAMA_34B

```ts
readonly CODELLAMA_34B: "codellama:34b" = 'codellama:34b';
```

##### DEEPSEEK_CODER

```ts
readonly DEEPSEEK_CODER: "deepseek-coder" = 'deepseek-coder';
```

##### GEMMA2

```ts
readonly GEMMA2: "gemma2" = 'gemma2';
```

##### LLAMA3_1_8B

```ts
readonly LLAMA3_1_8B: "llama3.1:8b" = 'llama3.1:8b';
```

##### LLAMA3_2_3B

```ts
readonly LLAMA3_2_3B: "llama3.2:3b" = 'llama3.2:3b';
```

##### LLAMA3_70B

```ts
readonly LLAMA3_70B: "llama3:70b" = 'llama3:70b';
```

##### LLAMA3_8B

```ts
readonly LLAMA3_8B: "llama3:8b" = 'llama3:8b';
```

##### MISTRAL

```ts
readonly MISTRAL: "mistral" = 'mistral';
```

##### MISTRAL_NEMO

```ts
readonly MISTRAL_NEMO: "mistral-nemo" = 'mistral-nemo';
```

##### PHI3

```ts
readonly PHI3: "phi3" = 'phi3';
```

##### QWEN2_5_CODER

```ts
readonly QWEN2_5_CODER: "qwen2.5-coder" = 'qwen2.5-coder';
```

---

### OPENAI_MODEL_ALIASES

```ts
const OPENAI_MODEL_ALIASES: Record<string, string>;
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L53)

User-friendly OpenAI aliases → dated model identifiers.

Identity-only mappings (e.g., `'gpt-5.2-pro' → 'gpt-5.2-pro'`) were
removed in #2200 Child 3 — `resolveModelId` already passes unknown ids
through unchanged via `?? modelId`. Only entries that translate a
shorthand into a dated version remain.

---

### OPENAI_MODELS

```ts
const OPENAI_MODELS: {
  GPT_35_TURBO: 'gpt-3.5-turbo-0125';
  GPT_4_TURBO: 'gpt-4-turbo-2024-04-09';
  GPT_4O: 'gpt-4o-2024-11-20';
  GPT_4O_MINI: 'gpt-4o-mini-2024-07-18';
  GPT_5_2: 'gpt-5.2';
  GPT_5_2_CODEX: string;
  GPT_5_2_INSTANT: 'gpt-5.2-chat-latest';
  GPT_5_2_PRO: 'gpt-5.2-pro';
};
```

Defined in: [packages/nexus-agents/src/adapters/openai-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-types.ts#L34)

Supported OpenAI direct-API model identifiers (OpenAI's own dated names).

GPT_5_2_CODEX derives from the canonical registry (codex-5.2's cliModelName)
because it overlaps with the Codex CLI; the rest are pure-API constants.

#### Type Declaration

##### GPT_35_TURBO

```ts
readonly GPT_35_TURBO: "gpt-3.5-turbo-0125" = 'gpt-3.5-turbo-0125';
```

##### GPT_4_TURBO

```ts
readonly GPT_4_TURBO: "gpt-4-turbo-2024-04-09" = 'gpt-4-turbo-2024-04-09';
```

##### GPT_4O

```ts
readonly GPT_4O: "gpt-4o-2024-11-20" = 'gpt-4o-2024-11-20';
```

##### GPT_4O_MINI

```ts
readonly GPT_4O_MINI: "gpt-4o-mini-2024-07-18" = 'gpt-4o-mini-2024-07-18';
```

##### GPT_5_2

```ts
readonly GPT_5_2: "gpt-5.2" = 'gpt-5.2';
```

##### GPT_5_2_CODEX

```ts
readonly GPT_5_2_CODEX: string;
```

##### GPT_5_2_INSTANT

```ts
readonly GPT_5_2_INSTANT: "gpt-5.2-chat-latest" = 'gpt-5.2-chat-latest';
```

##### GPT_5_2_PRO

```ts
readonly GPT_5_2_PRO: "gpt-5.2-pro" = 'gpt-5.2-pro';
```

---

### SDK_PROVIDER_ENV_KEYS

```ts
const SDK_PROVIDER_ENV_KEYS: Record<SdkProviderId, string>;
```

Defined in: [packages/nexus-agents/src/adapters/sdk/types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/sdk/types.ts#L44)

Maps provider IDs to their environment variable names.

## Functions

### bufferStream()

```ts
function bufferStream<T>(stream, size, options?): AsyncIterable<T[]>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators.ts#L237)

Buffers stream chunks into groups of a specified size.

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### size

`number`

Buffer size

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`[]\>

Stream of chunk arrays

---

### calculateDelay()

```ts
function calculateDelay(attempt, config): number;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L114)

Calculates delay with exponential backoff and jitter.

Uses full jitter strategy: delay = random(0, min(maxDelay, baseDelay \* 2^attempt))

#### Parameters

##### attempt

`number`

Current attempt number (0-based)

##### config

[`RetryConfig`](#retryconfig)

Retry configuration

#### Returns

`number`

Delay in milliseconds

---

### collectStream()

```ts
function collectStream<T>(stream, options?): Promise<Result<T[], StreamError>>;
```

Defined in: [packages/nexus-agents/src/adapters/streaming.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming.ts#L44)

Collects all chunks from a stream into an array.

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The stream to collect

##### options?

Options including optional AbortSignal.
`maxChunks` defaults to [DEFAULT_COLLECT_STREAM_MAX_CHUNKS](#default_collect_stream_max_chunks) to
prevent unbounded memory growth on forgotten limits. Pass
`Infinity` explicitly for truly unbounded collection.

###### maxChunks?

`number`

###### signal?

`AbortSignal`

#### Returns

`Promise`\<[`Result`](core.md#result)\<`T`[], [`StreamError`](#streamerror)\>\>

Result containing collected chunks or error

---

### concatStreams()

```ts
function concatStreams<T>(streams, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators-helpers.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators-helpers.ts#L76)

Concatenates multiple streams sequentially.

#### Type Parameters

##### T

`T`

#### Parameters

##### streams

`AsyncIterable`\<`T`, `any`, `any`\>[]

The streams to concatenate

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Concatenated stream

---

### createClaudeAdapter()

```ts
function createClaudeAdapter(config): ClaudeAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/claude-adapter.ts:438](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/claude-adapter.ts#L438)

Creates a ClaudeAdapter with the specified configuration.
Factory function for cleaner API.

#### Parameters

##### config

[`ClaudeAdapterConfig`](#claudeadapterconfig-1)

Claude adapter configuration

#### Returns

[`ClaudeAdapter`](#claudeadapter)

A configured ClaudeAdapter instance

#### Example

```typescript
const adapter = createClaudeAdapter({
  modelId: 'claude-sonnet-4',
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
```

---

### createGeminiAdapter()

```ts
function createGeminiAdapter(config): GeminiAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/gemini-adapter.ts:435](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/gemini-adapter.ts#L435)

Creates a GeminiAdapter with the specified configuration.
Factory function for cleaner API.

#### Parameters

##### config

[`GeminiAdapterConfig`](#geminiadapterconfig-1)

Gemini adapter configuration

#### Returns

[`GeminiAdapter`](#geminiadapter)

A configured GeminiAdapter instance

#### Example

```typescript
const adapter = createGeminiAdapter({
  modelId: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});
```

---

### createOllamaAdapter()

```ts
function createOllamaAdapter(config): OllamaAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/ollama-adapter.ts:315](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/ollama-adapter.ts#L315)

Creates an OllamaAdapter with the specified configuration.

#### Parameters

##### config

[`OllamaAdapterConfig`](#ollamaadapterconfig-1)

#### Returns

[`OllamaAdapter`](#ollamaadapter)

---

### createOpenAIAdapter()

```ts
function createOpenAIAdapter(config): OpenAIAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/openai-adapter.ts:443](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/openai-adapter.ts#L443)

Creates an OpenAIAdapter with the specified configuration.
Factory function for cleaner API.

#### Parameters

##### config

[`OpenAIAdapterConfig`](#openaiadapterconfig-1)

OpenAI adapter configuration

#### Returns

[`OpenAIAdapter`](#openaiadapter)

A configured OpenAIAdapter instance

#### Example

```typescript
const adapter = createOpenAIAdapter({
  modelId: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY!,
});
```

---

### createRateLimiter()

```ts
function createRateLimiter(config): AdapterRateLimiter;
```

Defined in: [packages/nexus-agents/src/adapters/rate-limiter.ts:327](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/rate-limiter.ts#L327)

Creates a rate limiter with the specified configuration.
Factory function for cleaner API.

#### Parameters

##### config

[`AdapterRateLimiterConfig`](#adapterratelimiterconfig)

Rate limiter configuration

#### Returns

[`AdapterRateLimiter`](#adapterratelimiter)

A new RateLimiter instance

#### Example

```typescript
const limiter = createRateLimiter({
  capacity: 100,
  refillRate: 10,
});
```

---

### createStream()

```ts
function createStream<T>(options?): [StreamController<T>, AsyncIterable<T, any, any>];
```

Defined in: [packages/nexus-agents/src/adapters/streaming-types.ts:255](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/streaming-types.ts#L255)

Creates a controllable stream.

#### Type Parameters

##### T

`T`

#### Parameters

##### options?

[`CreateStreamOptions`](#createstreamoptions) = `{}`

Stream creation options

#### Returns

\[[`StreamController`](#streamcontroller)\<`T`\>, `AsyncIterable`\<`T`, `any`, `any`\>\]

Tuple of [controller, iterable]

---

### createUnifiedRegistry()

```ts
function createUnifiedRegistry(config?): UnifiedAdapterRegistry;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:386](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L386)

Create a new UnifiedAdapterRegistry instance.
For most uses, prefer `getGlobalRegistry()` instead.

#### Parameters

##### config?

[`UnifiedRegistryConfig`](#unifiedregistryconfig)

#### Returns

[`UnifiedAdapterRegistry`](#unifiedadapterregistry)

---

### filterStream()

```ts
function filterStream<T>(stream, predicate, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators.ts#L149)

Filters stream chunks based on a predicate.

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### predicate

(`chunk`, `index`) => `boolean` \| `Promise`\<`boolean`\>

Function that returns true to keep the chunk

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Filtered stream

---

### fromArray()

```ts
function fromArray<T>(values, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators-helpers.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators-helpers.ts#L95)

Creates a stream from an array of values.

#### Type Parameters

##### T

`T`

#### Parameters

##### values

`T`[]

The values to stream

##### options?

Options including optional delay between chunks

###### delayMs?

`number`

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Stream of values

---

### getGlobalRegistry()

```ts
function getGlobalRegistry(config?): UnifiedAdapterRegistry;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:398](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L398)

Get the global singleton registry.
Creates it on first access with default config.

If the singleton already exists and a non-empty config is supplied, the
config is ignored — callers get the pre-existing instance. A warning is
emitted so this asymmetry is not silent.

#### Parameters

##### config?

[`UnifiedRegistryConfig`](#unifiedregistryconfig)

#### Returns

[`UnifiedAdapterRegistry`](#unifiedadapterregistry)

---

### isRetryableError()

```ts
function isRetryableError(error): boolean;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L229)

Determines if an error is retryable based on its type, status code, or message.

Retryable errors include:

- HTTP 429 (Too Many Requests)
- HTTP 5xx (Server Errors)
- HTTP 408 (Request Timeout)
- Network errors (connection reset, timeout, etc.)
- NexusError with rate limit or timeout codes

Non-retryable errors include:

- HTTP 400, 401, 403, 404 (Client Errors)
- Validation errors
- Authentication errors

#### Parameters

##### error

`unknown`

The error to check

#### Returns

`boolean`

True if the error is retryable

---

### mergeStreams()

```ts
function mergeStreams<T>(streams, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators.ts#L57)

Merges multiple streams into a single stream.
Chunks are yielded as they arrive from any source.

#### Type Parameters

##### T

`T`

#### Parameters

##### streams

`AsyncIterable`\<`T`, `any`, `any`\>[]

The streams to merge

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Merged stream

---

### reduceStream()

```ts
function reduceStream<T, U>(
  stream,
  reducer,
  initialValue,
  options?
): Promise<Result<U, StreamError>>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators-helpers.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators-helpers.ts#L145)

Reduces a stream to a single value.

#### Type Parameters

##### T

`T`

##### U

`U`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### reducer

(`accumulator`, `chunk`, `index`) => `U` \| `Promise`\<`U`\>

Reducer function

##### initialValue

`U`

Initial accumulator value

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`Promise`\<[`Result`](core.md#result)\<`U`, [`StreamError`](#streamerror)\>\>

Result containing the final value or error

---

### resetGlobalRegistry()

```ts
function resetGlobalRegistry(): void;
```

Defined in: [packages/nexus-agents/src/adapters/unified-registry.ts:416](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/unified-registry.ts#L416)

Reset the global registry (for testing).

#### Returns

`void`

---

### skip()

```ts
function skip<T>(stream, count, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators-helpers.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators-helpers.ts#L49)

Skips the first N chunks from a stream.

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### count

`number`

Number of chunks to skip

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Stream with first N chunks skipped

---

### sleep()

```ts
function sleep(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/utils/async-utils.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/utils/async-utils.ts#L30)

Creates a promise that resolves after the specified delay.
Alias: `delay` (both names are exported for compatibility)

#### Parameters

##### ms

`number`

Delay in milliseconds

#### Returns

`Promise`\<`void`\>

Promise that resolves after the delay

#### Example

```typescript
await sleep(1000); // Wait 1 second
await delay(500); // Wait 500ms (alias)
```

---

### take()

```ts
function take<T>(stream, count, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators-helpers.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators-helpers.ts#L17)

Takes the first N chunks from a stream.

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### count

`number`

Number of chunks to take

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Stream of first N chunks

---

### takeUntil()

```ts
function takeUntil<T>(stream, predicate, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators.ts#L116)

Takes chunks from a stream until a predicate returns true.

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### predicate

(`chunk`, `index`) => `boolean` \| `Promise`\<`boolean`\>

Function that returns true to stop taking

##### options?

Options including whether to include the matching chunk

###### inclusive?

`boolean`

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Stream of chunks up to (and optionally including) the match

---

### tapStream()

```ts
function tapStream<T>(stream, fn, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators-helpers.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators-helpers.ts#L119)

Taps into a stream without modifying it (for side effects like logging).

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### fn

(`chunk`, `index`) => `void` \| `Promise`\<`void`\>

Side effect function called for each chunk

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Original stream unchanged

---

### transformStream()

```ts
function transformStream<T, U>(stream, fn, options?): AsyncIterable<U>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators.ts#L33)

Transforms stream chunks using a mapping function.

#### Type Parameters

##### T

`T`

##### U

`U`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### fn

(`chunk`, `index`) => `U` \| `Promise`\<`U`\>

Transformation function

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`U`\>

Transformed stream

---

### withModelNotFoundFallback()

```ts
function withModelNotFoundFallback(inner, options?): IModelAdapter;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L99)

Decorate an IModelAdapter with retire-and-retry. Behaviour:

1.  Forward `complete(request)` to the inner adapter.
2.  On `MODEL_NOT_FOUND`: refresh the cache, find the closest
    same-family alternative, retry once with `request.model =
<fallback>`. Original error is returned if no fallback found.
3.  The wrapper returns the SECOND error if the retry also fails.
4.  `stream()` retries via restart-from-zero (#2550): when the inner
    stream throws a `MODEL_NOT_FOUND` ModelError, the wrapper closes
    the failed stream, picks a same-family fallback via the cache +
    registry, builds a new adapter through `adapterFactory`, and
    yields chunks from the fallback stream. The consumer sees a clean
    second stream — partial content already delivered by the first
    stream is NOT replayed; that's a known trade-off (the alternative
    resume-with-reconciliation strategy is heavier and only useful
    for tool-use loops; not implemented per the deliberate scoping in
    #2550). Without `adapterFactory`, the original throw propagates
    unchanged.
5.  `countTokens`, `validateConfig`, `listModels` are passthrough.

#### Parameters

##### inner

[`IModelAdapter`](core.md#imodeladapter)

##### options?

[`ModelNotFoundFallbackOptions`](#modelnotfoundfallbackoptions) = `{}`

#### Returns

[`IModelAdapter`](core.md#imodeladapter)

---

### withRetry()

```ts
function withRetry<T>(operation, options?): Promise<Result<T, RetryExhaustedError>>;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L322)

Executes an operation with retry logic using exponential backoff.

#### Type Parameters

##### T

`T`

The return type of the operation

#### Parameters

##### operation

() => `Promise`\<`T`\>

The async operation to execute

##### options?

[`WithRetryOptions`](#withretryoptions) = `{}`

Retry options (config, isRetryable predicate, onRetry callback)

#### Returns

`Promise`\<[`Result`](core.md#result)\<`T`, [`RetryExhaustedError`](#retryexhaustederror)\>\>

A Result containing either the operation result or a RetryExhaustedError

#### Example

```typescript
const result = await withRetry(() => fetchData('/api/data'), { config: { maxRetries: 5 } });

if (result.ok) {
  console.log(result.value);
} else {
  console.error('All retries failed:', result.error);
}
```

---

### withRetryWrapper()

```ts
function withRetryWrapper<TArgs, TReturn>(
  fn,
  options?
): (...args) => Promise<Result<TReturn, RetryExhaustedError>>;
```

Defined in: [packages/nexus-agents/src/adapters/retry.ts:388](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/retry.ts#L388)

Wraps an async function with retry logic.

#### Type Parameters

##### TArgs

`TArgs` _extends_ `unknown`[]

The argument types of the function

##### TReturn

`TReturn`

The return type of the function

#### Parameters

##### fn

(...`args`) => `Promise`\<`TReturn`\>

The function to wrap

##### options?

[`WithRetryOptions`](#withretryoptions) = `{}`

Retry options

#### Returns

A wrapped function that will retry on failure

(...`args`) => `Promise`\<[`Result`](core.md#result)\<`TReturn`, [`RetryExhaustedError`](#retryexhaustederror)\>\>

#### Example

```typescript
const fetchWithRetry = withRetryWrapper(async (url: string) => fetch(url), {
  config: { maxRetries: 3 },
});

const result = await fetchWithRetry('https://api.example.com/data');
```

---

### withTimeout()

```ts
function withTimeout<T>(stream, timeoutMs, options?): AsyncIterable<T>;
```

Defined in: [packages/nexus-agents/src/adapters/stream-operators.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/stream-operators.ts#L177)

Adds a timeout to a stream. If no chunk is received within the timeout,
the stream throws a TimeoutError.

#### Type Parameters

##### T

`T`

#### Parameters

##### stream

`AsyncIterable`\<`T`\>

The source stream

##### timeoutMs

`number`

Timeout in milliseconds

##### options?

Options including optional AbortSignal

###### signal?

`AbortSignal`

#### Returns

`AsyncIterable`\<`T`\>

Stream with timeout applied

---

### wrapResilientWithFallback()

```ts
function wrapResilientWithFallback<T>(inner, options?): T;
```

Defined in: [packages/nexus-agents/src/adapters/model-not-found-fallback.ts:371](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/adapters/model-not-found-fallback.ts#L371)

Wrap an `IResilientAdapter` (or anything that satisfies `ResilientLike`)
so its `complete()` path retries on MODEL_NOT_FOUND while its
health/lifecycle methods continue to work unchanged.

#### Type Parameters

##### T

`T` _extends_ [`ResilientLike`](#resilientlike)

#### Parameters

##### inner

`T`

##### options?

[`ModelNotFoundFallbackOptions`](#modelnotfoundfallbackoptions) = `{}`

#### Returns

`T`
