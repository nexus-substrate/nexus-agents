/**
 * Data Orchestration Patterns Skills
 *
 * DAG-based data pipeline patterns: task dependencies,
 * retry strategies, backfill patterns, and scheduling.
 *
 * @module agents/skills/packs/misc/data-orchestration
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const DATA_ORCHESTRATION_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'dag-pipeline-review',
    description:
      'Reviews data pipeline DAG definitions for best practices. Checks task dependency ' +
      'structure, idempotency, retry configuration, SLA monitoring, data partitioning, ' +
      'and backfill strategy.',
    category: 'devops',
    complexity: 'moderate',
    code: [
      'function dagPipelineReview(code: string): string {',
      '  const checks = [',
      '    { check: "Task Dependencies", pattern: /depends_on|>>|set_downstream|upstream/i },',
      '    { check: "Idempotent Tasks", pattern: /idempoten|upsert|merge|replace/i },',
      '    { check: "Retry Config", pattern: /retries|retry_delay|max_retry/i },',
      '    { check: "SLA Monitoring", pattern: /sla|timeout|execution_timeout|deadline/i },',
      '    { check: "Data Partitioning", pattern: /partition|ds|execution_date|logical_date/i },',
      '    { check: "Error Callback", pattern: /on_failure|on_retry|callback|alert/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'DAG pipeline code to review (Airflow, Prefect, Dagster)',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['data', 'orchestration', 'dag', 'airflow', 'pipeline'],
    examples: [
      {
        description: 'Review an Airflow DAG definition',
        input: {
          code: 'task_a >> task_b; default_args = { retries: 3, retry_delay: timedelta(minutes=5) }',
        },
        expectedOutput: 'OK: Task Dependencies\nOK: Retry Config',
      },
    ],
  },
] as const;
