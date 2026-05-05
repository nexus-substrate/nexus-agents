---
name: implement-feature
description: |
  Implement a new feature following project standards.
  Use when adding functionality, creating new modules, or extending capabilities.
  Triggers on "implement", "add feature", "create", "build".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Implement Feature Skill

<!-- CANONICAL SOURCES:
  - CLAUDE.md Workflow Templates
  - docs/development/CONTRIBUTION_GUIDE.md
  - CODING_STANDARDS.md
-->

**Full workflow:** [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md#workflow-feature-implementation)

## Pre-Implementation Checklist

1. **Verify context:** `TZ='America/New_York' date && git status`
2. **Check/create GitHub issue:** `gh issue list --state open`
3. **Check research registry** if implementing a technique

## Hard Design Decisions — Constraint-Divergent Design

When the problem has multiple plausible approaches (e.g., "event-driven or polling?", "synchronous vs queue-based?", "monolithic helper vs split modules?"), **do not generate the same solution three times with different variable names**. Instead, articulate 2–3 _distinct constraints_ first, then sketch one solution per constraint and compare.

Anchor constraints in real tradeoffs:

- "minimize allocations" vs "minimize lines of code" vs "minimize external deps"
- "lowest latency" vs "lowest memory" vs "easiest to test"
- "fewest moving parts" vs "easiest to extend" vs "matches existing pattern X"

Three constraints that each eliminate ~70% of the solution space leave you searching ~2.7% of it — a focused region, not blind sampling. (Pattern adapted from `itigges22/ATLAS` PlanSearch; the math is theirs.)

Apply this discipline only for genuinely-multivalent decisions. Indicators:

- Multiple plausible architectures where reviewers would reasonably disagree
- A wrong choice would be expensive to reverse (data-shape migration, public API surface, cross-package boundary)
- You catch yourself thinking "I'll just pick one and see what review says" — pick deliberately, by constraint, instead

Out of scope: routine work where the approach is dictated by canonical paths or existing patterns. Don't over-apply.

## Implementation Process

### Phase 1: Interface First

```typescript
// Define interface FIRST
interface IFeature {
  method(input: Input): Promise<Result<Output, Error>>;
}
```

See [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md) for boundary checklist.

### Phase 2: TDD

1. Write failing test
2. Run: `pnpm test -- --watch`
3. Implement to pass

### Phase 3: Quality Gates

```bash
pnpm lint && pnpm typecheck && pnpm test
```

### Phase 4: Commit and PR

```bash
git commit -m "feat(scope): description

Closes #<issue>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

gh pr create --title "feat(scope): description" --base main
```

## Quality Checklist

See [CODING_STANDARDS.md](../../CODING_STANDARDS.md#10-quality-gates) for full checklist.

- [ ] Tests pass, coverage ≥ 80%
- [ ] Lint and types clean
- [ ] Files ≤ 400 lines, functions ≤ 50 lines
- [ ] Interface defined first

## Implementation Complete Checklist

Before marking ANY technique or feature as "implemented", verify ALL of the following:

### Code Requirements

- [ ] Code exists in specified `integration_files`
- [ ] All functions have explicit return types
- [ ] No `any` types (use `unknown` instead)

### Quality Gates

- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (relevant tests)

### Documentation Updates (if research-related)

- [ ] `docs/research/registry/techniques.yaml`: `status: implemented`, `decision_history` entry
- [ ] `docs/research/registry/papers.yaml`: `implementation_status` updated
- [ ] `docs/research/RESEARCH_INDEX.md`: Quick Stats updated if counts changed

### GitHub Tracking

- [ ] Implementation issue closed with summary comment
- [ ] PR merged (if applicable)

**Do NOT mark as implemented if:** tests fail, implementation is partial, or feature is behind a flag.

## Thin vertical slices (incremental implementation)

Build the smallest end-to-end working piece first, then expand. Avoid implementing the whole feature in one pass — each slice should leave the system in a working, testable state.

### The increment cycle

```text
Implement → Test → Verify → Commit → Next slice
```

For each slice:

1. **Implement** the smallest complete piece of functionality (must be end-to-end, not just one layer)
2. **Test** — run the test suite (write a new test if none covers this slice — see `test-driven-development` skill)
3. **Verify** — confirm the slice works (tests pass, build succeeds, manual check if user-facing)
4. **Commit** — small, focused commit with a clear message
5. **Next slice** — only after the previous one is verifiable

### The 100-line rule

If you're about to write more than ~100 lines without testing, **stop**. Either:

- Split the work into a smaller slice that fits the cycle, OR
- Confirm with the user that the larger scope is justified (e.g., a generated stub from a schema)

Larger commits hide bugs, fight `git bisect`, and bloat code review surface. Small commits compound; large commits accumulate risk.

### Anti-rationalization — Incremental implementation

| Excuse                                             | Counter                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| "It's all related, makes sense to commit together" | "Related" hides the failure boundary. Atomic commits separate "the failing change" from "everything else."                   |
| "I'll test it all at the end"                      | The end is when you're already deep into the next problem. The cycle catches issues while you still have context.            |
| "Splitting this is artificial"                     | Each slice should be end-to-end (vertical, not horizontal). If you can't make a slice end-to-end, the design is too coupled. |
| "This is faster as one big push"                   | Maybe per-keystroke. Per-PR-merged-to-main, the cycle is faster because debug time grows superlinearly with diff size.       |
| "I'll commit when tests pass"                      | Tests passing is the floor, not the ceiling. Each slice gets its own commit; tests passing is what makes the commit safe.    |
