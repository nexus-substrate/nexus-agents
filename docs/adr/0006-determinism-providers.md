# ADR-0006: Determinism Providers

**Status:** Accepted
**Date:** 2026-01-30
**Author:** Claude (System Mandate - Loop H/I)

## Context

The codebase contains 675 direct `Date.now()` calls and 66 `Math.random()` calls spread across multiple modules. This non-determinism creates significant issues:

1. **Testing** - Unit tests cannot control time/random outputs, leading to flaky tests
2. **Reproducibility** - Debugging production issues is harder when behavior varies
3. **Deterministic Replay** - Cannot replay agent sessions with identical outcomes
4. **CI Stability** - Time-sensitive tests fail intermittently

Per the System Mandate fitness scoring, "Determinism" scored 8/15 - indicating room for improvement.

## Decision

Create injectable providers for time and random operations:

### ITimeProvider Interface

```typescript
interface ITimeProvider {
  now(): number; // Equivalent to Date.now()
  nowIso(): string; // Equivalent to new Date().toISOString()
  nowDate(): Date; // Returns Date object
}
```

### IRandomProvider Interface

```typescript
interface IRandomProvider {
  random(): number; // 0-1
  randomInt(min: number, max: number): number; // Integer in range
  randomString(length: number): string; // Random alphanumeric
  randomChoice<T>(items: readonly T[]): T | undefined;
  shuffle<T>(items: readonly T[]): T[];
  uuid(): string; // UUID v4
}
```

### Implementations

1. **SystemTimeProvider** - Uses actual `Date.now()` for production
2. **FixedTimeProvider** - Returns fixed time, supports `advance()` for testing
3. **SystemRandomProvider** - Uses `Math.random()` for production
4. **SeededRandomProvider** - Uses mulberry32 PRNG for deterministic sequences

### Global Singletons with Dependency Injection

```typescript
// Production: uses system providers
const time = getTimeProvider();
const random = getRandomProvider();

// Testing: inject deterministic providers
setTimeProvider(new FixedTimeProvider(1704067200000));
setRandomProvider(new SeededRandomProvider(42));
```

## Consequences

### Positive

- Tests can control time and random outputs exactly
- Deterministic replay of agent sessions becomes possible
- Debugging production issues easier with reproducible scenarios
- Gradual migration - modules can adopt providers incrementally

### Negative

- Slight runtime overhead (one indirection)
- Migration effort required (675 + 66 call sites)
- Developers must remember to use providers instead of direct calls

### Migration Strategy

1. Create providers in `core/` (DONE)
2. Export from `core/index.ts` (DONE)
3. Wire into high-priority modules first:
   - consensus/ (voting-protocol-helpers.ts) - DONE
   - Next: agents/, cli-adapters/, mcp/
4. Add ESLint rule to flag direct Date.now()/Math.random() usage
5. Track migration progress in fitness score

## References

- System Mandate - Determinism improvement
- Fitness Score: Determinism metric (8/15 → 15/15 target)
- Integration Files:
  - `packages/nexus-agents/src/core/time-provider.ts`
  - `packages/nexus-agents/src/core/random-provider.ts`
  - `packages/nexus-agents/src/core/index.ts`
  - `packages/nexus-agents/src/consensus/voting-protocol-helpers.ts`
