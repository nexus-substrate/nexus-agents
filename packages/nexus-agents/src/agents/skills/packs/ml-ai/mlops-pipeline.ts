/**
 * MLOps Pipeline Patterns Skills
 *
 * Patterns for ML pipeline orchestration: experiment tracking,
 * reproducibility, model registry, CI/CD for ML, and feature stores.
 *
 * @module agents/skills/packs/ml-ai/mlops-pipeline
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const MLOPS_PIPELINE_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'mlops-pipeline-review',
    description:
      'Reviews MLOps pipeline code for best practices. Checks experiment tracking, ' +
      'reproducibility (seed, versioning), model registry usage, artifact management, ' +
      'and pipeline orchestration patterns (DAG, step dependencies).',
    category: 'code-analysis',
    complexity: 'complex',
    code: [
      'function mlopsPipelineReview(code: string): string {',
      '  const checks = [',
      '    { check: "Experiment Tracking", pattern: /mlflow|wandb|neptune|experiment/i },',
      '    { check: "Reproducibility", pattern: /seed|random_state|deterministic/i },',
      '    { check: "Model Registry", pattern: /register|registry|model_uri|promote/i },',
      '    { check: "Artifact Storage", pattern: /artifact|s3|gcs|blob.*storage/i },',
      '    { check: "Pipeline DAG", pattern: /dag|step|depends_on|pipeline|workflow/i },',
      '    { check: "Data Versioning", pattern: /dvc|delta|version.*data|snapshot/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'MLOps pipeline code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['mlops', 'pipeline', 'experiment-tracking', 'reproducibility', 'ci-cd'],
    examples: [
      {
        description: 'Review an MLflow training pipeline',
        input: { code: 'with mlflow.start_run(): mlflow.log_param("seed", 42); model.fit(X)' },
        expectedOutput: 'OK: Experiment Tracking\nOK: Reproducibility',
      },
    ],
  },
  {
    name: 'ml-feature-store-review',
    description:
      'Reviews feature store usage patterns. Checks feature definitions, ' +
      'online/offline store separation, point-in-time correctness, ' +
      'feature freshness monitoring, and serving latency considerations.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function mlFeatureStoreReview(code: string): string {',
      '  const checks = [',
      '    { check: "Feature Definition", pattern: /Feature|FeatureView|feature_group/i },',
      '    { check: "Online Store", pattern: /online|redis|dynamo|bigtable/i },',
      '    { check: "Offline Store", pattern: /offline|warehouse|parquet|bigquery/i },',
      '    { check: "Point-in-Time", pattern: /event_timestamp|entity_df|historical/i },',
      '    { check: "Freshness Check", pattern: /freshness|staleness|ttl|maxAge/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      { name: 'code', type: 'string', description: 'Feature store code to review', required: true },
    ],
    outputType: 'string',
    tags: ['mlops', 'feature-store', 'feast', 'feature-engineering'],
    examples: [
      {
        description: 'Review Feast feature store definition',
        input: { code: 'fv = FeatureView(entities=[driver], online=True, ttl=timedelta(days=1))' },
        expectedOutput: 'OK: Feature Definition\nOK: Online Store\nOK: Freshness Check',
      },
    ],
  },
] as const;
