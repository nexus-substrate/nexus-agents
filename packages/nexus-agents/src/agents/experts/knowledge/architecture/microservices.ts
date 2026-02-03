/**
 * Microservices Architecture Knowledge Module
 *
 * Covers service decomposition, saga patterns, circuit breakers,
 * service mesh, API gateways, event-driven architecture, and resilience.
 *
 * @module agents/experts/knowledge/architecture/microservices
 * @see https://microservices.io/patterns/
 * (Source: Epic #643 / Issue #648 - Phase 1d)
 */

import type { KnowledgeModule } from '../types.js';

export const MICROSERVICES_MODULE: KnowledgeModule = {
  id: 'architecture-microservices',
  domain: 'architecture',
  title: 'Microservices Architecture Patterns',
  tags: ['microservices', 'distributed-systems', 'saga', 'circuit-breaker', 'cqrs'],
  sections: [
    {
      title: 'Service Decomposition Strategies',
      content: [
        'BY DOMAIN (DDD Bounded Contexts): Align services with business domains',
        '  APPLY: Order service, Inventory service, Payment service',
        '  BENEFIT: Changes isolated to domain, team autonomy',
        "BY TEAM (Conway's Law): One service per team, team owns full lifecycle",
        '  APPLY: Max 8 people per team, max 3 services per team',
        '  BENEFIT: Clear ownership, independent deployment',
        'BY DATA: Services own their data store, no shared databases',
        '  APPLY: Each service has private DB; communicate via APIs/events',
        '  WARNING: Shared database = distributed monolith, defeats the purpose',
        'RULE: If two services MUST deploy together, they are one service',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Saga Pattern: Choreography vs Orchestration',
      content: [
        'CHOREOGRAPHY: Services emit events; other services react autonomously',
        '  USE WHEN: ≤ 4 steps, simple flows, loose coupling preferred',
        '  RISK: Hard to track overall flow, debugging distributed events is complex',
        '  EXAMPLE: OrderCreated → PaymentCharged → InventoryReserved → OrderConfirmed',
        'ORCHESTRATION: Central coordinator directs the saga step by step',
        '  USE WHEN: > 4 steps, complex compensation logic, visibility required',
        '  RISK: Coordinator is a single point of coupling (not failure if stateless)',
        '  EXAMPLE: OrderSaga calls PaymentService.charge(), then InventoryService.reserve()',
        'COMPENSATION: Every step needs an undo action for rollback',
        'DECISION: Simple linear flows → choreography; branching/retries → orchestration',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Circuit Breaker Pattern',
      content: [
        'STATE: CLOSED → requests pass through, failures counted',
        'STATE: OPEN → requests fail fast, no calls to downstream (after threshold)',
        'STATE: HALF-OPEN → limited test requests sent, success → CLOSED, failure → OPEN',
        'CONFIG: failure threshold (e.g., 5 failures in 60s), reset timeout (e.g., 30s)',
        'CONFIG: half-open max requests (e.g., 3 probe requests)',
        'APPLY: Wrap all external service calls in circuit breakers',
        'MONITOR: Track state transitions, alert on OPEN state',
        'COMBINE WITH: Fallback responses (cached data, degraded mode, default values)',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Event-Driven Architecture',
      content: [
        'EVENT SOURCING: Store state changes as immutable event log, derive current state',
        '  USE WHEN: Audit trail required, temporal queries, complex domain events',
        '  WARNING: Adds complexity; do NOT use for simple CRUD',
        'CQRS: Separate read models (queries) from write models (commands)',
        '  USE WHEN: Read and write patterns differ significantly in shape/scale',
        '  PATTERN: Command → write to event store; Event → project to read-optimized view',
        'EVENT TYPES: Domain events (business), integration events (cross-service)',
        'DELIVERY: At-least-once delivery default; design consumers to be idempotent',
        'ORDERING: Use partition keys to guarantee order within an aggregate',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'API Gateway and Service Mesh',
      content: [
        'API GATEWAY: Single entry point for external clients',
        '  HANDLES: Auth, rate limiting, request routing, response aggregation',
        '  PATTERNS: Backend-for-Frontend (BFF) — one gateway per client type',
        'SERVICE MESH: Infrastructure layer for service-to-service communication',
        '  HANDLES: mTLS, load balancing, retries, observability (sidecar proxy)',
        '  OPTIONS: Istio (feature-rich, complex), Linkerd (lightweight, simpler)',
        'DECISION: External traffic → API gateway; internal traffic → service mesh',
        'WARNING: Service mesh adds latency (~1-2ms per hop) and operational complexity',
      ].join('\n'),
      priority: 7,
    },
    {
      title: 'Resilience Patterns',
      content: [
        'RETRY: Retry transient failures with exponential backoff + jitter',
        '  CONFIG: max 3 retries, base delay 100ms, max delay 5s, jitter ±50ms',
        '  RULE: Only retry idempotent operations; never retry non-idempotent POST',
        'TIMEOUT: Set explicit timeouts on all external calls',
        '  CONFIG: connect timeout 3s, read timeout 10s, total timeout 30s',
        'BULKHEAD: Isolate resources per downstream dependency',
        '  APPLY: Separate thread pools/connection pools per service',
        '  BENEFIT: Slow service X cannot exhaust resources needed for service Y',
        'FALLBACK: Provide degraded response when dependency fails',
        '  EXAMPLES: Cached data, default values, reduced functionality',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'When NOT to Use Microservices',
      content: [
        'MONOLITH-FIRST: Start with a well-structured monolith; extract later',
        'AVOID WHEN: Team < 5 people (overhead exceeds benefit)',
        'AVOID WHEN: Domain is not well understood (wrong boundaries are expensive)',
        'AVOID WHEN: Low deployment frequency (< weekly releases)',
        'AVOID WHEN: Limited DevOps maturity (need CI/CD, monitoring, container orchestration)',
        'COST: Distributed tracing, eventual consistency, network failures, data management',
        'SIGNAL TO ADOPT: Monolith deploys are bottlenecked, teams step on each other',
        'SIGNAL TO ADOPT: Different parts need different scaling characteristics',
      ].join('\n'),
      priority: 7,
    },
  ],
} as const;
