/**
 * TypeScript Patterns Knowledge Module
 *
 * Actionable TypeScript coding patterns and best practices
 * for enriching code expert agent prompts.
 *
 * @module agents/experts/knowledge/code/typescript-patterns
 * (Source: Epic #643 - Standards Absorption, Phase 1c)
 */

import type { KnowledgeModule } from '../types.js';

export const TYPESCRIPT_PATTERNS: KnowledgeModule = {
  id: 'code-typescript-patterns',
  domain: 'code',
  title: 'TypeScript Patterns and Best Practices',
  tags: ['typescript', 'type-safety', 'patterns', 'strict-mode'],
  sections: [
    {
      title: 'Strict Mode Essentials',
      priority: 10,
      content: [
        'Enable ALL strict flags in tsconfig.json:',
        '  "strict": true, "noUncheckedIndexedAccess": true,',
        '  "exactOptionalPropertyTypes": true, "noPropertyAccessFromIndexSignature": true.',
        'Never disable individual strict checks. Use `unknown` instead of `any`.',
        'Prefer `satisfies` operator over type assertions for validated narrowing.',
        'Use `as const` for literal inference on configuration objects.',
      ].join('\n'),
    },
    {
      title: 'Type Narrowing Patterns',
      priority: 9,
      content: [
        'Discriminated unions: add a `type` or `kind` literal field to each variant.',
        '  type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };',
        'Type guard functions: `function isUser(v: unknown): v is User`.',
        'Use `in` operator for structural narrowing: `if ("email" in obj)`.',
        'Const assertions: `as const` narrows arrays to tuples and strings to literals.',
        'Exhaustive checks: use `never` in default case to catch unhandled variants.',
        '  default: { const _exhaustive: never = action; throw new Error(`Unhandled: ${_exhaustive}`); }',
      ].join('\n'),
    },
    {
      title: 'Advanced Generics',
      priority: 7,
      content: [
        'Conditional types: `type IsArray<T> = T extends unknown[] ? true : false;`',
        'Mapped types: `type Readonly<T> = { readonly [K in keyof T]: T[K] };`',
        'Template literal types: `type Route = `/${string}`;`',
        'Infer keyword: `type ElementOf<T> = T extends (infer E)[] ? E : never;`',
        'Constrained generics: `function get<T, K extends keyof T>(obj: T, key: K): T[K]`',
        'Generic defaults: `type Container<T = unknown> = { value: T };`',
        'Limit generic depth to 3 levels. Extract complex types into named aliases.',
      ].join('\n'),
    },
    {
      title: 'Utility Types',
      priority: 8,
      content: [
        'Partial<T>: make all properties optional (good for update/patch payloads).',
        'Required<T>: make all properties required (good for validated models).',
        'Pick<T, K>: select subset of properties (good for API response shaping).',
        'Omit<T, K>: exclude properties (good for removing internal fields).',
        'Record<K, V>: typed key-value maps (prefer over index signatures).',
        'Extract<T, U> / Exclude<T, U>: filter union members.',
        'ReturnType<T> / Parameters<T>: derive types from functions.',
        'Combine utilities: `type CreateInput = Omit<User, "id" | "createdAt">;`',
      ].join('\n'),
    },
    {
      title: 'Result Pattern for Error Handling',
      priority: 9,
      content: [
        'Use Result<T, E> instead of throwing for expected failures:',
        '  type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };',
        'Reserve throw/try-catch for unexpected failures (bugs, infra errors).',
        'Pattern: function returns Result, caller narrows with `if (!result.ok)`.',
        'Chain results: extract value only after checking `.ok`.',
        'Create typed error enums: `type ParseError = "INVALID_JSON" | "MISSING_FIELD";`',
        'Wrap external APIs that throw into Result-returning wrappers.',
      ].join('\n'),
    },
    {
      title: 'Common Anti-Patterns',
      priority: 10,
      content: [
        'AVOID `any`: use `unknown` and narrow. Lint with @typescript-eslint/no-explicit-any.',
        'AVOID type assertions (`as`): use type guards or `satisfies` instead.',
        'AVOID non-null assertions (`!`): handle null/undefined explicitly.',
        'AVOID enums: use `as const` objects or union types for better tree-shaking.',
        'AVOID `Function` type: use specific signatures `(arg: string) => void`.',
        'AVOID namespace: use ES modules.',
        'AVOID `@ts-ignore`: use `@ts-expect-error` with explanation comment.',
      ].join('\n'),
    },
    {
      title: 'Module Patterns',
      priority: 6,
      content: [
        'Barrel exports (index.ts): re-export public API only. Never re-export internals.',
        'Path aliases: configure `paths` in tsconfig for `@/core`, `@/utils` etc.',
        'Explicit file extensions in imports for ESM: `import { x } from "./mod.js";`',
        'One module = one concern. Split when a file exceeds 400 lines.',
        'Co-locate types with implementation. Export types from same module.',
        'Use `type` keyword in imports/exports for type-only items.',
      ].join('\n'),
    },
    {
      title: 'Async Patterns',
      priority: 8,
      content: [
        'Use Promise.all for independent concurrent operations.',
        'Use Promise.allSettled when partial failure is acceptable.',
        'Always pass AbortSignal to cancellable operations (fetch, timers).',
        'Set timeouts on all external calls: `AbortSignal.timeout(5000)`.',
        'Handle async errors: every await needs surrounding try-catch or .catch().',
        'Avoid floating promises: lint with @typescript-eslint/no-floating-promises.',
        'Use AsyncDisposable (`await using`) for resource cleanup when available.',
        'Prefer async iterators over manual pagination loops.',
      ].join('\n'),
    },
  ],
} as const;
