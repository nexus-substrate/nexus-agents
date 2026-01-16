---
paths: '**/*.ts'
---

# TypeScript Rules

<!-- CANONICAL SOURCE: CODING_STANDARDS.md Section 4 -->

Quick reference for TypeScript patterns. **Full documentation:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md#4-typescript-standards)

## Type Safety Essentials

- Use `unknown` instead of `any`
- Use `Result<T, E>` for fallible operations
- Use Zod for runtime validation at boundaries
- Prefer discriminated unions over optional fields

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
