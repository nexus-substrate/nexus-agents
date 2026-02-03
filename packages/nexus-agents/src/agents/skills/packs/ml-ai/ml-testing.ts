/**
 * ML Testing Patterns Skills
 *
 * Testing patterns for machine learning systems including data validation,
 * model evaluation, training-serving skew detection, and fairness testing.
 *
 * @module agents/skills/packs/ml-ai/ml-testing
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const ML_TESTING_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'ml-data-validation',
    description:
      'Validates ML data pipeline code for common issues: schema drift detection, ' +
      'null/NaN handling, distribution shift checks, feature range validation, ' +
      'class imbalance detection, and train/test leakage prevention.',
    category: 'testing',
    complexity: 'complex',
    code: [
      'function mlDataValidation(code: string): string {',
      '  const checks = [',
      '    { check: "Schema Validation", pattern: /schema|dataType|dtype|column.*type/i },',
      '    { check: "Null Handling", pattern: /dropna|fillna|isNull|isnull|notna/i },',
      '    { check: "Distribution Check", pattern: /histogram|distribution|skew|kurtosis/i },',
      '    { check: "Feature Range", pattern: /min_value|max_value|clip|clamp|bound/i },',
      '    { check: "Train-Test Split", pattern: /train_test_split|stratif|kfold/i },',
      '    { check: "Leakage Prevention", pattern: /pipeline|fit_transform.*train|temporal.*split/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'ML data pipeline code to validate',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['ml', 'testing', 'data-validation', 'data-quality', 'mlops'],
    examples: [
      {
        description: 'Validate a scikit-learn data pipeline',
        input: {
          code: 'X_train, X_test = train_test_split(X, stratify=y); pipe.fit_transform(X_train)',
        },
        expectedOutput: 'OK: Train-Test Split\nOK: Leakage Prevention',
      },
    ],
  },
  {
    name: 'ml-model-evaluation',
    description:
      'Reviews model evaluation code for best practices: cross-validation usage, ' +
      'appropriate metrics selection, confidence intervals, baseline comparisons, ' +
      'and overfitting detection via train/val gap analysis.',
    category: 'testing',
    complexity: 'moderate',
    code: [
      'function mlModelEvaluation(code: string): string {',
      '  const checks = [',
      '    { check: "Cross-Validation", pattern: /cross_val|kfold|StratifiedKFold/i },',
      '    { check: "Multiple Metrics", pattern: /(precision|recall|f1|auc|rmse).*\\n.*(precision|recall|f1|auc|rmse)/is },',
      '    { check: "Confidence Intervals", pattern: /confidence|bootstrap|ci_lower|ci_upper/i },',
      '    { check: "Baseline Comparison", pattern: /baseline|dummy|majority_class|random/i },',
      '    { check: "Overfitting Check", pattern: /train.*val|train.*test|gap|overfit/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Model evaluation code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['ml', 'testing', 'evaluation', 'metrics', 'validation'],
    examples: [
      {
        description: 'Review model evaluation for best practices',
        input: {
          code: 'scores = cross_val_score(model, X, y, cv=5); baseline = DummyClassifier()',
        },
        expectedOutput: 'OK: Cross-Validation\nOK: Baseline Comparison',
      },
    ],
  },
] as const;
