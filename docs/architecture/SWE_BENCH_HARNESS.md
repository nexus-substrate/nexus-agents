# SWE-Bench Evaluation Harness

> **EXTRACTED** ([#2515](https://github.com/nexus-substrate/nexus-agents/issues/2515)). The SWE-bench harness moved out of nexus-agents into [`nexus-eval-swebench`](https://github.com/nexus-substrate/nexus-eval-swebench) per the harness-extraction policy ([epic #2514](https://github.com/nexus-substrate/nexus-agents/issues/2514), originally [#1960](https://github.com/nexus-substrate/nexus-agents/issues/1960)).
>
> **For current usage** see the [`nexus-eval-swebench` README](https://github.com/nexus-substrate/nexus-eval-swebench#readme). This document describes the original in-tree implementation; sections about the runtime, CLI subcommand, and module layout are historical.

**Original status:** Implemented (replaced by extracted harness 2026-05-09)
**Original issue:** #257
**Original module:** `packages/nexus-agents/src/swe-bench/` (deleted)
**Replaced by:** [nexus-eval-swebench](https://github.com/nexus-substrate/nexus-eval-swebench) v0.2 clean-room rewrite

---

## Overview

The SWE-Bench evaluation harness enables testing agent-generated patches against the [SWE-bench](https://www.swebench.com/) benchmark suite. It orchestrates the complete evaluation pipeline from loading dataset instances through scoring results.

## Architecture

```
                    +-------------------+
                    | EvaluationHarness |
                    +-------------------+
                            |
         +------------------+------------------+
         |                  |                  |
+--------v-------+  +-------v--------+  +------v-------+
| DatasetLoader  |  | HarnessExecutor|  | ReportGen    |
+----------------+  +----------------+  +--------------+
         |                  |
+--------v-------+  +-------v--------+
| PatchApplicator|  | TestRunner     |
+----------------+  +----------------+
```

### Components

| Component              | File                       | Responsibility                                          |
| ---------------------- | -------------------------- | ------------------------------------------------------- |
| `EvaluationHarness`    | `evaluation-harness.ts`    | Main orchestrator, coordinates full evaluation pipeline |
| `HarnessExecutor`      | `harness-executor.ts`      | Executes swebench harness in Docker or local process    |
| `DatasetLoader`        | `dataset-loader.ts`        | Loads instances from HuggingFace datasets API           |
| `PatchApplicator`      | `patch-applicator.ts`      | Validates and applies git-style unified diffs           |
| `TestRunner`           | `test-runner.ts`           | Detects test framework and executes test suites         |
| `ReportGenerator`      | `report-generator.ts`      | Generates evaluation reports in multiple formats        |
| `EnvironmentValidator` | `environment-validator.ts` | Validates Python, Docker, and swebench installation     |
| `PredictionWriter`     | `prediction-writer.ts`     | Writes predictions to JSONL format                      |

## Usage

### Basic Evaluation

```typescript
import { createEvaluationHarness, evaluatePredictions } from 'nexus-agents/swe-bench';

// Create harness
const harness = createEvaluationHarness();

// Validate environment
const validation = await harness.validate();
if (!validation.ready) {
  console.error('Environment not ready:', validation.errors);
  return;
}

// Run evaluation
const predictions = [
  {
    instance_id: 'django__django-12345',
    model_name_or_path: 'my-model',
    model_patch: '--- a/file.py\n+++ b/file.py\n@@ -1,1 +1,1 @@\n-old\n+new',
  },
];

const result = await harness.evaluate(predictions, {
  datasetName: 'lite',
  runId: 'my-run-001',
  mode: 'docker',
});

console.log(`Resolution rate: ${result.metrics.resolutionRate}`);
```

### CLI Usage

```bash
# Check status
nexus-agents swe-bench status

# Run on specific instances
nexus-agents swe-bench run --instance django__django-12345 --verbose

# Run with limit
nexus-agents swe-bench run --limit 10 --output ./predictions.jsonl

# Evaluate existing predictions
nexus-agents swe-bench evaluate --predictions ./predictions.jsonl
```

## Configuration

### EvaluationHarnessConfig

```typescript
interface EvaluationHarnessConfig {
  /** Dataset variant: 'lite', 'verified', or 'full' */
  datasetName: 'lite' | 'verified' | 'full';

  /** Path to write predictions JSONL */
  predictionsPath: string;

  /** Maximum parallel workers */
  maxWorkers: number;

  /** Unique run identifier */
  runId: string;

  /** Cache level: 'none', 'env', or 'instance' */
  cacheLevel: 'none' | 'env' | 'instance';

  /** Execution mode: 'docker' or 'local' */
  mode: 'docker' | 'local';

  /** Per-instance timeout in seconds */
  timeoutSeconds: number;

  /** Output directory for results */
  outputDir: string;

  /** Optional specific instance IDs to evaluate */
  instanceIds?: string[];
}
```

### Default Configuration

```typescript
const DEFAULT_EVALUATION_CONFIG = {
  datasetName: 'lite',
  predictionsPath: './predictions.jsonl',
  maxWorkers: 8,
  runId: `eval-${Date.now()}`,
  cacheLevel: 'env',
  mode: 'docker',
  timeoutSeconds: 1800,
  outputDir: './swebench-output',
  useModal: false,
};
```

## Evaluation Pipeline

### 1. Environment Validation

Before evaluation, the harness validates:

- **Python Version:** 3.10 or 3.11 required (3.12+ not supported by swebench)
- **swebench Package:** Must be importable via `python -c "import swebench"`
- **Docker:** Daemon must be running for isolated execution
- **Disk Space:** Minimum 120GB recommended for caching

### 2. Prediction Loading

Predictions follow the SWE-bench JSONL format:

```json
{ "instance_id": "owner__repo-12345", "model_name_or_path": "model", "model_patch": "...diff..." }
```

### 3. Harness Execution

The executor runs the official swebench harness:

```bash
python -m swebench.harness.run_evaluation \
  --predictions_path ./predictions.jsonl \
  --dataset_name princeton-nlp/SWE-bench_Lite \
  --run_id my-run-001 \
  --max_workers 8
```

### 4. Result Aggregation

Results are collected and metrics calculated:

- **Resolution Rate:** Instances where all tests pass / total instances
- **Patch Application Rate:** Patches that apply cleanly / total patches
- **Error Rate:** Instances with errors / total instances
- **Per-Repository Breakdown:** Resolution rate by repository

## Patch Applicator

The `PatchApplicator` validates and applies git-style unified diffs:

```typescript
import { createPatchApplicator, validatePatch } from 'nexus-agents/swe-bench';

const applicator = createPatchApplicator();

// Validate patch
const validation = applicator.validate(patchContent);
console.log(`Valid: ${validation.valid}`);
console.log(`Format: ${validation.format}`);
console.log(`Hunks: ${validation.hunkCount}`);
console.log(`Files: ${validation.affectedFiles}`);

// Apply patch
const result = await applicator.apply(patchContent, {
  workDir: '/workspace/repo',
  dryRun: false,
  allowFuzz: true,
  maxFuzz: 2,
  createBackup: true,
});

// Revert patch
await applicator.revert(patchContent, { workDir: '/workspace/repo' });
```

### Supported Formats

- Git unified diffs (`diff --git a/file b/file`)
- Standard unified diffs (`--- a/file` / `+++ b/file`)
- Context diffs (`*** file` / `--- file`)

## Test Runner

The `TestRunner` detects and executes test frameworks:

```typescript
import { createTestRunner, detectTestFramework } from 'nexus-agents/swe-bench';

const runner = createTestRunner();

// Detect framework
const framework = await runner.detectFramework('/workspace/repo');
console.log(`Detected: ${framework.framework} (${framework.confidence})`);

// Run tests
const result = await runner.run({
  workDir: '/workspace/repo',
  useDocker: true,
  dockerImage: 'python:3.11-slim',
  testPatterns: ['tests/test_specific.py'],
});

console.log(`Passed: ${result.passed}/${result.total}`);
```

### Supported Frameworks

| Framework | Detection Files                               | Command                       |
| --------- | --------------------------------------------- | ----------------------------- |
| pytest    | `pytest.ini`, `conftest.py`, `pyproject.toml` | `python -m pytest`            |
| unittest  | `setup.py`, `setup.cfg`                       | `python -m unittest discover` |
| nose      | `setup.cfg`, `.noserc`                        | `python -m nose`              |
| tox       | `tox.ini`                                     | `tox`                         |

## Report Generation

Reports can be generated in multiple formats:

```typescript
import { createReportGenerator } from 'nexus-agents/swe-bench';

const generator = createReportGenerator();

const report = await generator.generate(evaluationResult, {
  format: 'markdown',
  detailLevel: 'full',
  includeInstanceDetails: true,
});

// Render to different formats
const markdown = await generator.render(report, 'markdown');
const html = await generator.render(report, 'html');
const json = await generator.render(report, 'json');
const csv = await generator.render(report, 'csv');

// Save to file
await generator.save(report, { outputPath: './report.md' });
```

### Report Sections

- **Summary:** Overall metrics and resolution rate
- **Metrics:** Timing statistics, token usage, cost estimates
- **Repository Breakdown:** Per-repository resolution rates
- **Failure Analysis:** Categorized failures with root causes
- **Instance Details:** Individual instance results (optional)

## Error Handling

All components use the `Result<T, E>` pattern:

```typescript
import { createValidatedHarness } from 'nexus-agents/swe-bench';

const result = await createValidatedHarness();

if (!result.ok) {
  console.error('Failed to create harness:', result.error.message);
  console.error('Error code:', result.error.code);
  return;
}

const harness = result.value;
```

### Error Codes

| Code                         | Description                    |
| ---------------------------- | ------------------------------ |
| `DOCKER_NOT_AVAILABLE`       | Docker daemon not running      |
| `PYTHON_NOT_AVAILABLE`       | Python 3.10/3.11 not found     |
| `SWEBENCH_NOT_INSTALLED`     | swebench package missing       |
| `INVALID_PREDICTIONS_FORMAT` | Malformed predictions file     |
| `PATCH_APPLICATION_FAILED`   | Patch could not be applied     |
| `TEST_EXECUTION_FAILED`      | Test suite execution error     |
| `TIMEOUT`                    | Evaluation exceeded time limit |

## Instance ID Format

SWE-bench instance IDs follow the pattern: `owner__repo-issue_number`

Examples:

- `django__django-12345`
- `scikit-learn__scikit-learn-9876`
- `flask__flask-4567`

The harness correctly parses hyphenated repository names.

## Performance Considerations

- **Caching:** Use `cacheLevel: 'env'` to reuse environment setup
- **Parallelism:** Increase `maxWorkers` for faster evaluation (memory-bound)
- **Docker:** Required for reproducible isolation; local mode for debugging
- **Timeouts:** Default 30 minutes per instance; increase for complex repos

## File Structure

```
src/swe-bench/
├── index.ts                      # Public exports
├── types.ts                      # Core types (SWEBenchInstance, etc.)
├── evaluation-harness.ts         # Main harness implementation
├── evaluation-harness-types.ts   # Harness config and result types
├── harness-executor.ts           # swebench harness execution
├── harness-executor-types.ts     # Executor types
├── harness-executor-helpers.ts   # Utility functions
├── dataset-loader.ts             # HuggingFace dataset loading
├── patch-applicator.ts           # Patch validation and application
├── patch-applicator-types.ts     # Patch types
├── test-runner.ts                # Test framework execution
├── test-runner-types.ts          # Test runner types
├── report-generator.ts           # Report generation
├── evaluation-report-types.ts    # Report types
├── environment-validator.ts      # Environment validation
├── prediction-writer.ts          # JSONL prediction writing
├── prompt-template.ts            # Agent prompts for SWE-bench
├── agent-runner.ts               # Agent execution loop
├── benchmark-runner.ts           # Benchmark orchestration
├── swe-bench-runner.ts           # Runner helpers
├── swe-bench-command.ts          # CLI command implementation
├── cli-agent-executor.ts         # CLI-based agent execution
└── nexus-agent-executor.ts       # API-based agent execution
```

## Related Documentation

- [SWE-bench Official](https://www.swebench.com/)
- [SWE-bench GitHub](https://github.com/princeton-nlp/SWE-bench)
- [HuggingFace Datasets](https://huggingface.co/datasets/princeton-nlp/SWE-bench)

---

_Last updated: 2026-01-18_
