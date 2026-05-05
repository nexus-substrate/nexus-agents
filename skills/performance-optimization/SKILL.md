---
name: performance-optimization
description: |
  Measure-first optimization for code that has actual evidence of being
  slow. Apply when performance requirements exist, profiles show
  bottlenecks, or a change introduced a regression. Triggers on
  "optimize", "performance", "slow", "profile", "bottleneck",
  "core web vitals", "regression".
allowed-tools: Read, Edit, Bash, Grep, Glob
---

# Performance Optimization Skill

<!--
  CANONICAL SOURCES:
  - CLAUDE.md "Prime Directive: correctness > simplicity > performance > cleverness"
  - skills/references/performance-checklist.md (when adopted; Tier B)
  Adapted from addyosmani/agent-skills (MIT, © 2025 Addy Osmani).
-->

## When to apply

- Performance requirements are stated in the spec or issue (e.g., "list endpoint must p95 < 200ms")
- Users or monitoring report slow behavior with a reproducible scenario
- Core Web Vitals scores fall below "Good" thresholds (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- A specific commit or PR introduced a measurable regression vs prior baseline
- Code handles datasets large enough that complexity dominates (n > 10k or rps > 100)

**Skip when:**

- There's no measurement showing a problem — "feels slow" without a profile is not a justification
- The fix would add complexity disproportionate to the win (5% improvement at the cost of unreadable code)
- Performance is dominated by a downstream system you don't control (e.g., the LLM round-trip)
- The hot path is run once per cold-start — micro-optimizing startup isn't worth the readability cost

> "Premature optimization is the root of all evil." Don't optimize before you have evidence. The cost of complexity is permanent; the cost of waiting for evidence is one more profile run.

## The MIFVG cycle

1. **MEASURE** — establish baseline with real data. Synthetic benchmarks are starting points, not ground truth. Capture both p50 and p95.
2. **IDENTIFY** — profile. Don't guess the bottleneck — measure it. Tools: `node --prof`, `clinic.js`, browser DevTools Performance, `pprof` for memory.
3. **FIX** — address the specific bottleneck. One change at a time. If two things are slow, fix the worst one first and re-measure.
4. **VERIFY** — re-measure with the same scenario. The improvement must be reproducible, not a single lucky run.
5. **GUARD** — add a monitoring assertion, a test budget, or a performance gate so the fix doesn't silently regress. The Beyoncé Rule applies — if you measured it, put a guard on it.

## Common patterns to fix (when evidence supports)

| Pattern                                  | Symptom                                               | Fix                                                                   |
| ---------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| **N+1 queries**                          | One query per record in a loop                        | Single batched query with `IN` clause or proper join                  |
| **Unbounded data**                       | Fetching all rows when 50 would do                    | Pagination + cursor-based limits                                      |
| **Synchronous I/O in hot path**          | `readFileSync`, `execSync` per request                | Async + worker pool, or cache the result                              |
| **Unnecessary serialization**            | JSON-parse-and-stringify the same blob multiple times | Pass through, or hash-cache by input                                  |
| **Cache miss patterns**                  | Read-only data fetched on every render/request        | TTL cache or memoization (with size bound)                            |
| **Bundle size growth**                   | First-paint regression after a feature add            | Dynamic import for heavy features, code splitting at route boundaries |
| **Re-render storms (React/Svelte/etc.)** | Component renders 100x for one state change           | Stable references, key-based memoization, lift state up               |

## Anti-rationalization — Performance

| Excuse                                         | Counter                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| "I'll add the optimization while I'm in here"  | Optimization without a profile is gambling. The added complexity is permanent; the win may be zero or negative.                             |
| "Big-O says it's faster"                       | Big-O is asymptotic. For your actual `n`, the constant factors and cache effects often dominate. Measure.                                   |
| "JavaScript engines optimize this"             | Modern engines optimize hot loops, not your data flow. Don't assume — profile.                                                              |
| "It's a tiny win but free"                     | Free in code, expensive in review and bisect. Many "tiny wins" together obscure the actual hot path.                                        |
| "Premature optimization is fine if it's clean" | The dichotomy isn't "messy vs clean optimization." It's "with evidence vs without." Without evidence, even clean optimization is premature. |
| "We'll measure in production"                  | You won't. Production has too much noise. Build a representative reproduction first.                                                        |

## Red flags

- Optimization PR with no before/after numbers
- "Optimization" that's actually a refactor disguised as a perf win
- Removing logging, validation, or error handling "for performance" without a profile justifying it
- Use of `useMemo` / `React.memo` / `signal()` everywhere as a precaution
- Bundle size grew significantly with no entry in the changelog
- New caching layer without a documented invalidation strategy or size bound

## Verification checklist

- [ ] Before/after measurements with specific numbers (p50 and p95) attached to the PR
- [ ] Reproduction scenario documented so the next reviewer can verify
- [ ] The bottleneck was identified by profiler, not guessed
- [ ] Existing tests still pass: `pnpm lint && pnpm typecheck && pnpm test`
- [ ] Bundle size hasn't increased (run a size check if the PR touches the website or CLI bundle)
- [ ] No new caching without an invalidation/size strategy
- [ ] Performance guard added (test budget, monitoring threshold, or CI gate) to prevent silent regression
- [ ] If applicable: Core Web Vitals still in "Good" thresholds after the change
