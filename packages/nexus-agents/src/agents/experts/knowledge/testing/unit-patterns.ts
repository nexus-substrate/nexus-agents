/**
 * Unit Testing Knowledge Module
 *
 * Best practices for unit testing including isolation, test doubles,
 * TDD workflow, coverage targets, and the testing pyramid decision framework.
 *
 * @module agents/experts/knowledge/testing/unit-patterns
 * (Source: Issue #646 - Phase 1b: Testing Expert Knowledge)
 */

import type { KnowledgeModule } from '../types.js';

export const UNIT_TESTING_PATTERNS: KnowledgeModule = {
  id: 'testing-unit-patterns',
  domain: 'testing',
  title: 'Unit Testing Patterns & Standards',
  tags: ['unit-testing', 'tdd', 'mocking', 'coverage', 'test-pyramid'],
  sections: [
    {
      title: 'Testing Pyramid Decision Framework',
      priority: 100,
      content: `## Recommended Test Mix
- Unit: 70% | Integration: 20% | E2E: 10%

## When to Adjust Ratios
- Heavy business logic → increase unit to 80%, reduce E2E to 5%
- API-centric service → increase integration to 35%, reduce unit to 55%
- UI-heavy application → increase E2E to 20%, reduce unit to 55%
- Data pipeline → increase integration to 40%, reduce unit to 50%
- Greenfield project → start with unit 80%, add integration/E2E as interfaces stabilize

## Decision Tree: Which Test Type?
1. Pure function with no dependencies? → Unit test
2. Multiple components interacting? → Integration test
3. Database queries or external APIs? → Integration test (with test containers or mocks)
4. User-facing workflow across pages? → E2E test
5. Race conditions or timing? → Integration test with controlled concurrency
6. Error handling paths? → Unit test per error case + integration for cross-boundary errors`,
    },
    {
      title: 'Test Isolation & Dependency Injection',
      priority: 90,
      content: `## Isolation Principles
- Each test runs independently; no shared mutable state between tests
- Tests must not depend on execution order
- Use dependency injection to swap real dependencies for test doubles
- Prefer constructor injection over service locators for testability
- Reset all mocks/stubs/spies in beforeEach or afterEach hooks

## DI Pattern for Testability
\`\`\`
// Production: new Service(new RealRepo())
// Test:       new Service(mockRepo)
\`\`\`

## Common Isolation Violations
- Global singletons modified by tests → use DI instead
- File system access → inject a filesystem abstraction
- Date/time dependency → inject a clock interface
- Environment variables → inject a config object`,
    },
    {
      title: 'Test Double Taxonomy',
      priority: 85,
      content: `## Types of Test Doubles (from simplest to most complex)
| Double  | Purpose                          | When to Use                          |
| ------- | -------------------------------- | ------------------------------------ |
| Dummy   | Fill parameter lists             | Value is never used in test          |
| Stub    | Return predetermined values      | Control indirect inputs              |
| Spy     | Record calls for later assertion | Verify side effects occurred         |
| Mock    | Pre-programmed expectations      | Verify interaction protocol          |
| Fake    | Working simplified implementation| Need realistic behavior (in-memory DB)|

## Selection Rules
1. Default to stubs for most unit tests
2. Use spies when verifying a function was called with correct args
3. Use mocks sparingly; they couple tests to implementation
4. Use fakes for complex dependencies (repositories, queues, caches)
5. Never mock what you don't own — wrap third-party APIs first`,
    },
    {
      title: 'AAA Pattern (Arrange-Act-Assert)',
      priority: 80,
      content: `## Structure Every Test as Three Blocks
1. **Arrange** — Set up preconditions and inputs
2. **Act** — Execute the behavior under test (single action)
3. **Assert** — Verify the expected outcome

## Rules
- One Act per test; multiple Acts signal the test covers too much
- Keep Arrange minimal; extract shared setup to beforeEach or factory functions
- Assert one logical concept per test (may need multiple expect calls for one concept)
- Separate blocks with blank lines for readability

## Anti-patterns
- No assertion → test proves nothing
- Assert before Act → test structure is wrong
- Multiple Acts → split into separate tests
- Arrange dominates → extract test fixtures or builders`,
    },
    {
      title: 'TDD Workflow: Red-Green-Refactor',
      priority: 75,
      content: `## The Three Steps
1. **Red** — Write a failing test that describes the desired behavior
2. **Green** — Write the minimum code to make the test pass
3. **Refactor** — Improve the code while keeping all tests green

## Discipline Rules
- Never write production code without a failing test
- Do not refactor while tests are red
- Commit after each Green and after each Refactor
- Keep the Red-Green cycle under 5 minutes

## When TDD Works Best
- Business logic with clear input/output contracts
- Bug fixes (write the failing test first, then fix)
- Algorithm development

## When to Skip TDD
- Exploratory prototyping (write tests after design stabilizes)
- Thin wrappers around third-party libraries
- One-off scripts`,
    },
    {
      title: 'Coverage Targets',
      priority: 70,
      content: `## Thresholds
| Scope           | Target  | Rationale                              |
| --------------- | ------- | -------------------------------------- |
| Overall project | ≥ 80%   | Balances confidence with effort        |
| Critical paths  | ≥ 95%   | Payment, auth, data mutations          |
| New code (diff) | ≥ 90%   | Prevents coverage regression           |
| Utility/helpers | ≥ 90%   | High reuse justifies high coverage     |
| Generated code  | Exclude | No value in testing codegen output     |

## Coverage as a Signal, Not a Goal
- 100% coverage does not mean bug-free; it means all lines executed
- Mutation testing provides better quality signal than line coverage
- Branch coverage matters more than statement coverage
- Uncovered code in critical paths is a higher risk than low overall %

## What to Exclude
- Type declarations and interfaces
- Dependency injection wiring (configuration code)
- Third-party library wrappers (tested via integration tests)`,
    },
    {
      title: 'Framework-Specific Patterns',
      priority: 60,
      content: `## Vitest (TypeScript/Node.js)
- Use \`vi.fn()\` for mocks, \`vi.spyOn()\` for spies
- Use \`vi.useFakeTimers()\` for time-dependent tests
- Prefer \`describe\` blocks for grouping related tests
- Use \`it.each\` / \`test.each\` for parameterized tests
- Enable \`--reporter=verbose\` in CI for clear failure output

## Jest (TypeScript/Node.js)
- Use \`jest.fn()\` and \`jest.spyOn()\` (same API shape as Vitest)
- Use \`jest.mock('module')\` for module-level mocking
- Prefer \`toMatchInlineSnapshot()\` over \`toMatchSnapshot()\` for small values
- Use \`jest.setTimeout()\` for slow async tests

## pytest (Python)
- Use \`@pytest.fixture\` for setup/teardown
- Use \`@pytest.mark.parametrize\` for data-driven tests
- Use \`monkeypatch\` for environment and attribute patching
- Use \`tmp_path\` fixture for filesystem tests
- Prefer \`assert\` statements over unittest-style methods`,
    },
  ],
} as const;
