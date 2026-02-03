/**
 * Testing Standards Skills Bootstrap
 *
 * Phase 2 of Epic #643: Standards Absorption into SkillLibrary.
 * Provides testing methodology skills covering unit, integration,
 * end-to-end, and performance testing patterns.
 *
 * @module agents/skills/bootstrap/testing-standards
 */

import type { CreateSkillOptions } from '../skill-types.js';

/**
 * Bootstrap skills for testing standards and methodology.
 *
 * Each skill encodes a concrete testing pattern that agents use
 * to generate test scaffolds, plans, and configurations.
 */
export const TESTING_SKILLS = [
  // ── Unit Test Generation ──────────────────────────────────────
  {
    name: 'unit-test-generate',
    description:
      'Generates unit test scaffolds following the AAA (Arrange-Act-Assert) pattern. ' +
      'Produces isolated test cases with proper setup, execution, and verification phases. ' +
      'Supports vitest, jest, and pytest frameworks.',
    category: 'testing',
    complexity: 'moderate',
    code: [
      'function generateUnitTest({ code, framework }) {',
      '  const imports = framework === "pytest"',
      '    ? "import pytest"',
      "    : `import { describe, it, expect } from '${framework}';`;",
      '  const fnNames = extractFunctionNames(code);',
      '  return fnNames.map(fn => buildAAAScaffold(fn, framework, {',
      '    arrange: "// Set up test data and dependencies",',
      '    act: `// Call ${fn} with test inputs`,',
      '    assert: "// Verify output matches expected result",',
      '    edgeCases: ["empty input", "null/undefined", "boundary values"],',
      '  })).join("\\n\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description:
          'Source code to generate tests for. Functions and classes are extracted automatically.',
        required: true,
      },
      {
        name: 'framework',
        type: 'string',
        description: 'Test framework to target: vitest, jest, or pytest.',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['testing', 'unit-test', 'aaa-pattern', 'test-generation', 'scaffolding'],
    examples: [
      {
        description: 'Generate vitest scaffold for a utility function',
        input: {
          code: 'export function add(a: number, b: number): number { return a + b; }',
          framework: 'vitest',
        },
        expectedOutput:
          'describe("add", () => { it("returns sum of two numbers", () => { const a = 1; const b = 2; const result = add(a, b); expect(result).toBe(3); }); });',
      },
      {
        description: 'Generate pytest scaffold for a Python function',
        input: { code: 'def parse_email(raw: str) -> dict: ...', framework: 'pytest' },
        expectedOutput:
          'def test_parse_email_valid(): email = "user@example.com"; result = parse_email(email); assert result["user"] == "user"',
      },
    ],
  },

  // ── Integration Test Plan ─────────────────────────────────────
  {
    name: 'integration-test-plan',
    description:
      'Creates structured integration test plans with dependency mocking strategies. ' +
      'Identifies component boundaries, external service dependencies, and data flow paths. ' +
      'Outputs a prioritized plan with mock/stub/spy recommendations per dependency.',
    category: 'testing',
    complexity: 'complex',
    code: [
      'function createIntegrationTestPlan({ componentDescription, dependencies }) {',
      '  const deps = parseDependencies(dependencies);',
      '  const boundaries = identifyBoundaries(componentDescription, deps);',
      '  return {',
      '    scope: componentDescription,',
      '    testCases: boundaries.map(b => ({',
      '      name: `${b.source} -> ${b.target} integration`,',
      '      mockStrategy: b.isExternal ? "stub" : "spy",',
      '      setup: `Initialize ${b.source} with mocked ${b.target}`,',
      '      assertions: ["verify call args", "verify response handling", "verify error propagation"],',
      '    })),',
      '    dataFlowTests: buildDataFlowScenarios(boundaries),',
      '    teardown: "Reset all mocks and restore original implementations",',
      '  };',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'componentDescription',
        type: 'string',
        description: 'Description of the component under test, including its purpose and behavior.',
        required: true,
      },
      {
        name: 'dependencies',
        type: 'string',
        description:
          'Comma-separated list of dependencies (e.g., "database, auth-service, cache, message-queue").',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['testing', 'integration-test', 'mocking', 'test-planning', 'dependencies'],
    examples: [
      {
        description: 'Plan integration tests for a user registration service',
        input: {
          componentDescription:
            'UserRegistrationService that validates input, stores user in DB, and sends welcome email',
          dependencies: 'PostgreSQL database, SendGrid email API, Redis cache',
        },
        expectedOutput:
          'Test plan with 3 boundary tests: Service->DB (spy), Service->SendGrid (stub), Service->Redis (spy). ' +
          'Data flow: valid registration end-to-end, duplicate email rejection, email service failure handling.',
      },
    ],
  },

  // ── E2E Test Scaffold ─────────────────────────────────────────
  {
    name: 'e2e-test-scaffold',
    description:
      'Generates end-to-end test scenarios using the Page Object pattern. ' +
      'Produces page object classes for encapsulated selectors and actions, ' +
      'plus test specs that compose user flows. Supports Playwright and Cypress.',
    category: 'testing',
    complexity: 'complex',
    code: [
      'function generateE2EScaffold({ userFlow, framework }) {',
      '  const steps = parseUserFlow(userFlow);',
      '  const pages = extractUniquePages(steps);',
      '  const pageObjects = pages.map(p => ({',
      '    className: `${pascalCase(p)}Page`,',
      '    selectors: inferSelectors(p, steps),',
      '    actions: steps.filter(s => s.page === p).map(s => s.action),',
      '  }));',
      '  const testSpec = {',
      '    setup: framework === "playwright" ? "test.beforeEach" : "beforeEach",',
      '    steps: steps.map(s => `await ${s.page}Page.${s.action}(${s.data || ""})`),',
      '    assertions: steps.filter(s => s.verify).map(s => s.verify),',
      '  };',
      '  return { pageObjects, testSpec };',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'userFlow',
        type: 'string',
        description:
          'Natural language description of the user flow to test (e.g., "User logs in, navigates to dashboard, creates a report").',
        required: true,
      },
      {
        name: 'framework',
        type: 'string',
        description: 'E2E framework to target: playwright or cypress.',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['testing', 'e2e', 'page-object-pattern', 'playwright', 'cypress', 'user-flow'],
    examples: [
      {
        description: 'Generate Playwright E2E scaffold for a checkout flow',
        input: {
          userFlow:
            'User adds item to cart, proceeds to checkout, enters shipping info, completes payment',
          framework: 'playwright',
        },
        expectedOutput:
          'Page objects: CartPage (addItem, proceedToCheckout), CheckoutPage (enterShipping, completePayment). ' +
          'Test spec: test("checkout flow", async ({ page }) => { await cartPage.addItem(); ... });',
      },
      {
        description: 'Generate Cypress E2E scaffold for login flow',
        input: {
          userFlow:
            'User enters credentials on login page, submits form, sees dashboard welcome message',
          framework: 'cypress',
        },
        expectedOutput:
          'Page objects: LoginPage (enterCredentials, submit), DashboardPage (getWelcomeMessage). ' +
          'Test spec: it("successful login", () => { loginPage.enterCredentials(); ... });',
      },
    ],
  },

  // ── Performance Test Design ───────────────────────────────────
  {
    name: 'performance-test-design',
    description:
      'Designs performance test scenarios with graduated load profiles. ' +
      'Produces test configurations compatible with k6 and Artillery patterns, ' +
      'including ramp-up stages, sustained load, spike scenarios, and threshold definitions.',
    category: 'testing',
    complexity: 'complex',
    code: [
      'function designPerformanceTest({ endpoint, expectedLoad }) {',
      '  const load = parseLoadProfile(expectedLoad);',
      '  return {',
      '    scenarios: {',
      '      smoke: { vus: 1, duration: "1m" },',
      '      baseline: { vus: Math.ceil(load.rps * 0.1), duration: "5m" },',
      '      load: { stages: [',
      '        { target: load.rps, duration: "2m" },',
      '        { target: load.rps, duration: "10m" },',
      '        { target: 0, duration: "2m" },',
      '      ]},',
      '      spike: { vus: load.rps * 3, duration: "30s" },',
      '    },',
      '    thresholds: {',
      '      p95_response: load.p95Target || "500ms",',
      '      error_rate: load.errorTarget || "1%",',
      '    },',
      '    endpoint,',
      '  };',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'endpoint',
        type: 'string',
        description: 'API endpoint or URL to test (e.g., "POST /api/v1/orders").',
        required: true,
      },
      {
        name: 'expectedLoad',
        type: 'string',
        description:
          'Expected production load description (e.g., "200 requests/second with p95 under 300ms").',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['testing', 'performance', 'load-testing', 'k6', 'artillery', 'benchmarking'],
    examples: [
      {
        description: 'Design load test for a REST API endpoint',
        input: {
          endpoint: 'GET /api/v1/products',
          expectedLoad: '500 requests/second with p95 under 200ms and error rate below 0.5%',
        },
        expectedOutput:
          'Scenarios: smoke (1 VU, 1m), baseline (50 VUs, 5m), load (ramp to 500, sustain 10m, ramp down), ' +
          'spike (1500 VUs, 30s). Thresholds: p95 < 200ms, errors < 0.5%.',
      },
      {
        description: 'Design performance test for a webhook receiver',
        input: {
          endpoint: 'POST /webhooks/payment',
          expectedLoad: '50 requests/second with p95 under 1000ms',
        },
        expectedOutput:
          'Scenarios: smoke (1 VU, 1m), baseline (5 VUs, 5m), load (ramp to 50, sustain 10m), ' +
          'spike (150 VUs, 30s). Thresholds: p95 < 1000ms, errors < 1%.',
      },
    ],
  },
] as const satisfies readonly CreateSkillOptions[];
