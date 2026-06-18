---
title: 'API: exports/benchmarks'
description: Generated API reference for exports/benchmarks.
tier: 2
---

# exports/benchmarks

Benchmarks barrel exports

Exposes the BenchmarkAdapter contract (#1960, #1961) and the existing
memory/token/adapter-latency benchmark utilities to external consumers.

## Classes

### LatencySampler

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L29)

Sample collector for latency measurements.

#### Constructors

##### Constructor

```ts
new LatencySampler(): LatencySampler;
```

###### Returns

[`LatencySampler`](#latencysampler)

#### Methods

##### end()

```ts
end(id): number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L43)

End timing and record the sample.

###### Parameters

###### id

`string`

###### Returns

`number`

##### getMetrics()

```ts
getMetrics(): LatencyMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L69)

Calculate latency metrics from collected samples.

###### Returns

[`LatencyMetrics`](#latencymetrics)

##### record()

```ts
record(durationMs): void;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L62)

Record a sample directly.

###### Parameters

###### durationMs

`number`

###### Returns

`void`

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L100)

Reset collected samples.

###### Returns

`void`

##### start()

```ts
start(id): void;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L36)

Start timing an operation.

###### Parameters

###### id

`string`

###### Returns

`void`

---

### MemoryError

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L89)

Error class for memory operations.

#### Extends

- [`NexusError`](../core.md#nexuserror)

#### Constructors

##### Constructor

```ts
new MemoryError(message, options?): MemoryError;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L90)

###### Parameters

###### message

`string`

###### options?

`Partial`\<`Omit`\<\{
`cause?`: `Error`;
`code`: [`ErrorCode`](../core.md#errorcode);
`context?`: `Record`\<`string`, `unknown`\>;
\}, `"code"`\>\>

###### Returns

[`MemoryError`](#memoryerror)

###### Overrides

[`NexusError`](../core.md#nexuserror).[`constructor`](../core.md#constructor-3)

#### Properties

##### cause

```ts
readonly cause: Error | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L94)

###### Inherited from

[`NexusError`](../core.md#nexuserror).[`cause`](../core.md#cause-3)

##### code

```ts
readonly code: ErrorCode;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L92)

###### Inherited from

[`NexusError`](../core.md#nexuserror).[`code`](../core.md#code-3)

##### context

```ts
readonly context: Record<string, unknown> | undefined;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L93)

###### Inherited from

[`NexusError`](../core.md#nexuserror).[`context`](../core.md#context-3)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

[`NexusError`](../core.md#nexuserror).[`message`](../core.md#message-3)

##### name

```ts
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

[`NexusError`](../core.md#nexuserror).[`name`](../core.md#name-3)

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`NexusError`](../core.md#nexuserror).[`stack`](../core.md#stack-3)

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

[`NexusError`](../core.md#nexuserror).[`stackTraceLimit`](../core.md#stacktracelimit-3)

#### Methods

##### toJSON()

```ts
toJSON(): SerializedError;
```

Defined in: [packages/nexus-agents/src/core/errors.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/core/errors.ts#L110)

Serializes the error to a JSON-safe object.

###### Returns

[`SerializedError`](../core.md#serializederror)

###### Inherited from

[`NexusError`](../core.md#nexuserror).[`toJSON`](../core.md#tojson-3)

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

[`NexusError`](../core.md#nexuserror).[`captureStackTrace`](../core.md#capturestacktrace-3)

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

[`NexusError`](../core.md#nexuserror).[`prepareStackTrace`](../core.md#preparestacktrace-3)

## Interfaces

### AdapterLatencyConfig

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L26)

Configuration for adapter latency benchmarks.

#### Properties

##### measurementIterations

```ts
readonly measurementIterations: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L30)

Number of measured iterations per scenario.

##### timeoutMs

```ts
readonly timeoutMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L32)

Timeout per operation in milliseconds.

##### warmupIterations

```ts
readonly warmupIterations: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L28)

Number of warmup iterations (not measured).

---

### AdapterLatencyResult

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L106)

Complete adapter latency benchmark result.

#### Properties

##### environment

```ts
readonly environment: BenchmarkEnvironment;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L110)

Environment information.

##### results

```ts
readonly results: readonly AdapterScenarioResult[];
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L112)

Per-adapter, per-scenario results.

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L108)

Timestamp of the benchmark run.

##### totalDurationMs

```ts
readonly totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L114)

Total benchmark duration in milliseconds.

---

### AdapterScenarioResult

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L86)

Result for a single adapter + scenario combination.

#### Properties

##### adapterName

```ts
readonly adapterName: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L88)

CLI adapter name.

##### errors

```ts
readonly errors: readonly string[];
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L100)

Error messages from failures.

##### failureCount

```ts
readonly failureCount: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L98)

Number of failed iterations.

##### latency

```ts
readonly latency: LatencyMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L94)

Latency metrics from measured iterations.

##### scenario

```ts
readonly scenario: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L92)

Scenario name.

##### successCount

```ts
readonly successCount: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L96)

Number of successful iterations.

##### transport

```ts
readonly transport: CliTransport;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L90)

Transport type used.

---

### BenchmarkAdapter

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L72)

Contract every benchmark implementation fulfills.

Type parameters:

- `TInstance`: one task / problem in the benchmark (e.g., a SWE-bench issue)
- `TPrediction`: the solver's output (e.g., a proposed patch)
- `TEvalResult`: the evaluator's verdict (e.g., patch applied + tests passed)

A correct implementation composes as:
`loadInstances -> runInstance(each) -> evaluate(each) -> summarize`

#### Example

```ts
class SweBenchAdapter implements BenchmarkAdapter<SweIssue, SwePatch, SweEval> {
  readonly name = 'swe-bench';
  readonly variant = 'lite';
  async loadInstances(config) { ... }
  async runInstance(inst, ctx) { ... }
  async evaluate(inst, pred) { ... }
  summarize(results) { ... }
}
```

#### Type Parameters

##### TInstance

`TInstance`

##### TPrediction

`TPrediction`

##### TEvalResult

`TEvalResult`

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L74)

Stable identifier (e.g., 'swe-bench', 'humaneval'). Used in CLI routing and reporting.

##### variant?

```ts
readonly optional variant?: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L76)

Optional variant within a benchmark family (e.g., 'lite' vs 'verified').

#### Methods

##### evaluate()

```ts
evaluate(instance, prediction): Promise<TEvalResult>;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L85)

Evaluate a prediction against ground truth. Returns a benchmark-specific verdict.

###### Parameters

###### instance

`TInstance`

###### prediction

`TPrediction`

###### Returns

`Promise`\<`TEvalResult`\>

##### isPass()

```ts
isPass(result): boolean;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L88)

Determine whether a verdict counts as pass. Keeps pass/fail semantics localized.

###### Parameters

###### result

`TEvalResult`

###### Returns

`boolean`

##### loadInstances()

```ts
loadInstances(config): Promise<readonly TInstance[]>;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L79)

Load the benchmark task set from disk/remote. Runs once per invocation.

###### Parameters

###### config

`Record`\<`string`, `unknown`\>

###### Returns

`Promise`\<readonly `TInstance`[]\>

##### runInstance()

```ts
runInstance(instance, ctx): Promise<TPrediction>;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L82)

Execute the solver on one instance. No evaluation here — just generate the prediction.

###### Parameters

###### instance

`TInstance`

###### ctx

[`BenchmarkRunContext`](#benchmarkruncontext)

###### Returns

`Promise`\<`TPrediction`\>

##### summarize()

```ts
summarize(results, runTimeMs): BenchmarkRunSummary;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L91)

Aggregate instance results into a summary. Should be pure + deterministic.

###### Parameters

###### results

readonly `TEvalResult`[]

###### runTimeMs

`number`

###### Returns

[`BenchmarkRunSummary`](#benchmarkrunsummary)

---

### BenchmarkComparison

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L58)

Benchmark comparison result.

#### Properties

##### baseline

```ts
readonly baseline: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L59)

##### comparisons

```ts
readonly comparisons: readonly OperationComparison[];
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L61)

##### current

```ts
readonly current: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L60)

##### meetsMemZeroTarget

```ts
readonly meetsMemZeroTarget: boolean;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L63)

##### overallLatencyChangePercent

```ts
readonly overallLatencyChangePercent: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L62)

---

### BenchmarkConfig

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L169)

Configuration for running benchmarks.

#### Extended by

- [`MemoryBenchmarkConfig`](#memorybenchmarkconfig)

#### Properties

##### datasetSizes

```ts
readonly datasetSizes: readonly number[];
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L171)

Dataset sizes to test.

##### measurementIterations

```ts
readonly measurementIterations: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L175)

Number of measurement iterations per size.

##### thresholds

```ts
readonly thresholds: BenchmarkThresholds;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L179)

Thresholds for pass/fail.

##### timeoutMs

```ts
readonly timeoutMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L177)

Timeout per operation in milliseconds.

##### warmupIterations

```ts
readonly warmupIterations: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L173)

Number of warmup iterations.

---

### BenchmarkEnvironment

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L133)

Benchmark environment information.

#### Properties

##### arch

```ts
readonly arch: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L139)

Architecture.

##### cpuCores

```ts
readonly cpuCores: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L143)

CPU cores.

##### cpuModel

```ts
readonly cpuModel: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L141)

CPU model.

##### nodeVersion

```ts
readonly nodeVersion: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L135)

Node.js version.

##### platform

```ts
readonly platform: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L137)

Platform.

##### totalMemory

```ts
readonly totalMemory: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L145)

Total memory in bytes.

---

### BenchmarkOrchestratorOptions

Defined in: [packages/nexus-agents/src/benchmarks/orchestrator.ts:12](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/orchestrator.ts#L12)

#### Properties

##### concurrency?

```ts
readonly optional concurrency?: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/orchestrator.ts:14](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/orchestrator.ts#L14)

Max parallel `runInstance` calls. Default 1 (serial).

##### instanceTimeoutMs?

```ts
readonly optional instanceTimeoutMs?: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/orchestrator.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/orchestrator.ts#L16)

Per-instance timeout in ms. Default 300_000 (5 min).

##### limit?

```ts
readonly optional limit?: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/orchestrator.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/orchestrator.ts#L18)

Limit instances evaluated (useful for smoke runs).

##### onProgress?

```ts
readonly optional onProgress?: (completed, total, label?) => void;
```

Defined in: [packages/nexus-agents/src/benchmarks/orchestrator.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/orchestrator.ts#L20)

Progress callback.

###### Parameters

###### completed

`number`

###### total

`number`

###### label?

`string`

###### Returns

`void`

##### signal?

```ts
readonly optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/benchmarks/orchestrator.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/orchestrator.ts#L22)

Abort the whole run.

---

### BenchmarkReport

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L40)

Complete benchmark report.

#### Properties

##### comparison

```ts
readonly comparison: BenchmarkComparison | null;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L44)

##### consolidation

```ts
readonly consolidation: ConsolidationBenchmarkResult | null;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L46)

##### mem0Validation

```ts
readonly mem0Validation: readonly ClaimValidation[];
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L47)

##### overallPass

```ts
readonly overallPass: boolean;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L48)

##### suite

```ts
readonly suite: BenchmarkSuiteResult | null;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L43)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L42)

##### tokenResults

```ts
readonly tokenResults: readonly TokenBenchmarkResult[];
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L45)

##### version

```ts
readonly version: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L41)

---

### BenchmarkRunContext

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L40)

Execution context handed to a runner.

Keep this interface narrow — benchmarks that need more (e.g. access to
specific adapters) should take those as constructor args, not widen this.

#### Properties

##### onProgress?

```ts
readonly optional onProgress?: (completed, total, label?) => void;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L44)

Emit progress updates for long-running benchmarks.

###### Parameters

###### completed

`number`

###### total

`number`

###### label?

`string`

###### Returns

`void`

##### signal?

```ts
readonly optional signal?: AbortSignal;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L46)

Optional abort signal for cancellation.

##### timeoutMs

```ts
readonly timeoutMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L42)

Per-instance timeout budget in milliseconds.

---

### BenchmarkRunSummary

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L17)

High-level summary of a benchmark run, CLI-printable and JSON-serializable.
Benchmarks that need extra dimensions attach them via `metadata`.

#### Properties

##### metadata

```ts
readonly metadata: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L31)

Benchmark-specific extras (dataset hash, model IDs, etc.).

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L19)

Benchmark name (e.g., 'swe-bench').

##### passed

```ts
readonly passed: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L25)

Instances whose evaluation reported pass.

##### passRate

```ts
readonly passRate: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L27)

passed / total, in [0, 1].

##### runTimeMs

```ts
readonly runTimeMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L29)

Wall-clock runtime in milliseconds.

##### total

```ts
readonly total: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L23)

Total instances attempted.

##### variant

```ts
readonly variant: string | undefined;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L21)

Variant, if applicable (e.g., 'lite', 'verified').

---

### BenchmarkSuiteResult

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L115)

Complete benchmark suite result.

#### Properties

##### component

```ts
readonly component: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L119)

Component being benchmarked.

##### environment

```ts
readonly environment: BenchmarkEnvironment;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L125)

Environment information.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L117)

Suite name.

##### operations

```ts
readonly operations: readonly OperationBenchmark[];
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L123)

Individual operation benchmarks.

##### summary

```ts
readonly summary: BenchmarkSummary;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L127)

Overall summary.

##### version

```ts
readonly version: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L121)

Version of the component.

---

### BenchmarkSummary

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L151)

Benchmark summary.

#### Properties

##### avgP95Latency

```ts
readonly avgP95Latency: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L159)

Average p95 latency across operations.

##### failures

```ts
readonly failures: readonly string[];
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L163)

Failures if any.

##### overallThroughput

```ts
readonly overallThroughput: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L157)

Overall throughput.

##### passed

```ts
readonly passed: boolean;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L161)

Pass/fail status based on thresholds.

##### totalDurationMs

```ts
readonly totalDurationMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L153)

Total benchmark duration in milliseconds.

##### totalOperations

```ts
readonly totalOperations: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L155)

Total operations run.

---

### BenchmarkThresholds

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L185)

Pass/fail thresholds.

#### Properties

##### maxMemoryBytes

```ts
readonly maxMemoryBytes: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L191)

Maximum acceptable memory usage in bytes.

##### maxP95LatencyMs

```ts
readonly maxP95LatencyMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L187)

Maximum acceptable p95 latency in milliseconds.

##### minPrecision?

```ts
readonly optional minPrecision?: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L193)

Minimum precision for retrieval (0-1).

##### minRecall?

```ts
readonly optional minRecall?: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L195)

Minimum recall for retrieval (0-1).

##### minThroughput

```ts
readonly minThroughput: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L189)

Minimum acceptable throughput (ops/sec).

---

### ClaimValidation

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L29)

Validation result for a single Mem0 claim.

#### Properties

##### actualPercent

```ts
readonly actualPercent: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L32)

##### claim

```ts
readonly claim: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L30)

##### delta

```ts
readonly delta: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L34)

##### met

```ts
readonly met: boolean;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L33)

##### targetPercent

```ts
readonly targetPercent: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L31)

---

### ConsolidationBenchmarkResult

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L30)

Consolidation benchmark result.

#### Properties

##### operations

```ts
readonly operations: readonly OperationBenchmark[];
```

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L31)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L32)

---

### ConsolidationOperation

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L22)

Consolidation operation that can be benchmarked.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L23)

##### run

```ts
readonly run: () => Promise<void>;
```

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L24)

###### Returns

`Promise`\<`void`\>

---

### IMemoryBackend

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L104)

Interface for memory backend implementations.

#### Methods

##### prune()

```ts
prune(olderThan): Promise<Result<number, MemoryError>>;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L132)

Remove memories older than the specified date.

###### Parameters

###### olderThan

`Date`

Cutoff date for pruning

###### Returns

`Promise`\<[`Result`](../core.md#result)\<`number`, [`MemoryError`](#memoryerror)\>\>

Number of entries pruned

##### retrieve()

```ts
retrieve(key): Promise<Result<unknown, MemoryError>>;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L118)

Retrieve a value by key.

###### Parameters

###### key

`string`

The key to look up

###### Returns

`Promise`\<[`Result`](../core.md#result)\<`unknown`, [`MemoryError`](#memoryerror)\>\>

The value or null if not found

##### search()

```ts
search(query, limit): Promise<Result<MemoryEntry[], MemoryError>>;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L125)

Search memories using full-text search.

###### Parameters

###### query

`string`

Search query string

###### limit

`number`

Maximum number of results

###### Returns

`Promise`\<[`Result`](../core.md#result)\<[`MemoryEntry`](#memoryentry)[], [`MemoryError`](#memoryerror)\>\>

##### store()

```ts
store(
   key,
   value,
metadata): Promise<Result<void, MemoryError>>;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L111)

Store a value with associated metadata.

###### Parameters

###### key

`string`

Unique key for the memory

###### value

`unknown`

The value to store (must be JSON-serializable)

###### metadata

[`MemoryMetadata`](#memorymetadata)

Associated metadata

###### Returns

`Promise`\<[`Result`](../core.md#result)\<`void`, [`MemoryError`](#memoryerror)\>\>

---

### LatencyMetrics

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L13)

Latency percentile metrics.

#### Properties

##### max

```ts
readonly max: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L17)

Maximum latency in milliseconds.

##### mean

```ts
readonly mean: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L19)

Mean latency in milliseconds.

##### min

```ts
readonly min: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L15)

Minimum latency in milliseconds.

##### p50

```ts
readonly p50: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L21)

50th percentile (median) in milliseconds.

##### p75

```ts
readonly p75: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L23)

75th percentile in milliseconds.

##### p90

```ts
readonly p90: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L25)

90th percentile in milliseconds.

##### p95

```ts
readonly p95: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L27)

95th percentile in milliseconds.

##### p99

```ts
readonly p99: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L29)

99th percentile in milliseconds.

##### sampleCount

```ts
readonly sampleCount: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L33)

Total number of samples.

##### stdDev

```ts
readonly stdDev: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L31)

Standard deviation in milliseconds.

---

### LatencyScenario

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L47)

A single scenario to benchmark.

#### Properties

##### content

```ts
readonly content: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L51)

Input prompt content.

##### maxTokens?

```ts
readonly optional maxTokens?: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L55)

Max tokens for generation.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L49)

Scenario name (e.g., 'simple-prompt', 'complex-prompt').

##### systemPrompt?

```ts
readonly optional systemPrompt?: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L53)

Optional system prompt.

---

### MemoryBenchmarkConfig

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L69)

Memory benchmark configuration extending base benchmark config.

#### Extends

- [`BenchmarkConfig`](#benchmarkconfig)

#### Properties

##### contentSizeBytes

```ts
readonly contentSizeBytes: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L71)

Size of content in bytes.

##### datasetSizes

```ts
readonly datasetSizes: readonly number[];
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L171)

Dataset sizes to test.

###### Inherited from

[`BenchmarkConfig`](#benchmarkconfig).[`datasetSizes`](#datasetsizes)

##### measurementIterations

```ts
readonly measurementIterations: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L175)

Number of measurement iterations per size.

###### Inherited from

[`BenchmarkConfig`](#benchmarkconfig).[`measurementIterations`](#measurementiterations-1)

##### searchPatterns

```ts
readonly searchPatterns: readonly string[];
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L75)

Search query patterns.

##### tagsPerEntry

```ts
readonly tagsPerEntry: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L73)

Number of tags per entry.

##### thresholds

```ts
readonly thresholds: BenchmarkThresholds;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L179)

Thresholds for pass/fail.

###### Inherited from

[`BenchmarkConfig`](#benchmarkconfig).[`thresholds`](#thresholds)

##### timeoutMs

```ts
readonly timeoutMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L177)

Timeout per operation in milliseconds.

###### Inherited from

[`BenchmarkConfig`](#benchmarkconfig).[`timeoutMs`](#timeoutms-1)

##### warmupIterations

```ts
readonly warmupIterations: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L173)

Number of warmup iterations.

###### Inherited from

[`BenchmarkConfig`](#benchmarkconfig).[`warmupIterations`](#warmupiterations-1)

---

### MemoryEntry

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L62)

A complete memory entry with all fields.

#### Properties

##### accessedAt

```ts
accessedAt: Date;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L72)

When the entry was last accessed

##### createdAt

```ts
createdAt: Date;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L70)

When the entry was created

##### key

```ts
key: string;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L64)

Unique key for the memory

##### metadata

```ts
metadata: MemoryMetadata;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L68)

Associated metadata

##### value

```ts
value: unknown;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L66)

The stored value (JSON-serializable)

---

### MemoryMetadata

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L41)

Metadata associated with a memory entry.

#### Properties

##### importance

```ts
importance: MemoryImportance;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L43)

Importance level determining storage strategy

##### tags?

```ts
optional tags?: string[];
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L45)

Optional tags for categorization

##### ttl?

```ts
optional ttl?: number;
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L47)

Time-to-live in milliseconds (optional)

---

### OperationBenchmark

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L95)

Benchmark result for a single operation type.

#### Properties

##### datasetSize

```ts
readonly datasetSize: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L99)

Dataset size used.

##### latency

```ts
readonly latency: LatencyMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L101)

Latency metrics.

##### operation

```ts
readonly operation: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L97)

Operation name.

##### quality?

```ts
readonly optional quality?: QualityMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L107)

Quality metrics (for retrieval operations).

##### resources

```ts
readonly resources: ResourceMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L105)

Resource metrics.

##### throughput

```ts
readonly throughput: ThroughputMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L103)

Throughput metrics.

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L109)

Timestamp when benchmark was run.

---

### OperationComparison

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L43)

Operation comparison result.

#### Properties

##### baselineP95

```ts
readonly baselineP95: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L46)

##### baselineThroughput

```ts
readonly baselineThroughput: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L49)

##### currentP95

```ts
readonly currentP95: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L47)

##### currentThroughput

```ts
readonly currentThroughput: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L50)

##### datasetSize

```ts
readonly datasetSize: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L45)

##### improved

```ts
readonly improved: boolean;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L52)

##### latencyChangePercent

```ts
readonly latencyChangePercent: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L48)

##### operation

```ts
readonly operation: string;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L44)

##### throughputChangePercent

```ts
readonly throughputChangePercent: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L51)

---

### QualityMetrics

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L65)

Quality metrics for retrieval operations.

#### Properties

##### f1Score

```ts
readonly f1Score: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L71)

F1 score: harmonic mean of precision and recall.

##### mrr

```ts
readonly mrr: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L73)

Mean reciprocal rank.

##### ndcgAtK

```ts
readonly ndcgAtK: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L75)

Normalized discounted cumulative gain at k.

##### precision

```ts
readonly precision: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L67)

Precision: relevant retrieved / total retrieved.

##### recall

```ts
readonly recall: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L69)

Recall: relevant retrieved / total relevant.

---

### ReportOptions

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L54)

Options for generating a benchmark report.

#### Properties

##### comparison?

```ts
readonly optional comparison?: BenchmarkComparison;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L56)

##### consolidation?

```ts
readonly optional consolidation?: ConsolidationBenchmarkResult;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L58)

##### suite?

```ts
readonly optional suite?: BenchmarkSuiteResult;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L55)

##### tokenResults?

```ts
readonly optional tokenResults?: readonly TokenBenchmarkResult[];
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L57)

---

### ResourceMetrics

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L81)

Resource usage metrics.

#### Properties

##### avgMemoryBytes

```ts
readonly avgMemoryBytes: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L85)

Average memory usage in bytes.

##### cpuTimeMs

```ts
readonly cpuTimeMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L87)

CPU time in milliseconds.

##### dbSizeBytes?

```ts
readonly optional dbSizeBytes?: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L89)

Database file size in bytes (if applicable).

##### peakMemoryBytes

```ts
readonly peakMemoryBytes: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L83)

Peak memory usage in bytes.

---

### ThroughputMetrics

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L39)

Throughput metrics.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L45)

Total duration in milliseconds.

##### opsPerSecond

```ts
readonly opsPerSecond: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L41)

Operations per second.

##### totalOps

```ts
readonly totalOps: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L43)

Total operations completed.

---

### TokenBenchmarkResult

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L25)

Token benchmark result comparing baseline vs memory-optimized retrieval.

#### Properties

##### baseline

```ts
readonly baseline: TokenMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L27)

##### datasetSize

```ts
readonly datasetSize: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L26)

##### meetsMemZeroTarget

```ts
readonly meetsMemZeroTarget: boolean;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L30)

##### optimized

```ts
readonly optimized: TokenMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L28)

##### savingsPercent

```ts
readonly savingsPercent: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L29)

---

### TokenMetrics

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L51)

Token usage metrics.

#### Properties

##### avgTokensPerOp

```ts
readonly avgTokensPerOp: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L59)

Average tokens per operation.

##### inputTokens

```ts
readonly inputTokens: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L53)

Total input tokens.

##### outputTokens

```ts
readonly outputTokens: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L55)

Total output tokens.

##### totalTokens

```ts
readonly totalTokens: number;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L57)

Total tokens (input + output).

## Type Aliases

### BenchmarkOperation

```ts
type BenchmarkOperation = () => Promise<void> | void;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L145)

Benchmark operation function type.

#### Returns

`Promise`\<`void`\> \| `void`

---

### MemoryImportance

```ts
type MemoryImportance = {
  HIGH: 'high';
  LOW: 'low';
  MEDIUM: 'medium';
};
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L25)

Importance levels for memory entries.

#### Properties

##### HIGH

```ts
readonly HIGH: "high" = 'high';
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L28)

##### LOW

```ts
readonly LOW: "low" = 'low';
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L26)

##### MEDIUM

```ts
readonly MEDIUM: "medium" = 'medium';
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L27)

---

### MemoryImportance

```ts
type MemoryImportance = (typeof MemoryImportance)[keyof typeof MemoryImportance];
```

Defined in: [packages/nexus-agents/src/context/memory-backend-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/context/memory-backend-types.ts#L25)

Importance levels for memory entries.

## Variables

### DEFAULT_ADAPTER_LATENCY_CONFIG

```ts
const DEFAULT_ADAPTER_LATENCY_CONFIG: AdapterLatencyConfig;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L38)

Default adapter latency benchmark configuration.

---

### DEFAULT_BENCHMARK_CONFIG

```ts
const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-types.ts#L201)

Default benchmark configuration.

---

### DEFAULT_MEMORY_BENCHMARK_CONFIG

```ts
const DEFAULT_MEMORY_BENCHMARK_CONFIG: MemoryBenchmarkConfig;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks.ts#L46)

Default memory benchmark configuration.

---

### DEFAULT_SCENARIOS

```ts
const DEFAULT_SCENARIOS: readonly LatencyScenario[];
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L61)

Default scenarios matching issue #694 requirements.

---

### MEM0_TARGETS

```ts
const MEM0_TARGETS: {
  latencyReductionPercent: 91;
  qualityImprovementPercent: 26;
  tokenSavingsPercent: 90;
};
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L20)

Mem0 claimed targets from arXiv:2504.19413.

#### Type Declaration

##### latencyReductionPercent

```ts
readonly latencyReductionPercent: 91 = 91;
```

##### qualityImprovementPercent

```ts
readonly qualityImprovementPercent: 26 = 26;
```

##### tokenSavingsPercent

```ts
readonly tokenSavingsPercent: 90 = 90;
```

---

### NOOP_PROGRESS

```ts
const NOOP_PROGRESS: BenchmarkRunContext['onProgress'];
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter.ts#L95)

Default no-op progress handler.

## Functions

### calculateTokenMetrics()

```ts
function calculateTokenMetrics(entries, queryCount): TokenMetrics;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L43)

Calculate token metrics for a set of entries.

#### Parameters

##### entries

readonly \{
`content`: `string`;
\}[]

##### queryCount

`number`

#### Returns

[`TokenMetrics`](#tokenmetrics)

---

### compareBenchmarks()

```ts
function compareBenchmarks(baseline, current): BenchmarkComparison;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks.ts:271](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks.ts#L271)

Compare benchmarks between two backends.

#### Parameters

##### baseline

[`BenchmarkSuiteResult`](#benchmarksuiteresult)

##### current

[`BenchmarkSuiteResult`](#benchmarksuiteresult)

#### Returns

[`BenchmarkComparison`](#benchmarkcomparison)

---

### createBenchmarkSummary()

```ts
function createBenchmarkSummary(operations, config?): BenchmarkSummary;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:227](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L227)

Create benchmark summary from operations.

#### Parameters

##### operations

readonly [`OperationBenchmark`](#operationbenchmark)[]

##### config?

`Partial`\<[`BenchmarkConfig`](#benchmarkconfig)\> = `{}`

#### Returns

[`BenchmarkSummary`](#benchmarksummary)

---

### createDecayOp()

```ts
function createDecayOp(name, decayFn): ConsolidationOperation;
```

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L84)

Create a decay operation from a callback.

#### Parameters

##### name

`string`

##### decayFn

() => `Promise`\<`void`\>

#### Returns

[`ConsolidationOperation`](#consolidationoperation)

---

### createPromotionOp()

```ts
function createPromotionOp(name, promoteFn): ConsolidationOperation;
```

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L74)

Create a promotion operation from a callback.

#### Parameters

##### name

`string`

##### promoteFn

() => `Promise`\<`void`\>

#### Returns

[`ConsolidationOperation`](#consolidationoperation)

---

### estimateBenchmarkTokens()

```ts
function estimateBenchmarkTokens(text): number;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L36)

Estimate token count from text content.

#### Parameters

##### text

`string`

#### Returns

`number`

---

### formatAdapterLatencyReport()

```ts
function formatAdapterLatencyReport(result): string;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:285](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L285)

Format adapter latency results as a markdown report.

#### Parameters

##### result

[`AdapterLatencyResult`](#adapterlatencyresult)

#### Returns

`string`

---

### formatBenchmarkReport()

```ts
function formatBenchmarkReport(report): string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L144)

Format a benchmark report as a human-readable string.

#### Parameters

##### report

[`BenchmarkReport`](#benchmarkreport)

#### Returns

`string`

---

### formatBenchmarkResults()

```ts
function formatBenchmarkResults(result): string;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:274](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L274)

Format benchmark results for console output.

#### Parameters

##### result

[`BenchmarkSuiteResult`](#benchmarksuiteresult)

#### Returns

`string`

---

### formatComparisonResults()

```ts
function formatComparisonResults(comparison): string;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks-helpers.ts#L217)

Format comparison results as a human-readable string.

#### Parameters

##### comparison

[`BenchmarkComparison`](#benchmarkcomparison)

#### Returns

`string`

---

### generateBenchmarkReport()

```ts
function generateBenchmarkReport(options): BenchmarkReport;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-report.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-report.ts#L122)

Generate a complete benchmark report.

#### Parameters

##### options

[`ReportOptions`](#reportoptions)

#### Returns

[`BenchmarkReport`](#benchmarkreport)

---

### getBenchmarkEnvironment()

```ts
function getBenchmarkEnvironment(): BenchmarkEnvironment;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L212)

Get benchmark environment information.

#### Returns

[`BenchmarkEnvironment`](#benchmarkenvironment)

---

### runAdapterLatencyBenchmark()

```ts
function runAdapterLatencyBenchmark(adapters, scenarios?, config?): Promise<AdapterLatencyResult>;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L120)

Run latency benchmarks across adapters and scenarios.

#### Parameters

##### adapters

readonly [`ICliAdapter`](../cli-adapters.md#icliadapter)[]

##### scenarios?

readonly [`LatencyScenario`](#latencyscenario)[] = `DEFAULT_SCENARIOS`

##### config?

`Partial`\<[`AdapterLatencyConfig`](#adapterlatencyconfig)\> = `{}`

#### Returns

`Promise`\<[`AdapterLatencyResult`](#adapterlatencyresult)\>

---

### runBenchmark()

```ts
function runBenchmark<TInstance, TPrediction, TEvalResult>(
  adapter,
  config,
  options?
): Promise<BenchmarkRunSummary>;
```

Defined in: [packages/nexus-agents/src/benchmarks/orchestrator.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/orchestrator.ts#L100)

Execute one adapter end-to-end. Returns the adapter-produced summary.

Behavioral notes:

- An instance failure (either runInstance or evaluate throws) is captured
  as a failure count in summary metadata; the run continues.
- Timeouts cancel via AbortController; adapters should honor `ctx.signal`.

#### Type Parameters

##### TInstance

`TInstance`

##### TPrediction

`TPrediction`

##### TEvalResult

`TEvalResult`

#### Parameters

##### adapter

[`BenchmarkAdapter`](#benchmarkadapter)\<`TInstance`, `TPrediction`, `TEvalResult`\>

##### config

`Record`\<`string`, `unknown`\>

##### options?

[`BenchmarkOrchestratorOptions`](#benchmarkorchestratoroptions) = `{}`

#### Returns

`Promise`\<[`BenchmarkRunSummary`](#benchmarkrunsummary)\>

---

### runConsolidationBenchmark()

```ts
function runConsolidationBenchmark(operations, config?): Promise<ConsolidationBenchmarkResult>;
```

Defined in: [packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/consolidation-benchmark.ts#L41)

Run consolidation benchmarks on a set of operations.

Measures latency and throughput of promotion, decay, and eviction
operations that maintain memory health over time.

#### Parameters

##### operations

readonly [`ConsolidationOperation`](#consolidationoperation)[]

##### config?

`Partial`\<[`MemoryBenchmarkConfig`](#memorybenchmarkconfig)\> = `{}`

#### Returns

`Promise`\<[`ConsolidationBenchmarkResult`](#consolidationbenchmarkresult)\>

---

### runMemoryBenchmarks()

```ts
function runMemoryBenchmarks(backend, name, config?): Promise<BenchmarkSuiteResult>;
```

Defined in: [packages/nexus-agents/src/benchmarks/memory-benchmarks.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/memory-benchmarks.ts#L216)

Run all memory backend benchmarks.

#### Parameters

##### backend

[`IMemoryBackend`](#imemorybackend)

##### name

`string`

##### config?

`Partial`\<[`MemoryBenchmarkConfig`](#memorybenchmarkconfig)\> = `{}`

#### Returns

`Promise`\<[`BenchmarkSuiteResult`](#benchmarksuiteresult)\>

---

### runOperationBenchmark()

```ts
function runOperationBenchmark(operation, datasetSize, fn, config?): Promise<OperationBenchmark>;
```

Defined in: [packages/nexus-agents/src/benchmarks/benchmark-runner.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/benchmark-runner.ts#L150)

Run a single operation benchmark.

#### Parameters

##### operation

`string`

##### datasetSize

`number`

##### fn

[`BenchmarkOperation`](#benchmarkoperation)

##### config?

`Partial`\<[`BenchmarkConfig`](#benchmarkconfig)\> = `{}`

#### Returns

`Promise`\<[`OperationBenchmark`](#operationbenchmark)\>

---

### runTokenBenchmark()

```ts
function runTokenBenchmark(backend, config?): Promise<readonly TokenBenchmarkResult[]>;
```

Defined in: [packages/nexus-agents/src/benchmarks/token-benchmark.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/token-benchmark.ts#L63)

Run token savings benchmark.

Compares baseline (all entries in context) vs optimized
(only relevant entries from search) token usage.

#### Parameters

##### backend

[`IMemoryBackend`](#imemorybackend)

##### config?

`Partial`\<[`MemoryBenchmarkConfig`](#memorybenchmarkconfig)\> = `{}`

#### Returns

`Promise`\<readonly [`TokenBenchmarkResult`](#tokenbenchmarkresult)[]\>

---

### toSuiteResult()

```ts
function toSuiteResult(result): BenchmarkSuiteResult;
```

Defined in: [packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts:313](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/benchmarks/adapter-latency-benchmark.ts#L313)

Convert adapter latency results to BenchmarkSuiteResult for compatibility
with the generic formatBenchmarkResults() function.

#### Parameters

##### result

[`AdapterLatencyResult`](#adapterlatencyresult)

#### Returns

[`BenchmarkSuiteResult`](#benchmarksuiteresult)
