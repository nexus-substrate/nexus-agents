/**
 * End-to-End Testing Knowledge Module
 *
 * Best practices for E2E testing including Page Object Model,
 * selector strategies, waiting patterns, and flaky test prevention.
 *
 * @module agents/experts/knowledge/testing/e2e-patterns
 * (Source: Issue #646 - Phase 1b: Testing Expert Knowledge)
 */

import type { KnowledgeModule } from '../types.js';

export const E2E_TESTING_PATTERNS: KnowledgeModule = {
  id: 'testing-e2e-patterns',
  domain: 'testing',
  title: 'End-to-End Testing Patterns & Standards',
  tags: ['e2e-testing', 'playwright', 'page-object-model', 'browser-testing'],
  sections: [
    {
      title: 'Page Object Model Pattern',
      priority: 95,
      content: `## Purpose
Encapsulate page structure and interactions into reusable classes.
Decouple test logic from page implementation details.

## Structure
\`\`\`
pages/
  login.page.ts      → selectors + actions for login page
  dashboard.page.ts  → selectors + actions for dashboard
  components/
    nav-bar.ts       → shared navigation component
\`\`\`

## Rules
- One Page Object per page or major component
- Page Objects expose actions (login, submitForm), not raw selectors
- Page Objects return other Page Objects for navigation flows
- Never put assertions in Page Objects; keep them in test files
- Use composition for shared components (navbar, footer, modals)

## Anti-patterns
- God Page Object with hundreds of methods → split by component
- Assertions inside Page Objects → move to test files
- Exposing raw locators instead of action methods
- Duplicating selectors across multiple Page Objects`,
    },
    {
      title: 'Selector Strategy Priority',
      priority: 90,
      content: `## Selector Priority (most stable to least stable)
1. \`data-testid\` attributes → most resilient to UI changes
2. Accessibility roles (\`getByRole\`) → stable and accessible
3. Text content (\`getByText\`) → readable but locale-dependent
4. Label associations (\`getByLabel\`) → good for form fields
5. CSS selectors → fragile, breaks on refactoring
6. XPath → most fragile, avoid entirely

## Decision Rules
- Use \`data-testid\` for elements without clear accessible roles
- Use \`getByRole\` for buttons, links, headings, inputs
- Use \`getByText\` for static content that identifies a section
- Use \`getByLabel\` for form inputs with visible labels
- Never use CSS class selectors (change during styling updates)
- Never use auto-generated IDs or dynamic selectors

## Adding Test IDs
- Convention: \`data-testid="component-action"\` (e.g., \`data-testid="login-submit"\`)
- Add test IDs during development, not as test afterthought
- Strip test IDs from production builds if desired (build-time transform)`,
    },
    {
      title: 'Waiting Strategies',
      priority: 95,
      content: `## The Cardinal Rule
NEVER use sleep/setTimeout/fixed delays in tests.

## Correct Waiting Approaches
| Approach            | When to Use                             |
| ------------------- | --------------------------------------- |
| Auto-wait (default) | Playwright/Cypress built-in waiting     |
| waitForSelector     | Element appears/disappears dynamically  |
| waitForResponse     | Wait for specific API call to complete  |
| waitForLoadState    | Wait for page navigation to settle      |
| expect with retry   | Assertion that needs polling             |
| waitForURL          | Wait for navigation to specific URL     |

## Why Fixed Waits Are Wrong
- Too short → flaky test
- Too long → slow test suite
- Correct duration varies by environment (CI vs local)

## Timeout Configuration
- Default action timeout: 5-10 seconds
- Navigation timeout: 30 seconds
- Global test timeout: 60 seconds
- CI environments: multiply timeouts by 2x
- Set timeouts in config, not in individual tests`,
    },
    {
      title: 'Flaky Test Prevention',
      priority: 85,
      content: `## Common Causes and Fixes
| Cause                  | Fix                                      |
| ---------------------- | ---------------------------------------- |
| Fixed sleeps           | Use auto-wait or explicit wait-for       |
| Shared test state      | Isolate each test with fresh data        |
| Animation interference | Disable animations in test config        |
| Network timing         | Wait for specific network responses      |
| Date/time dependency   | Mock clock or use fixed test dates       |
| Random data ordering   | Sort before comparing or assert set membership |
| Viewport differences   | Set fixed viewport in test config        |
| CI resource pressure   | Increase timeouts, reduce parallelism    |

## Flaky Test Protocol
1. Quarantine the flaky test (mark as \`skip\` with linked issue)
2. Reproduce locally with \`--repeat-each=50\`
3. Identify root cause using trace viewer
4. Fix and verify with \`--repeat-each=100\`
5. Remove quarantine label

## Stability Metrics
- Track flaky test rate per week
- Target: < 1% flaky rate across all E2E tests
- Revert tests that exceed 3 flaky failures in 7 days`,
    },
    {
      title: 'Playwright Patterns',
      priority: 80,
      content: `## Locator Best Practices
- Use \`page.getByRole()\`, \`page.getByText()\`, \`page.getByTestId()\`
- Avoid \`page.locator('css-selector')\` unless no semantic alternative
- Chain locators for scoping: \`page.getByRole('list').getByRole('listitem')\`
- Use \`locator.filter()\` for narrowing by text or other criteria

## Assertion Patterns
- Use \`expect(locator)\` web-first assertions (auto-retry)
- Prefer \`toBeVisible()\` over \`toHaveCount(1)\`
- Use \`toHaveText()\` for content verification
- Use \`toHaveURL()\` for navigation assertions

## Fixture Usage
- Use \`test.extend()\` for custom fixtures
- Fixtures handle setup/teardown automatically
- Share authentication state with \`storageState\`
- Use worker-scoped fixtures for expensive setup (database seeding)

## Trace and Debugging
- Enable trace on first retry: \`trace: 'on-first-retry'\`
- Use \`page.pause()\` for interactive debugging (local only)
- Capture screenshots on failure: \`screenshot: 'only-on-failure'\`
- Store test artifacts in CI for post-mortem analysis`,
    },
    {
      title: 'Cross-Browser Testing',
      priority: 60,
      content: `## Browser Priority
1. Chromium — primary target, fastest execution
2. Firefox — secondary, catches rendering differences
3. WebKit (Safari) — tertiary, important for macOS/iOS users

## Strategy
- Run all tests on Chromium in every CI pipeline
- Run full suite on Firefox/WebKit on nightly or pre-release builds
- Focus cross-browser runs on visual and layout tests

## Common Cross-Browser Issues
| Issue               | Affected Browser | Mitigation                  |
| ------------------- | ---------------- | --------------------------- |
| Date input format   | Safari           | Use custom date picker      |
| Flexbox rendering   | Safari           | Test layout assertions      |
| Clipboard API       | Firefox          | Feature-detect and fallback |
| Shadow DOM styling  | All              | Use piercing selectors      |
| Scroll behavior     | Safari           | Avoid smooth scroll in tests|

## Configuration
- Define projects array in Playwright config
- Share test files across browsers
- Use \`test.skip\` with browser condition for known incompatibilities
- Set per-browser viewport sizes to match real usage`,
    },
  ],
} as const;
