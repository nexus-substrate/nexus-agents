/**
 * Clean Architecture Knowledge Module
 *
 * Covers hexagonal/ports-and-adapters, clean architecture layers,
 * onion architecture, SOLID principles, and module boundary patterns.
 *
 * @module agents/experts/knowledge/architecture/clean-architecture
 * @see https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
 * (Source: Epic #643 / Issue #648 - Phase 1d)
 */

import type { KnowledgeModule } from '../types.js';

export const CLEAN_ARCHITECTURE_MODULE: KnowledgeModule = {
  id: 'architecture-clean-architecture',
  domain: 'architecture',
  title: 'Clean Architecture Patterns',
  tags: ['clean-architecture', 'hexagonal', 'solid', 'ports-adapters', 'onion'],
  sections: [
    {
      title: 'Clean Architecture Layers',
      content: [
        'LAYER 1 - Entities: Enterprise business rules, domain objects, value objects',
        'LAYER 2 - Use Cases: Application-specific business rules, orchestrate entity interactions',
        'LAYER 3 - Interface Adapters: Controllers, presenters, gateways, DTOs',
        'LAYER 4 - Frameworks & Drivers: Web frameworks, databases, external APIs, UI',
        'RULE: Dependencies ONLY point inward (outer layers depend on inner layers)',
        'RULE: Inner layers MUST NOT know about outer layers',
        'RULE: Data crossing boundaries uses simple DTOs or value objects',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Hexagonal / Ports-and-Adapters',
      content: [
        'CONCEPT: Application core defines ports (interfaces); adapters implement them',
        'PORT types: Driving (primary/inbound) and Driven (secondary/outbound)',
        'DRIVING PORT: API exposed by the application (e.g., IOrderService)',
        'DRIVEN PORT: Interface the application requires (e.g., IOrderRepository)',
        'DRIVING ADAPTER: HTTP controller, CLI handler, message consumer',
        'DRIVEN ADAPTER: Database implementation, email sender, external API client',
        'BENEFIT: Swap adapters without changing business logic (test with in-memory)',
        'PATTERN: Use dependency injection to wire adapters to ports at composition root',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Onion Architecture Comparison',
      content: [
        'SIMILARITY: Dependencies point inward, domain at center',
        'DIFFERENCE: Onion explicitly names Domain Model, Domain Services, Application Services',
        'ONION INNER: Domain Model (entities, value objects, domain events)',
        'ONION MIDDLE: Domain Services (cross-entity logic, repository interfaces)',
        'ONION OUTER: Application Services (use case orchestration, transaction boundaries)',
        'ONION OUTERMOST: Infrastructure (persistence, messaging, UI)',
        'USE ONION WHEN: Team is more comfortable with layered thinking than port/adapter',
      ].join('\n'),
      priority: 6,
    },
    {
      title: 'SOLID Principles Applied',
      content: [
        'S - Single Responsibility: Each module has ONE reason to change',
        '  APPLY: Split OrderService into OrderCreator, OrderValidator, OrderNotifier',
        'O - Open/Closed: Extend behavior without modifying existing code',
        '  APPLY: Use strategy pattern for payment methods instead of if/else chains',
        'L - Liskov Substitution: Subtypes must be substitutable for base types',
        '  APPLY: If Square extends Rectangle, setWidth must not break area calculation',
        'I - Interface Segregation: Clients should not depend on unused methods',
        '  APPLY: Split IRepository into IReader and IWriter when queries differ from commands',
        'D - Dependency Inversion: Depend on abstractions, not concretions',
        '  APPLY: Use case imports IEmailSender interface, not SmtpEmailSender class',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Module Boundary Patterns',
      content: [
        'PUBLIC API: Each module exposes a single index.ts barrel export',
        'INTERNAL: Implementation details are not exported; enforce via eslint import rules',
        'ANTI-CORRUPTION LAYER: Translate external models at boundary, never leak them inward',
        'SHARED KERNEL: Minimal shared types between modules (value objects, events)',
        'PATTERN: Module boundary = npm package boundary in monorepo architecture',
        'ENFORCE: Use path aliases and eslint-plugin-boundaries to prevent cross-cutting imports',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'Monolith vs Clean Architecture Decision Tree',
      content: [
        'Q1: Is the project < 6 months old or a prototype? → START with modular monolith',
        'Q2: Do you have < 3 developers? → Modular monolith (clean arch adds overhead)',
        'Q3: Is domain complexity high with many business rules? → Clean architecture',
        'Q4: Do you need to swap infrastructure frequently? → Hexagonal/ports-adapters',
        'Q5: Is the team unfamiliar with DDD/clean arch? → Start simple, refactor later',
        'PRINCIPLE: Monolith-first — extract when you have evidence of need',
        'WARNING: Premature clean architecture = over-engineering for simple CRUD apps',
        'SIGNAL TO ADOPT: Business logic tangled with infrastructure, testing requires DB',
      ].join('\n'),
      priority: 7,
    },
  ],
} as const;
