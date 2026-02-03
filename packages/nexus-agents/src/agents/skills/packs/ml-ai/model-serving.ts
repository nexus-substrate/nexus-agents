/**
 * Model Serving Patterns Skills
 *
 * Patterns for serving ML models in production: inference optimization,
 * A/B testing, canary deployments, model versioning, and monitoring.
 *
 * @module agents/skills/packs/ml-ai/model-serving
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const MODEL_SERVING_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'model-serving-review',
    description:
      'Reviews model serving code for production readiness. Checks inference ' +
      'batching, model versioning, health checks, graceful degradation, ' +
      'latency tracking, input validation, and output post-processing.',
    category: 'code-analysis',
    complexity: 'complex',
    code: [
      'function modelServingReview(code: string): string {',
      '  const checks = [',
      '    { check: "Inference Batching", pattern: /batch|batchSize|batch_size/i },',
      '    { check: "Model Versioning", pattern: /version|modelId|model_name/i },',
      '    { check: "Health Check", pattern: /health|ready|alive|warmup/i },',
      '    { check: "Graceful Degradation", pattern: /fallback|default.*predict|cache.*result/i },',
      '    { check: "Latency Tracking", pattern: /latency|duration|responseTime|histogram/i },',
      '    { check: "Input Validation", pattern: /validate|schema|shape|dtype/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      { name: 'code', type: 'string', description: 'Model serving code to review', required: true },
    ],
    outputType: 'string',
    tags: ['ml', 'serving', 'inference', 'production', 'monitoring'],
    examples: [
      {
        description: 'Review a model serving endpoint',
        input: {
          code: 'app.post("/predict", validate(schema), async (req) => { timer.start(); })',
        },
        expectedOutput: 'OK: Input Validation\nOK: Latency Tracking',
      },
    ],
  },
  {
    name: 'ml-ab-testing',
    description:
      'Reviews A/B testing and canary deployment patterns for ML models. ' +
      'Checks traffic splitting, metric collection, statistical significance, ' +
      'rollback mechanisms, and feature flag integration.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function mlAbTesting(code: string): string {',
      '  const checks = [',
      '    { check: "Traffic Splitting", pattern: /split|weight|percent|canary/i },',
      '    { check: "Metric Collection", pattern: /metric|measure|track|observe/i },',
      '    { check: "Statistical Test", pattern: /pValue|significance|tTest|chiSquare/i },',
      '    { check: "Rollback Support", pattern: /rollback|revert|previous.*model/i },',
      '    { check: "Feature Flags", pattern: /featureFlag|toggle|experiment/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      { name: 'code', type: 'string', description: 'A/B testing code to review', required: true },
    ],
    outputType: 'string',
    tags: ['ml', 'ab-testing', 'canary', 'deployment', 'experimentation'],
    examples: [
      {
        description: 'Review A/B testing setup for model deployment',
        input: {
          code: 'const variant = experiment.assign(userId, { control: 0.9, treatment: 0.1 })',
        },
        expectedOutput: 'OK: Traffic Splitting\nOK: Feature Flags',
      },
    ],
  },
] as const;
