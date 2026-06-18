---
title: 'API: cli-adapters'
description: Generated API reference for cli-adapters.
tier: 2
---

# cli-adapters

## Classes

### `abstract` BaseCliAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L72)

Abstract base class for CLI adapters.
Provides common functionality for version checking, health, and error handling.

#### Extended by

- [`SubprocessCliAdapter`](#abstract-subprocesscliadapter)
- [`CodexMcpAdapter`](#codexmcpadapter)

#### Implements

- [`ICliAdapter`](#icliadapter)

#### Constructors

##### Constructor

```ts
new BaseCliAdapter(logger?): BaseCliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L82)

###### Parameters

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`BaseCliAdapter`](#abstract-basecliadapter)

#### Properties

##### cachedVersion?

```ts
protected optional cachedVersion?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L80)

##### capacityTracker

```ts
protected capacityTracker: CapacityTracker | null = null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L77)

##### initialized

```ts
protected initialized: boolean = false;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L78)

##### lastHealthCheck?

```ts
protected optional lastHealthCheck?: HealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L79)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L76)

##### name

```ts
abstract readonly name: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L73)

CLI name

###### Implementation of

[`ICliAdapter`](#icliadapter).[`name`](#name-13)

##### transport

```ts
abstract readonly transport: CliTransport;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L74)

Transport type

###### Implementation of

[`ICliAdapter`](#icliadapter).[`transport`](#transport-8)

#### Accessors

##### capabilities

###### Get Signature

```ts
get capabilities(): CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L97)

Gets the capability profile for this CLI.

###### Returns

[`CliCapabilityProfile`](#clicapabilityprofile)

Capability profile

###### Implementation of

[`ICliAdapter`](#icliadapter).[`capabilities`](#capabilities-7)

#### Methods

##### checkVersionCompatibility()

```ts
protected checkVersionCompatibility(version): VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L314)

Checks version compatibility.

###### Parameters

###### version

`string`

###### Returns

[`VersionStatus`](#versionstatus-2)

##### createError()

```ts
protected createError(
   code,
   message,
   cause?): CliError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L361)

Creates a CLI error.

###### Parameters

###### code

[`CliErrorCode`](#clierrorcode-1)

###### message

`string`

###### cause?

`Error`

###### Returns

[`CliError`](#clierror)

##### delay()

```ts
protected delay(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L391)

Delays for the specified milliseconds.

###### Parameters

###### ms

`number`

###### Returns

`Promise`\<`void`\>

##### dispose()

```ts
abstract dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:126](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L126)

Abstract method for cleanup.
Implemented by concrete adapters.

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`ICliAdapter`](#icliadapter).[`dispose`](#dispose-7)

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L136)

Executes a task with error handling and retries.

Timeout priority (highest to lowest):

1. options.timeoutMs - explicit execution option
2. task.timeoutMs - task-level setting
3. getTimeoutForTaskAuto() - computed from task complexity and CLI

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Implementation of

[`ICliAdapter`](#icliadapter).[`execute`](#execute-9)

##### executeTask()

```ts
abstract executeTask(task, options): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L105)

Abstract method for executing a task.
Implemented by concrete adapters.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options

`ResolvedExecutionOptions`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L268)

Gets current capacity status based on tracked usage.
Uses usage-based tracking since CLI subprocess execution
doesn't expose HTTP rate limit headers.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

###### See

Issue #456 - Real API rate limit tracking

###### Implementation of

[`ICliAdapter`](#icliadapter).[`getCapacity`](#getcapacity-7)

##### getModelInfo()

```ts
abstract getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L114)

Abstract method for getting model info.
Implemented by concrete adapters.

###### Returns

[`CliModelInfo`](#climodelinfo)

###### Implementation of

[`ICliAdapter`](#icliadapter).[`getModelInfo`](#getmodelinfo-7)

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L242)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

###### Implementation of

[`ICliAdapter`](#icliadapter).[`getVersion`](#getversion-7)

##### getVersionMessage()

```ts
protected getVersionMessage(status, version): string | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L343)

Gets version status message.

###### Parameters

###### status

[`VersionStatus`](#versionstatus-2)

###### version

`string`

###### Returns

`string` \| `undefined`

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L212)

Performs a health check.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

###### Implementation of

[`ICliAdapter`](#icliadapter).[`healthCheck`](#healthcheck-7)

##### initCapacityTracker()

```ts
protected initCapacityTracker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L90)

Initializes the capacity tracker.
Called by subclasses after name is set.

###### Returns

`void`

##### initialize()

```ts
abstract initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L120)

Abstract method for initialization.
Implemented by concrete adapters.

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`ICliAdapter`](#icliadapter).[`initialize`](#initialize-7)

##### normalizeResponse()

```ts
protected normalizeResponse(
   text,
   usage?,
   extra?): CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L376)

Normalizes CLI response to common format.

###### Parameters

###### text

`string`

###### usage?

[`CliTokenUsage`](#clitokenusage)

###### extra?

`Partial`\<[`CliResponse`](#cliresponse)\>

###### Returns

[`CliResponse`](#cliresponse)

##### parseVersion()

```ts
protected parseVersion(output): string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L302)

Parses version from CLI output.

###### Parameters

###### output

`string`

###### Returns

`string`

##### recordUsage()

```ts
protected recordUsage(response): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L293)

Records usage from a response for capacity tracking.

###### Parameters

###### response

[`CliResponse`](#cliresponse)

###### Returns

`void`

##### shouldOuterRetry()

```ts
protected shouldOuterRetry(opts): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L170)

Whether the shared outer retry loop ([executeCliRetryLoop](#executecliretryloop)) is
allowed to retry this adapter's failures. The base adapter honors the
caller's `allowRetry`. Subprocess adapters override this to suppress
the outer loop when their own transient-retry layer is active, so the
two layers do not nest into multiplied spawns (#2824).

###### Parameters

###### opts

`ResolvedExecutionOptions`

###### Returns

`boolean`

---

### ClaudeCliAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts#L66)

Claude CLI adapter using subprocess transport.
Executes: claude -p --output-format json "<task>"

#### Extends

- [`SubprocessCliAdapter`](#abstract-subprocesscliadapter)

#### Constructors

##### Constructor

```ts
new ClaudeCliAdapter(options?): ClaudeCliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts#L72)

###### Parameters

###### options?

[`BaseAdapterOptions`](#baseadapteroptions)

###### Returns

[`ClaudeCliAdapter`](#claudecliadapter)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`constructor`](#constructor-17)

#### Properties

##### cachedVersion?

```ts
protected optional cachedVersion?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L80)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`cachedVersion`](#cachedversion-6)

##### capacityTracker

```ts
protected capacityTracker: CapacityTracker | null = null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L77)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capacityTracker`](#capacitytracker-6)

##### initialized

```ts
protected initialized: boolean = false;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L78)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialized`](#initialized-6)

##### lastHealthCheck?

```ts
protected optional lastHealthCheck?: HealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L79)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`lastHealthCheck`](#lasthealthcheck-6)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L76)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`logger`](#logger-6)

##### name

```ts
readonly name: "claude" | "gemini" | "codex" | "opencode" = 'claude';
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts#L67)

CLI name

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`name`](#name-11)

##### parser

```ts
protected readonly parser: ICliResponseParser;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts#L68)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parser`](#parser-4)

##### transientRetry

```ts
protected readonly transientRetry: TransientRetryConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L253)

Transient-error retry config. Override in subclass to enable.

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transientRetry`](#transientretry-4)

##### transport

```ts
readonly transport: CliTransport = 'subprocess';
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:248](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L248)

Transport type

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transport`](#transport-6)

#### Accessors

##### capabilities

###### Get Signature

```ts
get capabilities(): CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L97)

Gets the capability profile for this CLI.

###### Returns

[`CliCapabilityProfile`](#clicapabilityprofile)

Capability profile

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capabilities`](#capabilities-6)

#### Methods

##### checkVersionCompatibility()

```ts
protected checkVersionCompatibility(version): VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L314)

Checks version compatibility.

###### Parameters

###### version

`string`

###### Returns

[`VersionStatus`](#versionstatus-2)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`checkVersionCompatibility`](#checkversioncompatibility-6)

##### createError()

```ts
protected createError(
   code,
   message,
   cause?): CliError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L361)

Creates a CLI error.

###### Parameters

###### code

[`CliErrorCode`](#clierrorcode-1)

###### message

`string`

###### cause?

`Error`

###### Returns

[`CliError`](#clierror)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`createError`](#createerror-6)

##### delay()

```ts
protected delay(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L391)

Delays for the specified milliseconds.

###### Parameters

###### ms

`number`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`delay`](#delay-6)

##### dispose()

```ts
dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:769](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L769)

Disposes the adapter (no-op for subprocess).

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`dispose`](#dispose-6)

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L136)

Executes a task with error handling and retries.

Timeout priority (highest to lowest):

1. options.timeoutMs - explicit execution option
2. task.timeoutMs - task-level setting
3. getTimeoutForTaskAuto() - computed from task complexity and CLI

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`execute`](#execute-7)

##### executeTask()

```ts
executeTask(task, options): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L322)

Executes a task via subprocess, with optional transient-error retry.
When `transientRetry.enabled` is true, transient errors (timeout,
rate_limit, connection, parse) are retried with exponential backoff
(500ms, 1000ms). Parse errors get max 1 retry (#1533); others get 2.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options

`ResolvedExecutionOptions`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`executeTask`](#executetask-7)

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L268)

Gets current capacity status based on tracked usage.
Uses usage-based tracking since CLI subprocess execution
doesn't expose HTTP rate limit headers.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

###### See

Issue #456 - Real API rate limit tracking

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCapacity`](#getcapacity-6)

##### getCommand()

```ts
protected getCommand(task): CommandConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts#L131)

Gets CLI command and arguments for execution.
Uses stdin for the prompt to avoid argument escaping issues,
especially important when using --add-dir.

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`CommandConfig`

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCommand`](#getcommand-4)

##### getModelInfo()

```ts
getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts#L96)

Gets Claude model information.
`buildModelInfo` matches `cliModelName`, `cliAlias`, and `aliases[]` —
a single call handles 'opus', 'sonnet', 'haiku', current model names,
and the legacy `claude-opus-4` / `claude-haiku-3` / etc. entries that
live in the registry's aliases since #2200 Child 1.

Truly unrecognized models fall through to conservative defaults
(current Opus pricing).

###### Returns

[`CliModelInfo`](#climodelinfo)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getModelInfo`](#getmodelinfo-6)

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L242)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersion`](#getversion-6)

##### getVersionMessage()

```ts
protected getVersionMessage(status, version): string | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L343)

Gets version status message.

###### Parameters

###### status

[`VersionStatus`](#versionstatus-2)

###### version

`string`

###### Returns

`string` \| `undefined`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersionMessage`](#getversionmessage-6)

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L212)

Performs a health check.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`healthCheck`](#healthcheck-6)

##### initCapacityTracker()

```ts
protected initCapacityTracker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L90)

Initializes the capacity tracker.
Called by subclasses after name is set.

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initCapacityTracker`](#initcapacitytracker-6)

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:760](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L760)

Initializes the adapter and capacity tracker.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialize`](#initialize-6)

##### listModels()

```ts
listModels(): Promise<readonly CliModelInfo[]>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/claude-adapter.ts#L82)

Key-free model enumeration (#3405): the claude CLI has no list-models
command and its OAuth token can't call /v1/models, so we enumerate the
vendor's models from the models.dev snapshot. Existence only.

###### Returns

`Promise`\<readonly `CliModelInfo`[]\>

##### normalizeResponse()

```ts
protected normalizeResponse(
   text,
   usage?,
   extra?): CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L376)

Normalizes CLI response to common format.

###### Parameters

###### text

`string`

###### usage?

[`CliTokenUsage`](#clitokenusage)

###### extra?

`Partial`\<[`CliResponse`](#cliresponse)\>

###### Returns

[`CliResponse`](#cliresponse)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`normalizeResponse`](#normalizeresponse-6)

##### parseVersion()

```ts
protected parseVersion(output): string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L302)

Parses version from CLI output.

###### Parameters

###### output

`string`

###### Returns

`string`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parseVersion`](#parseversion-6)

##### recordUsage()

```ts
protected recordUsage(response): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L293)

Records usage from a response for capacity tracking.

###### Parameters

###### response

[`CliResponse`](#cliresponse)

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`recordUsage`](#recordusage-6)

##### shouldOuterRetry()

```ts
protected shouldOuterRetry(opts): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L264)

The inner retryTransient layer is the single retry authority
for subprocess CLIs. When it is enabled (the default), the shared
outer retry loop must not also retry: nesting both meant up to 6
subprocess spawns and ~10-minute hangs on a persistent TIMEOUT, since
the inner layer's timeout extension compounds on every outer attempt
(#2824). The outer loop still runs once, so circuit-breaker failure
recording is unaffected.

###### Parameters

###### opts

`ResolvedExecutionOptions`

###### Returns

`boolean`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`shouldOuterRetry`](#shouldouterretry-6)

---

### ClaudeResponseParser

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L52)

Parser for Claude CLI JSON output.
Implements defensive parsing - only requires essential fields.

#### Implements

- [`ICliResponseParser`](#icliresponseparser)\<[`ClaudeCliResponse`](#claudecliresponse)\>

#### Constructors

##### Constructor

```ts
new ClaudeResponseParser(): ClaudeResponseParser;
```

###### Returns

[`ClaudeResponseParser`](#clauderesponseparser)

#### Properties

##### name

```ts
readonly name: "claude-parser" = 'claude-parser';
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L53)

Parser name (for logging)

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`name`](#name-14)

##### supportedVersionRange

```ts
readonly supportedVersionRange: ">=2.0.0 <3.0.0" = '>=2.0.0 <3.0.0';
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L54)

Supported version range (semver)

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`supportedVersionRange`](#supportedversionrange-3)

#### Methods

##### extractResponse()

```ts
extractResponse(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L78)

Extracts just the response text (most stable field).
Returns null if the response contains an error.

###### Parameters

###### raw

`string`

###### Returns

`string` \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractResponse`](#extractresponse-3)

##### extractSessionId()

```ts
extractSessionId(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L137)

Extracts session ID for resumption.

###### Parameters

###### raw

`string`

###### Returns

`string` \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractSessionId`](#extractsessionid-3)

##### extractUsage()

```ts
extractUsage(raw): CliTokenUsage | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L104)

Extracts token usage from response.

###### Parameters

###### raw

`string`

###### Returns

[`CliTokenUsage`](#clitokenusage) \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractUsage`](#extractusage-3)

##### parse()

```ts
parse(raw): ClaudeCliResponse | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L59)

Parses complete Claude CLI response.

###### Parameters

###### raw

`string`

###### Returns

[`ClaudeCliResponse`](#claudecliresponse) \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`parse`](#parse-3)

---

### CliCircuitBreakerIntegration

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L95)

Integrates circuit breaker pattern with CLI adapters.
Provides automatic fallback when a CLI's circuit opens.

#### Implements

- [`ICliCircuitBreakerIntegration`](#iclicircuitbreakerintegration)

#### Constructors

##### Constructor

```ts
new CliCircuitBreakerIntegration(
   adapters,
   config?,
   logger?): CliCircuitBreakerIntegration;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L101)

###### Parameters

###### adapters

readonly [`ICliAdapter`](#icliadapter)[]

###### config?

[`CliCircuitBreakerConfig`](#clicircuitbreakerconfig)

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`CliCircuitBreakerIntegration`](#clicircuitbreakerintegration)

#### Methods

##### addStateChangeListener()

```ts
addStateChangeListener(listener): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L197)

###### Parameters

###### listener

`CircuitStateChangeListener`

###### Returns

`void`

###### Implementation of

[`ICliCircuitBreakerIntegration`](#iclicircuitbreakerintegration).[`addStateChangeListener`](#addstatechangelistener-1)

##### execute()

```ts
execute(
   adapter,
   task,
taskCategory?): Promise<Result<CircuitProtectedResult, CliError | CircuitError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L115)

###### Parameters

###### adapter

[`ICliAdapter`](#icliadapter)

###### task

[`CliTask`](#clitask)

###### taskCategory?

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

`Promise`\<[`Result`](core.md#result)\<[`CircuitProtectedResult`](#circuitprotectedresult), [`CliError`](#clierror) \| `CircuitError`\>\>

###### Implementation of

[`ICliCircuitBreakerIntegration`](#iclicircuitbreakerintegration).[`execute`](#execute-10)

##### getCircuitSnapshots()

```ts
getCircuitSnapshots(): Map<"claude" | "gemini" | "codex" | "opencode", CircuitBreakerSnapshot>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L183)

###### Returns

`Map`\<`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`, `CircuitBreakerSnapshot`\>

###### Implementation of

[`ICliCircuitBreakerIntegration`](#iclicircuitbreakerintegration).[`getCircuitSnapshots`](#getcircuitsnapshots-1)

##### getHealthStatus()

```ts
getHealthStatus(): CliCircuitHealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L158)

###### Returns

[`CliCircuitHealthStatus`](#clicircuithealthstatus)

###### Implementation of

[`ICliCircuitBreakerIntegration`](#iclicircuitbreakerintegration).[`getHealthStatus`](#gethealthstatus-1)

##### resetAllCircuits()

```ts
resetAllCircuits(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L192)

###### Returns

`void`

###### Implementation of

[`ICliCircuitBreakerIntegration`](#iclicircuitbreakerintegration).[`resetAllCircuits`](#resetallcircuits-1)

##### resetCircuit()

```ts
resetCircuit(cliName): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L187)

###### Parameters

###### cliName

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`void`

###### Implementation of

[`ICliCircuitBreakerIntegration`](#iclicircuitbreakerintegration).[`resetCircuit`](#resetcircuit-1)

---

### CliDetectionCache

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L113)

CLI detection cache implementation.
Thread-safe for Node.js single-threaded execution.

#### Implements

- [`ICliDetectionCache`](#iclidetectioncache)

#### Constructors

##### Constructor

```ts
new CliDetectionCache(config?): CliDetectionCache;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L123)

###### Parameters

###### config?

`Partial`\<[`CliDetectionCacheConfig`](#clidetectioncacheconfig)\>

###### Returns

[`CliDetectionCache`](#clidetectioncache)

#### Methods

##### get()

```ts
get(cli): CliHealthResult | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L137)

Get cached health result for a CLI

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

[`CliHealthResult`](#clihealthresult) \| `undefined`

###### Implementation of

[`ICliDetectionCache`](#iclidetectioncache).[`get`](#get-1)

##### getAll()

```ts
getAll(): ReadonlyMap<"claude" | "gemini" | "codex" | "opencode", CliHealthResult>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L207)

Get all cached results

###### Returns

`ReadonlyMap`\<`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`, [`CliHealthResult`](#clihealthresult)\>

###### Implementation of

[`ICliDetectionCache`](#iclidetectioncache).[`getAll`](#getall-2)

##### getEffectiveTtl()

```ts
getEffectiveTtl(cli): number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L176)

Returns the effective TTL for a CLI, applying adaptive multiplier if enabled.

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`number`

###### Implementation of

[`ICliDetectionCache`](#iclidetectioncache).[`getEffectiveTtl`](#geteffectivettl-1)

##### getStats()

```ts
getStats(): CliCacheStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L211)

Get cache statistics

###### Returns

[`CliCacheStats`](#clicachestats)

###### Implementation of

[`ICliDetectionCache`](#iclidetectioncache).[`getStats`](#getstats-4)

##### invalidate()

```ts
invalidate(cli?): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L195)

Invalidate cache for a specific CLI or all CLIs

###### Parameters

###### cli?

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`void`

###### Implementation of

[`ICliDetectionCache`](#iclidetectioncache).[`invalidate`](#invalidate-1)

##### isStale()

```ts
isStale(cli): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L167)

Check if cache entry is stale

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`boolean`

###### Implementation of

[`ICliDetectionCache`](#iclidetectioncache).[`isStale`](#isstale-1)

##### resetStats()

```ts
resetStats(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L225)

Resets cache statistics.

###### Returns

`void`

##### set()

```ts
set(cli, result): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L157)

Set health result for a CLI

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### result

[`CliHealthResult`](#clihealthresult)

###### Returns

`void`

###### Implementation of

[`ICliDetectionCache`](#iclidetectioncache).[`set`](#set-1)

##### fromHealthStatus()

```ts
static fromHealthStatus(status): CliHealthResult;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:235](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L235)

Converts HealthStatus to CliHealthResult for caching.

###### Parameters

###### status

[`HealthStatus`](#healthstatus)

###### Returns

[`CliHealthResult`](#clihealthresult)

---

### CodexCliAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts#L48)

Codex CLI adapter using subprocess transport.

Extends SubprocessCliAdapter which provides:

- Retry logic with exponential backoff
- Health checks with version compatibility
- Capacity tracking
- Subprocess spawn with timeout handling

#### Extends

- [`SubprocessCliAdapter`](#abstract-subprocesscliadapter)

#### Constructors

##### Constructor

```ts
new CodexCliAdapter(options?): CodexCliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts#L54)

###### Parameters

###### options?

[`BaseAdapterOptions`](#baseadapteroptions)

###### Returns

[`CodexCliAdapter`](#codexcliadapter)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`constructor`](#constructor-17)

#### Properties

##### cachedVersion?

```ts
protected optional cachedVersion?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L80)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`cachedVersion`](#cachedversion-6)

##### capacityTracker

```ts
protected capacityTracker: CapacityTracker | null = null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L77)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capacityTracker`](#capacitytracker-6)

##### initialized

```ts
protected initialized: boolean = false;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L78)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialized`](#initialized-6)

##### lastHealthCheck?

```ts
protected optional lastHealthCheck?: HealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L79)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`lastHealthCheck`](#lasthealthcheck-6)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L76)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`logger`](#logger-6)

##### name

```ts
readonly name: "claude" | "gemini" | "codex" | "opencode" = 'codex';
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts#L49)

CLI name

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`name`](#name-11)

##### parser

```ts
protected readonly parser: ICliResponseParser;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts#L50)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parser`](#parser-4)

##### transientRetry

```ts
protected readonly transientRetry: TransientRetryConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L253)

Transient-error retry config. Override in subclass to enable.

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transientRetry`](#transientretry-4)

##### transport

```ts
readonly transport: CliTransport = 'subprocess';
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:248](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L248)

Transport type

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transport`](#transport-6)

#### Accessors

##### capabilities

###### Get Signature

```ts
get capabilities(): CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L97)

Gets the capability profile for this CLI.

###### Returns

[`CliCapabilityProfile`](#clicapabilityprofile)

Capability profile

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capabilities`](#capabilities-6)

#### Methods

##### checkVersionCompatibility()

```ts
protected checkVersionCompatibility(version): VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L314)

Checks version compatibility.

###### Parameters

###### version

`string`

###### Returns

[`VersionStatus`](#versionstatus-2)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`checkVersionCompatibility`](#checkversioncompatibility-6)

##### createError()

```ts
protected createError(
   code,
   message,
   cause?): CliError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L361)

Creates a CLI error.

###### Parameters

###### code

[`CliErrorCode`](#clierrorcode-1)

###### message

`string`

###### cause?

`Error`

###### Returns

[`CliError`](#clierror)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`createError`](#createerror-6)

##### delay()

```ts
protected delay(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L391)

Delays for the specified milliseconds.

###### Parameters

###### ms

`number`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`delay`](#delay-6)

##### dispose()

```ts
dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:769](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L769)

Disposes the adapter (no-op for subprocess).

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`dispose`](#dispose-6)

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L136)

Executes a task with error handling and retries.

Timeout priority (highest to lowest):

1. options.timeoutMs - explicit execution option
2. task.timeoutMs - task-level setting
3. getTimeoutForTaskAuto() - computed from task complexity and CLI

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`execute`](#execute-7)

##### executeTask()

```ts
executeTask(task, options): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L322)

Executes a task via subprocess, with optional transient-error retry.
When `transientRetry.enabled` is true, transient errors (timeout,
rate_limit, connection, parse) are retried with exponential backoff
(500ms, 1000ms). Parse errors get max 1 retry (#1533); others get 2.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options

`ResolvedExecutionOptions`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`executeTask`](#executetask-7)

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L268)

Gets current capacity status based on tracked usage.
Uses usage-based tracking since CLI subprocess execution
doesn't expose HTTP rate limit headers.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

###### See

Issue #456 - Real API rate limit tracking

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCapacity`](#getcapacity-6)

##### getCommand()

```ts
protected getCommand(task): CommandConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts#L87)

Gets CLI command and arguments for execution.
Task content is passed as a positional argument (not via stdin).

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`CommandConfig`

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCommand`](#getcommand-4)

##### getModelInfo()

```ts
getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts#L68)

Gets Codex model information.
Resolves from canonical registry when possible, falls back to legacy lookup.

###### Returns

[`CliModelInfo`](#climodelinfo)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getModelInfo`](#getmodelinfo-6)

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L242)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersion`](#getversion-6)

##### getVersionMessage()

```ts
protected getVersionMessage(status, version): string | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L343)

Gets version status message.

###### Parameters

###### status

[`VersionStatus`](#versionstatus-2)

###### version

`string`

###### Returns

`string` \| `undefined`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersionMessage`](#getversionmessage-6)

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L212)

Performs a health check.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`healthCheck`](#healthcheck-6)

##### initCapacityTracker()

```ts
protected initCapacityTracker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L90)

Initializes the capacity tracker.
Called by subclasses after name is set.

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initCapacityTracker`](#initcapacitytracker-6)

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:760](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L760)

Initializes the adapter and capacity tracker.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialize`](#initialize-6)

##### listModels()

```ts
listModels(): Promise<readonly CliModelInfo[]>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts#L60)

Key-free model enumeration via the models.dev snapshot (#3405).

###### Returns

`Promise`\<readonly `CliModelInfo`[]\>

##### normalizeResponse()

```ts
protected normalizeResponse(
   text,
   usage?,
   extra?): CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L376)

Normalizes CLI response to common format.

###### Parameters

###### text

`string`

###### usage?

[`CliTokenUsage`](#clitokenusage)

###### extra?

`Partial`\<[`CliResponse`](#cliresponse)\>

###### Returns

[`CliResponse`](#cliresponse)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`normalizeResponse`](#normalizeresponse-6)

##### parseVersion()

```ts
protected parseVersion(output): string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L302)

Parses version from CLI output.

###### Parameters

###### output

`string`

###### Returns

`string`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parseVersion`](#parseversion-6)

##### recordUsage()

```ts
protected recordUsage(response): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L293)

Records usage from a response for capacity tracking.

###### Parameters

###### response

[`CliResponse`](#cliresponse)

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`recordUsage`](#recordusage-6)

##### shouldOuterRetry()

```ts
protected shouldOuterRetry(opts): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L264)

The inner retryTransient layer is the single retry authority
for subprocess CLIs. When it is enabled (the default), the shared
outer retry loop must not also retry: nesting both meant up to 6
subprocess spawns and ~10-minute hangs on a persistent TIMEOUT, since
the inner layer's timeout extension compounds on every outer attempt
(#2824). The outer loop still runs once, so circuit-breaker failure
recording is unaffected.

###### Parameters

###### opts

`ResolvedExecutionOptions`

###### Returns

`boolean`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`shouldOuterRetry`](#shouldouterretry-6)

---

### CodexMcpAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L53)

Codex CLI adapter using MCP transport.

Extends BaseCliAdapter which provides:

- Retry logic with exponential backoff
- Health checks with version compatibility
- Capacity tracking
- Error creation helpers

#### Extends

- [`BaseCliAdapter`](#abstract-basecliadapter)

#### Constructors

##### Constructor

```ts
new CodexMcpAdapter(options?): CodexMcpAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L62)

###### Parameters

###### options?

[`BaseAdapterOptions`](#baseadapteroptions)

###### Returns

[`CodexMcpAdapter`](#codexmcpadapter)

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`constructor`](#constructor)

#### Properties

##### cachedVersion?

```ts
protected optional cachedVersion?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L80)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`cachedVersion`](#cachedversion)

##### capacityTracker

```ts
protected capacityTracker: CapacityTracker | null = null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L77)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`capacityTracker`](#capacitytracker)

##### initialized

```ts
protected initialized: boolean = false;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L78)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`initialized`](#initialized)

##### lastHealthCheck?

```ts
protected optional lastHealthCheck?: HealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L79)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`lastHealthCheck`](#lasthealthcheck)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L76)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`logger`](#logger)

##### name

```ts
readonly name: "claude" | "gemini" | "codex" | "opencode" = 'codex';
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L54)

CLI name

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`name`](#name)

##### transport

```ts
readonly transport: CliTransport = 'mcp';
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L55)

Transport type

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`transport`](#transport)

#### Accessors

##### capabilities

###### Get Signature

```ts
get capabilities(): CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L97)

Gets the capability profile for this CLI.

###### Returns

[`CliCapabilityProfile`](#clicapabilityprofile)

Capability profile

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`capabilities`](#capabilities)

#### Methods

##### checkVersionCompatibility()

```ts
protected checkVersionCompatibility(version): VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L314)

Checks version compatibility.

###### Parameters

###### version

`string`

###### Returns

[`VersionStatus`](#versionstatus-2)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`checkVersionCompatibility`](#checkversioncompatibility)

##### createError()

```ts
protected createError(
   code,
   message,
   cause?): CliError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L361)

Creates a CLI error.

###### Parameters

###### code

[`CliErrorCode`](#clierrorcode-1)

###### message

`string`

###### cause?

`Error`

###### Returns

[`CliError`](#clierror)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`createError`](#createerror)

##### delay()

```ts
protected delay(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L391)

Delays for the specified milliseconds.

###### Parameters

###### ms

`number`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`delay`](#delay)

##### dispose()

```ts
dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L225)

Disposes the adapter and closes MCP connection.

###### Returns

`Promise`\<`void`\>

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`dispose`](#dispose)

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L136)

Executes a task with error handling and retries.

Timeout priority (highest to lowest):

1. options.timeoutMs - explicit execution option
2. task.timeoutMs - task-level setting
3. getTimeoutForTaskAuto() - computed from task complexity and CLI

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`execute`](#execute)

##### executeTask()

```ts
executeTask(_task, options): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L128)

Executes a task via MCP client.
Called by BaseCliAdapter.execute() with retry handling.

###### Parameters

###### \_task

[`CliTask`](#clitask)

###### options

`ResolvedExecutionOptions`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`executeTask`](#executetask)

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L268)

Gets current capacity status based on tracked usage.
Uses usage-based tracking since CLI subprocess execution
doesn't expose HTTP rate limit headers.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

###### See

Issue #456 - Real API rate limit tracking

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`getCapacity`](#getcapacity)

##### getModelInfo()

```ts
getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L71)

Gets Codex model information.
Resolves from canonical registry when possible, falls back to legacy lookup.

###### Returns

[`CliModelInfo`](#climodelinfo)

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`getModelInfo`](#getmodelinfo)

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L242)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`getVersion`](#getversion)

##### getVersionMessage()

```ts
protected getVersionMessage(status, version): string | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L343)

Gets version status message.

###### Parameters

###### status

[`VersionStatus`](#versionstatus-2)

###### version

`string`

###### Returns

`string` \| `undefined`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`getVersionMessage`](#getversionmessage)

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L212)

Performs a health check.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`healthCheck`](#healthcheck)

##### initCapacityTracker()

```ts
protected initCapacityTracker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L90)

Initializes the capacity tracker.
Called by subclasses after name is set.

###### Returns

`void`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`initCapacityTracker`](#initcapacitytracker)

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/codex-mcp-adapter.ts#L89)

Initializes the MCP connection to Codex.

###### Returns

`Promise`\<`void`\>

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`initialize`](#initialize)

##### normalizeResponse()

```ts
protected normalizeResponse(
   text,
   usage?,
   extra?): CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L376)

Normalizes CLI response to common format.

###### Parameters

###### text

`string`

###### usage?

[`CliTokenUsage`](#clitokenusage)

###### extra?

`Partial`\<[`CliResponse`](#cliresponse)\>

###### Returns

[`CliResponse`](#cliresponse)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`normalizeResponse`](#normalizeresponse)

##### parseVersion()

```ts
protected parseVersion(output): string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L302)

Parses version from CLI output.

###### Parameters

###### output

`string`

###### Returns

`string`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`parseVersion`](#parseversion)

##### recordUsage()

```ts
protected recordUsage(response): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L293)

Records usage from a response for capacity tracking.

###### Parameters

###### response

[`CliResponse`](#cliresponse)

###### Returns

`void`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`recordUsage`](#recordusage)

##### shouldOuterRetry()

```ts
protected shouldOuterRetry(opts): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L170)

Whether the shared outer retry loop ([executeCliRetryLoop](#executecliretryloop)) is
allowed to retry this adapter's failures. The base adapter honors the
caller's `allowRetry`. Subprocess adapters override this to suppress
the outer loop when their own transient-retry layer is active, so the
two layers do not nest into multiplied spawns (#2824).

###### Parameters

###### opts

`ResolvedExecutionOptions`

###### Returns

`boolean`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`shouldOuterRetry`](#shouldouterretry)

---

### CodexResponseParser

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L79)

Parser for Codex CLI NDJSON output.
Implements defensive parsing - processes stream of events.

#### Implements

- [`ICliResponseParser`](#icliresponseparser)\<[`CodexCliResponse`](#codexcliresponse)\>

#### Constructors

##### Constructor

```ts
new CodexResponseParser(): CodexResponseParser;
```

###### Returns

[`CodexResponseParser`](#codexresponseparser)

#### Properties

##### name

```ts
readonly name: "codex-parser" = 'codex-parser';
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L80)

Parser name (for logging)

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`name`](#name-14)

##### supportedVersionRange

```ts
readonly supportedVersionRange: ">=0.70.0 <1.0.0" = '>=0.70.0 <1.0.0';
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L81)

Supported version range (semver)

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`supportedVersionRange`](#supportedversionrange-3)

#### Methods

##### extractResponse()

```ts
extractResponse(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L152)

Extracts just the response text (most stable field).
Concatenates all agent_message items.

###### Parameters

###### raw

`string`

###### Returns

`string` \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractResponse`](#extractresponse-3)

##### extractSessionId()

```ts
extractSessionId(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L190)

Extracts session ID (thread_id) for resumption.

###### Parameters

###### raw

`string`

###### Returns

`string` \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractSessionId`](#extractsessionid-3)

##### extractUsage()

```ts
extractUsage(raw): CliTokenUsage | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L164)

Extracts token usage from NDJSON stream.

###### Parameters

###### raw

`string`

###### Returns

[`CliTokenUsage`](#clitokenusage) \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractUsage`](#extractusage-3)

##### parse()

```ts
parse(raw): CodexCliResponse | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L86)

Parses complete Codex CLI NDJSON stream.

###### Parameters

###### raw

`string`

###### Returns

[`CodexCliResponse`](#codexcliresponse) \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`parse`](#parse-3)

---

### CompositeRouter

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L175)

CompositeRouter implementation.

#### Implements

- [`ICompositeRouter`](#icompositerouter)

#### Constructors

##### Constructor

```ts
new CompositeRouter(
   adapters,
   config?,
   logger?): CompositeRouter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:238](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L238)

###### Parameters

###### adapters

`Map`\<`RoutingArmId`, [`ICliAdapter`](#icliadapter)\>

###### config?

`Partial`\<`CompositeRouterConfigWithPreference`\>

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`CompositeRouter`](#compositerouter)

#### Methods

##### executeTask()

```ts
executeTask(task): Promise<Result<CliResponse,
  | CliError
| CompositeRoutingError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:510](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L510)

Unified method that routes, executes, and auto-records feedback.
Use this for most cases; use route() when you need decision details without execution.

###### Parameters

###### task

[`CliTask`](#clitask)

Task to execute

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse),
\| [`CliError`](#clierror)
\| [`CompositeRoutingError`](#compositeroutingerror)\>\>

Result with CLI response or error

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`executeTask`](#executetask-8)

##### getAvailableModelsCache()

```ts
getAvailableModelsCache(): AvailableModelsCache | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:711](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L711)

(#2540 PR 7) Public accessor for the wired cache (or undefined).

###### Returns

[`AvailableModelsCache`](config.md#availablemodelscache) \| `undefined`

##### getCapacityDashboard()

```ts
getCapacityDashboard(): Promise<Map<RoutingArmId, CapacityStatus>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:908](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L908)

Get capacity status for all registered routing arms — CLI slots plus any
`api:*` arms (Issue #807, #3422). Matches the `ITaskRouter` interface doc;
the return key is `RoutingArmId` (`CliName | ApiArmId`), not just CLIs.

###### Returns

`Promise`\<`Map`\<`RoutingArmId`, [`CapacityStatus`](#capacitystatus)\>\>

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`getCapacityDashboard`](#getcapacitydashboard-1)

##### getLatencyTracker()

```ts
getLatencyTracker(): ILatencyTracker | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:883](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L883)

###### Returns

`ILatencyTracker` \| `undefined`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`getLatencyTracker`](#getlatencytracker-1)

##### getMetricsCollector()

```ts
getMetricsCollector(): IRoutingMetricsCollector | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:891](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L891)

Get the metrics collector (if configured).
(Source: Issue #559 - Wire RoutingMetricsCollector to CompositeRouter)

###### Returns

`IRoutingMetricsCollector` \| `undefined`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`getMetricsCollector`](#getmetricscollector-1)

##### getOrchestrationObserver()

```ts
getOrchestrationObserver():
  | IOrchestrationObserver
  | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:899](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L899)

Get the orchestration observer (if configured).
(Source: Issue #587 - Wire OrchestrationObserver to CompositeRouter)

###### Returns

\| [`IOrchestrationObserver`](observability.md#iorchestrationobserver)
\| `undefined`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`getOrchestrationObserver`](#getorchestrationobserver-1)

##### getRoutingMemory()

```ts
getRoutingMemory(): IRoutingMemory | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:938](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L938)

Get the routing memory instance (if enabled).

###### Returns

`IRoutingMemory` \| `undefined`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`getRoutingMemory`](#getroutingmemory-1)

##### getStats()

```ts
getStats(): CompositeRouterStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:912](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L912)

###### Returns

[`CompositeRouterStats`](#compositerouterstats)

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`getStats`](#getstats-5)

##### getZeroRouter()

```ts
getZeroRouter(): IZeroRouter | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:879](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L879)

###### Returns

`IZeroRouter` \| `undefined`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`getZeroRouter`](#getzerorouter-1)

##### hasMinimumPreferenceData()

```ts
hasMinimumPreferenceData(): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:864](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L864)

###### Returns

`boolean`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`hasMinimumPreferenceData`](#hasminimumpreferencedata-1)

##### recordDifficultyOutcome()

```ts
recordDifficultyOutcome(
   task,
   success,
   qualityScore?): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:860](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L860)

###### Parameters

###### task

[`CliTask`](#clitask)

###### success

`boolean`

###### qualityScore?

`number`

###### Returns

`void`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`recordDifficultyOutcome`](#recorddifficultyoutcome-1)

##### recordOutcome()

```ts
recordOutcome(
   cliName,
   task,
   reward): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:848](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L848)

Record a bandit outcome for a distinct routing arm (CLI slot or api:\* arm) (#3422).

###### Parameters

###### cliName

`RoutingArmId`

###### task

[`CliTask`](#clitask)

###### reward

`number`

###### Returns

`void`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`recordOutcome`](#recordoutcome-1)

##### recordPreference()

```ts
recordPreference(
   query,
   strongModelPreferred,
   quality?): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:852](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L852)

###### Parameters

###### query

`string`

###### strongModelPreferred

`boolean`

###### quality?

###### strong?

`number`

###### weak?

`number`

###### Returns

`void`

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`recordPreference`](#recordpreference-2)

##### route()

```ts
route(task): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:453](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L453)

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompositeRoutingDecision`](#compositeroutingdecision), [`CompositeRoutingError`](#compositeroutingerror)\>\>

###### Implementation of

[`ICompositeRouter`](#icompositerouter).[`route`](#route-2)

---

### CompositeRoutingError

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L206)

Error from composite routing.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new CompositeRoutingError(
   message,
   stage,
   cause?): CompositeRoutingError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L209)

###### Parameters

###### message

`string`

###### stage

`string`

###### cause?

`Error`

###### Returns

[`CompositeRoutingError`](#compositeroutingerror)

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

##### stage

```ts
readonly stage: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L207)

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

### GeminiCliAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L93)

Gemini CLI adapter with reliability features.

Includes tiered timeouts, resilient parsing, retry logic, and circuit breaker.

#### Extends

- [`SubprocessCliAdapter`](#abstract-subprocesscliadapter)

#### Constructors

##### Constructor

```ts
new GeminiCliAdapter(options?): GeminiCliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L104)

###### Parameters

###### options?

`GeminiConfig`

###### Returns

[`GeminiCliAdapter`](#geminicliadapter)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`constructor`](#constructor-17)

#### Properties

##### cachedVersion?

```ts
protected optional cachedVersion?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L80)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`cachedVersion`](#cachedversion-6)

##### capacityTracker

```ts
protected capacityTracker: CapacityTracker | null = null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L77)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capacityTracker`](#capacitytracker-6)

##### initialized

```ts
protected initialized: boolean = false;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L78)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialized`](#initialized-6)

##### lastHealthCheck?

```ts
protected optional lastHealthCheck?: HealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L79)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`lastHealthCheck`](#lasthealthcheck-6)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L76)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`logger`](#logger-6)

##### name

```ts
readonly name: "claude" | "gemini" | "codex" | "opencode" = 'gemini';
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L94)

CLI name

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`name`](#name-11)

##### parser

```ts
protected readonly parser: ICliResponseParser;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L95)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parser`](#parser-4)

##### transientRetry

```ts
protected readonly transientRetry: TransientRetryConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L253)

Transient-error retry config. Override in subclass to enable.

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transientRetry`](#transientretry-4)

##### transport

```ts
readonly transport: CliTransport = 'subprocess';
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:248](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L248)

Transport type

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transport`](#transport-6)

#### Accessors

##### capabilities

###### Get Signature

```ts
get capabilities(): CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L97)

Gets the capability profile for this CLI.

###### Returns

[`CliCapabilityProfile`](#clicapabilityprofile)

Capability profile

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capabilities`](#capabilities-6)

#### Methods

##### checkVersionCompatibility()

```ts
protected checkVersionCompatibility(version): VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L314)

Checks version compatibility.

###### Parameters

###### version

`string`

###### Returns

[`VersionStatus`](#versionstatus-2)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`checkVersionCompatibility`](#checkversioncompatibility-6)

##### createError()

```ts
protected createError(
   code,
   message,
   cause?): CliError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L361)

Creates a CLI error.

###### Parameters

###### code

[`CliErrorCode`](#clierrorcode-1)

###### message

`string`

###### cause?

`Error`

###### Returns

[`CliError`](#clierror)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`createError`](#createerror-6)

##### delay()

```ts
protected delay(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L391)

Delays for the specified milliseconds.

###### Parameters

###### ms

`number`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`delay`](#delay-6)

##### dispose()

```ts
dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:769](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L769)

Disposes the adapter (no-op for subprocess).

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`dispose`](#dispose-6)

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L158)

Executes a task with reliability features.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`execute`](#execute-7)

##### executeTask()

```ts
executeTask(task, options): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L322)

Executes a task via subprocess, with optional transient-error retry.
When `transientRetry.enabled` is true, transient errors (timeout,
rate_limit, connection, parse) are retried with exponential backoff
(500ms, 1000ms). Parse errors get max 1 retry (#1533); others get 2.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options

`ResolvedExecutionOptions`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`executeTask`](#executetask-7)

##### executeWithMetadata()

```ts
executeWithMetadata(task, options?): Promise<Result<GeminiExecutionResult, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L174)

Executes with full metadata about retry attempts and circuit state.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`GeminiExecutionResult`, [`CliError`](#clierror)\>\>

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L268)

Gets current capacity status based on tracked usage.
Uses usage-based tracking since CLI subprocess execution
doesn't expose HTTP rate limit headers.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

###### See

Issue #456 - Real API rate limit tracking

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCapacity`](#getcapacity-6)

##### getCircuitBreakerSnapshot()

```ts
getCircuitBreakerSnapshot(): CircuitBreakerSnapshot | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L195)

Gets current circuit breaker snapshot.

###### Returns

`CircuitBreakerSnapshot` \| `null`

##### getCommand()

```ts
protected getCommand(task): CommandConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L209)

Gets CLI command and arguments for execution.

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`CommandConfig`

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCommand`](#getcommand-4)

##### getModelInfo()

```ts
getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L137)

Gets Gemini model information.
Resolves from canonical registry when possible, falls back to legacy lookup.
Note: maxOutput is capped at 8_192 (Gemini CLI constraint).

###### Returns

[`CliModelInfo`](#climodelinfo)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getModelInfo`](#getmodelinfo-6)

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L242)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersion`](#getversion-6)

##### getVersionMessage()

```ts
protected getVersionMessage(status, version): string | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L343)

Gets version status message.

###### Parameters

###### status

[`VersionStatus`](#versionstatus-2)

###### version

`string`

###### Returns

`string` \| `undefined`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersionMessage`](#getversionmessage-6)

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L212)

Performs a health check.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`healthCheck`](#healthcheck-6)

##### initCapacityTracker()

```ts
protected initCapacityTracker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L90)

Initializes the capacity tracker.
Called by subclasses after name is set.

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initCapacityTracker`](#initcapacitytracker-6)

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:760](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L760)

Initializes the adapter and capacity tracker.

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialize`](#initialize-6)

##### listModels()

```ts
listModels(): Promise<readonly CliModelInfo[]>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L128)

Key-free model enumeration via the models.dev snapshot (#3405).

###### Returns

`Promise`\<readonly `CliModelInfo`[]\>

##### normalizeResponse()

```ts
protected normalizeResponse(
   text,
   usage?,
   extra?): CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L376)

Normalizes CLI response to common format.

###### Parameters

###### text

`string`

###### usage?

[`CliTokenUsage`](#clitokenusage)

###### extra?

`Partial`\<[`CliResponse`](#cliresponse)\>

###### Returns

[`CliResponse`](#cliresponse)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`normalizeResponse`](#normalizeresponse-6)

##### parseVersion()

```ts
protected parseVersion(output): string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L302)

Parses version from CLI output.

###### Parameters

###### output

`string`

###### Returns

`string`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parseVersion`](#parseversion-6)

##### recordUsage()

```ts
protected recordUsage(response): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L293)

Records usage from a response for capacity tracking.

###### Parameters

###### response

[`CliResponse`](#cliresponse)

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`recordUsage`](#recordusage-6)

##### resetCircuitBreaker()

```ts
resetCircuitBreaker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/gemini-adapter.ts#L202)

Resets the circuit breaker to closed state.

###### Returns

`void`

##### shouldOuterRetry()

```ts
protected shouldOuterRetry(opts): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L264)

The inner retryTransient layer is the single retry authority
for subprocess CLIs. When it is enabled (the default), the shared
outer retry loop must not also retry: nesting both meant up to 6
subprocess spawns and ~10-minute hangs on a persistent TIMEOUT, since
the inner layer's timeout extension compounds on every outer attempt
(#2824). The outer loop still runs once, so circuit-breaker failure
recording is unaffected.

###### Parameters

###### opts

`ResolvedExecutionOptions`

###### Returns

`boolean`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`shouldOuterRetry`](#shouldouterretry-6)

---

### GeminiResponseParser

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L51)

Parser for Gemini CLI JSON output.
Implements defensive parsing - only requires essential fields.

#### Implements

- [`ICliResponseParser`](#icliresponseparser)\<[`GeminiCliResponse`](#geminicliresponse)\>

#### Constructors

##### Constructor

```ts
new GeminiResponseParser(): GeminiResponseParser;
```

###### Returns

[`GeminiResponseParser`](#geminiresponseparser)

#### Properties

##### name

```ts
readonly name: "gemini-parser" = 'gemini-parser';
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L52)

Parser name (for logging)

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`name`](#name-14)

##### supportedVersionRange

```ts
readonly supportedVersionRange: ">=0.20.0 <1.0.0" = '>=0.20.0 <1.0.0';
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L53)

Supported version range (semver)

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`supportedVersionRange`](#supportedversionrange-3)

#### Methods

##### extractResponse()

```ts
extractResponse(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L76)

Extracts just the response text (most stable field).

###### Parameters

###### raw

`string`

###### Returns

`string` \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractResponse`](#extractresponse-3)

##### extractSessionId()

```ts
extractSessionId(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L156)

Extracts session ID for resumption.

###### Parameters

###### raw

`string`

###### Returns

`string` \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractSessionId`](#extractsessionid-3)

##### extractUsage()

```ts
extractUsage(raw): CliTokenUsage | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L98)

Extracts token usage from response.
Gemini has per-model stats, we aggregate them.

###### Parameters

###### raw

`string`

###### Returns

[`CliTokenUsage`](#clitokenusage) \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`extractUsage`](#extractusage-3)

##### parse()

```ts
parse(raw): GeminiCliResponse | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L58)

Parses complete Gemini CLI response.

###### Parameters

###### raw

`string`

###### Returns

[`GeminiCliResponse`](#geminicliresponse) \| `null`

###### Implementation of

[`ICliResponseParser`](#icliresponseparser).[`parse`](#parse-3)

---

### InMemoryPreferenceStore

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L21)

In-memory preference data store implementation.

#### Implements

- [`IPreferenceDataStore`](#ipreferencedatastore)

#### Constructors

##### Constructor

```ts
new InMemoryPreferenceStore(maxSize?): InMemoryPreferenceStore;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L25)

###### Parameters

###### maxSize?

`number` = `10000`

###### Returns

[`InMemoryPreferenceStore`](#inmemorypreferencestore)

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L84)

Clear all data

###### Returns

`void`

###### Implementation of

[`IPreferenceDataStore`](#ipreferencedatastore).[`clear`](#clear-1)

##### findSimilar()

```ts
findSimilar(features, limit): readonly PreferenceDataPoint[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L48)

Find similar data points based on features

###### Parameters

###### features

[`QueryFeatures`](#queryfeatures)

###### limit

`number`

###### Returns

readonly [`PreferenceDataPoint`](#preferencedatapoint)[]

###### Implementation of

[`IPreferenceDataStore`](#ipreferencedatastore).[`findSimilar`](#findsimilar-1)

##### getAll()

```ts
getAll(): readonly PreferenceDataPoint[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L34)

Get all data points

###### Returns

readonly [`PreferenceDataPoint`](#preferencedatapoint)[]

###### Implementation of

[`IPreferenceDataStore`](#ipreferencedatastore).[`getAll`](#getall-3)

##### getByDomain()

```ts
getByDomain(domain): readonly PreferenceDataPoint[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L38)

Get data points by domain

###### Parameters

###### domain

`string`

###### Returns

readonly [`PreferenceDataPoint`](#preferencedatapoint)[]

###### Implementation of

[`IPreferenceDataStore`](#ipreferencedatastore).[`getByDomain`](#getbydomain-1)

##### getStats()

```ts
getStats(): PreferenceModelStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L62)

Get statistics

###### Returns

[`PreferenceModelStats`](#preferencemodelstats)

###### Implementation of

[`IPreferenceDataStore`](#ipreferencedatastore).[`getStats`](#getstats-6)

##### store()

```ts
store(dataPoint): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-store.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-store.ts#L29)

Store a new preference data point

###### Parameters

###### dataPoint

[`PreferenceDataPoint`](#preferencedatapoint)

###### Returns

`void`

###### Implementation of

[`IPreferenceDataStore`](#ipreferencedatastore).[`store`](#store-1)

---

### OpenCodeCliAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L148)

OpenCode CLI adapter using subprocess transport.
Executes: opencode run --format json "<task>"

Probes available models on first use and omits --model flag
when the requested model isn't available (#1402).

#### Extends

- [`SubprocessCliAdapter`](#abstract-subprocesscliadapter)

#### Constructors

##### Constructor

```ts
new OpenCodeCliAdapter(options?): OpenCodeCliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L158)

###### Parameters

###### options?

[`BaseAdapterOptions`](#baseadapteroptions)

###### Returns

[`OpenCodeCliAdapter`](#opencodecliadapter)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`constructor`](#constructor-17)

#### Properties

##### cachedVersion?

```ts
protected optional cachedVersion?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L80)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`cachedVersion`](#cachedversion-6)

##### capacityTracker

```ts
protected capacityTracker: CapacityTracker | null = null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L77)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capacityTracker`](#capacitytracker-6)

##### initialized

```ts
protected initialized: boolean = false;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L78)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialized`](#initialized-6)

##### lastHealthCheck?

```ts
protected optional lastHealthCheck?: HealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L79)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`lastHealthCheck`](#lasthealthcheck-6)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L76)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`logger`](#logger-6)

##### name

```ts
readonly name: "claude" | "gemini" | "codex" | "opencode" = 'opencode';
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L149)

CLI name

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`name`](#name-11)

##### parser

```ts
protected readonly parser: ICliResponseParser;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L150)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parser`](#parser-4)

##### transientRetry

```ts
protected readonly transientRetry: TransientRetryConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L153)

Enable transient-error retry for OpenCode (#1456).

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transientRetry`](#transientretry-4)

##### transport

```ts
readonly transport: CliTransport = 'subprocess';
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:248](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L248)

Transport type

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`transport`](#transport-6)

#### Accessors

##### capabilities

###### Get Signature

```ts
get capabilities(): CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L97)

Gets the capability profile for this CLI.

###### Returns

[`CliCapabilityProfile`](#clicapabilityprofile)

Capability profile

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`capabilities`](#capabilities-6)

#### Methods

##### checkVersionCompatibility()

```ts
protected checkVersionCompatibility(version): VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L314)

Checks version compatibility.

###### Parameters

###### version

`string`

###### Returns

[`VersionStatus`](#versionstatus-2)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`checkVersionCompatibility`](#checkversioncompatibility-6)

##### createError()

```ts
protected createError(
   code,
   message,
   cause?): CliError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L361)

Creates a CLI error.

###### Parameters

###### code

[`CliErrorCode`](#clierrorcode-1)

###### message

`string`

###### cause?

`Error`

###### Returns

[`CliError`](#clierror)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`createError`](#createerror-6)

##### delay()

```ts
protected delay(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L391)

Delays for the specified milliseconds.

###### Parameters

###### ms

`number`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`delay`](#delay-6)

##### dispose()

```ts
dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:769](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L769)

Disposes the adapter (no-op for subprocess).

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`dispose`](#dispose-6)

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L136)

Executes a task with error handling and retries.

Timeout priority (highest to lowest):

1. options.timeoutMs - explicit execution option
2. task.timeoutMs - task-level setting
3. getTimeoutForTaskAuto() - computed from task complexity and CLI

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`execute`](#execute-7)

##### executeTask()

```ts
executeTask(task, options): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:252](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L252)

#3408: mark a model in rate-limit cooldown when a call returns RATE_LIMITED,
so subsequent selections skip it until the AvailabilityCache TTL recovers.
Wraps the base executeTask; opt-in + fail-open (no-op when discovery is off).
Advisory: a cooled model is still usable via an explicit, available --model.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options

`ResolvedExecutionOptions`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`executeTask`](#executetask-7)

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L268)

Gets current capacity status based on tracked usage.
Uses usage-based tracking since CLI subprocess execution
doesn't expose HTTP rate limit headers.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

###### See

Issue #456 - Real API rate limit tracking

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCapacity`](#getcapacity-6)

##### getCommand()

```ts
protected getCommand(task): CommandConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:285](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L285)

Gets CLI command and arguments for execution.
Uses `opencode run` with JSON format for stable parsing.
Omits --model when the requested model isn't available (#1402).

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`CommandConfig`

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getCommand`](#getcommand-4)

##### getModelInfo()

```ts
getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L166)

Gets OpenCode model information from canonical registry.

###### Returns

[`CliModelInfo`](#climodelinfo)

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getModelInfo`](#getmodelinfo-6)

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L242)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersion`](#getversion-6)

##### getVersionMessage()

```ts
protected getVersionMessage(status, version): string | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L343)

Gets version status message.

###### Parameters

###### status

[`VersionStatus`](#versionstatus-2)

###### version

`string`

###### Returns

`string` \| `undefined`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`getVersionMessage`](#getversionmessage-6)

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L212)

Performs a health check.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`healthCheck`](#healthcheck-6)

##### initCapacityTracker()

```ts
protected initCapacityTracker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L90)

Initializes the capacity tracker.
Called by subclasses after name is set.

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initCapacityTracker`](#initcapacitytracker-6)

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L185)

Initializes the adapter — probes available models.
Warns if Anthropic provider is configured (#1429 — API key boundaries).

###### Returns

`Promise`\<`void`\>

###### Overrides

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`initialize`](#initialize-6)

##### listModels()

```ts
listModels(): Promise<readonly CliModelInfo[]>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts:310](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/adapters/opencode-adapter.ts#L310)

(#2540) Lists models the local OpenCode installation can route to.
Wraps the existing `probeAvailableModels()` (cached for the process
lifetime — see `cachedModels` at the top of this file) and reshapes
the result into the CliModelInfo schema. Splits `provider/model` ids
when present.

###### Returns

`Promise`\<readonly `CliModelInfo`[]\>

##### normalizeResponse()

```ts
protected normalizeResponse(
   text,
   usage?,
   extra?): CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L376)

Normalizes CLI response to common format.

###### Parameters

###### text

`string`

###### usage?

[`CliTokenUsage`](#clitokenusage)

###### extra?

`Partial`\<[`CliResponse`](#cliresponse)\>

###### Returns

[`CliResponse`](#cliresponse)

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`normalizeResponse`](#normalizeresponse-6)

##### parseVersion()

```ts
protected parseVersion(output): string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L302)

Parses version from CLI output.

###### Parameters

###### output

`string`

###### Returns

`string`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`parseVersion`](#parseversion-6)

##### recordUsage()

```ts
protected recordUsage(response): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L293)

Records usage from a response for capacity tracking.

###### Parameters

###### response

[`CliResponse`](#cliresponse)

###### Returns

`void`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`recordUsage`](#recordusage-6)

##### shouldOuterRetry()

```ts
protected shouldOuterRetry(opts): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L264)

The inner retryTransient layer is the single retry authority
for subprocess CLIs. When it is enabled (the default), the shared
outer retry loop must not also retry: nesting both meant up to 6
subprocess spawns and ~10-minute hangs on a persistent TIMEOUT, since
the inner layer's timeout extension compounds on every outer attempt
(#2824). The outer loop still runs once, so circuit-breaker failure
recording is unaffected.

###### Parameters

###### opts

`ResolvedExecutionOptions`

###### Returns

`boolean`

###### Inherited from

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter).[`shouldOuterRetry`](#shouldouterretry-6)

---

### PreferenceRouter

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router.ts#L48)

Preference-trained router that learns from human preference data.

#### Constructors

##### Constructor

```ts
new PreferenceRouter(config?, dataStore?): PreferenceRouter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router.ts#L53)

###### Parameters

###### config?

`Partial`\<[`PreferenceRouterConfig`](#preferencerouterconfig)\> = `{}`

###### dataStore?

[`IPreferenceDataStore`](#ipreferencedatastore)

###### Returns

[`PreferenceRouter`](#preferencerouter)

#### Methods

##### getStats()

```ts
getStats(): PreferenceModelStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router.ts#L140)

Get statistics about the learned preference model.

###### Returns

[`PreferenceModelStats`](#preferencemodelstats)

##### hasMinimumData()

```ts
hasMinimumData(): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router.ts#L147)

Check if the router has enough data to make informed decisions.

###### Returns

`boolean`

##### recordPreference()

```ts
recordPreference(
   query,
   strongModelPreferred,
   strongModelQuality?,
   weakModelQuality?): PreferenceDataPoint;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router.ts#L107)

Record a preference data point for online learning.

###### Parameters

###### query

`string`

###### strongModelPreferred

`boolean`

###### strongModelQuality?

`number`

###### weakModelQuality?

`number`

###### Returns

[`PreferenceDataPoint`](#preferencedatapoint)

##### route()

```ts
route(query): PreferenceRoutingDecision;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router.ts#L72)

Route a query to the optimal model based on learned preferences.

###### Parameters

###### query

`string`

###### Returns

[`PreferenceRoutingDecision`](#preferenceroutingdecision)

---

### QueryFeatureExtractor

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-extractor.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-extractor.ts#L80)

Feature extractor for queries.

#### Constructors

##### Constructor

```ts
new QueryFeatureExtractor(): QueryFeatureExtractor;
```

###### Returns

[`QueryFeatureExtractor`](#queryfeatureextractor)

#### Methods

##### extract()

```ts
extract(query): QueryFeatures;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-extractor.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-extractor.ts#L81)

###### Parameters

###### query

`string`

###### Returns

[`QueryFeatures`](#queryfeatures)

---

### RoutingMemoryError

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L34)

CLI Adapters exports - CLI integration with defensive parsing
Split from index.ts for file size compliance (Issue #285)

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new RoutingMemoryError(
   message,
   code?,
   cause?): RoutingMemoryError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L37)

###### Parameters

###### message

`string`

###### code?

`RoutingMemoryErrorCode` = `'STORAGE_FAILED'`

###### cause?

`unknown`

###### Returns

[`RoutingMemoryError`](#routingmemoryerror)

###### Overrides

```ts
Error.constructor;
```

#### Properties

##### cause?

```ts
readonly optional cause?: unknown;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L40)

###### Inherited from

```ts
Error.cause;
```

##### code

```ts
readonly code: RoutingMemoryErrorCode;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L35)

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

### `abstract` SubprocessCliAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:247](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L247)

Base class for subprocess-based CLI adapters.
Used by ClaudeCliAdapter and GeminiCliAdapter.

#### Extends

- [`BaseCliAdapter`](#abstract-basecliadapter)

#### Extended by

- [`ClaudeCliAdapter`](#claudecliadapter)
- [`GeminiCliAdapter`](#geminicliadapter)
- [`CodexCliAdapter`](#codexcliadapter)
- [`OpenCodeCliAdapter`](#opencodecliadapter)

#### Constructors

##### Constructor

```ts
new SubprocessCliAdapter(logger?): SubprocessCliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L82)

###### Parameters

###### logger?

[`ILogger`](core.md#ilogger)

###### Returns

[`SubprocessCliAdapter`](#abstract-subprocesscliadapter)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`constructor`](#constructor)

#### Properties

##### cachedVersion?

```ts
protected optional cachedVersion?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L80)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`cachedVersion`](#cachedversion)

##### capacityTracker

```ts
protected capacityTracker: CapacityTracker | null = null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L77)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`capacityTracker`](#capacitytracker)

##### initialized

```ts
protected initialized: boolean = false;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L78)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`initialized`](#initialized)

##### lastHealthCheck?

```ts
protected optional lastHealthCheck?: HealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L79)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`lastHealthCheck`](#lasthealthcheck)

##### logger

```ts
protected readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L76)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`logger`](#logger)

##### name

```ts
abstract readonly name: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L73)

CLI name

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`name`](#name)

##### parser

```ts
abstract protected readonly parser: ICliResponseParser;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L250)

##### transientRetry

```ts
protected readonly transientRetry: TransientRetryConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L253)

Transient-error retry config. Override in subclass to enable.

##### transport

```ts
readonly transport: CliTransport = 'subprocess';
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:248](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L248)

Transport type

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`transport`](#transport)

#### Accessors

##### capabilities

###### Get Signature

```ts
get capabilities(): CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L97)

Gets the capability profile for this CLI.

###### Returns

[`CliCapabilityProfile`](#clicapabilityprofile)

Capability profile

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`capabilities`](#capabilities)

#### Methods

##### checkVersionCompatibility()

```ts
protected checkVersionCompatibility(version): VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L314)

Checks version compatibility.

###### Parameters

###### version

`string`

###### Returns

[`VersionStatus`](#versionstatus-2)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`checkVersionCompatibility`](#checkversioncompatibility)

##### createError()

```ts
protected createError(
   code,
   message,
   cause?): CliError;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:361](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L361)

Creates a CLI error.

###### Parameters

###### code

[`CliErrorCode`](#clierrorcode-1)

###### message

`string`

###### cause?

`Error`

###### Returns

[`CliError`](#clierror)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`createError`](#createerror)

##### delay()

```ts
protected delay(ms): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:391](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L391)

Delays for the specified milliseconds.

###### Parameters

###### ms

`number`

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`delay`](#delay)

##### dispose()

```ts
dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:769](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L769)

Disposes the adapter (no-op for subprocess).

###### Returns

`Promise`\<`void`\>

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`dispose`](#dispose)

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L136)

Executes a task with error handling and retries.

Timeout priority (highest to lowest):

1. options.timeoutMs - explicit execution option
2. task.timeoutMs - task-level setting
3. getTimeoutForTaskAuto() - computed from task complexity and CLI

###### Parameters

###### task

[`CliTask`](#clitask)

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`execute`](#execute)

##### executeTask()

```ts
executeTask(task, options): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L322)

Executes a task via subprocess, with optional transient-error retry.
When `transientRetry.enabled` is true, transient errors (timeout,
rate_limit, connection, parse) are retried with exponential backoff
(500ms, 1000ms). Parse errors get max 1 retry (#1533); others get 2.

###### Parameters

###### task

[`CliTask`](#clitask)

###### options

`ResolvedExecutionOptions`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`executeTask`](#executetask)

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:268](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L268)

Gets current capacity status based on tracked usage.
Uses usage-based tracking since CLI subprocess execution
doesn't expose HTTP rate limit headers.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

###### See

Issue #456 - Real API rate limit tracking

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`getCapacity`](#getcapacity)

##### getCommand()

```ts
abstract protected getCommand(task): CommandConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L272)

Gets CLI command and arguments for execution.
If stdin is provided, it will be written to the process stdin.

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`CommandConfig`

##### getModelInfo()

```ts
abstract getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L114)

Abstract method for getting model info.
Implemented by concrete adapters.

###### Returns

[`CliModelInfo`](#climodelinfo)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`getModelInfo`](#getmodelinfo)

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L242)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`getVersion`](#getversion)

##### getVersionMessage()

```ts
protected getVersionMessage(status, version): string | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:343](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L343)

Gets version status message.

###### Parameters

###### status

[`VersionStatus`](#versionstatus-2)

###### version

`string`

###### Returns

`string` \| `undefined`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`getVersionMessage`](#getversionmessage)

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L212)

Performs a health check.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`healthCheck`](#healthcheck)

##### initCapacityTracker()

```ts
protected initCapacityTracker(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L90)

Initializes the capacity tracker.
Called by subclasses after name is set.

###### Returns

`void`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`initCapacityTracker`](#initcapacitytracker)

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:760](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L760)

Initializes the adapter and capacity tracker.

###### Returns

`Promise`\<`void`\>

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`initialize`](#initialize)

##### normalizeResponse()

```ts
protected normalizeResponse(
   text,
   usage?,
   extra?): CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:376](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L376)

Normalizes CLI response to common format.

###### Parameters

###### text

`string`

###### usage?

[`CliTokenUsage`](#clitokenusage)

###### extra?

`Partial`\<[`CliResponse`](#cliresponse)\>

###### Returns

[`CliResponse`](#cliresponse)

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`normalizeResponse`](#normalizeresponse)

##### parseVersion()

```ts
protected parseVersion(output): string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L302)

Parses version from CLI output.

###### Parameters

###### output

`string`

###### Returns

`string`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`parseVersion`](#parseversion)

##### recordUsage()

```ts
protected recordUsage(response): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/base-adapter.ts:293](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/base-adapter.ts#L293)

Records usage from a response for capacity tracking.

###### Parameters

###### response

[`CliResponse`](#cliresponse)

###### Returns

`void`

###### Inherited from

[`BaseCliAdapter`](#abstract-basecliadapter).[`recordUsage`](#recordusage)

##### shouldOuterRetry()

```ts
protected shouldOuterRetry(opts): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/subprocess-adapter.ts#L264)

The inner retryTransient layer is the single retry authority
for subprocess CLIs. When it is enabled (the default), the shared
outer retry loop must not also retry: nesting both meant up to 6
subprocess spawns and ~10-minute hangs on a persistent TIMEOUT, since
the inner layer's timeout extension compounds on every outer attempt
(#2824). The outer loop still runs once, so circuit-breaker failure
recording is unaffected.

###### Parameters

###### opts

`ResolvedExecutionOptions`

###### Returns

`boolean`

###### Overrides

[`BaseCliAdapter`](#abstract-basecliadapter).[`shouldOuterRetry`](#shouldouterretry)

## Interfaces

### ActionRecord

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L205)

Action record for caching successful patterns.

#### Properties

##### avgDurationMs

```ts
readonly avgDurationMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L217)

Average duration in milliseconds

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L207)

Unique action ID

##### lastUsed

```ts
readonly lastUsed: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L219)

Last time this action was used

##### pattern

```ts
readonly pattern: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L211)

Pattern description

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L215)

Success rate (0-1)

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L209)

Task type this action applies to

##### usageCount

```ts
readonly usageCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:213](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L213)

Number of times this action was used

---

### BaseAdapterOptions

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L43)

Base adapter constructor options shared by all CLI adapters.
CLI-specific adapters extend this with additional fields.

#### Properties

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L47)

Custom logger instance

##### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L45)

Model to use (defaults to the CLI's default from the canonical registry)

---

### CapacityStatus

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L160)

Capacity status for rate limiting.

#### Properties

##### exhausted

```ts
readonly exhausted: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L170)

Whether capacity is exhausted

##### remainingRequests

```ts
readonly remainingRequests: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L164)

Remaining requests in current window

##### remainingTokens

```ts
readonly remainingTokens: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L162)

Remaining tokens in current window

##### resetTime

```ts
readonly resetTime: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L166)

When the rate limit resets

##### utilizationPercent

```ts
readonly utilizationPercent: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L168)

Current utilization percentage (0-100)

---

### CircuitProtectedResult

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L48)

Result of a circuit-protected execution with fallback info.

#### Properties

##### executedBy

```ts
readonly executedBy: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L50)

##### fallbackAttempts?

```ts
readonly optional fallbackAttempts?: readonly ("claude" | "gemini" | "codex" | "opencode")[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L52)

##### response

```ts
readonly response: CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L49)

##### usedFallback

```ts
readonly usedFallback: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L51)

---

### ClaudeCliResponse

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L21)

Claude CLI response structure.
(Source: CLI testing 2026-01-04)

#### Properties

##### duration_ms?

```ts
readonly optional duration_ms?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L25)

##### is_error

```ts
readonly is_error: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L24)

##### modelUsage?

```ts
readonly optional modelUsage?: Record<string, {
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  contextWindow?: number;
  costUSD?: number;
  inputTokens: number;
  outputTokens: number;
}>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L35)

##### result

```ts
readonly result: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L26)

##### session_id?

```ts
readonly optional session_id?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L27)

##### subtype?

```ts
readonly optional subtype?: "error" | "success";
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L23)

##### total_cost_usd?

```ts
readonly optional total_cost_usd?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L28)

##### type

```ts
readonly type: "result";
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L22)

##### usage?

```ts
readonly optional usage?: {
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  input_tokens: number;
  output_tokens: number;
};
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/claude-parser.ts#L29)

###### cache_creation_input_tokens?

```ts
readonly optional cache_creation_input_tokens?: number;
```

###### cache_read_input_tokens?

```ts
readonly optional cache_read_input_tokens?: number;
```

###### input_tokens

```ts
readonly input_tokens: number;
```

###### output_tokens

```ts
readonly output_tokens: number;
```

---

### CliAdapterConfig

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L28)

Configuration for creating a CLI adapter.

#### Properties

##### cli

```ts
readonly cli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L30)

Which CLI to use

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L34)

Optional logger

##### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L32)

Optional model override

##### transport?

```ts
readonly optional transport?: CliTransport;
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L36)

Preferred transport (for Codex: 'mcp' or 'subprocess')

---

### CliCacheStats

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L96)

Cache statistics for observability.

#### Properties

##### hitRate

```ts
readonly hitRate: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L104)

Hit rate (0-1)

##### hits

```ts
readonly hits: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L100)

Cache hits since last reset

##### lastReset

```ts
readonly lastReset: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L106)

When stats were last reset

##### misses

```ts
readonly misses: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L102)

Cache misses since last reset

##### size

```ts
readonly size: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L98)

Number of cached entries

---

### CliCapabilityProfile

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L54)

Capability profile for task routing.
(Source: cli-project_plan.md Capability Matching Matrix)

#### Properties

##### codeGeneration

```ts
readonly codeGeneration: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L60)

Code generation quality (0-10)

##### contextWindow

```ts
readonly contextWindow: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L58)

Maximum context window in tokens

##### cost

```ts
readonly cost: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L64)

Cost efficiency (0-10, higher = cheaper)

##### reasoning

```ts
readonly reasoning: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L56)

Complex reasoning ability (0-10)

##### speed

```ts
readonly speed: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L62)

Response speed (0-10, higher = faster)

---

### CliCircuitBreakerConfig

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L40)

Configuration for CLI circuit breaker integration.

#### Properties

##### enableFallback?

```ts
readonly optional enableFallback?: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L43)

##### fallbackChain?

```ts
readonly optional fallbackChain?: readonly ("claude" | "gemini" | "codex" | "opencode")[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L42)

##### maxFallbackAttempts?

```ts
readonly optional maxFallbackAttempts?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L44)

##### perCliConfig?

```ts
readonly optional perCliConfig?: Partial<Record<"claude" | "gemini" | "codex" | "opencode", Partial<CircuitBreakerConfig>>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L41)

---

### CliCircuitHealthStatus

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L56)

Health status for all CLIs with circuit state.

#### Properties

##### clis

```ts
readonly clis: readonly {
  circuitState: "open" | "closed" | "half-open";
  failureCount: number;
  healthy: boolean;
  lastFailureTime: number | null;
  name: "claude" | "gemini" | "codex" | "opencode";
}[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L57)

##### healthyCount

```ts
readonly healthyCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L65)

##### systemHealthy

```ts
readonly systemHealthy: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L64)

##### timestamp

```ts
readonly timestamp: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L66)

---

### CliDetectionCacheConfig

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L36)

Configuration for the CLI detection cache.

#### Properties

##### adaptiveTtl?

```ts
readonly optional adaptiveTtl?: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L40)

Enable adaptive TTL based on health history (default: true)

##### logger?

```ts
readonly optional logger?: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L42)

Logger instance

##### ttlMs

```ts
readonly ttlMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L38)

Base time-to-live in milliseconds (default: 5 minutes)

---

### CliError

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L123)

CLI execution error.

#### Properties

##### cause?

```ts
readonly optional cause?: Error;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L131)

Underlying error (if any)

##### cli

```ts
readonly cli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L129)

CLI that produced the error

##### code

```ts
readonly code: CliErrorCode;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L125)

Error code

##### message

```ts
readonly message: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L127)

Human-readable message

##### retryable

```ts
readonly retryable: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L133)

Whether the error is retryable

---

### CliExecutionOptions

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L100)

Execution options for CLI adapters.

#### Properties

##### allowRetry?

```ts
readonly optional allowRetry?: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L104)

Whether to allow retries

##### maxRetries?

```ts
readonly optional maxRetries?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L106)

Maximum retry attempts

##### onProgress?

```ts
readonly optional onProgress?: () => void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L110)

Progress callback invoked on subprocess stdout activity (Issue #1087).

###### Returns

`void`

##### signal?

```ts
readonly optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L127)

Cancellation signal (#3026 finding 2). When the signal aborts, the
adapter must cancel the in-flight execution promptly — for
subprocess adapters that means SIGTERM (with SIGKILL escalation
per #3026 finding 1). Without this, callers that use
`Promise.race([adapter.execute(task), timeout])` for cancellation
leak orphan subprocesses on race-loser: the timeout promise wins
the race but the adapter call keeps running, posting late results
into OutcomeStore + LinUCB state for a task whose decision has
already been recorded.

Typed as `AbortSignal | undefined` (not `AbortSignal?`) so
`Required<ExecutionOptions>` — used pervasively by adapter
internals + tests as a resolved-options shape — keeps accepting
`signal: undefined` under `exactOptionalPropertyTypes`.

##### timeoutMs?

```ts
readonly optional timeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L102)

Timeout in milliseconds

##### trackUsage?

```ts
readonly optional trackUsage?: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L108)

Whether to track usage

---

### CliHealthResult

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L20)

Cached health result for a CLI.

#### Properties

##### checkedAt

```ts
readonly checkedAt: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L28)

When this result was captured

##### healthy

```ts
readonly healthy: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L22)

Whether the CLI is healthy and available

##### message?

```ts
readonly optional message?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L30)

Optional status message

##### version

```ts
readonly version: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L24)

CLI version detected

##### versionStatus

```ts
readonly versionStatus: VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L26)

Version compatibility status

---

### CliModelInfo

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L24)

Model information from CLI.

#### Properties

##### contextWindow

```ts
readonly contextWindow: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L30)

Maximum context window in tokens

##### costPerMillionInput?

```ts
readonly optional costPerMillionInput?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L34)

Cost per 1M input tokens

##### costPerMillionOutput?

```ts
readonly optional costPerMillionOutput?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L36)

Cost per 1M output tokens

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L26)

Model identifier

##### maxOutput?

```ts
readonly optional maxOutput?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L32)

Maximum output tokens

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L28)

Model display name

---

### CliResponse

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L88)

Unified CLI response format.
Normalized across all CLI output formats.

#### Properties

##### costUsd?

```ts
readonly optional costUsd?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L96)

Cost in USD (if available)

##### durationMs?

```ts
readonly optional durationMs?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L100)

Duration in milliseconds

##### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L98)

Model used for generation

##### raw?

```ts
readonly optional raw?: unknown;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L102)

Raw response (for debugging)

##### sessionId?

```ts
readonly optional sessionId?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L94)

Session ID for resumption

##### text

```ts
readonly text: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L90)

The response text

##### usage?

```ts
readonly optional usage?: CliTokenUsage;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L92)

Token usage statistics

---

### CliRetryLoopConfig

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L35)

CLI Adapters exports - CLI integration with defensive parsing
Split from index.ts for file size compliance (Issue #285)

#### Properties

##### allowRetry

```ts
readonly allowRetry: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L37)

##### baseDelayMs

```ts
readonly baseDelayMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L38)

##### circuitBreaker?

```ts
readonly optional circuitBreaker?: ICircuitBreaker | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L40)

##### cli

```ts
readonly cli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L41)

##### logger

```ts
readonly logger: ILogger;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L42)

##### maxDelayMs

```ts
readonly maxDelayMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L39)

##### maxRetries

```ts
readonly maxRetries: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L36)

---

### CliRetryResult

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L45)

CLI Adapters exports - CLI integration with defensive parsing
Split from index.ts for file size compliance (Issue #285)

#### Properties

##### response

```ts
readonly response: CliResponse;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L46)

##### retryCount

```ts
readonly retryCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L47)

---

### CliTask

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L70)

Task to execute on a CLI.

#### Properties

##### content

```ts
readonly content: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L72)

Task content/prompt

##### maxTokens?

```ts
readonly optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L80)

Maximum tokens to generate

##### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L76)

Preferred model (if any)

##### options?

```ts
readonly optional options?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L84)

Additional CLI-specific options

##### sessionId?

```ts
readonly optional sessionId?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L78)

Session ID for continuation

##### systemPrompt?

```ts
readonly optional systemPrompt?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L74)

Optional system prompt

##### timeoutMs?

```ts
readonly optional timeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L82)

Timeout in milliseconds

---

### CliTokenUsage

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L73)

Token usage information from CLI response.

#### Properties

##### cachedInputTokens?

```ts
readonly optional cachedInputTokens?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L79)

Cached input tokens (if applicable)

##### inputTokens

```ts
readonly inputTokens: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L75)

Input tokens consumed

##### outputTokens

```ts
readonly outputTokens: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L77)

Output tokens generated

##### totalTokens?

```ts
readonly optional totalTokens?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L81)

Total tokens (input + output)

---

### CodexCliResponse

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L68)

Aggregated Codex response from NDJSON stream.

#### Properties

##### messages

```ts
readonly messages: readonly string[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L70)

##### reasoning

```ts
readonly reasoning: readonly string[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L71)

##### threadId?

```ts
readonly optional threadId?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L69)

##### usage?

```ts
readonly optional usage?: CliTokenUsage;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/codex-parser.ts#L72)

---

### CompositeRouterStats

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L219)

Router statistics for observability.

#### Properties

##### avgDecisionTimeMs

```ts
readonly avgDecisionTimeMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L225)

Average decision time in ms

##### banditStats

```ts
readonly banditStats: readonly {
  avgReward: number;
  name: string;
  pullCount: number;
}[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L240)

LinUCB arm statistics

##### budgetRejectionRate

```ts
readonly budgetRejectionRate: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:227](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L227)

Budget filter rejection rate

##### decisionsPerCli

```ts
readonly decisionsPerCli: Readonly<Record<CliName, number>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L223)

Decisions per CLI

##### latencyStats?

```ts
readonly optional latencyStats?: LatencyTrackerStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L242)

Latency tracking statistics (Issue #361)

##### preferenceStats?

```ts
readonly optional preferenceStats?: {
  dataPointCount: number;
  enabled: boolean;
  hasSufficientData: boolean;
  strongModelPreferenceRate: number;
};
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:229](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L229)

Preference routing statistics

###### dataPointCount

```ts
readonly dataPointCount: number;
```

Total preference data points collected

###### enabled

```ts
readonly enabled: boolean;
```

Whether preference routing is enabled

###### hasSufficientData

```ts
readonly hasSufficientData: boolean;
```

Whether sufficient data for preference routing

###### strongModelPreferenceRate

```ts
readonly strongModelPreferenceRate: number;
```

Strong model preference rate

##### routingMemoryStats?

```ts
readonly optional routingMemoryStats?: RoutingMemoryStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L244)

Routing memory statistics (Issue #463)

##### totalDecisions

```ts
readonly totalDecisions: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L221)

Total routing decisions made

---

### CompositeRoutingDecision

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L162)

Routing decision with full explanation.

#### Properties

##### adapter

```ts
readonly adapter: ICliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L164)

Selected CLI adapter

##### alternatives

```ts
readonly alternatives: readonly RoutingArmId[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L198)

Alternative adapters in ranked order

##### cliName

```ts
readonly cliName: RoutingArmId;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L166)

Selected routing arm — a CLI slot or a distinct `api:*` arm (#3422).

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L174)

Overall confidence in decision (0-1)

##### decisionTimeMs

```ts
readonly decisionTimeMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L180)

Decision time in milliseconds

##### difficultyEstimate?

```ts
readonly optional difficultyEstimate?: DifficultyEstimate;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L184)

ZeroRouter difficulty estimate (if ZeroRouter enabled)

##### difficultyTier?

```ts
readonly optional difficultyTier?: ModelTier;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L186)

ZeroRouter recommended model tier (if ZeroRouter enabled)

##### latencyScore?

```ts
readonly optional latencyScore?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L196)

Latency score (if latency tracking enabled) (Issue #361)

##### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L172)

Concrete model selected by difficulty tier (#3394). Present only when
route-time model selection is enabled (NEXUS_ROUTE_MODEL_SELECTION).
Consumers should use `decision.model ?? getDefaultModelForCli(cliName)`.

##### preferenceScore?

```ts
readonly optional preferenceScore?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L188)

Preference routing score (if preference routing enabled)

##### preferenceTier?

```ts
readonly optional preferenceTier?: "strong" | "weak";
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L190)

Selected tier from preference routing

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L176)

Human-readable explanation

##### stagesExecuted

```ts
readonly stagesExecuted: readonly string[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L178)

Stages executed

##### taskProfile

```ts
readonly taskProfile: TaskProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L200)

Task analysis used for routing

##### topsisScore?

```ts
readonly optional topsisScore?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L192)

TOPSIS score (if TOPSIS ranking enabled)

##### ucbScore?

```ts
readonly optional ucbScore?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L194)

LinUCB UCB score (if LinUCB enabled)

##### withinBudget?

```ts
readonly optional withinBudget?: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L182)

Budget feasibility (if budget filter enabled)

---

### ExperienceRecord

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L181)

Experience record for MobiMem Evolution.

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L183)

Unique experience ID

##### learnings

```ts
readonly learnings: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L195)

Key learnings from this experience

##### steps

```ts
readonly steps: readonly ExperienceStep[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L191)

Steps taken during execution

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L193)

Whether the task succeeded

##### taskDescription

```ts
readonly taskDescription: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L189)

Description of the task

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L187)

Task type

##### timestamp

```ts
readonly timestamp: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L185)

When the experience occurred

---

### ExperienceStep

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L167)

Step within an experience record.

#### Properties

##### action

```ts
readonly action: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L171)

Action taken

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L175)

Duration in milliseconds

##### index

```ts
readonly index: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L169)

Step index

##### observation

```ts
readonly observation: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L173)

Observation/result

---

### GeminiCliResponse

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L21)

Gemini CLI response structure.
(Source: CLI testing 2026-01-04)

#### Properties

##### response

```ts
readonly response: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L23)

##### session_id?

```ts
readonly optional session_id?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L22)

##### stats?

```ts
readonly optional stats?: {
  models?: Record<string, {
     api?: {
        totalErrors?: number;
        totalLatencyMs?: number;
        totalRequests?: number;
     };
     tokens?: {
        cached?: number;
        candidates?: number;
        input?: number;
        prompt?: number;
        thoughts?: number;
        tool?: number;
        total?: number;
     };
  }>;
};
```

Defined in: [packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/parsers/gemini-parser.ts#L24)

###### models?

```ts
readonly optional models?: Record<string, {
  api?: {
     totalErrors?: number;
     totalLatencyMs?: number;
     totalRequests?: number;
  };
  tokens?: {
     cached?: number;
     candidates?: number;
     input?: number;
     prompt?: number;
     thoughts?: number;
     tool?: number;
     total?: number;
  };
}>;
```

---

### HealthStatus

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L144)

Health check status for a CLI.

#### Properties

##### healthy

```ts
readonly healthy: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L146)

Whether the CLI is healthy

##### lastChecked

```ts
readonly lastChecked: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L154)

Last successful health check

##### message?

```ts
readonly optional message?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L152)

Optional message (e.g., upgrade recommendation)

##### version

```ts
readonly version: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L148)

CLI version

##### versionStatus

```ts
readonly versionStatus: VersionStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L150)

Version compatibility status

---

### ICircuitBreaker

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L98)

Interface for circuit breaker operations.

#### Methods

##### execute()

```ts
execute<T>(fn): Promise<Result<T, CircuitError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L102)

Executes a function with circuit breaker protection.

###### Type Parameters

###### T

`T`

###### Parameters

###### fn

() => `Promise`\<`T`\>

###### Returns

`Promise`\<[`Result`](core.md#result)\<`T`, `CircuitError`\>\>

##### getSnapshot()

```ts
getSnapshot(): CircuitBreakerSnapshot;
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L112)

Gets a full snapshot of circuit breaker state.

###### Returns

`CircuitBreakerSnapshot`

##### getState()

```ts
getState(): CircuitState;
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L107)

Gets the current circuit state.

###### Returns

[`CircuitState`](#circuitstate)

##### recordFailure()

```ts
recordFailure(category): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L122)

Records a failure manually (for external failure detection).

###### Parameters

###### category

[`CircuitBreakerFailureCategory`](#circuitbreakerfailurecategory)

###### Returns

`void`

##### recordSuccess()

```ts
recordSuccess(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L127)

Records a success manually (for external success detection).

###### Returns

`void`

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L117)

Manually resets the circuit breaker to closed state.

###### Returns

`void`

---

### ICliAdapter

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L135)

CLI adapter interface.
Abstracts CLI integration with transport-agnostic execution.
(Source: cli-project_plan.md v2.1.0, Phase 2)

#### Properties

##### capabilities

```ts
readonly capabilities: CliCapabilityProfile;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L141)

Capability profile

##### name

```ts
readonly name: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L137)

CLI name

##### transport

```ts
readonly transport: CliTransport;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L139)

Transport type

#### Methods

##### dispose()

```ts
dispose(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L190)

Cleans up resources (e.g., subprocess, MCP connection).
Called on shutdown.

###### Returns

`Promise`\<`void`\>

##### execute()

```ts
execute(task, options?): Promise<Result<CliResponse, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L150)

Executes a task on the CLI.

###### Parameters

###### task

[`CliTask`](#clitask)

Task to execute

###### options?

[`CliExecutionOptions`](#cliexecutionoptions)

Execution options

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

Result with response or error

##### getCapacity()

```ts
getCapacity(): Promise<CapacityStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L164)

Gets current capacity/rate limit status.

###### Returns

`Promise`\<[`CapacityStatus`](#capacitystatus)\>

Capacity status

##### getModelInfo()

```ts
getModelInfo(): CliModelInfo;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L178)

Gets model information.

###### Returns

[`CliModelInfo`](#climodelinfo)

Model info

##### getVersion()

```ts
getVersion(): Promise<string>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L171)

Gets CLI version.

###### Returns

`Promise`\<`string`\>

Version string

##### healthCheck()

```ts
healthCheck(): Promise<HealthStatus>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L157)

Performs a health check on the CLI.

###### Returns

`Promise`\<[`HealthStatus`](#healthstatus)\>

Health status including version compatibility

##### initialize()

```ts
initialize(): Promise<void>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L184)

Initializes the adapter (e.g., MCP connection).
Called before first use.

###### Returns

`Promise`\<`void`\>

##### listModels()?

```ts
optional listModels(): Promise<readonly CliModelInfo[]>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L198)

(#2540) Optional: list models the underlying CLI installation/runtime
has available. Implementations should cache for ~5 min and throw on
failure so the caller can fall back. Adapters whose CLIs have no
native list surface (claude, codex, gemini) leave this undefined.

###### Returns

`Promise`\<readonly `CliModelInfo`[]\>

---

### ICliCircuitBreakerIntegration

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L70)

Interface for CLI circuit breaker integration.

#### Methods

##### addStateChangeListener()

```ts
addStateChangeListener(listener): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L80)

###### Parameters

###### listener

`CircuitStateChangeListener`

###### Returns

`void`

##### execute()

```ts
execute(
   adapter,
   task,
taskCategory?): Promise<Result<CircuitProtectedResult, CliError | CircuitError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L71)

###### Parameters

###### adapter

[`ICliAdapter`](#icliadapter)

###### task

[`CliTask`](#clitask)

###### taskCategory?

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

`Promise`\<[`Result`](core.md#result)\<[`CircuitProtectedResult`](#circuitprotectedresult), [`CliError`](#clierror) \| `CircuitError`\>\>

##### getCircuitSnapshots()

```ts
getCircuitSnapshots(): Map<"claude" | "gemini" | "codex" | "opencode", CircuitBreakerSnapshot>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L77)

###### Returns

`Map`\<`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`, `CircuitBreakerSnapshot`\>

##### getHealthStatus()

```ts
getHealthStatus(): CliCircuitHealthStatus;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L76)

###### Returns

[`CliCircuitHealthStatus`](#clicircuithealthstatus)

##### resetAllCircuits()

```ts
resetAllCircuits(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L79)

###### Returns

`void`

##### resetCircuit()

```ts
resetCircuit(cliName): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L78)

###### Parameters

###### cliName

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`void`

---

### ICliDetectionCache

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L70)

Interface for CLI detection cache.
Allows dependency injection for testing.

#### Methods

##### get()

```ts
get(cli): CliHealthResult | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L72)

Get cached health result for a CLI

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

[`CliHealthResult`](#clihealthresult) \| `undefined`

##### getAll()

```ts
getAll(): ReadonlyMap<"claude" | "gemini" | "codex" | "opencode", CliHealthResult>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L84)

Get all cached results

###### Returns

`ReadonlyMap`\<`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`, [`CliHealthResult`](#clihealthresult)\>

##### getEffectiveTtl()

```ts
getEffectiveTtl(cli): number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L90)

Get effective TTL for a CLI (accounts for adaptive adjustments)

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`number`

##### getStats()

```ts
getStats(): CliCacheStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L87)

Get cache statistics

###### Returns

[`CliCacheStats`](#clicachestats)

##### invalidate()

```ts
invalidate(cli?): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L81)

Invalidate cache for a specific CLI or all CLIs

###### Parameters

###### cli?

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`void`

##### isStale()

```ts
isStale(cli): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L78)

Check if cache entry is stale

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### Returns

`boolean`

##### set()

```ts
set(cli, result): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L75)

Set health result for a CLI

###### Parameters

###### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### result

[`CliHealthResult`](#clihealthresult)

###### Returns

`void`

---

### ICliResponseParser

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:215](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L215)

Response parser interface for defensive parsing.
(Source: docs/research/cli-integration-architecture.md)

#### Type Parameters

##### T

`T` = `unknown`

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L217)

Parser name (for logging)

##### supportedVersionRange

```ts
readonly supportedVersionRange: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L219)

Supported version range (semver)

#### Methods

##### extractErrorMessage()?

```ts
optional extractErrorMessage(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:249](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L249)

Extracts an error-only message from a failure stream — when the CLI
surfaced an error event but no usable assistant content (so
[extractResponse](#extractresponse-3) returns `null`). Optional: parsers that don't
distinguish error-only streams omit it, and the caller falls back to the
generic unparseable-output recovery. OpenCode's NDJSON `{"type":"error"}`
events are the motivating case — without this the message is misclassified
as PARSE_ERROR instead of NOT_AUTHENTICATED / RATE_LIMITED.

###### Parameters

###### raw

`string`

Raw CLI output

###### Returns

`string` \| `null`

The extracted error message, or `null` if none / not applicable

##### extractResponse()

```ts
extractResponse(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:235](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L235)

Extracts just the response text (most stable field).

###### Parameters

###### raw

`string`

Raw CLI output

###### Returns

`string` \| `null`

Response text or null

##### extractSessionId()

```ts
extractSessionId(raw): string | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:265](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L265)

Extracts session ID (for resumption).

###### Parameters

###### raw

`string`

Raw CLI output

###### Returns

`string` \| `null`

Session ID or null

##### extractUsage()

```ts
extractUsage(raw): CliTokenUsage | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L257)

Extracts token usage (may not be present).

###### Parameters

###### raw

`string`

Raw CLI output

###### Returns

[`CliTokenUsage`](#clitokenusage) \| `null`

Token usage or null

##### parse()

```ts
parse(raw): T | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:227](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L227)

Parses raw CLI output to typed response.

###### Parameters

###### raw

`string`

Raw CLI output

###### Returns

`T` \| `null`

Parsed response or null if unrecognized

---

### ICompositeRouter

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L150)

Composite router interface for dependency injection.

#### Methods

##### executeTask()

```ts
executeTask(task): Promise<Result<CliResponse,
  | CliError
| CompositeRoutingError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L152)

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse),
\| [`CliError`](#clierror)
\| [`CompositeRoutingError`](#compositeroutingerror)\>\>

##### getCapacityDashboard()

```ts
getCapacityDashboard(): Promise<Map<RoutingArmId, CapacityStatus>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L171)

Get capacity status for all registered routing arms (Issue #807, #3422)

###### Returns

`Promise`\<`Map`\<`RoutingArmId`, [`CapacityStatus`](#capacitystatus)\>\>

##### getLatencyTracker()

```ts
getLatencyTracker(): ILatencyTracker | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L164)

###### Returns

`ILatencyTracker` \| `undefined`

##### getMetricsCollector()

```ts
getMetricsCollector(): IRoutingMetricsCollector | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L167)

Get the metrics collector (if configured) (Issue #559)

###### Returns

`IRoutingMetricsCollector` \| `undefined`

##### getOrchestrationObserver()

```ts
getOrchestrationObserver():
  | IOrchestrationObserver
  | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L169)

Get the orchestration observer (if configured) (Issue #587)

###### Returns

\| [`IOrchestrationObserver`](observability.md#iorchestrationobserver)
\| `undefined`

##### getRoutingMemory()

```ts
getRoutingMemory(): IRoutingMemory | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L165)

###### Returns

`IRoutingMemory` \| `undefined`

##### getStats()

```ts
getStats(): CompositeRouterStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L161)

###### Returns

[`CompositeRouterStats`](#compositerouterstats)

##### getZeroRouter()

```ts
getZeroRouter(): IZeroRouter | undefined;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L163)

###### Returns

`IZeroRouter` \| `undefined`

##### hasMinimumPreferenceData()

```ts
hasMinimumPreferenceData(): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L162)

###### Returns

`boolean`

##### recordDifficultyOutcome()

```ts
recordDifficultyOutcome(
   task,
   success,
   qualityScore?): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L160)

###### Parameters

###### task

[`CliTask`](#clitask)

###### success

`boolean`

###### qualityScore?

`number`

###### Returns

`void`

##### recordOutcome()

```ts
recordOutcome(
   cliName,
   task,
   reward): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L154)

Record a bandit outcome for a distinct routing arm (CLI slot or api:\* arm) (#3422).

###### Parameters

###### cliName

`RoutingArmId`

###### task

[`CliTask`](#clitask)

###### reward

`number`

###### Returns

`void`

##### recordPreference()

```ts
recordPreference(
   query,
   strongPreferred,
   quality?): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L155)

###### Parameters

###### query

`string`

###### strongPreferred

`boolean`

###### quality?

###### strong?

`number`

###### weak?

`number`

###### Returns

`void`

##### route()

```ts
route(task): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L151)

###### Parameters

###### task

[`CliTask`](#clitask)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`CompositeRoutingDecision`](#compositeroutingdecision), [`CompositeRoutingError`](#compositeroutingerror)\>\>

---

### IPreferenceDataStore

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L190)

Interface for the preference data store.

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L202)

Clear all data

###### Returns

`void`

##### findSimilar()

```ts
findSimilar(features, limit): readonly PreferenceDataPoint[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L198)

Find similar data points based on features

###### Parameters

###### features

[`QueryFeatures`](#queryfeatures)

###### limit

`number`

###### Returns

readonly [`PreferenceDataPoint`](#preferencedatapoint)[]

##### getAll()

```ts
getAll(): readonly PreferenceDataPoint[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L194)

Get all data points

###### Returns

readonly [`PreferenceDataPoint`](#preferencedatapoint)[]

##### getByDomain()

```ts
getByDomain(domain): readonly PreferenceDataPoint[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L196)

Get data points by domain

###### Parameters

###### domain

`string`

###### Returns

readonly [`PreferenceDataPoint`](#preferencedatapoint)[]

##### getStats()

```ts
getStats(): PreferenceModelStats;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L200)

Get statistics

###### Returns

[`PreferenceModelStats`](#preferencemodelstats)

##### store()

```ts
store(dataPoint): void;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L192)

Store a new preference data point

###### Parameters

###### dataPoint

[`PreferenceDataPoint`](#preferencedatapoint)

###### Returns

`void`

---

### IRoutingMemory

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:287](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L287)

Memory interface for routing-related data.
Bridges memory backend and routing systems.

This interface enables:

- #148 Preference-Trained Routing: Store preferences and outcomes
- #149 MobiMem Evolution: Store experiences and action patterns

#### Example

```typescript
const routingMemory = createRoutingMemory(memoryBackend);

// Store a routing decision and outcome
await routingMemory.storePreference(decision, outcome, preference);

// Get preferences for training
const prefs = await routingMemory.getPreferences({ taskType: 'code' }, 100);

// Store experience for MobiMem
await routingMemory.storeExperience(experience);
```

#### Methods

##### export()

```ts
export(): Promise<Result<RoutingMemoryExport, RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:358](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L358)

Export all routing memory for training or backup.

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`RoutingMemoryExport`](#routingmemoryexport), [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### getActions()

```ts
getActions(taskType, limit): Promise<Result<ActionRecord[], RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:349](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L349)

Retrieve cached actions for a task type.

###### Parameters

###### taskType

`string`

Type of task

###### limit

`number`

Maximum actions to return

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ActionRecord`](#actionrecord)[], [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### getExperiences()

```ts
getExperiences(query, limit): Promise<Result<ExperienceRecord[], RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:329](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L329)

Retrieve relevant experiences for a task.

###### Parameters

###### query

`string`

Semantic query for experience retrieval

###### limit

`number`

Maximum experiences to return

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ExperienceRecord`](#experiencerecord)[], [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### getPreferences()

```ts
getPreferences(filter, limit): Promise<Result<PreferenceRecord[], RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L309)

Retrieve preference data for training.

###### Parameters

###### filter

[`PreferenceFilter`](#preferencefilter)

Filter criteria for preferences

###### limit

`number`

Maximum records to return

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`PreferenceRecord`](#preferencerecord)[], [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### getStats()

```ts
getStats(): Promise<Result<RoutingMemoryStats, RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:373](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L373)

Get memory statistics.

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`RoutingMemoryStats`](#routingmemorystats-1), [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### import()

```ts
import(data): Promise<Result<void, RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:364](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L364)

Import routing memory from export.

###### Parameters

###### data

[`RoutingMemoryExport`](#routingmemoryexport)

The exported data to import

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### storeAction()

```ts
storeAction(action): Promise<Result<void, RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:342](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L342)

Store a successful action pattern.

###### Parameters

###### action

[`ActionRecord`](#actionrecord)

The action pattern to cache

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### storeExperience()

```ts
storeExperience(experience): Promise<Result<void, RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:322](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L322)

Store an experience record for evolution.

###### Parameters

###### experience

[`ExperienceRecord`](#experiencerecord)

The experience to store

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`RoutingMemoryError`](#routingmemoryerror)\>\>

##### storePreference()

```ts
storePreference(
   decision,
   outcome,
preference?): Promise<Result<void, RoutingMemoryError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:298](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L298)

Store a routing decision with its outcome for preference learning.

###### Parameters

###### decision

[`RoutingDecisionRecord`](#routingdecisionrecord)

The routing decision made

###### outcome

[`TaskOutcomeRecord`](#taskoutcomerecord)

The task outcome (success, quality, duration)

###### preference?

[`PreferenceSignal`](#preferencesignal)

Optional explicit preference signal

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`RoutingMemoryError`](#routingmemoryerror)\>\>

---

### PreferenceDataPoint

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L17)

A single preference data point comparing model outputs.

#### Properties

##### domain?

```ts
readonly optional domain?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L33)

Domain or task category

##### features

```ts
readonly features: QueryFeatures;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L23)

Extracted query features

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L19)

Unique identifier

##### query

```ts
readonly query: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L21)

The input query

##### recordedAt

```ts
readonly recordedAt: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L31)

When this preference was recorded

##### strongModelPreferred

```ts
readonly strongModelPreferred: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L25)

Whether the strong model was preferred

##### strongModelQuality?

```ts
readonly optional strongModelQuality?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L27)

Optional: actual strong model response quality score

##### weakModelQuality?

```ts
readonly optional weakModelQuality?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L29)

Optional: actual weak model response quality score

---

### PreferenceFilter

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L145)

Filter for preference queries.

#### Properties

##### cliName?

```ts
readonly optional cliName?: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L149)

Filter by CLI name

##### minQuality?

```ts
readonly optional minQuality?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L155)

Minimum quality score

##### preferenceSource?

```ts
readonly optional preferenceSource?: "human" | "ai" | "implicit";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L157)

Filter by preference source

##### since?

```ts
readonly optional since?: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L151)

Records after this date

##### taskType?

```ts
readonly optional taskType?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L147)

Filter by task type

##### until?

```ts
readonly optional until?: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L153)

Records before this date

---

### PreferenceModelStats

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L172)

Statistics about the preference router's learned model.

#### Properties

##### dataPointsByDomain

```ts
readonly dataPointsByDomain: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L176)

Data points by domain

##### estimatedCostSavingsRate

```ts
readonly estimatedCostSavingsRate: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L182)

Estimated cost savings rate

##### lastUpdatedAt

```ts
readonly lastUpdatedAt: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L184)

Last updated timestamp

##### routingAccuracy?

```ts
readonly optional routingAccuracy?: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L180)

Routing accuracy (if validation data available)

##### strongModelPreferenceRate

```ts
readonly strongModelPreferenceRate: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L178)

Average strong model preference rate

##### totalDataPoints

```ts
readonly totalDataPoints: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L174)

Total data points collected

---

### PreferencePrediction

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L61)

Result of a preference prediction.

#### Properties

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L65)

Confidence in this prediction (0-1)

##### features

```ts
readonly features: QueryFeatures;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L67)

Features used for prediction

##### strongModelProbability

```ts
readonly strongModelProbability: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L63)

Probability that strong model is significantly better

##### supportingDataPoints

```ts
readonly supportingDataPoints: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L69)

Number of similar data points used

---

### PreferenceRecord

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L131)

Combined preference record for training.

#### Properties

##### computedReward

```ts
readonly computedReward: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L139)

Computed reward signal

##### decision

```ts
readonly decision: RoutingDecisionRecord;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L133)

The routing decision

##### outcome

```ts
readonly outcome: TaskOutcomeRecord;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L135)

The task outcome

##### preference?

```ts
readonly optional preference?: PreferenceSignal;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L137)

Explicit preference (if provided)

---

### PreferenceRouterConfig

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L107)

Preference router configuration.

#### Properties

##### domainThresholds?

```ts
readonly optional domainThresholds?: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L121)

Domain-specific threshold overrides

##### enableOnlineLearning

```ts
readonly enableOnlineLearning: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L119)

Whether to enable online learning

##### maxDataPoints

```ts
readonly maxDataPoints: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L117)

Maximum data points to store

##### minDataPoints

```ts
readonly minDataPoints: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L115)

Minimum data points before using learned routing

##### routingThreshold

```ts
readonly routingThreshold: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L113)

Threshold for routing to strong model (0-1)

##### strongModel

```ts
readonly strongModel: ModelTier;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L109)

Strong model configuration

##### weakModel

```ts
readonly weakModel: ModelTier;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L111)

Weak model configuration

---

### PreferenceRoutingDecision

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L75)

Routing decision based on preference prediction.

#### Properties

##### estimatedCostSavings

```ts
readonly estimatedCostSavings: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L87)

Cost savings compared to always using strong model

##### prediction

```ts
readonly prediction: PreferencePrediction;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L81)

Preference prediction details

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L83)

Reason for selection

##### routingLatencyMs

```ts
readonly routingLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L85)

Routing decision time in ms

##### selectedCli

```ts
readonly selectedCli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L79)

Selected adapter

##### selectedTier

```ts
readonly selectedTier: "strong" | "weak";
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L77)

Selected model tier

---

### PreferenceSignal

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L115)

Explicit preference signal from human or AI feedback.

#### Properties

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L125)

Confidence in the preference (0-1)

##### preferred

```ts
readonly preferred: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L119)

Preferred CLI for this task type

##### reason?

```ts
readonly optional reason?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L123)

Optional reasoning

##### rejected?

```ts
readonly optional rejected?: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L121)

Rejected CLI (if comparative preference)

##### source

```ts
readonly source: "human" | "ai" | "implicit";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L117)

Source of the preference

---

### QueryFeatures

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L39)

Features extracted from a query for preference prediction.

#### Properties

##### complexity

```ts
readonly complexity: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L43)

Complexity score (0-1)

##### domain

```ts
readonly domain: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L53)

Domain category

##### hasAmbiguity

```ts
readonly hasAmbiguity: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L51)

Whether query has ambiguity

##### keywordSignature

```ts
readonly keywordSignature: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L55)

Keywords present (hashed for privacy)

##### requiresCode

```ts
readonly requiresCode: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L47)

Whether query requires code generation

##### requiresCreativity

```ts
readonly requiresCreativity: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L49)

Whether query requires creativity

##### requiresReasoning

```ts
readonly requiresReasoning: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L45)

Whether query requires reasoning

##### tokenCount

```ts
readonly tokenCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L41)

Query length in tokens (estimated)

---

### RoutingDecisionRecord

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L69)

Record of a routing decision.

#### Properties

##### alternatives

```ts
readonly alternatives: readonly ("claude" | "gemini" | "codex" | "opencode")[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L85)

Alternative CLIs considered

##### budgetConstraint?

```ts
readonly optional budgetConstraint?: BudgetConstraint;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L89)

Budget constraint applied (if any)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L83)

Confidence score (0-1)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L71)

Unique decision ID

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L87)

Reasoning for selection

##### selectedCli

```ts
readonly selectedCli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L81)

CLI selected for execution

##### taskId

```ts
readonly taskId: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L75)

Associated task ID

##### taskProfile

```ts
readonly taskProfile: TaskProfileSummary;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L79)

Summary of task profile

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L77)

Task type classification

##### timestamp

```ts
readonly timestamp: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L73)

When the decision was made

---

### RoutingMemoryExport

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L230)

Export format for routing memory.
Version field enables future schema migrations.

#### Properties

##### actions

```ts
readonly actions: readonly ActionRecord[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:240](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L240)

Action records

##### experiences

```ts
readonly experiences: readonly ExperienceRecord[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:238](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L238)

Experience records

##### exportedAt

```ts
readonly exportedAt: Date;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:234](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L234)

When the export was created

##### preferences

```ts
readonly preferences: readonly PreferenceRecord[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:236](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L236)

Preference records

##### version

```ts
readonly version: "1.0";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:232](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L232)

Schema version

---

### RoutingMemoryStats

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:246](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L246)

Statistics for routing memory.

#### Properties

##### actionCount

```ts
readonly actionCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:252](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L252)

Total action records

##### experienceCount

```ts
readonly experienceCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L250)

Total experience records

##### newestRecord

```ts
readonly newestRecord: Date | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L256)

Newest record timestamp

##### oldestRecord

```ts
readonly oldestRecord: Date | null;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L254)

Oldest record timestamp

##### preferenceCount

```ts
readonly preferenceCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:248](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L248)

Total preference records

##### totalStorageBytes

```ts
readonly totalStorageBytes: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:258](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L258)

Estimated storage size in bytes

---

### TaskOutcomeRecord

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L95)

Record of a task outcome.

#### Properties

##### decisionId

```ts
readonly decisionId: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L97)

Associated decision ID

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L103)

Execution duration in milliseconds

##### errorCategory?

```ts
readonly optional errorCategory?: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L109)

Error category (if failed)

##### qualityScore

```ts
readonly qualityScore: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L101)

Quality score (0-1)

##### retryCount

```ts
readonly retryCount: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L107)

Number of retries

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L99)

Whether task succeeded

##### tokenUsage

```ts
readonly tokenUsage: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L105)

Token usage

---

### TaskProfileSummary

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L55)

Summary of task profile for storage (avoids circular deps with TaskProfile).

#### Properties

##### codeGeneration

```ts
readonly codeGeneration: boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L61)

Whether code generation is primary task

##### contextRequired

```ts
readonly contextRequired: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L59)

Context tokens required

##### reasoningComplexity

```ts
readonly reasoningComplexity: number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L57)

Estimated reasoning complexity (0-1)

##### taskType

```ts
readonly taskType: "code" | "reasoning" | "knowledge" | "mixed";
```

Defined in: [packages/nexus-agents/src/cli-adapters/routing-memory-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/routing-memory-types.ts#L63)

Task type classification

---

### TimeoutProfile

Defined in: [packages/nexus-agents/src/config/defaults-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/defaults-types.ts#L25)

Timeout profile structure for CLI tools.

#### Properties

##### complex

```ts
readonly complex: number;
```

Defined in: [packages/nexus-agents/src/config/defaults-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/defaults-types.ts#L31)

Timeout for complex tasks (codebase-wide changes, deep analysis) in ms

##### simple

```ts
readonly simple: number;
```

Defined in: [packages/nexus-agents/src/config/defaults-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/defaults-types.ts#L27)

Timeout for simple tasks (single function, quick analysis) in ms

##### standard

```ts
readonly standard: number;
```

Defined in: [packages/nexus-agents/src/config/defaults-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/defaults-types.ts#L29)

Timeout for standard tasks (multi-file changes, moderate analysis) in ms

---

### VersionRequirements

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:271](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L271)

Version requirements for CLIs.

#### Properties

##### breaking

```ts
readonly breaking: readonly string[];
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L277)

Known breaking versions

##### minimum

```ts
readonly minimum: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:273](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L273)

Minimum supported version

##### recommended

```ts
readonly recommended: string;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:275](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L275)

Recommended version

## Type Aliases

### CircuitBreakerFailureCategory

```ts
type CircuitBreakerFailureCategory =
  | 'timeout'
  | 'crash'
  | 'authentication'
  | 'rate_limit'
  | 'connection'
  | 'unknown';
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L24)

Categories of failures for circuit breaker decisions.

---

### CircuitState

```ts
type CircuitState = 'closed' | 'open' | 'half-open';
```

Defined in: [packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts#L19)

Circuit breaker states.

---

### CliErrorCode

```ts
type CliErrorCode =
  | 'NOT_FOUND'
  | 'NOT_AUTHENTICATED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'CONNECTION_ERROR'
  | 'EXECUTION_ERROR'
  | 'UNSUPPORTED_VERSION'
  | 'BUDGET_EXCEEDED'
  | 'UNKNOWN';
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L108)

Error codes for CLI operations.

---

### CliName

```ts
type CliName = CliNameLiteral;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L16)

Supported CLI names.
Derived from canonical source: config/model-capabilities-types.ts CliNameLiteral

---

### CliTaskComplexity

```ts
type CliTaskComplexity = 'simple' | 'standard' | 'complex';
```

Defined in: [packages/nexus-agents/src/config/defaults-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/config/defaults-types.ts#L20)

Task complexity levels for CLI timeout selection.

---

### CliTransport

```ts
type CliTransport = 'mcp' | 'subprocess';
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L68)

Transport type for CLI communication.

- 'mcp': Uses Model Context Protocol (most stable)
- 'subprocess': Spawns CLI process with JSON output

---

### CompositeRouterConfig

```ts
type CompositeRouterConfig = z.infer<typeof CompositeRouterConfigSchema>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L96)

CLI Adapters exports - CLI integration with defensive parsing
Split from index.ts for file size compliance (Issue #285)

---

### VersionStatus

```ts
type VersionStatus = 'supported' | 'outdated' | 'breaking' | 'unsupported';
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-core.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-core.ts#L139)

Version compatibility status.

## Variables

### CLI_DEFAULT_CACHE_CONFIG

```ts
const CLI_DEFAULT_CACHE_CONFIG: CliDetectionCacheConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L55)

Default cache configuration.

---

### CLI_DEFAULT_CAPABILITIES

```ts
const CLI_DEFAULT_CAPABILITIES: Record<CliName, CliCapabilityProfile>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:314](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L314)

CLI Adapters exports - CLI integration with defensive parsing
Split from index.ts for file size compliance (Issue #285)

---

### CLI_DEFAULT_COMPOSITE_CONFIG

```ts
const CLI_DEFAULT_COMPOSITE_CONFIG: CompositeRouterConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L137)

Default configuration.

---

### CLI_TIMEOUT_PROFILES

```ts
const CLI_TIMEOUT_PROFILES: Record<string, TimeoutProfile>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts#L26)

Per-CLI timeout profiles. Canonical source: `config/timeouts.ts`.

---

### CLI_VERSION_REQUIREMENTS

```ts
const CLI_VERSION_REQUIREMENTS: Record<CliName, VersionRequirements>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/types-capability.ts:284](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/types-capability.ts#L284)

CLI version requirements.
(Source: docs/research/cli-integration-architecture.md)

---

### CliDetectionCacheConfigSchema

```ts
const CliDetectionCacheConfigSchema: ZodObject<
  {
    ttlMs: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L48)

Zod schema for cache configuration validation.

---

### CompositeRouterConfigSchema

```ts
const CompositeRouterConfigSchema: ZodObject<
  {
    billingMode: ZodDefault<
      ZodEnum<{
        api: 'api';
        plan: 'plan';
      }>
    >;
    budgetConstraints: ZodOptional<
      ZodObject<
        {
          maxCostUsd: ZodOptional<ZodNumber>;
          maxLatencyMs: ZodOptional<ZodNumber>;
          maxTokens: ZodOptional<ZodNumber>;
        },
        $strip
      >
    >;
    enableBudgetFilter: ZodDefault<ZodBoolean>;
    enableCapabilityMatch: ZodDefault<ZodBoolean>;
    enableCapacityBalancing: ZodDefault<ZodBoolean>;
    enableConfidenceCascade: ZodDefault<ZodBoolean>;
    enableKnnRouting: ZodDefault<ZodBoolean>;
    enableLatencyTracking: ZodDefault<ZodBoolean>;
    enableLinUCBSelection: ZodDefault<ZodBoolean>;
    enablePreferenceRouting: ZodDefault<ZodBoolean>;
    enableQualityConstraint: ZodDefault<ZodBoolean>;
    enableResourceStrategy: ZodDefault<ZodBoolean>;
    enableRoutingMemory: ZodDefault<ZodBoolean>;
    enableStrategyDistillation: ZodDefault<ZodBoolean>;
    enableTopsisRanking: ZodDefault<ZodBoolean>;
    enableZeroRouter: ZodDefault<ZodBoolean>;
    latencyScoreWeight: ZodDefault<ZodNumber>;
    linucbAlpha: ZodDefault<ZodNumber>;
    maxDecisionTimeMs: ZodDefault<ZodNumber>;
    preferenceMinDataPoints: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router-types.ts#L46)

Configuration schema for CompositeRouter.

---

### DEFAULT_PREFERENCE_ROUTER_CONFIG

```ts
const DEFAULT_PREFERENCE_ROUTER_CONFIG: PreferenceRouterConfig;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L127)

Default preference router configuration.

---

### DEFAULT_TIMEOUT_PROFILE

```ts
const DEFAULT_TIMEOUT_PROFILE: TimeoutProfile = CLI_TIMEOUTS.default;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts#L33)

Default timeout profile. Canonical source: `config/timeouts.ts`.

---

### PreferenceRouterConfigSchema

```ts
const PreferenceRouterConfigSchema: ZodObject<
  {
    domainThresholds: ZodOptional<ZodRecord<ZodString, ZodNumber>>;
    enableOnlineLearning: ZodDefault<ZodBoolean>;
    maxDataPoints: ZodDefault<ZodNumber>;
    minDataPoints: ZodDefault<ZodNumber>;
    routingThreshold: ZodDefault<ZodNumber>;
    strongModel: ZodObject<
      {
        cli: ZodEnum<{
          claude: 'claude';
          codex: 'codex';
          gemini: 'gemini';
          opencode: 'opencode';
        }>;
        costPerMillionTokens: ZodNumber;
        qualityBaseline: ZodNumber;
        tier: ZodLiteral<'strong'>;
      },
      $strip
    >;
    weakModel: ZodObject<
      {
        cli: ZodEnum<{
          claude: 'claude';
          codex: 'codex';
          gemini: 'gemini';
          opencode: 'opencode';
        }>;
        costPerMillionTokens: ZodNumber;
        qualityBaseline: ZodNumber;
        tier: ZodLiteral<'weak'>;
      },
      $strip
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router-types.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router-types.ts#L149)

Zod schema for config validation.

## Functions

### cliCalculateBackoffDelay()

```ts
function cliCalculateBackoffDelay(attempt, baseDelayMs, maxDelayMs): number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L62)

Calculates exponential backoff delay with jitter.

#### Parameters

##### attempt

`number`

Current attempt number (1-indexed)

##### baseDelayMs

`number`

Base delay in milliseconds

##### maxDelayMs

`number`

Maximum delay cap in milliseconds

#### Returns

`number`

Delay in milliseconds with jitter applied

---

### cliCategorizeError()

```ts
function cliCategorizeError(error): CircuitBreakerFailureCategory;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L82)

Categorizes a CLI error for circuit breaker tracking.
Returns a FailureCategory compatible with the circuit breaker.

#### Parameters

##### error

[`CliError`](#clierror)

#### Returns

[`CircuitBreakerFailureCategory`](#circuitbreakerfailurecategory)

---

### createAllAdapters()

```ts
function createAllAdapters(logger?, codexTransport?): Map<RoutingArmId, ICliAdapter>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L112)

Creates all available routing-arm adapters.
Uses MCP transport for Codex by default (preferred).

The four CLI slots are always registered under their slot key. When
`NEXUS_BILLING_MODE=api`, the direct-API adapters whose keys are present are
ALSO appended as distinct `api:<vendor>` routing arms (#3422) so the router /
bandit can score them separately from the CLI slots. DEFAULT (plan) mode
returns CLIs only — never surprise API spend. Key-presence-only and
deterministic; keys are never validated by calling out.

#### Parameters

##### logger?

[`ILogger`](core.md#ilogger)

Optional shared logger

##### codexTransport?

[`CliTransport`](#clitransport) = `'mcp'`

Transport for Codex (default: 'mcp')

#### Returns

`Map`\<`RoutingArmId`, [`ICliAdapter`](#icliadapter)\>

Map of routing arm id to adapter

---

### createCliAdapter()

```ts
function createCliAdapter(config): ICliAdapter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L52)

Creates a CLI adapter based on configuration.

#### Parameters

##### config

[`CliAdapterConfig`](#cliadapterconfig)

Adapter configuration

#### Returns

[`ICliAdapter`](#icliadapter)

The configured CLI adapter

#### Throws

Error if CLI name is not supported

#### Example

```typescript
const adapter = createCliAdapter({ cli: 'claude', model: 'claude-opus-4' });
const result = await adapter.execute({ content: 'Hello!' });
```

---

### createCliCircuitBreakerIntegration()

```ts
function createCliCircuitBreakerIntegration(
  adapters,
  config?,
  logger?
): CliCircuitBreakerIntegration;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts:238](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-circuit-breaker.ts#L238)

Creates a CLI circuit breaker integration with the specified adapters.

#### Parameters

##### adapters

readonly [`ICliAdapter`](#icliadapter)[]

##### config?

[`CliCircuitBreakerConfig`](#clicircuitbreakerconfig)

##### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`CliCircuitBreakerIntegration`](#clicircuitbreakerintegration)

---

### createCliDetectionCache()

```ts
function createCliDetectionCache(config?): ICliDetectionCache;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-detection-cache.ts#L262)

Creates a CLI detection cache instance.

#### Parameters

##### config?

`Partial`\<[`CliDetectionCacheConfig`](#clidetectioncacheconfig)\>

Optional cache configuration

#### Returns

[`ICliDetectionCache`](#iclidetectioncache)

CLI detection cache

#### Example

```typescript
const cache = createCliDetectionCache({ ttlMs: 60_000 }); // 1 minute TTL
const result = cache.get('claude');
if (!result) {
  const health = await adapter.healthCheck();
  cache.set('claude', CliDetectionCache.fromHealthStatus(health));
}
```

---

### createCompositeRouter()

```ts
function createCompositeRouter(adapters, config?, logger?): ICompositeRouter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/composite-router.ts:944](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/composite-router.ts#L944)

Creates a CompositeRouter instance.

#### Parameters

##### adapters

`Map`\<`RoutingArmId`, [`ICliAdapter`](#icliadapter)\>

##### config?

`Partial`\<`CompositeRouterConfigWithPreference`\>

##### logger?

[`ILogger`](core.md#ilogger)

#### Returns

[`ICompositeRouter`](#icompositerouter)

---

### createPreferenceRouter()

```ts
function createPreferenceRouter(config?, dataStore?): PreferenceRouter;
```

Defined in: [packages/nexus-agents/src/cli-adapters/preference-router.ts:243](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/preference-router.ts#L243)

Create a PreferenceRouter instance.

#### Parameters

##### config?

`Partial`\<[`PreferenceRouterConfig`](#preferencerouterconfig)\>

##### dataStore?

[`IPreferenceDataStore`](#ipreferencedatastore)

#### Returns

[`PreferenceRouter`](#preferencerouter)

---

### estimateTaskComplexity()

```ts
function estimateTaskComplexity(taskDescription): CliTaskComplexity;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts#L41)

Estimate task complexity from description. Canonical: `cli-timeout-helpers.ts`.

#### Parameters

##### taskDescription

`string`

#### Returns

[`CliTaskComplexity`](#clitaskcomplexity)

---

### executeCliRetryLoop()

```ts
function executeCliRetryLoop(executeFn, config): Promise<Result<CliRetryResult, CliError>>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L107)

Executes a CLI operation with retry logic and optional circuit breaker.

Used by both BaseCliAdapter (no circuit breaker) and GeminiCliAdapter
(with circuit breaker) to eliminate duplicate retry implementations.

#### Parameters

##### executeFn

() => `Promise`\<[`Result`](core.md#result)\<[`CliResponse`](#cliresponse), [`CliError`](#clierror)\>\>

##### config

[`CliRetryLoopConfig`](#cliretryloopconfig)

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`CliRetryResult`](#cliretryresult), [`CliError`](#clierror)\>\>

---

### getAvailableClis()

```ts
function getAvailableClis(cache?): Promise<('claude' | 'gemini' | 'codex' | 'opencode')[]>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L216)

Gets all available CLIs by running health checks.
Uses cache if provided to avoid repeated subprocess calls.

#### Parameters

##### cache?

[`ICliDetectionCache`](#iclidetectioncache)

Optional cache to use

#### Returns

`Promise`\<(`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`)[]\>

Array of available CLI names

---

### getTimeoutForTask()

```ts
function getTimeoutForTask(cli, complexity): number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts#L36)

Get timeout for a task. Canonical source: `config/timeouts.ts`.

#### Parameters

##### cli

`string`

##### complexity

[`CliTaskComplexity`](#clitaskcomplexity)

#### Returns

`number`

---

### getTimeoutForTaskAuto()

```ts
function getTimeoutForTaskAuto(cli, taskDescription): number;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.ts#L49)

Get timeout with automatic complexity estimation.
Uses adaptive timeout from outcome history when sufficient data exists (#1534).

#### Parameters

##### cli

`string`

##### taskDescription

`string`

#### Returns

`number`

---

### isCliAvailable()

```ts
function isCliAvailable(cli, cache?): Promise<boolean>;
```

Defined in: [packages/nexus-agents/src/cli-adapters/factory.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/factory.ts#L142)

Checks if a CLI is available by running a health check.
Uses cache if provided to avoid repeated subprocess calls.

#### Parameters

##### cli

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

CLI name to check

##### cache?

[`ICliDetectionCache`](#iclidetectioncache)

Optional cache to use

#### Returns

`Promise`\<`boolean`\>

True if CLI is healthy

---

### isCliRetryableError()

```ts
function isCliRetryableError(code): boolean;
```

Defined in: [packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/cli-adapters/cli-retry-loop.ts#L74)

Determines if an error code is retryable.

#### Parameters

##### code

[`CliErrorCode`](#clierrorcode-1)

#### Returns

`boolean`
