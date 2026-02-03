/**
 * Integration Testing Knowledge Module
 *
 * Best practices for integration testing including contract testing,
 * service virtualization, test containers, and data management.
 *
 * @module agents/experts/knowledge/testing/integration-patterns
 * (Source: Issue #646 - Phase 1b: Testing Expert Knowledge)
 */

import type { KnowledgeModule } from '../types.js';

export const INTEGRATION_TESTING_PATTERNS: KnowledgeModule = {
  id: 'testing-integration-patterns',
  domain: 'testing',
  title: 'Integration Testing Patterns & Standards',
  tags: ['integration-testing', 'contract-testing', 'test-containers', 'api-testing'],
  sections: [
    {
      title: 'Contract Testing (Consumer-Driven Contracts)',
      priority: 95,
      content: `## When to Use Contract Testing
- Microservices communicating via HTTP/gRPC/messaging
- Teams owning different sides of an API boundary
- Preventing breaking changes before deployment

## Pact Workflow
1. Consumer writes contract test defining expected request/response
2. Pact broker stores the contract
3. Provider runs verification against the contract
4. CI gates deployment if verification fails

## Key Rules
- Consumer defines the contract; provider verifies it
- Test only the contract shape, not business logic
- Include provider states for different scenarios (empty list, error, etc.)
- Version contracts with consumer application version
- Run provider verification in provider's CI pipeline

## Decision: Contract Test vs Integration Test
- Contract test: validates API shape across team boundaries
- Integration test: validates behavior within a single team's services
- Use both when services are independently deployed`,
    },
    {
      title: 'Service Virtualization',
      priority: 85,
      content: `## Purpose
Replace external dependencies with controlled, repeatable stand-ins during testing.

## Tools by Ecosystem
| Tool         | Language   | Use Case                          |
| ------------ | ---------- | --------------------------------- |
| WireMock     | Java/Any   | HTTP API stubbing and recording   |
| MockServer   | Java/Any   | HTTP/HTTPS mock and proxy         |
| Nock         | Node.js    | HTTP request interception         |
| MSW          | JS/TS      | Browser and Node API mocking      |
| VCR/Betamax  | Ruby/Python | Record and replay HTTP cassettes  |

## Best Practices
- Record real responses once, replay in tests (cassette pattern)
- Update recordings when external API changes
- Use dynamic matching (regex on paths) for parameterized endpoints
- Simulate error responses: 500, 429 (rate limit), timeouts
- Simulate latency to test timeout handling
- Never rely on live external services in CI`,
    },
    {
      title: 'Test Containers',
      priority: 90,
      content: `## When to Use Test Containers
- Tests require a real database (PostgreSQL, MySQL, MongoDB)
- Tests require a real message broker (Kafka, RabbitMQ, Redis)
- Tests require a real search engine (Elasticsearch, OpenSearch)
- Mocking the dependency would hide real integration bugs

## Pattern
1. Start container in test setup (beforeAll / fixture scope=session)
2. Apply migrations or seed data
3. Run tests against the real service
4. Tear down container in afterAll

## Rules
- Use fixed image tags, never \`latest\`
- Set resource limits (memory, CPU) to prevent CI exhaustion
- Reuse containers across test suites when possible (session scope)
- Use health checks to wait for container readiness
- Isolate test data with unique prefixes or schemas per test suite

## CI Considerations
- Ensure CI runners have Docker or a Docker-compatible runtime
- Cache Docker images in CI to speed up container startup
- Set timeouts for container startup (30s default, 60s for heavy services)
- Use \`testcontainers\` library (available in Java, Node.js, Python, Go, .NET)`,
    },
    {
      title: 'Database Integration Testing',
      priority: 80,
      content: `## Strategies
| Strategy          | Speed  | Fidelity | Isolation |
| ----------------- | ------ | -------- | --------- |
| In-memory DB      | Fast   | Low      | High      |
| Test container    | Medium | High     | High      |
| Shared test DB    | Fast   | High     | Low       |
| Transaction rollback | Fast | High     | High      |

## Transaction Rollback Pattern
- Wrap each test in a transaction
- Roll back after test completes
- Fast and isolated but cannot test commit behavior

## Migration Testing
- Always test migrations forward and backward (up/down)
- Run migrations as part of test setup
- Test data migration scripts with representative data sets

## Data Isolation Rules
- Never share data between tests
- Generate unique identifiers per test (UUID prefixes)
- Clean up in afterEach, not beforeEach (catches leaked data)
- Use database schemas or namespaces for parallel test execution`,
    },
    {
      title: 'API Testing with Real HTTP',
      priority: 75,
      content: `## Tools
| Tool       | Language   | Purpose                           |
| ---------- | ---------- | --------------------------------- |
| supertest  | Node.js    | Express/Koa/Fastify HTTP testing  |
| httpx      | Python     | Async HTTP client for testing     |
| REST Assured| Java      | Fluent HTTP API testing           |
| reqwest    | Rust       | HTTP client for integration tests |

## What to Test
- Status codes for success and error cases
- Response body structure and required fields
- Content-Type headers
- Authentication/authorization enforcement
- Rate limiting behavior
- Pagination correctness
- Idempotency of PUT/DELETE operations

## Pattern: Test Against Running Server
1. Start server in test setup (in-process or subprocess)
2. Send real HTTP requests
3. Assert on response status, headers, body
4. Shut down server in teardown

## Anti-patterns
- Testing against a shared staging environment (flaky, slow)
- Skipping error response testing (only testing happy path)
- Hardcoding URLs instead of using base URL configuration`,
    },
    {
      title: 'Test Data Management & Cleanup',
      priority: 70,
      content: `## Strategies for Test Data
| Strategy       | When to Use                            |
| -------------- | -------------------------------------- |
| Factories      | Need varied but valid domain objects   |
| Fixtures       | Need consistent reference data         |
| Builders       | Need complex object graphs             |
| Seeders        | Need bulk data for performance tests   |
| Snapshots      | Need database state from production    |

## Factory Pattern
- Define a factory per domain entity
- Use sensible defaults; override only what the test cares about
- Use sequences for unique fields (email_1@test.com, email_2@test.com)
- Compose factories for nested relationships

## Cleanup Rules
1. Each test cleans up its own data (afterEach)
2. Use TRUNCATE or DELETE with known IDs, not DROP
3. For shared databases: use schema-per-test-suite isolation
4. For file-based tests: use temp directories with automatic cleanup
5. For external services: use idempotent setup that handles existing data

## Anti-patterns
- Relying on test execution order for data setup
- Using production data snapshots without sanitization
- Sharing mutable test fixtures across tests`,
    },
  ],
} as const;
