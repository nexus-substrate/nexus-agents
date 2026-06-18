---
title: 'API: nexus-agents API'
description: Generated API reference for nexus-agents API.
tier: 2
---

# nexus-agents API

## Type Aliases

### Result

```ts
type Result<T, E> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: E;
      ok: false;
    };
```

Defined in: [result.ts:13](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L13)

A discriminated union representing either success (Ok) or failure (Err).

#### Type Parameters

##### T

`T`

The success value type

##### E

`E`

The error value type

## Functions

### err()

```ts
function err<E>(error): Result<never, E>;
```

Defined in: [result.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L49)

Creates a failed Result containing the given error.

#### Type Parameters

##### E

`E`

The error value type

#### Parameters

##### error

`E`

The error value

#### Returns

[`Result`](#result)\<`never`, `E`\>

A Result in the Err state

#### Example

```typescript
const result = err(new Error('not found'));
if (!result.ok) {
  console.error(result.error.message); // "not found"
}
```

---

### isErr()

```ts
function isErr<T, E>(result): result is { error: E; ok: false };
```

Defined in: [result.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L73)

Type guard to check if a Result is in the Err state.

#### Type Parameters

##### T

`T`

The success value type

##### E

`E`

The error value type

#### Parameters

##### result

[`Result`](#result)\<`T`, `E`\>

The Result to check

#### Returns

`result is { error: E; ok: false }`

True if the Result is Err

---

### isOk()

```ts
function isOk<T, E>(result): result is { ok: true; value: T };
```

Defined in: [result.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L60)

Type guard to check if a Result is in the Ok state.

#### Type Parameters

##### T

`T`

The success value type

##### E

`E`

The error value type

#### Parameters

##### result

[`Result`](#result)\<`T`, `E`\>

The Result to check

#### Returns

`result is { ok: true; value: T }`

True if the Result is Ok

---

### map()

```ts
function map<T, U, E>(result, fn): Result<U, E>;
```

Defined in: [result.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L88)

Transforms the success value of a Result using the provided function.

#### Type Parameters

##### T

`T`

The original success value type

##### U

`U`

The transformed success value type

##### E

`E`

The error value type

#### Parameters

##### result

[`Result`](#result)\<`T`, `E`\>

The Result to transform

##### fn

(`value`) => `U`

The transformation function

#### Returns

[`Result`](#result)\<`U`, `E`\>

A new Result with the transformed value

---

### mapErr()

```ts
function mapErr<T, E, F>(result, fn): Result<T, F>;
```

Defined in: [result.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L104)

Transforms the error value of a Result using the provided function.

#### Type Parameters

##### T

`T`

The success value type

##### E

`E`

The original error value type

##### F

`F`

The transformed error value type

#### Parameters

##### result

[`Result`](#result)\<`T`, `E`\>

The Result to transform

##### fn

(`error`) => `F`

The transformation function

#### Returns

[`Result`](#result)\<`T`, `F`\>

A new Result with the transformed error

---

### ok()

```ts
function ok<T>(value): Result<T, never>;
```

Defined in: [result.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L31)

Creates a successful Result containing the given value.

#### Type Parameters

##### T

`T`

The success value type

#### Parameters

##### value

`T`

The success value

#### Returns

[`Result`](#result)\<`T`, `never`\>

A Result in the Ok state

#### Example

```typescript
const result = ok(42);
if (result.ok) {
  console.log(result.value); // 42
}
```

---

### unwrap()

```ts
function unwrap<T, E>(result): T;
```

Defined in: [result.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L119)

Extracts the success value from a Result.

#### Type Parameters

##### T

`T`

The success value type

##### E

`E`

The error value type

#### Parameters

##### result

[`Result`](#result)\<`T`, `E`\>

The Result to unwrap

#### Returns

`T`

The success value

#### Throws

Throws an Error wrapping the error value if the Result is Err

---

### unwrapOr()

```ts
function unwrapOr<T, E>(result, defaultValue): T;
```

Defined in: [result.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/943e21f1feb99f8861d7a077ebb50745280f9fd6/packages/nexus-agents/src/core/result.ts#L144)

Extracts the success value from a Result, or returns a default value.

#### Type Parameters

##### T

`T`

The success value type

##### E

`E`

The error value type

#### Parameters

##### result

[`Result`](#result)\<`T`, `E`\>

The Result to unwrap

##### defaultValue

`T`

The default value to return if Err

#### Returns

`T`

The success value or the default value

#### Example

```typescript
const result = err(new Error('failed'));
const value = unwrapOr(result, 'fallback');
console.log(value); // "fallback"
```
