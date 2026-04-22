---
paths: '**/*.ts'
---

# TypeScript Rules

<!-- CANONICAL SOURCE: CODING_STANDARDS.md Section 4 -->

Quick reference for TypeScript patterns. **Full documentation:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md#4-typescript-standards)

## Type Safety — Zero Tolerance for `any`

**`any` is banned.** ESLint enforces `@typescript-eslint/no-explicit-any: 'error'`. Every `any` must be justified.

### Preferred Patterns (use these instead of `any`)

| Instead of `any`      | Use This                   | When                                        |
| --------------------- | -------------------------- | ------------------------------------------- |
| `any` parameter       | `unknown` + type guard     | Accepting external/untyped data             |
| `as any`              | `as unknown as TargetType` | Type narrowing across incompatible types    |
| `any` return type     | Generic `<T>` or `unknown` | Functions returning caller-determined types |
| `any` in test mocks   | `as unknown as MockedType` | Mocking class instances                     |
| `Record<string, any>` | `Record<string, unknown>`  | Arbitrary key-value objects                 |

### Narrowing `unknown` Safely

```typescript
// BAD: using any
function handle(input: any): string {
  return input.name;
}

// GOOD: unknown + type guard
function handle(input: unknown): string {
  const record = input as Record<string, unknown>;
  if (typeof record['name'] !== 'string') throw new Error('Expected name');
  return record['name'];
}

// BEST: Zod validation at boundaries
const Schema = z.object({ name: z.string() });
function handle(input: unknown): string {
  const parsed = Schema.parse(input);
  return parsed.name;
}
```

### When `any` Is Acceptable (with mandatory eslint-disable)

Only three cases justify `any` with an eslint-disable comment:

1. **Third-party SDK generic boundaries** — When wrapping a library method whose generic type parameters cannot be preserved through the wrapper (e.g., Proxy interception of generic methods). Comment: `// eslint-disable-next-line ... -- SDK generic boundary: [reason]`

2. **Test mock factories in `vi.hoisted()`** — Vitest's mock hoisting requires `vi.fn()` return types that may not match the full type. Use `as unknown as Type` where possible; if not, comment: `// eslint-disable-next-line ... -- Test mock: [reason]`

3. **Variadic function forwarding** — When forwarding `...args` through a wrapper where the argument types depend on the call site. Comment: `// eslint-disable-next-line ... -- Variadic forwarding: [reason]`

**Every other use of `any` is a code smell** and must be refactored before merge.

### Type Assertion Hierarchy

Prefer the safest option available, in order:

1. **No assertion** — use type guards, Zod, or generics
2. **`as Type`** — when TypeScript can't infer but you've validated
3. **`as unknown as Type`** — crossing unrelated type boundaries (e.g., mocks)
4. **`as any`** — LAST RESORT, only for the 3 cases above, always with eslint-disable + reason

## Result Pattern

Use `Result<T, E>` for fallible operations, never exceptions for control flow:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

## Zod at Boundaries

Validate all external input (MCP tool args, CLI args, config files, API responses) with Zod:

```typescript
const InputSchema = z.object({
  task: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});
```

## Discriminated Unions

Prefer discriminated unions over optional fields:

```typescript
// BAD
interface Message {
  type?: string;
  content?: string;
  name?: string;
}

// GOOD
type Message =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; name: string; input: unknown };
```

## Structure Limits (ESLint enforced)

| Metric     | Limit       |
| ---------- | ----------- |
| File       | ≤ 400 lines |
| Function   | ≤ 50 lines  |
| Parameters | ≤ 5         |
| Nesting    | ≤ 4 levels  |

## Naming

- Interfaces: `IModelAdapter` (I prefix)
- Types: `PascalCase`
- Functions: `camelCase`, verb-first
- Constants: `SCREAMING_SNAKE`
- Files: `kebab-case.ts`

See [CODING_STANDARDS.md](../../CODING_STANDARDS.md#4-typescript-standards) for patterns and examples.
