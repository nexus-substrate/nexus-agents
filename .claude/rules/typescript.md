---
paths: "**/*.ts"
---

# TypeScript Rules

## Type Safety

- Use `unknown` instead of `any`
- Use `Result<T, E>` pattern for fallible operations
- Use Zod for runtime validation at boundaries
- Prefer discriminated unions over optional fields

## Structure

- Files ≤ 400 lines
- Functions ≤ 50 lines
- Max 5 parameters (use options object for more)
- Max nesting depth: 4 levels

## Naming

- Interfaces: `IModelAdapter` (I prefix)
- Types: `PascalCase`
- Functions: `camelCase`, verb-first (`createAdapter`)
- Constants: `SCREAMING_SNAKE`
- Files: `kebab-case.ts`

## Patterns

```typescript
// Good: Result type for errors
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Good: Zod validation
const Schema = z.object({ name: z.string() });
const result = Schema.safeParse(input);

// Good: Discriminated union
type Message =
  | { type: 'text'; content: string }
  | { type: 'tool'; name: string };
```
