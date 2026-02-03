/**
 * Observability Knowledge Module
 *
 * Covers the three pillars of observability (metrics, logs, traces),
 * SRE golden signals, alerting strategies, and SLO/SLI design.
 *
 * @module agents/experts/knowledge/devops/observability
 * (Source: Epic #643 - Phase 5a: DevOps Knowledge)
 */

import type { KnowledgeModule } from '../types.js';

export const OBSERVABILITY_MODULE: KnowledgeModule = {
  id: 'devops-observability',
  domain: 'devops',
  title: 'Observability and Monitoring Patterns',
  tags: ['observability', 'monitoring', 'sre', 'slo', 'alerting', 'opentelemetry'],
  sections: [
    {
      title: 'Three Pillars of Observability',
      priority: 10,
      content: [
        'METRICS: numeric measurements aggregated over time (counters, gauges, histograms)',
        '  TOOLS: Prometheus, Datadog, CloudWatch',
        '  USE FOR: dashboards, alerting, capacity planning, trend analysis',
        'LOGS: structured event records with context',
        '  FORMAT: JSON with timestamp, level, service, traceId, message, metadata',
        '  TOOLS: ELK stack, Loki, CloudWatch Logs',
        '  USE FOR: debugging, audit trails, error investigation',
        'TRACES: distributed request flow across services',
        '  TOOLS: Jaeger, Zipkin, Tempo, X-Ray, OpenTelemetry',
        '  USE FOR: latency analysis, dependency mapping, bottleneck detection',
        'CORRELATION: link metrics/logs/traces via traceId for unified investigation',
      ].join('\n'),
    },
    {
      title: 'SRE Golden Signals',
      priority: 10,
      content: [
        'LATENCY: time to serve requests; track separately for success vs error',
        '  MEASURE: P50, P95, P99 response times',
        '  ALERT: P99 > 2x baseline for 5 minutes',
        'TRAFFIC: demand on the system (requests/sec, concurrent users)',
        '  MEASURE: RPS per endpoint, active connections',
        '  USE: capacity planning, anomaly detection',
        'ERRORS: rate of failed requests (5xx, timeouts, business errors)',
        '  MEASURE: error rate as percentage of total traffic',
        '  ALERT: error rate > 1% for 5 minutes',
        'SATURATION: how full the system is (CPU, memory, disk, queue depth)',
        '  MEASURE: utilization percentages, queue lengths',
        '  ALERT: any resource > 80% sustained for 15 minutes',
      ].join('\n'),
    },
    {
      title: 'SLO/SLI Design',
      priority: 9,
      content: [
        'SLI (Service Level Indicator): quantitative measure of service behavior',
        '  EXAMPLES: availability ratio, latency P99, error rate, throughput',
        'SLO (Service Level Objective): target value for an SLI',
        '  EXAMPLES: 99.9% availability, P99 latency < 200ms',
        'ERROR BUDGET: 100% - SLO target = allowed downtime/errors',
        '  99.9% SLO = 43.2 min/month error budget',
        '  99.95% SLO = 21.6 min/month error budget',
        'DECISION: if error budget is exhausted, freeze deployments until recovered',
        'REVIEW: weekly error budget review; adjust SLOs quarterly based on data',
        'RULE: set SLOs based on user impact, not arbitrary targets',
      ].join('\n'),
    },
    {
      title: 'Alerting Best Practices',
      priority: 8,
      content: [
        'ALERT ON SYMPTOMS, NOT CAUSES: "high error rate" not "CPU spike"',
        'SEVERITY LEVELS:',
        '  P1-Critical: user-facing outage, page immediately',
        '  P2-High: degraded service, page during business hours',
        '  P3-Medium: non-urgent, ticket, fix within 1 business day',
        '  P4-Low: informational, track in dashboard',
        'REDUCE NOISE: set appropriate thresholds; use multi-window burn rate',
        'RUNBOOKS: every alert links to a runbook with investigation steps',
        'ON-CALL: rotation schedule, escalation policy, blameless postmortems',
        'ANTI-PATTERNS: alert fatigue, percentage-only alerts on low traffic',
      ].join('\n'),
    },
  ],
} as const;
