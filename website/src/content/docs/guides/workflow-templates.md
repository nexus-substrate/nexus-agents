---
title: Workflow Templates
description: Create and customize YAML workflow templates for automated multi-agent task execution.
---

Workflow templates define automated sequences of agent tasks. Write once, execute repeatedly with different inputs.

## Quick Start

### List Available Workflows

```bash
nexus-agents workflow list
```

### Run a Built-in Workflow

```bash
nexus-agents workflow run code-review \
  --input='{"files": ["src/auth.ts", "src/api.ts"]}'
```

### Create a Custom Workflow

Create `workflows/my-workflow.yaml`:

```yaml
name: my-workflow
description: My custom workflow
version: '1.0'

inputs:
  target:
    type: string
    required: true
    description: Target to analyze

steps:
  - id: analyze
    expert: code
    task: 'Analyze {{ target }} for issues'

  - id: report
    expert: documentation
    task: 'Create a report based on: {{ steps.analyze.output }}'
    depends_on: [analyze]

output:
  summary: '{{ steps.report.output }}'
```

## Workflow Structure

### Required Fields

```yaml
name: workflow-name # Unique identifier
description: | # Human-readable description
  What this workflow does
version: '1.0' # Semantic version
inputs: # Input parameters
  # ...

steps: # Execution steps
  # ...
```

### Optional Fields

```yaml
output: # Output mapping
  # ...

context: # Global context for all steps
  # ...

options: # Execution options
  maxRetries: 3
  timeout: 300000 # 5 minutes
  parallel: false # Run steps in parallel where possible
```

## Input Definitions

Define what parameters your workflow accepts:

```yaml
inputs:
  # Required string input
  url:
    type: string
    required: true
    description: GitHub PR URL

  # Optional with default
  depth:
    type: number
    required: false
    default: 3
    description: Analysis depth level

  # Enum input
  format:
    type: string
    required: false
    default: markdown
    enum: [markdown, json, text]
    description: Output format

  # Array input
  files:
    type: array
    required: true
    items:
      type: string
    description: Files to analyze

  # Object input
  options:
    type: object
    required: false
    properties:
      verbose:
        type: boolean
        default: false
      limit:
        type: number
        default: 100
```

## Step Definitions

Steps define the actions to execute:

### Basic Step

```yaml
steps:
  - id: step-id # Unique step identifier
    expert: code # Expert type to use
    task: 'Do something' # Task description
```

### Expert Types

| Expert          | Use Case                       |
| --------------- | ------------------------------ |
| `code`          | Code analysis, implementation  |
| `security`      | Vulnerability scanning         |
| `architecture`  | Design patterns, system design |
| `testing`       | Test generation, coverage      |
| `documentation` | API docs, technical writing    |
| `devops`        | CI/CD, infrastructure          |
| `research`      | Information gathering          |

### Step with Dependencies

Steps can depend on other steps:

```yaml
steps:
  - id: analyze
    expert: code
    task: 'Analyze the code'

  - id: review
    expert: security
    task: 'Security review of: {{ steps.analyze.output }}'
    depends_on: [analyze]

  - id: document
    expert: documentation
    task: 'Document findings from {{ steps.analyze.output }} and {{ steps.review.output }}'
    depends_on: [analyze, review]
```

### Step with Context

Provide additional context to steps:

```yaml
steps:
  - id: analyze
    expert: code
    task: 'Analyze the authentication module'
    context:
      files:
        - src/auth.ts
        - src/middleware/auth.ts
      focus: security
      language: typescript
```

### Step with Model Preference

Request specific model tier:

```yaml
steps:
  - id: complex-analysis
    expert: architecture
    task: 'Design a microservices architecture'
    model_preference: powerful # fast | balanced | powerful
```

### Conditional Steps

Execute steps conditionally:

```yaml
steps:
  - id: check
    expert: code
    task: 'Check if tests exist'

  - id: generate-tests
    expert: testing
    task: 'Generate tests'
    condition: '{{ not steps.check.output.hasTests }}'
    depends_on: [check]
```

## Template Variables

Use Jinja2-style templating:

### Input Variables

```yaml
task: 'Analyze {{ url }} for {{ focus }}'
```

### Step Output References

```yaml
task: 'Based on {{ steps.previous_step.output }}'
```

### Built-in Variables

| Variable          | Description           |
| ----------------- | --------------------- |
| `{{ workflow }}`  | Workflow name         |
| `{{ version }}`   | Workflow version      |
| `{{ timestamp }}` | Execution timestamp   |
| `{{ run_id }}`    | Unique run identifier |

### Filters

```yaml
# Uppercase
task: "Process {{ name | upper }}"

# JSON encode
task: "Config: {{ options | json }}"

# Default value
task: "Target: {{ target | default('main') }}"

# Truncate
task: "Summary: {{ long_text | truncate(100) }}"
```

## Output Mapping

Define workflow outputs:

```yaml
output:
  # Simple output
  summary: '{{ steps.final.output }}'

  # Structured output
  report:
    analysis: '{{ steps.analyze.output }}'
    recommendations: '{{ steps.review.output }}'
    timestamp: '{{ timestamp }}'

  # Conditional output
  status: "{{ 'success' if steps.all_passed else 'failed' }}"
```

## Built-in Workflows

### code-review

Review code files for quality and issues.

```bash
nexus-agents workflow run code-review \
  --input='{"files": ["src/auth.ts"]}'
```

**Inputs:**

- `files` (array, required) - Files to review
- `focus` (string, optional) - Review focus area

### pr-review

Review a GitHub pull request.

```bash
nexus-agents workflow run pr-review \
  --input='{"url": "https://github.com/owner/repo/pull/123"}'
```

**Inputs:**

- `url` (string, required) - PR URL

### test-gen

Generate tests for code.

```bash
nexus-agents workflow run test-gen \
  --input='{"file": "src/utils.ts", "framework": "vitest"}'
```

**Inputs:**

- `file` (string, required) - File to test
- `framework` (string, optional) - Test framework

### doc-gen

Generate documentation.

```bash
nexus-agents workflow run doc-gen \
  --input='{"target": "src/api/", "format": "markdown"}'
```

**Inputs:**

- `target` (string, required) - Target path
- `format` (string, optional) - Output format

## Advanced Patterns

### Parallel Execution

Execute independent steps in parallel:

```yaml
options:
  parallel: true

steps:
  - id: security-scan
    expert: security
    task: 'Security scan'

  - id: code-quality
    expert: code
    task: 'Code quality check'

  - id: report
    expert: documentation
    task: 'Create report from {{ steps.security-scan.output }} and {{ steps.code-quality.output }}'
    depends_on: [security-scan, code-quality]
```

### Iterative Processing

Process items in a loop:

```yaml
steps:
  - id: process-files
    expert: code
    task: 'Analyze file {{ item }}'
    iterate_over: '{{ files }}'

  - id: summarize
    expert: documentation
    task: 'Summarize all analyses: {{ steps.process-files.outputs }}'
    depends_on: [process-files]
```

### Error Handling

Handle step failures:

```yaml
steps:
  - id: risky-operation
    expert: code
    task: 'Attempt risky operation'
    on_error: continue # continue | fail | retry

  - id: fallback
    expert: code
    task: 'Execute fallback'
    condition: '{{ steps.risky-operation.failed }}'
    depends_on: [risky-operation]
```

### Sub-Workflows

Include other workflows:

```yaml
steps:
  - id: security
    workflow: security-audit
    inputs:
      target: '{{ target }}'

  - id: report
    expert: documentation
    task: 'Report on {{ steps.security.output }}'
    depends_on: [security]
```

## Execution Options

### Dry Run

Preview without executing:

```bash
nexus-agents workflow run my-workflow \
  --input='{"target": "src/"}' \
  --dry-run
```

### Verbose Output

See step-by-step execution:

```bash
nexus-agents workflow run my-workflow \
  --input='{"target": "src/"}' \
  --verbose
```

### Custom Config

Use a specific configuration:

```bash
nexus-agents workflow run my-workflow \
  --input='{"target": "src/"}' \
  --config=./prod-config.yaml
```

## Programmatic Usage

Execute workflows from code:

```typescript
import { parseWorkflowYaml, loadWorkflowFile } from 'nexus-agents';

// Load from file
const workflow = await loadWorkflowFile('./workflows/my-workflow.yaml');

// Or parse YAML string
const workflowDef = parseWorkflowYaml(`
name: inline-workflow
description: Inline workflow
version: "1.0"
inputs:
  message:
    type: string
    required: true
steps:
  - id: greet
    expert: code
    task: "Process: {{ message }}"
`);

// Execute
const result = await engine.execute(workflow, {
  message: 'Hello, World!',
});

if (result.ok) {
  console.log(result.value.output);
}
```

## Validation

Validate workflows before execution:

```typescript
import { validateWorkflow } from 'nexus-agents';

const result = validateWorkflow(workflowDef);

if (!result.ok) {
  console.error('Validation errors:', result.error.issues);
}
```

Common validation errors:

- Missing required inputs
- Invalid step references in depends_on
- Circular dependencies
- Invalid expert types

## Example Workflows

### Full PR Review Workflow

```yaml
name: comprehensive-pr-review
description: Complete PR review with security, quality, and documentation checks
version: '1.0'

inputs:
  url:
    type: string
    required: true
    description: GitHub PR URL

steps:
  - id: fetch-pr
    expert: devops
    task: 'Fetch PR metadata and changed files from {{ url }}'

  - id: security-review
    expert: security
    task: |
      Review the following changes for security issues:
      {{ steps.fetch-pr.output.files }}
    depends_on: [fetch-pr]

  - id: code-review
    expert: code
    task: |
      Review code quality and best practices:
      {{ steps.fetch-pr.output.files }}
    depends_on: [fetch-pr]

  - id: test-coverage
    expert: testing
    task: |
      Analyze test coverage for changes:
      {{ steps.fetch-pr.output.files }}
    depends_on: [fetch-pr]

  - id: compile-report
    expert: documentation
    task: |
      Create a comprehensive PR review report including:
      - Security findings: {{ steps.security-review.output }}
      - Code quality: {{ steps.code-review.output }}
      - Test coverage: {{ steps.test-coverage.output }}
    depends_on: [security-review, code-review, test-coverage]

output:
  report: '{{ steps.compile-report.output }}'
  security_issues: '{{ steps.security-review.output.issues }}'
  approval_recommendation: '{{ steps.compile-report.output.recommendation }}'
```

## Next Steps

- [CLI Commands](/guides/cli-usage) - Run workflows from command line
- [Debugging & Observability](/guides/debugging-observability) - Debug workflow execution
- [Agent Development](/development/agent-development) - Create custom experts
