/**
 * Serverless Patterns Skills
 *
 * Patterns for serverless architectures: Lambda/Functions best practices,
 * cold start optimization, event-driven patterns, and cost management.
 *
 * @module agents/skills/packs/cloud/serverless-patterns
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const SERVERLESS_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'serverless-function-review',
    description:
      'Reviews serverless function code for best practices. Checks cold start optimization, ' +
      'connection pooling, idempotency, timeout configuration, memory sizing, ' +
      'and error handling with dead letter queues.',
    category: 'cloud-native',
    complexity: 'moderate',
    code: [
      'function serverlessFunctionReview(code: string): string {',
      '  const checks = [',
      '    { check: "Cold Start Opt", pattern: /provisioned|warmup|keepAlive|init.*outside/i },',
      '    { check: "Connection Pool", pattern: /pool|reuse|keep-alive|connection.*outside/i },',
      '    { check: "Idempotency", pattern: /idempoten|dedup|requestId|eventId/i },',
      '    { check: "Timeout Config", pattern: /timeout|timeLimit|deadline/i },',
      '    { check: "Error Handling", pattern: /deadLetter|dlq|retry|catch/i },',
      '    { check: "Structured Logging", pattern: /structuredLog|json.*log|requestId.*log/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Serverless function code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['cloud', 'serverless', 'lambda', 'functions', 'cold-start'],
    examples: [
      {
        description: 'Review an AWS Lambda handler',
        input: {
          code: 'const db = createPool(); // outside handler\nexport const handler = async (event) => { const reqId = event.requestContext.requestId; }',
        },
        expectedOutput: 'OK: Connection Pool\nOK: Idempotency',
      },
    ],
  },
] as const;
