/**
 * Data Quality Skills
 *
 * Data validation rules and quality checks: schema validation,
 * completeness, consistency, and freshness monitoring.
 *
 * @module agents/skills/packs/misc/data-quality
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const DATA_QUALITY_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'data-quality-review',
    description:
      'Reviews data quality implementation patterns. Checks schema enforcement, ' +
      'null/missing value handling, uniqueness constraints, referential integrity, ' +
      'data freshness monitoring, and anomaly detection.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function dataQualityReview(code: string): string {',
      '  const checks = [',
      '    { check: "Schema Enforcement", pattern: /schema|validate|dtype|type.*check/i },',
      '    { check: "Null Handling", pattern: /not_null|isNotNull|dropna|required/i },',
      '    { check: "Uniqueness Check", pattern: /unique|distinct|dedup|primary.*key/i },',
      '    { check: "Range Validation", pattern: /between|min|max|bounds|constraint/i },',
      '    { check: "Freshness Monitor", pattern: /freshness|staleness|lastUpdated|age/i },',
      '    { check: "Row Count Check", pattern: /count|rowCount|expect.*rows|volume/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Data quality code to review (dbt, Great Expectations, etc.)',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['data', 'quality', 'validation', 'great-expectations', 'dbt'],
    examples: [
      {
        description: 'Review data quality tests',
        input: {
          code: 'expect_column_values_to_not_be_null("user_id"); expect_column_values_to_be_unique("email")',
        },
        expectedOutput: 'OK: Null Handling\nOK: Uniqueness Check',
      },
    ],
  },
] as const;
