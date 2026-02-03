/**
 * Service Mesh Patterns Skills
 *
 * Patterns for service mesh architectures: traffic management,
 * observability, security policies, and resilience patterns.
 *
 * @module agents/skills/packs/cloud/service-mesh-patterns
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const SERVICE_MESH_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'service-mesh-config-review',
    description:
      'Reviews service mesh configuration for best practices. Checks mTLS setup, ' +
      'circuit breaker configuration, retry policies, traffic splitting, ' +
      'rate limiting, and observability (distributed tracing, metrics).',
    category: 'cloud-native',
    complexity: 'complex',
    code: [
      'function serviceMeshConfigReview(config: string): string {',
      '  const checks = [',
      '    { check: "mTLS Enabled", pattern: /mtls|STRICT|peerAuthentication/i },',
      '    { check: "Circuit Breaker", pattern: /circuitBreaker|outlierDetection|consecutive/i },',
      '    { check: "Retry Policy", pattern: /retries|retryOn|perTryTimeout/i },',
      '    { check: "Traffic Split", pattern: /weight|canary|subset|trafficPolicy/i },',
      '    { check: "Rate Limiting", pattern: /rateLimit|quota|requestsPerSecond/i },',
      '    { check: "Tracing", pattern: /tracing|jaeger|zipkin|opentelemetry/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(config) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'config',
        type: 'string',
        description: 'Service mesh YAML/config to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['cloud', 'service-mesh', 'istio', 'linkerd', 'traffic-management'],
    examples: [
      {
        description: 'Review Istio VirtualService configuration',
        input: {
          config:
            'apiVersion: networking.istio.io/v1; spec: { trafficPolicy: { tls: { mode: STRICT } } }',
        },
        expectedOutput: 'OK: mTLS Enabled\nOK: Traffic Split',
      },
    ],
  },
] as const;
