/**
 * nexus-agents/testing/tasks/definitions - Task 015
 *
 * Task 015: Integration Pattern
 * Tests understanding of integration patterns.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 15: Integration Pattern
 * Tests understanding of integration patterns.
 */
export const TASK_015_INTEGRATION: EvaluationTask = {
  id: 'task-015',
  name: 'Integration Pattern',
  category: 'architecture',
  difficulty: 'expert',
  description: 'Design and implement integration patterns.',
  prompt: `Design an event-driven integration between three microservices:

Services:
1. OrderService - handles customer orders
2. InventoryService - manages product stock
3. NotificationService - sends emails/SMS

Flow:
1. Customer places order -> OrderService creates order
2. OrderService publishes OrderCreated event
3. InventoryService reserves stock
4. InventoryService publishes StockReserved or StockFailed
5. OrderService updates order status
6. NotificationService sends confirmation or failure notice

Requirements:
- At-least-once delivery guarantee
- Idempotent consumers
- Saga pattern for distributed transaction
- Dead letter queue for failed messages
- Event schema versioning
- Monitoring and observability

Provide:
1. Event schemas (TypeScript interfaces)
2. Message broker configuration (RabbitMQ or Kafka)
3. Consumer implementation pattern
4. Saga orchestration or choreography approach
5. Error handling and compensation logic
6. Monitoring approach`,
  expectedOutcome: {
    mustContain: ['event', 'saga', 'idempotent', 'dead letter', 'compensat'],
    mustNotContain: [],
    minLength: 1000,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'event_design',
        description: 'Well-designed event schemas',
        weight: 0.2,
        maxScore: 10,
        indicators: ['OrderCreated', 'StockReserved', 'interface', 'version'],
      },
      {
        id: 'saga_pattern',
        description: 'Correct saga implementation',
        weight: 0.3,
        maxScore: 10,
        indicators: ['saga', 'compensat', 'rollback', 'orchestrat'],
      },
      {
        id: 'reliability',
        description: 'Addresses reliability concerns',
        weight: 0.25,
        maxScore: 10,
        indicators: ['idempotent', 'at-least-once', 'dead letter', 'retry'],
      },
      {
        id: 'observability',
        description: 'Monitoring and observability',
        weight: 0.25,
        maxScore: 10,
        indicators: ['monitor', 'trace', 'log', 'metric', 'observ'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 7,
    notes: 'Expert-level distributed systems task',
  },
  timeoutMs: 180000,
  optimalCli: 'claude',
  acceptableClis: ['claude'],
  tags: ['integration', 'microservices', 'event-driven', 'saga', 'expert'],
};
